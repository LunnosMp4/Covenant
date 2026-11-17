# Generative UI with charts — implementation guide

This guide describes how Leon implements generative UI for charts (trends, bars, pies, and bespoke visual dashboards), and how another agent can reproduce the same architecture in a different project.

It is written to be usable without reading Leon's source first. The reference file paths at the end point back to the implementation when you need exact details.

---

## 1. What “generative UI” means here

Generative UI is not the model returning arbitrary React or HTML. It has two deliberately separate rendering paths:

1. **Declarative / native UI** — the model returns a bounded JSON component tree. A trusted registry turns known node types into real React components. Charts are expressed as data (`kind`, `categories`, `series`, `unit`), not as chart-library options.
2. **Generated UI** — for genuinely bespoke layouts or interactions, the model returns HTML, CSS, and JavaScript. That code runs in an isolated, opaque-origin iframe with a small, versioned bridge to trusted components and a lazy-loaded chart engine. It cannot access the host DOM, network, storage, filesystem, or tools.

The model chooses the smallest adequate path:

- A short number or small static table stays in Markdown.
- A numerical trend or comparison uses a native `Chart` node.
- A dashboard, custom drawing, or interactive what-if layout uses a `Generated` node.

The important design rule is: **the model never emits raw chart-library configuration in native mode**. It emits semantic chart data. The trusted renderer owns option construction, theming, accessibility, sizing, and export. Generated mode may accept raw chart options because those options execute only inside the sandbox.

---

## 2. Reference implementation map

| Concern | File |
| --- | --- |
| Chart data contract | `aurora/src/v2/contracts/presentation.ts` |
| UI tree contract and validation | `aurora/src/v2/contracts/answer.ts` |
| Generated-source contract and bridge protocol | `aurora/src/v2/contracts/generated.ts` |
| Native chart widget | `aurora/src/v2/widgets/chart.tsx` |
| ECharts engine, theming, lifecycle, export snapshots | `aurora/src/v2/widgets/chart-engine.ts` |
| ECharts series registration | `aurora/src/v2/widgets/chart-series.ts` |
| Chart styles | `aurora/src/v2/widgets/presentation.sass` |
| Model-facing UI tools and guidance | `server/src/core/aurora/agent-ui-tools.ts` |
| Server publication and answer ordering | `server/src/core/aurora/answer-presentation.ts` |
| Generated HTML/CSS/JS validation | `server/src/core/aurora/generated-validation.ts` |
| Generated design-token validation | `server/src/core/aurora/design-contract.ts` |
| Client answer-part renderer | `apps/web/src/components/aurora-answer/answer-parts.tsx` |
| Client spec renderer and node registry | `apps/web/src/components/aurora-answer/aurora-surface.tsx` |
| Lazy native chart adapter | `apps/web/src/components/aurora-answer/chart-widget.tsx` |
| Sandboxed generated frame | `apps/web/src/components/aurora-answer/generated/generated-frame.tsx` |
| Sandbox runtime and `Aurora` API | `apps/web/src/components/aurora-answer/generated/runtime.tsx` |
| Lazy chart engine injection into the frame | `apps/web/vite/aurora-sandbox.ts` |
| Answer-part persistence and receipts | `server/src/core/session-manager/conversation-repository.ts` |
| UI submission endpoint | `server/src/core/http-server/api/sessions/web-routes.ts` |
| Fixtures and examples | `test/fixtures/aurora.ts` |
| Model behavior scenario | `test/agent/scenarios/runtime-scenarios/aurora-scenarios/answer-format-selection.scenario.ts` |
| Browser end-to-end test | `test/web-app/e2e/aurora.spec.ts` |

Dependency versions in the reference implementation:

- `echarts` 6.1.0
- `@sinclair/typebox` 0.31.23
- `@json-render/core` and `@json-render/react` 0.22.0 (optional; a hand-written recursive renderer works too)
- React 19.2.6
- Vite 8.3.5 and esbuild for the sandbox runtime

---

## 3. End-to-end architecture

### 3.1 Native chart path

```text
Owner asks for a trend
        |
        v
Model calls load_ui({ mode: "native" })
        |
        v
Server returns guidance + preview_ui/present_ui tools
        |
        v
Model calls preview_ui({ spec: { root, elements } })
        |
        v
Server validates schema + semantic invariants
        |
        +--> issues: model repairs and retries
        |
        v
Server returns { valid: true, preview_id, checks }
        |
        v
Model calls present_ui({ preview_id })
        |
        v
Server validates again, appends answer part:
{ kind: "ui", surface: { spec, status: "draft", revision, ... } }
        |
        v
Server emits "answer_parts" event and persists it
        |
        v
Client merges event into conversation cache
        |
        v
Client lazily renders the spec
        |
        v
Chart node -> lazy ChartWidget -> lazy ECharts engine
        |
        v
Final answer marks surface "ready" and appends concise Markdown
```

### 3.2 Generated dashboard path

```text
Owner asks for a bespoke visual / interactive comparison
        |
        v
Model calls load_ui({ mode: "generated" })
        |
        v
Model authors { html, css, javascript, fallback, height, fields? }
        |
        v
preview_ui checks markup, CSS tokens, JS syntax, resource rules
        |
        v
present_ui publishes the spec
        |
        v
Client renders a sandboxed iframe (opaque origin, CSP, no network)
        |
        v
Frame requests the chart engine only when Aurora.chart(...) is called
        |
        v
Host sends a bundled ESM chart engine into the frame over a MessageChannel
        |
        v
Frame calls the same themed ECharts engine used by native charts
```

### 3.3 Why the model sees two paths

The native path is cheap, deterministic, accessible, easy to validate, and easy to restyle. The generated path is expensive, less predictable, and needs a security boundary, but it can produce a real interactive composition: KPI rows, region toggles, custom callouts, multiple coordinated charts, and local calculations.

Do not make generated mode the default. Use it only when the interaction or layout cannot be expressed well by the shared widgets.

---

## 4. The data contracts

### 4.1 Chart contract

The native chart node is deliberately small:

```ts
import { Type } from '@sinclair/typebox'

const title = Type.String({ minLength: 1, maxLength: 256 })

export const chartProperties = {
  title,
  description: Type.Optional(Type.String({ maxLength: 1_024 })),
  kind: Type.Union([
    Type.Literal('bar'),
    Type.Literal('line'),
    Type.Literal('pie')
  ]),
  categories: Type.Array(title, { minItems: 1, maxItems: 96 }),
  series: Type.Array(Type.Object({
    label: title,
    values: Type.Array(Type.Number(), { minItems: 1, maxItems: 96 })
  }, { additionalProperties: false }), { minItems: 1, maxItems: 4 }),
  unit: Type.Optional(Type.String({ maxLength: 40 }))
}
```

The JSON schema alone cannot express the important relationships, so add a semantic check:

```ts
function isChartDataValid(props: ChartData): boolean {
  const uniqueLabels = new Set(props.series.map((series) => series.label)).size === props.series.length
  const aligned = props.series.every((series) =>
    series.values.length === props.categories.length &&
    series.values.every(Number.isFinite)
  )
  const pieValid = props.kind !== 'pie' ||
    (props.series.length === 1 && props.series[0]!.values.every((value) => value >= 0))

  return uniqueLabels && aligned && pieValid
}
```

Rules to preserve:

- Every category has one value per series.
- Series labels are unique.
- Values are finite numbers.
- A pie has exactly one series, and all values are non-negative.
- Charts have at least one category and one series; caps prevent huge payloads.
- `unit` is presentation text, not a value transformation.

Why data instead of raw ECharts options:

- The server can validate series/category alignment.
- The renderer can build a readable data table automatically.
- Theming, localization, number formatting, export, and accessibility stay consistent.
- The model cannot accidentally reach unsupported ECharts features in native mode.

