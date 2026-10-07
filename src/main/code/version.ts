/**
 * Extracts the semver out of an `opencode --version` / `/api/info` string.
 * Accepts `opencode v2.0.24`, `2.0.24`, `v2.0.24-beta.1`, etc.
 */
export function parseBinaryVersion(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string') return undefined
  const match = raw.match(/v?(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?)/)
  return match ? match[1] : undefined
}
