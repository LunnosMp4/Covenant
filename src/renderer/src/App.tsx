import { useState, useEffect, useMemo, useRef, useCallback, Children, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import ModulePopup, { type ActivePopup, type PopupItem } from './components/ModulePopup'
import TerminalView from './components/TerminalView'
import VoiceWaveform from './components/VoiceWaveform'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'
import { createId } from './utils/helpers'
import { DEFAULT_TERMINAL_FONT, normalizeTerminalFont } from './constants/terminalFonts'
import {
  DEFAULT_THEME_GRADIENT,
  getThemePalette,
  normalizeThemeGradient
} from './constants/theme'
import type { ButtonVisibility, ReasoningEffort } from '../../shared/config'
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_REASONING_EFFORT } from '../../shared/config'
import type { LauncherApp, LauncherAppTarget } from './types/launcher-app'
import type { Preprompt } from './types/preprompt'
import type { Task } from './types/task'
import type {
  Workflow,
  WorkflowExecutionState,
  WorkflowLogPayload,
  WorkflowStatusUpdatePayload
} from './types/workflow'

type ChatRole = 'user' | 'assistant' | 'system'

type InputImageContent = { type: 'input_image'; image_url: string }
type InputTextContent = { type: 'input_text'; text: string }
type InputContent = InputTextContent | InputImageContent

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  reasoning?: string
  reasoningTitle?: string
  steps?: ReasoningStep[]
  usage?: ChatUsage
  model?: string
  sources?: Source[]
  stopped?: boolean
  images?: { base64: string; fileName: string; mimeType: string }[]
}

interface ChatUsage {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

interface Source {
  title: string
  url: string
}

type ReasoningStep =
  | { type: 'reasoning'; text: string }
  | { type: 'web_search'; id: string; query: string; status: 'searching' | 'done'; sources: Source[] }

interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  systemPrompt?: string
}

interface SelectedSystemPrompt {
  id: string
  title: string
  content: string
}

interface ChatStreamEvent {
  id: string
  type: 'content' | 'reasoning' | 'done' | 'error'
    | 'reasoning-start' | 'reasoning-title' | 'reasoning-delta' | 'reasoning-end'
    | 'tool-start' | 'tool-query' | 'sources'
  delta?: string
  usage?: ChatUsage
  error?: string
  model?: string
  itemId?: string
  title?: string
  toolType?: string
  toolName?: string
  actionType?: string
  query?: string
  sources?: Source[]
  stopped?: boolean
}

type AppMode = 'ai' | 'terminal'

const MAX_WORKFLOW_LOG_LINES = 200
const MAX_CONVERSATION_TITLE_LENGTH = 48
const DEFAULT_CONVERSATION_TITLE = 'New chat'
const CHAT_SCROLL_HEIGHT = 300
const CHAT_ROLE_ORDER: ChatRole[] = ['system', 'user', 'assistant']

function splitWorkflowLogLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

function normalizeLauncherAppTargets(app: LauncherApp): LauncherAppTarget[] {
  if (Array.isArray(app.targets) && app.targets.length > 0) {
    return app.targets
  }

  const legacyPath = typeof app.path === 'string' ? app.path.trim() : ''
  if (!legacyPath) {
    return []
  }

  return [{ path: legacyPath, arguments: app.arguments ?? '' }]
}

function normalizePopupLaunchTargets(item: PopupItem): LauncherAppTarget[] {
  if (Array.isArray(item.appLaunchTargets) && item.appLaunchTargets.length > 0) {
    return item.appLaunchTargets
  }

  const legacyPath = typeof item.appPath === 'string' ? item.appPath.trim() : ''
  if (!legacyPath) {
    return []
  }

  return [{ path: legacyPath, arguments: item.launchArguments ?? '' }]
}

function formatTargetsSummary(targets: LauncherAppTarget[]): string {
  const count = targets.length
  if (count === 0) {
    return 'No apps'
  }

  return `${count} app${count === 1 ? '' : 's'}`
}

const CHAT_MODEL_PRICING: Record<
  string,
  {
    inputPerMillion: number
    cachedInputPerMillion: number
    outputPerMillion: number
  }
> = {
  'gpt-5.6-luna': {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.2
  },
  'gpt-5.6-terra': {
    inputPerMillion: 2.00,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 12
  }
}

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(tokens)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount)
}

function formatConversationTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${monthDay}, ${time}`
}

function formatUsageSummary(message: ChatMessage): string | undefined {
  const usage = message.usage
  if (!usage) {
    return undefined
  }

  const promptTokens = usage.promptTokens ?? 0
  const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
  const completionTokens = usage.completionTokens ?? 0
  const pricing = message.model ? CHAT_MODEL_PRICING[message.model.trim()] : undefined

  const inputTokens = promptTokens - cachedPromptTokens
  const inputCost = pricing ? (inputTokens * pricing.inputPerMillion) / 1_000_000 : 0
  const cachedInputCost = pricing ? (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000 : 0
  const outputCost = pricing ? (completionTokens * pricing.outputPerMillion) / 1_000_000 : 0
  const totalCost = inputCost + cachedInputCost + outputCost

  const parts = [
    `>${formatTokenCount(promptTokens)}tk`,
    `${formatTokenCount(completionTokens)}tk`
  ]

  if (pricing) {
    parts.push(formatCurrency(totalCost))
  } else {
    const totalTokens = usage.totalTokens ?? promptTokens + completionTokens
    parts.push(`${formatTokenCount(totalTokens)}tk`)
  }

  return parts.join(' · ')
}

function getFaviconUrl(url: string, size = 16): string {
  try {
    const parsed = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=${size}`
  } catch {
    return ''
  }
}

function formatSourceUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

function formatSourceDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function computeContextStats(
  messages: ChatMessage[],
  currentModel: string
): { totalTokens: number; maxTokens: number; totalCost: number; messageCount: number; totalInputTokens: number; totalOutputTokens: number } {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0
  let totalCost = 0

  for (const msg of messages) {
    const usage = msg.usage
    if (!usage) continue

    const promptTokens = usage.promptTokens ?? 0
    const cachedPromptTokens = Math.min(usage.cachedPromptTokens ?? 0, promptTokens)
    const completionTokens = usage.completionTokens ?? 0

    totalInputTokens += promptTokens
    totalOutputTokens += completionTokens
    totalTokens += usage.totalTokens ?? promptTokens + completionTokens

    const pricing = msg.model ? CHAT_MODEL_PRICING[msg.model.trim()] : undefined
    if (pricing) {
      const inputTokens = promptTokens - cachedPromptTokens
      const inputCost = (inputTokens * pricing.inputPerMillion) / 1_000_000
      const cachedInputCost = (cachedPromptTokens * pricing.cachedInputPerMillion) / 1_000_000
      const outputCost = (completionTokens * pricing.outputPerMillion) / 1_000_000
      totalCost += inputCost + cachedInputCost + outputCost
    }
  }

  const maxTokens = CHAT_MODEL_OPTIONS.find((m) => m.id === currentModel)?.maxContextTokens ?? 0

  return {
    totalTokens,
    maxTokens,
    totalCost,
    messageCount: messages.length,
    totalInputTokens,
    totalOutputTokens
  }
}

function SendIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function GridIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function CodeIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.2354 7.14709C14.3167 6.74092 14.0533 6.3458 13.6471 6.26456C13.2409 6.18333 12.8458 6.44674 12.7646 6.85291L14.2354 7.14709ZM10.7646 16.8529C10.6833 17.2591 10.9467 17.6542 11.3529 17.7354C11.7591 17.8167 12.1542 17.5533 12.2354 17.1471L10.7646 16.8529ZM7.97342 15.4921C8.26837 15.7829 8.74323 15.7795 9.03406 15.4846C9.32488 15.1896 9.32153 14.7148 9.02658 14.4239L7.97342 15.4921ZM5.5 12L4.97342 11.4659C4.83048 11.6069 4.75 11.7993 4.75 12C4.75 12.2007 4.83048 12.3931 4.97342 12.5341L5.5 12ZM9.02658 9.57606C9.32153 9.28523 9.32488 8.81037 9.03406 8.51542C8.74323 8.22047 8.26837 8.21712 7.97342 8.50794L9.02658 9.57606ZM15.9773 14.3782C15.6802 14.6669 15.6735 15.1417 15.9622 15.4387C16.2509 15.7358 16.7257 15.7425 17.0227 15.4538L15.9773 14.3782ZM19.5 12L20.0227 12.5378C20.1667 12.3979 20.2486 12.2061 20.25 12.0053C20.2514 11.8046 20.1723 11.6116 20.0303 11.4697L19.5 12ZM17.0303 8.46967C16.7374 8.17678 16.2626 8.17678 15.9697 8.46967C15.6768 8.76256 15.6768 9.23744 15.9697 9.53033L17.0303 8.46967ZM12.7646 6.85291L10.7646 16.8529L12.2354 17.1471L14.2354 7.14709L12.7646 6.85291ZM9.02658 14.4239L6.02658 11.4659L4.97342 12.5341L7.97342 15.4921L9.02658 14.4239ZM6.02658 12.5341L9.02658 9.57606L7.97342 8.50794L4.97342 11.4659L6.02658 12.5341ZM17.0227 15.4538L20.0227 12.5378L18.9773 11.4622L15.9773 14.3782L17.0227 15.4538ZM20.0303 11.4697L17.0303 8.46967L15.9697 9.53033L18.9697 12.5303L20.0303 11.4697Z"/>
    </svg>
  )
}

function TasksIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
      <path d="m16 16 2 2 4-4" />
    </svg>
  )
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" className="opacity-30" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

function SettingsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 6.5H16" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 6.5H2" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 10C11.933 10 13.5 8.433 13.5 6.5C13.5 4.567 11.933 3 10 3C8.067 3 6.5 4.567 6.5 6.5C6.5 8.433 8.067 10 10 10Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 17.5H18" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 17.5H2" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 21C15.933 21 17.5 19.433 17.5 17.5C17.5 15.567 15.933 14 14 14C12.067 14 10.5 15.567 10.5 17.5C10.5 19.433 12.067 21 14 21Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  )
}

function MenuIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function ExpandIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function PinIcon({ active }: { active: boolean }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z" />
    </svg>
  )
}

function MicIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function ImageIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function XIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ChevronUpIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

interface AttachedImage {
  id: string
  base64: string
  fileName: string
  mimeType: string
}

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_ATTACHED_IMAGES = 10

