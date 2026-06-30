import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeGraphFingerprint,
  detectFingerprintMismatch,
} from '../../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import { CODE_GRAPH_VERSION } from '../../../src/index.js'
import {
  buildExpectedFingerprintMap,
  expectStoredFingerprintMap,
} from '../../helpers/expected-fingerprint-map.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * specs/code-graph/staleness-detection/verify.md
 * specs/code-graph/indexer/spec.md
 */
describe('code-graph:staleness-detection verification', () => {
  const projectRoot = '/project'
  const workspace = {
    name: 'core',
    prefix: 'core',
    codeRoot: '/project/packages/core',
    ownership: 'owned' as const,
    isExternal: false,
    specRepo: {} as never,
  }
  const graphConfig = {
    includePaths: [] as string[],
    excludePaths: ['exclude-me'],
    workspaces: new Map(),
  }

  it('Scenario: derivation fingerprint uses installed code-graph version', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(CODE_GRAPH_VERSION).toBe(packageJson.version)

    const withInstalled = computeGraphFingerprint({
      codeGraphVersion: CODE_GRAPH_VERSION,
      projectRoot,
      workspaces: [workspace],
      graphConfig,
    })
    const withOtherVersion = computeGraphFingerprint({
      codeGraphVersion: '0.0.0',
      projectRoot,
      workspaces: [workspace],
      graphConfig,
    })
    expect(withInstalled).not.toBe(withOtherVersion)
  })

  it('Scenario: version mismatch is a derivation mismatch', () => {
    const stored = buildExpectedFingerprintMap('1.0.0', projectRoot, [workspace], graphConfig)
    expect(
      detectFingerprintMismatch(stored, CODE_GRAPH_VERSION, projectRoot, [workspace], graphConfig),
    ).toBe(true)
  })

  it('Scenario: matching stored map is not a derivation mismatch', () => {
    const stored = buildExpectedFingerprintMap(
      CODE_GRAPH_VERSION,
      projectRoot,
      [workspace],
      graphConfig,
    )
    expectStoredFingerprintMap(
      JSON.stringify(Object.fromEntries(stored)),
      buildExpectedFingerprintMap(CODE_GRAPH_VERSION, projectRoot, [workspace], graphConfig),
    )
    expect(
      detectFingerprintMismatch(stored, CODE_GRAPH_VERSION, projectRoot, [workspace], graphConfig),
    ).toBe(false)
  })
})
