import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
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

      expect(relations.some((relation) => relation.type === RelationType.Extends)).toBe(true)
      expect(relations.some((relation) => relation.type === RelationType.Implements)).toBe(true)
      expect(relations.some((relation) => relation.type === RelationType.Overrides)).toBe(true)
    })

    it('creates EXTENDS for imported base classes', () => {
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
      const extendsRelation = relations.find((relation) => relation.type === RelationType.Extends)
      expect(extendsRelation?.target).toBe('src/BaseService.php:class:BaseService:1:0')
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
    it('require_once with relative string literal emits IMPORTS', () => {
      const filePath = '/var/www/app/controllers/PostsController.php'
      const content = `<?php\nrequire_once '../models/Post.php';`
      const relations = adapter.extractRelations(filePath, content, [], new Map())
      const importsRels = relations.filter((r) => r.type === RelationType.Imports)
      expect(importsRels).toHaveLength(1)
      // path.resolve('/var/www/app/controllers', '../models/Post.php') = '/var/www/app/models/Post.php'
      expect(importsRels[0]!.target).toBe('/var/www/app/models/Post.php')
    })

    it('include with relative path emits IMPORTS', () => {
      const filePath = '/var/www/app/bootstrap.php'
      const content = `<?php\ninclude 'helpers/url_helper.php';`
      const relations = adapter.extractRelations(filePath, content, [], new Map())
      const importsRels = relations.filter((r) => r.type === RelationType.Imports)
      expect(importsRels).toHaveLength(1)
      expect(importsRels[0]!.target).toBe('/var/www/app/helpers/url_helper.php')
    })

    it('require with variable is silently dropped', () => {
      const content = `<?php\nrequire_once $path;`
      const relations = adapter.extractRelations('ctrl.php', content, [], new Map())
      expect(relations.filter((r) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('require with concatenation is silently dropped', () => {
      const content = `<?php\nrequire_once APPPATH . 'models/Post.php';`
      const relations = adapter.extractRelations('ctrl.php', content, [], new Map())
      expect(relations.filter((r) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('require_once alongside use statements produces require relation', () => {
      const filePath = '/var/www/app/controllers/PostsController.php'
      const content = `<?php\nuse App\\Models\\User;\nrequire_once 'bootstrap.php';`
      const importMap = new Map([['User', 'myws:src/Models/User.php:class:User:1']])
      const relations = adapter.extractRelations(filePath, content, [], importMap)
      const importsRels = relations.filter((r) => r.type === RelationType.Imports)
      expect(importsRels.some((r) => r.target === '/var/www/app/controllers/bootstrap.php')).toBe(
        true,
      )
      expect(importsRels.some((r) => r.target === 'myws:src/Models/User.php')).toBe(true)
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
      expect(relations.filter((r) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('unrelated ->get() is not detected', () => {
      const content = `<?php\nclass Foo {\n  public function bar() {\n    $this->get('someService');\n  }\n}`
      const relations = adapter.extractRelations('foo.php', content, [], new Map())
      expect(relations.filter((r) => r.type === RelationType.Imports)).toHaveLength(0)
    })

    it('multiple loaders in same file all detected', () => {
      const filePath = 'ci:application/controllers/ctrl.php'
      const content = `<?php\nclass Ctrl {\n  public function index() {\n    $this->loadModel('Post');\n    $this->load->library('email');\n  }\n}`
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
      expect(relations.filter((r) => r.type === RelationType.Imports)).toHaveLength(2)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      const caller = controllerSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
      const callee = targetSymbols.find((symbol) => symbol.kind === SymbolKind.Method)
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
      expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
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
      expect(relations.filter((relation) => relation.type === RelationType.Calls)).toHaveLength(0)
    })
  })
})
