# Verification: Symbol Model

## Requirements

### Requirement: File node

#### Scenario: FileNode equality still uses canonical path

- **GIVEN** two `FileNode` values with the same canonical `path` but different `contentHash` and `configRelativePath`
- **WHEN** equality is checked
- **THEN** they are considered equal because `path` remains the canonical graph identity

#### Scenario: FileNode path normalization

- **GIVEN** a file discovered under workspace `core` at OS path `src\\domain\\entities\\change.ts`
- **WHEN** a `FileNode` is created
- **THEN** `path` is stored as `core:src/domain/entities/change.ts`

#### Scenario: FileNode configRelativePath is repository-style

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** workspace `core` has codeRoot `/project/packages/core`
- **AND** the discovered file is `/project/packages/core/src/index.ts`
- **WHEN** a `FileNode` is created
- **THEN** `path` is `core:src/index.ts`
- **AND** `configRelativePath` is `packages/core/src/index.ts`
- **AND** `workspace` is `core`

#### Scenario: FileNode configRelativePath may include parent segments

- **GIVEN** the active `specd.yaml` lives at `/project/apps/web/specd.yaml`
- **AND** workspace `core` has codeRoot `/project/packages/core`
- **AND** the discovered file is `/project/packages/core/src/index.ts`
- **WHEN** a `FileNode` is created
- **THEN** `configRelativePath` is `../../packages/core/src/index.ts`
- **AND** it does not replace the canonical `path`

### Requirement: Spec node

#### Scenario: SpecNode equality by specId

- **GIVEN** two `SpecNode` values with the same `specId` but different `title`
- **WHEN** equality is checked
- **THEN** they are considered equal

#### Scenario: dependsOn extracted from metadata

- **GIVEN** a spec directory with `.specd-metadata.yaml` containing `dependsOn: [core:config, core:storage]`
- **WHEN** a `SpecNode` is created
- **THEN** `dependsOn` is `['core:config', 'core:storage']`

#### Scenario: SpecNode includes workspace field

- **GIVEN** a spec discovered in workspace `core`
- **WHEN** a `SpecNode` is created
- **THEN** `workspace` is `'core'`

#### Scenario: SpecNode dependsOn defaults to empty

- **GIVEN** a spec with no dependencies
- **WHEN** a `SpecNode` is created without `dependsOn`
- **THEN** `dependsOn` defaults to `[]`

### Requirement: Symbol node

#### Scenario: Deterministic id generation

- **GIVEN** a symbol with `filePath: 'core/src/utils.ts'`, `kind: function`, `name: 'hash'`, `line: 10`, `column: 0`
- **WHEN** the id is computed
- **THEN** it produces `'core/src/utils.ts:function:hash:10:0'` every time for these inputs

#### Scenario: Different line produces different id

- **GIVEN** two symbols with the same `filePath`, `kind`, and `name` but different `line` values
- **WHEN** their ids are computed
- **THEN** the ids are different

#### Scenario: Id includes workspace-prefixed path

- **GIVEN** a symbol in file `core:src/index.ts` (workspace-prefixed path)
- **WHEN** the id is computed
- **THEN** the id starts with `core:src/index.ts:`
- **AND** the id is globally unique across workspaces

#### Scenario: Comment extracted from JSDoc

- **GIVEN** a TypeScript file with `/** Computes the hash. */` immediately before `function computeHash()`
- **WHEN** the symbol is extracted
- **THEN** `comment` is `'/** Computes the hash. */'`

#### Scenario: Symbol without comment

- **GIVEN** a function declaration with no preceding comment
- **WHEN** the symbol is extracted
- **THEN** `comment` is `undefined`

### Requirement: SymbolKind enum

#### Scenario: Invalid kind rejected

- **WHEN** a `SymbolNode` is created with `kind: 'module'` (not in the enum)
- **THEN** `InvalidSymbolKindError` is thrown

### Requirement: Relation types

#### Scenario: Relation direction matters

- **GIVEN** a `CALLS` relation from symbol A to symbol B
- **WHEN** callers of symbol B are queried
- **THEN** symbol A appears in the results
- **AND** querying callers of symbol A does not return symbol B

#### Scenario: DEPENDS_ON relation connects specs

- **GIVEN** spec A has `dependsOn: ['core:config']`
- **WHEN** relations are built from the `SpecNode`
- **THEN** a `DEPENDS_ON` relation exists from spec A's `specId` to `core:config`

#### Scenario: Hierarchy relation types are part of the closed set

