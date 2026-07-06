import { ListDrafts } from '../../application/use-cases/list-drafts.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListDrafts}.
 */
export interface ListDraftsDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link ListDraftsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListDrafts`
 */
export function resolveListDraftsDeps(resolver: CompositionResolver): ListDraftsDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `ListDrafts` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListDrafts(deps: ListDraftsDeps): ListDrafts
/**
 * Constructs a `ListDrafts` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListDrafts(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListDrafts
/**
 * Constructs a `ListDrafts` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListDrafts(
  depsOrConfig: ListDraftsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListDrafts {
  const normalized = normalizeCompositionFactoryArgs(
    'createListDrafts',
    depsOrConfig,
    options,
    isListDraftsDeps,
  )
  return createListDraftsFromNormalized(normalized)
}

/**
 * Applies normalized `ListDrafts` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListDraftsFromNormalized(
  input: FactoryInput<ListDraftsDeps, CompositionResolutionOptions>,
): ListDrafts {
  if (input.kind === 'deps') {
    return new ListDrafts(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListDrafts(resolveListDraftsDeps(resolver))
}

/**
 * Type guard for explicit `ListDraftsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListDraftsDeps(value: ListDraftsDeps | SpecdConfig): value is ListDraftsDeps {
  return 'changes' in value
}
