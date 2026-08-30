import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { type AdapterCapabilities } from '../../domain/value-objects/symbol-reference.js'

/**
 * Maps file extensions to language adapters. Implements {@link AdapterRegistryPort}
 * for use by application-layer use cases.
 *
 * The extension-to-language map is built dynamically from registered adapters
 * via their `extensions()` method — no hardcoded language list.
 */
export class AdapterRegistry implements AdapterRegistryPort {
  private adapters = new Map<string, LanguageAdapter>()
  private extMap = new Map<string, string>()

  /**
   * Registers a language adapter for all languages and extensions it supports.
   * @param adapter - The language adapter to register.
   */
  register(adapter: LanguageAdapter): void {
    for (const lang of adapter.languages()) {
      this.adapters.set(lang, adapter)
    }
    for (const [ext, lang] of Object.entries(adapter.extensions())) {
      this.extMap.set(ext, lang)
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
   * Returns the semantic reference capabilities declared by a registered adapter.
   * Absence is intentional: consumers must treat an undeclared capability as unsupported.
   * @param languageId - Registered language identifier.
   * @returns Declared capabilities, or undefined when unsupported or unregistered.
   */
  getCapabilities(languageId: string): AdapterCapabilities | undefined {
    return this.adapters.get(languageId)?.capabilities?.()
  }

  /**
   * Retrieves a registered adapter for a file based on its extension.
   * @param filePath - Path to the file.
   * @returns The matching adapter, or undefined if the extension is not recognized.
   */
  getAdapterForFile(filePath: string): LanguageAdapter | undefined {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    const lang = this.extMap.get(ext)
    if (!lang) return undefined
    return this.adapters.get(lang)
  }

  /**
   * Determines the language identifier for a file based on its extension.
   * @param filePath - Path to the file.
   * @returns The language identifier string, or undefined if the extension is not recognized.
   */
  getLanguageForFile(filePath: string): string | undefined {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    return this.extMap.get(ext)
  }

  /**
   * Returns all unique registered adapters.
   * @returns An array of unique adapter instances.
   */
  getAdapters(): LanguageAdapter[] {
    return [...new Set(this.adapters.values())]
  }

  /**
   * Returns all file extensions registered across adapters.
   * @returns An array of unique file extension strings (e.g. ['.ts', '.py', '.go']).
   */
  getSupportedExtensions(): string[] {
    return [...this.extMap.keys()]
  }

  /**
   * Returns all reserved keywords and built-in type names aggregated across registered adapters.
   * @returns Set of unique keyword strings.
   */
  getReservedKeywords(): Set<string> {
    const keywords = new Set<string>()
    for (const adapter of this.getAdapters()) {
      if (typeof adapter.keywords === 'function') {
        for (const kw of adapter.keywords()) {
          keywords.add(kw)
        }
      }
    }
    return keywords
  }
}
