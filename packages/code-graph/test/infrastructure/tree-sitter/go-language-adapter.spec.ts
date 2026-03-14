import { describe, it, expect } from 'vitest'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

const adapter = new GoLanguageAdapter()

describe('GoLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['go'])
  })

  describe('extractSymbols', () => {
    it('extracts function declarations', () => {
      const code = 'package main\n\nfunc greet(name string) string {\n    return name\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'greet' && s.kind === SymbolKind.Function)).toBe(true)
    })

    it('extracts method declarations', () => {
      const code = 'package main\n\nfunc (u *User) Login() string {\n    return "ok"\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'Login' && s.kind === SymbolKind.Method)).toBe(true)
    })

    it('extracts struct types as class', () => {
      const code = 'package main\n\ntype User struct {\n    Name string\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'User' && s.kind === SymbolKind.Class)).toBe(true)
    })

    it('extracts interface types', () => {
      const code = 'package main\n\ntype Greeter interface {\n    Greet()\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'Greeter' && s.kind === SymbolKind.Interface)).toBe(
        true,
      )
    })

    it('extracts type aliases as type', () => {
      const code = 'package main\n\ntype ID = string'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'ID' && s.kind === SymbolKind.Type)).toBe(true)
    })

    it('extracts var declarations', () => {
      const code = 'package main\n\nvar MAX = 10'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'MAX' && s.kind === SymbolKind.Variable)).toBe(true)
    })

    it('extracts const declarations', () => {
      const code = 'package main\n\nconst PI = 3.14'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s) => s.name === 'PI' && s.kind === SymbolKind.Variable)).toBe(true)
    })

    it('extracts comment from preceding line', () => {
      const code = 'package main\n\n// Greets someone.\nfunc greet() {}'
      const symbols = adapter.extractSymbols('main.go', code)
      const greet = symbols.find((s) => s.name === 'greet')
      expect(greet?.comment).toBe('// Greets someone.')
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = 'package main\n\nfunc foo() {}\nfunc bar() {}'
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols, new Map())
      const defines = relations.filter((r) => r.type === RelationType.Defines)
      expect(defines).toHaveLength(symbols.length)
    })
  })
})
