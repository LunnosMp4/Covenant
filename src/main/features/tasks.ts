import { randomUUID } from 'crypto'
import {
  DEFAULT_GAMIFICATION,
  applyStreakBonus,
  calculateLevelFromTotalXp,
  type GamificationState,
  type TaskActionType,
  type TaskCategory,
  type TaskTier
} from '../../shared/tasks/gamification'
import type { ClearCompletedResult, Task } from '../../shared/tasks/task'
import { readConfig } from '../config/configStore'
import { evaluateTask, evaluateTaskHeuristically } from '../services/taskEvaluator'
import { appStore } from '../store/appStore'
import { sendToMain } from '../windows/broadcast'

export function getTasks(): Task[] {
  return appStore.get('tasks', [])
}

export function getGamification(): GamificationState {
  const stored = appStore.get('gamification', DEFAULT_GAMIFICATION)
  const totalLifetimeXP =
    typeof stored.totalLifetimeXP === 'number' && Number.isFinite(stored.totalLifetimeXP)
      ? Math.max(0, Math.floor(stored.totalLifetimeXP))
      : 0
  const progress = calculateLevelFromTotalXp(totalLifetimeXP)

  return {
    currentLevel: progress.level,
    currentXP: progress.currentXP,
    totalLifetimeXP,
    streakDays:
      typeof stored.streakDays === 'number' && Number.isFinite(stored.streakDays)
        ? Math.max(0, Math.floor(stored.streakDays))
        : 0,
    lastActiveDate:
      typeof stored.lastActiveDate === 'string' && stored.lastActiveDate.trim()
        ? stored.lastActiveDate.trim()
        : null
  }
}

function persistGamification(state: GamificationState): void {
  appStore.set('gamification', state)
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getYesterdayDateKey(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return getLocalDateKey(yesterday)
}

function emitTasksUpdated(tasks: Task[]): void {
  sendToMain('tasks:updated', tasks)
}

function applyTaskEvaluation(task: Task, evaluation: {
  tier: TaskTier
  xpReward: number
  estimatedMinutes: number
  categoryTag: TaskCategory
  actionType: TaskActionType
  rationale: string
}): Task {
  return {
    ...task,
    tier: evaluation.tier,
    xpReward: evaluation.xpReward,
    estimatedMinutes: evaluation.estimatedMinutes,
    categoryTag: evaluation.categoryTag,
    actionType: evaluation.actionType,
    rationale: evaluation.rationale
  }
}

export function addTask(title: string): Task[] {
  const normalizedTitle = typeof title === 'string' ? title.trim() : ''
  if (!normalizedTitle) {
    throw new Error('Task title is required.')
  }

  const storedConfig = readConfig()
  const apiKey = storedConfig.apiKey || process.env.OPENAI_API_KEY

  // Populate a heuristic estimate immediately so the task always carries a
  // resolvable XP reward (even if cleared before the LLM responds), and mark it
  // "evaluating" only when a live refinement pass will actually run.
  const heuristic = evaluateTaskHeuristically(normalizedTitle)
  const created: Task = applyTaskEvaluation(
    {
      id: randomUUID(),
      title: normalizedTitle,
      done: false,
      createdAt: Date.now(),
      evaluating: Boolean(apiKey)
    },
    heuristic
  )

  const nextTasks = [...getTasks(), created]
  appStore.set('tasks', nextTasks)

  if (apiKey) {
    void refineTaskEvaluation(created.id, normalizedTitle, apiKey, storedConfig.proxyUrl)
  }

  return nextTasks
}

async function refineTaskEvaluation(
  taskId: string,
  title: string,
  apiKey: string,
  proxyUrl?: string
): Promise<void> {
  try {
    const evaluation = await evaluateTask(title, apiKey, proxyUrl)
    const nextTasks = getTasks().map((item) =>
      item.id === taskId
        ? { ...applyTaskEvaluation(item, evaluation), evaluating: false }
        : item
    )

    appStore.set('tasks', nextTasks)
    emitTasksUpdated(nextTasks)
  } catch {
    const nextTasks = getTasks().map((item) =>
      item.id === taskId ? { ...item, evaluating: false } : item
    )
    appStore.set('tasks', nextTasks)
    emitTasksUpdated(nextTasks)
  }
}

export function toggleTask(id: string): Task[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getTasks()
  }

  const nextTasks = getTasks().map((item) =>
    item.id === normalizedId ? { ...item, done: !item.done } : item
  )
  appStore.set('tasks', nextTasks)
  return nextTasks
}

export function deleteTask(id: string): Task[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getTasks()
  }

  const nextTasks = getTasks().filter((item) => item.id !== normalizedId)
  appStore.set('tasks', nextTasks)
  return nextTasks
}

export function reorderTasks(orderedIds: unknown): Task[] {
  if (!Array.isArray(orderedIds)) {
    return getTasks()
  }

  const currentTasks = getTasks()
  const byId = new Map(currentTasks.map((task) => [task.id, task]))

  const ordered = orderedIds
    .map((rawId) => (typeof rawId === 'string' ? rawId.trim() : ''))
    .filter((id): id is string => Boolean(id))
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task))

  const seen = new Set(ordered.map((task) => task.id))
  const remaining = currentTasks.filter((task) => !seen.has(task.id))
  const nextTasks = [...ordered, ...remaining]

  appStore.set('tasks', nextTasks)
  return nextTasks
}

export function clearCompletedTasks(): ClearCompletedResult {
  const currentTasks = getTasks()
  const completedTasks = currentTasks.filter((item) => item.done)
  const nextTasks = currentTasks.filter((item) => !item.done)

  const clearedCount = completedTasks.length
  if (clearedCount === 0) {
    appStore.set('tasks', nextTasks)
    return {
      tasks: nextTasks,
      gamification: getGamification(),
      xpGained: 0,
      levelUp: false,
      streakBonusApplied: false,
      clearedCount: 0
    }
  }

  const baseXp = completedTasks.reduce((sum, item) => {
    const reward =
      typeof item.xpReward === 'number' && Number.isFinite(item.xpReward)
        ? item.xpReward
        : evaluateTaskHeuristically(item.title).xpReward
    return sum + reward
  }, 0)

  const state = getGamification()
  const today = getLocalDateKey(new Date())

  let streakDays = state.streakDays
  let streakBonusApplied = false
  if (state.lastActiveDate === today) {
    // Same day — streak unchanged.
  } else if (state.lastActiveDate === getYesterdayDateKey()) {
    streakDays += 1
    streakBonusApplied = true
  } else {
    streakDays = 1
    streakBonusApplied = true
  }

  const awardedXp = applyStreakBonus(baseXp, streakDays)
  const totalLifetimeXP = state.totalLifetimeXP + awardedXp
  const progress = calculateLevelFromTotalXp(totalLifetimeXP)

  const nextGamification: GamificationState = {
    currentLevel: progress.level,
    currentXP: progress.currentXP,
    totalLifetimeXP,
    streakDays,
    lastActiveDate: today
  }

  appStore.set('tasks', nextTasks)
  persistGamification(nextGamification)

  return {
    tasks: nextTasks,
    gamification: nextGamification,
    xpGained: awardedXp,
    levelUp: progress.level > state.currentLevel,
    streakBonusApplied,
    clearedCount
  }
}
