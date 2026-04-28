import {
  type Kernel,
  type LogDestination,
  type LogEntry,
  type LogLevel,
  type SpecdConfig,
} from '@specd/core'
import { createCliKernel } from '../kernel.js'
import { loadConfig, resolveConfigPath } from '../load-config.js'

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

/**
 * Resolves the verbosity level from the command-line arguments.
 *
 * @param argv - The command-line arguments.
 * @returns The number of verbosity flags (e.g., -v, -vv, --verbose).
 */
function resolveVerbosity(argv: readonly string[]): number {
  let count = 0
  for (const token of argv) {
    if (token === '--verbose') {
      count += 1
      continue
    }
    if (token.startsWith('-') && !token.startsWith('--')) {
      for (const ch of token.slice(1)) {
        if (ch === 'v') count += 1
      }
    }
  }
  return count
}

/**
 * Loads config and creates the CLI kernel.
 *
 * This consolidates the repeated `loadConfig` + `createCliKernel`
 * boilerplate found across CLI commands.
 *
 * @param options - Optional overrides
 * @param options.configPath - Path to specd.yaml config file
 * @param options.onLog - Optional callback to handle log entries
 * @returns The resolved CLI context
 */
export async function resolveCliContext(options?: {
  configPath?: string | undefined
  onLog?: ((entry: LogEntry) => void) | undefined
}): Promise<CliContext> {
  const [config, configFilePath] = await Promise.all([
    loadConfig(options),
    resolveConfigPath(options),
  ])
  const verbosity = resolveVerbosity(process.argv)
  const consoleLevel: LogLevel = verbosity >= 2 ? 'trace' : verbosity === 1 ? 'debug' : 'info'
  const additionalDestinations: LogDestination[] = [
    {
      target: 'console',
      level: consoleLevel,
      format: process.stdout.isTTY ? 'pretty' : 'json',
    },
    ...(options?.onLog !== undefined
      ? [
          {
            target: 'callback' as const,
            level: consoleLevel,
            format: 'json' as const,
            onLog: options.onLog,
          },
        ]
      : []),
  ]
  const kernel = await createCliKernel(config, { additionalDestinations })
  return { config, configFilePath, kernel }
}
