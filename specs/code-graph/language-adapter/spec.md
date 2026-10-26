# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit). It consists of a **required core** and **optional facets**.

The required core is:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extensions(): Record<string, string>`** — returns the file extension to language ID mapping (e.g. `{ '.ts': 'typescript', '.tsx': 'tsx' }`). The adapter registry uses this to resolve files to adapters — no hardcoded extension map.
- **`resolutionManifests(): readonly string[]`** — returns the exact basenames of the manifests this adapter reads for package identity or import resolution. The method is required, synchronous, and MUST NOT perform I/O. An adapter that reads no resolution manifest MUST return an empty array. Values MUST be exact filenames, not globs or directory paths.
- **`analyzeFile(filePath: string, content: string, context: AdapterAnalyzeContext): FileAnalysisDraft`** — parses the file content once and returns the complete compact analysis required by indexing for that file, including symbols, imports, deterministic binding facts, deterministic call facts, namespace data when relevant, and optional compact parser-specific state.
- **`resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports`** — resolves the file's previously extracted import declarations, qualified names, aliases, and deterministic file targets using the shared session lookups instead of re-reading or re-parsing file content. `ResolvedImports` carries the import map, the file-level imports, the resolution steps that explain each cross-file import, and the diagnostics for imports that stayed unresolved.
- **`buildRelations(analysis: FileAnalysis, context: RelationBuildContext): readonly Relation[]`** — builds deterministic graph relations for the file from the stored analysis facts and resolved import information. For code-file dependencies, adapters SHOULD emit concrete relations (`CALLS`, `CONSTRUCTS`, `USES_TYPE`, hierarchy relations) when targets are resolvable. File-level `IMPORTS` relations are derived by the indexer from the resolved imports returned by `resolveImports()`; an adapter MAY emit `IMPORTS` only for loader-style dependencies that only the adapter can prove; `DEPENDS_ON` remains reserved for spec-level dependency edges.

The optional facets are readonly properties of the adapter. A facet is declared by being present; the facets are:

- **`packageResolution`** — package identity, specifier matching, and the package entry surface (see "Package resolution facet").
- **`relativeImportResolution`** — relative module specifier to candidate files (see "Relative import resolution facet").
- **`qualifiedNameResolution`** — qualified-name construction and qualified-name to file mapping (see "Qualified-name resolution facet").
- **`symbolReferenceSyntax`** — parse and render of human and native symbol references (see "Symbol reference syntax facet").
- **`reExportLinking`** — linking of re-export routes into public bindings (see "Re-export linking facet").

The existing `capabilities()` and `declarationPolicy()` declarations are separate from facets. `capabilities()` states which semantic categories the adapter can prove (see "Resolver capability declaration"); facets state which resolution services the adapter provides. A facet MUST NOT be used to declare a semantic capability, and a capability flag MUST NOT be used to declare a facet.

All adapter and facet methods MUST be synchronous and deterministic with respect to the provided arguments and shared session context. They receive content as a string during analysis, not a file path to read, and they MUST NOT perform side effects outside the indexing session. Adapters MAY read and update compact run-scoped adapter cache state only through the `IndexSession` API exposed by the provided contexts. The only methods allowed to perform I/O are the ones this spec names explicitly as such.

The default TypeScript adapter MUST return `['package.json']` from `resolutionManifests()`.

### Requirement: Adapter facet model

A **facet** is a cohesive group of resolution services that an adapter provides only when it supports them. It is an object exposed as an optional readonly property of the adapter. All members of a facet are required: a facet MUST NOT contain optional members. An adapter that cannot provide every member of a facet MUST NOT expose that facet.

Presence of a facet is the adapter's declaration that it supports the capability behind it. The indexer, the resolver, and other consumers MUST decide what to do from the presence of the facet property and MUST NOT probe for individual methods. A consumer MUST NOT branch on a language identifier, a file extension, or a manifest name to compensate for an absent facet.

When a facet is absent:

- the behaviour that depends on it SHALL NOT run for that adapter;
- no error SHALL be raised and no heuristic fallback SHALL replace it;
- the affected items SHALL stay unresolved, and the run result SHALL list the adapter once (by its first declared language identifier, sorted) in `importDiagnostics.adaptersWithoutPackageResolution` when the missing facet is `packageResolution`. That listing is not a resolution failure and is never counted in `importDiagnostics.total`.

A facet that is present but throws while being used SHALL NOT stop the run. A failure inside per-file resolution is recorded for that file by the indexer's error isolation. A failure inside `identity`, `prepare`, or `link` is recorded as an indexing error, any package identities claimed solely by that adapter in earlier workspaces are dropped from the run's package map, and the adapter is treated as if it did not provide `packageResolution` for the rest of the run, including the other workspaces; such an adapter is also listed in `importDiagnostics.adaptersWithoutPackageResolution`.

A failure of `packageResolution` SHALL disable only package-addressed behaviour. It MUST NOT disable the same adapter's `reExportLinking` facet for relative routes: relative barrel re-exports SHALL still be linked, and only routes that need package data stay unresolved. Facets are isolated from each other, and one facet being treated as absent MUST NOT make another facet of the same adapter absent.

Facets are part of the public adapter contract. Each facet's members, argument and result types, purity, and I/O allowance are fixed by this spec. A new facet is added by a change to this spec; consumers MUST NOT rely on an adapter-specific extension.

Adding a new language SHALL require only a new adapter that implements the required core and any facets it supports. It MUST NOT require a change to the indexer, the index session, the resolver, or the graph stores.

### Requirement: Package resolution facet

The `packageResolution` facet SHALL let the indexer connect a package specifier used in one workspace to the files that the target workspace's package publishes. It has these members:

- **`identity(codeRoot: string, repoRoot?: string, report?: (message: string) => void): string | undefined`** — searches at and above `codeRoot`, bounded by `repoRoot`, for the language's package manifest and returns the package identity, or `undefined` when none is found. An optional `report` callback receives non-fatal diagnostic messages when a manifest on the walk lacks the identity field. This method MAY perform I/O. It is called once per workspace before Pass 1 completes.
- **`prepare(context: PackagePreparationContext): void`** — prepares, for every configured workspace, the data that `matchSpecifier` and `entrySurface` need and stores it as compact immutable data in the run-scoped session. It MAY read manifests (I/O is allowed here and in `identity`). It MAY do nothing when the adapter derives everything from the package map, the matched package, the owning workspace, and the indexed file set; such an adapter still provides the member. Within one `prepare` call each manifest of a workspace MUST be read at most once, and only the compact data that `matchSpecifier` and `entrySurface` need MUST be kept, never the whole parsed manifest. `identity` MAY read the same manifest. `PackagePreparationContext` carries the `IndexSession`, the list of workspaces (`name`, `codeRoot`, and the repository root of that code root when one was detected), and the project root. The indexer calls it once per run, after all workspaces have been analyzed and before any import is resolved, and it MUST NOT be called again during Pass 2.
- **`matchSpecifier(specifier: string, knownPackages: readonly string[], session: IndexSession): string | undefined`** — returns which known package identity a non-relative specifier refers to, using the language's matching rules (for example the longest known prefix). It depends only on its arguments and on the data `prepare` stored in the session, performs no I/O, and has no side effects. Languages whose specifiers are not named after the package (for example PHP, where a qualified name belongs to the package whose autoload prefix matches it) read the prepared data through `session`.
- **`entrySurface(request: PackageEntryRequest): readonly PackageEntry[]`** — returns the ordered candidate entries through which the matched package publishes the requested specifier. A `PackageEntry` has a workspace-prefixed `filePath` and the public `surface` id under which that file's exports are stored (for most languages the file itself; for Go, the package). `PackageEntryRequest` carries the full specifier (including any subpath), the matched package identity, the target workspace name, and the `IndexSession`. It reads only the data stored by `prepare`; it MUST NOT perform I/O. It returns an empty array when the package publishes nothing for that specifier. The indexer discards entries whose file is not an indexed file.

The facet MUST derive entry files only from the language's package manifest and layout rules. It MUST NOT search symbols by name. The shared helper discards entries classified as tests, so a test file is never a package entry whether or not the facet returned it.

Every manifest basename the facet reads MUST appear in `resolutionManifests()`, and `resolutionManifests()` MUST NOT name a file the adapter does not read for package identity or import resolution.

Each adapter reads its language's manifest as follows:

| Language   | Manifest file    | Identity field   |
| ---------- | ---------------- | ---------------- |
| TypeScript | `package.json`   | `name`           |
| Python     | `pyproject.toml` | `[project].name` |
| Go         | `go.mod`         | `module`         |
| PHP        | `composer.json`  | `name`           |

Three roots are distinct and MUST NOT be confused:

- the **project root** is the directory of the project configuration; it anchors configuration, graph storage, and project-relative paths, and it is never a boundary for package resolution;
- the **code root** of a workspace is the directory holding that workspace's code; it MAY be inside the project root or outside it (for example a workspace that lives in another repository);
- the **package root** of a workspace is the directory of the manifest that gives the workspace its package identity.

The package root SHALL be found by one search shared by `identity` and `prepare`, so both always use the same manifest. The search starts at the canonical code root (symbolic links resolved, no trailing separator) and walks up to the first usable manifest. The walk is bounded by `repoRoot`, which is the root of the repository that contains that code root. The indexer resolves it once per workspace with the VCS adapter detection (`createVcsAdapter(codeRoot)` followed by `rootDir()`), making it VCS-agnostic (git, hg, svn, and registered external providers), and passes it to the adapter as data. When no VCS is detected for a code root, `repoRoot` is not provided and the search SHALL inspect only the code root itself and MUST NOT walk upward. The search MUST NOT walk past `repoRoot` and MUST NOT reach the filesystem root. A manifest that lacks the identity field or cannot be read is skipped with a non-fatal diagnostic reported through `report` (recorded in `IndexResult.errors` without failing the run) and the walk continues, still bounded by `repoRoot`. Every skipped manifest MUST be reported even when the bounded search ends without finding a usable manifest and `identity` returns `undefined`.

A language whose package directory is computed from the manifest location (for example Go, where the package directory is relative to the directory of `go.mod`) SHALL compute it relative to the package root, not to the code root.

An adapter that does not provide this facet contributes no package identities, and package-specifier imports from and to its workspaces stay unresolved.

### Requirement: Relative import resolution facet

The `relativeImportResolution` facet SHALL map a relative module specifier to candidate files using the language's extension and index-file conventions. It has one member:

- **`resolve(fromFile: string, specifier: string): string | readonly string[]`** — returns one candidate file id or several, relative to the importing file. It is pure and MUST NOT perform I/O. It does not choose among candidates; the caller keeps only candidates that are indexed files.

An adapter whose language has no relative imports MUST NOT provide this facet.

### Requirement: Qualified-name resolution facet

The `qualifiedNameResolution` facet SHALL support languages whose imports and loaders are addressed by namespace-qualified names. It has these members:

- **`build(namespace: string, symbolName: string): string`** — builds the language's canonical qualified name. It is pure.
- **`resolveToPath(qualifiedName: string, codeRoot: string, session: IndexSession): string | undefined`** — maps a qualified name to a source file path using only metadata already prepared in the run-scoped session. It MUST NOT read the filesystem, and it is synchronous and deterministic.

Metadata such as PSR-4 maps MUST come from compact state prepared during analysis or by the `packageResolution.prepare` step. An adapter that has no qualified-name addressing MUST NOT provide this facet.

### Requirement: Symbol reference syntax facet

The `symbolReferenceSyntax` facet SHALL let a consumer accept and display human-written symbol references in the adapter's language. It has these members:

- **`parse(text: string): ParsedSymbolReference`** — parses supported human and native member-reference syntax into structured owner-then-member selectors. It returns zero, one, or many explicit candidates. Dynamic or ambiguous syntax stays unresolved. It is pure.
- **`render(symbol: LogicalSymbol, ownerPath: readonly string[]): { generic: string; native?: string }`** — renders a generic spelling and an optional language-native spelling from a structured logical member. `ownerPath` lists the owner names from the root to the immediate owner. It is pure.

A consumer needing human-reference parsing for a language whose adapter does not provide this facet SHALL treat the reference as unresolved.

### Requirement: Re-export linking facet

The `reExportLinking` facet SHALL turn re-export routes found during analysis into public bindings and resolution steps. It has one member:

- **`link(context: ReExportLinkContext): ReExportLinkResult`** — receives the `IndexSession`, the package map, and the prepared manifest facts, and returns the public bindings and resolution steps to add. It MUST NOT perform I/O.

The indexer SHALL run every present `reExportLinking` facet after all workspaces have completed Pass 1 and before any import is resolved in Pass 2. Import resolution MUST therefore see the final public bindings of every entry surface, including bindings reached through barrel chains and other workspaces. Linking MUST depend only on facts available after Pass 1 and the prepared manifest facts.

### Requirement: Package import resolution context

`ImportResolutionContext` SHALL expose the data and the shared helpers an adapter needs to resolve non-relative imports without implementing the lookup itself:

- the list of workspaces (`name` and `codeRoot`) and the `packageName → workspaceName` map;
- **`packageEntryFiles(specifier: string): PackageEntryResolution`** — uses the importing adapter's `packageResolution` facet to match the specifier to a known package, obtain its `entrySurface`, and return the entries whose file is indexed;
- **`resolvePackageExport(request: PackageExportRequest): PackageExportResolution`** — for an exported name and the symbol spaces to consider, reads the public bindings stored under the surfaces of the entries that `packageEntryFiles` returned and resolves the name to a logical target. The adapter passes every space the import could address (for example `value` and `type` for a plain named import, `type` only for a type-only import).

`resolvePackageExport` SHALL resolve a name only when every binding found in every requested space and every entry leads to the same logical target. A binding without a target is ignored by this check. When nothing exports the name, or the bindings lead to different targets, the result is unresolved with a reason. The reasons are: `facet-absent`, `package-unknown`, `no-entry-surface`, `not-exported`, and `ambiguous`. The result for a resolved name carries the target logical id, the entry file, and the public binding id used.

An adapter SHALL resolve a package-specifier import by calling these helpers. It MUST NOT search symbols by name in the target workspace, and it MUST NOT choose the first or a unique same-name symbol. The helpers are implemented generically by the indexer and contain no language-specific logic.

`ResolvedImports` SHALL include a `steps` entry of kind `import:package` for each resolved package import, from the importing file's local binding id to the public binding id, and a diagnostics entry with the reason for each package import that stayed unresolved, including `package-unknown`. The indexer SHALL persist the steps and SHALL NOT persist the diagnostics. `package-unknown` is not a failure: an import of a package that no workspace declares is an external dependency, and the indexer only counts it in `externalPackageImports`, excluding it from the failure total, the per-reason counts, and the samples.

### Requirement: Full-file analysis contract

Each built-in language adapter SHALL emit a complete compact `FileAnalysisDraft` for every indexed file in a single `analyzeFile` call.

The draft MUST include every deterministic analysis fact the adapter needs later in the run for import resolution and relation building. Adapters MUST NOT require the indexer to call separate symbol, import, binding, or call extraction entry points for the same file.

The draft MAY include compact per-file parser-specific state when that state avoids repeated deterministic work in Pass 2, but it MUST remain serializable in memory-friendly plain data structures and MUST NOT retain AST nodes, parser trees, or other heavyweight parser-runtime objects.

### Requirement: Parser-authoritative structural fact extraction

When the configured parser represents a source construct, an adapter SHALL derive the construct's declaration role, call or construction form, import, binding, type reference, hierarchy relation, owner, scope, caller, arguments, and source range from typed parser nodes, named fields, ancestry, and parser coordinates. Raw-source regular expressions or substring scans MUST NOT independently decide that such a structural or semantic fact exists.

A regular expression MAY parse an auxiliary manifest for which the adapter has no configured syntax tree, normalize or tokenize text already isolated by an authoritative parser node, or support an explicitly documented grammar-compatibility case. Such use MUST NOT escape the parser node's range or manufacture a declaration, owner, caller, call, import, or dependency that parser evidence cannot prove. Framework-specific rules MAY recognize known APIs and literal conventions, but SHALL inspect parser-proven call nodes and arguments rather than rediscovering call syntax in the whole source string.

Unsupported, erroneous, ambiguous, or runtime-only syntax SHALL yield no graph fact or an explicit unresolved fact as defined by the relevant value-object contract. Textual proximity MUST NOT be used to guess missing structural evidence.

A syntactically valid import or loader whose target cannot be resolved MAY remain as unresolved analysis evidence, but it MUST NOT emit a persisted dependency relation to the first syntactic candidate, a raw specifier, or another guessed target. Imported hierarchy evidence SHALL follow the same rule: every persisted hierarchy relation MUST have one matching shared hierarchy reference fact carrying the parser-derived range, resolution provenance, and resolved target.

Filesystem-derived resolution metadata, including manifests and package maps, SHALL be prepared in the run-scoped adapter session before per-file relation analysis. Pass 2 relation extraction MUST consume immutable session data and MUST NOT perform metadata filesystem I/O or rely on mutable adapter-instance caches shared across sessions.

Every built-in and newly registered first-party adapter SHALL maintain tests covering its structural-text boundary. The tests MUST prove that comments, string and template contents, multiline syntax, optional or chained syntax, nested expressions, and same-line constructs cannot create lookalike graph facts, while legitimate auxiliary-metadata parsing remains supported.

### Requirement: Unified built-in adapter migration

The built-in TypeScript/JavaScript, PHP, Python, and Go adapters SHALL all implement the unified `analyzeFile` / `resolveImports` / `buildRelations` contract within the same change.

The code graph MUST NOT retain a parallel legacy adapter-extraction path once this contract is introduced. The indexer, adapter registry, provider wiring, and tests SHALL treat the unified contract as the only supported built-in adapter interface.

### Requirement: Language detection

File-to-language mapping SHALL be determined by file extension. Each adapter declares its supported extensions through `extensions()`, and the adapter registry builds the mapping dynamically when adapters are registered. Files with unrecognized extensions SHALL be silently skipped: no error is thrown and no `FileNode` is created.

The general contract MUST NOT hardcode one built-in language's extensions or grammar behavior. Each built-in adapter's supported languages, extensions, syntax coverage, resolution semantics, hierarchy rules, and unsupported boundary SHALL be defined by its specific language-adapter spec.

### Requirement: Import declaration extraction

`LanguageAdapter.analyzeFile(filePath: string, content: string, context: AdapterAnalyzeContext): FileAnalysisDraft` SHALL include structured import declarations for the analyzed file as part of the returned draft.

`ImportDeclaration` is a value object with:

- **`localName`** (`string`) — the name used locally in the importing file (may differ from original via aliasing)
- **`originalName`** (`string`) — the name as declared in the source module
- **`specifier`** (`string`) — the raw import specifier string (e.g. `'./utils.js'`, `'@specd/core'`, `'os'`)
- **`isRelative`** (`boolean`) — true if the specifier is relative to the importing file (starts with `.` for all built-in adapters that use relative imports)

Each adapter parses imports using its language's syntax:

| Language   | Import syntax                           | isRelative      |
| ---------- | --------------------------------------- | --------------- |
| TypeScript | `import { X } from 'specifier'`         | starts with `.` |
| Python     | `from module import X`, `import module` | starts with `.` |
| Go         | `import "pkg"`, `import alias "pkg"`    | always `false`  |
| PHP        | `use Namespace\Class`                   | always `false`  |

The adapter only parses syntax during `analyzeFile` — specifier resolution is handled later by `resolveImports()` during Pass 2.

### Requirement: Call resolution

For `CALLS` relations, the adapter MUST extract deterministic call facts during `analyzeFile()` and convert them into persisted `CALLS` relations during `buildRelations()` using the resolved import information and shared session lookups.

- **Caller**: the innermost enclosing function, method, or arrow function containing the call expression. Calls at module top level are silently dropped.
- **Callee**: resolved through deterministic local symbols, resolved imports, receiver bindings, or other statically known candidates available through the shared session and adapter facts.

Calls to identifiers that cannot be resolved deterministically (e.g. unresolved global built-ins, ambiguous member expressions, dynamic expressions) SHALL be silently dropped — no relation is created, no error is thrown.

### Requirement: Semantic caller containment

A `CallFact.callerSymbolId` SHALL identify the innermost language-approved executable declaration whose complete parser-derived range contains the call expression. Containment MUST compare both line and column coordinates using the shared half-open range convention, including when declarations and calls occur on the same line.

A declaration that merely starts before the call MUST NOT be selected. Variables, properties, types, containers, or unrelated preceding declarations MUST NOT become callers unless the language-specific adapter contract explicitly classifies that declaration as an executable callable container.

Caller selection SHALL be implemented through one shared containment policy used by built-in adapters and the scoped-binding fallback. An adapter MUST NOT retain a private nearest-preceding, line-only caller selector. When no supported containing caller can be proven, the call SHALL remain caller-unresolved and MUST NOT produce a speculative source relation.

### Requirement: Scoped binding fact extraction

`LanguageAdapter.analyzeFile()` SHALL expose deterministic scoped binding facts and call facts through the returned `FileAnalysisDraft`. Built-in adapters for TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP MUST emit these facts for the deterministic cases defined by this spec.

Adapter-owned fact extraction SHALL include language-specific syntax and semantics only. Shared scope lookup, shadowing, receiver binding, and cross-language candidate filtering belong to the common code-graph pipeline, not to adapter-local full environment implementations.

Adapters SHALL extract deterministic facts for:

- lexical ownership of container scopes (classes, interfaces, structs, protocols, enums) and routine scopes (functions, methods), maintaining an active scope stack that pops enclosing scopes when AST traversal moves past the construct's end line
- typed parameters, including constructor parameters and constructor parameter properties where applicable
- typed properties and fields
- explicit construction expressions such as `new X()` or language-equivalent constructor calls that can produce `CONSTRUCTS`
- receiver identities such as `this`, `self`, `cls`, `parent`, `super`, and language equivalents when deterministic
- local aliases whose source binding is already deterministic
- imported or referenced type names that can produce `USES_TYPE` or affect receiver resolution
- framework-managed bindings that the adapter can identify through deterministic, registry-based rules

Adapters MUST silently drop binding facts whose target depends on runtime-only values, reflection, container identifiers, monkey patching, non-literal dynamic expressions, or whole-program data flow.

### Requirement: Built-in multi-language dependency coverage

Every registered built-in adapter SHALL implement the shared analysis, import-resolution, relation-building, reference-fact, range, coverage, and capability contracts. The adapter-specific specs are authoritative for the deterministic syntax and semantic boundary of each language:

- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`

