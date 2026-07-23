import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { TransitionChange } from '../../application/use-cases/transition-change.js'
import { CountTasks } from '../../application/use-cases/count-tasks.js'
import { createCountTasks, resolveCountTasksDeps } from './count-tasks.js'
import { type RefreshImplementationTracking } from '../../application/use-cases/refresh-implementation-tracking.js'
import { type RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ApprovalGates } from '../../application/use-cases/transition-change.js'
import { type LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createTransitionChange}.
 */
export interface TransitionChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Step hook runner used by the use case. */
  readonly runStepHooks: RunStepHooks
  /** Refresh implementation tracking use case used by the use case. */
  readonly refreshImplementationTracking: RefreshImplementationTracking
  /** Approval gate configuration used by the use case. */
  readonly approvals: ApprovalGates
  /** Lifecycle engine used by the use case. */
  readonly lifecycle: LifecycleEngine
  /** Shared task-completion query used by the use case. */
  readonly countTasks: CountTasks
}

/**
 * Resolves {@link TransitionChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `TransitionChange`
 */
export function resolveTransitionChangeDeps(resolver: CompositionResolver): TransitionChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    schemaProvider: resolver.getSchemaProvider(),
    runStepHooks: resolver.getRunStepHooks(),
    refreshImplementationTracking: resolver.getRefreshImplementationTracking(),
    approvals: resolver.config.approvals,
    lifecycle: resolver.getLifecycleEngine(),
    countTasks: createCountTasks(resolveCountTasksDeps(resolver)),
  }
}

/**
 * Constructs a `TransitionChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(deps: TransitionChangeDeps): TransitionChange
/**
 * Constructs a `TransitionChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): TransitionChange
/**
 * Constructs a `TransitionChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createTransitionChange(
  depsOrConfig: TransitionChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): TransitionChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createTransitionChange',
    depsOrConfig,
    options,
    isTransitionChangeDeps,
  )
  return createTransitionChangeFromNormalized(normalized)
}

/**
 * Applies normalized `TransitionChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createTransitionChangeFromNormalized(
  input: FactoryInput<TransitionChangeDeps, CompositionResolutionOptions>,
): TransitionChange {
  if (input.kind === 'deps') {
    const {
      changes,
      actor,
      schemaProvider,
      runStepHooks,
      refreshImplementationTracking,
      approvals,
      lifecycle,
      countTasks,
    } = input.deps
    return new TransitionChange(
      changes,
      actor,
      schemaProvider,
      runStepHooks,
      refreshImplementationTracking,
      approvals,
      lifecycle,
      countTasks,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createTransitionChange(resolveTransitionChangeDeps(resolver))
}

/**
 * Type guard for explicit `TransitionChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isTransitionChangeDeps(
  value: TransitionChangeDeps | SpecdConfig,
): value is TransitionChangeDeps {
  return (
    'changes' in value &&
    'actor' in value &&
    'schemaProvider' in value &&
    'runStepHooks' in value &&
    'refreshImplementationTracking' in value &&
    'approvals' in value &&
    'lifecycle' in value &&
    'countTasks' in value
  )
}
