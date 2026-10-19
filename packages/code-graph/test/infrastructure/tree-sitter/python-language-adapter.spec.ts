import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
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
import { type FileAnalysis } from '../../../src/domain/value-objects/file-analysis.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { parseLogicalSymbol } from '../../../src/domain/value-objects/symbol-reference.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  resolutionManifests(): readonly string[]
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined
  resolveRelativeImportPath(fromFile: string, specifier: string): string | string[]
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

const baseAdapter = new PythonLanguageAdapter()
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
    language: 'python',
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
    language: 'python',
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
    language: 'python',
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
    language: 'python',
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
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }
  session.registerFile({
    filePath,
    projectRelativePath: filePath,
    language: 'python',
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

describe('PythonLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['python'])
  })

  it('emits package identities and preserves import aliases conservatively', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'pkg/__init__.pyi',
      'from .models import User as PublicUser\nclass Service:\n    pass\n',
      { session, workspaceName: 'workspace' },
    ).referenceFacts

    expect(baseAdapter.capabilities()).toMatchObject({
      hierarchy: true,
      buildContext: false,
    })
    expect(facts?.declarations.some((item) => item.logicalId?.includes('Service'))).toBe(true)
    expect(facts?.publicBindings.map((binding) => binding.exportedName)).toEqual(['Service'])
    expect(facts?.localBindings.map((item) => item.localName)).toContain('PublicUser')
  })

  it('publishes module-level names without a leading underscore as public bindings', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'pkg/tools.py',
      'def public():\n    def nested():\n        pass\n\ndef _private():\n    pass\n\nclass Box:\n    def method(self):\n        pass\n',
      { session, workspaceName: 'workspace' },
    ).referenceFacts

    expect(facts?.publicBindings.map((binding) => binding.exportedName).sort()).toEqual([
      'Box',
      'public',
    ])
    expect(facts?.publicBindings.every((binding) => binding.targetId !== undefined)).toBe(true)
  })

  it('owner-qualifies methods and emits ordered base evidence', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:pkg/services.py',
      'class Base:\n    def save(self):\n        pass\n\nclass First(Base):\n    def save(self):\n        pass\n\nclass Second:\n    def save(self):\n        pass\n',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts

    const methods = facts?.declarations
      .map((item) => parseLogicalSymbol(item.logicalId!))
      .filter((item) => item?.name === 'save')
    expect(methods).toHaveLength(3)
    expect(new Set(methods?.map((item) => item?.ownerId)).size).toBe(3)
    expect(facts?.hierarchy).toEqual([expect.objectContaining({ kind: 'extends', precedence: 0 })])
    expect(facts?.steps).toEqual([expect.objectContaining({ kind: 'extends:0' })])
    expect(facts?.publicBindings.some((binding) => binding.exportedName === 'save')).toBe(false)
  })

  it('retains constructor and deterministic decorator member forms', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:pkg/service.py',
      `class Service:
    def __init__(self):
        pass

    @staticmethod
    def create():
        pass

    @property
    def value(self):
        return 1
`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    const forms = facts.declarations
      .map((item) => parseLogicalSymbol(item.logicalId!))
      .filter((item) => item?.ownerId !== undefined)
      .map((item) => [item?.name, item?.memberSemantics])
    expect(forms).toEqual(
      expect.arrayContaining([
        ['__init__', { kind: 'constructor' }],
        ['create', { kind: 'method', dispatch: 'static' }],
        ['value', { kind: 'property', dispatch: 'instance', accessor: 'get' }],
      ]),
    )
  })

  it('uses the declaring class as owner for nested classes and their methods', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:pkg/nested.py',
      `class Outer:
    class Inner:
        def run(self):
            pass
`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!
    const logical = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
      .filter((item) => item !== null)
    const outer = logical.find((item) => item?.name === 'Outer')!
    const inner = logical.find((item) => item?.name === 'Inner')!
    const run = logical.find((item) => item?.name === 'run')!

    expect(inner.ownerId).toBe(outer.id)
    expect(run.ownerId).toBe(inner.id)
  })

  it('preserves declared multiple-base order and protocol evidence', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:pkg/hierarchy.py',
      `class Protocol:
    pass
class Contract(Protocol):
    pass
class Left:
    pass
class Right:
    pass
class Child(Left, Right, Contract):
    pass
`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!
    const child = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
      .find((logical) => logical?.name === 'Child')!
    const childFacts = facts.hierarchy.filter((fact) => fact.childId === child.id)

    expect(childFacts.map((fact) => [fact.kind, fact.precedence])).toEqual([
      ['extends', 0],
      ['extends', 1],
      ['implements', 2],
    ])
  })

  describe('extractSymbols', () => {
    it('extracts function definitions', () => {
      const symbols = adapter.extractSymbols('main.py', 'def greet(name):\n    return name')
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('greet')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts parser-authoritative construct and declared-name ranges', () => {
      const code = `class UserService:
    def execute(self):
        return None`
      const symbol = adapter
        .extractSymbols('main.py', code)
        .find((candidate) => candidate.name === 'UserService')!

      expect(
        sliceRange(code, {
          startLine: symbol.line,
          startColumn: symbol.column,
          endLine: symbol.endLine,
          endColumn: symbol.endColumn,
        }),
      ).toBe(code)
      expect(sliceRange(code, symbol.selectionRange)).toBe('UserService')
      expect(symbol.id).toBe('main.py:class:UserService:1:0')
    })

    it('extracts class definitions', () => {
      const symbols = adapter.extractSymbols('main.py', 'class User:\n    pass')
      expect(
        symbols.some((s: SymbolNode) => s.name === 'User' && s.kind === SymbolKind.Class),
      ).toBe(true)
    })

    it('extracts methods inside classes', () => {
      const code =
        'class User:\n    def login(self):\n        pass\n    def logout(self):\n        pass'
      const symbols = adapter.extractSymbols('main.py', code)
      const methods = symbols.filter((s: SymbolNode) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
      expect(methods.map((m: SymbolNode) => m.name)).toContain('login')
      expect(methods.map((m: SymbolNode) => m.name)).toContain('logout')
    })

    it('extracts module-level assignments as variables', () => {
      const symbols = adapter.extractSymbols('main.py', 'MAX_RETRIES = 3')
      expect(
        symbols.some((s: SymbolNode) => s.name === 'MAX_RETRIES' && s.kind === SymbolKind.Variable),
      ).toBe(true)
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
      const defines = relations.filter((r: Relation) => r.type === RelationType.Defines)
      expect(defines).toHaveLength(symbols.length)
    })

    it('does not create IMPORTS for an unresolved relative import', () => {
      const code = 'from .utils import helper'
      const symbols = adapter.extractSymbols('src/main.py', code)
      const relations = adapter.extractRelations('src/main.py', code, symbols, new Map())
      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })

    it('skips absolute imports', () => {
      const code = 'import os\nfrom pathlib import Path'
      const symbols = adapter.extractSymbols('main.py', code)
      const relations = adapter.extractRelations('main.py', code, symbols, new Map())
      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })

    it('creates EXTENDS and OVERRIDES for local class hierarchies', () => {
      const code = `
class Base:
    def save(self):
        pass

class User(Base):
    def save(self):
        pass
      `
      const symbols = adapter.extractSymbols('main.py', code)
      const relations = adapter.extractRelations('main.py', code, symbols, new Map())

      expect(relations.some((relation: Relation) => relation.type === RelationType.Extends)).toBe(
        true,
      )
      expect(relations.some((relation: Relation) => relation.type === RelationType.Overrides)).toBe(
        true,
      )
    })

    it('creates shared hierarchy evidence for imported bases', () => {
      const session = new InMemoryIndexSession()
      const register = (filePath: string, content: string) => {
        session.registerFile({
          filePath,
          projectRelativePath: filePath,
          language: 'python',
          contentHash: filePath,
          workspace: 'ws',
        })
        return session.registerAnalysis({
          filePath,
          analysis: baseAdapter.analyzeFile(filePath, content, {
            session,
            workspaceName: 'ws',
          }),
        })
      }
      const parent = register('ws:contracts.py', 'class Persistable(Protocol):\n    pass')
      const child = register(
        'ws:main.py',
        'from .contracts import Persistable\nclass User(Persistable):\n    pass',
      )
      const parentSymbol = parent.symbols.find((symbol) => symbol.name === 'Persistable')!
      const childSymbol = child.symbols.find((symbol) => symbol.name === 'User')!
      const relations = baseAdapter.buildRelations(child, {
        session,
        resolvedImports: {
          importMap: new Map([['Persistable', parentSymbol.id]]),
          fileImports: ['ws:contracts.py'],
        },
      })

      const extendsRelation = relations.find(
        (relation: Relation) => relation.type === RelationType.Extends,
      )
      expect(extendsRelation?.target).toBe(parentSymbol.id)
      // `class User(Persistable):` on line 2: the range is the written base expression.
      const baseColumn = 'class User('.length
      const expectedSourceRange = {
        startLine: 2,
        startColumn: baseColumn,
        endLine: 2,
        endColumn: baseColumn + 'Persistable'.length,
      }
      expect(childSymbol.column).toBe(0)
      const expectedImportProvenance = {
        kind: 'import',
        requestedName: 'Persistable',
        resolvedTargetSymbolId: parentSymbol.id,
      }
      expect(extendsRelation?.metadata).toMatchObject({
        sourceRange: expectedSourceRange,
        importProvenance: expectedImportProvenance,
      })
      const hierarchy = session.getHierarchyFacts()
      expect(hierarchy).toHaveLength(1)
      expect(hierarchy[0]).toMatchObject({
        kind: 'extends',
        precedence: 0,
        sourceRange: expectedSourceRange,
        importProvenance: expectedImportProvenance,
      })
      expect(session.getResolutionSteps()).toContainEqual({
        fromId: hierarchy[0]!.childId,
        toId: hierarchy[0]!.parentId,
        kind: 'extends:0',
      })
    })
  })

  describe('shared fact extraction', () => {
    it('parses literal dynamic imports and drops variable dynamic imports', () => {
      const code = `
import importlib
importlib.import_module("pkg.mod")
importlib.import_module(name)
__import__("pkg.other")
`
      const imports = adapter.extractImportedNames('main.py', code)
      expect(
        imports.filter((item: ImportDeclaration) => item.kind === ImportDeclarationKind.Dynamic),
      ).toHaveLength(2)
    })

    it('emits annotation facts and leaves Python call kind for semantic resolution', () => {
      const code = `
from pkg import UserRepo
class Service:
    def __init__(self, repo: UserRepo) -> UserRepo:
        self.repo: UserRepo = repo
        created = UserRepo()
`
      const symbols = adapter.extractSymbols('main.py', code)
      const imports = adapter.extractImportedNames('main.py', code)
      const bindingFacts = adapter.extractBindingFacts('main.py', code, symbols, imports)
      const callFacts = adapter.extractCallFacts('main.py', code, symbols)

      expect(
        bindingFacts.some(
          (fact: BindingFact) =>
            fact.sourceKind === BindingSourceKind.Parameter && fact.targetName === 'UserRepo',
        ),
      ).toBe(true)
      expect(
        callFacts.some((fact: CallFact) => fact.form === CallForm.Free && fact.name === 'UserRepo'),
      ).toBe(true)
    })

    it('emits ImportedType facts from type alias RHS', () => {
      const code = `
from typing import Dict
ParserRegistry = Dict[str, ArtifactParser]
HandlerFn: TypeAlias = Callable[[Event], Result]
`
      const symbols = adapter.extractSymbols('main.py', code)
      const imports = adapter.extractImportedNames('main.py', code)
      const facts = adapter.extractBindingFacts('main.py', code, symbols, imports)

      const registryFacts = facts.filter(
        (f: BindingFact) =>
          f.name === 'ParserRegistry' && f.sourceKind === BindingSourceKind.ImportedType,
      )
      expect(registryFacts.some((f: BindingFact) => f.targetName === 'ArtifactParser')).toBe(true)
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

  describe('extensions', () => {
    it('maps .py and .pyi to python', () => {
      const ext = adapter.extensions()
      expect(ext['.py']).toBe('python')
      expect(ext['.pyi']).toBe('python')
    })
  })

  describe('resolvePackageFromSpecifier', () => {
    it('normalizes hyphens and underscores', () => {
      const result = adapter.resolvePackageFromSpecifier('acme_auth.models', ['acme-auth'])
      expect(result).toBe('acme-auth')
    })

    it('matches exact top-level module', () => {
      const result = adapter.resolvePackageFromSpecifier('requests', ['requests'])
      expect(result).toBe('requests')
    })

    it('returns undefined for unknown module', () => {
      const result = adapter.resolvePackageFromSpecifier('numpy', ['pandas'])
      expect(result).toBeUndefined()
    })
  })

  describe('resolveRelativeImportPath', () => {
    it('returns candidates for dot-prefixed relative import', () => {
      const result = adapter.resolveRelativeImportPath('core:src/models/user.py', '.base')
      expect(result).toEqual([
        'core:src/models/base.py',
        'core:src/models/base/__init__.py',
        'core:src/models/base.pyi',
        'core:src/models/base/__init__.pyi',
      ])
    })

    it('returns candidates for parent import with double dot', () => {
      const result = adapter.resolveRelativeImportPath('core:src/models/user.py', '..utils')
      expect(result).toEqual([
        'core:src/utils.py',
        'core:src/utils/__init__.py',
        'core:src/utils.pyi',
        'core:src/utils/__init__.pyi',
      ])
    })
  })

  describe('resolutionManifests', () => {
    it('given python adapter, when asked for manifests, then returns pyproject.toml only', () => {
      expect(adapter.resolutionManifests()).toEqual(['pyproject.toml'])
      expect(adapter.resolutionManifests()).not.toContain('setup.cfg')
      expect(adapter.resolutionManifests()).not.toContain('setup.py')
    })
  })

  describe('getPackageIdentity', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    })

    it('reads name from pyproject.toml', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "acme-auth"\n')
      expect(adapter.getPackageIdentity(tempDir)).toBe('acme-auth')
    })

    it('returns undefined when no pyproject.toml', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      expect(adapter.getPackageIdentity(tempDir)).toBeUndefined()
    })

    it('given poetry name before project name, when identity is read, then project name wins', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(
        join(tempDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "poetry-name"\n\n[project]\nname = "project-name"\n',
      )
      expect(adapter.getPackageIdentity(tempDir)).toBe('project-name')
    })

    it('given a single-quoted project name, when identity is read, then that name is returned', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), "[project]\nname = 'quoted-name'\n")
      expect(adapter.getPackageIdentity(tempDir)).toBe('quoted-name')
    })

    it('given a nearer file without project name, when a parent has one, then the parent name is returned', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "project-name"\n')
      const nested = join(tempDir, 'pkg')
      mkdirSync(nested)
      writeFileSync(join(nested, 'pyproject.toml'), '[tool.poetry]\nname = "poetry-name"\n')
      expect(adapter.getPackageIdentity(nested, tempDir)).toBe('project-name')
    })
    it('given a poetry-only manifest and no parent project name, when identity is read, then the result is undefined', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[tool.poetry]\nname = "poetry-name"\n')
      expect(adapter.getPackageIdentity(tempDir, tempDir)).toBeUndefined()
    })

    it('walks up to find pyproject.toml above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "acme-auth"\n')
      const subDir = join(tempDir, 'src')
      mkdirSync(subDir)
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('acme-auth')
    })
  })
})
describe('PythonLanguageAdapter drive-letter paths', () => {
  it('keeps a drive letter in the resolved import path', () => {
    const resolved = baseAdapter.resolveRelativeImportPath('C:/repo/src/a.py', '.b')
    expect(String(resolved)).toContain('C:/repo/src')
  })
})

