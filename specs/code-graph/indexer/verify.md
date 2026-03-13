# Verification: Indexer

## Requirements

### Requirement: IndexCodeGraph use case

#### Scenario: Full pipeline on empty store

- **GIVEN** an empty `GraphStore` and a workspace with 10 TypeScript files
- **WHEN** `IndexCodeGraph.execute()` is called
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

- **GIVEN** a store containing `src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk now has hash `def`
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is re-extracted and upserted with the new data
- **AND** `filesIndexed` includes this file

#### Scenario: Deleted file removed from store

- **GIVEN** a store containing `src/old.ts`
- **AND** `src/old.ts` no longer exists on disk
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `removeFile('src/old.ts')` is called on the store
- **AND** `filesRemoved` is 1

#### Scenario: New file added to store

- **GIVEN** a store with no entry for `src/new.ts`
- **AND** `src/new.ts` exists on disk
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the file is extracted and upserted as a new entry

### Requirement: File discovery

#### Scenario: node_modules excluded

- **GIVEN** a workspace with `node_modules/lodash/index.js`
- **WHEN** file discovery runs
- **THEN** `node_modules/lodash/index.js` is not in the discovered files

#### Scenario: .gitignore respected

- **GIVEN** a `.gitignore` containing `*.generated.ts`
- **AND** a file `src/schema.generated.ts` exists
- **WHEN** file discovery runs
- **THEN** `src/schema.generated.ts` is not in the discovered files

#### Scenario: Symlinks skipped

- **GIVEN** a symbolic link `src/link.ts` pointing to `../other/file.ts`
- **WHEN** file discovery runs
- **THEN** `src/link.ts` is not in the discovered files

#### Scenario: Files with no adapter skipped

- **GIVEN** a file `docs/readme.md` with no registered adapter for `.md`
- **WHEN** file discovery runs
- **THEN** `docs/readme.md` is not in the discovered files

### Requirement: Phased extraction

#### Scenario: Phase 2 can resolve cross-file calls

- **GIVEN** file A defines `createUser` and file B calls `createUser` via import
- **WHEN** indexing runs with two phases
- **THEN** Phase 1 stores `createUser` as a symbol in the graph
- **AND** Phase 2 resolves the call from file B to the `createUser` symbol and creates a `CALLS` relation

#### Scenario: Phase 2 runs after all Phase 1 completes

- **GIVEN** a workspace with files A, B, and C where B imports from C
- **WHEN** indexing runs
- **THEN** all files have their symbols stored (Phase 1) before any `CALLS`/`IMPORTS` resolution (Phase 2) begins

### Requirement: Spec dependency indexing

#### Scenario: Spec with .specd-metadata.yaml indexed

- **GIVEN** a spec at `specs/core/change/` with `.specd-metadata.yaml` containing `dependsOn: [core:core/config, core:core/storage]`
- **WHEN** spec indexing runs
- **THEN** a `SpecNode` with `specId: 'core:core/change'` is upserted
- **AND** two `DEPENDS_ON` relations are created to `core:core/config` and `core:core/storage`

#### Scenario: Spec without metadata falls back to spec.md parsing

- **GIVEN** a spec at `specs/code-graph/traversal/` with no `.specd-metadata.yaml`
- **AND** `spec.md` has a `## Spec Dependencies` section linking to `../symbol-model/spec.md` and `../graph-store/spec.md`
- **WHEN** spec indexing runs
- **THEN** `DEPENDS_ON` relations are created from the parsed links

#### Scenario: Spec title extracted from heading

- **GIVEN** a spec at `specs/core/change/` where `spec.md` starts with `# Change`
- **WHEN** spec indexing runs
- **THEN** the `SpecNode` has `title: 'Change'`

#### Scenario: Incremental spec indexing skips unchanged specs

- **GIVEN** a spec was indexed with combined hash `abc` from `spec.md` + `.specd-metadata.yaml`
- **AND** neither file has changed
- **WHEN** spec indexing runs again
- **THEN** the spec is skipped

#### Scenario: Global specs indexed

- **GIVEN** specs at `specs/_global/architecture/` and `specs/_global/conventions/`
- **WHEN** spec indexing runs
- **THEN** `SpecNode` entries are created with appropriate `specId` values (e.g. `_global:_global/architecture`)

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

- **GIVEN** a run that discovers 100 files, indexes 10, skips 85, removes 3, and has 2 errors
- **WHEN** the `IndexResult` is returned
- **THEN** `filesDiscovered` is 100, `filesIndexed` is 10, `filesSkipped` is 85, `filesRemoved` is 3, and `errors.length` is 2
