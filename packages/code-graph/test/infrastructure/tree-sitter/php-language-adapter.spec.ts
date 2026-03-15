import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  describe('extractImportedNames', () => {
    it('parses use statement', () => {
      const code = '<?php\nuse App\\Models\\User;'
      const imports = adapter.extractImportedNames('main.php', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('User')
      expect(imports[0]!.specifier).toContain('User')
      expect(imports[0]!.isRelative).toBe(false)
    })

    it('parses aliased use statement', () => {
      const code = '<?php\nuse App\\Models\\User as U;'
      const imports = adapter.extractImportedNames('main.php', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('User')
      expect(imports[0]!.localName).toBe('U')
    })

    it('all use statements are non-relative', () => {
      const code = '<?php\nuse App\\Models\\User;'
      const imports = adapter.extractImportedNames('main.php', code)
      expect(imports[0]!.isRelative).toBe(false)
    })
  })

  describe('extractNamespace', () => {
    it('extracts namespace from PHP file', () => {
      const code = '<?php\nnamespace App\\Models;\n\nclass User {}'
      const ns = adapter.extractNamespace('<?php\nnamespace App\\Models;\n\nclass User {}')
      expect(ns).toBe('App\\Models')
    })

    it('returns undefined when no namespace declared', () => {
      const ns = adapter.extractNamespace('<?php\nclass User {}')
      expect(ns).toBeUndefined()
    })

    it('qualified name matches use statement specifier', () => {
      const fileContent = '<?php\nnamespace App\\Models;\n\nclass User {}'
      const ns = adapter.extractNamespace(fileContent)
      const symbols = adapter.extractSymbols('src/Models/User.php', fileContent)
      const userSymbol = symbols.find((s) => s.name === 'User')

      const importContent = '<?php\nuse App\\Models\\User;'
      const imports = adapter.extractImportedNames('main.php', importContent)

      // The qualified name ns + '\' + symbolName should match the import specifier
      const qualifiedName = `${ns}\\${userSymbol!.name}`
      expect(qualifiedName).toBe(imports[0]!.specifier)
    })
  })

  describe('extensions', () => {
    it('maps .php to php', () => {
      expect(adapter.extensions()).toEqual({ '.php': 'php' })
    })
  })

  describe('buildQualifiedName', () => {
    it('builds qualified name from namespace and symbol', () => {
      expect(adapter.buildQualifiedName('App\\Models', 'User')).toBe('App\\Models\\User')
    })

    it('works with single-level namespace', () => {
      expect(adapter.buildQualifiedName('App', 'Config')).toBe('App\\Config')
    })
  })

  describe('getPackageIdentity', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    })

    it('reads name from composer.json', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-pkg-'))
      writeFileSync(join(tempDir, 'composer.json'), JSON.stringify({ name: 'acme/auth' }))
      expect(adapter.getPackageIdentity(tempDir)).toBe('acme/auth')
    })

    it('returns undefined when no composer.json', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-pkg-'))
      expect(adapter.getPackageIdentity(tempDir)).toBeUndefined()
    })

    it('walks up to find composer.json above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-pkg-'))
      writeFileSync(join(tempDir, 'composer.json'), JSON.stringify({ name: 'acme/auth' }))
      const subDir = join(tempDir, 'src')
      mkdirSync(subDir)
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('acme/auth')
    })
  })
})
