import ElectronStore from 'electron-store'
import type { NoteMeta } from '../../shared/notes/note'
import { appStore } from './appStore'

/**
 * Note *metadata* index.
 *
 * Notes live as files under `userData/notes`, while their metadata used to be
 * stored inside the shared `preprompts` store alongside every chat conversation.
 * The editor autosaves every ~650ms, and each of those writes re-serialised the
 * whole shared store (including full conversation histories). Keeping the index
 * in its own file makes autosave writes small and independent of chat history.
 *
 * Reads fall back to the legacy location the first time and seed this store, so
 * upgrading is lossless. The legacy key is left untouched so a downgrade still
 * finds the previous snapshot.
 */
interface NotesIndexSchema {
  notes: NoteMeta[]
}

const StoreClass =
  (ElectronStore as typeof ElectronStore & { default?: typeof ElectronStore }).default ??
  ElectronStore

const notesIndexStore = new StoreClass<NotesIndexSchema>({
  name: 'notes-index',
  schema: {
    notes: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'number' },
          updatedAt: { type: 'number' },
          pinned: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          kind: { type: 'string', enum: ['note', 'meeting'] },
          preview: { type: 'string' },
          meetingStatus: {
            type: 'string',
            enum: ['recording', 'transcribing', 'summarizing', 'completed', 'error']
          },
          meetingDurationMs: { type: 'number' },
          meetingSegmentCount: { type: 'number' }
        },
        required: ['id', 'title', 'createdAt', 'updatedAt', 'pinned', 'kind']
      }
    }
  }
})

let seededFromLegacy = false

function seedFromLegacyIfNeeded(): void {
  if (seededFromLegacy) return
  seededFromLegacy = true

  // `has` only tells us the key exists; the seeded check is whether this store
  // has ever been written. A brand-new store has its schema default (an empty
  // array), so compare against the legacy list instead of trusting emptiness.
  const legacyNotes = appStore.get('notes', [])
  if (legacyNotes.length === 0) return

  const current = notesIndexStore.get('notes', [])
  if (current.length > 0) return

  notesIndexStore.set('notes', legacyNotes)
}

export function getNotesIndex(): NoteMeta[] {
  seedFromLegacyIfNeeded()
  return notesIndexStore.get('notes', [])
}

export function setNotesIndex(notes: NoteMeta[]): void {
  seededFromLegacy = true
  notesIndexStore.set('notes', notes)
}
