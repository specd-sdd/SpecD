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

#### Scenario: Resolution manifests are declared without reading the filesystem

- **WHEN** a language adapter implements `resolutionManifests()`
- **THEN** the method returns exact basenames
- **AND** it does not read or stat the filesystem
- **AND** an adapter that reads no resolution manifest returns an empty array

#### Scenario: TypeScript adapter declares package.json

- **WHEN** the default TypeScript adapter reports resolution manifests
- **THEN** the result is exactly `['package.json']`

#### Scenario: Adapter is a required core plus declared facets

- **GIVEN** the built-in TypeScript adapter
- **WHEN** its members are inspected
- **THEN** `languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, and `buildRelations` are present
- **AND** it exposes `packageResolution`, `relativeImportResolution`, `symbolReferenceSyntax`, and `reExportLinking` as facet objects, and no `qualifiedNameResolution` because TypeScript has no qualified-name addressing
- **AND** the `LanguageAdapter` interface declares none of the former loose methods `getPackageIdentity`, `resolvePackageFromSpecifier`, `resolveRelativeImportPath`, `buildQualifiedName`, `resolveQualifiedNameToPath`, `parseSymbolReference`, `renderSymbolReference`, or `linkReExports`, which a type-level test checks

#### Scenario: Capability flags and facets are separate declarations

- **GIVEN** an adapter that sets `capabilities().hierarchy` to true and provides no `packageResolution`
- **WHEN** the indexer reads its declarations
- **THEN** hierarchy resolution is supported
- **AND** package resolution is treated as absent

### Requirement: Adapter facet model

#### Scenario: Facet presence is the declaration

- **GIVEN** an adapter that exposes `packageResolution`
- **WHEN** the indexer needs package identities
- **THEN** it uses that facet
- **AND** it does not test whether individual methods exist

#### Scenario: Absent facet disables the behaviour without error

- **GIVEN** an adapter that does not expose `packageResolution`
- **WHEN** the indexer builds the package map and resolves a package-specifier import in that adapter's language
- **THEN** no identity is contributed and the import stays unresolved
- **AND** no error is raised and no heuristic replaces the facet
- **AND** the run result lists the adapter in `importDiagnostics.adaptersWithoutPackageResolution`
- **AND** that listing is not counted in `importDiagnostics.total`

#### Scenario: Partial facet is rejected

- **GIVEN** an adapter whose `packageResolution` facet lacks `entrySurface`
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER`

#### Scenario: Facet that throws does not stop the run

- **GIVEN** a present facet whose per-file resolution throws for one file
- **WHEN** the indexer resolves that file's imports
- **THEN** the error is recorded for that file
- **AND** other files are still indexed

#### Scenario: Facet that throws in identity, prepare, or link does not stop the run

- **GIVEN** an adapter whose `identity`, `prepare`, or `link` throws
- **WHEN** the indexer executes the run
- **THEN** the error is recorded as an indexing error
- **AND** the adapter is treated as if it did not provide `packageResolution` for the rest of the run and is listed in `importDiagnostics.adaptersWithoutPackageResolution`
- **AND** other adapters and workspaces are still indexed

#### Scenario: New language needs no indexer change

- **GIVEN** a test adapter for a made-up language with its own manifest, extension, and package layout, providing the core and `packageResolution`
- **AND** two workspaces, one of which imports a name exported by the other through the made-up package specifier
- **WHEN** both workspaces are indexed with the unmodified indexer
- **THEN** the import resolves to the exported symbol in the other workspace
- **AND** the indexer, session, resolver, and stores needed no change

#### Scenario: Package resolution failure keeps relative barrel linking

- **GIVEN** an adapter whose `identity` throws for one workspace
- **AND** a barrel file in another workspace that re-exports a relative module
- **WHEN** the run completes
- **THEN** the relative re-export is still linked by `reExportLinking`
- **AND** only routes that need package data stay unresolved

### Requirement: Package resolution facet

#### Scenario: Prepare runs once before import resolution

- **GIVEN** a run with several workspaces and a present `packageResolution` facet
- **WHEN** the indexer executes the run
- **THEN** `prepare` is called exactly once, after every workspace is analyzed and before any import is resolved
- **AND** it receives every configured workspace name and code root, including workspaces that were only hydrated in an incremental run

#### Scenario: Entry surface performs no I/O

- **GIVEN** `prepare` has stored the manifest facts
- **WHEN** `entrySurface` is called several times during Pass 2
- **THEN** no filesystem read happens
- **AND** the result depends only on the request and the prepared data

#### Scenario: Entry surface returns ordered workspace-prefixed files

