import { type SpecdConfig } from '../../application/specd-config.js'
import {
  CompleteVerification,
  type CompleteVerificationDeps,
} from '../../application/use-cases/complete-verification.js'
import {
  InvalidateVerification,
  type InvalidateVerificationDeps,
} from '../../application/use-cases/invalidate-verification.js'
import {
  ReconcileChangeValidity,
  type ReconcileChangeValidityDeps,
} from '../../application/use-cases/reconcile-change-validity.js'
import {
  StartVerification,
  type StartVerificationDeps,
} from '../../application/use-cases/start-verification.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'
import { resolveWorkflowCheckRegistry } from './workflow-check-registry.js'

export type {
  StartVerificationDeps,
  CompleteVerificationDeps,
  InvalidateVerificationDeps,
  ReconcileChangeValidityDeps,
}

/**
 * Resolves `ReconcileChangeValidity` dependencies from the shared composition resolver.
 *
 * The actor is the resolver's privacy-decorated `ActorResolver`. The fingerprint
 * service and reconciler are the session singletons.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ReconcileChangeValidity`
 */
export function resolveReconcileChangeValidityDeps(
  resolver: CompositionResolver,
): ReconcileChangeValidityDeps {
  return {
    changes: resolver.getChangeRepository(),
    schemaProvider: resolver.getSchemaProvider(),
    actor: resolver.getActorResolver(),
    refreshImplementationTracking: resolver.getRefreshImplementationTracking(),
    fingerprint: resolver.getValidityFingerprintService(),
    approvals: resolver.config.approvals,
  }
}

/**
 * Constructs `ReconcileChangeValidity` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createReconcileChangeValidity(
  deps: ReconcileChangeValidityDeps,
): ReconcileChangeValidity
/**
 * Constructs `ReconcileChangeValidity` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createReconcileChangeValidity(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ReconcileChangeValidity
/**
 * Constructs `ReconcileChangeValidity` from explicit deps or config bootstrap.
 *
 * Options together with explicit deps throw `InvalidCompositionFactoryArgumentsError`.
 * The deps form does not bootstrap a kernel.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createReconcileChangeValidity(
  depsOrConfig: ReconcileChangeValidityDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ReconcileChangeValidity {
  const normalized = normalizeCompositionFactoryArgs(
    'createReconcileChangeValidity',
    depsOrConfig,
    options,
    isReconcileDeps,
  )
  if (normalized.kind === 'deps') return new ReconcileChangeValidity(normalized.deps)
  return createReconcileChangeValidity(
    resolveReconcileChangeValidityDeps(
      createCompositionResolver(normalized.config, normalized.options),
    ),
  )
}

/**
 * Resolves `StartVerification` dependencies from the shared composition resolver.
 *
 * Implementation readiness checks are the registered `impl.filesResolved` and
 * `impl.linksInScope` predicates. The actor, fingerprint service, and reconciler
 * are the same session instances used by the other validity use cases.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `StartVerification`
 */
export function resolveStartVerificationDeps(resolver: CompositionResolver): StartVerificationDeps {
  const registry = resolveWorkflowCheckRegistry(resolver)
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    reconcileChangeValidity: resolver.getReconcileChangeValidity(),
    refreshImplementationTracking: resolver.getRefreshImplementationTracking(),
    fingerprint: resolver.getValidityFingerprintService(),
    schemaProvider: resolver.getSchemaProvider(),
    implementationChecks: registry.transitionBindings
      .map((binding) => binding.check)
      .filter((check) => check.id === 'impl.filesResolved' || check.id === 'impl.linksInScope'),
  }
}

/**
 * Constructs `StartVerification` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createStartVerification(deps: StartVerificationDeps): StartVerification
/**
 * Constructs `StartVerification` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createStartVerification(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): StartVerification
/**
 * Constructs `StartVerification` from explicit deps or config bootstrap.
 *
 * Options together with explicit deps throw `InvalidCompositionFactoryArgumentsError`.
 * The deps form does not bootstrap a kernel.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createStartVerification(
  depsOrConfig: StartVerificationDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): StartVerification {
  const normalized = normalizeCompositionFactoryArgs(
    'createStartVerification',
    depsOrConfig,
    options,
    isStartDeps,
  )
  if (normalized.kind === 'deps') return new StartVerification(normalized.deps)
  return createStartVerification(
    resolveStartVerificationDeps(createCompositionResolver(normalized.config, normalized.options)),
  )
}

/**
 * Resolves `CompleteVerification` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `CompleteVerification`
 */
