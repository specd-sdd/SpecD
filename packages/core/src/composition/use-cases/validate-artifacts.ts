import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { ValidateArtifacts } from '../../application/use-cases/validate-artifacts.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import { type LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createValidateArtifacts}.
 */
export interface ValidateArtifactsDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly actor: ActorResolver
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly lifecycle: LifecycleEngine
}

/**
 * Resolves `ValidateArtifacts` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ValidateArtifacts`
 */
export function resolveValidateArtifactsDeps(resolver: CompositionResolver): ValidateArtifactsDeps {
  return {
    changes: resolver.getChangeRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
    actor: resolver.getActorResolver(),
    contentHasher: resolver.getContentHasher(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
    lifecycle: resolver.getLifecycleEngine(),
  }
}

/**
 * Constructs `ValidateArtifacts` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(deps: ValidateArtifactsDeps): ValidateArtifacts
/**
 * Constructs `ValidateArtifacts` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateArtifacts
/**
 * Constructs `ValidateArtifacts` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(
  depsOrConfig: ValidateArtifactsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateArtifacts {
  const normalized = normalizeCompositionFactoryArgs(
    'createValidateArtifacts',
    depsOrConfig,
    options,
    isValidateArtifactsDeps,
  )
  return createValidateArtifactsFromNormalized(normalized)
}

/**
 * Applies normalized `ValidateArtifacts` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createValidateArtifactsFromNormalized(
  input: FactoryInput<ValidateArtifactsDeps, CompositionResolutionOptions>,
): ValidateArtifacts {
  if (input.kind === 'deps') {
    const {
      changes,
      listWorkspaces,
      schemaProvider,
      parsers,
      actor,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
      lifecycle,
    } = input.deps
    return new ValidateArtifacts(
      changes,
      listWorkspaces,
      schemaProvider,
      parsers,
      actor,
      contentHasher,
      extractorTransforms,
      workspaceRoutes,
      lifecycle,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createValidateArtifacts(resolveValidateArtifactsDeps(resolver))
}

/**
 * Type guard for explicit `ValidateArtifactsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isValidateArtifactsDeps(
  value: ValidateArtifactsDeps | SpecdConfig,
): value is ValidateArtifactsDeps {
  return (
    'changes' in value &&
    'listWorkspaces' in value &&
    'schemaProvider' in value &&
    'parsers' in value &&
    'actor' in value &&
    'contentHasher' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value &&
    'lifecycle' in value
  )
}
