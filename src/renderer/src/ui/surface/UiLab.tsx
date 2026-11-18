import { useEffect, useMemo, useState } from 'react'
import { THEME_OPTIONS, getThemeMode } from '../../../../shared/theme/theme'
import { UI_SPEC_VERSION, type UiSpec, type UiSurface } from '../../../../shared/ui/spec'
import { applyThemeToDocument } from '../../utils/themeDom'
import SurfaceRenderer from './SurfaceRenderer'

function surface(id: string, spec: UiSpec): UiSurface {
  return { id, revision: 1, status: 'ready', createdAt: 1, spec }
}

const LINE: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { children: ['chart'], gap: 'sm' } },
    chart: {
      type: 'Chart',
      props: {
        title: 'Monthly token usage',
        description: 'November is a partial month.',
        kind: 'line',
        categories: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
        series: [{ label: 'Tokens', values: [412, 468, 441, 519, 287] }],
        unit: 'k',
        valueFormat: 'compact',
        highlight: 'Nov'
      }
    }
  }
}

const BARS: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        title: 'Revenue by region',
        kind: 'bar',
        categories: ['Asia Pacific', 'Europe', 'North America'],
        series: [
          { label: 'Q2', values: [182, 141, 205] },
          { label: 'Q3', values: [204, 132, 228] }
        ],
        unit: 'USD k'
      }
    }
  }
}

const COMBO: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        title: 'Revenue and growth',
        description: 'Bars are revenue; the line is year-over-year growth.',
        kind: 'bar',
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
        series: [
          {
            label: 'Revenue',
            values: [182, 176, 195, 201, 214, 208, 226, 232, 241, 255]
          },
          {
            label: 'Growth',
            values: [4, 3, 6, 7, 9, 8, 10, 11, 12, 13],
            as: 'line',
            axis: 'right'
          }
        ],
        unit: 'USD k',
        zoom: true,
        valueFormat: 'number'
      }
    }
  }
}

const PIE: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        title: 'Where the time went',
        kind: 'donut',
        categories: ['Build', 'Review', 'Meetings', 'Writing'],
        series: [{ label: 'Hours', values: [18, 7, 9, 6] }],
        unit: 'h'
      }
    }
  }
}

const METRICS: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { children: ['metrics', 'compare'], gap: 'md' } },
    metrics: {
      type: 'Metric',
      props: {
        items: [
          {
            label: 'ARR',
            value: 1_240_000,
            unit: 'USD',
            format: 'compact',
            delta: { value: 12, sentiment: 'positive' },
            sparkline: [720, 780, 810, 900, 960, 1_020, 1_100, 1_240]
          },
          {
            label: 'Active teams',
            value: 184,
            delta: { value: 4, sentiment: 'positive' },
            sparkline: [148, 152, 149, 165, 171, 176, 180, 184]
          },
          {
            label: 'Churn',
            value: 2.4,
            format: 'percent',
            delta: { value: -0.6, sentiment: 'positive' },
            sparkline: [3.4, 3.2, 3.1, 2.9, 2.7, 2.6, 2.5, 2.4]
          }
        ]
      }
    },
    compare: {
      type: 'Compare',
      props: {
        title: 'Plans',
        options: ['Free', 'Pro', 'Team'],
        criteria: [
          { label: 'Price', values: ['$0', '$20', '$40'] },
          { label: 'Projects', values: ['3', 'Unlimited', 'Unlimited'] },
          { label: 'Shared views', values: ['—', '—', 'Yes'] }
        ]
      }
    }
  }
}

const TABLE: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'table',
  elements: {
    table: {
      type: 'Table',
      props: {
        title: 'Recent runs',
        columns: ['Run', 'Status', 'Duration'],
        rows: [
          ['nightly-2411', 'Passed', '1m 42s'],
          ['nightly-2410', 'Passed', '1m 39s'],
          ['nightly-2409', 'Failed', '0m 51s'],
          ['nightly-2408', 'Passed', '1m 45s'],
          ['nightly-2407', 'Passed', '1m 41s'],
          ['nightly-2406', 'Passed', '1m 38s'],
          ['nightly-2405', 'Passed', '1m 40s'],
          ['nightly-2404', 'Failed', '0m 47s'],
          ['nightly-2403', 'Passed', '1m 43s']
        ],
        align: ['left', 'left', 'right'],
        rowAction: { label: 'Explain', prompt: 'Why did {row} end as {row.1} ({row.2})?' }
      }
    }
  }
}

const TIMELINE: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { children: ['plan'], gap: 'sm' } },
    plan: {
      type: 'Timeline',
      props: {
        title: 'Sunday roast',
        caption: 'Everything lands at 19:30.',
        variant: 'timeline',
        items: [
          { label: 'Score and salt the beef', meta: '16:45', state: 'done' },
          { label: 'Oven on at 220°C', meta: '17:00', state: 'done' },
          { label: 'Beef in, then baste every 20 min', meta: '17:20', state: 'current' },
          { label: 'Potatoes in the lower shelf', meta: '18:15' },
          { label: 'Rest for 20 minutes, make gravy', meta: '19:10' }
        ]
      }
    }
  }
}

