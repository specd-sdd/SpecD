import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { InvalidateSpecMetadata } from '../../application/use-cases/invalidate-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createInvalidateSpecMetadata}.
 */
export interface InvalidateSpecMetadataDeps {
  /** Pre-built spec repositories keyed by workspace. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link InvalidateSpecMetadataDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `InvalidateSpecMetadata`
 */
export function resolveInvalidateSpecMetadataDeps(
  resolver: CompositionResolver,
): InvalidateSpecMetadataDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs an `InvalidateSpecMetadata` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(
  deps: InvalidateSpecMetadataDeps,
): InvalidateSpecMetadata
/**
 * Constructs an `InvalidateSpecMetadata` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateSpecMetadata
/**
 * Constructs an `InvalidateSpecMetadata` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createInvalidateSpecMetadata(
  depsOrConfig: InvalidateSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createInvalidateSpecMetadata',
    depsOrConfig,
    options,
    isInvalidateSpecMetadataDeps,
  )
  return createInvalidateSpecMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `InvalidateSpecMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createInvalidateSpecMetadataFromNormalized(
  input: FactoryInput<InvalidateSpecMetadataDeps, CompositionResolutionOptions>,
): InvalidateSpecMetadata {
  if (input.kind === 'deps') {
    return new InvalidateSpecMetadata(input.deps.specRepositories)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createInvalidateSpecMetadata(resolveInvalidateSpecMetadataDeps(resolver))
}

/**
 * Type guard for explicit `InvalidateSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isInvalidateSpecMetadataDeps(
  value: InvalidateSpecMetadataDeps | SpecdConfig,
): value is InvalidateSpecMetadataDeps {
  return 'specRepositories' in value
}
