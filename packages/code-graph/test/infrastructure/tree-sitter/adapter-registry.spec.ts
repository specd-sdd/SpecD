import { describe, expect, it } from 'vitest'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { InvalidLanguageAdapterError } from '../../../src/domain/errors/invalid-language-adapter-error.js'

function pseudoAdapter(overrides: Partial<LanguageAdapter> = {}): LanguageAdapter {
  return {
    languages: () => ['pseudo'],
    extensions: () => ({ '.pseudo': 'pseudo', '.ps': 'pseudo' }),
    resolutionManifests: () => [],
    analyzeFile: () => ({
      language: 'pseudo',
      symbols: [],
      imports: [],
      bindingFacts: [],
      callFacts: [],
    }),
    resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
    buildRelations: () => [],
    ...overrides,
  }
}

describe('AdapterRegistry', () => {
  it('given a registered adapter, when queried by language, then it returns that adapter', () => {
    const registry = new AdapterRegistry()
    const typescript = new TypeScriptLanguageAdapter()

    registry.register(typescript)

    expect(registry.getAdapter('typescript')).toBe(typescript)
    expect(registry.getAdapter('python')).toBeUndefined()
  })

  it('given adapters with extensions, when queried by file, then it maps the extension to language and adapter', () => {
    const registry = new AdapterRegistry()
    const python = new PythonLanguageAdapter()
    registry.register(python)

    expect(registry.getLanguageForFile('pkg/module.py')).toBe('python')
    expect(registry.getAdapterForFile('pkg/module.pyi')).toBe(python)
    expect(registry.getAdapterForFile('pkg/module.unknown')).toBeUndefined()
    expect(registry.getLanguageForFile('pkg/module.unknown')).toBeUndefined()
  })

  it('given one adapter serving several languages or extensions, when listed, then getAdapters returns it once', () => {
    const registry = new AdapterRegistry()
    const typescript = new TypeScriptLanguageAdapter()
    registry.register(typescript)

    expect(registry.getAdapters()).toEqual([typescript])
  })

  it('given an adapter that declares capabilities and a policy, when asked, then the registry exposes them by language', () => {
    const registry = new AdapterRegistry()
    const typescript = new TypeScriptLanguageAdapter()
    registry.register(typescript)

    expect(registry.getCapabilities('typescript')).toEqual(typescript.capabilities?.())
    expect(registry.getDeclarationPolicy('typescript')).toEqual(typescript.declarationPolicy?.())
    expect(registry.getCapabilities('unknown')).toBeUndefined()
    expect(registry.getDeclarationPolicy('unknown')).toBeUndefined()
  })

  it('given an adapter without capabilities, when asked, then absence is reported as unsupported', () => {
    const registry = new AdapterRegistry()
    registry.register(pseudoAdapter())

    expect(registry.getCapabilities('pseudo')).toBeUndefined()
    expect(registry.getDeclarationPolicy('pseudo')).toBeUndefined()
  })

  it('given a policy that is not parser-authoritative, when registered, then registration is rejected', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter({
      declarationPolicy: () => ({
        languageIds: ['pseudo'],
        callableContainerKinds: new Set([SymbolKind.Function]),
        supportsLogicalDeclarationGroups: false,
        supportsPhysicalOnlyDeclarations: true,
        structuralFactsAreParserAuthoritative: false as unknown as true,
      }),
    })

    expect(() => registry.register(adapter)).toThrow(/structuralFactsAreParserAuthoritative/)
    expect(registry.getAdapter('pseudo')).toBeUndefined()
  })

  it('given a policy without a callable container set, when registered, then registration is rejected', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter({
      declarationPolicy: () => ({
        languageIds: ['pseudo'],
        callableContainerKinds: [] as unknown as ReadonlySet<SymbolKind>,
        supportsLogicalDeclarationGroups: false,
        supportsPhysicalOnlyDeclarations: true,
        structuralFactsAreParserAuthoritative: true,
      }),
    })

    expect(() => registry.register(adapter)).toThrow(/callableContainerKinds/)
  })

  it('given two adapters registered for one language, when queried, then the later registration wins and the earlier one is no longer listed', () => {
    const registry = new AdapterRegistry()
    const first = pseudoAdapter()
    const second = pseudoAdapter()

    registry.register(first)
    registry.register(second)

    expect(registry.getAdapter('pseudo')).toBe(second)
    expect(registry.getAdapterForFile('a.ps')).toBe(second)
    expect(registry.getAdapters()).toEqual([second])
  })

  it('given a replacement that declares only one of several languages, when queried, then the earlier adapter keeps the others', () => {
    const registry = new AdapterRegistry()
    const typescript = new TypeScriptLanguageAdapter()
    const custom = pseudoAdapter({
      languages: () => ['typescript'],
      extensions: () => ({ '.ts': 'typescript' }),
    })

    registry.register(typescript)
    registry.register(custom)

    expect(registry.getAdapter('typescript')).toBe(custom)
    expect(registry.getAdapterForFile('a.ts')).toBe(custom)
    expect(registry.getAdapter('tsx')).toBe(typescript)
    expect(registry.getAdapter('javascript')).toBe(typescript)
    expect(registry.getAdapters()).toEqual(expect.arrayContaining([typescript, custom]))
    expect(registry.getAdapters()).toHaveLength(2)
  })

  it('given the same adapter instance, when registered twice, then registration is idempotent', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter()

    registry.register(adapter)
    registry.register(adapter)

    expect(registry.getAdapters()).toEqual([adapter])
  })
})

