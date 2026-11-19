/**
 * Build-time stub for `@excalidraw/mermaid-to-excalidraw`.
 *
 * Excalidraw's "text to diagram" dialog and paste handler load this package
 * lazily. Covenant never mounts the Excalidraw editor: `ExcalidrawEmbed` only
 * builds a scene with `convertToExcalidrawElements` + `serializeAsJSON` and
 * hands the JSON to excalidraw.com in an iframe. Stubbing the converter keeps
 * its whole Mermaid dependency graph (every diagram type plus ~40 locales,
 * ~7 MB) out of the renderer bundle.
 *
 * If the upstream dialog ever became reachable it fails loudly instead of
 * shipping megabytes of dead code.
 */
export function parseMermaidToExcalidraw(): Promise<never> {
  return Promise.reject(new Error('Mermaid conversion is not bundled with Covenant.'))
}
