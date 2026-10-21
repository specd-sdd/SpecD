# Verification: Workspace Integration

## Requirements

### Requirement: FileNode path and workspace semantics

#### Scenario: Single workspace file path

- **WHEN** a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.workspace` is `core`

#### Scenario: Project-relative path stored alongside canonical identity

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **WHEN** a file `src/index.ts` is discovered in workspace `core` with codeRoot `/project/packages/core`
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.projectRelativePath` is `packages/core/src/index.ts`

#### Scenario: Duplicate filenames across workspaces remain distinct

- **WHEN** two workspaces `core` and `cli` both contain `src/index.ts`
- **THEN** their canonical FileNode paths are `core:src/index.ts` and `cli:src/index.ts`
- **AND** both can still be stored in the same graph without conflict

### Requirement: Drive letters are not workspace names

#### Scenario: C: is not a workspace name

- **GIVEN** the identity string `C:/repo/src/a.ts`
- **WHEN** a graph identity is parsed
- **THEN** the workspace name is not `C`
- **AND** the drive letter stays part of the path

#### Scenario: Workspace C does not include a drive-letter path

- **GIVEN** a stored path `C:/repo/src/a.ts` and a workspace filter `C`
- **WHEN** hotspot classification or SQLite inclusion reads the workspace
- **THEN** the path is not in workspace `C`

#### Scenario: A bare drive letter is not workspace C

- **GIVEN** the identity string `C:`
- **WHEN** a graph identity is parsed
- **THEN** the workspace name is not `C`

#### Scenario: Exclusion and CLI display do not treat C: as workspace C

- **GIVEN** the identity string `C:`
- **WHEN** exclusion reads the workspace and the CLI display splitter parses the identity
- **THEN** neither result is workspace `C`

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

### Requirement: Project-relative file lookup

#### Scenario: Unprefixed selector resolves through projectRelativePath

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `projectRelativePath` `packages/core/src/index.ts`
- **WHEN** a CLI command resolves the selector `packages/core/src/index.ts`
- **THEN** it can map that selector back to canonical file `core:src/index.ts`

#### Scenario: Absolute selector normalizes to projectRelativePath before lookup

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `projectRelativePath` `packages/core/src/index.ts`
- **WHEN** a CLI command resolves `/project/packages/core/src/index.ts`
- **THEN** it normalizes the absolute path to `packages/core/src/index.ts`
- **AND** resolves the canonical file `core:src/index.ts`

#### Scenario: Project-relative lookup supports parent segments

