import { vi } from 'vitest'
import { ChangeRepository } from '@specd/core/ports'
import {
  type ActiveChangeListEntry,
  type Change,
  type DiscardedChangeListEntry,
  type DiscardedChangeView,
  type DraftedChangeListEntry,
  type DraftedChangeView,
  type ListResult,
  type SpecArtifact,
} from '@specd/core'

type MutateResultShape<T> = { readonly result: T; readonly change: Change }

/**
 * Typed in-memory {@link ChangeRepository} stub for use-case tests.
 *
 * Implements every abstract port method so tests never need `as unknown as`.
 * Only `get` is backed by a real map; the remaining methods are inert stubs.
 */
export class StubChangeRepository extends ChangeRepository {
  private readonly changes: Map<string, Change>

  constructor(changes: ReadonlyMap<string, Change> = new Map()) {
    super({ workspace: 'test', ownership: 'owned', isExternal: false, configPath: '/tmp' })
    this.changes = new Map(changes)
  }

  /** Spy-friendly `get` returning the registered change or `null`. */
  override async get(name: string): Promise<Change | null> {
    return this.changes.get(name) ?? null
  }

  async getDraft(_name: string): Promise<DraftedChangeView | null> {
    return null
  }

  async getDiscarded(_name: string): Promise<DiscardedChangeView | null> {
    return null
  }

  async mutate<T>(
    _name: string,
    _fn: (change: Change) => Promise<T> | T,
  ): Promise<MutateResultShape<T>> {
    throw new Error('StubChangeRepository.mutate is not implemented')
  }

  async mutateDraft<T>(
    _name: string,
    _fn: (change: Change) => Promise<T> | T,
  ): Promise<MutateResultShape<T>> {
    throw new Error('StubChangeRepository.mutateDraft is not implemented')
  }

  async list(): Promise<ListResult<ActiveChangeListEntry>> {
    return { items: [], meta: { total: 0, count: 0, limit: 0 } }
  }

  async listDrafts(): Promise<ListResult<DraftedChangeListEntry>> {
    return { items: [], meta: { total: 0, count: 0, limit: 0 } }
  }

  async listDiscarded(): Promise<ListResult<DiscardedChangeListEntry>> {
    return { items: [], meta: { total: 0, count: 0, limit: 0 } }
  }

  async count(): Promise<number> {
    return this.changes.size
  }

  async countDrafts(): Promise<number> {
    return 0
  }

  async countDiscarded(): Promise<number> {
    return 0
  }

  async reindex(): Promise<void> {}

  async reindexActive(): Promise<void> {}

  async reindexDrafts(): Promise<void> {}

  async reindexDiscarded(): Promise<void> {}

  async create(_change: Change): Promise<void> {}

  async delete(_change: Change): Promise<void> {}

  async artifact(_change: Change, _filename: string): Promise<SpecArtifact | null> {
    return null
  }

  async saveArtifact(
    _change: Change,
    _artifact: SpecArtifact,
    _options?: { force?: boolean },
  ): Promise<void> {}

  changePath(_change: Change): string {
    return '/tmp/change'
  }

  draftChangePath(_view: DraftedChangeView): string {
    return '/tmp/draft'
  }

  async artifactExists(_change: Change, _filename: string): Promise<boolean> {
    return false
  }

  async deltaExists(_change: Change, _specId: string, _filename: string): Promise<boolean> {
    return false
  }

  async scaffold(
    _change: Change,
    _specExists: (specId: string) => Promise<boolean>,
  ): Promise<void> {}

  async unscaffold(_change: Change, _specIds: readonly string[]): Promise<void> {}

  internalPaths(): readonly string[] | undefined {
    return undefined
  }
}

/** Returns a vi.spyOn-able {@link ChangeRepository} whose `get` is mocked. */
export function makeMockChangeRepository(
  getImpl: (name: string) => Promise<Change | null>,
): ChangeRepository {
  const stub = new StubChangeRepository()
  vi.spyOn(stub, 'get').mockImplementation(getImpl)
  return stub
}
