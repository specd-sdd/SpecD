# Language Adapter

## Purpose

Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without coupling the indexer to any specific language's grammar. Language adapters encapsulate Tree-sitter-based parsing behind a uniform interface, with TypeScript as the built-in adapter.

## Requirements

### Requirement: LanguageAdapter interface

`LanguageAdapter` SHALL be an interface (not an abstract class, since adapters are stateless and have no shared state to inherit) with the following methods:

- **`languages(): string[]`** — returns the language identifiers this adapter handles (e.g. `['typescript', 'tsx', 'javascript', 'jsx']`)
- **`extractSymbols(filePath: string, content: string): SymbolNode[]`** — parses the file content and returns all symbols found
- **`extractRelations(filePath: string, content: string, symbols: SymbolNode[], importMap: Map<string, string>): Relation[]`** — extracts relations (IMPORTS, CALLS, DEFINES, EXPORTS) from the file

Both extraction methods MUST be synchronous and pure — they receive content as a string, not a file path to read. They produce no side effects.

### Requirement: Language detection

File-to-language mapping SHALL be determined by file extension. The adapter registry maintains a mapping from extensions to language identifiers. Files with unrecognized extensions SHALL be silently skipped — no error is thrown, no `FileNode` is created.

The following extensions are mapped for the built-in TypeScript adapter:

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

### Requirement: Call resolution

For `CALLS` relations, the adapter MUST resolve:

- **Caller**: the innermost enclosing function, method, or class scope containing the call expression. If the call is at module top level, the caller is the file itself (represented as a `DEFINES` context).
- **Callee**: resolved via the import map. If the called identifier was imported, the callee is the symbol from the imported file. If the identifier is locally defined, the callee is the local symbol.

Calls to identifiers that cannot be resolved (e.g. global built-ins, dynamic expressions, computed property access) SHALL be silently dropped — no relation is created, no error is thrown.

### Requirement: Tree-sitter query patterns

The specific Tree-sitter / ast-grep query patterns used by each adapter are internal implementation details. They MUST NOT be part of the public API or exposed through the `LanguageAdapter` interface. Adapters are free to change their internal query patterns without breaking consumers.

### Requirement: Adapter registry

An `AdapterRegistry` SHALL map language identifiers to `LanguageAdapter` instances. It provides:

- **`register(adapter: LanguageAdapter): void`** — registers an adapter for all languages it declares
- **`getAdapter(languageId: string): LanguageAdapter | undefined`** — returns the adapter for a language, or `undefined` if none registered
- **`getAdapterForFile(filePath: string): LanguageAdapter | undefined`** — resolves extension → language → adapter

The TypeScript adapter MUST be registered by default when the registry is created. Additional adapters can be registered to extend language support.

## Constraints

- `LanguageAdapter` is an interface, not an abstract class — adapters are stateless
- Extraction methods are synchronous and pure — they receive content, not file handles
- Unrecognized file extensions are silently skipped
- Unresolvable call targets are silently dropped
- Tree-sitter query patterns are internal — not part of the public API
- The TypeScript adapter is always registered by default
- No dependency on `@specd/core`

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `SymbolKind`, `RelationType`
