import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { computeLivePreview } from './livePreview'
import { BulletWidget, CodeLanguageWidget, HorizontalRuleWidget, TaskWidget } from './widgets'

interface DecorationInfo {
  from: number
  to: number
  kind: string
  className?: string
  widget?: unknown
}

function stateFor(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage })]
  })
}

function decorationsFor(doc: string, cursor = 0): DecorationInfo[] {
  const state = stateFor(doc, cursor)
  const decorations = computeLivePreview(state)
  const result: DecorationInfo[] = []
  decorations.between(0, state.doc.length, (from, to, value) => {
    result.push({
      from,
      to,
      kind: value.spec.kind as string,
      className: value.spec.class as string | undefined,
      widget: value.spec.widget as unknown
    })
  })
  return result
}

function hidden(decorations: DecorationInfo[]): DecorationInfo[] {
  return decorations.filter((entry) => entry.kind === 'hide')
}

function replaced(decorations: DecorationInfo[]): DecorationInfo[] {
  return decorations.filter((entry) => entry.kind === 'replace')
}

function marked(decorations: DecorationInfo[], className: string): DecorationInfo[] {
  return decorations.filter((entry) => entry.kind === 'style' && entry.className === className)
}

function lines(decorations: DecorationInfo[], className: string): DecorationInfo[] {
  return decorations.filter(
    (entry) =>
      entry.kind === 'line' &&
      typeof entry.className === 'string' &&
      entry.className.split(' ').includes(className)
  )
}

describe('live preview — headings', () => {
  it('hides the hashes while the caret is in the heading text', () => {
    const decorations = decorationsFor('## Title', 5)
    expect(hidden(decorations)).toEqual([{ from: 0, to: 3, kind: 'hide', className: undefined, widget: undefined }])
    expect(lines(decorations, 'cm-mdl-h2')).toHaveLength(1)
  })

  it('reveals the hashes when the caret is at the start of the line', () => {
    const decorations = decorationsFor('## Title', 0)
    expect(hidden(decorations)).toHaveLength(0)
    expect(decorations.some((entry) => entry.kind === 'markup' && entry.from === 0 && entry.to === 2)).toBe(true)
  })

  it('reveals the hashes when the caret sits right after the space', () => {
    const decorations = decorationsFor('## Title', 3)
    expect(hidden(decorations)).toHaveLength(0)
  })

  it('styles each ATX level', () => {
    expect(lines(decorationsFor('# One', 5), 'cm-mdl-h1')).toHaveLength(1)
    expect(lines(decorationsFor('### Three', 9), 'cm-mdl-h3')).toHaveLength(1)
  })
})

describe('live preview — inline markup', () => {
  it('hides emphasis markers when the caret is outside', () => {
    const doc = 'a **bold** b'
    const decorations = decorationsFor(doc, 0)
    expect(hidden(decorations)).toEqual([
      { from: 2, to: 4, kind: 'hide', className: undefined, widget: undefined },
      { from: 8, to: 10, kind: 'hide', className: undefined, widget: undefined }
    ])
    expect(marked(decorations, 'cm-mdl-strong')).toHaveLength(1)
  })

  it('reveals the markers of the element the caret is in', () => {
    const decorations = decorationsFor('a **bold** b', 5)
    expect(hidden(decorations)).toHaveLength(0)
    expect(decorations.some((entry) => entry.kind === 'markup' && entry.from === 2)).toBe(true)
  })

  it('hides italic, strikethrough and inline code markers', () => {
    const decorations = decorationsFor('a\n\n*it* ~~gone~~ `code`', 0)
    expect(marked(decorations, 'cm-mdl-em')).toHaveLength(1)
    expect(marked(decorations, 'cm-mdl-strike')).toHaveLength(1)
    expect(marked(decorations, 'cm-mdl-code')).toHaveLength(1)
    expect(hidden(decorations)).toHaveLength(6)
  })
})

