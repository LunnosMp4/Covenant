import { useEffect, useMemo, useState } from 'react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-batch'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-python'
import 'prismjs/themes/prism-tomorrow.css'
import type { Workflow, WorkflowLanguage } from '../types/workflow'
import ModalOverlay from './ModalOverlay'

interface WorkflowFormModalProps {
  initialData?: Workflow
  onCancel: () => void
  onSave: (payload: {
    id?: string
    title: string
    language: WorkflowLanguage
    customCommand?: string
    content: string
  }) => void
}

const LANGUAGE_OPTIONS: Array<{ label: string; value: WorkflowLanguage }> = [
  { label: 'PowerShell', value: 'powershell' },
  { label: 'CMD', value: 'cmd' },
  { label: 'Python', value: 'python' },
  { label: 'NodeJS', value: 'nodejs' },
  { label: 'Shell', value: 'shell' },
  { label: 'Custom', value: 'custom' }
]

const PRISM_LANGUAGE_MAP: Record<WorkflowLanguage, string | undefined> = {
  powershell: 'powershell',
  cmd: 'batch',
  python: 'python',
  nodejs: 'javascript',
  shell: 'bash',
  custom: undefined
}

function highlightCode(code: string, language: WorkflowLanguage): string {
  const prismLanguage = PRISM_LANGUAGE_MAP[language]
  if (!prismLanguage) {
    return code
  }

  const grammar = Prism.languages[prismLanguage]
  if (!grammar) {
    return code
  }

  return Prism.highlight(code, grammar, prismLanguage)
}

export default function WorkflowFormModal({
  initialData,
  onCancel,
  onSave
}: WorkflowFormModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState<WorkflowLanguage>('powershell')
  const [customCommand, setCustomCommand] = useState('')
  const [content, setContent] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setTitle(initialData?.title ?? '')
    setLanguage(initialData?.language ?? 'powershell')
    setCustomCommand(initialData?.customCommand ?? '')
    setContent(initialData?.content ?? '')
    setErrorMessage('')
  }, [initialData])

  const lineNumbers = useMemo(() => {
    const totalLines = Math.max(content.split('\n').length, 1)
    return Array.from({ length: totalLines }, (_, index) => index + 1)
  }, [content])

  const editorLineHeight = 24
  const editorVerticalPadding = 24
  const editorMinHeight = 280
  const editorHeight = useMemo(() => {
    const contentHeight = lineNumbers.length * editorLineHeight + editorVerticalPadding
    return Math.max(contentHeight, editorMinHeight)
  }, [lineNumbers.length])

  const isCustomLanguage = language === 'custom'
  const isDisabled =
    !title.trim() || !content.trim() || (isCustomLanguage && !customCommand.trim())

  const handleSave = (): void => {
    if (!title.trim()) {
      setErrorMessage('Workflow title is required.')
      return
    }

    if (!content.trim()) {
      setErrorMessage('Workflow content is required.')
      return
    }

    if (isCustomLanguage && !customCommand.trim()) {
      setErrorMessage('Custom command is required when language is Custom.')
      return
    }

    setErrorMessage('')
    onSave({
      id: initialData?.id,
      title: title.trim(),
      language,
      customCommand: isCustomLanguage ? customCommand.trim() : '',
      content
    })
  }

  return (
    <ModalOverlay onClose={onCancel} contentClassName="max-w-3xl">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.55)]">
        <h3 className="text-lg font-semibold text-neutral-100">
          {initialData ? 'Edit Workflow' : 'Add Workflow'}
        </h3>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <div>
            <label
              htmlFor="workflow-title"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400"
            >
              Title
            </label>
            <input
              id="workflow-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Build preview and open logs"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="workflow-language"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400"
            >
              Language
            </label>
            <select
              id="workflow-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as WorkflowLanguage)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isCustomLanguage ? (
          <div className="mt-3">
            <label
              htmlFor="workflow-custom-command"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400"
            >
              Custom Run Command
            </label>
            <input
              id="workflow-custom-command"
              type="text"
              value={customCommand}
              onChange={(event) => setCustomCommand(event.target.value)}
              placeholder="e.g. cargo run"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-700 bg-[#1e1e1e]">
          <div className="flex max-h-[360px] min-h-[280px] overflow-auto">
            <div className="select-none border-r border-neutral-800/80 bg-[#252526] px-3 py-3 text-right font-mono text-xs leading-6 text-neutral-500">
              {lineNumbers.map((lineNumber) => (
                <div key={lineNumber}>{lineNumber}</div>
              ))}
            </div>

            <Editor
              value={content}
              onValueChange={(value) => setContent(value)}
              highlight={(code) => highlightCode(code, language)}
              padding={12}
              className="min-w-full w-max shrink-0 font-mono text-sm leading-6 text-neutral-100 focus:outline-none"
              style={{
                background: '#1e1e1e',
                minHeight: editorHeight,
                overflow: 'visible',
                whiteSpace: 'pre'
              }}
              textareaClassName="focus:outline-none !whitespace-pre !break-normal"
              preClassName="!whitespace-pre !break-normal"
            />
          </div>
        </div>

        {errorMessage ? <p className="mt-3 text-xs text-red-300">{errorMessage}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleSave}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