### 4.2 UI tree contract

A native answer is a bounded graph:

```ts
interface AuroraSpec {
  root: string
  elements: Record<string, AuroraNode>
}

type AuroraNode =
  | { type: 'Stack', props: {}, children: string[] }
  | { type: 'Text', props: { text: string } }
  | { type: 'BooleanChoice', props: { title, description? } }
  | { type: 'Choice', props: { title, description?, options, multiple? } }
  | { type: 'Form', props: { title, description?, fields } }
  | { type: 'DataTable', props: DataTableData }
  | { type: 'Comparison', props: ComparisonData }
  | { type: 'Chart', props: ChartData }
  | { type: 'Artifacts', props: { title, artifactIds: string[] } }
  | { type: 'Generated', props: GeneratedSource }
```

Validation is structural and semantic:

- Exactly one root; every element is reachable exactly once.
- IDs are non-empty, at most 80 characters, and not `Object.prototype` keys.
- No cycles, no shared children, max depth 8, max 32 nodes.
- `Stack` children must reference existing elements.
- Choice option values are unique.
- Form/Generated field names are unique and not reserved keys.
- Select fields require a non-empty, unique option list.
- Native specs are capped at 32 KB; generated source at 65 KB; the whole answer-part set at 256 KB.
- Authoring schema excludes retired nodes; replay schema accepts them so old conversations remain readable.

The reference implementation keeps two schemas:

- `auroraAuthoringSpecSchema` — what the model may create now.
- `auroraSpecSchema` — what the client may replay, including retired nodes.

This is a useful migration pattern: remove a node from generation without breaking stored history.

### 4.3 Answer parts and surfaces

The persisted answer is an ordered list, not HTML:

```ts
type AnswerPart =
  | { id: string, kind: 'ui', surface: AuroraSurface }
  | { id: string, kind: 'text', text: string }
  | { id: string, kind: 'artifacts', artifactIds: string[] }

interface AuroraSurface {
  id: string
  revision: number
  status: 'draft' | 'ready'
  purpose: 'answer' | 'clarification'
  ownerMessageId?: string
  spec: AuroraSpec
  receipts: Record<string, AuroraReceipt>
}

interface AuroraReceipt {
  commandId: string
  revision: number
  values: AuroraValues
  submittedAt: number
}
```

Lifecycle:

- `present_ui` creates a `draft` surface.
- `finishAuroraAnswer` marks it `ready` when the turn is accepted.
- UI parts come first, then the concise Markdown answer, then unreferenced artifacts.
- A clarification surface is the question itself; accepted clarification text is omitted to avoid duplicating it.
- A draft surface can be replaced by reusing `surface_id`; a surface with receipts cannot be replaced.
- At most 4 UI surfaces are allowed in one answer.

### 4.4 Generated-source contract

```ts
interface GeneratedSource {
  html: string          // max 24,576 chars
  css?: string          // max 12,288 chars
  javascript?: string   // max 32,768 chars
  fallback: string      // max 8,192 chars, required
  height?: number       // 120..1200 px
  fields?: FormField[]  // optional follow-up submission
}
```

The `fallback` is mandatory. It is the readable answer when the frame fails, JavaScript is unavailable, or the user needs a text summary. It is also what makes the answer useful to screen readers and archives.

Bridge protocol constants:

```ts
export const GENERATED_BRIDGE_VERSION = 'aurora-generated-v1'

export enum GeneratedMessage {
  Ready = 'ready',
  Rendered = 'rendered',
  Initialize = 'initialize',
  Context = 'context',
  Resize = 'resize',
  State = 'state',
  Submit = 'submit',
  Charts = 'charts',
  Controls = 'controls',
  Export = 'export',
  Error = 'error'
}
```

State is bounded JSON:

```ts
export const MAXIMUM_GENERATED_STATE_CHARACTERS = 16_384

export function isGeneratedState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    return JSON.stringify(value).length <= MAXIMUM_GENERATED_STATE_CHARACTERS
  } catch {
    return false
  }
}
```

The client stores generated state per tab, not on the server. Server persistence holds the spec and accepted receipts.

---

## 5. The native chart widget

### 5.1 Responsibilities

`ChartWidget` is presentational. It receives chart data plus a `createChart` function. This keeps it usable both in the main app and inside the sandbox, where the chart engine is injected differently.

```ts
export type CreateChart = (
  element: HTMLElement,
  option: Record<string, unknown>
) => Promise<ChartInstance>

export interface ChartWidgetProps extends ChartData {
  createChart: CreateChart
  onReady?: () => void
}
```

The widget owns:

- Semantic data → ECharts option mapping.
- Loading/failed states.
- Accessible `role="img"` label.
- A “View data” disclosure backed by the same data table widget.
- Resize and theme lifecycle delegated to the engine.

The host owns:

- Lazy-loading the engine.
- Disposal when the chart leaves the DOM.
- Export snapshots.

### 5.2 Data → option

The reference mapping:

```ts
const AXIS_FORMATTER = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1
})
const VALUE_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 20
})

const showLegend = kind === 'pie' || series.length > 1

return {
  tooltip: {
    trigger: kind === 'pie' ? 'item' : 'axis',
    valueFormatter: (value: unknown) =>
      `${typeof value === 'number' ? VALUE_FORMATTER.format(value) : String(value)}${unit ? ` ${unit}` : ''}`
  },
  ...(showLegend ? {
    legend: { type: 'scroll', bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 }
  } : {}),
  ...(kind !== 'pie' ? {
    grid: { left: 8, right: 12, top: 36, bottom: showLegend ? 48 : 12, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: kind === 'bar',
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { hideOverlap: true, margin: 12 }
    },
    yAxis: {
      type: 'value',
      ...(unit ? { name: unit, nameGap: 18 } : {}),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { margin: 12, formatter: (value: number) => AXIS_FORMATTER.format(value) },
      splitLine: { lineStyle: { type: 'dashed' } }
    }
  } : {}),
  series: series.map((item) => ({
    name: item.label,
    type: kind,
    ...(kind === 'pie' ? {
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      label: { show: false },
      emphasis: { label: { show: true } },
      data: item.values.map((value, index) => ({ name: categories[index], value }))
    } : { data: item.values })
  }))
}
```

Chart-type behavior:

- **Line** — use for change over ordered categories (time). No legend with one series; legend with multiple series.
- **Bar** — use for magnitude comparison. `boundaryGap: true` so bars sit between category ticks.
- **Pie** — use only for parts of one whole. Exactly one non-negative series. Donut form via `radius: ['45%', '70%']`.

The reference widget intentionally does not expose area, scatter, heatmap, zoom, or visual maps in native mode. Those belong to generated mode, where raw ECharts options are allowed.

### 5.3 Memoization detail

The widget serializes the chart data and memoizes the option against that string:

```ts
const source = JSON.stringify({ kind, categories, series, unit })
const option = useMemo(() => {
  const data = JSON.parse(source) as ChartData
  return buildOption(data)
}, [source])
```

This prevents a chart from being torn down and recreated when the same data arrives as fresh array objects after replay or cache refresh. Keep `createChart` referentially stable for the same reason; the engine effect depends on it.

### 5.4 Accessibility and fallback

Markup shape:

```tsx
<Surface title={title} description={description}>
  <div className="aurora-chart-frame">
    {loading && <Loader size="sm" label="Drawing the chart…" />}
    <div
      className="aurora-chart"
      ref={element}
      role="img"
      aria-label={`${title}. Data is available below.`}
    />
  </div>
  {failed && (
    <p role="status" className="aurora-feedback">
      I couldn’t draw the chart. The data is available below.
    </p>
  )}
  <details className="aurora-chart-data" open={failed}>
    <summary>View data</summary>
    {openOrFailed && (
      <DataTableWidget
        title={`${title} data`}
        columns={columns}
        rows={rows}
        searchable={false}
      />
    )}
  </details>
</Surface>
```

