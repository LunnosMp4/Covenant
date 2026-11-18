import { describe, expect, it } from 'vitest'
import { FRAME_FILE, buildFrameDocument } from './frame'

const document = buildFrameDocument('/* runtime-bundle */')

describe('buildFrameDocument', () => {
  it('is served next to the chart engine', () => {
    expect(FRAME_FILE).toBe('frame.html')
  })

  it('inlines the runtime instead of loading it as a subresource', () => {
    expect(document).toContain('<script>/* runtime-bundle */</script>')
    // A `file:` subresource is blocked inside a sandboxed frame in packaged
    // builds, and a blob document inherits the app CSP. Both were regressions.
    expect(document).not.toContain('<script src=')
    expect(document.match(/<script/g)).toHaveLength(1)

    const csp = /content="([^"]+)"/.exec(document)?.[1] ?? ''
    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'))
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'")
  })

  it('keeps the frame isolated', () => {
    expect(document).toContain("default-src 'none'")
    expect(document).toContain("connect-src 'none'")
    expect(document).toContain("frame-src 'none'")
    expect(document).toContain("base-uri 'none'")
  })

  it('allows only its own inline script and styles', () => {
    expect(document).toContain("script-src 'self' 'unsafe-inline'")
    expect(document).toContain("style-src 'unsafe-inline'")
    expect(document).toContain('<div id="covenant-content"></div>')
    expect(document).toContain('<style id="covenant-generated-css"></style>')
  })
})
