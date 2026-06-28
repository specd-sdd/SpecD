import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Installed version of `@specd/code-graph` for graph fingerprint and indexing.
 *
 * @returns The semver version string
 */
export function getCodeGraphVersion(): string {
  try {
    const pkg = require('@specd/code-graph/package.json') as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Cached `@specd/code-graph` package version. */
export const codeGraphVersion: string = getCodeGraphVersion()