Key details:

- The canvas is decorative for assistive tech; the data table is the accessible representation.
- The table is mounted only when the disclosure is open or the chart failed. This avoids doubling DOM for every chart.
- The disclosure is marked `data-image-export-ignore` so screenshots do not include the table.
- The chart frame has a fixed height (320 px desktop, 280 px on narrow screens). Explicit height is essential for ECharts and for stable feed layout.

---

## 6. The ECharts engine

### 6.1 Module split

The engine is split so that chart code is not in the startup bundle:

```ts
// chart-engine.ts
import { init, use } from 'echarts/core'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  AriaComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  AriaComponent,
  CanvasRenderer
])
```

```ts
// chart-series.ts
import { use } from 'echarts/core'
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart
} from 'echarts/charts'

use([BarChart, LineChart, PieChart, ScatterChart, HeatmapChart])
```

`chart-engine.ts` imports `chart-series.ts` only inside `create()`:

```ts
async create(element: HTMLElement, option: Record<string, unknown>): Promise<ChartInstance> {
  await import('./chart-series')
  // ...
}
```

Consequences:

- A native `Chart` node can load the engine and only bar/line/pie series are needed in practice, but generated mode can use scatter and heatmap without a separate engine.
- Startup does not download ECharts unless a visual actually appears.
- The app can prefetch the engine when a fetched reply contains a chart.

### 6.2 Instance lifecycle

The engine keeps a bounded map of live instances:

```ts
const instances = new Map<
  EChartsType,
  { observer: ResizeObserver, option: Record<string, unknown> }
>()
const MAXIMUM_CHARTS_PER_SURFACE = 8
const MAXIMUM_CHART_WIDTH = 2_048
```

On create:

1. Import series.
2. Dispose a previous instance bound to the same element.
3. Reject if the instance cap is reached.
4. Initialize ECharts with clamped width/height and `devicePixelRatio` capped at 2.
5. Observe the element with `ResizeObserver`.
6. Apply the themed option.
7. On failure, disconnect the observer, delete the instance, dispose, and rethrow.

On dispose:

1. Disconnect the observer.
2. Remove from the map.
3. Dispose ECharts.

The returned instance exposes:

```ts
interface ChartInstance {
  dispose: () => void
  resize: () => void
  refresh: () => void
  setOption: (option: Record<string, unknown>) => void
  on: (event: string, handler: (value: unknown) => void) => void
}
```

`setOption` and `refresh` exist so generated mode can update charts and so theme changes can redraw without losing the owner's legend/zoom state.

### 6.3 Theme application

The engine reads CSS custom properties at runtime. This is what makes charts follow both themes without duplicating color constants in JavaScript.

```ts
const PALETTE_TOKENS = [
  '--color-accent',
  '--color-accent-pink',
  '--color-purple',
  '--color-success',
  '--color-yellow'
]

function themed(option: Record<string, unknown>): Record<string, unknown> {
  const styles = getComputedStyle(document.documentElement)
  const text = styles.getPropertyValue('--color-text-secondary').trim()
  const border = styles.getPropertyValue('--color-border-secondary').trim()
  const fontSize = Number.parseFloat(styles.getPropertyValue('--font-size-sm'))
  const radius = Number.parseFloat(styles.getPropertyValue('--border-radius-sm'))

  return {
    ...option,
    color: PALETTE_TOKENS.map((name) => styles.getPropertyValue(name).trim()),
    backgroundColor: 'transparent',
    darkMode: styles.colorScheme === 'dark',
    animation: false,
    textStyle: {
      fontFamily: styles.getPropertyValue('--font-family').trim(),
      color: text,
      fontSize
    },
    tooltip: {
      trigger: 'item',
      ...(option.tooltip as object),
      renderMode: 'richText',
      backgroundColor: styles.getPropertyValue('--color-surface-elevated').trim(),
      borderColor: border,
      textStyle: { color: text, fontSize }
    },
    // series, legend, axes are recursively themed below...
    aria: { enabled: true }
  }
}
```

Series defaults are applied without overwriting author choices:

- Bar: `barMaxWidth: 40`, `itemStyle.borderRadius = --border-radius-sm`.
- Line: `symbolSize: 6`, `showSymbol: false`.
- Tooltip labels get a transparent text border because chart surfaces are transparent.
- Legend text and axis labels use secondary text and the small font size.
- Axis lines and split lines use the secondary border token.
- `animation: false` because theme refreshes and feed replay should not animate repeatedly.

Theme refresh merges the current legend and data-zoom state:

```ts
function refreshChart(chart: EChartsType, option: Record<string, unknown>): void {
  const current = chart.getOption()
  chart.setOption(themed({
    ...option,
    ...(current.legend ? { legend: current.legend } : {}),
    ...(current.dataZoom ? { dataZoom: current.dataZoom } : {})
  }))
}
```

Without this, a theme change would reset a user's legend selection or zoom window.

### 6.4 Theme observation

The widget observes theme changes:

```ts
theme = new MutationObserver(() => chart.refresh())
theme.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme', 'style']
})
```

The generated frame does the equivalent through its bridge: the host sends a `context` message with the current theme and filtered design variables; the runtime sets them on `documentElement`, calls `window.auroraChartsRuntime.refresh()`, and dispatches `aurora:theme`.

### 6.5 Export snapshots

Charts are canvases, so a DOM screenshot tool may not capture them reliably. The engine exposes:

```ts
snapshots(root: HTMLElement): ReadonlyMap<HTMLCanvasElement, string>
```

For every live chart whose DOM is inside `root`, it calls:

```ts
chart.getDataURL({
  type: 'png',
  pixelRatio: Math.min(2, MAXIMUM_CHART_WIDTH / chart.getWidth(), MAXIMUM_GENERATED_HEIGHT / chart.getHeight()),
  excludeComponents: ['tooltip']
})
```

The export layer then replaces each canvas with its PNG before rasterizing the visual. This preserves crispness, excludes tooltips, and avoids resizing the live interface.

---

## 7. Model-facing tools

The tool design is as important as the renderer. The model needs to know when to chart, how to shape data, and how to repair invalid specs without burning tokens.

### 7.1 Progressive capability loading

Only a small loader tool is initially available:

```ts
load_ui({ mode: 'input' | 'native' | 'generated' })
```

Once the model chooses a mode, the server adds:

- `preview_ui({ spec })`
- `present_ui({ preview_id, surface_id? })`
- `request_clarification(...)`, extended with visual input support

Modes are monotonic within a turn: `input < native < generated`. If the model asks for native after generated, it keeps generated capabilities. The selected mode is stored in agent session state so resumed workflows can rebuild the tool catalog.

Guidance is delivered once per mode change, not in every tool schema. This keeps ordinary turns inexpensive.

### 7.2 Tool responsibilities

`load_ui`

- Returns the behavioral guidance for the selected mode.
- Adds schemas progressively.
- Does not publish anything.

`preview_ui`

- Accepts a full spec.
- Validates schema, bounded markup, resource declarations, JavaScript syntax, design tokens, and control styling.
- Caches the validated spec under a turn-local `preview_id`.
- Returns diagnostics, not a screenshot.
- Explicitly reports `browserRendered: false`.

`present_ui`

- Accepts `preview_id` and optional `surface_id`.
- Resolves the cached spec; the model does not resend it.
- Validates again.
- Calls the host presentation callback.
- Returns `{ surface_id, displayed: true, instructions }`.
- The instructions tell the model not to repeat the visual content in the closing answer.

`request_clarification`

- Can carry a simple `input` node, a composed `preview_id`, or a plain-text question.
- Does not publish before clarification review.
- Reuses the same validation boundary as answers.

