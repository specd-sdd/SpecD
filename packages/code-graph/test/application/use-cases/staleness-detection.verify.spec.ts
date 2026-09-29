import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { isGraphStale } from '../../../src/domain/services/is-graph-stale.js'
import { type ResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function filesSource(entries: Record<string, string>): ResolutionManifestSource {
  const files = new Map(Object.entries(entries).map(([path, text]) => [resolve(path), text]))
  const dirs = new Set<string>()
  for (const file of files.keys()) {
    let dir = dirname(file)
    while (!dirs.has(dir)) {
      dirs.add(dir)
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return {
    directoryExists: (path) => dirs.has(resolve(path)),
    isRegularFile: (path) => files.has(resolve(path)),
    readText: (path) => files.get(resolve(path)),
  }
}

function stubAdapter(manifests: readonly string[]): LanguageAdapter {
  return {
    languages: () => [],
    extensions: () => ({}),
    resolutionManifests: () => manifests,
    analyzeFile: (): FileAnalysisDraft => {
      throw new Error('unused')
    },
    resolveImports: () => ({ importMap: new Map(), fileImports: [] }),
    buildRelations: (): Relation[] => [],
  }
}

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
  const adapters: readonly LanguageAdapter[] = []
  const repoRoot: string | null = null

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
      adapters,
      repoRoot,
    })
    const withOtherVersion = computeGraphFingerprint({
      codeGraphVersion: '0.0.0',
      projectRoot,
      workspaces: [workspace],
      graphConfig,
      adapters,
      repoRoot,
    })
    expect(withInstalled).not.toBe(withOtherVersion)
  })

  it('Scenario: version mismatch is a derivation mismatch', () => {
    const stored = buildExpectedFingerprintMap(
      '1.0.0',
      projectRoot,
      [workspace],
      graphConfig,
      adapters,
      repoRoot,
    )
    expect(
      detectFingerprintMismatch(
        stored,
        CODE_GRAPH_VERSION,
        projectRoot,
        [workspace],
        graphConfig,
        adapters,
        repoRoot,
      ),
    ).toBe(true)
  })

  it('Scenario: matching stored map is not a derivation mismatch', () => {
    const stored = buildExpectedFingerprintMap(
      CODE_GRAPH_VERSION,
      projectRoot,
      [workspace],
      graphConfig,
      adapters,
      repoRoot,
    )
    expectStoredFingerprintMap(
      JSON.stringify(Object.fromEntries(stored)),
      buildExpectedFingerprintMap(
        CODE_GRAPH_VERSION,
        projectRoot,
        [workspace],
        graphConfig,
        adapters,
        repoRoot,
      ),
    )
    expect(
      detectFingerprintMismatch(
        stored,
        CODE_GRAPH_VERSION,
        projectRoot,
        [workspace],
        graphConfig,
        adapters,
        repoRoot,
      ),
    ).toBe(false)
  })

  it('given a manifest differs only by CRLF, when derivation freshness is checked, then it is not mismatched', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const manifest = `${codeRoot}/package.json`
    const ws = { ...workspace, codeRoot }
    const config = { ...graphConfig, projectRoot: root }
    const packageAdapters = [stubAdapter(['package.json'])]
    const stored = buildExpectedFingerprintMap(
      CODE_GRAPH_VERSION,
      root,
      [ws],
      config,
      packageAdapters,
      root,
      filesSource({ [manifest]: '{\n  "name": "demo"\n}\n' }),
    )
    expect(
      detectFingerprintMismatch(
        stored,
        CODE_GRAPH_VERSION,
        root,
        [ws],
        config,
        packageAdapters,
        root,
        filesSource({ [manifest]: '{\r\n  "name": "demo"\r\n}\r\n' }),
      ),
    ).toBe(false)
  })

  it('given an edited manifest and an unchanged VCS ref, when derivation freshness is checked, then VCS stays fresh and derivation mismatches', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const manifest = `${codeRoot}/package.json`
    const ws = { ...workspace, codeRoot }
    const config = { ...graphConfig, projectRoot: root }
    const packageAdapters = [stubAdapter(['package.json'])]
    const stored = buildExpectedFingerprintMap(
      CODE_GRAPH_VERSION,
      root,
      [ws],
      config,
      packageAdapters,
      root,
      filesSource({ [manifest]: '{"name":"before"}' }),
    )
    expect(isGraphStale('abc1234', 'abc1234')).toBe(false)
    expect(
      detectFingerprintMismatch(
        stored,
        CODE_GRAPH_VERSION,
        root,
        [ws],
        config,
        packageAdapters,
        root,
        filesSource({ [manifest]: '{"name":"after"}' }),
      ),
    ).toBe(true)
  })
})
