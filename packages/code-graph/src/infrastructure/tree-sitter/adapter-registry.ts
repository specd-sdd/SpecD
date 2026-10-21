import {
  type AdapterDeclarationPolicy,
  type LanguageAdapter,
} from '../../domain/value-objects/language-adapter.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { type AdapterCapabilities } from '../../domain/value-objects/symbol-reference.js'
import { InvalidLanguageAdapterError } from '../../domain/errors/invalid-language-adapter-error.js'

/** Required core members of a language adapter. */
export const CORE_MEMBERS = [
  'languages',
  'extensions',
  'resolutionManifests',
  'analyzeFile',
  'resolveImports',
  'buildRelations',
] as const

/** Members that every present facet must provide as functions. */
export const FACET_MEMBERS = {
  packageResolution: ['identity', 'prepare', 'matchSpecifier', 'entrySurface'],
  relativeImportResolution: ['resolve'],
  qualifiedNameResolution: ['build', 'resolveToPath'],
  symbolReferenceSyntax: ['parse', 'render'],
  reExportLinking: ['link'],
} as const

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
   * Validates the adapter shape and declaration policy before changing any state.
   *
   * Registering an adapter for an already registered language replaces the previous adapter
   * for that language (the later registration wins), so a third-party adapter can substitute a
   * built-in one. Replacement is per language: extension mappings the new adapter declares
   * overwrite earlier ones, an earlier adapter keeps the languages the new one does not declare,
   * and an adapter left without any language is no longer returned by {@link getAdapters}.
   * @param adapter - The language adapter to register.
   * @throws {InvalidLanguageAdapterError} When the adapter shape is invalid.
   * @throws {Error} When the adapter declares an invalid parser policy.
   */
  register(adapter: LanguageAdapter): void {
    this.validateAdapter(adapter)
    const policy = adapter.declarationPolicy?.()
    if (policy !== undefined) {
      if (policy.structuralFactsAreParserAuthoritative !== true) {
        throw new Error(
          `Adapter for [${adapter.languages().join(', ')}] must declare structuralFactsAreParserAuthoritative: true`,
        )
      }
      if (!policy.callableContainerKinds || !(policy.callableContainerKinds instanceof Set)) {
        throw new Error(
          `Adapter for [${adapter.languages().join(', ')}] must declare callableContainerKinds Set`,
        )
      }
    }

    for (const lang of adapter.languages()) {
      this.adapters.set(lang, adapter)
    }
    for (const [ext, lang] of Object.entries(adapter.extensions())) {
      this.extMap.set(ext, lang)
    }
  }

  /**
   * Validates the shape of an adapter without changing registry state.
   * @param adapter - Adapter about to be registered.
   * @throws {InvalidLanguageAdapterError} When a required member, facet, language, or extension is invalid.
   */
  private validateAdapter(adapter: LanguageAdapter): void {
    const record = adapter as unknown as Record<string, unknown>
    const declared = (): string[] => {
      try {
        const value = typeof record['languages'] === 'function' ? adapter.languages() : []
        return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
      } catch {
        return []
      }
    }
    for (const member of CORE_MEMBERS) {
      if (typeof record[member] !== 'function') {
        throw new InvalidLanguageAdapterError(
          declared(),
          `missing required member "${member}"`,
          member,
        )
      }
    }
    const languages = adapter.languages()
    if (languages.length === 0) {
      throw new InvalidLanguageAdapterError(languages, 'languages() returned no language')
    }
    const extensions = adapter.extensions()
    for (const [ext, lang] of Object.entries(extensions)) {
      if (!languages.includes(lang)) {
        throw new InvalidLanguageAdapterError(
          languages,
          `extension "${ext}" maps to undeclared language "${lang}"`,
        )
      }
    }
    for (const [facet, members] of Object.entries(FACET_MEMBERS)) {
      const value = record[facet]
      if (value === undefined) continue
      if (typeof value !== 'object' || value === null) {
        throw new InvalidLanguageAdapterError(
          languages,
          `facet "${facet}" must be an object`,
          facet,
        )
      }
      for (const member of members) {
        if (typeof (value as Record<string, unknown>)[member] !== 'function') {
          throw new InvalidLanguageAdapterError(
            languages,
            `facet "${facet}" is missing member "${member}"`,
            member,
          )
        }
      }
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
   * Returns the declaration policy declared by a registered adapter.
   * @param languageId - Registered language identifier.
   * @returns Declared declaration policy, or undefined when unsupported or unregistered.
   */
  getDeclarationPolicy(languageId: string): AdapterDeclarationPolicy | undefined {
    return this.adapters.get(languageId)?.declarationPolicy?.()
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
}
