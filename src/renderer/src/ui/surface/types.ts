import { createContext, useContext } from 'react'
import type { UiSpec } from '../../../../shared/ui/spec'

export interface SurfaceContextValue {
  spec: UiSpec
  surfaceId: string
  revision: number
  /** Visuals in old messages stay readable but not actionable. */
  interactive: boolean
  onAction: (prompt: string) => void
  /** Render a child node by id. Supplied by the surface renderer. */
  renderNode: (id: string) => JSX.Element | null
}

export const SurfaceContext = createContext<SurfaceContextValue | null>(null)

export function useSurfaceContext(): SurfaceContextValue {
  const value = useContext(SurfaceContext)
  if (!value) {
    return {
      spec: { version: 'ui-v1', root: '', elements: {} },
      surfaceId: '',
      revision: 1,
      interactive: false,
      onAction: () => undefined,
      renderNode: () => null
    }
  }
  return value
}

export interface NodeViewProps {
  nodeId: string
}
