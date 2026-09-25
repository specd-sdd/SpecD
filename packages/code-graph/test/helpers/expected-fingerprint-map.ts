import { expect } from 'vitest'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../src/domain/value-objects/index-options.js'
import { type LanguageAdapter } from '../../src/domain/value-objects/language-adapter.js'
import {
  computeRootFingerprint,
  computeWorkspaceFingerprint,
  parseFingerprintMap,
} from '../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import {
  emptyResolutionManifestSource,
  type ResolutionManifestSource,
} from '../../src/application/ports/resolution-manifest-source.js'

/**
 * Builds the derivation fingerprint map expected per
 * `specs/code-graph/indexer/spec.md` (effective config + code-graph version +
 * adapter-declared resolution manifests).
 */
export function buildExpectedFingerprintMap(
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
  adapters: readonly LanguageAdapter[] = [],
  repoRoot: string | null = null,
  source: ResolutionManifestSource = emptyResolutionManifestSource,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const workspace of workspaces) {
    map.set(
      workspace.name,
      computeWorkspaceFingerprint(
        codeGraphVersion,
        projectRoot,
        workspace,
        workspaces,
        graphConfig,
        adapters,
        repoRoot,
        source,
      ),
    )
  }
  map.set(
    'root',
    computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      workspaces,
      graphConfig,
      adapters,
      repoRoot,
      source,
    ),
  )
  return map
}

/** Asserts a stored fingerprint JSON map matches the spec-derived expectation. */
export function expectStoredFingerprintMap(
  stored: string | null,
  expected: Map<string, string>,
): void {
  expect(parseFingerprintMap(stored)).toEqual(expected)
}
