import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { UpdatePersistedSpecDeps } from '../../application/use-cases/update-persisted-spec-deps.js'
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
 * Explicit dependencies for {@link createUpdatePersistedSpecDeps}.
 */
export interface UpdatePersistedSpecDepsDeps {
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
 * Resolves {@link UpdatePersistedSpecDepsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `UpdatePersistedSpecDeps`
 */
export function resolveUpdatePersistedSpecDepsDeps(
  resolver: CompositionResolver,
): UpdatePersistedSpecDepsDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    getActiveSchema: createGetActiveSchema(resolveGetActiveSchemaDeps(resolver)),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs `UpdatePersistedSpecDeps` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecDeps(
  deps: UpdatePersistedSpecDepsDeps,
): UpdatePersistedSpecDeps
/**
 * Constructs `UpdatePersistedSpecDeps` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecDeps(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecDeps
/**
 * Constructs `UpdatePersistedSpecDeps` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecDeps(
  depsOrConfig: UpdatePersistedSpecDepsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecDeps {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdatePersistedSpecDeps',
    depsOrConfig,
    options,
    isUpdatePersistedSpecDepsDeps,
  )
  return createUpdatePersistedSpecDepsFromNormalized(normalized)
}

/**
 * Applies normalized `UpdatePersistedSpecDeps` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdatePersistedSpecDepsFromNormalized(
  input: FactoryInput<UpdatePersistedSpecDepsDeps, CompositionResolutionOptions>,
): UpdatePersistedSpecDeps {
  if (input.kind === 'deps') {
    const { specRepositories, getActiveSchema, parsers, extractorTransforms, contentHasher } =
      input.deps
    return new UpdatePersistedSpecDeps(specRepositories, getActiveSchema, {
      parsers,
      extractorTransforms,
      hasher: contentHasher,
    })
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createUpdatePersistedSpecDeps(resolveUpdatePersistedSpecDepsDeps(resolver))
}

/**
 * Type guard for explicit `UpdatePersistedSpecDepsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdatePersistedSpecDepsDeps(
  value: UpdatePersistedSpecDepsDeps | SpecdConfig,
): value is UpdatePersistedSpecDepsDeps {
  return 'getActiveSchema' in value && 'contentHasher' in value
}
