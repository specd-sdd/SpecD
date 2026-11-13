import { SpecdError } from '@specd/core'
import { describeThrown } from './describe-thrown.js'

/**
 * Thrown when one or more plugins fail during `destroy`.
 *
 * Replaces a plain `AggregateError` so hosts recognise it as a specd error.
 */
export class PluginDestroyError extends SpecdError {
  /** Machine-readable error code. */
  get code(): 'PLUGIN_DESTROY_FAILED' {
    return 'PLUGIN_DESTROY_FAILED'
  }

  /**
   * Creates the error.
   *
   * @param errors - Every failure raised by `destroy`, in destroy order
   * @param pluginNames - The plugin behind each entry of `errors`, same order
   */
  constructor(
    readonly errors: readonly unknown[],
    readonly pluginNames: readonly string[],
  ) {
    super(
      `${errors.length} plugin(s) failed during destroy: ${errors
        .map((error, index) => {
          const name = pluginNames[index]
          return name === undefined ? describeThrown(error) : `${name}: ${describeThrown(error)}`
        })
        .join(
          '; ',
        )}; check each plugin's destroy hook and release its resources manually if needed`,
    )
  }
}
