/**
 * Chart entry for the generated sandbox. Bundled by esbuild as a standalone
 * IIFE and injected into the frame only when authored code calls
 * `Covenant.chart(...)` — the ECharts engine never ships in the bootstrap.
 */

import { chartEngine } from '../charts/chartEngine'

window.covenantChartsRuntime = { chartEngine }

export {}
