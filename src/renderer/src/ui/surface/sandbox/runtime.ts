/**
 * Sandbox runtime — bundled separately by esbuild and inlined into the frame
 * bootstrap document. It deliberately has no imports from the app's React tree:
 * generated surfaces are vanilla DOM, which keeps the isolated document small
 * and auditable.
 */

import {
  buildChartOption,
  chartThemeFrom,
  clampChartHeight,
  validateChartData,
  type ChartData
} from '../../../../../shared/ui/chart'
import {
  GENERATED_BRIDGE_VERSION,
  GENERATED_LIMITS,
  isGeneratedState
} from '../../../../../shared/ui/generated'

interface ChartHandle {
  setOption(option: Record<string, unknown>): void
  resize(): void
  refresh(): void
  dispose(): void
}

declare global {
  interface Window {
    Covenant?: Record<string, unknown>
  }
}

let state: Record<string, unknown> = {}
let initialized = false
let chartsRequested = false
let chartsRequest: Promise<void> | null = null
let resolveCharts: (() => void) | null = null
const pendingVisuals = new Set<Promise<unknown>>()
const messageTimes: number[] = []

/**
 * Everything travels over `window.postMessage`: the host validates
 * `event.source`, so a MessageChannel buys nothing and its lifecycle (transfer,
 * `start()`, closing on remount) is exactly where this bridge used to break.
 */
function post(message: Record<string, unknown>): void {
  const now = performance.now()
  while (messageTimes.length > 0 && now - messageTimes[0] > 1_000) messageTimes.shift()
  if (messageTimes.length >= GENERATED_LIMITS.maxMessageRatePerSecond) return
  messageTimes.push(now)
  window.parent.postMessage({ version: GENERATED_BRIDGE_VERSION, ...message }, '*')
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  post({ type: 'error', message: message.slice(0, 500) })
}

function track<T>(promise: Promise<T>): Promise<T> {
  pendingVisuals.add(promise)
  void promise.finally(() => pendingVisuals.delete(promise)).catch(() => undefined)
  return promise
}

function applyContext(context: {
  tokens?: Record<string, string>
  mode?: string
  fontFamily?: string
}): void {
  const root = document.documentElement
  if (context.mode === 'light' || context.mode === 'dark') {
    root.dataset.theme = context.mode
  }
  if (context.tokens && typeof context.tokens === 'object') {
    for (const [name, value] of Object.entries(context.tokens)) {
      if (!name.startsWith('--ui-') && !name.startsWith('--chat-') && !name.startsWith('--n-')) continue
      if (typeof value !== 'string' || value.length > 160) continue
      root.style.setProperty(name, value)
    }
  }
  if (context.fontFamily) {
    root.style.setProperty('--ui-font', context.fontFamily)
  }
  window.dispatchEvent(new CustomEvent('covenant:theme', { detail: context }))
}

function element(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: Array<Node | string | number | null | undefined>
): HTMLElement {
  const node = document.createElement(tag)
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'className') node.className = String(value)
      else if (key === 'text') node.textContent = String(value)
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
      } else if (value !== undefined && value !== null && value !== false) {
        node.setAttribute(key, value === true ? '' : String(value))
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue
    node.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child)
  }
  return node
}

