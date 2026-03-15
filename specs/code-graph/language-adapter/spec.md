# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit) with the following methods:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extensions(): Record<string, string>`** — returns the file extension to language ID mapping (e.g. `{ '.ts': 'typescript', '.tsx': 'tsx' }`). The adapter registry uses this to resolve files to adapters — no hardcoded extension map.
- **`extractSymbols(filePath: string, content: string): SymbolNode[]`** — parses the file content and returns all symbols found
- **`extractImportedNames(filePath: string, content: string): ImportDeclaration[]`** — parses import statements and returns structured declarations without resolution
- **`extractRelations(filePath: string, content: string, symbols: SymbolNode[], importMap: Map<string, string>): Relation[]`** — extracts relations (IMPORTS, CALLS, DEFINES, EXPORTS) from the file

Both extraction methods MUST be synchronous and pure — they receive content as a string, not a file path to read. They produce no side effects.

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
- **`isRelative`** (`boolean`) — true if the specifier starts with `.` or `/`

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

- **`resolveRelativeImportPath?(fromFile: string, specifier: string): string`** — given the importing file path and a relative specifier, returns the resolved file path. Each language has its own rules for extension mapping and path resolution:

| Language   | Resolution rules                                           |
| ---------- | ---------------------------------------------------------- |
| TypeScript | `.js` → `.ts`, extensionless → `.ts`, `../` path traversal |
| Python     | `.` = current package, `..` = parent, adds `.py` extension |
| Go         | Not applicable — Go imports are never relative             |
| PHP        | Not applicable — PHP imports are never relative            |

- **`buildQualifiedName?(namespace: string, symbolName: string): string`** — builds a fully qualified name from a namespace and symbol name. Used by languages like PHP where imports are resolved via namespace-qualified names rather than package names.

| Language | Example                                   |
| -------- | ----------------------------------------- |
| PHP      | `App\Models` + `User` → `App\Models\User` |

When these methods are not implemented, the indexer skips the corresponding resolution step for that language. The indexer MUST NOT contain any language-specific resolution logic — all specifier parsing, path resolution, and qualified name construction is delegated to adapters.

### Requirement: Tree-sitter query patterns

The specific Tree-sitter / ast-grep query patterns used by each adapter are internal implementation details. They MUST NOT be part of the public API or exposed through the `LanguageAdapter` interface. Adapters are free to change their internal query patterns without breaking consumers.

### Requirement: Adapter registry

An `AdapterRegistry` SHALL map language identifiers to `LanguageAdapter` instances. It provides:

- **`register(adapter: LanguageAdapter): void`** — registers an adapter for all languages it declares and all file extensions from `adapter.extensions()`
- **`getAdapter(languageId: string): LanguageAdapter | undefined`** — returns the adapter for a language, or `undefined` if none registered
- **`getAdapterForFile(filePath: string): LanguageAdapter | undefined`** — resolves extension → language → adapter using the dynamically built extension map
- **`getAdapters(): LanguageAdapter[]`** — returns all unique registered adapters

The extension-to-language map is built dynamically from registered adapters — there is no hardcoded extension list in the registry. Adding a new language requires only registering a new adapter.

The TypeScript adapter MUST be registered by default when the registry is created. Additional adapters can be registered to extend language support.

## Constraints

- `LanguageAdapter` is an interface, not an abstract class — adapters are stateless
- Extraction methods are synchronous and pure — they receive content, not file handles
- `getPackageIdentity` is the only method that performs I/O — it is optional and searches for a manifest file upwards from `codeRoot`
- Resolution methods (`resolvePackageFromSpecifier`, `resolveRelativeImportPath`, `buildQualifiedName`) are synchronous and pure
- The indexer MUST NOT contain language-specific resolution logic — all of it is delegated to adapters
- Unrecognized file extensions are silently skipped
- Unresolvable call targets are silently dropped
- Tree-sitter query patterns are internal — not part of the public API
- The TypeScript adapter is always registered by default
- No dependency on `@specd/core`

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `SymbolKind`, `RelationType`
