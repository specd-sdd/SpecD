# Verification: Indexer

## Requirements

### Requirement: IndexCodeGraph use case

#### Scenario: Indexer orchestrates full pipeline

- **WHEN** `execute()` is called with valid options
- **THEN** the indexer SHALL discover files, diff, extract, store, clean, and persist VCS ref in order

#### Scenario: VCS ref persisted after indexing

- **GIVEN** `IndexOptions.vcsRef` is `"abc1234"`
- **WHEN** indexing completes successfully
- **THEN** `lastIndexedRef` SHALL be stored in the graph store metadata

#### Scenario: No VCS ref in options

- **GIVEN** `IndexOptions.vcsRef` is not provided
- **WHEN** indexing completes successfully
- **THEN** `lastIndexedRef` SHALL not be updated

### Requirement: Incremental indexing

#### Scenario: Unchanged files skipped

- **GIVEN** a store containing 10 files with current hashes
- **AND** none of the files on disk have changed
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `filesSkipped` is 10 and `filesIndexed` is 0
- **AND** no language adapter extraction is invoked

#### Scenario: Changed file re-indexed

- **GIVEN** a store containing `core:src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk in workspace `core` now has hash `def`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is re-extracted and upserted with the new data
- **AND** `filesIndexed` includes this file

#### Scenario: Deleted file removed from store

- **GIVEN** a store containing `core:src/old.ts`
- **AND** `src/old.ts` no longer exists on disk in workspace `core`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `removeFile('core:src/old.ts')` is called on the store
- **AND** `filesRemoved` is 1

#### Scenario: Deletion scoped to indexed workspaces

- **GIVEN** a store containing files from workspaces `core`, `cli`, and `code-graph`
- **WHEN** `IndexCodeGraph.execute()` is called with only workspace `core`
- **THEN** only files with workspace `core` are considered for deletion
- **AND** files from `cli` and `code-graph` remain untouched in the store

#### Scenario: New file added to store

- **GIVEN** a store with no entry for `core:src/new.ts`
- **AND** `src/new.ts` exists on disk in workspace `core`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is extracted and upserted with path `core:src/new.ts`

#### Scenario: Changed files removed from store before bulk load

- **GIVEN** a store containing `core:src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk now has hash `def`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `core:src/utils.ts` is removed from the store before bulk load
- **AND** the re-extracted data is inserted via `bulkLoad()`

### Requirement: Multi-workspace file discovery

#### Scenario: node_modules excluded

- **GIVEN** a workspace with `node_modules/lodash/index.js`
- **WHEN** file discovery runs
- **THEN** `node_modules/lodash/index.js` is not in the discovered files

#### Scenario: .gitignore respected

- **GIVEN** a `.gitignore` containing `*.generated.ts`
- **AND** a file `src/schema.generated.ts` exists
- **WHEN** file discovery runs
- **THEN** `src/schema.generated.ts` is not in the discovered files

#### Scenario: .gitignore loaded from git root

- **GIVEN** a codeRoot at `/project/packages/core` within a git repo rooted at `/project`
- **AND** `/project/.gitignore` contains `*.log`
- **WHEN** file discovery runs for this codeRoot
- **THEN** `.log` files are excluded even though the `.gitignore` is above the codeRoot

#### Scenario: Symlinks skipped

- **GIVEN** a symbolic link `src/link.ts` pointing to `../other/file.ts`
- **WHEN** file discovery runs
- **THEN** `src/link.ts` is not in the discovered files

#### Scenario: Files with no adapter skipped

- **GIVEN** a file `docs/readme.md` with no registered adapter for `.md`
- **WHEN** file discovery runs
- **THEN** `docs/readme.md` is not in the discovered files

#### Scenario: Custom excludePaths replaces built-in defaults

- **GIVEN** `WorkspaceIndexTarget.excludePaths` is `["fixtures/"]`
- **WHEN** file discovery runs
- **THEN** only `fixtures/` is excluded by config rules
- **AND** `node_modules/` and `dist/` (built-in defaults) are NOT automatically excluded

#### Scenario: Paths prefixed with workspace name

