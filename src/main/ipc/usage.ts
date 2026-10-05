import { ipcMain } from 'electron'
import { normalizeUsageProjectId } from '../../shared/config'
import {
  UsageApiError,
  buildUsageMetrics,
  normalizeUsageRangeDays
} from '../../shared/system/usage'
import { readConfig, updateConfig } from '../config/configStore'
import { resolveOpenAIProxyUrl } from '../proxy'
import {
  fetchOrganizationCompletionsUsage,
  fetchOrganizationCosts,
  fetchOrganizationProjects
} from '../services/usageClient'

export function registerUsageIpc(): void {
  ipcMain.handle('usage:get-metrics', async (_event, payload?: { rangeDays?: unknown; projectId?: unknown }) => {
    const rangeDays = normalizeUsageRangeDays(payload?.rangeDays)
    const storedConfig = readConfig()
    const adminKey = typeof storedConfig.adminApiKey === 'string' ? storedConfig.adminApiKey.trim() : ''

    if (!adminKey) {
      return {
        ok: false,
        code: 'ADMIN_KEY_MISSING',
        message: 'Add an OpenAI admin API key to load usage and cost metrics.'
      }
    }

    const projectId = normalizeUsageProjectId(payload?.projectId ?? storedConfig.usageProjectId)
    const endTime = Math.floor(Date.now() / 1000)
    const startTime = endTime - rangeDays * 24 * 60 * 60
    const proxyUrl = resolveOpenAIProxyUrl(storedConfig.proxyUrl)

    try {
      const [costBuckets, usageBuckets] = await Promise.all([
        fetchOrganizationCosts({ adminKey, proxyUrl, projectId, startTime, endTime, limit: rangeDays }),
        fetchOrganizationCompletionsUsage({ adminKey, proxyUrl, projectId, startTime, endTime, limit: rangeDays })
      ])

      return {
        ok: true,
        metrics: buildUsageMetrics({
          rangeDays,
          startTime,
          endTime,
          costBuckets,
          usageBuckets
        })
      }
    } catch (error) {
      if (error instanceof UsageApiError) {
        return { ok: false, code: error.code, message: error.message }
      }
      const message = error instanceof Error ? error.message : 'Unable to load usage metrics.'
      return { ok: false, code: 'UNKNOWN', message }
    }
  })

  ipcMain.handle('usage:get-projects', async () => {
    const storedConfig = readConfig()
    const adminKey = typeof storedConfig.adminApiKey === 'string' ? storedConfig.adminApiKey.trim() : ''

    if (!adminKey) {
      return {
        ok: false,
        code: 'ADMIN_KEY_MISSING',
        message: 'Add an OpenAI admin API key to list organization projects.'
      }
    }

    const proxyUrl = resolveOpenAIProxyUrl(storedConfig.proxyUrl)

    try {
      const projects = await fetchOrganizationProjects({ adminKey, proxyUrl })
      return { ok: true, projects }
    } catch (error) {
      if (error instanceof UsageApiError) {
        return { ok: false, code: error.code, message: error.message }
      }
      const message = error instanceof Error ? error.message : 'Unable to load organization projects.'
      return { ok: false, code: 'UNKNOWN', message }
    }
  })

  ipcMain.on('update-usage-project', (_event, projectId: unknown) => {
    updateConfig({ usageProjectId: normalizeUsageProjectId(projectId) })
  })
}
