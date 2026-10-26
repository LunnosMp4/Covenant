import { syntaxTree } from '@codemirror/language'
import type { EditorState, Extension, Range } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
  type WidgetType
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import {
  bulletWidget,
  CodeLanguageWidget,
  horizontalRuleWidget,
  TaskWidget
} from './widgets'

/**
 * MarkText-style live preview.
 *
 * The document always stays raw Markdown; this module only decorates it:
 * syntax markers are hidden and the content is styled so the note reads like
 * a rendered page. Markers are revealed again for the element the cursor is
 * in (inline) or for the block marker the cursor is sitting on (headings,
 * lists, quotes, fences, rules), so they can be edited or deleted.
 */

const HIDE = 'hide'
const REPLACE = 'replace'
const MARKUP = 'markup'
const STYLE = 'style'
const LINE = 'line'

const hiddenDecoration = Decoration.replace({ kind: HIDE })
const markupDecoration = Decoration.mark({ class: 'cm-mdl-markup', kind: MARKUP })

const markCache = new Map<string, Decoration>()
const lineCache = new Map<string, Decoration>()

function markDecoration(className: string): Decoration {
  let decoration = markCache.get(className)
  if (!decoration) {
    decoration = Decoration.mark({ class: className, kind: STYLE })
    markCache.set(className, decoration)
  }
  return decoration
}

function lineDecoration(className: string): Decoration {
  let decoration = lineCache.get(className)
  if (!decoration) {
    decoration = Decoration.line({ class: className, kind: LINE })
    lineCache.set(className, decoration)
  }
  return decoration
}

export interface LivePreviewRange {
  from: number
  to: number
}

/**
 * Builds the decoration set for a document. Exported separately from the
 * view plugin so it can be unit-tested with a bare `EditorState`.
 */
