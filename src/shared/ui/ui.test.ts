import { describe, expect, it } from 'vitest'
import {
  buildChartOption,
  describeChart,
  validateChartData,
  type ChartData,
  type ChartTheme
} from './chart'
import { describeUiSpec } from './describe'
import { validateGeneratedSource, isGeneratedState } from './generated'
import { UI_SPEC_VERSION, type UiSpec } from './spec'
import { normalizeUiParts, normalizeUiSurface, validateUiSpec } from './validate'

const chartTheme: ChartTheme = {
  palette: ['#8899aa', '#aa9988'],
  text: '#eee',
  muted: '#999',
  grid: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.1)',
  surface: '#111',
  fontFamily: 'system-ui',
  fontSize: 10,
  radius: 6,
  dark: true
}

const chart: ChartData = {
  title: 'Revenue by month',
  kind: 'line',
  categories: ['Jan', 'Feb', 'Mar'],
  series: [{ label: 'Revenue', values: [12, 18, 15] }],
  unit: 'USD k'
}

function specWith(elements: UiSpec['elements'], root = 'root'): UiSpec {
  return { version: UI_SPEC_VERSION, root, elements }
}

function issuesOf(value: unknown): string[] {
  const result = validateUiSpec(value)
  return result.ok ? [] : result.issues
}

describe('chart contract', () => {
  it('accepts aligned data', () => {
    expect(validateChartData(chart)).toEqual([])
  })

  it('rejects misaligned series', () => {
    const issues = validateChartData({
      ...chart,
      series: [{ label: 'Revenue', values: [1, 2] }]
    })
    expect(issues.join(' ')).toMatch(/must align/)
  })

  it('rejects non-finite values but allows null gaps', () => {
    expect(
      validateChartData({
        ...chart,
        series: [{ label: 'Revenue', values: [1, Number.NaN, 3] }]
      }).length
    ).toBeGreaterThan(0)
    expect(
      validateChartData({
        ...chart,
        series: [{ label: 'Revenue', values: [1, null, 3] }]
      })
    ).toEqual([])
  })

  it('rejects duplicate series labels', () => {
    expect(
      validateChartData({
        ...chart,
        series: [
          { label: 'Revenue', values: [1, 2, 3] },
          { label: 'Revenue', values: [3, 2, 1] }
        ]
      }).join(' ')
    ).toMatch(/duplicate series label/)
  })

  it('enforces pie rules: one non-negative series', () => {
    expect(
      validateChartData({ ...chart, kind: 'pie', series: [{ label: 'A', values: [-1, 2, 3] }] }).join(' ')
    ).toMatch(/negative/)
    expect(
      validateChartData({
        ...chart,
        kind: 'pie',
        series: [
          { label: 'A', values: [1, 2, 3] },
          { label: 'B', values: [1, 2, 3] }
        ]
      }).join(' ')
    ).toMatch(/exactly one series/)
  })

  it('describes data for text-only consumers', () => {
    const text = describeChart(chart)
    expect(text).toContain('Revenue by month')
    expect(text).toContain('Jan 12 USD k')
  })

  it('builds an option without exposing the library to the model', () => {
    const option = buildChartOption(chart, {
      palette: ['#8899aa'],
      text: '#eee',
      muted: '#999',
      grid: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.1)',
      surface: '#111',
      fontFamily: 'system-ui',
      fontSize: 10,
      radius: 6,
      dark: true
    })
    expect(option).toHaveProperty('series')
    expect(option).toHaveProperty('xAxis')
  })

  it('mixes bars and a trend line, with an optional second axis', () => {
    const option = buildChartOption(
      {
        ...chart,
        kind: 'bar',
        series: [
          { label: 'Revenue', values: [12, 18, 15] },
          { label: 'Growth', values: [4, 6, 5], as: 'line', axis: 'right' }
        ]
      },
      chartTheme
    )
    const series = option.series as Array<Record<string, unknown>>
    expect(series[0].type).toBe('bar')
    expect(series[1].type).toBe('line')
    expect(series[1].yAxisIndex).toBe(1)
    expect(Array.isArray(option.yAxis)).toBe(true)
    expect((option.yAxis as unknown[]).length).toBe(2)
  })

  it('only adds zoom when asked, and never for a pie', () => {
    const plain = buildChartOption(chart, chartTheme)
    expect(plain).not.toHaveProperty('dataZoom')

    const zoomed = buildChartOption({ ...chart, zoom: true }, chartTheme)
    expect(Array.isArray(zoomed.dataZoom)).toBe(true)
    expect(validateChartData({ ...chart, kind: 'pie', zoom: true }).join(' ')).toMatch(
      /zoom: not supported/
    )
  })

  it('rejects unknown series forms and axes', () => {
    const issues = validateChartData({
      ...chart,
      series: [{ label: 'Revenue', values: [1, 2, 3], as: 'scatter', axis: 'top' }]
    }).join(' ')
    expect(issues).toMatch(/as: must be one of/)
    expect(issues).toMatch(/axis: must be one of/)
  })
})

