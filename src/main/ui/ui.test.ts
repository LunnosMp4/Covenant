import { describe, expect, it } from 'vitest'
import { UI_SPEC_VERSION } from '../../shared/ui/spec'
import { validateGeneratedSource } from '../../shared/ui/generated'
import {
  validateGeneratedCss,
  validateGeneratedHtml,
  validateGeneratedJavascript
} from './generatedValidation'
import { createSurfacePublisher } from './publish'

describe('generated HTML validation', () => {
  it('accepts plain markup', () => {
    expect(validateGeneratedHtml('<div class="cv-card"><p>Hello</p></div>', 'html')).toEqual([])
  })

  it('rejects scripts, frames and event handlers', () => {
    const issues = validateGeneratedHtml(
      '<script>alert(1)</script><iframe src="https://x.test"></iframe><button onclick="go()">x</button>',
      'html'
    ).join(' ')
    expect(issues).toMatch(/<script>/)
    expect(issues).toMatch(/<iframe>/)
    expect(issues).toMatch(/event handlers/)
  })

  it('rejects external resources but allows fragments and inline images', () => {
    expect(validateGeneratedHtml('<img src="https://x.test/a.png">', 'html').join(' ')).toMatch(
      /external resource/
    )
    expect(validateGeneratedHtml('<a href="#row">jump</a>', 'html')).toEqual([])
    expect(
      validateGeneratedHtml('<img src="data:image/png;base64,AAAA">', 'html')
    ).toEqual([])
  })

  it('checks inline style values', () => {
    expect(
      validateGeneratedHtml('<div style="color: #ff0000">x</div>', 'html').join(' ')
    ).toMatch(/colour token/)
    expect(validateGeneratedHtml('<div style="padding: var(--ui-space-sm)">x</div>', 'html')).toEqual(
      []
    )
  })

  it('nudges ad-hoc markup towards the kit', () => {
    const raw = Array.from({ length: 14 }, (_, index) => `<div><span>${index}</span></div>`).join('')
    expect(validateGeneratedHtml(raw, 'html').join(' ')).toMatch(/compose from the kit/)

    const nested =
      '<div class="cv-card"><div class="cv-section"><div class="cv-card">x</div></div></div>'
    expect(validateGeneratedHtml(nested, 'html').join(' ')).toMatch(/cannot contain another .cv-card/)

    const tables = '<table><tr><td>x</td></tr></table>'
    expect(validateGeneratedHtml(tables, 'html').join(' ')).toMatch(/class="cv-table"/)

    const slots = Array.from({ length: 3 }, () => '<div class="cv-chart"></div>').join('')
    expect(validateGeneratedHtml(slots, 'html').join(' ')).toMatch(/at most 2 chart slots/)
  })
})

describe('generated CSS validation', () => {
  it('accepts layout-only styling', () => {
    expect(
      validateGeneratedCss(
        '.a { display: flex; gap: var(--ui-space-sm); padding: var(--ui-space-md); width: 100%; }',
        'css'
      )
    ).toEqual([])
    expect(validateGeneratedCss('.a { position: relative; inset: auto; }', 'css')).toEqual([])
  })

  it('rejects presentation styling, pointing at the kit', () => {
    const issues = validateGeneratedCss(
      '.a { color: var(--chat-assistant-text); font-family: var(--ui-font); border-radius: var(--ui-radius-md); box-shadow: none; animation: spin 1s; }',
      'css'
    ).join(' ')
    expect(issues).toMatch(/color.*styling, not layout/)
    expect(issues).toMatch(/font-family/)
    expect(issues).toMatch(/border-radius/)
    expect(issues).toMatch(/box-shadow/)
    expect(issues).toMatch(/animation/)
  })

  it('rejects literal colours and unknown tokens', () => {
    expect(validateGeneratedCss('.a { color: #fff }', 'css').join(' ')).toMatch(/literal colour/)
    expect(validateGeneratedCss('.a { color: var(--made-up) }', 'css').join(' ')).toMatch(
      /not an available design token/
    )
  })

  it('rejects !important, token redefinition and host-owned at-rules', () => {
    expect(validateGeneratedCss('.a { margin: 0 !important }', 'css').join(' ')).toMatch(
      /!important/
    )
    expect(validateGeneratedCss(':root { --chat-accent: red }', 'css').join(' ')).toMatch(
      /custom properties/
    )
    expect(validateGeneratedCss('@font-face { font-family: x }', 'css').join(' ')).toMatch(
      /@font-face/
    )
    expect(validateGeneratedCss('@keyframes spin { to { opacity: 0 } }', 'css').join(' ')).toMatch(
      /@keyframes/
    )
  })

  it('rejects out-of-flow positioning', () => {
    expect(
      validateGeneratedCss('.a { position: fixed; }', 'css').join(' ')
    ).toMatch(/not allowed; the surface lays out in normal flow/)
  })

  it('keeps shared controls to layout properties', () => {
    expect(validateGeneratedCss('.cv-button { width: 100% }', 'css')).toEqual([])
    expect(validateGeneratedCss('.cv-button { color: red }', 'css').join(' ')).toMatch(
      /shared control/
    )
  })

  it('requires token typography', () => {
    expect(validateGeneratedCss('.a { font-size: 18px }', 'css').join(' ')).toMatch(/font-size/)
  })
})

