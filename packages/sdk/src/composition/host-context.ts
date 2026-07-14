import {
  createDefaultConfigLoader,
  createKernel,
  type Kernel,
  type KernelOptions,
  type SpecdConfig,
} from '@specd/core'
import { createCodeGraphProvider, type CodeGraphProvider } from '@specd/code-graph'

/**
 * Host context with a wired kernel and graph-provider factory bound to one config.
 */
export interface SdkHostContext {
  /** Wired specd kernel for lifecycle and project queries. */
  readonly kernel: Kernel
  /** Creates a new {@link CodeGraphProvider} for the host config. */
  readonly createGraphProvider: () => CodeGraphProvider
}

/** Input for {@link openSpecdHost}. */
export interface OpenSpecdHostInput {
  /** Absolute path to `specd.yaml` for forced load mode. */
  readonly configPath?: string
  /** Optional kernel construction overrides (e.g. logging). */
  readonly kernelOptions?: KernelOptions
}

/** Result of {@link openSpecdHost} including loaded config metadata. */
export interface OpenSpecdHostResult extends SdkHostContext {
  /** Resolved project configuration. */
  readonly config: SpecdConfig
  /** Absolute path to the loaded config file, or `null` when not locatable. */
  readonly configFilePath: string | null
}

/**
 * Builds host context from an already-loaded config.
 *
 * @param config - Resolved project configuration
 * @param options - Optional kernel construction overrides
 * @returns Kernel plus graph-provider factory sharing the same config
 */
export async function createSdkContext(
  config: SpecdConfig,
  options?: KernelOptions,
): Promise<SdkHostContext> {
  const kernel = await createKernel(config, options)
  return {
    kernel,
    createGraphProvider: () => createCodeGraphProvider(config),
  }
}

/**
 * Loads config and builds the SDK host context.
 *
 * @param input - Optional config path and kernel overrides
 * @returns Loaded config, path, kernel, and graph-provider factory
 */
export async function openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult> {
  const loader = await createDefaultConfigLoader(
    input?.configPath !== undefined
      ? { configPath: input.configPath }
      : { startDir: process.cwd() },
  )
  const [config, configFilePath] = await Promise.all([loader.load(), loader.resolvePath()])
  const ctx = await createSdkContext(config, input?.kernelOptions)
  return {
    config,
    configFilePath,
    ...ctx,
  }
}