### 7.3 Guidance that changes model behavior

The reference prompt contains rules like:

```text
Chart shows grounded trends/comparisons: line for change, bar for magnitudes,
pie for parts of one total. Preserve values and units; distinguish missing data
from zero and partial periods from complete ones. Chart includes a View data
disclosure. DataTable is for useful search/sorting/pagination; small static
tables stay Markdown. Comparison contrasts meaningful attributes of a few
options. Use Mermaid for static relationship diagrams, or load_ui mode generated
for bespoke layouts/interactions. Include every declared column/criterion in
each row/option. Widgets change local presentation, never execute tools.
```

And in the global response policy:

```text
Proactively use charts for numerical trends/comparisons, diagrams for
relationships, and custom visuals when interaction or layout improves
understanding. Keep simple numbers, prose and small static tables in Markdown.
Load the needed UI mode without asking display permission; do not create
dashboards or extra questions merely to use UI.
```

Generated-mode guidance adds:

- Compose a visual answer, not a miniature website.
- Keep hierarchy clear and containers few.
- Use design tokens, not literal colors or fonts.
- Use shared controls before recreating them.
- Ground all data; include values and units in a readable fallback.
- The runtime has no network, storage, filesystem, or tool access.
- Prefer `ChartWidget` for standard charts; `Aurora.chart` for custom ECharts options.
- Include a readable summary/data view.
- Validate with `preview_ui`; validation is not a visual-quality check.

### 7.4 Preview → present lifecycle

```text
preview_ui(spec)
  -> { valid: false, issues: [...], checks: [...], browserRendered: false }
  -> model repairs spec
  -> preview_ui(repaired)
  -> { valid: true, preview_id: "..." }
  -> present_ui({ preview_id })
  -> { surface_id: "...", displayed: true, instructions: "..." }
```

Why split preview and present:

- The spec is sent once, not twice.
- The authoring schema belongs to one tool.
- Non-publishing validation and repair are cheap.
- Previews can expire without affecting stored answers.
- Publication always revalidates.

Preview IDs are turn-local. After resuming a paused workflow, the model must regenerate them.

### 7.5 Validation and repair diagnostics

`describeAuroraSpecError` finds the matching node schema rather than dumping every union alternative:

```ts
const problem = Value.Errors(auroraSpecSchema, value).First()
const nodeType = problem?.value?.type
const schema = nodes.find((node) => node.properties.type.const === nodeType)

if (schema) {
  return Value.Errors(schema, problem.value)
    .take(3)
    .map((error) => `${problem.path}${error.path}: ${error.message}`)
    .join('; ')
}

return `${problem.path || '/'}: ${problem.message}`
```

This gives the model a small, actionable repair message instead of an unreadable union error.

---

## 8. Server publication, persistence, and streaming

### 8.1 Publish a surface

`presentAurora` does the trusted work:

1. Validate the spec again.
2. Validate generated source.
3. Resolve referenced artifacts from retained files; never trust model-provided paths or URLs.
4. Open a transaction on the conversation message.
5. Reject replacement of an accepted surface or one with receipts.
6. Enforce the maximum UI surfaces per answer.
7. Create or revise the surface with `status: 'draft'`.
8. Enforce the total answer-parts size cap.
9. Persist and publish the updated parts.

Pseudocode:

```ts
function presentAurora(sessionId, messageId, spec, purpose, surfaceId?) {
  if (!isAuroraSpec(spec)) throw new Error('Invalid visual answer.')
  const issues = validateGeneratedSurfaces(spec)
  if (issues.length) throw new Error(issues.join('\n'))

  const parts = updateAnswerParts(sessionId, messageId, (parts) => {
    const previous = parts.find((part) => part.kind === 'ui' && part.surface.id === surfaceId)

    if (surfaceId && previous?.kind !== 'ui') throw new Error('Not the current response.')
    if (previous?.kind === 'ui' && (previous.surface.status !== 'draft' || hasReceipts(previous))) {
      throw new Error('An accepted visual answer cannot be replaced.')
    }
    if (!previous && countUI(parts) >= MAXIMUM_UI_SURFACES) {
      throw new Error('Use the existing visual answer.')
    }

    const surface = {
      id: surfaceId ?? randomUUID(),
      revision: previous ? previous.surface.revision + 1 : 1,
      spec,
      purpose,
      status: 'draft',
      receipts: {}
    }

    return previous
      ? parts.map((part) => part === previous ? { id: surface.id, kind: 'ui', surface } : part)
      : [...parts, { id: surface.id, kind: 'ui', surface }]
  })

  publishAnswerParts(sessionId, messageId, parts)
  return surface
}
```

### 8.2 Finish the answer

`finishAuroraAnswer`:

- Marks UI surfaces `ready` if the turn is accepted.
- Records the latest owner message ID so only the latest reply's controls are active.
- Orders `ui` parts first, then concise text, then unreferenced artifacts.
- Omits text for accepted clarification surfaces because the visual is the question.

This ordering is why the feed shows the chart above the final explanation, not the other way around.

### 8.3 Streaming contract

Live and stored answers use the same shape:

```ts
publishAgentEvent(profile, {
  session_id: sessionId,
  turn_id: null,
  response_id: messageId,
  type: 'answer_parts',
  data: { answer_parts: parts, artifacts? }
})
```

The client merges `answer_parts` into its cached message. On reload, the same `answerParts` come from the persisted conversation record. There is no separate HTML transcript to maintain.

### 8.4 Submissions

The endpoint:

```text
POST /api/:version/sessions/:session_id/messages/:message_id/ui
```

Body:

```json
{
  "id": "stable-command-uuid",
  "surfaceId": "surface-id",
  "nodeId": "node-id",
  "revision": 1,
  "values": true
}
```

Response: `202 { command, answerParts }`.

Server checks:

- The message is in history.
- The surface and node exist.
- Values match the saved node, not a client-supplied schema.
- Values are bounded and normalized.
- If a receipt exists, the command ID, revision, and values must match exactly; otherwise reject as already answered.
- The surface is the latest completed reply's surface, is `ready`, and has the expected revision.
- The latest owner message matches the surface's owner message.
- Acceptance and owner-command creation happen in one transaction.

Client behavior:

- Use one stable command ID across uncertain delivery attempts.
- Do not auto-retry mutations.
- On success, replace `answerParts` in the query cache and invalidate the conversation.
- Only an accepted server receipt changes the saved UI or creates an owner turn.

This is how interactive widgets avoid duplicate actions and stale questions.

---

## 9. Client rendering

### 9.1 Lazy answer-part renderer

`AnswerParts` preserves the recorded order:

```tsx
parts.map((part) => {
  if (part.kind === 'text') return <MarkdownContent ... />
  if (part.kind === 'artifacts') return <ArtifactAttachments ... />
  return <VisualPart ... />
})
```

`VisualPart`:

- Lazily imports `AuroraSurfaceView`.
- Wraps it in an error boundary and a `VisualLayout`.
- Reserves space while the optional renderer loads.
- Falls back to readable text if the chunk or render fails.

### 9.2 Registry-based native renderer

The client validates the spec again and maps known nodes:

```tsx
const REGISTRY = {
  Stack: NativeNode,
  Text: NativeNode,
  BooleanChoice: NativeNode,
  Choice: NativeNode,
  Form: NativeNode,
  Artifacts: NativeNode,
  Generated: NativeNode,
  Results: NativeNode,      // retired, replay only
  DataTable: NativeNode,
  Comparison: NativeNode,
  Chart: NativeNode
}
```

Internal node identity is added after validation:

```tsx
const spec = {
  root: surface.spec.root,
  elements: Object.fromEntries(
    Object.entries(surface.spec.elements).map(([id, node]) => [
      id,
      { ...node, props: { ...node.props, auroraNodeId: id } }
    ])
  )
}
```

