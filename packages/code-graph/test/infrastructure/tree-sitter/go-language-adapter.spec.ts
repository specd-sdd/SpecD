import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  GO_MODULE_OFFSETS_KEY,
  GoLanguageAdapter,
  readGoModulePath,
  completeGoInterfaceMethodSet,
  type GoMethodSetCache,
  type GoTypeInfo,
} from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import {
  setStructuralWorkObserverForTesting,
  type StructuralWorkKind,
  type StructuralWorkObserver,
} from '../../../src/infrastructure/tree-sitter/reference-fact-helpers.js'
import { MemberKind, SymbolSpace } from '../../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { ImportDeclarationKind } from '../../../src/domain/value-objects/import-declaration-kind.js'
import {
  BindingSourceKind,
  type BindingFact,
} from '../../../src/domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { qualifiedReferenceKey } from '../../../src/domain/value-objects/qualified-reference-fact.js'
import { type SourceRange, type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { parseLogicalSymbol } from '../../../src/domain/value-objects/symbol-reference.js'
import { type FileAnalysis } from '../../../src/domain/value-objects/file-analysis.js'
import { createImportResolutionContext } from '../../helpers/import-resolution-context.js'
import {
  type PackageResolutionFacet,
  type SymbolReferenceSyntaxFacet,
} from '../../../src/domain/value-objects/language-adapter-facets.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  resolutionManifests(): readonly string[]
  readonly packageResolution: PackageResolutionFacet
  readonly symbolReferenceSyntax: SymbolReferenceSyntaxFacet
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
  const resolvedImports = { importMap, fileImports: [], steps: [], diagnostics: [] }
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
      expect(
        adapter.packageResolution.matchSpecifier(
          'github.com/acme/auth/models',
          known,
          new InMemoryIndexSession(),
        ),
      ).toBe('github.com/acme/auth')
    })

    it('resolves exact match', () => {
      const known = ['github.com/acme/auth']
      expect(
        adapter.packageResolution.matchSpecifier(
          'github.com/acme/auth',
          known,
          new InMemoryIndexSession(),
        ),
      ).toBe('github.com/acme/auth')
    })

    it('returns undefined for unknown module', () => {
      const known = ['github.com/acme/auth']
      expect(
        adapter.packageResolution.matchSpecifier('fmt', known, new InMemoryIndexSession()),
      ).toBeUndefined()
    })

    it('picks longest match when multiple prefixes overlap', () => {
      const known = ['github.com/acme', 'github.com/acme/auth']
      expect(
        adapter.packageResolution.matchSpecifier(
          'github.com/acme/auth/models',
          known,
          new InMemoryIndexSession(),
        ),
      ).toBe('github.com/acme/auth')
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
      expect(adapter.packageResolution.identity(tempDir)).toBe('github.com/acme/auth')
    })

    it('returns undefined when no go.mod', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-pkg-'))
      expect(adapter.packageResolution.identity(tempDir)).toBeUndefined()
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
      expect(adapter.packageResolution.identity(subDir, tempDir)).toBe('github.com/acme/auth')
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
        resolvedImports: { importMap: new Map(), fileImports: [], steps: [], diagnostics: [] },
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

      session.setAdapterState(GO_MODULE_OFFSETS_KEY, new Map([['ws', '']]))
      const resolved = baseAdapter.resolveImports(
        analysis,
        createImportResolutionContext(
          {
            session,
            qualifiedNames: new Map(),
            packageToWorkspace: new Map([['example.com/app', 'ws']]),
          },
          baseAdapter,
        ),
      )

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

      session.setAdapterState(GO_MODULE_OFFSETS_KEY, new Map([['ws', '']]))
      const resolved = baseAdapter.resolveImports(
        analysis,
        createImportResolutionContext(
          {
            session,
            qualifiedNames: new Map(),
            packageToWorkspace: new Map([['example.com/app', 'ws']]),
          },
          baseAdapter,
        ),
      )

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
    session.setAdapterState(GO_MODULE_OFFSETS_KEY, new Map([['ws', '']]))
    const resolvedImports = baseAdapter.resolveImports(
      analysis!,
      createImportResolutionContext(
        {
          session,
          qualifiedNames: new Map(),
          packageToWorkspace,
        },
        baseAdapter,
      ),
    )
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

  describe('Go package resolution hardening', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true })
    })

    describe('readGoModulePath', () => {
      it('unquotes double-quoted module paths', () => {
        expect(readGoModulePath('module "example.com/mod"\n\ngo 1.21\n')).toBe('example.com/mod')
      })

      it('unquotes backtick-quoted module paths', () => {
        expect(readGoModulePath('module `example.com/mod`\n\ngo 1.21\n')).toBe('example.com/mod')
      })

      it('reads unquoted module paths', () => {
        expect(readGoModulePath('module example.com/mod\n\ngo 1.21\n')).toBe('example.com/mod')
      })

      it('returns undefined when no module directive exists', () => {
        expect(readGoModulePath('package main\n')).toBeUndefined()
      })
    })

    it('Scenario: Quoted module path is unquoted', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-mod-quotes-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module "example.com/mod"\n\ngo 1.21\n')
      expect(baseAdapter.packageResolution.identity(tempDir)).toBe('example.com/mod')

      writeFileSync(join(tempDir, 'go.mod'), 'module `example.com/mod`\n\ngo 1.21\n')
      expect(baseAdapter.packageResolution.identity(tempDir)).toBe('example.com/mod')
    })

    it('Scenario: go.mod above the code root', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-above-root-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module example.com/mod\n\ngo 1.21\n')
      const codeRoot = join(tempDir, 'internal')
      mkdirSync(join(codeRoot, 'util'), { recursive: true })

      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'ws:util/helper.go',
        projectRelativePath: 'internal/util/helper.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'ws',
      })
      session.registerFile({
        filePath: 'ws:util/helper_test.go',
        projectRelativePath: 'internal/util/helper_test.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'ws',
      })

      baseAdapter.packageResolution.prepare?.({
        session,
        workspaces: [{ name: 'ws', codeRoot, repoRoot: tempDir }],
        projectRoot: tempDir,
      })

      const surface = baseAdapter.packageResolution.entrySurface({
        session,
        workspace: 'ws',
        packageName: 'example.com/mod',
        specifier: 'example.com/mod/internal/util',
      })

      expect(surface).toEqual([
        {
          filePath: 'ws:util/helper.go',
          surface: 'ws:util',
        },
      ])
    })

    it('Scenario: Package directory outside the code root yields no entries', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-outside-root-'))
      writeFileSync(join(tempDir, 'go.mod'), 'module example.com/mod\n\ngo 1.21\n')
      const codeRoot = join(tempDir, 'internal')
      mkdirSync(codeRoot, { recursive: true })

      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'ws:util/helper.go',
        projectRelativePath: 'internal/util/helper.go',
        language: 'go',
        contentHash: 'hash',
        workspace: 'ws',
      })

      baseAdapter.packageResolution.prepare?.({
        session,
        workspaces: [{ name: 'ws', codeRoot, repoRoot: tempDir }],
        projectRoot: tempDir,
      })

      // Path outside internal (e.g. cmd/tool)
      const outsideSurface = baseAdapter.packageResolution.entrySurface({
        session,
        workspace: 'ws',
        packageName: 'example.com/mod',
        specifier: 'example.com/mod/cmd/tool',
      })
      expect(outsideSurface).toEqual([])

      // Path equal to the module root itself (which is above codeRoot)
      const rootSurface = baseAdapter.packageResolution.entrySurface({
        session,
        workspace: 'ws',
        packageName: 'example.com/mod',
        specifier: 'example.com/mod',
      })
      expect(rootSurface).toEqual([])
    })

    it('Scenario: Module directory is located once in prepare', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'go-prepare-once-'))
      const ws1Dir = join(tempDir, 'ws1')
      const ws2Dir = join(tempDir, 'ws2')
      mkdirSync(ws1Dir, { recursive: true })
      mkdirSync(ws2Dir, { recursive: true })
      const mod1File = join(ws1Dir, 'go.mod')
      const mod2File = join(ws2Dir, 'go.mod')
      writeFileSync(mod1File, 'module example.com/ws1\n')
      writeFileSync(mod2File, 'module example.com/ws2\n')

      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'ws1:pkg/a.go',
        projectRelativePath: 'ws1/pkg/a.go',
        language: 'go',
        contentHash: 'h1',
        workspace: 'ws1',
      })

      baseAdapter.packageResolution.prepare?.({
        session,
        workspaces: [
          { name: 'ws1', codeRoot: ws1Dir },
          { name: 'ws2', codeRoot: ws2Dir },
        ],
        projectRoot: tempDir,
      })

      // Delete the manifests on disk to prove entrySurface performs no filesystem I/O
      rmSync(mod1File)
      rmSync(mod2File)

      const entries = baseAdapter.packageResolution.entrySurface({
        session,
        workspace: 'ws1',
        packageName: 'example.com/ws1',
        specifier: 'example.com/ws1/pkg',
      })

      expect(entries).toEqual([
        {
          filePath: 'ws1:pkg/a.go',
          surface: 'ws1:pkg',
        },
      ])
    })
  })

  describe('Go indexed declaration and receiver association (Task 5.7)', () => {
    it('Scenario: Named and receiver declarations use direct indexes', () => {
      const counts = new Map<StructuralWorkKind, number>()
      const observer: StructuralWorkObserver = {
        record: (k) => counts.set(k, (counts.get(k) ?? 0) + 1),
      }
      const testAdapter = new GoLanguageAdapter()
      setStructuralWorkObserverForTesting(testAdapter, observer)
      const session = new InMemoryIndexSession()

      // Generate 40 structs and 40 interfaces with methods (total 80 types, 160 methods)
      const lines: string[] = ['package main\n']
      for (let i = 0; i < 40; i++) {
        lines.push(`type Interface${i} interface {`)
        lines.push(`  MethodA${i}()`)
        lines.push(`  MethodB${i}()`)
        lines.push(`}`)
        lines.push(`type Struct${i} struct {`)
        lines.push(`  Field${i} int`)
        lines.push(`}`)
        // Value receiver
        lines.push(`func (s Struct${i}) MethodA${i}() {}`)
        // Pointer receiver
        lines.push(`func (s *Struct${i}) MethodB${i}() {}`)
      }

      const code = lines.join('\n')
      const draft = testAdapter.analyzeFile('ws:main.go', code, {
        session,
        workspaceName: 'ws',
      })

      const state = draft.parserState as unknown as {
        typeInfos: GoTypeInfo[]
        pointerReceiverMethodIds: string[]
        methodReceivers: Record<string, Record<string, string>>
        interfaceMethods: Record<string, string[]>
      }

      expect(state.typeInfos).toHaveLength(80)
      expect(state.pointerReceiverMethodIds).toHaveLength(40)

      // Verify each struct and interface mapping
      for (let i = 0; i < 40; i++) {
        expect(state.methodReceivers[`Struct${i}`]).toBeDefined()
        expect(state.methodReceivers[`Struct${i}`]?.[`MethodA${i}`]).toBeDefined()
        expect(state.methodReceivers[`Struct${i}`]?.[`MethodB${i}`]).toBeDefined()
        expect(state.interfaceMethods[`Interface${i}`]).toEqual([`MethodA${i}`, `MethodB${i}`])
      }

      // Check declaration member semantics in referenceFacts
      const methodA0s = (draft.referenceFacts?.declarations ?? [])
        .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
        .filter((logical) => logical?.name === 'MethodA0')
      expect(methodA0s.map((l) => l?.memberSemantics)).toContainEqual({ kind: 'signature' })
      expect(methodA0s.map((l) => l?.memberSemantics)).toContainEqual({
        kind: 'method',
        dispatch: 'instance',
      })

      // Owner-member node visits must be linear in members (~160), not quadratic (80 * 160 = 12,800)
      const memberVisits = counts.get('owner-member-node-visited') ?? 0
      expect(memberVisits).toBeGreaterThanOrEqual(160)
      expect(memberVisits).toBeLessThan(500)
    })
  })

  describe('Go method-set memoization and conservative unknowns (Task 5.8)', () => {
    it('Scenario: Embedded interface closure is memoized', () => {
      const counts = new Map<StructuralWorkKind, number>()
      const observer: StructuralWorkObserver = {
        record: (k) => counts.set(k, (counts.get(k) ?? 0) + 1),
      }
      const testAdapter = new GoLanguageAdapter()
      setStructuralWorkObserverForTesting(testAdapter, observer)
      const session = new InMemoryIndexSession()

      const code = `
package main

type Base interface {
  Close()
}

type Left interface {
  Base
  Read()
}

type Right interface {
  Base
  Write()
}

type Combined interface {
  Left
  Right
}

type Device struct {}
func (d Device) Close() {}
func (d Device) Read() {}
func (d Device) Write() {}

type ExtraStruct1 struct {}
func (e ExtraStruct1) Close() {}
func (e ExtraStruct1) Read() {}
func (e ExtraStruct1) Write() {}

type ExtraStruct2 struct {}
func (e ExtraStruct2) Close() {}
func (e ExtraStruct2) Read() {}
func (e ExtraStruct2) Write() {}
`

      const draft = testAdapter.analyzeFile('ws:diamond.go', code, {
        session,
        workspaceName: 'ws',
      })

      const resolvedImports = {
        importMap: new Map<string, string>(),
        fileImports: [],
        steps: [],
        diagnostics: [],
      }
      const relations = testAdapter.buildRelations(draft as FileAnalysis, {
        session,
        resolvedImports,
      })

      // Device implements Combined, Left, Right, Base
      const implementsRelations = relations.filter((r) => r.type === RelationType.Implements)
      expect(implementsRelations.length).toBeGreaterThanOrEqual(12) // 3 structs * 4 interfaces = 12 implements

      // Extends relations for embedded interfaces
      const extendsRelations = relations.filter((r) => r.type === RelationType.Extends)
      expect(extendsRelations.length).toBe(4) // Combined->Left, Combined->Right, Left->Base, Right->Base

      // Each of the 4 interfaces expands AT MOST ONCE in the memoized cache across all struct comparisons
      const expansionCount = counts.get('interface-method-set-expanded') ?? 0
      expect(expansionCount).toBe(4)
    })

    it('Scenario: Unknown method set remains unknown when cached', () => {
      const testAdapter = new GoLanguageAdapter()
      const session = new InMemoryIndexSession()

      const code = `
package main

// Cycle between CycleA and CycleB
type CycleA interface {
  CycleB
  MethodA()
}

type CycleB interface {
  CycleA
  MethodB()
}

// Struct providing both methods of the cycle
type CycleStruct struct {}
func (c CycleStruct) MethodA() {}
func (c CycleStruct) MethodB() {}

// External/unresolved embed
type ExtIface interface {
  io.Reader
  Custom()
}

type ExtStruct struct {}
func (e ExtStruct) Read() {}
func (e ExtStruct) Custom() {}

// Empty interface
type EmptyIface interface {}
type EmptyStruct struct {}
`

      const draft = testAdapter.analyzeFile('ws:unknowns.go', code, {
        session,
        workspaceName: 'ws',
      })

      const resolvedImports = {
        importMap: new Map<string, string>(),
        fileImports: [],
        steps: [],
        diagnostics: [],
      }
      const relations = testAdapter.buildRelations(draft as FileAnalysis, {
        session,
        resolvedImports,
      })

      const state = draft.parserState as unknown as {
        typeInfos: GoTypeInfo[]
        interfaceMethods: Record<string, string[]>
      }
      const typeByName = new Map(state.typeInfos.map((i) => [i.name, i]))
      const cache: GoMethodSetCache = new Map()

      // Cycle yields null
      const cycleASet = completeGoInterfaceMethodSet(
        'CycleA',
        typeByName,
        state.interfaceMethods,
        cache,
      )
      expect(cycleASet).toBeNull()
      const cycleBSet = completeGoInterfaceMethodSet(
        'CycleB',
        typeByName,
        state.interfaceMethods,
        cache,
      )
      expect(cycleBSet).toBeNull()

      // External embed yields null
      const extSet = completeGoInterfaceMethodSet(
        'ExtIface',
        typeByName,
        state.interfaceMethods,
        cache,
      )
      expect(extSet).toBeNull()

      // No IMPLEMENTS relation may be emitted for cyclic or unknown interfaces
      const cycleStruct = state.typeInfos.find((t) => t.name === 'CycleStruct')!
      const cycleA = state.typeInfos.find((t) => t.name === 'CycleA')!
      const cycleB = state.typeInfos.find((t) => t.name === 'CycleB')!
      const extIface = state.typeInfos.find((t) => t.name === 'ExtIface')!
      const emptyIface = state.typeInfos.find((t) => t.name === 'EmptyIface')!

      expect(
        relations.some((r) => r.source === cycleStruct.symbolId && r.target === cycleA.symbolId),
      ).toBe(false)
      expect(
        relations.some((r) => r.source === cycleStruct.symbolId && r.target === cycleB.symbolId),
      ).toBe(false)
      expect(
        relations.some((r) => r.target === extIface.symbolId && r.type === RelationType.Implements),
      ).toBe(false)
      expect(
        relations.some(
          (r) => r.target === emptyIface.symbolId && r.type === RelationType.Implements,
        ),
      ).toBe(false)

      // Must not emit member-level OVERRIDES relations
      expect(relations.some((r) => r.type === RelationType.Overrides)).toBe(false)

      // Cached unknown values must be stored as null and reused without recomputation
      expect(cache.get('CycleA')).toBeNull()
      expect(cache.get('CycleB')).toBeNull()
      expect(cache.get('ExtIface')).toBeNull()
      const cycleARecheck = completeGoInterfaceMethodSet(
        'CycleA',
        typeByName,
        state.interfaceMethods,
        cache,
      )
      expect(cycleARecheck).toBeNull()
    })
  })

  describe('Go lexical-summary reuse and complete parity (Task 5.9)', () => {
    it('Scenario: Routine and block scopes share one summary per scope', () => {
      const counts = new Map<StructuralWorkKind, number>()
      const observer: StructuralWorkObserver = {
        record: (k) => counts.set(k, (counts.get(k) ?? 0) + 1),
      }
      const testAdapter = new GoLanguageAdapter()
      setStructuralWorkObserverForTesting(testAdapter, observer)
      const session = new InMemoryIndexSession()

      const code = `
package main

type Service struct {}

func (s Service) Process(param1 string, param2 int) {
  // Many calls inside routine
  call1()
  call2()
  call3()
  call4()
  param1() // shadowed by param
  s()      // shadowed by receiver

  {
    localShort := "value"
    call5()
    call6()
    call7()
    localShort() // shadowed by short-var
  }

  {
    var localVar int
    const localConst = 10
    call8()
    call9()
    localVar()   // shadowed by var
    localConst() // shadowed by const
  }
}
`

      const draft = testAdapter.analyzeFile('ws:shadowing.go', code, {
        session,
        workspaceName: 'ws',
      })

      const callNames = (draft.callFacts ?? []).map((c) => c.name)

      // Unshadowed calls exist
      for (let i = 1; i <= 9; i++) {
        expect(callNames).toContain(`call${i}`)
      }

      // Shadowed calls are omitted
      expect(callNames).not.toContain('param1')
      expect(callNames).not.toContain('s')
      expect(callNames).not.toContain('localShort')
      expect(callNames).not.toContain('localVar')
      expect(callNames).not.toContain('localConst')

      // Scopes: 1 method routine scope + 2 block scopes = at most 4 scope visits
      const scopeVisits = counts.get('lexical-scope-node-visited') ?? 0
      expect(scopeVisits).toBeGreaterThan(0)
      expect(scopeVisits).toBeLessThanOrEqual(4)
    })

    it('Scenario: Indexed and baseline semantics are equivalent', () => {
      const session = new InMemoryIndexSession()

      const code = `
package service

import (
  "fmt"
  "strings"
)

type UserReader interface {
  GetUser(id int) string
}

type UserService struct {
  Name string
}

func (u UserService) GetUser(id int) string {
  fmt.Println("fetching user")
  return strings.TrimSpace("user")
}

func HelperFunction() {
  u := UserService{Name: "admin"}
  _ = u.GetUser(1)
}
`

      const draft = baseAdapter.analyzeFile('ws:service.go', code, {
        session,
        workspaceName: 'ws',
      })

      expect(draft.language).toBe('go')
      expect(draft.symbols.length).toBeGreaterThan(0)
      expect(draft.imports).toHaveLength(2)

      // Complete normalized symbol parity: exact names and kinds
      const symbolSummaries = draft.symbols.map((s) => ({ name: s.name, kind: s.kind }))
      expect(symbolSummaries).toEqual([
        { name: 'UserReader', kind: SymbolKind.Interface },
        { name: 'GetUser', kind: SymbolKind.Method },
        { name: 'UserService', kind: SymbolKind.Class },
        { name: 'Name', kind: SymbolKind.Property },
        { name: 'GetUser', kind: SymbolKind.Method },
        { name: 'HelperFunction', kind: SymbolKind.Function },
      ])

      // Complete normalized import parity
      expect(draft.imports.map((i) => i.localName).sort()).toEqual(['fmt', 'strings'])

      const resolvedImports = {
        importMap: new Map<string, string>(),
        fileImports: [],
        steps: [],
        diagnostics: [],
      }
      const relations = baseAdapter.buildRelations(draft as FileAnalysis, {
        session,
        resolvedImports,
      })

      // Defines relations exist for symbols
      const defines = relations.filter((r) => r.type === RelationType.Defines)
      expect(defines.length).toBe(draft.symbols.length)

      // UserService implements UserReader
      const userReader = draft.symbols.find((s) => s.name === 'UserReader')!
      const userService = draft.symbols.find(
        (s) => s.name === 'UserService' && s.kind === SymbolKind.Class,
      )!
      const impl = relations.find(
        (r) =>
          r.source === userService.id &&
          r.target === userReader.id &&
          r.type === RelationType.Implements,
      )
      expect(impl).toBeDefined()
      expect(relations.some((relation) => relation.type === RelationType.Overrides)).toBe(false)
    })
  })

  describe('Parser-owned resource registration', () => {
    it('registers SgRoot into session.parserResources and leaves no keepalive in session state', () => {
      const goAdapter = new GoLanguageAdapter()
      const session = new InMemoryIndexSession()
      const draft = goAdapter.analyzeFile('file.go', 'package main\nfunc Test() {}', {
        session,
        workspaceName: 'ws',
      })

      expect(draft.symbols.length).toBe(1)
      expect(session.parserResources.size).toBe(1)
      expect(session.getAdapterState('napi-keepalive')).toBeUndefined()

      const closeResult = session.parserResources.close()
      expect(closeResult.registered).toBe(1)
      expect(session.parserResources.size).toBe(0)
    })
  })

  describe('qualified package selectors', () => {
    /**
     * Registers one Go file and its analysis.
     * @param session - Session that receives the file.
     * @param filePath - Workspace-prefixed path.
     * @param code - Source text.
     * @param workspace - Workspace name.
     * @returns The registered analysis.
     */
    function register(
      session: InMemoryIndexSession,
      filePath: string,
      code: string,
      workspace: string,
    ): FileAnalysis {
      session.registerFile({
        filePath,
        projectRelativePath: filePath.slice(filePath.indexOf(':') + 1),
        language: 'go',
        contentHash: 'hash',
        workspace,
      })
      return session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, code, { session, workspaceName: workspace }),
      })
    }

    /**
     * Resolves imports for an analysis against the packages the test declares.
     * @param session - Session holding analyses and the module offset map.
     * @param analysis - Importing file.
     * @param packages - Module path to workspace name.
     * @returns Resolved imports.
     */
    function resolve(
      session: InMemoryIndexSession,
      analysis: FileAnalysis,
      packages: ReadonlyMap<string, string>,
    ) {
      const offsets = new Map<string, string>()
      for (const workspace of packages.values()) offsets.set(workspace, '')
      session.setAdapterState(GO_MODULE_OFFSETS_KEY, offsets)
      return baseAdapter.resolveImports(
        analysis,
        createImportResolutionContext(
          { session, packageToWorkspace: new Map(packages) },
          baseAdapter,
        ),
      )
    }

    it('given an explicit alias, when a selector uses it, then the alias is the namespace name', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:models/user.go', 'package models\nfunc NewUser() {}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport auth "github.com/acme/auth/models"\nfunc main() { auth.NewUser() }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const fact = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'call')

      expect(fact?.qualifier).toBe('auth')
      expect(fact?.name).toBe('NewUser')
      expect(resolved.qualifiedTargets?.get(qualifiedReferenceKey(fact!))).toBeDefined()
    })

    it('given a path whose last segment differs from the package clause, when the clause agrees, then the declared name wins', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/go-auth"\nfunc main() { _ = auth.User{} }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/go-auth', 'auth']]))
      const fact = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'construct')

      expect(fact?.qualifier).toBe('auth')
      expect(resolved.qualifiedTargets?.size).toBe(1)
    })

    it('given a /v2 import path, when the package clause is auth, then selectors use auth', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth/v2"\nvar current auth.User\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth/v2', 'auth']]))

      expect(analysis.qualifiedReferenceFacts?.some((item) => item.qualifier === 'v2')).toBe(false)
      expect(resolved.qualifiedTargets?.size).toBe(1)
    })

    it('given entries that declare different package names, when a selector uses the last segment, then that name resolves', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:pkg/models/a.go', 'package models\ntype User struct{}\n', 'ws')
      register(session, 'ws:pkg/models/b.go', 'package main\n', 'ws')
      const analysis = register(
        session,
        'ws:main.go',
        'package main\nimport "example.com/app/pkg/models"\nfunc main() { _ = models.User{} }\n',
        'ws',
      )
      const resolved = resolve(session, analysis, new Map([['example.com/app', 'ws']]))

      expect(resolved.qualifiedTargets?.size).toBe(1)
    })

    it('given blank and dot imports, when selectors use a name, then nothing is bound', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:pkg/helpers/a.go', 'package helpers\nfunc Name() {}\n', 'ws')
      register(session, 'auth:user.go', 'package auth\nfunc NewUser() {}\n', 'auth')
      const analysis = register(
        session,
        'ws:main.go',
        'package main\nimport (\n  . "example.com/app/pkg/helpers"\n  _ "example.com/app/pkg/helpers"\n  "github.com/acme/auth"\n)\nfunc main() {\n  helpers.Name()\n  auth.NewUser()\n}\n',
        'ws',
      )
      const resolved = resolve(
        session,
        analysis,
        new Map([
          ['example.com/app', 'ws'],
          ['github.com/acme/auth', 'auth'],
        ]),
      )

      expect(
        [...(resolved.qualifiedTargets?.keys() ?? [])].some((key) => key.includes('helpers.Name')),
      ).toBe(false)
      expect(resolved.qualifiedTargets?.size).toBe(1)
      expect(
        [...(resolved.qualifiedTargets?.keys() ?? [])].some((key) => key.includes('auth.NewUser')),
      ).toBe(true)
    })

    it('given a qualified call, construct, and type, when relations are built, then each reaches the exported symbol', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nvar current auth.User\nfunc main(user auth.User) auth.User {\n  auth.NewUser()\n  _ = auth.User{}\n  return user\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const user = provider.symbols.find((symbol) => symbol.name === 'User')!
      const factory = provider.symbols.find((symbol) => symbol.name === 'NewUser')!
      const main = analysis.symbols.find((symbol) => symbol.name === 'main')!
      const current = analysis.symbols.find((symbol) => symbol.name === 'current')!

      expect(relations).toContainEqual(
        expect.objectContaining({ type: RelationType.Calls, source: main.id, target: factory.id }),
      )
      expect(relations).toContainEqual(
        expect.objectContaining({
          type: RelationType.Constructs,
          source: main.id,
          target: user.id,
        }),
      )
      expect(relations).toContainEqual(
        expect.objectContaining({ type: RelationType.UsesType, source: main.id, target: user.id }),
      )
      expect(relations).toContainEqual(
        expect.objectContaining({
          type: RelationType.UsesType,
          source: current.id,
          target: user.id,
        }),
      )
      expect(resolved.steps.some((step) => step.kind === 'import:package')).toBe(true)
    })

    it('given an unexported name, a shadowed qualifier, a value selector, and an unknown package, when resolved, then no qualified relation is produced', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\nfunc newUser() {}\nfunc Save() {}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc shadowed(auth int) { auth.NewUser() }\nfunc main() {\n  auth.newUser()\n  var u struct{}\n  u.Save()\n  fmt.Println()\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })

      expect(analysis.qualifiedReferenceFacts?.some((item) => item.name === 'NewUser')).toBe(false)
      expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
      expect(resolved.diagnostics.some((item) => item.specifier === 'fmt')).toBe(false)
    })

    it('given a field type in another workspace, when relations are built, then USES_TYPE crosses the workspace', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\ntype Service struct { User auth.User }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const field = analysis.symbols.find((symbol) => symbol.name === 'User')!
      const user = provider.symbols.find((symbol) => symbol.name === 'User')!

      expect(relations).toContainEqual(
        expect.objectContaining({
          type: RelationType.UsesType,
          source: field.id,
          target: user.id,
        }),
      )
    })

    it('given an explicit alias, when the path-derived name is also used, then only the alias resolves', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:models/user.go', 'package models\nfunc NewUser() {}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport auth "github.com/acme/auth/models"\nfunc main() { auth.NewUser(); models.NewUser() }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const alias = analysis.qualifiedReferenceFacts?.find((item) => item.qualifier === 'auth')

      expect(analysis.qualifiedReferenceFacts?.some((item) => item.qualifier === 'models')).toBe(
        true,
      )
      expect(resolved.qualifiedTargets?.size).toBe(1)
      expect(resolved.qualifiedTargets?.get(qualifiedReferenceKey(alias!))).toBeDefined()
    })

    it('given a shadowed construct and type, when facts are extracted, then neither fact is emitted', () => {
      const session = new InMemoryIndexSession()
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc shadowed(auth int) {\n  _ = auth.User{}\n  var current auth.User\n}\n',
        'app',
      )

      expect(analysis.qualifiedReferenceFacts ?? []).toEqual([])
    })

    it('given a local var that shadows the import, when a call is extracted, then no call fact is emitted', () => {
      const session = new InMemoryIndexSession()
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  auth := 1\n  auth.NewUser()\n  _ = auth\n}\n',
        'app',
      )

      expect(analysis.qualifiedReferenceFacts?.some((item) => item.kind === 'call')).toBe(false)
    })

    it('given result, const, type-declaration, and type-argument positions, when relations are built, then each USES_TYPE reaches User', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\ntype Alias auth.User\ntype Box[T any] struct{}\nconst label auth.User = 0\nfunc result() auth.User { return result() }\nvar boxed Box[auth.User]\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const user = provider.symbols.find((symbol) => symbol.name === 'User')!
      const uses = (name: string): boolean => {
        const source = analysis.symbols.find((symbol) => symbol.name === name)
        return relations.some(
          (relation) =>
            relation.type === RelationType.UsesType &&
            relation.source === source?.id &&
            relation.target === user.id,
        )
      }

      expect(uses('Alias')).toBe(true)
      expect(uses('label')).toBe(true)
      expect(uses('result')).toBe(true)
      expect(uses('boxed')).toBe(true)
    })

    it('given an uppercase name the package does not export, when it is called, then the call is dropped', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\nfunc NewUser() {}\n', 'auth')
      register(session, 'app:other.go', 'package main\nfunc Missing() {}\n', 'app')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() { auth.Missing() }\n',
        'app',
      )
      const searched = vi.spyOn(session, 'findSymbolsByName')
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })

      expect(resolved.qualifiedTargets?.size).toBe(0)
      expect(resolved.diagnostics.some((item) => item.exportedName === 'Missing')).toBe(false)
      expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
      expect(searched).not.toHaveBeenCalled()
      searched.mockRestore()
    })

    it('given a package-level initializer, when relations are built, then the variable is the source', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nvar current = auth.NewUser()\nvar value = auth.User{}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const current = analysis.symbols.find((symbol) => symbol.name === 'current')!
      const value = analysis.symbols.find((symbol) => symbol.name === 'value')!
      const factory = provider.symbols.find((symbol) => symbol.name === 'NewUser')!
      const user = provider.symbols.find((symbol) => symbol.name === 'User')!
      const call = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'call')
      const construct = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'construct')

      expect(call?.sourceSymbolId).toBe(current.id)
      expect(construct?.sourceSymbolId).toBe(value.id)
      expect(relations).toContainEqual(
        expect.objectContaining({
          type: RelationType.Calls,
          source: current.id,
          target: factory.id,
        }),
      )
      expect(relations).toContainEqual(
        expect.objectContaining({
          type: RelationType.Constructs,
          source: value.id,
          target: user.id,
        }),
      )
    })

    it('given an instantiated generic call, when facts are extracted, then a call fact names the selector', () => {
      const session = new InMemoryIndexSession()
      const provider = register(session, 'auth:user.go', 'package auth\nfunc Fn() {}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() { auth.Fn[int]() }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const fact = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'call')
      const main = analysis.symbols.find((symbol) => symbol.name === 'main')!
      const fn = provider.symbols.find((symbol) => symbol.name === 'Fn')!

      expect(fact?.qualifier).toBe('auth')
      expect(fact?.name).toBe('Fn')
      expect(relations).toContainEqual(
        expect.objectContaining({ type: RelationType.Calls, source: main.id, target: fn.id }),
      )
    })

    it('given an unknown package, when a selector is used, then the import is external and no relation is produced', () => {
      const session = new InMemoryIndexSession()
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "example.com/missing"\nfunc main() { missing.Name() }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map())
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })

      expect(resolved.diagnostics).toContainEqual(
        expect.objectContaining({ specifier: 'example.com/missing', reason: 'package-unknown' }),
      )
      expect(resolved.qualifiedTargets?.size).toBe(0)
      expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
    })

    it('given a namespace without a local binding, when the export resolves, then no step is added', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() { auth.NewUser() }\n',
        'app',
      )
      const stripped: FileAnalysis = {
        ...analysis,
        referenceFacts: {
          ...analysis.referenceFacts!,
          localBindings: [],
        },
      }
      const resolved = resolve(session, stripped, new Map([['github.com/acme/auth', 'auth']]))
      const factory = provider.symbols.find((symbol) => symbol.name === 'NewUser')!

      expect(resolved.qualifiedTargets?.size).toBe(1)
      expect([...resolved.qualifiedTargets!.values()]).toEqual([factory.id])
      expect(resolved.steps).toEqual([])
    })

    it('given a fact without a source symbol, when relations are built, then call, construct, and type are blocked', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nvar current auth.User\nfunc main() {\n  auth.NewUser()\n  _ = auth.User{}\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const bare: FileAnalysis = {
        ...analysis,
        qualifiedReferenceFacts: (analysis.qualifiedReferenceFacts ?? []).map((item) => ({
          ...item,
          sourceSymbolId: undefined,
        })),
      }
      const relations = baseAdapter.buildRelations(bare, { session, resolvedImports: resolved })

      expect(resolved.qualifiedTargets?.size).toBe(3)
      expect(
        relations.some(
          (relation) =>
            relation.type === RelationType.Calls ||
            relation.type === RelationType.Constructs ||
            relation.type === RelationType.UsesType,
        ),
      ).toBe(false)
    })

    it.each(['ambiguous', 'no-entry-surface', 'not-exported'] as const)(
      'given helper status %s, when a selector is resolved, then there is no relation and no failure',
      (reason) => {
        const session = new InMemoryIndexSession()
        register(session, 'auth:user.go', 'package auth\nfunc NewUser() {}\n', 'auth')
        const analysis = register(
          session,
          'app:main.go',
          'package main\nimport "github.com/acme/auth"\nfunc main() { auth.NewUser() }\n',
          'app',
        )
        const offsets = new Map<string, string>([
          ['auth', ''],
          ['app', ''],
        ])
        session.setAdapterState(GO_MODULE_OFFSETS_KEY, offsets)
        const resolved = baseAdapter.resolveImports(
          analysis,
          createImportResolutionContext({
            session,
            packageEntryFiles: () => ({
              status: 'resolved',
              packageName: 'github.com/acme/auth',
              workspace: 'auth',
              entries: [{ filePath: 'auth:user.go', surface: 'auth:' }],
            }),
            resolvePackageExport: () => ({ status: 'unresolved', reason }),
          }),
        )
        const relations = baseAdapter.buildRelations(analysis, {
          session,
          resolvedImports: resolved,
        })

        expect(resolved.qualifiedTargets?.size).toBe(0)
        expect(resolved.diagnostics).toEqual([])
        expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
      },
    )

    it.each([
      [
        'named result',
        'package main\nimport "github.com/acme/auth"\nfunc f() (auth int) { auth.NewUser() }\n',
        'NewUser',
      ],
      [
        'grouped var',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  var (\n    auth int\n  )\n  auth.NewUser()\n}\n',
        'NewUser',
      ],
      [
        'range clause',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  for _, auth := range xs {\n    auth.NewUser()\n  }\n}\n',
        'NewUser',
      ],
      [
        'if initializer',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  if auth := 1; true {\n    auth.NewUser()\n  }\n}\n',
        'NewUser',
      ],
      [
        'type switch',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  switch auth := v.(type) {\n  default:\n    auth.NewUser()\n  }\n}\n',
        'NewUser',
      ],
      [
        'local type',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  type auth int\n  var current auth.User\n}\n',
        'User',
      ],
    ])(
      'given a qualifier shadowed by a %s, when facts are extracted, then no qualified fact is emitted',
      (_label, code, name) => {
        const session = new InMemoryIndexSession()
        register(
          session,
          'auth:user.go',
          'package auth\ntype User struct{}\nfunc NewUser() {}\n',
          'auth',
        )
        const analysis = register(session, 'app:main.go', code, 'app')

        expect(analysis.qualifiedReferenceFacts?.some((item) => item.name === name)).toBe(false)
      },
    )

    it('given a use before a short declaration, when facts are extracted, then the package still resolves', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  _ = auth.User{}\n  auth := 1\n  _ = auth\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))

      expect(analysis.qualifiedReferenceFacts?.some((item) => item.kind === 'construct')).toBe(true)
      expect(resolved.qualifiedTargets?.size).toBe(1)
    })

    it('given a parameter with the package name, when the signature uses that package, then the signature type still resolves', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc f(auth int) auth.User {\n  return auth.User{}\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const signature = analysis.qualifiedReferenceFacts?.filter((item) => item.kind === 'type')
      const body = analysis.qualifiedReferenceFacts?.filter((item) => item.kind === 'construct')

      expect(signature).toHaveLength(1)
      expect(body).toHaveLength(0)
      expect(resolved.qualifiedTargets?.size).toBe(1)
    })

    it('given a declared package name, when the export resolves, then the step is anchored on the import binding', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/go-auth"\nfunc main() { _ = auth.User{} }\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/go-auth', 'auth']]))
      const anchor = analysis.referenceFacts?.localBindings.find(
        (item) => item.localName === 'go-auth',
      )

      expect(anchor).toBeDefined()
      expect(resolved.steps).toContainEqual(
        expect.objectContaining({ fromId: anchor?.id, kind: 'import:package' }),
      )
    })

    it('given a /v2 import, when the export resolves, then the step is anchored on the v2 binding', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:user.go', 'package auth\ntype User struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth/v2"\nvar current auth.User\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth/v2', 'auth']]))
      const anchor = analysis.referenceFacts?.localBindings.find((item) => item.localName === 'v2')

      expect(anchor).toBeDefined()
      expect(resolved.steps).toContainEqual(
        expect.objectContaining({ fromId: anchor?.id, kind: 'import:package' }),
      )
    })

    it('given two imports that choose the same namespace, when a selector uses it, then neither binds', () => {
      const session = new InMemoryIndexSession()
      register(session, 'a:user.go', 'package auth\ntype User struct{}\n', 'a')
      register(session, 'b:user.go', 'package auth\ntype User struct{}\n', 'b')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport (\n  "github.com/acme/auth"\n  "github.com/acme/go-auth"\n)\nfunc main() { _ = auth.User{} }\n',
        'app',
      )
      const resolved = resolve(
        session,
        analysis,
        new Map([
          ['github.com/acme/auth', 'a'],
          ['github.com/acme/go-auth', 'b'],
        ]),
      )

      expect(resolved.qualifiedTargets?.size).toBe(0)
      expect(resolved.steps.filter((step) => step.kind === 'import:package')).toEqual([])
    })

    it('given an instantiated composite literal, when facts are extracted, then a construct fact names the selector', () => {
      const session = new InMemoryIndexSession()
      register(session, 'auth:box.go', 'package auth\ntype Box struct{}\n', 'auth')
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() { _ = auth.Box[int]{} }\n',
        'app',
      )

      const fact = analysis.qualifiedReferenceFacts?.find((item) => item.kind === 'construct')
      expect(fact?.qualifier).toBe('auth')
      expect(fact?.name).toBe('Box')
      expect(
        analysis.qualifiedReferenceFacts?.some(
          (item) => item.kind === 'type' && item.name === 'Box',
        ),
      ).toBe(false)
    })

    it('given call, construct, and type facts, when they are resolved, then each kind requests its own space', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'auth:user.go',
        'package auth\ntype User struct{}\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nvar current auth.User\nfunc main() {\n  auth.NewUser()\n  _ = auth.User{}\n}\n',
        'app',
      )
      const seen: string[][] = []
      const context = createImportResolutionContext(
        { session, packageToWorkspace: new Map([['github.com/acme/auth', 'auth']]) },
        baseAdapter,
      )
      session.setAdapterState(
        GO_MODULE_OFFSETS_KEY,
        new Map([
          ['auth', ''],
          ['app', ''],
        ]),
      )
      baseAdapter.resolveImports(analysis, {
        ...context,
        resolvePackageExport: (request) => {
          seen.push([...request.spaces])
          return context.resolvePackageExport(request)
        },
      })

      expect(seen).toContainEqual([SymbolSpace.Value])
      expect(seen).toContainEqual([SymbolSpace.Type])
      expect(
        seen.filter((spaces) => spaces.length === 1 && spaces[0] === SymbolSpace.Value),
      ).toHaveLength(1)
      expect(seen.filter((spaces) => spaces[0] === SymbolSpace.Type).length).toBeGreaterThan(0)
      expect(seen.every((spaces) => spaces[0] !== SymbolSpace.Value || spaces.length === 1)).toBe(
        true,
      )
    })

    it('given the same qualified call twice, when relations are built, then one CALLS relation is emitted', () => {
      const session = new InMemoryIndexSession()
      const provider = register(
        session,
        'auth:user.go',
        'package auth\nfunc NewUser() {}\n',
        'auth',
      )
      const analysis = register(
        session,
        'app:main.go',
        'package main\nimport "github.com/acme/auth"\nfunc main() {\n  auth.NewUser()\n  auth.NewUser()\n}\n',
        'app',
      )
      const resolved = resolve(session, analysis, new Map([['github.com/acme/auth', 'auth']]))
      const relations = baseAdapter.buildRelations(analysis, { session, resolvedImports: resolved })
      const factory = provider.symbols.find((symbol) => symbol.name === 'NewUser')!
      const calls = relations.filter(
        (relation) => relation.type === RelationType.Calls && relation.target === factory.id,
      )

      expect(analysis.qualifiedReferenceFacts?.filter((item) => item.kind === 'call')).toHaveLength(
        2,
      )
      expect(calls).toHaveLength(1)
    })
  })
})
