import OpenAI from 'openai'
import { ProxyAgent } from 'undici'
import {
  TASK_ACTION_TYPE_SET,
  TASK_CATEGORY_SET,
  TASK_TIER_SET,
  TIER_RANGES,
  type TaskActionType,
  type TaskCategory,
  type TaskEvaluation,
  type TaskTier
} from '../../shared/gamification'
import { modelSupportsTemperature } from '../../shared/config'

const EVALUATION_MODEL = 'gpt-6-luna'
const EVALUATION_TIMEOUT_MS = 8000

const SYSTEM_PROMPT = `You are the Task Gamification & Complexity Evaluator for Covenant.
Analyze the user's task title and return strict JSON with:
- tier: "TRIVIAL" (15-30 XP) | "EASY" (35-70 XP) | "MEDIUM" (75-150 XP) | "HARD" (160-300 XP) | "EPIC" (320-500 XP)
- xp_reward: integer within tier bounds
- estimated_minutes: integer
- category_tag: "Dev" | "DevOps" | "SysAdmin" | "Writing" | "Design" | "Admin" | "Personal" | "Health" | "General"
- action_type: "terminal_command" | "code_refactor" | "quick_action" | "deep_work" | "communication" | "maintenance"
- rationale: brief 3-5 word rationale
Return only the JSON object, with no markdown fences or commentary.`

interface RawEvaluation {
  tier?: unknown
  xp_reward?: unknown
  estimated_minutes?: unknown
  category_tag?: unknown
  action_type?: unknown
  rationale?: unknown
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeTier(raw: unknown): TaskTier {
  const tier = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  return TASK_TIER_SET.has(tier as TaskTier) ? (tier as TaskTier) : 'MEDIUM'
}

function normalizeCategory(raw: unknown): TaskCategory {
  const category = typeof raw === 'string' ? raw.trim() : ''
  return TASK_CATEGORY_SET.has(category as TaskCategory) ? (category as TaskCategory) : 'General'
}

function normalizeActionType(raw: unknown): TaskActionType {
  const actionType = typeof raw === 'string' ? raw.trim() : ''
  return TASK_ACTION_TYPE_SET.has(actionType as TaskActionType)
    ? (actionType as TaskActionType)
    : 'quick_action'
}

function normalizeXp(raw: unknown, tier: TaskTier): number {
  const bounds = TIER_RANGES[tier]
  const parsed = typeof raw === 'number' ? Math.round(raw) : NaN
  return Number.isFinite(parsed) ? clamp(parsed, bounds.min, bounds.max) : bounds.min
}

function normalizeMinutes(raw: unknown, tier: TaskTier): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(Math.round(raw), 1, 480)
  }

  const baseMinutes: Record<TaskTier, number> = {
    TRIVIAL: 5,
    EASY: 20,
    MEDIUM: 45,
    HARD: 90,
    EPIC: 240
  }
  return baseMinutes[tier]
}

