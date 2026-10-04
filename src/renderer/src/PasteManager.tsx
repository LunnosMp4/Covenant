import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import type {
  PasteItemDetail,
  PasteItemMeta,
  PasteItemType,
  PasteManagerSettings
} from '../../shared/paste'
import PasteDetail from './components/PasteDetail'
import { PasteTypeIcon, PinIcon, SearchIcon } from './components/PasteIcons'
import { getThemeMode, getThemePalette } from './constants/theme'
import { normalizeText, scoreMatch } from './utils/fuzzy'
import { formatAbsoluteTime, formatRelativeTime } from './utils/pasteFormat'

type TypeFilter = 'all' | PasteItemType

const DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

const FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'rich', label: 'Rich' },
  { id: 'link', label: 'Links' },
  { id: 'image', label: 'Images' },
  { id: 'file', label: 'Files' }
]

function scorePasteItem(normalizedQuery: string, item: PasteItemMeta): number {
  let best = scoreMatch(normalizedQuery, normalizeText(item.preview))
  if (item.linkTitle) {
    best = Math.max(best, scoreMatch(normalizedQuery, normalizeText(item.linkTitle)) * 1.05)
  }
  if (item.searchText) {
    best = Math.max(best, scoreMatch(normalizedQuery, normalizeText(item.searchText)))
  }
  if (item.ocrText) {
    best = Math.max(best, scoreMatch(normalizedQuery, normalizeText(item.ocrText)))
  }
  if (item.linkUrl) {
    best = Math.max(best, scoreMatch(normalizedQuery, normalizeText(item.linkUrl)))
  }
  return best
}

export default function PasteManager(): JSX.Element {
  const [items, setItems] = useState<PasteItemMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [detail, setDetail] = useState<PasteItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [settings, setSettings] = useState<PasteManagerSettings | null>(null)
  const [themeGradient, setThemeGradient] = useState('from-neutral-900/95 to-[#1c0f03]')

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    if (!window.api?.paste) return
    const list = await window.api.paste.list()
    setItems(list)
  }, [])

  useEffect(() => {
    void reload()
    void window.api?.paste?.getSettings?.().then(setSettings)
    void window.api?.config
      ?.getConfig()
      .then((config) => setThemeGradient(config.themeGradient || 'from-neutral-900/95 to-[#1c0f03]'))

    const offChanged = window.api?.paste?.onChanged(() => {
      void reload()
    })
    const offSettings = window.api?.paste?.onSettingsUpdated((next) => setSettings(next))
    const offShown = window.api?.paste?.onShown(() => {
      void reload()
      setQuery('')
      window.setTimeout(() => searchRef.current?.focus(), 0)
    })
    const offTheme = window.api?.config?.onThemeUpdated?.((gradient) => {
      setThemeGradient(gradient || 'from-neutral-900/95 to-[#1c0f03]')
    })

    window.setTimeout(() => searchRef.current?.focus(), 30)

    return () => {
      offChanged?.()
      offSettings?.()
      offShown?.()
      offTheme?.()
    }
  }, [reload])

  const filtered = useMemo(() => {
    let list = items.filter((item) => typeFilter === 'all' || item.type === typeFilter)
    const trimmed = query.trim()
    if (trimmed) {
      const normalizedQuery = normalizeText(trimmed)
      list = list
        .map((item) => ({ item, score: scorePasteItem(normalizedQuery, item) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt)
        .map((entry) => entry.item)
    }
    return list
  }, [items, query, typeFilter])

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
    window.api?.paste?.hideWindow()
  }, [])

  const handlePasteAndClose = useCallback(
    async (id: string) => {
      await handleCopy(id)
    },
    [handleCopy]
  )

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
        window.api?.paste?.hideWindow()
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
        if (selectedId) void handlePasteAndClose(selectedId)
      }
    },
    [moveSelection, selectedId, handlePasteAndClose]
  )

  const themePalette = useMemo(() => getThemePalette(themeGradient), [themeGradient])
  const themeStyles = useMemo<CSSProperties>(
    () =>
      ({
        '--chat-accent': themePalette.accent,
        '--chat-accent-soft': themePalette.accentSoft,
        '--chat-accent-strong': themePalette.accentStrong,
        '--chat-on-accent': themePalette.onAccent,
        '--chat-user-text': themePalette.userText,
        '--chat-assistant-text': themePalette.assistantText,
        '--chat-assistant-bg': themePalette.assistantBg,
        '--chat-assistant-border': themePalette.assistantBorder,
        '--chat-scroll-thumb': themePalette.scrollbarThumb,
        '--chat-scroll-thumb-hover': themePalette.scrollbarThumbHover,
        '--chat-meta-text': themePalette.metaText
      }) as CSSProperties,
    [themePalette]
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getThemeMode(themeGradient))
  }, [themeGradient])

  const disabled = settings != null && !settings.enabled

  return (
    <div className="h-screen w-screen bg-transparent p-2 font-sans text-neutral-200" style={themeStyles}>
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-neutral-800/85 bg-gradient-to-br ${themeGradient} texture-surface`}
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 px-4" style={DRAG_STYLE}>
          <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Paste Manager</span>
          <span className="text-[11px] text-neutral-600">{items.length} items</span>
        </div>

        {disabled ? (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            Paste Manager is disabled. Enable it in Settings.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1" onKeyDown={onKeyDown}>
            <aside className="flex w-[360px] shrink-0 flex-col border-r border-white/5" style={NO_DRAG_STYLE}>
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
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-400/50"
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
                    const active = item.id === selectedId
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-id={item.id}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => void handlePasteAndClose(item.id)}
                        className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          active ? 'bg-emerald-400/10 ring-1 ring-emerald-400/30' : 'hover:bg-white/5'
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
                            {item.pinned && <PinIcon filled className="text-amber-300" />}
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
    </div>
  )
}
