export interface SelectedSystemPrompt {
  id: string
  title: string
  content: string
}

export type AppMode = 'ai' | 'terminal'

/** The panel shown above the command bar in AI mode. */
export type Surface = 'chat' | 'code'

export interface AttachedImage {
  id: string
  base64: string
  fileName: string
  mimeType: string
}
