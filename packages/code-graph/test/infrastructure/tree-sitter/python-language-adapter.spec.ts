import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  PythonLanguageAdapter,
  normalizePythonDistName,
  readPythonProjectName,
} from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
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
import {
  MemberKind,
  MemberDispatch,
  parseLogicalSymbol,
} from '../../../src/domain/value-objects/symbol-reference.js'
import {
  setStructuralWorkObserverForTesting,
  type StructuralWorkObserver,
  type StructuralWorkKind,
} from '../../../src/infrastructure/tree-sitter/reference-fact-helpers.js'
import {
  type PackageResolutionFacet,
  type RelativeImportResolutionFacet,
  type SymbolReferenceSyntaxFacet,
} from '../../../src/domain/value-objects/language-adapter-facets.js'
import { createImportResolutionContext } from '../../helpers/import-resolution-context.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  resolutionManifests(): readonly string[]
  readonly packageResolution: PackageResolutionFacet
  readonly relativeImportResolution: RelativeImportResolutionFacet
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
  const resolvedImports = { importMap, fileImports: [], steps: [], diagnostics: [] }
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
          steps: [],
          diagnostics: [],
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
      const result = adapter.packageResolution.matchSpecifier(
        'acme_auth.models',
        ['acme-auth'],
        new InMemoryIndexSession(),
      )
      expect(result).toBe('acme-auth')
    })

    it('matches exact top-level module', () => {
      const result = adapter.packageResolution.matchSpecifier(
        'requests',
        ['requests'],
        new InMemoryIndexSession(),
      )
      expect(result).toBe('requests')
    })

    it('returns undefined for unknown module', () => {
      const result = adapter.packageResolution.matchSpecifier(
        'numpy',
        ['pandas'],
        new InMemoryIndexSession(),
      )
      expect(result).toBeUndefined()
    })
  })

  describe('resolveRelativeImportPath', () => {
    it('returns candidates for dot-prefixed relative import', () => {
      const result = adapter.relativeImportResolution.resolve('core:src/models/user.py', '.base')
      expect(result).toEqual([
        'core:src/models/base.py',
        'core:src/models/base/__init__.py',
        'core:src/models/base.pyi',
        'core:src/models/base/__init__.pyi',
      ])
    })

    it('returns candidates for parent import with double dot', () => {
      const result = adapter.relativeImportResolution.resolve('core:src/models/user.py', '..utils')
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
      expect(adapter.packageResolution.identity(tempDir)).toBe('acme-auth')
    })

    it('returns undefined when no pyproject.toml', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      expect(adapter.packageResolution.identity(tempDir)).toBeUndefined()
    })

    it('given poetry name before project name, when identity is read, then project name wins', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(
        join(tempDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "poetry-name"\n\n[project]\nname = "project-name"\n',
      )
      expect(adapter.packageResolution.identity(tempDir)).toBe('project-name')
    })

    it('given a single-quoted project name, when identity is read, then that name is returned', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), "[project]\nname = 'quoted-name'\n")
      expect(adapter.packageResolution.identity(tempDir)).toBe('quoted-name')
    })

    it('given a nearer file without project name, when a parent has one, then the parent name is returned', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "project-name"\n')
      const nested = join(tempDir, 'pkg')
      mkdirSync(nested)
      writeFileSync(join(nested, 'pyproject.toml'), '[tool.poetry]\nname = "poetry-name"\n')
      expect(adapter.packageResolution.identity(nested, tempDir)).toBe('project-name')
    })
    it('given a poetry-only manifest and no parent project name, when identity is read, then the result is undefined', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[tool.poetry]\nname = "poetry-name"\n')
      expect(adapter.packageResolution.identity(tempDir, tempDir)).toBeUndefined()
    })

    it('walks up to find pyproject.toml above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "acme-auth"\n')
      const subDir = join(tempDir, 'src')
      mkdirSync(subDir)
      expect(adapter.packageResolution.identity(subDir, tempDir)).toBe('acme-auth')
    })
  })
})
describe('PythonLanguageAdapter drive-letter paths', () => {
  it('keeps a drive letter in the resolved import path', () => {
    const resolved = baseAdapter.relativeImportResolution.resolve('C:/repo/src/a.py', '.b')
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
    const resolvedImports = baseAdapter.resolveImports(
      analysis!,
      createImportResolutionContext(
        {
          session,
          qualifiedNames: new Map(),
          packageToWorkspace: new Map(),
        },
        baseAdapter,
      ),
    )
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
        resolvedImports: {
          importMap: importMap(session),
          fileImports: [],
          steps: [],
          diagnostics: [],
        },
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

  describe('Python package resolution hardening', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true })
    })

    describe('normalizePythonDistName', () => {
      it('lowercases letters and collapses runs of separators to a single hyphen', () => {
        expect(normalizePythonDistName('Acme.Auth')).toBe('acme-auth')
        expect(normalizePythonDistName('foo..__--bar')).toBe('foo-bar')
        expect(normalizePythonDistName('Simple_Name')).toBe('simple-name')
      })
    })

    it('Scenario: PEP 503 distribution name normalization', () => {
      const session = new InMemoryIndexSession()
      // Scenario: Dots and case normalize
      expect(
        baseAdapter.packageResolution.matchSpecifier('acme_auth.models', ['Acme.Auth'], session),
      ).toBe('Acme.Auth')

      // Scenario: Equal normalized names stay unresolved
      expect(
        baseAdapter.packageResolution.matchSpecifier(
          'acme_auth.models',
          ['acme-auth', 'acme_auth'],
          session,
        ),
      ).toBeUndefined()
    })

    it('Scenario: Submodule without __init__.py resolves when unambiguous', () => {
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'auth:acme_auth/models.py',
        projectRelativePath: 'acme_auth/models.py',
        language: 'python',
        contentHash: 'hash',
        workspace: 'auth',
      })
      session.registerFile({
        filePath: 'app:main.py',
        projectRelativePath: 'main.py',
        language: 'python',
        contentHash: 'hash',
        workspace: 'app',
      })
      const draft = baseAdapter.analyzeFile(
        'app:main.py',
        'from acme_auth import models\nx = models\n',
        { session, workspaceName: 'app' },
      )
      const analysis: FileAnalysis = {
        fileId: 2,
        filePath: 'app:main.py',
        projectRelativePath: 'main.py',
        contentHash: 'hash',
        workspace: 'app',
        language: 'python',
        symbols: draft.symbols,
        imports: draft.imports,
        bindingFacts: draft.bindingFacts,
        callFacts: draft.callFacts,
      }

      const resolved = baseAdapter.resolveImports(
        analysis,
        createImportResolutionContext(
          {
            session,
            packageToWorkspace: new Map([['acme_auth', 'auth']]),
          },
          baseAdapter,
        ),
      )

      expect(resolved.fileImports).toEqual(['auth:acme_auth/models.py'])
      expect(resolved.importMap.size).toBe(0)
      expect(resolved.diagnostics).toEqual([])
    })

    it('Scenario: Multiple submodules with equal name are ambiguous', () => {
      const session = new InMemoryIndexSession()
      // Submodule indexed under codeRoot and under src/
      session.registerFile({
        filePath: 'auth:acme_auth/models.py',
        projectRelativePath: 'acme_auth/models.py',
        language: 'python',
        contentHash: 'hash',
        workspace: 'auth',
      })
      session.registerFile({
        filePath: 'auth:src/acme_auth/models.py',
        projectRelativePath: 'src/acme_auth/models.py',
        language: 'python',
        contentHash: 'hash',
        workspace: 'auth',
      })
      session.registerFile({
        filePath: 'app:main.py',
        projectRelativePath: 'main.py',
        language: 'python',
        contentHash: 'hash',
        workspace: 'app',
      })
      const draft = baseAdapter.analyzeFile(
        'app:main.py',
        'from acme_auth import models\nx = models\n',
        { session, workspaceName: 'app' },
      )
      const analysis: FileAnalysis = {
        fileId: 3,
        filePath: 'app:main.py',
        projectRelativePath: 'main.py',
        contentHash: 'hash',
        workspace: 'app',
        language: 'python',
        symbols: draft.symbols,
        imports: draft.imports,
        bindingFacts: draft.bindingFacts,
        callFacts: draft.callFacts,
      }

      const resolved = baseAdapter.resolveImports(
        analysis,
        createImportResolutionContext(
          {
            session,
            packageToWorkspace: new Map([['acme_auth', 'auth']]),
          },
          baseAdapter,
        ),
      )

      expect(resolved.fileImports).toEqual([])
      expect(resolved.diagnostics).toEqual([
        expect.objectContaining({
          filePath: 'app:main.py',
          specifier: 'acme_auth',
          exportedName: 'models',
          reason: 'ambiguous',
        }),
      ])
    })

    it('Scenario: Package manifest located once in prepare and pyproject.toml without project name is skipped', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-prep-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "parent-pkg"\n')
      const subDir = join(tempDir, 'sub')
      mkdirSync(subDir, { recursive: true })
      writeFileSync(join(subDir, 'pyproject.toml'), '[tool.poetry]\nname = "sub-tool"\n')

      const skippedMessages: string[] = []
      const report = (msg: string) => skippedMessages.push(msg)

      const identity = baseAdapter.packageResolution.identity(subDir, tempDir, report)
      expect(identity).toBe('parent-pkg')
      expect(skippedMessages).toHaveLength(1)
      expect(skippedMessages[0]).toContain('Package manifest skipped (no identity):')
    })
  })
})

