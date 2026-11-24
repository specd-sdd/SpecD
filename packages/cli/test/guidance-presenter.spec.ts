import { describe, expect, it } from 'vitest'
import {
  approveSignoffAction,
  approveSpecAction,
  CheckPredicateFailedError,
  refreshStatusAction,
  startVerificationAction,
} from '@specd/sdk'
import {
  describeCheckFailure,
  projectCliNextAction,
  resolveCliBypassFlag,
  resolveCliWorkflowCommand,
  resolveCliWorkflowGuidance,
} from '../src/guidance-presenter.js'

describe('guidance-presenter', () => {
  describe('resolveCliWorkflowCommand', () => {
    it('maps all four phase intents to slash commands', () => {
      expect(resolveCliWorkflowCommand('design')).toBe('/specd-design')
      expect(resolveCliWorkflowCommand('implement')).toBe('/specd-implement')
      expect(resolveCliWorkflowCommand('verify')).toBe('/specd-verify')
      expect(resolveCliWorkflowCommand('archive')).toBe('/specd-archive')
    })

    it('prefers non-null intent over informational check action', () => {
      expect(resolveCliWorkflowCommand('verify', startVerificationAction('my-change'))).toBe(
        '/specd-verify',
      )
    })

    it('maps built-in check actions when intent is null', () => {
      expect(resolveCliWorkflowCommand(null, approveSpecAction())).toBe(
        'specd changes approve spec',
      )
      expect(resolveCliWorkflowCommand(null, approveSignoffAction())).toBe(
        'specd changes approve signoff',
      )
      expect(resolveCliWorkflowCommand(null, startVerificationAction('my-change'))).toBe(
        'specd changes verification start my-change',
      )
      expect(resolveCliWorkflowCommand(null, refreshStatusAction('my-change'))).toBe(
        'specd changes status my-change',
      )
    })

    it('returns null (never guidance prose) when changeName is missing or kind is unknown', () => {
      expect(
        resolveCliWorkflowCommand(null, {
          kind: 'start-verification',
          guidance: 'Start verification manually',
        }),
      ).toBeNull()
      expect(resolveCliWorkflowCommand(null, { kind: 'start-verification' })).toBeNull()
      expect(
        resolveCliWorkflowCommand(null, {
          kind: '@acme.security-scan',
          guidance: 'Run security scan',
        }),
      ).toBeNull()
      expect(resolveCliWorkflowCommand(null)).toBeNull()
    })
  })

  describe('resolveCliWorkflowGuidance', () => {
    it('exposes guidance only when the action has no command mapping', () => {
      expect(
        resolveCliWorkflowGuidance(null, {
          kind: '@acme.security-scan',
          guidance: 'Run security scan',
        }),
      ).toBe('Run security scan')
      expect(
        resolveCliWorkflowGuidance(null, {
          kind: 'start-verification',
          guidance: 'Start verification manually',
        }),
      ).toBe('Start verification manually')
      expect(
        resolveCliWorkflowGuidance(null, {
          kind: 'start-verification',
          params: { changeName: 'my-change' },
          guidance: 'ignored',
        }),
      ).toBeUndefined()
      expect(
        resolveCliWorkflowGuidance('verify', { kind: '@acme.x', guidance: 'g' }),
      ).toBeUndefined()
      expect(resolveCliWorkflowGuidance(null)).toBeUndefined()
    })

    it('puts guidance in its own field and leaves command null in the projected next action', () => {
      const projected = projectCliNextAction({
        targetStep: 'ready',
        actionType: 'cognitive',
        reason: 'blocked',
        intent: null,
        action: { kind: '@acme.security-scan', guidance: 'Run security scan' },
      })
      expect(projected.command).toBeNull()
      expect(projected.guidance).toBe('Run security scan')
    })
  })

  describe('resolveCliBypassFlag', () => {
    it('returns --skip-checks <checkId> only when skippable and checkId is present', () => {
      expect(resolveCliBypassFlag({ isSkippable: true, checkId: 'spec.overlap' })).toBe(
        '--skip-checks spec.overlap',
      )
      expect(resolveCliBypassFlag({ isSkippable: false, checkId: 'spec.overlap' })).toBeUndefined()
      expect(resolveCliBypassFlag({ isSkippable: true })).toBeUndefined()
    })
  })

  describe('projectCliNextAction', () => {
    it('appends overlap bypass suffix only for skippable OVERLAP_CONFLICT with archive intent', () => {
      const projected = projectCliNextAction(
        {
          targetStep: 'archivable',
          actionType: 'mechanical',
          reason: 'Specs overlap with other active changes: peer-a (core:foo)',
          intent: 'archive',
        },
        [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap with other active changes: peer-a (core:foo)',
            isSkippable: true,
            checkId: 'spec.overlap',
          },
        ],
      )
      expect(projected.command).toBe('/specd-archive')
      expect(projected.reason).toBe(
        'Specs overlap with other active changes: peer-a (core:foo) Use --skip-checks spec.overlap to archive anyway.',
      )

      const locked = projectCliNextAction(
        {
          targetStep: 'archivable',
          actionType: 'mechanical',
          reason: 'Specs overlap with other active changes: peer-a (core:foo)',
          intent: 'archive',
        },
        [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap with other active changes: peer-a (core:foo)',
            isSkippable: false,
            checkId: 'spec.overlap',
          },
        ],
      )
      expect(locked.reason).toBe('Specs overlap with other active changes: peer-a (core:foo)')
    })
  })

  describe('describeCheckFailure', () => {
    it('formats per-check context lines from details', () => {
      const requiresErr = new CheckPredicateFailedError(
        'workflow.requires',
        'Checking required artifacts',
        'PENDING_PARENT_REVIEW',
        'Blocked',
        undefined,
        {
          artifactId: 'tasks',
          status: 'pending-parent-artifact-review',
          blockedBy: { artifactId: 'design', status: 'drifted-pending-review' },
        },
      )
      expect(describeCheckFailure(requiresErr)).toEqual([
        'Artifact: tasks (pending-parent-artifact-review)',
        'Blocked by parent: design (drifted-pending-review)',
      ])

      const depsErr = new CheckPredicateFailedError(
        'deps.consistent',
        'Checking dependency consistency',
        'DEPS_INCONSISTENT',
        'Mismatch',
        undefined,
        {
          mismatches: [{ specId: 'core:a', extracted: ['core:b'], persisted: [] }],
        },
      )
      expect(describeCheckFailure(depsErr)).toEqual(['core:a: extracted [core:b] vs persisted []'])
    })
  })
})
