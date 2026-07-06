import { GetConfig } from '../../application/use-cases/get-config.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetConfig}.
 */
export interface GetConfigDeps {
  /** Fully-resolved project configuration snapshot source. */
  readonly config: SpecdConfig
}

/**
 * Constructs a {@link GetConfig} use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetConfig(deps: GetConfigDeps): GetConfig
/**
 * Constructs a {@link GetConfig} use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetConfig(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetConfig
/**
 * Implementation overload for {@link createGetConfig}.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetConfig(
  depsOrConfig: GetConfigDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetConfig {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetConfig',
    depsOrConfig,
    options,
    isGetConfigDeps,
  )
  return createGetConfigFromNormalized(normalized)
}

/**
 * Applies normalized `GetConfig` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetConfigFromNormalized(
  input: FactoryInput<GetConfigDeps, CompositionResolutionOptions>,
): GetConfig {
  if (input.kind === 'deps') {
    return new GetConfig(input.deps.config)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetConfig({ config: resolver.config })
}

/**
 * Type guard for explicit `GetConfigDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetConfigDeps(value: GetConfigDeps | SpecdConfig): value is GetConfigDeps {
  return 'config' in value && !('projectRoot' in value)
}
