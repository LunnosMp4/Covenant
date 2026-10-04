import type { PasteItemDetail, PasteItemMeta } from '../../../shared/paste'
import { formatAbsoluteTime, formatBytes, pasteTypeLabel } from '../utils/pasteFormat'
import { CopyIcon, PinIcon, SaveIcon, SparklesIcon, TrashIcon } from './PasteIcons'

type AiAction = 'summarize' | 'translate' | 'reformat' | 'explain'

const AI_ACTIONS: Array<{ id: AiAction; label: string; instruction: string }> = [
  { id: 'summarize', label: 'Summarize', instruction: 'Summarize the following clipboard content concisely.' },
  { id: 'translate', label: 'Translate', instruction: 'Translate the following clipboard content into English. If it is already English, translate it into French.' },
  { id: 'reformat', label: 'Reformat', instruction: 'Reformat the following clipboard content into clean, well-structured Markdown.' },
  { id: 'explain', label: 'Explain', instruction: 'Explain the following clipboard content clearly and briefly.' }
]

interface PasteDetailProps {
  meta: PasteItemMeta
  detail: PasteItemDetail | null
  loading: boolean
  onCopy: (id: string, asPlainText?: boolean) => void
  onPinToggle: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onSaveImage: (id: string) => void
  onAskAi: (message: string) => void
}

function MetaRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-right text-neutral-300">{value}</span>
    </div>
  )
}

export default function PasteDetail({
  meta,
  detail,
  loading,
  onCopy,
  onPinToggle,
  onDelete,
  onSaveImage,
  onAskAi
}: PasteDetailProps): JSX.Element {
  const isTextLike = meta.type !== 'image'
  const text = detail?.text ?? ''

  const askAi = (action: AiAction): void => {
    if (!isTextLike || !text.trim()) return
    const config = AI_ACTIONS.find((entry) => entry.id === action)
    if (!config) return
    onAskAi(`${config.instruction}\n\n${text}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-300">
            {pasteTypeLabel(meta.type)}
          </span>
          {meta.pinned && (
            <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
              Pinned
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500" title={formatAbsoluteTime(meta.createdAt)}>
          {formatAbsoluteTime(meta.createdAt)}
        </span>
      </header>

      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading…</div>
        ) : meta.type === 'image' ? (
          <div className="flex h-full items-center justify-center">
            <img
              src={`covenant-paste://full/${encodeURIComponent(meta.id)}`}
              alt={meta.preview || 'Clipboard image'}
              className="max-h-full max-w-full rounded-lg border border-white/10 object-contain"
            />
          </div>
        ) : meta.type === 'link' ? (
          <div className="space-y-2 paste-selectable">
            {meta.linkTitle && <p className="text-base font-medium text-neutral-100">{meta.linkTitle}</p>}
            <p className="break-all text-sm text-emerald-300">{meta.linkUrl ?? text}</p>
            {text && meta.linkUrl && text !== meta.linkUrl && (
              <pre className="chat-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-neutral-300">
                {text}
              </pre>
            )}
          </div>
        ) : (
          <pre className="paste-selectable whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-neutral-200">
            {text || meta.preview}
          </pre>
        )}

        {meta.ocrText && (
          <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-neutral-500">Recognized text</p>
            <pre className="paste-selectable whitespace-pre-wrap break-words text-xs text-neutral-300">
              {meta.ocrText}
            </pre>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs">
          <MetaRow label="Type" value={pasteTypeLabel(meta.type)} />
          <MetaRow label="Copied" value={formatAbsoluteTime(meta.createdAt)} />
          <MetaRow label="Size" value={formatBytes(meta.size)} />
          {typeof meta.charCount === 'number' && <MetaRow label="Characters" value={String(meta.charCount)} />}
          {typeof meta.wordCount === 'number' && <MetaRow label="Words" value={String(meta.wordCount)} />}
          {meta.imageWidth && meta.imageHeight && (
            <MetaRow label="Resolution" value={`${meta.imageWidth} × ${meta.imageHeight}`} />
          )}
          {meta.linkUrl && <MetaRow label="URL" value={meta.linkUrl} />}
          {meta.filePaths && meta.filePaths.length > 0 && (
            <MetaRow label="Files" value={meta.filePaths.join(', ')} />
          )}
          {meta.sourceApp && <MetaRow label="Source" value={meta.sourceApp} />}
        </div>

        {isTextLike && (
          <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-neutral-500">
              <SparklesIcon /> Ask AI
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AI_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => askAi(action.id)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-600">
              Opens the result in Covenant chat as a new conversation.
            </p>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-5 py-3">
        <ActionButton icon={<CopyIcon />} label="Copy" onClick={() => onCopy(meta.id)} />
        {isTextLike && (
          <ActionButton
            icon={<CopyIcon />}
            label="Copy as plain text"
            onClick={() => onCopy(meta.id, true)}
          />
        )}
        <ActionButton
          icon={<PinIcon filled={meta.pinned} />}
          label={meta.pinned ? 'Unpin' : 'Pin'}
          onClick={() => onPinToggle(meta.id, !meta.pinned)}
        />
        {meta.type === 'image' && (
          <ActionButton icon={<SaveIcon />} label="Save as file" onClick={() => onSaveImage(meta.id)} />
        )}
        <span className="flex-1" />
        <ActionButton
          icon={<TrashIcon />}
          label="Delete"
          danger
          onClick={() => onDelete(meta.id)}
        />
      </footer>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  danger
}: {
  icon: JSX.Element
  label: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        danger
          ? 'border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/15 hover:text-red-200'
          : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
