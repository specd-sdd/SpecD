import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { GetDraft } from '../../application/use-cases/get-draft.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetDraft}.
 */
export interface GetDraftDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link GetDraftDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetDraft`
 */
export function resolveGetDraftDeps(resolver: CompositionResolver): GetDraftDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `GetDraft` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetDraft(deps: GetDraftDeps): GetDraft
/**
 * Constructs a `GetDraft` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetDraft(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetDraft
/**
 * Constructs a `GetDraft` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetDraft(
  depsOrConfig: GetDraftDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetDraft {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetDraft',
    depsOrConfig,
    options,
    isGetDraftDeps,
  )
  return createGetDraftFromNormalized(normalized)
}

/**
 * Applies normalized `GetDraft` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetDraftFromNormalized(
  input: FactoryInput<GetDraftDeps, CompositionResolutionOptions>,
): GetDraft {
  if (input.kind === 'deps') {
    return new GetDraft(input.deps.changes)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetDraft(resolveGetDraftDeps(resolver))
}

/**
 * Type guard for explicit `GetDraftDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetDraftDeps(value: GetDraftDeps | SpecdConfig): value is GetDraftDeps {
  return 'changes' in value
}
