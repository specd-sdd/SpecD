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
  'verifying',
  'done',
  'pending-signoff',
  'signed-off',
  'archivable',
  'archiving',
]

describe('ChangeState', () => {
  describe('isValidTransition', () => {
    it.each([
      ['drafting', 'designing'],
      ['designing', 'ready'],
      ['designing', 'designing'],
      ['ready', 'implementing'],
      ['ready', 'pending-spec-approval'],
      ['ready', 'designing'],
      ['pending-spec-approval', 'spec-approved'],
      ['pending-spec-approval', 'designing'],
      ['spec-approved', 'implementing'],
      ['spec-approved', 'designing'],
      ['implementing', 'verifying'],
      ['implementing', 'designing'],
      ['verifying', 'implementing'],
      ['verifying', 'done'],
      ['verifying', 'designing'],
      ['done', 'archivable'],
      ['done', 'pending-signoff'],
      ['done', 'designing'],
      ['pending-signoff', 'signed-off'],
      ['pending-signoff', 'designing'],
      ['signed-off', 'archivable'],
      ['signed-off', 'designing'],
      ['archivable', 'designing'],
      ['archivable', 'archiving'],
    ] as [ChangeState, ChangeState][])('allows %s → %s', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true)
    })

    it('archivable only allows transition to archiving and designing', () => {
      for (const to of ALL_STATES) {
        if (to === 'archiving' || to === 'designing') {
          expect(isValidTransition('archivable', to)).toBe(true)
        } else {
          expect(isValidTransition('archivable', to)).toBe(false)
        }
      }
    })

    it('archiving has no valid transitions', () => {
      for (const to of ALL_STATES) {
        expect(isValidTransition('archiving', to)).toBe(false)
      }
    })

    it('rejects skipping states', () => {
      expect(isValidTransition('drafting', 'ready')).toBe(false)
      expect(isValidTransition('drafting', 'archivable')).toBe(false)
      expect(isValidTransition('implementing', 'done')).toBe(false)
      expect(isValidTransition('implementing', 'archivable')).toBe(false)
    })

    it('rejects backwards transitions', () => {
      expect(isValidTransition('designing', 'drafting')).toBe(false)
      expect(isValidTransition('spec-approved', 'pending-spec-approval')).toBe(false)
      expect(isValidTransition('done', 'implementing')).toBe(false)
    })

    it('rejects self-transitions (except designing)', () => {
      for (const state of ALL_STATES) {
        if (state === 'designing') {
          expect(isValidTransition(state, state)).toBe(true)
        } else {
          expect(isValidTransition(state, state)).toBe(false)
        }
      }
    })
  })

  describe('VALID_TRANSITIONS', () => {
    it('covers all states', () => {
      for (const state of ALL_STATES) {
        expect(VALID_TRANSITIONS).toHaveProperty(state)
      }
    })

    it('archivable allows archiving and designing', () => {
      expect(VALID_TRANSITIONS['archivable']).toEqual(['archiving', 'designing'])
    })

    it('archiving has no valid transitions', () => {
      expect(VALID_TRANSITIONS['archiving']).toEqual([])
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