function createConversationTitle(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return DEFAULT_CONVERSATION_TITLE
  const firstLine = trimmed.split('\n')[0] || trimmed
  if (firstLine.length <= MAX_CONVERSATION_TITLE_LENGTH) return firstLine
  return `${firstLine.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`
}

function createSelectedSystemPrompt(preprompt: Preprompt): SelectedSystemPrompt {
  return {
    id: preprompt.id,
    title: preprompt.title,
    content: preprompt.content
  }
}

function createCustomSystemPromptSelection(conversationId: string, content: string): SelectedSystemPrompt {
  return {
    id: `conversation-${conversationId}`,
    title: 'Custom system prompt',
    content
  }
}

function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function normalizeMessageOrder(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return CHAT_ROLE_ORDER.indexOf(a.role) - CHAT_ROLE_ORDER.indexOf(b.role)
  })
}

interface SearchMatch {
  conversationId: string
  conversationTitle: string
  messageId: string
  role: ChatRole
  snippet: string
  count: number
}

interface SearchGroup {
  conversationId: string
  conversationTitle: string
  matches: SearchMatch[]
}

function getMessageSearchText(message: ChatMessage): string {
  const parts = [message.content]
  if (message.reasoning?.trim()) {
    parts.push(message.reasoning.trim())
  }
  return parts.join('\n')
}

function countOccurrences(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let count = 0
  let index = lowerText.indexOf(lowerQuery)
  while (index !== -1) {
    count += 1
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length)
  }
  return count
}

