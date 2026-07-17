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

/**
 * Input for {@link openSpecdHost}.
 *
 * Callers may bootstrap from one explicit config file via `configPath`, from one
 * discovery root via `startDir`, or from `process.cwd()` by omitting both fields.
 * `configPath` and `startDir` must never be provided together.
 */
export interface OpenSpecdHostInput {
  /** Absolute path to `specd.yaml` for forced load mode. */
  readonly configPath?: string
  /** Directory to start config discovery from without mutating `process.cwd()`. */
  readonly startDir?: string
  /** Optional kernel construction overrides (e.g. logging). */
  readonly kernelOptions?: KernelOptions
}

/**
 * Result of {@link openSpecdHost} including loaded config metadata.
 *
 * This is a thin bootstrap wrapper over the loaded {@link SpecdConfig} and the
 * shared {@link SdkHostContext}. Configuration warnings remain on
 * `config.warnings`; this result does not duplicate them as a top-level field.
 */
export interface OpenSpecdHostResult extends SdkHostContext {
  /** Resolved project configuration, including any load-time advisory warnings. */
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
 * Supports three bootstrap modes:
 * - forced-file mode via `configPath`
 * - discovery-root mode via `startDir`
 * - default discovery from `process.cwd()` when neither is provided
 *
 * @param input - Optional bootstrap input and kernel overrides
 * @returns Loaded config, path, kernel, and graph-provider factory. Any
 * configuration warnings remain attached to `config.warnings`.
 * @throws {Error} When both `configPath` and `startDir` are provided together
 */
export async function openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult> {
  if (input?.configPath !== undefined && input.startDir !== undefined) {
    throw new Error('openSpecdHost accepts either configPath or startDir, but never both')
  }

  const loader = await createDefaultConfigLoader(
    input?.configPath !== undefined
      ? { configPath: input.configPath }
      : input?.startDir !== undefined
        ? { startDir: input.startDir }
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