const ACTIONS: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'root',
  elements: {
    root: {
      type: 'Stack',
      props: { children: ['text', 'actions'], gap: 'sm' }
    },
    text: { type: 'Text', props: { text: 'November is a partial month, so the drop is expected.', tone: 'body' } },
    actions: {
      type: 'Actions',
      props: {
        prompts: [
          { label: 'Compare to October', prompt: 'Compare November to October, adjusting for the partial month.' },
          { label: 'Forecast December', prompt: 'Forecast December usage from the last five months.' }
        ]
      }
    }
  }
}

const GENERATED: UiSpec = {
  version: UI_SPEC_VERSION,
  root: 'visual',
  elements: {
    visual: {
      type: 'Generated',
      props: {
        title: 'A little room for reading',
        height: 400,
        fallback:
          'Reading time: Monday 20 min, Tuesday 35 min, Wednesday 25 min, Thursday 45 min. ' +
          'Total 125 min; average 31.25 min per day. Choose a daily goal between 10 and 60 minutes.',
        html: `
          <div id="reading-surface" class="cv-surface"></div>
        `,
        css: `
          #reading-surface .cv-chart { margin-top: var(--ui-space-xs); }
        `,
        javascript: `
          const surface = document.getElementById('reading-surface')
          const saved = Covenant.state.get()

          const goal = Covenant.ui.range({
            min: 10,
            max: 60,
            step: 5,
            value: saved.minutes || 30,
            ariaLabel: 'Daily reading goal'
          })
          const goalField = Covenant.ui.field('Daily goal', goal, '30 min')
          const output = goalField.querySelector('output')
          const chartSlot = Covenant.ui.chartSlot('default', 'Reading minutes by day')

          surface.append(
            Covenant.ui.metricRow([
              { label: 'This week', value: 125, unit: 'min', hint: '4 sessions' },
              { label: 'Daily average', value: 31.3, unit: 'min', delta: { value: 6, tone: 'positive' } }
            ]),
            chartSlot,
            goalField,
            Covenant.ui.callout(
              'Two days below the goal',
              'Monday and Wednesday trail the average; Thursday already carries the week.',
              'info'
            ),
            Covenant.ui.actions(
              Covenant.ui.button('Plan around this goal', {
                variant: 'primary',
                onClick: () => Covenant.submit({ minutes: Number(goal.value) })
              })
            )
          )

          await Covenant.chart(chartSlot, {
            title: 'Reading minutes',
            kind: 'bar',
            categories: ['Mon', 'Tue', 'Wed', 'Thu'],
            series: [{ label: 'Reading', values: [20, 35, 25, 45] }],
            unit: 'min',
            height: 190
          })

          function update() {
            output.textContent = goal.value + ' min'
            Covenant.state.set({ minutes: Number(goal.value) })
          }

          goal.addEventListener('input', update)
          update()
        `
      }
    }
  }
}

const SECTIONS: Array<{ title: string; spec: UiSpec }> = [
  { title: 'Line · trend with a highlighted partial period', spec: LINE },
  { title: 'Bar · grouped comparison', spec: BARS },
  { title: 'Combo · bars + growth line on a second axis, zoomable', spec: COMBO },
  { title: 'Donut · parts of one whole', spec: PIE },
  { title: 'Metric + Compare · sparklines', spec: METRICS },
  { title: 'Table · row actions', spec: TABLE },
  { title: 'Timeline · plan with states', spec: TIMELINE },
  { title: 'Actions', spec: ACTIONS },
  { title: 'Generated · sandboxed layout', spec: GENERATED }
]

/**
 * Development lab for visual surfaces. Open `#ui-lab` in the dev renderer to
 * iterate on the widgets without waiting for the model.
 */
export default function UiLab(): JSX.Element {
  const [themeId, setThemeId] = useState(THEME_OPTIONS[0].id)
  const [lastAction, setLastAction] = useState('')

  const theme = useMemo(
    () => THEME_OPTIONS.find((option) => option.id === themeId) ?? THEME_OPTIONS[0],
    [themeId]
  )

  useEffect(() => {
    applyThemeToDocument(theme.gradientClass)
    document.documentElement.setAttribute('data-theme', getThemeMode(theme.gradientClass))
  }, [theme])

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-200">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold tracking-tight">Surface lab</h1>
        <select
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
          value={themeId}
          onChange={(event) => setThemeId(event.target.value)}
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {lastAction ? (
          <span className="text-xs text-neutral-500">Sent: {lastAction}</span>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-[620px] flex-col gap-4">
        {SECTIONS.map((section) => (
          <div
            key={section.title}
            className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[13px] leading-relaxed"
          >
            <p className="mb-2 text-[11px] text-neutral-500">{section.title}</p>
            <SurfaceRenderer
              surface={surface(section.title, section.spec)}
              interactive
              onAction={(prompt) => setLastAction(prompt)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