The model never supplies `auroraNodeId`; the renderer injects it so a node component can look up its original spec entry.

### 9.3 Chart node

```tsx
const ChartWidget = lazy(() => import('./chart-widget'))

function ChartNodeView({ nodeId }) {
  const { surface } = useContext(SurfaceContext)
  const owner = useContext(ConversationDetailsContext)
  const node = surface.spec.elements[nodeId]
  const [ready, setReady] = useState(false)

  return (
    <VisualLayout
      identity={`${owner?.sessionId}:${owner?.messageId}:${surface.id}:${surface.revision}:${nodeId}`}
      estimatedHeight="440px"
      label="Drawing the chart…"
      ready={ready}
    >
      <Suspense fallback={null}>
        <ChartWidget {...node.props} onReady={() => setReady(true)} />
      </Suspense>
    </VisualLayout>
  )
}
```

The chart adapter injects the engine:

```tsx
async function createChart(element, option) {
  const { chartEngine } = await import('../../../../../aurora/src/v2/widgets/chart-engine')
  return chartEngine.create(element, option)
}

export default function NativeChartWidget(props) {
  return (
    <ExportableVisual canvasImages={canvasImages}>
      <ChartWidget {...props} createChart={createChart} />
    </ExportableVisual>
  )
}
```

Why the injection: the same `ChartWidget` works in the main app and in the sandbox, but the sandbox must request the engine from the host rather than bundling its own copy.

### 9.4 Layout reservation and prefetch

`VisualLayout` stores the last settled height for a stable identity:

```ts
identity = `${sessionId}:${messageId}:${surfaceId}:${revision}:${nodeId}`
```

It retains only dimensions, not rendered content. This prevents the feed from jumping when a visual remounts after navigation. It waits for both `ready` and `document.fonts.ready` before revealing content, because font metrics change chart/table height.

`preload.ts` warms only what the newest reply needs:

- Markdown renderer.
- `AuroraSurfaceView` when any UI part exists.
- Generated frame module when a `Generated` node exists.
- Chart widget, engine, and series when a `Chart` node exists.

Prefetching a module does not create a chart or execute generated source.

---

## 10. Generated mode: bespoke dashboards

### 10.1 When to choose it

Use generated mode when at least one is true:

- The visual needs a coordinated composition: KPI row, controls, two or more charts, callout, details.
- The visual needs chart types outside native bar/line/pie (area, scatter, heatmap, zoom, visual map).
- The interaction changes local calculations or layout in a way shared widgets cannot express.
- A custom SVG/diagram communicates the idea materially better.

Do not use it for a single standard chart. Native mode is safer, faster, and more consistent.

### 10.2 Sandbox document

The host builds a trusted bootstrap document:

```ts
const CSP = [
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

const document = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${CSP}">
    <meta name="referrer" content="no-referrer">
    <style>${VISUAL_FONT_CSS}${frameStyles}</style>
  </head>
  <body>
    <div id="aurora-content"></div>
    <div id="aurora-root"></div>
    <script>${runtime}</script>
  </body>
</html>`
```

The iframe:

```tsx
<iframe
  src={blobURL}
  sandbox="allow-scripts"
  referrerPolicy="no-referrer"
  title={node.props.title}
  style={{ height }}
/>
```

`sandbox="allow-scripts"` without `allow-same-origin` gives the frame an opaque origin. It can run scripts but cannot read the host DOM, cookies, local storage, or same-origin resources.

The parent document also needs a CSP allowing blob frames:

```html
<meta http-equiv="Content-Security-Policy" content="frame-src blob:">
```

The reference Vite plugin injects this into the app's HTML. Without it, the iframe is blocked.

### 10.3 Bridge handshake

Child → parent on load:

```ts
parent.postMessage({
  version: GENERATED_BRIDGE_VERSION,
  type: GeneratedMessage.Ready
}, '*')
```

Parent validates `event.source === iframe.contentWindow` and the version, then creates a `MessageChannel`:

```ts
const channel = new MessageChannel()

frame.contentWindow.postMessage({
  version: GENERATED_BRIDGE_VERSION,
  type: GeneratedMessage.Initialize,
  source: { html, css, javascript },
  state: initialState,
  ...themeContext()
}, '*', [channel.port2])
```

Child:

- Stores `port`.
- Sets `window.Aurora`.
- Injects HTML into `#aurora-content`.
- Injects CSS inside `@layer generated { ... }`.
- Executes JavaScript inside an async IIFE.
- Reports `rendered` once after source, React commit, pending visuals, and fonts settle.
- Reports `resize` when body height changes.
- Reports `state`, `submit`, `error`, and `export`.

Message limits:

- 120 messages per second.
- Payload at most `MAXIMUM_GENERATED_STATE_CHARACTERS + 1_024` characters, except binary export results.
- Startup timeout 5 s; render timeout 30 s.
- Height clamped to 120–1200 px.

### 10.4 The `Aurora` runtime API

The frame exposes a small, intentional API:

```ts
window.Aurora = {
  React,
  h: React.createElement,
  Button,
  Input,
  Progress,
  Selection,
  Range,
  Switch,
  Segmented,
  Tabs,
  NumberStepper,
  SearchSelect,
  Surface,
  Loader,
  Icon,
  DataTableWidget,
  ComparisonWidget,
  ChartWidget,
  token(name),
  render(element),
  state: { get(), set(object) },
  submit(values),
  chart(element, option)
}
```

Important properties:

- `Aurora.render` mounts React content into `#aurora-root`.
- `Aurora.state` is bounded JSON, tab-local, and survives frame remounts through the host.
- `Aurora.submit` only proposes values; the host shows a confirmation outside the frame and sends an owner command only after an explicit click.
- `Aurora.chart` returns `{ setOption, on, resize, dispose }`.
- `Aurora.token` reads a live design token and throws for unknown names.
- `Aurora.Icon` uses an allowlisted local icon registry, never arbitrary SVG injection.

The frame also exposes `React` and `auroraReactDOM` so lazy shared controls can use the frame's existing React dispatcher instead of shipping a second React runtime.

### 10.5 Lazy chart engine inside the sandbox

The generated runtime ships without ECharts. On the first `Aurora.chart` call:

```ts
async chart(element, option) {
  if (!chartsPending) {
    chartsPending = new Promise((resolve) => {
      resolveCharts = resolve
    })
    port.postMessage({ type: GeneratedMessage.Charts })
  }

  return trackVisual(
    chartsPending.then(() => window.auroraChartsRuntime!.create(element, option))
  )
}
```

The host receives `charts`, dynamically imports the prebundled chart source, and sends it over the channel:

```ts
if (data.type === GeneratedMessage.Charts) {
  const load = import('virtual:aurora-charts')
  const { default: chartSource } = await load
  const files = await chartSource.load()
  channel.port1.postMessage({
    type: data.type,
    entry: chartSource.entry,
    files
  })
}
```

The frame reconstructs blob module URLs and injects a module script:

```ts
function moduleURL(name) {
  const file = files[name]
  let code = file.source
  for (const dependency of file.imports) {
    const url = moduleURL(dependency)
    code = code
      .replaceAll(`"./${dependency}"`, JSON.stringify(url))
      .replaceAll(`'./${dependency}'`, JSON.stringify(url))
  }
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  moduleURLs.set(name, url)
  return url
}

const script = document.createElement('script')
script.type = 'module'
script.src = moduleURL(message.data.entry)
script.onload = () => { /* resolve chart promise */ }
document.head.append(script)
```

`charts.ts` is intentionally tiny:

```ts
import { chartEngine } from '../../../../../../aurora/src/v2/widgets/chart-engine'

window.auroraChartsRuntime = chartEngine
```