function buildUiApi(): Record<string, unknown> {
  let fieldSequence = 0

  const stack = (
    gap: 'sm' | 'md' | 'lg' | undefined,
    ...children: Array<Node | string | null>
  ): HTMLElement =>
    element(
      'div',
      { className: `cv-stack${gap && gap !== 'md' ? ` cv-stack--${gap}` : ''}` },
      ...children
    )

  return {
    el: element,

    /* Layout ---------------------------------------------------------------- */
    stack(...children: Array<Node | string | null>): HTMLElement {
      return stack(undefined, ...children)
    },
    stackSm(...children: Array<Node | string | null>): HTMLElement {
      return stack('sm', ...children)
    },
    stackLg(...children: Array<Node | string | null>): HTMLElement {
      return stack('lg', ...children)
    },
    section(title: string, ...children: Array<Node | string | null>): HTMLElement {
      return element(
        'section',
        { className: 'cv-section' },
        title ? element('h2', { className: 'cv-h2' }, title) : null,
        ...children
      )
    },
    card(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-card' }, ...children)
    },
    row(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-row' }, ...children)
    },
    rowBetween(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-row cv-row--between' }, ...children)
    },
    grid(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-grid cv-grid--auto' }, ...children)
    },
    split(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-split' }, ...children)
    },
    surface(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-surface' }, ...children)
    },
    divider(): HTMLElement {
      return element('div', { className: 'cv-divider', role: 'separator' })
    },

    /* Type ------------------------------------------------------------------ */
    heading(text: string, level: 1 | 2 | 3 = 2): HTMLElement {
      return element(level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', { className: `cv-h${level}` }, text)
    },
    text(text: string): HTMLElement {
      return element('p', { className: 'cv-body' }, text)
    },
    caption(text: string): HTMLElement {
      return element('p', { className: 'cv-caption' }, text)
    },
    label(text: string): HTMLElement {
      return element('span', { className: 'cv-label' }, text)
    },
    note(text: string): HTMLElement {
      return element('p', { className: 'cv-note' }, text)
    },

    /* Data ------------------------------------------------------------------ */
    badge(text: string, tone: 'neutral' | 'positive' | 'negative' | 'accent' = 'neutral'): HTMLElement {
      return element('span', { className: 'cv-badge', 'data-tone': tone }, text)
    },
    callout(
      title: string,
      body: string,
      tone: 'info' | 'positive' | 'danger' = 'info'
    ): HTMLElement {
      return element(
        'div',
        { className: 'cv-callout', 'data-tone': tone },
        title ? element('span', { className: 'cv-callout-title' }, title) : null,
        body ? element('p', { className: 'cv-callout-body' }, body) : null
      )
    },
    list(items: Array<{ label: string; value?: string }>): HTMLElement {
      const ul = element('ul', { className: 'cv-list' }) as HTMLUListElement
      for (const item of items) {
        ul.append(
          element(
            'li',
            null,
            element('span', { className: 'cv-caption' }, item.label),
            item.value ? element('span', { className: 'cv-list-value' }, item.value) : null
          )
        )
      }
      return ul
    },
    kpi(
      label: string,
      value: string | number,
      options: { unit?: string; hint?: string; delta?: { value: number; tone?: string } } = {}
    ): HTMLElement {
      const delta = options.delta
      return element(
        'div',
        { className: 'cv-kpi' },
        element('span', { className: 'cv-kpi-label' }, label),
        element(
          'span',
          { className: 'cv-kpi-value' },
          String(value),
          options.unit ? element('span', { className: 'cv-kpi-unit' }, ` ${options.unit}`) : null
        ),
        delta
          ? element(
              'span',
              {
                className: 'cv-kpi-delta',
                ...(delta.tone ? { 'data-tone': delta.tone } : {})
              },
              `${delta.value > 0 ? '↑' : delta.value < 0 ? '↓' : '='} ${Math.abs(delta.value)}%`
            )
          : null,
        options.hint ? element('span', { className: 'cv-kpi-hint' }, options.hint) : null
      )
    },
    metricRow(
      items: Array<{
        label: string
        value: string | number
        unit?: string
        hint?: string
        delta?: { value: number; tone?: string }
      }>
    ): HTMLElement {
      const row = element('div', { className: 'cv-kpi-row' })
      for (const item of items) {
        row.append(
          element(
            'div',
            { className: 'cv-kpi' },
            element('span', { className: 'cv-kpi-label' }, item.label),
            element(
              'span',
              { className: 'cv-kpi-value' },
              String(item.value),
              item.unit ? element('span', { className: 'cv-kpi-unit' }, ` ${item.unit}`) : null
            ),
            item.delta
              ? element(
                  'span',
                  {
                    className: 'cv-kpi-delta',
                    ...(item.delta.tone ? { 'data-tone': item.delta.tone } : {})
                  },
                  `${item.delta.value > 0 ? '↑' : item.delta.value < 0 ? '↓' : '='} ${Math.abs(item.delta.value)}%`
                )
              : null,
            item.hint ? element('span', { className: 'cv-kpi-hint' }, item.hint) : null
          )
        )
      }
      return row
    },
    table(columns: string[], rows: Array<Array<string | number>>, alignRight: number[] = []): HTMLElement {
      const table = element('table', { className: 'cv-table' }) as HTMLTableElement
      const thead = document.createElement('thead')
      const headRow = document.createElement('tr')
      columns.forEach((column, index) => {
        const th = document.createElement('th')
        th.textContent = column
        if (alignRight.includes(index)) th.dataset.align = 'right'
        headRow.append(th)
      })
      thead.append(headRow)
      const tbody = document.createElement('tbody')
      rows.forEach((row) => {
        const tr = document.createElement('tr')
        row.forEach((cell, index) => {
          const td = document.createElement('td')
          td.textContent = String(cell)
          if (alignRight.includes(index)) td.dataset.align = 'right'
          tr.append(td)
        })
        tbody.append(tr)
      })
      table.append(thead, tbody)
      return table
    },
    chartSlot(
      height: 'short' | 'default' | 'tall' = 'default',
      label = 'Chart'
    ): HTMLElement {
      return element('div', {
        className: 'cv-chart',
        role: 'img',
        'aria-label': label,
        ...(height !== 'default' ? { 'data-height': height } : {})
      })
    },

    /* Controls -------------------------------------------------------------- */
    button(
      label: string,
      options: { variant?: 'primary' | 'secondary'; onClick?: () => void } = {}
    ): HTMLButtonElement {
      const button = element('button', {
        type: 'button',
        className: 'cv-button',
        ...(options.variant === 'primary' ? { 'data-variant': 'primary' } : {})
      }, label) as HTMLButtonElement
      if (options.onClick) button.addEventListener('click', options.onClick)
      return button
    },
    input(options: {
      value?: string
      placeholder?: string
      type?: string
      min?: number
      max?: number
      step?: number
      ariaLabel?: string
    } = {}): HTMLInputElement {
      const input = element('input', {
        className: 'cv-input',
        type: options.type ?? 'text',
        placeholder: options.placeholder,
        min: options.min,
        max: options.max,
        step: options.step,
        'aria-label': options.ariaLabel
      }) as HTMLInputElement
      if (options.value !== undefined) input.value = String(options.value)
      return input
    },
    select(
      values: string[],
      options: { value?: string; ariaLabel?: string } = {}
    ): HTMLSelectElement {
      const select = element('select', {
        className: 'cv-select',
        'aria-label': options.ariaLabel
      }) as HTMLSelectElement
      for (const value of values) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        select.append(option)
      }
      if (options.value) select.value = options.value
      return select
    },
    toggle(label: string, options: { checked?: boolean } = {}): HTMLLabelElement {
      const input = element('input', { type: 'checkbox' }) as HTMLInputElement
      input.checked = options.checked ?? false
      return element('label', { className: 'cv-toggle' }, input, label) as HTMLLabelElement
    },
    range(
      options: { min?: number; max?: number; step?: number; value?: number; ariaLabel?: string } = {}
    ): HTMLInputElement {
      const input = element('input', {
        className: 'cv-range',
        type: 'range',
        min: options.min,
        max: options.max,
        step: options.step,
        'aria-label': options.ariaLabel
      }) as HTMLInputElement
      if (options.value !== undefined) input.value = String(options.value)
      return input
    },
    field(labelText: string, control: HTMLElement, valueText?: string): HTMLElement {
      if (!control.id) {
        fieldSequence += 1
        control.id = `cv-field-${fieldSequence}`
      }
      const label = element(
        'label',
        { className: 'cv-field-label', for: control.id },
        labelText
      )
      const head = valueText
        ? element(
            'div',
            { className: 'cv-field' },
            label,
            element('output', { for: control.id }, valueText)
          )
        : label
      return element('div', { className: 'cv-stack cv-stack--sm' }, head, control)
    },
    actions(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-actions' }, ...children)
    }
  }
}