- **GIVEN** `@specd/code-graph` exports `.` to `./dist/public.js`
- **WHEN** `entrySurface` is called for `@specd/code-graph`
- **THEN** it returns an entry whose `filePath` is `code-graph:src/public.ts`

#### Scenario: Entry surface never searches symbols by name

- **GIVEN** a package whose manifest publishes no entry for the specifier
- **AND** a workspace symbol with the imported name exists
- **WHEN** `entrySurface` is called
- **THEN** it returns an empty array

#### Scenario: Test files are not entries

- **GIVEN** a facet whose `entrySurface` returns a file classified as a test
- **WHEN** the shared helper filters the entries
- **THEN** the test file is not returned to the adapter

#### Scenario: Match specifier is pure

- **GIVEN** known packages, a specifier, and a prepared session
- **WHEN** `matchSpecifier` is called repeatedly
- **THEN** the result is the same and no I/O happens
- **AND** it depends only on its arguments and on the data `prepare` stored in the session

#### Scenario: Facet manifests are declared

- **GIVEN** the facet reads `go.mod`
- **WHEN** the adapter reports `resolutionManifests()`
- **THEN** the result includes `go.mod`

#### Scenario: Identity and prepare use the same package root

- **GIVEN** a workspace whose code root is `/repo/packages/core/src` and whose manifest is `/repo/packages/core/package.json`
- **WHEN** `identity` and `prepare` run for that workspace
- **THEN** both use the manifest at `/repo/packages/core`
- **AND** the workspace has an identity and an entry surface, not an identity followed by `no-entry-surface`

#### Scenario: Search stops at the repository root of the code root

- **GIVEN** a code root inside repository `/ext/repo` and a manifest at `/ext/package.json` above that repository
- **AND** `repoRoot` is `/ext/repo`
- **WHEN** the package root is searched
- **THEN** the manifest above `/ext/repo` is not read
- **AND** the workspace has no identity from it

#### Scenario: External code root uses its own repository boundary

- **GIVEN** a workspace whose code root is outside the project root, in another repository, with its manifest above the code root inside that repository
- **WHEN** the package root is searched with that repository's root
- **THEN** the manifest is found
- **AND** the project root is not used as the boundary

#### Scenario: No detected repository inspects only the code root

- **GIVEN** a code root for which no VCS is detected and a manifest in its parent directory
- **WHEN** the package root is searched without a `repoRoot`
- **THEN** only the code root itself is inspected
- **AND** the search never walks upward or reaches the filesystem root

#### Scenario: Manifest without the identity field is skipped with a diagnostic

- **GIVEN** a nearest manifest without the identity field and a named manifest further up inside the repository
- **WHEN** the package root is searched
- **THEN** a diagnostic is reported for the skipped manifest
- **AND** the named manifest provides the identity

#### Scenario: Terminal skipped manifest still reports its diagnostic

- **GIVEN** every manifest inside the bounded search is unreadable or lacks the required identity field
- **WHEN** `identity` exhausts the search and returns `undefined`
- **THEN** every skipped manifest is reported through `report`
- **AND** the final diagnostic is not lost merely because no usable manifest was found

#### Scenario: Symlinked and trailing-separator code roots are canonicalized

- **GIVEN** a code root given with a trailing separator, or through a symbolic link
- **WHEN** the package root is searched
- **THEN** the search starts at the canonical code root
- **AND** the result equals the one for the plain path

#### Scenario: Prepare reads each manifest once and keeps compact data

- **GIVEN** a workspace with a manifest
- **WHEN** `prepare` runs
- **THEN** the manifest is read exactly once during that call
- **AND** only the data needed by `matchSpecifier` and `entrySurface` is stored, not the whole parsed manifest

#### Scenario: Prepare covers workspaces outside the run

- **GIVEN** a partial run that indexes only workspace A
- **WHEN** `prepare` runs
- **THEN** it receives and prepares workspace B as well
- **AND** a package published by B is not treated as external

### Requirement: Relative import resolution facet

#### Scenario: Relative specifier yields candidates without choosing

- **GIVEN** `./utils` imported from a TypeScript file
- **WHEN** `relativeImportResolution.resolve` is called
- **THEN** it returns the extension and index-file candidates
- **AND** it does not choose among them

#### Scenario: Language without relative imports omits the facet

- **GIVEN** the Go adapter
- **WHEN** its members are inspected
- **THEN** it exposes no `relativeImportResolution`

### Requirement: Qualified-name resolution facet

#### Scenario: Build produces the canonical qualified name

