import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import type { PasteItemDetail, PasteItemMeta, PasteItemType } from '../../../shared/paste/paste'
import PasteDetail from './PasteDetail'
import { PasteTypeIcon, PinIcon, SearchIcon } from './PasteIcons'
import ExpandButton from '../ui/ExpandButton'
import { PinIcon as WindowPinIcon } from '../ui/icons'
import { normalizeText, scoreMatch } from '../utils/launcher/fuzzy'
import { formatAbsoluteTime, formatRelativeTime } from '../utils/paste/pasteFormat'

type TypeFilter = 'all' | PasteItemType

const FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'rich', label: 'Rich' },
  { id: 'link', label: 'Links' },
  { id: 'image', label: 'Images' },
  { id: 'file', label: 'Files' }
]

interface PasteSurfaceProps {
  active: boolean
  height: number
  isExpanded: boolean
  isWide: boolean
  isAltHeld: boolean
  isPinned: boolean
  onToggleExpand: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePin: () => void
}

interface PasteSearchFields {
  preview: string
  linkTitle: string
  searchText: string
  ocrText: string
  linkUrl: string
}

function scorePasteFields(normalizedQuery: string, fields: PasteSearchFields): number {
  let best = scoreMatch(normalizedQuery, fields.preview)
  if (fields.linkTitle) {
    best = Math.max(best, scoreMatch(normalizedQuery, fields.linkTitle) * 1.05)
  }
  if (fields.searchText) {
    best = Math.max(best, scoreMatch(normalizedQuery, fields.searchText))
  }
  if (fields.ocrText) {
    best = Math.max(best, scoreMatch(normalizedQuery, fields.ocrText))
  }
  if (fields.linkUrl) {
    best = Math.max(best, scoreMatch(normalizedQuery, fields.linkUrl))
  }
  return best
}

function buildPasteSearchFields(item: PasteItemMeta): PasteSearchFields {
  return {
    preview: normalizeText(item.preview),
    linkTitle: item.linkTitle ? normalizeText(item.linkTitle) : '',
    searchText: item.searchText ? normalizeText(item.searchText) : '',
    ocrText: item.ocrText ? normalizeText(item.ocrText) : '',
    linkUrl: item.linkUrl ? normalizeText(item.linkUrl) : ''
  }
}

/**
 * Clipboard history surface. Rendered inside the main command window exactly
 * like chat/code/terminal — same window bounds, animations and pin/expand
 * behaviour — so there is no separate draggable/resizable paste window.
 */