Generic indexing or resolution code MUST NOT add language-name branches to compensate for facts omitted by a built-in adapter. A language-specific capability absent from its facts SHALL remain unsupported coverage.

### Requirement: Detectable dependency boundary

A dependency, type target, constructor target, or call target SHALL be considered detectable only when the adapter and shared resolver can identify it from source text, imports, manifest-backed package identity, qualified-name maps, or deterministic framework rules without executing project code.

Safe static cases and deterministic dynamic cases MAY emit graph relations, including `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, and hierarchy relations. Heuristic dynamic cases MUST NOT emit graph relations unless the resolver records enough deterministic evidence to avoid false positives.

Unresolved binding facts, unresolved imports, ambiguous receivers, runtime service identifiers, reflection, monkey patching, and interprocedural alias flow SHALL be dropped from persisted graph output. Implementations MAY expose them through non-persisted diagnostics or test-only debug output.

### Requirement: Hierarchy extraction

Adapters SHALL extract hierarchy relations when the language exposes them deterministically.

Rules:

- Emit `EXTENDS` when a type declaration inherits from another resolvable type.
- Emit `IMPLEMENTS` when a type declaration fulfills a resolvable contract or interface-like declaration.
- Emit `OVERRIDES` when a method declaration can be matched deterministically to a base or contract method it replaces or fulfills.
- Adapters for already supported languages MAY normalize inheritance-adjacent constructs into `EXTENDS`, `IMPLEMENTS`, or `OVERRIDES` when that preserves useful impact, hotspot, and code-understanding semantics.
- Constructs that cannot be normalized without materially distorting their meaning MUST be dropped in this iteration rather than introducing a new base relation type.
- Unresolvable hierarchy targets are silently dropped.

### Requirement: Package identity extraction

Package identity SHALL be provided by `packageResolution.identity`, defined in "Package resolution facet". An adapter that does not provide the facet has no package identity, and cross-workspace resolution for its workspaces stays unresolved.

The indexer calls `identity` for each workspace's `codeRoot` to build a `packageName → workspaceName` map. This enables cross-workspace import resolution without coupling the indexer to any language's package system.

The indexer SHALL ask every adapter that provides `packageResolution` for an identity of each workspace, not only the first adapter that answers, so a workspace that holds several manifests (for example `package.json` and `composer.json`) keeps one identity per language. When two different workspaces claim the same package name, that name is ambiguous: it SHALL resolve to no workspace and SHALL be reported as an indexing error naming both workspaces. The same workspace claiming one name through several adapters is not an ambiguity.

The indexer SHALL map identities and prepare manifests for every configured workspace, including the workspaces that a partial run does not index. A workspace whose code root is not accessible (for example a repository that is not cloned on this machine) SHALL be skipped with a diagnostic entry in `IndexResult.errors`, its packages stay external, and it MUST NOT fail the run.

For Python, the identity field is the `name` key inside the `[project]` table only. A `name` key in any other table, including `[tool.poetry]`, MUST NOT be used. Double-quoted and single-quoted TOML strings MUST both match. When `[project].name` is absent, that file MUST NOT yield an identity and the search MUST continue to the next manifest on the walk.

`identity` and `prepare` perform I/O (they read manifest files from disk). `resolutionManifests()` MUST NOT perform that I/O.

### Requirement: Import specifier resolution

Import and qualified-name resolution often need project-wide file and symbol existence checks.

Adapters SHALL resolve imports and dynamic file targets through the shared `IndexSession` indexes and the helpers exposed by `ImportResolutionContext` rather than by scanning all symbols or re-reading the filesystem during Pass 2.

- `packageResolution.matchSpecifier` and `packageResolution.entrySurface` resolve a package specifier to entry files; the context helpers resolve the exported name.
- `qualifiedNameResolution.resolveToPath` resolves qualified names (like PHP namespaces) to source file paths when the language supports deterministic mapping.
- `relativeImportResolution.resolve` produces the candidate files of a relative specifier.
- `resolveImports` combines raw import declarations, the facets above, and parser-specific deterministic rules into resolved import targets.

Any metadata needed during Pass 2 (for example PSR-4 maps or package `exports`) MUST come from compact state prepared by `packageResolution.prepare` or during analysis. Pass 2 MUST NOT probe the filesystem for per-import existence checks.

The PHP adapter in particular MUST use the shared session's common file and symbol lookups for CakePHP, CodeIgniter, and namespace-driven resolution so dynamic path resolution does not regress into O(N) scans of all workspace symbols.

### Requirement: Tree-sitter query patterns

The specific Tree-sitter / ast-grep query patterns used by each adapter are internal implementation details. They MUST NOT be part of the public API or exposed through the `LanguageAdapter` interface. Adapters are free to change their internal query patterns without breaking consumers.

### Requirement: Adapter registry

An `AdapterRegistry` SHALL map language identifiers to `LanguageAdapter` instances. It provides:

- **`register(adapter: LanguageAdapter): void`** — validates the adapter, then registers it for all languages it declares and all file extensions from `adapter.extensions()`
- **`getAdapter(languageId: string): LanguageAdapter | undefined`** — returns the adapter for a language, or `undefined` if none registered
- **`getAdapterForFile(filePath: string): LanguageAdapter | undefined`** — resolves extension → language → adapter using the dynamically built extension map
- **`getLanguageForFile(filePath: string): string | undefined`** — resolves extension → language identifier (e.g. `'typescript'`, `'python'`), or `undefined` if no adapter handles the extension
- **`getAdapters(): LanguageAdapter[]`** — returns all unique registered adapters

The extension-to-language map is built dynamically from registered adapters — there is no hardcoded extension list in the registry. Adding a new language requires only registering a new adapter.

Adapters SHALL be registered via `register()`. Built-in adapters (such as TypeScript, Python, Go, and PHP) are registered into the registry through composition providers.

`LanguageAdapter` is public API and adapters may be written outside this repository, so `register()` SHALL validate the adapter before changing any registry state. Registration MUST fail with a `SpecdError` carrying the code `INVALID_LANGUAGE_ADAPTER`, and MUST leave the registry unchanged, when:

- a required core member is missing or is not a function;
- `languages()` does not return an array of non-empty strings with at least one identifier, or `extensions()` does not return an object whose keys are extensions and whose values are strings, or maps an extension to a language the adapter does not declare;
- `resolutionManifests()` does not return an array of exact, non-empty basenames (a value containing a path separator or a glob character is invalid);
- a facet property is present but is not an object providing every member of that facet as a function.

The error message SHALL name the offending adapter language, the failed rule, and the missing or invalid member.

Registering an adapter for a language that is already registered SHALL replace the adapter previously registered for that language: the later registration wins, so a third-party adapter can substitute a built-in one. Replacement is per language. The extension mappings the new adapter declares overwrite earlier mappings of the same extension. An earlier adapter keeps every language the new adapter does not declare, and an adapter that no longer serves any language SHALL NOT be returned by `getAdapters()`, so no consumer consults it. Registering the same adapter instance again changes nothing.

### Requirement: Resolver capability declaration

Every adapter SHALL declare the semantic categories it can deterministically prove: declarations, members, public/local bindings, hierarchy, and build-context selection. A capability flag MUST be true only when the adapter emits enough shared facts and ordered provenance for the generic resolver to prove that category. A graph relation emitted only for impact traversal does not by itself satisfy the corresponding resolver capability.

Capability flags describe what the adapter can prove. They are distinct from facets, which describe the resolution services the adapter provides (see "Adapter facet model").

Missing capability support SHALL be recorded as unsupported coverage rather than guessed by the generic resolver. Emitted facts SHALL use the shared logical-symbol, binding, symbol-space, member-form, source-range, hierarchy, provenance-step, and coverage vocabulary. Adapter-specific syntax MUST NOT leak into generic resolver branches.

### Requirement: Built-in adapter specialization

The general language-adapter spec SHALL define the shared port, phase boundaries, fact vocabulary, determinism, capability truthfulness, and common failure behavior. Each built-in adapter SHALL have one complete specific spec defining its languages and extensions, parsed declarations, ranges, imports and exports, logical ownership, member forms and symbol spaces, scoped facts, hierarchy and provenance, package/build context, relations, and unsupported boundary.

A specific adapter spec MAY impose stricter language semantics than this general contract but MUST NOT weaken shared safety or determinism. When implementation changes a built-in adapter's observable syntax or semantic coverage, its specific spec SHALL change with it.

### Requirement: Logical declaring-owner facts

An adapter that advertises member support SHALL derive a member's declaring owner from language syntax and map it to a logical owner identity before constructing the member identity. Raw parser-node identifiers and optional syntax-level parent fields MUST NOT be used as logical owner identities. Top-level declarations SHALL have no owner, and same-name members under different logical owners MUST remain distinct.

### Requirement: Member semantics and declaration parent

An adapter that proves a member SHALL emit `MemberSemantics` (`kind`, `dispatch`, `accessor`, and `nativeKind` only when the grammar proves it) on the logical member. It MUST NOT emit the retired single-axis member form.

The same adapter SHALL set `parentId` on declaration occurrences according to lexical hierarchy:

- Member methods and properties enclosed within a container type (class, interface, struct, protocol, enum) SHALL have `parentId` set to the enclosing container's symbol ID.
- Local variables and nested functions enclosed within a routine body (function, method) SHALL have `parentId` set to the enclosing routine's symbol ID.
- Top-level declarations at file or module scope SHALL omit `parentId`.

The adapter MUST enforce strict scope boundaries when assigning `parentId`. As line numbers advance during AST processing, any scope whose `endLine` is strictly less than the candidate symbol's declaration line MUST be popped from the active scope stack, preventing trailing sibling or top-level declarations from inheriting stale parent IDs. The indexer MUST NOT recompute parent IDs from a hardcoded language list.

### Requirement: Human reference parse and render

The `symbolReferenceSyntax` facet SHALL parse supported human and native member-reference syntax into structured owner-then-member selectors, and SHALL render a generic spelling plus an optional language-native spelling from a structured logical member. Parsing MUST return zero, one, or many explicit candidates. Dynamic or ambiguous syntax MUST stay unresolved.

Canonical and already-structured requests MUST NOT be parsed as human text. The adapter MUST NOT split a reference on `.` inside the shared domain. `resolutionManifests()` MUST remain the adapter-sourced fingerprint input and MUST NOT perform I/O.

### Requirement: Re-export public bindings

The adapter SHALL resolve each re-export specifier through its `reExportLinking` facet and emit the public bindings and resolution steps that are stored.

A relative specifier SHALL resolve to a source file in the importing workspace through `relativeImportResolution`. A non-relative package specifier SHALL resolve through `packageResolution` using the same entry surface that ordinary package imports use. For TypeScript, `package.json` `name` plus `exports` or `main`, including `.js` to the indexed source extension, is that map. `@specd/code-graph` MUST resolve through `exports["."]` to the indexed source of `dist/public.js`. `@specd/code-graph/internal` MUST resolve through the `./internal` export to the indexed source of `dist/index.js`.

The emitted binding SHALL use the re-exporting file as `surface` and the logical id already published by the entry file as `targetId`, including when that id belongs to another workspace. The adapter MUST NOT choose the first symbol of that name anywhere in the target workspace. A specifier that does not resolve to exactly one indexed entry file MUST NOT produce a guessed binding.

The indexer SHALL persist those facts. It MUST NOT read `package.json`, `exports`, `main`, or a TypeScript re-export route, and it MUST NOT copy bindings itself.

### Requirement: Hierarchy evidence consistency

An adapter that advertises `hierarchy: true` SHALL emit shared hierarchy facts and ordered provenance steps sufficient for `ResolveSymbolReference` to traverse from a child owner to an ancestor, embedded, composed, or contract owner and subsequently query a requested member under that owner. It SHALL keep those facts semantically consistent with persisted `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations.

