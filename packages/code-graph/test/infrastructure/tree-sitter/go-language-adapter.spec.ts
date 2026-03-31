import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

    it('creates EXTENDS for embedded local interfaces', () => {
      const code = `
package main

type Reader interface {
    Read()
}

type ReadWriter interface {
    Reader
    Write()
}
      `
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols, new Map())
      expect(relations.some((relation) => relation.type === RelationType.Extends)).toBe(true)
    })

    it('creates IMPLEMENTS when a struct satisfies a local interface by method set', () => {
      const code = `
package main

type Reader interface {
    Read()
}

type FileReader struct {}

func (f *FileReader) Read() {}
      `
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols, new Map())
      expect(relations.some((relation) => relation.type === RelationType.Implements)).toBe(true)
    })
  })

  describe('extractImportedNames', () => {
    it('parses single import', () => {
      const code = 'package main\n\nimport "fmt"'
      const imports = adapter.extractImportedNames('main.go', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('fmt')
      expect(imports[0]!.specifier).toBe('fmt')
      expect(imports[0]!.isRelative).toBe(false)
    })

    it('parses grouped imports', () => {
      const code = 'package main\n\nimport (\n  "fmt"\n  "os"\n)'
      const imports = adapter.extractImportedNames('main.go', code)
      expect(imports).toHaveLength(2)
    })

    it('uses last path segment as name', () => {
      const code = 'package main\n\nimport "path/filepath"'
      const imports = adapter.extractImportedNames('main.go', code)
      expect(imports[0]!.originalName).toBe('filepath')
      expect(imports[0]!.localName).toBe('filepath')
    })

    it('all imports are non-relative', () => {
      const code = 'package main\n\nimport "fmt"'
      const imports = adapter.extractImportedNames('main.go', code)
      expect(imports[0]!.isRelative).toBe(false)
    })
  })

  describe('extensions', () => {
    it('maps .go to go', () => {
      expect(adapter.extensions()).toEqual({ '.go': 'go' })
    })
  })

  describe('resolvePackageFromSpecifier', () => {
    it('resolves by longest prefix match', () => {
      const known = ['github.com/acme/auth', 'github.com/acme/billing']
      expect(adapter.resolvePackageFromSpecifier('github.com/acme/auth/models', known)).toBe(
        'github.com/acme/auth',
      )
    })

    it('resolves exact match', () => {
      const known = ['github.com/acme/auth']
      expect(adapter.resolvePackageFromSpecifier('github.com/acme/auth', known)).toBe(
        'github.com/acme/auth',
      )
    })

    it('returns undefined for unknown module', () => {
      const known = ['github.com/acme/auth']
      expect(adapter.resolvePackageFromSpecifier('fmt', known)).toBeUndefined()
    })

    it('picks longest match when multiple prefixes overlap', () => {
      const known = ['github.com/acme', 'github.com/acme/auth']
      expect(adapter.resolvePackageFromSpecifier('github.com/acme/auth/models', known)).toBe(
        'github.com/acme/auth',
      )
    })
  })

  describe('getPackageIdentity', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    })

    it('reads module from go.mod', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-pkg-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module github.com/acme/auth\n\ngo 1.21\n')
      expect(adapter.getPackageIdentity(tempDir)).toBe('github.com/acme/auth')
    })

    it('returns undefined when no go.mod', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-pkg-'))
      expect(adapter.getPackageIdentity(tempDir)).toBeUndefined()
    })

    it('walks up to find go.mod above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-pkg-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module github.com/acme/auth\n\ngo 1.21\n')
      const subDir = join(tempDir, 'cmd', 'server')
      mkdirSync(subDir, { recursive: true })
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('github.com/acme/auth')
    })
  })
})
