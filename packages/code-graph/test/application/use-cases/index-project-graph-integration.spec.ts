import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpecRepository, type SpecdConfig, type SpecRepository } from '@specd/core'
import Database from 'better-sqlite3'
import { IndexProjectGraph } from '../../../src/application/use-cases/index-project-graph.js'
import { createCodeGraphProvider } from '../../../src/composition/create-code-graph-provider.js'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import {
  type IndexWriteSession,
  type IndexWriteSessionMetadata,
  type ReferenceFactsWrite,
} from '../../../src/domain/ports/graph-store.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { SymbolSpace } from '../../../src/domain/value-objects/symbol-reference.js'
import { readStorageGeneration } from '../../../src/infrastructure/storage-generation.js'
import { readInstalledCodeGraphVersion } from '../../../src/application/use-cases/_shared/installed-code-graph-version.js'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { GraphStorageRecoveryRequiredError } from '../../../src/domain/errors/graph-storage-recovery-required-error.js'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'

const makeMockRepo = makeMockSpecRepository

function makeConfig(projectRoot: string, codeRoot: string): SpecdConfig {
  return {
    projectRoot,
    configPath: projectRoot,
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'fixture',
        specsPath: join(projectRoot, 'specs'),
        specsAdapter: { adapter: 'fs', config: { path: join(projectRoot, 'specs') } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: join(projectRoot, 'changes'),
      changesAdapter: { adapter: 'fs', config: { path: join(projectRoot, 'changes') } },
      draftsPath: join(projectRoot, 'drafts'),
      draftsAdapter: { adapter: 'fs', config: { path: join(projectRoot, 'drafts') } },
      discardedPath: join(projectRoot, 'discarded'),
      discardedAdapter: { adapter: 'fs', config: { path: join(projectRoot, 'discarded') } },
      archivePath: join(projectRoot, 'archive'),
      archiveAdapter: { adapter: 'fs', config: { path: join(projectRoot, 'archive') } },
    },
    approvals: { spec: false, signoff: false },
  } as SpecdConfig
}

