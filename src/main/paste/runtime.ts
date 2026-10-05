import type { PasteManager } from './pasteManager'

let pasteManager: PasteManager | null = null
let suppressPasteBlur = false

export function getPasteManager(): PasteManager | null {
  return pasteManager
}

export function setPasteManager(manager: PasteManager | null): void {
  pasteManager = manager
}

export function isPasteBlurSuppressed(): boolean {
  return suppressPasteBlur
}

export function setPasteBlurSuppressed(suppressed: boolean): void {
  suppressPasteBlur = suppressed
}