The Vite/esbuild plugin bundles this entry as ESM with splitting, records each output file's source and imports in the metafile, and exposes them through virtual modules. The frame never loads ECharts from a CDN. The same engine and theme logic serve both native and generated charts.

If your project does not need this level of optimization, you can prebuild a chart bundle and load it inside the frame once; preserve the same API and isolation properties.

### 10.6 State and submission

State:

```ts
state: {
  get() {
    return structuredClone(state)
  },
  set(value) {
    if (!isGeneratedState(value)) {
      throw new Error('Keep saved interface state to a small JSON object.')
    }
    state = structuredClone(value)
    port.postMessage({ type: GeneratedMessage.State, value: state })
  }
}
```

The host stores state in tab-local storage keyed by session/message/surface/node/revision. It is not part of the saved answer. This is appropriate for chart filters, selected regions, and local slider values.

Submission:

```ts
submit(values: Record<string, string>) {
  port.postMessage({ type: GeneratedMessage.Submit, values })
}
```

Host handling:

```ts
const data = message.data
if (
  data.type === GeneratedMessage.Submit &&
  !callbacks.current.readOnly &&
  !callbacks.current.submitted &&
  !callbacks.current.pending &&
  isAuroraSubmission(callbacks.current.node, data.values)
) {
  setProposal(data.values)
}
```

The proposal renders outside the frame with a “Send selection” button. Only that click calls the mutation. The frame cannot send a command or execute a tool itself.

### 10.7 Server-side generated-source validation

HTML validation uses `parse5`:

- Forbid `script`, `iframe`, `frame`, `frameset`, `object`, `embed`, `base`, `meta`, `link`.
- Max 2,048 markup nodes and depth 48.
- No `on*` event attributes.
- No `<style>` element; authored styles go in `css`.
- No `@import` in inline styles.
- No external resource attributes (`src`, `href`, `action`, `srcset`, etc.) except fragment references (`#...`) and inline `data:image/...`.
- Buttons accept only supported `data-variant` / `data-size` values.
- Inline styles and SVG paint attributes are checked by the design validator.

CSS validation uses `@eslint/css-tree`:

- No redefining an existing Aurora token.
- No inventing tokens in the shared design namespace.
- No `!important`.
- Shared controls cannot be restyled beyond a small layout-property allowlist; position them through wrappers.
- No literal colors; use Aurora color tokens.
- Fonts, line heights, and radii must use tokens.
- No `@layer`, `@import`, `@font-face`, `@property`; the host owns those.
- Local CSS variables are allowed for geometry/state, not palette aliases.

JavaScript is checked for syntax only:

```ts
new Script(`(async () => {\n${javascript ?? ''}\n})()`, { filename: `${id}.js` })
```

It is never executed in Node. This is explicitly not a security sandbox; the browser isolation is.

### 10.8 Generated example from the reference fixtures

A generated reading dashboard:

```ts
const spec: AuroraSpec = {
  root: 'reading',
  elements: {
    reading: {
      type: 'Generated',
      props: {
        title: 'A little room for reading',
        height: 560,
        fallback:
          'Reading time: Monday 20 min, Tuesday 35 min, Wednesday 25 min, ' +
          'Thursday 45 min. Total 125 min; average 31.25 min per day. ' +
          'Choose a daily goal between 10 and 60 minutes.',
        fields: [{
          name: 'minutes',
          label: 'Daily reading goal (minutes)',
          type: 'number',
          required: true
        }],
        html: `
          <p>Small moments add up. Here is your reading time so far.</p>
          <div id="reading-chart" role="img"
               aria-label="Reading minutes by day"
               style="height:280px"></div>
          <label for="goal">Daily reading goal <output id="goal-value">30 min</output></label>
          <input id="goal" type="range" min="10" max="60" value="30" step="5">
          <p id="week-total"></p>
          <div id="aurora-goal-action"></div>
          <details>
            <summary>Reading data</summary>
            <table>
              <thead><tr><th>Day</th><th>Minutes</th></tr></thead>
              <tbody>
                <tr><td>Monday</td><td>20</td></tr>
                <tr><td>Tuesday</td><td>35</td></tr>
                <tr><td>Wednesday</td><td>25</td></tr>
                <tr><td>Thursday</td><td>45</td></tr>
              </tbody>
            </table>
          </details>`,
        css: `
          p { margin: 0 0 var(--space-md) }
          label { display: flex; justify-content: space-between; gap: var(--space-sm) }
          input[type=range] { width: 100%; margin: var(--space-md) 0 }
          table { width: 100%; text-align: left; border-collapse: collapse }
          th, td { padding: var(--space-xs); border-bottom: 1px solid var(--color-border-secondary) }
          details { margin-top: var(--space-lg); color: var(--color-text-secondary) }
          summary { cursor: pointer }`,
        javascript: `
          const goal = document.getElementById('goal')
          const saved = Aurora.state.get()
          goal.value = String(saved.minutes || 30)

          const chart = await Aurora.chart(document.getElementById('reading-chart'), {
            grid: { left: 36, right: 16, top: 24, bottom: 36 },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu'] },
            yAxis: { type: 'value', name: 'min', max: 60 },
            series: [{ name: 'Reading', type: 'bar', data: [20, 35, 25, 45] }]
          })

          function update() {
            document.getElementById('goal-value').textContent = goal.value + ' min'
            document.getElementById('week-total').textContent =
              'Your goal for a week: ' + Number(goal.value) * 7 +
              ' minutes. There is no rush.'
            Aurora.state.set({ minutes: Number(goal.value) })
          }

          goal.addEventListener('input', update)
          Aurora.render(
            Aurora.h(
              Aurora.Button,
              { variant: 'secondary', onClick: () => Aurora.submit({ minutes: goal.value }) },
              'Plan around this goal'
            )
          )
          update()`
      }
    }
  }
}
```

This is the smallest useful generated surface: static HTML, token CSS, local chart, bounded state, and an explicit follow-up proposal.

---

## 11. How the README's trend and bar screenshots are made

Both screenshots are generated surfaces, not native `Chart` nodes.

### 11.1 Trend screenshot

The visual contains:

- A title and contextual subtitle.
- Region toggles (`Aurora.Switch` or authored checkboxes styled through Aurora).
- A KPI row.
- A filled area/trend chart for all selected regions.
- Text callouts for biggest increase/decline.
- A second multi-series line chart for regional trends.
- A summary callout.
- The generated frame's automatic “Text summary” fallback.

The charts are created with `Aurora.chart`:

```js
const allRegions = await Aurora.chart(document.getElementById('all-regions'), {
  grid: { left: 40, right: 16, top: 28, bottom: 28 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: months },
  yAxis: { type: 'value', name: 'USD k' },
  series: [{
    name: 'All regions',
    type: 'line',
    smooth: true,
    areaStyle: {},
    showSymbol: false,
    data: totals
  }]
})

const regional = await Aurora.chart(document.getElementById('regional'), {
  grid: { left: 40, right: 16, top: 28, bottom: 48 },
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll', bottom: 0, icon: 'circle' },
  xAxis: { type: 'category', data: months },
  yAxis: { type: 'value', name: 'USD k' },
  series: [
    { name: 'Asia Pacific', type: 'line', showSymbol: false, data: asiaPacific },
    { name: 'Europe', type: 'line', showSymbol: false, data: europe },
    { name: 'North America', type: 'line', showSymbol: false, data: northAmerica }
  ]
})
```

Toggles update the arrays and call `setOption`. The controls only change local presentation; they do not execute tools.

### 11.2 Bar screenshot

The visual contains:

- A title/subtitle clarifying complete vs missing quarters.
- Region toggles.
- Three KPI cells for Q2, Q3, and quarter-over-quarter change.
- A grouped bar chart with two series (`Q2`, `Q3`) and a legend.
- A callout naming the biggest change.
- A prose paragraph.
- A “View data” disclosure with the values.
- The generated frame's “Text summary”.

