# Verification: Language Adapter

## Requirements

### Requirement: LanguageAdapter interface

#### Scenario: Adapter declares supported language identifiers

- **WHEN** `languages()` is called on the TypeScript adapter
- **THEN** it returns `['typescript', 'tsx', 'javascript', 'jsx']`

#### Scenario: Adapter declares extension map

- **WHEN** `extensions()` is called on the TypeScript adapter
- **THEN** it returns mappings for `.ts`, `.tsx`, `.js`, and `.jsx`

#### Scenario: extractRelations may emit hierarchy relations

- **GIVEN** a file containing resolvable inheritance or implementation declarations
- **WHEN** `extractRelations()` is called
- **THEN** the result may include `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations alongside the existing relation types

### Requirement: Language detection

#### Scenario: Unrecognized extension skipped

- **GIVEN** a file `README.md` with no registered adapter for `.md`
- **WHEN** `getAdapterForFile('README.md')` is called
- **THEN** `undefined` is returned and no error is thrown

#### Scenario: TypeScript extension mapped

- **WHEN** `getAdapterForFile('src/index.ts')` is called
- **THEN** the `TypeScriptLanguageAdapter` is returned

#### Scenario: JSX extension mapped

- **WHEN** `getAdapterForFile('src/App.jsx')` is called
- **THEN** the `TypeScriptLanguageAdapter` is returned (it handles jsx)

### Requirement: TypeScript adapter

#### Scenario: Function declaration extracted

- **GIVEN** content containing `function createUser(name: string) { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'createUser'`, `kind: 'function'` is returned

#### Scenario: Arrow function assigned to const extracted

- **GIVEN** content containing `export const validate = (input: string) => { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'validate'`, `kind: 'function'` is returned

#### Scenario: Class and method extracted separately

- **GIVEN** content containing `class AuthService { login() { ... } }`
- **WHEN** `extractSymbols()` is called
- **THEN** two symbols are returned: one `class` named `AuthService` and one `method` named `login`

#### Scenario: Interface extracted

- **GIVEN** content containing `export interface UserRepository { ... }`
- **WHEN** `extractSymbols()` is called
- **THEN** a `SymbolNode` with `name: 'UserRepository'`, `kind: 'interface'` is returned

#### Scenario: JSDoc comment extracted with symbol

- **GIVEN** content containing:
- **WHEN** `extractSymbols()` is called
- **THEN** the `createUser` symbol has `comment: '/** Creates a user in the system. */'`

#### Scenario: Multi-line JSDoc extracted

- **GIVEN** content with a multi-line JSDoc block before a class declaration
- **WHEN** `extractSymbols()` is called
- **THEN** `comment` contains the full JSDoc text including newlines

#### Scenario: No comment yields undefined

- **GIVEN** content containing a function with no preceding comment
- **WHEN** `extractSymbols()` is called
- **THEN** the symbol's `comment` is `undefined`

#### Scenario: EXPORTS relation created for exported symbol

- **GIVEN** content containing `export function createUser() { ... }`
- **WHEN** `extractRelations()` is called
- **THEN** an `EXPORTS` relation from the file to the `createUser` symbol is returned

#### Scenario: IMPORTS relation created for import statement

- **GIVEN** content containing `import { createUser } from './user.ts'`
- **WHEN** `extractRelations()` is called with the appropriate import map
- **THEN** an `IMPORTS` relation from the current file to the resolved target file is returned

### Requirement: Import declaration extraction

#### Scenario: TypeScript named imports parsed

- **GIVEN** content containing `import { createUser, type Config } from '@specd/core'`
- **WHEN** `extractImportedNames()` is called
- **THEN** two declarations are returned: `createUser` and `Config`, both with specifier `'@specd/core'` and `isRelative: false`

#### Scenario: Relative import detected

- **GIVEN** content containing `import { helper } from './utils.js'`
- **WHEN** `extractImportedNames()` is called
- **THEN** one declaration is returned with `isRelative: true` and specifier `'./utils.js'`

#### Scenario: Aliased import preserves both names

- **GIVEN** content containing `import { foo as bar } from './mod.js'`
- **WHEN** `extractImportedNames()` is called
- **THEN** the declaration has `originalName: 'foo'` and `localName: 'bar'`

#### Scenario: Python relative import

- **GIVEN** content containing `from .utils import helper`
- **WHEN** `extractImportedNames()` is called on a Python adapter
- **THEN** one declaration is returned with `isRelative: true`

#### Scenario: Go imports are never relative

- **GIVEN** content containing `import "fmt"`
- **WHEN** `extractImportedNames()` is called on a Go adapter
- **THEN** the declaration has `isRelative: false`

### Requirement: Call resolution

#### Scenario: Call resolved via import map

- **GIVEN** a function `processOrder` that calls `validateUser()`
- **AND** `validateUser` was imported from `./auth.ts`
- **WHEN** `extractRelations()` is called with the import map containing `validateUser → auth.ts:validateUser`
- **THEN** a `CALLS` relation from `processOrder` to `validateUser` is returned

#### Scenario: Unresolvable call silently dropped

- **GIVEN** a function that calls `console.log()` (a global built-in)
- **WHEN** `extractRelations()` is called
- **THEN** no `CALLS` relation is created for that call and no error is thrown

#### Scenario: Top-level call silently dropped

- **GIVEN** a call expression `init()` at module top level (not inside any function or class)
- **WHEN** `extractRelations()` is called
- **THEN** no `CALLS` relation is created for that call

### Requirement: Hierarchy extraction

#### Scenario: Class inheritance emits EXTENDS

- **GIVEN** a supported language file declaring a type that inherits from a resolvable base type
- **WHEN** `extractRelations()` is called
- **THEN** an `EXTENDS` relation is emitted

#### Scenario: Interface or contract fulfillment emits IMPLEMENTS

- **GIVEN** a supported language file declaring a type that fulfills a resolvable contract-like type
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPLEMENTS` relation is emitted

#### Scenario: Overriding method emits OVERRIDES

- **GIVEN** a supported language file declaring a method that can be matched deterministically to an inherited or contract method
- **WHEN** `extractRelations()` is called
- **THEN** an `OVERRIDES` relation is emitted

#### Scenario: Normalizable inheritance-adjacent construct maps to the base model

- **GIVEN** a supported language construct that is not classical inheritance but preserves useful semantics when normalized
- **WHEN** `extractRelations()` is called
- **THEN** the emitted relation uses one of `EXTENDS`, `IMPLEMENTS`, or `OVERRIDES`

#### Scenario: Unresolvable hierarchy target is silently dropped

- **GIVEN** a hierarchy declaration whose target cannot be resolved deterministically
- **WHEN** `extractRelations()` is called
- **THEN** no hierarchy relation is emitted
- **AND** no error is thrown

### Requirement: Adapter registry

#### Scenario: TypeScript adapter registered by default

- **WHEN** a new `AdapterRegistry` is created
- **THEN** `getAdapter('typescript')` returns the `TypeScriptLanguageAdapter`

#### Scenario: Custom adapter extends registry

- **GIVEN** a custom adapter declaring `languages(): ['python']` and `extensions(): { '.py': 'python' }`
- **WHEN** `register(adapter)` is called
- **THEN** `getAdapter('python')` returns that adapter
- **AND** `getAdapterForFile('main.py')` returns that adapter
- **AND** `getAdapter('typescript')` still returns the TypeScript adapter

#### Scenario: Extension map built from adapters

- **GIVEN** a fresh `AdapterRegistry` with no adapters registered
- **WHEN** an adapter with `extensions(): { '.rs': 'rust' }` is registered
- **THEN** `getAdapterForFile('main.rs')` returns that adapter
- **AND** `getLanguageForFile('main.rs')` returns `'rust'`

#### Scenario: Later registration overrides earlier

- **GIVEN** two adapters both declaring `languages(): ['typescript']`
- **WHEN** both are registered in sequence
- **THEN** `getAdapter('typescript')` returns the second adapter

### Requirement: Package identity extraction

#### Scenario: TypeScript adapter reads package.json

- **GIVEN** a directory containing `package.json` with `{"name": "@specd/core"}`
- **WHEN** `getPackageIdentity(codeRoot)` is called on the TypeScript adapter
- **THEN** it returns `'@specd/core'`

#### Scenario: No manifest returns undefined

- **GIVEN** a directory with no `package.json`
- **WHEN** `getPackageIdentity(codeRoot)` is called on the TypeScript adapter
- **THEN** it returns `undefined`

#### Scenario: Go adapter reads go.mod

- **GIVEN** a directory containing `go.mod` with `module github.com/acme/auth`
- **WHEN** `getPackageIdentity(codeRoot)` is called on the Go adapter
- **THEN** it returns `'github.com/acme/auth'`

#### Scenario: Python adapter reads pyproject.toml

- **GIVEN** a directory containing `pyproject.toml` with `[project]` and `name = "acme-auth"`
- **WHEN** `getPackageIdentity(codeRoot)` is called on the Python adapter
- **THEN** it returns `'acme-auth'`

#### Scenario: PHP adapter reads composer.json

- **GIVEN** a directory containing `composer.json` with `{"name": "acme/auth"}`
- **WHEN** `getPackageIdentity(codeRoot)` is called on the PHP adapter
- **THEN** it returns `'acme/auth'`

#### Scenario: Adapter without getPackageIdentity

- **GIVEN** an adapter that does not implement `getPackageIdentity`
- **WHEN** the indexer queries it for a workspace's package identity
- **THEN** it returns `undefined` and cross-workspace resolution is skipped for that language

#### Scenario: Manifest found above codeRoot

- **GIVEN** a codeRoot at `/project/packages/core/src` with no `package.json`
- **AND** `/project/packages/core/package.json` exists with `name: '@specd/core'`
- **WHEN** `getPackageIdentity('/project/packages/core/src', '/project')` is called
- **THEN** it returns `'@specd/core'`

#### Scenario: Search bounded by repoRoot

- **GIVEN** a codeRoot at `/project/packages/core`
- **AND** `repoRoot` is `/project`
- **AND** `/package.json` exists above the repo root
- **WHEN** `getPackageIdentity` is called
- **THEN** it does not read `/package.json` — search stops at `/project`

### Requirement: Import specifier resolution

#### Scenario: TypeScript scoped package specifier

- **GIVEN** known packages `['@specd/core', '@specd/cli']`
- **WHEN** `resolvePackageFromSpecifier('@specd/core', knownPackages)` is called on the TS adapter
- **THEN** it returns `'@specd/core'`

#### Scenario: TypeScript bare package specifier

- **GIVEN** known packages `['lodash']`
- **WHEN** `resolvePackageFromSpecifier('lodash/fp', knownPackages)` is called on the TS adapter
- **THEN** it returns `'lodash'`

#### Scenario: Go module specifier resolved by longest prefix

- **GIVEN** known packages `['github.com/acme/auth']`
- **WHEN** `resolvePackageFromSpecifier('github.com/acme/auth/models', knownPackages)` is called on the Go adapter
- **THEN** it returns `'github.com/acme/auth'`

#### Scenario: Python package specifier with hyphen normalization

- **GIVEN** known packages `['acme-auth']`
- **WHEN** `resolvePackageFromSpecifier('acme_auth.models', knownPackages)` is called on the Python adapter
- **THEN** it returns `'acme-auth'`

#### Scenario: Unknown specifier returns undefined

- **GIVEN** known packages `['@specd/core']`
- **WHEN** `resolvePackageFromSpecifier('express', knownPackages)` is called
- **THEN** it returns `undefined`

#### Scenario: TypeScript relative import path resolution

- **GIVEN** a file at `core/src/commands/create.ts`
- **WHEN** `resolveRelativeImportPath('core/src/commands/create.ts', '../utils.js')` is called
- **THEN** it returns `'core/src/utils.ts'` (`.js` → `.ts`, path traversal applied)

#### Scenario: PHP qualified name construction

- **WHEN** `buildQualifiedName('App\\Models', 'User')` is called on the PHP adapter
- **THEN** it returns `'App\\Models\\User'`

#### Scenario: PSR-4 resolves qualified name to file path

- **GIVEN** a `codeRoot` containing `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `resolveQualifiedNameToPath('App\\Models\\User', codeRoot)` is called on the PHP adapter
- **THEN** it returns the absolute path `{codeRoot}/src/Models/User.php`

#### Scenario: PSR-4 uses longest prefix match

- **GIVEN** `composer.json` with `autoload.psr-4: { "App\\": "src/", "App\\Models\\": "src/models/" }`
- **WHEN** `resolveQualifiedNameToPath('App\\Models\\User', codeRoot)` is called
- **THEN** it returns `{codeRoot}/src/models/User.php` (longer prefix wins)

#### Scenario: Qualified name with no matching prefix returns undefined

- **GIVEN** `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `resolveQualifiedNameToPath('Vendor\\Lib\\Foo', codeRoot)` is called
- **THEN** it returns `undefined`

#### Scenario: No composer.json returns undefined

- **GIVEN** a `codeRoot` with no `composer.json` at or above it (bounded by `repoRoot`)
- **WHEN** `resolveQualifiedNameToPath('App\\Models\\User', codeRoot)` is called
- **THEN** it returns `undefined` and no error is thrown

#### Scenario: PSR-4 map cached across calls

- **GIVEN** a `codeRoot` with a valid `composer.json`
- **WHEN** `resolveQualifiedNameToPath` is called twice with different qualified names
- **THEN** `composer.json` is read from disk only once

### Requirement: PHP require/include dependencies

#### Scenario: require_once with relative string literal emits IMPORTS

- **GIVEN** a PHP file at `app/controllers/PostsController.php` containing `require_once '../models/Post.php'`
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned from `app/controllers/PostsController.php` to `app/models/Post.php`

#### Scenario: include with relative path emits IMPORTS

- **GIVEN** a PHP file containing `include 'helpers/url_helper.php'`
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned pointing to `helpers/url_helper.php` relative to the file's directory

#### Scenario: require with PHP constant expression silently dropped

- **GIVEN** a PHP file containing `require_once APPPATH . 'models/Post.php'`
- **WHEN** `extractRelations()` is called
- **THEN** no `IMPORTS` relation is created for that expression and no error is thrown

#### Scenario: require with variable silently dropped

- **GIVEN** a PHP file containing `require_once $path`
- **WHEN** `extractRelations()` is called
- **THEN** no relation is created for that expression and no error is thrown

#### Scenario: require_once alongside use statements both processed

- **GIVEN** a PHP file containing both `use App\Models\User;` and `require_once 'bootstrap.php'`
- **WHEN** `extractRelations()` is called with a populated importMap
- **THEN** an `IMPORTS` relation for `bootstrap.php` is returned
- **AND** an `IMPORTS` relation for the resolved `User` class is also returned (via importMap)

### Requirement: PHP dynamic loader dependencies

#### Scenario: loadModel emits IMPORTS when target resolves

- **GIVEN** a PHP file containing `$this->loadModel('User')`
- **AND** resolver rules can map `User` to a concrete file
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned to that target file

#### Scenario: CodeIgniter load->model emits IMPORTS when target resolves

- **GIVEN** a PHP file containing `$this->load->model('User_model')`
- **AND** resolver rules can map `User_model` to a concrete file
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned

#### Scenario: App::uses emits IMPORTS when target resolves

- **GIVEN** a PHP file containing `App::uses('Controller', 'Controller')`
- **AND** resolver rules can map the class to a concrete file
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned

#### Scenario: CakePHP uses property emits IMPORTS when literals resolve

- **GIVEN** a controller class declaring `var $uses = array('Article', 'Category')`
- **AND** resolver rules can map both entries to concrete files
- **WHEN** `extractRelations()` is called
- **THEN** `IMPORTS` relations are returned for both resolved targets

#### Scenario: Bare Cake loaders are supported

- **GIVEN** a PHP file containing `loadController('Admin')` and `loadComponent('Auth')`
- **WHEN** `extractRelations()` is called
- **THEN** loader resolver rules are applied to both calls

#### Scenario: Class-literal framework acquisition emits IMPORTS when target resolves

- **GIVEN** a PHP file containing a framework acquisition call with an explicit class target
- **AND** resolver rules can map that class target to a concrete file
- **WHEN** `extractRelations()` is called
- **THEN** an `IMPORTS` relation is returned to that target file

#### Scenario: Dynamic argument silently dropped

- **GIVEN** a PHP file containing `$this->loadModel($modelName)`
- **WHEN** `extractRelations()` is called
- **THEN** no relation is created for that call and no error is thrown

#### Scenario: Unresolvable target silently dropped

- **GIVEN** a PHP file containing a known loader call with literal argument
- **AND** resolver rules cannot map it to a target file
- **WHEN** `extractRelations()` is called
- **THEN** no relation is created for that call and no error is thrown

#### Scenario: Runtime-only service identifier is not treated as a deterministic dependency

- **GIVEN** a PHP file containing a framework service lookup identified only by a string service ID
- **AND** resolver rules do not define a deterministic file target for that service ID
- **WHEN** `extractRelations()` is called
- **THEN** no `IMPORTS` relation is created from that lookup

### Requirement: PHP loaded-instance call extraction

#### Scenario: Member call on loaded alias emits CALLS

- **GIVEN** a method containing `loadModel('Article')` and later `$this->Article->save()`
- **WHEN** `extractRelations()` runs with resolvable caller and callee symbols
- **THEN** a `CALLS` relation is emitted from caller symbol to callee symbol

#### Scenario: Local variable alias emits CALLS

- **GIVEN** a method containing `$model = $this->Article` and later `$model->find()`
- **WHEN** both symbols are resolvable
- **THEN** a `CALLS` relation is emitted

#### Scenario: CakePHP uses property makes framework-managed alias available to methods

- **GIVEN** a class declaring `var $uses = array('Article')`
- **AND** one of its methods calls `$this->Article->save()`
- **WHEN** caller and callee symbols are resolvable
- **THEN** a `CALLS` relation is emitted from that method to `Article::save`

#### Scenario: Bare loader form feeds the same alias resolution as receiver-based form

- **GIVEN** a method containing `loadComponent('Auth')`
- **AND** the same method later calls `$this->Auth->login()`
- **WHEN** caller and callee symbols are resolvable
- **THEN** a `CALLS` relation is emitted

#### Scenario: Explicit instance construction after framework loading emits CALLS

- **GIVEN** a method containing `loadModel('Article')`
- **AND** the same method later assigns `$article = new Article()` and calls `$article->save()`
- **WHEN** caller and callee symbols are resolvable
- **THEN** a `CALLS` relation is emitted

#### Scenario: Class-literal service acquisition emits CALLS when target is statically known

- **GIVEN** a method assigns a framework-managed service acquisition with an explicit class target to a local variable
- **AND** the same method later calls a method on that variable
- **WHEN** the service class and callee method symbols are resolvable
- **THEN** a `CALLS` relation is emitted

#### Scenario: Runtime-only service identifier is not promoted to CALLS

- **GIVEN** a method fetches a service using only a runtime string identifier
- **AND** no deterministic class target can be resolved
- **WHEN** a method call is later made on the fetched value
- **THEN** no `CALLS` relation is emitted from that dynamic lookup

#### Scenario: Cross-method alias propagation is not performed

- **GIVEN** alias assignment in one method and method call in another
- **WHEN** `extractRelations()` runs
- **THEN** no `CALLS` relation is emitted from cross-method alias propagation
