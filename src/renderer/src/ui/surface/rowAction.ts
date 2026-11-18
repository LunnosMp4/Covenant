/**
 * Row-action prompt interpolation.
 *
 * The model writes one prompt for the whole table and points at cells:
 * `{row}` is the first cell, `{row.N}` is cell N, `{index}` is the 1-based
 * position the user sees. Unknown placeholders are left untouched so a typo
 * degrades to readable text instead of an empty prompt.
 */

export function rowActionPrompt(
  template: string,
  row: readonly string[],
  index: number
): string {
  return template
    .replace(/\{index\}/g, String(index))
    .replace(/\{row\.(\d+)\}/g, (match, cell: string) => row[Number(cell)] ?? match)
    .replace(/\{row\}/g, row[0] ?? '')
}
