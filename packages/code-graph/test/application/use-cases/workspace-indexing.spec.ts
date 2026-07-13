import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { SpecRepository, Spec, SpecPath } from '@specd/core'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { computeContentHash } from '../../../src/application/use-cases/compute-content-hash.js'
import { CODE_GRAPH_VERSION } from '../../../src/index.js'
import {
  buildExpectedFingerprintMap,
  expectStoredFingerprintMap,
} from '../../helpers/expected-fingerprint-map.js'

/**
 * Creates a mock spec repository.
 * @param specs - List of specs to return.
 * @param metadataMap - Optional map of specId to metadata.
 * @returns A mock SpecRepository instance.
 */
function makeMockRepo(
  specs: Spec[] = [],
  metadataMap: Map<string, Record<string, unknown>> = new Map(),
): SpecRepository {
  return {
    get specsPath() {
      return undefined
    },
    list: async () => specs,
    count: async () => specs.length,
    specHash: async () => 'sha256:test',
    metadata: async (s: Spec) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (metadataMap.get(s.name.toString()) as any) ?? { title: s.name.toString() },
    readPersistedDependsOn: async () => [],
    readPersistedImplementation: async () => [],
    artifact: async () => ({ content: '# Spec Content' }),
  } as unknown as SpecRepository
}

/**
 * Creates a temporary workspace directory with TypeScript source files.
 * @param baseDir - Parent directory for the workspace.
 * @param name - Workspace name.
 * @param files - Map of relative file paths to content.
 * @returns Absolute path to the workspace root.
 */
