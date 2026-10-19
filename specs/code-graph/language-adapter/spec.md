# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit) with the following methods:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extensions(): Record<string, string>`** — returns the file extension to language ID mapping (e.g. `{ '.ts': 'typescript', '.tsx': 'tsx' }`). The adapter registry uses this to resolve files to adapters — no hardcoded extension map.
- **`resolutionManifests(): readonly string[]`** — returns the exact basenames of the manifests this adapter reads for package identity or import resolution. The method is required, synchronous, and MUST NOT perform I/O. An adapter that reads no resolution manifest MUST return an empty array. Values MUST be exact filenames, not globs or directory paths.
- **`analyzeFile(filePath: string, content: string, context: AdapterAnalyzeContext): FileAnalysisDraft`** — parses the file content once and returns the complete compact analysis required by indexing for that file, including symbols, imports, deterministic binding facts, deterministic call facts, namespace data when relevant, and optional compact parser-specific state.
- **`resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports`** — resolves the file's previously extracted import declarations, qualified names, aliases, and deterministic file targets using the shared session lookups instead of re-reading or re-parsing file content.
- **`getPackageIdentity?(codeRoot: string, repoRoot?: string): string | undefined`** — optionally derives a package identity for the workspace.
- **`resolvePackageFromSpecifier?(specifier: string, knownPackages: string[]): string | undefined`** — optionally maps an import specifier to a package identity.
- **`resolveQualifiedNameToPath?(qualifiedName: string, codeRoot: string, repoRoot?: string): string | undefined`** — optionally maps a qualified name to a source file path for languages that support deterministic namespace resolution.

All adapter methods MUST be synchronous and deterministic with respect to the provided arguments and shared session context. They receive content as a string during analysis, not a file path to read, and they MUST NOT perform side effects outside the indexing session. Adapters MAY read and update compact run-scoped adapter cache state only through the `IndexSession` API exposed by the provided contexts.

The default TypeScript adapter MUST return `['package.json']` from `resolutionManifests()`.

- **`buildRelations(analysis: FileAnalysis, context: RelationBuildContext): readonly Relation[]`** — builds deterministic graph relations for the file from the stored analysis facts and resolved import information. For code-file dependencies, adapters SHOULD emit concrete relations (`CALLS`, `CONSTRUCTS`, `USES_TYPE`, hierarchy relations) when targets are resolvable. File-level `IMPORTS` relations are derived by the indexer from the resolved imports returned by `resolveImports()`; an adapter MAY emit `IMPORTS` only for loader-style dependencies that only the adapter can prove; `DEPENDS_ON` remains reserved for spec-level dependency edges.

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

`LanguageAdapter` MAY provide an optional method:

- **`getPackageIdentity?(codeRoot: string, repoRoot?: string): string | undefined`** — searches at and above `codeRoot` (bounded by `repoRoot`) for the language's package manifest and returns the package name, or `undefined` if no manifest is found.

Each adapter reads its language's package manifest:

| Language   | Manifest file    | Identity field   |
| ---------- | ---------------- | ---------------- |
| TypeScript | `package.json`   | `name`           |
| Python     | `pyproject.toml` | `[project].name` |
| Go         | `go.mod`         | `module`         |
| PHP        | `composer.json`  | `name`           |

Every manifest basename in that table MUST appear in the corresponding adapter's `resolutionManifests()` result. `resolutionManifests()` MUST NOT name a file the adapter does not read for package identity or import resolution.

For Python, the identity field is the `name` key inside the `[project]` table only. A `name` key in any other table, including `[tool.poetry]`, MUST NOT be used. Double-quoted and single-quoted TOML strings MUST both match. When `[project].name` is absent, that file MUST NOT yield an identity and the search MUST continue to the next manifest on the walk.

The `repoRoot` parameter is resolved by the CLI/MCP layer using the VCS adapter (`VcsAdapter.rootDir()`), making it VCS-agnostic (git, hg, svn). When not provided, the search walks up to the filesystem root.

The indexer calls this method for each workspace's `codeRoot` to build a `packageName → workspaceName` map. This enables cross-workspace import resolution without coupling the indexer to any language's package system.

Unlike extraction methods, `getPackageIdentity` performs I/O (reads a manifest file from disk). It is optional — adapters that do not implement it simply return `undefined`, and cross-workspace resolution for that language falls back to unresolved. `resolutionManifests()` MUST NOT perform that I/O.

### Requirement: Import specifier resolution

Import and qualified-name resolution methods often need project-wide file and symbol existence checks.

Adapters SHALL resolve imports and dynamic file targets through the shared `IndexSession` indexes exposed by `ImportResolutionContext` rather than by scanning all symbols or re-reading the filesystem during Pass 2.

