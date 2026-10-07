import { useMemo, useState } from 'react'
import type { CodeFileDiff } from '../../../shared/code/code'
import { GlobeIcon, SpinnerIcon, ToolIcon } from '../ui/icons'
import DiffView from './DiffView'
import type { ToolCard } from './types'
import {
  describeGroup,
  findDiffForTool,
  groupTools,
  summarizeTool,
  type ToolSummary
} from './toolSummaries'

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <span className={`chat-thinking-chevron${open ? ' chat-thinking-chevron--open' : ''}`}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  )
}

function kindIcon(summary: ToolSummary, running: boolean): JSX.Element {
  if (running) return <SpinnerIcon />
  if (summary.kind === 'fetch') return <GlobeIcon className="code-tool-kind-icon" />
  return <ToolIcon className="code-tool-kind-icon" />
}

function prettyInput(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return input
  }
}

function ToolRow({ tool, diffs }: { tool: ToolCard; diffs: CodeFileDiff[] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = useMemo(() => summarizeTool(tool), [tool])
  const diff = summary.kind === 'edit' ? findDiffForTool(tool, diffs) : undefined
  const isError = tool.status === 'error'
  const running = tool.status === 'running'
  const hasDetails = Boolean(tool.input || tool.output || tool.error || diff?.patch || tool.metadata)

  return (
    <div className={`code-tool${isError ? ' code-tool--error' : ''}`}>
      <button
        type="button"
        className="code-tool-row"
        onClick={() => hasDetails && setOpen((value) => !value)}
        disabled={!hasDetails}
      >
        <span className="code-tool-icon">{kindIcon(summary, running)}</span>
        <span className="code-tool-label">{summary.label}</span>
        {summary.target && (
          <span className="code-tool-target" title={summary.target}>
            {summary.target}
          </span>
        )}
        {isError && <span className="code-tool-state code-tool-state--error">error</span>}
        {running && <span className="code-tool-state">running</span>}
        {hasDetails && <Chevron open={open} />}
      </button>

      {open && (
        <div className="code-tool-details">
          {summary.detail && <div className="code-tool-note">{summary.detail}</div>}
          {diff?.patch && (
            <div className="code-tool-diff">
              <div className="code-tool-diff-head">
                <span className="truncate" title={diff.file}>
                  {diff.file}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-emerald-400">+{diff.additions}</span>{' '}
                  <span className="text-red-400">-{diff.deletions}</span>
                </span>
              </div>
              <DiffView patch={diff.patch} file={diff.file} />
            </div>
          )}
          {tool.input && <pre className="code-tool-args">{prettyInput(tool.input)}</pre>}
          {tool.output && <pre className="code-tool-output">{tool.output}</pre>}
          {tool.error && <div className="code-tool-error">{tool.error}</div>}
          {!tool.output && !tool.error && tool.metadata && (
            <pre className="code-tool-args">{JSON.stringify(tool.metadata, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}

function ToolGroup({ tools, diffs }: { tools: ToolCard[]; diffs: CodeFileDiff[] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasError = tools.some((tool) => tool.status === 'error')
  const running = tools.some((tool) => tool.status === 'running')

  return (
    <div className="code-tool-group">
      <button
        type="button"
        className="code-tool-row code-tool-row--group"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="code-tool-icon">
          {running ? <SpinnerIcon /> : <ToolIcon className={hasError ? 'code-tool-kind-icon code-tool-kind-icon--error' : 'code-tool-kind-icon'} />}
        </span>
        <span className="code-tool-label">Explored</span>
        <span className="code-tool-target">{describeGroup(tools)}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="code-tool-group-body">
          {tools.map((tool) => (
            <ToolRow key={tool.callId} tool={tool} diffs={diffs} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ToolActivityList({
  tools,
  diffs
}: {
  tools: ToolCard[]
  diffs: CodeFileDiff[]
}): JSX.Element | null {
  const items = useMemo(() => groupTools(tools), [tools])
  if (items.length === 0) return null

  return (
    <div className="code-tool-list">
      {items.map((item) =>
        item.type === 'group' ? (
          <ToolGroup key={item.id} tools={item.tools} diffs={diffs} />
        ) : (
          <ToolRow key={item.id} tool={item.tool} diffs={diffs} />
        )
      )}
    </div>
  )
}
