import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { GetReadOnlyChangeArtifact } from '../../application/use-cases/get-read-only-change-artifact.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetReadOnlyChangeArtifact}.
 */
export interface GetReadOnlyChangeArtifactDeps {
  /** Change repository used for drafts and discarded changes. */
  readonly changes: ChangeRepository
  /** Archive repository used for archived changes. */
  readonly archive: ArchiveRepository
}

/**
 * Resolves {@link GetReadOnlyChangeArtifactDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetReadOnlyChangeArtifact`
 */
export function resolveGetReadOnlyChangeArtifactDeps(
  resolver: CompositionResolver,
): GetReadOnlyChangeArtifactDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
  }
}

/**
 * Constructs a `GetReadOnlyChangeArtifact` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(
  deps: GetReadOnlyChangeArtifactDeps,
): GetReadOnlyChangeArtifact
/**
 * Constructs a `GetReadOnlyChangeArtifact` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetReadOnlyChangeArtifact
/**
 * Constructs a `GetReadOnlyChangeArtifact` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetReadOnlyChangeArtifact(
  depsOrConfig: GetReadOnlyChangeArtifactDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetReadOnlyChangeArtifact {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetReadOnlyChangeArtifact',
    depsOrConfig,
    options,
    isGetReadOnlyChangeArtifactDeps,
  )
  return createGetReadOnlyChangeArtifactFromNormalized(normalized)
}

/**
 * Applies normalized `GetReadOnlyChangeArtifact` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetReadOnlyChangeArtifactFromNormalized(
  input: FactoryInput<GetReadOnlyChangeArtifactDeps, CompositionResolutionOptions>,
): GetReadOnlyChangeArtifact {
  if (input.kind === 'deps') {
    return new GetReadOnlyChangeArtifact(input.deps.changes, input.deps.archive)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetReadOnlyChangeArtifact(resolveGetReadOnlyChangeArtifactDeps(resolver))
}

/**
 * Type guard for explicit `GetReadOnlyChangeArtifactDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetReadOnlyChangeArtifactDeps(
  value: GetReadOnlyChangeArtifactDeps | SpecdConfig,
): value is GetReadOnlyChangeArtifactDeps {
  return 'changes' in value && 'archive' in value
}