describe('AdapterRegistry validation', () => {
  /**
   * Registers an adapter and returns the thrown error.
   * @param registry - Registry under test.
   * @param adapter - Adapter to register.
   * @returns The thrown error.
   */
  function failure(registry: AdapterRegistry, adapter: unknown): InvalidLanguageAdapterError {
    try {
      registry.register(adapter as LanguageAdapter)
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLanguageAdapterError)
      return error as InvalidLanguageAdapterError
    }
    throw new Error('expected registration to fail')
  }

  it('given an adapter without analyzeFile, when registered, then it fails naming the member and leaves the registry unchanged', () => {
    const registry = new AdapterRegistry()
    const adapter = { ...pseudoAdapter(), analyzeFile: undefined }

    const error = failure(registry, adapter)

    expect(error.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(error.message).toContain('missing required member "analyzeFile"')
    expect(error.message).toContain('[pseudo]')
    expect(registry.getAdapters()).toEqual([])
    expect(registry.getAdapter('pseudo')).toBeUndefined()
  })

  it('given an adapter declaring no language, when registered, then it fails', () => {
    const registry = new AdapterRegistry()

    const error = failure(registry, pseudoAdapter({ languages: () => [] }))

    expect(error.message).toContain('languages() returned no language')
  })

  it('given an extension for an undeclared language, when registered, then it fails', () => {
    const registry = new AdapterRegistry()

    const error = failure(registry, pseudoAdapter({ extensions: () => ({ '.rs': 'rust' }) }))

    expect(error.message).toContain('extension ".rs" maps to undeclared language "rust"')
  })

  it('given a facet that is not an object, when registered, then it fails', () => {
    const registry = new AdapterRegistry()

    const error = failure(registry, { ...pseudoAdapter(), symbolReferenceSyntax: 'nope' })

    expect(error.message).toContain('facet "symbolReferenceSyntax" must be an object')
    expect(registry.getAdapters()).toEqual([])
  })

  it('given a facet missing a member, when registered, then it fails naming the member', () => {
    const registry = new AdapterRegistry()
    const packageResolution = {
      identity: () => undefined,
      prepare: () => undefined,
      matchSpecifier: () => undefined,
    }

    const error = failure(registry, { ...pseudoAdapter(), packageResolution })

    expect(error.message).toContain('facet "packageResolution" is missing member "entrySurface"')
  })

  it('given an adapter with only the required core, when registered, then it succeeds', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter()

    registry.register(adapter)

    expect(registry.getAdapter('pseudo')).toBe(adapter)
  })

  it('given an adapter with a complete facet, when registered, then it succeeds', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter({
      packageResolution: {
        identity: () => undefined,
        prepare: () => undefined,
        matchSpecifier: () => undefined,
        entrySurface: () => [],
      },
    })

    registry.register(adapter)

    expect(registry.getAdapter('pseudo')).toBe(adapter)
  })

  it('Malformed languages result is rejected', () => {
    const registry = new AdapterRegistry()

    const notArray = failure(
      registry,
      pseudoAdapter({ languages: () => 'typescript' as unknown as string[] }),
    )
    expect(notArray.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(notArray.message).toContain('[<unknown>]')
    expect(notArray.message).toContain('languages() must return an array of non-empty strings')
    expect(registry.getAdapters()).toEqual([])

    const emptyString = failure(registry, pseudoAdapter({ languages: () => [''] }))
    expect(emptyString.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(emptyString.message).toContain('[<unknown>]')
    expect(registry.getAdapters()).toEqual([])
  })

  it('Malformed extensions result is rejected', () => {
    const registry = new AdapterRegistry()

    const notObject = failure(
      registry,
      pseudoAdapter({ extensions: () => 'not-an-object' as unknown as Record<string, string> }),
    )
    expect(notObject.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(notObject.message).toContain('extensions() must return a plain object')
    expect(registry.getAdapters()).toEqual([])

    const nonStringValue = failure(
      registry,
      pseudoAdapter({ extensions: () => ({ '.ts': 123 as unknown as string }) }),
    )
    expect(nonStringValue.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(nonStringValue.message).toContain('extensions() must return a plain object')
    expect(registry.getAdapters()).toEqual([])
  })

  it('Invalid resolution manifest value is rejected', () => {
    const registry = new AdapterRegistry()

    const withSlash = failure(
      registry,
      pseudoAdapter({ resolutionManifests: () => ['dir/package.json'] }),
    )
    expect(withSlash.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(withSlash.message).toContain(
      'resolutionManifests() entry "dir/package.json" must be an exact basename',
    )
    expect(registry.getAdapters()).toEqual([])

    const withGlob = failure(registry, pseudoAdapter({ resolutionManifests: () => ['*.json'] }))
    expect(withGlob.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(withGlob.message).toContain(
      'resolutionManifests() entry "*.json" must be an exact basename',
    )
    expect(registry.getAdapters()).toEqual([])

    const empty = failure(registry, pseudoAdapter({ resolutionManifests: () => [''] }))
    expect(empty.code).toBe('INVALID_LANGUAGE_ADAPTER')
    expect(empty.message).toContain(
      'resolutionManifests() must return an array of non-empty strings',
    )
    expect(registry.getAdapters()).toEqual([])
  })

  it('Capability flags and facets are separate; a facet does not satisfy a capability flag', () => {
    const registry = new AdapterRegistry()
    const adapter = pseudoAdapter({
      packageResolution: {
        identity: () => undefined,
        prepare: () => undefined,
        matchSpecifier: () => undefined,
        entrySurface: () => [],
      },
      // does not provide capabilities()
    })

    registry.register(adapter)
    expect(registry.getAdapter('pseudo')?.packageResolution).toBeDefined()
    expect(registry.getCapabilities('pseudo')).toBeUndefined()
  })
})
