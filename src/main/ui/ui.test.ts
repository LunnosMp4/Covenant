import { describe, expect, it } from 'vitest'
import { UI_SPEC_VERSION } from '../../shared/ui/spec'
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
  })
})

describe('generated CSS validation', () => {
  it('accepts token-based styling', () => {
    expect(
      validateGeneratedCss(
        '.a { color: var(--chat-assistant-text); font-family: var(--ui-font); border-radius: var(--ui-radius-md); }',
        'css'
      )
    ).toEqual([])
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

describe('generated JavaScript validation', () => {
  it('accepts valid syntax without executing it', () => {
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