Empty hierarchy/provenance output for source containing supported, resolvable hierarchy syntax is a capability violation. Unsupported precedence, build alternatives, or dynamic hierarchy semantics SHALL instead produce explicit unsupported or unresolved coverage; they MUST NOT be guessed.

### Requirement: Complete symbol source ranges

Every built-in adapter SHALL emit, for each symbol, the complete syntactic construct range and exact declared-name `selectionRange` using the shared half-open source-range convention. The selection range MUST be contained by the construct range.

Adapters SHALL derive these ranges from parsed syntax before parser artifacts are released. They MUST NOT approximate a construct end from the next symbol or from line-oriented regular expressions when the parser exposes the authoritative node range. A candidate without trustworthy complete and selection ranges SHALL be omitted and its capability gap reported rather than emitted with misleading coordinates.

### Requirement: Declaration classification policy

Every language adapter SHALL define a deterministic policy that classifies each supported declaration role as one of: logical target with physical declaration, lexical binding, physical-only declaration, or unsupported/no graph declaration. Classification MUST consider syntax role, lexical scope, visibility, owner, and language semantics; broad `SymbolKind` alone is insufficient.

Adapters SHALL establish canonical logical owners before constructing owned logical identities. Same-name declarations under distinct owners or competing lexical scopes MUST remain distinct. Declarations SHALL share a logical identity only when the language-specific policy proves that they form one semantic target.

