import { describe, it, expect } from 'vitest'
import { GetArchivedChange } from '../../../src/application/use-cases/get-archived-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
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
    async get(name: string) {
      return changes.find((c) => c.name === name) ?? null
    },
    async archive() {
      throw new Error('not implemented')
    },
    async reindex() {
      throw new Error('not implemented')
    },
  } as unknown as ArchiveRepository
}

describe('GetArchivedChange', () => {
  it('returns archived change when found', async () => {
    const archived = makeArchivedChange('my-change')
    const repo = makeArchiveRepository([archived])
    const uc = new GetArchivedChange(repo)

    const result = await uc.execute({ name: 'my-change' })

    expect(result.name).toBe('my-change')
  })

  it('throws ChangeNotFoundError when not found', async () => {
    const repo = makeArchiveRepository()
    const uc = new GetArchivedChange(repo)

    await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
  })
})