function installApi(): void {
  window.Covenant = {
    /**
     * Semantic chart: the same data contract as the native `Chart` node. The
     * option is built by the shared, themed builder — a generated chart is
     * pixel-identical to a native one and can never ship its own palette,
     * fonts, grid or animation.
     */
    chart(target: HTMLElement | string, data: unknown): Promise<ChartHandle> {
      const host = typeof target === 'string' ? document.querySelector(target) : target
      if (!(host instanceof HTMLElement)) {
        return Promise.reject(new Error('Covenant.chart needs an element or selector.'))
      }
      const issues = validateChartData(data)
      if (issues.length > 0) {
        return Promise.reject(new Error(issues.join('; ')))
      }
      const chart = data as ChartData
      if (chart.height !== undefined) host.style.height = `${clampChartHeight(chart.height)}px`

      return track(
        ensureCharts().then(() => {
          const runtime = window.covenantChartsRuntime
          if (!runtime) throw new Error('Chart runtime is unavailable.')
          const styles = getComputedStyle(document.documentElement)
          const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
          return runtime.chartEngine.create(host, buildChartOption(chart, chartThemeFrom(styles, mode)))
        })
      )
    },
    token(name: string): string {
      if (!/^--[a-z0-9-]+$/i.test(name)) throw new Error('Unknown token.')
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      if (!value) throw new Error(`Unknown token: ${name}`)
      return value
    },
    state: {
      get(): Record<string, unknown> {
        return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
      },
      set(next: unknown): void {
        if (!isGeneratedState(next)) {
          throw new Error('Keep interface state to a small JSON object.')
        }
        state = JSON.parse(JSON.stringify(next)) as Record<string, unknown>
        post({ type: 'state', value: state })
      }
    },
    submit(values: Record<string, unknown>): void {
      if (!isGeneratedState(values)) throw new Error('Submitted values must be a small JSON object.')
      post({ type: 'submit', values })
    },
    onTheme(handler: (detail: unknown) => void): () => void {
      const listener = (event: Event): void => handler((event as CustomEvent).detail)
      window.addEventListener('covenant:theme', listener)
      return () => window.removeEventListener('covenant:theme', listener)
    },
    reportError,
    ui: buildUiApi()
  }
}

