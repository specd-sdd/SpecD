import * as path from 'node:path'
import { type SpecdConfig } from '@specd/core'

/** Result of resolving a filesystem path to a spec identifier. */
export interface ResolvedSpecPath {
  /** The workspace name (e.g. `'default'`, `'core'`). */
  readonly workspace: string
  /** The capability path with prefix applied (e.g. `'core/change'`). */
  readonly specPath: string
  /** The full qualified spec ID: `workspace:specPath` (e.g. `'core:core/change'`). */
  readonly specId: string
}

/**
 * Resolves an absolute directory path to a spec identifier using workspace config.
 *
 * Pure function — no I/O, just path math against the provided config.
 *
 * @param absoluteDir - Absolute path to a spec directory on disk
 * @param config - The fully-resolved project configuration
 * @returns The resolved spec path, or `null` if no workspace matches
 */
export function resolveSpecPath(absoluteDir: string, config: SpecdConfig): ResolvedSpecPath | null {
  let bestMatch: { ws: (typeof config.workspaces)[number]; specsPath: string } | null = null

  for (const ws of config.workspaces) {
    const specsPath = ws.specsPath
    if (absoluteDir === specsPath || absoluteDir.startsWith(specsPath + path.sep)) {
      if (bestMatch === null || specsPath.length > bestMatch.specsPath.length) {
        bestMatch = { ws, specsPath }
      }
    }
  }

  if (bestMatch === null) {
    return null
  }

  const relative = path.relative(bestMatch.specsPath, absoluteDir)
  const capPath =
    bestMatch.ws.prefix !== undefined
      ? relative === ''
        ? bestMatch.ws.prefix
        : bestMatch.ws.prefix + '/' + relative
      : relative

  return {
    workspace: bestMatch.ws.name,
    specPath: capPath,
    specId: bestMatch.ws.name + ':' + capPath,
  }
}
