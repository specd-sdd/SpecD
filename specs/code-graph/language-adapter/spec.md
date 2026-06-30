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

File-to-language mapping SHALL be determined by file extension. Each adapter declares its supported extensions via `extensions()`, and the adapter registry builds the mapping dynamically when adapters are registered. Files with unrecognized extensions SHALL be silently skipped — no error is thrown, no `FileNode` is created.

The following extensions are declared by the built-in TypeScript adapter:

| Extension | Language ID  |
| --------- | ------------ |
| `.ts`     | `typescript` |
| `.tsx`    | `tsx`        |
| `.js`     | `javascript` |
| `.jsx`    | `jsx`        |

### Requirement: TypeScript adapter

A built-in `TypeScriptLanguageAdapter` SHALL handle `typescript`, `tsx`, `javascript`, and `jsx` files using `@ast-grep/napi` for Tree-sitter parsing. Through the unified `analyzeFile` / `resolveImports` / `buildRelations` contract it MUST support:

- **Symbols**: functions (named + arrow assigned to const), classes, methods, exported variables, type aliases, interfaces, enums
- **Comments**: For each extracted symbol, the adapter extracts the raw text of the immediately preceding comment block (JSDoc `/** ... */`, block `/* ... */`, or contiguous line comments `// ...`). The comment is stored verbatim in `SymbolNode.comment`. If no comment precedes the declaration, `comment` is `undefined`.
- **Relations**: `DEFINES` (file → symbol), `EXPORTS` (file → exported symbol), `IMPORTS` (file → file via import specifier resolution), `CALLS` (symbol → symbol via call expressions)

The adapter maps TypeScript/JavaScript constructs to `SymbolKind` values:

| Construct                          | SymbolKind  |
| ---------------------------------- | ----------- |
| Function declaration               | `function`  |
| Arrow function assigned to `const` | `function`  |
| Class declaration                  | `class`     |
| Method definition                  | `method`    |
| Exported `const`/`let`/`var`       | `variable`  |
| Type alias                         | `type`      |
| Interface declaration              | `interface` |
| Enum declaration                   | `enum`      |

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

Built-in adapters SHALL improve dependency and call extraction for all currently supported built-in languages, not only languages present in the current repository graph.

The TypeScript adapter SHALL detect deterministic dependency signals from:

- static imports, side-effect imports, dynamic `import()` with string-literal specifiers, and CommonJS `require()` with string-literal specifiers
- constructor calls such as `new ClassName()` as `CONSTRUCTS` candidates
- constructor parameter type annotations, ordinary parameter type annotations, return type annotations, and field/property type annotations as `USES_TYPE` candidates
- class fields, constructor parameter properties, and `this` receiver bindings
- member calls such as `obj.method()` and namespace/static calls such as `ns.fn()` when receiver binding or imports make the target deterministic
- `extends` and `implements` declarations where targets resolve to known symbols

The Python adapter SHALL detect deterministic dependency signals from:

- `import` and `from ... import ...` declarations, including accessible local names for `import package.module`
- string-literal `importlib.import_module()` and `__import__()` calls
- package and submodule layouts that can be resolved without executing Python code, including common `src/` and package `__init__.py` layouts
- constructor calls as `CONSTRUCTS`, typed parameters or attributes as `USES_TYPE` where annotations are statically available, `self` and `cls` receiver bindings, and class inheritance where targets resolve to known symbols

The Go adapter SHALL detect deterministic dependency signals from:

- standard, grouped, aliased, dot, and blank imports
- file-to-file `IMPORTS` relations for resolvable package imports
- selector expressions such as `pkg.Func()` and `obj.Method()` when package aliases or receiver bindings make the target deterministic
- constructor-like calls and composite literals as `CONSTRUCTS` when they identify resolvable types
- promoted methods and receiver-related composition only when they can be normalized without speculative inference

The PHP adapter SHALL continue to support require/include, dynamic loader dependencies, loaded-instance calls, and framework-managed bindings, but these deterministic facts SHOULD feed the shared scoped binding model rather than remaining only in adapter-local alias maps.

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

### Requirement: PHP require/include dependencies

The PHP adapter MUST detect `require`, `require_once`, `include`, and `include_once` expressions and emit `IMPORTS` relations when the path argument is a resolvable string literal.

