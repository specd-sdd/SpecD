import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { SaveChangeArtifact } from '../../application/use-cases/save-change-artifact.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createSaveChangeArtifact}.
 */
export interface SaveChangeArtifactDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Schema provider used for invalidation DAG lookups. */
  readonly schemaProvider: SchemaProvider
  /** Content hasher used for optimistic save hashes. */
  readonly contentHasher: ContentHasher
}

/**
 * Resolves {@link SaveChangeArtifactDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `SaveChangeArtifact`
 */
export function resolveSaveChangeArtifactDeps(
  resolver: CompositionResolver,
): SaveChangeArtifactDeps {
  return {
    changes: resolver.getChangeRepository(),
    schemaProvider: resolver.getSchemaProvider(),
    contentHasher: resolver.getContentHasher(),
  }
}

/**
 * Constructs a `SaveChangeArtifact` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(deps: SaveChangeArtifactDeps): SaveChangeArtifact
/**
 * Constructs a `SaveChangeArtifact` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SaveChangeArtifact
/**
 * Constructs a `SaveChangeArtifact` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createSaveChangeArtifact(
  depsOrConfig: SaveChangeArtifactDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SaveChangeArtifact {
  const normalized = normalizeCompositionFactoryArgs(
    'createSaveChangeArtifact',
    depsOrConfig,
    options,
    isSaveChangeArtifactDeps,
  )
  return createSaveChangeArtifactFromNormalized(normalized)
}

/**
 * Applies normalized `SaveChangeArtifact` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createSaveChangeArtifactFromNormalized(
  input: FactoryInput<SaveChangeArtifactDeps, CompositionResolutionOptions>,
): SaveChangeArtifact {
  if (input.kind === 'deps') {
    const { changes, schemaProvider, contentHasher } = input.deps
    return new SaveChangeArtifact(changes, schemaProvider, contentHasher)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createSaveChangeArtifact(resolveSaveChangeArtifactDeps(resolver))
}

/**
 * Type guard for explicit `SaveChangeArtifactDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isSaveChangeArtifactDeps(
  value: SaveChangeArtifactDeps | SpecdConfig,
): value is SaveChangeArtifactDeps {
  return 'changes' in value && 'schemaProvider' in value && 'contentHasher' in value
}
