import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { RestoreChange } from '../../application/use-cases/restore-change.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createRestoreChange}.
 */
export interface RestoreChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
}

/**
 * Resolves {@link RestoreChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `RestoreChange`
 */
export function resolveRestoreChangeDeps(resolver: CompositionResolver): RestoreChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
  }
}

/**
 * Constructs a `RestoreChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(deps: RestoreChangeDeps): RestoreChange
/**
 * Constructs a `RestoreChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): RestoreChange
/**
 * Constructs a `RestoreChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createRestoreChange(
  depsOrConfig: RestoreChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): RestoreChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createRestoreChange',
    depsOrConfig,
    options,
    isRestoreChangeDeps,
  )
  return createRestoreChangeFromNormalized(normalized)
}

/**
 * Applies normalized `RestoreChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createRestoreChangeFromNormalized(
  input: FactoryInput<RestoreChangeDeps, CompositionResolutionOptions>,
): RestoreChange {
  if (input.kind === 'deps') {
    return new RestoreChange(input.deps.changes, input.deps.actor)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createRestoreChange(resolveRestoreChangeDeps(resolver))
}

/**
 * Type guard for explicit `RestoreChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isRestoreChangeDeps(value: RestoreChangeDeps | SpecdConfig): value is RestoreChangeDeps {
  return 'changes' in value && 'actor' in value
}