- **GIVEN** the active `specd.yaml` lives at `/project/apps/web/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `projectRelativePath` `../../packages/core/src/index.ts`
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

#### Scenario: Type import across workspaces produces USES_TYPE

- **GIVEN** `sdk` declares a parameter of type `SymbolNode` imported from `@specd/code-graph`
- **AND** the entry surface of `@specd/code-graph` publishes `SymbolNode` through its `src/public.ts` barrel chain
- **WHEN** the project is indexed
- **THEN** the local binding of `SymbolNode` in the `sdk` file has the logical id of `SymbolNode` declared in `code-graph`
- **AND** the `sdk` file has an `IMPORTS` relation to the entry file that published the name
- **AND** a `USES_TYPE` relation links the `sdk` symbol to `SymbolNode`
- **AND** `graph impact --symbol SymbolNode --direction dependents` lists the `sdk` file

#### Scenario: Subpath export selects its own entry

- **GIVEN** `@specd/code-graph/internal` is exported to `dist/index.js` and `.` to `dist/public.js`
- **WHEN** a file imports a name from `@specd/code-graph/internal`
- **THEN** the name is resolved against the indexed source of `dist/index.js`, not of `dist/public.js`

#### Scenario: dist path maps to the indexed source

- **GIVEN** the manifest points `exports["."]` at `./dist/public.js`
- **AND** `code-graph:src/public.ts` is indexed
- **WHEN** an import from the package is resolved
- **THEN** the entry file is `code-graph:src/public.ts`

#### Scenario: Unknown package produces no edge

- **GIVEN** an import from a package that no workspace declares
- **WHEN** the project is indexed
- **THEN** no relation, binding target, or step exists for that import
- **AND** the import is counted as an external package import and is not reported as a failure

#### Scenario: Name not published by the entry surface produces no edge

- **GIVEN** the target workspace declares a symbol with the imported name in an internal file that no entry file publishes
- **WHEN** the import is resolved
- **THEN** no relation, binding target, or step exists
- **AND** a non-persisted diagnostic has reason `not-exported`

#### Scenario: Same-name symbol in a test file is never chosen

- **GIVEN** the target workspace declares the imported name in a test helper file
- **AND** the entry surface does not publish that name
- **WHEN** the import is resolved
- **THEN** the test helper is not selected and no relation targets it

#### Scenario: Exact qualified name declared only in a test file is not used

- **GIVEN** a qualified name that only a file classified as a test declares
- **WHEN** an import of that qualified name is resolved
- **THEN** the import stays unresolved and no relation targets the test file

#### Scenario: Incremental run with unchanged target workspace still resolves

- **GIVEN** a previous run resolved the import and the target workspace is unchanged
- **WHEN** only the importing file changes and the run is incremental
- **THEN** the import resolves to the same target using hydrated public bindings
- **AND** the result equals a clean rebuild

#### Scenario: Changing the target's entry invalidates dependents

- **GIVEN** the target workspace stops publishing a name from its entry surface
- **WHEN** an incremental run follows
- **THEN** every file that imported that name from the package is re-resolved
- **AND** the stale edge is removed

#### Scenario: Adapter without the facet leaves its package imports unresolved

- **GIVEN** a language whose adapter does not provide `packageResolution`
- **WHEN** the project is indexed
- **THEN** its package-specifier imports stay unresolved and the run completes without error

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

#### Scenario: Hierarchical gitignore loading from VCS root

- **WHEN** codeRoot is `/project/packages/core` and VCS root is `/project`
- **THEN** `.gitignore` from `/project` SHALL be loaded and applied
- **AND** any `.gitignore` files in subdirectories SHALL also be applied

#### Scenario: Null vcsRoot does not trigger repository probing

- **GIVEN** `vcsRoot` is `null`
- **WHEN** file discovery runs for that workspace
- **THEN** repository-root `.gitignore` is not loaded
- **AND** discovery does not probe for `.git/`, `.hg/`, or `.svn/` markers

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

#### Scenario: Force re-index after adding projectRelativePath metadata

- **WHEN** an existing graph store was built before `projectRelativePath` was persisted
- **THEN** the next rebuild path must recreate the graph before unprefixed selector lookup can rely on that metadata

### Requirement: Canonical module and package resolution identity

#### Scenario: Package configuration beats global name uniqueness

- **GIVEN** two workspaces contain the same symbol name
- **WHEN** an import is resolved through configured package identity and language case/visibility rules
- **THEN** only the proven workspace target is selected
- **AND** changing resolution configuration invalidates the fingerprint

#### Scenario: File identity normalizes exact forms but preserves wildcards

- **GIVEN** canonical workspace-relative, config-relative, and absolute paths identify one indexed file
- **WHEN** each is resolved as an exact graph selector
- **THEN** they produce the same canonical file identity
- **AND** a wildcard input remains a pattern rather than selecting one file

#### Scenario: Unique name inside the target workspace is not enough

- **GIVEN** the imported name exists exactly once in the target workspace, in a file the entry surface does not publish
- **WHEN** the import is resolved
- **THEN** it stays unresolved

#### Scenario: Changing exports changes the fingerprint

- **GIVEN** an indexed package whose `package.json` `exports` changes
- **WHEN** the next run computes the derivation fingerprint
- **THEN** the fingerprint differs and a rebuild is required

#### Scenario: Changing go.mod, pyproject.toml, or composer.json changes the fingerprint

- **GIVEN** a workspace whose `go.mod` module path, `pyproject.toml` project name, or `composer.json` PSR-4 map changes
- **WHEN** the next run computes the derivation fingerprint
- **THEN** the fingerprint differs and a rebuild is required