- **WHEN** the PHP adapter's `qualifiedNameResolution.build` is called with namespace `App\Models` and name `User`
- **THEN** it returns `App\Models\User`

#### Scenario: Resolve to path uses prepared metadata

- **GIVEN** PSR-4 metadata was prepared for the code root and the `composer.json` file was deleted afterwards
- **WHEN** `resolveToPath` is called with the session
- **THEN** it still maps the qualified name to its class file
- **AND** it performs no filesystem access

#### Scenario: Language without qualified-name addressing omits the facet

- **GIVEN** the Go adapter
- **WHEN** its members are inspected
- **THEN** it exposes no `qualifiedNameResolution`

### Requirement: Symbol reference syntax facet

#### Scenario: Parse and render live in one facet

- **GIVEN** an adapter that provides `symbolReferenceSyntax`
- **WHEN** a consumer parses `EditChange.execute` and renders the resulting member
- **THEN** both operations come from that facet

#### Scenario: Missing facet leaves a human reference unresolved

- **GIVEN** an adapter that does not provide `symbolReferenceSyntax`
- **WHEN** a human-written reference for its language is requested
- **THEN** the reference is unresolved
- **AND** no other adapter's syntax is used

### Requirement: Re-export linking facet

#### Scenario: Linking runs before import resolution

- **GIVEN** a package entry that re-exports a name through a barrel chain
- **WHEN** the indexer runs
- **THEN** every present `reExportLinking` facet has completed before the first import is resolved in Pass 2

#### Scenario: Linking performs no I/O

- **WHEN** `link` runs
- **THEN** it reads no file from disk

#### Scenario: Adapter without the facet contributes no re-export bindings

- **GIVEN** an adapter that does not provide `reExportLinking`
- **WHEN** the indexer links re-exports
- **THEN** nothing is linked for that adapter and no error is raised

### Requirement: Package import resolution context

#### Scenario: Named export resolves through the entry surface

- **GIVEN** `sdk` imports `SymbolNode` from `@specd/code-graph`
- **AND** the entry surface of that package is `code-graph:src/public.ts`, which publishes `SymbolNode` through a barrel chain
- **WHEN** the adapter calls `resolvePackageExport`
- **THEN** the result is resolved with the logical id of `SymbolNode` declared in `code-graph`
- **AND** it carries the entry file and the public binding id used

#### Scenario: Unique internal symbol is not chosen

- **GIVEN** `SymbolNode` is exported only by an internal file that is not part of the entry surface
- **WHEN** the adapter calls `resolvePackageExport`
- **THEN** the result is unresolved with reason `not-exported`

#### Scenario: Same-name symbol in a test file is not chosen

- **GIVEN** a test file in the target workspace declares a symbol with the imported name
- **AND** the entry surface does not export that name
- **WHEN** the adapter calls `resolvePackageExport`
- **THEN** the result is unresolved with reason `not-exported`

#### Scenario: Conflicting entry files are ambiguous

- **GIVEN** two entry files export the same name with different logical targets
- **WHEN** the adapter calls `resolvePackageExport`
- **THEN** the result is unresolved with reason `ambiguous`

#### Scenario: Unknown package reports a reason

- **GIVEN** the specifier matches no known package
- **WHEN** the adapter calls `packageEntryFiles`
- **THEN** the helper result is unresolved with reason `package-unknown`, which the indexer counts only in `externalPackageImports`

#### Scenario: Absent facet reports a reason

- **GIVEN** the importing adapter does not provide `packageResolution`
- **WHEN** a package import is resolved
- **THEN** the result is unresolved with reason `facet-absent`

#### Scenario: Resolved import carries an import:package step

- **GIVEN** a package import resolved to a public binding
- **WHEN** the adapter returns `ResolvedImports`
- **THEN** it includes a step of kind `import:package` from the importing local binding id to the public binding id
- **AND** the indexer persists the step

#### Scenario: Unresolved import diagnostics are not persisted

- **GIVEN** a package import that stayed unresolved
- **WHEN** the run is persisted
- **THEN** no relation, binding target, or step is stored for it
- **AND** the diagnostic with its reason is available only as non-persisted output

#### Scenario: Bindings without a target are ignored by the ambiguity check

- **GIVEN** one public binding with target T and another public binding for the same name without a target
- **WHEN** `resolvePackageExport` resolves the name
- **THEN** the name resolves to T

#### Scenario: Package-unknown is counted, never a failure

- **GIVEN** an import of a package that no workspace declares
- **WHEN** the import is resolved
- **THEN** the result carries the reason `package-unknown`
- **AND** the indexer increments `externalPackageImports`
- **AND** the import is excluded from `total`, `byReason`, and `samples`

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

