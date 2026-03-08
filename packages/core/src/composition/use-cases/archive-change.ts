import * as path from 'node:path'
import { ArchiveChange } from '../../application/use-cases/archive-change.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArchiveRepository } from '../archive-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { GitCLIAdapter } from '../../infrastructure/git/git-adapter.js'
import { NodeHookRunner } from '../../infrastructure/node/hook-runner.js'

/**
 * Domain context for the primary (default) workspace used by `ArchiveChange`.
 */
export interface ArchiveChangeContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths and pre-built port instances for
 * `createArchiveChange(context, options)`.
 */
export interface FsArchiveChangeOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /** Optional archive directory pattern (e.g. `'{{year}}/{{change.archivedName}}'`). */
  readonly archivePattern?: string
  /**
   * Pre-built spec repositories keyed by workspace name.
   *
   * Must include entries for every workspace declared in the project config.
   * `ArchiveChange` looks up the correct repo for each workspace by name.
   */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs an `ArchiveChange` use case wired to all configured workspaces.
 *
 * The `SpecdConfig` overload builds the workspace spec repository map, the
 * archive repository, the schema registry, the parser registry, the hook
 * runner, and the git adapter internally.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel-level overrides
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createArchiveChange(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ArchiveChange
/**
 * Constructs an `ArchiveChange` use case with explicit context and options.
 *
 * Use this form in tests or integration scenarios where custom paths or
 * pre-built repositories are needed.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and pre-built spec repositories
 * @returns The pre-wired use case instance
 */
export function createArchiveChange(
  context: ArchiveChangeContext,
  options: FsArchiveChangeOptions,
): ArchiveChange
/**
 * Constructs an `ArchiveChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createArchiveChange(
  configOrContext: SpecdConfig | ArchiveChangeContext,
  options?: FsArchiveChangeOptions | { extraNodeModulesPaths?: readonly string[] },
): ArchiveChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const defaultWs = getDefaultWorkspace(config)
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
    return createArchiveChange(
      {
        workspace: defaultWs.name,
        ownership: defaultWs.ownership,
        isExternal: defaultWs.isExternal,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        archivePath: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { archivePattern: config.storage.archivePattern }
          : {}),
        specRepositories: specRepos,
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
      },
    )
  }
  const opts = options as FsArchiveChangeOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    archivePath: opts.archivePath,
    ...(opts.archivePattern !== undefined ? { pattern: opts.archivePattern } : {}),
  })
  const schemas = createSchemaRegistry('fs', { nodeModulesPaths: opts.nodeModulesPaths })
  const parsers = createArtifactParserRegistry()
  const hooks = new NodeHookRunner()
  const git = new GitCLIAdapter()
  return new ArchiveChange(
    changeRepo,
    opts.specRepositories,
    archiveRepo,
    hooks,
    git,
    parsers,
    schemas,
  )
}
