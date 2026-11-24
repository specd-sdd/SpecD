import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { ValidityFingerprintService } from '../../../src/application/services/validity-fingerprint-service.js'
import { detectImplLinksInScope } from '../../../src/application/services/detect-impl-links-in-scope.js'
import { createWorkflowCheckRegistry } from '../../../src/application/checks/workflow-check-registry.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'
import {
  makeChangeRepository,
  makeChange,
  makeActorResolver,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeContentHasher,
  makeSpecApprovalFingerprint,
  testActor,
} from './helpers.js'

describe('GetStatus stale spec consent in ready', () => {
  it('keeps the change in ready and routes to approve-spec with a real reconciler', async () => {
    const change = makeChange('stale-in-ready')
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    // Valid per projection, but its scope no longer matches the change specs: stale per fingerprint.
    change.recordSpecApproval('old', makeSpecApprovalFingerprint(['other/spec']), testActor)

    const changes = makeChangeRepository([change])
    vi.spyOn(changes, 'artifact').mockResolvedValue(null)
    const approvals = { spec: true, signoff: false }
    const schemaProvider = makeSchemaProvider(makeSchema([makeArtifactType('proposal')]))
    const refresh = {
      execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    } as unknown as RefreshImplementationTracking
    const reconcile = new ReconcileChangeValidity({
      changes,
      resolveChangeSchema: new ResolveChangeSchema(schemaProvider),
      actor: makeActorResolver(),
      refreshImplementationTracking: refresh,
      fingerprint: new ValidityFingerprintService({
        changes,
        hasher: makeContentHasher(),
        binaryHasher: new NodeBinaryContentHasher(),
        schemaProvider,
      }),
      approvals,
    })
    const registry = createWorkflowCheckRegistry({
      countTasks: new CountTasks(changes, schemaProvider),
      runStepHooks: makeRunStepHooks(),
      readyFacts: {
        changes,
        listWorkspaces: makeListWorkspaces(),
        parsers: makeNoopParsers(),
        extractorTransforms: new Map(),
        workspaceRoutes: [],
      },
      detectImplLinksInScope,
    })
    const uc = new GetStatus(
      changes,
      schemaProvider,
      approvals,
      refresh,
      registry.transitionBindings,
      registry.archiveBindings,
      reconcile,
    )

    const result = await uc.execute({ name: 'stale-in-ready' })

    expect(result.change?.state).toBe('ready')
    expect(result.validity?.automaticReturn).toBeNull()
    const blocker = result.blockers.find((b) => b.code === 'APPROVAL_STALE')
    expect(blocker).toBeDefined()
    expect(blocker?.action?.kind).toBe('approve-spec')
    expect(result.nextAction.action?.kind).toBe('approve-spec')
    expect(result.nextAction.intent).toBeNull()
  })
})
