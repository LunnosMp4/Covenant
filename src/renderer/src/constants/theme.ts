/**
 * Renderer-facing theme entry point.
 *
 * The catalog and palette helpers live in `src/shared/theme/theme.ts` so the
 * main process can validate and migrate the saved theme as well. Keeping this
 * module as a re-export preserves the existing renderer import paths.
 */
export * from '../../../shared/theme/theme'
