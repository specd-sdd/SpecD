# Symbol Model

## Purpose

A code graph needs a unified, language-agnostic representation of source code structure before any persistence, traversal, or impact analysis can operate on it. The symbol model defines the domain entities and value objects that represent files, symbols, and the relationships between them — the foundational vocabulary for the entire `@specd/code-graph` package.

## Requirements

### Requirement: File node

A `FileNode` SHALL represent a single source file in the workspace. It contains:

- **`path`** (`string`) — globally unique path in format `{workspaceName}:{relativeToCodeRoot}` (e.g. `core:src/index.ts`). Forward-slash-normalized. This is the node's canonical identity.
- **`configRelativePath`** (`string`) — forward-slash-normalized path from the directory containing the `specd.yaml` used for indexing to the file on disk (e.g. `packages/core/src/index.ts`). This path is not the node identity and MAY include `..` segments when the file lives outside the config directory.
- **`language`** (`string`) — language identifier (e.g. `typescript`, `python`). Determined by the language adapter at index time.
- **`contentHash`** (`string`) — hash of the file's content at last index. Used for incremental diffing.
- **`workspace`** (`string`) — the workspace name this file belongs to (e.g. `core`, `cli`, `default`).
- **`embedding`** (`Float32Array | undefined`) — optional vector embedding for semantic search. Deferred to v2+.

Two `FileNode` values are equal if and only if their `path` fields match (since `path` includes the workspace name prefix and remains the canonical graph identity). `configRelativePath` exists for user-facing lookup and diagnostics; it MUST NOT replace the canonical workspace-prefixed path in persisted relations or symbol identifiers.

### Requirement: Spec node

A `SpecNode` SHALL represent a spec directory in the workspace. It contains:

- **`specId`** (`string`) — the spec identifier in `workspace:package/topic` format (e.g. `core:change`, `_global:_global/architecture`). This is the node's identity.
- **`path`** (`string`) — workspace-relative path to the spec directory (e.g. `specs/core/change`).
- **`title`** (`string`) — from `.specd-metadata.yaml` `title` field. Defaults to the `specId` if metadata is absent.
- **`description`** (`string`) — from `.specd-metadata.yaml` `description` field. Empty string if absent.
- **`contentHash`** (`string`) — hash of concatenated spec artifacts, excluding `.specd-metadata.yaml`. `spec.md` first if present, then remaining artifacts in alphabetical order. Used for incremental diffing.
- **`content`** (`string`) — concatenated artifact text for full-text search. Same ordering as `contentHash`: `spec.md` first if present, then remaining artifacts alphabetically. Excludes `.specd-metadata.yaml`.
- **`dependsOn`** (`string[]`) — ordered list of spec IDs this spec depends on, extracted from `.specd-metadata.yaml`. Defaults to `[]` if metadata is absent.
- **`workspace`** (`string`) — the workspace name this spec belongs to (e.g. `core`, `_global`).

Two `SpecNode` values are equal if their `specId` fields match.

### Requirement: Symbol node

A `SymbolNode` SHALL represent a named code construct extracted from a file. It contains:

- **`id`** (`string`) — deterministic identifier computed from `filePath + kind + name + line + column` (e.g. `core:src/index.ts:function:main:1:0`). Since `filePath` is workspace-prefixed, the id is globally unique across workspaces. The same symbol at the same location always produces the same id.
- **`name`** (`string`) — the symbol's declared name.
- **`kind`** (`SymbolKind`) — the category of this symbol.
- **`filePath`** (`string`) — workspace-prefixed path of the file containing this symbol.
- **`line`** (`number`) — 1-based line number of the symbol's declaration.
- **`column`** (`number`) — 0-based column offset of the symbol's declaration.
- **`comment`** (`string | undefined`) — the raw comment text.

All node families (Specs, Files, Symbols, Documents) SHALL use workspace-qualified canonical identities as their unique primary keys.

### Requirement: File analysis model

The code graph SHALL define immutable runtime analysis value objects that capture the complete compact result of analyzing a source file before relation resolution.

The shared runtime model MUST include:

- **`FileAnalysisDraft`** — adapter-emitted file analysis before the indexer assigns run-local file identity
- **`FileAnalysis`** — registered file analysis that includes the file's run-local ID, workspace-prefixed path, language, content hash, compact facts, and optional per-file parser state
- **`ParserState`** — optional compact parser-specific state retained only when it avoids repeated deterministic work later in the same indexing run
- **`AdapterSessionState`** — optional compact run-scoped adapter state retained only when it provides deterministic shared caches across multiple files in the same indexing run

