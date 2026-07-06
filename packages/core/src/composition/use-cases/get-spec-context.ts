import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { GetSpecContext } from '../../application/use-cases/get-spec-context.js'
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
 * Explicit dependencies for {@link createGetSpecContext}.
 */
export interface GetSpecContextDeps {
  readonly listWorkspaces: ListWorkspaces
  readonly contentHasher: ContentHasher
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
}

/**
 * Resolves `GetSpecContext` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetSpecContext`
 */
export function resolveGetSpecContextDeps(resolver: CompositionResolver): GetSpecContextDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
    contentHasher: resolver.getContentHasher(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
  }
}

/**
 * Constructs `GetSpecContext` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(deps: GetSpecContextDeps): GetSpecContext
/**
 * Constructs `GetSpecContext` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecContext
/**
 * Constructs `GetSpecContext` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecContext(
  depsOrConfig: GetSpecContextDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecContext {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetSpecContext',
    depsOrConfig,
    options,
    isGetSpecContextDeps,
  )
  return createGetSpecContextFromNormalized(normalized)
}

/**
 * Applies normalized `GetSpecContext` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetSpecContextFromNormalized(
  input: FactoryInput<GetSpecContextDeps, CompositionResolutionOptions>,
): GetSpecContext {
  if (input.kind === 'deps') {
    const {
      listWorkspaces,
      contentHasher,
      schemaProvider,
      parsers,
      extractorTransforms,
      workspaceRoutes,
    } = input.deps
    return new GetSpecContext(
      listWorkspaces,
      contentHasher,
      schemaProvider,
      parsers,
      extractorTransforms,
      workspaceRoutes,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetSpecContext(resolveGetSpecContextDeps(resolver))
}

/**
 * Type guard for explicit `GetSpecContextDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetSpecContextDeps(
  value: GetSpecContextDeps | SpecdConfig,
): value is GetSpecContextDeps {
  return (
    'listWorkspaces' in value &&
    'contentHasher' in value &&
    'schemaProvider' in value &&
    'parsers' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value
  )
}
