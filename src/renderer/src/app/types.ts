export interface SelectedSystemPrompt {
  id: string
  title: string
  content: string
}

export type AppMode = 'ai' | 'terminal'

export interface AttachedImage {
  id: string
  base64: string
  fileName: string
  mimeType: string
}
