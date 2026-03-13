# Verification: Symbol Model

## Requirements

### Requirement: File node

#### Scenario: FileNode equality by path and workspace

- **GIVEN** two `FileNode` values with the same `path` and `workspace` but different `contentHash`
- **WHEN** equality is checked
- **THEN** they are considered equal

#### Scenario: FileNode path normalization

- **GIVEN** a file at OS path `src\domain\entities\change.ts`
- **WHEN** a `FileNode` is created
- **THEN** `path` is stored as `src/domain/entities/change.ts` (forward-slash-normalized)

### Requirement: Spec node

#### Scenario: SpecNode equality by specId

- **GIVEN** two `SpecNode` values with the same `specId` but different `title`
- **WHEN** equality is checked
- **THEN** they are considered equal

#### Scenario: dependsOn extracted from metadata

- **GIVEN** a spec directory with `.specd-metadata.yaml` containing `dependsOn: [core:core/config, core:core/storage]`
- **WHEN** a `SpecNode` is created
- **THEN** `dependsOn` is `['core:core/config', 'core:core/storage']`

### Requirement: Symbol node

#### Scenario: Deterministic id generation

- **GIVEN** a symbol with `filePath: 'src/utils.ts'`, `kind: function`, `name: 'hash'`, `line: 10`
- **WHEN** the id is computed
- **THEN** it produces the same value every time for these inputs

#### Scenario: Different line produces different id

- **GIVEN** two symbols with the same `filePath`, `kind`, and `name` but different `line` values
- **WHEN** their ids are computed
- **THEN** the ids are different

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

### Requirement: Relation value object

#### Scenario: Relation equality by source, target, and type

- **GIVEN** two `Relation` values with the same `source`, `target`, and `type` but different `metadata`
- **WHEN** equality is checked
- **THEN** they are considered equal

### Requirement: Immutability

#### Scenario: FileNode properties are readonly

- **GIVEN** a `FileNode` instance
- **WHEN** an attempt is made to reassign `contentHash`
- **THEN** the TypeScript compiler rejects the assignment (compile-time enforcement)

### Requirement: Error types

#### Scenario: CodeGraphError is independent of SpecdError

- **WHEN** `CodeGraphError` is instantiated
- **THEN** it extends `Error` directly, not `SpecdError`
- **AND** no import from `@specd/core` is required

#### Scenario: Duplicate symbol id detected

- **GIVEN** two symbols in the same file that produce the same deterministic id
- **WHEN** they are validated
- **THEN** `DuplicateSymbolIdError` is thrown with both symbols' details
