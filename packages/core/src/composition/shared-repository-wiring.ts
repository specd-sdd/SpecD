import * as fs from 'node:fs'
import * as path from 'node:path'
import { type SpecdConfig } from '../application/specd-config.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { createSpecRepository } from './spec-repository.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { createChangeRepository } from './change-repository.js'
import { createSchemaRegistry } from './schema-registry.js'
import { createSchemaRepository } from './schema-repository.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { getDefaultWorkspace } from './get-default-workspace.js'
import { parseSpecId } from '../domain/services/parse-spec-id.js'
import { SpecPath } from '../domain/value-objects/spec-path.js'

/**
 * Options for mapping spec repositories.
 */
export interface SharedSpecRepositoryMapOptions {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
}

/**
 * Options for constructing a change repository.
 */
export interface SharedChangeRepositoryOptions {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
}

/**
 * Resolves the canonical metadata path for a given workspace.
 *
 * @param config - Fully-resolved project configuration
 * @param workspace - Workspace configuration
 * @returns The resolved metadata path
 */
function resolveMetadataPathForWorkspace(
  config: SpecdConfig,
  workspace: SpecdConfig['workspaces'][number],
): string {
  if (workspace.specsAdapter.adapter === 'fs') {
    let current = path.resolve(workspace.specsPath)
    while (true) {
      if (fs.existsSync(path.join(current, '.git'))) {
        return path.join(current, '.specd', 'metadata')
      }
      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
    return path.join(workspace.specsPath, '..', '.specd', 'metadata')
  }
  return path.join(config.projectRoot, '.specd', 'metadata')
}

/**
 * Creates and returns a map of all configured spec repositories.
 *
 * @param options - Mapping options containing config
 * @returns Map of spec repositories keyed by workspace name
 */
export function createSharedSpecRepositories(
  options: SharedSpecRepositoryMapOptions,
): ReadonlyMap<string, SpecRepository> {
  const { config } = options
  const specRepos = new Map<string, SpecRepository>()
  for (const ws of config.workspaces) {
    const metadataPath = resolveMetadataPathForWorkspace(config, ws)
    specRepos.set(
      ws.name,
      createSpecRepository(
        'fs',
        {
          workspace: ws.name,
          ownership: ws.ownership,
          isExternal: ws.isExternal,
          configPath: config.configPath,
        },
        {
          specsPath: ws.specsPath,
          metadataPath,
          ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        },
      ),
    )
  }
  return specRepos
}

/**
 * Creates and returns the default change repository initialized with canonical schema and spec resolvers.
 *
 * @param options - Construction options containing config
 * @returns Initialized ChangeRepository instance
 */
export function createSharedChangeRepository(
  options: SharedChangeRepositoryOptions,
): ChangeRepository {
  const { config } = options
  const defaultWs = getDefaultWorkspace(config)
  const specs = createSharedSpecRepositories({ config })

  const schemaRepositories = new Map<string, SchemaRepository>()
  for (const ws of config.workspaces) {
    if (ws.schemasPath !== null) {
      schemaRepositories.set(
        ws.name,
        createSchemaRepository(
          'fs',
          {
            workspace: ws.name,
            ownership: ws.ownership,
            isExternal: ws.isExternal,
            configPath: config.configPath,
          },
          { schemasPath: ws.schemasPath },
        ),
      )
    }
  }

  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')],
    configDir: config.projectRoot,
    schemaRepositories,
  })

  return createChangeRepository(
    'fs',
    {
      workspace: defaultWs.name,
      ownership: defaultWs.ownership,
      isExternal: defaultWs.isExternal,
      configPath: config.configPath,
    },
    {
      changesPath: config.storage.changesPath,
      draftsPath: config.storage.draftsPath,
      discardedPath: config.storage.discardedPath,
      resolveArtifactTypes: async () => {
        const schema = await schemas.resolve(config.schemaRef)
        return schema !== null ? schema.artifacts() : []
      },
      resolveSpecExists: async (specId: string) => {
        const { workspace, capPath } = parseSpecId(specId)
        const specRepo = specs.get(workspace)
        if (specRepo === undefined) return false
        const spec = await specRepo.get(SpecPath.parse(capPath))
        return spec !== null
      },
    },
  )
}
