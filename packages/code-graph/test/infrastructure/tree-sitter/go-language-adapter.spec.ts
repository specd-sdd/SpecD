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
import { type FileAnalysis } from '../../../src/domain/value-objects/file-analysis.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  resolutionManifests(): readonly string[]
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
    projectRelativePath: filePath,
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
    projectRelativePath: filePath,
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
    projectRelativePath: filePath,
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
    projectRelativePath: filePath,
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
      projectRelativePath: fp,
      language: 'go',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }
  session.registerFile({
    filePath,
    projectRelativePath: filePath,
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

  it('keeps a drive letter in the package surface', () => {
    const facts = baseAdapter.analyzeFile('C:/repo/src/a.go', 'package src\ntype Widget struct{}', {
      session: new InMemoryIndexSession(),
      workspaceName: 'ws',
    }).referenceFacts!

    expect(facts.publicBindings[0]?.surface).toBe('C:/repo/src')
    expect(facts.publicBindings[0]?.surface).not.toBe('C:')
  })

  it('keeps a drive-root package surface from becoming workspace C', () => {
    const facts = baseAdapter.analyzeFile('C:/a.go', 'package root\ntype Widget struct{}', {
      session: new InMemoryIndexSession(),
      workspaceName: 'ws',
    }).referenceFacts!

    expect(facts.publicBindings[0]?.surface).toBe('C:')
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
      .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
      .filter((logical) => logical?.name === 'Read')
    expect(reads).toHaveLength(3)
    expect(new Set(reads.map((logical) => logical?.ownerId)).size).toBe(3)
    expect(reads.map((logical) => logical?.memberSemantics)).toContainEqual({ kind: 'signature' })
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
      .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
      .find((logical) => logical?.name === 'Read')

    expect(read?.ownerId).toBeDefined()
    expect(read?.memberSemantics).toEqual({ kind: 'signature' })
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

  describe('resolutionManifests', () => {
    it('given go adapter, when asked for manifests, then returns go.mod only', () => {
      expect(adapter.resolutionManifests()).toEqual(['go.mod'])
      expect(adapter.resolutionManifests()).not.toContain('go.work')
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

    it('sets a method parentId from the receiver and omits it on a top-level function', () => {
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:service/reader.go',
        projectRelativePath: 'service/reader.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile(
        'workspace:service/reader.go',
        'package service\ntype Reader struct {}\nfunc top() {}\nfunc (r Reader) Read() {}\n',
        { session, workspaceName: 'workspace' },
      )
      const reader = draft.symbols.find((symbol) => symbol.name === 'Reader')
      const read = draft.symbols.find((symbol) => symbol.name === 'Read')
      const top = draft.symbols.find((symbol) => symbol.name === 'top')

      expect(read?.parentId).toBe(reader?.id)
      expect(top?.parentId).toBeUndefined()
    })

    it('walks up to find go.mod above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-pkg-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module github.com/acme/auth\n\ngo 1.21\n')
      const subDir = join(tempDir, 'cmd', 'server')
      mkdirSync(subDir, { recursive: true })
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('github.com/acme/auth')
    })
  })

  describe('GoLanguageAdapter dependency detection enhancements', () => {
    it('extracts struct fields as SymbolKind.Property with struct parentId', () => {
      const code = `package models
type User struct {
    ID int
    Name string
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:models/user.go',
        projectRelativePath: 'models/user.go',
        contentHash: 'hash',
        workspace: 'workspace',
        language: 'go',
      })
      const draft = baseAdapter.analyzeFile('workspace:models/user.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const user = draft.symbols.find((s) => s.name === 'User')
      const id = draft.symbols.find((s) => s.name === 'ID')
      const name = draft.symbols.find((s) => s.name === 'Name')

      expect(user?.kind).toBe(SymbolKind.Class)
      expect(id?.kind).toBe(SymbolKind.Property)
      expect(id?.parentId).toBe(user?.id)
      expect(name?.kind).toBe(SymbolKind.Property)
      expect(name?.parentId).toBe(user?.id)
    })

    it('extracts multiline method receivers via AST', () => {
      const code = `package service
type Engine struct {}

func (
    e *Engine
) Start() {
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:service/engine.go',
        projectRelativePath: 'service/engine.go',
        contentHash: 'hash',
        workspace: 'workspace',
        language: 'go',
      })
      const draft = baseAdapter.analyzeFile('workspace:service/engine.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const engine = draft.symbols.find((s) => s.name === 'Engine')
      const start = draft.symbols.find((s) => s.name === 'Start')

      expect(start?.parentId).toBe(engine?.id)
    })

    it('given a bare call to a package function, when buildRelations runs, then it emits CALLS and leaves IMPORTS to the indexer', () => {
      const code = `package main
import "fmt"

func helper() {}
func run() {
    helper()
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        contentHash: 'hash',
        workspace: 'workspace',
        language: 'go',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })
      const analysis: FileAnalysis = {
        fileId: 1,
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        contentHash: 'hash',
        workspace: 'workspace',
        language: 'go',
        symbols: draft.symbols,
        imports: draft.imports,
        bindingFacts: draft.bindingFacts,
        callFacts: draft.callFacts,
        ...(draft.referenceFacts !== undefined ? { referenceFacts: draft.referenceFacts } : {}),
        ...(draft.parserState !== undefined ? { parserState: draft.parserState } : {}),
      }
      const relations = baseAdapter.buildRelations(analysis, {
        session,
        resolvedImports: { importMap: new Map(), fileImports: [] },
      })

      const importRel = relations.find((r) => r.type === RelationType.Imports)
      const callRel = relations.find((r) => r.type === RelationType.Calls)

      expect(importRel).toBeUndefined()
      expect(callRel).toBeDefined()
      const run = draft.symbols.find((s) => s.name === 'run')
      const helper = draft.symbols.find((s) => s.name === 'helper')
      expect(callRel?.source).toBe(run?.id)
      expect(callRel?.target).toBe(helper?.id)
    })
  })

  describe('call relations require proof', () => {
    it('given a selector call on an unknown value, when relations are built, then it does not link to a same-named package function', () => {
      const code = `package main
type Store interface { Save() }
func Save() {}
func run(s Store) {
    s.Save()
}
`
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols)
      expect(relations.filter((r) => r.type === RelationType.Calls)).toHaveLength(0)
    })

    it('given a bare call whose only same-named declaration is a method, when relations are built, then it does not link to the method', () => {
      const code = `package main
type Box struct{}
func (b Box) Open() {}
func run() {
    Open()
}
`
      const symbols = adapter.extractSymbols('main.go', code)
      const relations = adapter.extractRelations('main.go', code, symbols)
      expect(relations.filter((r) => r.type === RelationType.Calls)).toHaveLength(0)
    })
  })

  describe('import resolution', () => {
    it('given an import of a module package directory, when imports resolve, then it lists the non-test files of that directory only', () => {
      const session = new InMemoryIndexSession()
      const register = (filePath: string, code: string) => {
        session.registerFile({
          filePath,
          projectRelativePath: filePath.slice(filePath.indexOf(':') + 1),
          language: 'go',
          contentHash: 'hash',
          workspace: 'ws',
        })
        return baseAdapter.analyzeFile(filePath, code, { session, workspaceName: 'ws' })
      }
      register('ws:pkg/utils/helper.go', 'package utils\nfunc Help() {}\n')
      register('ws:pkg/utils/helper_test.go', 'package utils\nfunc TestHelp() {}\n')
      register('ws:pkg/other/x.go', 'package other\nfunc X() {}\n')
      const draft = register(
        'ws:main.go',
        'package main\nimport "example.com/app/pkg/utils"\nfunc main() { utils.Help() }\n',
      )
      const analysis: FileAnalysis = {
        fileId: 1,
        filePath: 'ws:main.go',
        projectRelativePath: 'main.go',
        contentHash: 'hash',
        workspace: 'ws',
        language: 'go',
        symbols: draft.symbols,
        imports: draft.imports,
        bindingFacts: draft.bindingFacts,
        callFacts: draft.callFacts,
      }

      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map([['example.com/app', 'ws']]),
      })

      expect(resolved.fileImports).toEqual(['ws:pkg/utils/helper.go'])
      expect(resolved.importMap.size).toBe(0)
    })

    it('given an import outside every known module, when imports resolve, then nothing is guessed', () => {
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'ws:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'ws',
      })
      const draft = baseAdapter.analyzeFile(
        'ws:main.go',
        'package main\nimport "fmt"\nfunc main() { fmt.Println() }\n',
        { session, workspaceName: 'ws' },
      )
      const analysis: FileAnalysis = {
        fileId: 1,
        filePath: 'ws:main.go',
        projectRelativePath: 'main.go',
        contentHash: 'hash',
        workspace: 'ws',
        language: 'go',
        symbols: draft.symbols,
        imports: draft.imports,
        bindingFacts: draft.bindingFacts,
        callFacts: draft.callFacts,
      }

      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map([['example.com/app', 'ws']]),
      })

      expect(resolved.fileImports).toEqual([])
    })
  })

  describe('struct field identity', () => {
    it('given equally named fields in two structs, when facts are built, then each field has its own owner-qualified logical id', () => {
      const code = `package main
type A struct {
    Name string
}
type B struct {
    Name string
}
`
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session: new InMemoryIndexSession(),
        workspaceName: 'workspace',
      })
      const fieldLogicalIds = (draft.referenceFacts?.declarations ?? [])
        .filter((d) => draft.symbols.find((s) => s.id === d.symbolId)?.name === 'Name')
        .map((d) => d.logicalId)

      expect(fieldLogicalIds).toHaveLength(2)
      expect(new Set(fieldLogicalIds).size).toBe(2)
    })
  })

  describe('semantic containment and classification regressions (Task 8.6)', () => {
    it('short-variable declaration before a call does not become caller', () => {
      const code = `package main
func process() {
    tmp := 42
    execute(tmp)
}
func execute(n int) {}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const processFn = draft.symbols.find((s) => s.name === 'process')!
      expect(processFn).toBeDefined()
      const execCall = draft.callFacts.find((c) => c.name === 'execute')!
      expect(execCall).toBeDefined()
      expect(execCall.callerSymbolId).toBe(processFn.id)
      expect(draft.symbols.some((s) => s.name === 'tmp')).toBe(false)
    })

    it('receiver method owns calls in its body and is not usurped by adjacent package function', () => {
      const code = `package main
type Reader struct{}
func (r *Reader) Read() {
    helper()
}
func Unrelated() {}
func helper() {}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const readMethod = draft.symbols.find(
        (s) => s.name === 'Read' && s.kind === SymbolKind.Method,
      )!
      expect(readMethod).toBeDefined()
      const helperCall = draft.callFacts.find((c) => c.name === 'helper')!
      expect(helperCall).toBeDefined()
      expect(helperCall.callerSymbolId).toBe(readMethod.id)
    })

    it('competing same-name package declarations are not grouped into an overload set', () => {
      const code = `package main
func Conflict() string {
    return "a"
}
func Conflict() int {
    return 1
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const refFacts = draft.referenceFacts
      expect(refFacts).toBeDefined()
      // Duplicate declarations must not be grouped into an overload set (they have 0 logical occurrences)
      const conflictOccurrences = refFacts!.declarations.filter((d) =>
        draft.symbols.some((s) => s.id === d.symbolId && s.name === 'Conflict'),
      )
      expect(conflictOccurrences).toHaveLength(0)
    })

    it('receiver methods on distinct types remain distinct and owned by respective types', () => {
      const code = `package main
type Alpha struct{}
type Beta struct{}
func (a Alpha) Handle() {}
func (b Beta) Handle() {}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })

      const alpha = draft.symbols.find((s) => s.name === 'Alpha')!
      const beta = draft.symbols.find((s) => s.name === 'Beta')!
      const alphaHandle = draft.symbols.find((s) => s.name === 'Handle' && s.parentId === alpha.id)!
      const betaHandle = draft.symbols.find((s) => s.name === 'Handle' && s.parentId === beta.id)!
      expect(alphaHandle).toBeDefined()
      expect(betaHandle).toBeDefined()
      expect(alphaHandle.id).not.toBe(betaHandle.id)

      const refFacts = draft.referenceFacts!
      const alphaOcc = refFacts.declarations.find((d) => d.symbolId === alphaHandle.id)!
      const betaOcc = refFacts.declarations.find((d) => d.symbolId === betaHandle.id)!
      expect(alphaOcc).toBeDefined()
      expect(betaOcc).toBeDefined()
      expect(alphaOcc.logicalId).not.toBe(betaOcc.logicalId)
    })
  })

  describe('parser-authoritative extraction regressions (Task 12.14)', () => {
    it('comments, strings, braces, and call lookalikes produce zero spurious facts', () => {
      const code = `package main
// type FakeInterface interface {
//     MethodInComment()
// }
// fake.CommentCall()
// &FakeComposite{}

var doc = \`
type FakeStringInterface interface {
    MethodInString()
}
import "fake/string/import"
fake.StringCall()
FakeLiteral{}
\`

import (
    alias "real/pkg"
)

type RealInterface interface {
    RealMethod()
}

type RealService struct {
    Field string
}

func Execute() {
    alias.RealCall()
    v := RealService{}
    _ = v
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'workspace:main.go',
        projectRelativePath: 'main.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'workspace',
      })
      const draft = baseAdapter.analyzeFile('workspace:main.go', code, {
        session,
        workspaceName: 'workspace',
      })

      // Zero spurious symbols from comments/strings
      expect(draft.symbols.some((s) => s.name.includes('Fake'))).toBe(false)
      expect(draft.symbols.some((s) => s.name.includes('MethodIn'))).toBe(false)

      // Zero spurious imports
      expect(draft.imports.some((i) => i.specifier.includes('fake'))).toBe(false)
      expect(draft.imports.some((i) => i.specifier === 'real/pkg')).toBe(true)

      // Zero spurious call facts
      expect(
        draft.callFacts.some(
          (c) =>
            c.name.includes('Fake') || c.name.includes('Comment') || c.name.includes('StringCall'),
        ),
      ).toBe(false)

      // Real symbols, imports, and calls are extracted
      expect(draft.symbols.some((s) => s.name === 'RealInterface')).toBe(true)
      expect(draft.symbols.some((s) => s.name === 'RealMethod')).toBe(true)
      expect(draft.symbols.some((s) => s.name === 'RealService')).toBe(true)
      expect(draft.callFacts.some((c) => c.name === 'RealCall' && c.receiverName === 'alias')).toBe(
        true,
      )
      expect(
        draft.callFacts.some((c) => c.name === 'RealService' && c.form === CallForm.Constructor),
      ).toBe(true)
    })
  })
})

describe('Go routine-local and module state classification', () => {
  it('keeps locals out and unexported package variables physical-only', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:s.go',
      projectRelativePath: 'ws:s.go',
      language: 'go',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile(
      'ws:s.go',
      'package a\nvar moduleState = 1\nvar Exposed = 2\nfunc Run() {\n\tlocalVar := 1\n\t_ = localVar\n}\n',
      { session, workspaceName: 'ws' },
    )
    const logical = (draft.referenceFacts?.declarations ?? []).map(
      (declaration) => parseLogicalSymbol(declaration.logicalId ?? '')?.name,
    )

    expect(draft.symbols.some((symbol) => symbol.name === 'moduleState')).toBe(true)
    expect(logical.sort()).toEqual(['Exposed', 'Run'])
    expect(draft.symbols.some((symbol) => symbol.name === 'localVar')).toBe(false)
  })
})

describe('Go embedded interfaces, blank imports and shadowing', () => {
  const analyze = (
    files: Record<string, string>,
    main: string,
    packageToWorkspace: ReadonlyMap<string, string> = new Map(),
  ): { relations: Relation[]; fileImports: readonly string[] } => {
    const session = new InMemoryIndexSession()
    let analysis: FileAnalysis | undefined
    for (const [filePath, content] of Object.entries(files)) {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'go',
        contentHash: 'x',
        workspace: 'ws',
      })
      const registered = session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' }),
      })
      if (filePath === main) analysis = registered
    }
    const resolvedImports = baseAdapter.resolveImports(analysis!, {
      session,
      qualifiedNames: new Map(),
      packageToWorkspace,
    })
    return {
      relations: baseAdapter.buildRelations(analysis!, { session, resolvedImports }),
      fileImports: resolvedImports.fileImports,
    }
  }

  const implementsOf = (relations: readonly Relation[]): string[] =>
    relations
      .filter((relation) => relation.type === RelationType.Implements)
      .map((relation) => relation.source.split(':').slice(-3, -1).join(':'))

  it('requires the embedded interface methods before claiming IMPLEMENTS', () => {
    const { relations } = analyze(
      {
        'ws:a.go': [
          'package a',
          'type Reader interface { Read() }',
          'type RW interface {',
          '\tReader',
          '\tWrite()',
          '}',
          'type OnlyWrite struct{}',
          'func (o OnlyWrite) Write() {}',
          'type Both struct{}',
          'func (b Both) Read() {}',
          'func (b Both) Write() {}',
        ].join('\n'),
      },
      'ws:a.go',
    )

    const implementors = relations
      .filter((relation) => relation.type === RelationType.Implements)
      .map((relation) => [relation.source, relation.target])
    expect(implementors).toContainEqual([
      expect.stringContaining('class:Both'),
      expect.stringContaining('interface:RW'),
    ])
    expect(implementors.some(([source]) => source!.includes('class:OnlyWrite') && true)).toBe(false)
    expect(implementsOf(relations)).not.toContain('class:OnlyWrite')
  })

  it('claims nothing when an embedded interface cannot be resolved locally', () => {
    const { relations } = analyze(
      {
        'ws:a.go': [
          'package a',
          'type RW interface {',
          '\tio.Reader',
          '\tWrite()',
          '}',
          'type Impl struct{}',
          'func (i Impl) Write() {}',
        ].join('\n'),
      },
      'ws:a.go',
    )

    expect(relations.filter((relation) => relation.type === RelationType.Implements)).toEqual([])
  })

  it('records a package dependency for a blank import without binding a name', () => {
    const { fileImports } = analyze(
      {
        'ws:driver/driver.go': 'package driver\nfunc Register() {}\n',
        'ws:main.go': 'package main\nimport _ "example.com/app/driver"\nfunc main() {}\n',
      },
      'ws:main.go',
      new Map([['example.com/app', 'ws']]),
    )

    expect(fileImports).toEqual(['ws:driver/driver.go'])
  })

  it('emits no CALLS when a parameter or local binds the called name', () => {
    const { relations } = analyze(
      {
        'ws:a.go': [
          'package a',
          'func Helper() {}',
          'func ViaParam(Helper func()) { Helper() }',
          'func ViaLocal() { Helper := func() {}; Helper() }',
          'func ViaVar() { var Helper = func() {}; Helper() }',
        ].join('\n'),
      },
      'ws:a.go',
    )

    expect(relations.filter((relation) => relation.type === RelationType.Calls)).toEqual([])
  })

  it('still emits CALLS for an unshadowed package-level function', () => {
    const { relations } = analyze(
      { 'ws:a.go': 'package a\nfunc Helper() {}\nfunc Run() { Helper() }\n' },
      'ws:a.go',
    )

    expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(1)
  })
})
