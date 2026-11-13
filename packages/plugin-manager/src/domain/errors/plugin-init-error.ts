import { SpecdError } from '@specd/core'
import { describeThrown } from './describe-thrown.js'

/**
 * Thrown when `init` fails with an error that is not already a {@link SpecdError}.
 */
export class PluginInitError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'PLUGIN_INIT_FAILED' {
    return 'PLUGIN_INIT_FAILED'
  }

  /**
   * Creates the error.
   *
   * @param pluginName - Plugin whose `init` failed
   * @param cause - Original thrown value
   */
  constructor(
    readonly pluginName: string,
    override readonly cause: unknown,
  ) {
    super(
      `Plugin '${pluginName}' failed during init: ${describeThrown(cause)}; fix the plugin or its config and retry`,
    )
  }
}
