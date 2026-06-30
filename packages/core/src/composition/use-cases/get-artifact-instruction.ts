import * as path from 'node:path'
import { GetArtifactInstruction } from '../../application/use-cases/get-artifact-instruction.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createSchemaRepositoriesForConfig } from '../schema-resolution.js'
import { TemplateExpander } from '../../application/template-expander.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { Logger } from '../../application/logger.js'
import { LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import { createResolveSchema } from './resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'

/** Domain context for `createGetArtifactInstruction(context, options)`. */
export interface GetArtifactInstructionContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}

/** Filesystem adapter paths for `createGetArtifactInstruction(context, options)`. */
export interface FsGetArtifactInstructionOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly projectRoot: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs a `GetArtifactInstruction` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GetArtifactInstruction
/**
 * Constructs a `GetArtifactInstruction` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and schema wiring
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  context: GetArtifactInstructionContext,
  options: FsGetArtifactInstructionOptions,
): GetArtifactInstruction
/**
 * Constructs a `GetArtifactInstruction` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  configOrContext: SpecdConfig | GetArtifactInstructionContext,
  options?: FsGetArtifactInstructionOptions | { extraNodeModulesPaths?: readonly string[] },
): GetArtifactInstruction {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const ws = getDefaultWorkspace(config)
    const specRepos = new Map(
      config.workspaces.map((workspace) => [
        workspace.name,
        createSpecRepository(
          'fs',
          {
            workspace: workspace.name,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            configPath: config.configPath,
          },
          {
            specsPath: workspace.specsPath,
            metadataPath: path.join(workspace.specsPath, '..', '.specd', 'metadata'),
            ...(workspace.prefix !== undefined ? { prefix: workspace.prefix } : {}),
          },
        ),
      ]),
    )
    return createGetArtifactInstruction(
      {
        workspace: ws.name,
        ownership: ws.ownership,
        isExternal: ws.isExternal,
        configPath: config.configPath,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        projectRoot: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: createSchemaRepositoriesForConfig(config),
        specRepositories: specRepos,
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
      },
    )
  }
  const opts = options as FsGetArtifactInstructionOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const resolveSchema = createResolveSchema({
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.projectRoot,
    schemaRef: opts.schemaRef,
    schemaRepositories: opts.schemaRepositories,
  })
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const expander = new TemplateExpander({ project: { root: opts.projectRoot } })
  const parsers = createArtifactParserRegistry()
  return new GetArtifactInstruction(
    changeRepo,
    opts.specRepositories,
    schemaProvider,
    parsers,
    expander,
    new LifecycleEngine(Logger.debug.bind(Logger)),
  )
}
