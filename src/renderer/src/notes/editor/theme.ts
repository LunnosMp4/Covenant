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
    padding: '2px 0 28px',
    caretColor: 'rgb(var(--n-100))'
  },
  '.cm-line': {
    padding: '0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'rgb(var(--n-100))'
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgb(var(--n-50) / 0.14)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
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
