import { createKernel, type Kernel, type LogDestination, type SpecdConfig } from '@specd/core'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

// Resolve node_modules directories co-located with this CLI binary.
// We search two paths so that both local workspace builds and global installs work:
//
// 1. Package-local node_modules: {cliPkg}/node_modules
//    Works for pnpm workspace development where @specd/schema-std is a direct
//    dependency of @specd/cli and symlinked into the package's own node_modules.
//    Structure: packages/cli/dist/index.js  →  packages/cli/node_modules
//
// 2. Sibling node_modules: {nodeModules}/@specd/cli/dist/index.js  →  {nodeModules}
//    Works for npm/pnpm global installs where all @specd/* packages are co-installed
//    in the same flat node_modules directory.
//
// @-prefixed schemas are NEVER resolved from the project's node_modules to prevent
// version mismatches at runtime.
const _cliDir = path.dirname(fileURLToPath(import.meta.url))
const _cliPackageNodeModules = path.resolve(_cliDir, '../node_modules')
const _cliSiblingNodeModules = path.resolve(_cliDir, '../../..')

/**
 * Creates a fully-wired kernel with the CLI's own node_modules prepended
 * to the schema search path.
 *
 * Use this instead of `createKernel` from `@specd/core` in all CLI commands.
 *
 * @param config - The loaded specd configuration.
 * @returns A fully-configured Kernel instance.
 */
export interface CliKernelOptions {
  /** Extra logging destinations provided by the CLI layer. */
  readonly additionalDestinations?: readonly LogDestination[]
}

/**
 * Creates a CLI kernel instance with CLI-local module resolution hints.
 *
 * @param config - Loaded project configuration.
 * @param options - Optional CLI-specific kernel extensions.
 * @returns The fully wired kernel promise.
 */
export function createCliKernel(config: SpecdConfig, options?: CliKernelOptions): Promise<Kernel> {
  const kernelOptions = {
    extraNodeModulesPaths: [_cliPackageNodeModules, _cliSiblingNodeModules],
    ...(options?.additionalDestinations !== undefined
      ? { additionalDestinations: options.additionalDestinations }
      : {}),
  }
  return createKernel(config, kernelOptions)
}
