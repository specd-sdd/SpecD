import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { SaveSpecMetadata } from '../../application/use-cases/save-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createSaveSpecMetadata}.
 */
export interface SaveSpecMetadataDeps {
  /** Pre-built spec repositories keyed by workspace. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link SaveSpecMetadataDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `SaveSpecMetadata`
 */
export function resolveSaveSpecMetadataDeps(resolver: CompositionResolver): SaveSpecMetadataDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs a `SaveSpecMetadata` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(deps: SaveSpecMetadataDeps): SaveSpecMetadata
/**
 * Constructs a `SaveSpecMetadata` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SaveSpecMetadata
/**
 * Constructs a `SaveSpecMetadata` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createSaveSpecMetadata(
  depsOrConfig: SaveSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SaveSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createSaveSpecMetadata',
    depsOrConfig,
    options,
    isSaveSpecMetadataDeps,
  )
  return createSaveSpecMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `SaveSpecMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createSaveSpecMetadataFromNormalized(
  input: FactoryInput<SaveSpecMetadataDeps, CompositionResolutionOptions>,
): SaveSpecMetadata {
  if (input.kind === 'deps') {
    return new SaveSpecMetadata(input.deps.specRepositories)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createSaveSpecMetadata(resolveSaveSpecMetadataDeps(resolver))
}

/**
 * Type guard for explicit `SaveSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isSaveSpecMetadataDeps(
  value: SaveSpecMetadataDeps | SpecdConfig,
): value is SaveSpecMetadataDeps {
  return 'specRepositories' in value
}
