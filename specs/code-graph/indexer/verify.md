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

#### Scenario: Unchanged files skipped when fingerprint matches

- **GIVEN** a store containing 10 files with current content hashes
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **AND** none of the files on disk have changed
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `filesSkipped` is 10 and `filesIndexed` is 0
- **AND** no language adapter extraction is invoked

#### Scenario: Fingerprint mismatch escalates unchanged files to full rebuild

- **GIVEN** a store containing indexed files with matching content hashes
- **AND** the persisted graph fingerprint differs from the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the run behaves as a full rebuild instead of skipping unchanged files
- **AND** every discovered file is re-extracted
- **AND** `fullRebuildReason` explains that the code-graph version or resolved workspace configuration changed

#### Scenario: Deleted file removal remains scoped to indexed workspaces

- **GIVEN** a store containing files from workspaces `core`, `cli`, and `code-graph`
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called with only workspace `core`
- **THEN** only files with workspace `core` are considered for deletion
- **AND** files from `cli` and `code-graph` remain untouched in the store

#### Scenario: Changed files removed from store before bulk load

- **GIVEN** a store containing `core:src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk now has hash `def`
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `core:src/utils.ts` is removed from the store before bulk load
- **AND** the re-extracted data is inserted via `bulkLoad()`

### Requirement: Multi-workspace file discovery

#### Scenario: node_modules excluded

- **GIVEN** a workspace with `node_modules/lodash/index.js`
- **WHEN** file discovery runs
- **THEN** `node_modules/lodash/index.js` is not in the discovered files

#### Scenario: Paths prefixed with workspace name and config-relative path

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.configRelativePath` is `packages/core/src/index.ts`
- **AND** `FileNode.workspace` is `core`

#### Scenario: Config-relative path normalizes absolute parent traversal

