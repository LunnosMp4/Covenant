/** A CSS-pixel rectangle reported by the renderer for click-through hit tests. */
export interface InteractiveRect {
  x: number
  y: number
  width: number
  height: number
}

/** The renderer viewport size, used to map CSS pixels onto window DIPs. */
export interface InteractiveViewport {
  width: number
  height: number
}

export interface InteractiveRegionsPayload {
  regions: InteractiveRect[]
  viewport: InteractiveViewport
}
