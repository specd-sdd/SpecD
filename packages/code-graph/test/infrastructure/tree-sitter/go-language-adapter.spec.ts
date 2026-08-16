import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { ImportDeclarationKind } from '../../../src/domain/value-objects/import-declaration-kind.js'
import {
  BindingSourceKind,
  type BindingFact,
} from '../../../src/domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { type SourceRange, type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { parseLogicalSymbol } from '../../../src/domain/value-objects/symbol-reference.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined
  extractSymbols(filePath: string, content: string): SymbolNode[]
  extractImportedNames(filePath: string, content: string): ImportDeclaration[]
  extractBindingFacts(
    filePath: string,
    content: string,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
  ): BindingFact[]
  extractCallFacts(filePath: string, content: string, symbols: readonly SymbolNode[]): CallFact[]
  extractRelations(
    filePath: string,
    content: string,
    relationSymbols: readonly SymbolNode[],
    importMap?: ReadonlyMap<string, string>,
    filePaths?: ReadonlySet<string>,
  ): Relation[]
}

const baseAdapter = new GoLanguageAdapter()
const adapter = baseAdapter as unknown as TestAdapter

function sliceRange(content: string, range: SourceRange): string {
  const lines = content.split('\n')
  const offsetAt = (line: number, column: number): number =>
    lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0) + column
  return content.slice(
    offsetAt(range.startLine, range.startColumn),
    offsetAt(range.endLine, range.endColumn),
  )
}

adapter.extractSymbols = (filePath: string, content: string): SymbolNode[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    configRelativePath: filePath,
    language: 'go',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  return draft.symbols as SymbolNode[]
}

adapter.extractImportedNames = (filePath: string, content: string): ImportDeclaration[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    configRelativePath: filePath,
    language: 'go',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  return draft.imports as ImportDeclaration[]
}

adapter.extractBindingFacts = (
  filePath: string,
  content: string,
  symbols: readonly SymbolNode[],
  imports: readonly ImportDeclaration[],
): BindingFact[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    configRelativePath: filePath,
    language: 'go',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  return draft.bindingFacts as BindingFact[]
}

adapter.extractCallFacts = (
  filePath: string,
  content: string,
  symbols: readonly SymbolNode[],
): CallFact[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    configRelativePath: filePath,
    language: 'go',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  return draft.callFacts as CallFact[]
}