export function resolveCompleteVerificationDeps(
  resolver: CompositionResolver,
): CompleteVerificationDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    reconcileChangeValidity: resolver.getReconcileChangeValidity(),
    fingerprint: resolver.getValidityFingerprintService(),
  }
}

/**
 * Constructs `CompleteVerification` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createCompleteVerification(deps: CompleteVerificationDeps): CompleteVerification
/**
 * Constructs `CompleteVerification` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createCompleteVerification(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CompleteVerification
/**
 * Constructs `CompleteVerification` from explicit deps or config bootstrap.
 *
 * Options together with explicit deps throw `InvalidCompositionFactoryArgumentsError`.
 * The deps form does not bootstrap a kernel.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createCompleteVerification(
  depsOrConfig: CompleteVerificationDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): CompleteVerification {
  const normalized = normalizeCompositionFactoryArgs(
    'createCompleteVerification',
    depsOrConfig,
    options,
    isCompleteDeps,
  )
  if (normalized.kind === 'deps') return new CompleteVerification(normalized.deps)
  return createCompleteVerification(
    resolveCompleteVerificationDeps(
      createCompositionResolver(normalized.config, normalized.options),
    ),
  )
}

/**
 * Resolves `InvalidateVerification` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `InvalidateVerification`
 */
export function resolveInvalidateVerificationDeps(
  resolver: CompositionResolver,
): InvalidateVerificationDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    reconcileChangeValidity: resolver.getReconcileChangeValidity(),
  }
}

/**
 * Constructs `InvalidateVerification` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createInvalidateVerification(
  deps: InvalidateVerificationDeps,
): InvalidateVerification
/**
 * Constructs `InvalidateVerification` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInvalidateVerification(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateVerification
/**
 * Constructs `InvalidateVerification` from explicit deps or config bootstrap.
 *
 * Options together with explicit deps throw `InvalidCompositionFactoryArgumentsError`.
 * The deps form does not bootstrap a kernel.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInvalidateVerification(
  depsOrConfig: InvalidateVerificationDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateVerification {
  const normalized = normalizeCompositionFactoryArgs(
    'createInvalidateVerification',
    depsOrConfig,
    options,
    isInvalidateDeps,
  )
  if (normalized.kind === 'deps') return new InvalidateVerification(normalized.deps)
  return createInvalidateVerification(
    resolveInvalidateVerificationDeps(
      createCompositionResolver(normalized.config, normalized.options),
    ),
  )
}

/**
 * Type guard for explicit `ReconcileChangeValidityDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isReconcileDeps(
  value: ReconcileChangeValidityDeps | SpecdConfig,
): value is ReconcileChangeValidityDeps {
  return (
    'fingerprint' in value &&
    'refreshImplementationTracking' in value &&
    'approvals' in value &&
    !('projectRoot' in value)
  )
}

/**
 * Type guard for explicit `StartVerificationDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isStartDeps(value: StartVerificationDeps | SpecdConfig): value is StartVerificationDeps {
  return 'implementationChecks' in value && 'reconcileChangeValidity' in value
}

/**
 * Type guard for explicit `CompleteVerificationDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isCompleteDeps(
  value: CompleteVerificationDeps | SpecdConfig,
): value is CompleteVerificationDeps {
  return (
    'reconcileChangeValidity' in value &&
    'fingerprint' in value &&
    !('implementationChecks' in value) &&
    !('refreshImplementationTracking' in value)
  )
}

/**
 * Type guard for explicit `InvalidateVerificationDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isInvalidateDeps(
  value: InvalidateVerificationDeps | SpecdConfig,
): value is InvalidateVerificationDeps {
  return (
    'reconcileChangeValidity' in value && !('fingerprint' in value) && !('schemaProvider' in value)
  )
}
