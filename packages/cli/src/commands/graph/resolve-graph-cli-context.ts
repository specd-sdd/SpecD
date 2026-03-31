import { createVcsAdapter, type Kernel, type SpecdConfig } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { resolveConfigPath } from '../../load-config.js'
import { createBootstrapGraphConfig } from './bootstrap-graph-config.js'

/**
 * Resolved execution context for graph commands.
 */
export interface GraphCliContext {
  /** Whether the command is using project config or bootstrap mode. */
  readonly mode: 'configured' | 'bootstrap'
  /** Config passed to `withProvider()`. */
  readonly config: SpecdConfig
  /** Active config file path when running in configured mode, else `null`. */
  readonly configFilePath: string | null
  /** Wired kernel for configured mode, else `null`. */
  readonly kernel: Kernel | null
  /** Root directory used for graph storage. */
  readonly projectRoot: string
  /** Resolved repository root. */
  readonly vcsRoot: string
}

/**
 * Resolves graph command context using explicit config, explicit repo root, or
 * no-config bootstrap fallback.
 *
 * @param options - Resolution options.
 * @param options.configPath - Explicit path to `specd.yaml`.
 * @param options.repoPath - Explicit repository path for bootstrap mode.
 * @returns The resolved graph command context.
 * @throws {Error} If bootstrap mode is requested or required outside a repository.
 */
export async function resolveGraphCliContext(options?: {
  configPath?: string | undefined
  repoPath?: string | undefined
}): Promise<GraphCliContext> {
  if (options?.configPath !== undefined && options.repoPath !== undefined) {
    throw new Error('--config and --path are mutually exclusive')
  }

  if (options?.repoPath !== undefined) {
    return createBootstrapContext(options.repoPath)
  }

  if (options?.configPath !== undefined) {
    const context = await resolveCliContext({ configPath: options.configPath })
    return {
      mode: 'configured',
      config: context.config,
      configFilePath: context.configFilePath,
      kernel: context.kernel,
      projectRoot: context.config.projectRoot,
      vcsRoot: await resolveRepoRoot(context.config.projectRoot),
    }
  }

  const discoveredConfigPath = await resolveConfigPath()
  if (discoveredConfigPath !== null) {
    const context = await resolveCliContext()
    return {
      mode: 'configured',
      config: context.config,
      configFilePath: context.configFilePath,
      kernel: context.kernel,
      projectRoot: context.config.projectRoot,
      vcsRoot: await resolveRepoRoot(context.config.projectRoot),
    }
  }

  return createBootstrapContext(process.cwd())
}

/**
 * Creates graph context in bootstrap mode for a repository path.
 *
 * @param startPath - Path inside the repository.
 * @returns Bootstrap graph context.
 * @throws {Error} If no repository root can be resolved.
 */
async function createBootstrapContext(startPath: string): Promise<GraphCliContext> {
  const vcsRoot = await resolveRepoRoot(startPath)
  const config = createBootstrapGraphConfig({ projectRoot: vcsRoot, vcsRoot })
  return {
    mode: 'bootstrap',
    config,
    configFilePath: null,
    kernel: null,
    projectRoot: vcsRoot,
    vcsRoot,
  }
}

/**
 * Resolves the repository root for a path.
 *
 * @param startPath - Path inside the target repository.
 * @returns Absolute repository root path.
 * @throws {Error} If the path is not inside a repository.
 */
async function resolveRepoRoot(startPath: string): Promise<string> {
  try {
    const vcs = await createVcsAdapter(startPath)
    const root = await vcs.rootDir()
    if (root === null) {
      throw new Error('No repository root found')
    }
    return root
  } catch {
    throw new Error(
      'Graph bootstrap mode requires a path inside a VCS repository or a discovered specd.yaml',
    )
  }
}
