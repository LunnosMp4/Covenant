import { randomUUID } from 'crypto'
import { promises as fsPromises } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type { Workflow, WorkflowLanguage } from '../../shared/domain/workflow'
import { parseLaunchArguments } from '../services/argParser'
import { appStore } from '../store/appStore'

const isWindows = process.platform === 'win32'

const WORKFLOW_LANGUAGE_SET = new Set<WorkflowLanguage>([
  'powershell',
  'cmd',
  'python',
  'nodejs',
  'shell',
  'custom'
])

const runningWorkflowIds = new Set<string>()

function normalizeWorkflowLanguage(language: string | undefined): WorkflowLanguage {
  const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : ''
  if (!WORKFLOW_LANGUAGE_SET.has(normalizedLanguage as WorkflowLanguage)) {
    throw new Error('Workflow language is invalid.')
  }

  return normalizedLanguage as WorkflowLanguage
}

export function getWorkflows(): Workflow[] {
  return appStore.get('workflows', [])
}

export function saveWorkflow(payload: Partial<Workflow>): Workflow[] {
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : ''
  const normalizedContent = typeof payload.content === 'string' ? payload.content : ''
  const normalizedCustomCommand =
    typeof payload.customCommand === 'string' ? payload.customCommand.trim() : ''
  const normalizedLanguage = normalizeWorkflowLanguage(payload.language)

  if (!normalizedTitle) {
    throw new Error('Workflow title is required.')
  }

  if (!normalizedContent.trim()) {
    throw new Error('Workflow content is required.')
  }

  if (normalizedLanguage === 'custom' && !normalizedCustomCommand) {
    throw new Error('Custom command is required for custom workflows.')
  }

  const workflows = getWorkflows()
  const existingId = typeof payload.id === 'string' ? payload.id.trim() : ''

  if (existingId && workflows.some((item) => item.id === existingId)) {
    const updated = workflows.map((item) =>
      item.id === existingId
        ? {
            ...item,
            title: normalizedTitle,
            language: normalizedLanguage,
            customCommand: normalizedLanguage === 'custom' ? normalizedCustomCommand : '',
            content: normalizedContent
          }
        : item
    )

    appStore.set('workflows', updated)
    return updated
  }

  const created: Workflow = {
    id: existingId || randomUUID(),
    title: normalizedTitle,
    language: normalizedLanguage,
    customCommand: normalizedLanguage === 'custom' ? normalizedCustomCommand : '',
    content: normalizedContent
  }

  const nextWorkflows = [...workflows, created]
  appStore.set('workflows', nextWorkflows)
  return nextWorkflows
}

export function deleteWorkflow(id: string): Workflow[] {
  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId) {
    return getWorkflows()
  }

  const nextWorkflows = getWorkflows().filter((item) => item.id !== normalizedId)
  appStore.set('workflows', nextWorkflows)
  return nextWorkflows
}

function resolveWorkflowRuntime(workflow: Workflow): {
  extension: string
  command: string
  baseArgs: string[]
} {
  if (workflow.language === 'python') {
    return { extension: '.py', command: 'python', baseArgs: [] }
  }

  if (workflow.language === 'nodejs') {
    return { extension: '.js', command: 'node', baseArgs: [] }
  }

  if (workflow.language === 'powershell') {
    return {
      extension: '.ps1',
      command: isWindows ? 'powershell' : 'pwsh',
      baseArgs: isWindows ? ['-ExecutionPolicy', 'Bypass', '-File'] : ['-File']
    }
  }

  if (workflow.language === 'cmd') {
    if (!isWindows) {
      throw new Error('CMD workflows are supported only on Windows.')
    }

    return { extension: '.bat', command: 'cmd', baseArgs: ['/c'] }
  }

  if (workflow.language === 'shell') {
    return { extension: '.sh', command: isWindows ? 'bash' : 'sh', baseArgs: [] }
  }

  const customTokens = parseLaunchArguments(workflow.customCommand?.trim() || '')
  if (customTokens.length === 0) {
    throw new Error('Custom run command is required for custom workflows.')
  }

  const [command, ...baseArgs] = customTokens
  return {
    extension: '.tmp',
    command,
    baseArgs
  }
}