function buildSearchSnippet(text: string, query: string, maxLength = 96): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) {
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  }

  const start = Math.max(0, index - 28)
  const end = Math.min(text.length, index + query.length + 28)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${prefix}${snippet}${suffix}`
}

function buildSearchMatches(
  conversations: ChatConversation[],
  activeConversation: ChatConversation | null,
  query: string
): SearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const allConversations = [...conversations]
  if (activeConversation && !allConversations.some((item) => item.id === activeConversation.id)) {
    allConversations.unshift(activeConversation)
  }

  const matches: SearchMatch[] = []
  for (const conversation of allConversations) {
    for (const message of normalizeMessageOrder(conversation.messages)) {
      const text = getMessageSearchText(message)
      const count = countOccurrences(text, trimmed)
      if (count <= 0) continue

      matches.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title || DEFAULT_CONVERSATION_TITLE,
        messageId: message.id,
        role: message.role,
        snippet: buildSearchSnippet(text, trimmed),
        count
      })
    }
  }

  return matches
}

function getSearchHighlightRegistry(): { set(name: string, highlight: unknown): void; delete(name: string): void } | undefined {
  return (CSS as unknown as { highlights?: { set(name: string, highlight: unknown): void; delete(name: string): void } })
    .highlights
}

function clearSearchHighlight(): void {
  getSearchHighlightRegistry()?.delete('chat-search')
}

function applySearchHighlight(container: HTMLElement, query: string): void {
  const registry = getSearchHighlightRegistry()
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight

  if (!registry || !HighlightCtor) {
    clearSearchHighlight()
    return
  }

  const lowerQuery = query.toLowerCase()
  const ranges: Range[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const value = node.nodeValue ?? ''
    if (value) {
      const lowerValue = value.toLowerCase()
      let index = lowerValue.indexOf(lowerQuery)
      while (index !== -1) {
        try {
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + lowerQuery.length)
          ranges.push(range)
        } catch {
          break
        }
        index = lowerValue.indexOf(lowerQuery, index + lowerQuery.length)
      }
    }
    node = walker.nextNode()
  }

  if (ranges.length === 0) {
    registry.delete('chat-search')
    return
  }

  registry.set('chat-search', new HighlightCtor(...ranges))
}

function preprocessLatexDelimiters(content: string): string {
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

function TerminalSendIcon(): JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function CopyIcon(): JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function WebSearchStepRow({ step }: { step: Extract<ReasoningStep, { type: 'web_search' }> }): JSX.Element {
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

function CopyButton({ text, className }: { text: string; className?: string }): JSX.Element {
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

function CodeBlock({
  language,
  code,
  ...props
}: { language: string | undefined; code: string } & React.HTMLAttributes<HTMLPreElement>): JSX.Element {
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

function AssistantMarkdown({ content }: { content: string }): JSX.Element {
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
        code({ inline, className, children, ...props }) {
          if (inline) {
            return (
              <code className="chat-code-inline" {...props}>
                {children}
              </code>
            )
          }

          return (
            <code className={className} {...props}>
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

export default function App(): JSX.Element {
  const [visible, setVisible] = useState(false)
  // Tracks whether the window is truly visible to the user (including after the
  // exit animation has finished). When false, heavy components are fully
  // unmounted from the React DOM so they release their memory.
  const [isAppVisible, setIsAppVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<SelectedSystemPrompt | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mode, setMode] = useState<AppMode>('ai')
  const [hasInitializedTerminal, setHasInitializedTerminal] = useState(false)
  const [themeGradient, setThemeGradient] = useState<string>(DEFAULT_THEME_GRADIENT)
  const [terminalFont, setTerminalFont] = useState<string>(DEFAULT_TERMINAL_FONT)
  const [thinkingOpenById, setThinkingOpenById] = useState<Record<string, boolean>>({})
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [activeStreamMessageId, setActiveStreamMessageId] = useState<string | null>(null)
  const [activeStreamConversationId, setActiveStreamConversationId] = useState<string | null>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [preprompts, setPreprompts] = useState<Preprompt[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [workflowExecutionById, setWorkflowExecutionById] = useState<
    Record<string, WorkflowExecutionState>
  >({})
  const [workflowLogsOpenById, setWorkflowLogsOpenById] = useState<Record<string, boolean>>({})
  const [activePopup, setActivePopup] = useState<ActivePopup | null>(null)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [showImagePanel, setShowImagePanel] = useState(false)
  const [buttonVisibility, setButtonVisibility] = useState<ButtonVisibility>({ appLauncher: true, workflow: true, tasks: true })
  const [chatModel, setChatModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [autoCollapseReasoning, setAutoCollapseReasoning] = useState(true)
  const [isPinned, setIsPinned] = useState(false)
  const [sourcesPanelMessageId, setSourcesPanelMessageId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0)
  const [deletingConversation, setDeletingConversation] = useState<ChatConversation | null>(null)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle')
  const micStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const inputRef = useRef<HTMLDivElement>(null)
  const pasteBlocksRef = useRef<Map<string, string>>(new Map())
  const isComposingRef = useRef(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const moduleButtonsRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const imageButtonRef = useRef<HTMLButtonElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const successResetTimersRef = useRef<Record<string, number>>({})
  const activeConversationRef = useRef<ChatConversation | null>(null)
  const streamBufferRef = useRef<{ content: string; reasoning: string } | null>(null)
  const activeStreamIdRef = useRef<string | null>(null)
  const activeStreamMessageIdRef = useRef<string | null>(null)
  const activeStreamConversationIdRef = useRef<string | null>(null)
  const reasoningAutoCloseTimersRef = useRef<Record<string, number>>({})
  const autoCollapseReasoningRef = useRef(autoCollapseReasoning)
  // Ref for the hide-delay timer so it can be cancelled on rapid show/hide.
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getFullPrompt(): string {
    const div = inputRef.current
    if (!div) return ''
    let result = ''
    for (const node of div.childNodes) {
      if (node instanceof HTMLElement && node.hasAttribute('data-paste-id')) {
        const id = node.getAttribute('data-paste-id')!
        result += pasteBlocksRef.current.get(id) ?? node.textContent ?? ''
      } else {
        result += node.textContent ?? ''
      }
    }
    return result
  }

  function clearInput(): void {
    const div = inputRef.current
    if (div) {
      div.textContent = ''
    }
    pasteBlocksRef.current.clear()
    setAttachedImages([])
    setShowImagePanel(false)
    setQuery('')
  }

  useEffect(() => {
    let isMounted = true

    const loadInitialTheme = async (): Promise<void> => {
      if (!window.api?.config.getConfig) return

      try {
        const config = await window.api.config.getConfig()
        if (isMounted) {
          setThemeGradient(normalizeThemeGradient(config.themeGradient))
          setTerminalFont(normalizeTerminalFont(config.terminalFont))
          if (config.buttonVisibility) {
            setButtonVisibility(config.buttonVisibility)
          }
          if (config.chatModel) {
            setChatModel(config.chatModel)
          }
          if (config.reasoningEffort) {
            setReasoningEffort(config.reasoningEffort)
          }
          if (typeof config.enableWebSearch === 'boolean') {
            setEnableWebSearch(config.enableWebSearch)
          }
          if (typeof config.autoCollapseReasoning === 'boolean') {
            setAutoCollapseReasoning(config.autoCollapseReasoning)
          }
        }
      } catch {
        if (isMounted) {
          setThemeGradient(DEFAULT_THEME_GRADIENT)
          setTerminalFont(DEFAULT_TERMINAL_FONT)
        }
      }
    }

    void loadInitialTheme()

    const unsubscribeThemeListener = window.api?.config.onThemeUpdated?.((newGradientClass) => {
      setThemeGradient(normalizeThemeGradient(newGradientClass))
    })

    const unsubscribeTerminalFontListener = window.api?.config.onTerminalFontUpdated?.((newTerminalFont) => {
      setTerminalFont(normalizeTerminalFont(newTerminalFont))
    })

    const unsubscribeButtonVisibilityListener = window.api?.config.onButtonVisibilityUpdated?.((newButtonVisibility) => {
      setButtonVisibility(newButtonVisibility)
    })

    const unsubscribeChatModelListener = window.api?.config.onChatModelUpdated?.((newChatModel) => {
      setChatModel(newChatModel)
    })

    const unsubscribeReasoningEffortListener = window.api?.config.onReasoningEffortUpdated?.((newReasoningEffort) => {
      setReasoningEffort(newReasoningEffort)
    })

    const unsubscribeWebSearchListener = window.api?.config.onWebSearchUpdated?.((newWebSearch) => {
      setEnableWebSearch(newWebSearch)
    })

    const unsubscribeAutoCollapseReasoningListener = window.api?.config.onAutoCollapseReasoningUpdated?.((newAutoCollapse) => {
      setAutoCollapseReasoning(newAutoCollapse)
    })

    return () => {
      isMounted = false
      if (typeof unsubscribeThemeListener === 'function') {
        unsubscribeThemeListener()
      }
      if (typeof unsubscribeTerminalFontListener === 'function') {
        unsubscribeTerminalFontListener()
      }
      if (typeof unsubscribeButtonVisibilityListener === 'function') {
        unsubscribeButtonVisibilityListener()
      }
      if (typeof unsubscribeChatModelListener === 'function') {
        unsubscribeChatModelListener()
      }
      if (typeof unsubscribeReasoningEffortListener === 'function') {
        unsubscribeReasoningEffortListener()
      }
      if (typeof unsubscribeWebSearchListener === 'function') {
        unsubscribeWebSearchListener()
      }
      if (typeof unsubscribeAutoCollapseReasoningListener === 'function') {
        unsubscribeAutoCollapseReasoningListener()
      }
    }
  }, [])

  useEffect(() => {
    if (window.api?.window.onToggleVisibility) {
      // IMPORTANT: capture the returned cleanup function to prevent an IPC
      // listener leak — each call to onToggleVisibility registers a new
      // ipcRenderer listener that must be removed when this effect tears down.
      const unsubscribe = window.api.window.onToggleVisibility((v, terminalMode) => {
        if (v) {
          // Cancel any pending hide timer so rapid show/hide doesn't race.
          if (hideDelayTimerRef.current !== null) {
            clearTimeout(hideDelayTimerRef.current)
            hideDelayTimerRef.current = null
          }
          setIsAppVisible(true)
          setVisible(true)

          if (terminalMode) {
            setHasInitializedTerminal(true)
            setMode('terminal')
            setActivePopup(null)
          }
        } else {
          setVisible(false)
          setIsPinned(false)
          window.api?.window.setPinned?.(false)
          // Wait for the exit animation (~250 ms) before resetting state and
          // unmounting heavy components to free memory.
          hideDelayTimerRef.current = setTimeout(() => {
            hideDelayTimerRef.current = null
            clearInput()
            setIsExpanded(false)
            setIsLoading(false)
            setIsChatOpen(false)
            setIsHistoryOpen(false)
            setMode('ai')
            setActivePopup(null)
            // isAppVisible is set to false via AnimatePresence onExitComplete,
            // which fires once the spring exit animation fully completes.
          }, 300)
        }
      })

      return () => {
        unsubscribe()
        if (hideDelayTimerRef.current !== null) {
          clearTimeout(hideDelayTimerRef.current)
          hideDelayTimerRef.current = null
        }
      }
    } else {
      // Dev/browser fallback — always visible.
      setVisible(true)
      setIsAppVisible(true)
      return undefined
    }
  }, [])

  useEffect(() => {
    if (!window.api?.window.onOpenTasks) return

    const unsubscribe = window.api.window.onOpenTasks(() => {
      setMode('ai')
      setActivePopup('tasks')
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!visible || mode !== 'ai') {
      return
    }

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus()
    }, 80)

    return () => {
      clearTimeout(focusTimer)
    }
  }, [visible, mode])

  const toggleMode = useCallback(() => {
    setMode((currentMode) => {
      const nextMode: AppMode = currentMode === 'ai' ? 'terminal' : 'ai'
      if (nextMode === 'terminal') {
        setHasInitializedTerminal(true)
      }

      return nextMode
    })

    setActivePopup(null)
  }, [])

  const switchToAiMode = useCallback(() => {
    setMode('ai')
    setActivePopup(null)
  }, [])

  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev
      window.api?.window.setPinned?.(next)
      return next
    })
  }, [])

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      window.api?.window.setExpanded?.(next)
      return next
    })
  }, [])

  const handleClose = useCallback(() => {
    setActivePopup(null)
    setMode('ai')
    setVisible(false)
    setIsPinned(false)
    window.api?.window.setPinned?.(false)
    setTimeout(() => {
      clearInput()
      setIsExpanded(false)
      setIsLoading(false)
      setIsChatOpen(false)
      setIsHistoryOpen(false)
      window.api?.window.hideWindow()
    }, 240)
  }, [])

  const loadPreprompts = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getPreprompts) {
      setPreprompts([])
      return
    }

    try {
      const savedPreprompts = await window.api.store.getPreprompts()
      setPreprompts(savedPreprompts)
    } catch {
      setPreprompts([])
    }
  }, [])

  const loadApps = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getApps) {
      setApps([])
      return
    }

    try {
      const savedApps = await window.api.store.getApps()
      setApps(savedApps)
    } catch {
      setApps([])
    }
  }, [])

  const loadWorkflows = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getWorkflows) {
      setWorkflows([])
      return
    }

    try {
      const savedWorkflows = await window.api.store.getWorkflows()
      setWorkflows(savedWorkflows)
    } catch {
      setWorkflows([])
    }
  }, [])

  const loadTasks = useCallback(async (): Promise<void> => {
    if (!window.api?.store.getTasks) {
      setTasks([])
      return
    }

    try {
      const savedTasks = await window.api.store.getTasks()
      setTasks(savedTasks)
    } catch {
      setTasks([])
    }
  }, [])

  const handleAddTask = useCallback(async (title: string): Promise<void> => {
    if (!window.api?.store.addTask) return
    try {
      setTasks(await window.api.store.addTask(title))
    } catch {
      // ignore
    }
  }, [])

  const handleToggleTask = useCallback(async (id: string): Promise<void> => {
    if (!window.api?.store.toggleTask) return
    try {
      setTasks(await window.api.store.toggleTask(id))
    } catch {
      // ignore
    }
  }, [])

  const handleDeleteTask = useCallback(async (id: string): Promise<void> => {
    if (!window.api?.store.deleteTask) return
    try {
      setTasks(await window.api.store.deleteTask(id))
    } catch {
      // ignore
    }
  }, [])

  const handleClearCompletedTasks = useCallback(async (): Promise<void> => {
    if (!window.api?.store.clearCompletedTasks) return
    try {
      setTasks(await window.api.store.clearCompletedTasks())
    } catch {
      // ignore
    }
  }, [])

  const loadConversations = useCallback(async (): Promise<void> => {
    if (!window.api?.chat.getConversations) {
      setConversations([])
      return
    }

    try {
      const savedConversations = await window.api.chat.getConversations()
      setConversations(sortConversations(savedConversations))
    } catch {
      setConversations([])
    }
  }, [])

  const upsertConversation = useCallback((conversation: ChatConversation): void => {
    setConversations((previous) => {
      const filtered = previous.filter((item) => item.id !== conversation.id)
      return sortConversations([conversation, ...filtered])
    })
  }, [])

  const persistConversation = useCallback((conversation: ChatConversation): void => {
    if (!window.api?.chat.saveConversation) return

    void window.api.chat
      .saveConversation(conversation)
      .then((nextConversations) => {
        setConversations(sortConversations(nextConversations))
      })
      .catch(() => {})
  }, [])

  const generateConversationTitleAsync = useCallback(
    (conversationId: string, prompt: string): void => {
      if (!window.api?.chat.generateConversationTitle) return

      void window.api.chat
        .generateConversationTitle(prompt)
        .then((rawTitle) => {
          const safeTitle =
            typeof rawTitle === 'string' ? rawTitle.trim().slice(0, MAX_CONVERSATION_TITLE_LENGTH) : ''
          if (!safeTitle) return

          setConversations((previous) =>
            previous.map((conversation) =>
              conversation.id === conversationId ? { ...conversation, title: safeTitle } : conversation
            )
          )

          const currentConversation = activeConversationRef.current
          if (currentConversation && currentConversation.id === conversationId) {
            const updatedConversation = { ...currentConversation, title: safeTitle }
            setActiveConversation(updatedConversation)
            persistConversation(updatedConversation)
          }
        })
        .catch(() => {
          // Keep the fallback title when generation fails.
        })
    },
    [persistConversation]
  )

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  useEffect(() => {
    activeStreamIdRef.current = activeStreamId
    activeStreamMessageIdRef.current = activeStreamMessageId
    activeStreamConversationIdRef.current = activeStreamConversationId
  }, [activeStreamId, activeStreamMessageId, activeStreamConversationId])

  useEffect(() => {
    autoCollapseReasoningRef.current = autoCollapseReasoning
  }, [autoCollapseReasoning])

  useEffect(() => {
    if (!isChatOpen) return
    setAutoScrollEnabled(true)
  }, [isChatOpen, activeConversation?.id])

  useEffect(() => {
    if (!isChatOpen || !autoScrollEnabled) return

    const scrollTimer = window.setTimeout(() => {
      if (!chatScrollRef.current) return
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }, 40)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [isChatOpen, activeConversation, isLoading, autoScrollEnabled])

  const handleChatScroll = useCallback(() => {
    const scrollElement = chatScrollRef.current
    if (!scrollElement) return

    const threshold = 24
    const atBottom =
      scrollElement.scrollTop + scrollElement.clientHeight >=
      scrollElement.scrollHeight - threshold

    setAutoScrollEnabled((previous) => (previous === atBottom ? previous : atBottom))
  }, [])

  useEffect(() => {
    if (!isHistoryOpen) return

    const handleClickOutsideHistory = (event: MouseEvent) => {
      const target = event.target as Node
      if (historyMenuRef.current?.contains(target)) return
      if (historyButtonRef.current?.contains(target)) return
      setIsHistoryOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutsideHistory)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideHistory)
    }
  }, [isHistoryOpen])

  useEffect(() => {
    if (activePopup === 'settings') {
      void loadPreprompts()
      return
    }

    if (activePopup === 'appLauncher') {
      void loadApps()
      return
    }

    if (activePopup === 'workflow') {
      void loadWorkflows()
      return
    }

    if (activePopup === 'tasks') {
      void loadTasks()
    }
  }, [activePopup, loadApps, loadPreprompts, loadTasks, loadWorkflows])

  useEffect(() => {
    if (!activeConversation) {
      return
    }

    const systemPrompt = activeConversation.systemPrompt?.trim() ?? ''
    if (!systemPrompt) {
      setSelectedSystemPrompt(null)
      return
    }

    const matchingPreprompt = preprompts.find((item) => item.content.trim() === systemPrompt)
    setSelectedSystemPrompt(
      matchingPreprompt
        ? createSelectedSystemPrompt(matchingPreprompt)
        : createCustomSystemPromptSelection(activeConversation.id, systemPrompt)
    )
  }, [activeConversation, preprompts])

  const togglePopup = useCallback(
    (popup: ActivePopup) => {
      if (mode !== 'ai') {
        return
      }

      setActivePopup((current) => (current === popup ? null : popup))
    },
    [mode]
  )

  useEffect(() => {
    if (!activePopup) return

    const handleClickOutsidePopup = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedInsidePopup = popupRef.current?.contains(target)
      const clickedInsideModuleButtons = moduleButtonsRef.current?.contains(target)
      const clickedInsideSettingsButton = settingsButtonRef.current?.contains(target)

      if (!clickedInsidePopup && !clickedInsideModuleButtons && !clickedInsideSettingsButton) {
        setActivePopup(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutsidePopup)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsidePopup)
    }
  }, [activePopup])

  useEffect(() => {
    if (!showImagePanel) return

    const handleClickOutsideImagePanel = (event: MouseEvent) => {
      const target = event.target as Node
      if (imagePanelRef.current?.contains(target)) return
      if (imageButtonRef.current?.contains(target)) return
      setShowImagePanel(false)
    }

    document.addEventListener('mousedown', handleClickOutsideImagePanel)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideImagePanel)
    }
  }, [showImagePanel])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showImagePanel) {
          event.preventDefault()
          setShowImagePanel(false)
          return
        }
        if (activePopup) {
          event.preventDefault()
          setActivePopup(null)
        }
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [activePopup, showImagePanel])

  useEffect(() => {
    const clearSuccessTimer = (workflowId: string): void => {
      const timeoutId = successResetTimersRef.current[workflowId]
      if (!timeoutId) return

      window.clearTimeout(timeoutId)
      delete successResetTimersRef.current[workflowId]
    }

    const statusUnsubscribe = window.api?.onWorkflowStatusUpdate?.(
      (payload: WorkflowStatusUpdatePayload) => {
        const workflowId = payload.id?.trim()
        if (!workflowId) return

        clearSuccessTimer(workflowId)

        setWorkflowExecutionById((previous) => {
          const existingState = previous[workflowId] ?? {
            status: 'idle',
            logs: []
          }

          return {
            ...previous,
            [workflowId]: {
              status: payload.status,
              logs: payload.status === 'running' ? [] : existingState.logs
            }
          }
        })

        if (payload.status === 'success') {
          successResetTimersRef.current[workflowId] = window.setTimeout(() => {
            setWorkflowExecutionById((previous) => {
              const existingState = previous[workflowId]
              if (!existingState || existingState.status !== 'success') {
                return previous
              }

              return {
                ...previous,
                [workflowId]: {
                  ...existingState,
                  status: 'idle'
                }
              }
            })

            setWorkflowLogsOpenById((previous) => {
              if (!previous[workflowId]) return previous

              return {
                ...previous,
                [workflowId]: false
              }
            })

            delete successResetTimersRef.current[workflowId]
          }, 3000)
        }
      }
    )

    const logUnsubscribe = window.api?.onWorkflowLog?.((payload: WorkflowLogPayload) => {
      const workflowId = payload.id?.trim()
      if (!workflowId) return

      const nextLines = splitWorkflowLogLines(payload.text).map(
        (line) => `[${payload.type.toUpperCase()}] ${line}`
      )

      if (nextLines.length === 0) return

      setWorkflowExecutionById((previous) => {
        const existingState = previous[workflowId] ?? {
          status: 'idle',
          logs: []
        }

        return {
          ...previous,
          [workflowId]: {
            ...existingState,
            logs: [...existingState.logs, ...nextLines].slice(-MAX_WORKFLOW_LOG_LINES)
          }
        }
      })
    })

    return () => {
      if (typeof statusUnsubscribe === 'function') {
        statusUnsubscribe()
      }

      if (typeof logUnsubscribe === 'function') {
        logUnsubscribe()
      }

      Object.values(successResetTimersRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      successResetTimersRef.current = {}
    }
  }, [])

  const handleToggleWorkflowLogs = useCallback((workflowId: string): void => {
    setWorkflowLogsOpenById((previous) => ({
      ...previous,
      [workflowId]: !previous[workflowId]
    }))
  }, [])

  const updateConversationMessage = useCallback(
    (conversationId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setActiveConversation((current) => {
        if (!current || current.id !== conversationId) return current

        const nextMessages = current.messages.map((message) =>
          message.id === messageId ? updater(message) : message
        )

        return {
          ...current,
          messages: normalizeMessageOrder(nextMessages)
        }
      })
    },
    []
  )

  useEffect(() => {
    if (!window.api?.chat.onStreamEvent) {
      return
    }

    const unsubscribe = window.api.chat.onStreamEvent((event: ChatStreamEvent) => {
      const streamId = activeStreamIdRef.current
      if (!streamId || event.id !== streamId) return

      const conversationId = activeStreamConversationIdRef.current
      const messageId = activeStreamMessageIdRef.current
      if (!conversationId || !messageId) return

      if (event.type === 'content' && event.delta) {
        streamBufferRef.current = {
          content: `${streamBufferRef.current?.content ?? ''}${event.delta}`,
          reasoning: streamBufferRef.current?.reasoning ?? ''
        }

        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          content: `${message.content}${event.delta}`
        }))
        return
      }

      if (event.type === 'reasoning-start') {
        setThinkingOpenById((previous) => ({
          ...previous,
          [messageId]: true
        }))
        return
      }

      if (event.type === 'reasoning-title' && event.title) {
        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          reasoningTitle: event.title
        }))
        return
      }

      if (event.type === 'reasoning-delta' && event.delta) {
        const delta = event.delta
        streamBufferRef.current = {
          content: streamBufferRef.current?.content ?? '',
          reasoning: `${streamBufferRef.current?.reasoning ?? ''}${delta}`
        }

        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          const last = steps[steps.length - 1]
          const nextSteps: ReasoningStep[] =
            last && last.type === 'reasoning'
              ? [...steps.slice(0, -1), { type: 'reasoning', text: last.text + delta }]
              : [...steps, { type: 'reasoning', text: delta }]
          return {
            ...message,
            reasoning: `${message.reasoning ?? ''}${delta}`,
            steps: nextSteps
          }
        })
        return
      }

      if (event.type === 'reasoning-end') {
        return
      }

      if (event.type === 'sources' && event.sources && event.sources.length > 0) {
        const sources = event.sources
        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          let targetIndex = -1
          if (event.itemId) {
            targetIndex = steps.findIndex(
              (step) => step.type === 'web_search' && step.id === event.itemId
            )
          }
          if (targetIndex === -1) {
            for (let i = steps.length - 1; i >= 0; i -= 1) {
              const step = steps[i]
              if (step.type === 'web_search' && step.status === 'searching') {
                targetIndex = i
                break
              }
            }
          }
          const nextSteps =
            targetIndex === -1
              ? steps
              : steps.map((step, index) => {
                  if (index !== targetIndex || step.type !== 'web_search') return step
                  return { ...step, status: 'done' as const, sources }
                })
          return { ...message, sources, steps: nextSteps }
        })
        return
      }

      if (event.type === 'tool-start') {
        if (event.toolType === 'web_search') {
          updateConversationMessage(conversationId, messageId, (message) => ({
            ...message,
            steps: [
              ...(message.steps ?? []),
              {
                type: 'web_search',
                id: event.itemId ?? createId('search_'),
                query: event.query ?? '',
                status: 'searching',
                sources: []
              }
            ]
          }))
        }
        return
      }

      if (event.type === 'tool-query') {
        const query = event.query
        if (!event.itemId || !query) return
        updateConversationMessage(conversationId, messageId, (message) => {
          const steps = message.steps ?? []
          const nextSteps = steps.map((step) => {
            if (step.type !== 'web_search' || step.id !== event.itemId) return step
            if (step.query) return step
            return { ...step, query }
          })
          return { ...message, steps: nextSteps }
        })
        return
      }

      if (event.type === 'error') {
        updateConversationMessage(conversationId, messageId, (message) => ({
          ...message,
          content: `Error: ${event.error ?? 'Unable to fetch AI response.'}`
        }))
        setIsLoading(false)
        setActiveStreamId(null)
        setActiveStreamMessageId(null)
        setActiveStreamConversationId(null)
        setThinkingOpenById((previous) => ({
          ...previous,
          [messageId]: false
        }))
        streamBufferRef.current = null
        return
      }

      if (event.type === 'done') {
        const currentConversation = activeConversationRef.current
        if (!currentConversation || currentConversation.id !== conversationId) {
          setIsLoading(false)
          setActiveStreamId(null)
          setActiveStreamMessageId(null)
          setActiveStreamConversationId(null)
          streamBufferRef.current = null
          return
        }

        const updatedMessages = normalizeMessageOrder(
          currentConversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: streamBufferRef.current?.content ?? message.content,
                  usage: event.usage,
                  reasoning: streamBufferRef.current?.reasoning ?? message.reasoning,
                  model: event.model ?? message.model,
                  stopped: event.stopped ?? message.stopped,
                  steps: (message.steps ?? []).map((step) =>
                    step.type === 'web_search' && step.status === 'searching'
                      ? { ...step, status: 'done' as const }
                      : step
                  )
                }
              : message
          )
        )

        const updatedConversation: ChatConversation = {
          ...currentConversation,
          updatedAt: Date.now(),
          messages: updatedMessages
        }

        setActiveConversation(updatedConversation)
        upsertConversation(updatedConversation)
        persistConversation(updatedConversation)
        setIsLoading(false)
        setActiveStreamId(null)
        setActiveStreamMessageId(null)
        setActiveStreamConversationId(null)

        if (autoCollapseReasoningRef.current) {
          const timerId = window.setTimeout(() => {
            setThinkingOpenById((previous) => ({
              ...previous,
              [messageId]: false
            }))
          }, 900)
          reasoningAutoCloseTimersRef.current[messageId] = timerId
        }

        streamBufferRef.current = null
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    const streamId = activeStreamIdRef.current
    if (!streamId) return
    window.api?.chat.cancelStream?.(streamId)
  }, [])

  const handleSubmit = useCallback(async () => {
    const rawPrompt = getFullPrompt().trim()
    if (!rawPrompt || isLoading) return

    const now = Date.now()
    const activeSystemPrompt = selectedSystemPrompt?.content.trim() || activeConversation?.systemPrompt?.trim() || ''

    const shouldStartNewConversation = !isChatOpen
    let nextConversation = shouldStartNewConversation ? null : activeConversation
    if (!nextConversation) {
      const createdAt = now
      nextConversation = {
        id: createId('msg_'),
        title: createConversationTitle(rawPrompt),
        createdAt,
        updatedAt: createdAt,
        messages: [],
        systemPrompt: activeSystemPrompt || undefined
      }
      setActiveConversation(nextConversation)
      generateConversationTitleAsync(nextConversation.id, rawPrompt)
    }

    const userMessage: ChatMessage = {
      id: createId('msg_'),
      role: 'user',
      content: rawPrompt,
      createdAt: now,
      images: attachedImages.length > 0
        ? attachedImages.map(i => ({ base64: i.base64, fileName: i.fileName, mimeType: i.mimeType }))
        : undefined
    }

    const userConversation: ChatConversation = {
      ...nextConversation,
      updatedAt: now,
      messages: normalizeMessageOrder([...nextConversation.messages, userMessage]),
      systemPrompt: nextConversation.systemPrompt ?? (activeSystemPrompt || undefined)
    }

    setIsLoading(true)
    setIsChatOpen(true)
    setIsHistoryOpen(false)
    clearInput()
    setActiveConversation(userConversation)
    upsertConversation(userConversation)
    persistConversation(userConversation)

    let keepLoading = false

    try {
      if (!window.api?.chat.askCovenant) {
        throw new Error('OpenAI chat is only available in the Electron app.')
      }

      const requestMessages: Array<{ role: ChatRole; content: string | InputContent[] }> = [
        ...(userConversation.systemPrompt
          ? [{ role: 'system' as const, content: userConversation.systemPrompt }]
          : []),
        ...userConversation.messages.map((message) => ({
          role: message.role,
          content: message.images && message.images.length > 0
            ? [
                ...(message.content ? [{ type: 'input_text' as const, text: message.content }] : []),
                ...message.images.map(img => ({ type: 'input_image' as const, image_url: img.base64 }))
              ]
            : message.content
        }))
      ]

      const assistantMessageId = createId('msg_')
      const placeholderAssistant: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        reasoning: ''
      }

      const placeholderConversation: ChatConversation = {
        ...userConversation,
        updatedAt: Date.now(),
        messages: normalizeMessageOrder([...userConversation.messages, placeholderAssistant])
      }

      setActiveConversation(placeholderConversation)
      upsertConversation(placeholderConversation)
      streamBufferRef.current = { content: '', reasoning: '' }

      if (window.api.chat.askCovenantStream) {
        const streamResponse = await window.api.chat.askCovenantStream(requestMessages)
        setActiveStreamId(streamResponse.id)
        setActiveStreamMessageId(assistantMessageId)
        setActiveStreamConversationId(placeholderConversation.id)
        keepLoading = true
      } else {
        const response = await window.api.chat.askCovenant(requestMessages)
        const updatedConversation: ChatConversation = {
          ...placeholderConversation,
          updatedAt: Date.now(),
          messages: normalizeMessageOrder(
            placeholderConversation.messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: response,
                    model: chatModel
                  }
                : message
            )
          )
        }

        setActiveConversation(updatedConversation)
        upsertConversation(updatedConversation)
        persistConversation(updatedConversation)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch AI response.'
      const errorMessage: ChatMessage = {
        id: createId('msg_'),
        role: 'assistant',
        content: `Error: ${message}`,
        createdAt: Date.now()
      }

      const updatedConversation: ChatConversation = {
        ...userConversation,
        updatedAt: Date.now(),
        messages: normalizeMessageOrder([...userConversation.messages, errorMessage])
      }

      setActiveConversation(updatedConversation)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    } finally {
      if (!keepLoading) {
        setIsLoading(false)
        if (mode === 'ai') {
          inputRef.current?.focus()
        }
      }
    }
  }, [
    query,
    isLoading,
    mode,
    activeConversation,
    selectedSystemPrompt,
    upsertConversation,
    persistConversation,
    generateConversationTitleAsync,
    attachedImages
  ])

  const setCurrentSystemPrompt = useCallback(
    (selection: SelectedSystemPrompt | null) => {
      setSelectedSystemPrompt(selection)

      const currentConversation = activeConversationRef.current
      if (!currentConversation) {
        return
      }

      const updatedConversation: ChatConversation = {
        ...currentConversation,
        updatedAt: Date.now(),
        systemPrompt: selection?.content.trim() || undefined
      }

      setActiveConversation(updatedConversation)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    },
    [persistConversation, upsertConversation]
  )

  const clearCurrentSystemPrompt = useCallback(() => {
    setCurrentSystemPrompt(null)
  }, [setCurrentSystemPrompt])

  const appendAssistantMessage = useCallback(
    (content: string) => {
      const now = Date.now()
      const baseConversation =
        activeConversation ??
        ({
          id: createId('msg_'),
          title: DEFAULT_CONVERSATION_TITLE,
          createdAt: now,
          updatedAt: now,
          messages: [],
          systemPrompt: undefined
        } as ChatConversation)

      const assistantMessage: ChatMessage = {
        id: createId('msg_'),
        role: 'assistant',
        content,
        createdAt: now
      }

      const updatedConversation: ChatConversation = {
        ...baseConversation,
        updatedAt: now,
        messages: normalizeMessageOrder([...baseConversation.messages, assistantMessage])
      }

      setActiveConversation(updatedConversation)
      setIsChatOpen(true)
      setIsHistoryOpen(false)
      upsertConversation(updatedConversation)
      persistConversation(updatedConversation)
    },
    [activeConversation, persistConversation, upsertConversation]
  )

  const handlePopupItemSelect = useCallback(
    (item: PopupItem) => {
      if (activePopup === 'settings' && item.promptText) {
        setCurrentSystemPrompt({
          id: item.id,
          title: item.title,
          content: item.promptText
        })

        setTimeout(() => inputRef.current?.focus(), 40)
      } else if (activePopup === 'appLauncher') {
        const launchTargets = normalizePopupLaunchTargets(item)
        if (launchTargets.length === 0) {
          return
        }

        const launchApp = window.api?.launchApp
        if (!launchApp) {
          appendAssistantMessage('App launching is only available in the Electron app.')
        } else {
          void (async () => {
            for (const target of launchTargets) {
              const result = await launchApp(target.path, target.arguments ?? '')
              if (!result.success) {
                appendAssistantMessage(`Error: ${result.error ?? 'Unable to launch application.'}`)
                return
              }
            }
          })().catch((error) => {
            const message = error instanceof Error ? error.message : 'Unable to launch application.'
            appendAssistantMessage(`Error: ${message}`)
          })
        }
      } else if (activePopup === 'workflow' && item.workflowData) {
        if (!window.api?.executeWorkflow) {
          appendAssistantMessage('Workflow execution is only available in the Electron app.')
        } else {
          const workflowId = item.workflowData.id
          const activeSuccessTimeout = successResetTimersRef.current[workflowId]

          if (activeSuccessTimeout) {
            window.clearTimeout(activeSuccessTimeout)
            delete successResetTimersRef.current[workflowId]
          }

          setWorkflowExecutionById((previous) => ({
            ...previous,
            [workflowId]: {
              status: 'running',
              logs: []
            }
          }))

          setWorkflowLogsOpenById((previous) => ({
            ...previous,
            [workflowId]: false
          }))

          void window.api
            .executeWorkflow(item.workflowData)
            .then((result) => {
              if (!result.success) {
                const message = result.error ?? 'Unable to execute workflow.'

                setWorkflowExecutionById((previous) => {
                  const existingState = previous[workflowId] ?? {
                    status: 'idle',
                    logs: []
                  }

                  return {
                    ...previous,
                    [workflowId]: {
                      status: 'error',
                      logs: [...existingState.logs, `[ERROR] ${message}`].slice(-MAX_WORKFLOW_LOG_LINES)
                    }
                  }
                })

                setWorkflowLogsOpenById((previous) => ({
                  ...previous,
                  [workflowId]: true
                }))
              }
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'Unable to execute workflow.'

              setWorkflowExecutionById((previous) => {
                const existingState = previous[workflowId] ?? {
                  status: 'idle',
                  logs: []
                }

                return {
                  ...previous,
                  [workflowId]: {
                    status: 'error',
                    logs: [...existingState.logs, `[ERROR] ${message}`].slice(-MAX_WORKFLOW_LOG_LINES)
                  }
                }
              })

              setWorkflowLogsOpenById((previous) => ({
                ...previous,
                [workflowId]: true
              }))
            })
        }
      }
      if (activePopup !== 'workflow' && activePopup !== 'settings') {
        setActivePopup(null)
      } else {
        if (mode === 'ai') {
          window.setTimeout(() => inputRef.current?.focus(), 40)
        }
      }
    },
    [activePopup, appendAssistantMessage, mode]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        if (showImagePanel) {
          setShowImagePanel(false)
          return
        }

        if (activePopup) {
          setActivePopup(null)
          return
        }

        handleClose()
      } else if (e.key === 'Enter') {
        if (isComposingRef.current) return
        e.preventDefault()
        void handleSubmit()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (!range.collapsed) return

        const node = e.key === 'Backspace'
          ? (range.startOffset === 0 ? range.startContainer.previousSibling : null)
          : range.startContainer.nextSibling

        if (node instanceof HTMLElement && node.hasAttribute('data-paste-id')) {
          e.preventDefault()
          const id = node.getAttribute('data-paste-id')!
          pasteBlocksRef.current.delete(id)
          node.remove()
          if (inputRef.current) {
            setQuery(inputRef.current.textContent ?? '')
          }
        }
      }
    },
    [activePopup, showImagePanel, handleClose, handleSubmit]
  )

  const toggleRecording = useCallback(async () => {
    if (voiceState === 'transcribing') return

    if (voiceState === 'recording') {
      mediaRecorderRef.current?.stop()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        setVoiceState('transcribing')
        micStreamRef.current?.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        blob.arrayBuffer().then(async (buffer) => {
          try {
            const text = await window.api!.voice.transcribe(buffer)
            if (text.trim()) {
              const div = inputRef.current
              if (div) {
                const separator = div.textContent ? ' ' : ''
                div.appendChild(document.createTextNode(separator + text.trim()))
                setQuery(div.textContent ?? '')
              }
              setTimeout(() => inputRef.current?.focus(), 50)
            }
            setVoiceState('idle')
          } catch {
            setVoiceState('error')
            setTimeout(() => setVoiceState('idle'), 400)
          }
        })
      }

      recorder.start(250)
      setVoiceState('recording')
    } catch {
      setVoiceState('error')
      setTimeout(() => setVoiceState('idle'), 400)
    }
  }, [voiceState])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return

      if (activePopup) {
        setActivePopup(null)
        return
      }

      if (isChatOpen) {
        return
      }

      handleClose()
    },
    [activePopup, handleClose, isChatOpen]
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveSearchMatchIndex(0)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    window.setTimeout(() => searchInputRef.current?.focus(), 40)
  }, [])

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch()
    } else {
      openSearch()
    }
  }, [searchOpen, openSearch, closeSearch])

  const handleDeleteConversation = useCallback(async () => {
    const target = deletingConversation
    if (!target) return

    if (!window.api?.chat.deleteConversation) {
      setDeletingConversation(null)
      return
    }

    try {
      const updated = await window.api.chat.deleteConversation(target.id)
      setConversations(sortConversations(updated))
      if (activeConversation?.id === target.id) {
        setActiveConversation(null)
        setIsChatOpen(false)
        closeSearch()
      }
    } catch {
      // Ignore deletion failures — keep the current UI state.
    } finally {
      setDeletingConversation(null)
    }
  }, [deletingConversation, activeConversation, closeSearch])

  const handleRootKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        mode === 'ai' &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'm' || event.key === 'M')
      ) {
        event.preventDefault()
        event.stopPropagation()
        void toggleRecording()
        return
      }

      if (
        mode === 'ai' &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'f' || event.key === 'F')
      ) {
        event.preventDefault()
        event.stopPropagation()
        if (!isChatOpen) {
          setIsChatOpen(true)
        }
        openSearch()
        return
      }

      const hasChatHistory = Boolean(activeConversation?.messages.length || conversations.length)
      if (
        mode === 'ai' &&
        hasChatHistory &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === 'Tab' || event.key === '`')
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsChatOpen((open) => !open)
        setIsHistoryOpen(false)
        return
      }

      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        toggleMode()
        return
      }

      if (event.key === 'Escape' && mode === 'terminal' && !activePopup) {
        event.preventDefault()
        switchToAiMode()
      }
    },
    [activeConversation, activePopup, conversations, isChatOpen, mode, switchToAiMode, toggleMode, toggleRecording, openSearch]
  )

  const chatMessages = useMemo(
    () => (activeConversation ? normalizeMessageOrder(activeConversation.messages) : []),
    [activeConversation]
  )

  const searchMatches = useMemo(
    () => buildSearchMatches(conversations, activeConversation, searchQuery),
    [conversations, activeConversation, searchQuery]
  )

  const searchGroups = useMemo<SearchGroup[]>(() => {
    const groups: SearchGroup[] = []
    for (const match of searchMatches) {
      const last = groups[groups.length - 1]
      if (last && last.conversationId === match.conversationId) {
        last.matches.push(match)
      } else {
        groups.push({
          conversationId: match.conversationId,
          conversationTitle: match.conversationTitle,
          matches: [match]
        })
      }
    }
    return groups
  }, [searchMatches])

  const navigateToSearchMatch = useCallback(
    (match: SearchMatch) => {
      if (match.conversationId !== activeConversation?.id) {
        const conversation = conversations.find((item) => item.id === match.conversationId)
        if (conversation) {
          setActiveConversation(conversation)
        }
      }
      setIsChatOpen(true)
      setIsHistoryOpen(false)
      setActivePopup(null)
      window.setTimeout(() => {
        const scrollElement = chatScrollRef.current
        const messageElement = scrollElement?.querySelector(`[data-message-id="${match.messageId}"]`)
        if (messageElement) {
          messageElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, 80)
    },
    [activeConversation, conversations]
  )

  const goToSearchMatch = useCallback(
    (index: number) => {
      if (searchMatches.length === 0) return
      const clamped = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
      setActiveSearchMatchIndex(clamped)
      navigateToSearchMatch(searchMatches[clamped])
    },
    [searchMatches, navigateToSearchMatch]
  )

  const goToNextSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex + 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const goToPreviousSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex - 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const selectSearchMatch = useCallback(
    (match: SearchMatch) => {
      const index = searchMatches.indexOf(match)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  const selectSearchGroup = useCallback(
    (conversationId: string) => {
      const index = searchMatches.findIndex((match) => match.conversationId === conversationId)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  useEffect(() => {
    const trimmedQuery = searchQuery.trim()
    const scrollElement = chatScrollRef.current

    if (!trimmedQuery || !scrollElement || !isChatOpen) {
      clearSearchHighlight()
      return
    }

    const timer = window.setTimeout(() => {
      applySearchHighlight(scrollElement, trimmedQuery)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      clearSearchHighlight()
    }
  }, [searchQuery, chatMessages, activeConversation?.id, isChatOpen])

  const themePalette = useMemo(() => getThemePalette(themeGradient), [themeGradient])
  const themeStyles = useMemo<CSSProperties>(
    () => ({
      '--chat-accent': themePalette.accent,
      '--chat-accent-soft': themePalette.accentSoft,
      '--chat-accent-strong': themePalette.accentStrong,
      '--chat-user-text': themePalette.userText,
      '--chat-assistant-text': themePalette.assistantText,
      '--chat-assistant-bg': themePalette.assistantBg,
      '--chat-assistant-border': themePalette.assistantBorder,
      '--chat-scroll-thumb': themePalette.scrollbarThumb,
      '--chat-scroll-thumb-hover': themePalette.scrollbarThumbHover,
      '--chat-meta-text': themePalette.metaText
    } as CSSProperties),
    [themePalette]
  )

  const contextStats = useMemo(
    () => (activeConversation ? computeContextStats(activeConversation.messages, chatModel) : null),
    [activeConversation, chatModel]
  )

  return (
    <div
      className="relative w-screen h-screen flex items-end justify-center pb-5 select-none"
      style={{ background: 'transparent' }}
      onClick={handleOverlayClick}
      onKeyDownCapture={handleRootKeyDownCapture}
    >
      {/*
        isAppVisible tracks whether the visible command bar has finished its
        exit animation. Heavy transient UI such as popups should respect it,
        but the terminal host stays mounted so its scrollback survives hide/
        show cycles.
      */}
      <AnimatePresence onExitComplete={() => setIsAppVisible(false)}>
        {visible && (
          <motion.div
            key="command-bar"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', damping: 15, stiffness: 120, mass: 0.8 }}
            className="relative flex flex-col w-[750px] max-w-full"
            style={themeStyles}
          >
            <AnimatePresence>
              {mode === 'ai' && isChatOpen && (
                <motion.div
                  key="chat-window"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`mb-2 rounded-2xl border border-white/10 bg-gradient-to-br ${themeGradient} p-4 chat-surface`}
                >
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePin}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          isPinned
                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/25'
                            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                        }`}
                        aria-label={isPinned ? 'Unpin window' : 'Pin window'}
                        aria-pressed={isPinned}
                      >
                        <PinIcon active={isPinned} />
                      </button>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Conversation</p>
                        <p className="text-sm font-medium text-neutral-200">
                          {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="relative">
                        <motion.div
                          initial={false}
                          animate={{ width: searchOpen ? 280 : 32 }}
                          transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.8 }}
                          className={`flex h-8 items-center overflow-hidden rounded-lg border transition-colors duration-150 ${
                            searchOpen
                              ? 'border-white/20 bg-white/10'
                              : 'border-white/10 hover:border-white/20 hover:bg-white/10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={toggleSearch}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:text-neutral-100"
                            aria-label={searchOpen ? 'Close search' : 'Search conversations'}
                            aria-pressed={searchOpen}
                          >
                            <SearchIcon />
                          </button>
                          {searchOpen && (
                            <>
                              <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                  setSearchQuery(e.target.value)
                                  setActiveSearchMatchIndex(0)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    closeSearch()
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (e.shiftKey) {
                                      goToPreviousSearchMatch()
                                    } else {
                                      goToNextSearchMatch()
                                    }
                                  }
                                }}
                                placeholder="Search all conversations…"
                                className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                                spellCheck={false}
                              />
                              {searchQuery.trim() && searchMatches.length > 0 ? (
                                <span className="flex-shrink-0 text-[11px] tabular-nums text-neutral-400">
                                  {activeSearchMatchIndex + 1} / {searchMatches.length}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={goToPreviousSearchMatch}
                                disabled={searchMatches.length === 0}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Previous match"
                              >
                                <ChevronUpIcon />
                              </button>
                              <button
                                type="button"
                                onClick={goToNextSearchMatch}
                                disabled={searchMatches.length === 0}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Next match"
                              >
                                <ChevronDownIcon />
                              </button>
                              <button
                                type="button"
                                onClick={closeSearch}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
                                aria-label="Close search"
                              >
                                <XIcon />
                              </button>
                            </>
                          )}
                        </motion.div>
                        {searchQuery.trim() && searchGroups.length > 0 && (
                          <div className="absolute left-0 top-full z-20 mt-1 w-72 max-h-52 overflow-y-auto chat-scrollbar rounded-lg border border-neutral-800 bg-neutral-950/95 py-1 shadow-xl">
                            {searchGroups.map((group) => (
                              <div key={group.conversationId} className="py-0.5">
                                <button
                                  type="button"
                                  onClick={() => selectSearchGroup(group.conversationId)}
                                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors hover:bg-neutral-800/70"
                                >
                                  <span className="truncate text-[12px] font-medium text-neutral-200">
                                    {group.conversationTitle}
                                  </span>
                                  <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                                    {group.matches.length} match{group.matches.length === 1 ? '' : 'es'}
                                  </span>
                                </button>
                                {group.matches.slice(0, 3).map((match) => (
                                  <button
                                    key={match.messageId}
                                    type="button"
                                    onClick={() => selectSearchMatch(match)}
                                    className={`flex w-full items-center gap-2 px-4 py-1 text-left transition-colors hover:bg-neutral-800/70 ${
                                      searchMatches.indexOf(match) === activeSearchMatchIndex
                                        ? 'bg-neutral-800/70'
                                        : ''
                                    }`}
                                  >
                                    <span
                                      className={`flex-shrink-0 text-[10px] uppercase tracking-[0.1em] ${
                                        match.role === 'user' ? 'text-neutral-500' : 'text-neutral-600'
                                      }`}
                                    >
                                      {match.role === 'user' ? 'You' : 'AI'}
                                    </span>
                                    <span className="truncate text-[12px] text-neutral-400">{match.snippet}</span>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                        {(() => {
                        const stats = contextStats
                        if (!stats || stats.maxTokens <= 0) return null
                        const radius = 11
                        const circumference = 2 * Math.PI * radius
                        const fillPercent = Math.min(stats.totalTokens / stats.maxTokens, 1)
                        const dashOffset = circumference * (1 - fillPercent)
                        let progressColor = 'rgba(255,255,255,0.5)'
                        if (fillPercent > 0.95) progressColor = 'rgba(239,68,68,0.8)'
                        else if (fillPercent > 0.8) progressColor = 'rgba(245,158,11,0.8)'
                        return (
                          <div className="relative group">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 cursor-default">
                              <svg width="20" height="20" viewBox="0 0 28 28" className="-rotate-90">
                                <circle cx="14" cy="14" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                                <circle cx="14" cy="14" r={radius} fill="none" stroke={progressColor} strokeWidth="2"
                                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                                  strokeLinecap="round" />
                              </svg>
                            </div>
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                              <div className="rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-lg">
                                <div className="mb-2">
                                  <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                                    <span>{formatTokenCount(stats.totalTokens)} / {formatTokenCount(stats.maxTokens)} tokens used</span>
                                    <span>{Math.round(fillPercent * 100)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-white/40 transition-all" style={{ width: `${Math.round(fillPercent * 100)}%` }} />
                                  </div>
                                </div>
                                <div className="space-y-0.5 text-[11px] text-neutral-400">
                                  <p className="font-medium text-neutral-300">{CHAT_MODEL_OPTIONS.find(m => m.id === chatModel)?.label ?? chatModel}</p>
                                  <p>Cost: {formatCurrency(stats.totalCost)}</p>
                                  <p>{stats.messageCount} messages &middot; {'>'}{formatTokenCount(stats.totalInputTokens)}tk &middot; {formatTokenCount(stats.totalOutputTokens)}tk</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      <button
                        ref={historyButtonRef}
                        type="button"
                        onClick={() => setIsHistoryOpen((open) => !open)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10"
                        aria-label="Open conversation history"
                      >
                        <MenuIcon />
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleExpand}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          isExpanded
                            ? 'border-white/20 bg-white/10 text-neutral-200'
                            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:bg-white/10 hover:text-neutral-200'
                        }`}
                        aria-label={isExpanded ? 'Collapse window' : 'Expand window'}
                        aria-pressed={isExpanded}
                      >
                        <ExpandIcon />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isHistoryOpen && (
                        <motion.div
                          key="history-menu"
                          ref={historyMenuRef}
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-10 z-20 w-72 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/95 shadow-xl"
                        >
                          <div className="max-h-40 overflow-y-auto scrollbar-hidden py-1">
                            {conversations.length === 0 ? (
                              <p className="px-2.5 py-2 text-[11px] text-neutral-500">No conversations yet.</p>
                            ) : (
                              conversations.map((conversation) => (
                                <div
                                  key={conversation.id}
                                  className={`flex w-full items-center gap-1 px-2.5 py-1.5 text-[12px] transition-colors hover:bg-neutral-800/70 ${
                                    conversation.id === activeConversation?.id
                                      ? 'bg-neutral-800/70 text-neutral-100'
                                      : 'text-neutral-300'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveConversation(conversation)
                                      setIsChatOpen(true)
                                      setIsHistoryOpen(false)
                                    }}
                                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                                  >
                                    <span className="truncate font-medium">{conversation.title}</span>
                                    <span className="mt-0.5 flex items-center justify-between gap-2">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                                        {conversation.messages.length} messages
                                      </span>
                                      <span className="flex-shrink-0 text-[10px] tabular-nums text-neutral-500">
                                        {formatConversationTimestamp(conversation.updatedAt)}
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeletingConversation(conversation)
                                      setIsHistoryOpen(false)
                                    }}
                                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                    aria-label={`Delete ${conversation.title}`}
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div
                    ref={chatScrollRef}
                    onScroll={handleChatScroll}
                    onCopy={(e) => {
                      const selection = window.getSelection()
                      if (!selection || selection.isCollapsed) return
                      const text = selection.toString()
                      if (!text) return
                      e.preventDefault()
                      e.clipboardData.setData('text/plain', text)
                    }}
                    className="mt-3 overflow-y-auto chat-scrollbar space-y-3 pr-2"
                    style={{ height: isExpanded ? 'calc(100vh - 210px)' : CHAT_SCROLL_HEIGHT, minHeight: CHAT_SCROLL_HEIGHT }}
                  >
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-neutral-500">No messages yet.</p>
                    ) : (
                      chatMessages.map((message) => {
                        const isAssistant = message.role === 'assistant'
                        const isUser = message.role === 'user'
                        const isStreaming =
                          isAssistant && isLoading && activeStreamMessageId === message.id
                        const reasoningText = message.reasoning?.trim() ?? ''
                        const reasoningSteps = message.steps ?? []
                        const hasSteps = reasoningSteps.length > 0
                        const hasReasoningContent =
                          reasoningText.length > 0 ||
                          hasSteps ||
                          (message.reasoningTitle != null && message.reasoningTitle.trim().length > 0)
                        const showThinking =
                          isAssistant &&
                          (hasReasoningContent || (isStreaming && Boolean(thinkingOpenById[message.id])))
                        const isThinkingOpen = Boolean(thinkingOpenById[message.id])
                        const modelLabel = message.model?.trim()
                        const usageLabel = formatUsageSummary(message)
                        const metaLabel = [message.stopped ? 'Stopped' : null, modelLabel, usageLabel]
                          .filter(Boolean)
                          .join(` \u00b7 `)

                        return (
                          <div
                            key={message.id}
                            data-message-id={message.id}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`chat-message max-w-[78%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed select-text ${
                                isUser
                                  ? 'chat-message--user whitespace-pre-wrap'
                                  : 'chat-message--assistant'
                              }`}
                            >
                               {showThinking && (
                                <div className="chat-thinking">
                                  <button
                                    type="button"
                                    className="chat-thinking-toggle"
                                    onClick={() => {
                                      setThinkingOpenById((previous) => {
                                        const timerId = reasoningAutoCloseTimersRef.current[message.id]
                                        if (timerId !== undefined) {
                                          window.clearTimeout(timerId)
                                          delete reasoningAutoCloseTimersRef.current[message.id]
                                        }
                                        return {
                                          ...previous,
                                          [message.id]: !isThinkingOpen
                                        }
                                      })
                                    }}
                                  >
                                    <span
                                      className={
                                        isStreaming
                                          ? 'chat-thinking-title chat-thinking-title--streaming'
                                          : 'chat-thinking-title'
                                      }
                                    >
                                      {message.reasoningTitle?.trim()
                                        ? message.reasoningTitle.trim()
                                        : 'Reasoning\u2026'}
                                    </span>
                                    <span
                                      className={
                                        `chat-thinking-chevron${isThinkingOpen ? ' chat-thinking-chevron--open' : ''}`
                                      }
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="m9 18 6-6-6-6" />
                                      </svg>
                                    </span>
                                  </button>

                                  {isThinkingOpen && (
                                    <div className="chat-thinking-body">
                                      {hasSteps ? (
                                        reasoningSteps.map((step, stepIndex) => {
                                          if (step.type === 'reasoning') {
                                            const isLastStep = stepIndex === reasoningSteps.length - 1
                                            return (
                                              <p
                                                key={`reasoning-${stepIndex}`}
                                                className="chat-thinking-text whitespace-pre-wrap"
                                              >
                                                {step.text}
                                                {isStreaming && isLastStep ? (
                                                  <span className="chat-thinking-cursor">|</span>
                                                ) : null}
                                              </p>
                                            )
                                          }
                                          return <WebSearchStepRow key={step.id} step={step} />
                                        })
                                      ) : reasoningText ? (
                                        <p className="chat-thinking-text whitespace-pre-wrap">
                                          {reasoningText}
                                          {isStreaming ? (
                                            <span className="chat-thinking-cursor">|</span>
                                          ) : null}
                                        </p>
                                      ) : (
                                        <p className="chat-thinking-empty">Reasoning not available.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                               {isAssistant ? (
                                <>
                                  {message.sources && message.sources.length > 0 ? (
                                    <div className="chat-sources-wrapper">
                                      <button
                                        type="button"
                                        className="chat-sources-toggle"
                                        onClick={() =>
                                          setSourcesPanelMessageId(
                                            sourcesPanelMessageId === message.id ? null : message.id
                                          )
                                        }
                                      >
                                        <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          aria-hidden
                                        >
                                          <circle cx="11" cy="11" r="8" />
                                          <path d="m21 21-4.35-4.35" />
                                        </svg>
                                        <span>Sources</span>
                                        <span className="chat-sources-count">{message.sources.length}</span>
                                      </button>

                                      {sourcesPanelMessageId === message.id && (
                                        <div className="chat-sources-panel">
                                          <div className="chat-sources-panel-header">
                                            <span className="font-medium">Sources</span>
                                            <button
                                              type="button"
                                              className="chat-sources-panel-close"
                                              onClick={() => setSourcesPanelMessageId(null)}
                                              aria-label="Close sources"
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6 6 18M6 6l12 12" />
                                              </svg>
                                            </button>
                                          </div>
                                          <div className="chat-sources-panel-list">
                                            {message.sources.map((source, idx) => (
                                              <a
                                                key={`${source.url}-${idx}`}
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="chat-source-item"
                                              >
                                                <img
                                                  src={getFaviconUrl(source.url)}
                                                  alt=""
                                                  className="chat-source-favicon"
                                                  onError={(e) => {
                                                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                                                  }}
                                                />
                                                <div className="chat-source-text">
                                                  <span className="chat-source-title">
                                                    {source.title || formatSourceUrl(source.url)}
                                                  </span>
                                                  <span className="chat-source-url">
                                                    {formatSourceUrl(source.url)}
                                                  </span>
                                                </div>
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                  <AssistantMarkdown content={message.content} />
                                </>
                              ) : (
                                <>
                                  {message.content}
                                  {message.images && message.images.length > 0 && (
                                    <div className="chat-message-meta flex items-center gap-1 mt-0.5">
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                      </svg>
                                      <span>{message.images.length} image{message.images.length !== 1 ? 's' : ''}</span>
                                    </div>
                                  )}
                                </>
                              )}

                              {isAssistant ? (
                                <div className="chat-message-meta flex items-center gap-2">
                                  {metaLabel ? <span>{metaLabel}</span> : null}
                                  <CopyButton
                                    text={message.content}
                                    className="flex items-center justify-center h-6 w-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              className={`relative flex items-center w-full rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10 transition-opacity duration-100 ${
                mode === 'terminal' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                WebkitBackdropFilter: 'blur(40px)',
                backdropFilter: 'blur(40px)'
              }}
            >
            <AnimatePresence mode="wait">
              {mode === 'ai' && activePopup && isAppVisible && (
                <ModulePopup
                  key={activePopup}
                  activePopup={activePopup}
                  popupRef={popupRef}
                  themeGradient={themeGradient}
                  isAppVisible={isAppVisible}
                  selectedSettingsItemId={selectedSystemPrompt?.id}
                  onClearSelectedSettingsItem={clearCurrentSystemPrompt}
                  appLauncherItems={apps.map((item) => {
                    const targets = normalizeLauncherAppTargets(item)
                    return {
                      id: item.id,
                      title: item.title,
                      subtitle: formatTargetsSummary(targets),
                      icon: 'grid',
                      appLaunchTargets: targets
                    }
                  })}
                  workflowItems={workflows.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.language,
                    icon: 'bolt',
                    workflowData: item
                  }))}
                  workflowExecutionById={workflowExecutionById}
                  workflowLogsOpenById={workflowLogsOpenById}
                  onToggleWorkflowLogs={handleToggleWorkflowLogs}
                  settingsItems={preprompts.map((item) => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.content,
                    icon: 'doc',
                    promptText: item.content
                  }))}
                  onAddNew={() => {
                    setActivePopup(null)
                    const tab =
                      activePopup === 'appLauncher' ? 'appLauncher' :
                      activePopup === 'workflow' ? 'workflow' :
                      'preprompts'
                    if (window.api?.window.openSettings) {
                      window.api.window.openSettings(tab)
                    } else {
                      console.log('Settings window is only available in the Electron app.')
                    }
                  }}
                  onSelectItem={handlePopupItemSelect}
                  anchorSide={activePopup === 'settings' ? 'left' : 'right'}
                  chatModel={chatModel}
                  onSelectChatModel={(model) => {
                    setChatModel(model)
                    window.api?.config.updateChatModel?.(model)
                  }}
                  onOpenFullSettings={() => {
                    setActivePopup(null)
                    if (window.api?.window.openSettings) {
                      window.api.window.openSettings()
                    }
                  }}
                  reasoningEffort={reasoningEffort}
                  onSelectReasoningEffort={(effort) => {
                    setReasoningEffort(effort)
                    window.api?.config.updateReasoningEffort?.(effort)
                  }}
                  tasks={tasks}
                  onAddTask={handleAddTask}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onClearCompletedTasks={handleClearCompletedTasks}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showImagePanel && attachedImages.length > 0 && (
                <motion.div
                  ref={imagePanelRef}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute bottom-full right-0 z-30 mb-3 w-[280px] rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 p-3 shadow-xl shadow-black/40"
                  style={{ WebkitBackdropFilter: 'blur(30px)', backdropFilter: 'blur(30px)' }}
                >
                  <p className="px-2 pb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
                    Attachments ({attachedImages.length})
                  </p>
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto chat-scrollbar">
                    {attachedImages.map(img => (
                      <div key={img.id} className="flex items-center gap-3 rounded-xl p-2 border border-white/5 bg-white/[0.03]">
                        <img src={img.base64} className="h-10 w-10 rounded-lg object-cover border border-white/10 flex-shrink-0" alt={img.fileName} />
                        <span className="flex-1 text-sm text-neutral-300 truncate">{img.fileName}</span>
                        <button
                          onClick={() => setAttachedImages(prev => prev.filter(i => i.id !== img.id))}
                          className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                          aria-label={`Remove ${img.fileName}`}
                        >
                          <XIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              ref={settingsButtonRef}
              onClick={(e) => {
                e.stopPropagation()
                togglePopup('settings')
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
              aria-label="Settings"
              aria-pressed={activePopup === 'settings'}
            >
              <SettingsIcon />
            </button>

            {voiceState === 'recording' && micStreamRef.current ? (
                <VoiceWaveform stream={micStreamRef.current} />
              ) : (
                <div
                  ref={inputRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => { const d = inputRef.current; if (d) setQuery(d.textContent ?? '') }}
                  onPaste={(e) => {
                    const items = e.clipboardData.items
                    let hasImage = false

                    for (let i = 0; i < items.length; i++) {
                      const item = items[i]
                      if (!SUPPORTED_IMAGE_TYPES.includes(item.type)) continue
                      e.preventDefault()
                      hasImage = true
                      if (attachedImages.length >= MAX_ATTACHED_IMAGES) continue
                      const blob = item.getAsFile()
                      if (!blob) continue
                      const reader = new FileReader()
                      const mimeType = item.type
                      const fileName = blob.name || 'Pasted image'
                      reader.onload = () => {
                        const base64 = reader.result as string
                        setAttachedImages(prev => {
                          if (prev.length >= MAX_ATTACHED_IMAGES) return prev
                          return [...prev, { id: crypto.randomUUID(), base64, fileName, mimeType }]
                        })
                      }
                      reader.readAsDataURL(blob)
                    }

                    if (hasImage) return

                    const text = e.clipboardData.getData('text/plain')
                    if (!text) return
                    e.preventDefault()
                    const lines = text.split('\n').length
                    if (lines <= 5 && text.length <= 300) {
                      document.execCommand('insertText', false, text)
                      const d = inputRef.current
                      if (d) setQuery(d.textContent ?? '')
                      return
                    }
                    const id = crypto.randomUUID()
                    pasteBlocksRef.current.set(id, text)
                    const chip = document.createElement('span')
                    chip.setAttribute('contenteditable', 'false')
                    chip.setAttribute('data-paste-id', id)
                    chip.className = 'inline-block bg-white/10 rounded-md px-2 py-0.5 text-sm border border-white/10 select-none cursor-default align-middle'
                    chip.textContent = `[Pasted ~${lines} lines]`
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      const range = selection.getRangeAt(0)
                      range.deleteContents()
                      range.insertNode(chip)
                      const space = document.createTextNode('\u00A0')
                      chip.after(space)
                      range.setStartAfter(space)
                      range.collapse(true)
                      selection.removeAllRanges()
                      selection.addRange(range)
                    }
                    const d = inputRef.current
                    if (d) setQuery(d.textContent ?? '')
                  }}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => { isComposingRef.current = true }}
                  onCompositionEnd={() => { isComposingRef.current = false }}
                  data-placeholder="What can I help you with today?"
                  className="flex-1 bg-transparent text-lg text-neutral-100 placeholder:text-neutral-500 border-none focus:outline-none focus:ring-0 px-4 py-3 whitespace-pre overflow-hidden empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-500"
                  style={{ caretColor: 'var(--chat-accent)' }}
                  spellCheck={false}
                />
              )}

              <button
                onClick={(e) => { e.stopPropagation(); void toggleRecording() }}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 border ${
                  voiceState === 'error'
                    ? 'bg-red-500/60 border-red-400/50 text-red-200'
                    : voiceState === 'recording'
                      ? 'bg-red-500/80 border-red-400/50 text-white animate-pulse'
                      : voiceState === 'transcribing'
                        ? 'bg-neutral-700/60 border-white/8 text-neutral-300 animate-pulse'
                        : 'bg-neutral-700/60 hover:bg-neutral-600/80 border-white/8 text-neutral-300 hover:text-white'
                }`}
                aria-label={voiceState === 'recording' ? 'Stop recording' : 'Start voice recording'}
                disabled={voiceState === 'transcribing'}
              >
                {voiceState === 'recording' ? <StopIcon /> : voiceState === 'transcribing' ? <SpinnerIcon /> : <MicIcon />}
              </button>

              <div className="w-1" />

              {(isLoading || query.trim()) && (
                <button
                  onClick={() => void (isLoading ? handleCancel() : handleSubmit())}
                  disabled={!isLoading && !query.trim()}
                  className="flex items-center justify-center w-8 h-8 mr-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-600/80 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 transition-all duration-150 border border-white/8"
                  aria-label={isLoading ? 'Stop generating' : 'Submit prompt'}
                >
                  {isLoading ? <StopIcon /> : <SendIcon />}
                </button>
              )}

              {attachedImages.length > 0 && (
                <button
                  ref={imageButtonRef}
                  onClick={(e) => { e.stopPropagation(); setShowImagePanel(v => !v) }}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 border ${
                    showImagePanel
                      ? 'border-white/20 bg-white/10 text-neutral-200'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border-transparent hover:border-white/10'
                  }`}
                  aria-label={`${attachedImages.length} image(s) attached`}
                  aria-pressed={showImagePanel}
                >
                  <div className="relative">
                    <ImageIcon />
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white leading-none">
                      {attachedImages.length}
                    </span>
                  </div>
                </button>
              )}

              <div ref={moduleButtonsRef} className="flex items-center gap-1">
                {buttonVisibility.appLauncher && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('appLauncher')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="App Launcher"
                    aria-pressed={activePopup === 'appLauncher'}
                  >
                    <GridIcon />
                  </button>
                )}

                {buttonVisibility.workflow && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('workflow')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="Workflows"
                    aria-pressed={activePopup === 'workflow'}
                  >
                    <CodeIcon />
                  </button>
                )}

                {buttonVisibility.tasks && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopup('tasks')
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all duration-150"
                    aria-label="Tasks"
                    aria-pressed={activePopup === 'tasks'}
                  >
                    <TasksIcon />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {(hasInitializedTerminal || mode === 'terminal') && (
        <motion.div
          key="terminal-container"
          className="absolute inset-x-0 bottom-5 z-20 pointer-events-auto flex justify-center"
          initial={false}
          animate={
            mode === 'terminal'
              ? { scaleY: 1, y: 0, opacity: 1 }
              : { scaleY: 0.12, y: 0, opacity: 0 }
          }
          transition={{
            type: 'spring',
            damping: 22,
            stiffness: 280,
            mass: 1,
            duration: 0.2
          }}
          style={{
            height: isExpanded ? 'calc(100vh - 160px)' : '400px',
            pointerEvents: mode === 'terminal' && visible ? 'auto' : 'none',
            transformOrigin: 'bottom center'
          }}
          aria-hidden={mode !== 'terminal' || !visible}
        >
          <div
            className={`flex h-full w-[750px] max-w-full flex-col overflow-hidden rounded-2xl p-2 bg-gradient-to-br ${themeGradient} border border-white/10`}
            style={{
              WebkitBackdropFilter: 'blur(40px)',
              backdropFilter: 'blur(40px)'
            }}
          >
            <div className="min-h-0 flex-1">
              <TerminalView
                active={mode === 'terminal' && visible && isAppVisible}
                fontFamily={terminalFont}
                isExpanded={isExpanded}
                isPinned={isPinned}
                onTogglePin={handleTogglePin}
                onToggleExpand={handleToggleExpand}
              />
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {deletingConversation && (
          <ConfirmDeleteModal
            title="Delete conversation"
            message={`Are you sure you want to delete "${deletingConversation.title}"? This cannot be undone.`}
            withBackdrop={false}
            onConfirm={() => {
              void handleDeleteConversation()
            }}
            onCancel={() => setDeletingConversation(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
