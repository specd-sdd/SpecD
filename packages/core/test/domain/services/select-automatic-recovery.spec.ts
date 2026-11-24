import { describe, expect, it } from 'vitest'
import { selectAutomaticRecovery } from '../../../src/domain/services/change-validity.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'
import {
  DEFAULT_INVALIDATION_POLICY,
  type InvalidationPolicy,
} from '../../../src/domain/value-objects/invalidation-policy.js'

const preserve = DEFAULT_INVALIDATION_POLICY
const redesign: InvalidationPolicy = { ...DEFAULT_INVALIDATION_POLICY, workflow: 'redesign' }

describe('selectAutomaticRecovery', () => {
  describe('spec consent', () => {
    it.each(['stale', 'revoked'] as const)(
      'does not request recovery from ready for %s consent',
      (status) => {
        expect(selectAutomaticRecovery('ready', preserve, status, 'not-required', false)).toBeNull()
      },
    )

    it.each([
      'implementing',
      'verifying',
      'done',
      'archivable',
      'archiving',
    ] as const satisfies readonly ChangeState[])(
      'returns %s to designing for stale consent',
      (state) => {
        expect(selectAutomaticRecovery(state, preserve, 'stale', 'not-required', false)).toEqual({
          cause: 'spec-approval',
          from: state,
          to: 'designing',
        })
      },
    )

    it.each(['implementing', 'verifying', 'done', 'archivable'] as const)(
      'returns %s to designing for revoked consent (isBrokenConsent covers revoked)',
      (state) => {
        expect(selectAutomaticRecovery(state, preserve, 'revoked', 'not-required', false)).toEqual({
          cause: 'spec-approval',
          from: state,
          to: 'designing',
        })
      },
    )

    it('returns a later state to done for revoked sign-off', () => {
      expect(selectAutomaticRecovery('archivable', preserve, 'valid', 'revoked', false)).toEqual({
        cause: 'signoff',
        from: 'archivable',
        to: 'done',
      })
    })

    it.each(['designing', 'drafting'] as const)('does not move %s', (state) => {
      expect(selectAutomaticRecovery(state, preserve, 'stale', 'not-required', false)).toBeNull()
    })

    it.each(['valid', 'absent', 'not-required'] as const)(
      'ignores %s consent in any state',
      (status) => {
        expect(
          selectAutomaticRecovery('implementing', preserve, status, 'not-required', false),
        ).toBeNull()
      },
    )
  })

  describe('rules that are not affected by the ready exemption', () => {
    it('still returns a later state to done for stale sign-off', () => {
      expect(selectAutomaticRecovery('archivable', preserve, 'valid', 'stale', false)).toEqual({
        cause: 'signoff',
        from: 'archivable',
        to: 'done',
      })
    })

    it('does not move done for stale sign-off', () => {
      expect(selectAutomaticRecovery('done', preserve, 'valid', 'stale', false)).toBeNull()
    })

    it('still redesigns from ready when the policy asks for it and review is pending', () => {
      expect(selectAutomaticRecovery('ready', redesign, 'valid', 'valid', true)).toEqual({
        cause: 'workflow-redesign',
        from: 'ready',
        to: 'designing',
      })
    })

    it('lets the redesign policy act in ready even when the consent is stale', () => {
      expect(selectAutomaticRecovery('ready', redesign, 'stale', 'valid', true)).toEqual({
        cause: 'workflow-redesign',
        from: 'ready',
        to: 'designing',
      })
    })

    it('keeps spec recovery ahead of sign-off recovery after ready', () => {
      expect(selectAutomaticRecovery('archivable', preserve, 'stale', 'stale', false)).toEqual({
        cause: 'spec-approval',
        from: 'archivable',
        to: 'designing',
      })
    })
  })
})
