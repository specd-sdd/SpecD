import { describe, it, expect } from 'vitest'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

const adapter = new PythonLanguageAdapter()

describe('PythonLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['python'])
  })

  describe('extractSymbols', () => {
    it('extracts function definitions', () => {
      const symbols = adapter.extractSymbols('main.py', 'def greet(name):\n    return name')
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('greet')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts class definitions', () => {
      const symbols = adapter.extractSymbols('main.py', 'class User:\n    pass')
      expect(symbols.some((s) => s.name === 'User' && s.kind === SymbolKind.Class)).toBe(true)
    })

    it('extracts methods inside classes', () => {
      const code =
        'class User:\n    def login(self):\n        pass\n    def logout(self):\n        pass'
      const symbols = adapter.extractSymbols('main.py', code)
      const methods = symbols.filter((s) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
      expect(methods.map((m) => m.name)).toContain('login')
      expect(methods.map((m) => m.name)).toContain('logout')
    })

    it('extracts module-level assignments as variables', () => {
      const symbols = adapter.extractSymbols('main.py', 'MAX_RETRIES = 3')
      expect(symbols.some((s) => s.name === 'MAX_RETRIES' && s.kind === SymbolKind.Variable)).toBe(
        true,
      )
    })

    it('extracts comment from preceding line', () => {
      const code = '# Greets the user.\ndef greet():\n    pass'
      const symbols = adapter.extractSymbols('main.py', code)
      expect(symbols[0]!.comment).toBe('# Greets the user.')
    })

    it('returns undefined comment when none present', () => {
      const symbols = adapter.extractSymbols('main.py', 'def greet():\n    pass')
      expect(symbols[0]!.comment).toBeUndefined()
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = 'def foo():\n    pass\ndef bar():\n    pass'
      const symbols = adapter.extractSymbols('main.py', code)
      const relations = adapter.extractRelations('main.py', code, symbols, new Map())
      const defines = relations.filter((r) => r.type === RelationType.Defines)
      expect(defines).toHaveLength(symbols.length)
    })

    it('creates IMPORTS for relative imports', () => {
      const code = 'from .utils import helper'
      const symbols = adapter.extractSymbols('src/main.py', code)
      const relations = adapter.extractRelations('src/main.py', code, symbols, new Map())
      const imports = relations.filter((r) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(1)
    })

    it('skips absolute imports', () => {
      const code = 'import os\nfrom pathlib import Path'
      const symbols = adapter.extractSymbols('main.py', code)
      const relations = adapter.extractRelations('main.py', code, symbols, new Map())
      const imports = relations.filter((r) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })
  })

  describe('extractImportedNames', () => {
    it('parses absolute import', () => {
      const imports = adapter.extractImportedNames('main.py', 'import os')
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('os')
      expect(imports[0]!.isRelative).toBe(false)
    })

    it('parses from-import', () => {
      const imports = adapter.extractImportedNames('main.py', 'from pathlib import Path')
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('Path')
      expect(imports[0]!.specifier).toBe('pathlib')
      expect(imports[0]!.isRelative).toBe(false)
    })

    it('parses relative from-import', () => {
      const imports = adapter.extractImportedNames('src/main.py', 'from .utils import helper')
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('helper')
      expect(imports[0]!.isRelative).toBe(true)
    })

    it('handles aliased imports', () => {
      const imports = adapter.extractImportedNames('main.py', 'from os import path as p')
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('path')
      expect(imports[0]!.localName).toBe('p')
    })
  })
})
