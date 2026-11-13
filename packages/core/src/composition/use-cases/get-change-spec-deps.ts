import { GetChangeSpecDeps } from '../../application/use-cases/get-change-spec-deps.js'
import { type GetStatus } from '../../application/use-cases/get-status.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createGetStatus, resolveGetStatusDeps } from './get-status.js'

/**
 * Explicit dependencies for {@link createGetChangeSpecDeps}.
 */
export interface GetChangeSpecDepsDeps {
  /** Use case that loads change status and declared dependencies. */
  readonly getStatus: GetStatus
  /** Configured workspace names used to validate and normalize IDs. */
  readonly workspaces: Iterable<string | { readonly name: string }>
}

/**
 * Resolves {@link GetChangeSpecDepsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetChangeSpecDeps`
 */
export function resolveGetChangeSpecDepsDeps(resolver: CompositionResolver): GetChangeSpecDepsDeps {
  return {
    getStatus: createGetStatus(resolveGetStatusDeps(resolver)),
    workspaces: [...resolver.getSpecRepositories().keys()],
  }
}

/**
 * Constructs `GetChangeSpecDeps` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetChangeSpecDeps(deps: GetChangeSpecDepsDeps): GetChangeSpecDeps
/**
 * Constructs `GetChangeSpecDeps` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetChangeSpecDeps(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetChangeSpecDeps
/**
 * Constructs `GetChangeSpecDeps` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetChangeSpecDeps(
  depsOrConfig: GetChangeSpecDepsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetChangeSpecDeps {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetChangeSpecDeps',
    depsOrConfig,
    options,
    isGetChangeSpecDepsDeps,
  )
  return createGetChangeSpecDepsFromNormalized(normalized)
}

/**
 * Applies normalized `GetChangeSpecDeps` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetChangeSpecDepsFromNormalized(
  input: FactoryInput<GetChangeSpecDepsDeps, CompositionResolutionOptions>,
): GetChangeSpecDeps {
  if (input.kind === 'deps') {
    return new GetChangeSpecDeps(input.deps.getStatus, input.deps.workspaces)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetChangeSpecDeps(resolveGetChangeSpecDepsDeps(resolver))
}

/**
 * Type guard for explicit `GetChangeSpecDepsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetChangeSpecDepsDeps(
  value: GetChangeSpecDepsDeps | SpecdConfig,
): value is GetChangeSpecDepsDeps {
  return 'getStatus' in value
}
