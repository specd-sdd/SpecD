import { type ValidateSpecs } from '../../application/use-cases/validate-specs.js'
import { GetSpecsHealth } from '../../application/use-cases/get-specs-health.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createValidateSpecs, resolveValidateSpecsDeps } from './validate-specs.js'

/**
 * Explicit dependencies for {@link createGetSpecsHealth}.
 */
export interface GetSpecsHealthDeps {
  readonly validateSpecs: ValidateSpecs
}

/**
 * Resolves `GetSpecsHealth` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetSpecsHealth`
 */
export function resolveGetSpecsHealthDeps(resolver: CompositionResolver): GetSpecsHealthDeps {
  return {
    validateSpecs: createValidateSpecs(resolveValidateSpecsDeps(resolver)),
  }
}

/**
 * Constructs `GetSpecsHealth` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetSpecsHealth(deps: GetSpecsHealthDeps): GetSpecsHealth
/**
 * Constructs `GetSpecsHealth` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecsHealth(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecsHealth
/**
 * Constructs `GetSpecsHealth` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetSpecsHealth(
  depsOrConfig: GetSpecsHealthDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecsHealth {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetSpecsHealth',
    depsOrConfig,
    options,
    isGetSpecsHealthDeps,
  )
  return createGetSpecsHealthFromNormalized(normalized)
}

/**
 * Applies normalized `GetSpecsHealth` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetSpecsHealthFromNormalized(
  input: FactoryInput<GetSpecsHealthDeps, CompositionResolutionOptions>,
): GetSpecsHealth {
  if (input.kind === 'deps') {
    return new GetSpecsHealth(input.deps.validateSpecs)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetSpecsHealth(resolveGetSpecsHealthDeps(resolver))
}

/**
 * Type guard for explicit `GetSpecsHealthDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetSpecsHealthDeps(
  value: GetSpecsHealthDeps | SpecdConfig,
): value is GetSpecsHealthDeps {
  return 'validateSpecs' in value
}
