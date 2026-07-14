import { ListChanges } from '../../application/use-cases/list-changes.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListChanges}.
 */
export interface ListChangesDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link ListChangesDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListChanges`
 */
export function resolveListChangesDeps(resolver: CompositionResolver): ListChangesDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `ListChanges` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListChanges(deps: ListChangesDeps): ListChanges
/**
 * Constructs a `ListChanges` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListChanges(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListChanges
/**
 * Constructs a `ListChanges` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListChanges(
  depsOrConfig: ListChangesDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListChanges {
  const normalized = normalizeCompositionFactoryArgs(
    'createListChanges',
    depsOrConfig,
    options,
    isListChangesDeps,
  )
  return createListChangesFromNormalized(normalized)
}

/**
 * Applies normalized `ListChanges` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListChangesFromNormalized(
  input: FactoryInput<ListChangesDeps, CompositionResolutionOptions>,
): ListChanges {
  if (input.kind === 'deps') {
    return new ListChanges(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListChanges(resolveListChangesDeps(resolver))
}

/**
 * Type guard for explicit `ListChangesDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListChangesDeps(value: ListChangesDeps | SpecdConfig): value is ListChangesDeps {
  return 'changes' in value
}
