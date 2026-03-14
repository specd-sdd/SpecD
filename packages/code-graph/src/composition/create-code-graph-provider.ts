import { type LanguageAdapter } from '../domain/value-objects/language-adapter.js'
import { LadybugGraphStore } from '../infrastructure/ladybug/ladybug-graph-store.js'
import { AdapterRegistry } from '../infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../infrastructure/tree-sitter/typescript-language-adapter.js'
import { IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { CodeGraphProvider } from './code-graph-provider.js'

/** Configuration options for creating a {@link CodeGraphProvider}. */
export interface CodeGraphOptions {
  readonly storagePath: string
  readonly adapters?: LanguageAdapter[]
}

/**
 * Factory function that wires up the code graph subsystem with default adapters.
 * @param options - Configuration options including storage path and optional custom adapters.
 * @returns A fully configured {@link CodeGraphProvider} instance.
 */
export function createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider {
  const store = new LadybugGraphStore(options.storagePath)

  const registry = new AdapterRegistry()
  registry.register(new TypeScriptLanguageAdapter())

  if (options.adapters) {
    for (const adapter of options.adapters) {
      registry.register(adapter)
    }
  }

  const indexer = new IndexCodeGraph(store, registry)

  return new CodeGraphProvider(store, indexer)
}
