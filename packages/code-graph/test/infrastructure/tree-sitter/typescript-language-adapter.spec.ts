import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse, Lang } from '@ast-grep/napi'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
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
import { type FileAnalysis } from '../../../src/domain/value-objects/file-analysis.js'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
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

const baseAdapter = new TypeScriptLanguageAdapter()
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
    language: 'typescript',
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
    language: 'typescript',
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
    language: 'typescript',
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
    language: 'typescript',
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
      language: 'typescript',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }
  session.registerFile({
    filePath,
    projectRelativePath: filePath,
    language: 'typescript',
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

describe('TypeScriptLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['typescript', 'tsx', 'javascript', 'jsx'])
  })

  it('emits logical declarations, exports, aliases, and explicit capabilities', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'src/index.ts',
      "import { Source as Alias } from './source.js'\nexport class PublicApi { get value() { return Alias } }",
      { session, workspaceName: 'workspace' },
    ).referenceFacts

    expect(baseAdapter.capabilities()).toMatchObject({
      declarations: true,
      publicBindings: true,
      localBindings: true,
      hierarchy: true,
      buildContext: false,
    })
    expect(facts?.declarations.some((item) => item.logicalId?.includes('PublicApi'))).toBe(true)
    expect(facts?.publicBindings.map((item) => item.exportedName)).toContain('PublicApi')
    expect(facts?.localBindings.map((item) => item.localName)).toContain('Alias')
  })

  it('owner-qualifies methods and emits hierarchy evidence', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:src/services.ts',
      'class Base {\n  save() {}\n}\nclass First extends Base {\n  save() {}\n}\nclass Second {\n  save() {}\n}',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts

    const methods = facts?.declarations
      .map((item) => parseLogicalSymbol(item.logicalId!))
      .filter((item) => item?.name === 'save')
    expect(methods).toHaveLength(3)
    expect(new Set(methods?.map((item) => item?.ownerId)).size).toBe(3)
    expect(facts?.hierarchy).toEqual([expect.objectContaining({ kind: 'extends', precedence: 0 })])
    expect(facts?.steps).toEqual([expect.objectContaining({ kind: 'extends:0' })])
  })

  it('retains static, instance, constructor, and interface-signature member forms', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:src/forms.ts',
      `interface Contract {
  save(): void
}
class Service {
  constructor() {}
  static create() {}
  save() {}
}`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    const forms = facts.declarations
      .map((item) => parseLogicalSymbol(item.logicalId!))
      .filter((item) => item?.ownerId !== undefined)
      .map((item) => [item?.name, item?.memberSemantics])

    expect(forms).toEqual(
      expect.arrayContaining([
        ['save', { kind: 'signature' }],
        ['constructor', { kind: 'constructor' }],
        ['create', { kind: 'method', dispatch: 'static' }],
        ['save', { kind: 'method', dispatch: 'instance' }],
      ]),
    )
  })

  it('owner-qualifies compact same-line class methods by construct range', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:src/compact.ts',
      'class First { save() {} } class Second { save() {} }',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!
    const saves = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId!))
      .filter((logical) => logical?.name === 'save')

    expect(saves).toHaveLength(2)
    expect(new Set(saves.map((logical) => logical?.ownerId)).size).toBe(2)
  })

  it('does not expose a member that shares an exported top-level name', () => {
    const facts = baseAdapter.analyzeFile(
      'workspace:src/exports.ts',
      'export function save() {}\nexport class Service { save() {} }',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    expect(facts.publicBindings.filter((binding) => binding.exportedName === 'save')).toHaveLength(
      1,
    )
  })

  it('keeps a named re-export in parser state until pass 2 can prove its target', () => {
    const session = new InMemoryIndexSession()
    const draft = baseAdapter.analyzeFile(
      'workspace:src/index.ts',
      "export { Service as PublicService } from './service.js'",
      { session, workspaceName: 'workspace' },
    )

    expect(draft.referenceFacts?.publicBindings).toEqual([])
    expect(draft.parserState).toMatchObject({
      reExports: [
        {
          specifier: './service.js',
          importedName: 'Service',
          exportedName: 'PublicService',
        },
      ],
    })
  })

  it('retains export-star syntax for pass-2 expansion without inventing a wildcard binding', () => {
    const session = new InMemoryIndexSession()
    const draft = baseAdapter.analyzeFile(
      'workspace:src/index.ts',
      "export * from './service.js'",
      { session, workspaceName: 'workspace' },
    )

    expect(draft.referenceFacts?.publicBindings).toEqual([])
    expect(draft.parserState).toMatchObject({
      reExports: [
        {
          specifier: './service.js',
          importedName: '*',
          exportedName: '*',
        },
      ],
    })
  })

  it('resolves an import through a named re-export alias', () => {
    const session = new InMemoryIndexSession()
    const files = [
      ['workspace:src/service.ts', 'export class Service {}'],
      ['workspace:src/index.ts', "export { Service as PublicService } from './service.js'"],
      [
        'workspace:src/consumer.ts',
        "import { PublicService } from './index.js'\nnew PublicService()",
      ],
    ] as const
    for (const [filePath, content] of files) {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'typescript',
        contentHash: 'abc',
        workspace: 'workspace',
      })
      session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, content, {
          session,
          workspaceName: 'workspace',
        }),
      })
    }

    const consumer = session.getAnalysis('workspace:src/consumer.ts')!
    const resolved = baseAdapter.resolveImports(consumer, {
      session,
      qualifiedNames: new Map(),
      packageToWorkspace: new Map(),
    })
    expect(resolved.importMap.get('PublicService')).toBe(
      session.findSymbolsByFile('workspace:src/service.ts')[0]?.id,
    )
    expect(consumer.callFacts).toEqual([
      expect.objectContaining({
        targetName: 'PublicService',
        form: CallForm.Constructor,
      }),
    ])
  })

  describe('extractSymbols', () => {
    it('extracts function declarations', () => {
      const code = `function greet(name: string): string { return name }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('greet')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts async function declarations', () => {
      const code = `async function fetchData(): Promise<void> { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.name).toBe('fetchData')
      expect(symbols[0]!.kind).toBe(SymbolKind.Function)
    })

    it('extracts parser-authoritative construct and declared-name ranges', () => {
      const code = `class UserService {
  execute(): void {
    return
  }
}`
      const symbol = adapter
        .extractSymbols('main.ts', code)
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
      expect(symbol.id).toBe('main.ts:class:UserService:1:0')
    })

    it('extracts arrow functions assigned to const', () => {
      const code = `const add = (a: number, b: number) => a + b`
      const symbols = adapter.extractSymbols('main.ts', code)
      const fn = symbols.find((s: SymbolNode) => s.name === 'add')
      expect(fn).toBeDefined()
      expect(fn!.kind).toBe(SymbolKind.Function)
    })

    it('extracts class declarations', () => {
      const code = `class UserService { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'UserService' && s.kind === SymbolKind.Class),
      ).toBe(true)
    })

    it('extracts class with extends', () => {
      const code = `class Admin extends User { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Admin' && s.kind === SymbolKind.Class),
      ).toBe(true)
    })

    it('extracts method definitions', () => {
      const code = `class Foo {
        bar() { }
        baz() { }
      }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const methods = symbols.filter((s: SymbolNode) => s.kind === SymbolKind.Method)
      expect(methods.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts exported variables (non-arrow)', () => {
      const code = `export const MAX_RETRIES = 3`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'MAX_RETRIES' && s.kind === SymbolKind.Variable),
      ).toBe(true)
    })

    it('extracts type aliases', () => {
      const code = `type UserId = string`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'UserId' && s.kind === SymbolKind.Type),
      ).toBe(true)
    })

    it('extracts interface declarations', () => {
      const code = `interface Config { port: number }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Config' && s.kind === SymbolKind.Interface),
      ).toBe(true)
    })

    it('extracts enum declarations', () => {
      const code = `enum Status { Active, Inactive }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Status' && s.kind === SymbolKind.Enum),
      ).toBe(true)
    })

    it('extracts JSDoc comment for function declaration', () => {
      const code = `/** Greets. */\nfunction greet() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.comment).toBe('/** Greets. */')
    })

    it('returns undefined comment when no comment precedes symbol', () => {
      const code = `function greet() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      expect(symbols).toHaveLength(1)
      expect(symbols[0]!.comment).toBeUndefined()
    })

    it('generates deterministic IDs', () => {
      const code = `function greet() { }`
      const s1 = adapter.extractSymbols('main.ts', code)
      const s2 = adapter.extractSymbols('main.ts', code)
      expect(s1[0]!.id).toBe(s2[0]!.id)
    })

    it('extracts member assignment namespace symbol as variable', () => {
      const code = `App.Article = (function(){ return {}; })();`
      const symbols = adapter.extractSymbols('main.ts', code)
      const namespaceSym = symbols.find((s: SymbolNode) => s.name === 'App.Article')
      expect(namespaceSym).toBeDefined()
      expect(namespaceSym!.kind).toBe(SymbolKind.Variable)
    })

    it('extracts member assignment prototype/static method', () => {
      const code = `Article.prototype.generateAltHeadlines = function(config, data) { };
Article.formatTitle = (title) => { };`
      const symbols = adapter.extractSymbols('main.ts', code)
      const methodSym1 = symbols.find(
        (s: SymbolNode) => s.name === 'Article.prototype.generateAltHeadlines',
      )
      const methodSym2 = symbols.find((s: SymbolNode) => s.name === 'Article.formatTitle')
      expect(methodSym1).toBeDefined()
      expect(methodSym1!.kind).toBe(SymbolKind.Method)
      expect(methodSym2).toBeDefined()
      expect(methodSym2!.kind).toBe(SymbolKind.Method)
    })

    it('extracts object literal methods and properties', () => {
      const code = `const Article = {
        generateAltHeadlines: function(config, data) { },
        calculateScore: (data) => { },
        version: '1.0.0'
      };`
      const symbols = adapter.extractSymbols('main.ts', code)
      const methodSym1 = symbols.find((s: SymbolNode) => s.name === 'generateAltHeadlines')
      const methodSym2 = symbols.find((s: SymbolNode) => s.name === 'calculateScore')
      const varSym = symbols.find((s: SymbolNode) => s.name === 'version')
      expect(methodSym1).toBeDefined()
      expect(methodSym1!.kind).toBe(SymbolKind.Method)
      expect(methodSym2).toBeDefined()
      expect(methodSym2!.kind).toBe(SymbolKind.Method)
      expect(varSym).toBeDefined()
      expect(varSym!.kind).toBe(SymbolKind.Variable)
    })

    it('preserves scalar properties in wrapped named object declarations', () => {
      const code = `type Entry = { asserted: string };
const Parenthesized = ({ parenthesized: 'yes' });
const Asserted = <Entry>{ asserted: 'yes' };
const Frozen = { frozen: 'yes' } as const;
const Checked = { checked: 1 } satisfies Record<string, number>;`

      const symbols = adapter.extractSymbols('main.ts', code)

      for (const name of ['parenthesized', 'asserted', 'frozen', 'checked']) {
        expect(
          symbols.find((symbol: SymbolNode) => symbol.name === name && symbol.line > 1)?.kind,
          name,
        ).toBe(SymbolKind.Variable)
      }
    })

    it('omits scalar properties from direct and nested anonymous array records', () => {
      const code = `const rows = [{
        id: 1,
        label: 'a',
        nested: { enabled: true }
      }];`

      const symbols = adapter.extractSymbols('main.ts', code)

      for (const name of ['id', 'label', 'nested', 'enabled']) {
        expect(symbols.some((symbol: SymbolNode) => symbol.name === name)).toBe(false)
      }
    })

    it('treats arrays nested in named objects as data-record boundaries', () => {
      const code = `const config = {
        version: '1',
        rows: [{ id: 1, nested: { enabled: true } }]
      };`

      const symbols = adapter.extractSymbols('main.ts', code)

      expect(symbols.find((symbol: SymbolNode) => symbol.name === 'version')?.kind).toBe(
        SymbolKind.Variable,
      )
      for (const name of ['id', 'nested', 'enabled']) {
        expect(symbols.some((symbol: SymbolNode) => symbol.name === name)).toBe(false)
      }
    })

    it('preserves callable members inside anonymous array records', () => {
      const code = `const rows = [{
        scalar: 'omit',
        method() { return 1 },
        arrow: () => 2,
        expression: function () { return 3 },
        generator: function* () { yield 4 }
      }];`

      const symbols = adapter.extractSymbols('main.ts', code)

      expect(symbols.some((symbol: SymbolNode) => symbol.name === 'scalar')).toBe(false)
      for (const name of ['method', 'arrow', 'expression', 'generator']) {
        const symbol = symbols.find((candidate: SymbolNode) => candidate.name === name)
        expect(symbol?.kind).toBe(SymbolKind.Method)
        expect(sliceRange(code, symbol!.selectionRange)).toBe(name)
        expect(
          sliceRange(code, {
            startLine: symbol!.line,
            startColumn: symbol!.column,
            endLine: symbol!.endLine,
            endColumn: symbol!.endColumn,
          }),
        ).toContain(name)
      }
    })

    it('stops array-record classification at callable bodies', () => {
      const code = `const rows = [{
        scalar: 'omit',
        execute: () => {
          const local = { preserved: 'yes' };
          return local;
        }
      }];`

      const symbols = adapter.extractSymbols('main.ts', code)

      expect(symbols.find((symbol: SymbolNode) => symbol.name === 'execute')?.kind).toBe(
        SymbolKind.Method,
      )
      expect(symbols.find((symbol: SymbolNode) => symbol.name === 'preserved')?.kind).toBe(
        SymbolKind.Variable,
      )
      expect(symbols.some((symbol: SymbolNode) => symbol.name === 'scalar')).toBe(false)
    })

    it('keeps filtered analysis deterministic with authoritative ranges', () => {
      const code = `const Named = ({ version: '1' } as const);
const rows = [{ omitted: 1, run: () => true }];`

      const first = adapter.extractSymbols('main.ts', code)
      const second = adapter.extractSymbols('main.ts', code)
      const version = first.find((symbol: SymbolNode) => symbol.name === 'version')!
      const run = first.find((symbol: SymbolNode) => symbol.name === 'run')!

      expect(first).toEqual(second)
      expect(first.some((symbol: SymbolNode) => symbol.name === 'omitted')).toBe(false)
      expect(sliceRange(code, version.selectionRange)).toBe('version')
      expect(sliceRange(code, run.selectionRange)).toBe('run')
      expect(
        sliceRange(code, {
          startLine: version.line,
          startColumn: version.column,
          endLine: version.endLine,
          endColumn: version.endColumn,
        }),
      ).toBe("version: '1'")
      expect(
        sliceRange(code, {
          startLine: run.line,
          startColumn: run.column,
          endLine: run.endLine,
          endColumn: run.endColumn,
        }),
      ).toBe('run: () => true')
    })

    it('keeps symbol cardinality bounded for high-volume array data', () => {
      const records = Array.from(
        { length: 1_000 },
        (_, index) => `{ recordId: ${index}, label: 'row-${index}' }`,
      ).join(',\n')
      const code = `const Named = { kept: 'yes' };
const rows = [${records}, { recordId: 1000, run: () => true }];`

      const symbols = adapter.extractSymbols('main.ts', code)

      expect(symbols.map((symbol: SymbolNode) => [symbol.name, symbol.kind])).toEqual([
        ['kept', SymbolKind.Variable],
        ['run', SymbolKind.Method],
      ])
    })

    it('extracts class arrow fields', () => {
      const code = `class ArticleHandler {
        generateAltHeadlines = (config, data) => { };
        count = 10;
      }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const methodSym = symbols.find((s: SymbolNode) => s.name === 'generateAltHeadlines')
      const varSym = symbols.find((s: SymbolNode) => s.name === 'count')
      expect(methodSym).toBeDefined()
      expect(methodSym!.kind).toBe(SymbolKind.Method)
      expect(varSym).toBeDefined()
      expect(varSym!.kind).toBe(SymbolKind.Property)
    })

    it('extracts HOF initializers as functions', () => {
      const code = `const generateAltHeadlines = memoize(withAuth(function(config) { }));`
      const symbols = adapter.extractSymbols('main.ts', code)
      const funcSym = symbols.find((s: SymbolNode) => s.name === 'generateAltHeadlines')
      expect(funcSym).toBeDefined()
      expect(funcSym!.kind).toBe(SymbolKind.Function)
    })

    it('extracts destructuring patterns', () => {
      const code = `const { generateAltHeadlines, parseArticle } = articleUtils;`
      const symbols = adapter.extractSymbols('main.ts', code)
      const sym1 = symbols.find((s: SymbolNode) => s.name === 'generateAltHeadlines')
      const sym2 = symbols.find((s: SymbolNode) => s.name === 'parseArticle')
      expect(sym1).toBeDefined()
      expect(sym1!.kind).toBe(SymbolKind.Variable)
      expect(sym2).toBeDefined()
      expect(sym2!.kind).toBe(SymbolKind.Variable)
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = `function foo() { }\nfunction bar() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const defines = relations.filter((r: Relation) => r.type === RelationType.Defines)
      expect(defines.length).toBe(symbols.length)
    })

    it('creates EXPORTS relations for exported symbols', () => {
      const code = `export function foo() { }\nfunction bar() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const exports = relations.filter((r: Relation) => r.type === RelationType.Exports)
      expect(exports).toHaveLength(1)
    })

    it('creates EXPORTS relations for CommonJS export assignments', () => {
      const code = `exports.generateAltHeadlines = function(config, data) { };`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const exports = relations.filter((r: Relation) => r.type === RelationType.Exports)
      expect(exports).toHaveLength(1)
    })

    it('does not create an IMPORTS relation for an unresolved relative import', () => {
      const code = `import { foo } from './utils.js'`
      const symbols = adapter.extractSymbols('src/main.ts', code)
      const relations = adapter.extractRelations('src/main.ts', code, symbols, new Map())
      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })

    it('skips non-relative imports', () => {
      const code = `import { describe } from 'vitest'`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(0)
    })

    it('creates EXTENDS, IMPLEMENTS, and OVERRIDES for local declarations', () => {
      const code = `
        interface Persistable {
          save(): void
        }
        class BaseService {
          save(): void {}
        }
        class UserService extends BaseService implements Persistable {
          save(): void {}
        }
      `
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())

      expect(relations.some((r: Relation) => r.type === RelationType.Extends)).toBe(true)
      expect(relations.some((r: Relation) => r.type === RelationType.Implements)).toBe(true)

      const overrides = relations.filter((r: Relation) => r.type === RelationType.Overrides)
      expect(overrides).toHaveLength(2)
    })

    it('creates EXTENDS for imported base classes', () => {
      const session = new InMemoryIndexSession()
      const register = (filePath: string, content: string) => {
        session.registerFile({
          filePath,
          projectRelativePath: filePath,
          language: 'typescript',
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
      const parent = register('ws:src/base.ts', 'export class BaseService {}')
      const child = register(
        'ws:src/main.ts',
        `import { BaseService } from './base.js'; class UserService extends BaseService {}`,
      )
      const parentSymbol = parent.symbols.find((symbol) => symbol.name === 'BaseService')!
      const childSymbol = child.symbols.find((symbol) => symbol.name === 'UserService')!
      const relations = baseAdapter.buildRelations(child, {
        session,
        resolvedImports: {
          importMap: new Map([['BaseService', parentSymbol.id]]),
          fileImports: ['ws:src/base.ts'],
        },
      })

      const extendsRelation = relations.find(
        (relation: Relation) => relation.type === RelationType.Extends,
      )
      expect(extendsRelation?.target).toBe(parentSymbol.id)
      // The evidence points at the written heritage expression, not the whole class.
      const childContent = `import { BaseService } from './base.js'; class UserService extends BaseService {}`
      const clauseStart = childContent.lastIndexOf('BaseService')
      const expectedSourceRange = {
        startLine: 1,
        startColumn: clauseStart,
        endLine: 1,
        endColumn: clauseStart + 'BaseService'.length,
      }
      expect(expectedSourceRange.startColumn).not.toBe(childSymbol.column)
      const expectedImportProvenance = {
        kind: 'import',
        requestedName: 'BaseService',
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

  describe('extractImportedNames', () => {
    it('parses named imports from relative specifier', () => {
      const code = `import { foo, bar } from './utils.js'`
      const imports = adapter.extractImportedNames('src/main.ts', code)
      expect(imports).toHaveLength(2)
      expect(imports[0]!.originalName).toBe('foo')
      expect(imports[0]!.localName).toBe('foo')
      expect(imports[0]!.specifier).toBe('./utils.js')
      expect(imports[0]!.isRelative).toBe(true)
    })

    it('parses aliased imports', () => {
      const code = `import { foo as bar } from './mod.js'`
      const imports = adapter.extractImportedNames('main.ts', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.originalName).toBe('foo')
      expect(imports[0]!.localName).toBe('bar')
    })

    it('marks package imports as non-relative', () => {
      const code = `import { createKernel } from '@specd/core'`
      const imports = adapter.extractImportedNames('main.ts', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.specifier).toBe('@specd/core')
      expect(imports[0]!.isRelative).toBe(false)
    })

    it('parses type imports alongside value imports', () => {
      const code = `import { createUser, type Config } from '@specd/core'`
      const imports = adapter.extractImportedNames('main.ts', code)
      expect(imports).toHaveLength(2)
      expect(imports.map((i: ImportDeclaration) => i.originalName)).toContain('createUser')
      expect(imports.map((i: ImportDeclaration) => i.originalName)).toContain('Config')
    })

    it('parses side-effect imports as file-only declarations', () => {
      const code = `import './side-effect.js'`
      const imports = adapter.extractImportedNames('main.ts', code)
      expect(imports).toHaveLength(1)
      expect(imports[0]!.kind).toBe(ImportDeclarationKind.SideEffect)
      expect(imports[0]!.localName).toBe('')
    })

    it('parses literal dynamic import and require but drops variable forms', () => {
      const code = `
        import('./plugin.js')
        import(pluginName)
        require('./legacy.js')
        require(variableName)
        require.resolve('./not-runtime.js')
      `
      const imports = adapter.extractImportedNames('main.ts', code)
      expect(imports.map((item: ImportDeclaration) => item.kind)).toEqual([
        ImportDeclarationKind.Dynamic,
        ImportDeclarationKind.Require,
      ])
    })
  })

  describe('shared fact extraction', () => {
    it('emits constructor type and construction facts', () => {
      const code = `
        import { TemplateExpander } from './template-expander.js'
        class NodeHookRunner {
          constructor(private expander: TemplateExpander) {}
        }
        function create() {
          return new TemplateExpander(builtins)
        }
      `
      const symbols = adapter.extractSymbols('main.ts', code)
      const imports = adapter.extractImportedNames('main.ts', code)
      const bindingFacts = adapter.extractBindingFacts('main.ts', code, symbols, imports)
      const callFacts = adapter.extractCallFacts('main.ts', code, symbols)

      expect(
        bindingFacts.some(
          (fact: BindingFact) =>
            fact.sourceKind === BindingSourceKind.Parameter &&
            fact.targetName === 'TemplateExpander',
        ),
      ).toBe(true)
      expect(
        callFacts.some(
          (fact: CallFact) =>
            fact.form === CallForm.Constructor && fact.targetName === 'TemplateExpander',
        ),
      ).toBe(true)
    })

    it('emits ImportedType facts from type alias RHS', () => {
      const code = `
        type ParserRegistry = ReadonlyMap<string, ArtifactParser>
        type HandlerFn = (event: Event) => Result
      `
      const symbols = adapter.extractSymbols('main.ts', code)
      const imports = adapter.extractImportedNames('main.ts', code)
      const facts = adapter.extractBindingFacts('main.ts', code, symbols, imports)

      const registryFacts = facts.filter(
        (f: BindingFact) =>
          f.name === 'ParserRegistry' && f.sourceKind === BindingSourceKind.ImportedType,
      )
      expect(registryFacts.some((f: BindingFact) => f.targetName === 'ArtifactParser')).toBe(true)

      const handlerFacts = facts.filter(
        (f: BindingFact) =>
          f.name === 'HandlerFn' && f.sourceKind === BindingSourceKind.ImportedType,
      )
      expect(handlerFacts.some((f: BindingFact) => f.targetName === 'Event')).toBe(true)
      expect(handlerFacts.some((f: BindingFact) => f.targetName === 'Result')).toBe(true)
    })
  })

  describe('CALLS extraction', () => {
    it('creates CALLS relation for local function call', () => {
      const code = `function caller() { callee() }\nfunction callee() { }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.source).toContain('caller')
      expect(calls[0]!.target).toContain('callee')
    })

    it('creates CALLS relation via import map', () => {
      const code = `import { helper } from './utils.js'\nfunction main() { helper() }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const importMap = new Map([['helper', 'utils.ts:function:helper:1']])
      const relations = adapter.extractRelations('main.ts', code, symbols, importMap)
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.target).toBe('utils.ts:function:helper:1')
    })

    it('given a class method named like a called free identifier, when relations are built, then the bare call does not target the method', () => {
      const code = `class Service { helper() {} }\nfunction run() { helper() }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(0)
    })

    it('given a function nested inside the caller, when relations are built, then the free call targets it', () => {
      const code = `function outer() { function inner() {}\n inner() }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.target).toContain('inner')
    })

    it('given a function nested inside another routine, when a different routine calls its name, then the call does not target it', () => {
      const code = `function a() { function hidden() {} }\nfunction b() { hidden() }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(0)
    })

    it('skips unresolvable calls', () => {
      const code = `function main() { console.log('hi') }`
      const symbols = adapter.extractSymbols('main.ts', code)
      const relations = adapter.extractRelations('main.ts', code, symbols, new Map())
      const calls = relations.filter((r: Relation) => r.type === RelationType.Calls)
      expect(calls).toHaveLength(0)
    })
  })

  describe('extensions', () => {
    it('maps .ts, .tsx, .js, .jsx to language IDs', () => {
      const ext = adapter.extensions()
      expect(ext['.ts']).toBe('typescript')
      expect(ext['.tsx']).toBe('tsx')
      expect(ext['.js']).toBe('javascript')
      expect(ext['.jsx']).toBe('jsx')
    })
  })

  describe('resolvePackageFromSpecifier', () => {
    it('resolves scoped package', () => {
      const result = adapter.resolvePackageFromSpecifier('@specd/core', [
        '@specd/core',
        '@specd/cli',
      ])
      expect(result).toBe('@specd/core')
    })

    it('resolves bare package', () => {
      const result = adapter.resolvePackageFromSpecifier('lodash/fp', ['lodash'])
      expect(result).toBe('lodash')
    })

    it('returns undefined for unknown package', () => {
      const result = adapter.resolvePackageFromSpecifier('express', ['@specd/core'])
      expect(result).toBeUndefined()
    })
  })

  describe('resolveRelativeImportPath', () => {
    it('resolves .js to .ts', () => {
      const result = adapter.resolveRelativeImportPath('core:src/commands/create.ts', '../utils.js')
      expect(result).toBe('core:src/utils.ts')
    })

    it('returns candidates for extensionless specifier', () => {
      const result = adapter.resolveRelativeImportPath('core:src/index.ts', './helpers/cli')
      expect(result).toEqual(['core:src/helpers/cli.ts', 'core:src/helpers/cli/index.ts'])
    })

    it('resolves ./ specifier', () => {
      const result = adapter.resolveRelativeImportPath('core:src/index.ts', './utils.js')
      expect(result).toBe('core:src/utils.ts')
    })
  })

  describe('resolutionManifests', () => {
    it('given typescript adapter, when asked for manifests, then returns package.json', () => {
      expect(adapter.resolutionManifests()).toEqual(['package.json'])
    })
  })

  describe('getPackageIdentity', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    })

    it('reads name from package.json', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'ts-pkg-'))
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: '@specd/core' }))
      expect(adapter.getPackageIdentity(tempDir)).toBe('@specd/core')
    })

    it('returns undefined when no package.json', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'ts-pkg-'))
      expect(adapter.getPackageIdentity(tempDir)).toBeUndefined()
    })

    it('walks up to find package.json above codeRoot', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'ts-pkg-'))
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: '@acme/lib' }))
      const subDir = join(tempDir, 'src')
      mkdirSync(subDir)
      expect(adapter.getPackageIdentity(subDir, tempDir)).toBe('@acme/lib')
    })

    it('does not walk above repoRoot boundary', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'ts-pkg-'))
      const repoRoot = join(tempDir, 'repo')
      mkdirSync(repoRoot)
      const innerDir = join(repoRoot, 'packages', 'core')
      mkdirSync(innerDir, { recursive: true })
      // package.json above repoRoot — should NOT be found
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'outside' }))
      expect(adapter.getPackageIdentity(innerDir, repoRoot)).toBeUndefined()
    })
  })
})

describe('TypeScriptLanguageAdapter member references and re-exports', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true })
  })

  function analyzedSession(
    files: readonly { path: string; content: string; workspace: string; codeRoot?: string }[],
  ): InMemoryIndexSession {
    const session = new InMemoryIndexSession()
    for (const file of files) {
      session.registerFile({
        filePath: file.path,
        projectRelativePath: file.path,
        language: 'typescript',
        contentHash: 'hash',
        workspace: file.workspace,
      })
      const draft = baseAdapter.analyzeFile(file.path, file.content, {
        session,
        workspaceName: file.workspace,
        ...(file.codeRoot === undefined ? {} : { codeRoot: file.codeRoot }),
      })
      session.registerAnalysis({ filePath: file.path, analysis: draft })
    }
    return session
  }

  it('parses EditChange.execute as owner then member and ignores dynamic or canonical text', () => {
    expect(baseAdapter.parseSymbolReference('EditChange.execute')).toEqual({
      candidates: [
        {
          segments: [
            { name: 'EditChange', role: 'type' },
            { name: 'execute', role: 'member' },
          ],
        },
      ],
    })
    expect(baseAdapter.parseSymbolReference('obj[name]').candidates).toEqual([])
    expect(baseAdapter.parseSymbolReference('EditChange.execute()').candidates).toEqual([])
    const canonical = baseAdapter.parseSymbolReference(
      'logical|2|4:core|7:src/a.ts|7:execute|5:value|0:|6:method|8:instance|0:|0:',
    )
    expect(canonical.candidates).toEqual([])
    expect(parseLogicalSymbol('EditChange.execute')).toBeUndefined()
    expect(baseAdapter.resolutionManifests()).toEqual(['package.json'])
  })

  it('given conditional package exports and no main, when a re-export names the package, then no entry is selected', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ts-conditional-exports-'))
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@specd/code-graph',
        exports: { '.': { import: './dist/public.js', require: './dist/public.cjs' } },
      }),
    )
    const session = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function runIsolatedGraphIndex(): void {}\n',
      },
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { runIsolatedGraphIndex } from '@specd/code-graph'\n",
      },
    ])

    const linked = baseAdapter.linkReExports(
      session,
      new Map([['@specd/code-graph', 'code-graph']]),
    )

    expect(
      linked.publicBindings.some(
        (item) =>
          item.surface === 'sdk:src/index.ts' && item.exportedName === 'runIsolatedGraphIndex',
      ),
    ).toBe(false)
  })

  it('binds a package root re-export to the published source file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ts-reexport-'))
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@specd/code-graph',
        exports: { '.': './dist/public.js', './internal': './dist/index.js' },
      }),
    )
    const session = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function runIsolatedGraphIndex(): void {}\n',
      },
      {
        path: 'code-graph:src/index.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function internalOnly(): void {}\n',
      },
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { runIsolatedGraphIndex } from '@specd/code-graph'\n",
      },
    ])
    const linked = baseAdapter.linkReExports(
      session,
      new Map([['@specd/code-graph', 'code-graph']]),
    )
    const binding = linked.publicBindings.find(
      (item) =>
        item.surface === 'sdk:src/index.ts' && item.exportedName === 'runIsolatedGraphIndex',
    )
    const published = session
      .getPublicBindings()
      .find(
        (item) =>
          item.surface === 'code-graph:src/public.ts' &&
          item.exportedName === 'runIsolatedGraphIndex',
      )

    expect(binding?.targetId).toBe(published?.targetId)
    expect(binding?.targetId).toMatch(/^logical\|2\|/)
    expect(linked.publicBindings.some((item) => item.surface.includes('@specd/code-graph'))).toBe(
      false,
    )
  })

  it('binds an internal subpath to index.ts', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ts-internal-'))
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: '@specd/code-graph',
        exports: { '.': './dist/public.js', './internal': './dist/index.js' },
      }),
    )
    const session = analyzedSession([
      {
        path: 'code-graph:src/index.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function internalOnly(): void {}\n',
      },
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { internalOnly } from '@specd/code-graph/internal'\n",
      },
    ])
    const linked = baseAdapter.linkReExports(
      session,
      new Map([['@specd/code-graph', 'code-graph']]),
    )
    const published = session
      .getPublicBindings()
      .find(
        (item) =>
          item.surface === 'code-graph:src/index.ts' && item.exportedName === 'internalOnly',
      )

    expect(linked.publicBindings).toEqual([
      expect.objectContaining({
        surface: 'sdk:src/index.ts',
        exportedName: 'internalOnly',
        targetId: published?.targetId,
      }),
    ])
  })

  it('resolves a relative ./public.js re-export without the package map', () => {
    const session = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        content: 'export function run(): void {}\n',
      },
      {
        path: 'code-graph:src/index.ts',
        workspace: 'code-graph',
        content: "export { run } from './public.js'\n",
      },
    ])
    const linked = baseAdapter.linkReExports(session, new Map())
    const published = session
      .getPublicBindings()
      .find((item) => item.surface === 'code-graph:src/public.ts')

    expect(linked.publicBindings).toEqual([
      expect.objectContaining({
        surface: 'code-graph:src/index.ts',
        exportedName: 'run',
        targetId: published?.targetId,
      }),
    ])
  })

  it('emits no binding for two entry candidates, a missing name, or an unknown package', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ts-ambiguous-entry-'))
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: '@specd/code-graph', exports: { '.': './dist/public.js' } }),
    )
    const twoCandidates = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function run(): void {}\n',
      },
      {
        path: 'code-graph:src/public.tsx',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function run(): void {}\n',
      },
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { run } from '@specd/code-graph'\n",
      },
    ])
    expect(
      baseAdapter.linkReExports(twoCandidates, new Map([['@specd/code-graph', 'code-graph']]))
        .publicBindings,
    ).toEqual([])

    const missing = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        codeRoot: tempDir,
        content: 'export function run(): void {}\n',
      },
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { Missing } from '@specd/code-graph'\n",
      },
    ])
    expect(
      baseAdapter.linkReExports(missing, new Map([['@specd/code-graph', 'code-graph']]))
        .publicBindings,
    ).toEqual([])

    const unknown = analyzedSession([
      {
        path: 'sdk:src/index.ts',
        workspace: 'sdk',
        content: "export { run } from '@specd/unknown'\n",
      },
    ])
    expect(baseAdapter.linkReExports(unknown, new Map()).publicBindings).toEqual([])
  })

  it('stores the alias exported name and skips default on a star re-export', () => {
    const session = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        content: 'export function Alpha(): void {}\nexport default function hidden(): void {}\n',
      },
      {
        path: 'sdk:src/alias.ts',
        workspace: 'sdk',
        content: "export { Alpha as Beta } from './ignored.js'\n",
      },
    ])
    const alias = baseAdapter.linkReExports(session, new Map())
    expect(alias.publicBindings).toEqual([])

    const relative = analyzedSession([
      {
        path: 'code-graph:src/public.ts',
        workspace: 'code-graph',
        content: 'export function Alpha(): void {}\nexport default function hidden(): void {}\n',
      },
      {
        path: 'code-graph:src/alias.ts',
        workspace: 'code-graph',
        content: "export { Alpha as Beta } from './public.js'\n",
      },
      {
        path: 'code-graph:src/star.ts',
        workspace: 'code-graph',
        content: "export * from './public.js'\n",
      },
    ])
    const linked = baseAdapter.linkReExports(relative, new Map())
    const alpha = relative
      .getPublicBindings()
      .find((item) => item.surface === 'code-graph:src/public.ts' && item.exportedName === 'Alpha')

    expect(linked.publicBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'code-graph:src/alias.ts',
          exportedName: 'Beta',
          targetId: alpha?.targetId,
        }),
        expect.objectContaining({
          surface: 'code-graph:src/star.ts',
          exportedName: 'Alpha',
          targetId: alpha?.targetId,
        }),
      ]),
    )
    expect(linked.publicBindings.some((item) => item.exportedName === 'default')).toBe(false)
  })

  describe('public bindings follow the exported specifier, not the exported name', () => {
    const targetNameOf = (
      session: InMemoryIndexSession,
      surface: string,
      exportedName: string,
    ): readonly (string | undefined)[] => {
      const logicalById = new Map(session.getLogicalSymbols().map((symbol) => [symbol.id, symbol]))
      return session
        .getPublicBindings()
        .filter((binding) => binding.surface === surface && binding.exportedName === exportedName)
        .map((binding) =>
          binding.targetId === undefined ? undefined : logicalById.get(binding.targetId)?.name,
        )
    }

    it('binds `export { local as alias }` to the local declaration', () => {
      const session = analyzedSession([
        {
          path: 'ws:src/a.ts',
          workspace: 'ws',
          content: 'function local(): void {}\nexport { local as alias }\n',
        },
      ])

      expect(targetNameOf(session, 'ws:src/a.ts', 'alias')).toEqual(['local'])
      expect(targetNameOf(session, 'ws:src/a.ts', 'local')).toEqual([])
    })

    it('binds `export { priv as pub }` to priv even when another local is named pub', () => {
      const session = analyzedSession([
        {
          path: 'ws:src/b.ts',
          workspace: 'ws',
          content: 'function priv(): void {}\nfunction pub(): void {}\nexport { priv as pub }\n',
        },
      ])

      expect(targetNameOf(session, 'ws:src/b.ts', 'pub')).toEqual(['priv'])
    })

    it('binds `export default` forms to the declaration under the name default', () => {
      const named = analyzedSession([
        {
          path: 'ws:src/c.ts',
          workspace: 'ws',
          content: 'export default function hidden(): void {}\n',
        },
      ])
      const identifier = analyzedSession([
        {
          path: 'ws:src/d.ts',
          workspace: 'ws',
          content: 'class Service {}\nexport default Service\n',
        },
      ])

      expect(targetNameOf(named, 'ws:src/c.ts', 'default')).toEqual(['hidden'])
      expect(targetNameOf(named, 'ws:src/c.ts', 'hidden')).toEqual([])
      expect(targetNameOf(identifier, 'ws:src/d.ts', 'default')).toEqual(['Service'])
    })

    it('keeps plain named exports bound under their own name', () => {
      const session = analyzedSession([
        {
          path: 'ws:src/e.ts',
          workspace: 'ws',
          content: 'export function plain(): void {}\nexport const value = 1\n',
        },
      ])

      expect(targetNameOf(session, 'ws:src/e.ts', 'plain')).toEqual(['plain'])
      expect(targetNameOf(session, 'ws:src/e.ts', 'value')).toEqual(['value'])
    })
  })

  describe('ungrouped logical collisions demote only the colliding declarations', () => {
    const analyzeOne = (
      content: string,
    ): { facts: NonNullable<ReturnType<typeof baseAdapter.analyzeFile>['referenceFacts']> } => {
      const session = analyzedSession([{ path: 'ws:src/a.ts', workspace: 'ws', content }])
      const analysis = session.getAnalysis('ws:src/a.ts')!
      return { facts: analysis.referenceFacts! }
    }

    const cases: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      ['an interface merge', 'interface A { m(): void }\ninterface A { n(): void }\n', ['m', 'n']],
      [
        'a class and interface merge',
        'class B { m(): void {} }\ninterface B { n(): void }\n',
        ['m', 'n'],
      ],
      [
        'same-name classes in different namespaces',
        'namespace X { export class C { m(): void {} } }\nnamespace Y { export class C { m(): void {} } }\n',
        [],
      ],
    ]

    it.each(cases)('%s: owners are physical-only and reported', (_label, content) => {
      const { facts } = analyzeOne(content)
      const declaredOwners = facts.declarations
        .map((declaration) => parseLogicalSymbol(declaration.logicalId ?? ''))
        .filter((logical) => logical?.ownerId === undefined)

      expect(declaredOwners).toEqual([])
      expect(facts.diagnostics?.map((diagnostic) => diagnostic.code)).toContain(
        'UNGROUPED_LOGICAL_COLLISION',
      )
    })

    it.each(cases)('%s: surviving members keep a resolvable owner', (_label, content, members) => {
      const session = analyzedSession([{ path: 'ws:src/a.ts', workspace: 'ws', content }])
      const logicals = session.getLogicalSymbols()
      const byId = new Map(logicals.map((logical) => [logical.id, logical]))

      const survivors = logicals.filter((logical) => logical.ownerId !== undefined)
      expect(survivors.map((logical) => logical.name).sort()).toEqual([...members].sort())
      for (const member of survivors) {
        const owner = byId.get(member.ownerId!)
        expect(owner).toBeDefined()
        expect(member.qualifiedName).toContain(owner!.name)
      }
      expect(session.getLogicalDiagnostics().length).toBeGreaterThan(0)
    })
  })

  it('keeps value and type exports of one name as two bindings', () => {
    const session = analyzedSession([
      {
        path: 'code-graph:src/shared.ts',
        workspace: 'code-graph',
        content: 'export interface Shared {}\nexport const Shared = 1\n',
      },
    ])
    const bindings = session.getPublicBindings().filter((item) => item.exportedName === 'Shared')

    expect(bindings.map((item) => item.space).sort()).toEqual(['type', 'value'])
  })
})

describe('TypeScriptLanguageAdapter drive-letter paths', () => {
  it('keeps a drive letter in the resolved import path', () => {
    const resolved = baseAdapter.resolveRelativeImportPath('C:/repo/src/a.ts', './b')
    expect(resolved).toContain('C:/repo/src/b.ts')
  })
})

describe('TypeScriptLanguageAdapter dependency detection enhancements', () => {
  it('extracts interface property signatures, class fields, and enum members as SymbolKind.Property', () => {
    const code = `
interface UserProfile {
  username: string;
  age: number;
}
class Account {
  balance: number = 0;
}
enum Status {
  Active = 'active',
  Inactive = 'inactive',
}
`
    const symbols = adapter.extractSymbols('account.ts', code)
    const username = symbols.find((s) => s.name === 'username')
    const balance = symbols.find((s) => s.name === 'balance')
    const active = symbols.find((s) => s.name === 'Active')

    expect(username?.kind).toBe(SymbolKind.Property)
    expect(balance?.kind).toBe(SymbolKind.Property)
    expect(active?.kind).toBe(SymbolKind.Property)
  })

  it('links all supermethod overload signatures with pairwise overrides', () => {
    const code = `
class Printer {
  print(text: string): void;
  print(num: number): void;
  print(val: any): void {}
}
class ColorPrinter extends Printer {
  print(val: any): void {}
}
`
    const symbols = adapter.extractSymbols('printer.ts', code)
    const relations = adapter.extractRelations('printer.ts', code, symbols)
    const overrideRelations = relations.filter((r) => r.type === RelationType.Overrides)

    // Child.print overrides all 3 Base.print overload signatures/declarations
    expect(overrideRelations.length).toBeGreaterThanOrEqual(2)
  })

  it('extracts dynamic import expressions with string literals', () => {
    const code = `
async function load() {
  const mod = await import('./widget.js');
  return mod;
}
`
    const imports = adapter.extractImportedNames('main.ts', code)
    const dynamic = imports.find((i) => i.specifier === './widget.js')

    expect(dynamic).toBeDefined()
    expect(dynamic?.isRelative).toBe(true)
    expect(dynamic?.kind).toBe(ImportDeclarationKind.Dynamic)
  })

  it('recursively discovers nested and chained call sites', () => {
    const code = `
function run() {
  service.getClient().fetchData().process();
}
`
    const symbols = adapter.extractSymbols('runner.ts', code)
    const calls = adapter.extractCallFacts('runner.ts', code, symbols)
    const names = calls.map((c) => c.name)

    expect(names).toContain('getClient')
    expect(names).toContain('fetchData')
    expect(names).toContain('process')
  })

  describe('Task 12.12 ArchiveChange regression', () => {
    it('does not emit name symbol or binding for anonymous argument key in uc.execute', () => {
      const code = `
it('rejects invalid change', async () => {
  await expect(uc.execute({ name: 'my-change' })).rejects.toThrow();
});
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'test.ts',
        projectRelativePath: 'test.ts',
        language: 'typescript',
        contentHash: '123',
        workspace: 'ws',
      })
      const draft = baseAdapter.analyzeFile('test.ts', code, {
        session,
        workspaceName: 'ws',
      })

      // No 'name' symbol
      expect(draft.symbols.some((s) => s.name === 'name')).toBe(false)
      // No 'name' binding
      expect(draft.bindingFacts.some((b) => b.name === 'name')).toBe(false)
      // Real call target remains present
      const executeCall = draft.callFacts.find((c) => c.name === 'execute')
      expect(executeCall).toBeDefined()
      expect(executeCall?.receiverName).toBe('uc')
      expect(executeCall?.arity).toBe(1)

      // Caller is the physical callback (<anonymous>)
      const anon = draft.symbols.find((s) => s.name === '<anonymous>')
      expect(anon).toBeDefined()
      expect(executeCall?.callerSymbolId).toBe(anon?.id)

      // Named-object control: named object still emits property
      const namedCode = `const config = { name: 'my-change' };`
      const namedDraft = baseAdapter.analyzeFile('named.ts', namedCode, {
        session,
        workspaceName: 'ws',
      })
      expect(namedDraft.symbols.some((s) => s.name === 'name')).toBe(true)
    })
  })

  describe('Task 8.4 TypeScript semantic regressions', () => {
    it('groups method overloads under one logical target with signature and definition occurrences', () => {
      const code = `
export class Service {
  save(text: string): void;
  save(num: number): void;
  save(val: any): void {}
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'service.ts',
        projectRelativePath: 'service.ts',
        language: 'typescript',
        contentHash: '123',
        workspace: 'ws',
      })
      const draft = baseAdapter.analyzeFile('service.ts', code, {
        session,
        workspaceName: 'ws',
      })

      const saveDeclarations = draft.referenceFacts?.declarations.filter(
        (d) => d.symbolId && draft.symbols.find((s) => s.id === d.symbolId)?.name === 'save',
      )
      expect(saveDeclarations).toHaveLength(3)

      // All share the same logical ID!
      const logicalIds = new Set(saveDeclarations?.map((d) => d.logicalId))
      expect(logicalIds.size).toBe(1)

      // Occurrence forms: 2 signatures, 1 definition
      const forms = saveDeclarations?.map((d) => d.occurrenceForm)
      expect(forms).toEqual(['signature', 'signature', 'definition'])
    })

    it('given same-named functions nested in different routines or sibling blocks, when facts are built, then none receives a shared logical target', () => {
      const code = `function a() { function same() {} }
function b() { function same() {} }
function f() { if (x) { function g() {} } else { function g() {} } }
`
      const draft = baseAdapter.analyzeFile('w:src/nested.ts', code, {
        session: new InMemoryIndexSession(),
        workspaceName: 'w',
      })
      const logicalNames = (draft.referenceFacts?.declarations ?? [])
        .map((d) => draft.symbols.find((s) => s.id === d.symbolId)?.name)
        .sort()

      expect(logicalNames).toEqual(['a', 'b', 'f'])
      // Each nested declaration stays navigable as a physical symbol.
      expect(draft.symbols.filter((s) => s.name === 'same')).toHaveLength(2)
      expect(draft.symbols.filter((s) => s.name === 'g')).toHaveLength(2)
    })

    it('given equally named properties in different owners, when facts are built, then each logical id is qualified by its declaring owner', () => {
      const code = `class A { count: number }
class B { count: number }
`
      const draft = baseAdapter.analyzeFile('w:src/props.ts', code, {
        session: new InMemoryIndexSession(),
        workspaceName: 'w',
      })
      const counts = (draft.referenceFacts?.declarations ?? [])
        .map((d) => ({
          name: draft.symbols.find((s) => s.id === d.symbolId)?.name,
          logical: d.logicalId !== undefined ? parseLogicalSymbol(d.logicalId) : undefined,
        }))
        .filter((entry) => entry.name === 'count')

      expect(counts).toHaveLength(2)
      expect(new Set(counts.map((entry) => entry.logical?.id)).size).toBe(2)
      for (const entry of counts) {
        expect(entry.logical?.ownerId).toBeDefined()
        expect(entry.logical?.memberSemantics).toEqual({ kind: 'property', dispatch: 'instance' })
      }
    })

    it('given accessors, static accessors, and methods named get or set, when facts are built, then forms come from parser tokens and not from the member name', () => {
      const code = `class Box {
  get value() { return 1 }
  set value(v: number) {}
  static get shared() { return 2 }
  get() {}
  set(v: number) {}
  static create() {}
}
`
      const draft = baseAdapter.analyzeFile('w:src/box.ts', code, {
        session: new InMemoryIndexSession(),
        workspaceName: 'w',
      })
      const semantics = (draft.referenceFacts?.declarations ?? [])
        .map((d) => parseLogicalSymbol(d.logicalId!))
        .filter((logical) => logical?.ownerId !== undefined)
        .map((logical) => `${logical!.name}:${JSON.stringify(logical!.memberSemantics)}`)

      expect(semantics).toEqual(
        expect.arrayContaining([
          'value:{"kind":"property","dispatch":"instance","accessor":"get"}',
          'value:{"kind":"property","dispatch":"instance","accessor":"set"}',
          'shared:{"kind":"property","dispatch":"static","accessor":"get"}',
          'get:{"kind":"method","dispatch":"instance"}',
          'set:{"kind":"method","dispatch":"instance"}',
          'create:{"kind":"method","dispatch":"static"}',
        ]),
      )
    })

    it('distinguishes block locals from module-level declarations', () => {
      const code = `
export function compute() {
  const localVar = 1;
  return localVar;
}
`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath: 'compute.ts',
        projectRelativePath: 'compute.ts',
        language: 'typescript',
        contentHash: '123',
        workspace: 'ws',
      })
      const draft = baseAdapter.analyzeFile('compute.ts', code, {
        session,
        workspaceName: 'ws',
      })

      // compute is a logical symbol
      const computeLogical = draft.referenceFacts?.declarations.find(
        (d) => draft.symbols.find((s) => s.id === d.symbolId)?.name === 'compute',
      )
      expect(computeLogical).toBeDefined()

      // localVar is not emitted as a logical declaration
      const localLogical = draft.referenceFacts?.declarations.find(
        (d) => draft.symbols.find((s) => s.id === d.symbolId)?.name === 'localVar',
      )
      expect(localLogical).toBeUndefined()
    })
  })

  describe('ArchiveChange production corpus', () => {
    it('retains all 72 execute calls without anonymous name declarations', () => {
      const files = [
        join(
          process.cwd(),
          '..',
          'core',
          'test',
          'application',
          'use-cases',
          'archive-change.spec.ts',
        ),
        join(
          process.cwd(),
          '..',
          'core',
          'test',
          'application',
          'use-cases',
          'archive-change-batch-restore.spec.ts',
        ),
      ]
      let expectedCalls = 0
      let extractedCalls = 0

      for (const [index, absolutePath] of files.entries()) {
        const content = readFileSync(absolutePath, 'utf8')
        const expectedLines = new Set(
          content
            .split('\n')
            .flatMap((line, lineIndex) =>
              /uc\.execute\(\{\s*name:/.test(line) ? [lineIndex + 1] : [],
            ),
        )
        expectedCalls += expectedLines.size

        const filePath = `archive-corpus-${String(index)}.spec.ts`
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath,
          projectRelativePath: filePath,
          language: 'typescript',
          contentHash: 'corpus',
          workspace: 'core',
        })
        const draft = baseAdapter.analyzeFile(filePath, content, {
          session,
          workspaceName: 'core',
        })

        const corpusCalls = draft.callFacts.filter(
          (fact) => fact.name === 'execute' && expectedLines.has(fact.location.line),
        )
        extractedCalls += corpusCalls.length
        expect(
          draft.symbols.filter(
            (symbol) => symbol.name === 'name' && expectedLines.has(symbol.line),
          ),
        ).toEqual([])
        expect(corpusCalls.every((fact) => fact.callerSymbolId !== undefined)).toBe(true)
        expect(
          corpusCalls.every((fact) =>
            draft.symbols.some(
              (symbol) => symbol.id === fact.callerSymbolId && symbol.name === '<anonymous>',
            ),
          ),
        ).toBe(true)
      }

      expect(expectedCalls).toBe(72)
      expect(extractedCalls).toBe(72)
    }, 120000)
  })
})

describe('TypeScript routine-local and module state classification', () => {
  it('emits no logical declaration for locals or non-exported module state', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:src/s.ts',
      projectRelativePath: 'ws:src/s.ts',
      language: 'typescript',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile(
      'ws:src/s.ts',
      'const moduleState = 1\nexport const exposed = 2\nexport function run(): void {\n  const localVar = 1\n  let other = 2\n}\n',
      { session, workspaceName: 'ws' },
    )
    const logical = (draft.referenceFacts?.declarations ?? []).map(
      (declaration) => parseLogicalSymbol(declaration.logicalId ?? '')?.name,
    )

    expect(logical.sort()).toEqual(['exposed', 'run'])
  })
})

describe('TypeScript import forms, qualified heritage, namespaces, jsx and shadowing', () => {
  const build = (
    files: Record<string, string>,
    main: string,
  ): {
    relations: Relation[]
    fileImports: readonly string[]
    importMap: ReadonlyMap<string, string>
  } => {
    const session = new InMemoryIndexSession()
    let analysis: FileAnalysis | undefined
    for (const [filePath, content] of Object.entries(files)) {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'typescript',
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
      importMap: resolvedImports.importMap,
    }
  }

  it('resolves default and namespace imports to a module dependency', () => {
    // IMPORTS relations are created by the indexer from the resolved file dependencies.
    const { fileImports, importMap } = build(
      {
        'ws:lib.ts': 'export default function d(): void {}\nexport function n(): void {}\n',
        'ws:m.ts': "import d from './lib.js'\nimport * as ns from './lib.js'\nexport const x = 1\n",
      },
      'ws:m.ts',
    )

    expect(fileImports).toEqual(['ws:lib.ts'])
    expect(importMap.get('d')).toContain('function:d')
    expect(importMap.has('ns')).toBe(false)
  })

  it('records no dependency for a default import whose module is not indexed', () => {
    const { fileImports, importMap } = build(
      { 'ws:m.ts': "import d from './missing.js'\nexport const x = 1\n" },
      'ws:m.ts',
    )

    expect(fileImports).toEqual([])
    expect(importMap.size).toBe(0)
  })

  it('keeps `extends ns.Base` qualified and resolves it through the namespace import', () => {
    const { relations } = build(
      {
        'ws:base.ts': 'export class Base {}\n',
        'ws:other.ts': 'export class Other {}\n',
        'ws:m.ts': "import * as ns from './base.js'\nexport class C extends ns.Base {}\n",
      },
      'ws:m.ts',
    )

    const extendsRelation = relations.find((r) => r.type === RelationType.Extends)
    expect(extendsRelation?.target).toBe('ws:base.ts:class:Base:1:7')
    expect(extendsRelation?.metadata).toMatchObject({
      importProvenance: { requestedName: 'ns.Base' },
    })
  })

  it('does not resolve `extends other.Base` through an unrelated simple name', () => {
    const { relations } = build(
      {
        'ws:base.ts': 'export class Base {}\n',
        'ws:m.ts': "import { Base } from './base.js'\nexport class C extends unknown.Base {}\n",
      },
      'ws:m.ts',
    )

    expect(relations.filter((r) => r.type === RelationType.Extends)).toEqual([])
  })

  it('keeps namespace-scoped functions with the same name as distinct declarations', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:ns.ts',
      projectRelativePath: 'ws:ns.ts',
      language: 'typescript',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile(
      'ws:ns.ts',
      'namespace X { export function f(): void {} }\nnamespace Y { export function f(): void {} }\n',
      { session, workspaceName: 'ws' },
    )

    const functions = draft.symbols.filter((symbol) => symbol.name === 'f')
    expect(functions).toHaveLength(2)
    expect(new Set(functions.map((symbol) => symbol.id)).size).toBe(2)
  })

  it('reports the jsx language id for .jsx files', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:a.jsx',
      projectRelativePath: 'ws:a.jsx',
      language: 'jsx',
      contentHash: 'x',
      workspace: 'ws',
    })

    expect(
      baseAdapter.analyzeFile('ws:a.jsx', 'export const A = () => <div />\n', {
        session,
        workspaceName: 'ws',
      }).language,
    ).toBe('jsx')
  })

  it('emits no CALLS when a parameter or local declaration shadows the imported name', () => {
    const { relations } = build(
      {
        'ws:lib.ts': 'export function helper(): void {}\n',
        'ws:m.ts': [
          "import { helper } from './lib.js'",
          'export function viaParam(helper: () => void): void { helper() }',
          'export function viaLocal(): void { const helper = () => {}; helper() }',
          'export function viaCatch(): void { try {} catch (helper) { helper() } }',
        ].join('\n'),
      },
      'ws:m.ts',
    )

    expect(relations.filter((r) => r.type === RelationType.Calls)).toEqual([])
  })

  it('still emits CALLS for the imported name when it is not shadowed', () => {
    const { relations } = build(
      {
        'ws:lib.ts': 'export function helper(): void {}\n',
        'ws:m.ts': "import { helper } from './lib.js'\nexport function run(): void { helper() }\n",
      },
      'ws:m.ts',
    )

    expect(relations.filter((r) => r.type === RelationType.Calls)).toHaveLength(1)
  })
})

describe('TypeScript imported heritage clause ranges', () => {
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

  it('records the range of each implements expression on its own edge', () => {
    const line = 'export class C implements A, B {}'
    const edges = hierarchyRanges(
      'typescript',
      {
        'ws:a.ts': 'export interface A {}\n',
        'ws:b.ts': 'export interface B {}\n',
        'ws:c.ts': `import { A } from './a.js'\nimport { B } from './b.js'\n${line}\n`,
      },
      'ws:c.ts',
      (session) =>
        new Map([
          ['A', idOf(session, 'ws:a.ts', 'A')],
          ['B', idOf(session, 'ws:b.ts', 'B')],
        ]),
    )

    expect(edges.map((edge) => edge.range)).toEqual([at(3, line, 'A'), at(3, line, 'B')])
  })
})

describe('TypeScript structural boundary regressions', () => {
  const analyze = (filePath: string, content: string) => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath,
      projectRelativePath: filePath,
      language: 'typescript',
      contentHash: 'x',
      workspace: 'ws',
    })
    return baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' })
  }

  it('keeps a call initializer inside its function and declares no logical local', () => {
    const draft = analyze(
      'ws:p.ts',
      'export function process(): void {\n  const result = Service.run()\n}\n',
    )
    const processSymbol = draft.symbols.find((symbol) => symbol.name === 'process')!
    const run = draft.callFacts.find((fact) => fact.name === 'run')

    expect(run?.callerSymbolId).toBe(processSymbol.id)
    expect(draft.symbols.some((symbol) => symbol.name === 'result')).toBe(false)
    expect(
      (draft.referenceFacts?.declarations ?? []).some(
        (declaration) => parseLogicalSymbol(declaration.logicalId ?? '')?.name === 'result',
      ),
    ).toBe(false)
  })

  it('reads multiline imports, types and heritage from nodes, never from comments or templates', () => {
    const draft = analyze(
      'ws:m.ts',
      [
        'import {',
        '  Alpha,',
        '  Beta,',
        "} from './dep.js'",
        "// import { Fake } from './fake.js'",
        "const text = `import { Ghost } from './ghost.js'; class Phantom extends Ghost {}`",
        'export class Child',
        '  extends Alpha',
        '  implements',
        '    Beta {',
        '  field: Map<',
        '    string,',
        '    Alpha',
        '  > = new Map()',
        '}',
      ].join('\n'),
    )

    expect(draft.imports.map((item) => item.localName).sort()).toEqual(['Alpha', 'Beta'])
    expect(draft.symbols.map((symbol) => symbol.name)).not.toContain('Phantom')
    const state = draft.parserState as unknown as {
      declarations: ReadonlyArray<{
        name: string
        extendsNames: string[]
        implementsNames: string[]
      }>
    }
    expect(state.declarations.map((declaration) => declaration.name)).toEqual(['Child'])
    expect(state.declarations[0]).toMatchObject({
      extendsNames: ['Alpha'],
      implementsNames: ['Beta'],
    })
  })
})

describe('TypeScript identity layers through the real adapter', () => {
  const analyze = (content: string) => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:src/calc.ts',
      projectRelativePath: 'ws:src/calc.ts',
      language: 'typescript',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile('ws:src/calc.ts', content, {
      session,
      workspaceName: 'ws',
    })
    const logicalByName = new Map(
      (draft.referenceFacts?.declarations ?? []).map((declaration) => [
        declaration.symbolId,
        declaration.logicalId,
      ]),
    )
    return { draft, logicalByName }
  }

  it('moving an overloaded method keeps its logical id while physical ids change', () => {
    const body =
      'export class Calc {\n  add(a: string): void\n  add(a: number): void\n  add(a: any) {}\n}\n'
    const before = analyze(body)
    const after = analyze(`// moved\n// down\n${body}`)
    const idsOf = (
      result: ReturnType<typeof analyze>,
    ): { physical: string[]; logical: string[] } => {
      const adds = result.draft.symbols.filter((symbol) => symbol.name === 'add')
      return {
        physical: adds.map((symbol) => symbol.id).sort(),
        logical: [
          ...new Set(adds.map((symbol) => result.logicalByName.get(symbol.id)).filter(Boolean)),
        ] as string[],
      }
    }

    const first = idsOf(before)
    const second = idsOf(after)
    expect(first.physical).toHaveLength(3)
    expect(first.physical).not.toEqual(second.physical)
    expect(first.logical).toHaveLength(1)
    expect(second.logical).toEqual(first.logical)
  })

  it('a physical-only declaration has no logical id but is still found by symbol id and location', () => {
    const { draft, logicalByName } = analyze(
      "describe('suite', () => {\n  it('case', () => {\n    run()\n  })\n})\n",
    )
    const anonymous = draft.symbols.filter((symbol) => symbol.name === '<anonymous>')

    expect(anonymous.length).toBeGreaterThan(0)
    for (const symbol of anonymous) {
      expect(logicalByName.get(symbol.id)).toBeUndefined()
      expect(symbol.line).toBeGreaterThan(0)
    }
  })

  it('equal local function names in competing routines stay distinct physical symbols without a shared logical target', () => {
    const { draft, logicalByName } = analyze(
      'export function a() { function same() {} }\nexport function b() { function same() {} }\n',
    )
    const same = draft.symbols.filter((symbol) => symbol.name === 'same')

    expect(same).toHaveLength(2)
    expect(new Set(same.map((symbol) => symbol.id)).size).toBe(2)
    expect(same.every((symbol) => logicalByName.get(symbol.id) === undefined)).toBe(true)
  })
})
