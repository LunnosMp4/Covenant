/**
 * Geometry and luminance maths for the dot-matrix voice visualiser.
 *
 * The panel is a low-resolution LED grid with a single curve running through
 * it. The curve's amplitude follows the microphone loudness, so silence leaves
 * a flat thread and speech stretches it across the panel. Each dot lights by
 * how close it sits to the curve: a sharp core draws the line itself, a wide
 * halo gives it the glow.
 */

/** LEDs stacked vertically. */
export const PANEL_ROWS = 10
/** Horizontal distance between LEDs, in CSS pixels. */
export const PANEL_PITCH = 4
/** Width of the bright line, in normalised panel units (the panel is 2 units tall). */
export const LINE_SHARPNESS = 0.113
/** Strength of the halo around the line. */
export const LINE_GLOW = 0.28

/** Unlit LED floor. */
export const BASE_LEVEL = 0.06
/** Halo spread, in normalised panel units. */
const HALO_SPREAD = 0.42
/** Vertical scale of the curve. */
const WAVE_SCALE = 0.85
/** Horizontal margins, in pixels, that stay dark so dots never run under the controls. */
export const EDGE_LEFT_PX = 30
export const EDGE_RIGHT_PX = 40
/** Width of the fade ramp after each margin. */
export const EDGE_FADE_PX = 64
/** Curve amplitude at silence and at full loudness. */
const SILENCE_AMPLITUDE = 0.07
const LEVEL_AMPLITUDE = 0.95

/** Intro assembly timeline: columns start left to right, each dot then rises. */
export const INTRO_SWEEP_MS = 280
export const INTRO_DOT_MS = 320
export const INTRO_TOTAL_MS = INTRO_SWEEP_MS + INTRO_DOT_MS

const MIN_COLUMNS = 2

// The two Gaussians are evaluated per dot, so fold the divisors into multipliers.
const INV_SHARPNESS_SQ = 1 / (LINE_SHARPNESS * LINE_SHARPNESS)
const INV_HALO_SQ = 1 / (HALO_SPREAD * HALO_SPREAD)

/** Everything the render loop needs, with the layout-only maths precomputed. */
export interface PanelFrame {
  width: number
  height: number
  cols: number
  rows: number
  radius: number
  /** Normalised x (0..1) per column. */
  xs: Float32Array
  /** Pixel x of each dot centre, per column. */
  centres: Float32Array
  /** Edge fade per column. */
  edges: Float32Array
  /** Normalised y (-1..1) per row. */
  rowYs: Float32Array
  /** Pixel y of each dot centre, per row. */
  rowPixels: Float32Array
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Hermite smoothstep. Handles a descending range (`edge0 > edge1`) too. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Exponential smoothing with a different time constant for rising and falling
 * values. Fast attack / slow release keeps the curve responsive without
 * jittering on individual syllables.
 */
export function approach(
  current: number,
  target: number,
  dt: number,
  attackTau: number,
  releaseTau: number
): number {
  if (!Number.isFinite(dt) || dt <= 0) return current
  const tau = target > current ? attackTau : releaseTau
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}

/** Three travelling sines: the shape of the curve at time `t`, ranging ~[-1, 1]. */
export function waveCurve(x: number, t: number): number {
  const xd = x + t * 0.08
  return (
    0.6 * Math.sin(xd * 5.0 + t * 2.1) +
    0.3 * Math.sin(xd * 11.0 - t * 3.3) +
    0.15 * Math.sin(xd * 23.0 + t * 5.0)
  )
}

/**
 * Vertical position of the curve at `x` (0..1), in normalised panel units
 * (-1..1). `sin(πx)` pins both ends to the centre, which produces the lens
 * shape, and loudness stretches the whole curve.
 */
export function waveY(x: number, t: number, level: number): number {
  const amplitude =
    (SILENCE_AMPLITUDE + clamp01(level) * LEVEL_AMPLITUDE) * Math.sin(Math.PI * x) * WAVE_SCALE
  return waveCurve(x, t) * amplitude
}

/** Fades the grid out before it reaches the bar's controls. */
export function panelEdge(x: number, width: number): number {
  const px = clamp01(x) * Math.max(0, width)
  return (
    smoothstep(EDGE_LEFT_PX, EDGE_LEFT_PX + EDGE_FADE_PX, px) *
    smoothstep(width - EDGE_RIGHT_PX, width - EDGE_RIGHT_PX - EDGE_FADE_PX, px)
  )
}

/** Final 0..1 luminance of one dot, given its row and the curve position. */
export function dotLevel(rowY: number, curveY: number): number {
  const distance = rowY - curveY
  const squared = distance * distance
  const value =
    Math.exp(-squared * INV_SHARPNESS_SQ) + Math.exp(-squared * INV_HALO_SQ) * LINE_GLOW
  return value > 1 ? 1 : value < BASE_LEVEL ? BASE_LEVEL : value
}

/**
 * Builds the layout plus the per-row / per-column values the loop reads each
 * frame. Cells stay square so the matrix reads the same at any bar width; on a
 * bar too short for the requested pitch the cells shrink instead of stretching.
 */
export function panelFrame(width: number, height: number): PanelFrame {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  const cols = Math.max(MIN_COLUMNS, Math.floor(safeWidth / PANEL_PITCH))
  const rows = Math.max(2, PANEL_ROWS)
  const cell = Math.min(PANEL_PITCH, safeHeight / rows)
  const offsetX = (safeWidth - cols * PANEL_PITCH) / 2
  const offsetY = (safeHeight - cell * rows) / 2

  const xs = new Float32Array(cols)
  const centres = new Float32Array(cols)
  const edges = new Float32Array(cols)
  for (let column = 0; column < cols; column++) {
    const x = cols > 1 ? column / (cols - 1) : 0
    xs[column] = x
    centres[column] = offsetX + column * PANEL_PITCH + PANEL_PITCH / 2
    edges[column] = panelEdge(x, safeWidth)
  }

  const rowYs = new Float32Array(rows)
  const rowPixels = new Float32Array(rows)
  for (let row = 0; row < rows; row++) {
    rowYs[row] = (row / (rows - 1)) * 2 - 1
    rowPixels[row] = offsetY + row * cell + cell / 2
  }

  return {
    width: safeWidth,
    height: safeHeight,
    cols,
    rows,
    radius: Math.min(PANEL_PITCH, cell) * 0.3,
    xs,
    centres,
    edges,
    rowYs,
    rowPixels
  }
}

/**
 * Assembly progress of one column during the intro: 0 before it starts, 1 once
 * the dot has settled. Columns are staggered left to right.
 */
export function introProgress(elapsedMs: number, column: number, cols: number): number {
  if (elapsedMs >= INTRO_TOTAL_MS) return 1
  if (elapsedMs <= 0) return 0
  const delay = (column / Math.max(1, cols - 1)) * INTRO_SWEEP_MS
  const raw = clamp01((elapsedMs - delay) / INTRO_DOT_MS)
  const inverse = 1 - raw
  return 1 - inverse * inverse * inverse
}