describe('Python direct-member semantics and bounds (Task 3.7)', () => {
  it('Scenario: Large class indexes direct definitions once and captures member forms', () => {
    const counts = new Map<StructuralWorkKind, number>()
    const observer: StructuralWorkObserver = {
      record: (k) => counts.set(k, (counts.get(k) ?? 0) + 1),
    }
    const testAdapter = new PythonLanguageAdapter()
    setStructuralWorkObserverForTesting(testAdapter, observer)
    const session = new InMemoryIndexSession()

    const methods = Array.from({ length: 400 }, (_, i) => {
      return `    def method_${i}(self):\n        x = ${i}\n        return x`
    }).join('\n\n')

    const code = `
class LargePythonService:
    class_prop = 123

    def __init__(self):
        self.val = 42

    @staticmethod
    def static_worker():
        return 1

    @classmethod
    def class_worker(cls):
        return 2

    @property
    def my_prop(self):
        return self.val

    @my_prop.setter
    def my_prop(self, v):
        self.val = v

${methods}

    class InnerClass:
        def inner_method(self):
            return 99
`

    const draft = testAdapter.analyzeFile('large_service.py', code, {
      session,
      workspaceName: 'ws',
    })

    const parserState = draft.parserState as unknown as {
      classes: Array<{
        name: string
        memberSymbolIds: readonly string[]
        methodsByName: Record<string, string>
        memberFormsById: Record<string, { kind: string; dispatch?: string; accessor?: string }>
      }>
    }

    const largeCls = parserState.classes.find((c) => c.name === 'LargePythonService')
    expect(largeCls).toBeDefined()
    expect(largeCls?.memberSymbolIds.length).toBe(406)

    // Check semantics of direct members
    const initId = largeCls?.methodsByName['__init__']
    expect(initId).toBeDefined()
    expect(largeCls?.memberFormsById[initId!]).toEqual({ kind: MemberKind.Constructor })

    const staticId = largeCls?.methodsByName['static_worker']
    expect(staticId).toBeDefined()
    expect(largeCls?.memberFormsById[staticId!]).toEqual({
      kind: MemberKind.Method,
      dispatch: MemberDispatch.Static,
    })

    const classId = largeCls?.methodsByName['class_worker']
    expect(classId).toBeDefined()
    expect(largeCls?.memberFormsById[classId!]).toEqual({
      kind: MemberKind.Method,
      dispatch: MemberDispatch.Static,
    })

    // Inner class is isolated and NOT in largeCls methods
    expect(largeCls?.methodsByName['inner_method']).toBeUndefined()
    const innerCls = parserState.classes.find((c) => c.name === 'InnerClass')
    expect(innerCls).toBeDefined()
    expect(innerCls?.methodsByName['inner_method']).toBeDefined()

    // Structural work counts: owner-member-node-visited must be linear in direct members
    const ownerMemberVisits = counts.get('owner-member-node-visited') ?? 0
    expect(ownerMemberVisits).toBeGreaterThanOrEqual(406)
    expect(ownerMemberVisits).toBeLessThan(500)
  })
})

