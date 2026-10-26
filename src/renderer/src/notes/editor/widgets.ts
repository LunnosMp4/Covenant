import { EditorView, WidgetType } from '@codemirror/view'

/**
 * Inline widgets used by the live-preview decorations. They replace raw
 * Markdown markers so the document reads like a rendered page while the
 * underlying text stays untouched.
 */

/** Bullet rendered in place of a `-`, `*` or `+` list marker. */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-mdl-bullet'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = '•'
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Clickable checkbox rendered in place of a `[ ]` / `[x]` task marker. */
export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  eq(other: TaskWidget): boolean {
    return (
      other instanceof TaskWidget &&
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'cm-mdl-checkbox'
    input.checked = this.checked
    input.setAttribute('aria-label', this.checked ? 'Mark task as not done' : 'Mark task as done')
    input.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return input
  }

  ignoreEvent(): boolean {
    // Let the native checkbox handle the click; the editor must not move the
    // cursor (which would reveal the raw `[ ]` marker and destroy the widget).
    return true
  }
}

/** Language badge shown on the (otherwise hidden) opening code fence. */
export class CodeLanguageWidget extends WidgetType {
  constructor(readonly language: string) {
    super()
  }

  eq(other: CodeLanguageWidget): boolean {
    return other instanceof CodeLanguageWidget && other.language === this.language
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-mdl-code-lang'
    span.textContent = this.language || 'code'
    return span
  }
}

/** Horizontal rule rendered in place of a `---` line. */
export class HorizontalRuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-mdl-hr'
    span.setAttribute('aria-hidden', 'true')
    return span
  }
}

export const bulletWidget = new BulletWidget()
export const horizontalRuleWidget = new HorizontalRuleWidget()
