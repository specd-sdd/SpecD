# Verification: Symbol Model

## Requirements

### Requirement: File node

#### Scenario: FileNode equality by path

- **GIVEN** two `FileNode` values with the same `path` but different `contentHash`
- **WHEN** equality is checked
- **THEN** they are considered equal (since path includes the workspace name prefix and is globally unique)

#### Scenario: FileNode path normalization

- **GIVEN** a file at OS path `src\domain\entities\change.ts`
- **WHEN** a `FileNode` is created
- **THEN** `path` is stored as `src/domain/entities/change.ts` (forward-slash-normalized)

#### Scenario: FileNode workspace is a name string

- **GIVEN** a file discovered in workspace `core`
- **WHEN** a `FileNode` is created
- **THEN** `workspace` is `'core'` (the workspace name, not an absolute path)

#### Scenario: FileNode path includes workspace prefix

- **GIVEN** a file `src/index.ts` discovered in workspace `core`
- **WHEN** a `FileNode` is created by the indexer
- **THEN** `path` is `'core/src/index.ts'`
- **AND** `workspace` is `'core'`

### Requirement: Spec node

#### Scenario: SpecNode equality by specId

- **GIVEN** two `SpecNode` values with the same `specId` but different `title`
- **WHEN** equality is checked
- **THEN** they are considered equal

#### Scenario: dependsOn extracted from metadata

- **GIVEN** a spec directory with `.specd-metadata.yaml` containing `dependsOn: [core:core/config, core:core/storage]`
- **WHEN** a `SpecNode` is created
- **THEN** `dependsOn` is `['core:core/config', 'core:core/storage']`

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

- **GIVEN** a symbol with `filePath: 'core/src/utils.ts'`, `kind: function`, `name: 'hash'`, `line: 10`
- **WHEN** the id is computed
- **THEN** it produces `'core/src/utils.ts:function:hash:10'` every time for these inputs

#### Scenario: Different line produces different id

- **GIVEN** two symbols with the same `filePath`, `kind`, and `name` but different `line` values
- **WHEN** their ids are computed
- **THEN** the ids are different

#### Scenario: Id includes workspace-prefixed path

- **GIVEN** a symbol in file `core/src/index.ts` (workspace-prefixed path)
- **WHEN** the id is computed
- **THEN** the id starts with `core/src/index.ts:`
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

- **GIVEN** spec A has `dependsOn: ['core:core/config']`
- **WHEN** relations are built from the `SpecNode`
- **THEN** a `DEPENDS_ON` relation exists from spec A's `specId` to `core:core/config`

#### Scenario: Hierarchy relation types are part of the closed set

- **WHEN** the relation type set is inspected
- **THEN** it includes `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- **AND** adding any additional hierarchy relation type still requires a spec change

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

### Requirement: Immutability

#### Scenario: FileNode properties are readonly

- **GIVEN** a `FileNode` instance
- **WHEN** an attempt is made to reassign `contentHash`
- **THEN** the TypeScript compiler rejects the assignment (compile-time enforcement)

### Requirement: Error types

#### Scenario: CodeGraphError is independent of SpecdError

- **WHEN** `CodeGraphError` is instantiated
- **THEN** it extends `Error` directly, not `SpecdError`
- **AND** error types do not import from `@specd/core`

#### Scenario: Duplicate symbol id detected

- **GIVEN** two symbols in the same file that produce the same deterministic id
- **WHEN** they are validated
- **THEN** `DuplicateSymbolIdError` is thrown with both symbols' details
