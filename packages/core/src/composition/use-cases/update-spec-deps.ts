import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { UpdateSpecDeps } from '../../application/use-cases/update-spec-deps.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createUpdateSpecDeps}.
 */
export interface UpdateSpecDepsDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link UpdateSpecDepsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `UpdateSpecDeps`
 */
export function resolveUpdateSpecDepsDeps(resolver: CompositionResolver): UpdateSpecDepsDeps {
  return {
    changes: resolver.getChangeRepository(),
  }
}

/**
 * Constructs `UpdateSpecDeps` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(deps: UpdateSpecDepsDeps): UpdateSpecDeps
/**
 * Constructs `UpdateSpecDeps` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateSpecDeps
/**
 * Constructs `UpdateSpecDeps` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecDeps(
  depsOrConfig: UpdateSpecDepsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateSpecDeps {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdateSpecDeps',
    depsOrConfig,
    options,
    isUpdateSpecDepsDeps,
  )
  return createUpdateSpecDepsFromNormalized(normalized)
}

/**
 * Applies normalized `UpdateSpecDeps` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdateSpecDepsFromNormalized(
  input: FactoryInput<UpdateSpecDepsDeps, CompositionResolutionOptions>,
): UpdateSpecDeps {
  if (input.kind === 'deps') {
    return new UpdateSpecDeps(input.deps.changes)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createUpdateSpecDeps(resolveUpdateSpecDepsDeps(resolver))
}

/**
 * Type guard for explicit `UpdateSpecDepsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdateSpecDepsDeps(
  value: UpdateSpecDepsDeps | SpecdConfig,
): value is UpdateSpecDepsDeps {
  return 'changes' in value
}
