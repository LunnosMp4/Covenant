import type { WebContents } from 'electron'

export interface BuiltinToolCallContext {
  signal: AbortSignal
  /** Present for streaming chats, absent for non-streaming completions. */
  sender?: WebContents
}

export interface BuiltinToolSource {
  title: string
  url: string
}

export interface BuiltinToolResult {
  content: string
  isError: boolean
  /** Emitted to the chat UI as a `sources` event when present. */
  sources?: BuiltinToolSource[]
  /** The search query that produced the result, for the UI. */
  query?: string
}

export interface BuiltinToolHandler {
  name: string
  /** Used by the streaming adapter to choose the right UI step. */
  toolType?: 'terminal' | 'web_search'
  execute(rawArguments: string, ctx: BuiltinToolCallContext): Promise<BuiltinToolResult>
}
