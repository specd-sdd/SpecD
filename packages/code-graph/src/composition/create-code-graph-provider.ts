import { type SpecdConfig } from '@specd/core'
import { LadybugGraphStore } from '../infrastructure/ladybug/ladybug-graph-store.js'
import { IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { CodeGraphProviderImpl, type CodeGraphProvider } from './code-graph-provider.js'
import {
  type CodeGraphCompositionOptions,
  type CodeGraphOptions,
  type GraphStoreFactory,
  type GraphStoreFactoryOptions,
} from './graph-store-factory.js'
import { GraphStoreRegistryError } from '../domain/errors/graph-store-registry-error.js'
import { createSqliteGraphStoreFactory } from './create-sqlite-graph-store-factory.js'
import { createGetGraphHealth } from './use-cases/get-graph-health.js'
import { createBuiltinAdapterRegistry } from './use-cases/create-builtin-adapter-registry.js'
import { readInstalledCodeGraphVersion } from '../application/use-cases/_shared/installed-code-graph-version.js'
import { type WorkspaceIndexTarget } from '../domain/value-objects/index-options.js'

const DEFAULT_GRAPH_STORE_ID = 'sqlite'

const LADYBUG_GRAPH_STORE_FACTORY: GraphStoreFactory = {
  create(options: GraphStoreFactoryOptions) {
    return new LadybugGraphStore(options.storagePath)
  },
}

const SQLITE_GRAPH_STORE_FACTORY: GraphStoreFactory = createSqliteGraphStoreFactory()

const BUILTIN_GRAPH_STORE_FACTORIES: Readonly<Record<string, GraphStoreFactory>> = {
  ladybug: LADYBUG_GRAPH_STORE_FACTORY,
  sqlite: SQLITE_GRAPH_STORE_FACTORY,
}

/**
 * Factory function that wires up the code graph subsystem with default adapters.
 *
 * Accepts either a `SpecdConfig` (primary, workspace-aware) plus optional internal
 * composition overrides, or a `CodeGraphOptions` object (legacy, standalone).
 * When given `SpecdConfig`, derives the storage path from `config.configPath`.
 *
 * @param options - SpecdConfig or CodeGraphOptions.
 * @param factoryOptions - Optional composition overrides for the SpecdConfig overload.
 * @returns A fully configured {@link CodeGraphProvider} instance.
 * @throws {GraphStoreRegistryError} When the selected or additively-registered backend id is invalid.
 */
export function createCodeGraphProvider(
  options: SpecdConfig | CodeGraphOptions,
  factoryOptions?: CodeGraphCompositionOptions,
): CodeGraphProvider {
  const storagePath = isSpecdConfig(options) ? options.configPath : options.storagePath
  const projectRoot = isSpecdConfig(options) ? options.projectRoot : options.projectRoot
  const graphOptions = isSpecdConfig(options) ? factoryOptions : options
  const graphStoreRegistry = createGraphStoreRegistry(graphOptions?.graphStoreFactories)
  const graphStoreId = graphOptions?.graphStoreId ?? DEFAULT_GRAPH_STORE_ID
  const graphStoreFactory = graphStoreRegistry[graphStoreId]
  if (graphStoreFactory === undefined) {
    throw GraphStoreRegistryError.notFound(graphStoreId)
  }

  const store = graphStoreFactory.create({ storagePath })
  const registry = createBuiltinAdapterRegistry(graphOptions?.adapters)
  const indexer = new IndexCodeGraph(store, registry)

  const graphHealth = isSpecdConfig(options)
    ? {
        useCase: createGetGraphHealth(),
        input: {
          config: options,
          codeGraphVersion: readInstalledCodeGraphVersion(),
          workspaces: options.workspaces.map(
            (workspace): WorkspaceIndexTarget => ({
              name: workspace.name,
              prefix: workspace.prefix ?? null,
              codeRoot: workspace.codeRoot,
              ownership: workspace.ownership,
              isExternal: workspace.isExternal,
              // Fingerprinting also derives deterministic exclusions from the spec root.
              specRepo: {
                specsPath: workspace.specsPath,
              } as WorkspaceIndexTarget['specRepo'],
            }),
          ),
        },
      }
    : undefined

  return new CodeGraphProviderImpl(store, indexer, projectRoot, graphHealth)
}

/**
 * Type guard to distinguish SpecdConfig from CodeGraphOptions.
 * @param options - The options object to check.
 * @returns True if the options object is a SpecdConfig.
 */
function isSpecdConfig(options: SpecdConfig | CodeGraphOptions): options is SpecdConfig {
  return 'configPath' in options && 'workspaces' in options
}

/**
 * Merges built-in and additive graph-store factories, rejecting collisions.
 *
 * @param extra - Optional additive registrations.
 * @returns The merged graph-store factory registry.
 * @throws {GraphStoreRegistryError} When an additive registration collides with an existing id.
 */
function createGraphStoreRegistry(
  extra?: Readonly<Record<string, GraphStoreFactory>>,
): Readonly<Record<string, GraphStoreFactory>> {
  const registry: Record<string, GraphStoreFactory> = { ...BUILTIN_GRAPH_STORE_FACTORIES }
  for (const [id, factory] of Object.entries(extra ?? {})) {
    if (registry[id] !== undefined) {
      throw GraphStoreRegistryError.alreadyRegistered(id)
    }
    registry[id] = factory
  }
  return registry
}

export { createBuiltinAdapterRegistry } from './use-cases/create-builtin-adapter-registry.js'