export function emitWorkflowStatus(
  sender: WebContents,
  payload: { id: string; status: 'running' | 'success' | 'error' }
): void {
  if (sender.isDestroyed()) return
  sender.send('workflow-status-update', payload)
}

export function emitWorkflowLog(
  sender: WebContents,
  payload: { id: string; type: 'info' | 'error'; text: string }
): void {
  if (sender.isDestroyed()) return
  sender.send('workflow-log', payload)
}

export async function executeWorkflowScript(
  sender: WebContents,
  payload: Partial<Workflow>
): Promise<{ success: boolean; error?: string }> {
  const normalizedLanguage = normalizeWorkflowLanguage(payload.language)
  const normalizedContent = typeof payload.content === 'string' ? payload.content : ''
  const normalizedTitle = typeof payload.title === 'string' ? payload.title.trim() : 'Workflow'
  const normalizedCustomCommand =
    typeof payload.customCommand === 'string' ? payload.customCommand.trim() : ''
  const normalizedId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID()

  if (!normalizedContent.trim()) {
    throw new Error('Workflow content is required.')
  }

  const normalizedWorkflow: Workflow = {
    id: normalizedId,
    title: normalizedTitle || 'Workflow',
    language: normalizedLanguage,
    customCommand: normalizedCustomCommand,
    content: normalizedContent
  }

  if (runningWorkflowIds.has(normalizedWorkflow.id)) {
    const message = 'Workflow is already running.'
    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text: message
    })
    return {
      success: false,
      error: message
    }
  }

  const runtime = resolveWorkflowRuntime(normalizedWorkflow)
  const tempFilePath = join(
    tmpdir(),
    `covenant-workflow-${Date.now()}-${randomUUID()}${runtime.extension}`
  )

  await fsPromises.writeFile(tempFilePath, normalizedWorkflow.content, { encoding: 'utf-8' })
  const executionArgs = [...runtime.baseArgs, tempFilePath]

  let childProcess

  try {
    childProcess = spawn(runtime.command, executionArgs, {
      windowsHide: true,
      shell: false
    })
  } catch (error) {
    await fsPromises.unlink(tempFilePath).catch(() => {
      // Ignore cleanup errors in temp directory.
    })
    throw error
  }

  runningWorkflowIds.add(normalizedWorkflow.id)
  emitWorkflowStatus(sender, {
    id: normalizedWorkflow.id,
    status: 'running'
  })

  emitWorkflowLog(sender, {
    id: normalizedWorkflow.id,
    type: 'info',
    text: `$ ${runtime.command} ${executionArgs.join(' ')}`
  })

  const cleanupTempFile = (): void => {
    void fsPromises.unlink(tempFilePath).catch(() => {
      // Ignore cleanup errors in temp directory.
    })
  }

  childProcess.stdout?.on('data', (data) => {
    const text = data.toString()
    if (!text) return

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'info',
      text
    })
  })

  childProcess.stderr?.on('data', (data) => {
    const text = data.toString()
    if (!text) return

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text
    })
  })

  childProcess.once('error', (error) => {
    const message = error instanceof Error ? error.message : 'Unable to execute workflow.'
    runningWorkflowIds.delete(normalizedWorkflow.id)

    emitWorkflowLog(sender, {
      id: normalizedWorkflow.id,
      type: 'error',
      text: message
    })

    emitWorkflowStatus(sender, {
      id: normalizedWorkflow.id,
      status: 'error'
    })

    cleanupTempFile()
  })

  childProcess.once('close', (code) => {
    runningWorkflowIds.delete(normalizedWorkflow.id)

    if (code === 0) {
      emitWorkflowStatus(sender, {
        id: normalizedWorkflow.id,
        status: 'success'
      })

      emitWorkflowLog(sender, {
        id: normalizedWorkflow.id,
        type: 'info',
        text: 'Workflow completed successfully.'
      })
    } else {
      emitWorkflowLog(sender, {
        id: normalizedWorkflow.id,
        type: 'error',
        text: `Workflow exited with code ${code ?? -1}.`
      })

      emitWorkflowStatus(sender, {
        id: normalizedWorkflow.id,
        status: 'error'
      })
    }

    cleanupTempFile()
  })

  return { success: true }
}
