# Verification: Workspace Integration

## Requirements

### Requirement: FileNode path and workspace semantics

#### Scenario: Single workspace file path

- **WHEN** a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.workspace` is `core`

#### Scenario: Config-relative path stored alongside canonical identity

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **WHEN** a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.configRelativePath` is `packages/core/src/index.ts`

#### Scenario: Duplicate filenames across workspaces remain distinct

- **WHEN** two workspaces `core` and `cli` both contain `src/index.ts`
- **THEN** their canonical FileNode paths are `core:src/index.ts` and `cli:src/index.ts`
- **AND** both can still be stored in the same graph without conflict

### Requirement: SymbolNode ID includes workspace

#### Scenario: Symbol ID format with column zero

- **WHEN** a function `main` is found at line 1, column 0 of `src/index.ts` in workspace `core`
- **THEN** `SymbolNode.id` SHALL be `core:src/index.ts:function:main:1:0`
- **AND** `SymbolNode.filePath` SHALL be `core:src/index.ts`

#### Scenario: Symbol ID with non-zero column

- **WHEN** a function `parse` is found at line 10, column 15 of `src/parser.ts` in workspace `cli`
- **THEN** `SymbolNode.id` SHALL be `cli:src/parser.ts:function:parse:10:15`
- **AND** `SymbolNode.filePath` SHALL be `cli:src/parser.ts`

### Requirement: SpecNode workspace field

#### Scenario: Named workspace

- **WHEN** a spec is discovered in workspace `core`
- **THEN** `SpecNode.workspace` SHALL be `core`

#### Scenario: Global workspace

- **WHEN** a spec is discovered in workspace `_global`
- **THEN** `SpecNode.workspace` SHALL be `_global`

### Requirement: File discovery from codeRoot

#### Scenario: Multi-workspace discovery

- **WHEN** IndexOptions contains workspaces `[{name: 'core', ...}, {name: 'cli', ...}]`
- **THEN** the indexer SHALL discover files from each workspace's codeRoot separately
- **AND** prefix all paths with the workspace name
- **AND** store all results in a single bulkLoad call

#### Scenario: Single-workspace equivalence

- **WHEN** IndexOptions contains a single workspace
- **THEN** the indexer SHALL behave identically to multi-workspace with one entry

### Requirement: Config-relative file lookup

#### Scenario: Unprefixed selector resolves through configRelativePath

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `configRelativePath` `packages/core/src/index.ts`
- **WHEN** a CLI command resolves the selector `packages/core/src/index.ts`
- **THEN** it can map that selector back to canonical file `core:src/index.ts`

#### Scenario: Absolute selector normalizes to configRelativePath before lookup

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `configRelativePath` `packages/core/src/index.ts`
- **WHEN** a CLI command resolves `/project/packages/core/src/index.ts`
- **THEN** it normalizes the absolute path to `packages/core/src/index.ts`
- **AND** resolves the canonical file `core:src/index.ts`

#### Scenario: Config-relative lookup supports parent segments

- **GIVEN** the active `specd.yaml` lives at `/project/apps/web/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `configRelativePath` `../../packages/core/src/index.ts`
- **WHEN** a CLI command resolves `../../packages/core/src/index.ts`
- **THEN** it resolves the canonical file `core:src/index.ts`

### Requirement: Spec resolution via SpecRepository

#### Scenario: Spec resolution pulls from repository

- **WHEN** indexing specs
- **THEN** the indexer SHALL directly call `SpecRepository` methods to extract semantics
- **AND** it SHALL NOT rely on precomputed extraction callbacks

#### Scenario: Workspace-owned file is not duplicated under root namespace

- **GIVEN** a file under a configured workspace `codeRoot`
- **AND** it also matches a project-global `graph.includePaths` pattern
- **WHEN** the graph identity is computed
- **THEN** the file receives only the workspace-prefixed identity
- **AND** no `root:` identity is persisted for the same physical file

### Requirement: Cross-workspace import resolution

#### Scenario: Monorepo package import

- **WHEN** workspace `cli` imports `createKernel` from `@specd/core`
- **AND** the monorepo map resolves `@specd/core` to the `core` workspace prefix
- **THEN** the import SHALL resolve to the symbol in `core/src/...`

### Requirement: WorkspaceIndexTarget

#### Scenario: Single-workspace indexing isolation

- **WHEN** indexing with `--workspace core`
- **THEN** only files with workspace `core` SHALL be considered for deletion
- **AND** files from `cli` and `code-graph` workspaces SHALL remain untouched in the store

#### Scenario: graph config fields flow from SpecdWorkspaceConfig to WorkspaceIndexTarget

- **GIVEN** `SpecdWorkspaceConfig.graph.excludePaths` is `[".specd/*", "!.specd/metadata/"]`
- **AND** `SpecdWorkspaceConfig.graph.respectGitignore` is `false`
- **WHEN** `buildWorkspaceTargets()` constructs the `WorkspaceIndexTarget`
- **THEN** `WorkspaceIndexTarget.excludePaths` is `[".specd/*", "!.specd/metadata/"]`
- **AND** `WorkspaceIndexTarget.respectGitignore` is `false`

### Requirement: Per-workspace IndexResult breakdown

#### Scenario: Breakdown per workspace

- **WHEN** indexing completes for workspaces `core` (100 files) and `cli` (50 files)
- **THEN** `IndexResult.workspaces` SHALL contain two entries
- **AND** each entry SHALL report its own filesDiscovered, filesIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed

### Requirement: .gitignore handling for codeRoot

#### Scenario: Hierarchical gitignore loading

- **WHEN** codeRoot is `/project/packages/core` and git root is `/project`
- **THEN** `.gitignore` from `/project` SHALL be loaded and applied
- **AND** any `.gitignore` files in subdirectories SHALL also be applied

#### Scenario: respectGitignore false disables gitignore loading

- **GIVEN** a workspace with a `.gitignore` containing `*.log`
- **AND** `WorkspaceIndexTarget.respectGitignore` is `false`
- **WHEN** file discovery runs for that workspace
- **THEN** `.log` files are not excluded by gitignore rules
- **AND** no `.gitignore` file is read during the walk

### Backward compatibility

#### Scenario: Force re-index on path format change

- **WHEN** an existing graph store has file identity metadata incompatible with the current format
- **THEN** a full rebuild is required before lookups are considered trustworthy

#### Scenario: Force re-index after adding configRelativePath metadata

- **WHEN** an existing graph store was built before `configRelativePath` was persisted
- **THEN** the next rebuild path must recreate the graph before unprefixed selector lookup can rely on that metadata