`FileAnalysisDraft` and `FileAnalysis` MUST represent, at minimum:

- symbols emitted for the file
- import declarations emitted for the file
- deterministic binding facts emitted for the file
- deterministic call facts emitted for the file
- namespace or equivalent qualified-name context when the language supports it
- optional file/document node metadata already normalized for indexing

These runtime analysis value objects SHALL remain distinct from persisted graph-store entities. They exist to support in-memory indexing passes and MUST NOT require changes to persisted symbol IDs, relation IDs, or graph-store schemas.

### Requirement: Shared indexing lookups

The symbol model SHALL support run-scoped lookup structures that make deterministic relation resolution bounded by relevant matches rather than full symbol scans.

The shared runtime lookup model MUST support:

- file lookup by workspace-prefixed path and run-local file ID
- symbol lookup by file, simple name, and qualified name
- traversal from file to symbols and symbol back to file
- lookup of specs and documents that participate in cross-entity relations during the same indexing run
- traversal between specs and covered symbols when that relationship is needed by later phases
- relation deduplication keys before final persistence

These lookups MAY be implemented by `IndexSession` and `SymbolIndex` collaborating internally, but the externally visible runtime model MUST preserve a common lookup contract across all built-in adapters and indexer phases.

### Requirement: Compact retained analysis state

The retained runtime analysis model MUST prioritize compact, immutable data over heavyweight parser artifacts to reduce garbage-collection pressure during large indexing runs.

Retained `ParserState`, `AdapterSessionState`, binding facts, call facts, imports, and lookup indexes MUST use plain data structures and MUST NOT retain AST nodes, parser trees, parser cursors, or equivalent heavyweight objects once per-file analysis completes.

### Requirement: Document category

The graph SHALL support a `document` category for textual non-code nodes.

- **`DocumentNode`** represents a file that does not map to symbol semantics but is searchable via full-text content and identifiable by path.
- Identities for documents follow the same format as `FileNode` (`workspace:path`), including the reserved `root:` namespace.

### Requirement: SymbolKind enum

`SymbolKind` SHALL be a closed string enum with the following members:

- `function`
- `class`
- `method`
- `variable`
- `type`
- `interface`
- `enum`

No other values are permitted. Language adapters MUST map language-specific constructs to one of these kinds or skip the construct entirely.

### Requirement: Relation types

Relations between nodes SHALL be represented as typed edges. Each relation has a `source`, `target`, and `type`. The following relation types are defined:

| Type            | Source | Target | Meaning                                                               | Phase |
| --------------- | ------ | ------ | --------------------------------------------------------------------- | ----- |
| `IMPORTS`       | File   | File   | Source file imports from target file                                  | v1.5  |
| `DEFINES`       | File   | Symbol | File contains the symbol's declaration                                | v2    |
| `CALLS`         | Symbol | Symbol | Source symbol invokes target symbol                                   | v2    |
| `CONSTRUCTS`    | Symbol | Symbol | Source symbol constructs or instantiates target type                  | v2    |
| `USES_TYPE`     | Symbol | Symbol | Source symbol references target type in a static signature or binding | v2    |
| `EXPORTS`       | File   | Symbol | File exports the symbol as public API                                 | v2    |
| `DEPENDS_ON`    | Spec   | Spec   | Spec depends on target spec                                           | v1.5  |
| `COVERS_FILE`   | Spec   | File   | Spec has a file-level implementation link to the target file          | v2+   |
| `COVERS_SYMBOL` | Spec   | Symbol | Spec has a symbol-level implementation link to the target symbol      | v2+   |
| `EXTENDS`       | Symbol | Symbol | Source type extends or inherits from target type                      | v2    |
| `IMPLEMENTS`    | Symbol | Symbol | Source type fulfills or implements target contract/type               | v2    |
| `OVERRIDES`     | Symbol | Symbol | Source method overrides or concretely fulfills target one             | v2    |

### Requirement: Relation staleness

Relations MAY include a `stale` boolean flag in their `metadata`.

For implementation traceability, `stale` applies specifically to `COVERS_SYMBOL` relations whose target symbol is no longer detectable in the current graph index. It is not the generic marker for workspace-boundary or archive-materialization failures.

