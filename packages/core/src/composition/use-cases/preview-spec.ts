import * as path from 'node:path'
import { PreviewSpec } from '../../application/use-cases/preview-spec.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'

/** Domain context for the primary (default) workspace used by `createPreviewSpec`. */
export interface PreviewSpecWorkspace {
  /** The workspace name from `specd.yaml`. */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
}

/** Filesystem adapter paths and pre-built port instances for `createPreviewSpec`. */
export interface FsPreviewSpecOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Constructs a `PreviewSpec` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel-level overrides
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): PreviewSpec
/**
 * Constructs a `PreviewSpec` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and pre-built spec repositories
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(
  context: PreviewSpecWorkspace,
  options: FsPreviewSpecOptions,
): PreviewSpec
/**
 * Constructs a `PreviewSpec` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(
  configOrContext: SpecdConfig | PreviewSpecWorkspace,
  options?: FsPreviewSpecOptions | { extraNodeModulesPaths?: readonly string[] },
): PreviewSpec {
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
          {
            specsPath: ws.specsPath,
            metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
            ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
          },
        ),
      ]),
    )
    const schemaRepos = new Map(
      config.workspaces
        .filter((ws) => ws.schemasPath !== null)
        .map((ws) => [
          ws.name,
          createSchemaRepository(
            'fs',
            { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
            { schemasPath: ws.schemasPath! },
          ),
        ]),
    ) as ReadonlyMap<string, SchemaRepository>
    return createPreviewSpec(
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
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
        configDir: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: schemaRepos,
      },
    )
  }
  const opts = options as FsPreviewSpecOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
    schemaRepositories: opts.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(schemas, opts.schemaRef, [], undefined)
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const parsers = createArtifactParserRegistry()
  return new PreviewSpec(changeRepo, opts.specRepositories, schemaProvider, parsers)
}
