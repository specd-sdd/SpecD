import {
  createDefaultConfigLoader,
  createKernel,
  createVcsAdapter,
  ConfigNotFoundError,
  type Kernel,
  type KernelOptions,
  type SpecdConfig,
} from '@specd/core'
import {
  createCodeGraphProvider,
  createBootstrapGraphConfig,
  type CodeGraphCompositionOptions,
  type CodeGraphProvider,
} from '@specd/code-graph'

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
 * SDK-owned bootstrap options for kernel and graph composition.
 */
export interface SdkContextOptions {
  /** Optional kernel construction overrides (e.g. logging). */
  readonly kernel?: KernelOptions
  /** Optional code-graph composition overrides bound to the same config. */
  readonly graph?: CodeGraphCompositionOptions
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
  /** Permit discovery-mode graph bootstrap when no configuration exists. */
  readonly allowBootstrapFallback?: boolean
  /** Optional SDK-owned kernel and graph composition overrides. */
  readonly options?: SdkContextOptions
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
 * @param options - Optional SDK-owned kernel and graph composition overrides
 * @returns Kernel plus graph-provider factory sharing the same config
 */
export async function createSdkContext(
  config: SpecdConfig,
  options?: SdkContextOptions,
): Promise<SdkHostContext> {
  const kernel = await createKernel(config, options?.kernel)
  return {
    kernel,
    createGraphProvider: () => createCodeGraphProvider(config, options?.graph),
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
 * @param input - Optional bootstrap input and SDK-owned composition overrides
 * @returns Loaded config, path, kernel, and graph-provider factory. Any
 * configuration warnings remain attached to `config.warnings`.
 * @throws {Error} When both `configPath` and `startDir` are provided together
 */
export async function openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult> {
  if (input?.configPath !== undefined && input.startDir !== undefined) {
    throw new Error('openSpecdHost accepts either configPath or startDir, but never both')
  }

  const startDir = input?.startDir ?? process.cwd()
  const loader = await createDefaultConfigLoader(
    input?.configPath !== undefined
      ? { configPath: input.configPath }
      : input?.startDir !== undefined
        ? { startDir: input.startDir }
        : { startDir },
  )
  let config: SpecdConfig
  let configFilePath: string | null
  try {
    ;[config, configFilePath] = await Promise.all([loader.load(), loader.resolvePath()])
  } catch (error) {
    if (
      input?.configPath !== undefined ||
      input?.allowBootstrapFallback !== true ||
      !(error instanceof ConfigNotFoundError)
    ) {
      throw error
    }
    const vcs = await createVcsAdapter(startDir)
    const root = vcs.rootDir()
    config = createBootstrapGraphConfig({ projectRoot: root, vcsRoot: root })
    configFilePath = null
  }
  const ctx = await createSdkContext(config, input?.options)
  return {
    config,
    configFilePath,
    ...ctx,
  }
}
