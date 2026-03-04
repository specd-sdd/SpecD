import { type SpecdConfig } from '@specd/core'

/**
 * Builds a map of workspace name → absolute `schemasPath` for use with
 * `SchemaRegistry.resolve()` and `SchemaRegistry.list()`.
 *
 * Workspaces without a `schemasPath` configured are omitted from the map.
 *
 * @param config - The fully-resolved project configuration
 * @returns Map of workspace name → absolute schemas path
 */
export function buildWorkspaceSchemasPaths(config: SpecdConfig): Map<string, string> {
  const map = new Map<string, string>()
  for (const ws of config.workspaces) {
    if (ws.schemasPath !== null) {
      map.set(ws.name, ws.schemasPath)
    }
  }
  return map
}
