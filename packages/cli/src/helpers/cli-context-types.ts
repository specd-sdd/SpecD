import { type Kernel, type SpecdConfig } from '@specd/sdk'

/**
 * The resolved CLI context containing config and kernel.
 */
export interface CliContext {
  /** The loaded specd configuration. */
  readonly config: SpecdConfig
  /** Absolute path to the config file that was loaded, or `null` when not locatable. */
  readonly configFilePath: string | null
  /** The wired kernel instance. */
  readonly kernel: Kernel
}