### Requirement: Parser-authoritative structural fact extraction

#### Scenario: Lookalike text creates no structural fact

- **GIVEN** comments, strings, and template-like literals contain text shaped like imports, calls, declarations, and hierarchy clauses
- **WHEN** a language adapter analyzes the file
- **THEN** no graph fact is emitted for the lookalike text
- **AND** facts are emitted only for corresponding parser nodes

#### Scenario: Complex syntax retains exact parser structure

- **GIVEN** supported calls and declarations use multiline, nested, chained, optional, computed, generic, or same-line syntax available in the language
- **WHEN** the adapter emits facts
- **THEN** their kinds, arguments, owners, scopes, callers, and ranges match the typed parser nodes and ancestry
- **AND** no unbounded raw-source match supplies missing structure

#### Scenario: Auxiliary manifest parsing remains bounded

- **GIVEN** an adapter declares a resolution manifest for which no configured parser exists
- **WHEN** it parses package identity or resolution metadata textually
- **THEN** the resulting metadata is accepted
- **AND** the exception cannot create source declarations, calls, callers, or dependency facts outside parser-proven source constructs

#### Scenario: Parser cannot prove a construct

- **GIVEN** source is erroneous, ambiguous, runtime-only, or unsupported by the configured grammar
- **WHEN** a textual pattern resembles a supported structural construct
- **THEN** the adapter emits no guessed structural fact or an explicit unresolved fact
- **AND** textual proximity is not used as substitute evidence

#### Scenario: Unresolved import emits no guessed relation

- **GIVEN** a parser-proven import has several syntactic candidates but none resolves
- **WHEN** reference facts and persisted relations are produced
- **THEN** unresolved diagnostic evidence may be retained
- **AND** no dependency relation targets the first candidate or raw specifier

#### Scenario: Imported hierarchy relation has shared provenance

- **GIVEN** an imported base or contract resolves deterministically
- **WHEN** the adapter emits an `EXTENDS` or `IMPLEMENTS` relation
- **THEN** exactly one matching shared hierarchy reference fact is emitted
- **AND** it carries the parser range of the hierarchy-clause expression, resolution provenance, and same resolved target

#### Scenario: Pass 2 performs no metadata I/O

- **GIVEN** package and module maps were prepared in run-scoped session state
- **WHEN** per-file relation extraction runs for several concurrent or consecutive sessions
- **THEN** it performs no filesystem metadata reads
- **AND** no mutable adapter-instance cache leaks resolution state between sessions

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

### Requirement: Semantic caller containment

#### Scenario: Preceding non-callable cannot usurp the caller

- **GIVEN** a function contains a local declaration followed by a call
- **AND** the local declaration starts closer to the call than the function does
- **WHEN** caller identity is extracted
- **THEN** the containing function is selected
- **AND** the local declaration is not selected

#### Scenario: Same-line containment uses columns

- **GIVEN** two supported callable constructs occupy the same source line
- **WHEN** a call lies inside the second construct's half-open column range
- **THEN** the second construct is selected as the caller
- **AND** line order alone does not select the first construct

#### Scenario: No proven container remains unresolved

- **GIVEN** a call is outside every language-approved executable range
- **WHEN** caller extraction runs
- **THEN** `callerSymbolId` is absent
- **AND** no speculative dependency edge is emitted

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

#### Scenario: Scope boundary pops when construct line range ends

- **GIVEN** a class construct followed by a top-level function on subsequent lines
- **WHEN** `analyzeFile()` processes declarations sequentially
- **THEN** the scope stack pops the class scope when line numbers exceed the class's `endLine`
- **AND** the top-level function does not inherit the preceding class as an enclosing scope

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

#### Scenario: Adapters registered via register API

- **GIVEN** a new `AdapterRegistry`
- **WHEN** an adapter is registered via `register(adapter)`
- **THEN** `getAdapter(languageId)` returns that adapter
- **AND** `getAdapterForFile(filePath)` resolves the adapter by file extension

#### Scenario: Custom adapter extends registry

- **GIVEN** a custom adapter declaring `languages(): ['python']` and `extensions(): { '.py': 'python' }`
- **WHEN** `register(adapter)` is called
- **THEN** `getAdapter('python')` returns that adapter
- **AND** `getAdapterForFile('main.py')` returns that adapter

#### Scenario: Extension map built from adapters

