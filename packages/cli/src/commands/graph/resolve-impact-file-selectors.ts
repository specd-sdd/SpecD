import { type CodeGraphProvider, type SpecdConfig } from '@specd/sdk'
import { join, relative } from 'node:path'
import { CliValidationError } from '../../errors/index.js'

/** A file resolved from a selector with its canonical path and workspace. */
export interface ResolvedFile {
  readonly path: string
  readonly workspace: string
}

/**
 * Resolves multiple file selectors to canonical file paths.
 * @param provider - The code graph provider.
 * @param selectors - The raw selector strings to resolve.
 * @returns The resolved files.
 */
export async function resolveImpactFileSelectors(
  provider: CodeGraphProvider,
  selectors: readonly string[],
): Promise<ResolvedFile[]> {
  const results: ResolvedFile[] = []

  for (const raw of selectors) {
    const resolved = await resolveOne(provider, raw)
    results.push(resolved)
  }

  return results
}

/**
 * Resolves a single file selector to a canonical file path.
 * @param provider - The code graph provider.
 * @param raw - The raw selector string.
 * @returns The resolved file with path and workspace.
 */
async function resolveOne(provider: CodeGraphProvider, raw: string): Promise<ResolvedFile> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new CliValidationError(`empty file selector`)
  }

  const matches = (await provider.resolveFileSelector(trimmed)).filter(
    (candidate) => candidate.kind === 'file',
  )
  if (matches.length === 0) {
    throw new CliValidationError(`no indexed file matches "${trimmed}"`)
  }
  if (matches.length === 1) {
    return { path: matches[0]!.canonicalPath, workspace: matches[0]!.workspace }
  }
  throw new CliValidationError(
    `ambiguous selector "${trimmed}": matches ${String(matches.length)} files across workspaces`,
  )
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
 * @param value - Canonical graph path
 * @returns The workspace and relative path, or null when `value` has no workspace prefix
 */
export function splitWorkspaceIdentity(
  value: string,
): { workspace: string; relativePath: string } | null {
  if (isDriveLetterPath(value)) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  return { workspace: value.slice(0, index), relativePath: value.slice(index + 1) }
}

/**
 * Projects a canonical graph resource path onto its config-relative display path.
 *
 * Pure synchronous projection with no graph store access:
 * - `workspace:path` resources parse the identity, look up `workspace.codeRoot`,
 *   and return `relative(projectRoot, join(codeRoot, path))` normalized to `/`.
 * - `root:path` resources return the in-repository relative path.
 * - The canonical path is returned when the identity does not parse.
 *
 * @param config - Resolved project configuration used for workspace code roots.
 * @param canonicalPath - Canonical file or document path (e.g. `core:src/x.ts`).
 * @returns Project-relative display path, or the canonical input on fallback.
 */
export function toGraphDisplayPath(config: SpecdConfig, canonicalPath: string): string {
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
 * Normalizes a path to forward slashes and strips a leading `./`.
 * @param value - A path to normalize.
 * @returns The normalized display path.
 */
function toDisplaySeparators(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}