### Requirement: Cross-language semantic conformance suite

Every built-in adapter and every newly registered first-party language adapter MUST pass a reusable contract suite covering:

- authoritative construct and selection ranges and exact caller containment;
- same-line, multiline, nested, and unresolved caller cases;
- logical owner creation before member identity;
- same-name declarations in distinct owners and lexical scopes;
- supported merged or overload declaration groups, or explicit absence of such grouping;
- physical declarations without logical identity;
- logical resolution retaining all declaration occurrences;
- logical coverage lookup after physical impact traversal; and
- unresolved imports producing no guessed relation and imported hierarchy relations retaining matching provenance; and
- per-file relation analysis performing no filesystem metadata reads after session preparation; and
- identity-sensitive incremental indexing producing the same semantic graph as a clean rebuild.

Language-specific specs SHALL add scenarios for semantics that the generic suite cannot express. A new adapter MUST NOT be considered conformant solely because it implements the `LanguageAdapter` TypeScript interface.

### Requirement: Adding a language adapter

A new language adapter SHALL be added by completing these steps, in order, without changing the indexer, the index session, the resolver, or the graph stores:

1. Implement the required core: `languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`.
2. Declare `capabilities()` and `declarationPolicy()` truthfully for the semantic categories the adapter can prove.
3. Provide each facet the language supports, with every member of the facet. Skip a facet when the language has no equivalent concept; do not provide a partial facet.
4. List every manifest the facets read in `resolutionManifests()`, and nothing else.
5. Register the adapter. Fix every `INVALID_LANGUAGE_ADAPTER` error before continuing.
6. Pass the cross-language semantic conformance suite and the facet scenarios in this spec's verification.
7. Write the adapter's specific spec and add it to the list of built-in adapter specs when it is built in.

