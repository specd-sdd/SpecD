# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit) with the following methods:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extensions(): Record<string, string>`** — returns the file extension to language ID mapping (e.g. `{ '.ts': 'typescript', '.tsx': 'tsx' }`). The adapter registry uses this to resolve files to adapters — no hardcoded extension map.
- **`analyzeFile(filePath: string, content: string, context: AdapterAnalyzeContext): FileAnalysisDraft`** — parses the file content once and returns the complete compact analysis required by indexing for that file, including symbols, imports, deterministic binding facts, deterministic call facts, namespace data when relevant, and optional compact parser-specific state.
- **`resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports`** — resolves the file's previously extracted import declarations, qualified names, aliases, and deterministic file targets using the shared session lookups instead of re-reading or re-parsing file content.
- **`buildRelations(analysis: FileAnalysis, context: RelationBuildContext): readonly Relation[]`** — builds deterministic graph relations for the file from the stored analysis facts and resolved import information. For code-file dependencies, adapters SHOULD emit concrete relations (`IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, hierarchy relations) when targets are resolvable; `DEPENDS_ON` remains reserved for spec-level dependency edges.
- **`getPackageIdentity?(codeRoot: string, repoRoot?: string): string | undefined`** — optionally derives a package identity for the workspace.
- **`resolvePackageFromSpecifier?(specifier: string, knownPackages: string[]): string | undefined`** — optionally maps an import specifier to a package identity.
- **`resolveQualifiedNameToPath?(qualifiedName: string, codeRoot: string, repoRoot?: string): string | undefined`** — optionally maps a qualified name to a source file path for languages that support deterministic namespace resolution.

All adapter methods MUST be synchronous and deterministic with respect to the provided arguments and shared session context. They receive content as a string during analysis, not a file path to read, and they MUST NOT perform side effects outside the indexing session. Adapters MAY read and update compact run-scoped adapter cache state only through the `IndexSession` API exposed by the provided contexts.

### Requirement: Full-file analysis contract

Each built-in language adapter SHALL emit a complete compact `FileAnalysisDraft` for every indexed file in a single `analyzeFile` call.

The draft MUST include every deterministic analysis fact the adapter needs later in the run for import resolution and relation building. Adapters MUST NOT require the indexer to call separate symbol, import, binding, or call extraction entry points for the same file.

The draft MAY include compact per-file parser-specific state when that state avoids repeated deterministic work in Pass 2, but it MUST remain serializable in memory-friendly plain data structures and MUST NOT retain AST nodes, parser trees, or other heavyweight parser-runtime objects.

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

### Requirement: Scoped binding fact extraction

`LanguageAdapter.analyzeFile()` SHALL expose deterministic scoped binding facts and call facts through the returned `FileAnalysisDraft`. Built-in adapters for TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP MUST emit these facts for the deterministic cases defined by this spec.

Adapter-owned fact extraction SHALL include language-specific syntax and semantics only. Shared scope lookup, shadowing, receiver binding, and cross-language candidate filtering belong to the common code-graph pipeline, not to adapter-local full environment implementations.

Adapters SHALL extract deterministic facts for:

- lexical ownership of file, class/type, method, function, and block scopes where the language exposes them clearly
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

The `repoRoot` parameter is resolved by the CLI/MCP layer using the VCS adapter (`VcsAdapter.rootDir()`), making it VCS-agnostic (git, hg, svn). When not provided, the search walks up to the filesystem root.

The indexer calls this method for each workspace's `codeRoot` to build a `packageName → workspaceName` map. This enables cross-workspace import resolution without coupling the indexer to any language's package system.

Unlike extraction methods, `getPackageIdentity` performs I/O (reads a manifest file from disk). It is optional — adapters that do not implement it simply return `undefined`, and cross-workspace resolution for that language falls back to unresolved.

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

The TypeScript adapter MUST be registered by default when the registry is created. Additional adapters can be registered to extend language support.

### Requirement: Resolver capability declaration

Every adapter SHALL declare the semantic categories it can deterministically prove: declarations, members, public/local bindings, hierarchy, and build-context selection. A capability flag MUST be true only when the adapter emits enough shared facts and ordered provenance for the generic resolver to prove that category. A graph relation emitted only for impact traversal does not by itself satisfy the corresponding resolver capability.

Missing capability support SHALL be recorded as unsupported coverage rather than guessed by the generic resolver. Emitted facts SHALL use the shared logical-symbol, binding, symbol-space, member-form, source-range, hierarchy, provenance-step, and coverage vocabulary. Adapter-specific syntax MUST NOT leak into generic resolver branches.

### Requirement: Built-in adapter specialization

The general language-adapter spec SHALL define the shared port, phase boundaries, fact vocabulary, determinism, capability truthfulness, and common failure behavior. Each built-in adapter SHALL have one complete specific spec defining its languages and extensions, parsed declarations, ranges, imports and exports, logical ownership, member forms and symbol spaces, scoped facts, hierarchy and provenance, package/build context, relations, and unsupported boundary.

A specific adapter spec MAY impose stricter language semantics than this general contract but MUST NOT weaken shared safety or determinism. When implementation changes a built-in adapter's observable syntax or semantic coverage, its specific spec SHALL change with it.

### Requirement: Logical declaring-owner facts

An adapter that advertises member support SHALL derive a member's declaring owner from language syntax and map it to a logical owner identity before constructing the member identity. Raw parser-node identifiers and optional syntax-level parent fields MUST NOT be used as logical owner identities. Top-level declarations SHALL have no owner, and same-name members under different logical owners MUST remain distinct.

### Requirement: Hierarchy evidence consistency

An adapter that advertises `hierarchy: true` SHALL emit shared hierarchy facts and ordered provenance steps sufficient for `ResolveSymbolReference` to traverse from a child owner to an ancestor, embedded, composed, or contract owner and subsequently query a requested member under that owner. It SHALL keep those facts semantically consistent with persisted `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations.

Empty hierarchy/provenance output for source containing supported, resolvable hierarchy syntax is a capability violation. Unsupported precedence, build alternatives, or dynamic hierarchy semantics SHALL instead produce explicit unsupported or unresolved coverage; they MUST NOT be guessed.

### Requirement: Complete symbol source ranges

Every built-in adapter SHALL emit, for each symbol, the complete syntactic construct range and exact declared-name `selectionRange` using the shared half-open source-range convention. The selection range MUST be contained by the construct range.

Adapters SHALL derive these ranges from parsed syntax before parser artifacts are released. They MUST NOT approximate a construct end from the next symbol or from line-oriented regular expressions when the parser exposes the authoritative node range. A candidate without trustworthy complete and selection ranges SHALL be omitted and its capability gap reported rather than emitted with misleading coordinates.

## Constraints

- LanguageAdapter is an interface, not an abstract class — adapters are stateless
- `analyzeFile`, `resolveImports`, and `buildRelations` are synchronous and deterministic
- `analyzeFile` receives content, not file handles, and emits a complete `FileAnalysisDraft`
- Per-file parser state and run-scoped adapter cache state MUST remain compact plain data
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
