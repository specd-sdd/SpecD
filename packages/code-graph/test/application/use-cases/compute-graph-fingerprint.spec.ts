import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeGraphFingerprint,
  detectFingerprintMismatch,
  discoverResolutionInputs,
  parseFingerprintMap,
  serializeFingerprintMap,
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  PATH_SEMANTICS_MARKER,
} from '../../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../../src/domain/value-objects/index-options.js'
import { type ResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { CODE_GRAPH_VERSION } from '../../../src/index.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'

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
    resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
    buildRelations: (): Relation[] => [],
  }
}

describe('Fingerprint logic', () => {
  const codeGraphVersion = '1.0.0'
  const projectRoot = '/project'
  const adapters: readonly LanguageAdapter[] = []
  const repoRoot: string | null = null

  const mockWorkspace = {
    name: 'core',
    prefix: 'core',
    codeRoot: '/project/packages/core',
    ownership: 'owned' as const,
    isExternal: false,
    specRepo: {} as never,
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
      adapters,
      repoRoot,
    )
    const fp2 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )
    expect(fp1).toBe(fp2)
    expect(fp1).toHaveLength(64)
  })

  it('detects changes in package version or configuration', () => {
    const fpOriginal = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )

    const fpDifferentVersion = computeWorkspaceFingerprint(
      '2.0.0',
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )
    expect(fpOriginal).not.toBe(fpDifferentVersion)

    const fpDifferentConfig = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      { ...mockGraphConfig, excludePaths: ['something-else'] },
      adapters,
      repoRoot,
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
      adapters,
      repoRoot,
    )
    const fp2 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      ws2,
      workspaces,
      mockGraphConfig,
      adapters,
      repoRoot,
    )
    const fpRoot = computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      workspaces,
      mockGraphConfig,
      adapters,
      repoRoot,
    )

    const storedMap = new Map<string, string>([
      ['core', fp1],
      ['cli', fp2],
      ['root', fpRoot],
    ])

    expect(
      detectFingerprintMismatch(
        storedMap,
        codeGraphVersion,
        projectRoot,
        workspaces,
        mockGraphConfig,
        adapters,
        repoRoot,
      ),
    ).toBe(false)

    expect(
      detectFingerprintMismatch(
        storedMap,
        '2.0.0',
        projectRoot,
        workspaces,
        mockGraphConfig,
        adapters,
        repoRoot,
      ),
    ).toBe(true)

    expect(
      detectFingerprintMismatch(
        storedMap,
        codeGraphVersion,
        projectRoot,
        [ws1],
        mockGraphConfig,
        adapters,
        repoRoot,
      ),
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
      adapters,
      repoRoot,
    )
    const withZero = computeWorkspaceFingerprint(
      '0.0.0',
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )
    expect(withInstalled).not.toBe(withZero)
  })

  it('given adapter declares package.json, when that file changes, then fingerprint changes', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const manifest = `${codeRoot}/package.json`
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const before = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [manifest]: 'before' }),
    )
    const after = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [manifest]: 'after' }),
    )
    expect(after).not.toBe(before)
  })

  it.each([
    ['package.json', new TypeScriptLanguageAdapter()],
    ['pyproject.toml', new PythonLanguageAdapter()],
    ['go.mod', new GoLanguageAdapter()],
    ['composer.json', new PhpLanguageAdapter()],
  ] as const)(
    'given the built-in adapter that reads %s, when that manifest changes, then the fingerprint changes',
    (basename, adapter) => {
      const root = '/repo'
      const codeRoot = '/repo/packages/core'
      const manifest = `${codeRoot}/${basename}`
      const workspace = { ...mockWorkspace, codeRoot }
      const graphConfig = { ...mockGraphConfig, projectRoot: root }
      const fingerprint = (text: string): string =>
        computeWorkspaceFingerprint(
          codeGraphVersion,
          root,
          workspace,
          [workspace],
          graphConfig,
          [adapter],
          root,
          filesSource({ [manifest]: text }),
        )

      expect(adapter.resolutionManifests()).toContain(basename)
      expect(fingerprint('before')).not.toBe(fingerprint('after'))
    },
  )

  it('given LF and CRLF of the same package.json, when hashed, then digests match without sha256 prefix', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const manifest = `${codeRoot}/package.json`
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const lfText = '{\n  "name": "demo"\n}\n'
    const lf = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [manifest]: lfText }),
    )
    const crlf = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [manifest]: '{\r\n  "name": "demo"\r\n}\r\n' }),
    )
    expect(crlf).toBe(lf)
    const inputs = discoverResolutionInputs(
      root,
      codeRoot,
      packageAdapter,
      root,
      filesSource({ [manifest]: '{\r\n  "name": "demo"\r\n}\r\n' }),
    )
    const expected = createHash('sha256').update(lfText, 'utf8').digest('hex')
    expect(inputs[0]?.contentHash).toBe(expected)
    expect(inputs[0]?.contentHash).not.toMatch(/^sha256:/)
    expect(inputs[0]?.contentHash).toHaveLength(64)
    expect(lf).not.toMatch(/^sha256:/)
    expect(lf).toHaveLength(64)
  })

  it('given undeclared build files, when any one changes, then fingerprint stays the same', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const declared = `${codeRoot}/package.json`
    const undeclared = ['tsconfig.json', 'jsconfig.json', 'setup.cfg', 'setup.py', 'go.work']
    const base: Record<string, string> = { [declared]: '{"name":"demo"}' }
    for (const name of undeclared) base[`${codeRoot}/${name}`] = 'before'
    const before = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource(base),
    )
    for (const name of undeclared) {
      const changed = { ...base, [`${codeRoot}/${name}`]: 'after' }
      const after = computeWorkspaceFingerprint(
        codeGraphVersion,
        root,
        workspace,
        [workspace],
        graphConfig,
        packageAdapter,
        root,
        filesSource(changed),
      )
      expect(after).toBe(before)
    }
  })

  it('given composer.json between codeRoot and repoRoot, when declared, then it is included', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/php'
    const manifest = `${root}/composer.json`
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const phpAdapter = [stubAdapter(['composer.json'])]
    const withParent = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      phpAdapter,
      root,
      filesSource({ [manifest]: '{"name":"acme/parent"}' }),
    )
    const changed = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      phpAdapter,
      root,
      filesSource({ [manifest]: '{"name":"acme/changed"}' }),
    )
    expect(changed).not.toBe(withParent)
  })

  it('given a declared manifest above repoRoot, when discovered, then it is omitted', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const outside = '/outside/package.json'
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const before = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [outside]: '{"name":"outside"}' }),
    )
    const after = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      filesSource({ [outside]: '{"name":"outside-changed"}' }),
    )
    expect(after).toBe(before)
  })

  it('given repoRoot null, when a manifest is above projectRoot, then it is omitted', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const outside = '/outside/package.json'
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const before = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      null,
      filesSource({ [outside]: '{"name":"outside"}' }),
    )
    const after = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      null,
      filesSource({ [outside]: '{"name":"outside-changed"}' }),
    )
    expect(after).toBe(before)
  })

  it('given a directory named like a manifest, when discovered, then it is omitted', () => {
    const root = '/repo'
    const codeRoot = '/repo/packages/core'
    const workspace = { ...mockWorkspace, codeRoot }
    const graphConfig = { ...mockGraphConfig, projectRoot: root }
    const packageAdapter = [stubAdapter(['package.json'])]
    const source = filesSource({ [`${codeRoot}/package.json/nested.txt`]: 'not a manifest' })
    const fp = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      packageAdapter,
      root,
      source,
    )
    expect(fp).toHaveLength(64)
    const empty = computeWorkspaceFingerprint(
      codeGraphVersion,
      root,
      workspace,
      [workspace],
      graphConfig,
      [],
      root,
      source,
    )
    expect(fp).toBe(empty)
  })

  it('given adapters and a repo root, when the graph fingerprint is computed, then the digest is 64 hex chars', () => {
    const fp = computeGraphFingerprint({
      codeGraphVersion,
      projectRoot,
      workspaces: [mockWorkspace],
      graphConfig: mockGraphConfig,
      adapters,
      repoRoot,
    })
    expect(fp).toHaveLength(64)
  })

  it('detects changes in maxFileBytes limit and largeFilePaths exemptions', () => {
    const baseFp = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )

    const limitChangedFp = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      { ...mockGraphConfig, maxFileBytes: 500_000 },
      adapters,
      repoRoot,
    )
    expect(limitChangedFp).not.toBe(baseFp)

    const exemptionsChangedFp = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      { ...mockGraphConfig, largeFilePaths: ['vendor/**'] },
      adapters,
      repoRoot,
    )
    expect(exemptionsChangedFp).not.toBe(baseFp)
  })

  it('produces equal fingerprints when effective size values are equal regardless of declaration level', () => {
    // Config 1: default 262144 at project level (or omitted)
    const configImplicitDefault = {
      ...mockGraphConfig,
    }
    // Config 2: explicit 262144 at project level
    const configExplicitProject = {
      ...mockGraphConfig,
      maxFileBytes: 262144,
    }
    // Config 3: repeated in workspace map
    const configRepeatedWorkspace = {
      ...mockGraphConfig,
      workspaces: new Map([
        [
          mockWorkspace.name,
          {
            maxFileBytes: 262144,
          },
        ],
      ]),
    }

    const fp1 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      configImplicitDefault,
      adapters,
      repoRoot,
    )
    const fp2 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      configExplicitProject,
      adapters,
      repoRoot,
    )
    const fp3 = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      mockWorkspace,
      [mockWorkspace],
      configRepeatedWorkspace,
      adapters,
      repoRoot,
    )

    expect(fp1).toBe(fp2)
    expect(fp2).toBe(fp3)
  })

  it('detects size limit and exemption changes in root fingerprint', () => {
    const baseRootFp = computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      [mockWorkspace],
      mockGraphConfig,
      adapters,
      repoRoot,
    )

    const limitChangedRootFp = computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      [mockWorkspace],
      { ...mockGraphConfig, maxFileBytes: 100_000 },
      adapters,
      repoRoot,
    )
    expect(limitChangedRootFp).not.toBe(baseRootFp)

    const exemptionChangedRootFp = computeRootFingerprint(
      codeGraphVersion,
      projectRoot,
      [mockWorkspace],
      { ...mockGraphConfig, largeFilePaths: ['root-large/**'] },
      adapters,
      repoRoot,
    )
    expect(exemptionChangedRootFp).not.toBe(baseRootFp)
  })
})

