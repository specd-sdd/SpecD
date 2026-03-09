import { type SpecdConfig, type SpecdWorkspaceConfig } from '../application/specd-config.js'
import { MissingDefaultWorkspaceError } from '../domain/errors/missing-default-workspace-error.js'

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
