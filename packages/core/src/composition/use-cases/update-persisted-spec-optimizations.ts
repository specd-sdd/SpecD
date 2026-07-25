import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { UpdatePersistedSpecOptimizations } from '../../application/use-cases/update-persisted-spec-optimizations.js'
import { type GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createGetActiveSchema, resolveGetActiveSchemaDeps } from './get-active-schema.js'

/**
 * Explicit dependencies for {@link createUpdatePersistedSpecOptimizations}.
 */
export interface UpdatePersistedSpecOptimizationsDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Use case resolving the active project schema. */
  readonly getActiveSchema: GetActiveSchema
  /** Artifact parser registry. */
  readonly parsers: ArtifactParserRegistry
  /** Metadata extractor transforms. */
  readonly extractorTransforms: ExtractorTransformRegistry
  /** Content hasher for metadata freshness. */
  readonly contentHasher: ContentHasher
}

/**
 * Resolves {@link UpdatePersistedSpecOptimizationsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `UpdatePersistedSpecOptimizations`
 */
export function resolveUpdatePersistedSpecOptimizationsDeps(
  resolver: CompositionResolver,
): UpdatePersistedSpecOptimizationsDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    getActiveSchema: createGetActiveSchema(resolveGetActiveSchemaDeps(resolver)),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs `UpdatePersistedSpecOptimizations` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecOptimizations(
  deps: UpdatePersistedSpecOptimizationsDeps,
): UpdatePersistedSpecOptimizations
/**
 * Constructs `UpdatePersistedSpecOptimizations` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecOptimizations(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecOptimizations
/**
 * Constructs `UpdatePersistedSpecOptimizations` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecOptimizations(
  depsOrConfig: UpdatePersistedSpecOptimizationsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecOptimizations {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdatePersistedSpecOptimizations',
    depsOrConfig,
    options,
    isUpdatePersistedSpecOptimizationsDeps,
  )
  return createUpdatePersistedSpecOptimizationsFromNormalized(normalized)
}

/**
 * Applies normalized `UpdatePersistedSpecOptimizations` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdatePersistedSpecOptimizationsFromNormalized(
  input: FactoryInput<UpdatePersistedSpecOptimizationsDeps, CompositionResolutionOptions>,
): UpdatePersistedSpecOptimizations {
  if (input.kind === 'deps') {
    const { specRepositories, getActiveSchema, parsers, extractorTransforms, contentHasher } =
      input.deps
    return new UpdatePersistedSpecOptimizations(specRepositories, getActiveSchema, {
      parsers,
      extractorTransforms,
      hasher: contentHasher,
    })
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createUpdatePersistedSpecOptimizations(
    resolveUpdatePersistedSpecOptimizationsDeps(resolver),
  )
}

/**
 * Type guard for explicit `UpdatePersistedSpecOptimizationsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdatePersistedSpecOptimizationsDeps(
  value: UpdatePersistedSpecOptimizationsDeps | SpecdConfig,
): value is UpdatePersistedSpecOptimizationsDeps {
  return 'getActiveSchema' in value && 'contentHasher' in value
}
