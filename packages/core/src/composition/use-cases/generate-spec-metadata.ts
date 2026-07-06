import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { GenerateSpecMetadata } from '../../application/use-cases/generate-spec-metadata.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGenerateSpecMetadata}.
 */
export interface GenerateSpecMetadataDeps {
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
}

/**
 * Resolves `GenerateSpecMetadata` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GenerateSpecMetadata`
 */
export function resolveGenerateSpecMetadataDeps(
  resolver: CompositionResolver,
): GenerateSpecMetadataDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
    contentHasher: resolver.getContentHasher(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
  }
}

/**
 * Constructs `GenerateSpecMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGenerateSpecMetadata(deps: GenerateSpecMetadataDeps): GenerateSpecMetadata
/**
 * Constructs `GenerateSpecMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGenerateSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GenerateSpecMetadata
/**
 * Constructs `GenerateSpecMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGenerateSpecMetadata(
  depsOrConfig: GenerateSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GenerateSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createGenerateSpecMetadata',
    depsOrConfig,
    options,
    isGenerateSpecMetadataDeps,
  )
  return createGenerateSpecMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `GenerateSpecMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGenerateSpecMetadataFromNormalized(
  input: FactoryInput<GenerateSpecMetadataDeps, CompositionResolutionOptions>,
): GenerateSpecMetadata {
  if (input.kind === 'deps') {
    const {
      listWorkspaces,
      schemaProvider,
      parsers,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
    } = input.deps
    return new GenerateSpecMetadata(
      listWorkspaces,
      schemaProvider,
      parsers,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGenerateSpecMetadata(resolveGenerateSpecMetadataDeps(resolver))
}

/**
 * Type guard for explicit `GenerateSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGenerateSpecMetadataDeps(
  value: GenerateSpecMetadataDeps | SpecdConfig,
): value is GenerateSpecMetadataDeps {
  return (
    'listWorkspaces' in value &&
    'schemaProvider' in value &&
    'parsers' in value &&
    'contentHasher' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value
  )
}
