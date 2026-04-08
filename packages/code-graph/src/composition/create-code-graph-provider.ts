import { type SpecdConfig } from '@specd/core'
import { LadybugGraphStore } from '../infrastructure/ladybug/ladybug-graph-store.js'
import { SQLiteGraphStore } from '../infrastructure/sqlite/sqlite-graph-store.js'
import { AdapterRegistry } from '../infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../infrastructure/tree-sitter/php-language-adapter.js'
import { IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { CodeGraphProvider } from './code-graph-provider.js'
import {
  type CodeGraphFactoryOptions,
  type CodeGraphOptions,
  type GraphStoreFactory,
  type GraphStoreFactoryOptions,
} from './graph-store-factory.js'

const DEFAULT_GRAPH_STORE_ID = 'sqlite'

const LADYBUG_GRAPH_STORE_FACTORY: GraphStoreFactory = {
  create(options: GraphStoreFactoryOptions) {
    return new LadybugGraphStore(options.storagePath)
  },
}

const SQLITE_GRAPH_STORE_FACTORY: GraphStoreFactory = {
  create(options: GraphStoreFactoryOptions) {
    return new SQLiteGraphStore(options.storagePath)
  },
}

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
 * @throws {Error} When the selected or additively-registered backend id is invalid.
 */
export function createCodeGraphProvider(
  options: SpecdConfig | CodeGraphOptions,
  factoryOptions?: CodeGraphFactoryOptions,
): CodeGraphProvider {
  const storagePath = isSpecdConfig(options) ? options.configPath : options.storagePath
  const graphOptions = isSpecdConfig(options) ? factoryOptions : options
  const graphStoreRegistry = createGraphStoreRegistry(graphOptions?.graphStoreFactories)
  const graphStoreId = graphOptions?.graphStoreId ?? DEFAULT_GRAPH_STORE_ID
  const graphStoreFactory = graphStoreRegistry[graphStoreId]
  if (graphStoreFactory === undefined) {
    throw new Error(`graph store '${graphStoreId}' is not registered`)
  }

  const store = graphStoreFactory.create({ storagePath })

  const registry = new AdapterRegistry()
  registry.register(new TypeScriptLanguageAdapter())
  registry.register(new PythonLanguageAdapter())
  registry.register(new GoLanguageAdapter())
  registry.register(new PhpLanguageAdapter())

  for (const adapter of graphOptions?.adapters ?? []) {
    registry.register(adapter)
  }

  const indexer = new IndexCodeGraph(store, registry)

  return new CodeGraphProvider(store, indexer)
}

/**
 * Type guard to distinguish SpecdConfig from CodeGraphOptions.
 * @param options - The options object to check.
 * @returns True if the options object is a SpecdConfig.
 */
function isSpecdConfig(options: SpecdConfig | CodeGraphOptions): options is SpecdConfig {
  return 'projectRoot' in options
}

/**
 * Merges built-in and additive graph-store factories, rejecting collisions.
 *
 * @param extra - Optional additive registrations.
 * @returns The merged graph-store factory registry.
 * @throws {Error} When an additive registration collides with an existing id.
 */
function createGraphStoreRegistry(
  extra?: Readonly<Record<string, GraphStoreFactory>>,
): Readonly<Record<string, GraphStoreFactory>> {
  const registry: Record<string, GraphStoreFactory> = { ...BUILTIN_GRAPH_STORE_FACTORIES }
  for (const [id, factory] of Object.entries(extra ?? {})) {
    if (registry[id] !== undefined) {
      throw new Error(`graph store '${id}' is already registered`)
    }
    registry[id] = factory
  }
  return registry
}
