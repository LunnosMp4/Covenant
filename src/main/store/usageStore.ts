import ElectronStore from 'electron-store'
import type { AiUsageEntry } from '../../shared/ai/usage'
import { appStore } from './appStore'

/**
 * Local AI-usage ledger.
 *
 * It used to live in the shared `preprompts` store next to every chat
 * conversation, task and workflow. `electron-store` rewrites (and re-validates)
 * the whole file on each `set`, so saving one conversation also serialized up to
 * 10k usage entries, and recording usage rewrote every conversation. Giving the
 * ledger its own file keeps both writes small and independent — the same split
 * already used for the notes index.
 *
 * Reads fall back to the legacy location once so upgrading is lossless; the
 * legacy key is left untouched so a downgrade still finds the previous snapshot.
 */
interface UsageStoreSchema {
  aiUsageEntries: AiUsageEntry[]
}

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const usageStore = new StoreClass<UsageStoreSchema>({
  name: 'ai-usage',
  defaults: { aiUsageEntries: [] },
  schema: {
    aiUsageEntries: {
      type: 'array',
      default: []
    }
  }
})

let seededFromLegacy = false

function seedFromLegacyIfNeeded(): void {
  if (seededFromLegacy) return
  seededFromLegacy = true

  const current = usageStore.get('aiUsageEntries', [])
  if (current.length > 0) return

  const legacy = appStore.get('aiUsageEntries', [])
  if (legacy.length === 0) return

  usageStore.set('aiUsageEntries', legacy)
}

export function getUsageEntries(): AiUsageEntry[] {
  seedFromLegacyIfNeeded()
  return usageStore.get('aiUsageEntries', [])
}

export function setUsageEntries(entries: AiUsageEntry[]): void {
  seededFromLegacy = true
  usageStore.set('aiUsageEntries', entries)
}