- **GIVEN** a fresh `AdapterRegistry` with no adapters registered
- **WHEN** an adapter with `extensions(): { '.rs': 'rust' }` is registered
- **THEN** `getAdapterForFile('main.rs')` returns that adapter
- **AND** `getLanguageForFile('main.rs')` returns `'rust'`

#### Scenario: Missing core member is rejected

- **GIVEN** an adapter without `analyzeFile`
- **WHEN** it is registered
- **THEN** registration fails with a `SpecdError` whose code is `INVALID_LANGUAGE_ADAPTER`
- **AND** the message names the missing member
- **AND** the registry is unchanged

#### Scenario: Facet that is not an object of functions is rejected

- **GIVEN** an adapter whose `symbolReferenceSyntax` is a string
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER`

#### Scenario: Extension for an undeclared language is rejected

- **GIVEN** an adapter whose `extensions()` maps `.rs` to `rust` but whose `languages()` does not include `rust`
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER`

#### Scenario: Later registration replaces the adapter for a language

- **GIVEN** an adapter registered for `python` and `.py`
- **WHEN** a second adapter that also declares `python` and `.py` is registered
- **THEN** `getAdapter('python')` and `getAdapterForFile('main.py')` return the second adapter
- **AND** the first adapter is no longer returned by `getAdapters()`

#### Scenario: Replacement is per language

- **GIVEN** an adapter registered for `typescript`, `tsx`, `javascript`, and `jsx`
- **WHEN** a second adapter that declares only `typescript` and `.ts` is registered
- **THEN** `typescript` and `.ts` resolve to the second adapter
- **AND** `tsx`, `javascript`, and `jsx` still resolve to the first adapter, which `getAdapters()` still returns

#### Scenario: Registering the same instance twice changes nothing

- **GIVEN** an adapter that is already registered
- **WHEN** the same instance is registered again
- **THEN** the registry is unchanged and `getAdapters()` lists it once

#### Scenario: Adapter without optional facets registers

- **GIVEN** an adapter that implements only the required core
- **WHEN** it is registered
- **THEN** registration succeeds

#### Scenario: Malformed languages result is rejected

- **GIVEN** an adapter whose `languages()` returns a non-array or an array with an empty string
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER` and the registry is unchanged

#### Scenario: Malformed extensions result is rejected

- **GIVEN** an adapter whose `extensions()` returns a non-object or maps an extension to a non-string
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER` and the registry is unchanged

#### Scenario: Invalid resolution manifest value is rejected

- **GIVEN** an adapter whose `resolutionManifests()` returns a glob, a value with a path separator, or an empty string
- **WHEN** it is registered
- **THEN** registration fails with `INVALID_LANGUAGE_ADAPTER` naming `resolutionManifests`

### Requirement: Package identity extraction

#### Scenario: TypeScript adapter reads package.json

- **GIVEN** a directory containing `package.json` with `{"name": "@specd/core"}`
- **WHEN** `packageResolution.identity(codeRoot)` is called on the TypeScript adapter
- **THEN** it returns `'@specd/core'`

#### Scenario: No manifest returns undefined

- **GIVEN** a directory with no `package.json`
- **WHEN** `packageResolution.identity(codeRoot)` is called on the TypeScript adapter
- **THEN** it returns `undefined`

#### Scenario: Go adapter reads go.mod

- **GIVEN** a directory containing `go.mod` with `module github.com/acme/auth`
- **WHEN** `packageResolution.identity(codeRoot)` is called on the Go adapter
- **THEN** it returns `'github.com/acme/auth'`

#### Scenario: Python adapter reads pyproject.toml

- **GIVEN** a directory containing `pyproject.toml` with `[project]` and `name = "acme-auth"`
- **WHEN** `packageResolution.identity(codeRoot)` is called on the Python adapter
- **THEN** it returns `'acme-auth'`

#### Scenario: PHP adapter reads composer.json

- **GIVEN** a directory containing `composer.json` with `{"name": "acme/auth"}`
- **WHEN** `packageResolution.identity(codeRoot)` is called on the PHP adapter
- **THEN** it returns `'acme/auth'`

#### Scenario: Adapter without the package resolution facet

- **GIVEN** an adapter that does not expose `packageResolution`
- **WHEN** the indexer builds the package map for a workspace
- **THEN** the adapter contributes no identity and cross-workspace resolution is skipped for that language

#### Scenario: Manifest found above codeRoot

- **GIVEN** a codeRoot at `/project/packages/core/src` with no `package.json`
- **AND** `/project/packages/core/package.json` exists with `name: '@specd/core'`
- **WHEN** `packageResolution.identity('/project/packages/core/src', '/project')` is called
- **THEN** it returns `'@specd/core'`

