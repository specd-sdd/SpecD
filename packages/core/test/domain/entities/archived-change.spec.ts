import { describe, it, expect } from 'vitest'
import { ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const workspace = SpecPath.parse('auth/oauth')
const archivedAt = new Date('2026-02-19T14:30:00Z')

describe('ArchivedChange', () => {
  describe('props', () => {
    it('stores all required props', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: ['proposal', 'design', 'tasks'],
      })

      expect(ac.name).toBe('add-oauth-login')
      expect(ac.archivedName).toBe('20260219-143022-add-oauth-login')
      expect(ac.workspace.equals(workspace)).toBe(true)
      expect(ac.archivedAt).toBe(archivedAt)
      expect(ac.artifacts).toEqual(['proposal', 'design', 'tasks'])
    })

    it('stores an empty artifacts array', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: [],
      })
      expect(ac.artifacts).toHaveLength(0)
    })
  })
})
