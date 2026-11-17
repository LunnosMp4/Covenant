/**
 * Builds the trusted bootstrap document for a generated surface.
 *
 * The document is loaded through a blob URL so it does not inherit the app's
 * CSP. `sandbox="allow-scripts"` (without `allow-same-origin`) gives it an
 * opaque origin: it can run its own code but cannot read the host DOM, storage,
 * cookies, or the preload API.
 */

import {
  GENERATED_BRIDGE_VERSION,
  type GeneratedThemeContext
} from '../../../../../shared/ui/generated'

const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'"
].join('; ')

const FRAME_STYLES = `
:root { color-scheme: dark light; -webkit-text-size-adjust: 100%; }
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: var(--ui-font, system-ui, sans-serif);
  font-size: var(--ui-font-size-md, 13px);
  line-height: var(--ui-leading-normal, 1.5);
  color: var(--chat-assistant-text, #eee);
  overflow-x: hidden;
}
#covenant-content { display: flow-root; }
h1, h2, h3, h4 { margin: 0 0 var(--ui-space-sm, 8px); font-weight: var(--ui-weight-semibold, 600); letter-spacing: -0.01em; }
h1 { font-size: var(--ui-font-size-lg, 15px); }
h2 { font-size: var(--ui-font-size-md, 13px); }
h3, h4 { font-size: var(--ui-font-size-sm, 11.5px); color: var(--chat-meta-text, #999); text-transform: none; }
p, ul, ol { margin: 0 0 var(--ui-space-sm, 8px); }
p:last-child, ul:last-child, ol:last-child { margin-bottom: 0; }
small, .cv-caption { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }
a { color: var(--chat-accent, #8ab4f8); text-decoration: none; }
hr { border: 0; border-top: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08)); margin: var(--ui-space-md, 12px) 0; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }

.cv-row { display: flex; flex-wrap: wrap; gap: var(--ui-space-sm, 8px); align-items: center; }
.cv-grid { display: grid; gap: var(--ui-space-sm, 8px); }
.cv-card {
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
  border-radius: var(--ui-radius-md, 10px);
  padding: var(--ui-space-md, 12px);
  background: transparent;
}
.cv-kpi { display: flex; flex-direction: column; gap: 2px; }
.cv-kpi-label { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); letter-spacing: 0.01em; }
.cv-kpi-value { font-size: var(--ui-font-size-lg, 15px); font-weight: var(--ui-weight-semibold, 600); font-variant-numeric: tabular-nums; }
.cv-kpi-unit { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); font-weight: var(--ui-weight-medium, 500); }

.cv-button {
  appearance: none;
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--chat-assistant-text, #eee);
  border-radius: var(--ui-radius-pill, 999px);
  padding: 6px 12px;
  font: inherit;
  font-size: var(--ui-font-size-sm, 11.5px);
  font-weight: var(--ui-weight-medium, 500);
  cursor: pointer;
  transition: background-color 120ms ease, transform 100ms ease;
}
.cv-button:hover { background: var(--chat-accent-soft, rgba(255,255,255,0.08)); }
.cv-button:active { transform: scale(0.97); }
.cv-button:focus-visible { outline: 2px solid var(--chat-accent, #8ab4f8); outline-offset: 2px; }
.cv-button[data-variant="primary"] { background: var(--chat-accent-soft, rgba(255,255,255,0.1)); border-color: var(--chat-accent-strong, rgba(255,255,255,0.2)); }

.cv-input, .cv-select {
  appearance: none;
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.1));
  background: transparent;
  color: inherit;
  border-radius: var(--ui-radius-sm, 6px);
  padding: 5px 8px;
  font: inherit;
  font-size: var(--ui-font-size-sm, 11.5px);
  min-width: 0;
}
.cv-input:focus-visible, .cv-select:focus-visible { outline: 2px solid var(--chat-accent, #8ab4f8); outline-offset: 1px; }

.cv-field { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-sm, 8px); }
.cv-field-label { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }

.cv-range { width: 100%; accent-color: var(--chat-accent, #8ab4f8); }

.cv-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: var(--ui-font-size-sm, 11.5px); }
.cv-toggle input { accent-color: var(--chat-accent, #8ab4f8); }

.cv-table { width: 100%; border-collapse: collapse; font-size: var(--ui-font-size-sm, 11.5px); }
.cv-table th, .cv-table td { padding: 5px 6px; border-bottom: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08)); text-align: left; }
.cv-table th { color: var(--chat-meta-text, #999); font-weight: var(--ui-weight-medium, 500); }
.cv-table td[data-align="right"], .cv-table th[data-align="right"] { text-align: right; font-variant-numeric: tabular-nums; }
.cv-table tr:last-child td { border-bottom: 0; }

.cv-chart { width: 100%; }

.cv-disclosure { margin-top: var(--ui-space-sm, 8px); color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }
.cv-disclosure summary { cursor: pointer; }
.cv-note { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`

export function buildFrameDocument(runtimeSource: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
    <meta name="referrer" content="no-referrer">
    <meta name="color-scheme" content="dark light">
    <title>Covenant visual</title>
    <style>${FRAME_STYLES}</style>
    <style id="covenant-generated-css"></style>
  </head>
  <body>
    <div id="covenant-content"></div>
    <script>${runtimeSource}</script>
  </body>
</html>`
}

export interface FrameInitializeMessage {
  version: typeof GENERATED_BRIDGE_VERSION
  type: 'initialize'
  source: { html: string; css?: string; javascript?: string }
  state: Record<string, unknown>
  context: GeneratedThemeContext
  height: number
}
