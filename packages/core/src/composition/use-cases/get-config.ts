import { GetConfig } from '../../application/use-cases/get-config.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'

/** Explicit options for {@link createGetConfig}. */
export interface GetConfigOptions {
  /** Fully-resolved project configuration snapshot source. */
  readonly config: SpecdConfig
}

/**
 * Constructs a {@link GetConfig} use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetConfig(config: SpecdConfig): GetConfig
/**
 * Constructs a {@link GetConfig} use case with explicit options.
 *
 * @param options - Wrapper containing the project configuration
 * @returns The pre-wired use case instance
 */
export function createGetConfig(options: GetConfigOptions): GetConfig
/**
 * Implementation overload for {@link createGetConfig}.
 *
 * @param configOrOptions - Project config or explicit options wrapper
 * @returns The pre-wired use case instance
 */
export function createGetConfig(configOrOptions: SpecdConfig | GetConfigOptions): GetConfig {
  if (isSpecdConfig(configOrOptions)) {
    return new GetConfig(configOrOptions)
  }
  return new GetConfig(configOrOptions.config)
}
