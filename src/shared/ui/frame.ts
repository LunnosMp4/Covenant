/**
 * Static bootstrap document for a generated surface, plus its design system.
 *
 * The document is written next to the chart engine and loaded by URL, not from a
 * blob: `blob:` and `data:` documents inherit the app's CSP, whose `script-src
 * 'self'` silently blocks the frame's script — the frame then never announces
 * itself and the host times out ("The visual did not start in time"). A real URL
 * gets its own policy (the CSP below), while `sandbox="allow-scripts"` (no
 * `allow-same-origin`) still gives the frame an opaque origin: it can run its own
 * code but cannot read the host DOM, storage, cookies, or the preload API.
 *
 * `FRAME_STYLES` is the *only* styling layer: the model composes `cv-*` classes
 * and the generated CSS is restricted to layout (see `generatedValidation.ts`),
 * so every surface inherits the same type scale, spacing rhythm, radii and
 * colours from the app tokens — including after a theme switch.
 */

export const FRAME_FILE = 'frame.html'

const FRAME_CSP = [
  "default-src 'none'",
  // `'self'` loads the runtime asset; `'unsafe-inline'` runs the authored script
  // and the injected chart engine. Inline execution is inherent to the sandbox
  // contract — the boundary is the opaque origin plus `connect-src 'none'`.
  "script-src 'self' 'unsafe-inline'",
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
/* Reset ------------------------------------------------------------------- */
:root { color-scheme: dark light; -webkit-text-size-adjust: 100%; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: var(--ui-font, system-ui, sans-serif);
  font-size: var(--ui-font-size-md, 13px);
  line-height: var(--ui-leading-normal, 1.5);
  color: var(--chat-assistant-text, #eee);
  overflow-x: hidden;
}
#covenant-content { display: flow-root; }

/* Element defaults are weak (:where), so the kit below always wins --------- */
:where(h1, h2, h3, h4) {
  margin: 0 0 var(--ui-space-sm, 8px);
  font-weight: var(--ui-weight-semibold, 600);
  letter-spacing: -0.01em;
  line-height: var(--ui-leading-tight, 1.25);
}
:where(h1) { font-size: var(--ui-font-size-lg, 15px); }
:where(h2) { font-size: var(--ui-font-size-md, 13px); }
:where(h3, h4) { font-size: var(--ui-font-size-sm, 11.5px); color: var(--chat-meta-text, #999); }
:where(p) { margin: 0 0 var(--ui-space-sm, 8px); }
:where(p:last-child) { margin-bottom: 0; }
:where(ul, ol) { margin: 0 0 var(--ui-space-sm, 8px); padding-left: 18px; }
:where(li) { margin: 0 0 var(--ui-space-2xs, 2px); }
:where(small) { color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }
:where(a) { color: var(--chat-accent, #8ab4f8); text-decoration: none; }
:where(hr) {
  border: 0;
  border-top: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
  margin: var(--ui-space-md, 12px) 0;
}
:where(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
:where(table) { border-collapse: collapse; }
:where(button, input, select, textarea) { font: inherit; }

/* Page shell --------------------------------------------------------------- */
.cv-surface {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-md, 12px);
  min-width: 0;
}

/* Type --------------------------------------------------------------------- */
.cv-h1 {
  margin: 0;
  font-size: var(--ui-font-size-lg, 15px);
  font-weight: var(--ui-weight-semibold, 600);
  line-height: var(--ui-leading-tight, 1.25);
  letter-spacing: -0.012em;
  color: var(--chat-assistant-text, #eee);
}
.cv-h2 {
  margin: 0;
  font-size: var(--ui-font-size-md, 13px);
  font-weight: var(--ui-weight-semibold, 600);
  line-height: var(--ui-leading-tight, 1.25);
  letter-spacing: -0.006em;
  color: var(--chat-assistant-text, #eee);
}
.cv-h3 {
  margin: 0;
  font-size: var(--ui-font-size-sm, 11.5px);
  font-weight: var(--ui-weight-semibold, 600);
  line-height: var(--ui-leading-normal, 1.5);
  letter-spacing: 0.002em;
  color: var(--chat-meta-text, #999);
}
.cv-body {
  margin: 0;
  font-size: var(--ui-font-size-md, 13px);
  line-height: var(--ui-leading-normal, 1.5);
  color: var(--chat-assistant-text, #eee);
}
.cv-caption {
  margin: 0;
  font-size: var(--ui-font-size-xs, 10.5px);
  line-height: 1.45;
  letter-spacing: 0.004em;
  color: var(--chat-meta-text, #999);
}
.cv-label {
  font-size: var(--ui-font-size-xs, 10.5px);
  font-weight: var(--ui-weight-medium, 500);
  line-height: 1.35;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--chat-meta-text, #999);
}
.cv-note { margin: 0; font-size: var(--ui-font-size-xs, 10.5px); color: var(--chat-meta-text, #999); }
.cv-num { font-variant-numeric: tabular-nums; }

/* Layout ------------------------------------------------------------------- */
.cv-row { display: flex; flex-wrap: wrap; gap: var(--ui-space-sm, 8px); align-items: center; min-width: 0; }
.cv-row--between { justify-content: space-between; }
.cv-grid { display: grid; gap: var(--ui-space-sm, 8px); min-width: 0; }
.cv-grid--auto { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.cv-split { display: grid; gap: var(--ui-space-sm, 8px); grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); min-width: 0; }
.cv-stack { display: flex; flex-direction: column; gap: var(--ui-space-md, 12px); min-width: 0; }
.cv-stack--sm { gap: var(--ui-space-sm, 8px); }
.cv-stack--lg { gap: var(--ui-space-lg, 16px); }
.cv-section { display: flex; flex-direction: column; gap: var(--ui-space-sm, 8px); min-width: 0; }
.cv-divider { height: 1px; background: var(--chat-assistant-border, rgba(255,255,255,0.08)); border: 0; margin: 0; }

/* Surfaces ----------------------------------------------------------------- */
.cv-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm, 8px);
  padding: var(--ui-space-md, 12px);
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
  border-radius: var(--ui-radius-md, 10px);
  min-width: 0;
}
.cv-card--plain { padding: 0; border: 0; }

/* Data --------------------------------------------------------------------- */
.cv-kpi-row {
  display: grid;
  gap: var(--ui-space-sm, 8px);
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  min-width: 0;
}
.cv-kpi { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cv-kpi-label {
  font-size: var(--ui-font-size-xs, 10.5px);
  font-weight: var(--ui-weight-medium, 500);
  letter-spacing: 0.01em;
  color: var(--chat-meta-text, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cv-kpi-value {
  font-size: 17px;
  font-weight: var(--ui-weight-semibold, 600);
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--chat-assistant-text, #eee);
}
.cv-kpi-unit {
  font-size: var(--ui-font-size-xs, 10.5px);
  font-weight: var(--ui-weight-medium, 500);
  color: var(--chat-meta-text, #999);
}
.cv-kpi-hint { font-size: 10px; color: var(--chat-meta-text, #999); }
.cv-kpi-delta { font-size: var(--ui-font-size-xs, 10.5px); font-variant-numeric: tabular-nums; color: var(--chat-meta-text, #999); }
.cv-kpi-delta[data-tone="positive"] { color: var(--ui-positive, #7FB08C); }
.cv-kpi-delta[data-tone="negative"] { color: var(--ui-negative, #D08A7D); }

.cv-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.1));
  border-radius: var(--ui-radius-pill, 999px);
  font-size: 10px;
  font-weight: var(--ui-weight-medium, 500);
  letter-spacing: 0.01em;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--chat-meta-text, #999);
}
.cv-badge[data-tone="positive"] { color: var(--ui-positive, #7FB08C); border-color: var(--ui-positive, #7FB08C); }
.cv-badge[data-tone="negative"] { color: var(--ui-negative, #D08A7D); border-color: var(--ui-negative, #D08A7D); }
.cv-badge[data-tone="accent"] { color: var(--chat-assistant-text, #eee); border-color: var(--chat-accent-strong, rgba(255,255,255,0.2)); background: var(--chat-accent-soft, rgba(255,255,255,0.1)); }

.cv-table { width: 100%; border-collapse: collapse; font-size: var(--ui-font-size-sm, 11.5px); line-height: 1.4; }
.cv-table th, .cv-table td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
  text-align: left;
  vertical-align: top;
}
.cv-table th {
  font-size: var(--ui-font-size-xs, 10.5px);
  font-weight: var(--ui-weight-medium, 500);
  letter-spacing: 0.01em;
  color: var(--chat-meta-text, #999);
  white-space: nowrap;
}
.cv-table td[data-align="right"], .cv-table th[data-align="right"] {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cv-table tr:last-child td { border-bottom: 0; }

.cv-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.cv-list > li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-sm, 8px);
  padding: 4px 0;
  border-bottom: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
}
.cv-list > li:last-child { border-bottom: 0; }
.cv-list-value { font-variant-numeric: tabular-nums; color: var(--chat-assistant-text, #eee); }

/* Feedback ----------------------------------------------------------------- */
.cv-callout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-sm, 8px) var(--ui-space-md, 12px);
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.08));
  border-left-width: 2px;
  border-left-color: var(--chat-accent, #8ab4f8);
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--chat-assistant-bg, rgba(255,255,255,0.035));
}
.cv-callout[data-tone="positive"] { border-left-color: var(--ui-positive, #7FB08C); }
.cv-callout[data-tone="danger"] { border-left-color: var(--ui-negative, #D08A7D); }
.cv-callout-title { font-size: var(--ui-font-size-sm, 11.5px); font-weight: var(--ui-weight-semibold, 600); color: var(--chat-assistant-text, #eee); }
.cv-callout-body { margin: 0; font-size: var(--ui-font-size-sm, 11.5px); line-height: 1.45; color: var(--chat-meta-text, #999); }

.cv-disclosure { margin-top: var(--ui-space-sm, 8px); color: var(--chat-meta-text, #999); font-size: var(--ui-font-size-xs, 10.5px); }
.cv-disclosure summary { cursor: pointer; width: fit-content; }
.cv-disclosure summary:focus-visible { outline: 2px solid var(--chat-accent, #8ab4f8); outline-offset: 2px; border-radius: 3px; }

/* Controls ----------------------------------------------------------------- */
.cv-button {
  appearance: none;
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--chat-assistant-text, #eee);
  border-radius: var(--ui-radius-pill, 999px);
  padding: 5px 11px;
  font: inherit;
  font-size: var(--ui-font-size-sm, 11.5px);
  font-weight: var(--ui-weight-medium, 500);
  line-height: 1.5;
  cursor: pointer;
  transition: background-color 120ms ease, transform 100ms ease;
}
.cv-button:hover { background: var(--chat-accent-soft, rgba(255,255,255,0.08)); }
.cv-button:active { transform: scale(0.97); }
.cv-button:focus-visible { outline: 2px solid var(--chat-accent, #8ab4f8); outline-offset: 2px; }
.cv-button:disabled { opacity: 0.45; cursor: default; }
.cv-button[data-variant="primary"] {
  background: var(--chat-accent-soft, rgba(255,255,255,0.1));
  border-color: var(--chat-accent-strong, rgba(255,255,255,0.2));
}

.cv-input, .cv-select {
  appearance: none;
  border: 1px solid var(--chat-assistant-border, rgba(255,255,255,0.1));
  background: transparent;
  color: inherit;
  border-radius: var(--ui-radius-sm, 6px);
  padding: 4px 8px;
  font: inherit;
  font-size: var(--ui-font-size-sm, 11.5px);
  line-height: 1.5;
  min-width: 0;
}
.cv-input:focus-visible, .cv-select:focus-visible { outline: 2px solid var(--chat-accent, #8ab4f8); outline-offset: 1px; }

.cv-field { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-sm, 8px); min-width: 0; }
.cv-field-label { font-size: var(--ui-font-size-xs, 10.5px); font-weight: var(--ui-weight-medium, 500); letter-spacing: 0.01em; color: var(--chat-meta-text, #999); }
.cv-field output { font-variant-numeric: tabular-nums; color: var(--chat-assistant-text, #eee); }

.cv-range { width: 100%; accent-color: var(--chat-accent, #8ab4f8); }

.cv-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: var(--ui-font-size-sm, 11.5px); }
.cv-toggle input { accent-color: var(--chat-accent, #8ab4f8); }

.cv-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-xs, 4px); align-items: center; }

/* Charts ------------------------------------------------------------------- */
.cv-chart { width: 100%; height: 190px; min-width: 0; }
.cv-chart[data-height="tall"] { height: 240px; }
.cv-chart[data-height="short"] { height: 150px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`

/**
 * The document written to {@link FRAME_FILE} beside the chart engine.
 *
 * The runtime is inlined rather than referenced: a sandboxed frame has an opaque
 * origin, and Chromium refuses to load `file:` subresources from one — an
 * external `<script src>` works in dev and is silently blocked in a packaged
 * build. Inline execution is already part of the contract (the authored script
 * runs inline), so inlining the runtime adds no capability.
 */
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