### Requirement: Relation value object

A `Relation` SHALL be a value object containing:

- **`source`** (`string`) — the id or path of the source node.
- **`target`** (`string`) — the id or path of the target node.
- **`type`** (`RelationType`) — one of the relation types defined above.
- **`metadata`** (`Record<string, unknown> | undefined`) — optional adapter-specific metadata (e.g. import specifier, call site line number).

Two `Relation` values are equal if `source`, `target`, and `type` all match.

### Requirement: Hierarchy relation semantics

Hierarchy relations SHALL use the following normalization rules:

- `EXTENDS` connects one type symbol to another type symbol when the source inherits behavior or structure from the target.
- `IMPLEMENTS` connects one type symbol to another contract-bearing symbol when the source fulfills the target's required shape or behavior.
- `OVERRIDES` connects one method symbol to another method symbol when the source method replaces, concretizes, or fulfills the target method through inheritance or contract implementation.

`OVERRIDES` is a first-class persisted relation in this model; it is not deferred to derived traversal logic.

Adapters MAY normalize inheritance-adjacent constructs from supported languages into these relations when the normalized edge remains useful for code understanding, impact discovery, hotspot analysis, and affected-spec discovery.

### Requirement: Import declaration

An `ImportDeclaration` SHALL represent a parsed import statement or deterministic import expression extracted from source code. It contains:

- **`localName`** (`string`) — the identifier used locally in the importing file. File-only import forms use an empty string.
- **`originalName`** (`string`) — the identifier as declared in the source module. File-only import forms use an empty string.
- **`specifier`** (`string`) — the raw import specifier string.
- **`isRelative`** (`boolean`) — true if the specifier is a relative path.
- **`kind`** (`'named' | 'namespace' | 'default' | 'side-effect' | 'dynamic' | 'require' | 'blank' | undefined`) — optional import form metadata. `undefined` is equivalent to `named` for backwards compatibility.

`ImportDeclaration` is a pure syntactic representation — it contains no resolution information. The indexer resolves specifiers to files and symbol ids using the adapter registry and monorepo package map.

Side-effect imports, string-literal dynamic imports, CommonJS `require()` calls, and Go blank imports MUST be representable as file-only import declarations without creating fake local symbols.

### Requirement: Scoped binding model

The symbol model SHALL define immutable, language-agnostic value objects for deterministic scoped binding and call resolution. These value objects are analysis inputs and intermediate results that normalize source-language facts before they are converted into persisted graph relations.

The shared model SHALL represent:

- **Scope ownership**: file, class/type, method, function, and block scopes when the adapter can identify them deterministically.
- **Binding facts**: source-location-aware facts that bind a visible name or receiver to a declared, constructed, imported, inherited, framework-managed, or otherwise deterministic target type or symbol candidate.
- **Binding source kind**: local, parameter, property/field, class-managed, inherited, file/global, imported type, framework-managed, constructor call, and alias-from-known-binding.
- **Call facts**: source-location-aware facts for free calls, member calls, static calls, and constructor calls, including the enclosing caller symbol when known.
- **Resolution metadata**: deterministic reason strings and optional confidence or diagnostic metadata that explain why a binding or call candidate was accepted or dropped.

Binding facts and call facts MUST be immutable value objects with `readonly` properties. They MUST use workspace-prefixed file paths and symbol IDs when they reference graph entities.

**Cycle Detection**: The scoped binding environment resolution SHALL implement cycle detection when traversing the scope hierarchy (e.g., following `parentId` links). If a circular reference is detected, the traversal MUST be aborted to prevent infinite loops, and no resolution result SHALL be returned for that lookup.

The first iteration SHALL remain conservative. It MUST NOT model arbitrary runtime state, reflection, runtime container identifiers, interprocedural propagation, or whole-program data flow.

### Requirement: Scoped binding relation output

Scoped binding and call resolution SHALL emit deterministic graph relations using the persisted relation vocabulary:

- `IMPORTS` for file-level dependencies that resolve to files.
- `CALLS` for deterministic invocations from one symbol to another callable symbol.
- `CONSTRUCTS` for deterministic constructor or constructor-like instantiation from an enclosing symbol to the constructed class/type symbol.
- `USES_TYPE` for deterministic type references from an enclosing symbol to a referenced type, interface, enum, or class symbol.
- `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` for deterministic hierarchy and method-fulfillment relationships.

