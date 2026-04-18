import { describe, it, expect } from 'vitest'
import { ArchivedChange } from '../../../src/domain/entities/archived-change.js'

const archivedAt = new Date('2026-02-19T14:30:00Z')

describe('ArchivedChange', () => {
  describe('props', () => {
    it('stores all required props', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        archivedAt,
        artifacts: ['proposal', 'design', 'tasks'],
        specIds: ['auth:oauth'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      })

      expect(ac.name).toBe('add-oauth-login')
      expect(ac.archivedName).toBe('20260219-143022-add-oauth-login')
      expect(ac.workspaces).toEqual(['auth'])
      expect(ac.archivedAt).toEqual(archivedAt)
      expect(ac.artifacts).toEqual(['proposal', 'design', 'tasks'])
    })

    it('stores an empty artifacts array', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        archivedAt,
        artifacts: [],
        specIds: [],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      })
      expect(ac.artifacts).toHaveLength(0)
    })
  })
})