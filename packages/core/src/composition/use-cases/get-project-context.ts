import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type FileReader } from '../../application/ports/file-reader.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { type CompileContextConfig } from '../../application/use-cases/compile-context.js'
import { GetProjectContext } from '../../application/use-cases/get-project-context.js'
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
 * Explicit dependencies for {@link createGetProjectContext}.
 */
export interface GetProjectContextDeps {
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly fileReader: FileReader
  readonly parsers: ArtifactParserRegistry
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly defaultConfig: CompileContextConfig
}

/**
 * Resolves `GetProjectContext` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetProjectContext`
 */
export function resolveGetProjectContextDeps(resolver: CompositionResolver): GetProjectContextDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
    schemaProvider: resolver.getSchemaProvider(),
    fileReader: resolver.getFileReader(),
    parsers: resolver.getArtifactParserRegistry(),
    contentHasher: resolver.getContentHasher(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
    defaultConfig: resolver.getCompileContextConfig(),
  }
}

/**
 * Constructs `GetProjectContext` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(deps: GetProjectContextDeps): GetProjectContext
/**
 * Constructs `GetProjectContext` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectContext
/**
 * Constructs `GetProjectContext` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(
  depsOrConfig: GetProjectContextDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectContext {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetProjectContext',
    depsOrConfig,
    options,
    isGetProjectContextDeps,
  )
  return createGetProjectContextFromNormalized(normalized)
}

/**
 * Applies normalized `GetProjectContext` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetProjectContextFromNormalized(
  input: FactoryInput<GetProjectContextDeps, CompositionResolutionOptions>,
): GetProjectContext {
  if (input.kind === 'deps') {
    const {
      listWorkspaces,
      schemaProvider,
      fileReader,
      parsers,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
      defaultConfig,
    } = input.deps
    return new GetProjectContext(
      listWorkspaces,
      schemaProvider,
      fileReader,
      parsers,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
      defaultConfig,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetProjectContext(resolveGetProjectContextDeps(resolver))
}

/**
 * Type guard for explicit `GetProjectContextDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetProjectContextDeps(
  value: GetProjectContextDeps | SpecdConfig,
): value is GetProjectContextDeps {
  return (
    'listWorkspaces' in value &&
    'schemaProvider' in value &&
    'fileReader' in value &&
    'parsers' in value &&
    'contentHasher' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value &&
    'defaultConfig' in value
  )
}
