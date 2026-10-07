import type { CodeSettings } from '../../shared/code/code'

/**
 * The `opencode.json` Covenant manages on every machine (local or remote). It
 * only carries non-secret, permission-related settings; model/credential
 * selection is applied through the SDK at runtime.
 */
export function buildManagedConfig(code: CodeSettings): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.json',
    autoupdate: false,
    share: 'disabled',
    permission: {
      edit: code.permission.edit,
      bash: code.permission.bash,
      external_directory: code.permission.external_directory,
      webfetch: code.permission.webfetch
    }
  }
}
