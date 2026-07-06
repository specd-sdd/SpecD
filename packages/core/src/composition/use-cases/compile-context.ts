import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type FileReader } from '../../application/ports/file-reader.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import {
  CompileContext,
  type CompileContextConfig,
} from '../../application/use-cases/compile-context.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type PreviewSpec } from '../../application/use-cases/preview-spec.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { type LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createPreviewSpec } from './preview-spec.js'

/**
 * Explicit dependencies for {@link createCompileContext}.
 */
export interface CompileContextDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly fileReader: FileReader
  readonly parsers: ArtifactParserRegistry
  readonly contentHasher: ContentHasher
  readonly previewSpec: PreviewSpec
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly lifecycle: LifecycleEngine
  readonly defaultConfig: CompileContextConfig
}

/**
 * Resolves `CompileContext` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `CompileContext`
 */
export function resolveCompileContextDeps(resolver: CompositionResolver): CompileContextDeps {
  return {
    changes: resolver.getChangeRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
    schemaProvider: resolver.getSchemaProvider(),
    fileReader: resolver.getFileReader(),
    parsers: resolver.getArtifactParserRegistry(),
    contentHasher: resolver.getContentHasher(),
    previewSpec: createPreviewSpec({
      changes: resolver.getChangeRepository(),
      specs: resolver.getSpecRepositories(),
      schemaProvider: resolver.getSchemaProvider(),
      parsers: resolver.getArtifactParserRegistry(),
    }),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
    lifecycle: resolver.getLifecycleEngine(),
    defaultConfig: resolver.getCompileContextConfig(),
  }
}

/**
 * Constructs `CompileContext` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createCompileContext(deps: CompileContextDeps): CompileContext
/**
 * Constructs `CompileContext` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createCompileContext(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CompileContext
/**
 * Constructs `CompileContext` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createCompileContext(
  depsOrConfig: CompileContextDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): CompileContext {
  const normalized = normalizeCompositionFactoryArgs(
    'createCompileContext',
    depsOrConfig,
    options,
    isCompileContextDeps,
  )
  return createCompileContextFromNormalized(normalized)
}

/**
 * Applies normalized `CompileContext` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createCompileContextFromNormalized(
  input: FactoryInput<CompileContextDeps, CompositionResolutionOptions>,
): CompileContext {
  if (input.kind === 'deps') {
    const {
      changes,
      listWorkspaces,
      schemaProvider,
      fileReader,
      parsers,
      contentHasher,
      previewSpec,
      extractorTransforms,
      workspaceRoutes,
      lifecycle,
      defaultConfig,
    } = input.deps
    return new CompileContext(
      changes,
      listWorkspaces,
      schemaProvider,
      fileReader,
      parsers,
      contentHasher,
      previewSpec,
      extractorTransforms,
      workspaceRoutes,
      lifecycle,
      defaultConfig,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createCompileContext(resolveCompileContextDeps(resolver))
}

/**
 * Type guard for explicit `CompileContextDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isCompileContextDeps(
  value: CompileContextDeps | SpecdConfig,
): value is CompileContextDeps {
  return (
    'changes' in value &&
    'listWorkspaces' in value &&
    'schemaProvider' in value &&
    'fileReader' in value &&
    'parsers' in value &&
    'contentHasher' in value &&
    'previewSpec' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value &&
    'lifecycle' in value &&
    'defaultConfig' in value
  )
}
