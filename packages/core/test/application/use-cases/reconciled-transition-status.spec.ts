import { describe, expect, it } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { ReconciledOperationBlockedError } from '../../../src/application/errors/reconciled-operation-blocked-error.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import {
  makeActorResolver,
  makeChange,
  makeChangeRepository,
  makeSchema,
  makeSchemaProvider,
  testActor,
} from './helpers.js'

const verdict: ChangeValidityVerdict = {
  artifactReviewRequired: false,
  affectedArtifacts: [],
  projectionChanges: [],
  specApproval: 'not-required',
  signoff: 'not-required',
  verification: 'not-required',
  blockers: [],
  recovery: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
}

describe('reconciled transition and status', () => {
  it('keeps committed recovery when the requested transition no longer applies', async () => {
    const current = makeChange('c', { specIds: ['core:change'] })
    current.transition('designing', testActor)
    current.transition('ready', testActor)
    current.transition('implementing', testActor)
    const recovered = makeChange('c', { specIds: ['core:change'] })
    recovered.transition('designing', testActor)
    const repo = makeChangeRepository([current])
    const reconcile = {
      execute: async () => {
        repo.store.set('c', recovered)
        return {
          change: recovered,
          verdict,
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: verdict.recovery,
          changed: true,
        }
      },
    }
    const useCase = new TransitionChange(
      repo,
      makeActorResolver(),
      makeSchemaProvider(makeSchema()),
      { execute: async () => undefined } as unknown as RefreshImplementationTracking,
      { spec: true, signoff: false },
      [],
      reconcile as never,
    )
    await expect(useCase.execute({ name: 'c', to: 'verifying' })).rejects.toMatchObject({
      name: ReconciledOperationBlockedError.name,
      code: 'RECONCILED_OPERATION_BLOCKED',
      operation: 'transition',
      state: 'designing',
      automaticReturn: verdict.recovery,
      nextAction: { targetStep: 'designing', command: '/specd-design' },
    })
    expect(repo.store.get('c')?.state).toBe('designing')
  })

  it('reconciles active status even when the manifest timestamp is unchanged', async () => {
    const change = makeChange('c', { specIds: ['core:change'] })
    const repo = makeChangeRepository([change])
    let calls = 0
    const reconcile = {
      execute: async () => {
        calls += 1
        return {
          change,
          verdict: { ...verdict, recovery: null },
          projectionChanges: [],
          affectedArtifacts: [],
          automaticReturn: null,
          changed: false,
        }
      },
    }
    const useCase = new GetStatus(
      repo,
      makeSchemaProvider(makeSchema()),
      { spec: false, signoff: false },
      { execute: async () => undefined } as unknown as RefreshImplementationTracking,
      [],
      [],
      reconcile as never,
    )
    const result = await useCase.execute({
      name: 'c',
      ifModifiedSince: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(calls).toBe(1)
    expect(result.unchanged).toBeUndefined()
    expect(result.validity?.automaticReturn).toBeNull()
  })
})