describe('live preview — links', () => {
  it('keeps the label and hides the brackets and URL', () => {
    const doc = 'see [link](https://x.y) now'
    const decorations = decorationsFor(doc, 0)
    const label = doc.indexOf('link')
    expect(marked(decorations, 'cm-mdl-link')[0]).toMatchObject({
      from: label,
      to: label + 'link'.length
    })
    expect(hidden(decorations).length).toBeGreaterThanOrEqual(4)
  })
})

describe('live preview — lists', () => {
  it('renders bullets as widgets', () => {
    const decorations = decorationsFor('- item', 6)
    const [bullet] = replaced(decorations)
    expect(bullet).toMatchObject({ from: 0, to: 2 })
    expect(bullet.widget).toBeInstanceOf(BulletWidget)
  })

  it('reveals the bullet when the caret is on the marker', () => {
    const decorations = decorationsFor('- item', 0)
    expect(replaced(decorations)).toHaveLength(0)
    expect(decorations.some((entry) => entry.kind === 'markup' && entry.from === 0 && entry.to === 1)).toBe(true)
  })

  it('keeps ordered numbers but dims them', () => {
    const decorations = decorationsFor('1. item', 7)
    expect(replaced(decorations)).toHaveLength(0)
    expect(marked(decorations, 'cm-mdl-listnumber')).toHaveLength(1)
  })

  it('renders task markers as checkboxes', () => {
    const decorations = decorationsFor('- [ ] todo', 10)
    const [task] = replaced(decorations).filter((entry) => entry.widget instanceof TaskWidget)
    expect(task).toMatchObject({ from: 2, to: 5 })
    expect((task.widget as TaskWidget).checked).toBe(false)
  })

  it('marks checked tasks', () => {
    const decorations = decorationsFor('- [x] done', 10)
    const [task] = replaced(decorations).filter((entry) => entry.widget instanceof TaskWidget)
    expect((task.widget as TaskWidget).checked).toBe(true)
  })
})

describe('live preview — blocks', () => {
  it('hides quote markers and styles the lines', () => {
    const decorations = decorationsFor('> quoted', 8)
    expect(hidden(decorations)).toEqual([
      { from: 0, to: 2, kind: 'hide', className: undefined, widget: undefined }
    ])
    expect(lines(decorations, 'cm-mdl-quote')).toHaveLength(1)
  })

  it('hides fences but keeps the language badge', () => {
    const doc = '```js\ncode\n```'
    const decorations = decorationsFor(doc, 8)
    const badges = replaced(decorations).filter((entry) => entry.widget instanceof CodeLanguageWidget)
    expect(badges).toHaveLength(1)
    expect(badges[0]).toMatchObject({ from: 0, to: 5 })
    expect((badges[0].widget as CodeLanguageWidget).language).toBe('js')
    expect(lines(decorations, 'cm-mdl-codeblock')).toHaveLength(3)
  })

  it('reveals an opening fence when the caret is on it', () => {
    const decorations = decorationsFor('```js\ncode\n```', 1)
    expect(replaced(decorations).filter((entry) => entry.widget instanceof CodeLanguageWidget)).toHaveLength(0)
    expect(decorations.some((entry) => entry.kind === 'markup' && entry.from === 0)).toBe(true)
  })

  it('renders horizontal rules as widgets', () => {
    const decorations = decorationsFor('---', 3)
    expect(replaced(decorations)).toHaveLength(0)

    const inactive = decorationsFor('a\n\n---\n\nb', 0)
    const [rule] = replaced(inactive).filter((entry) => entry.widget instanceof HorizontalRuleWidget)
    expect(rule).toMatchObject({ from: 3, to: 6 })
  })

  it('does not produce overlapping replacements for quoted code fences', () => {
    const doc = '> ```js\n> code\n> ```'
    const decorations = decorationsFor(doc, 10)
    const ranges = replaced(decorations).sort((a, b) => a.from - b.from)
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index].from).toBeGreaterThanOrEqual(ranges[index - 1].to)
    }
  })
})