The same guide, restated for readers without access to the specs, SHALL be published in `docs/code-graph/language-adapters.md`. The spec and the page MUST state the same rules.

### Requirement: Bounded per-file structural analysis

A language adapter SHALL derive parser-backed facts with work bounded by the source structures and semantic candidates that must be inspected. When several declarations or references require the same owner, scope, node classification, or callable ordering, the adapter or shared helper SHALL build that structural evidence once per file, owner, scope, or policy and reuse it.

Member classification MUST NOT recursively traverse an unchanged owning type subtree once per member. Lexical-shadowing resolution MUST NOT traverse an unchanged enclosing scope body once per reference. Shared callable-containment resolution MUST NOT filter and sort the complete symbol collection independently for each call position.

File-local indexes SHALL use parser-authoritative declaration identity and explicit scope or owner boundaries. They MUST NOT replace parser evidence with source-line regular expressions, name-only association, nearest-preceding heuristics, or bindings collected from nested lexical scopes.

For identical content and equivalent session context, optimization SHALL preserve symbol identities and ordering, construct and selection ranges, declaration parents, imports, binding facts, call facts, public bindings, member semantics, hierarchy evidence, coverage, diagnostics, and persisted relations. Ambiguous or unsupported syntax MUST remain unresolved rather than becoming a guessed fact.

