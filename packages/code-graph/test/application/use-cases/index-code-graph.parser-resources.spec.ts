import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
} from '../../../src/domain/value-objects/language-adapter.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'
import { type IndexEvent } from '../../../src/domain/value-objects/index-event.js'

function createWorkspace(
  baseDir: string,
  name: string,
  files: Record<string, string | Buffer>,
): string {
  const wsDir = join(baseDir, name)
  mkdirSync(wsDir, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(wsDir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return wsDir
}

describe('IndexCodeGraph - parser resource lifecycle', () => {
  let tempDir: string
  let store: GraphStore

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-parser-res-'))
    store = new InMemoryGraphStore(tempDir)
    await store.open()
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('closes parser resource epoch after each file, keeping scope.size <= 1 at all times', async () => {
    const observedSizes: number[] = []
    let disposalsCount = 0

    const trackingAdapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        observedSizes.push(context.session.parserResources.size)
        const fakeAst = { astId: filePath }
        context.session.parserResources.register(fakeAst, () => {
          disposalsCount++
        })
        observedSizes.push(context.session.parserResources.size)
        return {
          language: 'test-lang',
          symbols: [],
          imports: [],
          bindingFacts: [],
          callFacts: [],
        }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }

    const registry = new AdapterRegistry()
    registry.register(trackingAdapter)

    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/f1.tst': 'let a = 1',
      'src/f2.tst': 'let b = 2',
      'src/f3.tst': 'let c = 3',
      'src/f4.tst': 'let d = 4',
    })

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
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesIndexed).toBe(4)
    expect(disposalsCount).toBe(4)
    // At the start of analyzeFile, scope.size was 0. After register, size was 1. Never > 1.
    expect(observedSizes).toEqual([0, 1, 0, 1, 0, 1, 0, 1])
  })

  it('keeps retention bounded across several chunks', async () => {
    // Given an adapter that registers a resource per file and a budget that forces many chunks
    const startSizes: number[] = []
    let peak = 0
    let disposed = 0
    let registered = 0
    const adapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        startSizes.push(context.session.parserResources.size)
        registered++
        context.session.parserResources.register({ astId: filePath }, () => {
          disposed++
        })
        peak = Math.max(peak, context.session.parserResources.size)
        return {
          language: 'test-lang',
          symbols: [],
          imports: [],
          bindingFacts: [],
          callFacts: [],
        }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const files: Record<string, string> = {}
    for (let i = 0; i < 12; i++) files[`src/f${String(i)}.tst`] = `let v${String(i)} = 1`
    const wsDir = createWorkspace(tempDir, 'ws', files)
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    // When the run uses a budget of one file per chunk
    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
      chunkBytes: 1,
    })

    // Then every file was analysed with an empty scope and nothing outlives its file
    expect(result.filesIndexed).toBe(12)
    expect(registered).toBe(12)
    expect(disposed).toBe(12)
    expect(peak).toBe(1)
    expect(startSizes.every((size) => size === 0)).toBe(true)
  })

  it('closes the epoch even when an adapter throws during analyzeFile and continues indexing', async () => {
    let disposals = 0

    const failingAdapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        context.session.parserResources.register({ ast: 1 }, () => {
          disposals++
        })
        if (filePath.includes('fail.tst')) {
          throw new Error('parse error on fail.tst')
        }
        return {
          language: 'test-lang',
          symbols: [],
          imports: [],
          bindingFacts: [],
          callFacts: [],
        }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }

    const registry = new AdapterRegistry()
    registry.register(failingAdapter)

    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/ok1.tst': 'ok 1',
      'src/fail.tst': 'fail',
      'src/ok2.tst': 'ok 2',
    })

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
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesIndexed).toBe(2)
    // console.log errors
    expect(result.errors.find((e) => e.message.includes('fail.tst'))).toBeDefined()
    expect(disposals).toBe(3) // All 3 files registered and closed their epoch
  })

  it('surfaces disposal failure events through onEvent without failing the run', async () => {
    const events: IndexEvent[] = []

    const failingDisposerAdapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        context.session.parserResources.register({ fake: true }, () => {
          throw new Error('disposal crash in native binding')
        })
        return {
          language: 'test-lang',
          symbols: [],
          imports: [],
          bindingFacts: [],
          callFacts: [],
        }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }

    const registry = new AdapterRegistry()
    registry.register(failingDisposerAdapter)

    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/file.tst': 'content',
    })

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
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
      onEvent: (event) => events.push(event),
    })

    expect(result.filesIndexed).toBe(1)
    const disposalFailures = events.filter((e) => e.kind === 'resource-disposal-failed')
    expect(disposalFailures).toHaveLength(1)
    expect(disposalFailures[0]).toEqual({
      kind: 'resource-disposal-failed',
      filePath: 'ws:src/file.tst',
      message: 'disposal crash in native binding',
    })
  })

  it('leaves no residue from files that exit early (document, binary content, oversized)', async () => {
    // Given an adapter that registers a resource for every file it analyses
    const startSizes: number[] = []
    let disposals = 0
    let analysed = 0
    const adapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        _filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        analysed++
        startSizes.push(context.session.parserResources.size)
        context.session.parserResources.register({ ast: analysed }, () => {
          disposals++
        })
        return { language: 'test-lang', symbols: [], imports: [], bindingFacts: [], callFacts: [] }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)

    // And files that never reach the adapter: a document, undecodable content and an oversized file
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/a.tst': 'one',
      'notes/readme.txt': 'plain document',
      'data/blob.dat': Buffer.from([0, 1, 2, 0, 255, 254, 0, 0, 1]),
      'src/huge.tst': 'x'.repeat(300 * 1024),
      'src/b.tst': 'two',
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    // When the project is indexed
    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    // Then only the two small files were analysed, each starting from an empty scope and disposed
    expect(result.filesSkippedForSize).toBe(1)
    expect(analysed).toBe(2)
    expect(startSizes).toEqual([0, 0])
    expect(disposals).toBe(2)
  })

  it('releases every parser resource when the run fails while persisting', async () => {
    // Given a store whose bulk load fails after the analysis has finished
    class FailingBulkLoadStore extends InMemoryGraphStore {
      override async bulkLoad(): Promise<void> {
        throw new Error('persistence failure')
      }
    }
    const failingStore = new FailingBulkLoadStore(tempDir)
    await failingStore.open()

    let capturedScopeSize = -1
    let capturedScope: { readonly size: number } | undefined
    let disposals = 0
    const adapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        _filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        capturedScope = context.session.parserResources
        context.session.parserResources.register({ ast: 1 }, () => {
          disposals++
        })
        return { language: 'test-lang', symbols: [], imports: [], bindingFacts: [], callFacts: [] }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const wsDir = createWorkspace(tempDir, 'ws', { 'src/a.tst': 'one', 'src/b.tst': 'two' })
    const indexer = new IndexCodeGraph(
      failingStore,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    // When the run is executed
    await expect(
      indexer.execute({
        projectRoot: tempDir,
        vcsRoot: null,
        workspaces: [
          {
            name: 'ws',
            prefix: null,
            codeRoot: wsDir,
            isExternal: false,
            ownership: 'owned' as const,
            specRepo: makeMockSpecRepository(),
          },
        ],
        graphConfig: {},
      }),
    ).rejects.toThrow()

    // Then nothing parser-owned remains reachable from the session
    capturedScopeSize = capturedScope?.size ?? -1
    expect(capturedScopeSize).toBe(0)
    expect(disposals).toBe(2)
    await failingStore.close()
  })

  it('closes the epoch when a callback throws in the middle of the run (cancellation)', async () => {
    // Given 60 files and an adapter that counts registrations and disposals
    let registered = 0
    let disposals = 0
    let sessionScope: { readonly size: number } | undefined
    const adapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        _filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        sessionScope = context.session.parserResources
        registered++
        context.session.parserResources.register({ ast: registered }, () => {
          disposals++
        })
        return { language: 'test-lang', symbols: [], imports: [], bindingFacts: [], callFacts: [] }
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const files: Record<string, string> = {}
    for (let i = 0; i < 60; i++) files[`src/f${String(i).padStart(2, '0')}.tst`] = `file ${i}`
    const wsDir = createWorkspace(tempDir, 'ws', files)
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    // When the progress callback aborts the run at the 50th file
    await expect(
      indexer.execute({
        projectRoot: tempDir,
        vcsRoot: null,
        workspaces: [
          {
            name: 'ws',
            prefix: null,
            codeRoot: wsDir,
            isExternal: false,
            ownership: 'owned' as const,
            specRepo: makeMockSpecRepository(),
          },
        ],
        graphConfig: {},
        onProgress: (_percent, phase) => {
          if (phase.includes('50/')) throw new Error('aborted by host')
        },
      }),
    ).rejects.toThrow('aborted by host')

    // Then every resource that was registered has been disposed and nothing is retained
    expect(registered).toBe(49)
    expect(disposals).toBe(49)
    expect(sessionScope?.size).toBe(0)
  })

  it('reports the original analysis error when a disposal also fails', async () => {
    // Given an adapter whose analysis throws after registering a resource whose disposal throws
    const adapter: LanguageAdapter = {
      languages: () => ['test-lang'],
      extensions: () => ({ '.tst': 'test-lang' }),
      resolutionManifests: () => [],
      analyzeFile: (
        _filePath: string,
        _content: string,
        context: AdapterAnalyzeContext,
      ): FileAnalysisDraft => {
        context.session.parserResources.register({ ast: 1 }, () => {
          throw new Error('disposal boom')
        })
        throw new Error('analysis boom')
      },
      resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
      buildRelations: () => [],
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const wsDir = createWorkspace(tempDir, 'ws', { 'src/a.tst': 'one' })
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    const events: IndexEvent[] = []

    // When the file is indexed
    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
      onEvent: (event) => events.push(event),
    })

    // Then the file error is the analysis error and the disposal failure is only an event
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain('analysis boom')
    expect(result.errors[0]?.message).not.toContain('disposal boom')
    expect(events).toContainEqual({
      kind: 'resource-disposal-failed',
      filePath: 'ws:src/a.tst',
      message: 'disposal boom',
    })
  })

  it('contains zero occurrences of napi-keepalive in tree-sitter adapters or code-graph src', () => {
    const treeSitterDir = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../../src/infrastructure/tree-sitter',
    )
    const files = readdirSync(treeSitterDir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = readFileSync(join(treeSitterDir, file), 'utf-8')
      expect(content).not.toContain('napi-keepalive')
      expect(content).not.toContain('keepAlive')
    }
  })
})
