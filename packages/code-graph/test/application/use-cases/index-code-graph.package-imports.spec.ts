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
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type IndexOptions } from '../../../src/domain/value-objects/index-options.js'
import { type IndexResult } from '../../../src/domain/value-objects/index-result.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Writes files under a directory, creating parents.
 * @param root - Directory that receives the files.
 * @param files - Relative path to content.
 */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

const GRAPH_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: '@fixture/graph',
    exports: {
      '.': { import: './dist/public.js', types: './dist/public.d.ts' },
      './internal': './dist/index.js',
    },
  }),
  'src/public.ts': "export { SymbolNode } from './domain/index.js'\n",
  'src/domain/index.ts': "export * from './symbol-node.js'\n",
  'src/domain/symbol-node.ts': 'export interface SymbolNode {\n  readonly id: string\n}\n',
  'src/index.ts': 'export function deepHelper(): number {\n  return 1\n}\n',
  'src/internal-thing.ts': 'export function InternalThing(): number {\n  return 2\n}\n',
  'test/helpers.ts': 'export function Widget(): number {\n  return 3\n}\n',
}

const APP_FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: '@fixture/app' }),
  'src/use.ts': [
    "import type { SymbolNode } from '@fixture/graph'",
    "import { InternalThing, Widget } from '@fixture/graph'",
    "import { deepHelper } from '@fixture/graph/internal'",
    "import { nothing } from 'unknown-pkg'",
    '',
    'export function describeNode(node: SymbolNode): string {',
    '  return `${node.id}${String(InternalThing)}${String(Widget)}${String(nothing)}${String(deepHelper())}`',
    '}',
    '',
  ].join('\n'),
}

