import { Children, useState, type HTMLAttributes } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-batch'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-python'
import { CheckIcon, CopyIcon, GlobeIcon, TerminalSendIcon } from '../icons'
import { formatSourceDomain, getFaviconUrl } from '../../utils/chatUsage'
import type { ReasoningStep } from '../../../../shared/chat'

export function preprocessLatexDelimiters(content: string): string {
  return content
    .replace(/\\\[/g, '$$$$\n')
    .replace(/\\\]/g, '\n$$$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
}

function highlightMarkdownCode(code: string, language: string | undefined): string {
  if (!language) return code
  const grammar = Prism.languages[language]
  if (!grammar) return code
  return Prism.highlight(code, grammar, language)
}

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'powershell', 'ps1', 'cmd'])

export function WebSearchStepRow({
  step
}: {
  step: Extract<ReasoningStep, { type: 'web_search' }>
}): JSX.Element {
  const isSearching = step.status === 'searching'
  const query = step.query?.trim()

  return (
    <div className="chat-thinking-search">
      <GlobeIcon
        className={`chat-thinking-search-icon${isSearching ? ' chat-thinking-search-icon--pulse' : ''}`}
      />
      <div className="chat-thinking-search-content">
        <span>
          {query ? (
            <>
              Searching web for <span className="chat-thinking-search-query">“{query}”</span>
            </>
          ) : (
            'Searching the web…'
          )}
        </span>
        {!isSearching && step.sources.length > 0 ? (
          <div className="chat-thinking-search-sources">
            {step.sources.slice(0, 3).map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chat-thinking-source"
              >
                <img
                  src={getFaviconUrl(source.url, 32)}
                  alt=""
                  className="chat-thinking-source-favicon"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
                <span className="chat-thinking-source-domain">{formatSourceDomain(source.url)}</span>
              </a>
            ))}
            {step.sources.length > 3 ? (
              <span className="chat-thinking-source-more">+{step.sources.length - 3} more</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function CopyButton({ text, className }: { text: string; className?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    window.api?.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      title="Copy"
      aria-label="Copy"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

export function CodeBlock({
  language,
  code,
  ...props
}: { language: string | undefined; code: string } & HTMLAttributes<HTMLPreElement>): JSX.Element {
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const highlighted = highlightMarkdownCode(code, language)
  const isShell = language != null && SHELL_LANGUAGES.has(language)

  const handleSendToTerminal = async () => {
    if (!window.api?.terminal) return
    const result = await window.api.terminal.sendToActiveSession(code)
    if (result.success) {
      setSent(true)
      setTimeout(() => setSent(false), 2000)
    }
  }

  const handleCopy = () => {
    window.api?.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="chat-code-block-wrapper">
      <div className="chat-code-block-header">
        <span className="chat-code-block-lang">{language ?? 'code'}</span>
        <div className="chat-code-block-actions">
          <button
            type="button"
            onClick={handleCopy}
            className={`chat-code-block-btn ${copied ? 'chat-code-block-btn-sent' : ''}`}
            title="Copy code"
            aria-label="Copy code"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {isShell && (
            <button
              type="button"
              onClick={handleSendToTerminal}
              className={`chat-code-block-btn ${sent ? 'chat-code-block-btn-sent' : ''}`}
              title="Send to Terminal"
              aria-label="Send code to terminal"
            >
              <TerminalSendIcon />
            </button>
          )}
        </div>
      </div>
      <pre className="chat-code-block" {...props}>
        <code
          className={language ? `language-${language}` : undefined}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  )
}

export function AssistantMarkdown({ content }: { content: string }): JSX.Element {
  const query = preprocessLatexDelimiters(content)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      className="chat-markdown"
      components={{
        a({ href, children, ...props }) {
          const safeHref = typeof href === 'string' ? href : undefined
          return (
            <a href={safeHref} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          )
        },
        pre({ children, ...props }) {
          const childArr = Children.toArray(children)
          const codeEl = childArr[0] as { props?: { className?: string; children?: unknown } } | undefined
          const className = codeEl?.props?.className ?? ''
          const rawCode = codeEl?.props?.children != null ? String(codeEl.props.children).replace(/\n$/, '') : ''
          const match = /language-(\w+)/.exec(className)
          const language = match?.[1]

          return <CodeBlock language={language} code={rawCode} {...props} />
        },
        code({ className, children, ...props }) {
          return (
            <code className={className || 'chat-code-inline'} {...props}>
              {children}
            </code>
          )
        }
      }}
    >
      {query}
    </ReactMarkdown>
  )
}