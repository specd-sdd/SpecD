import { ValidateArtifacts } from '../../application/use-cases/validate-artifacts.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../artifact-parser-registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { GitCLIAdapter } from '../../infrastructure/git/git-adapter.js'

/**
 * Domain context for the primary (default) workspace used by `ValidateArtifacts`.
 */
export interface ValidateArtifactsContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths and pre-built port instances for
 * `createValidateArtifacts(context, options)`.
 */
export interface FsValidateArtifactsOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /**
   * Pre-built spec repositories keyed by workspace name.
   *
   * Must include entries for every workspace declared in the project config.
   */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs a `ValidateArtifacts` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel-level overrides
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateArtifacts
/**
 * Constructs a `ValidateArtifacts` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and pre-built spec repositories
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(
  context: ValidateArtifactsContext,
  options: FsValidateArtifactsOptions,
): ValidateArtifacts
/**
 * Constructs a `ValidateArtifacts` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createValidateArtifacts(
  configOrContext: SpecdConfig | ValidateArtifactsContext,
  options?: FsValidateArtifactsOptions | { extraNodeModulesPaths?: readonly string[] },
): ValidateArtifacts {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const defaultWs = config.workspaces.find((w) => w.name === 'default')!
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
        ),
      ]),
    )
    return createValidateArtifacts(
      {
        workspace: defaultWs.name,
        ownership: defaultWs.ownership,
        isExternal: defaultWs.isExternal,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        specRepositories: specRepos,
        nodeModulesPaths: kernelOpts?.extraNodeModulesPaths ?? [],
      },
    )
  }
  const opts = options as FsValidateArtifactsOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const schemas = createSchemaRegistry('fs', { nodeModulesPaths: opts.nodeModulesPaths })
  const parsers = createArtifactParserRegistry()
  const git = new GitCLIAdapter()
  return new ValidateArtifacts(changeRepo, opts.specRepositories, schemas, parsers, git)
}
