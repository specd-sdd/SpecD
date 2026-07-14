import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetSpecOutline } from '../../application/use-cases/get-spec-outline.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetSpecOutline}.
 */
export interface GetSpecOutlineDeps {
  readonly specs: ReadonlyMap<string, SpecRepository>
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
}

/**
 * Resolves `GetSpecOutline` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetSpecOutline`
 */
export function resolveGetSpecOutlineDeps(resolver: CompositionResolver): GetSpecOutlineDeps {
  return {
    specs: resolver.getSpecRepositories(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
  }
}

/**
 * Constructs `GetSpecOutline` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(deps: GetSpecOutlineDeps): GetSpecOutline
/**
 * Constructs `GetSpecOutline` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecOutline
/**
 * Constructs `GetSpecOutline` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecOutline(
  depsOrConfig: GetSpecOutlineDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecOutline {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetSpecOutline',
    depsOrConfig,
    options,
    isGetSpecOutlineDeps,
  )
  return createGetSpecOutlineFromNormalized(normalized)
}

/**
 * Applies normalized `GetSpecOutline` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetSpecOutlineFromNormalized(
  input: FactoryInput<GetSpecOutlineDeps, CompositionResolutionOptions>,
): GetSpecOutline {
  if (input.kind === 'deps') {
    const { specs, schemaProvider, parsers } = input.deps
    return new GetSpecOutline(specs, schemaProvider, parsers)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetSpecOutline(resolveGetSpecOutlineDeps(resolver))
}

/**
 * Type guard for explicit `GetSpecOutlineDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetSpecOutlineDeps(
  value: GetSpecOutlineDeps | SpecdConfig,
): value is GetSpecOutlineDeps {
  return 'specs' in value && 'schemaProvider' in value && 'parsers' in value
}
