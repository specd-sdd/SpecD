import { CODE_GRAPH_VERSION } from '@specd/code-graph'

/**
 * Installed version of `@specd/code-graph` for graph fingerprint and indexing.
 *
 * @returns The semver version string
 */
export function getCodeGraphVersion(): string {
  return CODE_GRAPH_VERSION
}

/** Cached `@specd/code-graph` package version. */
export const codeGraphVersion: string = CODE_GRAPH_VERSION
