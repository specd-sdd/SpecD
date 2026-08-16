# Verification: Language Adapter

## Requirements

### Requirement: LanguageAdapter interface

#### Scenario: Adapter declares supported language identifiers

- **WHEN** `languages()` is called on the TypeScript adapter
- **THEN** it returns `['typescript', 'tsx', 'javascript', 'jsx']`

#### Scenario: Adapter declares extension map

- **WHEN** `extensions()` is called on the TypeScript adapter
- **THEN** it returns mappings for `.ts`, `.tsx`, `.js`, and `.jsx`

#### Scenario: File analysis is complete and pure

- **GIVEN** a built-in adapter is called twice with the same `filePath`, `content`, and analyze context
- **WHEN** `analyzeFile()` is executed
- **THEN** it returns equivalent symbols, imports, deterministic facts, and namespace data both times
- **AND** it performs no side effects outside the provided session context

#### Scenario: Import resolution uses stored analysis rather than raw content

- **GIVEN** a registered `FileAnalysis` already exists for a file
- **WHEN** `resolveImports()` is called
- **THEN** the adapter resolves targets from the stored analysis facts and shared session lookups
- **AND** it does not require the original file content to be parsed again

#### Scenario: Relation building consumes stored facts

- **GIVEN** a file analysis contains deterministic imports, binding facts, and call facts
- **WHEN** `buildRelations()` is called
- **THEN** the result may include `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations
- **AND** those relations are derived from the stored analysis facts and resolved imports

#### Scenario: Adapter may update only compact run-scoped cache state

- **GIVEN** an adapter needs a shared run-scoped cache such as parsed package metadata
- **WHEN** it updates that cache during analysis or resolution
- **THEN** the update happens only through the `IndexSession` API provided in context
- **AND** no side effect escapes the indexing session

### Requirement: Full-file analysis contract

#### Scenario: Adapter emits all deterministic facts in one pass

- **GIVEN** a file contains symbols, import declarations, typed bindings, and deterministic call sites
- **WHEN** `analyzeFile()` runs
- **THEN** the returned `FileAnalysisDraft` contains all of those facts together
- **AND** the indexer does not need separate adapter entry points to gather them later

#### Scenario: Parser-specific state remains compact

- **GIVEN** an adapter wants to retain parser-specific state for later deterministic resolution
- **WHEN** it returns that state in `FileAnalysisDraft`
- **THEN** the retained state uses plain compact data structures
- **AND** it does not retain AST nodes or parser-runtime objects

### Requirement: Unified built-in adapter migration

#### Scenario: All built-in adapters implement the unified contract

- **GIVEN** the built-in TypeScript/JavaScript, PHP, Python, and Go adapters are registered
- **WHEN** the indexer executes Pass 1 and Pass 2
- **THEN** each built-in adapter participates through `analyzeFile()`, `resolveImports()`, and `buildRelations()`
- **AND** no legacy built-in extraction path is required

### Requirement: Language detection

#### Scenario: Registry uses adapter-declared extension mapping

- **GIVEN** adapters declare disjoint language and extension maps
- **WHEN** files are resolved through the registry
- **THEN** registered extensions select their declaring adapters
- **AND** an unknown extension is skipped without a node or error

#### Scenario: General contract contains no built-in extension table

- **WHEN** a built-in adapter adds or changes supported extensions
- **THEN** its specific spec and adapter registration change
- **AND** generic language detection requires no language-name branch

### Requirement: Import declaration extraction

#### Scenario: TypeScript named imports appear in file analysis

- **GIVEN** content containing `import { createUser, type Config } from '@specd/core'`
- **WHEN** `analyzeFile()` is called
- **THEN** the returned draft includes two import declarations: `createUser` and `Config`, both with specifier `'@specd/core'` and `isRelative: false`

#### Scenario: Relative import is marked relative

- **GIVEN** content containing `import { helper } from './utils.js'`
- **WHEN** `analyzeFile()` is called
- **THEN** the returned draft includes one import declaration with `isRelative: true` and specifier `'./utils.js'`

#### Scenario: Aliased import preserves both names

- **GIVEN** content containing `import { foo as bar } from './mod.js'`
- **WHEN** `analyzeFile()` is called
- **THEN** the import declaration has `originalName: 'foo'` and `localName: 'bar'`

#### Scenario: Python relative import is represented in the draft

- **GIVEN** content containing `from .utils import helper`
- **WHEN** `analyzeFile()` is called on a Python adapter
- **THEN** the returned import declaration has `isRelative: true`

#### Scenario: Go imports are never relative

- **GIVEN** content containing `import "fmt"`
- **WHEN** `analyzeFile()` is called on a Go adapter
- **THEN** the returned import declaration has `isRelative: false`

### Requirement: Call resolution

#### Scenario: Call is resolved via stored imports and facts

- **GIVEN** a function `processOrder` that calls `validateUser()`
- **AND** `validateUser` was imported from `./auth.ts`
- **WHEN** `buildRelations()` is called with resolved imports for the file analysis
- **THEN** a `CALLS` relation from `processOrder` to `validateUser` is returned

#### Scenario: Unresolvable call is silently dropped

- **GIVEN** a function that calls `console.log()` (a global built-in)
- **WHEN** `buildRelations()` is called
- **THEN** no `CALLS` relation is created for that call and no error is thrown

#### Scenario: Top-level call is silently dropped

- **GIVEN** a call expression `init()` at module top level (not inside any function or class)
- **WHEN** `analyzeFile()` extracts call facts and `buildRelations()` runs
- **THEN** no `CALLS` relation is created for that call

### Requirement: Scoped binding fact extraction

#### Scenario: TypeScript constructor parameter type becomes binding fact

- **GIVEN** TypeScript content containing `constructor(expander: TemplateExpander) {}`
- **WHEN** `analyzeFile()` is called
- **THEN** the returned binding facts associate `expander` with target type `TemplateExpander`
- **AND** no graph relation is emitted directly during fact extraction

#### Scenario: Receiver binding fact is extracted

- **GIVEN** a class method containing `this.repository.save()`
- **WHEN** `analyzeFile()` is called
- **THEN** the returned facts identify `this` as the enclosing class receiver
- **AND** the member call is represented as a call fact for shared resolution

#### Scenario: Runtime-only binding is dropped

- **GIVEN** source content fetches a service by a non-literal runtime identifier
- **WHEN** `analyzeFile()` is called
- **THEN** no binding fact is emitted for that service target

### Requirement: Built-in multi-language dependency coverage

#### Scenario: TypeScript dynamic and CommonJS imports are represented in file analysis

- **GIVEN** TypeScript content containing `import('./plugin.js')`, `require('./legacy.js')`, and `import './polyfill.js'`
- **WHEN** `analyzeFile()` is called
- **THEN** import declarations are returned for all three deterministic specifiers

#### Scenario: TypeScript constructor injection and construction are detectable

- **GIVEN** TypeScript content containing `constructor(expander: TemplateExpander)` and `new TemplateExpander(builtins)`
- **WHEN** `analyzeFile()` is called
- **THEN** facts identify the constructor-injected `TemplateExpander` dependency as a `USES_TYPE` candidate
- **AND** facts identify the constructor call as a `CONSTRUCTS` candidate

#### Scenario: Python literal dynamic import is represented in file analysis

- **GIVEN** Python content containing `importlib.import_module("acme.plugins.mailer")`
- **WHEN** `analyzeFile()` is called
- **THEN** a deterministic import declaration is returned for `acme.plugins.mailer`

#### Scenario: Go selector call is represented for shared resolution

- **GIVEN** Go content importing `models "github.com/acme/auth/models"` and calling `models.NewUser()`
- **WHEN** `analyzeFile()` is called
- **THEN** the import alias and selector call facts are available to shared resolution
- **AND** constructor-like/composite literal facts identify `CONSTRUCTS` candidates when present

#### Scenario: PHP framework-managed binding feeds shared facts

- **GIVEN** PHP content declaring `var $uses = array('Article')` and calling `$this->Article->save()`
- **WHEN** `analyzeFile()` is called
- **THEN** the framework-managed `Article` receiver and member call are represented as shared facts

#### Scenario: Specific adapter spec owns semantic coverage

- **GIVEN** one built-in adapter omits a deterministic language fact required by its specific spec
- **WHEN** indexing and resolution run
- **THEN** generic code does not compensate with a language-name branch
- **AND** the gap remains unsupported until the adapter emits the shared fact

### Requirement: Detectable dependency boundary

#### Scenario: Literal dynamic dependency is accepted

- **GIVEN** a supported adapter sees a dynamic import form with a string-literal target
- **WHEN** dependency facts are extracted
- **THEN** the target is included as a deterministic dependency candidate

#### Scenario: Non-literal dynamic dependency is dropped

- **GIVEN** a supported adapter sees a dynamic import form whose target is computed from a variable
- **WHEN** dependency facts are extracted
- **THEN** no persisted graph relation is created for that target

### Requirement: Hierarchy extraction

#### Scenario: Class inheritance emits EXTENDS

- **GIVEN** a supported language file declaring a type that inherits from a resolvable base type
- **WHEN** `buildRelations()` is called
- **THEN** an `EXTENDS` relation is emitted

#### Scenario: Interface or contract fulfillment emits IMPLEMENTS

- **GIVEN** a supported language file declaring a type that fulfills a resolvable contract-like type
- **WHEN** `buildRelations()` is called
- **THEN** an `IMPLEMENTS` relation is emitted

#### Scenario: Overriding method emits OVERRIDES

- **GIVEN** a supported language file declaring a method that can be matched deterministically to an inherited or contract method
- **WHEN** `buildRelations()` is called
- **THEN** an `OVERRIDES` relation is emitted

#### Scenario: Normalizable inheritance-adjacent construct maps to the base model

- **GIVEN** a supported language construct that is not classical inheritance but preserves useful semantics when normalized
- **WHEN** `buildRelations()` is called
- **THEN** the emitted relation uses one of `EXTENDS`, `IMPLEMENTS`, or `OVERRIDES`

#### Scenario: Unresolvable hierarchy target is silently dropped

- **GIVEN** a hierarchy declaration whose target cannot be resolved deterministically
- **WHEN** `buildRelations()` is called
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
- **WHEN** `resolvePackageFromSpecifier('@specd/core', knownPackages)` is called on the TypeScript adapter
- **THEN** it returns `'@specd/core'`

#### Scenario: TypeScript bare package specifier

- **GIVEN** known packages `['lodash']`
- **WHEN** `resolvePackageFromSpecifier('lodash/fp', knownPackages)` is called on the TypeScript adapter
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

#### Scenario: PSR-4 resolves qualified name to file path

- **GIVEN** a `codeRoot` containing `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `resolveQualifiedNameToPath('App\\Models\\User', codeRoot)` is called on the PHP adapter
- **THEN** it returns the absolute path `{codeRoot}/src/Models/User.php`