The grouped bar chart is:

```js
const chart = await Aurora.chart(document.getElementById('quarterly'), {
  grid: { left: 48, right: 16, top: 36, bottom: 36 },
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll', bottom: 0, icon: 'circle' },
  xAxis: {
    type: 'category',
    data: ['Asia Pacific', 'Europe', 'North America', 'Combined']
  },
  yAxis: { type: 'value', name: 'USD k' },
  series: [
    { name: 'Q2 | Apr-Jun', type: 'bar', data: q2 },
    { name: 'Q3 | Jul-Sep', type: 'bar', data: q3 }
  ]
})
```

The theme, palette, font, radii, and tooltip styling come from the same engine used by native charts. The frame only supplies data and layout.

### 11.3 Why not native for these screenshots

Native `Chart` supports line/bar/pie only, one chart widget per node, no region toggles, no KPI row, no coordinated multi-chart updates, and no area style. Those screenshots are intentionally “generated” because the composition and interaction are the point.

---

## 12. Security checklist

For native UI:

- [ ] Model output is declarative data validated against a strict schema.
- [ ] Unknown node types are not rendered.
- [ ] No expressions, events, or arbitrary props from the model.
- [ ] Renderer injects internal node identity after validation.
- [ ] Links are credential-free `http`/`https` only.
- [ ] Spec size, node count, depth, and graph shape are bounded.

For generated UI:

- [ ] Generated code runs only in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`.
- [ ] CSP blocks network, forms, objects, nested frames, and external resources.
- [ ] Parent CSP allows `frame-src blob:`; nothing else is relaxed.
- [ ] Messages are accepted only from the expected frame window and bridge version.
- [ ] Message rate and payload size are bounded.
- [ ] Startup/render timeouts stop runaway surfaces.
- [ ] State is bounded JSON; no DOM trees, functions, or secrets.
- [ ] `Aurora.submit` only proposes values; an owner click outside the frame confirms.
- [ ] Server validates values against the saved node, not a client schema.
- [ ] Server never executes generated JavaScript.
- [ ] Stale/replayed submissions are rejected or idempotently deduplicated.
- [ ] Generated code cannot navigate the frame to the network.
- [ ] Fallback text always exists and is shown on failure.

Do not claim that source validation is a security sandbox. It is a quality/design check. The browser isolation is the boundary.

---

## 13. Performance checklist

- [ ] Chart engine and series modules are lazy-loaded.
- [ ] Prefetch only when the newest reply actually contains a chart.
- [ ] Do not load ECharts in the sandbox bootstrap; send it on first `Aurora.chart` call.
- [ ] Cap live chart instances (reference: 8).
- [ ] Cap chart width/height and `devicePixelRatio` (reference: 2048 / 1200 / 2).
- [ ] Use `ResizeObserver`, not polling.
- [ ] Disable animation; do not animate on theme refresh or replay.
- [ ] Memoize option construction against serialized data.
- [ ] Keep `createChart` referentially stable.
- [ ] Dispose charts and observers on unmount and `pagehide`.
- [ ] Reserve layout height to avoid feed jumps.
- [ ] Load generated controls lazily with shared React, not a second renderer.
- [ ] Bound generated-state writes; never save on every animation frame.
- [ ] Use a table disclosure instead of always rendering two representations.

---

## 14. Accessibility checklist

- [ ] Chart container has `role="img"` and a descriptive `aria-label`.
- [ ] A readable data table is available through a disclosure.
- [ ] Chart failure leaves a readable status message and data access.
- [ ] Generated surfaces always provide a text fallback.
- [ ] Use semantic headings, labels, tables, and native controls.
- [ ] Preserve keyboard focus and native form behavior in generated controls.
- [ ] Respect reduced motion in the sandbox stylesheet.
- [ ] Do not encode meaning only in color; pair series with labels.
- [ ] Ensure narrow layouts do not overflow horizontally.

---

## 15. Testing strategy

### 15.1 Contract tests

- Reject a chart whose series length differs from categories.
- Reject non-finite values.
- Reject duplicate series labels.
- Reject a pie with multiple series or negative values.
- Reject a spec with a missing root, cycle, duplicate reachability, reserved ID, over-depth tree, or too many nodes.
- Accept a retired node in replay schema but reject it in authoring schema.

### 15.2 Tool/server tests

- `load_ui` adds the expected tools and guidance once.
- `preview_ui` returns diagnostics and no preview ID on invalid source.
- `present_ui` rejects an unknown or expired preview ID.
- `present_ui` reuses a draft surface and increments revision.
- `present_ui` refuses to replace an accepted surface.
- Too many surfaces are rejected.
- `acceptAuroraSubmission` rejects stale revision, stale owner message, and invalid values.
- Repeated submission with the same command ID is idempotent.
- A different command ID for the same receipt is rejected.

### 15.3 Browser tests

- Chart canvas is visible.
- “View data” exposes the expected values.
- Switching bar/line/pie keeps the data table readable.
- Narrow viewport does not overflow.
- Theme change refreshes chart colors while preserving legend/zoom.
- Generated frame cannot make network requests.
- Generated frame reports height and respects the clamp.
- Chart engine loads only when requested.
- Generated submit shows a confirmation and only then sends a POST.

### 15.4 Model behavior scenario

The reference scenario sends real monthly token totals and asserts:

- The model chooses a native chart without an explicit chart request.
- Categories and values are preserved.
- The answer mentions that November is partial.
- A small fixed reference table stays Markdown and does not become a widget.

This is the highest-value test: it checks the prompt and tool design, not just rendering.

---

## 16. Build order for another project

### Phase 1 — Contracts and validators

1. Define `ChartData` with `kind`, `categories`, `series`, `unit`.
2. Add semantic validation for alignment, uniqueness, finite values, and pie rules.
3. Define a bounded UI tree (`root` + `elements`) and a node union.
4. Add graph validation, size caps, reserved-key checks, and retired-node replay support.
5. Define `AnswerPart` and `AuroraSurface` persistence types.

### Phase 2 — Native chart renderer

1. Add ECharts with tree-shaken core registration.
2. Build a presentational `ChartWidget` that maps data to options.
3. Add a lazy engine with `create`, `resize`, `refresh`, `dispose`, `snapshots`.
4. Theme from CSS variables; observe theme changes.
5. Add the accessible “View data” table and failure fallback.
6. Add fixtures and a preview page.

### Phase 3 — Client answer rendering

1. Render answer parts in order.
2. Lazily load the spec renderer.
3. Add a registry with only known node types.
4. Wrap visuals in a layout that reserves height.
5. Add error boundaries and readable fallbacks.
6. Prefetch only modules implied by the newest reply.

### Phase 4 — Model tools and server persistence

1. Add `load_ui` with progressive modes.
2. Add `preview_ui` and `present_ui`.
3. Add `request_clarification` support for visual input.
4. Write the behavioral guidance.
5. Persist surfaces inside the answer message transaction.
6. Emit `answer_parts` events for live and replay.
7. Add the submission endpoint with receipts, revisions, and idempotency.
8. Gate interactive nodes to the latest completed reply.

### Phase 5 — Generated mode (only if needed)

1. Define `Generated` source props and mandatory fallback.
2. Build the CSP/sandbox iframe and bridge protocol.
3. Add server-side HTML/CSS/JS validation.
4. Add `Aurora` runtime: React, components, state, submit, token, chart.
5. Add lazy chart-engine injection.
6. Add the confirmation UI for submissions.
7. Add source viewer, export, fullscreen, and error/timeout handling.

### Phase 6 — Hardening

1. Contract tests.
2. Server/tool tests.
3. Browser E2E: canvas, data table, theme, mobile, generated isolation.
4. Model scenario for proactive chart choice and data fidelity.
5. Performance sample with several charts and a long feed.

---

## 17. Porting decisions

### If your app has no sandbox

Implement only the native path. It delivers most of the value: trends, bars, pies, tables, comparisons, forms, accessibility, theming, and export. Skip generated mode.

### If you use a different chart library

Keep the contract semantic. Replace the ECharts adapter, not the model-facing schema. The model should still send categories/series/kind/unit. Your renderer can translate to Recharts, Chart.js, Vega-Lite, or a custom SVG renderer.

### If you use a different declarative renderer

Replace `@json-render` with a recursive `switch (node.type)` renderer. The essential pieces are: strict validation, an allowlisted registry, stable node identity, and a readable fallback.

### If you have no server

Do not run model-generated JavaScript in the host. You can still validate and render the native tree client-side, but generated code needs a real isolation boundary. Prefer a server or a dedicated sandbox origin.

### If you have no streaming

Persist `answerParts` as JSON with the message and re-fetch it. The renderer should not depend on a live event stream; the reference replay path uses exactly the same data.

### If your app already has a design-token system

Expose only the tokens you want generated source to use. Validate them server-side. Do not let generated code invent palette or typography tokens. Keep the chart palette in the same token system.

### If you need charts inside generated surfaces

Do not bundle the chart library into the sandbox bootstrap. Load it on demand through a bridge, or at minimum load it as a separate module inside the frame. Keep the same `ChartInstance` API so native and generated charts share theming and disposal.

---

## 18. Common pitfalls

1. **Letting the model send raw ECharts options in native mode.** You lose validation, data-table fallback, theme consistency, and predictable accessibility.
2. **Treating server source validation as a security sandbox.** It is a design/quality check. The iframe isolation is the boundary.
3. **Bundling ECharts in the initial app bundle.** It is large and most turns do not need it. Lazy-load it and prefetch only on demand.
4. **Recreating the chart when identical data has new object identity.** Serialize and memoize, or keep stable references.
5. **Changing `createChart` identity on every render.** The effect depends on it and will tear down the chart.
6. **Forgetting an explicit chart height.** ECharts needs a sized container; the feed also needs stable geometry.
7. **Resetting legend or zoom on theme change.** Merge current legend/dataZoom into the refreshed option.
8. **Animating on every theme or replay update.** Disable animation; reserve motion for deliberate interactions.
9. **No accessible data representation.** A canvas alone is not an answer. Provide a disclosure with a real table.
10. **No fallback text for generated UI.** The frame can fail, JavaScript can be disabled, or the sandbox can time out.
11. **Allowing arbitrary colors/fonts in generated CSS.** It breaks themes and accessibility. Validate tokens.
12. **Letting generated code call tools or send commands.** It should only propose values; the owner confirms outside the frame.
13. **Accepting stale widget submissions.** Check surface revision, latest reply, latest owner message, and receipt idempotency.
14. **Replacing accepted surfaces.** Only draft surfaces without receipts may be revised.
15. **Repeating the visual content in the final Markdown.** The visual is the answer; text should add context, not duplicate it.
16. **Forgetting retired nodes.** Keep a replay schema so old conversations still render after you remove a widget from authoring.
17. **Putting the chart engine in the sandbox bootstrap.** It defeats the lazy-loading design. Send it on first chart request.
18. **Letting generated source use the network.** CSP should block `connect-src` and external resources; bundle assets locally.

---

## 19. Copy-ready minimal native flow

If you want the smallest version of this architecture in another project, implement this sequence:

```ts
// 1. Contract
interface ChartData {
  title: string
  description?: string
  kind: 'bar' | 'line' | 'pie'
  categories: string[]
  series: Array<{ label: string, values: number[] }>
  unit?: string
}

