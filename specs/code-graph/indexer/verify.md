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

### Requirement: Discovery fingerprint uses effective config

#### Scenario: Synthetic spec-root exclusions affect fingerprint

- **GIVEN** a filesystem-backed repository exposes a `specsPath`
- **WHEN** the indexer computes the current graph fingerprint
- **THEN** the synthetic exclusion derived from that spec root contributes to the fingerprint payload

### Requirement: Two-pass extraction with in-memory index

#### Scenario: Symbols from all workspaces available before relation resolution

- **GIVEN** two workspaces contain symbols that import/call each other
- **WHEN** Pass 2 runs
- **THEN** cross-workspace relations can be resolved from the in-memory `SymbolIndex`
- **AND** no store query is needed during extraction

#### Scenario: Combined namespace and symbol extraction uses one adapter fast path

- **GIVEN** a language adapter implements `extractSymbolsWithNamespace()`
- **WHEN** Pass 1 processes a file from that language
- **THEN** the indexer may obtain symbols and namespace information from that single adapter call
- **AND** it does not need a separate namespace-only extraction step for that file

#### Scenario: PHP unresolved qualified name falls back to path resolution

- **GIVEN** a PHP file importing `App\Services\Mailer`
- **AND** `App\Services\Mailer` is NOT present in the in-memory symbol index
- **AND** the PHP adapter's `resolveQualifiedNameToPath` resolves it to `{codeRoot}/src/Services/Mailer.php`
- **WHEN** Pass 2 runs
- **THEN** a file-to-file `IMPORTS` relation is emitted from the importing file to `src/Services/Mailer.php`

#### Scenario: PHP import unresolvable via both mechanisms produces no relation

- **GIVEN** a PHP file containing `use Vendor\\External\\Class`
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

#### Scenario: Binding facts are resolved after import maps

- **GIVEN** a file has imported type names and adapter binding facts that reference those names
- **WHEN** Pass 2 runs
- **THEN** import declarations are resolved before scoped binding lookup uses those imported type candidates
- **AND** no store query is performed during binding resolution

#### Scenario: USES_TYPE and CONSTRUCTS relations are accumulated in Pass 2

- **GIVEN** scoped binding resolution returns `USES_TYPE` and `CONSTRUCTS` relations for a file
- **WHEN** Pass 2 runs
- **THEN** those relations are accumulated with imports, calls, and hierarchy relations
- **AND** they are included in the single bulk load

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
