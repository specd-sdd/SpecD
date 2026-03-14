import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.php': 'php',
}

/**
 * Maps file extensions to language adapters. Implements {@link AdapterRegistryPort}
 * for use by application-layer use cases.
 */
export class AdapterRegistry implements AdapterRegistryPort {
  private adapters = new Map<string, LanguageAdapter>()

  /**
   * Registers a language adapter for all languages it supports.
   * @param adapter - The language adapter to register.
   */
  register(adapter: LanguageAdapter): void {
    for (const lang of adapter.languages()) {
      this.adapters.set(lang, adapter)
    }
  }

  /**
   * Retrieves a registered adapter by language identifier.
   * @param languageId - The language identifier to look up.
   * @returns The matching adapter, or undefined if none is registered.
   */
  getAdapter(languageId: string): LanguageAdapter | undefined {
    return this.adapters.get(languageId)
  }

  /**
   * Retrieves a registered adapter for a file based on its extension.
   * @param filePath - Path to the file.
   * @returns The matching adapter, or undefined if the extension is not recognized.
   */
  getAdapterForFile(filePath: string): LanguageAdapter | undefined {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    const lang = EXTENSION_TO_LANGUAGE[ext]
    if (!lang) {
      return undefined
    }
    return this.adapters.get(lang)
  }

  /**
   * Determines the language identifier for a file based on its extension.
   * @param filePath - Path to the file.
   * @returns The language identifier string, or undefined if the extension is not recognized.
   */
  getLanguageForFile(filePath: string): string | undefined {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    return EXTENSION_TO_LANGUAGE[ext]
  }
}
