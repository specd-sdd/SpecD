import { describe, it, expect } from 'vitest'
import { ListArchived } from '../../../src/application/use-cases/list-archived.js'
import { type ArchivedChangeIndexEntry } from '../../../src/domain/archived-change-index-entry.js'
import { type ArchiveRepository } from '../../../src/application/ports/archive-repository.js'

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
    async list() {
      return entries
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
  it('returns empty array when no archived changes exist', async () => {
    const repo = makeArchiveRepository()
    const uc = new ListArchived(repo)

    const result = await uc.execute()

    expect(result).toEqual([])
  })

  it('returns all archived changes from repository', async () => {
    const a = makeIndexEntry('alpha')
    const b = makeIndexEntry('bravo')
    const repo = makeArchiveRepository([a, b])
    const uc = new ListArchived(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })
})
