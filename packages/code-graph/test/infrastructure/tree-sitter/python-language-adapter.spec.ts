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
import { type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
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

adapter.extractSymbols = (filePath: string, content: string): SymbolNode[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    configRelativePath: filePath,
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
    configRelativePath: filePath,
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
    configRelativePath: filePath,
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
    configRelativePath: filePath,
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
      configRelativePath: fp,
      language: 'python',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }
  session.registerFile({
    filePath,
    configRelativePath: filePath,
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

  describe('extractSymbols', () => {
    it('extracts function definitions', () => {
      const symbols = adapter.extractSymbols('main.py', 'def greet(name):\n    return name')
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('greet')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
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

    it('creates IMPORTS for relative imports', () => {
      const code = 'from .utils import helper'
      const symbols = adapter.extractSymbols('src/main.py', code)
      const relations = adapter.extractRelations('src/main.py', code, symbols, new Map())
      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(1)
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

    it('creates IMPLEMENTS for imported protocol-like bases', () => {
      const code = `
class User(Persistable):
    def save(self):
        pass
      `
      const symbols = adapter.extractSymbols('main.py', code)
      const relations = adapter.extractRelations(
        'main.py',
        code,
        symbols,
        new Map([['Persistable', 'contracts.py:interface:Persistable:1:0']]),
      )

      const implementsRelation = relations.find(
        (relation: Relation) => relation.type === RelationType.Implements,
      )
      expect(implementsRelation?.target).toBe('contracts.py:interface:Persistable:1:0')
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

    it('emits annotation and constructor facts', () => {
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
        callFacts.some(
          (fact: CallFact) => fact.form === CallForm.Constructor && fact.name === 'UserRepo',
        ),
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
      expect(result).toEqual(['core:src/models/base.py', 'core:src/models/base/__init__.py'])
    })

    it('returns candidates for parent import with double dot', () => {
      const result = adapter.resolveRelativeImportPath('core:src/models/user.py', '..utils')
      expect(result).toEqual(['core:src/utils.py', 'core:src/utils/__init__.py'])
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

    it('walks up to find pyproject.toml above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'py-pkg-'))
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]\nname = "acme-auth"\n')
      const subDir = join(tempDir, 'src')
      mkdirSync(subDir)
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('acme-auth')
    })
  })
})
