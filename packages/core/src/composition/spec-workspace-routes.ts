import { type SpecWorkspaceRoute } from '../application/use-cases/_shared/spec-reference-resolver.js'

/**
 * Minimal workspace shape required to derive spec workspace routes.
 */
export interface SpecWorkspaceRouteInput {
  /** Workspace name (e.g. `default`, `core`). */
  readonly name: string
  /** Optional logical spec prefix from config. */
  readonly prefix?: string
}

/**
 * Derives logical workspace-route metadata from workspace config entries.
 *
 * @param workspaces - Workspace entries from project config
 * @returns Route metadata used by repository-backed spec reference resolution
 */
export function createSpecWorkspaceRoutes(
  workspaces: readonly SpecWorkspaceRouteInput[],
): readonly SpecWorkspaceRoute[] {
  return workspaces.map((workspace) => ({
    workspace: workspace.name,
    prefixSegments:
      workspace.prefix !== undefined
        ? workspace.prefix.split('/').filter((segment) => segment.length > 0)
        : [],
  }))
}
