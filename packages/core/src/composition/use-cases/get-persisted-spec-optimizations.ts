import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetPersistedSpecOptimizations } from '../../application/use-cases/get-persisted-spec-optimizations.js'
import { type GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'
import { createGetActiveSchema, resolveGetActiveSchemaDeps } from './get-active-schema.js'

/**
 * Explicit dependencies for {@link createGetPersistedSpecOptimizations}.
 */
export interface GetPersistedSpecOptimizationsDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Use case resolving the active project schema. */
  readonly getActiveSchema: GetActiveSchema
}

/**
 * Resolves {@link GetPersistedSpecOptimizationsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetPersistedSpecOptimizations`
 */
export function resolveGetPersistedSpecOptimizationsDeps(
  resolver: CompositionResolver,
): GetPersistedSpecOptimizationsDeps {
  return {
    specRepositories: resolver.getSpecRepositories(),
    getActiveSchema: createGetActiveSchema(resolveGetActiveSchemaDeps(resolver)),
  }
}

/**
 * Constructs `GetPersistedSpecOptimizations` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecOptimizations(
  deps: GetPersistedSpecOptimizationsDeps,
): GetPersistedSpecOptimizations
/**
 * Constructs `GetPersistedSpecOptimizations` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecOptimizations(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecOptimizations
/**
 * Constructs `GetPersistedSpecOptimizations` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecOptimizations(
  depsOrConfig: GetPersistedSpecOptimizationsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecOptimizations {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetPersistedSpecOptimizations',
    depsOrConfig,
    options,
    isGetPersistedSpecOptimizationsDeps,
  )
  if (normalized.kind === 'deps') {
    const { specRepositories, getActiveSchema } = normalized.deps
    return new GetPersistedSpecOptimizations(specRepositories, getActiveSchema)
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createGetPersistedSpecOptimizations(resolveGetPersistedSpecOptimizationsDeps(resolver))
}

/**
 * Type guard for explicit `GetPersistedSpecOptimizationsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetPersistedSpecOptimizationsDeps(
  value: GetPersistedSpecOptimizationsDeps | SpecdConfig,
): value is GetPersistedSpecOptimizationsDeps {
  return 'getActiveSchema' in value && !('contentHasher' in value)
}
