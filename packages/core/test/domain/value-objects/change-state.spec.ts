import { describe, it, expect } from 'vitest'
import { isValidTransition, VALID_TRANSITIONS, type ChangeState } from '../../../src/domain/value-objects/change-state.js'

describe('ChangeState', () => {
  describe('isValidTransition', () => {
    it.each([
      ['drafting', 'designing'],
      ['designing', 'ready'],
      ['ready', 'implementing'],
      ['implementing', 'done'],
      ['done', 'pending-approval'],
      ['done', 'archivable'],
      ['pending-approval', 'approved'],
      ['approved', 'archivable'],
    ] as [ChangeState, ChangeState][])(
      'allows %s → %s',
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(true)
      },
    )

    it('rejects archivable → anything (terminal state)', () => {
      const allStates: ChangeState[] = [
        'drafting', 'designing', 'ready', 'implementing',
        'done', 'pending-approval', 'approved', 'archivable',
      ]
      for (const to of allStates) {
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
      expect(isValidTransition('approved', 'pending-approval')).toBe(false)
      expect(isValidTransition('done', 'implementing')).toBe(false)
    })

    it('rejects self-transitions', () => {
      const allStates: ChangeState[] = [
        'drafting', 'designing', 'ready', 'implementing',
        'done', 'pending-approval', 'approved', 'archivable',
      ]
      for (const state of allStates) {
        expect(isValidTransition(state, state)).toBe(false)
      }
    })
  })

  describe('VALID_TRANSITIONS', () => {
    it('covers all states', () => {
      const allStates: ChangeState[] = [
        'drafting', 'designing', 'ready', 'implementing',
        'done', 'pending-approval', 'approved', 'archivable',
      ]
      for (const state of allStates) {
        expect(VALID_TRANSITIONS).toHaveProperty(state)
      }
    })

    it('archivable has no valid transitions', () => {
      expect(VALID_TRANSITIONS['archivable']).toHaveLength(0)
    })
  })
})
