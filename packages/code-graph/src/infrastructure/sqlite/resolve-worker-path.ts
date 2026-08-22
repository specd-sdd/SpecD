import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InvalidGraphStoreConfigurationError } from '../../domain/errors/invalid-graph-store-configuration-error.js'

/**
 * Resolves the filesystem path to the SQLite worker entrypoint script.
 *
 * Checks for compiled (`sqlite-worker.js`) and TypeScript source (`sqlite-worker.ts`)
 * locations relative to this module and package root, preferring compiled JavaScript
 * for native Worker execution.
 *
 * @param overridePath - Optional explicit worker script path (e.g., from options).
 * Non-empty values are trimmed before use and must be absolute filesystem paths;
 * relative values are rejected with InvalidGraphStoreConfigurationError.
 * @returns Absolute filesystem path to the worker entrypoint script.
 * @throws {InvalidGraphStoreConfigurationError} If `overridePath` is non-empty but not an absolute path.
 */
export function resolveSqliteWorkerPath(overridePath?: string): string {
  const trimmedOverride = overridePath?.trim()
  if (trimmedOverride) {
    if (!isAbsolute(trimmedOverride)) {
      throw new InvalidGraphStoreConfigurationError(
        `Invalid workerPath: expected an absolute filesystem path, received ${trimmedOverride}`,
      )
    }
    return trimmedOverride
  }

  const relativeCandidates = [
    // When running from src/infrastructure/sqlite in dev/vitest
    '../../../dist/infrastructure/sqlite/sqlite-worker.js',
    // When running from dist/public.js or dist/index.js in production
    './infrastructure/sqlite/sqlite-worker.js',
    './sqlite-worker.js',
    '../infrastructure/sqlite/sqlite-worker.js',
    // Fallback to TS source if dist is absent
    './sqlite-worker.ts',
    '../infrastructure/sqlite/sqlite-worker.ts',
  ]

  for (const relativePath of relativeCandidates) {
    try {
      const candidatePath = fileURLToPath(new URL(relativePath, import.meta.url))
      if (existsSync(candidatePath)) {
        return candidatePath
      }
    } catch {
      // Ignore URL resolution errors for invalid relative paths
    }
  }

  // Fallback to direct sibling JS path
  return fileURLToPath(new URL('./sqlite-worker.js', import.meta.url))
}
