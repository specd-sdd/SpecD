import { type SpecdConfig, InvalidSpecPathError } from '@specd/core'

/** Result of parsing a spec ID string. */
export interface ParsedSpecId {
  /** The workspace name (e.g. `'default'`, `'billing-ws'`). */
  workspace: string
  /** The capability path within the workspace (e.g. `'auth/login'`). */
  capabilityPath: string
  /** The fully-qualified spec ID in canonical format (e.g. `'default:auth/login'`, `'billing:invoices/create'`). */
  specId: string
}

/**
 * Parses a spec ID string into a workspace and capability path.
 *
 * Uses **colon syntax** (`workspace:path`) as the canonical qualifier.
 * `default:_global/architecture` → workspace `default`, path `_global/architecture`.
 *
 * When no colon is present, workspace defaults to `'default'` and the full
 * string is the capability path (bare path shorthand).
 *
 * The returned `specId` is always fully-qualified (`workspace:capabilityPath`).
 *
 * @param id - The spec ID (e.g. `'auth/login'`, `'default:_global/arch'`, `'billing:invoices/create'`)
 * @param config - The fully-resolved project configuration
 * @returns The parsed spec ID parts
 * @throws {InvalidSpecPathError} When the colon-qualified workspace name is not found in the project configuration.
 */
export function parseSpecId(id: string, config: SpecdConfig): ParsedSpecId {
  const workspaceNames = config.workspaces.map((w) => w.name)

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

  return {
    workspace: 'default',
    capabilityPath: id,
    specId: `default:${id}`,
  }
}
