import { AdapterRegistry } from '../../infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../infrastructure/tree-sitter/php-language-adapter.js'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SpecdConfig } from '@specd/core'

/**
 * Creates an `AdapterRegistry` populated with built-in language adapters
 * (TypeScript, Python, Go, PHP) and any optional custom adapters provided.
 *
 * @param extraAdapters - Optional array of custom LanguageAdapter instances
 * @returns A populated AdapterRegistry instance
 */
export function createBuiltinAdapterRegistry(
  extraAdapters?: readonly LanguageAdapter[],
): AdapterRegistry
/**
 * Creates an `AdapterRegistry` from a `SpecdConfig` configuration instance.
 *
 * Compatibility-only overload: `SpecdConfig` carries no adapter-registration
 * field, so this always returns the built-in registry. Custom adapters must be
 * supplied through `CodeGraphCompositionOptions.adapters`.
 *
 * @param config - SpecdConfig project configuration
 * @returns A populated AdapterRegistry instance
 */
export function createBuiltinAdapterRegistry(config: SpecdConfig): AdapterRegistry
/**
 * Overload handler for creating a built-in `AdapterRegistry`.
 *
 * @param depsOrConfig - Optional custom adapters array or SpecdConfig object
 * @returns A populated AdapterRegistry instance
 */
export function createBuiltinAdapterRegistry(
  depsOrConfig?: readonly LanguageAdapter[] | SpecdConfig,
): AdapterRegistry {
  const registry = new AdapterRegistry()
  registry.register(new TypeScriptLanguageAdapter())
  registry.register(new PythonLanguageAdapter())
  registry.register(new GoLanguageAdapter())
  registry.register(new PhpLanguageAdapter())

  if (Array.isArray(depsOrConfig)) {
    for (const adapter of depsOrConfig as readonly LanguageAdapter[]) {
      registry.register(adapter)
    }
  }

  return registry
}
