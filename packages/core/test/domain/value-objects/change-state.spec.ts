import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  VALID_TRANSITIONS,
  HAPPY_PATH_NEXT,
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
      ['done', 'designing'],
      ['done', 'implementing'],
      ['done', 'verifying'],
      ['pending-signoff', 'signed-off'],
      ['pending-signoff', 'designing'],
      ['signed-off', 'archivable'],
      ['signed-off', 'designing'],
      ['signed-off', 'implementing'],
      ['signed-off', 'verifying'],
      ['archivable', 'designing'],
      ['archivable', 'archiving'],
      ['archivable', 'implementing'],
      ['archivable', 'verifying'],
      ['archiving', 'archivable'],
      ['archiving', 'designing'],
    ] as [ChangeState, ChangeState][])('allows %s → %s', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true)
    })

    it('archivable allows archive, redesign, and skill-aligned hops', () => {
      const allowed = new Set<ChangeState>(['archiving', 'designing', 'implementing', 'verifying'])
      for (const to of ALL_STATES) {
        expect(isValidTransition('archivable', to)).toBe(allowed.has(to))
      }
    })

    it('archivable cannot hop to done', () => {
      expect(isValidTransition('archivable', 'done')).toBe(false)
    })

    it('HAPPY_PATH_NEXT maps delivery hops and omits pending/archivable', () => {
      expect(HAPPY_PATH_NEXT.drafting).toBe('designing')
      expect(HAPPY_PATH_NEXT.implementing).toBe('verifying')
      expect(HAPPY_PATH_NEXT['signed-off']).toBe('archivable')
      expect(HAPPY_PATH_NEXT['pending-spec-approval']).toBeUndefined()
      expect(HAPPY_PATH_NEXT['pending-signoff']).toBeUndefined()
      expect(HAPPY_PATH_NEXT.archivable).toBeUndefined()
      expect(HAPPY_PATH_NEXT.archiving).toBeUndefined()
    })

    it('archiving allows transition to archivable and designing only', () => {
      for (const to of ALL_STATES) {
        if (to === 'archivable' || to === 'designing') {
          expect(isValidTransition('archiving', to)).toBe(true)
        } else {
          expect(isValidTransition('archiving', to)).toBe(false)
        }
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
      expect(isValidTransition('ready', 'pending-spec-approval')).toBe(false)
      expect(isValidTransition('done', 'pending-signoff')).toBe(false)
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

    it('archivable allows archiving, designing, implementing, and verifying', () => {
      expect(VALID_TRANSITIONS['archivable']).toEqual([
        'archiving',
        'designing',
        'implementing',
        'verifying',
      ])
    })

    it('archiving allows archivable and designing escape transitions', () => {
      expect(VALID_TRANSITIONS['archiving']).toEqual(['archivable', 'designing'])
    })

    it('ready allows implementing and designing only', () => {
      expect(VALID_TRANSITIONS['ready']).toEqual(['implementing', 'designing'])
    })

    it('done allows archivable, designing, and skill-aligned hops', () => {
      expect(VALID_TRANSITIONS['done']).toEqual([
        'archivable',
        'designing',
        'implementing',
        'verifying',
      ])
    })
  })
})
