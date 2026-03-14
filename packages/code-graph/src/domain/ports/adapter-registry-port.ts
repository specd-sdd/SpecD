import { type LanguageAdapter } from '../value-objects/language-adapter.js'

/**
 * Port for resolving language adapters by file path or language identifier.
 */
export interface AdapterRegistryPort {
  /** Returns the adapter for a file based on its extension, or `undefined` if unsupported. */
  getAdapterForFile(filePath: string): LanguageAdapter | undefined

  /** Returns the language identifier for a file based on its extension, or `undefined`. */
  getLanguageForFile(filePath: string): string | undefined
}
