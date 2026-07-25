import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { UpdatePersistedSpecSchema } from '../../application/use-cases/update-persisted-spec-schema.js'
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
 * Explicit dependencies for {@link createUpdatePersistedSpecSchema}.
 */
export interface UpdatePersistedSpecSchemaDeps {
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
 * Resolves {@link UpdatePersistedSpecSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `UpdatePersistedSpecSchema`
 */
export function resolveUpdatePersistedSpecSchemaDeps(
  resolver: CompositionResolver,
): UpdatePersistedSpecSchemaDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    getActiveSchema: createGetActiveSchema(resolveGetActiveSchemaDeps(resolver)),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs `UpdatePersistedSpecSchema` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecSchema(
  deps: UpdatePersistedSpecSchemaDeps,
): UpdatePersistedSpecSchema
/**
 * Constructs `UpdatePersistedSpecSchema` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecSchema
/**
 * Constructs `UpdatePersistedSpecSchema` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdatePersistedSpecSchema(
  depsOrConfig: UpdatePersistedSpecSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdatePersistedSpecSchema {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdatePersistedSpecSchema',
    depsOrConfig,
    options,
    isUpdatePersistedSpecSchemaDeps,
  )
  return createUpdatePersistedSpecSchemaFromNormalized(normalized)
}

/**
 * Applies normalized `UpdatePersistedSpecSchema` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdatePersistedSpecSchemaFromNormalized(
  input: FactoryInput<UpdatePersistedSpecSchemaDeps, CompositionResolutionOptions>,
): UpdatePersistedSpecSchema {
  if (input.kind === 'deps') {
    const { specRepositories, getActiveSchema, parsers, extractorTransforms, contentHasher } =
      input.deps
    return new UpdatePersistedSpecSchema(specRepositories, getActiveSchema, {
      parsers,
      extractorTransforms,
      hasher: contentHasher,
    })
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createUpdatePersistedSpecSchema(resolveUpdatePersistedSpecSchemaDeps(resolver))
}

/**
 * Type guard for explicit `UpdatePersistedSpecSchemaDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdatePersistedSpecSchemaDeps(
  value: UpdatePersistedSpecSchemaDeps | SpecdConfig,
): value is UpdatePersistedSpecSchemaDeps {
  return 'getActiveSchema' in value && 'contentHasher' in value
}