#### Scenario: Qualified name with no matching prefix returns undefined

- **GIVEN** `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `resolveQualifiedNameToPath('Vendor\\Lib\\Foo', codeRoot)` is called
- **THEN** it returns `undefined`

#### Scenario: Session lookups drive PHP import resolution

- **GIVEN** the PHP adapter is resolving imports for a file that uses CakePHP, CodeIgniter, or namespace-based conventions
- **AND** the shared session already knows the discovered files and registered symbols
- **WHEN** `resolveImports()` is called
- **THEN** the adapter uses those shared lookups to test candidates
- **AND** it does not scan every workspace symbol or hit the filesystem for each candidate

#### Scenario: Pass 2 uses precomputed package metadata instead of filesystem probes

- **GIVEN** the PHP adapter needs PSR-4 metadata to resolve a qualified import during Pass 2
- **AND** that metadata was already prepared as compact per-file or run-scoped adapter state
- **WHEN** `resolveImports()` runs
- **THEN** the adapter resolves the import from that retained metadata and shared session lookups
- **AND** it does not probe the filesystem for each import candidate

### Requirement: Tree-sitter query patterns

#### Scenario: Query patterns are internal implementation details

- **GIVEN** a language adapter uses Tree-sitter query patterns internally
- **WHEN** consumers call the adapter methods
- **THEN** query patterns are not exposed through the public API

### Requirement: Resolver capability declaration

#### Scenario: Relation-only support does not satisfy resolver capability

- **GIVEN** an adapter emits an `EXTENDS` relation but no shared hierarchy provenance
- **WHEN** capabilities are recorded
- **THEN** it cannot truthfully advertise hierarchy resolution support

#### Scenario: Unsupported capability is explicit

- **GIVEN** a custom adapter omits hierarchy capability
- **WHEN** hierarchy resolution is requested
- **THEN** coverage is unsupported and no generic guess is emitted

### Requirement: Built-in adapter specialization

#### Scenario: Adapter behavior changes its specific contract

- **WHEN** a built-in adapter changes syntax, ownership, hierarchy, package, or unsupported behavior
- **THEN** its complete specific spec changes with it
- **AND** shared determinism and safety remain unchanged

### Requirement: Logical declaring-owner facts

#### Scenario: Syntax parent is not a logical owner

- **GIVEN** two declaring types contain the same member name
- **WHEN** an adapter emits member facts
- **THEN** each member uses its declaring type's logical identity
- **AND** neither member uses a parser or location-based parent ID

### Requirement: Hierarchy evidence consistency

#### Scenario: Supported hierarchy emits relations and resolver provenance

- **GIVEN** supported source declares a resolvable owner hierarchy
- **WHEN** an adapter advertises `hierarchy: true`
- **THEN** hierarchy relations and shared traversal steps describe the same edges
- **AND** the resolver can query a requested member under the reached owner

### Requirement: Complete symbol source ranges

#### Scenario: Built-in adapters report parser-authoritative ranges

- **GIVEN** a supported multi-line declaration
- **WHEN** a built-in language adapter extracts it
- **THEN** the complete construct range comes from the parser node
- **AND** the selection range covers the declared name and is contained by the construct

#### Scenario: Untrustworthy third-party range is omitted

- **GIVEN** a third-party parser cannot provide a valid construct or selection range
- **WHEN** the adapter translates the declaration
- **THEN** it omits the symbol instead of fabricating coordinates