export function evaluateTaskHeuristically(title: string): TaskEvaluation {
  const text = title.toLowerCase()
  const words = text.split(/\s+/).filter(Boolean)
  const wordCount = words.length

  const epicPatterns =
    /\b(architecture|migrate|migration|rewrite|rebuild|redesign|launch|platform|infrastructure|from scratch|end-to-end)\b/
  const hardPatterns =
    /\b(implement|refactor|debug|troubleshoot|optimize|security|integration|automate|pipeline|deploy|build|develop|setup|configure|design)\b/
  const easyPatterns =
    /\b(review|update|organize|plan|schedule|write|draft|respond|reply|backup|clean|fix|research|investigate|test)\b/

  let tier: TaskTier
  if (epicPatterns.test(text) || wordCount >= 8) {
    tier = 'EPIC'
  } else if (hardPatterns.test(text)) {
    tier = 'HARD'
  } else if (easyPatterns.test(text)) {
    tier = 'EASY'
  } else if (wordCount >= 4) {
    tier = 'MEDIUM'
  } else {
    tier = 'TRIVIAL'
  }

  const bounds = TIER_RANGES[tier]
  // Deterministic, length-scaled reward within the tier's bounds.
  const lengthFactor = clamp((wordCount - 1) / 9, 0, 1)
  const xpReward = Math.round(bounds.min + (bounds.max - bounds.min) * lengthFactor)

  let categoryTag: TaskCategory = 'General'
  if (/\b(docker|kubernetes|k8s|terraform|ci\b|cd\b|pipeline|deploy|infra|jenkins|ansible)\b/.test(text)) {
    categoryTag = 'DevOps'
  } else if (/\b(server|ssh|backup|disk|cpu|memory|ram|network|firewall|permission|system|database|vpn|dns)\b/.test(text)) {
    categoryTag = 'SysAdmin'
  } else if (/\b(code|bug|fix|feature|api|function|debug|refactor|test|git|commit|branch|typescript|javascript|python|react|programming)\b/.test(text)) {
    categoryTag = 'Dev'
  } else if (/\b(write|draft|blog|email|document|report|essay|article|notes|proposal)\b/.test(text)) {
    categoryTag = 'Writing'
  } else if (/\b(design|ui|ux|mockup|logo|wireframe|figma|css|style|brand|poster|graphic)\b/.test(text)) {
    categoryTag = 'Design'
  } else if (/\b(workout|exercise|run|gym|meditate|doctor|water|sleep|diet|walk|yoga|stretch)\b/.test(text)) {
    categoryTag = 'Health'
  } else if (/\b(schedule|meeting|book|invoice|budget|filing|calendar|appointment|paperwork|tax|expense)\b/.test(text)) {
    categoryTag = 'Admin'
  } else if (/\b(errand|shopping|buy|call|home|clean|laundry|groceries|gift|parents|family)\b/.test(text)) {
    categoryTag = 'Personal'
  }

  let actionType: TaskActionType = 'quick_action'
  if (/\b(ssh|terminal|command|run|execute|install|deploy|script|cli|shell)\b/.test(text)) {
    actionType = 'terminal_command'
  } else if (/\b(refactor|optimize|rewrite|clean up|improve)\b/.test(text)) {
    actionType = 'code_refactor'
  } else if (/\b(implement|build|develop|architecture|migrate|design|research|study|learn|plan|write)\b/.test(text)) {
    actionType = 'deep_work'
  } else if (/\b(email|message|call|meeting|reply|respond|schedule|follow up)\b/.test(text)) {
    actionType = 'communication'
  } else if (/\b(backup|update|clean|organize|maintain|housekeeping)\b/.test(text)) {
    actionType = 'maintenance'
  }

  const baseMinutes: Record<TaskTier, number> = {
    TRIVIAL: 5,
    EASY: 20,
    MEDIUM: 45,
    HARD: 90,
    EPIC: 240
  }
  const estimatedMinutes = clamp(Math.round(baseMinutes[tier] + wordCount), 1, 480)

  return {
    tier,
    xpReward,
    estimatedMinutes,
    categoryTag,
    actionType,
    rationale: 'local heuristic estimate'
  }
}

function normalizeEvaluation(raw: RawEvaluation): TaskEvaluation | null {
  const tier = normalizeTier(raw.tier)
  const xpReward = normalizeXp(raw.xp_reward, tier)
  const estimatedMinutes = normalizeMinutes(raw.estimated_minutes, tier)
  const categoryTag = normalizeCategory(raw.category_tag)
  const actionType = normalizeActionType(raw.action_type)
  const rationale =
    typeof raw.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim().slice(0, 120)
      : 'evaluated by model'

  if (!Number.isFinite(xpReward) || !Number.isFinite(estimatedMinutes)) {
    return null
  }

  return { tier, xpReward, estimatedMinutes, categoryTag, actionType, rationale }
}

function parseEvaluationContent(content: string): TaskEvaluation | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as RawEvaluation
    return normalizeEvaluation(parsed)
  } catch {
    // Attempt to extract the first JSON object from a fenced / padded response.
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0]) as RawEvaluation
      return normalizeEvaluation(parsed)
    } catch {
      return null
    }
  }
}

export async function evaluateTaskWithOpenAI(
  title: string,
  apiKey: string,
  proxyUrl?: string
): Promise<TaskEvaluation> {
  const openAIProxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

  const client = new OpenAI({
    apiKey,
    fetchOptions: openAIProxyAgent
      ? {
          dispatcher: openAIProxyAgent
        }
      : undefined
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EVALUATION_TIMEOUT_MS)

  try {
    const completion = await client.chat.completions.create(
      {
        model: EVALUATION_MODEL,
        ...(modelSupportsTemperature(EVALUATION_MODEL) ? { temperature: 0.2 } : {}),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: title }
        ]
      },
      { signal: controller.signal }
    )

    const content = completion.choices[0]?.message?.content ?? ''
    return parseEvaluationContent(content) ?? evaluateTaskHeuristically(title)
  } catch {
    return evaluateTaskHeuristically(title)
  } finally {
    clearTimeout(timeout)
  }
}

export async function evaluateTask(
  title: string,
  apiKey: string,
  proxyUrl?: string
): Promise<TaskEvaluation> {
  if (!apiKey) {
    return evaluateTaskHeuristically(title)
  }

  try {
    return await evaluateTaskWithOpenAI(title, apiKey, proxyUrl)
  } catch {
    return evaluateTaskHeuristically(title)
  }
}
