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

    it('defaults approval to undefined', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: [],
      })
      expect(ac.approval).toBeUndefined()
    })

    it('stores approval record when provided', () => {
      const approval = {
        reason: 'Approved for migration',
        approvedBy: 'alice@example.com',
        approvedAt: new Date(),
        structuralChanges: [],
      }
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: [],
        approval,
      })
      expect(ac.approval).toBe(approval)
    })
  })

  describe('wasStructural', () => {
    it('returns false when no approval record', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: [],
      })
      expect(ac.wasStructural).toBe(false)
    })

    it('returns true when approval record is present', () => {
      const ac = new ArchivedChange({
        name: 'add-oauth-login',
        archivedName: '20260219-143022-add-oauth-login',
        workspace,
        archivedAt,
        artifacts: [],
        approval: {
          reason: 'Approved',
          approvedBy: 'alice@example.com',
          approvedAt: new Date(),
          structuralChanges: [],
        },
      })
      expect(ac.wasStructural).toBe(true)
    })
  })
})
