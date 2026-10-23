import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import {
  type RepositoryRootSource,
  emptyRepositoryRootSource,
} from '../../../src/application/ports/repository-root-source.js'
import { type WorkspaceAccessibilitySource } from '../../../src/application/ports/workspace-accessibility-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import {
  type IndexOptions,
  type ProjectWorkspace,
} from '../../../src/domain/value-objects/index-options.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Writes files under a root directory, ensuring parent directories exist.
 * @param root - Directory that receives the files.
 * @param files - Map of relative path to file content.
 */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/**
 * Creates a mock adapter backed by TypeScriptLanguageAdapter for core members.
 * @param overrides - Facet and method overrides.
 * @returns A compliant LanguageAdapter.
 */
function mockAdapter(
  overrides: { [K in keyof LanguageAdapter]?: LanguageAdapter[K] | undefined } = {},
): LanguageAdapter {
  const base = new TypeScriptLanguageAdapter()
  const result: LanguageAdapter = {
    languages: overrides.languages ?? base.languages.bind(base),
    extensions: overrides.extensions ?? base.extensions.bind(base),
    resolutionManifests: overrides.resolutionManifests ?? base.resolutionManifests.bind(base),
    declarationPolicy: overrides.declarationPolicy ?? base.declarationPolicy.bind(base),
    capabilities: overrides.capabilities ?? base.capabilities.bind(base),
    analyzeFile: overrides.analyzeFile ?? base.analyzeFile.bind(base),
    resolveImports: overrides.resolveImports ?? base.resolveImports.bind(base),
    buildRelations: overrides.buildRelations ?? base.buildRelations.bind(base),
    ...(overrides.packageResolution !== undefined
      ? { packageResolution: overrides.packageResolution }
      : 'packageResolution' in overrides
        ? {}
        : base.packageResolution !== undefined
          ? { packageResolution: base.packageResolution }
          : {}),
    ...(overrides.reExportLinking !== undefined
      ? { reExportLinking: overrides.reExportLinking }
      : 'reExportLinking' in overrides
        ? {}
        : base.reExportLinking !== undefined
          ? { reExportLinking: base.reExportLinking }
          : {}),
    relativeImportResolution: overrides.relativeImportResolution ?? base.relativeImportResolution,
    symbolReferenceSyntax: overrides.symbolReferenceSyntax ?? base.symbolReferenceSyntax,
  }
  return result
}

