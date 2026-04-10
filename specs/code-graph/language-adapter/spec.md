# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit) with the following methods:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extensions(): Record<string, string>`** — returns the file extension to language ID mapping (e.g. `{ '.ts': 'typescript', '.tsx': 'tsx' }`). The adapter registry uses this to resolve files to adapters — no hardcoded extension map.
- **`extractSymbols(filePath: string, content: string): SymbolNode[]`** — parses the file content and returns all symbols found
- **`extractSymbolsWithNamespace?(filePath: string, content: string): { symbols: SymbolNode[]; namespace: string | undefined }`** — optional fast path for languages that can derive symbols and namespace from the same parse tree
- **`extractImportedNames(filePath: string, content: string): ImportDeclaration[]`** — parses import statements and returns structured declarations without resolution
- **`extractRelations(filePath: string, content: string, symbols: SymbolNode[], importMap: Map<string, string>): Relation[]`** — extracts relations (IMPORTS, CALLS, DEFINES, EXPORTS, DEPENDS_ON, EXTENDS, IMPLEMENTS, OVERRIDES) from the file. The `importMap` maps local import names to resolved symbol IDs, built by the indexer during Pass 2. For code-file dependencies, adapters SHOULD emit concrete relations (`IMPORTS`, `CALLS`, hierarchy relations) when targets are resolvable; `DEPENDS_ON` is reserved for spec-level dependency edges in the persisted graph model.

All extraction methods MUST be synchronous and pure — they receive content as a string, not a file path to read. They produce no side effects.

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

A built-in `TypeScriptLanguageAdapter` SHALL handle `typescript`, `tsx`, `javascript`, and `jsx` files using `@ast-grep/napi` for Tree-sitter parsing. It MUST extract:

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

`LanguageAdapter` SHALL provide `extractImportedNames(filePath: string, content: string): ImportDeclaration[]` — a synchronous, pure method that parses the file's import statements and returns structured declarations without any resolution.

`ImportDeclaration` is a value object with:

- **`localName`** (`string`) — the name used locally in the importing file (may differ from original via aliasing)
- **`originalName`** (`string`) — the name as declared in the source module
- **`specifier`** (`string`) — the raw import specifier string (e.g. `'./utils.js'`, `'@specd/core'`, `'os'`)
- **`isRelative`** (`boolean`) — true if the specifier is relative to the importing file (starts with `.` for all built-in adapters)

Each adapter parses imports using its language's syntax:

| Language   | Import syntax                           | isRelative      |
| ---------- | --------------------------------------- | --------------- |
| TypeScript | `import { X } from 'specifier'`         | starts with `.` |
| Python     | `from module import X`, `import module` | starts with `.` |
| Go         | `import "pkg"`, `import alias "pkg"`    | always `false`  |
| PHP        | `use Namespace\Class`                   | always `false`  |

The adapter only parses syntax — specifier resolution is handled by the adapter's optional `resolveRelativeImportPath` and `resolvePackageFromSpecifier` methods, called by the indexer during Pass 2.

### Requirement: Call resolution

For `CALLS` relations, the adapter MUST extract call expressions from the AST and resolve them:

- **Caller**: the innermost enclosing function, method, or arrow function containing the call expression. Calls at module top level are silently dropped.
- **Callee**: resolved via the import map passed to `extractRelations`. If the called identifier is in the import map, the callee is the resolved symbol. If the identifier matches a locally defined symbol, the callee is that local symbol.

Calls to identifiers that cannot be resolved (e.g. global built-ins, member expressions like `obj.method()`, dynamic expressions) SHALL be silently dropped — no relation is created, no error is thrown.

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

`LanguageAdapter` MAY provide optional methods for resolving import specifiers to file paths. This moves all language-specific resolution logic out of the indexer:

- **`resolvePackageFromSpecifier?(specifier: string, knownPackages: string[]): string | undefined`** — given a non-relative import specifier and the list of known package names, returns which package the specifier refers to. Each language has its own rules:

| Language   | Specifier example                | Package extraction rule                               |
| ---------- | -------------------------------- | ----------------------------------------------------- |
| TypeScript | `@specd/core`                    | Scoped: first two segments. Bare: first segment.      |
| Go         | `github.com/acme/auth/models`    | Longest matching prefix from known packages.          |
| Python     | `acme_auth.models`               | First segment, normalized (hyphens ↔ underscores).    |
| PHP        | (uses qualified names, not this) | Not applicable — PHP resolves via `extractNamespace`. |

- **`resolveRelativeImportPath?(fromFile: string, specifier: string): string | string[]`** — given the importing file path and a relative specifier, returns one or more candidate file paths. Returns multiple candidates when the specifier is ambiguous (e.g. could be a file or a directory with an index file). The indexer tries each candidate in order against the symbol index. Each language has its own rules for extension mapping and path resolution:

| Language   | Resolution rules                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------- |
| TypeScript | `.js` → `.ts`, extensionless → `[.ts, /index.ts]`, `.jsx` → `.tsx`, `../` traversal            |
| Python     | `.` = current package, `..` = parent, module → `[.py, /__init__.py]`, bare dot → `__init__.py` |
| Go         | Not applicable — Go imports are never relative                                                 |
| PHP        | Not applicable — PHP imports are never relative                                                |

- **`buildQualifiedName?(namespace: string, symbolName: string): string`** — builds a fully qualified name from a namespace and symbol name. Used by languages like PHP where imports are resolved via namespace-qualified names rather than package names.

| Language | Example                                   |
| -------- | ----------------------------------------- |
| PHP      | `App\Models` + `User` → `App\Models\User` |

- **`resolveQualifiedNameToPath?(qualifiedName: string, codeRoot: string, repoRoot?: string): string | undefined`** — given a fully qualified class/type name and the workspace's `codeRoot`, resolves it to an absolute file path by reading the language's autoloader configuration. This complements the in-memory qualified name map built from indexed symbols: it handles classes not present in the indexed codebase (e.g. library code excluded from indexing). Performs I/O (reads the autoloader manifest); the PSR-4 map SHOULD be cached per `codeRoot` to avoid repeated reads. Returns `undefined` if the qualified name cannot be resolved.

| Language | Autoloader config                                       | Resolution rule                                                                              |
| -------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| PHP      | `composer.json` `autoload.psr-4` + `autoload-dev.psr-4` | Longest-prefix match on namespace → directory; appends remaining segments as `ClassName.php` |

When these methods are not implemented, the indexer skips the corresponding resolution step for that language. The indexer MUST NOT contain any language-specific resolution logic — all specifier parsing, path resolution, and qualified name construction is delegated to adapters.

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
- Extraction methods are synchronous and pure — they receive content, not file handles
- `extractSymbolsWithNamespace()` is optional and, when implemented, follows the same synchronous and pure extraction rules
- getPackageIdentity and resolveQualifiedNameToPath? are the only methods that perform I/O — both are optional and search for a manifest file on disk
- Resolution methods (resolvePackageFromSpecifier, resolveRelativeImportPath, buildQualifiedName) are synchronous and pure
- resolveQualifiedNameToPath? SHOULD cache the parsed autoloader map per codeRoot to avoid repeated disk reads during a single indexing run
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
- No dependency on @specd/core

## Spec Dependencies

- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `RelationType`, hierarchy edge semantics
