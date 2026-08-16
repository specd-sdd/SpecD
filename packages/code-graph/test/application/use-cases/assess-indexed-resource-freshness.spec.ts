import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AssessIndexedResourceFreshness } from '../../../src/application/use-cases/assess-indexed-resource-freshness.js'
import { computeContentHash } from '../../../src/application/use-cases/compute-content-hash.js'
import {
  FreshnessState,
  IndexedInputKind,
  IndexedResourceKind,
  type IndexedInputObservation,
} from '../../../src/domain/value-objects/indexed-input-freshness.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

describe('AssessIndexedResourceFreshness', () => {
  let root: string
  let store: InMemoryGraphStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'specd-freshness-'))
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })

  it('refreshes changed stamps when content still matches', async () => {
    const file = join(root, 'source.ts')
    const content = 'export const value = 1\n'
    await writeFile(file, content)
    const initial = await stat(file)
    await seedObservation(store, {
      indexedContentHash: computeContentHash(content),
      lastObservedMtime: initial.mtimeMs - 10,
      lastObservedSize: initial.size,
    })

    const [result] = await assess(store, root)

    expect(result?.state).toBe(FreshnessState.Current)
    const [observation] = await store.getIndexedInputObservations([resource])
    expect(observation?.lastObservedMtime).toBe(initial.mtimeMs)
    expect((await store.getFreshnessLatches(['core'])).graph).toBe(false)
  })

  it('marks the observation and monotonic latches stale after content changes', async () => {
    const file = join(root, 'source.ts')
    await writeFile(file, 'export const value = 2\n')
    await seedObservation(store, {
      indexedContentHash: computeContentHash('export const value = 1\n'),
      lastObservedMtime: 0,
      lastObservedSize: 0,
    })

    const [result] = await assess(store, root)

    expect(result?.state).toBe(FreshnessState.Stale)
    expect(result?.reasons).toContain('CONTENT_HASH_CHANGED')
    const latches = await store.getFreshnessLatches(['core'])
    expect(latches.graph).toBe(true)
    expect(latches.workspaces.core).toBe(true)
  })

  it('treats a missing physical input as stale', async () => {
    await seedObservation(store, {
      indexedContentHash: computeContentHash('gone'),
      lastObservedMtime: 1,
      lastObservedSize: 4,
    })

    const [result] = await assess(store, root)

    expect(result?.state).toBe(FreshnessState.Stale)
    expect(result?.reasons).toContain('INPUT_MISSING')
  })
})

const resource = {
  workspace: 'core',
  resourceKind: IndexedResourceKind.File,
  resourceId: 'core:source.ts',
} as const

async function seedObservation(
  store: InMemoryGraphStore,
  evidence: Pick<
    IndexedInputObservation,
    'indexedContentHash' | 'lastObservedMtime' | 'lastObservedSize'
  >,
): Promise<void> {
  await store.bulkLoad({
    files: [],
    symbols: [],
    specs: [],
    relations: [],
    observations: [
      {
        ...resource,
        inputKind: IndexedInputKind.Filesystem,
        inputLocator: 'source.ts',
        generation: 'generation-1',
        stale: false,
        ...evidence,
      },
    ],
    indexedWorkspaces: ['core'],
    clearGraphStaleLatch: true,
  })
}

async function assess(store: InMemoryGraphStore, workspaceRoot: string) {
  return new AssessIndexedResourceFreshness(store).execute({
    resources: [resource],
    workspaceRoots: new Map([['core', workspaceRoot]]),
  })
}
