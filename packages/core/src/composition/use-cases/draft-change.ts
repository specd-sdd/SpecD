import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { DraftChange } from '../../application/use-cases/draft-change.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createDraftChange}.
 */
export interface DraftChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
}

/**
 * Resolves {@link DraftChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `DraftChange`
 */
export function resolveDraftChangeDeps(resolver: CompositionResolver): DraftChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
  }
}

/**
 * Constructs a `DraftChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createDraftChange(deps: DraftChangeDeps): DraftChange
/**
 * Constructs a `DraftChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createDraftChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): DraftChange
/**
 * Constructs a `DraftChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createDraftChange(
  depsOrConfig: DraftChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): DraftChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createDraftChange',
    depsOrConfig,
    options,
    isDraftChangeDeps,
  )
  return createDraftChangeFromNormalized(normalized)
}

/**
 * Applies normalized `DraftChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createDraftChangeFromNormalized(
  input: FactoryInput<DraftChangeDeps, CompositionResolutionOptions>,
): DraftChange {
  if (input.kind === 'deps') {
    return new DraftChange(input.deps.changes, input.deps.actor)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createDraftChange(resolveDraftChangeDeps(resolver))
}

/**
 * Type guard for explicit `DraftChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isDraftChangeDeps(value: DraftChangeDeps | SpecdConfig): value is DraftChangeDeps {
  return 'changes' in value && 'actor' in value
}
