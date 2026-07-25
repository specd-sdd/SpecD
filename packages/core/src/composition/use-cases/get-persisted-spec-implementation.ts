import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetPersistedSpecImplementation } from '../../application/use-cases/get-persisted-spec-implementation.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetPersistedSpecImplementation}.
 */
export interface GetPersistedSpecImplementationDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link GetPersistedSpecImplementationDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetPersistedSpecImplementation`
 */
export function resolveGetPersistedSpecImplementationDeps(
  resolver: CompositionResolver,
): GetPersistedSpecImplementationDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs `GetPersistedSpecImplementation` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecImplementation(
  deps: GetPersistedSpecImplementationDeps,
): GetPersistedSpecImplementation
/**
 * Constructs `GetPersistedSpecImplementation` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecImplementation(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecImplementation
/**
 * Constructs `GetPersistedSpecImplementation` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecImplementation(
  depsOrConfig: GetPersistedSpecImplementationDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecImplementation {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetPersistedSpecImplementation',
    depsOrConfig,
    options,
    isGetPersistedSpecImplementationDeps,
  )
  if (normalized.kind === 'deps') {
    return new GetPersistedSpecImplementation(normalized.deps.specRepositories)
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createGetPersistedSpecImplementation(resolveGetPersistedSpecImplementationDeps(resolver))
}

/**
 * Type guard for explicit `GetPersistedSpecImplementationDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetPersistedSpecImplementationDeps(
  value: GetPersistedSpecImplementationDeps | SpecdConfig,
): value is GetPersistedSpecImplementationDeps {
  return 'specRepositories' in value && !('projectRoot' in value)
}
