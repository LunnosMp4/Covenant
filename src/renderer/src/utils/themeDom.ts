import { getThemeCssVars, getThemeMode } from '../constants/theme'

/**
 * Apply a theme to the document root so the command bar, settings window and
 * portaled modals all share the same accent, chat and tinted-neutral tokens.
 */
export function applyThemeToDocument(themeGradient: string): void {
  const root = document.documentElement
  root.setAttribute('data-theme', getThemeMode(themeGradient))

  for (const [key, value] of Object.entries(getThemeCssVars(themeGradient))) {
    root.style.setProperty(key, value)
  }
}