Complexity verification SHALL use deterministic evidence that repeated structures are indexed or summarized once. Wall-clock timing MAY supplement that evidence but MUST NOT be the sole conformance criterion.

## Constraints

- LanguageAdapter is an interface, not an abstract class — adapters are stateless
- The adapter contract is a required core plus optional facets; a facet is declared by being present and has no optional members
- Consumers decide from facet presence, never from probing individual methods, language identifiers, extensions, or manifest names
- `analyzeFile`, `resolveImports`, and `buildRelations` are synchronous and deterministic
- `analyzeFile` receives content, not file handles, and emits a complete `FileAnalysisDraft`
- Per-file parser state and run-scoped adapter cache state MUST remain compact plain data
- `resolutionManifests()` MUST NOT perform I/O
- Facet methods may read manifests only in `packageResolution.identity` and `packageResolution.prepare`, and Pass 2 import resolution must not probe the filesystem per candidate. Adapters may keep populating run-scoped session state from manifests while analyzing files, as they did before facets existed
- Resolution methods (`matchSpecifier`, `entrySurface`, `resolveToPath`, `resolveImports`) are synchronous and deterministic
- `qualifiedNameResolution.resolveToPath` SHOULD read parsed autoloader/manifest metadata prepared per codeRoot or session to avoid repeated disk reads during a single indexing run
- The indexer MUST NOT contain language-specific resolution logic — all of it is delegated to adapters through facets
- Adding a language MUST NOT require a change to the indexer
- Unrecognized file extensions are silently skipped
- Unresolvable call targets are silently dropped
- Dynamic loader calls with non-literal arguments are silently dropped
- Unresolvable dynamic loader targets are silently dropped for file dependency modeling
- require/include expressions with non-literal or dynamic path arguments are silently dropped
- Loader API support is registry-based and extensible (no hardcoded single-loader assumptions)
- Tree-sitter query patterns are internal — not part of the public API
- The TypeScript adapter is always registered by default
- Hierarchy relations are emitted only when their targets can be resolved deterministically
- Scoped binding facts and call facts MUST NOT perform fuzzy or runtime inference
- No dependency on @specd/core

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `RelationType`, hierarchy edge semantics