function createWorkspaceDir(
  baseDir: string,
  name: string,
  files: Record<string, string | Uint8Array>,
): string {
  const wsDir = join(baseDir, name)
  mkdirSync(wsDir, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(wsDir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return wsDir
}

const registry = new AdapterRegistry()
registry.register(new TypeScriptLanguageAdapter())

describe('Workspace indexing', () => {
  let tempDir: string
  let store: GraphStore

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-workspace-indexing-'))
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('indexes multiple workspaces with package identities', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'package.json': JSON.stringify({ name: 'ws1' }),
      'src/index.ts':
        'import type { Foo } from "ws2/src/utils"; export const bar: Foo | null = null;',
    })
    const ws2Dir = createWorkspaceDir(tempDir, 'ws2', {
      'package.json': JSON.stringify({ name: 'ws2' }),
      'src/utils.ts': 'export interface Foo { value: number }',
    })

    const spec1 = new Spec('ws1', SpecPath.parse('spec1'), [])
    const spec2 = new Spec('ws2', SpecPath.parse('spec2'), [])

    const uc = new IndexCodeGraph(store, registry)
    const result = await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo([spec1]),
          ownership: 'owned',
          isExternal: false,
        },
        {
          name: 'ws2',
          prefix: null,
          codeRoot: ws2Dir,
          specRepo: makeMockRepo([spec2]),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const foo = (await store.findSymbols({ name: 'Foo' })).find(
      (symbol) => symbol.filePath === 'ws2:src/utils.ts',
    )
    const bar = (await store.findSymbols({ name: 'bar' })).find(
      (symbol) => symbol.filePath === 'ws1:src/index.ts',
    )

    expect(foo).toBeDefined()
    expect(bar).toBeDefined()
    expect(result.errors).toEqual([])
  })

  it('assigns specs to the correct workspace and specId', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'src/a.ts': 'export const a = 1;',
    })

    const spec1 = new Spec('ws1', SpecPath.parse('auth/login'), [])

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo([spec1]),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const node = await store.getSpec('ws1:auth/login')
    expect(node).toBeDefined()
    expect(node!.workspace).toBe('ws1')
  })

  it('indexes textual documents without language adapters as document nodes', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'docs/guide.md': '# Change Guide\n\nThis document explains the change flow.',
    })

    const uc = new IndexCodeGraph(store, registry)
    const result = await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const document = await store.getDocument('ws1:docs/guide.md')
    expect(document).toBeDefined()
    expect(document?.configRelativePath).toBe('ws1/docs/guide.md')
    expect(result.documentsIndexed).toBe(1)
  })

  it('indexes windows-1252 documents without language adapters as document nodes', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'docs/legacy.txt': Buffer.from([
        0x43, 0x61, 0x66, 0xe9, 0x20, 0x43, 0x68, 0x61, 0x6e, 0x67, 0x65,
      ]),
    })

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const document = await store.getDocument('ws1:docs/legacy.txt')
    expect(document).toBeDefined()
    expect(document?.content).toBe('Café Change')
  })

  it('indexes utf-16 documents without language adapters as document nodes', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'docs/unicode.txt': Buffer.from('Change flow', 'utf16le'),
    })

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const document = await store.getDocument('ws1:docs/unicode.txt')
    expect(document).toBeDefined()
    expect(document?.content).toBe('Change flow')
  })

  it('two workspaces with same spec name produce unique specIds', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', { 'f.ts': '' })
    const ws2Dir = createWorkspaceDir(tempDir, 'ws2', { 'f.ts': '' })

    const spec1 = new Spec('ws1', SpecPath.parse('common'), [])
    const spec2 = new Spec('ws2', SpecPath.parse('common'), [])

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo([spec1]),
          ownership: 'owned',
          isExternal: false,
        },
        {
          name: 'ws2',
          prefix: null,
          codeRoot: ws2Dir,
          specRepo: makeMockRepo([spec2]),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    expect(await store.getSpec('ws1:common')).toBeDefined()
    expect(await store.getSpec('ws2:common')).toBeDefined()
  })

  it('does not duplicate workspace-owned files under root identities', async () => {
    const wsDir = createWorkspaceDir(tempDir, 'ws1', {
      'docs/guide.md': '# Guide',
    })

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: wsDir,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: ['ws1/docs/**'],
        workspaces: new Map(),
      },
    })

    expect(await store.getDocument('ws1:docs/guide.md')).toBeDefined()
    expect(await store.getDocument('root:ws1/docs/guide.md')).toBeUndefined()
  })

  it('excludes filesystem-backed spec roots from document discovery', async () => {
    const wsDir = createWorkspaceDir(tempDir, 'ws1', {
      'src/index.ts': 'export const value = 1;',
    })
    const specsDir = createWorkspaceDir(tempDir, 'specs-ws1', {
      'changes/spec.md': '# Change',
    })

    const repo = {
      get specsPath() {
        return specsDir
      },
      list: async () => [],
      count: async () => 0,
      specHash: async () => 'sha256:test',
      metadata: async () => null,
      readPersistedDependsOn: async () => [],
      readPersistedImplementation: async () => [],
      artifact: async () => null,
    } as unknown as SpecRepository

    const uc = new IndexCodeGraph(store, registry)
    const result = await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: wsDir,
          specRepo: repo,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: ['specs-ws1/**'],
        workspaces: new Map(),
      },
    })

    expect(await store.getDocument('root:specs-ws1/changes/spec.md')).toBeUndefined()
    expect(result.documentsIndexed).toBe(0)
  })

  it('prefers optimizedDescription when indexing specs', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'src/a.ts': 'export const a = 1;',
    })

    const spec1 = new Spec('ws1', SpecPath.parse('test'), [])
    const metadata = new Map([
      ['test', { title: 'Test', description: 'Original', optimizedDescription: 'AI summary' }],
    ])

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: makeMockRepo([spec1], metadata),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    const node = await store.getSpec('ws1:test')
    expect(node?.description).toBe('AI summary')
  })

  it('computes contentHash from content artifacts excluding sidecars with spec.md first', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {})

    // Spec with multiple artifacts including sidecars
    const spec1 = new Spec('ws1', SpecPath.parse('test'), [
      'verify.md',
      'spec.md',
      'spec-lock.json',
      'metadata.json',
    ])

    const artifactMap = new Map<string, Record<string, string>>([
      [
        'test',
        {
          'spec.md': '# Spec\n',
          'verify.md': '# Verify\n',
          'spec-lock.json': '{"locked": true}',
          'metadata.json': '{"title": "Test"}',
        },
      ],
    ])

    const repo = {
      list: async () => [spec1],
      count: async () => 1,
      specHash: async () => 'sha256:sidecar-hash',
      metadata: async () => ({ title: 'Test' }),
      readPersistedDependsOn: async () => [],
      readPersistedImplementation: async () => [],
      artifact: async (s: Spec, f: string) => ({
        content: artifactMap.get(s.name.toString())?.[f],
      }),
    } as unknown as SpecRepository

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws1',
          prefix: null,
          codeRoot: ws1Dir,
          specRepo: repo,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: { includePaths: [], workspaces: new Map() },
    })

    const node = await store.getSpec('ws1:test')
    expect(node).toBeDefined()

    // contentHash should be from spec.md + verify.md (ordered)
    // # Spec\n# Verify\n -> concatenated
    const expectedContent = '# Spec\n\n# Verify\n\n'
    // Wait, the implementation adds \n after each artifact
    // Let's check the actual implementation: content += artifact.content + '\n'

    expect(node!.content).toBe('# Spec\n\n# Verify\n\n')
    expect(node!.contentHash).not.toBe('sha256:sidecar-hash')
    expect(node!.contentHash).toBe(computeContentHash('# Spec\n\n# Verify\n\n'))
  })

  // specs/code-graph/indexer/spec.md — Discovery fingerprint uses effective config
  // specs/code-graph/staleness-detection/spec.md — Graph derivation freshness
  it('persists derivation fingerprint from installed code-graph version and effective config', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'src/a.ts': 'export const a = 1',
    })

    const graphConfig = { includePaths: [], workspaces: new Map() }
    const workspace = {
      name: 'ws1',
      prefix: null,
      codeRoot: ws1Dir,
      specRepo: makeMockRepo(),
      ownership: 'owned' as const,
      isExternal: false,
    }

    const uc = new IndexCodeGraph(store, registry)
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      codeGraphVersion: CODE_GRAPH_VERSION,
      workspaces: [workspace],
      graphConfig,
    })

    const stats = await store.getStatistics()
    expectStoredFingerprintMap(
      stats.graphFingerprint,
      buildExpectedFingerprintMap(CODE_GRAPH_VERSION, tempDir, [workspace], graphConfig),
    )
  })

  // specs/code-graph/indexer/spec.md — effective @specd/code-graph package version when omitted
  it('defaults omitted codeGraphVersion to the installed package version', async () => {
    const ws1Dir = createWorkspaceDir(tempDir, 'ws1', {
      'src/a.ts': 'export const a = 1',
    })

    const graphConfig = { includePaths: [], workspaces: new Map() }
    const workspace = {
      name: 'ws1',
      prefix: null,
      codeRoot: ws1Dir,
      specRepo: makeMockRepo(),
      ownership: 'owned' as const,
      isExternal: false,
    }

    const uc = new IndexCodeGraph(store, registry)

    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace],
      graphConfig,
    })
    const omittedStats = await store.getStatistics()

    await store.clear()
    await uc.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      codeGraphVersion: CODE_GRAPH_VERSION,
      workspaces: [workspace],
      graphConfig,
    })
    const explicitStats = await store.getStatistics()

    expect(omittedStats.graphFingerprint).toBe(explicitStats.graphFingerprint)
    expectStoredFingerprintMap(
      omittedStats.graphFingerprint,
      buildExpectedFingerprintMap(CODE_GRAPH_VERSION, tempDir, [workspace], graphConfig),
    )
  })
})
