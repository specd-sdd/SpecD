import { describe, expect, it } from 'vitest'
import { createBuiltinAdapterRegistry } from '../../src/composition/index.js'
import { AdapterRegistry } from '../../src/infrastructure/tree-sitter/adapter-registry.js'
import { type AdapterRegistryPort } from '../../src/domain/ports/adapter-registry-port.js'
import { type LanguageAdapter } from '../../src/domain/value-objects/language-adapter.js'

describe('createBuiltinAdapterRegistry', () => {
  it('creates an AdapterRegistry instance populated with built-in language adapters', () => {
    const registry: AdapterRegistryPort = createBuiltinAdapterRegistry()

    expect(registry).toBeInstanceOf(AdapterRegistry)
    const extensions = registry.getSupportedExtensions()
    expect(extensions).toContain('.ts')
    expect(extensions).toContain('.py')
    expect(extensions).toContain('.go')
    expect(extensions).toContain('.php')
  })

  it('supports custom language adapters via extraAdapters argument', () => {
    const customAdapter: LanguageAdapter = {
      languages: () => ['custom'],
      extensions: () => ({ '.custom': 'custom' }),
      analyzeFile: () => ({
        language: 'custom',
        symbols: [],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      }),
      resolveImports: () => ({
        importMap: new Map(),
        fileImports: [],
      }),
      buildRelations: () => [],
      keywords: () => ['custom-keyword', 'class'],
    }

    const registry = createBuiltinAdapterRegistry([customAdapter])
    expect(registry.getSupportedExtensions()).toContain('.custom')
  })

  it('aggregates and deduplicates reserved keywords across adapters', () => {
    const customAdapter: LanguageAdapter = {
      languages: () => ['custom2'],
      extensions: () => ({ '.custom2': 'custom2' }),
      analyzeFile: () => ({
        language: 'custom2',
        symbols: [],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      }),
      resolveImports: () => ({
        importMap: new Map(),
        fileImports: [],
      }),
      buildRelations: () => [],
      keywords: () => ['custom-keyword', 'class'],
    }

    const registry = createBuiltinAdapterRegistry([customAdapter])
    const keywords = registry.getReservedKeywords()
    expect(keywords).toContain('custom-keyword')
    // Duplicate 'class' from the custom adapter must collapse into one entry.
    expect([...keywords].filter((kw) => kw === 'class')).toHaveLength(1)
  })

  it('provides a set of reserved keywords', () => {
    const registry = createBuiltinAdapterRegistry()
    const keywords = registry.getReservedKeywords()

    expect(keywords).toBeInstanceOf(Set)
    expect(keywords.size).toBeGreaterThan(0)
    expect(keywords).toContain('class')
    expect(keywords).toContain('function')
    expect(keywords).toContain('interface')
    expect(keywords).toContain('async')
    expect(keywords).toContain('def')
    expect(keywords).toContain('func')
  })
})
