import * as path from 'node:path'
import { type SpecdConfig } from '../application/specd-config.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../application/ports/artifact-parser.js'
import { type ContentHasher } from '../application/ports/content-hasher.js'
import { type FileReader } from '../application/ports/file-reader.js'
import { type GitAdapter } from '../application/ports/git-adapter.js'
import { type HookRunner } from '../application/ports/hook-runner.js'
import { type ConfigWriter } from '../application/ports/config-writer.js'
import { type YamlSerializer } from '../application/ports/yaml-serializer.js'
import { GitCLIAdapter } from '../infrastructure/git/git-adapter.js'
import { NodeHookRunner } from '../infrastructure/node/hook-runner.js'
import { NodeContentHasher } from '../infrastructure/node/content-hasher.js'
import { NodeYamlSerializer } from '../infrastructure/node/yaml-serializer.js'
import { FsFileReader } from '../infrastructure/fs/file-reader.js'
import { createArtifactParserRegistry } from '../infrastructure/artifact-parser/registry.js'
import { FsConfigWriter } from '../infrastructure/fs/config-writer.js'
import { createChangeRepository } from './change-repository.js'
import { createArchiveRepository } from './archive-repository.js'
import { createSpecRepository } from './spec-repository.js'
import { createSchemaRegistry } from './schema-registry.js'
import { getDefaultWorkspace } from './get-default-workspace.js'
import { type KernelOptions } from './kernel.js'

/**
 * Shared adapter instances pre-built once for use across all kernel use cases.
 *
 * Eliminates redundant construction of identical adapters (e.g. ~11 duplicate
 * `GitCLIAdapter` instances, 6 duplicate `ChangeRepository` instances) that
 * occurred when each factory independently created its own adapters.
 */
export interface KernelInternals {
  /** Change repository for the default workspace. */
  readonly changes: ChangeRepository
  /** Archive repository for the default workspace. */
  readonly archive: ArchiveRepository
  /** Spec repositories keyed by workspace name. */
  readonly specs: ReadonlyMap<string, SpecRepository>
  /** Schema registry for schema resolution. */
  readonly schemas: SchemaRegistry
  /** Artifact parser registry. */
  readonly parsers: ArtifactParserRegistry
  /** Content hasher for artifact hash computation. */
  readonly hasher: ContentHasher
  /** File reader for context file resolution. */
  readonly files: FileReader
  /** Git adapter for identity resolution and history. */
  readonly git: GitAdapter
  /** Hook runner for lifecycle hooks. */
  readonly hooks: HookRunner
  /** Config writer for project init and skill recording. */
  readonly configWriter: ConfigWriter
  /** YAML serializer for metadata operations. */
  readonly yaml: YamlSerializer
  /** Schema reference string from config. */
  readonly schemaRef: string
  /** Map of workspace name → absolute schemas directory path. */
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
}

/**
 * Builds all shared adapter instances from the project configuration.
 *
 * Called once by {@link createKernel} to avoid constructing duplicate adapters
 * across individual use case factories.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional kernel-level overrides
 * @returns Pre-built adapter instances for all use cases
 */
export function createKernelInternals(
  config: SpecdConfig,
  options?: KernelOptions,
): KernelInternals {
  const defaultWs = getDefaultWorkspace(config)
  const wsContext = {
    workspace: defaultWs.name,
    ownership: defaultWs.ownership,
    isExternal: defaultWs.isExternal,
  }

  const storagePaths = {
    changesPath: config.storage.changesPath,
    draftsPath: config.storage.draftsPath,
    discardedPath: config.storage.discardedPath,
  }

  const nodeModulesPaths = [
    path.join(config.projectRoot, 'node_modules'),
    ...(options?.extraNodeModulesPaths ?? []),
  ]

  const changes = createChangeRepository('fs', wsContext, storagePaths)

  const archive = createArchiveRepository('fs', wsContext, {
    ...storagePaths,
    archivePath: config.storage.archivePath,
    ...(config.storage.archivePattern !== undefined
      ? { pattern: config.storage.archivePattern }
      : {}),
  })

  const specs = new Map(
    config.workspaces.map((ws) => [
      ws.name,
      createSpecRepository(
        'fs',
        { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
        { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
      ),
    ]),
  )

  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths,
    configDir: config.projectRoot,
  })

  const workspaceSchemasPaths = new Map<string, string>()
  for (const ws of config.workspaces) {
    if (ws.schemasPath !== null) {
      workspaceSchemasPaths.set(ws.name, ws.schemasPath)
    }
  }

  return {
    changes,
    archive,
    specs,
    schemas,
    parsers: createArtifactParserRegistry(),
    hasher: new NodeContentHasher(),
    files: new FsFileReader(),
    git: new GitCLIAdapter(),
    hooks: new NodeHookRunner(),
    configWriter: new FsConfigWriter(),
    yaml: new NodeYamlSerializer(),
    schemaRef: config.schemaRef,
    workspaceSchemasPaths,
  }
}