- `resolvePackageFromSpecifier` resolves package identity from a specifier.
- `resolveQualifiedNameToPath` resolves qualified names (like PHP namespaces) to source file paths when the language supports deterministic mapping.
- `resolveImports` combines raw import declarations, package identity, qualified-name lookup, and parser-specific deterministic rules into resolved import targets.

Any metadata needed by `resolveQualifiedNameToPath` during Pass 2 (for example PSR-4 maps) MUST come from compact state already prepared during analysis or from deterministic run-scoped adapter cache state held in the session. Pass 2 MUST NOT probe the filesystem for per-import existence checks.

The PHP adapter in particular MUST use the shared session's common file and symbol lookups for CakePHP, CodeIgniter, and namespace-driven resolution so dynamic path resolution does not regress into O(N) scans of all workspace symbols.

### Requirement: Tree-sitter query patterns

The specific Tree-sitter / ast-grep query patterns used by each adapter are internal implementation details. They MUST NOT be part of the public API or exposed through the `LanguageAdapter` interface. Adapters are free to change their internal query patterns without breaking consumers.

### Requirement: Adapter registry

An `AdapterRegistry` SHALL map language identifiers to `LanguageAdapter` instances. It provides:

- **`register(adapter: LanguageAdapter): void`** — registers an adapter for all languages it declares and all file extensions from `adapter.extensions()`
- **`getAdapter(languageId: string): LanguageAdapter | undefined`** — returns the adapter for a language, or `undefined` if none registered
- **`getAdapterForFile(filePath: string): LanguageAdapter | undefined`** — resolves extension → language → adapter using the dynamically built extension map
- **`getLanguageForFile(filePath: string): string | undefined`** — resolves extension → language identifier (e.g. `'typescript'`, `'python'`), or `undefined` if no adapter handles the extension
- **`getAdapters(): LanguageAdapter[]`** — returns all unique registered adapters

The extension-to-language map is built dynamically from registered adapters — there is no hardcoded extension list in the registry. Adding a new language requires only registering a new adapter.

Adapters SHALL be registered via `register()`. Built-in adapters (such as TypeScript, Python, Go, and PHP) are registered into the registry through composition providers.

### Requirement: Resolver capability declaration

Every adapter SHALL declare the semantic categories it can deterministically prove: declarations, members, public/local bindings, hierarchy, and build-context selection. A capability flag MUST be true only when the adapter emits enough shared facts and ordered provenance for the generic resolver to prove that category. A graph relation emitted only for impact traversal does not by itself satisfy the corresponding resolver capability.

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

`LanguageAdapter` SHALL parse supported human and native member-reference syntax into structured owner-then-member selectors, and SHALL render a generic spelling plus an optional language-native spelling from a structured logical member. Parsing MUST return zero, one, or many explicit candidates. Dynamic or ambiguous syntax MUST stay unresolved.

Canonical and already-structured requests MUST NOT be parsed as human text. The adapter MUST NOT split a reference on `.` inside the shared domain. `resolutionManifests()` MUST remain the adapter-sourced fingerprint input and MUST NOT perform I/O.

### Requirement: Re-export public bindings

The adapter SHALL resolve each re-export specifier and emit the public bindings and resolution steps that are stored.

A relative specifier SHALL resolve to a source file in the importing workspace. A non-relative package specifier SHALL resolve through that language's package identity and public entry map. For TypeScript, `package.json` `name` plus `exports` or `main`, including `.js` to the indexed source extension, is that map. `@specd/code-graph` MUST resolve through `exports["."]` to the indexed source of `dist/public.js`. `@specd/code-graph/internal` MUST resolve through the `./internal` export to the indexed source of `dist/index.js`.

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

## Constraints

- LanguageAdapter is an interface, not an abstract class — adapters are stateless
- `analyzeFile`, `resolveImports`, and `buildRelations` are synchronous and deterministic
- `analyzeFile` receives content, not file handles, and emits a complete `FileAnalysisDraft`
- Per-file parser state and run-scoped adapter cache state MUST remain compact plain data
- `resolutionManifests()` MUST NOT perform I/O
- getPackageIdentity and resolveQualifiedNameToPath? are the only methods that may perform I/O, and Pass 2 import resolution must not probe the filesystem per candidate
- Resolution methods (resolvePackageFromSpecifier, resolveQualifiedNameToPath, resolveImports) are synchronous and deterministic
- resolveQualifiedNameToPath? SHOULD cache parsed autoloader/manifest metadata per codeRoot or session to avoid repeated disk reads during a single indexing run
- The indexer MUST NOT contain language-specific resolution logic — all of it is delegated to adapters
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
