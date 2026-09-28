import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompleteVerification } from '../../../src/application/use-cases/complete-verification.js'
import { InvalidateVerification } from '../../../src/application/use-cases/invalidate-verification.js'
import { ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { StartVerification } from '../../../src/application/use-cases/start-verification.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createCompleteVerification,
  createInvalidateVerification,
  createReconcileChangeValidity,
  createStartVerification,
  resolveCompleteVerificationDeps,
  resolveInvalidateVerificationDeps,
  resolveReconcileChangeValidityDeps,
  resolveStartVerificationDeps,
  type CompleteVerificationDeps,
  type InvalidateVerificationDeps,
  type ReconcileChangeValidityDeps,
  type StartVerificationDeps,
} from '../../../src/composition/use-cases/verification-factories.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import * as kernelModule from '../../../src/composition/kernel.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

const noopRefresh = { execute: async () => undefined }

function reconcileDeps(): ReconcileChangeValidityDeps {
  return {
    changes: {} as never,
    schemaProvider: {} as never,
    actor: { identity: async () => ({ name: 'direct', email: 'direct@example.com' }) },
    refreshImplementationTracking: noopRefresh as never,
    fingerprint: {} as never,
    approvals: { spec: false, signoff: false },
  }
}

function startDeps(): StartVerificationDeps {
  return {
    changes: {} as never,
    actor: { identity: async () => ({ name: 'direct', email: 'direct@example.com' }) },
    reconcileChangeValidity: {} as never,
    refreshImplementationTracking: noopRefresh as never,
    fingerprint: {} as never,
    schemaProvider: {} as never,
    implementationChecks: [],
  }
}

function completeDeps(): CompleteVerificationDeps {
  return {
    changes: {} as never,
    actor: { identity: async () => ({ name: 'direct', email: 'direct@example.com' }) },
    reconcileChangeValidity: {} as never,
    fingerprint: {} as never,
  }
}

function invalidateDeps(): InvalidateVerificationDeps {
  return {
    changes: {} as never,
    actor: { identity: async () => ({ name: 'direct', email: 'direct@example.com' }) },
    reconcileChangeValidity: {} as never,
  }
}

describe('verification composition factories', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
    vi.restoreAllMocks()
  })

  it('constructs the same use cases from deps and from config', async () => {
    const setup = await setupCompositionFactoryConfig('specd-verification-factories')
    fixture = setup.fixture

    expect(createReconcileChangeValidity(reconcileDeps())).toBeInstanceOf(ReconcileChangeValidity)
    expect(createReconcileChangeValidity(setup.config)).toBeInstanceOf(ReconcileChangeValidity)
    expect(createStartVerification(startDeps())).toBeInstanceOf(StartVerification)
    expect(createStartVerification(setup.config)).toBeInstanceOf(StartVerification)
    expect(createCompleteVerification(completeDeps())).toBeInstanceOf(CompleteVerification)
    expect(createCompleteVerification(setup.config)).toBeInstanceOf(CompleteVerification)
    expect(createInvalidateVerification(invalidateDeps())).toBeInstanceOf(InvalidateVerification)
    expect(createInvalidateVerification(setup.config)).toBeInstanceOf(InvalidateVerification)
  })

  it('rejects composition options together with explicit deps', () => {
    const options = { extraNodeModulesPaths: [] }
    expect(() =>
      createReconcileChangeValidity(reconcileDeps() as unknown as SpecdConfig, options),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
    expect(() => createStartVerification(startDeps() as unknown as SpecdConfig, options)).toThrow(
      InvalidCompositionFactoryArgumentsError,
    )
    expect(() =>
      createCompleteVerification(completeDeps() as unknown as SpecdConfig, options),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
    expect(() =>
      createInvalidateVerification(invalidateDeps() as unknown as SpecdConfig, options),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('does not bootstrap a kernel when given explicit deps', () => {
    const createKernel = vi.spyOn(kernelModule, 'createKernel')
    createReconcileChangeValidity(reconcileDeps())
    createStartVerification(startDeps())
    createCompleteVerification(completeDeps())
    createInvalidateVerification(invalidateDeps())
    expect(createKernel).not.toHaveBeenCalled()
  })

  it('reuses one fingerprint service, reconciler, and privacy actor resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-verification-shared')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const reconcile = resolveReconcileChangeValidityDeps(resolver)
    const start = resolveStartVerificationDeps(resolver)
    const complete = resolveCompleteVerificationDeps(resolver)
    const invalidate = resolveInvalidateVerificationDeps(resolver)

    expect(reconcile.actor).toBe(resolver.getActorResolver())
    expect(start.actor).toBe(resolver.getActorResolver())
    expect(complete.actor).toBe(resolver.getActorResolver())
    expect(invalidate.actor).toBe(resolver.getActorResolver())
    expect(reconcile.fingerprint).toBe(resolver.getValidityFingerprintService())
    expect(start.fingerprint).toBe(reconcile.fingerprint)
    expect(complete.fingerprint).toBe(reconcile.fingerprint)
    expect(start.reconcileChangeValidity).toBe(resolver.getReconcileChangeValidity())
    expect(complete.reconcileChangeValidity).toBe(start.reconcileChangeValidity)
    expect(invalidate.reconcileChangeValidity).toBe(start.reconcileChangeValidity)
    expect(start.schemaProvider).toBe(resolver.getSchemaProvider())
    expect(start.implementationChecks.map((check) => check.id)).toEqual([
      'impl.filesResolved',
      'impl.linksInScope',
    ])
  })
})
