import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { GetSpec } from '../../application/use-cases/get-spec.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetSpec}.
 */
export interface GetSpecDeps {
  /** Pre-built spec repositories keyed by workspace. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link GetSpecDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetSpec`
 */
export function resolveGetSpecDeps(resolver: CompositionResolver): GetSpecDeps {
  return { specRepositories: resolver.getSpecRepositories() }
}

/**
 * Constructs a `GetSpec` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetSpec(deps: GetSpecDeps): GetSpec
/**
 * Constructs a `GetSpec` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpec(config: SpecdConfig, options?: CompositionResolutionOptions): GetSpec
/**
 * Constructs a `GetSpec` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetSpec(
  depsOrConfig: GetSpecDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpec {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetSpec',
    depsOrConfig,
    options,
    isGetSpecDeps,
  )
  return createGetSpecFromNormalized(normalized)
}

/**
 * Applies normalized `GetSpec` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetSpecFromNormalized(
  input: FactoryInput<GetSpecDeps, CompositionResolutionOptions>,
): GetSpec {
  if (input.kind === 'deps') {
    return new GetSpec(input.deps.specRepositories)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetSpec(resolveGetSpecDeps(resolver))
}

/**
 * Type guard for explicit `GetSpecDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetSpecDeps(value: GetSpecDeps | SpecdConfig): value is GetSpecDeps {
  return 'specRepositories' in value
}
