import { join, relative } from 'node:path'
import { type SpecdConfig } from '@specd/core'

/**
 * Result of splitting a canonical graph path into workspace and relative path.
 */
export interface WorkspaceIdentity {
  /** Name of the workspace owning the path. */
  readonly workspace: string
  /** Path relative to the workspace code root. */
  readonly relativePath: string
}

const DRIVE_LETTER_PATH = /^[A-Za-z]:(?:[/\\]|$)/

/**
 * Reports whether a graph path starts with a Windows drive letter.
 *
 * @param value - Candidate path
 * @returns True for `C:`, `C:/...`, and `C:\\...`
 */
function isDriveLetterPath(value: string): boolean {
  return DRIVE_LETTER_PATH.test(value)
}

/**
 * Splits a workspace identity without treating a Windows drive letter as the workspace.
 *
 * @param value - Canonical graph path (e.g. `core:src/index.ts`)
 * @returns The workspace and relative path, or null when `value` has no workspace prefix
 */
export function splitWorkspaceIdentity(value: string): WorkspaceIdentity | null {
  if (isDriveLetterPath(value)) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  return { workspace: value.slice(0, index), relativePath: value.slice(index + 1) }
}

/**
 * Normalizes a path to forward slashes and strips a leading `./`.
 *
 * @param value - A path to normalize.
 * @returns The normalized path.
 */
function toDisplaySeparators(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

/**
 * Projects a canonical graph resource path onto its project-relative path.
 *
 * Pure synchronous projection with no graph store access:
 * - `workspace:path` resources parse the identity, look up `workspace.codeRoot`,
 *   and return `relative(projectRoot, join(codeRoot, path))` normalized to `/`.
 * - `root:path` resources return the in-repository relative path.
 * - The canonical path is returned when the identity does not parse.
 *
 * @param config - Resolved project configuration used for workspace code roots.
 * @param canonicalPath - Canonical file or document path (e.g. `core:src/x.ts`).
 * @returns Project-relative path, or the canonical input on fallback.
 */
export function toProjectRelativePath(config: SpecdConfig, canonicalPath: string): string {
  const identity = splitWorkspaceIdentity(canonicalPath)
  if (identity === null || identity.relativePath.length === 0) return canonicalPath

  if (identity.workspace === 'root') {
    return toDisplaySeparators(identity.relativePath)
  }

  const workspace = config.workspaces.find((ws) => ws.name === identity.workspace)
  if (workspace === undefined) return canonicalPath

  const display = relative(config.projectRoot, join(workspace.codeRoot, identity.relativePath))
  return toDisplaySeparators(display)
}

/**
 * Alias of {@link toProjectRelativePath} for transition compatibility.
 */
export const toGraphDisplayPath = toProjectRelativePath
