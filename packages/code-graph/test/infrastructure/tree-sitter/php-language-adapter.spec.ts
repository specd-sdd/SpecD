import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { ImportDeclarationKind } from '../../../src/domain/value-objects/import-declaration-kind.js'
import {
  BindingSourceKind,
  type BindingFact,
} from '../../../src/domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { type SourceRange, type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../../src/domain/value-objects/relation.js'
import {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
} from '../../../src/domain/services/scoped-binding-environment.js'
import { type ImportDeclaration } from '../../../src/domain/value-objects/import-declaration.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { parseLogicalSymbol } from '../../../src/domain/value-objects/symbol-reference.js'

interface TestAdapter {
  languages(): string[]
  extensions(): Record<string, string>
  resolutionManifests(): readonly string[]
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined
  buildQualifiedName(namespace: string, symbolName: string): string
  resolveQualifiedNameToPath(
    qualifiedName: string,
    codeRoot: string,
    repoRoot?: string,
  ): string | undefined
  extractSymbols(filePath: string, content: string): SymbolNode[]
  extractNamespace(content: string): string | undefined
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

const baseAdapter = new PhpLanguageAdapter()
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
    language: 'php',
    contentHash: 'abc',
    workspace: 'ws',
  })
  const draft = baseAdapter.analyzeFile(filePath, content, {
    session,
    workspaceName: 'ws',
  })
  return draft.symbols as SymbolNode[]
}

adapter.extractNamespace = (content: string): string | undefined => {
  const session = new InMemoryIndexSession()
  const draft = baseAdapter.analyzeFile('dummy.php', content, {
    session,
    workspaceName: 'ws',
  })
  return draft.namespace
}

