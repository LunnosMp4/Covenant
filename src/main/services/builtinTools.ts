import type { WebContents } from 'electron'

export interface BuiltinToolCallContext {
  signal: AbortSignal
  sender: WebContents
}

export interface BuiltinToolResult {
  content: string
  isError: boolean
}

export interface BuiltinToolHandler {
  name: string
  execute(rawArguments: string, ctx: BuiltinToolCallContext): Promise<BuiltinToolResult>
}
