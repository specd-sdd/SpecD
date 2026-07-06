import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { GetStatus } from '../../application/use-cases/get-status.js'
import { type RefreshImplementationTracking } from '../../application/use-cases/refresh-implementation-tracking.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetStatus}.
 */
export interface GetStatusDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Approval gate configuration used by the use case. */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  /** Refresh implementation tracking use case used by the use case. */
  readonly refreshImplementationTracking: RefreshImplementationTracking
  /** Lifecycle engine used by the use case. */
  readonly lifecycle: LifecycleEngine
}

/**
 * Resolves {@link GetStatusDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetStatus`
 */
export function resolveGetStatusDeps(resolver: CompositionResolver): GetStatusDeps {
  return {
    changes: resolver.getChangeRepository(),
    schemaProvider: resolver.getSchemaProvider(),
    approvals: resolver.config.approvals,
    refreshImplementationTracking: resolver.getRefreshImplementationTracking(),
    lifecycle: resolver.getLifecycleEngine(),
  }
}

/**
 * Constructs a `GetStatus` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetStatus(deps: GetStatusDeps): GetStatus
/**
 * Constructs a `GetStatus` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetStatus(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetStatus
/**
 * Constructs a `GetStatus` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetStatus(
  depsOrConfig: GetStatusDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetStatus {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetStatus',
    depsOrConfig,
    options,
    isGetStatusDeps,
  )
  return createGetStatusFromNormalized(normalized)
}

/**
 * Applies normalized `GetStatus` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetStatusFromNormalized(
  input: FactoryInput<GetStatusDeps, CompositionResolutionOptions>,
): GetStatus {
  if (input.kind === 'deps') {
    const { changes, schemaProvider, approvals, refreshImplementationTracking, lifecycle } =
      input.deps
    return new GetStatus(
      changes,
      schemaProvider,
      approvals,
      refreshImplementationTracking,
      lifecycle,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetStatus(resolveGetStatusDeps(resolver))
}

/**
 * Type guard for explicit `GetStatusDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetStatusDeps(value: GetStatusDeps | SpecdConfig): value is GetStatusDeps {
  return (
    'changes' in value &&
    'schemaProvider' in value &&
    'approvals' in value &&
    'refreshImplementationTracking' in value &&
    'lifecycle' in value
  )
}