export function computeLivePreview(
  state: EditorState,
  ranges: readonly LivePreviewRange[] = [{ from: 0, to: state.doc.length }]
): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const seen = new Set<string>()

  const addMark = (from: number, to: number, decoration: Decoration): void => {
    if (from < to) decorations.push(decoration.range(from, to))
  }

  const addLine = (from: number, className: string): void => {
    decorations.push(lineDecoration(className).range(from))
  }

  /** Replacement decorations must not overlap, so the widest one wins. */
  const addReplace = (from: number, to: number, widget?: WidgetType): void => {
    if (from >= to) return
    for (let index = decorations.length - 1; index >= 0; index -= 1) {
      const existing = decorations[index]
      if (existing.value.spec.kind === REPLACE && existing.from < to && existing.to > from) {
        // A containing decoration (e.g. a fenced code line inside a quote)
        // replaces the narrower marker; otherwise keep the existing one.
        if (from <= existing.from && to >= existing.to) decorations.splice(index, 1)
        else return
      }
    }
    const decoration = widget
      ? Decoration.replace({ widget, kind: REPLACE })
      : hiddenDecoration
    decorations.push(decoration.range(from, to))
  }

  const selectionTouches = (from: number, to: number): boolean =>
    state.selection.ranges.some((range) => range.to >= from && range.from <= to)

  /**
   * Block markers (heading hashes, list bullets, quote carets, fences) are
   * only shown while the selection sits on the marker itself or right after
   * it, at the start of the content. Typing the heading text therefore hides
   * the hashes, while deleting back to the start of the line brings them back.
   */
  const blockMarkerVisible = (lineFrom: number, contentStart: number): boolean =>
    state.selection.ranges.some((range) => range.to >= lineFrom && range.from <= contentStart)

  const contentStartOf = (lineFrom: number, lineTo: number, markerEnd: number): number => {
    if (markerEnd >= lineTo) return markerEnd
    const next = state.doc.sliceString(markerEnd, markerEnd + 1)
    return next === ' ' || next === '\t' ? markerEnd + 1 : markerEnd
  }

  const decorateInline = (
    node: SyntaxNode,
    markerNames: readonly string[],
    className: string
  ): void => {
    const markers: SyntaxNode[] = []
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (markerNames.includes(child.name)) markers.push(child)
    }
    if (markers.length === 0) return

    addMark(markers[0].to, markers[markers.length - 1].from, markDecoration(className))
    const visible = selectionTouches(node.from, node.to)
    for (const marker of markers) {
      if (visible) addMark(marker.from, marker.to, markupDecoration)
      else addReplace(marker.from, marker.to)
    }
  }

  const decorateLink = (node: SyntaxNode): void => {
    const markers: SyntaxNode[] = []
    let url: SyntaxNode | null = null
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'LinkMark') markers.push(child)
      else if (child.name === 'URL') url = child
    }
    if (markers.length < 4) return

    addMark(
      markers[0].to,
      markers[1].from,
      markDecoration(node.name === 'Image' ? 'cm-mdl-image' : 'cm-mdl-link')
    )
    const visible = selectionTouches(node.from, node.to)
    for (const marker of markers) {
      if (visible) addMark(marker.from, marker.to, markupDecoration)
      else addReplace(marker.from, marker.to)
    }
    if (url) {
      if (visible) addMark(url.from, url.to, markupDecoration)
      else addReplace(url.from, url.to)
    }
  }

  const decorateFencedCode = (node: SyntaxNode): void => {
    const firstLine = state.doc.lineAt(node.from)
    const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))

    let openingMark: SyntaxNode | null = null
    let closingMark: SyntaxNode | null = null
    let info: SyntaxNode | null = null
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'CodeMark') {
        if (!openingMark && state.doc.lineAt(child.from).number === firstLine.number) {
          openingMark = child
        } else {
          closingMark = child
        }
      } else if (child.name === 'CodeInfo') {
        info = child
      }
    }

    for (let number = firstLine.number; number <= lastLine.number; number += 1) {
      const classes = ['cm-mdl-codeblock']
      if (number === firstLine.number) classes.push('cm-mdl-code-open')
      if (number === lastLine.number) classes.push('cm-mdl-code-close')
      addLine(state.doc.line(number).from, classes.join(' '))
    }

    if (openingMark) {
      if (selectionTouches(firstLine.from, firstLine.to)) {
        addMark(openingMark.from, openingMark.to, markupDecoration)
        if (info) addMark(info.from, info.to, markupDecoration)
      } else {
        const language = info ? state.doc.sliceString(info.from, info.to).trim() : ''
        addReplace(firstLine.from, firstLine.to, new CodeLanguageWidget(language))
      }
    }

    if (closingMark) {
      const closingLine = state.doc.lineAt(closingMark.from)
      if (selectionTouches(closingLine.from, closingLine.to)) {
        addMark(closingMark.from, closingMark.to, markupDecoration)
      } else {
        addReplace(closingLine.from, closingLine.to)
      }
    }
  }

  const decorateIndentedCode = (node: SyntaxNode): void => {
    const firstLine = state.doc.lineAt(node.from)
    const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))
    for (let number = firstLine.number; number <= lastLine.number; number += 1) {
      addLine(state.doc.line(number).from, 'cm-mdl-codeblock')
    }
  }

  const decorateBlockLines = (node: SyntaxNode, className: string): void => {
    const firstLine = state.doc.lineAt(node.from)
    const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))
    for (let number = firstLine.number; number <= lastLine.number; number += 1) {
      addLine(state.doc.line(number).from, className)
    }
  }

  const handleNode = (node: SyntaxNode): void => {
    switch (node.name) {
      case 'ATXHeading1':
      case 'ATXHeading2':
      case 'ATXHeading3':
      case 'ATXHeading4':
      case 'ATXHeading5':
      case 'ATXHeading6':
        addLine(state.doc.lineAt(node.from).from, `cm-mdl-h${node.name.slice(-1)}`)
        break
      case 'SetextHeading1':
      case 'SetextHeading2':
        addLine(state.doc.lineAt(node.from).from, `cm-mdl-h${node.name.endsWith('1') ? 1 : 2}`)
        break
      case 'HeaderMark': {
        // Setext underlines (`===`) are left alone; only ATX hashes hide.
        if (node.parent?.name.startsWith('Setext')) break
        const line = state.doc.lineAt(node.from)
        const contentStart = contentStartOf(line.from, line.to, node.to)
        if (blockMarkerVisible(line.from, contentStart)) {
          addMark(node.from, node.to, markupDecoration)
        } else {
          addReplace(node.from, contentStart)
        }
        break
      }
      case 'StrongEmphasis':
        decorateInline(node, ['EmphasisMark'], 'cm-mdl-strong')
        break
      case 'Emphasis':
        decorateInline(node, ['EmphasisMark'], 'cm-mdl-em')
        break
      case 'Strikethrough':
        decorateInline(node, ['StrikethroughMark'], 'cm-mdl-strike')
        break
      case 'InlineCode':
        decorateInline(node, ['CodeMark'], 'cm-mdl-code')
        break
      case 'Link':
      case 'Image':
        decorateLink(node)
        break
      case 'Blockquote':
        decorateBlockLines(node, 'cm-mdl-quote')
        break
      case 'QuoteMark': {
        const line = state.doc.lineAt(node.from)
        const contentStart = contentStartOf(line.from, line.to, node.to)
        if (blockMarkerVisible(line.from, contentStart)) {
          addMark(node.from, node.to, markupDecoration)
        } else {
          addReplace(node.from, contentStart)
        }
        break
      }
      case 'ListMark': {
        const line = state.doc.lineAt(node.from)
        const contentStart = contentStartOf(line.from, line.to, node.to)
        if (blockMarkerVisible(line.from, contentStart)) {
          addMark(node.from, node.to, markupDecoration)
        } else if (node.parent?.parent?.name === 'OrderedList') {
          addMark(node.from, node.to, markDecoration('cm-mdl-listnumber'))
        } else {
          addReplace(node.from, contentStart, bulletWidget)
        }
        break
      }
      case 'TaskMarker': {
        const line = state.doc.lineAt(node.from)
        const contentStart = contentStartOf(line.from, line.to, node.to)
        if (blockMarkerVisible(line.from, contentStart)) {
          addMark(node.from, node.to, markupDecoration)
        } else {
          const checked = /[xX]/.test(state.doc.sliceString(node.from, node.to))
          addReplace(node.from, node.to, new TaskWidget(checked, node.from, node.to))
        }
        break
      }
      case 'FencedCode':
        decorateFencedCode(node)
        break
      case 'CodeBlock':
        decorateIndentedCode(node)
        break
      case 'HorizontalRule': {
        const line = state.doc.lineAt(node.from)
        addLine(line.from, 'cm-mdl-hr-line')
        if (selectionTouches(line.from, line.to)) {
          addMark(line.from, line.to, markupDecoration)
        } else {
          addReplace(line.from, line.to, horizontalRuleWidget)
        }
        break
      }
      default:
        break
    }
  }

  const tree = syntaxTree(state)
  for (const range of ranges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const key = `${node.name}:${node.from}:${node.to}`
        if (seen.has(key)) return
        seen.add(key)
        handleNode(node.node)
      }
    })
  }

  return Decoration.set(decorations, true)
}

class LivePreviewPlugin {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = computeLivePreview(view.state, view.visibleRanges)
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet && !update.viewportChanged) return
    this.decorations = computeLivePreview(update.state, update.view.visibleRanges)
  }
}

export const livePreview: Extension = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin) => plugin.decorations
})
