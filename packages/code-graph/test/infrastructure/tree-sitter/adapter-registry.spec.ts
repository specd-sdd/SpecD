import { describe, expect, it } from 'vitest'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'

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
    resolveImports: () => ({ importMap: new Map(), fileImports: [] }),
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

  it('given two adapters registered for one language, when queried, then the later registration wins', () => {
    const registry = new AdapterRegistry()
    const first = pseudoAdapter()
    const second = pseudoAdapter()

    registry.register(first)
    registry.register(second)

    expect(registry.getAdapter('pseudo')).toBe(second)
  })
})
