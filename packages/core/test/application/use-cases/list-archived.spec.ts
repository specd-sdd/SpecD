import { describe, it, expect } from 'vitest'
import { ListArchived } from '../../../src/application/use-cases/list-archived.js'
import { type ArchivedChangeIndexEntry } from '../../../src/domain/archived-change-index-entry.js'
import {
  type ArchiveRepository,
  type ArchiveListOptions,
} from '../../../src/application/ports/archive-repository.js'

function makeIndexEntry(name: string): ArchivedChangeIndexEntry {
  return {
    name,
    archivedName: `20240101-000000-${name}`,
    archivedAt: new Date('2024-01-01T00:00:00Z'),
    artifacts: ['spec'],
    specIds: ['auth:login'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    workspaces: ['auth'],
  }
}

function makeArchiveRepository(entries: ArchivedChangeIndexEntry[] = []): ArchiveRepository {
  return {
    workspace: () => 'default',
    ownership: () => 'owned' as const,
    isExternal: () => false,
    async list(options?: ArchiveListOptions) {
      const limit = options?.limit ?? 100
      const items = entries.slice(0, limit)
      return {
        items,
        meta: {
          total: entries.length,
          count: items.length,
          limit,
          page: options?.page ?? 1,
        },
      }
    },
    async get(_name: string) {
      return null
    },
    async archive() {
      throw new Error('not implemented')
    },
    async reindex() {
      throw new Error('not implemented')
    },
    archivePath() {
      return '/test/archive'
    },
  } as unknown as ArchiveRepository
}

describe('ListArchived', () => {
  it('returns empty list when no archived changes exist', async () => {
    const repo = makeArchiveRepository()
    const uc = new ListArchived(repo)

    const result = await uc.execute()

    expect(result.items).toEqual([])
    expect(result.meta.total).toBe(0)
  })

  it('returns archived changes from repository', async () => {
    const a = makeIndexEntry('alpha')
    const b = makeIndexEntry('bravo')
    const repo = makeArchiveRepository([a, b])
    const uc = new ListArchived(repo)

    const result = await uc.execute()

    expect(result.items).toHaveLength(2)
    expect(result.items.map((c) => c.name)).toEqual(['alpha', 'bravo'])
    expect(result.meta.total).toBe(2)
  })
})
