import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { ListArchived } from '../../application/use-cases/list-archived.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListArchived}.
 */
export interface ListArchivedDeps {
  /** Archive repository used by the use case. */
  readonly archive: ArchiveRepository
}

/**
 * Resolves {@link ListArchivedDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListArchived`
 */
export function resolveListArchivedDeps(resolver: CompositionResolver): ListArchivedDeps {
  return { archive: resolver.getArchiveRepository() }
}

/**
 * Constructs a `ListArchived` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListArchived(deps: ListArchivedDeps): ListArchived
/**
 * Constructs a `ListArchived` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListArchived(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListArchived
/**
 * Constructs a `ListArchived` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListArchived(
  depsOrConfig: ListArchivedDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListArchived {
  const normalized = normalizeCompositionFactoryArgs(
    'createListArchived',
    depsOrConfig,
    options,
    isListArchivedDeps,
  )
  return createListArchivedFromNormalized(normalized)
}

/**
 * Applies normalized `ListArchived` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListArchivedFromNormalized(
  input: FactoryInput<ListArchivedDeps, CompositionResolutionOptions>,
): ListArchived {
  if (input.kind === 'deps') {
    return new ListArchived(input.deps.archive)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListArchived(resolveListArchivedDeps(resolver))
}

/**
 * Type guard for explicit `ListArchivedDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListArchivedDeps(value: ListArchivedDeps | SpecdConfig): value is ListArchivedDeps {
  return 'archive' in value
}
