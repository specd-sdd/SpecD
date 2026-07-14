import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { GetArchivedChange } from '../../application/use-cases/get-archived-change.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetArchivedChange}.
 */
export interface GetArchivedChangeDeps {
  /** Archive repository used by the use case. */
  readonly archive: ArchiveRepository
}

/**
 * Resolves {@link GetArchivedChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetArchivedChange`
 */
export function resolveGetArchivedChangeDeps(resolver: CompositionResolver): GetArchivedChangeDeps {
  return { archive: resolver.getArchiveRepository() }
}

/**
 * Constructs a `GetArchivedChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(deps: GetArchivedChangeDeps): GetArchivedChange
/**
 * Constructs a `GetArchivedChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetArchivedChange
/**
 * Constructs a `GetArchivedChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetArchivedChange(
  depsOrConfig: GetArchivedChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetArchivedChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetArchivedChange',
    depsOrConfig,
    options,
    isGetArchivedChangeDeps,
  )
  return createGetArchivedChangeFromNormalized(normalized)
}

/**
 * Applies normalized `GetArchivedChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetArchivedChangeFromNormalized(
  input: FactoryInput<GetArchivedChangeDeps, CompositionResolutionOptions>,
): GetArchivedChange {
  if (input.kind === 'deps') {
    return new GetArchivedChange(input.deps.archive)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetArchivedChange(resolveGetArchivedChangeDeps(resolver))
}

/**
 * Type guard for explicit `GetArchivedChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetArchivedChangeDeps(
  value: GetArchivedChangeDeps | SpecdConfig,
): value is GetArchivedChangeDeps {
  return 'archive' in value
}
