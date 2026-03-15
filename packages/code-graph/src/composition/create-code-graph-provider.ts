import { type SpecdConfig } from '@specd/core'
import { type LanguageAdapter } from '../domain/value-objects/language-adapter.js'
import { LadybugGraphStore } from '../infrastructure/ladybug/ladybug-graph-store.js'
import { AdapterRegistry } from '../infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../infrastructure/tree-sitter/php-language-adapter.js'
import { IndexCodeGraph } from '../application/use-cases/index-code-graph.js'
import { CodeGraphProvider } from './code-graph-provider.js'

/** Configuration options for creating a {@link CodeGraphProvider} (legacy). */
export interface CodeGraphOptions {
  readonly storagePath: string
  readonly adapters?: LanguageAdapter[]
}

/**
 * Factory function that wires up the code graph subsystem with default adapters.
 *
 * Accepts either a `SpecdConfig` (primary, workspace-aware) or a `CodeGraphOptions`
 * (legacy, standalone). When given `SpecdConfig`, derives the storage path from
 * `config.projectRoot`.
 *
 * @param options - SpecdConfig or CodeGraphOptions.
 * @returns A fully configured {@link CodeGraphProvider} instance.
 */
export function createCodeGraphProvider(
  options: SpecdConfig | CodeGraphOptions,
): CodeGraphProvider {
  const storagePath = isSpecdConfig(options) ? options.projectRoot : options.storagePath

  const store = new LadybugGraphStore(storagePath)

  const registry = new AdapterRegistry()
  registry.register(new TypeScriptLanguageAdapter())
  registry.register(new PythonLanguageAdapter())
  registry.register(new GoLanguageAdapter())
  registry.register(new PhpLanguageAdapter())

  if (!isSpecdConfig(options) && options.adapters) {
    for (const adapter of options.adapters) {
      registry.register(adapter)
    }
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
