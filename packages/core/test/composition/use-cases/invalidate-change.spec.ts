import { afterEach, describe, expect, it } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { InvalidateChange } from '../../../src/application/use-cases/invalidate-change.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { ApprovalGateDisabledError } from '../../../src/application/errors/approval-gate-disabled-error.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createInvalidateChange,
  resolveInvalidateChangeDeps,
  type InvalidateChangeDeps,
} from '../../../src/composition/use-cases/invalidate-change.js'
import {
  createApproveSpec,
  resolveApproveSpecDeps,
} from '../../../src/composition/use-cases/approve-spec.js'
import {
  createApproveSignoff,
  resolveApproveSignoffDeps,
} from '../../../src/composition/use-cases/approve-signoff.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

let fixture: CompositionFactoryFixture = { tmpDir: undefined }

afterEach(async () => {
  await cleanupCompositionFactoryConfig(fixture)
})

describe('resolveInvalidateChangeDeps', () => {
  it('resolves changes, actor and schemaProvider from the composition resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-invalidate-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveInvalidateChangeDeps(resolver)

    expect(deps.changes).toBe(resolver.getChangeRepository())
    expect(deps.actor).toBe(resolver.getActorResolver())
    expect(deps.schemaProvider).toBe(resolver.getSchemaProvider())
    expect(deps.reconcile).toBe(resolver.getReconcileChangeValidity())
    expect(deps.approvals).toEqual(setup.config.approvals)
    expect(deps.transitionBindings?.length).toBeGreaterThan(0)
  })
})

describe('createInvalidateChange', () => {
  it('builds the use case from SpecdConfig through resolveInvalidateChangeDeps', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-invalidate')
    fixture = setup.fixture

    expect(createInvalidateChange(setup.config)).toBeInstanceOf(InvalidateChange)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: InvalidateChangeDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      reconcile: {} as never,
    }

    expect(createInvalidateChange(deps)).toBeInstanceOf(InvalidateChange)
  })

  it('rejects deps plus composition options', () => {
    const deps: InvalidateChangeDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      reconcile: {} as never,
    }

    expect(() =>
      createInvalidateChange(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

describe('approval factories are behaviorally equivalent across forms', () => {
  it('ApproveSpec: config form and resolved-deps form share gate and dependencies', async () => {
    const setup = await setupCompositionFactoryConfig('specd-approve-spec-equivalence')
    fixture = setup.fixture
    const gateOff = setup.config
    const gateOn: SpecdConfig = { ...setup.config, approvals: { spec: true, signoff: true } }

    const viaDepsOff = createApproveSpec(resolveApproveSpecDeps(createCompositionResolver(gateOff)))
    const viaConfigOff = createApproveSpec(gateOff)
    expect(viaDepsOff).toBeInstanceOf(ApproveSpec)
    for (const uc of [viaDepsOff, viaConfigOff]) {
      await expect(uc.execute({ name: 'x', reason: 'r' })).rejects.toBeInstanceOf(
        ApprovalGateDisabledError,
      )
    }

    const viaDepsOn = createApproveSpec(resolveApproveSpecDeps(createCompositionResolver(gateOn)))
    const viaConfigOn = createApproveSpec(gateOn)
    for (const uc of [viaDepsOn, viaConfigOn]) {
      await expect(uc.execute({ name: 'x', reason: 'r' })).rejects.toBeInstanceOf(
        ChangeNotFoundError,
      )
    }
    expect(resolveApproveSpecDeps(createCompositionResolver(gateOn)).approvals).toEqual(
      gateOn.approvals,
    )
  })

  it('ApproveSignoff: config form and resolved-deps form share gate and dependencies', async () => {
    const setup = await setupCompositionFactoryConfig('specd-approve-signoff-equivalence')
    fixture = setup.fixture
    const gateOff = setup.config
    const gateOn: SpecdConfig = { ...setup.config, approvals: { spec: true, signoff: true } }

    const viaDepsOff = createApproveSignoff(
      resolveApproveSignoffDeps(createCompositionResolver(gateOff)),
    )
    const viaConfigOff = createApproveSignoff(gateOff)
    expect(viaDepsOff).toBeInstanceOf(ApproveSignoff)
    for (const uc of [viaDepsOff, viaConfigOff]) {
      await expect(uc.execute({ name: 'x', reason: 'r' })).rejects.toBeInstanceOf(
        ApprovalGateDisabledError,
      )
    }

    const viaDepsOn = createApproveSignoff(
      resolveApproveSignoffDeps(createCompositionResolver(gateOn)),
    )
    const viaConfigOn = createApproveSignoff(gateOn)
    for (const uc of [viaDepsOn, viaConfigOn]) {
      await expect(uc.execute({ name: 'x', reason: 'r' })).rejects.toBeInstanceOf(
        ChangeNotFoundError,
      )
    }
  })
})
