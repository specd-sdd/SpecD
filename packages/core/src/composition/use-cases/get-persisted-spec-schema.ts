import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetPersistedSpecSchema } from '../../application/use-cases/get-persisted-spec-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetPersistedSpecSchema}.
 */
export interface GetPersistedSpecSchemaDeps {
  /** Spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link GetPersistedSpecSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetPersistedSpecSchema`
 */
export function resolveGetPersistedSpecSchemaDeps(
  resolver: CompositionResolver,
): GetPersistedSpecSchemaDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs `GetPersistedSpecSchema` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecSchema(
  deps: GetPersistedSpecSchemaDeps,
): GetPersistedSpecSchema
/**
 * Constructs `GetPersistedSpecSchema` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecSchema
/**
 * Constructs `GetPersistedSpecSchema` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetPersistedSpecSchema(
  depsOrConfig: GetPersistedSpecSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetPersistedSpecSchema {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetPersistedSpecSchema',
    depsOrConfig,
    options,
    isGetPersistedSpecSchemaDeps,
  )
  if (normalized.kind === 'deps') {
    return new GetPersistedSpecSchema(normalized.deps.specRepositories)
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createGetPersistedSpecSchema(resolveGetPersistedSpecSchemaDeps(resolver))
}

/**
 * Type guard for explicit `GetPersistedSpecSchemaDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetPersistedSpecSchemaDeps(
  value: GetPersistedSpecSchemaDeps | SpecdConfig,
): value is GetPersistedSpecSchemaDeps {
  return 'specRepositories' in value && !('projectRoot' in value)
}
