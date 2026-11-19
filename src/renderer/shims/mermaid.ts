/**
 * Build-time stub for `mermaid`.
 *
 * `@excalidraw/excalidraw` statically re-exports `mermaidToExcalidraw` from
 * `@excalidraw/mermaid-to-excalidraw`, which pulls the whole of Mermaid — every
 * diagram type plus ~40 locales, ~7 MB of renderer JavaScript. Covenant never
 * converts Mermaid: the embed only uses `convertToExcalidrawElements`,
 * `serializeAsJSON` and `FONT_FAMILY`, and diagrams are rendered by excalidraw.com
 * inside an iframe. Aliasing the package to this stub in electron.vite.config.ts
 * keeps the bundle lean without changing any runtime behaviour.
 *
 * The real module's top-level code only stores this default export; every use of
 * it lives inside `parseMermaidToExcalidraw`, which is never called here.
 */
const mermaid = {
  initialize() {},
  render() {
    throw new Error('Mermaid is not bundled in Covenant.')
  },
  parse() {
    throw new Error('Mermaid is not bundled in Covenant.')
  },
  detectType() {
    return 'unknown'
  },
  registerLayoutLoaders() {},
  registerIconPacks() {}
}

export default mermaid
export const initialize = mermaid.initialize
export const render = mermaid.render
export const parse = mermaid.parse
export const detectType = mermaid.detectType
