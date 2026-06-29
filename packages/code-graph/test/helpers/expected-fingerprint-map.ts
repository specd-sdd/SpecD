import { expect } from 'vitest'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../src/domain/value-objects/index-options.js'
import {
  computeRootFingerprint,
  computeWorkspaceFingerprint,
  parseFingerprintMap,
} from '../../src/application/use-cases/_shared/compute-graph-fingerprint.js'

/**
 * Builds the derivation fingerprint map expected per
 * `specs/code-graph/indexer/spec.md` (effective config + code-graph version).
 */
export function buildExpectedFingerprintMap(
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
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
      ),
    )
  }
  map.set('root', computeRootFingerprint(codeGraphVersion, projectRoot, workspaces, graphConfig))
  return map
}

/** Asserts a stored fingerprint JSON map matches the spec-derived expectation. */
export function expectStoredFingerprintMap(
  stored: string | null,
  expected: Map<string, string>,
): void {
  const parsed = parseFingerprintMap(stored)
  expect(Object.fromEntries(parsed)).toEqual(Object.fromEntries(expected))
}
