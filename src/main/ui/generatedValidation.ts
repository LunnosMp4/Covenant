/**
 * Source validation for generated surfaces.
 *
 * This is a quality and design-contract check, **not** a security sandbox. The
 * browser isolation (opaque-origin iframe + CSP) is the boundary. Authored
 * JavaScript is compiled for syntax only and never executed in the main process.
 */

import { Script } from 'node:vm'
import { parseFragment } from 'parse5'
import postcss from 'postcss'
import { GENERATED_LIMITS, type GeneratedSource } from '../../shared/ui/generated'
import { UI_SPEC_VERSION, type UiSpec } from '../../shared/ui/spec'
import {
  GENERATED_LAYOUT_PROPERTIES,
  GENERATED_SHARED_CONTROL_SELECTORS,
  GENERATED_TOKENS
} from '../../shared/ui/tokens'

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'base',
  'meta',
  'link',
  'style',
  'template',
  'portal'
])

const FORBIDDEN_AT_RULES = new Set([
  'import',
  'font-face',
  'layer',
  'property',
  'namespace',
  'page',
  'custom-media'
])

const RESOURCE_ATTRIBUTES = new Set([
  'src',
  'srcset',
  'href',
  'xlink:href',
  'action',
  'formaction',
  'poster',
  'data',
  'background',
  'manifest'
])

const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'stop-color',
  'flood-color'
])

const NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'grey',
  'silver',
  'gold',
  'brown',
  'teal',
  'cyan',
  'magenta',
  'navy',
  'lime',
  'olive',
  'maroon',
  'crimson',
  'salmon',
  'tomato',
  'beige',
  'ivory',
  'khaki',
  'lavender',
  'violet',
  'indigo'
])

const ALLOWED_COLOR_WORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'none'
])

const LITERAL_COLOR_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i

const TOKEN_PATTERN = /var\(\s*(--[a-zA-Z0-9-]+)/g

interface WalkNode {
  nodeName: string
  tagName?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: WalkNode[]
}

function checkColorValue(
  value: string,
  property: string,
  path: string,
  issues: string[]
): void {
  if (!COLOR_PROPERTIES.has(property)) return
  if (LITERAL_COLOR_PATTERN.test(value)) {
    issues.push(`${path}: "${property}" must use a colour token, not a literal colour`)
    return
  }
  if (value.includes('var(') || ALLOWED_COLOR_WORDS.has(value.trim().toLowerCase())) return
  const words = value.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.some((word) => NAMED_COLORS.has(word))) {
    issues.push(`${path}: "${property}" must use a colour token, not a named colour`)
  }
}

function checkTokens(value: string, path: string, issues: string[]): void {
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const token = match[1]
    if (!GENERATED_TOKENS.includes(token)) {
      issues.push(`${path}: "${token}" is not an available design token`)
    }
  }
}

function checkTypography(property: string, value: string, path: string, issues: string[]): void {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'inherit' || normalized === 'initial' || normalized === 'unset') return

  if (property === 'font-family' && !normalized.includes('var(--ui-font')) {
    issues.push(`${path}: font-family must use var(--ui-font)`)
  }

  if (property === 'font-size' && !normalized.includes('var(--ui-font-size-')) {
    issues.push(`${path}: font-size must use a --ui-font-size-* token`)
  }

  if (property === 'line-height') {
    const numeric = /^[0-9.]+$/.test(normalized)
    if (!numeric && !normalized.includes('var(--ui-leading-')) {
      issues.push(`${path}: line-height must use a --ui-leading-* token or a unitless number`)
    }
  }

  if (property === 'border-radius') {
    const allowed =
      normalized.includes('var(--ui-radius-') ||
      normalized === '0' ||
      normalized === '50%' ||
      normalized === '0px'
    if (!allowed) {
      issues.push(`${path}: border-radius must use a --ui-radius-* token`)
    }
  }
}

