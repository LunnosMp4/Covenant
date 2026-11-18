// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UI_SPEC_VERSION, type UiSpec, type UiSurface } from '../../../../shared/ui/spec'
import SurfaceRenderer from './SurfaceRenderer'

vi.mock('./charts/chartEngine', () => ({
  chartEngine: {
    create: () => ({
      setOption: () => undefined,
      resize: () => undefined,
      refresh: () => undefined,
      dispose: () => undefined
    }),
    disposeAll: () => undefined
  }
}))

afterEach(() => {
  cleanup()
})

function surface(spec: UiSpec, overrides: Partial<UiSurface> = {}): UiSurface {
  return {
    id: 'surface-test',
    revision: 1,
    status: 'ready',
    createdAt: 1,
    spec,
    ...overrides
  }
}

describe('SurfaceRenderer', () => {
  it('renders a table from validated data', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'table',
      elements: {
        table: {
          type: 'Table',
          props: {
            title: 'Plans',
            columns: ['Plan', 'Price'],
            rows: [
              ['Free', '$0'],
              ['Pro', '$20']
            ]
          }
        }
      }
    }

    render(<SurfaceRenderer surface={surface(spec)} interactive={false} onAction={() => undefined} />)

    expect(screen.getByText('Plans')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
  })

  it('only lets the latest surface act, and sends the prompt', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'stack',
      elements: {
        stack: { type: 'Stack', props: { children: ['actions'], gap: 'sm' } },
        actions: {
          type: 'Actions',
          props: { prompts: [{ label: 'Forecast Q4', prompt: 'Forecast Q4 at 8% growth' }] }
        }
      }
    }

    const onAction = vi.fn()
    const { rerender } = render(
      <SurfaceRenderer surface={surface(spec)} interactive={false} onAction={onAction} />
    )

    const button = screen.getByRole('button', { name: 'Forecast Q4' })
    expect(button.hasAttribute('disabled')).toBe(true)

    rerender(<SurfaceRenderer surface={surface(spec)} interactive onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forecast Q4' }))
    expect(onAction).toHaveBeenCalledWith('Forecast Q4 at 8% growth')
  })

  it('falls back to readable text when the spec is invalid', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'missing',
      elements: {
        text: { type: 'Text', props: { text: 'unreachable' } }
      }
    }

    render(<SurfaceRenderer surface={surface(spec)} interactive={false} onAction={() => undefined} />)
    expect(screen.getByText(/could not be displayed/i)).toBeTruthy()
  })

  it('renders chart data access without a canvas', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'chart',
      elements: {
        chart: {
          type: 'Chart',
          props: {
            title: 'Revenue',
            kind: 'bar',
            categories: ['Jan', 'Feb'],
            series: [{ label: 'Revenue', values: [10, 12] }],
            unit: 'USD k'
          }
        }
      }
    }

    render(<SurfaceRenderer surface={surface(spec)} interactive={false} onAction={() => undefined} />)
    expect(screen.getByRole('img', { name: /Revenue/ })).toBeTruthy()
    expect(screen.getByText('View data')).toBeTruthy()
  })

  it('renders a timeline with its states', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'plan',
      elements: {
        plan: {
          type: 'Timeline',
          props: {
            title: 'Sunday roast',
            items: [
              { label: 'Beef in', meta: '17:20', state: 'current' },
              { label: 'Rest', detail: 'Twenty minutes, covered' }
            ]
          }
        }
      }
    }

    render(<SurfaceRenderer surface={surface(spec)} interactive={false} onAction={() => undefined} />)
    expect(screen.getByText('Beef in')).toBeTruthy()
    expect(screen.getByText('17:20')).toBeTruthy()
    expect(screen.getByText('Twenty minutes, covered')).toBeTruthy()
  })

  it('expands a surface into a dialog and closes it again', () => {
    const spec: UiSpec = {
      version: UI_SPEC_VERSION,
      root: 'table',
      elements: {
        table: {
          type: 'Table',
          props: {
            title: 'Runs',
            columns: ['Run', 'Status'],
            rows: [['nightly-1', 'Passed']]
          }
        }
      }
    }

    render(<SurfaceRenderer surface={surface(spec)} interactive onAction={() => undefined} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    // The panel renders the same tree a second time.
    expect(screen.getAllByText('Runs')).toHaveLength(2)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