describe('Fingerprint path semantics', () => {
  const fpWorkspace = (codeRoot: string): ProjectWorkspace => ({
    name: 'app',
    prefix: null,
    codeRoot,
    isExternal: false,
    ownership: 'owned',
    specRepo: { specsPath: undefined } as unknown as ProjectWorkspace['specRepo'],
  })
  const compute = (
    graphConfig: ProjectGraphConfig,
    codeRoot = '/repo/app',
    version = '1.0.0',
  ): string => {
    const workspace = fpWorkspace(codeRoot)
    return computeWorkspaceFingerprint(version, '/repo', workspace, [workspace], graphConfig)
  }

  it('Given a changed workspace testPaths, then the fingerprint changes', () => {
    const base = compute({ workspaces: new Map([['app', { testPaths: ['app/a/**'] }]]) })
    const changed = compute({ workspaces: new Map([['app', { testPaths: ['app/b/**'] }]]) })
    expect(changed).not.toBe(base)
  })

  it('Given a changed workspace ignorePaths, then the fingerprint changes', () => {
    const base = compute({ workspaces: new Map([['app', { ignorePaths: ['app/a/**'] }]]) })
    const changed = compute({ workspaces: new Map([['app', { ignorePaths: ['app/b/**'] }]]) })
    expect(changed).not.toBe(base)
  })

  it('Given a changed workspace codeRoot, then the fingerprint changes', () => {
    expect(compute({}, '/repo/app')).not.toBe(compute({}, '/repo/other'))
  })

  it('Given the path-semantics marker, then it is part of the fingerprint payload', () => {
    expect(PATH_SEMANTICS_MARKER).toBe('project-relative-v1')
    const expectedWithout = createHash('sha256')
      .update(JSON.stringify({ v: '1.0.0', g: {}, w: [] }))
      .digest('hex')
    expect(compute({})).not.toBe(expectedWithout)
    const sourceText = readFileSync(
      join(packageRoot, 'src/application/use-cases/_shared/compute-graph-fingerprint.ts'),
      'utf8',
    )
    expect(
      sourceText.match(/pathSemantics: PATH_SEMANTICS_MARKER/g)?.length,
    ).toBeGreaterThanOrEqual(3)
  })

  it('Given a stored fingerprint computed without the marker, then a mismatch is detected', () => {
    const workspace = fpWorkspace('/repo/app')
    const graphConfig: ProjectGraphConfig = {}
    const current = computeWorkspaceFingerprint(
      '1.0.0',
      '/repo',
      workspace,
      [workspace],
      graphConfig,
    )
    const legacy = createHash('sha256')
      .update(JSON.stringify({ v: '1.0.0', w: [{ name: 'app', codeRoot: 'app' }] }))
      .digest('hex')
    const root = computeRootFingerprint('1.0.0', '/repo', [workspace], graphConfig)

    expect(
      detectFingerprintMismatch(
        new Map([
          ['app', current],
          ['root', root],
        ]),
        '1.0.0',
        '/repo',
        [workspace],
        graphConfig,
      ),
    ).toBe(false)
    expect(
      detectFingerprintMismatch(
        new Map([
          ['app', legacy],
          ['root', root],
        ]),
        '1.0.0',
        '/repo',
        [workspace],
        graphConfig,
      ),
    ).toBe(true)
  })
})