describe('Python lexical-summary reuse and boundaries (Task 3.8)', () => {
  it('Scenario: Calls in one scope share one bound-name summary', () => {
    const counts = new Map<StructuralWorkKind, number>()
    const observer: StructuralWorkObserver = {
      record: (k) => counts.set(k, (counts.get(k) ?? 0) + 1),
    }
    const testAdapter = new PythonLanguageAdapter()
    setStructuralWorkObserverForTesting(testAdapter, observer)
    const session = new InMemoryIndexSession()

    const code = `
def scope_with_many_calls(param1, param2):
    local_var = 10
    aug_binding = 5
    for loop_var in range(5):
        pass
    with open('file') as as_binding:
        pass
    (walrus_target := 42)
    aug_binding += 1

    # Nested definitions with names matching calls: must NOT shadow outer calls
    def nested_func():
        call1 = 99
        inner_local = 1

    class NestedClass:
        call2 = 99

    call1()
    call2()
    call3()
    call4()
    call5()
    call6()
    call7()
    call8()
    call9()
    call10()

    param1()
    local_var()
    aug_binding()
    loop_var()
    as_binding()
    walrus_target()
`

    const draft = testAdapter.analyzeFile('many_calls.py', code, {
      session,
      workspaceName: 'ws',
    })

    const unshadowedNames = draft.callFacts?.map((c) => c.name) ?? []
    for (let i = 1; i <= 10; i++) {
      expect(unshadowedNames).toContain(`call${i}`)
    }
    expect(unshadowedNames).not.toContain('param1')
    expect(unshadowedNames).not.toContain('local_var')
    expect(unshadowedNames).not.toContain('aug_binding')
    expect(unshadowedNames).not.toContain('loop_var')
    expect(unshadowedNames).not.toContain('as_binding')
    expect(unshadowedNames).not.toContain('walrus_target')

    const scopeVisits = counts.get('lexical-scope-node-visited') ?? 0
    expect(scopeVisits).toBe(1)
  })
})

