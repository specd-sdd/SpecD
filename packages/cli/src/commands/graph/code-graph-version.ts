import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let _cached: string | undefined

/**
 * Reads and caches the @specd/code-graph package version.
 * @returns The semver version string.
 */
export function getCodeGraphVersion(): string {
  if (_cached !== undefined) return _cached
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const pkgPath = join(
      thisDir,
      '..',
      '..',
      '..',
      'node_modules',
      '@specd',
      'code-graph',
      'package.json',
    )
    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: string }
    _cached = parsed.version ?? '0.0.0'
  } catch {
    _cached = '0.0.0'
  }
  return _cached
}

/** Cached code-graph package version. */
export const codeGraphVersion = getCodeGraphVersion()
