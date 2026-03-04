import { type SpecdConfig, InvalidSpecPathError } from '@specd/core'

/** Result of parsing a spec ID string. */
export interface ParsedSpecId {
  /** The workspace name (e.g. `'default'`, `'billing-ws'`). */
  workspace: string
  /** The capability path within the workspace (e.g. `'auth/login'`). */
  capabilityPath: string
  /** The full qualified spec ID as understood by the domain (e.g. `'auth/login'` or `'billing-ws/billing/inv'`). */
  specId: string
}

/**
 * Parses a spec ID string into a workspace and capability path.
 *
 * Supports two qualifier syntaxes:
 * - **Colon syntax** (`workspace:path`) — explicit workspace qualifier.
 *   `default:_global/architecture` → workspace `default`, path `_global/architecture`.
 * - **Slash syntax** (`workspace/path`) — if the first `/`-separated segment
 *   matches a configured workspace name, it is used as the workspace.
 *   `billing-ws/billing/inv` → workspace `billing-ws`, path `billing/inv`.
 *
 * When neither syntax matches, workspace defaults to `'default'` and the full
 * string is the capability path.
 *
 * @param id - The spec ID (e.g. `'auth/login'`, `'default:_global/arch'`, or `'billing-ws/billing/inv'`)
 * @param config - The fully-resolved project configuration
 * @returns The parsed spec ID parts
 * @throws {InvalidSpecPathError} When the colon-qualified workspace name is not found in the project configuration.
 */
export function parseSpecId(id: string, config: SpecdConfig): ParsedSpecId {
  const workspaceNames = config.workspaces.map((w) => w.name)

  // Colon syntax: workspace:path
  const colon = id.indexOf(':')
  if (colon !== -1) {
    const wsCandidate = id.slice(0, colon)
    if (workspaceNames.includes(wsCandidate)) {
      const capabilityPath = id.slice(colon + 1)
      return {
        workspace: wsCandidate,
        capabilityPath,
        specId: id,
      }
    }
    throw new InvalidSpecPathError(`unknown workspace '${wsCandidate}' in spec ID '${id}'`)
  }

  // Slash syntax: workspace/path
  const slash = id.indexOf('/')
  const firstSegment = slash !== -1 ? id.slice(0, slash) : null

  if (firstSegment !== null && workspaceNames.includes(firstSegment)) {
    return {
      workspace: firstSegment,
      capabilityPath: id.slice(slash + 1),
      specId: id,
    }
  }

  return {
    workspace: 'default',
    capabilityPath: id,
    specId: id,
  }
}