describe('IndexCodeGraph package imports', () => {
  let tempDir: string
  let graphDir: string
  let appDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-package-imports-'))
    graphDir = join(tempDir, 'graph')
    appDir = join(tempDir, 'app')
    writeFiles(graphDir, GRAPH_FILES)
    writeFiles(appDir, APP_FILES)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds the options for a two-workspace run.
   * @returns Index options.
   */
  function options(): IndexOptions {
    const workspace = (name: string, codeRoot: string): IndexOptions['workspaces'][number] => ({
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
    }
  }

  /**
   * Creates an indexer with the given adapters over a fresh store.
   * @param adapters - Adapters to register.
   * @returns The store and indexer.
   */
  async function indexerWith(
    adapters: readonly LanguageAdapter[],
  ): Promise<{ store: InMemoryGraphStore; indexer: IndexCodeGraph }> {
    const store = new InMemoryGraphStore(tempDir)
    await store.open()
    const registry = new AdapterRegistry()
    for (const adapter of adapters) registry.register(adapter)
    return {
      store,
      indexer: new IndexCodeGraph(
        store,
        registry,
        emptyResolutionManifestSource,
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      ),
    }
  }

  /**
   * Reduces the persisted reference state to comparable, order-independent strings.
   * @param store - Store to read.
   * @returns Sorted relation, binding, and step keys.
   */
  async function snapshot(store: InMemoryGraphStore): Promise<Record<string, string[]>> {
    const facts = await store.getAllReferenceFacts()
    return {
      relations: store
        .allRelationsForTest()
        .map((relation) => `${relation.source}|${relation.type}|${relation.target}`)
        .sort(),
      local: facts.localBindings.map((b) => `${b.id}|${b.targetId ?? ''}`).sort(),
      public: facts.publicBindings.map((b) => `${b.id}|${b.targetId ?? ''}`).sort(),
      steps: facts.steps.map((s) => `${s.fromId}|${s.toId}|${s.kind}`).sort(),
    }
  }

  /**
   * Finds the target of a module-scope binding by name in the importing file.
   * @param store - Store to read.
   * @param name - Local name.
   * @returns The binding target, or undefined when unresolved or missing.
   */
  async function bindingTarget(
    store: InMemoryGraphStore,
    name: string,
  ): Promise<string | undefined> {
    const facts = await store.getAllReferenceFacts()
    return facts.localBindings.find(
      (binding) => binding.filePath === 'app:src/use.ts' && binding.localName === name,
    )?.targetId
  }

  it('Given a type imported through a barrel chain, when indexed, then the binding, step, IMPORTS and USES_TYPE cross the workspace', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    const result = await indexer.execute(options())

    const target = await bindingTarget(store, 'SymbolNode')
    expect(target).toContain('symbol-node.ts')
    const facts = await store.getAllReferenceFacts()
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(true)
    const relations = store.allRelationsForTest()
    expect(
      relations.some(
        (r) =>
          r.type === 'IMPORTS' &&
          r.source === 'app:src/use.ts' &&
          r.target === 'graph:src/public.ts',
      ),
    ).toBe(true)
    expect(
      relations.some(
        (r) =>
          r.type === 'USES_TYPE' &&
          r.source.startsWith('app:src/use.ts') &&
          r.target.startsWith('graph:src/domain/symbol-node.ts'),
      ),
    ).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('Given a subpath export, when indexed, then the name resolves against that entry and not the root entry', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    expect(await bindingTarget(store, 'deepHelper')).toContain('graph:src/index.ts')
    expect(
      store
        .allRelationsForTest()
        .some(
          (r) =>
            r.type === 'IMPORTS' &&
            r.source === 'app:src/use.ts' &&
            r.target === 'graph:src/index.ts',
        ),
    ).toBe(true)
  })

  it('Given a unique internal symbol and a same-name test helper, when indexed, then neither is chosen and nothing is persisted for them', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    const result = await indexer.execute(options())

    expect(await bindingTarget(store, 'InternalThing')).toBeUndefined()
    expect(await bindingTarget(store, 'Widget')).toBeUndefined()
    const relations = store.allRelationsForTest()
    expect(
      relations.some(
        (r) =>
          r.source.startsWith('app:src/use.ts') &&
          (r.target.includes('internal-thing.ts') || r.target.includes('test/helpers.ts')),
      ),
    ).toBe(false)
    expect(result.importDiagnostics.byReason['not-exported']).toBeGreaterThanOrEqual(2)
  })

  it('Given an unknown package, when indexed, then no edge exists and it is counted as an external import, not a failure', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    const result = await indexer.execute(options())

    expect(await bindingTarget(store, 'nothing')).toBeUndefined()
    expect(result.importDiagnostics.externalPackageImports).toBeGreaterThanOrEqual(1)
    expect(result.importDiagnostics.byReason['package-unknown']).toBeUndefined()
    expect(
      result.importDiagnostics.samples.some(
        (diagnostic) => diagnostic.reason === 'package-unknown',
      ),
    ).toBe(false)
    const persisted = JSON.stringify(await snapshot(store))
    expect(persisted).not.toContain('package-unknown')
  })

  it('Given a same-name local symbol, when a type is imported from another workspace, then the import wins and the local symbol is not chosen', async () => {
    writeFiles(appDir, {
      'src/local.ts': 'export interface SymbolNode {\n  readonly local: true\n}\n',
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    const relations = store.allRelationsForTest()
    expect(
      relations.some(
        (r) =>
          r.type === 'USES_TYPE' &&
          r.source.startsWith('app:src/use.ts') &&
          r.target.startsWith('graph:src/domain/symbol-node.ts'),
      ),
    ).toBe(true)
    expect(
      relations.some(
        (r) =>
          r.type === 'USES_TYPE' &&
          r.source.startsWith('app:src/use.ts') &&
          r.target.startsWith('app:src/local.ts'),
      ),
    ).toBe(false)
  })

  it('Given a re-export, when indexed, then the barrel depends on the module it re-exports', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    const imports = store
      .allRelationsForTest()
      .filter((r) => r.type === 'IMPORTS' && r.source === 'graph:src/public.ts')
      .map((r) => r.target)
    expect(imports).toContain('graph:src/domain/index.ts')
  })

  it('Given many failing imports with one reason, when indexed, then the count is exact and the samples are bounded', async () => {
    const names = Array.from({ length: 25 }, (_, index) => `Missing${String(index)}`)
    writeFiles(appDir, {
      'src/many.ts': `${names.map((name) => `import { ${name} } from '@fixture/graph'`).join('\n')}\nexport const used = [${names.join(', ')}]\n`,
    })
    const { indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    const result = await indexer.execute(options())

    expect(result.importDiagnostics.byReason['not-exported']).toBeGreaterThanOrEqual(25)
    expect(
      result.importDiagnostics.samples.filter((diagnostic) => diagnostic.reason === 'not-exported'),
    ).toHaveLength(20)
    expect(result.importDiagnostics.total).toBe(
      Object.values(result.importDiagnostics.byReason).reduce((sum, count) => sum + count, 0),
    )
  })

  it('Given a manifest above the project root, when the package map is built, then it is not read', async () => {
    const outer = join(tempDir, 'outer')
    const project = join(outer, 'project')
    writeFiles(outer, { 'package.json': JSON.stringify({ name: '@outside/pkg' }) })
    writeFiles(join(project, 'plain'), { 'src/a.ts': 'export const a = 1\n' })
    writeFiles(join(project, 'user'), {
      'src/b.ts': "import { x } from '@outside/pkg'\nexport const b = x\n",
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])
    const workspace = (name: string): IndexOptions['workspaces'][number] => ({
      name,
      prefix: null,
      codeRoot: join(project, name),
      specRepo: makeMockSpecRepository(),
      ownership: 'owned',
      isExternal: false,
    })

    const result = await indexer.execute({
      projectRoot: project,
      vcsRoot: project,
      workspaces: [workspace('plain'), workspace('user')],
      graphConfig: { includePaths: [], workspaces: new Map() },
    })

    expect(result.importDiagnostics.externalPackageImports).toBeGreaterThanOrEqual(1)
    expect(result.importDiagnostics.byReason['not-exported']).toBeUndefined()
    expect(await bindingTarget(store, 'x')).toBeUndefined()
  })

  it('Given the entry stops publishing a name, when indexed incrementally, then the edge disappears and equals a clean rebuild', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])
    await indexer.execute(options())
    expect(await bindingTarget(store, 'SymbolNode')).toBeDefined()

    writeFiles(graphDir, { 'src/public.ts': 'export const other = 1\n' })
    const second = await indexer.execute(options())

    expect(second.fullRebuild).toBe(false)
    expect(await bindingTarget(store, 'SymbolNode')).toBeUndefined()
    const fresh = await indexerWith([new TypeScriptLanguageAdapter()])
    await fresh.indexer.execute(options())
    expect(await snapshot(store)).toEqual(await snapshot(fresh.store))
  })

  it('Given a barrel intermediate changes, when indexed incrementally, then importers are re-resolved and equal a clean rebuild', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])
    await indexer.execute(options())

    writeFiles(graphDir, { 'src/domain/index.ts': 'export const nothingElse = 1\n' })
    await indexer.execute(options())

    expect(await bindingTarget(store, 'SymbolNode')).toBeUndefined()
    const fresh = await indexerWith([new TypeScriptLanguageAdapter()])
    await fresh.indexer.execute(options())
    expect(await snapshot(store)).toEqual(await snapshot(fresh.store))
  })

  it('Given only the importing file changes, when indexed incrementally, then the import still resolves and equals a clean rebuild', async () => {
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])
    await indexer.execute(options())

    writeFiles(appDir, {
      'src/use.ts': `${APP_FILES['src/use.ts']!}export const marker = 1\n`,
    })
    const second = await indexer.execute(options())

    expect(second.fullRebuild).toBe(false)
    expect(await bindingTarget(store, 'SymbolNode')).toContain('symbol-node.ts')
    const fresh = await indexerWith([new TypeScriptLanguageAdapter()])
    await fresh.indexer.execute(options())
    expect(await snapshot(store)).toEqual(await snapshot(fresh.store))
  })

  it('Given re-export linking and preparation, when indexed, then identity, prepare and link precede the first import resolution', async () => {
    const calls: string[] = []
    const base = new TypeScriptLanguageAdapter()
    const traced: LanguageAdapter = {
      languages: () => base.languages(),
      extensions: () => base.extensions(),
      resolutionManifests: () => base.resolutionManifests(),
      analyzeFile: (...args) => base.analyzeFile(...args),
      resolveImports: (...args) => {
        calls.push('resolveImports')
        return base.resolveImports(...args)
      },
      buildRelations: (...args) => base.buildRelations(...args),
      capabilities: () => base.capabilities(),
      declarationPolicy: () => base.declarationPolicy(),
      packageResolution: {
        identity: (...args) => {
          calls.push('identity')
          return base.packageResolution.identity(...args)
        },
        prepare: (context) => {
          calls.push('prepare')
          base.packageResolution.prepare(context)
        },
        matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
        entrySurface: (request) => base.packageResolution.entrySurface(request),
      },
      relativeImportResolution: base.relativeImportResolution,
      symbolReferenceSyntax: base.symbolReferenceSyntax,
      reExportLinking: {
        link: (context) => {
          calls.push('link')
          return base.reExportLinking.link(context)
        },
      },
    }
    const { indexer } = await indexerWith([traced])

    await indexer.execute(options())

    const firstResolve = calls.indexOf('resolveImports')
    expect(firstResolve).toBeGreaterThan(-1)
    expect(calls.lastIndexOf('identity')).toBeLessThan(calls.indexOf('prepare'))
    expect(calls.indexOf('prepare')).toBeLessThan(calls.indexOf('link'))
    expect(calls.indexOf('link')).toBeLessThan(firstResolve)
    expect(calls.filter((call) => call === 'prepare')).toHaveLength(1)
  })

  it('Given an adapter that provides only the required core, when indexed, then files index normally and a diagnostic names the missing facet', async () => {
    const core: LanguageAdapter = {
      languages: () => ['pseudo'],
      extensions: () => ({ '.pseudo': 'pseudo' }),
      resolutionManifests: () => [],
      analyzeFile: () => ({
        language: 'pseudo',
        symbols: [],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      }),
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    writeFiles(appDir, { 'src/a.pseudo': 'anything\n' })
    const { indexer } = await indexerWith([new TypeScriptLanguageAdapter(), core])

    const result: IndexResult = await indexer.execute(options())

    expect(result.errors).toEqual([])
    expect(
      result.importDiagnostics.adaptersWithoutPackageResolution.some((l) => l.startsWith('pseudo')),
    ).toBe(true)
    expect(result.importDiagnostics.byReason['facet-absent']).toBeUndefined()
  })

  it('Given a package resolution facet whose prepare throws, when indexed, then the run completes and the adapter behaves as if the facet were absent', async () => {
    const base = new TypeScriptLanguageAdapter()
    const failing: LanguageAdapter = {
      languages: () => base.languages(),
      extensions: () => base.extensions(),
      resolutionManifests: () => base.resolutionManifests(),
      analyzeFile: (...args) => base.analyzeFile(...args),
      resolveImports: (...args) => base.resolveImports(...args),
      buildRelations: (...args) => base.buildRelations(...args),
      capabilities: () => base.capabilities(),
      declarationPolicy: () => base.declarationPolicy(),
      packageResolution: {
        identity: (...args) => base.packageResolution.identity(...args),
        prepare: () => {
          throw new Error('boom')
        },
        matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
        entrySurface: (request) => base.packageResolution.entrySurface(request),
      },
      relativeImportResolution: base.relativeImportResolution,
      symbolReferenceSyntax: base.symbolReferenceSyntax,
      reExportLinking: base.reExportLinking,
    }
    const { store, indexer } = await indexerWith([failing])

    const result = await indexer.execute(options())

    expect(result.diagnostics.some((error) => error.message.includes('boom'))).toBe(true)
    expect(await bindingTarget(store, 'SymbolNode')).toBeUndefined()
    expect(result.importDiagnostics.adaptersWithoutPackageResolution.length).toBeGreaterThanOrEqual(
      1,
    )
    expect(result.importDiagnostics.byReason['facet-absent']).toBeUndefined()
  })
  /**
   * Builds a TypeScript-backed adapter whose `identity` is replaced.
   * @param identity - Replacement identity function.
   * @returns The adapter.
   */
  function withIdentity(identity: (codeRoot?: string) => string | undefined): LanguageAdapter {
    const base = new TypeScriptLanguageAdapter()
    return {
      languages: () => base.languages(),
      extensions: () => base.extensions(),
      resolutionManifests: () => base.resolutionManifests(),
      analyzeFile: (...args) => base.analyzeFile(...args),
      resolveImports: (...args) => base.resolveImports(...args),
      buildRelations: (...args) => base.buildRelations(...args),
      capabilities: () => base.capabilities(),
      declarationPolicy: () => base.declarationPolicy(),
      packageResolution: {
        identity,
        prepare: (...args) => base.packageResolution.prepare(...args),
        matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
        entrySurface: (request) => base.packageResolution.entrySurface(request),
      },
      relativeImportResolution: base.relativeImportResolution,
      symbolReferenceSyntax: base.symbolReferenceSyntax,
      reExportLinking: base.reExportLinking,
    }
  }

  it('Given an identity that throws, when indexed, then the error is recorded and the run completes', async () => {
    const { indexer } = await indexerWith([
      withIdentity(() => {
        throw new Error('identity-boom')
      }),
    ])

    const result = await indexer.execute(options())

    expect(result.diagnostics.some((error) => error.message.includes('identity-boom'))).toBe(true)
    expect(result.importDiagnostics.adaptersWithoutPackageResolution.length).toBe(1)
    expect(result.filesIndexed).toBeGreaterThan(0)
  })

  it('Given two adapters that both return an identity, when indexed, then every adapter is asked', async () => {
    let secondAsked = 0
    const first = new TypeScriptLanguageAdapter()
    const second: LanguageAdapter = {
      ...withIdentity((codeRoot) => {
        secondAsked++
        return codeRoot?.includes('graph') ? '@fixture/pseudo-graph' : '@fixture/pseudo-app'
      }),
      languages: () => ['pseudo'],
      extensions: () => ({ '.pseudo': 'pseudo' }),
    }
    const { store, indexer } = await indexerWith([first, second])

    const result = await indexer.execute(options())

    expect(secondAsked).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
    expect(await bindingTarget(store, 'SymbolNode')).toBeDefined()
  })

  it('Given a default package import and one default export, when indexed, then the name binds to that declaration and the entry is a dependency', async () => {
    writeFiles(graphDir, {
      'src/public.ts':
        "export { SymbolNode } from './domain/index.js'\nexport default function Client(): number {\n  return 1\n}\n",
    })
    writeFiles(appDir, {
      'src/use.ts': "import Client from '@fixture/graph'\nexport const made = Client()\n",
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    expect(await bindingTarget(store, 'Client')).toContain('public.ts')
    expect(
      store
        .allRelationsForTest()
        .some(
          (r) =>
            r.type === 'IMPORTS' &&
            r.source === 'app:src/use.ts' &&
            r.target === 'graph:src/public.ts',
        ),
    ).toBe(true)
  })

  it('Given a type-only import of a name published only as a value, when indexed, then it stays unresolved', async () => {
    writeFiles(graphDir, {
      'src/public.ts':
        "export { SymbolNode } from './domain/index.js'\nexport const OnlyValue = 1\n",
    })
    writeFiles(appDir, {
      'src/use.ts': "import type { OnlyValue } from '@fixture/graph'\nexport type T = OnlyValue\n",
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    expect(await bindingTarget(store, 'OnlyValue')).toBeUndefined()
  })

  it('Given a resolveImports that throws for one file, when indexed, then that file records an error and the others still resolve', async () => {
    const base = new TypeScriptLanguageAdapter()
    const flaky: LanguageAdapter = {
      languages: () => base.languages(),
      extensions: () => base.extensions(),
      resolutionManifests: () => base.resolutionManifests(),
      analyzeFile: (...args) => base.analyzeFile(...args),
      resolveImports: (analysis, context) => {
        if (analysis.filePath === 'app:src/broken.ts') throw new Error('per-file-boom')
        return base.resolveImports(analysis, context)
      },
      buildRelations: (...args) => base.buildRelations(...args),
      capabilities: () => base.capabilities(),
      declarationPolicy: () => base.declarationPolicy(),
      packageResolution: base.packageResolution,
      relativeImportResolution: base.relativeImportResolution,
      symbolReferenceSyntax: base.symbolReferenceSyntax,
      reExportLinking: base.reExportLinking,
    }
    writeFiles(appDir, {
      'src/broken.ts': "import { SymbolNode } from '@fixture/graph'\nexport type B = SymbolNode\n",
    })
    const { store, indexer } = await indexerWith([flaky])

    const result = await indexer.execute(options())

    expect(result.errors.filter((e) => e.message.includes('per-file-boom'))).toHaveLength(1)
    expect(await bindingTarget(store, 'SymbolNode')).toBeDefined()
  })

  it('Given an import whose target appears in a later run, when indexed incrementally, then it resolves and equals a clean rebuild', async () => {
    rmSync(join(graphDir, 'src/domain/symbol-node.ts'))
    const incremental = await indexerWith([new TypeScriptLanguageAdapter()])
    await incremental.indexer.execute(options())
    expect(await bindingTarget(incremental.store, 'SymbolNode')).toBeUndefined()

    writeFiles(graphDir, GRAPH_FILES)
    await incremental.indexer.execute(options())
    const clean = await indexerWith([new TypeScriptLanguageAdapter()])
    await clean.indexer.execute(options())

    expect(await bindingTarget(incremental.store, 'SymbolNode')).toBeDefined()
    expect(await snapshot(incremental.store)).toEqual(await snapshot(clean.store))
  })

  it('Given a link that throws, when indexed, then the run completes and the adapter is listed as without package resolution', async () => {
    const base = new TypeScriptLanguageAdapter()
    const failing: LanguageAdapter = {
      ...withIdentity(() => '@fixture/x'),
      packageResolution: base.packageResolution,
      reExportLinking: {
        link: () => {
          throw new Error('link-boom')
        },
      },
    }
    const { indexer } = await indexerWith([failing])

    const result = await indexer.execute(options())

    expect(result.diagnostics.some((error) => error.message.includes('link-boom'))).toBe(true)
    expect(result.importDiagnostics.adaptersWithoutPackageResolution.length).toBe(1)
  })

  it('Given two workspaces that claim one package identity, when indexed, then an error names both', async () => {
    writeFiles(appDir, { 'package.json': JSON.stringify({ name: '@fixture/graph' }) })
    const { indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    const result = await indexer.execute(options())

    const collision = result.diagnostics.find((error) => error.message.includes('collision'))
    expect(collision?.message).toContain('@fixture/graph')
    expect(collision?.message).toContain('graph')
    expect(collision?.message).toContain('app')
  })

  it('Given an unchanged workspace in an incremental run, when indexed, then prepare still receives every workspace', async () => {
    const base = new TypeScriptLanguageAdapter()
    const seen: string[][] = []
    const spy: LanguageAdapter = {
      ...withIdentity(() => undefined),
      packageResolution: {
        identity: (...args) => base.packageResolution.identity(...args),
        prepare: (context) => {
          seen.push(context.workspaces.map((workspace) => workspace.name))
          base.packageResolution.prepare(context)
        },
        matchSpecifier: (...args) => base.packageResolution.matchSpecifier(...args),
        entrySurface: (request) => base.packageResolution.entrySurface(request),
      },
      reExportLinking: base.reExportLinking,
    }
    const { indexer } = await indexerWith([spy])
    await indexer.execute(options())
    // Only an existing file of `app` changes; `graph` is hydrated from the store.
    writeFiles(appDir, { 'src/use.ts': `${APP_FILES['src/use.ts']}\nexport const touched = 1\n` })

    await indexer.execute(options())

    expect(seen).toHaveLength(2)
    expect(seen[1]?.sort()).toEqual(['app', 'graph'])
  })

  it('Given a namespace package import, when indexed, then the entry is a dependency and no declaration is bound', async () => {
    writeFiles(appDir, {
      'src/use.ts': "import * as graph from '@fixture/graph'\nexport const g = graph\n",
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    expect(await bindingTarget(store, 'graph')).toBeUndefined()
    expect(
      store
        .allRelationsForTest()
        .some(
          (r) =>
            r.type === 'IMPORTS' &&
            r.source === 'app:src/use.ts' &&
            r.target === 'graph:src/public.ts',
        ),
    ).toBe(true)
  })

  it('Given a link-only adapter whose link throws, when indexed, then it is not listed as lacking package resolution', async () => {
    const linkOnly: LanguageAdapter = {
      languages: () => ['pseudo'],
      extensions: () => ({ '.pseudo': 'pseudo' }),
      resolutionManifests: () => [],
      analyzeFile: () => ({
        language: 'pseudo',
        symbols: [],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      }),
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
      reExportLinking: {
        link: () => {
          throw new Error('link-only-boom')
        },
      },
    }
    const { indexer } = await indexerWith([new TypeScriptLanguageAdapter(), linkOnly])

    const result = await indexer.execute(options())

    expect(result.diagnostics.some((error) => error.message.includes('link-only-boom'))).toBe(true)
    const listed = result.importDiagnostics.adaptersWithoutPackageResolution.filter((l) =>
      l.startsWith('pseudo'),
    )
    expect(listed).toHaveLength(1)
  })

  it('Given a barrel target classified as a test, when re-exports are linked, then the test file is not linked', async () => {
    writeFiles(graphDir, {
      'src/public.ts': "export { Widget } from '../test/helpers.js'\n",
    })
    writeFiles(appDir, {
      'src/use.ts': "import { Widget } from '@fixture/graph'\nexport const w = Widget\n",
    })
    const { store, indexer } = await indexerWith([new TypeScriptLanguageAdapter()])

    await indexer.execute(options())

    expect(await bindingTarget(store, 'Widget')).toBeUndefined()
  })
})
