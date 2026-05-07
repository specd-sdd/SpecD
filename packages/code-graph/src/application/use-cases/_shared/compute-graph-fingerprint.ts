import { createHash } from 'node:crypto'
import { type WorkspaceIndexTarget } from '../../../domain/value-objects/index-options.js'

/** Input for computing a graph fingerprint. */
export interface GraphFingerprintInput {
  readonly codeGraphVersion: string
  readonly workspaces: readonly WorkspaceIndexTarget[]
}

/** Normalized workspace representation for fingerprint computation. */
interface NormalizedWorkspaceFingerprint {
  readonly name: string
  readonly codeRoot: string
  readonly repoRoot: string | null
  readonly excludePaths: readonly string[]
  readonly respectGitignore: boolean
}

/**
 * Normalizes workspace targets for deterministic fingerprinting.
 * @param workspaces - The workspace targets to normalize.
 * @returns Normalized workspace representations.
 */
function normalizeWorkspaceFingerprintInput(
  workspaces: readonly WorkspaceIndexTarget[],
): readonly NormalizedWorkspaceFingerprint[] {
  return workspaces.map((ws) => ({
    name: ws.name,
    codeRoot: ws.codeRoot,
    repoRoot: ws.repoRoot ?? null,
    excludePaths: ws.excludePaths ? [...ws.excludePaths] : [],
    respectGitignore: ws.respectGitignore ?? true,
  }))
}

/**
 * Computes a deterministic fingerprint for the entire graph configuration.
 * @param input - The fingerprint input.
 * @returns A SHA-256 hex digest.
 */
export function computeGraphFingerprint(input: GraphFingerprintInput): string {
  const normalized = normalizeWorkspaceFingerprintInput(input.workspaces)
  const payload = JSON.stringify({
    v: input.codeGraphVersion,
    w: normalized,
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Computes a deterministic fingerprint for a single workspace.
 * @param codeGraphVersion - The code-graph package version.
 * @param workspace - The workspace target.
 * @returns A SHA-256 hex digest.
 */
export function computeWorkspaceFingerprint(
  codeGraphVersion: string,
  workspace: WorkspaceIndexTarget,
): string {
  const normalized: NormalizedWorkspaceFingerprint = {
    name: workspace.name,
    codeRoot: workspace.codeRoot,
    repoRoot: workspace.repoRoot ?? null,
    excludePaths: workspace.excludePaths ? [...workspace.excludePaths] : [],
    respectGitignore: workspace.respectGitignore ?? true,
  }
  const payload = JSON.stringify({ v: codeGraphVersion, w: [normalized] })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Parses a serialized fingerprint map from storage.
 * @param stored - The JSON string or null.
 * @returns A map of workspace name to fingerprint.
 */
export function parseFingerprintMap(stored: string | null): Map<string, string> {
  if (stored === null) return new Map()
  try {
    const parsed = JSON.parse(stored) as Record<string, string>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

/**
 * Serializes a fingerprint map to JSON for storage.
 * @param map - The fingerprint map.
 * @returns A JSON string.
 */
export function serializeFingerprintMap(map: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(map))
}

/**
 * Detects if any stored workspace fingerprint differs from the current one.
 * @param storedMap - The stored fingerprint map.
 * @param codeGraphVersion - The current code-graph version.
 * @param workspaces - The current workspace targets.
 * @returns True if any mismatch is detected.
 */
export function detectFingerprintMismatch(
  storedMap: Map<string, string>,
  codeGraphVersion: string,
  workspaces: readonly WorkspaceIndexTarget[],
): boolean {
  for (const ws of workspaces) {
    const currentFp = computeWorkspaceFingerprint(codeGraphVersion, ws)
    const storedFp = storedMap.get(ws.name)
    if (storedFp !== undefined && storedFp !== currentFp) {
      return true
    }
  }
  return false
}
