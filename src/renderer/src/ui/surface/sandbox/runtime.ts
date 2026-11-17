/**
 * Sandbox runtime — bundled separately by esbuild and inlined into the frame
 * bootstrap document. It deliberately has no imports from the app's React tree:
 * generated surfaces are vanilla DOM, which keeps the isolated document small
 * and auditable.
 */

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

let port: MessagePort | null = null
let state: Record<string, unknown> = {}
let initialized = false
let chartsRequest: Promise<void> | null = null
let resolveCharts: (() => void) | null = null
const pendingVisuals = new Set<Promise<unknown>>()
const messageTimes: number[] = []

function post(message: Record<string, unknown>, transfer?: Transferable[]): void {
  if (!port) return
  const now = performance.now()
  while (messageTimes.length > 0 && now - messageTimes[0] > 1_000) messageTimes.shift()
  if (messageTimes.length >= GENERATED_LIMITS.maxMessageRatePerSecond) return
  messageTimes.push(now)
  port.postMessage({ version: GENERATED_BRIDGE_VERSION, ...message }, transfer ?? [])
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
  return {
    el: element,
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
    kpi(
      label: string,
      value: string | number,
      options: { unit?: string; hint?: string } = {}
    ): HTMLElement {
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
        options.hint ? element('span', { className: 'cv-kpi-label' }, options.hint) : null
      )
    },
    card(...children: Array<Node | string>): HTMLElement {
      return element('div', { className: 'cv-card' }, ...children)
    },
    row(...children: Array<Node | string | null>): HTMLElement {
      return element('div', { className: 'cv-row' }, ...children)
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
    }
  }
}

function installApi(): void {
  window.Covenant = {
    chart(
      target: HTMLElement | string,
      option: Record<string, unknown>
    ): Promise<ChartHandle> {
      const host = typeof target === 'string' ? document.querySelector(target) : target
      if (!(host instanceof HTMLElement)) {
        return Promise.reject(new Error('Covenant.chart needs an element or selector.'))
      }
      return track(
        ensureCharts().then(() => {
          const runtime = window.covenantChartsRuntime
          if (!runtime) throw new Error('Chart runtime is unavailable.')
          return runtime.chartEngine.create(host, option)
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

async function settle(): Promise<void> {
  if (typeof document.fonts?.ready?.then === 'function') {
    await document.fonts.ready.catch(() => undefined)
  }

  for (let round = 0; round < 12; round += 1) {
    const pending = [...pendingVisuals]
    if (pending.length === 0) break
    await Promise.allSettled(pending)
    if (pendingVisuals.size === 0) break
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
  const data = event.data as Record<string, unknown> | null
  if (!data || data.version !== GENERATED_BRIDGE_VERSION) return

  if (data.type === 'initialize') {
    const channelPort = event.ports?.[0]
    if (channelPort) port = channelPort
    port?.addEventListener('message', (messageEvent) => {
      const message = messageEvent.data as Record<string, unknown> | null
      if (!message) return
      if (message.type === 'charts' && typeof message.source === 'string') {
        const script = document.createElement('script')
        script.textContent = message.source
        script.addEventListener('load', () => resolveCharts?.())
        document.head.append(script)
        resolveCharts?.()
        return
      }
      if (message.type === 'context' && message.context) {
        applyContext(message.context as Parameters<typeof applyContext>[0])
      }
    })
    boot(data as Parameters<typeof boot>[0])
    return
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