describe('PythonLanguageAdapter dependency detection enhancements', () => {
  it('extracts class attributes, dataclass fields, and Protocol annotations as SymbolKind.Property with class parentId', () => {
    const code = `class User:
    id: int
    name: str = 'default'
    active = True

class Greeter(Protocol):
    greeting: str
`
    const symbols = adapter.extractSymbols('models.py', code)
    const userClass = symbols.find((s) => s.name === 'User' && s.kind === SymbolKind.Class)!
    const greeterClass = symbols.find((s) => s.name === 'Greeter' && s.kind === SymbolKind.Class)!
    expect(userClass).toBeDefined()
    expect(greeterClass).toBeDefined()

    const idProp = symbols.find((s) => s.name === 'id')
    const nameProp = symbols.find((s) => s.name === 'name')
    const activeProp = symbols.find((s) => s.name === 'active')
    const greetingProp = symbols.find((s) => s.name === 'greeting')

    expect(idProp).toBeDefined()
    expect(idProp?.kind).toBe(SymbolKind.Property)
    expect(idProp?.parentId).toBe(userClass.id)

    expect(nameProp).toBeDefined()
    expect(nameProp?.kind).toBe(SymbolKind.Property)
    expect(nameProp?.parentId).toBe(userClass.id)

    expect(activeProp).toBeDefined()
    expect(activeProp?.kind).toBe(SymbolKind.Property)
    expect(activeProp?.parentId).toBe(userClass.id)

    expect(greetingProp).toBeDefined()
    expect(greetingProp?.kind).toBe(SymbolKind.Property)
    expect(greetingProp?.parentId).toBe(greeterClass.id)
  })

  it('extracts decorator invocations as call facts with callerSymbolId bound to decorated routine and emits Calls relation', () => {
    const code = `def my_decorator(fn):
    return fn

@my_decorator
def handle():
    pass
`
    const symbols = adapter.extractSymbols('app.py', code)
    const decoSym = symbols.find(
      (s) => s.name === 'my_decorator' && s.kind === SymbolKind.Function,
    )!
    const handleSym = symbols.find((s) => s.name === 'handle' && s.kind === SymbolKind.Function)!
    expect(decoSym).toBeDefined()
    expect(handleSym).toBeDefined()

    const callFacts = adapter.extractCallFacts('app.py', code, symbols)
    const decoCallFact = callFacts.find((c) => c.name === 'my_decorator')
    expect(decoCallFact).toBeDefined()
    expect(decoCallFact?.callerSymbolId).toBe(handleSym.id)

    const relations = adapter.extractRelations('app.py', code, symbols)
    const callRel = relations.find(
      (r) => r.type === RelationType.Calls && r.source === handleSym.id && r.target === decoSym.id,
    )
    expect(callRel).toBeDefined()
  })

  it('given a call on an unknown receiver, when relations are built, then it does not link to a same-named method by proximity', () => {
    const code = `class Repo:
    def save(self):
        pass

def run(x):
    x.save()
`
    const symbols = adapter.extractSymbols('app.py', code)
    const relations = adapter.extractRelations('app.py', code, symbols)
    expect(relations.filter((r) => r.type === RelationType.Calls)).toHaveLength(0)
  })

  it('given self.method() inside a method, when relations are built, then it links to the method of the enclosing class only', () => {
    const code = `class A:
    def helper(self):
        pass
    def go(self):
        self.helper()

class B:
    def helper(self):
        pass
`
    const symbols = adapter.extractSymbols('app.py', code)
    const goSym = symbols.find((s) => s.name === 'go')!
    const classA = symbols.find((s) => s.name === 'A' && s.kind === SymbolKind.Class)!
    const helperA = symbols.find((s) => s.name === 'helper' && s.parentId === classA.id)!
    const relations = adapter.extractRelations('app.py', code, symbols)
    const calls = relations.filter((r) => r.type === RelationType.Calls)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.source).toBe(goSym.id)
    expect(calls[0]!.target).toBe(helperA.id)
  })

  it('given a bare call whose name is only a method, when relations are built, then it does not link to the method', () => {
    const code = `class A:
    def helper(self):
        pass

def run():
    helper()
`
    const symbols = adapter.extractSymbols('app.py', code)
    const relations = adapter.extractRelations('app.py', code, symbols)
    expect(relations.filter((r) => r.type === RelationType.Calls)).toHaveLength(0)
  })

  it('given multiline decorators and a comment between decorator and def, when facts are built, then member forms still come from the decorator nodes', () => {
    const code = `class Tools:
    @staticmethod
    # keeps the decorator attached
    def build():
        pass

    @decorate(
        option=True,
    )
    @classmethod
    def make(cls):
        pass

    @property
    def size(self):
        return 1

    def plain(self):
        pass
`
    const draft = baseAdapter.analyzeFile('w:tools.py', code, {
      session: new InMemoryIndexSession(),
      workspaceName: 'w',
    })
    const forms = (draft.referenceFacts?.declarations ?? [])
      .map((d) => parseLogicalSymbol(d.logicalId!))
      .filter((logical) => logical?.ownerId !== undefined)
      .map((logical) => `${logical!.name}:${JSON.stringify(logical!.memberSemantics)}`)

    expect(forms).toEqual(
      expect.arrayContaining([
        'build:{"kind":"method","dispatch":"static"}',
        'make:{"kind":"method","dispatch":"static"}',
        'size:{"kind":"property","dispatch":"instance","accessor":"get"}',
        'plain:{"kind":"method","dispatch":"instance"}',
      ]),
    )
  })

  it('given a base written as module.Name, when relations are built, then it is not matched to a local class of the same name', () => {
    const code = `class Foo:
    pass

class Child(other.Foo):
    pass

class Local(Foo):
    pass
`
    const symbols = adapter.extractSymbols('app.py', code)
    const child = symbols.find((s) => s.name === 'Child')!
    const local = symbols.find((s) => s.name === 'Local')!
    const foo = symbols.find((s) => s.name === 'Foo')!
    const relations = adapter.extractRelations('app.py', code, symbols)
    const extendsRelations = relations.filter((r) => r.type === RelationType.Extends)

    expect(extendsRelations.some((r) => r.source === child.id)).toBe(false)
    expect(extendsRelations.some((r) => r.source === local.id && r.target === foo.id)).toBe(true)
  })

  it('emits RelationType.UsesType for dataclass field type annotations', () => {
    const code = `class Role:
    name: str

class User:
    role: Role
`
    const symbols = adapter.extractSymbols('models.py', code)
    const roleClass = symbols.find((s) => s.name === 'Role' && s.kind === SymbolKind.Class)!
    const roleField = symbols.find((s) => s.name === 'role' && s.kind === SymbolKind.Property)!
    expect(roleClass).toBeDefined()
    expect(roleField).toBeDefined()

    const relations = adapter.extractRelations('models.py', code, symbols)
    const usesTypeRel = relations.find(
      (r) =>
        r.type === RelationType.UsesType && r.source === roleField.id && r.target === roleClass.id,
    )
    expect(usesTypeRel).toBeDefined()
  })
})

