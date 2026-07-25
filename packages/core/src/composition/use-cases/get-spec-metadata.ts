import { GetSpecMetadata } from '../../application/use-cases/get-spec-metadata.js'
import { type MaterializeSpecMetadata } from '../../application/use-cases/materialize-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'
import {
  createMaterializeSpecMetadata,
  resolveMaterializeSpecMetadataDeps,
} from './materialize-spec-metadata.js'

/**
 * Explicit dependencies for {@link createGetSpecMetadata}.
 */
export interface GetSpecMetadataDeps {
  /** Use case that materializes spec metadata. */
  readonly materializeSpecMetadata: MaterializeSpecMetadata
}

/**
 * Resolves {@link GetSpecMetadataDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetSpecMetadata`
 */
export function resolveGetSpecMetadataDeps(resolver: CompositionResolver): GetSpecMetadataDeps {
  return {
    materializeSpecMetadata: createMaterializeSpecMetadata(
      resolveMaterializeSpecMetadataDeps(resolver),
    ),
  }
}

/**
 * Constructs `GetSpecMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetSpecMetadata(deps: GetSpecMetadataDeps): GetSpecMetadata
/**
 * Constructs `GetSpecMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecMetadata
/**
 * Constructs `GetSpecMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecMetadata(
  depsOrConfig: GetSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetSpecMetadata',
    depsOrConfig,
    options,
    isGetSpecMetadataDeps,
  )
  if (normalized.kind === 'deps') {
    return new GetSpecMetadata(normalized.deps.materializeSpecMetadata)
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createGetSpecMetadata(resolveGetSpecMetadataDeps(resolver))
}

/**
 * Type guard for explicit `GetSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetSpecMetadataDeps(
  value: GetSpecMetadataDeps | SpecdConfig,
): value is GetSpecMetadataDeps {
  return 'materializeSpecMetadata' in value
}
