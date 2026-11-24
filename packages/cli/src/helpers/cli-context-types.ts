import { type SdkHostContext, type SpecdConfig } from '@specd/sdk'

/**
 * The resolved CLI context: the SDK host (kernel, graph-provider factory and disposal)
 * plus the loaded config and its file path.
 */
export interface CliContext extends SdkHostContext {
  /** The loaded specd configuration. */
  readonly config: SpecdConfig
  /** Absolute path to the config file that was loaded, or `null` when not locatable. */
  readonly configFilePath: string | null
}