describe('IndexCodeGraph package resolution', () => {
  let tempDir: string
  let graphDir: string
  let appDir: string

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'specd-pkg-res-')))
    graphDir = join(tempDir, 'graph')
    appDir = join(tempDir, 'app')
    writeFiles(graphDir, {
      'package.json': JSON.stringify({
        name: '@fixture/graph',
        exports: { '.': './dist/public.js' },
      }),
      'src/public.ts': 'export function graphSymbol(): number { return 1 }\n',
      'src/barrel.ts': 'export * from "./public.js"\n',
    })
    writeFiles(appDir, {
      'package.json': JSON.stringify({ name: '@fixture/app' }),
      'src/use.ts': [
        "import { graphSymbol } from '@fixture/graph'",
        "import { nonExistent } from 'unknown-external-lib'",
        'export function callGraph(): number { return graphSymbol() }',
      ].join('\n'),
    })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds the default two-workspace options.
   * @param extra - Optional overrides.
   * @returns Configured IndexOptions.
   */
  function makeOptions(extra?: Partial<IndexOptions>): IndexOptions {
    const workspace = (name: string, codeRoot: string): ProjectWorkspace => ({
      name,
      prefix: null,
      codeRoot,
      specRepo: makeMockSpecRepository(),
      ownership: 'owned',
      isExternal: false,
    })
    return {
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace('graph', graphDir), workspace('app', appDir)],
      graphConfig: { includePaths: [], testPaths: ['test/**'], workspaces: new Map() },
      ...extra,
    }
  }

  /**
   * Creates an IndexCodeGraph instance with an in-memory store.
   * @param adapters - Adapters to register.
   * @param repositoryRoots - Injected repository root source.
   * @param customStore - Optional store to reuse.
   * @returns Store and indexer instances.
   */
  async function makeIndexer(
    adapters: readonly LanguageAdapter[],
    repositoryRoots: RepositoryRootSource = emptyRepositoryRootSource,
    customStore?: InMemoryGraphStore,
    accessibility: WorkspaceAccessibilitySource = new NodeWorkspaceAccessibilitySource(),
  ): Promise<{ store: InMemoryGraphStore; indexer: IndexCodeGraph }> {
    const store = customStore ?? new InMemoryGraphStore(tempDir)
    if (!customStore) await store.open()
    const registry = new AdapterRegistry()
    for (const adapter of adapters) registry.register(adapter)
    return {
      store,
      indexer: new IndexCodeGraph(
        store,
        registry,
        emptyResolutionManifestSource,
        repositoryRoots,
        accessibility,
      ),
    }
  }

  describe('Scenario: Every adapter is asked for an identity', () => {
    it('Given two registered adapters that both return an identity for one workspace, then both are asked and stored', async () => {
      writeFiles(appDir, {
        'src/use.ts': [
          "import { graphSymbol } from '@fixture/graph'",
          "import { graphSymbol as s2 } from '@fixture/secondary-graph'",
          "import { nonExistent } from 'unknown-external-lib'",
          'export function callGraph(): number { return graphSymbol() + s2() }',
        ].join('\n'),
      })
      const recorded: Array<{ adapter: string; codeRoot: string }> = []
      const tsAdapter = new TypeScriptLanguageAdapter()
      const secondAdapter = mockAdapter({
        languages: () => ['secondary'],
        extensions: () => ({ '.secondary': 'secondary' }),
        packageResolution: {
          identity: (codeRoot) => {
            recorded.push({ adapter: 'second', codeRoot })
            return codeRoot === graphDir ? '@fixture/secondary-graph' : '@fixture/secondary-app'
          },
          prepare: () => {},
          matchSpecifier: () => undefined,
          entrySurface: () => [],
        },
      })

      const { store, indexer } = await makeIndexer([tsAdapter, secondAdapter])
      const result = await indexer.execute(makeOptions())

      expect(result.errors).toEqual([])
      expect(recorded.some((r) => r.codeRoot === graphDir)).toBe(true)
      expect(recorded.some((r) => r.codeRoot === appDir)).toBe(true)
      // Both the primary and secondary package identities resolve to graph's target symbol
      const facts = await store.getAllReferenceFacts()
      const primaryBinding = facts.localBindings.find(
        (b) => b.filePath === 'app:src/use.ts' && b.localName === 'graphSymbol',
      )
      const secondaryBinding = facts.localBindings.find(
        (b) => b.filePath === 'app:src/use.ts' && b.localName === 's2',
      )
      expect(primaryBinding?.targetId).toBeDefined()
      expect(secondaryBinding?.targetId).toBeDefined()
      expect(primaryBinding?.targetId).toBe(secondaryBinding?.targetId)
    })

    it('Given two workspaces claiming one package identity, when indexed, then it resolves to neither and collision is reported', async () => {
      // Both workspaces have package name @fixture/graph
      writeFiles(appDir, {
        'package.json': JSON.stringify({ name: '@fixture/graph' }),
      })

      const { store, indexer } = await makeIndexer([new TypeScriptLanguageAdapter()])
      const result = await indexer.execute(makeOptions())

      const collisionError = result.errors.find((e) =>
        e.message.includes('Package identity collision'),
      )
      expect(collisionError).toBeDefined()
      expect(collisionError?.message).toContain('@fixture/graph')
      expect(collisionError?.message).toContain('app')
      expect(collisionError?.message).toContain('graph')

      // Since collision deletes identity, import of @fixture/graph in app cannot resolve to either
      const facts = await store.getAllReferenceFacts()
      const resolvedStep = facts.steps.find((s) => s.kind === 'import:package')
      expect(resolvedStep).toBeUndefined()

      // Local binding has undefined targetId
      const binding = facts.localBindings.find(
        (b) => b.filePath === 'app:src/use.ts' && b.localName === 'graphSymbol',
      )
      expect(binding?.targetId).toBeUndefined()
    })

    it('Given one workspace claiming a name through several adapters, when indexed, then it is not a conflict', async () => {
      const tsAdapter = new TypeScriptLanguageAdapter()
      const duplicateAdapter = mockAdapter({
        languages: () => ['duplicate-lang'],
        extensions: () => ({ '.dup': 'duplicate-lang' }),
        packageResolution: {
          identity: (codeRoot) => (codeRoot === graphDir ? '@fixture/graph' : undefined),
          prepare: () => {},
          matchSpecifier: () => undefined,
          entrySurface: () => [],
        },
      })

      const { store, indexer } = await makeIndexer([tsAdapter, duplicateAdapter])
      const result = await indexer.execute(makeOptions())

      // No collision error
      const collisionErrors = result.errors.filter((e) =>
        e.message.includes('Package identity collision'),
      )
      expect(collisionErrors).toHaveLength(0)

      // Package import still resolves
      const facts = await store.getAllReferenceFacts()
      const resolvedStep = facts.steps.find((s) => s.kind === 'import:package')
      expect(resolvedStep).toBeDefined()
    })
  })

  describe('Scenario: Each code root gets the repository root of its own repository', () => {
    it('Given two workspaces in different repositories, when indexed, then each code root gets its own repository root', async () => {
      const customGraphRepo = join(tempDir, 'custom-repo-graph')
      const customAppRepo = join(tempDir, 'custom-repo-app')
      const passedRoots = new Map<string, string | undefined>()
      const mockRepoRoots: RepositoryRootSource = {
        resolve: async (codeRoot) => {
          if (codeRoot === graphDir) return customGraphRepo
          if (codeRoot === appDir) return customAppRepo
          return undefined
        },
      }

      const spyAdapter = mockAdapter({
        languages: () => ['test-lang'],
        extensions: () => ({ '.test': 'test-lang' }),
        packageResolution: {
          identity: (codeRoot, repoRoot) => {
            passedRoots.set(codeRoot, repoRoot)
            return codeRoot === graphDir ? '@fixture/graph' : '@fixture/app'
          },
          prepare: () => {},
          matchSpecifier: () => undefined,
          entrySurface: () => [],
        },
      })

      const { indexer } = await makeIndexer([spyAdapter], mockRepoRoots)
      await indexer.execute(makeOptions())

      expect(passedRoots.get(graphDir)).toBe(customGraphRepo)
      expect(passedRoots.get(appDir)).toBe(customAppRepo)
    })

    it('Given a workspace with no detected VCS, when indexed, then identity receives undefined repository root', async () => {
      const passedRoots = new Map<string, string | undefined>()
      const emptyRepoRoots: RepositoryRootSource = {
        resolve: async () => undefined,
      }

      const spyAdapter = mockAdapter({
        languages: () => ['test-lang'],
        extensions: () => ({ '.test': 'test-lang' }),
        packageResolution: {
          identity: (codeRoot, repoRoot) => {
            passedRoots.set(codeRoot, repoRoot)
            return undefined
          },
          prepare: () => {},
          matchSpecifier: () => undefined,
          entrySurface: () => [],
        },
      })

      const { indexer } = await makeIndexer([spyAdapter], emptyRepoRoots)
      await indexer.execute(makeOptions())

      expect(passedRoots.get(graphDir)).toBeUndefined()
      expect(passedRoots.get(appDir)).toBeUndefined()
    })

    it('Given a repository root source that rejects, when indexed, then the failure is non-fatal and treated as undefined', async () => {
      const failingRepoRoots: RepositoryRootSource = {
        resolve: async () => {
          throw new Error('VCS boom')
        },
      }

      const { indexer } = await makeIndexer([new TypeScriptLanguageAdapter()], failingRepoRoots)
      await expect(indexer.execute(makeOptions())).resolves.toBeDefined()
    })
  })

  describe('Scenario: Partial run maps and prepares every configured workspace', () => {
    it('Given workspaces A and B and a partial run indexing only A, when A imports B, then the import resolves', async () => {
      const tsAdapter = new TypeScriptLanguageAdapter()
      const store = new InMemoryGraphStore(tempDir)
      await store.open()

      // First run indexes both workspaces to populate graph in store
      const fullIndexer = (await makeIndexer([tsAdapter], emptyRepositoryRootSource, store)).indexer
      const initialResult = await fullIndexer.execute(makeOptions())
      expect(initialResult.errors).toEqual([])

      // Touch a file in 'app' so it is re-extracted during the partial run
      writeFileSync(
        join(appDir, 'src/use.ts'),
        [
          "import { graphSymbol } from '@fixture/graph'",
          "import { nonExistent } from 'unknown-external-lib'",
          'export function callGraph(): number { return graphSymbol() + 1 }',
        ].join('\n'),
      )

      // Second run is partial: indexes ONLY 'app', but configuredWorkspaces contains both 'graph' and 'app'
      const opts = makeOptions()
      const partialOptions: IndexOptions = {
        ...opts,
        workspaces: opts.workspaces.filter((w) => w.name === 'app'),
        configuredWorkspaces: opts.workspaces,
      }

      const partialIndexer = (await makeIndexer([tsAdapter], emptyRepositoryRootSource, store))
        .indexer
      const result = await partialIndexer.execute(partialOptions)
      expect(result.errors).toEqual([])
      expect(result.filesIndexed).toBe(1)

      const facts = await store.getAllReferenceFacts()
      const resolvedStep = facts.steps.find((s) => s.kind === 'import:package')
      expect(resolvedStep).toBeDefined()
    })

    it('Given an inaccessible configured workspace, when indexed, then it is skipped with a diagnostic without failing the run', async () => {
      writeFiles(appDir, {
        'src/use.ts': [
          "import { graphSymbol } from '@fixture/graph'",
          "import { missing } from '@fixture/uncloned-lib'",
          'export function callGraph(): number { return graphSymbol() }',
        ].join('\n'),
      })
      const opts = makeOptions()
      const inaccessibleWorkspace: ProjectWorkspace = {
        name: 'uncloned-lib',
        prefix: null,
        codeRoot: join(tempDir, 'nonexistent-directory'),
        specRepo: makeMockSpecRepository(),
        ownership: 'owned',
        isExternal: false,
      }

      const partialOptions: IndexOptions = {
        ...opts,
        configuredWorkspaces: [...opts.workspaces, inaccessibleWorkspace],
      }

      const { indexer } = await makeIndexer([new TypeScriptLanguageAdapter()])
      const result = await indexer.execute(partialOptions)

      const skippedError = result.errors.find((e) =>
        e.message.includes('skipped for package resolution'),
      )
      expect(skippedError).toBeDefined()
      expect(skippedError?.message).toContain('uncloned-lib')
      expect(skippedError?.message).toContain('is not accessible')
      expect(result.importDiagnostics.externalPackageImports).toBe(1)
      expect(result.importDiagnostics.total).toBe(0)
    })

    it('Scenario: Workspace accessibility is supplied through an application port', async () => {
      const opts = makeOptions()
      const fakeAccessibility: WorkspaceAccessibilitySource = {
        isAccessibleDirectory: vi.fn(async (dir: string) => dir === graphDir),
      }

      const { indexer } = await makeIndexer(
        [new TypeScriptLanguageAdapter()],
        emptyRepositoryRootSource,
        undefined,
        fakeAccessibility,
      )
      const result = await indexer.execute(opts)

      expect(fakeAccessibility.isAccessibleDirectory).toHaveBeenCalledWith(graphDir)
      expect(fakeAccessibility.isAccessibleDirectory).toHaveBeenCalledWith(appDir)

      const skippedError = result.errors.find((e) =>
        e.message.includes('Workspace "app" skipped for package resolution'),
      )
      expect(skippedError).toBeDefined()
      expect(skippedError?.filePath).toBe('app:<manifest>')
      expect(result.errors.some((e) => e.message.includes('Workspace "graph" skipped'))).toBe(false)
    })

    it('Scenario: Accessibility probe failure is non-fatal', async () => {
      const opts = makeOptions()
      const rejectingAccessibility: WorkspaceAccessibilitySource = {
        isAccessibleDirectory: async (dir: string) => {
          if (dir === appDir) {
            throw new Error('EACCES: permission denied')
          }
          return true
        },
      }

      const { indexer } = await makeIndexer(
        [new TypeScriptLanguageAdapter()],
        emptyRepositoryRootSource,
        undefined,
        rejectingAccessibility,
      )
      const result = await indexer.execute(opts)

      const skippedError = result.errors.find((e) =>
        e.message.includes('Workspace "app" skipped for package resolution'),
      )
      expect(skippedError).toBeDefined()
      expect(skippedError?.filePath).toBe('app:<manifest>')
      expect(skippedError?.message).toContain('is not accessible')

      // Other workspace continues indexing
      expect(result.filesIndexed).toBeGreaterThan(0)
    })
  })

  describe('Scenario: Failure isolation keeps relative barrel linking', () => {
    it('Given an adapter whose identity throws, when indexed, then relative barrel re-exports are still linked', async () => {
      const base = new TypeScriptLanguageAdapter()
      const faultyAdapter = mockAdapter({
        packageResolution: {
          identity: () => {
            throw new Error('identity-exploded')
          },
          prepare: (...args) => base.packageResolution.prepare(...args),
          matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
          entrySurface: (...args) => base.packageResolution.entrySurface(...args),
        },
      })

      const { store, indexer } = await makeIndexer([faultyAdapter])
      const result = await indexer.execute(makeOptions())

      // Error was recorded
      expect(result.errors.some((e) => e.message.includes('identity-exploded'))).toBe(true)
      // Faulty adapter listed in adaptersWithoutPackageResolution
      expect(result.importDiagnostics.adaptersWithoutPackageResolution).toContain('typescript')

      // Relative barrel re-export linking still succeeded!
      const facts = await store.getAllReferenceFacts()
      const barrelStep = facts.steps.find((s) => s.kind.startsWith('re-export:'))
      expect(barrelStep).toBeDefined()
    })

    it('Given an adapter whose prepare throws, when indexed, then relative barrel re-exports are still linked', async () => {
      const base = new TypeScriptLanguageAdapter()
      const faultyAdapter = mockAdapter({
        packageResolution: {
          identity: (...args) => base.packageResolution.identity(...args),
          prepare: () => {
            throw new Error('prepare-exploded')
          },
          matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
          entrySurface: (...args) => base.packageResolution.entrySurface(...args),
        },
      })

      const { store, indexer } = await makeIndexer([faultyAdapter])
      const result = await indexer.execute(makeOptions())

      expect(result.errors.some((e) => e.message.includes('prepare-exploded'))).toBe(true)
      expect(result.importDiagnostics.adaptersWithoutPackageResolution).toContain('typescript')

      // Barrel step still exists
      const facts = await store.getAllReferenceFacts()
      const barrelStep = facts.steps.find((s) => s.kind.startsWith('re-export:'))
      expect(barrelStep).toBeDefined()
    })

    it('Scenario: Adapter disabled on a later workspace drops earlier sole identities', async () => {
      const base = new TypeScriptLanguageAdapter()
      const faultyAdapter = mockAdapter({
        packageResolution: {
          identity: (codeRoot, ...args) => {
            // Workspace 'graph' is processed first and returns '@fixture/graph'
            if (codeRoot.includes('graph')) {
              return base.packageResolution.identity(codeRoot, ...args)
            }
            // Workspace 'app' throws
            throw new Error('identity-exploded-on-app')
          },
          prepare: (...args) => base.packageResolution.prepare(...args),
          matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
          entrySurface: (...args) => base.packageResolution.entrySurface(...args),
        },
      })

      const { store, indexer } = await makeIndexer([faultyAdapter])
      const result = await indexer.execute(makeOptions())

      expect(result.errors.some((e) => e.message.includes('identity-exploded-on-app'))).toBe(true)
      expect(result.importDiagnostics.adaptersWithoutPackageResolution).toContain('typescript')

      // Because the sole adapter claiming '@fixture/graph' was disabled, its package identity was dropped,
      // so no resolved import:package step is emitted.
      const facts = await store.getAllReferenceFacts()
      const resolvedStep = facts.steps.find((s) => s.kind === 'import:package')
      expect(resolvedStep).toBeUndefined()
    })
  })

  describe('Scenario: Adapter serving several languages is listed once', () => {
    it('Given an adapter serving typescript, tsx, javascript, and jsx without packageResolution, then it is listed once by first language', async () => {
      const multiLangAdapter = mockAdapter({
        languages: () => ['typescript', 'tsx', 'javascript', 'jsx'],
        extensions: () => ({
          '.ts': 'typescript',
          '.tsx': 'tsx',
          '.js': 'javascript',
          '.jsx': 'jsx',
        }),
        packageResolution: undefined,
      })

      const { indexer } = await makeIndexer([multiLangAdapter])
      const result = await indexer.execute(makeOptions())

      const disabled = result.importDiagnostics.adaptersWithoutPackageResolution
      expect(disabled).toEqual(['typescript'])
    })
  })

  describe('Scenario: Package-unknown is counted, never a failure', () => {
    it('Given an import of an unknown external package, when indexed, then externalPackageImports is incremented and not counted as failure', async () => {
      const { indexer } = await makeIndexer([new TypeScriptLanguageAdapter()])
      const result = await indexer.execute(makeOptions())

      expect(result.importDiagnostics.externalPackageImports).toBe(1)
      expect(result.importDiagnostics.total).toBe(0)
      expect(result.importDiagnostics.byReason['package-unknown']).toBeUndefined()
    })
  })

  describe('Scenario: Linking performs no I/O', () => {
    it('Given re-export linking runs, then no filesystem read is performed', async () => {
      const base = new TypeScriptLanguageAdapter()
      let linkRan = false
      const wrappedAdapter = mockAdapter({
        reExportLinking: {
          link: (context) => {
            linkRan = true
            const readSpy = vi.spyOn(fs, 'readFileSync')
            try {
              const res = base.reExportLinking.link(context)
              expect(readSpy).not.toHaveBeenCalled()
              return res
            } finally {
              readSpy.mockRestore()
            }
          },
        },
      })

      const { indexer } = await makeIndexer([wrappedAdapter])
      await indexer.execute(makeOptions())
      expect(linkRan).toBe(true)
    })
  })

  describe('Scenario: Bindings without a target are ignored by the ambiguity check', () => {
    it('Given a public binding without targetId, when checked, it is ignored and does not cause ambiguous diagnosis', async () => {
      writeFiles(graphDir, {
        'src/public.ts': 'export function graphSymbol(): number { return 1 }\n',
      })
      const base = new TypeScriptLanguageAdapter()
      const adapter = mockAdapter({
        reExportLinking: {
          link: (context) => {
            const result = base.reExportLinking.link(context)
            // Add a public binding without targetId to the entry surface
            const extraBinding = {
              id: 'graph:src/public.ts\0export\0value\0graphSymbol\0extra',
              surfaceId: 'graph:src/public.ts',
              surface: 'graph:src/public.ts',
              exportedName: 'graphSymbol',
              space: 'value' as const,
              targetId: undefined,
            }
            return {
              ...result,
              publicBindings: [...result.publicBindings, extraBinding],
            }
          },
        },
      })

      const { store, indexer } = await makeIndexer([adapter])
      const result = await indexer.execute(makeOptions())

      expect(result.errors).toEqual([])
      // Import of graphSymbol still resolves because extra binding without targetId was ignored!
      const facts = await store.getAllReferenceFacts()
      const resolvedStep = facts.steps.find((s) => s.kind === 'import:package')
      expect(resolvedStep).toBeDefined()
    })
  })
})