describe('PythonLanguageAdapter cross-language-symbol-semantics regressions', () => {
  it('declares authoritative Python declaration policy', () => {
    const policy = baseAdapter.declarationPolicy()
    expect(policy.languageIds).toEqual(['python'])
    expect(policy.supportsLogicalDeclarationGroups).toBe(false)
    expect(policy.supportsPhysicalOnlyDeclarations).toBe(true)
    expect(policy.structuralFactsAreParserAuthoritative).toBe(true)
    expect(policy.callableContainerKinds.has(SymbolKind.Function)).toBe(true)
    expect(policy.callableContainerKinds.has(SymbolKind.Method)).toBe(true)
    expect(policy.callableContainerKinds.has(SymbolKind.Class)).toBe(false)
  })

  it('top-level script statements or expression calls have callerSymbolId undefined (Task 12.13)', () => {
    const code = `
x = 10
compute(x)
y = calculate()
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'script.py',
      projectRelativePath: 'script.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('script.py', code, {
      session,
      workspaceName: 'ws',
    })

    expect(draft.callFacts.length).toBeGreaterThanOrEqual(2)
    for (const call of draft.callFacts) {
      expect(call.callerSymbolId).toBeUndefined()
    }
  })

  it('local assignment inside a function does not replace the function caller', () => {
    const code = `
class Service:
    @staticmethod
    def run():
        return 42

def process_data():
    local_val = Service.run()
    return local_val
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'service.py',
      projectRelativePath: 'service.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('service.py', code, {
      session,
      workspaceName: 'ws',
    })

    const processFn = draft.symbols.find(
      (s) => s.name === 'process_data' && s.kind === SymbolKind.Function,
    )!
    expect(processFn).toBeDefined()

    const runCall = draft.callFacts.find((c) => c.name === 'run')!
    expect(runCall).toBeDefined()
    expect(runCall.callerSymbolId).toBe(processFn.id)
  })

  it('class decorator and method call use different containers', () => {
    const code = `
def my_cls_decorator(cls):
    return cls

@my_cls_decorator
class Worker:
    def execute(self):
        do_work()
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'worker.py',
      projectRelativePath: 'worker.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('worker.py', code, {
      session,
      workspaceName: 'ws',
    })

    const workerClass = draft.symbols.find(
      (s) => s.name === 'Worker' && s.kind === SymbolKind.Class,
    )!
    const executeMethod = draft.symbols.find(
      (s) => s.name === 'execute' && s.kind === SymbolKind.Method,
    )!
    expect(workerClass).toBeDefined()
    expect(executeMethod).toBeDefined()

    const decoCall = draft.callFacts.find((c) => c.name === 'my_cls_decorator')!
    expect(decoCall).toBeDefined()
    expect(decoCall.callerSymbolId).toBe(workerClass.id)

    const workCall = draft.callFacts.find((c) => c.name === 'do_work')!
    expect(workCall).toBeDefined()
    expect(workCall.callerSymbolId).toBe(executeMethod.id)
  })

  it('unsupported nested function is not flattened into module identity', () => {
    const code = `
def outer1():
    def work():
        pass

def outer2():
    def work():
        pass
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'nested.py',
      projectRelativePath: 'nested.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('nested.py', code, {
      session,
      workspaceName: 'ws',
    })

    const workSymbols = draft.symbols.filter((s) => s.name === 'work')
    expect(workSymbols).toHaveLength(2)

    const logicalDecls = draft.referenceFacts?.declarations ?? []
    const logicalWork = logicalDecls.filter((d) => d.symbolId.includes(':work:'))
    expect(logicalWork).toHaveLength(0)

    const logicalOuter1 = logicalDecls.find((d) => d.symbolId.includes(':outer1:'))
    const logicalOuter2 = logicalDecls.find((d) => d.symbolId.includes(':outer2:'))
    expect(logicalOuter1).toBeDefined()
    expect(logicalOuter2).toBeDefined()
  })

  it('caller containment resolves to innermost nested function', () => {
    const code = `
def outer():
    def inner():
        nested_call()
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'nested_call.py',
      projectRelativePath: 'nested_call.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('nested_call.py', code, {
      session,
      workspaceName: 'ws',
    })

    const innerSym = draft.symbols.find((s) => s.name === 'inner')!
    expect(innerSym).toBeDefined()

    const call = draft.callFacts.find((c) => c.name === 'nested_call')!
    expect(call).toBeDefined()
    expect(call.callerSymbolId).toBe(innerSym.id)
  })

  it('multiline Python syntax and string/comment isolation', () => {
    const code = `
# importlib.import_module("fake.comment")
# class FakeClass: def fake(): pass
text = """
importlib.import_module("fake.string")
class StringClass:
    def fake(): pass
"""

from typing import (
    Dict,
    List,
)

class MultilineClass(
    BaseA,
    BaseB,
):
    def action(
        self,
        arg1: int,
        arg2: str,
    ) -> bool:
        return True
`
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'multiline.py',
      projectRelativePath: 'multiline.py',
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('multiline.py', code, {
      session,
      workspaceName: 'ws',
    })

    expect(draft.symbols.some((s) => s.name === 'FakeClass')).toBe(false)
    expect(draft.symbols.some((s) => s.name === 'StringClass')).toBe(false)
    expect(draft.imports.some((i) => i.specifier.includes('fake'))).toBe(false)

    const multiClass = draft.symbols.find(
      (s) => s.name === 'MultilineClass' && s.kind === SymbolKind.Class,
    )!
    expect(multiClass).toBeDefined()

    const pyState = draft.parserState as { classes?: { name: string; baseNames: string[] }[] }
    const clsInfo = pyState?.classes?.find((c) => c.name === 'MultilineClass')
    expect(clsInfo?.baseNames).toEqual(['BaseA', 'BaseB'])
  })
})

describe('Python routine-local and module state classification', () => {
  it('keeps locals out and underscore module state physical-only', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:s.py',
      projectRelativePath: 'ws:s.py',
      language: 'python',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile(
      'ws:s.py',
      '_private_state = 1\nPUBLIC = 2\ndef run():\n    local_var = 1\n',
      { session, workspaceName: 'ws' },
    )
    const logical = (draft.referenceFacts?.declarations ?? []).map(
      (declaration) => parseLogicalSymbol(declaration.logicalId ?? '')?.name,
    )

    expect(draft.symbols.some((symbol) => symbol.name === '_private_state')).toBe(true)
    expect(logical.sort()).toEqual(['PUBLIC', 'run'])
    expect(draft.symbols.some((symbol) => symbol.name === 'local_var')).toBe(false)
  })
})

describe('Python nested imports, submodule imports and shadowing', () => {
  const analyze = (
    files: Record<string, string>,
    main: string,
  ): {
    relations: Relation[]
    fileImports: readonly string[]
    imports: readonly ImportDeclaration[]
  } => {
    const session = new InMemoryIndexSession()
    let analysis: FileAnalysis | undefined
    for (const [filePath, content] of Object.entries(files)) {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'python',
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
      packageToWorkspace: new Map(),
    })
    return {
      relations: baseAdapter.buildRelations(analysis!, { session, resolvedImports }),
      fileImports: resolvedImports.fileImports,
      imports: analysis!.imports,
    }
  }

  it('collects imports declared inside functions and conditional blocks', () => {
    const { imports } = analyze(
      {
        'ws:m.py': [
          'import top',
          'def f():',
          '    import os',
          '    from .mod import x',
          'if True:',
          '    import json as j',
        ].join('\n'),
      },
      'ws:m.py',
    )

    expect(imports.map((item) => item.localName).sort()).toEqual(['j', 'os', 'top', 'x'])
  })

  it('resolves a nested relative import to its module dependency', () => {
    const { fileImports } = analyze(
      {
        'ws:pkg/mod.py': 'def x(): pass\n',
        'ws:pkg/m.py': 'def f():\n    from .mod import x\n    return x\n',
      },
      'ws:pkg/m.py',
    )

    expect(fileImports).toEqual(['ws:pkg/mod.py'])
  })

  it('resolves `from . import module` to the submodule file', () => {
    const { fileImports } = analyze(
      {
        'ws:pkg/mod.py': 'def x(): pass\n',
        'ws:pkg/m.py': 'from . import mod\n',
      },
      'ws:pkg/m.py',
    )

    expect(fileImports).toEqual(['ws:pkg/mod.py'])
  })

  it('records nothing for `from . import module` when the submodule is not indexed', () => {
    const { fileImports } = analyze({ 'ws:pkg/m.py': 'from . import ghost\n' }, 'ws:pkg/m.py')

    expect(fileImports).toEqual([])
  })

  it('emits no CALLS when a parameter or local binds the called name', () => {
    const { relations } = analyze(
      {
        'ws:lib.py': 'def helper(): pass\n',
        'ws:m.py': [
          'from .lib import helper',
          'def via_param(helper):',
          '    helper()',
          'def via_local():',
          '    helper = lambda: 1',
          '    helper()',
          'def via_loop(items):',
          '    for helper in items:',
          '        helper()',
        ].join('\n'),
      },
      'ws:m.py',
    )

    expect(relations.filter((relation) => relation.type === RelationType.Calls)).toEqual([])
  })

  it('still emits CALLS for the imported name when nothing shadows it', () => {
    const { relations } = analyze(
      {
        'ws:lib.py': 'def helper(): pass\n',
        'ws:m.py': 'from .lib import helper\ndef run():\n    helper()\n',
      },
      'ws:m.py',
    )

    expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(1)
  })
})

describe('Python imported base expression ranges', () => {
  const hierarchyRanges = (
    lang: string,
    files: Record<string, string>,
    main: string,
    importMap: (session: InMemoryIndexSession) => ReadonlyMap<string, string>,
  ): Array<{ type: string; target: string; range: unknown }> => {
    const session = new InMemoryIndexSession()
    let analysis: ReturnType<InMemoryIndexSession['registerAnalysis']> | undefined
    for (const [filePath, content] of Object.entries(files)) {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: lang,
        contentHash: 'x',
        workspace: 'ws',
      })
      const registered = session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' }),
      })
      if (filePath === main) analysis = registered
    }
    return baseAdapter
      .buildRelations(analysis!, {
        session,
        resolvedImports: { importMap: importMap(session), fileImports: [] },
      })
      .filter((relation) => relation.metadata?.['importProvenance'] !== undefined)
      .map((relation) => ({
        type: relation.type,
        target: relation.target,
        range: relation.metadata?.['sourceRange'],
      }))
  }
  const idOf = (session: InMemoryIndexSession, file: string, name: string): string =>
    session.findSymbolsByFile(file).find((symbol) => symbol.name === name)!.id
  const at = (line: number, text: string, needle: string) => {
    const column = text.indexOf(needle)
    return {
      startLine: line,
      startColumn: column,
      endLine: line,
      endColumn: column + needle.length,
    }
  }

  it('records a distinct range for each written base', () => {
    const line = 'class C(A, B):'
    const edges = hierarchyRanges(
      'python',
      {
        'ws:a.py': 'class A:\n    pass\n',
        'ws:b.py': 'class B:\n    pass\n',
        'ws:c.py': `from .a import A\nfrom .b import B\n${line}\n    pass\n`,
      },
      'ws:c.py',
      (session) =>
        new Map([
          ['A', idOf(session, 'ws:a.py', 'A')],
          ['B', idOf(session, 'ws:b.py', 'B')],
        ]),
    )

    expect(edges.map((edge) => edge.range)).toEqual([at(3, line, 'A'), at(3, line, 'B')])
  })
})
