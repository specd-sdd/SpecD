# Verification: Workspace Integration

## Requirements

### Requirement: FileNode path and workspace semantics

#### Scenario: Single workspace file path

- **WHEN** a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
- **THEN** `FileNode.path` SHALL be `core/src/index.ts`
- **AND** `FileNode.workspace` SHALL be `core`

#### Scenario: Duplicate filenames across workspaces

- **WHEN** two workspaces `core` and `cli` both contain `src/index.ts`
- **THEN** their FileNode paths SHALL be `core/src/index.ts` and `cli/src/index.ts` respectively
- **AND** both SHALL be stored in the same graph without conflict

### Requirement: SymbolNode ID includes workspace

#### Scenario: Symbol ID format

- **WHEN** a function `main` is found at line 1 of `src/index.ts` in workspace `core`
- **THEN** `SymbolNode.id` SHALL be `core/src/index.ts:function:main:1`
- **AND** `SymbolNode.filePath` SHALL be `core/src/index.ts`

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

### Requirement: Spec resolution via SpecRepository

#### Scenario: Specs callback delegates to SpecRepository

- **WHEN** a workspace provides a `specs` callback backed by SpecRepository
- **THEN** the indexer SHALL call it to get specs instead of walking the filesystem
- **AND** the returned specs SHALL be stored with the workspace name

#### Scenario: Content hash excludes metadata

- **WHEN** a spec has artifacts `spec.md` and `verify.md`
- **THEN** the contentHash SHALL be computed from all artifacts in `spec.filenames` concatenated
- **AND** `spec.md` SHALL be ordered first, then the rest alphabetically
- **AND** metadata SHALL NOT be included in the content hash

#### Scenario: Metadata loaded via repository metadata port

- **WHEN** a spec has metadata available via `repo.metadata(spec)`
- **THEN** `title` SHALL be taken from `metadata.title`
- **AND** `description` SHALL be taken from `metadata.description`
- **AND** `dependsOn` SHALL be taken from `metadata.dependsOn`

#### Scenario: Missing metadata uses defaults

- **WHEN** `repo.metadata(spec)` returns `null`
- **THEN** `title` SHALL default to the specId
- **AND** `description` SHALL default to an empty string
- **AND** `dependsOn` SHALL default to an empty array

#### Scenario: Unique specIds across workspaces

- **WHEN** `core` and `cli` both have a spec named `spec-metadata`
- **THEN** specIds SHALL be `core:core/spec-metadata` and `cli:cli/spec-metadata` respectively
- **AND** no primary key collision SHALL occur

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

- **WHEN** an existing `.specd/code-graph.lbug` has paths without workspace prefixes
- **THEN** `--force` re-index SHALL be required to rebuild with the new format