- **GIVEN** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.workspace` is `core`

### Requirement: Two-pass extraction with in-memory index

#### Scenario: Symbols from all workspaces available before relation resolution

- **GIVEN** two workspaces contain symbols that import/call each other
- **WHEN** Pass 2 runs
- **THEN** cross-workspace relations can be resolved from the in-memory `SymbolIndex`
- **AND** no store query is needed during extraction

#### Scenario: PHP unresolved qualified name falls back to path resolution

- **GIVEN** a PHP file importing `App\Services\Mailer`
- **AND** `App\Services\Mailer` is NOT present in the in-memory symbol index
- **AND** the PHP adapter's `resolveQualifiedNameToPath` resolves it to `{codeRoot}/src/Services/Mailer.php`
- **WHEN** Pass 2 runs
- **THEN** a file-to-file `IMPORTS` relation is emitted from the importing file to `src/Services/Mailer.php`

#### Scenario: PHP import unresolvable via both mechanisms produces no relation

- **GIVEN** a PHP file containing `use Vendor\External\Class`
- **AND** the qualified name is not in the symbol index
- **AND** `resolveQualifiedNameToPath` returns `undefined` for that name
- **WHEN** Pass 2 runs
- **THEN** no `IMPORTS` relation is created for that import and no error is thrown

#### Scenario: DEPENDS_ON relations from dynamic loaders accumulated in Pass 2

- **GIVEN** a PHP file from which `extractRelations` returns `DEPENDS_ON` relations for dynamic loader calls
- **WHEN** Pass 2 runs
- **THEN** those `DEPENDS_ON` relations are accumulated and passed to bulk load

#### Scenario: Hierarchy relations are accumulated in Pass 2

- **GIVEN** an adapter returns `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations for a file
- **WHEN** Pass 2 runs
- **THEN** those hierarchy relations are accumulated with the other extracted relations
- **AND** they are included in the single bulk load

### Requirement: Chunked processing

#### Scenario: Files grouped by byte budget

- **GIVEN** workspaces with files totaling 50 MB and a chunk budget of 20 MB
- **WHEN** Pass 1 runs
- **THEN** files are processed in at least 3 chunks
- **AND** file content strings from completed chunks are eligible for garbage collection

#### Scenario: Custom chunk budget respected

- **GIVEN** `IndexOptions.chunkBytes` is set to 5 MB
- **WHEN** indexing runs
- **THEN** chunks do not exceed 5 MB of source content

### Requirement: Progress reporting

#### Scenario: Progress callback receives granular updates

- **GIVEN** an `onProgress` callback is provided in `IndexOptions`
- **WHEN** indexing runs
- **THEN** the callback is called with increasing percent values from 0 to 100
- **AND** phase strings describe the current activity (e.g. `"Parsing symbols"`, `"Resolving imports"`, `"Bulk loading"`)
- **AND** detail strings are included for per-file phases (e.g. `"150/460"`)

### Requirement: Cross-workspace package resolution

#### Scenario: Package identity built from adapter

- **GIVEN** workspace `core` with `codeRoot` containing `package.json` with `name: '@specd/core'`
- **AND** the TypeScript adapter implements `getPackageIdentity`
- **WHEN** the indexer builds the `packageName → workspaceName` map
- **THEN** `'@specd/core'` maps to workspace `'core'`

#### Scenario: Cross-workspace import resolved via package identity

- **GIVEN** workspace `core` with package identity `@specd/core` defining `createUser`
- **AND** workspace `cli` has a file importing `createUser` from `@specd/core`
- **WHEN** Pass 2 resolves imports
- **THEN** an `IMPORTS` relation is created from the cli file to the core file
- **AND** a `CALLS` relation is created from the calling symbol to `createUser`

#### Scenario: Multirepo cross-workspace resolution

- **GIVEN** two workspaces from separate repos configured in `specd.yaml`
- **AND** each has a `package.json` with distinct package names
- **AND** workspace B imports a symbol from workspace A's package
- **WHEN** Pass 2 resolves imports
- **THEN** the import resolves across repos via the `packageName → workspaceName` map