Constructor injection, typed parameters, typed return values, typed properties/fields, and imported type annotations SHALL emit `USES_TYPE` when the referenced type symbol resolves deterministically.

Constructor calls such as `new ClassName()` and language-equivalent constructor-like expressions SHALL emit `CONSTRUCTS` when the constructed target resolves deterministically.

Scoped binding and call resolution SHALL NOT persist symbol-to-symbol dependency relations where the source symbol id and target symbol id are identical. Self-relations do not represent external blast radius and MUST be dropped before graph persistence.

Unresolved binding facts and call facts SHALL NOT create speculative graph edges. They MAY be preserved as non-persisted diagnostics or debug metadata for tests and troubleshooting.

### Requirement: Immutability

All model types — `FileNode`, `SymbolNode`, `Relation`, and any aggregate containing them — SHALL be immutable value objects. Properties MUST be `readonly`. Mutations to the graph happen exclusively through the `GraphStore` port's atomic upsert operations, which replace entire file-scoped slices. There is no in-place mutation API.

### Requirement: Error types

`@specd/code-graph` SHALL define its own `SpecdCodeGraphError` base class which MUST extend `SpecdError` from `@specd/core`. All package-specific errors MUST extend `SpecdCodeGraphError`.

By extending `SpecdError`, all code-graph errors automatically follow the "Specd Error Contract" defined in [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md), including the `specd: true` discriminator and machine-readable `code` requirement.

- `InvalidSymbolKindError` — when a symbol kind value is not in the `SymbolKind` enum
- `InvalidRelationTypeError` — when a relation type value is not in the defined set
- `DuplicateSymbolIdError` — when two symbols in the same file produce the same deterministic id
- `StoreNotOpenError` — when an operation is attempted on a closed or uninitialized store

## Constraints

- All model types are value objects — no identity beyond structural equality (except `SymbolNode.id` which is deterministic)
- `SymbolKind` is a closed enum — adding a new kind requires a spec change
- `RelationType` is a closed set — adding a new type requires a spec change
- Depends on `@specd/core` as a runtime dependency
- `embedding` on `FileNode` is deferred to v2+ — adapters MUST NOT populate it until the embedding pipeline is implemented
- `COVERS` relations are deferred to v2+ — the type exists in the model but is not populated by any v1.5/v2 process
- `DEPENDS_ON` relations are populated by the indexer in v1.5, reading from `.specd-metadata.yaml` or `spec.md`
- `CONSTRUCTS` and `USES_TYPE` are first-class persisted relations in v2 and are part of the base graph vocabulary for supported languages
- `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` are first-class persisted relations in v2 and are part of the base graph vocabulary for supported languages

## Examples

```typescript
// FileNode — path includes workspace prefix
const file: FileNode = {
  path: 'core:src/domain/entities/change.ts',
  language: 'typescript',
  contentHash: 'sha256:abc123...',
  workspace: 'core',
  embedding: undefined,
}

// SymbolNode — id and filePath include workspace prefix
const symbol: SymbolNode = {
  id: 'core:src/domain/entities/change.ts:function:createChange:42',
  name: 'createChange',
  kind: SymbolKind.Function,
  filePath: 'core:src/domain/entities/change.ts',
  line: 42,
  column: 0,
  comment: '/** Creates a new Change entity from the given parameters. */',
}

// SpecNode — includes description, content, workspace
const spec: SpecNode = {
  specId: 'core:change',
  path: 'specs/core/change',
  title: 'Change',
  description: 'Without a single entity that owns spec work...',
  contentHash: 'sha256:def456...',
  content: '# Change\n\n## Purpose\n...',
  dependsOn: ['core:config', 'core:storage'],
  workspace: 'core',
}

// Relation
const relation: Relation = {
  source: 'src/commands/create.ts',
  target: 'src/domain/entities/change.ts',
  type: RelationType.IMPORTS,
}

// Spec dependency relation
const specRelation: Relation = {
  source: 'core:change',
  target: 'core:config',
  type: RelationType.DEPENDS_ON,
}
```

## Spec Dependencies

- [`default:_global/conventions`](../../../_global/conventions/spec.md) — shared type and naming conventions
- [`default:_global/error-handling-conventions`](../../../_global/error-handling-conventions/spec.md) — invariant and error-shape expectations
- [`code-graph:document-model`](../document-model/spec.md) — concrete document-node category layered onto the shared graph vocabulary