function ensureCharts(): Promise<void> {
  if (window.covenantChartsRuntime) return Promise.resolve()
  if (chartsRequest) return chartsRequest

  chartsRequested = true
  chartsRequest = new Promise<void>((resolve, reject) => {
    resolveCharts = resolve
    post({ type: 'charts' })
    window.setTimeout(() => {
      reject(new Error('The chart module did not arrive in time.'))
    }, GENERATED_LIMITS.renderTimeoutMs)
  })
  return chartsRequest
}

function injectCss(css: string | undefined): void {
  if (!css) return
  const style = document.getElementById('covenant-generated-css')
  if (style) style.textContent = css
}

function runScript(javascript: string | undefined): void {
  if (!javascript || !javascript.trim()) return
  const script = document.createElement('script')
  script.textContent = `(async () => {\n${javascript}\n})().catch((error) => { window.Covenant.reportError(error) })`
  document.body.append(script)
  script.remove()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * One paint, with a timer fallback: Chromium throttles rAF in cross-origin
 * frames that are scrolled out of view, and a surface often mounts offscreen.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    window.requestAnimationFrame(finish)
    window.setTimeout(finish, 80)
  })
}

async function settle(): Promise<void> {
  if (typeof document.fonts?.ready?.then === 'function') {
    await Promise.race([document.fonts.ready.catch(() => undefined), delay(500)])
  }

  for (let round = 0; round < 12; round += 1) {
    const pending = [...pendingVisuals]
    if (pending.length === 0) break
    await Promise.race([Promise.allSettled(pending), delay(2_000)])
    if (pendingVisuals.size === 0) break
  }

  await nextFrame()
  await nextFrame()
  post({ type: 'rendered' })
}

function observeHeight(): void {
  if (typeof ResizeObserver === 'undefined') return
  let last = 0
  const observer = new ResizeObserver(() => {
    const height = Math.ceil(document.body.getBoundingClientRect().height)
    if (height <= 0 || Math.abs(height - last) < 2) return
    last = height
    post({ type: 'resize', height })
  })
  observer.observe(document.body)
}

function boot(payload: {
  source?: { html?: string; css?: string; javascript?: string }
  state?: unknown
  context?: Parameters<typeof applyContext>[0]
}): void {
  if (initialized) return
  initialized = true

  state = isGeneratedState(payload.state) ? (payload.state as Record<string, unknown>) : {}
  applyContext(payload.context ?? {})
  installApi()

  const content = document.getElementById('covenant-content')
  if (content && typeof payload.source?.html === 'string') {
    content.innerHTML = payload.source.html
  }
  injectCss(payload.source?.css)

  observeHeight()
  runScript(payload.source?.javascript)
  void settle().catch(reportError)
}

window.addEventListener('message', (event) => {
  // Only the embedding page may drive the frame.
  if (event.source !== window.parent) return
  const data = event.data as Record<string, unknown> | null
  if (!data || data.version !== GENERATED_BRIDGE_VERSION) return

  // The host asks for this when its bridge listener (re)attaches, so a remount
  // always gets a fresh handshake instead of relying on the first broadcast.
  if (data.type === 'handshake') {
    announceReady()
    return
  }

  if (data.type === 'charts' && typeof data.source === 'string') {
    const script = document.createElement('script')
    script.textContent = data.source
    script.addEventListener('load', () => resolveCharts?.())
    document.head.append(script)
    resolveCharts?.()
    return
  }

  if (data.type === 'context' && data.context) {
    applyContext(data.context as Parameters<typeof applyContext>[0])
    return
  }

  if (data.type === 'initialize') {
    const wasInitialized = initialized
    boot(data as Parameters<typeof boot>[0])
    // A re-handshake re-initializes; if the authored code already asked for the
    // chart engine, ask again.
    if (wasInitialized && chartsRequested && !window.covenantChartsRuntime) {
      post({ type: 'charts' })
    }
  }
})

function announceReady(): void {
  window.parent.postMessage({ version: GENERATED_BRIDGE_VERSION, type: 'ready' }, '*')
}

announceReady()

// The host attaches its bridge listener in an effect, which can land a tick
// after this document runs. Re-announce until initialized (or give up).
const readyRetry = window.setInterval(() => {
  if (initialized) {
    window.clearInterval(readyRetry)
    return
  }
  announceReady()
}, 200)
window.setTimeout(() => window.clearInterval(readyRetry), GENERATED_LIMITS.startupTimeoutMs)

export {}