adapter.extractImportedNames = (filePath: string, content: string): ImportDeclaration[] => {
  const session = new InMemoryIndexSession()
  session.registerFile({
    filePath,
    projectRelativePath: filePath,
    language: 'php',
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
    language: 'php',
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
    language: 'php',
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

  // Register all filePaths in session
  for (const fp of filePaths) {
    session.registerFile({
      filePath: fp,
      projectRelativePath: fp,
      language: 'php',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }

  // Group and register relationSymbols by filePath
  const symbolsByPath = new Map<string, SymbolNode[]>()
  for (const s of relationSymbols) {
    let list = symbolsByPath.get(s.filePath)
    if (!list) {
      list = []
      symbolsByPath.set(s.filePath, list)
    }
    list.push(s)
  }

  for (const [path, syms] of symbolsByPath.entries()) {
    if (path !== filePath) {
      session.registerFile({
        filePath: path,
        projectRelativePath: path,
        language: 'php',
        contentHash: 'abc',
        workspace: 'ws',
      })
      session.registerAnalysis({
        filePath: path,
        analysis: {
          language: 'php',
          symbols: syms,
          imports: [],
          bindingFacts: [],
          callFacts: [],
        },
      })
    }
  }

  // Register target file
  session.registerFile({
    filePath,
    projectRelativePath: filePath,
    language: 'php',
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
  const resolved = baseAdapter.resolveImports(analysis, {
    session,
    qualifiedNames: new Map(),
    packageToWorkspace: new Map(),
  })
  const resolvedImports = {
    importMap: new Map([...resolved.importMap, ...importMap]),
    fileImports: resolved.fileImports,
  }
  const adapterRelations = baseAdapter.buildRelations(analysis, {
    session,
    resolvedImports,
  })
  const symbolLookup = {
    findByName: (name: string, prefix?: string) => session.findSymbolsByName(name, prefix),
    findByFile: (path: string) => session.findSymbolsByFile(path),
  }
  const dependencies = resolveDependencyFacts({
    environment: buildScopedBindingEnvironment({
      analysis,
      importMap: resolvedImports.importMap,
      symbolLookup,
    }),
    analysis,
    symbolLookup,
  }).map((dependency) =>
    createRelation({
      source: dependency.sourceSymbolId,
      target: dependency.targetSymbolId,
      type: dependency.relationType,
    }),
  )
  return [...adapterRelations, ...dependencies]
}

describe('PhpLanguageAdapter', () => {
  it('reports supported languages', () => {
    expect(adapter.languages()).toEqual(['php'])
  })

  it('keeps use aliases as local bindings rather than public exports', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'src/Service.php',
      '<?php\nnamespace App;\nuse Vendor\\Package\\Canonical as Alias;\nclass Service {}\n',
      { session, workspaceName: 'workspace' },
    ).referenceFacts

    expect(baseAdapter.capabilities()).toMatchObject({
      publicBindings: false,
      localBindings: true,
      hierarchy: true,
    })
    expect(facts?.localBindings.map((item) => item.localName)).toContain('Alias')
    expect(facts?.publicBindings).toEqual([])
    expect(facts?.hierarchy).toEqual([])
  })

  it('owner-qualifies methods and emits local hierarchy evidence', () => {
    const session = new InMemoryIndexSession()
    const facts = baseAdapter.analyzeFile(
      'src/Service.php',
      `<?php
namespace App;
interface Persistable {
  public function save(): void;
}
class BaseService {
  public function save(): void {}
}
class ChildService extends BaseService implements Persistable {
  public function save(): void {}
}
`,
      { session, workspaceName: 'workspace' },
    ).referenceFacts!

    const saves = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId ?? ''))
      .filter((logical) => logical?.name === 'save')
    expect(saves.length).toBeGreaterThanOrEqual(2)
    expect(new Set(saves.map((logical) => logical?.ownerId)).size).toBe(saves.length)
    expect(facts.hierarchy.map((fact) => fact.kind)).toEqual(['extends', 'implements'])
    expect(facts.steps.map((step) => step.kind)).toEqual(['extends:0', 'implements:0'])
  })

  it('retains static and constructor forms and simple trait composition', () => {
    const facts = baseAdapter.analyzeFile(
      'src/Forms.php',
      `<?php
namespace App;
trait Saves {
  public function save(): void {}
}
class Service {
  use Saves;
  public function __construct() {}
  public static function create(): void {}
}
`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    const forms = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId ?? ''))
      .filter((logical) => logical?.ownerId !== undefined)
      .map((logical) => [logical?.name, logical?.memberSemantics])
    expect(forms).toEqual(
      expect.arrayContaining([
        ['save', { kind: 'method', dispatch: 'instance' }],
        ['__construct', { kind: 'constructor' }],
        ['create', { kind: 'method', dispatch: 'static' }],
      ]),
    )
    expect(facts.hierarchy).toEqual([expect.objectContaining({ kind: 'trait', precedence: 0 })])
    expect(facts.steps).toEqual([expect.objectContaining({ kind: 'trait:0' })])
  })

  it('does not guess trait precedence when adaptation syntax is present', () => {
    const facts = baseAdapter.analyzeFile(
      'src/Traits.php',
      `<?php
trait FirstTrait { public function save(): void {} }
trait SecondTrait { public function save(): void {} }
class Service {
  use FirstTrait, SecondTrait { FirstTrait::save insteadof SecondTrait; }
}
`,
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!

    expect(facts.hierarchy.filter((fact) => fact.kind === 'trait')).toEqual([])
    expect(facts.steps.filter((step) => step.kind.startsWith('trait:'))).toEqual([])
  })

  it('owner-qualifies a compact same-line class method', () => {
    const facts = baseAdapter.analyzeFile(
      'src/Compact.php',
      '<?php class Service { public function run(): void {} }',
      { session: new InMemoryIndexSession(), workspaceName: 'workspace' },
    ).referenceFacts!
    const run = facts.declarations
      .map((declaration) => parseLogicalSymbol(declaration.logicalId ?? ''))
      .find((logical) => logical?.name === 'run')

    expect(run?.ownerId).toBeDefined()
  })

  describe('extractSymbols', () => {
    it('extracts function definitions', () => {
      const code = '<?php\nfunction greet(string $name): string { return $name; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'greet' && s.kind === SymbolKind.Function),
      ).toBe(true)
    })

    it('extracts parser-authoritative construct and declared-name ranges', () => {
      const code = `<?php
class UserService {
  public function execute(): void {}
}`
      const symbol = adapter
        .extractSymbols('main.php', code)
        .find((candidate) => candidate.name === 'UserService')!
      const construct = sliceRange(code, {
        startLine: symbol.line,
        startColumn: symbol.column,
        endLine: symbol.endLine,
        endColumn: symbol.endColumn,
      })

      expect(construct).toBe(`class UserService {
  public function execute(): void {}
}`)
      expect(sliceRange(code, symbol.selectionRange)).toBe('UserService')
      expect(symbol.id).toBe('main.php:class:UserService:2:0')
    })

    it('extracts class declarations', () => {
      const code = '<?php\nclass User {}'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'User' && s.kind === SymbolKind.Class),
      ).toBe(true)
    })

    it('extracts methods inside classes', () => {
      const code =
        '<?php\nclass User {\n  public function login(): void {}\n  public function logout(): void {}\n}'
      const symbols = adapter.extractSymbols('main.php', code)
      const methods = symbols.filter((s: SymbolNode) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
    })

    it('extracts interface declarations', () => {
      const code = '<?php\ninterface Repo { public function find(): void; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Repo' && s.kind === SymbolKind.Interface),
      ).toBe(true)
    })

    it('extracts enum declarations', () => {
      const code = '<?php\nenum Status { case Active; }'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Status' && s.kind === SymbolKind.Enum),
      ).toBe(true)
    })

    it('extracts trait declarations as type', () => {
      const code = '<?php\ntrait Loggable {}'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'Loggable' && s.kind === SymbolKind.Type),
      ).toBe(true)
    })

    it('extracts const declarations as variable', () => {
      const code = '<?php\nconst MAX = 10;'
      const symbols = adapter.extractSymbols('main.php', code)
      expect(
        symbols.some((s: SymbolNode) => s.name === 'MAX' && s.kind === SymbolKind.Variable),
      ).toBe(true)
    })

    it('extracts methods from interfaces', () => {
      const code =
        '<?php\ninterface Repo {\n  public function find(): void;\n  public function save(): void;\n}'
      const symbols = adapter.extractSymbols('main.php', code)
      const methods = symbols.filter((s: SymbolNode) => s.kind === SymbolKind.Method)
      expect(methods).toHaveLength(2)
    })
  })

  describe('extractRelations', () => {
    it('creates DEFINES relations for all symbols', () => {
      const code = '<?php\nfunction foo() {}\nfunction bar() {}'
      const symbols = adapter.extractSymbols('main.php', code)
      const relations = adapter.extractRelations('main.php', code, symbols, new Map())
      const defines = relations.filter((r: Relation) => r.type === RelationType.Defines)
      expect(defines).toHaveLength(symbols.length)
    })

    it('creates EXTENDS, IMPLEMENTS, and OVERRIDES for local declarations', () => {
      const code = `<?php
interface Persistable {
  public function save(): void;
}

class BaseService {
  public function save(): void {}
}

class UserService extends BaseService implements Persistable {
  public function save(): void {}
}`
      const symbols = adapter.extractSymbols('main.php', code)
      const relations = adapter.extractRelations('main.php', code, symbols, new Map())
      expect(relations.some((relation: Relation) => relation.type === RelationType.Extends)).toBe(
        true,
      )
      expect(
        relations.some((relation: Relation) => relation.type === RelationType.Implements),
      ).toBe(true)
      expect(relations.some((relation: Relation) => relation.type === RelationType.Overrides)).toBe(
        true,
      )
    })

    it('uses injected filePaths for existence checks in dynamic loaders', () => {
      const code = '<?php $this->loadModel("User");'
      const filePath = 'app/controllers/users_controller.php'
      const targetPath = 'app/models/user.php'
      const filePaths = new Set([targetPath])

      const relations = adapter.extractRelations(filePath, code, [], new Map(), filePaths)

      const imports = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(imports).toHaveLength(1)
      expect(imports[0]?.target).toBe(targetPath)
    })

    it('creates EXTENDS for imported types', () => {
      const code = `<?php
use App\\BaseService;

class UserService extends BaseService {}`
      const symbols = adapter.extractSymbols('main.php', code)
      const relations = adapter.extractRelations(
        'main.php',
        code,
        symbols,
        new Map([['BaseService', 'src/BaseService.php:class:BaseService:1:0']]),
      )
      const extendsRelation = relations.find(
        (relation: Relation) => relation.type === RelationType.Extends,
      )
      expect(extendsRelation?.target).toBe('src/BaseService.php:class:BaseService:1:0')
    })
  })

  describe('shared fact extraction', () => {
    it('emits require, use alias, construction, type, and framework facts', () => {
      const code = `<?php
use App\\Service as Svc;
require_once 'literal.php';
class ArticlesController {
  var $uses = array('Article');
  private Svc $svc;
  public function save(Svc $svc): Svc {
    $created = new Svc();
    $this->Article->save();
    return $created;
  }
}`
      const symbols = adapter.extractSymbols('Controller.php', code)
      const imports = adapter.extractImportedNames('Controller.php', code)
      const bindingFacts = adapter.extractBindingFacts('Controller.php', code, symbols, imports)
      const callFacts = adapter.extractCallFacts('Controller.php', code, symbols)

      expect(
        imports.some((item: ImportDeclaration) => item.kind === ImportDeclarationKind.Require),
      ).toBe(true)
      expect(
        bindingFacts.some(
          (fact: BindingFact) =>
            fact.sourceKind === BindingSourceKind.ImportedType && fact.name === 'Svc',
        ),
      ).toBe(true)
      expect(
        bindingFacts.some(
          (fact: BindingFact) =>
            fact.sourceKind === BindingSourceKind.FrameworkManaged && fact.targetName === 'Article',
        ),
      ).toBe(true)
      expect(
        callFacts.some(
          (fact: CallFact) => fact.form === CallForm.Constructor && fact.name === 'Svc',
        ),
      ).toBe(true)
      expect(
        callFacts.some(
          (fact: CallFact) =>
            fact.form === CallForm.Member &&
            fact.receiverName === 'Article' &&
            fact.name === 'save',
        ),
      ).toBe(true)
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
      const userSymbol = symbols.find((s: SymbolNode) => s.name === 'User')

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

  describe('resolutionManifests', () => {
    it('given php adapter, when asked for manifests, then returns composer.json', () => {
      expect(adapter.resolutionManifests()).toEqual(['composer.json'])
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

  describe('resolveQualifiedNameToPath', () => {
    let tempDir: string

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    })

    it('resolves qualified name to absolute path via PSR-4', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      writeFileSync(
        join(tempDir, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
      )
      const result = adapter.resolveQualifiedNameToPath('App\\Models\\User', tempDir)
      expect(result).toBe(join(tempDir, 'src', 'Models', 'User.php'))
    })

    it('longest prefix wins', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      writeFileSync(
        join(tempDir, 'composer.json'),
        JSON.stringify({
          autoload: { 'psr-4': { 'App\\': 'src/', 'App\\Models\\': 'src/models/' } },
        }),
      )
      const result = adapter.resolveQualifiedNameToPath('App\\Models\\User', tempDir)
      expect(result).toBe(join(tempDir, 'src', 'models', 'User.php'))
    })

    it('returns undefined when no matching prefix', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      writeFileSync(
        join(tempDir, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
      )
      expect(adapter.resolveQualifiedNameToPath('Vendor\\Lib\\Foo', tempDir)).toBeUndefined()
    })

    it('returns undefined when no composer.json', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      expect(adapter.resolveQualifiedNameToPath('App\\Models\\User', tempDir)).toBeUndefined()
    })

    it('caches PSR-4 map across calls', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      writeFileSync(
        join(tempDir, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
      )
      const freshAdapter = new PhpLanguageAdapter()
      const r1 = freshAdapter.resolveQualifiedNameToPath('App\\Models\\User', tempDir)
      const r2 = freshAdapter.resolveQualifiedNameToPath('App\\Http\\Controller', tempDir)
      expect(r1).toBe(join(tempDir, 'src', 'Models', 'User.php'))
      expect(r2).toBe(join(tempDir, 'src', 'Http', 'Controller.php'))
    })
  })

  describe('extractRelations — require/include', () => {
    it('require_once with relative string literal emits IMPORTS when the target is indexed', () => {
      const root = join(tmpdir(), 'php-require')
      const filePath = join(root, 'app', 'controllers', 'PostsController.php')
      const targetPath = resolve(root, 'app', 'models', 'Post.php')
      const content = `<?php\nrequire_once '../models/Post.php';`
      const targetSymbols = adapter.extractSymbols(targetPath, '<?php\nclass Post {}')
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      const importsRels = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(importsRels).toHaveLength(1)
      expect(importsRels[0]!.target).toBe(targetPath)
    })

    it('require_once emits no relation when the target is not indexed', () => {
      const root = join(tmpdir(), 'php-require-missing')
      const filePath = join(root, 'app', 'controllers', 'PostsController.php')
      const content = `<?php\nrequire_once '../models/Post.php';`
      const relations = adapter.extractRelations(filePath, content, [], new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('include with relative path emits IMPORTS when the target is indexed', () => {
      const root = join(tmpdir(), 'php-include')
      const filePath = join(root, 'app', 'bootstrap.php')
      const targetPath = resolve(root, 'app', 'helpers', 'url_helper.php')
      const content = `<?php\ninclude 'helpers/url_helper.php';`
      const targetSymbols = adapter.extractSymbols(targetPath, '<?php\nfunction url_helper() {}')
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      const importsRels = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(importsRels).toHaveLength(1)
      expect(importsRels[0]!.target).toBe(targetPath)
    })

    it('require with variable is silently dropped', () => {
      const content = `<?php\nrequire_once $path;`
      const relations = adapter.extractRelations('ctrl.php', content, [], new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('require with concatenation is silently dropped', () => {
      const content = `<?php\nrequire_once APPPATH . 'models/Post.php';`
      const relations = adapter.extractRelations('ctrl.php', content, [], new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('require_once alongside use statements produces only the resolved require relation', () => {
      const root = join(tmpdir(), 'php-require-use')
      const filePath = join(root, 'app', 'controllers', 'PostsController.php')
      const targetPath = join(root, 'app', 'controllers', 'bootstrap.php')
      const content = `<?php\nuse App\\Models\\User;\nrequire_once 'bootstrap.php';`
      const targetSymbols = adapter.extractSymbols(targetPath, '<?php\nfunction boot() {}')
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      const importsRels = relations.filter((r: Relation) => r.type === RelationType.Imports)
      expect(importsRels.map((r: Relation) => r.target)).toEqual([targetPath])
    })
  })

  describe('extractRelations — dynamic loaders', () => {
    it('CakePHP uses property emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nclass PostsController {\n  var $uses = array('Article');\n}`
      const targetPath = 'php-app:app/models/article.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('$this->loadModel emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nclass PostsController {\n  public function index() {\n    $this->loadModel('User');\n  }\n}`
      const targetPath = 'php-app:app/models/user.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass User { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('App::uses emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nApp::uses('Controller', 'Controller');`
      const targetPath = 'php-app:app/controllers/controller_controller.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Controller { public function beforeFilter(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('$this->load->model emits IMPORTS when target resolves', () => {
      const filePath = 'ci:application/controllers/posts.php'
      const content = `<?php\nclass CI_Controller {\n  public function index() {\n    $this->load->model('User_model');\n  }\n}`
      const targetPath = 'ci:application/models/user_model.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass User_model { public function find(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('Yii::import emits IMPORTS when target resolves', () => {
      const filePath = 'yii:protected/controllers/PostController.php'
      const content = `<?php\nYii::import('application.models.User');`
      const targetPath = 'yii:protected/models/User.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass User { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('dynamic variable argument is silently dropped', () => {
      const content = `<?php\nclass C { public function f() { $this->loadModel($modelName); } }`
      const relations = adapter.extractRelations('ctrl.php', content, [], new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('unrelated ->get() is not detected', () => {
      const content = `<?php\nclass Foo {\n  public function bar() {\n    $this->get('someService');\n  }\n}`
      const relations = adapter.extractRelations('foo.php', content, [], new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('multiple loaders in same file all detected', () => {
      const filePath = 'ci:application/controllers/ctrl.php'
      const content = `<?php\nclass Ctrl {\n  public function index() {\n    $this->load->model('Post');\n    $this->load->library('email');\n  }\n}`
      const allSymbols = [
        ...adapter.extractSymbols(
          'ci:application/models/post.php',
          `<?php\nclass Post { public function save(): void {} }`,
        ),
        ...adapter.extractSymbols(
          'ci:application/libraries/email.php',
          `<?php\nclass Email { public function send(): void {} }`,
        ),
      ]
      const relations = adapter.extractRelations(filePath, content, allSymbols, new Map())
      expect(relations.filter((r: Relation) => r.type === RelationType.Imports)).toHaveLength(2)
    })

    it('uses() global function emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nuses('Sanitize');`
      const targetPath = 'php-app:app/models/sanitize.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Sanitize { public function clean(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('bare loadController emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nclass PostsController {\n  public function index() {\n    loadController('Admin');\n  }\n}`
      const targetPath = 'php-app:app/controllers/admin_controller.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass AdminController { public function index(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('bare loadComponent emits IMPORTS when target resolves', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const content = `<?php\nclass PostsController {\n  public function index() {\n    loadComponent('Auth');\n  }\n}`
      const targetPath = 'php-app:app/controllers/components/auth.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass AuthComponent { public function startup(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('Laravel app class literal emits IMPORTS when target resolves', () => {
      const filePath = 'laravel:app/Http/Controllers/PostController.php'
      const content = `<?php\nclass PostController {\n  public function index() {\n    app(App\\Services\\Mailer::class);\n  }\n}`
      const targetPath = 'laravel:app/App/Services/Mailer.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Mailer { public function send(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })

    it('Symfony get class literal emits IMPORTS when target resolves', () => {
      const filePath = 'symfony:src/Controller/PostController.php'
      const content = `<?php\nclass PostController {\n  public function index() {\n    $this->get(App\\Service\\Mailer::class);\n  }\n}`
      const targetPath = 'symfony:src/App/Service/Mailer.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Mailer { public function send(): void {} }`,
      )
      const relations = adapter.extractRelations(filePath, content, targetSymbols, new Map())
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: filePath,
          target: targetPath,
          type: RelationType.Imports,
        }),
      )
    })
  })

  describe('extractRelations — loaded-instance calls', () => {
    it('emits CALLS for a CakePHP uses property used inside a method', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        "  var $uses = array('Article');",
        '  public function index() {',
        '    $this->Article->save();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'php-app:app/models/article.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for a loaded model alias used in the same method', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    $this->loadModel('Article');",
        '    $this->Article->save();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'php-app:app/models/article.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for a local variable alias assigned from a loaded model', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    $this->loadModel('Article');",
        '    $model = $this->Article;',
        '    $model->find();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'php-app:app/models/article.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Article { public function find(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for an explicitly constructed instance after loadModel', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    $this->loadModel('Article');",
        '    $article = new Article();',
        '    $article->save();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'php-app:app/models/article.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for Yii createObject class literal assignment', () => {
      const filePath = 'yii:protected/controllers/PostController.php'
      const controllerContent = [
        '<?php',
        'class PostController {',
        '  public function index() {',
        '    $mailer = Yii::createObject(App\\Services\\Mailer::class);',
        '    $mailer->send();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'yii:app/App/Services/Mailer.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Mailer { public function send(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for Laravel app class literal assignment', () => {
      const filePath = 'laravel:app/Http/Controllers/PostController.php'
      const controllerContent = [
        '<?php',
        'class PostController {',
        '  public function index() {',
        '    $mailer = app(App\\Services\\Mailer::class);',
        '    $mailer->send();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'laravel:app/App/Services/Mailer.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Mailer { public function send(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for Symfony get class literal assignment', () => {
      const filePath = 'symfony:src/Controller/PostController.php'
      const controllerContent = [
        '<?php',
        'class PostController {',
        '  public function index() {',
        '    $mailer = $this->get(App\\Service\\Mailer::class);',
        '    $mailer->send();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'symfony:src/App/Service/Mailer.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Mailer { public function send(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('emits CALLS for Zend loader followed by explicit new', () => {
      const filePath = 'zend:app/controllers/PostController.php'
      const controllerContent = [
        '<?php',
        'class PostController {',
        '  public function index() {',
        "    Zend_Loader::loadClass('Foo_Bar');",
        '    $service = new Foo_Bar();',
        '    $service->run();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetPath = 'zend:src/Foo_Bar.php'
      const targetSymbols = adapter.extractSymbols(
        targetPath,
        `<?php\nclass Foo_Bar { public function run(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      const caller = controllerSymbols.find(
        (symbol: SymbolNode) => symbol.kind === SymbolKind.Method,
      )
      const callee = targetSymbols.find((symbol: SymbolNode) => symbol.kind === SymbolKind.Method)
      expect(relations).toContainEqual(
        expect.objectContaining({
          source: caller?.id,
          target: callee?.id,
          type: RelationType.Calls,
        }),
      )
    })

    it('drops unresolved alias calls', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    $this->loadModel('Article');",
        '    $this->Article->missing();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetSymbols = adapter.extractSymbols(
        'php-app:app/models/article.php',
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      expect(
        relations.filter((relation: Relation) => relation.type === RelationType.Calls),
      ).toHaveLength(0)
    })

    it('does not propagate aliases across methods', () => {
      const filePath = 'php-app:app/controllers/posts_controller.php'
      const controllerContent = [
        '<?php',
        'class PostsController {',
        '  public function first() {',
        "    $this->loadModel('Article');",
        '  }',
        '  public function second() {',
        '    $this->Article->save();',
        '  }',
        '}',
      ].join('\n')
      const controllerSymbols = adapter.extractSymbols(filePath, controllerContent)
      const targetSymbols = adapter.extractSymbols(
        'php-app:app/models/article.php',
        `<?php\nclass Article { public function save(): void {} }`,
      )
      const relations = adapter.extractRelations(
        filePath,
        controllerContent,
        [...controllerSymbols, ...targetSymbols],
        new Map(),
      )
      expect(
        relations.filter((relation: Relation) => relation.type === RelationType.Calls),
      ).toHaveLength(0)
    })
  })
})

describe('PhpLanguageAdapter member spelling', () => {
  it('parses :: and dotted spellings to the same segments', () => {
    expect(baseAdapter.parseSymbolReference('ArchiveChange::execute')).toEqual(
      baseAdapter.parseSymbolReference('ArchiveChange.execute'),
    )
    expect(
      baseAdapter.parseSymbolReference('ArchiveChange::execute').candidates[0]?.segments,
    ).toEqual([
      { name: 'ArchiveChange', role: 'type' },
      { name: 'execute', role: 'member' },
    ])
  })

  it('does not claim TypeScript files', () => {
    expect(baseAdapter.extensions()['.ts']).toBeUndefined()
    expect(baseAdapter.languages()).not.toContain('typescript')
  })
})

describe('PhpLanguageAdapter drive-letter paths', () => {
  it('keeps a drive letter in the resolved import path', () => {
    const resolved = baseAdapter.resolveRelativeImportPath('C:/repo/src/a.php', './b.php')
    expect(resolved).toBe('C:/repo/src/b.php')
  })
})

describe('PhpLanguageAdapter dependency detection enhancements', () => {
  it('extracts class properties and class constants as SymbolKind.Property with class parentId', () => {
    const code = `<?php
class User {
    public int $id;
    protected string $name = 'default';
    public const MAX_USERS = 100;
}
`
    const symbols = adapter.extractSymbols('models/User.php', code)
    const userClass = symbols.find((s) => s.name === 'User' && s.kind === SymbolKind.Class)!
    expect(userClass).toBeDefined()

    const idProp = symbols.find((s) => s.name === 'id')
    const nameProp = symbols.find((s) => s.name === 'name')
    const maxConst = symbols.find((s) => s.name === 'MAX_USERS')

    expect(idProp).toBeDefined()
    expect(idProp?.kind).toBe(SymbolKind.Property)
    expect(idProp?.parentId).toBe(userClass.id)

    expect(nameProp).toBeDefined()
    expect(nameProp?.kind).toBe(SymbolKind.Property)
    expect(nameProp?.parentId).toBe(userClass.id)

    expect(maxConst).toBeDefined()
    expect(maxConst?.kind).toBe(SymbolKind.Property)
    expect(maxConst?.parentId).toBe(userClass.id)
  })

  it('extracts enum cases as SymbolKind.Property with enum parentId', () => {
    const code = `<?php
enum Status: string {
    case Active = 'active';
    case Inactive = 'inactive';
}
`
    const symbols = adapter.extractSymbols('models/Status.php', code)
    const statusEnum = symbols.find((s) => s.name === 'Status' && s.kind === SymbolKind.Enum)!
    expect(statusEnum).toBeDefined()

    const activeCase = symbols.find((s) => s.name === 'Active')
    const inactiveCase = symbols.find((s) => s.name === 'Inactive')

    expect(activeCase).toBeDefined()
    expect(activeCase?.kind).toBe(SymbolKind.Property)
    expect(activeCase?.parentId).toBe(statusEnum.id)

    expect(inactiveCase).toBeDefined()
    expect(inactiveCase?.kind).toBe(SymbolKind.Property)
    expect(inactiveCase?.parentId).toBe(statusEnum.id)
  })

  it('sets container logical owner and parentId for properties and class constants in referenceFacts', () => {
    const code = `<?php
namespace App\\Models;

class Order {
    public string $orderId;
    public const STATUS_NEW = 'new';
}
`
    const session = new InMemoryIndexSession()
    const draft = baseAdapter.analyzeFile('src/Models/Order.php', code, {
      session,
      workspaceName: 'php-app',
    })

    const orderClass = draft.symbols.find((s) => s.name === 'Order' && s.kind === SymbolKind.Class)!
    const propSymbol = draft.symbols.find((s) => s.name === 'orderId')!
    const constSymbol = draft.symbols.find((s) => s.name === 'STATUS_NEW')!

    expect(propSymbol.parentId).toBe(orderClass.id)
    expect(constSymbol.parentId).toBe(orderClass.id)

    const declarations = draft.referenceFacts?.declarations ?? []
    const logicals = declarations.map((d) => parseLogicalSymbol(d.logicalId ?? ''))
    const orderLogical = logicals.find((s) => s?.name === 'Order')
    const propLogical = logicals.find((s) => s?.name === 'orderId')
    const constLogical = logicals.find((s) => s?.name === 'STATUS_NEW')

    expect(orderLogical).toBeDefined()
    expect(propLogical).toBeDefined()
    expect(propLogical?.ownerId).toBe(orderLogical?.id)

    expect(constLogical).toBeDefined()
    expect(constLogical?.ownerId).toBe(orderLogical?.id)
  })
})

describe('PhpLanguageAdapter parser authority and resolution', () => {
  const registerPhp = (session: InMemoryIndexSession, filePath: string): void => {
    session.registerFile({
      filePath,
      projectRelativePath: filePath,
      language: 'php',
      contentHash: 'abc',
      workspace: 'ws',
    })
  }

  describe('declaration classification', () => {
    it('declares types and their members but never locals, parameters or closures', () => {
      const session = new InMemoryIndexSession()
      registerPhp(session, 'ws:src/a.php')
      const draft = baseAdapter.analyzeFile(
        'ws:src/a.php',
        `<?php
namespace N;
trait T { public function t() {} }
enum Suit { case Hearts; const X = 1; }
class C {
  use T;
  public int $prop = 1;
  const K = 2;
  public function m($param) {
    $local = 1;
    $fn = function ($x) { return $x; };
    $arrow = fn($y) => $y;
    return $fn($local);
  }
}
$top = new C();
`,
        { session, workspaceName: 'ws' },
      )
      const declared = (draft.referenceFacts?.declarations ?? []).map((declaration) => {
        const logical = parseLogicalSymbol(declaration.logicalId ?? '')
        return `${logical?.ownerId === undefined ? 'top' : 'member'}:${logical?.name ?? ''}`
      })

      expect(declared.sort()).toEqual(
        [
          'top:C',
          'top:T',
          'top:Suit',
          'member:K',
          'member:m',
          'member:t',
          'member:X',
          'member:prop',
          'member:Hearts',
        ].sort(),
      )
      for (const name of ['local', 'param', 'fn', 'arrow', 'top', 'x', 'y']) {
        expect(declared.some((entry) => entry.endsWith(`:${name}`))).toBe(false)
      }
    })
  })

  describe('textual lookalikes', () => {
    const targets = [
      ...adapter.extractSymbols('php-app:app/models/article.php', '<?php\nclass Article {}'),
      ...adapter.extractSymbols('php-app:app/models/helper.php', '<?php\nfunction helper() {}'),
    ]
    const imports = (content: string): Relation[] =>
      adapter
        .extractRelations('php-app:app/controllers/posts_controller.php', content, targets)
        .filter((relation: Relation) => relation.type === RelationType.Imports)

    it('emits nothing for loader and require text inside comments, strings and heredocs', () => {
      const content = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    // $this->loadModel('Article');",
        "    /* $this->loadModel('Article'); */",
        '    $text = "$this->loadModel(\'Article\');";',
        "    $single = '$this->loadModel(\\'Article\\');';",
        '    $doc = <<<EOT',
        "$this->loadModel('Article');",
        "require_once 'helper.php';",
        'EOT;',
        '  }',
        '}',
      ].join('\n')

      expect(imports(content)).toEqual([])
    })

    it('emits one import for the real loader call and none for its lookalike', () => {
      const content = [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        '    $note = "$this->loadModel(\'Ghost\');";',
        "    $this->loadModel('Article');",
        '  }',
        '}',
      ].join('\n')

      const found = imports(content)
      expect(found).toHaveLength(1)
      expect(found[0]!.target).toBe('php-app:app/models/article.php')
    })
  })

  describe('unresolved evidence persists no relation', () => {
    it('drops a loader whose literal names no indexed target', () => {
      const content = `<?php\nclass C {\n  public function f() {\n    $this->loadModel('Ghost');\n    uses('Phantom');\n  }\n}`
      const relations = adapter.extractRelations('php-app:app/controllers/c.php', content, [])

      expect(
        relations.filter((relation: Relation) => relation.type === RelationType.Imports),
      ).toEqual([])
    })

    it('drops a namespace use with no PSR-4 or qualified-name proof', () => {
      const session = new InMemoryIndexSession()
      registerPhp(session, 'ws:src/main.php')
      const draft = baseAdapter.analyzeFile(
        'ws:src/main.php',
        '<?php\nuse Vendor\\Missing\\Thing;\nclass Main {}',
        { session, workspaceName: 'ws' },
      )
      const analysis = session.registerAnalysis({ filePath: 'ws:src/main.php', analysis: draft })
      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map(),
      })

      expect(resolved.importMap.size).toBe(0)
      expect(resolved.fileImports).toEqual([])
      expect(
        baseAdapter
          .buildRelations(analysis, { session, resolvedImports: resolved })
          .filter((relation: Relation) => relation.type === RelationType.Imports),
      ).toEqual([])
    })
  })

  describe('imported hierarchy provenance', () => {
    it('pairs each persisted EXTENDS edge with exactly one matching shared fact', () => {
      const session = new InMemoryIndexSession()
      const register = (
        filePath: string,
        content: string,
      ): ReturnType<typeof session.registerAnalysis> => {
        registerPhp(session, filePath)
        return session.registerAnalysis({
          filePath,
          analysis: baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' }),
        })
      }
      const parent = register('ws:src/Base.php', '<?php\nnamespace App;\nclass Base {}')
      const child = register(
        'ws:src/Child.php',
        '<?php\nnamespace App\\Sub;\nuse App\\Base;\nclass Child extends Base {}',
      )
      const parentSymbol = parent.symbols.find((symbol) => symbol.name === 'Base')!
      const childSymbol = child.symbols.find((symbol) => symbol.name === 'Child')!

      const relations = baseAdapter.buildRelations(child, {
        session,
        resolvedImports: {
          importMap: new Map([['Base', parentSymbol.id]]),
          fileImports: ['ws:src/Base.php'],
        },
      })

      const extendsRelation = relations.find(
        (relation: Relation) => relation.type === RelationType.Extends,
      )
      expect(extendsRelation?.target).toBe(parentSymbol.id)
      // `class Child extends Base {}` on line 4: the range is the written `extends` name.
      const nameColumn = 'class Child extends '.length
      const expectedSourceRange = {
        startLine: 4,
        startColumn: nameColumn,
        endLine: 4,
        endColumn: nameColumn + 'Base'.length,
      }
      expect(childSymbol.line).toBe(4)
      const expectedImportProvenance = {
        kind: 'import',
        requestedName: 'Base',
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
    })
  })

  describe('Pass 2 session isolation', () => {
    const roots: string[] = []
    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
    })

    const resolveWithPsr4 = (
      autoloadDir: string,
    ): { resolved: readonly string[]; target: string } => {
      const root = mkdtempSync(join(tmpdir(), 'php-psr4-'))
      roots.push(root)
      writeFileSync(
        join(root, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': `${autoloadDir}/` } } }),
      )
      const session = new InMemoryIndexSession()
      const filePath = join(root, 'main.php')
      registerPhp(session, filePath)
      const draft = baseAdapter.analyzeFile(
        filePath,
        '<?php\nuse App\\Models\\User;\nclass Main {}',
        { session, workspaceName: 'ws', codeRoot: root, repoRoot: root },
      )
      const analysis = session.registerAnalysis({ filePath, analysis: draft })
      const target = join(root, autoloadDir, 'Models', 'User.php')
      registerPhp(session, target)
      // Pass 2 must rely on session-prepared metadata only: remove the manifest from disk.
      rmSync(join(root, 'composer.json'))
      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map(),
        codeRoot: root,
        repoRoot: root,
      })
      return { resolved: resolved.fileImports, target }
    }

    it('resolves from prepared metadata after the manifest disappears from disk', () => {
      const { resolved, target } = resolveWithPsr4('src')
      expect(resolved).toEqual([target])
    })

    it('does not leak PSR-4 maps between consecutive sessions', () => {
      const first = resolveWithPsr4('src')
      const second = resolveWithPsr4('lib')
      expect(first.resolved).toEqual([first.target])
      expect(second.resolved).toEqual([second.target])
      expect(second.target).toContain('lib')
    })

    it('treats missing session metadata as unresolved instead of rereading disk', () => {
      const root = mkdtempSync(join(tmpdir(), 'php-psr4-missing-'))
      roots.push(root)
      writeFileSync(
        join(root, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
      )
      const session = new InMemoryIndexSession()
      const filePath = join(root, 'main.php')
      registerPhp(session, filePath)
      // Analyzed without a codeRoot, so no metadata is prepared for this session.
      const draft = baseAdapter.analyzeFile(
        filePath,
        '<?php\nuse App\\Models\\User;\nclass Main {}',
        { session, workspaceName: 'ws' },
      )
      const analysis = session.registerAnalysis({ filePath, analysis: draft })
      registerPhp(session, join(root, 'src', 'Models', 'User.php'))

      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map(),
        codeRoot: root,
        repoRoot: root,
      })

      expect(resolved.fileImports).toEqual([])
    })
  })
})

describe('PHP routine-local and module state classification', () => {
  it('keeps routine locals and static variables out of the logical surface', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:s.php',
      projectRelativePath: 'ws:s.php',
      language: 'php',
      contentHash: 'x',
      workspace: 'ws',
    })
    const draft = baseAdapter.analyzeFile(
      'ws:s.php',
      '<?php\nconst MODULE = 1;\nfunction run() {\n  $localVar = 1;\n  static $counter = 0;\n}\n',
      { session, workspaceName: 'ws' },
    )
    const logical = (draft.referenceFacts?.declarations ?? []).map(
      (declaration) => parseLogicalSymbol(declaration.logicalId ?? '')?.name,
    )

    expect(logical.sort()).toEqual(['MODULE', 'run'])
    expect(draft.symbols.some((symbol) => ['localVar', 'counter'].includes(symbol.name))).toBe(
      false,
    )
  })
})

describe('PhpLanguageAdapter calls, PSR-4 arrays and written hierarchy spelling', () => {
  const callsFrom = (
    filePath: string,
    content: string,
    others: readonly SymbolNode[] = [],
  ): Relation[] =>
    adapter
      .extractRelations(filePath, content, others)
      .filter((relation: Relation) => relation.type === RelationType.Calls)

  const symbolNamed = (symbols: readonly SymbolNode[], name: string): SymbolNode =>
    symbols.find((symbol) => symbol.name === name)!

  it('emits a CALLS fact for a free function call to a same-file function', () => {
    const filePath = 'ws:src/f.php'
    const content = '<?php\nfunction helper() {}\nfunction run() {\n  helper();\n}\n'
    const symbols = adapter.extractSymbols(filePath, content)

    expect(callsFrom(filePath, content)).toEqual([
      expect.objectContaining({
        source: symbolNamed(symbols, 'run').id,
        target: symbolNamed(symbols, 'helper').id,
      }),
    ])
  })

  it('emits nothing for a free call to a function that is neither imported nor in the file', () => {
    const other = adapter.extractSymbols('ws:src/other.php', '<?php\nfunction helper() {}\n')
    const content = '<?php\nfunction run() {\n  helper();\n  strlen("x");\n}\n'

    expect(callsFrom('ws:src/f.php', content, other)).toEqual([])
  })

  it('resolves self:: and static:: calls to methods of the enclosing class', () => {
    const filePath = 'ws:src/c.php'
    const content = [
      '<?php',
      'class C {',
      '  public static function a() {}',
      '  public static function b() {}',
      '  public function run() {',
      '    self::a();',
      '    static::b();',
      '  }',
      '}',
    ].join('\n')
    const symbols = adapter.extractSymbols(filePath, content)
    const run = symbolNamed(symbols, 'run')

    const targets = callsFrom(filePath, content)
      .filter((relation: Relation) => relation.source === run.id)
      .map((relation: Relation) => relation.target)
      .sort()
    expect(targets).toEqual([symbolNamed(symbols, 'a').id, symbolNamed(symbols, 'b').id].sort())
  })

  it('resolves parent:: calls to the base class method', () => {
    const base = adapter.extractSymbols(
      'ws:src/base.php',
      '<?php\nclass Base {\n  public function boot() {}\n}\n',
    )
    const filePath = 'ws:src/child.php'
    const content =
      '<?php\nclass Child extends Base {\n  public function boot() {\n    parent::boot();\n  }\n}\n'
    const symbols = adapter.extractSymbols(filePath, content)

    const calls = callsFrom(filePath, content, base)
    expect(calls).toEqual([
      expect.objectContaining({
        source: symbolNamed(symbols, 'boot').id,
        target: symbolNamed(base, 'boot').id,
      }),
    ])
  })

  it('resolves Class::method() for a class declared in the same file and ignores unknown classes', () => {
    const filePath = 'ws:src/s.php'
    const content = [
      '<?php',
      'class Util {',
      '  public static function make() {}',
      '}',
      'function run() {',
      '  Util::make();',
      '  Ghost::make();',
      '}',
    ].join('\n')
    const symbols = adapter.extractSymbols(filePath, content)

    expect(callsFrom(filePath, content)).toEqual([
      expect.objectContaining({
        source: symbolNamed(symbols, 'run').id,
        target: symbolNamed(symbols, 'make').id,
      }),
    ])
  })

  describe('composer PSR-4 arrays', () => {
    const roots: string[] = []
    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
    })

    it('accepts an array of directories for one prefix and picks the indexed candidate', () => {
      const root = mkdtempSync(join(tmpdir(), 'php-psr4-array-'))
      roots.push(root)
      writeFileSync(
        join(root, 'composer.json'),
        JSON.stringify({ autoload: { 'psr-4': { 'App\\': ['src/', 'lib/'] } } }),
      )
      const session = new InMemoryIndexSession()
      const filePath = join(root, 'main.php')
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'php',
        contentHash: 'x',
        workspace: 'ws',
      })
      const analysis = session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(
          filePath,
          '<?php\nuse App\\Models\\User;\nclass Main {}',
          {
            session,
            workspaceName: 'ws',
            codeRoot: root,
            repoRoot: root,
          },
        ),
      })
      const target = join(root, 'lib', 'Models', 'User.php')
      session.registerFile({
        filePath: target,
        projectRelativePath: target,
        language: 'php',
        contentHash: 'x',
        workspace: 'ws',
      })

      const resolved = baseAdapter.resolveImports(analysis, {
        session,
        qualifiedNames: new Map(),
        packageToWorkspace: new Map(),
        codeRoot: root,
        repoRoot: root,
      })

      expect(resolved.fileImports).toEqual([target])
    })
  })

  describe('hierarchy targets keep their written spelling', () => {
    const analyzeInto = (
      session: InMemoryIndexSession,
      filePath: string,
      content: string,
    ): ReturnType<InMemoryIndexSession['registerAnalysis']> => {
      session.registerFile({
        filePath,
        projectRelativePath: filePath,
        language: 'php',
        contentHash: 'x',
        workspace: 'ws',
      })
      return session.registerAnalysis({
        filePath,
        analysis: baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' }),
      })
    }
    const extendsTargets = (
      session: InMemoryIndexSession,
      analysis: ReturnType<InMemoryIndexSession['registerAnalysis']>,
    ): string[] =>
      baseAdapter
        .buildRelations(analysis, {
          session,
          resolvedImports: baseAdapter.resolveImports(analysis, {
            session,
            qualifiedNames: session.getQualifiedNames(),
            packageToWorkspace: new Map(),
          }),
        })
        .filter((relation: Relation) => relation.type === RelationType.Extends)
        .map((relation: Relation) => relation.target)

    it('resolves a fully qualified parent through its namespace, not by its tail name', () => {
      const session = new InMemoryIndexSession()
      const wanted = analyzeInto(session, 'ws:src/A/Base.php', '<?php\nnamespace A;\nclass Base {}')
      analyzeInto(session, 'ws:src/B/Base.php', '<?php\nnamespace B;\nclass Base {}')
      const child = analyzeInto(
        session,
        'ws:src/Child.php',
        '<?php\nnamespace App;\nclass Child extends \\A\\Base {}',
      )

      expect(extendsTargets(session, child)).toEqual([
        wanted.symbols.find((symbol) => symbol.name === 'Base')!.id,
      ])
    })

    it('does not match an unrelated same-named import for a different qualified parent', () => {
      const session = new InMemoryIndexSession()
      analyzeInto(session, 'ws:src/B/Base.php', '<?php\nnamespace B;\nclass Base {}')
      const child = analyzeInto(
        session,
        'ws:src/Child.php',
        '<?php\nnamespace App;\nuse B\\Base;\nclass Child extends Other\\Base {}',
      )

      expect(extendsTargets(session, child)).toEqual([])
    })
  })
})

describe('PHP imported clause-name ranges', () => {
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

  it('records the written-name range for implements and trait edges', () => {
    const classLine = 'class C implements I {'
    const useLine = '  use T;'
    const edges = hierarchyRanges(
      'php',
      {
        'ws:I.php': '<?php\ninterface I {}\n',
        'ws:T.php': '<?php\ntrait T {}\n',
        'ws:C.php': `<?php\n${classLine}\n${useLine}\n}\n`,
      },
      'ws:C.php',
      (session) =>
        new Map([
          ['I', idOf(session, 'ws:I.php', 'I')],
          ['T', idOf(session, 'ws:T.php', 'T')],
        ]),
    )

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: RelationType.Implements,
          range: at(2, classLine, 'I'),
        }),
        expect.objectContaining({
          type: RelationType.UsesType,
          range: at(3, useLine, 'T'),
        }),
      ]),
    )
  })
})

describe('PHP structural boundary regressions', () => {
  const analyze = (filePath: string, content: string) => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath,
      projectRelativePath: filePath,
      language: 'php',
      contentHash: 'x',
      workspace: 'ws',
    })
    return baseAdapter.analyzeFile(filePath, content, { session, workspaceName: 'ws' })
  }
  const callerName = (draft: ReturnType<typeof analyze>, call: string): string | undefined => {
    const fact = draft.callFacts.find((item) => item.name === call)
    return draft.symbols.find((symbol) => symbol.id === fact?.callerSymbolId)?.name
  }

  it('keeps the method as caller after a method-local assignment', () => {
    const draft = analyze(
      'ws:c.php',
      '<?php\nclass C {\n  public function doWork() {\n    $x = helper();\n    after();\n  }\n}\n',
    )

    expect(callerName(draft, 'helper')).toBe('doWork')
    expect(callerName(draft, 'after')).toBe('doWork')
    expect(draft.symbols.map((symbol) => symbol.name)).not.toContain('x')
  })

  it('keeps distinct owners and column-correct callers for compact one-line classes', () => {
    const draft = analyze(
      'ws:compact.php',
      '<?php\nclass A { function a() { x(); } } class B { function b() { y(); } }\n',
    )
    const ownerOf = (method: string): string | undefined => {
      const symbol = draft.symbols.find((item) => item.name === method)
      return draft.symbols.find((item) => item.id === symbol?.parentId)?.name
    }

    expect(ownerOf('a')).toBe('A')
    expect(ownerOf('b')).toBe('B')
    expect(callerName(draft, 'x')).toBe('a')
    expect(callerName(draft, 'y')).toBe('b')
  })

  it('does not let braces or keywords inside strings and heredocs change structure', () => {
    const draft = analyze(
      'ws:look.php',
      [
        '<?php',
        'class C {',
        '  public function m() {',
        '    $s = "} class Fake { function f() {";',
        '    $h = <<<EOT',
        '} class Other { function g() {',
        'EOT;',
        '    z();',
        '  }',
        '}',
      ].join('\n'),
    )

    expect(draft.symbols.map((symbol) => symbol.name).sort()).toEqual(['C', 'm'])
    expect(callerName(draft, 'z')).toBe('m')
  })
})

describe('PHP framework loader families', () => {
  interface LoaderFamily {
    readonly name: string
    readonly filePath: string
    readonly call: string
    readonly targetPath: string
    readonly targetCode: string
  }
  const klass = (name: string): string => `<?php\nclass ${name} { public function go(): void {} }`
  const families: readonly LoaderFamily[] = [
    {
      name: 'CakePHP ClassRegistry::init',
      filePath: 'php-app:app/controllers/posts_controller.php',
      call: "ClassRegistry::init('Article');",
      targetPath: 'php-app:app/models/article.php',
      targetCode: klass('Article'),
    },
    {
      name: 'CakePHP App::import',
      filePath: 'php-app:app/controllers/posts_controller.php',
      call: "App::import('Model', 'Article');",
      targetPath: 'php-app:app/models/article.php',
      targetCode: klass('Article'),
    },
    {
      name: 'CodeIgniter load->helper',
      filePath: 'ci:application/controllers/ctrl.php',
      call: "$this->load->helper('url');",
      targetPath: 'ci:application/helpers/url_helper.php',
      targetCode: '<?php\nfunction site_url() {}',
    },
    {
      name: 'Laravel resolve()',
      filePath: 'laravel:app/Http/PostController.php',
      call: 'resolve(App\\Services\\Mailer::class);',
      targetPath: 'laravel:src/App/Services/Mailer.php',
      targetCode: klass('Mailer'),
    },
    {
      name: 'Laravel app()',
      filePath: 'laravel:app/Http/PostController.php',
      call: 'app(App\\Services\\Mailer::class);',
      targetPath: 'laravel:src/App/Services/Mailer.php',
      targetCode: klass('Mailer'),
    },
    {
      name: 'Symfony $this->get()',
      filePath: 'symfony:src/Controller/PostController.php',
      call: '$this->get(App\\Service\\Mailer::class);',
      targetPath: 'symfony:src/App/Service/Mailer.php',
      targetCode: klass('Mailer'),
    },
    {
      name: 'Yii::createObject',
      filePath: 'yii:protected/controllers/PostController.php',
      call: 'Yii::createObject(App\\Services\\Mailer::class);',
      targetPath: 'yii:src/App/Services/Mailer.php',
      targetCode: klass('Mailer'),
    },
    {
      name: 'Zend_Loader::loadClass',
      filePath: 'zend:library/PostController.php',
      call: "Zend_Loader::loadClass('Mailer');",
      targetPath: 'zend:src/Mailer.php',
      targetCode: klass('Mailer'),
    },
  ]
  const host = (body: string): string =>
    `<?php\nclass Host {\n  public function run() {\n${body}\n  }\n}\n`
  const importsOf = (family: LoaderFamily, content: string): string[] =>
    adapter
      .extractRelations(
        family.filePath,
        content,
        adapter.extractSymbols(family.targetPath, family.targetCode),
        new Map(),
      )
      .filter((relation: Relation) => relation.type === RelationType.Imports)
      .map((relation: Relation) => relation.target)

  it.each(families)('$name: a real call imports the indexed target', (family) => {
    expect(importsOf(family, host(`    ${family.call}`))).toEqual([family.targetPath])
  })

  it.each(families)('$name: a call without an indexed target imports nothing', (family) => {
    const relations = adapter
      .extractRelations(family.filePath, host(`    ${family.call}`), [], new Map())
      .filter((relation: Relation) => relation.type === RelationType.Imports)

    expect(relations).toEqual([])
  })

  it.each(families)(
    '$name: the same text in a comment, string and heredoc imports nothing',
    (family) => {
      const decoys = [
        `    // ${family.call}`,
        `    /* ${family.call} */`,
        `    $text = "${family.call.replaceAll('"', '')}";`,
        '    $doc = <<<EOT',
        family.call,
        'EOT;',
      ].join('\n')

      expect(importsOf(family, host(decoys))).toEqual([])
    },
  )

  it('Drupal::service never invents a target for a service id', () => {
    const family: LoaderFamily = {
      name: 'Drupal::service',
      filePath: 'drupal:modules/custom/src/Controller.php',
      call: "\\Drupal::service('foo.bar');",
      targetPath: 'drupal:src/FooBar.php',
      targetCode: klass('FooBar'),
    }

    expect(importsOf(family, host(`    ${family.call}`))).toEqual([])
  })
})