#### Scenario: Adapter without getPackageIdentity skips resolution

- **GIVEN** an adapter that does not implement `getPackageIdentity`
- **WHEN** the indexer queries it for a workspace's package identity
- **THEN** non-relative imports for that language remain unresolved

### Requirement: Spec dependency indexing

#### Scenario: Specs resolved via callback

- **GIVEN** a workspace with a `specs()` callback that returns `DiscoveredSpec[]`
- **WHEN** spec indexing runs
- **THEN** the indexer calls the callback instead of walking the filesystem
- **AND** the returned specs are stored with the workspace name

#### Scenario: Spec contentHash from content artifacts only

- **GIVEN** a spec with artifacts `spec.md`, `verify.md`, and `.specd-metadata.yaml`
- **WHEN** the `specs()` callback builds the `DiscoveredSpec`
- **THEN** `contentHash` is computed from all artifacts EXCEPT `.specd-metadata.yaml`
- **AND** `spec.md` is ordered first, then the remaining artifacts in alphabetical order

#### Scenario: Spec with .specd-metadata.yaml indexed

- **GIVEN** a spec in workspace `core` with `.specd-metadata.yaml` containing `dependsOn: [core:core/config, core:core/storage]`
- **WHEN** spec indexing runs
- **THEN** a `SpecNode` with `specId: 'core:core/change'` and `workspace: 'core'` is upserted
- **AND** two `DEPENDS_ON` relations are created to `core:core/config` and `core:core/storage`

#### Scenario: Spec without metadata uses defaults

- **GIVEN** a spec in workspace `code-graph` with no `.specd-metadata.yaml`
- **WHEN** spec indexing runs
- **THEN** `title` defaults to the `specId`, `description` defaults to `''`, and `dependsOn` defaults to `[]`
- **AND** no fallback parsing of `spec.md` is performed

#### Scenario: Spec title defaults to specId when metadata is absent

- **GIVEN** a spec with `specId: 'code-graph:code-graph/change'` and no `.specd-metadata.yaml`
- **WHEN** spec indexing runs
- **THEN** the `SpecNode` has `title: 'code-graph:code-graph/change'`

#### Scenario: Incremental spec indexing skips unchanged specs

- **GIVEN** a spec was indexed with `contentHash` `abc` computed from all its artifacts
- **AND** no artifact has changed
- **WHEN** spec indexing runs again
- **THEN** the spec is skipped because its `contentHash` matches the stored hash

#### Scenario: SpecIds unique across workspaces

- **GIVEN** workspaces `core` and `cli` both have a spec named `spec-metadata`
- **WHEN** spec indexing runs
- **THEN** specIds are `core:core/spec-metadata` and `cli:cli/spec-metadata` respectively
- **AND** no primary key collision occurs

### Requirement: Error isolation

#### Scenario: Parse error in one file does not abort others

- **GIVEN** a workspace with files A (valid) and B (contains syntax error)
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** file A is successfully indexed
- **AND** the result contains an error entry for file B
- **AND** `filesIndexed` counts only A

#### Scenario: Infrastructure error aborts the run

- **GIVEN** the `GraphStore` connection is lost mid-indexing
- **WHEN** `upsertFile()` throws a connection error
- **THEN** the entire indexing run aborts with that error (not collected per-file)

### Requirement: Index result

#### Scenario: Complete result object

- **WHEN** indexing completes
- **THEN** `IndexResult` SHALL contain `filesDiscovered`, `filesIndexed`, `filesRemoved`, `filesSkipped`, `specsDiscovered`, `specsIndexed`, `errors`, `duration`, `workspaces`, and `vcsRef`

#### Scenario: vcsRef in result

- **GIVEN** `IndexOptions.vcsRef` is `"abc1234"`
- **WHEN** indexing completes
- **THEN** `IndexResult.vcsRef` SHALL be `"abc1234"`

#### Scenario: No vcsRef in result

- **GIVEN** `IndexOptions.vcsRef` is not provided
- **WHEN** indexing completes
- **THEN** `IndexResult.vcsRef` SHALL be `null`
