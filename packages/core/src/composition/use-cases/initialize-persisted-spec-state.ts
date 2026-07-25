import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { InitializePersistedSpecState } from '../../application/use-cases/initialize-persisted-spec-state.js'
import { type GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
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
import { createListWorkspaces, resolveListWorkspacesDeps } from './list-workspaces.js'

/**
 * Explicit dependencies for {@link createInitializePersistedSpecState}.
 */
export interface InitializePersistedSpecStateDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Use case listing configured workspaces. */
  readonly listWorkspaces: ListWorkspaces
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
 * Resolves {@link InitializePersistedSpecStateDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `InitializePersistedSpecState`
 */
export function resolveInitializePersistedSpecStateDeps(
  resolver: CompositionResolver,
): InitializePersistedSpecStateDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    listWorkspaces: createListWorkspaces(resolveListWorkspacesDeps(resolver)),
    getActiveSchema: createGetActiveSchema(resolveGetActiveSchemaDeps(resolver)),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs `InitializePersistedSpecState` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createInitializePersistedSpecState(
  deps: InitializePersistedSpecStateDeps,
): InitializePersistedSpecState
/**
 * Constructs `InitializePersistedSpecState` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInitializePersistedSpecState(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): InitializePersistedSpecState
/**
 * Constructs `InitializePersistedSpecState` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInitializePersistedSpecState(
  depsOrConfig: InitializePersistedSpecStateDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): InitializePersistedSpecState {
  const normalized = normalizeCompositionFactoryArgs(
    'createInitializePersistedSpecState',
    depsOrConfig,
    options,
    isInitializePersistedSpecStateDeps,
  )
  return createInitializePersistedSpecStateFromNormalized(normalized)
}

/**
 * Applies normalized `InitializePersistedSpecState` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createInitializePersistedSpecStateFromNormalized(
  input: FactoryInput<InitializePersistedSpecStateDeps, CompositionResolutionOptions>,
): InitializePersistedSpecState {
  if (input.kind === 'deps') {
    const {
      specRepositories,
      listWorkspaces,
      getActiveSchema,
      parsers,
      extractorTransforms,
      contentHasher,
    } = input.deps
    return new InitializePersistedSpecState(specRepositories, listWorkspaces, getActiveSchema, {
      parsers,
      extractorTransforms,
      hasher: contentHasher,
    })
  }
  const resolver = createCompositionResolver(input.config, input.options)
  const deps = resolveInitializePersistedSpecStateDeps(resolver)
  return createInitializePersistedSpecState(deps)
}

/**
 * Type guard for explicit `InitializePersistedSpecStateDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isInitializePersistedSpecStateDeps(
  value: InitializePersistedSpecStateDeps | SpecdConfig,
): value is InitializePersistedSpecStateDeps {
  return 'listWorkspaces' in value && 'getActiveSchema' in value && 'contentHasher' in value
}
