import { EditorView } from '@codemirror/view'

/**
 * Editor chrome for the notes surface. Typography for the rendered Markdown
 * itself lives in `assets/index.css` (`.cm-mdl-*`) so it can share the app's
 * theme tokens; this only covers the CodeMirror scaffolding.
 */
export const notesEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'rgb(var(--n-200))'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.7',
    overflowY: 'auto',
    overflowX: 'hidden'
  },
  '.cm-content': {
    padding: '2px 2px 28px 2px',
    caretColor: 'rgb(var(--n-100))'
  },
  '.cm-line': {
    padding: '0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'rgb(var(--n-100))'
  },
  // The base light/dark themes ship their own `&light.cm-focused ... .cm-selectionBackground`
  // colour (lavender on light), whose specificity beats the shorthand selector. Match the
  // full descendant chain so the theme-aware token always wins in both modes.
  '&.cm-editor .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--n-50) / 0.14)'
  },
  '&.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--n-50) / 0.18)'
  },
  '.cm-placeholder': {
    color: 'rgb(var(--n-50) / 0.35)'
  },
  '.cm-panels': {
    backgroundColor: 'transparent'
  },
  '.cm-tooltip': {
    backgroundColor: 'rgb(var(--n-900))',
    border: '1px solid rgb(var(--n-50) / 0.12)'
  }
})