#### Scenario: Search bounded by repoRoot

- **GIVEN** a codeRoot at `/project/packages/core`
- **AND** `repoRoot` is `/project`
- **AND** `/package.json` exists above the repo root
- **WHEN** `packageResolution.identity` is called
- **THEN** it does not read `/package.json` — search stops at `/project`

#### Scenario: Declared manifests are the files package identity reads

- **GIVEN** a built-in adapter reads `package.json`, `pyproject.toml`, `go.mod`, or `composer.json` for package identity
- **WHEN** that adapter reports `resolutionManifests()`
- **THEN** the basename it reads is included
- **AND** the result does not name a file that adapter does not read

#### Scenario: Python identity is the project table name

- **GIVEN** a `pyproject.toml` whose `[tool.poetry]` table has `name = "poetry-name"` and whose `[project]` table has `name = "project-name"`
- **WHEN** the Python adapter reads package identity
- **THEN** the result is `project-name`

#### Scenario: Python identity accepts a single-quoted project name

- **GIVEN** a `pyproject.toml` with `[project]` and `name = 'quoted-name'`
- **WHEN** the Python adapter reads package identity
- **THEN** the result is `quoted-name`

#### Scenario: Python identity skips a file without a project name

- **GIVEN** a nearer `pyproject.toml` has only `[tool.poetry]` `name = "poetry-name"`
- **AND** a parent `pyproject.toml` inside the repository root has `[project]` `name = "project-name"`
- **WHEN** the Python adapter reads package identity
- **THEN** the result is `project-name`

#### Scenario: Every adapter is asked for an identity

- **GIVEN** a workspace holding both `package.json` and `composer.json`
- **WHEN** the package map is built
- **THEN** the TypeScript identity and the PHP identity are both stored for that workspace

#### Scenario: Two workspaces claiming one name resolve to neither

- **GIVEN** workspaces A and B whose manifests declare the same package name
- **WHEN** the package map is built
- **THEN** an error naming both workspaces is reported
- **AND** the name resolves to no workspace

#### Scenario: One workspace claiming a name through several adapters is not a conflict

- **GIVEN** a workspace whose two adapters return the same name
- **WHEN** the package map is built
- **THEN** no conflict is reported

#### Scenario: Inaccessible workspace is skipped

- **GIVEN** a configured workspace whose code root does not exist on this machine
- **WHEN** the package map is built
- **THEN** a diagnostic is reported for that workspace
- **AND** its packages count as external and the run does not fail

#### Scenario: Adapter disabled on a later workspace drops earlier sole identities

- **GIVEN** an adapter that returns package identity P for workspace A and then throws in `identity` or `prepare` for workspace B
- **WHEN** the package map is finalized
- **THEN** P is removed from the package map if no other enabled adapter claimed P for workspace A

### Requirement: Import specifier resolution

#### Scenario: TypeScript scoped package specifier

- **GIVEN** known packages `['@specd/core', '@specd/cli']`
- **WHEN** `packageResolution.matchSpecifier('@specd/core', knownPackages)` is called on the TypeScript adapter
- **THEN** it returns `'@specd/core'`

#### Scenario: TypeScript bare package specifier

- **GIVEN** known packages `['lodash']`
- **WHEN** `packageResolution.matchSpecifier('lodash/fp', knownPackages)` is called on the TypeScript adapter
- **THEN** it returns `'lodash'`

#### Scenario: Go module specifier resolved by longest prefix

- **GIVEN** known packages `['github.com/acme/auth']`
- **WHEN** `packageResolution.matchSpecifier('github.com/acme/auth/models', knownPackages)` is called on the Go adapter
- **THEN** it returns `'github.com/acme/auth'`

#### Scenario: Python package specifier with hyphen normalization

- **GIVEN** known packages `['acme-auth']`
- **WHEN** `packageResolution.matchSpecifier('acme_auth.models', knownPackages)` is called on the Python adapter
- **THEN** it returns `'acme-auth'`

#### Scenario: Unknown specifier returns undefined

- **GIVEN** known packages `['@specd/core']`
- **WHEN** `packageResolution.matchSpecifier('express', knownPackages)` is called
- **THEN** it returns `undefined`

#### Scenario: PSR-4 resolves qualified name to file path