Rules:

- When the argument is a plain string literal (e.g. `require_once 'lib/helper.php'`), resolve the path relative to the importing file's directory and emit an `IMPORTS` relation from the current file to the resolved path.
- When the argument is a dynamic expression (concatenation, a PHP constant such as `APPPATH` or `__DIR__ . '/...'`, a variable), the expression MUST be silently dropped — no relation is created, no error is thrown.
- The resolved path is not validated against the filesystem at extraction time — the indexer's existing file-existence check during Pass 2 handles missing targets.

This covers legacy PHP codebases (pre-namespace) and framework bootstrappers that load files via include paths rather than autoloaders (CakePHP 1.x, CodeIgniter 1.x–3.x, Zend 1.x, Drupal 7, WordPress).

### Requirement: PHP dynamic loader dependencies

The PHP adapter MUST detect framework-specific dependency acquisition patterns and emit file-level `IMPORTS` relations when the referenced target can be resolved to a file path.

Supported pattern families include:

- CakePHP:
  - `$this->loadModel('X')`, `loadModel('X')`
  - `$this->loadController('X')`, `loadController('X')`
  - `$this->loadComponent('X')`, `loadComponent('X')`
  - `App::uses('X', 'Y')`, `App::import('Model', 'X')`, `ClassRegistry::init('X')`
  - class-property dependency declarations such as `var $uses = array(...)`, `public $uses = [...]`, and `protected $uses = [...]` when they use literal string entries
- CodeIgniter:
  - `$this->load->model('X')`, `$this->load->library('X')`, `$this->load->helper('X')`
- Yii:
  - `Yii::import('...')`, `Yii::createObject('...')` when the target class or path is expressed as a literal and can be resolved
- Zend:
  - `Zend_Loader::loadClass('...')`
- Other PHP framework or container families:
  - explicit dependency acquisition APIs using class literals, qualified class names, or deterministic naming conventions MAY be supported when resolver rules can map them to concrete files without executing application code

Rules:

- When dependency-acquisition arguments are string literals or class literals and resolver rules can map them to a concrete target file, emit `IMPORTS` from source file to resolved target file.
- When dependency declarations appear as class properties with literal entries, the adapter MUST treat them as file-level dependency signals for the declaring class.
- Generic method names (for example `->get('x')`) MUST NOT be detected unless a resolver explicitly declares a framework-specific signature with deterministic target resolution.
- When arguments are non-literal, container-driven without an explicit class target, or the target cannot be resolved, silently drop the relation (no fallback `DEPENDS_ON` edge for file dependencies).

### Requirement: PHP loaded-instance call extraction

The PHP adapter MUST perform deterministic heuristic extraction of `CALLS` from framework-managed or explicitly constructed PHP instances when their targets can be resolved statically.

Rules:

- Within a single method or function body, track aliases bound to resolved loaded dependencies, framework-managed properties, and simple local assignments.
- Class-property dependency declarations (for example CakePHP `uses`) MUST make the corresponding framework-managed aliases available to methods of the declaring class.
- Bare loader forms and receiver-based loader forms that resolve the same dependency kind MUST feed the same alias and call-resolution flow.
- For member calls on those aliases (for example `$this->Article->save()`, `$model->find()`, `$this->email->send()`), emit `CALLS` only when both caller and callee symbols are resolvable.
- Explicit instance construction flows such as `new X()` or class-literal service acquisition MAY emit `CALLS` when the constructed or resolved class target is statically known and the subsequent method call can be mapped to a concrete symbol.
- Do not perform interprocedural propagation in this requirement (no cross-method alias flow, no whole-program inference).
- Ambiguous alias targets, runtime-only service identifiers, and unresolved member calls MUST be dropped to avoid noisy false positives.

### Requirement: PHP loader resolver extensibility

Loader support in the PHP adapter MUST be registry-based and extensible.

Rules:

- Framework-specific loader detection/resolution MUST be implemented as resolver entries (or resolver modules) with a shared contract.
- Adding a new loader API (e.g. `loadController`, `loadComponent`, or framework-specific factories) MUST be achievable by adding resolver definitions, without changing the core extraction flow.
- Resolver behavior must be unit-tested per pattern to prevent regressions in existing loader coverage.

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
