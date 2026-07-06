import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { ValidateSpecs } from '../../application/use-cases/validate-specs.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createValidateSpecs}.
 */
export interface ValidateSpecsDeps {
  readonly specs: ReadonlyMap<string, SpecRepository>
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
}

/**
 * Resolves `ValidateSpecs` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ValidateSpecs`
 */
export function resolveValidateSpecsDeps(resolver: CompositionResolver): ValidateSpecsDeps {
  return {
    specs: resolver.getSpecRepositories(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
    contentHasher: resolver.getContentHasher(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
  }
}

/**
 * Constructs `ValidateSpecs` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(deps: ValidateSpecsDeps): ValidateSpecs
/**
 * Constructs `ValidateSpecs` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateSpecs
/**
 * Constructs `ValidateSpecs` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(
  depsOrConfig: ValidateSpecsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateSpecs {
  const normalized = normalizeCompositionFactoryArgs(
    'createValidateSpecs',
    depsOrConfig,
    options,
    isValidateSpecsDeps,
  )
  return createValidateSpecsFromNormalized(normalized)
}

/**
 * Applies normalized `ValidateSpecs` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createValidateSpecsFromNormalized(
  input: FactoryInput<ValidateSpecsDeps, CompositionResolutionOptions>,
): ValidateSpecs {
  if (input.kind === 'deps') {
    const { specs, schemaProvider, parsers, contentHasher, extractorTransforms, workspaceRoutes } =
      input.deps
    return new ValidateSpecs(
      specs,
      schemaProvider,
      parsers,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createValidateSpecs(resolveValidateSpecsDeps(resolver))
}

/**
 * Type guard for explicit `ValidateSpecsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isValidateSpecsDeps(value: ValidateSpecsDeps | SpecdConfig): value is ValidateSpecsDeps {
  return (
    'specs' in value &&
    'schemaProvider' in value &&
    'parsers' in value &&
    'contentHasher' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value
  )
}
