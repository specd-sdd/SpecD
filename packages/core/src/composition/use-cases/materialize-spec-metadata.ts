import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { MaterializeSpecMetadata } from '../../application/use-cases/materialize-spec-metadata.js'
import { type GenerateSpecMetadata } from '../../application/use-cases/generate-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import {
  createGenerateSpecMetadata,
  resolveGenerateSpecMetadataDeps,
} from './generate-spec-metadata.js'

/**
 * Explicit dependencies for {@link createMaterializeSpecMetadata}.
 */
export interface MaterializeSpecMetadataDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Use case that generates spec metadata from artifacts. */
  readonly generateSpecMetadata: GenerateSpecMetadata
  /** Content hasher for metadata freshness. */
  readonly contentHasher: ContentHasher
}

/**
 * Resolves {@link MaterializeSpecMetadataDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `MaterializeSpecMetadata`
 */
export function resolveMaterializeSpecMetadataDeps(
  resolver: CompositionResolver,
): MaterializeSpecMetadataDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    generateSpecMetadata: createGenerateSpecMetadata(resolveGenerateSpecMetadataDeps(resolver)),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs `MaterializeSpecMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createMaterializeSpecMetadata(
  deps: MaterializeSpecMetadataDeps,
): MaterializeSpecMetadata
/**
 * Constructs `MaterializeSpecMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createMaterializeSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): MaterializeSpecMetadata
/**
 * Constructs `MaterializeSpecMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createMaterializeSpecMetadata(
  depsOrConfig: MaterializeSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): MaterializeSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createMaterializeSpecMetadata',
    depsOrConfig,
    options,
    isMaterializeSpecMetadataDeps,
  )
  return createMaterializeSpecMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `MaterializeSpecMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createMaterializeSpecMetadataFromNormalized(
  input: FactoryInput<MaterializeSpecMetadataDeps, CompositionResolutionOptions>,
): MaterializeSpecMetadata {
  if (input.kind === 'deps') {
    const { specRepositories, generateSpecMetadata, contentHasher } = input.deps
    return new MaterializeSpecMetadata(specRepositories, generateSpecMetadata, contentHasher)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  const deps = resolveMaterializeSpecMetadataDeps(resolver)
  return new MaterializeSpecMetadata(
    deps.specRepositories,
    deps.generateSpecMetadata,
    deps.contentHasher,
  )
}

/**
 * Type guard for explicit `MaterializeSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isMaterializeSpecMetadataDeps(
  value: MaterializeSpecMetadataDeps | SpecdConfig,
): value is MaterializeSpecMetadataDeps {
  return 'generateSpecMetadata' in value && 'contentHasher' in value
}
