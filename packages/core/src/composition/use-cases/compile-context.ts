import path from 'node:path'
import { CompileContext } from '../../application/use-cases/compile-context.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../artifact-parser-registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'

/**
 * Domain context for the primary (default) workspace used by `CompileContext`.
 */
export interface CompileContextContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter paths and pre-built port instances for
 * `createCompileContext(context, options)`.
 */
export interface FsCompileContextOptions {
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
  readonly nodeModulesPath: string
}

/**
 * Constructs a `CompileContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createCompileContext(config: SpecdConfig): CompileContext
/**
 * Constructs a `CompileContext` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and pre-built spec repositories
 * @returns The pre-wired use case instance
 */
export function createCompileContext(
  context: CompileContextContext,
  options: FsCompileContextOptions,
): CompileContext
/**
 * Constructs a `CompileContext` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createCompileContext(
  configOrContext: SpecdConfig | CompileContextContext,
  options?: FsCompileContextOptions,
): CompileContext {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const defaultWs = config.workspaces.find((w) => w.name === 'default')!
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          { specsPath: ws.specsPath },
        ),
      ]),
    )
    return createCompileContext(
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
        nodeModulesPath: path.join(config.projectRoot, 'node_modules'),
      },
    )
  }
  const opts = options!
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const schemas = createSchemaRegistry('fs', { nodeModulesPath: opts.nodeModulesPath })
  const files = new FsFileReader()
  const parsers = createArtifactParserRegistry()
  return new CompileContext(changeRepo, opts.specRepositories, schemas, files, parsers)
}