describe('IndexProjectGraph integration', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('indexes after a forced logical rebuild without recreating healthy storage', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-force-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })

    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()
    const generationBefore = readStorageGeneration(tempDir)

    const graphConfig = {
      projectRoot: tempDir,
      workspaces: new Map(),
      excludePaths: [],
      includePaths: [],
      concurrency: 4,
    }

    const result = await new IndexProjectGraph().execute({
      provider,
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'default',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig,
      codeGraphVersion: '1.0.0',
      force: true,
    })

    expect(result.filesIndexed).toBe(0)
    expect(result.fullRebuild).toBe(true)
    expect(result.fullRebuildReason).toBe('Forced logical graph reindex requested by indexing')
    const generationAfter = readStorageGeneration(tempDir)
    expect(generationAfter.token).toBe(generationBefore.token)
    await expect(provider.getStatistics()).resolves.toEqual(
      expect.objectContaining({ fileCount: 0 }),
    )

    await provider.close()
  })

  it('reprojects SQLite coverage when only a real spec-lock implementation changes', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-sidecar-coverage-'))
    const codeRoot = join(tempDir, 'workspace')
    const specsPath = join(tempDir, 'specs')
    const metadataPath = join(tempDir, '.specd', 'metadata')
    const specPath = join(specsPath, 'coverage')
    mkdirSync(codeRoot, { recursive: true })
    mkdirSync(metadataPath, { recursive: true })
    mkdirSync(specPath, { recursive: true })
    writeFileSync(join(codeRoot, 'first.ts'), 'export function first(): void {}\n')
    writeFileSync(join(codeRoot, 'second.ts'), 'export function second(): void {}\n')
    writeFileSync(join(specPath, 'spec.md'), '# Coverage fixture\n')
    writeFileSync(
      join(specPath, 'spec-lock.json'),
      JSON.stringify(
        {
          schema: { name: 'schema-std', version: 1 },
          dependsOn: [],
          implementation: [
            { file: 'fixture:first.ts' },
            { file: 'fixture:first.ts', symbols: ['first'] },
          ],
        },
        null,
        2,
      ),
    )

    const specRepo = createSpecRepository(
      'fs',
      {
        workspace: 'fixture',
        ownership: 'owned',
        isExternal: false,
        configPath: tempDir,
      },
      { path: specsPath, metadataPath },
    )
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const adapter = new TypeScriptLanguageAdapter()
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const analyzeFile = vi.spyOn(adapter, 'analyzeFile')
    const indexer = new IndexCodeGraph(store, registry)
    const options = {
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo,
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
      graphConfig: { includePaths: [], excludePaths: [], workspaces: new Map() },
      codeGraphVersion: readInstalledCodeGraphVersion(),
    }

    await indexer.execute(options)
    await expect(store.getCoveredFiles('fixture:coverage')).resolves.toEqual([
      expect.objectContaining({ target: 'fixture:first.ts' }),
    ])
    await expect(store.getCoveredSymbols('fixture:coverage')).resolves.toEqual([
      expect.objectContaining({ target: expect.stringMatching(/^logical\\|/) }),
    ])

    analyzeFile.mockClear()
    writeFileSync(
      join(specPath, 'spec-lock.json'),
      JSON.stringify(
        {
          schema: { name: 'schema-std', version: 1 },
          dependsOn: [],
          implementation: [
            { file: 'fixture:second.ts' },
            { file: 'fixture:second.ts', symbols: ['second'] },
          ],
        },
        null,
        2,
      ),
    )

    const incremental = await indexer.execute(options)

    expect(incremental.filesIndexed).toBe(0)
    expect(analyzeFile).not.toHaveBeenCalled()
    await expect(store.getCoveredFiles('fixture:coverage')).resolves.toEqual([
      expect.objectContaining({ target: 'fixture:second.ts' }),
    ])
    await expect(store.getCoveredSymbols('fixture:coverage')).resolves.toEqual([
      expect.objectContaining({ target: expect.stringMatching(/^logical\\|/) }),
    ])
    await expect(store.getCoveredFiles('fixture:coverage')).resolves.not.toEqual([
      expect.objectContaining({ target: 'fixture:first.ts' }),
    ])
    await store.close()
  })

  it('indexes and searches conservative reference facts across supported languages', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-references-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(join(codeRoot, 'ts'), { recursive: true })
    mkdirSync(join(codeRoot, 'python', 'pkg'), { recursive: true })
    mkdirSync(join(codeRoot, 'go'), { recursive: true })
    mkdirSync(join(codeRoot, 'php'), { recursive: true })
    writeFileSync(
      join(codeRoot, 'ts', 'index.ts'),
      "export { Service as PublicService } from './service.js'\n",
    )
    writeFileSync(join(codeRoot, 'ts', 'service.ts'), 'export class Service { run(): void {} }\n')
    writeFileSync(
      join(codeRoot, 'ts', 'other-service.ts'),
      'export class OtherService { run(): void {} }\n',
    )
    writeFileSync(
      join(codeRoot, 'ts', 'conflict.ts'),
      "export { Service as Shared } from './service.js'\nexport { OtherService as Shared } from './other-service.js'\n",
    )
    writeFileSync(join(codeRoot, 'ts', 'base.ts'), 'export class BaseService { run(): void {} }\n')
    writeFileSync(
      join(codeRoot, 'ts', 'child.ts'),
      "import { BaseService } from './base.js'\nexport class ChildService extends BaseService { run(): void {} }\n",
    )
    writeFileSync(
      join(codeRoot, 'ts', 'route-consumer.ts'),
      "import { PublicService } from './index.js'\nexport function route(): PublicService { return new PublicService() }\n",
    )
    writeFileSync(
      join(codeRoot, 'ts', 'direct-consumer.ts'),
      "import { Service } from './service.js'\nexport function direct(): Service { return new Service() }\n",
    )
    writeFileSync(
      join(codeRoot, 'python', 'pkg', '__init__.py'),
      'from .models import Model as PublicModel\nclass PythonService:\n    pass\n',
    )
    writeFileSync(
      join(codeRoot, 'go', 'service.go'),
      'package service\n\ntype Base struct{}\ntype GoService struct { Base }\nfunc (GoService) Run() {}\n',
    )
    writeFileSync(
      join(codeRoot, 'php', 'Service.php'),
      '<?php\nnamespace App;\nuse Vendor\\Package\\Canonical as Alias;\ntrait Shared { public function run(): void {} }\nclass PhpService { use Shared; }\n',
    )

    const provider = createCodeGraphProvider(makeConfig(tempDir, codeRoot))
    await provider.open()
    const result = await provider.index({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        excludePaths: [],
        workspaces: new Map(),
      },
      codeGraphVersion: readInstalledCodeGraphVersion(),
    })

    expect(result.filesIndexed).toBe(11)
    expect(result.errors).toEqual([])
    expect((await provider.getStatistics()).relationCounts.OVERRIDES).toBeGreaterThanOrEqual(1)

    const expectedNames = ['Service', 'PythonService', 'GoService', 'PhpService']
    const groupedNames = await Promise.all(
      expectedNames.map(async (expectedName) => {
        const serviceResults = await provider.searchReferenceSymbols({ query: expectedName })
        return serviceResults.find((item) =>
          item.hits.some((hit) => hit.symbol.name === expectedName),
        )?.logicalTarget?.name
      }),
    )
    expect(groupedNames).toEqual(expectedNames)

    const memberResults = await provider.searchReferenceSymbols({ query: 'Run' })
    expect(memberResults.some((item) => item.logicalTarget?.name === 'Run')).toBe(true)

    const exportedResults = await provider.searchReferenceSymbols({ query: 'PythonService' })
    expect(
      exportedResults.flatMap((item) => item.publicBindings.map((binding) => binding.exportedName)),
    ).not.toContain('PythonService')

    const publicServiceResults = await provider.searchReferenceSymbols({
      query: 'PublicService',
    })
    const publicBinding = publicServiceResults
      .flatMap((item) => item.publicBindings)
      .find((binding) => binding.exportedName === 'PublicService')
    expect(publicBinding).toBeDefined()
    const publicResolution = await provider.resolveSymbolReference({
      workspace: 'fixture',
      requested: 'PublicService',
      publicSurface: 'fixture:ts/index.ts',
    })
    expect(publicResolution.status).toBe('resolved')
    const publicCandidate = publicResolution.candidates[0]
    expect(publicCandidate).toBeDefined()
    const health = await provider.getGraphHealth()
    const competingResolution = await provider.resolveSymbolReference(
      {
        workspace: 'fixture',
        requested: 'Shared',
        publicSurface: 'fixture:ts/conflict.ts',
        symbolSpace: SymbolSpace.Type,
      },
      {
        ...health,
        stale: false,
        fingerprintMismatch: false,
        contentFresh: true,
        coverageComplete: true,
        reasonCodes: [],
      },
    )
    expect(competingResolution.status).toBe('ambiguous')
    expect(competingResolution.candidates.map(({ target }) => target.name).sort()).toEqual([
      'OtherService',
      'Service',
    ])
    const projectRelativeResolution = await provider.resolveSymbolReference({
      workspace: 'different-spec-workspace',
      requested: 'Service',
      filePath: 'workspace/ts/service.ts',
    })
    expect(projectRelativeResolution.status).toBe('resolved')
    expect(projectRelativeResolution.request.workspace).toBe('fixture')
    expect(projectRelativeResolution.request.filePath).toBe('fixture:ts/service.ts')
    const publicImpact = await provider.analyzePublicBindingImpact(
      {
        binding: publicBinding!,
        target: publicCandidate!.target,
        declarations: publicCandidate!.declarations,
        path: publicResolution.path,
      },
      'upstream',
    )
    const canonicalImpact = await provider.analyzeImpact(
      publicCandidate!.declarations[0]!.symbolId,
      'upstream',
    )
    expect(publicImpact.canonicalImpact.affectedSymbols).toEqual(canonicalImpact.affectedSymbols)
    expect(publicImpact.binding.id).toBe(publicBinding!.id)
    expect(publicImpact.target.id).toBe(publicCandidate!.target.id)
    expect(publicImpact.bindingImpact.affectedSymbols.map((symbol) => symbol.name)).toContain(
      'route',
    )
    expect(publicImpact.canonicalImpact.affectedSymbols.map((symbol) => symbol.name)).toContain(
      'direct',
    )

    const phpAlias = await provider.resolveSymbolReference({
      workspace: 'fixture',
      requested: 'Alias',
      filePath: 'fixture:php/Service.php',
    })
    expect(phpAlias.status).toBe('missing')
    expect(phpAlias.reasonCode).toBe('REFERENCE_ABSENT')
    expect(phpAlias.candidates).toEqual([])

    await provider.close()
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const coverage = await store.findIndexCoverage([
      'fixture:ts/index.ts',
      'fixture:ts/service.ts',
      'fixture:ts/route-consumer.ts',
      'fixture:ts/direct-consumer.ts',
      'fixture:python/pkg/__init__.py',
      'fixture:go/service.go',
      'fixture:php/Service.php',
    ])
    expect(coverage).toHaveLength(7)
    expect(new Set(coverage.map((entry) => entry.status))).toEqual(new Set(['indexed']))
    expect(
      coverage.find((entry) => entry.filePath === 'fixture:php/Service.php')?.capabilities,
    ).not.toContain('publicBindings')
    await store.close()
  })

  it('reprocesses native-store importers when a previously missing target is added', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-added-target-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(
      join(codeRoot, 'importer.ts'),
      "import { target } from './target.js'; export function callTarget(): number { return target() }\n",
    )
    writeFileSync(
      join(codeRoot, 'unrelated.ts'),
      'export function unrelated(): number { return 7 }\n',
    )

    const provider = createCodeGraphProvider(makeConfig(tempDir, codeRoot))
    await provider.open()
    const options = {
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [] as string[],
        excludePaths: [] as string[],
        workspaces: new Map(),
      },
      codeGraphVersion: readInstalledCodeGraphVersion(),
    }
    await provider.index(options)

    writeFileSync(join(codeRoot, 'target.ts'), 'export function target(): number { return 1 }\n')
    const result = await provider.index(options)

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkipped).toBe(2)
    await provider.close()

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await expect(store.getImporters('fixture:target.ts')).resolves.toEqual([
      expect.objectContaining({
        source: 'fixture:importer.ts',
        target: 'fixture:target.ts',
      }),
    ])
    await store.close()
  })

  it('keeps high-cardinality relation construction within a bounded phase budget', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-relation-performance-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    const symbolCount = 2_000
    const names = Array.from({ length: symbolCount }, (_, index) => `target${String(index)}`)
    writeFileSync(
      join(codeRoot, 'targets.ts'),
      names.map((name) => `export function ${name}(): void {}`).join('\n'),
    )
    writeFileSync(
      join(codeRoot, 'consumer.ts'),
      [
        `import { ${names.join(', ')} } from './targets.js'`,
        'export function invokeAll(): void {',
        ...names.map((name) => `  ${name}()`),
        '}',
      ].join('\n'),
    )

    const provider = createCodeGraphProvider(makeConfig(tempDir, codeRoot))
    await provider.open()
    let relationStartedAt: number | undefined
    let relationCompletedAt: number | undefined
    const result = await provider.index({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        excludePaths: [],
        workspaces: new Map(),
      },
      codeGraphVersion: readInstalledCodeGraphVersion(),
      onProgress: (_percent, phase) => {
        if (phase.startsWith('Building relations') && relationStartedAt === undefined) {
          relationStartedAt = performance.now()
        }
        if (phase === 'Discovering specs' && relationStartedAt !== undefined) {
          relationCompletedAt = performance.now()
        }
      },
    })

    expect(result.errors).toEqual([])
    expect(relationStartedAt).toBeDefined()
    expect(relationCompletedAt).toBeDefined()
    expect(relationCompletedAt! - relationStartedAt!).toBeLessThan(5_000)
    expect(result.phaseMetrics.importResolution.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.phaseMetrics.dependencyFacts.count).toBeGreaterThan(0)
    expect(result.phaseMetrics.adapterRelations.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.phaseMetrics.reexports.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.phaseMetrics.hierarchyOverrides.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.phaseMetrics.persistence.count).toBeGreaterThan(0)
    expect(result.phaseMetrics.searchIndexRebuild.durationMs).toBeGreaterThanOrEqual(0)
    const statistics = await provider.getStatistics()
    expect(statistics.relationCounts.CALLS).toBeGreaterThanOrEqual(symbolCount)
    await provider.close()
  }, 15_000)

  it('routes one complete index generation through one native bulk session', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-single-session-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(join(codeRoot, 'api.ts'), 'export function indexedOnce(): void {}\n')

    class SessionOnlySQLiteStore extends SQLiteGraphStore {
      beginCount = 0

      override beginBulkIndexSession(metadata?: IndexWriteSessionMetadata): IndexWriteSession {
        this.beginCount += 1
        return super.beginBulkIndexSession(metadata)
      }

      override bulkLoad(_data: Parameters<SQLiteGraphStore['bulkLoad']>[0]): Promise<void> {
        return Promise.reject(new Error('legacy bulkLoad must not be called'))
      }

      override addRelations(_relations: Relation[]): Promise<void> {
        return Promise.reject(new Error('legacy addRelations must not be called'))
      }

      override replaceReferenceFacts(_facts: ReferenceFactsWrite): Promise<void> {
        return Promise.reject(new Error('legacy replaceReferenceFacts must not be called'))
      }

      override rebuildFtsIndexes(): Promise<void> {
        return Promise.reject(new Error('legacy rebuildFtsIndexes must not be called'))
      }
    }

    const store = new SessionOnlySQLiteStore(tempDir)
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'session-only',
      graphStoreFactories: { 'session-only': { create: () => store } },
    })
    await provider.open()
    const result = await provider.index({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: { includePaths: [], excludePaths: [], workspaces: new Map() },
      codeGraphVersion: readInstalledCodeGraphVersion(),
    })

    expect(result.errors).toEqual([])
    expect(store.beginCount).toBe(1)
    expect(await provider.searchReferenceSymbols({ query: 'indexedOnce' })).toHaveLength(1)
    await provider.close()
  })

  it('classifies absent references as unresolved while indexed content is dirty', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-dirty-reference-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    const sourcePath = join(codeRoot, 'service.ts')
    writeFileSync(sourcePath, 'export class BeforeRename {}\n')
    writeFileSync(join(codeRoot, 'asset.bin'), new Uint8Array([0, 1, 2, 3]))
    execFileSync('git', ['init'], { cwd: tempDir })
    execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: tempDir })
    execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: tempDir })
    execFileSync('git', ['add', 'workspace/service.ts', 'workspace/asset.bin'], { cwd: tempDir })
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: tempDir })
    const indexedRef = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim()

    const projectConfig = makeConfig(tempDir, codeRoot)
    const specRepo = makeMockRepo()
    Object.defineProperty(specRepo, 'specsPath', {
      value: join(tempDir, 'specs'),
      configurable: true,
    })
    const provider = createCodeGraphProvider(projectConfig)
    await provider.open()
    await provider.index({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      vcsRef: indexedRef.slice(0, 7),
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: buildProjectGraphConfig(projectConfig),
      codeGraphVersion: readInstalledCodeGraphVersion(),
    })

    const justIndexedHealth = await provider.getGraphHealth()
    expect(justIndexedHealth.contentFresh).toBe(true)
    expect(justIndexedHealth.reasonCodes).not.toContain('CONTENT_DIRTY')
    expect(justIndexedHealth.workspaces[0]?.reasons).not.toContain('FILESET_CHANGED')

    writeFileSync(sourcePath, 'export class AfterRename {}\n')
    const [batchResult] = await provider.resolveSymbolReferences(
      [
        {
          workspace: 'fixture',
          requested: 'BeforeRename',
          filePath: 'fixture:service.ts',
        },
      ],
      justIndexedHealth,
    )

    expect(batchResult?.status).toBe('unresolved')
    expect(batchResult?.target).toBeNull()

    const health = await provider.getGraphHealth()
    const result = await provider.resolveSymbolReference(
      {
        workspace: 'fixture',
        requested: 'AfterRename',
        filePath: 'fixture:service.ts',
      },
      health,
    )

    expect(result.status).toBe('unresolved')
    expect(health.contentFresh).toBe(false)
    expect(health.reasonCodes).toContain('CONTENT_KNOWN_STALE')
    expect(result.health.reasonCodes).toContain('CONTENT_KNOWN_STALE')

    await provider.index({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      vcsRef: indexedRef.slice(0, 7),
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: buildProjectGraphConfig(projectConfig),
      codeGraphVersion: readInstalledCodeGraphVersion(),
    })
    const refreshedHealth = await provider.getGraphHealth()
    expect(refreshedHealth.contentFresh).toBe(true)
    expect(refreshedHealth.fingerprintMismatch).toBe(false)
    expect(refreshedHealth.reasonCodes).not.toContain('CONTENT_DIRTY')
    expect(refreshedHealth.reasonCodes).not.toContain('DERIVATION_UNKNOWN')
    await provider.close()
  })

  it('surfaces incompatible SQLite reads until closed storage is explicitly recreated', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-incompatible-'))
    const codeRoot = join(tempDir, 'workspace')
    const graphRoot = join(tempDir, 'graph')
    mkdirSync(codeRoot, { recursive: true })
    mkdirSync(graphRoot, { recursive: true })
    writeFileSync(join(codeRoot, 'api.ts'), 'export function rebuiltSearchTarget() {}\n')
    writeFileSync(join(tempDir, '.gitignore'), 'graph/\ntmp/\nstorage-generation.json\n')
    execFileSync('git', ['init'], { cwd: tempDir })
    execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: tempDir })
    execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: tempDir })
    execFileSync('git', ['add', '.gitignore', 'workspace/api.ts'], { cwd: tempDir })
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: tempDir })
    const indexedRef = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim()

    const oldDatabase = new Database(join(graphRoot, 'code-graph.sqlite'))
    oldDatabase.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    oldDatabase.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schemaVersion', '5')
    oldDatabase.close()

    const readProvider = createCodeGraphProvider(makeConfig(tempDir, codeRoot))
    const openError = await readProvider.open().catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(GraphStorageRecoveryRequiredError)
    expect(openError).toMatchObject(
      expect.objectContaining({
        message: expect.stringContaining('SQLite graph storage schema 5 is incompatible'),
      }),
    )
    expect((openError as GraphStorageRecoveryRequiredError).reason).toBe('SCHEMA_INCOMPATIBLE')
    const generationBefore = readStorageGeneration(tempDir)

    await readProvider.recreate()
    const generationAfter = readStorageGeneration(tempDir)
    expect(generationAfter.token).not.toBe(generationBefore.token)
    await readProvider.open()

    const indexResult = await readProvider.index({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      vcsRef: indexedRef.slice(0, 7),
      workspaces: [
        {
          name: 'fixture',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        excludePaths: [],
        workspaces: new Map(),
      },
      codeGraphVersion: readInstalledCodeGraphVersion(),
    })
    expect(indexResult.filesIndexed).toBe(1)
    expect(indexResult.errors).toEqual([])
    const rebuiltSearch = await readProvider.searchReferenceSymbols({
      query: 'rebuiltSearchTarget',
    })
    expect(rebuiltSearch[0]?.logicalTarget?.name).toBe('rebuiltSearchTarget')
    await expect(readProvider.getStatistics()).resolves.toEqual(
      expect.objectContaining({ fileCount: 1 }),
    )
    await expect(readProvider.getGraphHealth()).resolves.toEqual(
      expect.objectContaining({
        stale: false,
        contentFresh: true,
        coverageComplete: true,
      }),
    )
    await readProvider.close()
  })
})