describe('Python complete output parity (Task 3.9)', () => {
  it('Scenario: Indexed and baseline semantics are equivalent across analysis artifacts on .py and .pyi', () => {
    const session = new InMemoryIndexSession()

    const pyCode = `
import os
from typing import Protocol, Optional
from math import sqrt

class Calculator(Protocol):
    def calculate(self, x: int) -> float: ...

class AdvancedCalculator:
    version = "1.0"

    def __init__(self, offset: float = 0.0):
        self.offset = offset

    @staticmethod
    def identity(x: float) -> float:
        return x

    def calculate(self, x: int) -> float:
        val = sqrt(x)
        return val + self.offset
`

    const pyiCode = `
from typing import Protocol

class Formatter(Protocol):
    def format(self, value: str) -> str: ...
`

    const pyDraft = baseAdapter.analyzeFile('calc.py', pyCode, {
      session,
      workspaceName: 'ws',
    })
    const pyiDraft = baseAdapter.analyzeFile('calc.pyi', pyiCode, {
      session,
      workspaceName: 'ws',
    })

    // .py assertions
    expect(pyDraft.symbols.length).toBeGreaterThan(0)
    expect(pyDraft.imports.length).toBe(4)
    expect(pyDraft.bindingFacts?.length).toBeGreaterThan(0)
    expect(pyDraft.callFacts?.length).toBeGreaterThan(0)

    const parserState = pyDraft.parserState as unknown as {
      classes: Array<{
        name: string
        kind: SymbolKind
        methodsByName: Record<string, string>
        memberFormsById: Record<string, { kind: string; dispatch?: string }>
      }>
    }
    const proto = parserState.classes.find((c) => c.name === 'Calculator')
    expect(proto?.kind).toBe(SymbolKind.Interface)
    const adv = parserState.classes.find((c) => c.name === 'AdvancedCalculator')
    expect(adv?.kind).toBe(SymbolKind.Class)
    expect(adv?.methodsByName['__init__']).toBeDefined()
    expect(adv?.methodsByName['identity']).toBeDefined()
    expect(adv?.methodsByName['calculate']).toBeDefined()

    // .pyi assertions
    expect(pyiDraft.symbols.length).toBeGreaterThan(0)
    const pyiParserState = pyiDraft.parserState as unknown as {
      classes: Array<{
        name: string
        kind: SymbolKind
      }>
    }
    const pyiProto = pyiParserState.classes.find((c) => c.name === 'Formatter')
    expect(pyiProto?.kind).toBe(SymbolKind.Interface)
  })

  describe('Parser-owned resource registration', () => {
    it('registers SgRoot into session.parserResources and leaves no keepalive in session state', () => {
      const pyAdapter = new PythonLanguageAdapter()
      const session = new InMemoryIndexSession()
      const draft = pyAdapter.analyzeFile('file.py', 'def test(): pass', {
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

  describe('package re-export routes', () => {
    /**
     * Registers one Python file and its analysis.
     * @param session - Session that receives the file.
     * @param filePath - Workspace-prefixed path.
     * @param code - Source text.
     * @returns The registered analysis.
     */
    function register(session: InMemoryIndexSession, filePath: string, code: string): FileAnalysis {
      session.registerFile({
        filePath,
        projectRelativePath: filePath.slice(filePath.indexOf(':') + 1),
        language: 'python',
        contentHash: 'hash',
        workspace: 'ws',
      })
      return session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, code, { session, workspaceName: 'ws' }),
      })
    }

    /**
     * Runs re-export linking and returns the published names.
     * @param session - Session with entry analyses.
     * @returns Exported names of the new bindings.
     */
    function published(
      session: InMemoryIndexSession,
      packageToWorkspace: ReadonlyMap<string, string> = new Map(),
    ): string[] {
      return baseAdapter.reExportLinking
        .link({ session, packageToWorkspace })
        .publicBindings.map((binding) => `${binding.surface} ${binding.exportedName}`)
    }

    it('given a relative route, when linking runs, then the entry publishes the imported name', () => {
      const session = new InMemoryIndexSession()
      const models = register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User\n')
      const userId = models.referenceFacts?.publicBindings.find(
        (binding) => binding.exportedName === 'User',
      )?.targetId
      const linked = baseAdapter.reExportLinking.link({ session, packageToWorkspace: new Map() })

      expect(published(session)).toContain('ws:src/acme_auth User')
      expect(
        linked.publicBindings.find((binding) => binding.exportedName === 'User')?.targetId,
      ).toBe(userId)
    })

    it('given an absolute import inside the src layout, when linking runs, then it is a route', () => {
      const session = new InMemoryIndexSession()
      const models = register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from acme_auth.models import User\n')
      const userId = models.referenceFacts?.publicBindings.find(
        (binding) => binding.exportedName === 'User',
      )?.targetId
      const linked = baseAdapter.reExportLinking.link({
        session,
        packageToWorkspace: new Map([['acme_auth', 'ws']]),
      })

      expect(published(session, new Map([['acme_auth', 'ws']]))).toContain('ws:src/acme_auth User')
      expect(
        linked.publicBindings.find((binding) => binding.exportedName === 'User')?.targetId,
      ).toBe(userId)
    })

    it('given an absolute import that leaves the package, when linking runs, then it is not a route', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/other/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from other.models import User\n')

      expect(published(session, new Map([['other', 'ws']]))).toEqual([])
    })

    it('given an alias, when linking runs, then the alias is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User as Person\n')

      expect(published(session)).toContain('ws:src/acme_auth Person')
      expect(published(session).some((item) => item.endsWith(' User'))).toBe(false)
    })

    it('given a chain, when linking runs, then the outer entry keeps the final target', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/sub/__init__.py', 'from .models import User\n')
      const source = register(session, 'ws:src/acme_auth/sub/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .sub import User\n')
      const userId = source.referenceFacts?.publicBindings.find(
        (binding) => binding.exportedName === 'User',
      )?.targetId
      const linked = baseAdapter.reExportLinking.link({ session, packageToWorkspace: new Map() })
      const outer = linked.publicBindings.find(
        (binding) => binding.surface === 'ws:src/acme_auth' && binding.exportedName === 'User',
      )
      const inner = linked.publicBindings.find(
        (binding) => binding.surface === 'ws:src/acme_auth/sub' && binding.exportedName === 'User',
      )

      expect(outer?.targetId).toBe(userId)
      expect(inner?.targetId).toBe(userId)
    })

    it('given a cycle, a nested import, a conditional import, a wildcard, and a plain import, when linking runs, then nothing is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/cycle/__init__.py', 'from .other import User\n')
      register(session, 'ws:src/cycle/other.py', 'from . import User\n')
      register(
        session,
        'ws:src/nested/__init__.py',
        'def load():\n    from .models import User\nif True:\n    from .models import User\nfrom .models import *\nimport models\n',
      )
      register(session, 'ws:src/nested/models.py', 'class User:\n    pass\n')

      expect(published(session)).toEqual([])
    })

    it('given a static __all__, when linking runs, then only listed routes are published and declarations stay', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'ws:src/acme_auth/models.py',
        'class User:\n    pass\nclass Admin:\n    pass\n',
      )
      const entry = register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User, Admin\nclass Local:\n    pass\n__all__ = ["User"]\n',
      )
      const linked = baseAdapter.reExportLinking.link({ session, packageToWorkspace: new Map() })

      expect(linked.publicBindings.map((binding) => binding.exportedName)).toEqual(['User'])
      expect(entry.referenceFacts?.publicBindings.map((binding) => binding.exportedName)).toContain(
        'Local',
      )
    })

    it('given concatenation and +=, when __all__ is classified, then both are static', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'ws:src/acme_auth/models.py',
        'class User:\n    pass\nclass Admin:\n    pass\nclass Extra:\n    pass\n',
      )
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User, Admin, Extra\n__all__ = ["User"] + ["Extra"]\n__all__ += ["Admin"]\n',
      )

      expect(published(session).sort()).toEqual([
        'ws:src/acme_auth Admin',
        'ws:src/acme_auth Extra',
        'ws:src/acme_auth User',
      ])
    })

    it('given a dynamic __all__, when linking runs, then no route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User\n__all__.append("User")\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given a listed name with no route, when linking runs, then no binding is created for it', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/__init__.py', '__all__ = ["Missing"]\n')

      expect(published(session)).toEqual([])
    })

    it('given a re-exported name, when a package import resolves, then the step is import:package and a non-route stays unresolved', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User\n')
      const consumer = register(
        session,
        'ws:src/app/main.py',
        'from acme_auth import User\nfrom acme_auth import Hidden\n',
      )
      session.addReferenceFacts(
        baseAdapter.reExportLinking.link({ session, packageToWorkspace: new Map() }),
      )
      const resolved = baseAdapter.resolveImports(
        consumer,
        createImportResolutionContext(
          { session, packageToWorkspace: new Map([['acme-auth', 'ws']]) },
          baseAdapter,
        ),
      )

      expect(resolved.importMap.has('User')).toBe(true)
      expect(resolved.importMap.has('Hidden')).toBe(false)
      expect(resolved.steps.some((step) => step.kind === 'import:package')).toBe(true)
    })

    it('given a sub-package absolute sibling import, when linking runs, then the sibling is a route', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/sub/__init__.py', 'from acme_auth.models import User\n')

      expect(published(session, new Map([['acme_auth', 'ws']]))).toContain(
        'ws:src/acme_auth/sub User',
      )
    })

    it('given a stub entry, when linking runs, then the relative route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.pyi', 'from .models import User\n')

      expect(published(session)).toContain('ws:src/acme_auth User')
    })

    it('given a tuple __all__, when linking runs, then only the listed route is published', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'ws:src/acme_auth/models.py',
        'class User:\n    pass\nclass Admin:\n    pass\n',
      )
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User, Admin\n__all__ = ("User",)\n',
      )

      expect(published(session)).toEqual(['ws:src/acme_auth User'])
    })

    it('given an annotated __all__, when linking runs, then the listed route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User\n__all__: list[str] = ["User"]\n',
      )

      expect(published(session)).toEqual(['ws:src/acme_auth User'])
    })

    it('given a function-nested import, when linking runs, then nothing is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'def load():\n    from .models import User\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given an import inside if TYPE_CHECKING, when linking runs, then nothing is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'if TYPE_CHECKING:\n    from .models import User\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given an import inside try, when linking runs, then nothing is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'try:\n    from .models import User\nexcept Exception:\n    pass\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given from . import name, when linking runs, then nothing is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from . import models\n')

      expect(published(session)).toEqual([])
    })

    it('given a read of __all__, when linking runs, then no route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User\nif "User" in __all__:\n    pass\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given a stub declaration, when the file is analyzed, then the name stays addressable', () => {
      const session = new InMemoryIndexSession()
      const entry = register(session, 'ws:src/acme_auth/__init__.pyi', 'class User:\n    pass\n')

      expect(entry.referenceFacts?.publicBindings.map((binding) => binding.exportedName)).toEqual([
        'User',
      ])
      expect(published(session)).toEqual([])
    })

    it('given declaration conventions, when linking runs, then underscore names stay unpublished', () => {
      const session = new InMemoryIndexSession()
      const entry = register(
        session,
        'ws:src/acme_auth/__init__.py',
        'class Visible:\n    pass\ndef _hidden():\n    pass\n',
      )

      expect(entry.referenceFacts?.publicBindings.map((binding) => binding.exportedName)).toEqual([
        'Visible',
      ])
      expect(published(session)).toEqual([])
    })

    it('given two entry files that import each other, when linking runs, then the cycle publishes nothing', () => {
      const session = new InMemoryIndexSession()
      const left = register(session, 'ws:src/cycle/a/__init__.py', 'from ..b import User\n')
      const right = register(session, 'ws:src/cycle/b/__init__.py', 'from ..a import User\n')

      expect(left.parserState).toMatchObject({
        reExports: [expect.objectContaining({ importedName: 'User', boundName: 'User' })],
      })
      expect(right.parserState).toMatchObject({
        reExports: [expect.objectContaining({ importedName: 'User', boundName: 'User' })],
      })
      expect(published(session)).toEqual([])
    })

    it.each([
      ['extend', 'from .models import User\n__all__.extend(["User"])\n'],
      ['a comprehension', 'from .models import User\n__all__ = [name for name in ("User",)]\n'],
      ['append', 'from .models import User\n__all__.append("User")\n'],
      ['a non-literal element', 'from .models import User\n__all__ = ["User", name]\n'],
    ])(
      'given __all__ built by %s, when linking runs, then no route is published',
      (_label, code) => {
        const session = new InMemoryIndexSession()
        register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
        register(session, 'ws:src/acme_auth/__init__.py', code)

        expect(published(session)).toEqual([])
      },
    )

    it('given an unparenthesized tuple __all__, when linking runs, then only the listed routes are published', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'ws:src/acme_auth/models.py',
        'class User:\n    pass\nclass Admin:\n    pass\n',
      )
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User, Admin\n__all__ = "User",\n',
      )

      expect(published(session)).toEqual(['ws:src/acme_auth User'])
    })

    it('given a bytes literal in __all__, when linking runs, then no route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from .models import User\n__all__ = [b"User"]\n',
      )

      expect(published(session)).toEqual([])
    })

    it('given a plain import beside a from-import of the submodule, when the consumer resolves, then the submodule file is a dependency and no symbol route is published', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'import acme_auth.models\n')
      const consumer = register(session, 'ws:src/app/main.py', 'from acme_auth import models\n')
      session.addReferenceFacts(
        baseAdapter.reExportLinking.link({
          session,
          packageToWorkspace: new Map([['acme_auth', 'ws']]),
        }),
      )
      const resolved = baseAdapter.resolveImports(
        consumer,
        createImportResolutionContext(
          { session, packageToWorkspace: new Map([['acme_auth', 'ws']]) },
          baseAdapter,
        ),
      )

      expect(published(session)).toEqual([])
      expect(resolved.importMap.has('models')).toBe(false)
      expect(resolved.fileImports).toContain('ws:src/acme_auth/models.py')
    })

    it('given an import alias that is not a route, when the file is analyzed, then the alias stays a local binding', () => {
      const session = new InMemoryIndexSession()
      const entry = register(
        session,
        'ws:src/acme_auth/__init__.py',
        'from other.models import User as Person\nclass Visible:\n    pass\n',
      )

      expect(entry.referenceFacts?.publicBindings.map((binding) => binding.exportedName)).toEqual([
        'Visible',
      ])
      expect(
        entry.referenceFacts?.localBindings.find((binding) => binding.localName === 'Person')
          ?.targetId,
      ).toBeUndefined()
      expect(published(session, new Map([['other', 'ws']]))).toEqual([])
    })

    it('given a stub entry and an absolute route, when linking runs, then the route is published', () => {
      const session = new InMemoryIndexSession()
      const models = register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.pyi', 'from acme_auth.models import User\n')
      const userId = models.referenceFacts?.publicBindings.find(
        (binding) => binding.exportedName === 'User',
      )?.targetId
      const linked = baseAdapter.reExportLinking.link({
        session,
        packageToWorkspace: new Map([['acme_auth', 'ws']]),
      })

      expect(linked.publicBindings.map((binding) => binding.exportedName)).toEqual(['User'])
      expect(linked.publicBindings[0]?.targetId).toBe(userId)
    })

    it('given an indexed source twin, when the stub also has routes, then only the source file is linked', () => {
      const session = new InMemoryIndexSession()
      register(
        session,
        'ws:src/acme_auth/models.py',
        'class User:\n    pass\nclass Admin:\n    pass\n',
      )
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User\n')
      register(session, 'ws:src/acme_auth/__init__.pyi', 'from .models import Admin\n')

      expect(published(session)).toEqual(['ws:src/acme_auth User'])
    })

    it('given a module file and a package of the same name, when a route names it, then the route is ambiguous', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/models/__init__.py', 'class Admin:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User\n')

      expect(published(session)).toEqual([])
    })

    it('given a resolved import without a local binding, when imports resolve, then no import:package step is added', () => {
      const session = new InMemoryIndexSession()
      register(session, 'ws:src/acme_auth/models.py', 'class User:\n    pass\n')
      register(session, 'ws:src/acme_auth/__init__.py', 'from .models import User\n')
      const consumer = register(session, 'ws:src/app/main.py', 'from acme_auth import User\n')
      session.addReferenceFacts(
        baseAdapter.reExportLinking.link({ session, packageToWorkspace: new Map() }),
      )
      const stripped: FileAnalysis = {
        ...consumer,
        referenceFacts: { ...consumer.referenceFacts!, localBindings: [] },
      }
      const resolved = baseAdapter.resolveImports(
        stripped,
        createImportResolutionContext(
          { session, packageToWorkspace: new Map([['acme-auth', 'ws']]) },
          baseAdapter,
        ),
      )

      expect(resolved.importMap.has('User')).toBe(true)
      expect(resolved.steps.filter((step) => step.kind === 'import:package')).toEqual([])
    })
  })
})
