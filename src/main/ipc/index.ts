import { registerChatIpc } from './chat'
import { registerCodeIpc } from './code'
import { registerConfigIpc } from './config'
import { registerDialogIpc } from './dialog'
import { registerExcalidrawIpc } from './excalidraw'
import { registerMcpIpc } from './mcp'
import { registerNotesIpc } from './notes'
import { registerPasteIpc } from './paste'
import { registerStoreIpc } from './store'
import { registerTerminalIpc } from './terminal'
import { registerUsageIpc } from './usage'
import { registerWindowIpc } from './window'
import { registerAiIpc } from './ai'

export function registerIpc(): void {
  registerWindowIpc()
  registerConfigIpc()
  registerAiIpc()
  registerUsageIpc()
  registerMcpIpc()
  registerStoreIpc()
  registerTerminalIpc()
  registerDialogIpc()
  registerExcalidrawIpc()
  registerPasteIpc()
  registerNotesIpc()
  registerChatIpc()
  registerCodeIpc()
}
