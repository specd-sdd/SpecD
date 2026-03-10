import { describe, it, expect } from 'vitest'
import { ListArchived } from '../../../src/application/use-cases/list-archived.js'
import { ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { type ArchiveRepository } from '../../../src/application/ports/archive-repository.js'

function makeArchivedChange(name: string): ArchivedChange {
  return new ArchivedChange({
    name,
    archivedName: name,
    workspace: SpecPath.parse('default'),
    archivedAt: new Date('2024-01-01T00:00:00Z'),
    artifacts: ['spec'],
    specIds: ['auth/login'],
    schemaName: 'test-schema',
    schemaVersion: 1,
  })
}

function makeArchiveRepository(changes: ArchivedChange[] = []): ArchiveRepository {
  return {
    workspace: () => 'default',
    ownership: () => 'owned' as const,
    isExternal: () => false,
    async list() {
      return changes
    },
    async get(_name: string) {
      return changes.find((c) => c.name === _name) ?? null
    },
    async archive() {
      throw new Error('not implemented')
    },
    async reindex() {
      throw new Error('not implemented')
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
    const a = makeArchivedChange('alpha')
    const b = makeArchivedChange('bravo')
    const repo = makeArchiveRepository([a, b])
    const uc = new ListArchived(repo)

    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result.map((c) => c.name)).toEqual(['alpha', 'bravo'])
  })
})
