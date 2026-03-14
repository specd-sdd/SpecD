import { describe, it, expect } from 'vitest'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

const adapter = new TypeScriptLanguageAdapter()

describe('TypeScriptLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['typescript', 'tsx', 'javascript', 'jsx'])
  })

  describe('extractSymbols', () => {
    it('extracts function declarations', () => {
      const code = `function greet(name: string): string { return name }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('greet')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts async function declarations', () => {
      const code = `async function fetchData(): Promise<void> { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('fetchData')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts arrow functions assigned to const', () => {
      const code = `const add = (a: number, b: number) => a + b`
      const symbols = adapter.extractSymbols('main.ts', code)
      const fn = symbols.find((s) => s.name === 'add')
      expect(fn).toBeDefined()
      expect(fn!.kind).toBe(SymbolKind.Function)
    })

    it('extracts class declarations', () => {
      const code = `class UserService { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'UserService' && s.kind === SymbolKind.Class)).toBe(
        true,
      )
    })

    it('extracts class with extends', () => {
      const code = `class Admin extends User { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'Admin' && s.kind === SymbolKind.Class)).toBe(true)
    })

    it('extracts method definitions', () => {
      const code = `class Foo {
        bar() { }
        baz() { }
      }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const methods = symbols.filter((s) => s.kind === SymbolKind.Method)
      expect(methods.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts exported variables (non-arrow)', () => {
      const code = `export const MAX_RETRIES = 3`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'MAX_RETRIES' && s.kind === SymbolKind.Variable)).toBe(
        true,
      )
    })

    it('extracts type aliases', () => {
      const code = `type UserId = string`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'UserId' && s.kind === SymbolKind.Type)).toBe(true)
    })

    it('extracts interface declarations', () => {
      const code = `interface Config { port: number }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'Config' && s.kind === SymbolKind.Interface)).toBe(true)
    })

    it('extracts enum declarations', () => {
      const code = `enum Status { Active, Inactive }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols.some((s) => s.name === 'Status' && s.kind === SymbolKind.Enum)).toBe(true)
    })

    it('extracts JSDoc comment for function declaration', () => {
      const code = `/** Greets. */\nfunction greet() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.comment).toBe('/** Greets. */')
    })

    it('returns undefined comment when no comment precedes symbol', () => {
      const code = `function greet() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.comment).toBeUndefined()
    })

    it('generates deterministic IDs', () => {
      const code = `function greet() { }`
      const s1 = adapter.extractSymbols('main.ts', code)
      const s2 = adapter.extractSymbols('main.ts', code)
      expect(s1[0]!.id).toBe(s2[0]!.id)
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = `function foo() { }\nfunction bar() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const defines = relations.filter((r) => r.type === RelationType.Defines)
      expect(defines.length).toBe(symbols.length)
    })

    it('creates EXPORTS relations for exported symbols', () => {
      const code = `export function foo() { }\nfunction bar() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const exports = relations.filter((r) => r.type === RelationType.Exports)
      expect(exports).toHaveLength(1)
    })

    it('creates IMPORTS relations for relative imports', () => {
      const code = `import { foo } from './utils.js'`
      const symbols = adapter.extractSymbols('src/main.ts', code)
      const relations = adapter.extractRelations('src/main.ts', code, symbols, new Map())
      const imports = relations.filter((r) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.target).toBe('src/utils.ts')
    })

    it('skips non-relative imports', () => {
      const code = `import { describe } from 'vitest'`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const imports = relations.filter((r) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })
  })
})
