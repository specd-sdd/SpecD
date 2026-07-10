import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import {
  openSpecdHost,
  type KernelOptions,
  type LogDestination,
  type LogEntry,
  type LogLevel,
} from '@specd/sdk'
import type { CliContext } from './cli-context-types.js'

export type { CliContext } from './cli-context-types.js'

// Resolve node_modules directories co-located with this CLI binary.
const _cliDir = path.dirname(fileURLToPath(import.meta.url))
const _cliPackageNodeModules = path.resolve(_cliDir, '../../node_modules')
const _cliSiblingNodeModules = path.resolve(_cliDir, '../../../..')

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
 * Builds kernel options for CLI commands, including schema resolution paths and logging.
 *
 * @param options - Optional CLI logging overrides
 * @param options.onLog - Optional callback to handle log entries
 * @param options.argv - Command-line arguments for verbosity detection
 * @returns Kernel construction options for {@link openSpecdHost}
 */
export function buildCliKernelOptions(options?: {
  onLog?: ((entry: LogEntry) => void) | undefined
  argv?: readonly string[]
}): KernelOptions {
  const verbosity = resolveVerbosity(options?.argv ?? process.argv)
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
  return {
    extraNodeModulesPaths: [_cliPackageNodeModules, _cliSiblingNodeModules],
    additionalDestinations,
  }
}

/**
 * Loads config and creates the CLI kernel via the SDK host facade.
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
  const host = await openSpecdHost({
    ...(options?.configPath !== undefined ? { configPath: options.configPath } : {}),
    kernelOptions: buildCliKernelOptions({ onLog: options?.onLog }),
  })
  if (host.config.warnings !== undefined && host.config.warnings.length > 0) {
    for (const warning of host.config.warnings) {
      console.warn(`warning: ${warning}`)
    }
  }
  return {
    config: host.config,
    configFilePath: host.configFilePath,
    kernel: host.kernel,
  }
}
