import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { DiscardChange } from '../../application/use-cases/discard-change.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createDiscardChange}.
 */
export interface DiscardChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
}

/**
 * Resolves {@link DiscardChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `DiscardChange`
 */
export function resolveDiscardChangeDeps(resolver: CompositionResolver): DiscardChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
  }
}

/**
 * Constructs a `DiscardChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createDiscardChange(deps: DiscardChangeDeps): DiscardChange
/**
 * Constructs a `DiscardChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createDiscardChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): DiscardChange
/**
 * Constructs a `DiscardChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createDiscardChange(
  depsOrConfig: DiscardChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): DiscardChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createDiscardChange',
    depsOrConfig,
    options,
    isDiscardChangeDeps,
  )
  return createDiscardChangeFromNormalized(normalized)
}

/**
 * Applies normalized `DiscardChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createDiscardChangeFromNormalized(
  input: FactoryInput<DiscardChangeDeps, CompositionResolutionOptions>,
): DiscardChange {
  if (input.kind === 'deps') {
    return new DiscardChange(input.deps.changes, input.deps.actor)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createDiscardChange(resolveDiscardChangeDeps(resolver))
}

/**
 * Type guard for explicit `DiscardChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isDiscardChangeDeps(value: DiscardChangeDeps | SpecdConfig): value is DiscardChangeDeps {
  return 'changes' in value && 'actor' in value
}
