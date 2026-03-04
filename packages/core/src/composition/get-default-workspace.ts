import { type SpecdConfig, type SpecdWorkspaceConfig } from '../application/specd-config.js'
import { SpecdError } from '../domain/errors/specd-error.js'

/**
 * Thrown when the `'default'` workspace is missing from a `SpecdConfig`.
 *
 * Every valid `SpecdConfig` must contain exactly one workspace named `'default'`.
 * This error indicates a configuration that violates that invariant.
 */
class MissingDefaultWorkspaceError extends SpecdError {
  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'MISSING_DEFAULT_WORKSPACE'
  }

  /** Creates a new `MissingDefaultWorkspaceError`. */
  constructor() {
    super("SpecdConfig is missing a 'default' workspace — every config must have one")
  }
}

/**
 * Returns the `'default'` workspace from a `SpecdConfig`, throwing a typed
 * error if it is missing.
 *
 * @param config - The fully-resolved project configuration
 * @returns The default workspace configuration
 * @throws {MissingDefaultWorkspaceError} If no `'default'` workspace exists
 */
export function getDefaultWorkspace(config: SpecdConfig): SpecdWorkspaceConfig {
  const ws = config.workspaces.find((w) => w.name === 'default')
  if (ws === undefined) {
    throw new MissingDefaultWorkspaceError()
  }
  return ws
}
