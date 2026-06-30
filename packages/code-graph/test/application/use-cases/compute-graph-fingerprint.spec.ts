import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeGraphFingerprint,
  detectFingerprintMismatch,
  parseFingerprintMap,
  serializeFingerprintMap,
  computeWorkspaceFingerprint,
  computeRootFingerprint,
} from '../../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import { CODE_GRAPH_VERSION } from '../../../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('Fingerprint logic', () => {
  const codeGraphVersion = '1.0.0'
  const projectRoot = '/project'

  const mockWorkspace = {
    name: 'core',
    prefix: 'core',
    codeRoot: '/project/packages/core',
    ownership: 'owned' as const,
    isExternal: false,
    specRepo: {} as any,
  }

  const mockGraphConfig = {
    projectRoot: '/project',
    workspaces: new Map(),
    excludePaths: ['exclude-me'],
    includePaths: [],
    concurrency: 4,
  }

  it('computes consistent fingerprints', () => {
    const fp1 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )
    const fp2 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )
    expect(fp1).toBe(fp2)
    expect(fp1).toHaveLength(64) // SHA-256 hex
  })

  it('detects changes in package version or configuration', () => {
    const fpOriginal = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )

    const fpDifferentVersion = computeWorkspaceFingerprint(
      '2.0.0',
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )
    expect(fpOriginal).not.toBe(fpDifferentVersion)

    const fpDifferentConfig = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      { ...mockGraphConfig, excludePaths: ['something-else'] },
    )
    expect(fpOriginal).not.toBe(fpDifferentConfig)
  })

  it('serializes and parses fingerprint maps', () => {
    const map = new Map<string, string>([
      ['core', 'hash123'],
      ['root', 'hash456'],
    ])
    const serialized = serializeFingerprintMap(map)
    expect(serialized).toContain('"core":"hash123"')
    expect(serialized).toContain('"root":"hash456"')

    const parsed = parseFingerprintMap(serialized)
    expect(parsed.get('core')).toBe('hash123')
    expect(parsed.get('root')).toBe('hash456')
  })

  it('detects fingerprint mismatch', () => {
    const ws1 = { ...mockWorkspace, name: 'core', prefix: 'core' }
    const ws2 = { ...mockWorkspace, name: 'cli', prefix: 'cli' }
    const workspaces = [ws1, ws2]

    const fp1 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      ws1,
      workspaces,
      mockGraphConfig,
    )
    const fp2 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      ws2,
      workspaces,
      mockGraphConfig,
    )
    const fpRoot = computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      workspaces,
      mockGraphConfig,
    )

    const storedMap = new Map<string, string>([
      ['core', fp1],
      ['cli', fp2],
      ['root', fpRoot],
    ])

    // Match
    expect(
      detectFingerprintMismatch(
        storedMap,
        codeGraphVersion,
        projectRoot,
        workspaces,
        mockGraphConfig,
      ),
    ).toBe(false)

    // Version mismatch
    expect(
      detectFingerprintMismatch(storedMap, '2.0.0', projectRoot, workspaces, mockGraphConfig),
    ).toBe(true)

    // Workspace list mismatch (workspace removed)
    expect(
      detectFingerprintMismatch(storedMap, codeGraphVersion, projectRoot, [ws1], mockGraphConfig),
    ).toBe(true)
  })

  it('CODE_GRAPH_VERSION matches package.json and affects workspace fingerprints', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(CODE_GRAPH_VERSION).toBe(packageJson.version)

    const withInstalled = computeWorkspaceFingerprint(
      CODE_GRAPH_VERSION,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )
    const withZero = computeWorkspaceFingerprint(
      '0.0.0',
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
    )
    expect(withInstalled).not.toBe(withZero)
  })
})