adapter.extractRelations = (
  filePath: string,
  content: string,
  relationSymbols: readonly SymbolNode[],
  importMap: ReadonlyMap<string, string> = new Map(),
  filePaths: ReadonlySet<string> = new Set(),
): Relation[] => {
  const session = new InMemoryIndexSession()
  for (const fp of filePaths) {
    session.registerFile({
      filePath: fp,
      configRelativePath: fp,
      language: 'go',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }
  session.registerFile({
    filePath,
    configRelativePath: filePath,
    language: 'go',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  const analysis = session.registerAnalysis({
    filePath,
    analysis: draft,
  })
  const resolvedImports = { importMap, fileImports: [] }
  return baseAdapter.buildRelations(analysis, {
    session,
    resolvedImports,
  })
}

describe('GoLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['go'])
  })

  it('emits exported package bindings and import aliases', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'example/service.go',
      'package example\nimport alias "example.org/dependency"\ntype Service struct{}\nfunc hidden() {}\n',
      { session, workspaceName: 'workspace' },
    ).referenceFacts

    expect(baseAdapter.capabilities()).toMatchObject({
      hierarchy: true,
      buildContext: false,
    })
    expect(facts?.publicBindings.map((item) => item.exportedName)).toContain('Service')
    expect(facts?.publicBindings.map((item) => item.exportedName)).not.toContain('hidden')
    expect(facts?.localBindings.map((item) => item.localName)).toContain('alias')
  })

  it('uses one workspace-root package surface for root-level Go files', () => {
    const first = baseAdapter.analyzeFile(
      'workspace:first.go',
      'package root\ntype First struct{}',
      {
        session: new InMemoryIndexSession(),
        workspaceName: 'workspace',
      },
    ).referenceFacts!
    const second = baseAdapter.analyzeFile(
      'workspace:second.go',
      'package root\ntype Second struct{}',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    expect(first.publicBindings[0]?.surface).toBe('workspace:')
    expect(second.publicBindings[0]?.surface).toBe('workspace:')
  })

  it('owner-qualifies receiver methods and emits interface evidence', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'service/readers.go',
      `package service
type Reader interface {
  Read()
}
type First struct {}
func (f *First) Read() {}
type Second struct {}
func (Second) Read() {}
`,
      { session, workspaceName: 'workspace' },
    ).referenceFacts!

    const reads = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId))
      .filter((logical) => logical?.name === 'Read')
    expect(reads).toHaveLength(3)
    expect(new Set(reads.map((logical) => logical?.ownerId)).size).toBe(3)
    expect(reads.map((logical) => logical?.memberForm)).toContain('signature')
    expect(facts.hierarchy.filter((fact) => fact.kind === 'implements')).toHaveLength(2)
    expect(facts.steps.filter((step) => step.kind === 'implements:0')).toHaveLength(2)
    expect(facts.publicBindings.some((binding) => binding.exportedName === 'Read')).toBe(false)
  })

  it('retains pointer receiver evidence and does not infer incomplete method sets', () => {
    const session = new InMemoryIndexSession()
    const draft = baseAdapter.analyzeFile(
      'service/readers.go',
      `package service
type Reader interface {
  Read()
  Close()
}
type Partial struct {}
func (p *Partial) Read() {}
`,
      { session, workspaceName: 'workspace' },
    )

    expect(draft.parserState).toMatchObject({
      pointerReceiverMethodIds: [expect.any(String)],
    })
    expect(draft.referenceFacts?.hierarchy.some((fact) => fact.kind === 'implements')).toBe(false)
  })

  it('owner-qualifies a compact same-line interface method', () => {
    const facts = baseAdapter.analyzeFile(
      'service/compact.go',
      'package service\ntype Reader interface { Read() }',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!
    const read = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId))
      .find((logical) => logical?.name === 'Read')

    expect(read?.ownerId).toBeDefined()
    expect(read?.memberForm).toBe('signature')
  })

  describe('extractSymbols', () => {
    it('extracts function declarations', () => {
      const code = 'package main\n\nfunc greet(name string) string {\n    return name\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'greet' && s.kind === SymbolKind.Function),
      ).toBe(true)
    })

    it('extracts parser-authoritative construct and declared-name ranges', () => {
      const code = `package main

type UserService struct {
    Name string
}`
      const symbol = adapter
        .extractSymbols('main.go', code)
        .find((candidate) => candidate.name === 'UserService')!
      const construct = sliceRange(code, {
        startLine: symbol.line,
        startColumn: symbol.column,
        endLine: symbol.endLine,
        endColumn: symbol.endColumn,
      })

      expect(construct).toBe(`UserService struct {
    Name string
}`)
      expect(sliceRange(code, symbol.selectionRange)).toBe('UserService')
      expect(symbol.id).toBe('main.go:class:UserService:3:5')
    })

    it('extracts method declarations', () => {
      const code = 'package main\n\nfunc (u *User) Login() string {\n    return "ok"\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Login' && s.kind === SymbolKind.Method),
      ).toBe(true)
    })

    it('extracts struct types as class', () => {
      const code = 'package main\n\ntype User struct {\n    Name string\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'User' && s.kind === SymbolKind.Class),
      ).toBe(true)
    })

    it('extracts interface types', () => {
      const code = 'package main\n\ntype Greeter interface {\n    Greet()\n}'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Greeter' && s.kind === SymbolKind.Interface),
      ).toBe(true)
    })

    it('extracts type aliases as type', () => {
      const code = 'package main\n\ntype ID = string'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(symbols.some((s: SymbolNode) => s.name === 'ID' && s.kind === SymbolKind.Type)).toBe(
        true,
      )
    })

    it('extracts var declarations', () => {
      const code = 'package main\n\nvar MAX = 10'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'MAX' && s.kind === SymbolKind.Variable),
      ).toBe(true)
    })

    it('extracts const declarations', () => {
      const code = 'package main\n\nconst PI = 3.14'
      const symbols = adapter.extractSymbols('main.go', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'PI' && s.kind === SymbolKind.Variable),
      ).toBe(true)
    })

    it('extracts comment from preceding line', () => {
      const code = 'package main\n\n// Greets someone.\nfunc greet() {}'
      const symbols = adapter.extractSymbols('main.go', code)
      const greet = symbols.find((s: SymbolNode) => s.name === 'greet')
      expect(greet?.comment).toBe('// Greets someone.')
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = 'package main\n\nfunc foo() {}\nfunc bar() {}'
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols, new Map())
      const defines = relations.filter((r: Relation) => r.type === RelationType.Defines)
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
      expect(relations.some((relation: Relation) => relation.type === RelationType.Extends)).toBe(
        true,
      )
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
      expect(
        relations.some((relation: Relation) => relation.type === RelationType.Implements),
      ).toBe(true)
    })
  })

  describe('shared fact extraction', () => {
    it('classifies grouped alias, dot, and blank imports', () => {
      const code = `package main
import (
  models "github.com/acme/auth/models"
  . "github.com/acme/auth/helpers"
  _ "github.com/acme/auth/driver"
)`
      const imports = adapter.extractImportedNames('main.go', code)
      expect(imports.map((item: ImportDeclaration) => item.localName)).toEqual(['models', '.', ''])
      expect(imports.map((item: ImportDeclaration) => item.kind)).toEqual([
        ImportDeclarationKind.Named,
        ImportDeclarationKind.Namespace,
        ImportDeclarationKind.Blank,
      ])
    })

    it('emits selector, composite literal, and type-reference facts', () => {
      const code = `package main
import models "github.com/acme/auth/models"
type Service struct { Repo UserRepo }
func New(repo UserRepo) UserRepo {
  models.NewUser()
  return UserRepo{}
}`
      const symbols = adapter.extractSymbols('main.go', code)
      const imports = adapter.extractImportedNames('main.go', code)
      const bindingFacts = adapter.extractBindingFacts('main.go', code, symbols, imports)
      const callFacts = adapter.extractCallFacts('main.go', code, symbols)

      expect(
        bindingFacts.some(
          (fact: BindingFact) =>
            fact.sourceKind === BindingSourceKind.Property && fact.targetName === 'UserRepo',
        ),
      ).toBe(true)
      expect(
        callFacts.some(
          (fact: CallFact) =>
            fact.form === CallForm.Static &&
            fact.receiverName === 'models' &&
            fact.name === 'NewUser',
        ),
      ).toBe(true)
      expect(
        callFacts.some(
          (fact: CallFact) => fact.form === CallForm.Constructor && fact.name === 'UserRepo',
        ),
      ).toBe(true)
    })

    it('emits ImportedType facts from type alias RHS', () => {
      const code = `package main
type ParserRegistry = map[string]ArtifactParser
type HandlerFn func(event Event) Result`
      const symbols = adapter.extractSymbols('main.go', code)
      const imports = adapter.extractImportedNames('main.go', code)
      const facts = adapter.extractBindingFacts('main.go', code, symbols, imports)

      const registryFacts = facts.filter(
        (f: BindingFact) =>
          f.name === 'ParserRegistry' && f.sourceKind === BindingSourceKind.ImportedType,
      )
      expect(registryFacts.some((f: BindingFact) => f.targetName === 'ArtifactParser')).toBe(true)
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
