# Verification: Indexer

## Requirements

### Requirement: IndexCodeGraph use case

#### Scenario: Full pipeline on empty store

- **GIVEN** an empty `GraphStore` and two workspaces with 10 TypeScript files total
- **WHEN** `IndexCodeGraph.execute()` is called with both workspaces
- **THEN** all 10 files are discovered, extracted, and upserted
- **AND** `IndexResult.filesIndexed` is 10 and `filesSkipped` is 0

### Requirement: Incremental indexing

#### Scenario: Unchanged files skipped

- **GIVEN** a store containing 10 files with current hashes
- **AND** none of the files on disk have changed
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `filesSkipped` is 10 and `filesIndexed` is 0
- **AND** no language adapter extraction is invoked

#### Scenario: Changed file re-indexed

- **GIVEN** a store containing `core/src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk in workspace `core` now has hash `def`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is re-extracted and upserted with the new data
- **AND** `filesIndexed` includes this file

#### Scenario: Deleted file removed from store

- **GIVEN** a store containing `core/src/old.ts`
- **AND** `src/old.ts` no longer exists on disk in workspace `core`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `removeFile('core/src/old.ts')` is called on the store
- **AND** `filesRemoved` is 1

#### Scenario: Deletion scoped to indexed workspaces

- **GIVEN** a store containing files from workspaces `core`, `cli`, and `code-graph`
- **WHEN** `IndexCodeGraph.execute()` is called with only workspace `core`
- **THEN** only files with workspace `core` are considered for deletion
- **AND** files from `cli` and `code-graph` remain untouched in the store

#### Scenario: New file added to store

- **GIVEN** a store with no entry for `core/src/new.ts`
- **AND** `src/new.ts` exists on disk in workspace `core`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is extracted and upserted with path `core/src/new.ts`

#### Scenario: Changed files removed from store before bulk load

- **GIVEN** a store containing `core/src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk now has hash `def`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `core/src/utils.ts` is removed from the store before bulk load
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

#### Scenario: Paths prefixed with workspace name

- **GIVEN** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.path` is `core/src/index.ts`
- **AND** `FileNode.workspace` is `core`

### Requirement: Single-pass extraction with in-memory index

#### Scenario: Pass 2 can resolve cross-file calls

- **GIVEN** file A defines `createUser` and file B calls `createUser` via import
- **WHEN** indexing runs with two passes
- **THEN** Pass 1 registers `createUser` in the in-memory `SymbolIndex`
- **AND** Pass 2 resolves the call from file B to the `createUser` symbol and creates a `CALLS` relation

#### Scenario: Pass 1 completes for ALL workspaces before Pass 2

- **GIVEN** workspaces `core` and `cli` with files where `cli` imports from `core`
- **WHEN** indexing runs
- **THEN** all files from both workspaces have their symbols registered in the `SymbolIndex` (Pass 1) before any `CALLS`/`IMPORTS` resolution (Pass 2) begins

#### Scenario: Cross-workspace import resolution in Pass 2

- **GIVEN** workspace `cli` has a file importing `createKernel` from `@specd/core`
- **AND** workspace `core` has a file defining `createKernel`
- **AND** the monorepo map resolves `@specd/core` to the `core` workspace prefix
- **WHEN** Pass 2 resolves imports
- **THEN** the import resolves to the `createKernel` symbol in workspace `core`

#### Scenario: Bulk load writes all data at once

- **GIVEN** two workspaces with 10 files total
- **WHEN** both passes complete
- **THEN** `GraphStore.bulkLoad()` is called once with all accumulated files, symbols, and relations from both workspaces

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

### Requirement: Monorepo package resolution

#### Scenario: Monorepo package imports resolved via pnpm-workspace.yaml

- **GIVEN** a project with `pnpm-workspace.yaml` defining `packages: ['packages/*']`
- **AND** `packages/core/package.json` has `name: '@specd/core'`
- **AND** file B in workspace `cli` imports `createUser` from `@specd/core`
- **AND** file A in workspace `core` defines `createUser`
- **WHEN** Pass 2 resolves imports
- **THEN** an `IMPORTS` relation is created from file B to file A
- **AND** a `CALLS` relation is created from the calling symbol to `createUser`

### Requirement: Spec dependency indexing

#### Scenario: Specs resolved via callback

- **GIVEN** a workspace with a `specs()` callback that returns `DiscoveredSpec[]`
- **WHEN** spec indexing runs
- **THEN** the indexer calls the callback instead of walking the filesystem
- **AND** the returned specs are stored with the workspace name

#### Scenario: Spec contentHash from all artifacts

- **GIVEN** a spec with artifacts `spec.md`, `verify.md`, and `.specd-metadata.yaml`
- **WHEN** the `specs()` callback builds the `DiscoveredSpec`
- **THEN** `contentHash` is computed from all artifacts concatenated
- **AND** `spec.md` is ordered first, then the remaining artifacts in alphabetical order

#### Scenario: Spec with .specd-metadata.yaml indexed

- **GIVEN** a spec in workspace `core` with `.specd-metadata.yaml` containing `dependsOn: [core:core/config, core:core/storage]`
- **WHEN** spec indexing runs
- **THEN** a `SpecNode` with `specId: 'core:core/change'` and `workspace: 'core'` is upserted
- **AND** two `DEPENDS_ON` relations are created to `core:core/config` and `core:core/storage`

#### Scenario: Spec without metadata falls back to spec.md parsing

- **GIVEN** a spec in workspace `code-graph` with no `.specd-metadata.yaml`
- **AND** `spec.md` has a `## Spec Dependencies` section linking to `../symbol-model/spec.md` and `../graph-store/spec.md`
- **WHEN** spec indexing runs
- **THEN** `DEPENDS_ON` relations are created from the parsed links

#### Scenario: Spec title extracted from heading

- **GIVEN** a spec where `spec.md` starts with `# Change`
- **WHEN** spec indexing runs
- **THEN** the `SpecNode` has `title: 'Change'`

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

#### Scenario: Duration measured

- **WHEN** `IndexCodeGraph.execute()` completes
- **THEN** `IndexResult.duration` reflects the elapsed wall-clock time in milliseconds

#### Scenario: All counts sum correctly

- **GIVEN** a run across two workspaces that discovers 100 files, indexes 10, skips 85, removes 3, and has 2 errors
- **WHEN** the `IndexResult` is returned
- **THEN** `filesDiscovered` is 100, `filesIndexed` is 10, `filesSkipped` is 85, `filesRemoved` is 3, and `errors.length` is 2

#### Scenario: Per-workspace breakdown

- **GIVEN** indexing completes for workspaces `core` (80 files) and `cli` (20 files)
- **WHEN** the `IndexResult` is returned
- **THEN** `IndexResult.workspaces` contains two entries
- **AND** each entry reports its own `filesDiscovered`, `filesIndexed`, `filesSkipped`, `filesRemoved`, `specsDiscovered`, `specsIndexed`
- **AND** the aggregate `filesDiscovered` equals the sum of per-workspace `filesDiscovered`
