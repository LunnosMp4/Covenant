import { ipcMain } from 'electron'
import type { ChatConversation } from '../../shared/chat/chat'
import type { Preprompt } from '../../shared/domain/preprompt'
import type { LauncherApp } from '../../shared/launcher/launcher-app'
import type { Workflow } from '../../shared/domain/workflow'
import { readConfig } from '../config/configStore'
import { deleteConversation, getConversations, saveConversation } from '../features/conversations'
import { deleteApp, getApps, saveApp } from '../features/launcherApps'
import {
  deletePreprompt,
  getGlobalInstructions,
  getPreprompts,
  saveGlobalInstructions,
  savePreprompt
} from '../features/preprompts'
import {
  addTask,
  clearCompletedTasks,
  deleteTask,
  getGamification,
  getTasks,
  reorderTasks,
  toggleTask
} from '../features/tasks'
import {
  deleteWorkflow,
  emitWorkflowLog,
  emitWorkflowStatus,
  executeWorkflowScript,
  getWorkflows,
  saveWorkflow
} from '../features/workflows'
import { getAppIcon, getInstalledApps } from '../installedApps'
import { generateConversationTitle } from '../openai/title'

export function registerStoreIpc(): void {
  ipcMain.handle('get-conversations', () => {
    return getConversations()
  })

  ipcMain.handle('save-conversation', (_event, payload: Partial<ChatConversation>) => {
    return saveConversation(payload)
  })

  ipcMain.handle('delete-conversation', (_event, conversationId: string) => {
    return deleteConversation(conversationId)
  })

  ipcMain.handle('generate-conversation-title', async (_event, prompt: string) => {
    return generateConversationTitle(prompt)
  })

  ipcMain.handle('get-preprompts', () => {
    return getPreprompts()
  })

  ipcMain.handle('save-preprompt', (_event, payload: Partial<Preprompt>) => {
    return savePreprompt(payload)
  })

  ipcMain.handle('delete-preprompt', (_event, prepromptId: string) => {
    return deletePreprompt(prepromptId)
  })

  ipcMain.handle('get-global-instructions', () => {
    return getGlobalInstructions()
  })

  ipcMain.handle('save-global-instructions', (_event, value: string) => {
    return saveGlobalInstructions(value)
  })

  ipcMain.handle('get-apps', () => {
    return getApps()
  })

  ipcMain.handle('save-app', (_event, payload: Partial<LauncherApp>) => {
    return saveApp(payload)
  })

  ipcMain.handle('delete-app', (_event, appId: string) => {
    return deleteApp(appId)
  })

  ipcMain.handle('get-installed-apps', () => {
    return getInstalledApps({ includeSystemApps: readConfig().launcherShowSystemApps === true })
  })

  ipcMain.handle('get-app-icon', (_event, appPath: string) => {
    return getAppIcon(appPath)
  })

  ipcMain.handle('get-workflows', () => {
    return getWorkflows()
  })

  ipcMain.handle('save-workflow', (_event, payload: Partial<Workflow>) => {
    return saveWorkflow(payload)
  })

  ipcMain.handle('delete-workflow', (_event, workflowId: string) => {
    return deleteWorkflow(workflowId)
  })

  ipcMain.handle('get-tasks', () => {
    return getTasks()
  })

  ipcMain.handle('get-gamification', () => {
    return getGamification()
  })

  ipcMain.handle('add-task', (_event, title: string) => {
    return addTask(title)
  })

  ipcMain.handle('toggle-task', (_event, taskId: string) => {
    return toggleTask(taskId)
  })

  ipcMain.handle('delete-task', (_event, taskId: string) => {
    return deleteTask(taskId)
  })

  ipcMain.handle('reorder-tasks', (_event, orderedIds: unknown) => {
    return reorderTasks(orderedIds)
  })

  ipcMain.handle('clear-completed-tasks', () => {
    return clearCompletedTasks()
  })

  ipcMain.handle('execute-workflow', async (event, workflowPayload: Partial<Workflow>) => {
    try {
      return await executeWorkflowScript(event.sender, workflowPayload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to execute workflow.'
      const workflowId = typeof workflowPayload.id === 'string' ? workflowPayload.id.trim() : ''

      if (workflowId) {
        emitWorkflowLog(event.sender, {
          id: workflowId,
          type: 'error',
          text: message
        })

        emitWorkflowStatus(event.sender, {
          id: workflowId,
          status: 'error'
        })
      }

      return {
        success: false,
        error: message
      }
    }
  })
}