- **GIVEN** the active `specd.yaml` lives at `/project/apps/web/specd.yaml`
- **AND** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.configRelativePath` is `../../packages/core/src/index.ts`
- **AND** it has forward slashes and no leading `./`

### Requirement: Binary file filtering

#### Scenario: Known binary extensions are skipped before decoding

- **GIVEN** a workspace contains `image.png`, `document.pdf`, and `archive.zip`
- **WHEN** file discovery runs
- **THEN** those files are excluded before any text decoding heuristics are applied
- **AND** they do not appear in the discovered source-file set

### Requirement: Bounded analysis memory

#### Scenario: Retained analysis state excludes parser runtime objects

- **GIVEN** Pass 1 has completed for a large project
- **WHEN** retained run-scoped analysis state is inspected
- **THEN** it contains compact facts and shared lookup indexes needed for Pass 2
- **AND** it does not retain AST nodes, parser trees, or equivalent heavyweight parser-runtime objects

### Requirement: Discovery fingerprint uses effective config

#### Scenario: Synthetic spec-root exclusions affect fingerprint

- **GIVEN** a filesystem-backed repository exposes a `specsPath`
- **WHEN** the indexer computes the current graph fingerprint
- **THEN** the synthetic exclusion derived from that spec root contributes to the fingerprint payload

### Requirement: Two-pass extraction with in-memory index

#### Scenario: Symbols from all workspaces are available before relation resolution

- **GIVEN** two workspaces contain symbols that import or call each other
- **WHEN** Pass 2 runs
- **THEN** cross-workspace relations are resolved from the previously registered in-memory analysis data
- **AND** no graph-store query is needed during extraction or relation building

#### Scenario: Each file is analyzed once before later relation work

- **GIVEN** a built-in adapter returns imports, symbols, binding facts, and call facts from `analyzeFile()`
- **WHEN** the same file reaches Pass 2
- **THEN** the indexer reuses the stored `FileAnalysis`
- **AND** it does not call back into the adapter to re-parse the same file content

#### Scenario: Unresolved qualified names may still become file imports

- **GIVEN** a PHP file imports `App\Services\Mailer`
- **AND** no registered symbol has that qualified name
- **AND** the adapter can deterministically map the qualified name to a source file path
- **WHEN** Pass 2 resolves imports from the stored analysis
- **THEN** a file-to-file `IMPORTS` relation is emitted to that resolved file target

#### Scenario: Unresolvable imports are dropped without aborting the run

- **GIVEN** an analyzed file contains an import that cannot be resolved through shared session lookups or deterministic adapter rules
- **WHEN** Pass 2 runs
- **THEN** no relation is emitted for that import
- **AND** indexing continues without throwing

#### Scenario: Shared scoped resolution runs after import resolution

- **GIVEN** a file analysis contains imported type names and deterministic binding facts that reference those names
- **WHEN** Pass 2 runs
- **THEN** import resolution completes before shared scoped binding resolution consumes those candidates
- **AND** derived `USES_TYPE`, `CONSTRUCTS`, or `CALLS` relations are emitted from the stored facts

### Requirement: Shared indexing session

#### Scenario: Adapters and pass logic share the same run-scoped session

- **GIVEN** Pass 1 has registered files, symbols, and per-file analyses in the `IndexSession`
- **WHEN** Pass 2 resolves imports and builds relations
- **THEN** it reads those registrations from the same session instance
- **AND** it does not rebuild equivalent per-file lookup structures from scratch

#### Scenario: Run-scoped adapter cache state stays behind the common session API

- **GIVEN** a built-in adapter stores compact run-scoped cache state for later deterministic resolution
- **WHEN** the state is consumed in Pass 2
- **THEN** access goes through the `IndexSession` API
- **AND** the adapter does not mutate raw internal lookup maps owned by the session

#### Scenario: Shared session also serves later spec and document lookups

- **GIVEN** the indexing run has already registered documents, specs, and covered symbols
- **WHEN** a later indexing phase needs a spec-to-symbol or symbol-to-spec lookup
- **THEN** it reads that relationship from the same run-scoped session
- **AND** it does not rebuild a parallel cross-entity cache outside the session

### Requirement: Scoped binding environment resolution

#### Scenario: Constructor injection produces upstream dependent impact

- **GIVEN** `NodeHookRunner` has a constructor parameter typed as `TemplateExpander`
- **AND** `TemplateExpander` resolves to a class symbol in the in-memory `SymbolIndex`
- **WHEN** Pass 2 builds scoped binding environments and resolves relations
- **THEN** a `USES_TYPE` relation is emitted toward `TemplateExpander`
- **AND** upstream impact for `TemplateExpander` includes the `NodeHookRunner` dependent

#### Scenario: Constructor call resolves through shared environment

- **GIVEN** a composition function contains `new TemplateExpander(builtins)`
- **AND** the constructed class resolves to a symbol
- **WHEN** Pass 2 resolves call facts
- **THEN** a `CONSTRUCTS` relation is emitted from the composition function to the `TemplateExpander` target

#### Scenario: Ambiguous receiver emits no relation

- **GIVEN** a call fact for `service.run()`
- **AND** the scoped binding environment has no deterministic binding for `service`
- **WHEN** Pass 2 resolves call facts
- **THEN** no `CALLS` relation is emitted for that call

#### Scenario: Resolved self-relation is dropped before staging

- **GIVEN** scoped binding resolution returns a dependency where `sourceSymbolId` equals `targetSymbolId`
- **WHEN** Pass 2 converts resolved dependencies into graph relations
- **THEN** that dependency is not staged for `bulkLoad()`
- **AND** no self-edge is persisted in the graph store

#### Scenario: Indexer stays language-agnostic

- **GIVEN** TypeScript, Python, Go, and PHP files provide binding facts with different receiver spellings
- **WHEN** Pass 2 builds scoped binding environments
- **THEN** receiver lookup uses normalized adapter facts
- **AND** `IndexCodeGraph` does not branch on concrete language identifiers for binding semantics

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

#### Scenario: Staged artifacts use the configured graph temp directory

- **GIVEN** the implementation spills intermediate indexing artifacts to disk
- **AND** project config resolves a graph temp directory from `configPath`
- **WHEN** indexing runs
- **THEN** run-scoped staged artifacts are written under that graph temp directory
- **AND** they are cleaned after a successful run

### Requirement: Progress reporting

#### Scenario: Progress callback receives pass labels aligned to the new pipeline

- **GIVEN** an `onProgress` callback is provided in `IndexOptions`
- **WHEN** indexing runs
- **THEN** the callback reports progress across discovery, pass 1 file analysis, pass 2 relation building, and bulk loading
- **AND** per-file phases include detail strings such as `"150/460 files"`

#### Scenario: Progress callback fires before blocking processing

- **WHEN** a phase like discovery or pass 1 finishes
- **THEN** the progress callback is fired immediately with the next phase label
- **AND** this happens before synchronous heavy work begins, such as session index finalization or relation aggregation

### Requirement: Phase execution timing logging

#### Scenario: Debug logs record phase duration

- **WHEN** indexing completes
- **THEN** debug logs contain execution times for discovery, pass 1, pass 2, and bulk loading

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

#### Scenario: Total spec count improves progress UX

- **GIVEN** a workspace with 100 specs
- **WHEN** the indexer starts spec discovery
- **THEN** it calls `repo.count()` to determine the total volume
- **AND** it emits progress events using the total spec count as the denominator

#### Scenario: Indexer pulls spec data from repository

- **WHEN** indexing specs
- **THEN** the indexer SHALL directly call `repo.list()`, `repo.metadata()`, and `repo.readPersistedDependsOn()`
- **AND** it SHALL NOT rely on the CLI to provide pre-resolved spec objects

#### Scenario: Spec contentHash from content artifacts only

- **GIVEN** a spec with artifacts `spec.md`, `verify.md`, and `.specd-metadata.yaml`
- **WHEN** the indexer builds the `SpecNode`
- **THEN** `contentHash` is computed from all artifacts EXCEPT `.specd-metadata.yaml`
- **AND** `spec.md` is ordered first, then the remaining artifacts in alphabetical order

#### Scenario: Spec with metadata indexed

- **GIVEN** a spec in workspace `core` with metadata containing `dependsOn: [core:config, core:storage]`
- **WHEN** spec indexing runs
- **THEN** a `SpecNode` with `specId: 'core:change'` and `workspace: 'core'` is upserted
- **AND** two `DEPENDS_ON` relations are created to `core:config` and `core:storage`

#### Scenario: Spec without metadata uses defaults

- **GIVEN** a spec in workspace `code-graph` with no metadata
- **WHEN** spec indexing runs
- **THEN** `title` defaults to the `specId`, `description` defaults to `''`, and `dependsOn` defaults to `[]`
- **AND** no fallback parsing of `spec.md` is performed

#### Scenario: Spec title defaults to specId when metadata is absent

- **GIVEN** a spec with `specId: 'code-graph:change'` and no metadata
- **WHEN** spec indexing runs
- **THEN** the `SpecNode` has `title: 'code-graph:change'`

#### Scenario: Incremental spec indexing skips unchanged specs

- **GIVEN** a spec was indexed with `contentHash` `abc`
- **AND** no artifact has changed
- **WHEN** spec indexing runs again
- **THEN** the spec is skipped because its `contentHash` matches the stored hash

#### Scenario: SpecIds unique across workspaces

- **GIVEN** workspaces `core` and `cli` both have a spec named `spec-metadata`
- **WHEN** spec indexing runs
- **THEN** specIds are `core:spec-metadata` and `cli:spec-metadata` respectively
- **AND** no primary key collision occurs

#### Scenario: Archived file-level implementation becomes COVERS_FILE

- **GIVEN** a spec has a file-level implementation link to `core:src/change.ts`
- **WHEN** spec indexing runs
- **THEN** it emits a `COVERS_FILE` relation from that spec to that file

#### Scenario: Archived symbol-level implementation becomes COVERS_SYMBOL

- **GIVEN** a spec has a symbol-level implementation link to `core:Change.transition`
- **WHEN** spec indexing runs
- **THEN** it emits a `COVERS_SYMBOL` relation from that spec to that symbol

#### Scenario: Archived stale symbol coverage preserves metadata

- **GIVEN** a spec has a symbol-level implementation entry marked as stale
- **WHEN** spec indexing runs
- **THEN** the emitted `COVERS_SYMBOL` relation preserves `stale: true` in metadata

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

#### Scenario: Normal incremental result has null fullRebuildReason

- **GIVEN** the persisted graph fingerprint matches the fingerprint for the current run
- **WHEN** indexing completes successfully
- **THEN** `IndexResult.graphFingerprint` equals the fingerprint persisted for that run
- **AND** `IndexResult.fullRebuildReason` is `null`

#### Scenario: Fingerprint mismatch result records rebuild reason

- **GIVEN** the persisted graph fingerprint differs from the fingerprint for the current run
- **WHEN** indexing completes successfully after escalating to a full rebuild
- **THEN** `IndexResult.graphFingerprint` equals the new persisted fingerprint
- **AND** `IndexResult.fullRebuildReason` is a human-readable explanation of the mismatch

#### Scenario: Filesystem-backed spec roots are excluded from document discovery

- **GIVEN** a workspace repository exposes a filesystem-backed `specsPath`
- **WHEN** the indexer discovers files and documents
- **THEN** files under that spec root are excluded from file/document discovery
- **AND** they are indexed only through spec indexing

#### Scenario: Workspace-owned file is not duplicated under root namespace

- **GIVEN** a file under a configured workspace `codeRoot`
- **AND** it also matches a project-global `graph.includePaths` pattern
- **WHEN** the indexer runs
- **THEN** the file is indexed under the workspace-prefixed identity
- **AND** no duplicate `root:` identity is created

#### Scenario: Windows-1252 document becomes a DocumentNode

- **GIVEN** a `.txt` file with no language adapter registered
- **AND** its content decodes as `windows-1252` and does not contain NUL bytes
- **WHEN** it is indexed
- **THEN** it produces a `DocumentNode` in the graph

#### Scenario: UTF-16 document becomes a DocumentNode

- **GIVEN** a `.txt` file with no language adapter registered
- **AND** its content is valid `utf-16le` or `utf-16be`
- **WHEN** it is indexed
- **THEN** it produces a `DocumentNode` in the graph

#### Scenario: NUL-bearing non-UTF16 file is skipped

- **GIVEN** a file with no language adapter registered
- **AND** its content contains NUL bytes but does not match the accepted UTF-16 layouts
- **WHEN** it is indexed
- **THEN** no node is created in the graph

### Requirement: Prefer LLM-optimized description

#### Scenario: Indexer uses optimized description

- **GIVEN** a spec with `optimizedDescription: "AI Summary"` and `description: "Manual"`
- **WHEN** indexing the spec
- **THEN** the resulting `SpecNode` in the graph has `description: "AI Summary"`
