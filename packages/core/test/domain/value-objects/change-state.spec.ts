import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  VALID_TRANSITIONS,
  type ChangeState,
} from '../../../src/domain/value-objects/change-state.js'

const ALL_STATES: ChangeState[] = [
  'drafting',
  'designing',
  'ready',
  'pending-spec-approval',
  'spec-approved',
  'implementing',
  'done',
  'pending-signoff',
  'signed-off',
  'archivable',
]

describe('ChangeState', () => {
  describe('isValidTransition', () => {
    it.each([
      ['drafting', 'designing'],
      ['designing', 'ready'],
      ['ready', 'implementing'],
      ['ready', 'pending-spec-approval'],
      ['pending-spec-approval', 'spec-approved'],
      ['spec-approved', 'implementing'],
      ['implementing', 'done'],
      ['done', 'archivable'],
      ['done', 'pending-signoff'],
      ['pending-signoff', 'signed-off'],
      ['signed-off', 'archivable'],
    ] as [ChangeState, ChangeState][])('allows %s → %s', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true)
    })

    it('rejects archivable → anything (terminal state)', () => {
      for (const to of ALL_STATES) {
        expect(isValidTransition('archivable', to)).toBe(false)
      }
    })

    it('rejects skipping states', () => {
      expect(isValidTransition('drafting', 'ready')).toBe(false)
      expect(isValidTransition('drafting', 'archivable')).toBe(false)
      expect(isValidTransition('implementing', 'archivable')).toBe(false)
    })

    it('rejects backwards transitions', () => {
      expect(isValidTransition('designing', 'drafting')).toBe(false)
      expect(isValidTransition('spec-approved', 'pending-spec-approval')).toBe(false)
      expect(isValidTransition('done', 'implementing')).toBe(false)
    })

    it('rejects self-transitions', () => {
      for (const state of ALL_STATES) {
        expect(isValidTransition(state, state)).toBe(false)
      }
    })
  })

  describe('VALID_TRANSITIONS', () => {
    it('covers all states', () => {
      for (const state of ALL_STATES) {
        expect(VALID_TRANSITIONS).toHaveProperty(state)
      }
    })

    it('archivable has no valid transitions', () => {
      expect(VALID_TRANSITIONS['archivable']).toHaveLength(0)
    })

    it('ready has two valid transitions (free path and spec approval gate)', () => {
      expect(VALID_TRANSITIONS['ready']).toContain('implementing')
      expect(VALID_TRANSITIONS['ready']).toContain('pending-spec-approval')
    })

    it('done has two valid transitions (free path and signoff gate)', () => {
      expect(VALID_TRANSITIONS['done']).toContain('archivable')
      expect(VALID_TRANSITIONS['done']).toContain('pending-signoff')
    })
  })
})