function checkCssValue(property: string, value: string, path: string, issues: string[]): void {
  const lowerProperty = property.toLowerCase()
  checkTokens(value, path, issues)
  checkColorValue(value, lowerProperty, path, issues)
  checkTypography(lowerProperty, value, path, issues)

  if (lowerProperty === 'content' && /url\(/i.test(value)) {
    issues.push(`${path}: content cannot reference external resources`)
  }
  if (/\burl\(/i.test(value) && !/url\(\s*["']?data:image\//i.test(value)) {
    issues.push(`${path}: url() must be an inline data:image resource`)
  }
}

export function validateGeneratedCss(css: string, path: string): string[] {
  const issues: string[] = []

  let root: postcss.Root
  try {
    root = postcss.parse(css, { from: undefined })
  } catch (error) {
    return [`${path}: CSS could not be parsed (${error instanceof Error ? error.message : 'unknown error'})`]
  }

  root.walkAtRules((atRule) => {
    if (FORBIDDEN_AT_RULES.has(atRule.name.toLowerCase())) {
      issues.push(`${path}: @${atRule.name} is not allowed; the host owns it`)
    }
  })

  root.walkRules((rule) => {
    const selector = rule.selector
    const targetsSharedControl = GENERATED_SHARED_CONTROL_SELECTORS.some((shared) =>
      selector.includes(shared)
    )
    if (!targetsSharedControl) return

    rule.walkDecls((decl) => {
      const property = decl.prop.toLowerCase()
      if (property.startsWith('--cv-')) return
      if (!GENERATED_LAYOUT_PROPERTIES.has(property)) {
        issues.push(
          `${path}: shared control "${selector.trim()}" cannot set "${property}" (position it through a wrapper, or use the control's own props)`
        )
      }
    })
  })

  root.walkDecls((decl) => {
    const property = decl.prop.toLowerCase()
    const declPath = `${path} (${property})`

    if (decl.important) {
      issues.push(`${declPath}: !important is not allowed`)
    }

    if (property.startsWith('--')) {
      if (!property.startsWith('--cv-')) {
        issues.push(
          `${declPath}: custom properties must use the --cv- prefix so theme tokens cannot be redefined`
        )
      }
      return
    }

    checkCssValue(property, decl.value, declPath, issues)
  })

  return Array.from(new Set(issues))
}

export function validateGeneratedHtml(html: string, path: string): string[] {
  const issues: string[] = []

  let fragment: { childNodes?: WalkNode[] }
  try {
    fragment = parseFragment(html) as unknown as { childNodes?: WalkNode[] }
  } catch (error) {
    return [`${path}: HTML could not be parsed (${error instanceof Error ? error.message : 'unknown error'})`]
  }

  let count = 0
  let depth = 0

  const walk = (nodes: WalkNode[] | undefined, level: number): void => {
    if (!nodes) return
    for (const node of nodes) {
      count += 1
      depth = Math.max(depth, level)

      const tag = node.tagName?.toLowerCase()
      if (tag && FORBIDDEN_TAGS.has(tag)) {
        issues.push(`${path}: <${tag}> is not allowed in generated markup`)
      }

      for (const attr of node.attrs ?? []) {
        const name = attr.name.toLowerCase()
        const value = attr.value

        if (name.startsWith('on')) {
          issues.push(`${path}: inline event handlers ("${name}") are not allowed; attach listeners in JavaScript`)
          continue
        }

        if (RESOURCE_ATTRIBUTES.has(name)) {
          const trimmed = value.trim()
          const isFragment = name === 'href' && trimmed.startsWith('#')
          const isInlineImage =
            (name === 'src' || name === 'poster') && /^data:image\//i.test(trimmed)
          if (!isFragment && !isInlineImage) {
            issues.push(`${path}: "${name}" cannot load an external resource`)
          }
        }

        if (name === 'style') {
          if (/@import/i.test(value)) {
            issues.push(`${path}: @import is not allowed in inline styles`)
          }
          for (const [property, rawValue] of value
            .split(';')
            .map((entry) => entry.split(':'))
            .filter((entry) => entry.length >= 2)
            .map((entry) => [entry[0].trim(), entry.slice(1).join(':').trim()] as const)) {
            checkCssValue(property, rawValue, `${path} (style)`, issues)
          }
        }
      }

      walk(node.childNodes, level + 1)
    }
  }

  walk(fragment.childNodes, 1)

  if (count > GENERATED_LIMITS.maxHtmlNodes) {
    issues.push(`${path}: ${count} markup nodes exceeds the limit of ${GENERATED_LIMITS.maxHtmlNodes}`)
  }
  if (depth > GENERATED_LIMITS.maxHtmlDepth) {
    issues.push(`${path}: nesting depth ${depth} exceeds the limit of ${GENERATED_LIMITS.maxHtmlDepth}`)
  }

  return Array.from(new Set(issues))
}

export function validateGeneratedJavascript(javascript: string, path: string): string[] {
  try {
    // Compile only. Nothing is executed in the main process.
    void new Script(`(async () => {\n${javascript}\n})()`, { filename: 'generated.js' })
    return []
  } catch (error) {
    return [
      `${path}: JavaScript syntax error (${error instanceof Error ? error.message : 'unknown error'})`
    ]
  }
}

export function validateGeneratedSourceDeep(
  source: GeneratedSource,
  path: string
): string[] {
  const issues = [
    ...validateGeneratedHtml(source.html, `${path}/html`),
    ...(source.css ? validateGeneratedCss(source.css, `${path}/css`) : []),
    ...(source.javascript
      ? validateGeneratedJavascript(source.javascript, `${path}/javascript`)
      : [])
  ]

  const html = source.html.toLowerCase()
  if (html.includes('javascript:')) {
    issues.push(`${path}/html: javascript: URLs are not allowed`)
  }

  return issues
}

/** Validates every `Generated` node in an already structurally valid spec. */
export function validateGeneratedNodes(spec: UiSpec): string[] {
  if (spec.version !== UI_SPEC_VERSION) return []
  const issues: string[] = []
  for (const [id, node] of Object.entries(spec.elements)) {
    if (node.type !== 'Generated') continue
    issues.push(
      ...validateGeneratedSourceDeep(
        node.props as unknown as GeneratedSource,
        `/elements/${id}/props`
      )
    )
  }
  return issues
}
