import * as path from 'node:path'
import { PathTraversalError } from '../../domain/errors/path-traversal-error.js'

/**
 * Resolves a relative path against a storage root while enforcing confinement.
 *
 * @param root - Absolute storage root that the resolved path must remain within
 * @param relative - Candidate relative path to resolve
 * @param allowed - Optional set of permitted normalized relative paths
 * @returns Absolute resolved path inside `root`
 * @throws {PathTraversalError} When the candidate escapes `root`
 * @throws {Error} When the candidate is not in the allowed set
 */
export function resolveConfinedPath(
  root: string,
  relative: string,
  allowed?: ReadonlySet<string>,
): string {
  const normalizedRoot = path.resolve(root)
  const normalizedRelative = normalizeRelativePath(relative)

  if (
    normalizedRelative === '..' ||
    normalizedRelative.startsWith('../') ||
    path.posix.isAbsolute(normalizedRelative)
  ) {
    throw new PathTraversalError(relative)
  }

  if (allowed !== undefined && !allowed.has(normalizedRelative)) {
    throw new Error(`Unsupported artifact filename: '${relative}'`)
  }

  const resolved = path.resolve(normalizedRoot, ...normalizedRelative.split('/'))
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new PathTraversalError(relative)
  }

  return resolved
}

/**
 * Normalizes a relative artifact path into forward-slash form.
 *
 * @param relative - Candidate relative path
 * @returns Normalized forward-slash relative path
 */
export function normalizeRelativePath(relative: string): string {
  return path.posix.normalize(relative.replaceAll('\\', '/'))
}
