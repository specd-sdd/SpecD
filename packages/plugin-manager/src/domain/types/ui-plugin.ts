import type { SpecdConfig } from '@specd/core'
import type { PluginContext, SpecdPlugin } from './specd-plugin.js'

/** Options for UI plugin install validation. */
export interface UiInstallOptions {
  /** When true, install fails if `dist/index.html` is missing. Default true. */
  readonly requireBuiltDist?: boolean
}

/** Result returned by a UI plugin install hook. */
export interface UiInstallResult {
  readonly staticRoot: string
  readonly hasIndexHtml: boolean
  readonly message: string
}

/** Context passed to UI plugins when `specd ui serve` starts. */
export interface UiServeContext extends PluginContext {
  /** Listening API base including `/v1` suffix. */
  readonly apiBaseUrl: string
}

/**
 * Plugin contract for SpecD Studio UI shells (static bundle or dev server).
 */
export interface UiPlugin extends SpecdPlugin {
  readonly type: 'ui'

  /**
   * When false, CLI embeds {@link getStaticRoot} via the API static middleware.
   * When true, the plugin serves UI HTTP and {@link getServerUrl} applies.
   */
  hasServer(): boolean

  /** Absolute path to SPA assets (must contain `index.html` when {@link hasServer} is false). */
  getStaticRoot(): string

  /** Base URL of the plugin-owned UI server (required when {@link hasServer} is true). */
  getServerUrl?(): string

  /**
   * Optional validation hook (no project tree mutation).
   *
   * @param config - Project configuration.
   * @param options - Install options.
   * @returns Install summary.
   */
  install?(config: SpecdConfig, options?: UiInstallOptions): Promise<UiInstallResult>

  /**
   * Optional cleanup hook.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   */
  uninstall?(config: SpecdConfig, options?: UiInstallOptions): Promise<void>
}

/**
 * Checks whether a value satisfies the UI plugin extension contract.
 *
 * @param value - Candidate plugin.
 * @returns `true` when the value matches {@link UiPlugin}.
 */
export function isUiPlugin(value: SpecdPlugin): value is UiPlugin {
  const record = value as unknown as Record<string, unknown>
  if (record['type'] !== 'ui') return false
  if (typeof record['hasServer'] !== 'function') return false
  if (typeof record['getStaticRoot'] !== 'function') return false
  const hasServer = record['hasServer'] as () => boolean
  if (hasServer() === true && typeof record['getServerUrl'] !== 'function') {
    return false
  }
  return true
}
