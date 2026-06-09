import { describe, it, expect } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { toArchivedChangeView } from '../../../src/domain/read-only-change-view.js'

const archivedAt = new Date('2026-02-19T14:30:00Z')
const actor = { name: 'test', email: 'test@test.com' }

function makeArchivedView(
  name: string,
  opts: { specIds?: string[]; schemaName?: string; artifacts?: string[] } = {},
): ReturnType<typeof toArchivedChangeView> {
  const createdAt = new Date('2026-02-19T14:30:22Z')
  const specIds = opts.specIds ?? ['auth:oauth']
  const change = new Change({
    name,
    createdAt,
    specIds,
    history: [
      {
        type: 'created',
        at: createdAt,
        by: actor,
        specIds,
        schemaName: opts.schemaName ?? '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
  change.transition('designing', actor)
  change.transition('ready', actor)
  change.transition('implementing', actor)
  change.transition('verifying', actor)
  change.transition('done', actor)
  change.transition('archivable', actor)

  return toArchivedChangeView(change, {
    archivedName: `20260219-143022-${name}`,
    archivedAt,
  })
}

describe('ArchivedChange', () => {
  describe('read model', () => {
    it('stores archive metadata and shared read-only fields', () => {
      const ac = makeArchivedView('add-oauth-login', {
        artifacts: ['proposal', 'design', 'tasks'],
      })

      expect(ac.name).toBe('add-oauth-login')
      expect(ac.archivedName).toBe('20260219-143022-add-oauth-login')
      expect(ac.workspaces).toEqual(['auth'])
      expect(ac.archivedAt).toEqual(archivedAt)
      expect(ac.state).toBe('archivable')
      expect([...ac.artifacts.keys()]).toEqual([])
    })

    it('exposes empty artifacts map when none were synced', () => {
      const ac = makeArchivedView('add-oauth-login', { specIds: [] })

      expect(ac.specIds).toEqual([])
      expect(ac.artifacts.size).toBe(0)
    })
  })
})
