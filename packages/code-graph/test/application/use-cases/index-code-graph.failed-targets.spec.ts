import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { computeContentHash } from '../../../src/application/use-cases/compute-content-hash.js'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'
import { IndexCoverageStatus } from '../../../src/domain/value-objects/index-session.js'
import { IndexedResourceKind } from '../../../src/domain/value-objects/indexed-input-freshness.js'

describe('IndexCodeGraph - failed targets and freshness', () => {
  let tempDir: string
  let store: GraphStore
  let wsDir: string
  let analysed: string[]
  let failing: Set<string>
  let failingImports: Set<string>
  let specRepo = makeMockSpecRepository()

  const adapter: LanguageAdapter = {
    languages: () => ['test-lang'],
    extensions: () => ({ '.tst': 'test-lang' }),
    resolutionManifests: () => [],
    analyzeFile: (filePath: string): FileAnalysisDraft => {
      analysed.push(filePath)
      if ([...failing].some((name) => filePath.endsWith(name))) throw new Error('analysis boom')
      return { language: 'test-lang', symbols: [], imports: [], bindingFacts: [], callFacts: [] }
    },
    resolveImports: (analysis) => {
      if ([...failingImports].some((name) => analysis.filePath.endsWith(name)))
        throw new Error('import boom')
      return { importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }
    },
    buildRelations: () => [],
  }

  const run = async (force = false): Promise<Awaited<ReturnType<IndexCodeGraph['execute']>>> => {
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    return indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo,
        },
      ],
      graphConfig: {},
      ...(force ? { force: true } : {}),
    })
  }

  const observedIds = async (): Promise<string[]> => {
    const observations = await store.getIndexedInputObservations([
      { workspace: 'ws', resourceKind: IndexedResourceKind.File, resourceId: 'ws:src/good.tst' },
      { workspace: 'ws', resourceKind: IndexedResourceKind.File, resourceId: 'ws:src/bad.tst' },
    ])
    return observations.map((observation) => observation.resourceId)
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-failed-targets-'))
    wsDir = join(tempDir, 'ws')
    mkdirSync(join(wsDir, 'src'), { recursive: true })
    writeFileSync(join(wsDir, 'src', 'good.tst'), 'let a = 1')
    writeFileSync(join(wsDir, 'src', 'bad.tst'), 'let b = 2')
    store = new InMemoryGraphStore(tempDir)
    await store.open()
    analysed = []
    failing = new Set(['bad.tst'])
    failingImports = new Set()
    specRepo = makeMockSpecRepository()
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('does not keep the graph stale because a file fails, and leaves that file without an observation', async () => {
    // Given a graph whose latches are set
    await store.markWorkspacesAndGraphStaleSinceLastIndex(['ws'])

    // When a run completes with one failing file
    const result = await run()

    // Then the failure is an error and parse-failed coverage, and the latches are cleared
    expect(result.errors.map((error) => error.filePath)).toEqual(['ws:src/bad.tst'])
    const [coverage] = await store.findIndexCoverage(['ws:src/bad.tst'])
    expect(coverage?.status).toBe(IndexCoverageStatus.ParseFailed)
    const latches = await store.getFreshnessLatches(['ws'])
    expect(latches.graph).toBe(false)
    expect(latches.workspaces.ws).toBe(false)
    // And only the file that was produced has an observation
    expect(await observedIds()).toEqual(['ws:src/good.tst'])
  })

  it('retries a failed file on a normal run, even though its content did not change', async () => {
    // Given a first run in which one file failed
    await run()
    analysed = []

    // When a second normal run executes and the file still fails
    const second = await run()

    // Then only the failed file is analysed again and the failure stays reported
    expect(analysed.filter((path) => path.endsWith('bad.tst'))).toHaveLength(1)
    expect(analysed.filter((path) => path.endsWith('good.tst'))).toHaveLength(0)
    expect(second.errors.map((error) => error.filePath)).toEqual(['ws:src/bad.tst'])
  })

  it('replaces the failure with the normal outcome when the retry succeeds', async () => {
    // Given a first run in which one file failed
    await run()

    // When the cause is gone and a normal run executes
    failing = new Set()
    const second = await run()

    // Then the file is no longer a failure and has an observation
    expect(second.errors).toEqual([])
    const [coverage] = await store.findIndexCoverage(['ws:src/bad.tst'])
    expect(coverage?.status).not.toBe(IndexCoverageStatus.ParseFailed)
    expect((await observedIds()).sort()).toEqual(['ws:src/bad.tst', 'ws:src/good.tst'])
  })

  it('retries a pass-2 failure as parse-failed, without an observation', async () => {
    // Given a file whose import resolution throws
    failing = new Set()
    failingImports = new Set(['bad.tst'])

    // When the run completes and a second normal run executes
    const first = await run()
    const [coverage] = await store.findIndexCoverage(['ws:src/bad.tst'])
    analysed = []
    await run()

    // Then it is an error and parse-failed, has no observation, and is retried
    expect(first.errors.map((error) => error.filePath)).toEqual(['ws:src/bad.tst'])
    expect(coverage?.status).toBe(IndexCoverageStatus.ParseFailed)
    expect(await observedIds()).toEqual(['ws:src/good.tst'])
    expect(analysed.filter((path) => path.endsWith('bad.tst'))).toHaveLength(1)
  })

  it('records the identifier of a failing spec and gives it no observation', async () => {
    // Given a spec whose artifact cannot be read
    const spec = makeSpec({ workspace: 'ws', name: 'broken/spec', filenames: ['spec.md'] })
    const base = makeMockSpecRepository([spec])
    specRepo = new Proxy(base, {
      get: (target, property) =>
        property === 'artifact'
          ? async () => {
              throw new Error('spec boom')
            }
          : (Reflect.get(target, property) as unknown),
    })
    await store.markWorkspacesAndGraphStaleSinceLastIndex(['ws'])

    // When the run completes
    const result = await run()

    // Then the error uses the spec identifier, the latches are cleared, and no spec observation exists
    expect(result.errors.map((error) => error.filePath)).toContain('ws:broken/spec')
    expect((await store.getFreshnessLatches(['ws'])).graph).toBe(false)
    const specObservations = await store.getIndexedInputObservations([
      { workspace: 'ws', resourceKind: IndexedResourceKind.Spec, resourceId: 'ws:broken/spec' },
    ])
    expect(specObservations).toEqual([])
  })

  it('retries a failing file on a forced run and keeps it without an observation', async () => {
    await run()
    analysed = []

    const forced = await run(true)

    expect(analysed.filter((path) => path.endsWith('bad.tst'))).toHaveLength(1)
    expect(forced.errors.map((error) => error.filePath)).toEqual(['ws:src/bad.tst'])
    expect(await observedIds()).toEqual(['ws:src/good.tst'])
  })

  it('records the hash of the content read on a forced run', async () => {
    // Given an indexed workspace in which a file changes and another one appears
    failing = new Set()
    await run()
    writeFileSync(join(wsDir, 'src', 'good.tst'), 'let a = 100')
    writeFileSync(join(wsDir, 'src', 'extra.tst'), 'let c = 3')

    // When a forced run executes
    await run(true)

    // Then each observation carries the hash of the content that run read
    const observations = await store.getIndexedInputObservations([
      { workspace: 'ws', resourceKind: IndexedResourceKind.File, resourceId: 'ws:src/good.tst' },
      { workspace: 'ws', resourceKind: IndexedResourceKind.File, resourceId: 'ws:src/extra.tst' },
    ])
    const byId = new Map(observations.map((o) => [o.resourceId, o.indexedContentHash]))
    expect(byId.get('ws:src/good.tst')).toBe(computeContentHash('let a = 100'))
    expect(byId.get('ws:src/extra.tst')).toBe(computeContentHash('let c = 3'))
  })

  it('reports a file that cannot be read for hashing once and as parse-failed', async () => {
    // Given a file without read permission
    failing = new Set()
    chmodSync(join(wsDir, 'src', 'bad.tst'), 0o000)

    // When the run completes
    const result = await run()
    chmodSync(join(wsDir, 'src', 'bad.tst'), 0o644)

    // Then there is one error for that path and its coverage is parse-failed
    expect(result.errors.filter((error) => error.filePath === 'ws:src/bad.tst')).toHaveLength(1)
    const [coverage] = await store.findIndexCoverage(['ws:src/bad.tst'])
    expect(coverage?.status).toBe(IndexCoverageStatus.ParseFailed)
  })

  it('keeps the latches and the previous observations when the run does not commit', async () => {
    // Given an indexed workspace with its latches set
    failing = new Set()
    await run()
    await store.markWorkspacesAndGraphStaleSinceLastIndex(['ws'])
    writeFileSync(join(wsDir, 'src', 'good.tst'), 'let a = 99')
    const original = store.beginBulkIndexSession.bind(store)
    store.beginBulkIndexSession = () => {
      throw new Error('store failure')
    }

    // When the commit fails
    await expect(run()).rejects.toThrow('store failure')
    store.beginBulkIndexSession = original

    // Then the latches and the previous observations are unchanged
    const latches = await store.getFreshnessLatches(['ws'])
    expect(latches.graph).toBe(true)
    expect(latches.workspaces.ws).toBe(true)
    expect((await observedIds()).sort()).toEqual(['ws:src/bad.tst', 'ws:src/good.tst'])
  })
})
