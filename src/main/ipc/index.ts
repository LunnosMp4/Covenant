import { registerChatIpc } from './chat'
import { registerConfigIpc } from './config'
import { registerDialogIpc } from './dialog'
import { registerExcalidrawIpc } from './excalidraw'
import { registerMcpIpc } from './mcp'
import { registerPasteIpc } from './paste'
import { registerStoreIpc } from './store'
import { registerTerminalIpc } from './terminal'
import { registerUsageIpc } from './usage'
import { registerWindowIpc } from './window'

export function registerIpc(): void {
  registerWindowIpc()
  registerConfigIpc()
  registerUsageIpc()
  registerMcpIpc()
  registerStoreIpc()
  registerTerminalIpc()
  registerDialogIpc()
  registerExcalidrawIpc()
  registerPasteIpc()
  registerChatIpc()
}
