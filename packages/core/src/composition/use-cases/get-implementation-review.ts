import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { GetImplementationReview } from '../../application/use-cases/get-implementation-review.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetImplementationReview}.
 */
export interface GetImplementationReviewDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link GetImplementationReviewDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetImplementationReview`
 */
export function resolveGetImplementationReviewDeps(
  resolver: CompositionResolver,
): GetImplementationReviewDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `GetImplementationReview` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetImplementationReview(
  deps: GetImplementationReviewDeps,
): GetImplementationReview
/**
 * Constructs a `GetImplementationReview` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetImplementationReview(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetImplementationReview
/**
 * Constructs a `GetImplementationReview` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetImplementationReview(
  depsOrConfig: GetImplementationReviewDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetImplementationReview {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetImplementationReview',
    depsOrConfig,
    options,
    isGetImplementationReviewDeps,
  )
  return createGetImplementationReviewFromNormalized(normalized)
}

/**
 * Applies normalized `GetImplementationReview` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetImplementationReviewFromNormalized(
  input: FactoryInput<GetImplementationReviewDeps, CompositionResolutionOptions>,
): GetImplementationReview {
  if (input.kind === 'deps') {
    return new GetImplementationReview(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetImplementationReview(resolveGetImplementationReviewDeps(resolver))
}

/**
 * Type guard for explicit `GetImplementationReviewDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetImplementationReviewDeps(
  value: GetImplementationReviewDeps | SpecdConfig,
): value is GetImplementationReviewDeps {
  return 'changes' in value
}
