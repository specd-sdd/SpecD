import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
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

describe('IndexCodeGraph - typed indexing events', () => {
  let tempDir: string
  let store: GraphStore
  let registry: AdapterRegistry

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-events-'))
    store = new InMemoryGraphStore(tempDir)
    await store.open()
    registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('emits file-activity and file-skipped events without throttle, and events survive JSON round-trip', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
      'src/too-big.ts': 'export const big = 3;'.padEnd(300 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const events: IndexEvent[] = []

    await indexer.execute({
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
      onEvent: (event) => {
        // Must survive a JSON round-trip without loss
        const roundTripped = JSON.parse(JSON.stringify(event)) as IndexEvent
        expect(roundTripped).toEqual(event)
        events.push(event)
      },
    })

    const skippedEvents = events.filter((e) => e.kind === 'file-skipped')
    expect(skippedEvents).toHaveLength(1)
    expect(skippedEvents[0]).toEqual({
      kind: 'file-skipped',
      filePath: 'ws:src/too-big.ts',
      projectRelativePath: 'ws/src/too-big.ts',
      sizeBytes: 300 * 1024,
      limitBytes: 262144,
      reason: 'file-too-large',
    })

    const activityEvents = events.filter((e) => e.kind === 'file-activity')
    expect(activityEvents).toHaveLength(2) // 2 indexed files
    expect(activityEvents[0]?.kind).toBe('file-activity')
    expect(activityEvents[0]?.index).toBe(1)
    expect(activityEvents[0]?.total).toBe(2)
    expect(activityEvents[1]?.index).toBe(2)
    expect(activityEvents[1]?.total).toBe(2)
  })

  it('swallows throwing onEvent receiver and continues indexing successfully', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/file1.ts': 'export const f1 = 1;',
      'src/file2.ts': 'export const f2 = 2;',
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const throwingReceiver = vi.fn(() => {
      throw new Error('receiver crashed!')
    })

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
      onEvent: throwingReceiver,
    })

    expect(result.filesIndexed).toBe(2)
    expect(throwingReceiver).toHaveBeenCalled()
  })

  it('produces identical result and onProgress calls with or without onEvent', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/f1.ts': 'export const a = 1;',
      'src/f2.ts': 'export const b = 2;',
      'src/f3.ts': 'export const c = 3;',
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const progressWithout: Array<{ percent: number; phase: string }> = []
    const progressWith: Array<{ percent: number; phase: string }> = []

    const baseOptions = {
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
    }

    const resultWithout = await indexer.execute({
      ...baseOptions,
      onProgress: (percent, phase) => progressWithout.push({ percent, phase }),
    })

    // Reset store
    await store.clear()

    const resultWith = await indexer.execute({
      ...baseOptions,
      onProgress: (percent, phase) => progressWith.push({ percent, phase }),
      onEvent: vi.fn(),
    })

    expect(resultWith.filesIndexed).toBe(resultWithout.filesIndexed)
    expect(resultWith.filesDiscovered).toBe(resultWithout.filesDiscovered)
    expect(resultWith.filesSkippedForSize).toBe(resultWithout.filesSkippedForSize)
    expect(progressWith).toEqual(progressWithout)
  })

  it('does not announce a file skipped for size as activity, but announces files the analysis skips', async () => {
    // Given a code file, a document without adapter, undecodable content and an oversized file
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/a.ts': 'export const a = 1;',
      'notes/readme.txt': 'plain document',
      'data/blob.dat': Buffer.from(Array.from({ length: 200 }, (_, i) => (i % 7 === 0 ? 0 : 0x80))),
      'src/too-big.ts': 'export const big = 3;'.padEnd(300 * 1024, ' '),
    })
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    const events: IndexEvent[] = []
    const progress: string[] = []

    // When the project is indexed
    await indexer.execute({
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
      onProgress: (_percent, phase) => progress.push(phase),
    })

    // Then the three files that enter processing are announced, with sizes, in order
    const activity = events.filter((event) => event.kind === 'file-activity')
    expect(activity.map((event) => event.filePath).sort()).toEqual([
      'ws:data/blob.dat',
      'ws:notes/readme.txt',
      'ws:src/a.ts',
    ])
    expect(activity.every((event) => event.sizeBytes !== null)).toBe(true)
    expect(activity.map((event) => event.index)).toEqual([1, 2, 3])
    expect(activity.every((event) => event.total === 3)).toBe(true)

    // And the oversized file only produces the size-skip event
    expect(activity.map((event) => event.filePath)).not.toContain('ws:src/too-big.ts')
    expect(events.filter((event) => event.kind === 'file-skipped')).toHaveLength(1)

    // And the files skipped by the analysis are counted in the progress detail
    expect(progress.some((phase) => phase.includes('1/3'))).toBe(true)
  })
})