export default function PasteSurface({
  active,
  height,
  isExpanded,
  isWide,
  isAltHeld,
  isPinned,
  onToggleExpand,
  onTogglePin
}: PasteSurfaceProps): JSX.Element {
  const [items, setItems] = useState<PasteItemMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [detail, setDetail] = useState<PasteItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [enabled, setEnabled] = useState(true)

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounced query: the history can hold up to a thousand entries and each
  // match scans several normalized fields, so typing does not need to re-rank
  // on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('')
      return undefined
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), 80)
    return () => {
      window.clearTimeout(timer)
    }
  }, [query])

  // Normalized search fields are derived once per list load instead of being
  // rebuilt for every entry on every keystroke.
  const searchFieldsById = useMemo(() => {
    const fields = new Map<string, PasteSearchFields>()
    for (const item of items) {
      fields.set(item.id, buildPasteSearchFields(item))
    }
    return fields
  }, [items])

  const reload = useCallback(async () => {
    if (!window.api?.paste) return
    const list = await window.api.paste.list()
    setItems(list)
  }, [])

  useEffect(() => {
    void reload()
    void window.api?.paste?.getSettings?.().then((settings) => setEnabled(settings.enabled))

    const offChanged = window.api?.paste?.onChanged(() => {
      void reload()
    })
    const offSettings = window.api?.paste?.onSettingsUpdated((next) => setEnabled(next.enabled))

    return () => {
      offChanged?.()
      offSettings?.()
    }
  }, [reload])

  // Opening the view starts from a clean search and focuses the input; the
  // native window show/hide lifecycle is owned by the main command window.
  useEffect(() => {
    if (!active) return
    setQuery('')
    void reload()
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [active, reload])

  const filtered = useMemo(() => {
    let list = items.filter((item) => typeFilter === 'all' || item.type === typeFilter)
    const trimmed = debouncedQuery.trim()
    if (trimmed) {
      const normalizedQuery = normalizeText(trimmed)
      list = list
        .map((item) => ({
          item,
          score: scorePasteFields(normalizedQuery, searchFieldsById.get(item.id) ?? buildPasteSearchFields(item))
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt)
        .map((entry) => entry.item)
    }
    return list
  }, [items, debouncedQuery, typeFilter, searchFieldsById])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  useEffect(() => {
    if (!selectedId || !window.api?.paste) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    void window.api.paste
      .getDetail(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Refresh detail whenever the list changes so async link/OCR updates show up.
  }, [selectedId, items])

  const selectedIndex = useMemo(
    () => filtered.findIndex((item) => item.id === selectedId),
    [filtered, selectedId]
  )

  const selectedMeta = selectedId ? items.find((item) => item.id === selectedId) ?? null : null

  const moveSelection = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return
      const current = filtered.findIndex((item) => item.id === selectedId)
      const base = current < 0 ? 0 : current
      const next = Math.min(filtered.length - 1, Math.max(0, base + delta))
      setSelectedId(filtered[next].id)
      const node = listRef.current?.querySelector<HTMLElement>(`[data-id="${filtered[next].id}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    },
    [filtered, selectedId]
  )

  const handleCopy = useCallback(async (id: string, asPlainText = false) => {
    await window.api?.paste?.copy(id, asPlainText)
    window.api?.window.hideWindow()
  }, [])

  const handlePinToggle = useCallback(
    async (id: string, pinned: boolean) => {
      await window.api?.paste?.setPinned(id, pinned)
      await reload()
    },
    [reload]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api?.paste?.remove(id)
      await reload()
    },
    [reload]
  )

  const handleSaveImage = useCallback(async (id: string) => {
    await window.api?.paste?.saveImage(id)
  }, [])

  const handleAskAi = useCallback((message: string) => {
    window.api?.paste?.askInChat(message)
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        window.api?.window.hideWindow()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (selectedId) void handleCopy(selectedId)
      }
    },
    [moveSelection, selectedId, handleCopy]
  )

  return (
    <div className="flex min-h-0 flex-col" style={{ height }}>
      <header className="relative flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onTogglePin}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              isPinned
                ? 'border-[color:var(--chat-accent-strong)] bg-[color:var(--chat-accent-soft)] text-[color:var(--chat-accent)]'
                : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
            }`}
            aria-label={isPinned ? 'Unpin window' : 'Pin window'}
            aria-pressed={isPinned}
          >
            <WindowPinIcon active={isPinned} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-neutral-500">Clipboard</p>
            <p className="truncate text-sm font-medium text-neutral-200">
              Paste Manager
              <span className="ml-2 text-[11px] font-normal text-neutral-500">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ExpandButton
            expanded={isExpanded}
            wide={isWide}
            altHeld={isAltHeld}
            onClick={onToggleExpand}
          />
        </div>
      </header>

      {!enabled ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-white/5 bg-neutral-950/20 text-sm text-neutral-500">
          Paste Manager is disabled. Enable it in Settings.
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-white/5 bg-neutral-950/20"
          onKeyDown={onKeyDown}
        >
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/5">
            <div className="space-y-2 border-b border-white/5 p-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  <SearchIcon />
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search clipboard history…"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[color:var(--chat-accent)]"
                  aria-label="Search clipboard history"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setTypeFilter(filter.id)}
                    className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                      typeFilter === filter.id
                        ? 'bg-white/10 text-neutral-100'
                        : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={listRef} className="chat-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-8 text-center text-xs text-neutral-500">
                  {items.length === 0 ? 'Nothing copied yet.' : 'No matches.'}
                </div>
              ) : (
                filtered.map((item) => {
                  const activeItem = item.id === selectedId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-id={item.id}
                      onClick={() => setSelectedId(item.id)}
                      onDoubleClick={() => void handleCopy(item.id)}
                      className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        activeItem ? 'bg-white/[0.06] ring-1 ring-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.04] text-neutral-300">
                        {item.type === 'image' && item.thumbFile ? (
                          <img
                            src={`covenant-paste://thumb/${encodeURIComponent(item.id)}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <PasteTypeIcon type={item.type} />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-neutral-200">{item.preview || 'Item'}</span>
                        <span
                          className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500"
                          title={formatAbsoluteTime(item.createdAt)}
                        >
                          {item.pinned && <PinIcon filled className="text-[color:var(--chat-accent)]" />}
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-[11px] text-neutral-600">
              <span>↑↓ navigate · Enter paste · Esc close</span>
              {filtered.length > 0 && <span>{selectedIndex + 1}/{filtered.length}</span>}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            {selectedMeta ? (
              <PasteDetail
                meta={selectedMeta}
                detail={detail && detail.meta.id === selectedMeta.id ? detail : null}
                loading={detailLoading}
                onCopy={handleCopy}
                onPinToggle={handlePinToggle}
                onDelete={handleDelete}
                onSaveImage={handleSaveImage}
                onAskAi={handleAskAi}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-600">
                Select an item to preview it.
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