// 2. Semantic validation
function isValidChart(chart: ChartData): boolean {
  const labels = new Set(chart.series.map((series) => series.label))
  const aligned = chart.series.every((series) =>
    series.values.length === chart.categories.length &&
    series.values.every(Number.isFinite)
  )
  const pie = chart.kind !== 'pie' ||
    (chart.series.length === 1 && chart.series[0]!.values.every((value) => value >= 0))

  return labels.size === chart.series.length && aligned && pie
}

// 3. Model tool
const previewChartTool = {
  name: 'preview_chart',
  description: 'Validate a chart spec and return a preview ID.',
  parameters: chartJsonSchema
}

const presentChartTool = {
  name: 'present_chart',
  description: 'Publish a validated chart to the answer.',
  parameters: {
    type: 'object',
    properties: { preview_id: { type: 'string' } },
    required: ['preview_id']
  }
}

// 4. Server
const previews = new Map<string, ChartData>()

function previewChart(spec: unknown) {
  if (!isChartData(spec) || !isValidChart(spec)) {
    return { valid: false, issues: ['Series must align with categories.'] }
  }
  const id = crypto.randomUUID()
  previews.set(id, spec)
  return { valid: true, preview_id: id }
}

async function presentChart(previewId: string, messageId: string) {
  const chart = previews.get(previewId)
  if (!chart) throw new Error('Preview expired.')
  await appendAnswerPart(messageId, { kind: 'chart', chart })
  publishAnswerParts(messageId)
}

// 5. Client
function ChartNode({ chart }: { chart: ChartData }) {
  return (
    <ChartWidget
      {...chart}
      createChart={async (element, option) => {
        const { chartEngine } = await import('./chart-engine')
        return chartEngine.create(element, option)
      }}
    />
  )
}
```

Then add generated mode only after the native path is solid.

---

## 20. Acceptance criteria

A port is complete when:

- A model can turn “show me how these monthly values changed” into a line chart without being told the chart type.
- A model can turn “compare these magnitudes” into a bar chart with preserved values and units.
- A pie is rejected unless it is one non-negative series.
- A misaligned series is rejected with an actionable repair message.
- The chart renders from persisted JSON after reload, not from a one-off HTML fragment.
- The chart follows light/dark theme changes without losing legend or zoom state.
- The chart has a keyboard-accessible “View data” table.
- The final answer shows the chart first and a concise explanation after it.
- The chart engine is absent from startup and loads only when a chart exists.
- No chart code can execute host commands or access the network in generated mode.
- Generated submissions require an explicit owner confirmation and are idempotent.
- A failed visual still leaves a readable fallback and does not break the conversation.

---

## 21. Exact reference values

Use these as starting points, not immutable law:

| Constant | Value |
| --- | --- |
| Chart kinds | `bar`, `line`, `pie` |
| Max categories | 96 |
| Min/max series | 1 / 4 |
| Max title length | 256 |
| Max description length | 1,024 |
| Max unit length | 40 |
| Max native chart height | 1,200 |
| Chart container height | 320 px (280 px ≤ 480 px wide) |
| Max live chart instances | 8 |
| Max chart width | 2,048 |
| Max device pixel ratio | 2 |
| Max UI nodes | 32 |
| Max UI depth | 8 |
| Max UI surfaces per answer | 4 |
| Max native spec size | 32 KB |
| Max generated source per node | 64 KiB (65,536 characters) |
| Max whole answer UI | 256 KB |
| Max generated state | 16 KB |
| Generated height range | 120–1,200 px |
| Message rate cap | 120/s |
| Frame startup timeout | 5 s |
| Frame render timeout | 30 s |

---

## 22. Final mental model

Think of the system as three layers:

```text
Model layer
  chooses a mode and authors semantic data or bounded source

Trust layer
  validates shape, data relationships, source constraints, and publication rules

Render layer
  maps known data to trusted components and a themed chart engine;
  isolates generated code behind a bridge and a CSP
```

Charts are successful when the model supplies only the facts and the intended comparison, while the trusted layer owns how the visual is drawn, themed, read, exported, and kept safe.