- **WHEN** the relation type set is inspected
- **THEN** it includes `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- **AND** adding any additional hierarchy relation type still requires a spec change

#### Scenario: Scoped binding relation types are part of the closed set

- **WHEN** the relation type set is inspected
- **THEN** it includes `USES_TYPE` and `CONSTRUCTS`
- **AND** adding any additional scoped binding relation type still requires a spec change

#### Scenario: File-level implementation link becomes COVERS_FILE relation

- **GIVEN** a spec has a file-level archived implementation link to `core:src/index.ts`
- **WHEN** graph relations are built from archived traceability
- **THEN** a `COVERS_FILE` relation connects the spec node to that file node

#### Scenario: Symbol-level implementation link becomes COVERS_SYMBOL relation

- **GIVEN** a symbol-level archived implementation link exists for a symbol and spec
- **WHEN** graph relations are built from archived traceability
- **THEN** a `COVERS_SYMBOL` relation connects the spec node to that symbol node

### Requirement: Relation staleness

#### Scenario: Missing symbol marks implementation relation as stale

- **GIVEN** an archived symbol-level implementation link exists
- **AND** the target symbol is no longer detectable in the current graph index
- **WHEN** graph relations are rebuilt
- **THEN** the implementation relation is retained
- **AND** its `COVERS_SYMBOL` metadata marks it as `stale: true`

#### Scenario: File-level implementation relation is never marked stale

- **GIVEN** an archived file-level implementation link exists for `core:src/index.ts`
- **WHEN** graph relations are rebuilt
- **THEN** the `COVERS_FILE` relation is retained without stale metadata

#### Scenario: Workspace-boundary materialization failure is not represented as stale

- **GIVEN** an implementation link failed earlier archive-time materialization because of workspace-boundary validation
- **WHEN** graph relations are built from archived traceability
- **THEN** no synthetic stale relation is created for that failure

### Requirement: Relation value object

#### Scenario: Relation equality by source, target, and type

- **GIVEN** two `Relation` values with the same `source`, `target`, and `type` but different `metadata`
- **WHEN** equality is checked
- **THEN** they are considered equal

### Requirement: Hierarchy relation semantics

#### Scenario: Base type inheritance uses EXTENDS

- **GIVEN** a source type inherits from a resolvable base type
- **WHEN** hierarchy relations are built
- **THEN** an `EXTENDS` relation connects the source type symbol to the base type symbol

#### Scenario: Contract fulfillment uses IMPLEMENTS

- **GIVEN** a source type fulfills a resolvable contract-like declaration
- **WHEN** hierarchy relations are built
- **THEN** an `IMPLEMENTS` relation connects the source type symbol to the contract symbol

#### Scenario: Method replacement uses OVERRIDES

- **GIVEN** a method deterministically replaces or fulfills a resolvable inherited or contract method
- **WHEN** hierarchy relations are built
- **THEN** an `OVERRIDES` relation connects the source method symbol to the target method symbol

#### Scenario: Inheritance-adjacent construct that maps cleanly is normalized

- **GIVEN** a supported language exposes an inheritance-adjacent construct that preserves useful impact and hotspot semantics when normalized
- **WHEN** the adapter emits hierarchy relations
- **THEN** the construct is represented as one of `EXTENDS`, `IMPLEMENTS`, or `OVERRIDES`

#### Scenario: Inheritance-adjacent construct that does not map cleanly is omitted

- **GIVEN** a supported language exposes a construct whose semantics would be materially distorted by normalization
- **WHEN** hierarchy relations are built
- **THEN** no hierarchy relation is emitted for that construct in this iteration

### Requirement: Import declaration

#### Scenario: Side-effect import has no local symbol

- **GIVEN** a TypeScript file containing `import './polyfill.js'`
- **WHEN** import declarations are extracted
- **THEN** the declaration has `specifier: './polyfill.js'`
- **AND** `kind` is `side-effect`
- **AND** `localName` and `originalName` are empty strings

#### Scenario: Existing named import remains compatible

- **GIVEN** a TypeScript file containing `import { createUser as makeUser } from './user.js'`
- **WHEN** import declarations are extracted
- **THEN** the declaration has `localName: 'makeUser'`
- **AND** `originalName: 'createUser'`
- **AND** missing `kind` is treated as `named`

### Requirement: Scoped binding model

#### Scenario: Binding facts are immutable analysis inputs

- **GIVEN** a binding fact for a constructor parameter typed as `TemplateExpander`
- **WHEN** the binding fact is created
- **THEN** it records the workspace-prefixed file path, source location, binding source kind, visible name, and target type candidate
- **AND** its properties are readonly

#### Scenario: Runtime-only binding is outside the model

- **GIVEN** a service lookup identified only by a runtime container string
- **WHEN** binding facts are modeled
- **THEN** no deterministic binding fact is created for that runtime-only lookup

### Requirement: Scoped binding relation output

#### Scenario: Constructor call uses CONSTRUCTS relation

- **GIVEN** a function contains `new TemplateExpander(builtins)`
- **AND** `TemplateExpander` resolves to a class symbol
- **WHEN** scoped call resolution emits graph output
- **THEN** a `CONSTRUCTS` relation connects the enclosing function symbol to the `TemplateExpander` class target

#### Scenario: Constructor injection uses USES_TYPE relation

- **GIVEN** a constructor parameter is typed as `TemplateExpander`
- **AND** `TemplateExpander` resolves to a class symbol
- **WHEN** scoped binding resolution emits graph output
- **THEN** a `USES_TYPE` relation connects the constructor or owning class symbol to the `TemplateExpander` class target

#### Scenario: Self-relation is not persisted

- **GIVEN** a binding or call fact resolves to the same source and target symbol id
- **WHEN** scoped binding resolution emits graph output
- **THEN** no persisted `CALLS`, `CONSTRUCTS`, or `USES_TYPE` relation is emitted for that self-edge
- **AND** impact analysis does not report the target symbol as its own dependent

#### Scenario: Ambiguous typed dependency emits no speculative edge

- **GIVEN** a parameter type annotation cannot be resolved to a known symbol
- **WHEN** scoped binding resolution runs
- **THEN** no persisted relation is emitted for that unresolved type

### Requirement: Immutability

#### Scenario: FileNode properties are readonly

- **GIVEN** a `FileNode` instance
- **WHEN** an attempt is made to reassign `contentHash`
- **THEN** the TypeScript compiler rejects the assignment (compile-time enforcement)

### Requirement: Error types

#### Scenario: SpecdCodeGraphError extends SpecdError

- **WHEN** `SpecdCodeGraphError` is instantiated
- **THEN** it extends `SpecdError` from `@specd/core`
- **AND** it includes the `specd: true` discriminator

#### Scenario: Duplicate symbol id detected

- **GIVEN** two symbols in the same file produce the same ID
- **WHEN** the symbol model validates the file
- **THEN** `DuplicateSymbolIdError` (extending `SpecdCodeGraphError`) is thrown
