import { useMemo } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-batch'
import 'prismjs/components/prism-python'

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  bat: 'batch',
  cmd: 'batch'
}

const MAX_LINES = 500

function languageFor(file?: string): string | undefined {
  if (!file) return undefined
  const ext = file.split('.').pop()?.toLowerCase()
  return ext ? EXTENSION_LANGUAGE[ext] : undefined
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'
  )
}

function highlight(code: string, language?: string): string {
  const grammar = language ? Prism.languages[language] : undefined
  if (!grammar) return escapeHtml(code)
  try {
    return Prism.highlight(code, grammar, language as string)
  } catch {
    return escapeHtml(code)
  }
}

type LineKind = 'add' | 'del' | 'ctx' | 'hunk' | 'meta'

interface DiffLine {
  kind: LineKind
  prefix: string
  content: string
}

function classify(raw: string): DiffLine {
  if (raw.startsWith('@@')) return { kind: 'hunk', prefix: '', content: raw }
  if (
    raw.startsWith('diff ') ||
    raw.startsWith('index ') ||
    raw.startsWith('new file') ||
    raw.startsWith('deleted file') ||
    raw.startsWith('similarity') ||
    raw.startsWith('rename ') ||
    raw.startsWith('--- ') ||
    raw.startsWith('+++ ')
  ) {
    return { kind: 'meta', prefix: '', content: raw }
  }
  if (raw.startsWith('+')) return { kind: 'add', prefix: '+', content: raw.slice(1) }
  if (raw.startsWith('-')) return { kind: 'del', prefix: '-', content: raw.slice(1) }
  if (raw.startsWith(' ')) return { kind: 'ctx', prefix: ' ', content: raw.slice(1) }
  return { kind: 'ctx', prefix: '', content: raw }
}

export default function DiffView({ patch, file }: { patch: string; file?: string }): JSX.Element {
  const language = useMemo(() => languageFor(file), [file])
  const lines = useMemo(() => patch.replace(/\n$/, '').split('\n').map(classify), [patch])
  const shown = lines.slice(0, MAX_LINES)
  const hidden = lines.length - shown.length

  return (
    <div className="code-diff chat-scrollbar">
      {shown.map((line, index) => (
        <div key={index} className={`code-diff-line code-diff-line--${line.kind}`}>
          <span className="code-diff-gutter">{line.prefix || '\u00A0'}</span>
          {line.kind === 'hunk' || line.kind === 'meta' ? (
            <span className="code-diff-content">{line.content}</span>
          ) : (
            <span
              className="code-diff-content"
              dangerouslySetInnerHTML={{ __html: highlight(line.content, language) }}
            />
          )}
        </div>
      ))}
      {hidden > 0 && <div className="code-diff-more">… {hidden} more lines</div>}
    </div>
  )
}
