import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetPersistedSpecDeps } from '../../application/use-cases/get-persisted-spec-deps.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetPersistedSpecDeps}.
 */
export interface GetPersistedSpecDepsDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link GetPersistedSpecDepsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetPersistedSpecDeps`
 */
export function resolveGetPersistedSpecDepsDeps(
  resolver: CompositionResolver,
): GetPersistedSpecDepsDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs `GetPersistedSpecDeps` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecDeps(deps: GetPersistedSpecDepsDeps): GetPersistedSpecDeps
/**
 * Constructs `GetPersistedSpecDeps` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecDeps(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecDeps
/**
 * Constructs `GetPersistedSpecDeps` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecDeps(
  depsOrConfig: GetPersistedSpecDepsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecDeps {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetPersistedSpecDeps',
    depsOrConfig,
    options,
    isGetPersistedSpecDepsDeps,
  )
  if (normalized.kind === 'deps') {
    return new GetPersistedSpecDeps(normalized.deps.specRepositories)
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createGetPersistedSpecDeps(resolveGetPersistedSpecDepsDeps(resolver))
}

/**
 * Type guard for explicit `GetPersistedSpecDepsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetPersistedSpecDepsDeps(
  value: GetPersistedSpecDepsDeps | SpecdConfig,
): value is GetPersistedSpecDepsDeps {
  return 'specRepositories' in value && !('projectRoot' in value)
}
