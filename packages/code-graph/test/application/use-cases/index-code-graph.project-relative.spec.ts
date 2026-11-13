import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import {
  type IndexOptions,
  type ProjectGraphConfig,
} from '../../../src/domain/value-objects/index-options.js'
import { type IndexResult } from '../../../src/domain/value-objects/index-result.js'
import { buildGraphInputVisibilitySnapshot } from '../../../src/application/services/graph-input-visibility.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Writes files under a directory.
 * @param root - Directory that receives the files.
 * @param files - Relative path to content.
 */
function write(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('IndexCodeGraph project-relative graph paths', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-project-relative-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds a workspace target.
   * @param name - Workspace name.
   * @param codeRoot - Path of the code root below the temp project (`''` for the project root).
   * @param specsPath - Optional spec root to expose through the mock repository.
   * @returns Workspace target.
   */
  function workspace(
    name: string,
    codeRoot: string,
    specsPath?: string,
  ): IndexOptions['workspaces'][number] {
    const specRepo = makeMockSpecRepository()
    if (specsPath !== undefined) {
      Object.defineProperty(specRepo, 'specsPath', { get: () => join(tempDir, specsPath) })
    }
    return {
      name,
      prefix: null,
      codeRoot: join(tempDir, codeRoot),
      specRepo,
      ownership: 'owned',
      isExternal: false,
    }
  }

  /**
   * Indexes the temp project.
   * @param workspaces - Workspace targets.
   * @param graphConfig - Project graph configuration.
   * @param store - Optional existing store, for repeated runs.
   * @returns Store, result, and the identities of every indexed file.
   */
  async function index(
    workspaces: IndexOptions['workspaces'],
    graphConfig: ProjectGraphConfig,
    existingStore?: InMemoryGraphStore,
  ): Promise<{ store: InMemoryGraphStore; result: IndexResult; paths: string[] }> {
    const store = existingStore ?? new InMemoryGraphStore(tempDir)
    if (existingStore === undefined) await store.open()
    const registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces,
      graphConfig,
    })
    const files = await store.getAllFiles()
    return { store, result, paths: files.map((file) => file.path).sort() }
  }

  const nestedLayout = (): void =>
    write(tempDir, {
      'app/vendors/iccms/utils.ts': 'export const u = 1\n',
      'app/vendors/other/x.ts': 'export const x = 1\n',
      'app/tmp/c.ts': 'export const c = 1\n',
      'app/fixtures/a.ts': 'export const a = 1\n',
      'app/src/b.ts': 'export const b = 1\n',
      'app/webroot/iccomp.ts': 'export const i = 1\n',
      'root-file.ts': 'export const r = 1\n',
    })

  const nestedWorkspaces = (): IndexOptions['workspaces'] => [
    workspace('default', ''),
    workspace('backend', 'app'),
    workspace('backoffice', 'app/webroot'),
  ]

  const nestedConfig: ProjectGraphConfig = {
    includePaths: [],
    excludePaths: [
      'node_modules/',
      '/app/vendors/*',
      '!/app/vendors/iccms',
      '!/app/vendors/iccms/**',
      'app/tmp/',
    ],
    ignorePaths: ['app/fixtures/**'],
    testPaths: [],
    workspaces: new Map([
      ['default', { excludePaths: ['app/'] }],
      ['backend', { excludePaths: ['app/webroot/'] }],
    ]),
  }

  it('Given anchored global excludes and a nested workspace, then vendors/iccms is indexed and tmp is absent', async () => {
    nestedLayout()
    const { paths, result } = await index(nestedWorkspaces(), nestedConfig)

    expect(paths).toContain('backend:vendors/iccms/utils.ts')
    expect(paths).not.toContain('backend:vendors/other/x.ts')
    expect(paths).not.toContain('backend:tmp/c.ts')
    expect(paths).toContain('backoffice:iccomp.ts')
    expect(paths).toContain('default:root-file.ts')
    // pathBase reached discovery: the anchored `app/` workspace exclusion applied to the default workspace
    expect(paths.some((path) => path.startsWith('default:app/'))).toBe(false)
    expect(result.workspaceOverlapCount).toBe(0)
    expect(result.workspaceOverlaps).toEqual([])
  })

  it('Given a project-relative ignore pattern, then the file keeps its identity with category ignored', async () => {
    nestedLayout()
    const { store } = await index(nestedWorkspaces(), nestedConfig)
    const fixture = (await store.getAllFiles()).find(
      (file) => file.path === 'backend:fixtures/a.ts',
    )
    const source = (await store.getAllFiles()).find((file) => file.path === 'backend:src/b.ts')
    expect(fixture?.category).toBe('ignored')
    expect(source?.category).toBe('source')
  })

  it('Given a workspace negation of a spec root, then the synthetic exclusion still applies', async () => {
    write(tempDir, {
      'app/specs/note.ts': 'export const n = 1\n',
      'app/src/b.ts': 'export const b = 1\n',
    })
    const { paths } = await index([workspace('backend', 'app', 'app/specs')], {
      includePaths: [],
      excludePaths: [],
      testPaths: [],
      ignorePaths: [],
      workspaces: new Map([['backend', { excludePaths: ['!app/specs/'] }]]),
    })
    expect(paths).toContain('backend:src/b.ts')
    expect(paths).not.toContain('backend:specs/note.ts')
  })

  it('Given default test patterns, then project-relative test paths are classified as test', async () => {
    write(tempDir, {
      'packages/core/src/a.spec.ts': 'export const a = 1\n',
      'packages/core/test/b.ts': 'export const b = 1\n',
      'packages/core/src/c.ts': 'export const c = 1\n',
    })
    const { store } = await index([workspace('core', 'packages/core')], {
      includePaths: [],
      testPaths: ['**/*.spec.*', '**/test/**'],
      workspaces: new Map(),
    })
    const byPath = new Map((await store.getAllFiles()).map((file) => [file.path, file.category]))
    expect(byPath.get('core:src/a.spec.ts')).toBe('test')
    expect(byPath.get('core:test/b.ts')).toBe('test')
    expect(byPath.get('core:src/c.ts')).toBe('source')
  })

  describe('workspace overlap diagnostic', () => {
    it('Given a file kept by two workspaces, then one overlap is reported and both identities are persisted', async () => {
      write(tempDir, { 'app/src/b.ts': 'export const b = 1\n' })
      const { paths, result } = await index(
        [workspace('default', ''), workspace('backend', 'app')],
        { includePaths: [], workspaces: new Map() },
      )
      expect(paths).toContain('default:app/src/b.ts')
      expect(paths).toContain('backend:src/b.ts')
      expect(result.workspaceOverlapCount).toBe(1)
      expect(result.workspaceOverlaps).toEqual([
        { projectRelativePath: 'app/src/b.ts', workspaces: ['default', 'backend'] },
      ])
    })

    it('Given partitioning excludes, then no overlap is reported', async () => {
      write(tempDir, { 'app/src/b.ts': 'export const b = 1\n' })
      const { result } = await index([workspace('default', ''), workspace('backend', 'app')], {
        includePaths: [],
        workspaces: new Map([['default', { excludePaths: ['app/'] }]]),
      })
      expect(result.workspaceOverlapCount).toBe(0)
    })

    it('Given more overlaps than the list limit, then the list is truncated and the count is exact', async () => {
      const files: Record<string, string> = {}
      for (let i = 0; i < 30; i++) {
        files[`app/src/f${String(i).padStart(2, '0')}.ts`] = `export const v${String(i)} = 1\n`
      }
      write(tempDir, files)
      const { result } = await index([workspace('default', ''), workspace('backend', 'app')], {
        includePaths: [],
        workspaces: new Map(),
      })
      expect(result.workspaceOverlapCount).toBe(30)
      expect(result.workspaceOverlaps).toHaveLength(25)
      const listed = result.workspaceOverlaps.map((overlap) => overlap.projectRelativePath)
      expect(listed).toEqual([...listed].sort())
    })

    it('Given an unchanged overlapping file on a second run, then the overlap is still reported', async () => {
      write(tempDir, { 'app/src/b.ts': 'export const b = 1\n' })
      const workspaces = [workspace('default', ''), workspace('backend', 'app')]
      const config: ProjectGraphConfig = { includePaths: [], workspaces: new Map() }
      const first = await index(workspaces, config)
      const second = await index(workspaces, config, first.store)
      expect(second.result.workspaceOverlapCount).toBe(1)
    })
  })

  describe('visibility agrees with indexing', () => {
    it('Given a file excluded only by a project-relative pattern, then the visibility snapshot excludes it', () => {
      write(tempDir, {
        'app/vendors/other/x.ts': 'export const x = 1\n',
        'app/src/b.ts': 'export const b = 1\n',
      })
      const snapshot = buildGraphInputVisibilitySnapshot(
        tempDir,
        [workspace('backend', 'app')],
        { includePaths: [], excludePaths: ['/app/vendors/*'], workspaces: new Map() },
        null,
        [],
      )
      const inputs = snapshot.currentInputs.get('backend')
      expect(inputs?.has('app/src/b.ts')).toBe(true)
      expect(inputs?.has('app/vendors/other/x.ts')).toBe(false)
    })
  })
})
