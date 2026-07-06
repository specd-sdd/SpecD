import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { GetDiscarded } from '../../application/use-cases/get-discarded.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetDiscarded}.
 */
export interface GetDiscardedDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link GetDiscardedDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetDiscarded`
 */
export function resolveGetDiscardedDeps(resolver: CompositionResolver): GetDiscardedDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `GetDiscarded` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(deps: GetDiscardedDeps): GetDiscarded
/**
 * Constructs a `GetDiscarded` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetDiscarded
/**
 * Constructs a `GetDiscarded` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetDiscarded(
  depsOrConfig: GetDiscardedDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetDiscarded {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetDiscarded',
    depsOrConfig,
    options,
    isGetDiscardedDeps,
  )
  return createGetDiscardedFromNormalized(normalized)
}

/**
 * Applies normalized `GetDiscarded` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetDiscardedFromNormalized(
  input: FactoryInput<GetDiscardedDeps, CompositionResolutionOptions>,
): GetDiscarded {
  if (input.kind === 'deps') {
    return new GetDiscarded(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetDiscarded(resolveGetDiscardedDeps(resolver))
}

/**
 * Type guard for explicit `GetDiscardedDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetDiscardedDeps(value: GetDiscardedDeps | SpecdConfig): value is GetDiscardedDeps {
  return 'changes' in value
}