describe('generated design contract', () => {
  it('accepts the documented kit example', () => {
    const source = {
      title: 'Reading minutes',
      fallback: 'Monday 20 min, Tuesday 35 min, Wednesday 25 min, Thursday 45 min.',
      html: '<div id="reading" class="cv-surface"></div>',
      css: '#reading .cv-chart { margin-top: var(--ui-space-xs); }',
      javascript: `
        const surface = document.getElementById('reading')
        surface.append(
          Covenant.ui.metricRow([{ label: 'This week', value: 125, unit: 'min' }]),
          Covenant.ui.chartSlot('default', 'Reading minutes by day'),
          Covenant.ui.callout('Two days below the goal', 'Monday and Wednesday trail.', 'info')
        )
        await Covenant.chart(surface.querySelector('.cv-chart'), {
          title: 'Reading minutes',
          kind: 'bar',
          categories: ['Mon', 'Tue', 'Wed', 'Thu'],
          series: [{ label: 'Reading', values: [20, 35, 25, 45] }],
          unit: 'min'
        })
      `
    }

    expect(validateGeneratedSource(source)).toEqual([])
  })
})

describe('generated JavaScript validation', () => {  it('accepts valid syntax without executing it', () => {
    expect(validateGeneratedJavascript('const x = 1; if (x) console.log(x)', 'js')).toEqual([])
  })

  it('reports syntax errors', () => {
    expect(validateGeneratedJavascript('const = 1', 'js').join(' ')).toMatch(/syntax error/i)
  })
})

describe('surface publisher', () => {
  const spec = {
    version: UI_SPEC_VERSION,
    root: 'chart',
    elements: {
      chart: {
        type: 'Chart',
        props: {
          title: 'Revenue',
          kind: 'bar',
          categories: ['Jan'],
          series: [{ label: 'Revenue', values: [10] }]
        }
      }
    }
  }

  it('publishes a valid spec as a draft surface', () => {
    const publisher = createSurfacePublisher()
    const result = publisher.publish(spec)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.part.surface.status).toBe('draft')
    expect(result.part.id.startsWith('surface_')).toBe(true)
  })

  it('rejects invalid data with repair feedback', () => {
    const publisher = createSurfacePublisher()
    const result = publisher.publish({
      ...spec,
      elements: {
        chart: {
          type: 'Chart',
          props: { ...spec.elements.chart.props, series: [{ label: 'R', values: [1, 2] }] }
        }
      }
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.join(' ')).toMatch(/align/)
  })

  it('caps the number of visuals per answer', () => {
    const publisher = createSurfacePublisher(2)
    expect(publisher.publish(spec).ok).toBe(true)
    expect(publisher.publish(spec).ok).toBe(true)
    const third = publisher.publish(spec)
    expect(third.ok).toBe(false)
    if (third.ok) return
    expect(third.issues.join(' ')).toMatch(/existing visual/)
  })

  it('runs deep validation on generated nodes', () => {
    const publisher = createSurfacePublisher()
    const result = publisher.publish({
      version: UI_SPEC_VERSION,
      root: 'visual',
      elements: {
        visual: {
          type: 'Generated',
          props: {
            title: 'Test',
            html: '<script>alert(1)</script>',
            fallback: 'Text'
          }
        }
      }
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.join(' ')).toMatch(/<script>/)
  })
})