describe('spec validation', () => {
  const good: UiSpec = specWith({
    root: { type: 'Stack', props: { children: ['chart'] } },
    chart: { type: 'Chart', props: chart as unknown as Record<string, unknown> }
  })

  it('accepts a bounded tree', () => {
    expect(validateUiSpec(good).ok).toBe(true)
  })

  it('rejects unknown node types', () => {
    const issues = issuesOf(
      specWith({ root: { type: 'Html', props: {} } } as unknown as UiSpec['elements'])
    )
    expect(issues.join(' ')).toMatch(/unknown node type/)
  })

  it('rejects a missing root', () => {
    expect(issuesOf({ ...good, root: 'nope' }).join(' ')).toMatch(/does not exist|root/)
  })

  it('rejects unreachable nodes and multiple parents', () => {
    expect(
      issuesOf(
        specWith({
          root: { type: 'Stack', props: { children: ['a'] } },
          a: { type: 'Text', props: { text: 'one' } },
          b: { type: 'Text', props: { text: 'two' } }
        })
      ).join(' ')
    ).toMatch(/not reachable/)

    expect(
      issuesOf(
        specWith({
          root: { type: 'Stack', props: { children: ['a', 'b'] } },
          a: { type: 'Stack', props: { children: ['c'] } },
          b: { type: 'Stack', props: { children: ['c'] } },
          c: { type: 'Text', props: { text: 'shared' } }
        })
      ).join(' ')
    ).toMatch(/one parent/)
  })

  it('rejects reserved ids', () => {
    const elements = JSON.parse(
      JSON.stringify({
        root: { type: 'Text', props: { text: 'x' } },
        ['__proto__']: { type: 'Text', props: { text: 'y' } }
      })
    ) as UiSpec['elements']
    expect(Object.keys(elements)).toContain('__proto__')
    expect(issuesOf(specWith(elements)).join(' ')).toMatch(/reserved id/)
  })

  it('rejects unknown props', () => {
    expect(
      issuesOf(
        specWith({
          root: { type: 'Text', props: { text: 'x', onClick: 'steal()' } }
        } as unknown as UiSpec['elements'])
      ).join(' ')
    ).toMatch(/unsupported property/)
  })

  it('bounds the spec size', () => {
    const columns = Array.from({ length: 8 }, (_, index) => `c${index}`)
    const rows = Array.from({ length: 50 }, () =>
      Array.from({ length: 8 }, () => 'x'.repeat(160))
    )
    const issues = issuesOf(
      specWith({
        root: { type: 'Table', props: { columns, rows } }
      } as unknown as UiSpec['elements'])
    )
    expect(issues.join(' ')).toMatch(/byte limit/)
  })

  it('accepts a sparkline, a row action and a timeline', () => {
    const spec = specWith({
      root: { type: 'Stack', props: { children: ['metrics', 'table', 'steps'] } },
      metrics: {
        type: 'Metric',
        props: { items: [{ label: 'ARR', value: 1.2, sparkline: [1, 2, null, 3] }] }
      },
      table: {
        type: 'Table',
        props: {
          columns: ['Run', 'Status'],
          rows: [['nightly-1', 'Passed']],
          rowAction: { label: 'Explain', prompt: 'Why did {row} end as {row.1}?' }
        }
      },
      steps: {
        type: 'Timeline',
        props: {
          variant: 'steps',
          items: [
            { label: 'Back up', state: 'done', meta: '2 min' },
            { label: 'Migrate', state: 'current', detail: 'Runs while you read this' }
          ]
        }
      }
    } as unknown as UiSpec['elements'])

    expect(issuesOf(spec)).toEqual([])
    const text = describeUiSpec(spec)
    expect(text).toContain('Metrics: ARR 1.2, trend 1 → 3')
    expect(text).toContain('Timeline: 1. Back up (2 min) ✓; 2. Migrate — Runs while you read this →')
  })

  it('rejects a one-point sparkline and a malformed row action', () => {
    const issues = issuesOf(
      specWith({
        root: { type: 'Stack', props: { children: ['metrics', 'table'] } },
        metrics: {
          type: 'Metric',
          props: { items: [{ label: 'ARR', value: 1, sparkline: [3] }] }
        },
        table: {
          type: 'Table',
          props: {
            columns: ['Run'],
            rows: [['nightly-1']],
            rowAction: { label: '', prompt: '' }
          }
        }
      } as unknown as UiSpec['elements'])
    ).join(' ')
    expect(issues).toMatch(/sparkline: at least two points/)
    expect(issues).toMatch(/rowAction\/label/)
    expect(issues).toMatch(/rowAction\/prompt/)
  })

  it('bounds the timeline', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ label: `step ${index}` }))
    const issues = issuesOf(
      specWith({
        root: { type: 'Timeline', props: { items, state: 'done' } }
      } as unknown as UiSpec['elements'])
    ).join(' ')
    expect(issues).toMatch(/at most 8 steps/)
    expect(issues).toMatch(/unsupported property/)
  })

  it('normalizes surfaces for replay and drops invalid ones', () => {
    const surface = normalizeUiSurface({
      id: 'surface-1',
      revision: 2,
      status: 'ready',
      createdAt: 1,
      spec: good
    })
    expect(surface?.status).toBe('ready')

    expect(
      normalizeUiSurface({ id: 'surface-1', revision: 1, spec: { version: 'ui-v1', root: 'x' } })
    ).toBeNull()
  })

  it('keeps only valid parts', () => {
    const parts = normalizeUiParts([
      { id: 'p1', kind: 'surface', surface: { id: 's1', revision: 1, spec: good } },
      { id: 'p2', kind: 'surface', surface: { id: 's2', revision: 1, spec: { root: 'missing' } } },
      { id: 'p3', kind: 'text', text: 'ignored' }
    ])
    expect(parts).toHaveLength(1)
    expect(parts?.[0].id).toBe('p1')
  })

  it('describes a surface for text consumers', () => {
    const text = describeUiSpec(good)
    expect(text).toContain('Revenue by month')
  })
})

describe('generated contract', () => {
  const source = {
    title: 'Reading time',
    html: '<p>Hello</p>',
    css: 'p { color: var(--chat-assistant-text) }',
    javascript: 'document.body.dataset.ready = "1"',
    fallback: 'You read 125 minutes this week.'
  }

  it('accepts a bounded source', () => {
    expect(validateGeneratedSource(source)).toEqual([])
  })

  it('requires a fallback', () => {
    expect(validateGeneratedSource({ ...source, fallback: '' }).join(' ')).toMatch(/fallback/)
  })

  it('bounds state to small JSON', () => {
    expect(isGeneratedState({ minutes: 30 })).toBe(true)
    expect(isGeneratedState([])).toBe(false)
    expect(isGeneratedState({ big: 'x'.repeat(20_000) })).toBe(false)
  })

  it('validates fields', () => {
    expect(
      validateGeneratedSource({
        ...source,
        fields: [{ name: 'goal', label: 'Goal', type: 'select' }]
      }).join(' ')
    ).toMatch(/needs at least one option/)
  })
})