- **GIVEN** a `codeRoot` containing `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `qualifiedNameResolution.resolveToPath('App\\Models\\User', codeRoot)` is called on the PHP adapter
- **THEN** it returns the absolute path `{codeRoot}/src/Models/User.php`

#### Scenario: Qualified name with no matching prefix returns undefined

- **GIVEN** `composer.json` with `autoload.psr-4: { "App\\": "src/" }`
- **WHEN** `qualifiedNameResolution.resolveToPath('Vendor\\Lib\\Foo', codeRoot)` is called
- **THEN** it returns `undefined`

#### Scenario: Session lookups drive PHP import resolution

- **GIVEN** the PHP adapter is resolving imports for a file that uses CakePHP, CodeIgniter, or namespace-based conventions
- **AND** the shared session already knows the discovered files and registered symbols
- **WHEN** `resolveImports()` is called
- **THEN** the adapter uses those shared lookups to test candidates
- **AND** it does not scan every workspace symbol or hit the filesystem for each candidate

#### Scenario: Pass 2 uses precomputed package metadata instead of filesystem probes

- **GIVEN** the PHP adapter needs PSR-4 metadata to resolve a qualified import during Pass 2
- **AND** that metadata was already prepared by `packageResolution.prepare` or as compact run-scoped adapter state
- **WHEN** `resolveImports()` runs
- **THEN** the adapter resolves the import from that retained metadata and shared session lookups
- **AND** it does not probe the filesystem for each import candidate

#### Scenario: Package-specifier import never searches symbols by name

- **GIVEN** a non-relative import of a name from a package in another workspace
- **WHEN** the adapter resolves it
- **THEN** it uses `packageEntryFiles` and `resolvePackageExport`
- **AND** it does not call a name search over the target workspace

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

#### Scenario: Facet does not satisfy a capability flag

- **GIVEN** an adapter provides `reExportLinking` but emits no hierarchy provenance
- **WHEN** capabilities are recorded
- **THEN** it cannot advertise hierarchy support because of that facet

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

### Requirement: Member semantics and declaration parent

#### Scenario: Instance getter keeps both axes

- **GIVEN** a TypeScript class declares an instance getter
- **WHEN** the adapter emits the member
- **THEN** `kind`, `dispatch`, and `accessor` are all present
- **AND** the retired member form is absent
- **AND** the declaration `parentId` is set by that adapter

#### Scenario: Top-level function has no parent

- **WHEN** the adapter emits a top-level function
- **THEN** `parentId` is omitted

#### Scenario: Go method parent is emitted

- **GIVEN** a Go method has a receiver type
- **WHEN** the Go adapter emits the declaration
- **THEN** `parentId` points at that receiver's declaration
- **AND** the indexer did not skip Go because it was absent from a language list

#### Scenario: Container properties set parentId to enclosing container

- **GIVEN** a class, interface, or struct declaring properties
- **WHEN** the adapter emits declarations
- **THEN** each property occurrence has `parentId` set to the enclosing container's symbol ID

#### Scenario: Routine local variables set parentId to enclosing routine

- **GIVEN** a function or method declaring local variables in its body
- **WHEN** the adapter emits declarations
- **THEN** each local variable occurrence has `parentId` set to the enclosing routine's symbol ID

#### Scenario: Cyclic owner is not invented

- **GIVEN** member ownership would cycle
- **WHEN** the adapter builds logical members
- **THEN** the cyclic member is dropped
- **AND** no synthetic owner id is stored

### Requirement: Human reference parse and render

#### Scenario: Dotted member text becomes a structured selector

- **GIVEN** the anchored file is TypeScript
- **WHEN** `symbolReferenceSyntax.parse` is called with `EditChange.execute`
- **THEN** the result is one owner-then-member selector
- **AND** the shared domain did not split the string on `.`

#### Scenario: Ambiguous syntax stays unresolved

- **WHEN** the facet parses a dynamic or ambiguous member expression
- **THEN** it returns no guessed candidate

#### Scenario: Native and generic spellings round-trip

- **GIVEN** one logical member
- **WHEN** the facet renders the generic spelling and the language-native spelling
- **THEN** both parse back to that same structured member

#### Scenario: PHP native spelling is not a TypeScript path

- **GIVEN** the anchored file is PHP
- **WHEN** the PHP facet parses `ArchiveChange::execute`
- **THEN** the selector is the same member as the generic `ArchiveChange.execute` spelling
- **AND** the TypeScript adapter is not used

#### Scenario: Canonical text is not parsed as human syntax

- **GIVEN** the input is already a versioned canonical logical id
- **WHEN** an adapter parse is requested for human syntax
- **THEN** the canonical id is not split on `.` or `::`

#### Scenario: Resolution manifests do not read the disk

- **WHEN** `resolutionManifests()` is called
- **THEN** it returns manifest basenames
- **AND** it does not open `package.json`

### Requirement: Re-export public bindings

#### Scenario: Package export map selects the public entry

- **GIVEN** `@specd/code-graph` exports `.` to `dist/public.js` and `./internal` to `dist/index.js`
- **WHEN** the TypeScript adapter resolves `export { runIsolatedGraphIndex } from '@specd/code-graph'`
- **THEN** the entry file is the indexed source of `dist/public.js`
- **AND** the binding surface is the re-exporting file
- **AND** the target is the logical id that entry file already publishes

#### Scenario: Subpath export selects the internal entry

- **WHEN** the adapter resolves a re-export from `@specd/code-graph/internal`
- **THEN** the entry file is the indexed source of `dist/index.js`

#### Scenario: Unresolved package specifier emits no binding

- **GIVEN** the specifier does not match exactly one indexed entry file
- **WHEN** the adapter resolves the re-export
- **THEN** it emits no public binding

#### Scenario: Indexer does not read the manifest

- **WHEN** re-export bindings are persisted
- **THEN** the indexer writes the adapter payload
- **AND** the indexer does not read `package.json` or copy bindings itself

#### Scenario: Relative re-export stays inside the workspace

- **GIVEN** `code-graph:src/index.ts` re-exports a name from `./public.js`
- **WHEN** the adapter resolves that specifier
- **THEN** the entry file is the indexed `public.ts` in the code-graph workspace
- **AND** a package-entry lookup is not used

#### Scenario: Two entry candidates emit no binding

- **GIVEN** a specifier resolves to both `file.ts` and `file/index.ts` and both are indexed
- **WHEN** the adapter resolves the re-export
- **THEN** it emits no public binding

#### Scenario: Star re-export skips default

- **GIVEN** an entry file publishes a default binding and named bindings
- **WHEN** the adapter resolves `export * from` that entry
- **THEN** named bindings are copied onto the re-exporting file
- **AND** the default binding is not copied

#### Scenario: Missing exported name emits no binding

- **GIVEN** the entry file does not publish the requested name
- **WHEN** the adapter resolves `export { Missing } from` that entry
- **THEN** it emits no public binding for `Missing`

#### Scenario: JavaScript extension maps to the indexed source

- **GIVEN** `exports["."]` points at `./dist/public.js`
- **AND** `code-graph:src/public.ts` is indexed
- **WHEN** the adapter resolves the package root
- **THEN** the candidate is `code-graph:src/public.ts`
- **AND** `sdk:src/@specd/code-graph.ts` is not a candidate

#### Scenario: Re-export and ordinary imports share the entry surface

- **GIVEN** `@specd/code-graph` is the target of both a re-export and an ordinary import
- **WHEN** each is resolved
- **THEN** both use the same `packageResolution.entrySurface` result
- **AND** neither targets a file classified as a test

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

### Requirement: Declaration classification policy

#### Scenario: Broad kind does not determine semantic identity

- **GIVEN** a property-like declaration and a callable declaration share a broad parser category and simple name
- **WHEN** the adapter classifies them using role, scope, owner, and visibility
- **THEN** only declarations proven to be semantic targets receive logical identities
- **AND** lexical-only declarations remain bindings or physical evidence

#### Scenario: Owners are available before member IDs

- **GIVEN** two owners each declare a same-name member
- **WHEN** member logical identities are constructed
- **THEN** each identity contains its canonical logical owner
- **AND** the member IDs are distinct

### Requirement: Cross-language semantic conformance suite

#### Scenario: Every built-in adapter runs the shared fixture matrix

- **GIVEN** TypeScript, Python, Go, and PHP adapters are registered
- **WHEN** the shared semantic adapter contract suite runs
- **THEN** every adapter executes caller-containment, scope-isolation, ownership, physical-only, logical-resolution, coverage, and incremental-equivalence fixtures
- **AND** adapter-specific expectations may specialize but not skip common invariants

#### Scenario: New first-party adapter lacks required semantics

- **GIVEN** a new adapter implements the TypeScript interface but uses nearest-preceding caller selection
- **WHEN** the conformance suite runs
- **THEN** the adapter fails the common caller-containment scenarios
- **AND** it is not accepted as conformant

### Requirement: Adding a language adapter

#### Scenario: Guide steps are complete

- **WHEN** a developer follows the seven steps of the guide for a new language
- **THEN** the adapter indexes and resolves package imports with no change outside the adapter and its registration

#### Scenario: Docs page states the same rules

- **WHEN** `docs/code-graph/language-adapters.md` is compared with this spec
- **THEN** it states the same required core, facets, members, invariants, and steps without referring the reader to the spec
