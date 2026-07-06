import { ListDiscarded } from '../../application/use-cases/list-discarded.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListDiscarded}.
 */
export interface ListDiscardedDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link ListDiscardedDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListDiscarded`
 */
export function resolveListDiscardedDeps(resolver: CompositionResolver): ListDiscardedDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `ListDiscarded` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(deps: ListDiscardedDeps): ListDiscarded
/**
 * Constructs a `ListDiscarded` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListDiscarded
/**
 * Constructs a `ListDiscarded` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListDiscarded(
  depsOrConfig: ListDiscardedDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListDiscarded {
  const normalized = normalizeCompositionFactoryArgs(
    'createListDiscarded',
    depsOrConfig,
    options,
    isListDiscardedDeps,
  )
  return createListDiscardedFromNormalized(normalized)
}

/**
 * Applies normalized `ListDiscarded` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListDiscardedFromNormalized(
  input: FactoryInput<ListDiscardedDeps, CompositionResolutionOptions>,
): ListDiscarded {
  if (input.kind === 'deps') {
    return new ListDiscarded(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListDiscarded(resolveListDiscardedDeps(resolver))
}

/**
 * Type guard for explicit `ListDiscardedDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListDiscardedDeps(value: ListDiscardedDeps | SpecdConfig): value is ListDiscardedDeps {
  return 'changes' in value
}
