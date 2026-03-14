import { describe, it, expect } from 'vitest'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

const adapter = new PhpLanguageAdapter()

describe('PhpLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['php'])
  })

  describe('extractSymbols', () => {
    it('extracts function definitions', () => {
      const code = '<?php\nfunction greet(string $name): string { return $name; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'greet' && s.kind === SymbolKind.Function)).toBe(true)
    })

    it('extracts class declarations', () => {
      const code = '<?php\nclass User {}'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'User' && s.kind === SymbolKind.Class)).toBe(true)
    })

    it('extracts methods inside classes', () => {
      const code =
        '<?php\nclass User {\n  public function login(): void {}\n  public function logout(): void {}\n}'
      const symbols = adapter.extractSymbols('main.php', code)
      const methods = symbols.filter((s) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
    })

    it('extracts interface declarations', () => {
      const code = '<?php\ninterface Repo { public function find(): void; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'Repo' && s.kind === SymbolKind.Interface)).toBe(true)
    })

    it('extracts enum declarations', () => {
      const code = '<?php\nenum Status { case Active; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'Status' && s.kind === SymbolKind.Enum)).toBe(true)
    })

    it('extracts trait declarations as type', () => {
      const code = '<?php\ntrait Loggable {}'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'Loggable' && s.kind === SymbolKind.Type)).toBe(true)
    })

    it('extracts const declarations as variable', () => {
      const code = '<?php\nconst MAX = 10;'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(symbols.some((s) => s.name === 'MAX' && s.kind === SymbolKind.Variable)).toBe(true)
    })

    it('extracts methods from interfaces', () => {
      const code =
        '<?php\ninterface Repo {\n  public function find(): void;\n  public function save(): void;\n}'
      const symbols = adapter.extractSymbols('main.php', code)
      const methods = symbols.filter((s) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = '<?php\nfunction foo() {}\nfunction bar() {}'
      const symbols = adapter.extractSymbols('main.php', code)
      const relations = adapter.extractRelations('main.php', code, symbols, new Map())
      const defines = relations.filter((r) => r.type === RelationType.Defines)
      expect(defines).toHaveLength(symbols.length)
    })
  })
})
