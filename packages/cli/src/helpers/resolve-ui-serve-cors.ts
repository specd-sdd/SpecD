import type { SpecdConfig } from '@specd/core'
import type { UiPlugin } from '@specd/plugin-manager'

/**
 * Adds the active UI plugin HTTP origin to CORS when it runs on a separate port (Vite, etc.).
 *
 * @param config - Loaded project configuration.
 * @param uiPlugin - Active UI plugin from `plugins.ui`.
 * @returns Origins to merge into {@link createApiServer} for this `ui serve` process.
 */
export function resolveUiServeCorsOrigins(
  config: SpecdConfig,
  uiPlugin: UiPlugin,
): readonly string[] | undefined {
  if (!uiPlugin.hasServer()) {
    return undefined
  }

  const serverUrl = uiPlugin.getServerUrl?.()
  if (serverUrl === undefined) {
    return undefined
  }

  const uiOrigin = new URL(serverUrl).origin
  const configured = config.api?.cors?.origins ?? []
  return [...new Set([...configured, uiOrigin])]
}
