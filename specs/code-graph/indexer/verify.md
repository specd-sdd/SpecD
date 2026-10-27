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

#### Scenario: Indexer uses GetSpecMetadata instead of raw metadata reads

- **GIVEN** a spec repository capable of returning both a raw metadata snapshot and a materialized `GetSpecMetadata` projection
- **WHEN** the indexer builds `SpecNode` data for that spec
- **THEN** it calls Core's `GetSpecMetadata` use case for `title`, `description`, and `metadataFingerprint`
- **AND** it does not parse raw sidecar metadata files directly

### Requirement: Incremental indexing

#### Scenario: Unchanged files skipped when fingerprint matches

- **GIVEN** a store containing 10 files with current content hashes
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **AND** none of the files on disk have changed
- **WHEN** `IndexCodeGraph.execute()` is called without force
- **THEN** `filesSkipped` is 10 and `filesIndexed` is 0
- **AND** no language adapter extraction is invoked

#### Scenario: Fingerprint mismatch escalates unchanged files to full rebuild

- **GIVEN** a store containing indexed files with matching content hashes
- **AND** the persisted graph fingerprint differs from the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** the run behaves as a full rebuild instead of skipping unchanged files
- **AND** every discovered file is re-extracted
- **AND** `fullRebuildReason` is `Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`

#### Scenario: Newline-only manifest change stays incremental

- **GIVEN** a persisted fingerprint computed from an LF `package.json`
- **AND** the working copy differs only by CRLF in that same manifest
- **WHEN** the indexer compares fingerprints and runs `IndexCodeGraph.execute()` without force
- **THEN** the resolution-manifest digest matches
- **AND** the newline-only change does not by itself escalate the run to a full rebuild
- **AND** `fullRebuildReason` is null

#### Scenario: Deleted file removal remains scoped to indexed workspaces

- **GIVEN** a store containing files from workspaces core, cli, and code-graph
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called with only workspace core
- **THEN** only files with workspace core are considered for deletion
- **AND** files from cli and code-graph remain untouched in the store

#### Scenario: Changed files removed from store before bulk load

- **GIVEN** a store containing `core:src/utils.ts` with hash `abc`
- **AND** `src/utils.ts` on disk now has hash `def`
- **AND** the persisted graph fingerprint matches the fingerprint for the current run
- **WHEN** `IndexCodeGraph.execute()` is called
- **THEN** `core:src/utils.ts` is removed from the store before bulk load
- **AND** the re-extracted data is written through the bulk write session

#### Scenario: Forced run ignores orphaned incremental state

- **GIVEN** logical clear removed all file, document, symbol, spec, and relation nodes
- **AND** stale index-coverage hashes from a prior generation are still returned by a faulty store test double
- **WHEN** a forced indexing run discovers unchanged source content
- **THEN** every selected input is reconsidered and no input is counted as a hash-matched skip
- **AND** the committed graph contains the nodes and semantic state derived from those inputs

### Requirement: Deterministic implementation coverage projection

#### Scenario: Clean generation projects file and logical-symbol coverage

- **GIVEN** a real persisted spec state links one existing file directly and names one uniquely resolvable symbol in another existing file
- **WHEN** the project is indexed into an empty store
- **THEN** the spec has one `COVERS_FILE` relation to the direct file
- **AND** one `COVERS_SYMBOL` relation targets the resolved logical symbol ID
- **AND** neither relation targets a missing endpoint

#### Scenario: Implementation-only change reprojects coverage without code analysis

- **GIVEN** code files and their logical symbols are unchanged in the persisted graph
- **AND** a spec's persisted implementation links change without changing code content
- **WHEN** an incremental index runs
- **THEN** semantic state needed for symbol resolution is available to spec indexing
- **AND** obsolete coverage is removed and the new file and symbol coverage is persisted

#### Scenario: Changed declaration reprojects canonical coverage

- **GIVEN** a spec covers a logical symbol declared in a changed file
- **WHEN** the file is reanalyzed and its declarations are replaced
- **THEN** coverage is recomputed from the spec's canonical persisted implementation links
- **AND** valid coverage targets the refreshed logical symbol
- **AND** no stale declaration-occurrence target is retained

#### Scenario: Unresolved and ambiguous symbol links are diagnostic

- **GIVEN** one implementation link names a missing symbol and another resolves to multiple logical symbols in its linked file
- **WHEN** spec coverage is projected
- **THEN** neither link creates `COVERS_SYMBOL` or fallback `COVERS_FILE`
- **AND** the index result reports one stable diagnostic per link with spec ID, file, symbol name, and resolution reason
- **AND** unrelated inputs still commit successfully

#### Scenario: Qualified member resolves inside the anchored file

- **GIVEN** `EditChange.execute` is linked on the file that declares `EditChange`
- **AND** other types also declare `execute`
- **WHEN** coverage is projected
- **THEN** `COVERS_SYMBOL` targets `EditChange`'s `execute` logical id
- **AND** the proof is not raw equality with the stored string `EditChange.execute`

#### Scenario: Re-export binding is visible before coverage

- **GIVEN** `sdk:src/index.ts` re-exports `runIsolatedGraphIndex` and a spec links that name on that file
- **WHEN** coverage is projected
- **THEN** the adapter binding on `sdk:src/index.ts` already exists
- **AND** `COVERS_SYMBOL` targets the published logical id
- **AND** the link is not moved to the declaring file by qualified-name parsing

#### Scenario: Label text stays a diagnostic

- **GIVEN** a link stores `Integration (real kernel)` on an indexed file that does not declare or export it
- **WHEN** coverage is projected
- **THEN** the result is `SYMBOL_NOT_FOUND`
- **AND** no `COVERS_SYMBOL` relation is written

#### Scenario: Value and type pair stays ambiguous

- **GIVEN** the anchored file declares `MemberForm` as both a value and a type
- **WHEN** coverage is projected for the simple name `MemberForm`
- **THEN** the diagnostic is `SYMBOL_AMBIGUOUS`
- **AND** replacing member form with member semantics does not pick one of them

#### Scenario: Unindexed file stays out of symbol coverage

- **GIVEN** a link points at a markdown or `package.json` path
- **WHEN** coverage is projected
- **THEN** the diagnostic is `FILE_NOT_INDEXED`
- **AND** no language adapter is asked to invent a symbol

### Requirement: Multi-workspace file discovery

#### Scenario: node_modules excluded

- **GIVEN** a workspace with `node_modules/lodash/index.js`
- **WHEN** file discovery runs
- **THEN** `node_modules/lodash/index.js` is not in the discovered files

#### Scenario: Paths prefixed with workspace name and project-relative path

- **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.path` is `core:src/index.ts`
- **AND** `FileNode.projectRelativePath` is `packages/core/src/index.ts`
- **AND** `FileNode.workspace` is `core`

#### Scenario: Project-relative path normalizes absolute parent traversal

- **GIVEN** the active `specd.yaml` lives at `/project/apps/web/specd.yaml`
- **AND** a workspace named `core` with codeRoot `/project/packages/core`
- **AND** a file at `/project/packages/core/src/index.ts`
- **WHEN** the indexer processes this workspace
- **THEN** `FileNode.projectRelativePath` is `../../packages/core/src/index.ts`
- **AND** it has forward slashes and no leading `./`

### Requirement: Portable graph paths

#### Scenario: A drive letter is not a workspace prefix

- **GIVEN** a path key `C:/repo/src/a.ts`
- **WHEN** the indexer splits a workspace identity
- **THEN** `C` is not the workspace name

#### Scenario: Persisted separators are slashes and parents stay

- **GIVEN** a relative path `src\..\secret`
- **WHEN** it is persisted
- **THEN** the stored path is `src/../secret`

#### Scenario: Adapter splits keep a drive letter in the path

- **GIVEN** a relative import key `C:/repo/src/a.ts`
- **WHEN** a language adapter splits the workspace prefix
- **THEN** the workspace name is not `C`

#### Scenario: A file at the drive root is not workspace C

- **GIVEN** a Go file `C:/a.go`
- **WHEN** the package surface is split as a graph identity
- **THEN** the surface is `C:`
- **AND** the workspace name is not `C`

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

#### Scenario: Retention is bounded across files and chunks

- **GIVEN** a project of many files split into several chunks and an adapter that registers parser-owned resources for every file
- **WHEN** the indexer analyses the files
- **THEN** after each file has been analysed the session holds no parser-owned resource of an earlier file
- **AND** the number of parser-owned resources held at any moment never exceeds those of the single file being analysed

### Requirement: Parser resource lifecycle

#### Scenario: Epoch is closed after every analysed file

- **GIVEN** an adapter that registers a parser-owned resource with a disposal function for every file
- **WHEN** the indexer analyses three files
- **THEN** the disposal function of each file has run before the next file is analysed
- **AND** the references held by the scope are dropped after each file

#### Scenario: Files that exit early also close the epoch

- **GIVEN** a document without a language adapter and a file with undecodable content among the files to process, next to files the adapter analyses
- **WHEN** the indexer processes them
- **THEN** the epoch is closed after each file, so no resource registered while handling one of them outlives it
- **AND** each analysed file starts with an empty scope

#### Scenario: Files skipped for size never open a scope

- **GIVEN** a file over the size limit among the files of a run
- **WHEN** the indexer runs
- **THEN** no parser resource is registered for it and it produces a `file-skipped` event instead of processing events

#### Scenario: Parse failure closes the epoch

- **GIVEN** an adapter that registers a resource and then throws while analysing a file
- **WHEN** the indexer analyses that file
- **THEN** the resource is disposed
- **AND** the error is collected as a per-file error and the run continues

#### Scenario: Cancellation closes the epoch

- **GIVEN** an indexing run that is cancelled while a file is being analysed
- **WHEN** the run stops
- **THEN** the resources registered for that file are disposed and no parser-owned resource remains reachable from the session

#### Scenario: Persistence failure closes the epoch

- **GIVEN** an indexing run whose bulk load fails after analysis
- **WHEN** the run ends with the persistence error
- **THEN** no parser-owned resource remains reachable from the session

#### Scenario: A failing disposal does not mask the original error or stop the others

- **GIVEN** two registered resources whose disposal functions fail, and an analysis that threw an error
- **WHEN** the epoch is closed
- **THEN** both disposal functions are attempted, in reverse registration order
- **AND** the original error is the one reported for the file
- **AND** each disposal failure is reported as a typed `resource-disposal-failed` diagnostic and does not fail the run

#### Scenario: Garbage collection is requested when available

- **GIVEN** a host that exposes a garbage-collection request
- **WHEN** an epoch is closed
- **THEN** the request is issued after the disposals and after the references are dropped

#### Scenario: Missing garbage-collection request is harmless

- **GIVEN** a host that does not expose a garbage-collection request
- **WHEN** an epoch is closed
- **THEN** the indexing run completes with the same result and no error

#### Scenario: Adapters without parser-owned resources are unaffected

- **GIVEN** a language adapter that registers nothing
- **WHEN** files of that language are indexed
- **THEN** the indexer produces the same result as before this requirement and closing the epoch is a no-op

#### Scenario: The indexer is independent of the parsing library

- **GIVEN** a test adapter built on a fake parsing library that requires explicit release
- **WHEN** the adapter registers its resource with a disposal function
- **THEN** the indexer disposes it without referring to any specific library type

#### Scenario: No run-wide retention remains

- **GIVEN** a completed indexing run
- **WHEN** the session state is inspected
- **THEN** the `napi-keepalive` adapter-state key does not exist
- **AND** no collection of parser-owned resources is reachable from the session

### Requirement: Per-file size limit

#### Scenario: The default limit applies when nothing is configured

- **GIVEN** no `maxFileBytes` at the project or workspace level and a source file of 262145 bytes
- **WHEN** the indexer processes it
- **THEN** the file is skipped for size with the applied limit 262144

#### Scenario: A file exactly at the limit is indexed

- **GIVEN** an effective limit of 1000 bytes and a file of exactly 1000 bytes
- **WHEN** the indexer processes it
- **THEN** the file is indexed

#### Scenario: A limit of zero disables the check

- **GIVEN** an effective `maxFileBytes` of `0` and a file of several megabytes that discovery keeps
- **WHEN** the indexer processes it
- **THEN** the file is read and indexed

#### Scenario: A workspace limit replaces the project limit

- **GIVEN** a project `maxFileBytes` of 1000, a workspace `maxFileBytes` of 5000, and a 3000-byte file in that workspace
- **WHEN** the indexer processes it
- **THEN** the file is indexed
- **AND** a 3000-byte file in another workspace without an override is skipped

#### Scenario: The size is measured in bytes on disk

- **GIVEN** a file of 600 multibyte characters that occupy 1200 bytes and an effective limit of 1000
- **WHEN** the indexer processes it
- **THEN** the file is skipped for size

#### Scenario: An oversized file is neither read nor hashed

- **GIVEN** an oversized file and an instrumented filesystem
- **WHEN** the indexer runs, including its change-detection phase
- **THEN** no read of the file content is performed
- **AND** no content hash is computed for it

#### Scenario: The size is evaluated once per file

- **GIVEN** a run that reuses the size in the change-detection and analysis phases
- **WHEN** the indexer processes a file
- **THEN** the filesystem metadata of that file is requested for the size decision a single time

#### Scenario: Documents are subject to the limit

- **GIVEN** a textual file without a language adapter that exceeds the limit
- **WHEN** the indexer processes it
- **THEN** no document node is created and the file is skipped for size

#### Scenario: The limit applies to every category

- **GIVEN** an oversized file that matches `testPaths` and another that matches `ignorePaths`
- **WHEN** the indexer processes them
- **THEN** both are skipped for size

#### Scenario: A project-level exemption applies from the project root

- **GIVEN** a project `largeFilePaths` entry `app/controllers/legacy.php` and an oversized file at that path
- **WHEN** the indexer processes it
- **THEN** the file is analysed
- **AND** it is reported in the exempt-and-analysed list with its size

#### Scenario: A workspace-level exemption applies from the code root

- **GIVEN** a workspace with `codeRoot` `packages/api` and `largeFilePaths` entry `generated/**`
- **WHEN** the indexer processes an oversized file at `packages/api/generated/schema.ts`
- **THEN** the file is analysed

#### Scenario: Workspace and project exemptions are combined

- **GIVEN** an exemption in the project list and another in the workspace list
- **WHEN** the indexer processes the files of that workspace
- **THEN** both files are exempt

#### Scenario: An exemption does not bypass discovery exclusions

- **GIVEN** an oversized file that is matched by both `excludePaths` and `largeFilePaths`
- **WHEN** the indexer processes the project
- **THEN** the file is not indexed and is reported as excluded, not as skipped for size

#### Scenario: An exemption does not bypass the binary filter

- **GIVEN** a file with a known binary extension listed in `largeFilePaths`
- **WHEN** the indexer processes the project
- **THEN** the file is filtered as binary

#### Scenario: Skipped files are recorded in coverage

- **GIVEN** a file skipped for size
- **WHEN** the run completes
- **THEN** the coverage entry has status `unsupported` and reason `file-too-large`
- **AND** the size in bytes and the applied limit are reported by the run result and by the `file-skipped` event, and are not persisted in coverage
- **AND** no file node, document node, symbol, or relation exists for the file

#### Scenario: Lookups about a skipped file are unproven, not absent

- **GIVEN** a file skipped for size that would declare a symbol
- **WHEN** a consumer looks the file up, or reads the graph health
- **THEN** no file node exists for it, so the lookup finds nothing indexed for that file
- **AND** graph health reports `coverageCompleteness` `complete-with-warnings` with a `file-too-large` warning

### Requirement: Size skip in incremental runs and dependents

#### Scenario: A file that grows beyond the limit is removed from the graph

- **GIVEN** a file that was indexed with its symbols and relations and now exceeds the effective limit
- **WHEN** the next incremental run processes it
- **THEN** its previous nodes, symbols, and relations are removed
- **AND** its coverage records the size skip

#### Scenario: A file that shrinks below the limit is indexed

- **GIVEN** a file that was skipped for size and now falls below the limit
- **WHEN** the next run processes it
- **THEN** the file is indexed and its coverage becomes `indexed`

#### Scenario: Raising the limit triggers the rebuild

- **GIVEN** a graph built with a limit that skipped a file and a configuration whose limit now admits it
- **WHEN** the next run starts
- **THEN** the fingerprint mismatch triggers the rebuild defined for incompatible derivations
- **AND** the file is indexed

#### Scenario: Importing a skipped file keeps the import unresolved and the cause discoverable

- **GIVEN** a file that imports a module whose file was skipped for size
- **WHEN** Pass 2 resolves imports
- **THEN** the import remains unresolved and no relation to the skipped file is created
- **AND** the skipped file has a coverage entry with reason `file-too-large` and appears in the files skipped for size of the run result

### Requirement: Discovery fingerprint uses effective config

#### Scenario: Synthetic spec-root exclusions affect fingerprint

- **GIVEN** a filesystem-backed repository exposes a `specsPath`
- **WHEN** the indexer computes the current graph fingerprint
- **THEN** the synthetic exclusion derived from that spec root contributes to the fingerprint payload

#### Scenario: Undeclared build files are not fingerprint inputs

- **GIVEN** a workspace contains `tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, and `go.work`
- **AND** no registered adapter declares those basenames
- **WHEN** the discovery fingerprint is computed
- **THEN** those files do not change the digest
- **AND** changing any one of them, while declared manifests stay unchanged, leaves the digest unchanged

#### Scenario: Changing the size limit changes the fingerprint

- **GIVEN** two runs over the same files whose effective `maxFileBytes` differs
- **WHEN** the indexer computes the graph fingerprint for each run
- **THEN** the fingerprints differ

#### Scenario: Changing the size exemptions changes the fingerprint

- **GIVEN** two runs over the same files where the effective `largeFilePaths` of one workspace differ
- **WHEN** the indexer computes the graph fingerprint for each run
- **THEN** the fingerprints differ

#### Scenario: Equal effective limits give an equal fingerprint however they are declared

- **GIVEN** one run that declares the default limit only at the project level and another that declares the same value for every workspace
- **WHEN** the indexer computes the graph fingerprint for each run
- **THEN** the fingerprints are equal

### Requirement: Adapter-sourced resolution fingerprint

#### Scenario: Manifest membership comes from adapters

- **GIVEN** registered adapters declare `package.json`, `go.mod`, `composer.json`, and `pyproject.toml`
- **WHEN** resolution inputs are discovered
- **THEN** only files with those basenames are candidates
- **AND** the fingerprint module does not apply its own manifest allow-list

#### Scenario: Walk includes manifests between codeRoot and the repository root

- **GIVEN** `composer.json` exists in a parent of `codeRoot` that is still inside the repository root
- **AND** the PHP adapter declares `composer.json`
- **WHEN** resolution inputs are discovered for that workspace
- **THEN** that parent manifest is included

#### Scenario: Walk stops at the repository root

- **GIVEN** a declared manifest exists above the repository root
- **WHEN** resolution inputs are discovered
- **THEN** that file is omitted
- **AND** when no repository root is available the walk stops at the project root

#### Scenario: CRLF and LF manifests hash the same

- **GIVEN** two copies of the same manifest whose only difference is CRLF versus LF
- **WHEN** each copy is hashed for the fingerprint
- **THEN** both digests are equal
- **AND** each stored manifest `contentHash` is SHA-256 hex of the newline-normalized UTF-8 text
- **AND** that `contentHash` has no `sha256:` prefix

#### Scenario: Manifest discovery does not import the filesystem from application code

- **WHEN** the application fingerprint module discovers resolution inputs
- **THEN** it reads existence and text only through an application port
- **AND** that module does not import `node:fs` or `node:fs/promises`

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

#### Scenario: Preparation and linking precede Pass 2

- **GIVEN** a run with several workspaces and adapters providing `packageResolution` and `reExportLinking`
- **WHEN** the indexer executes
- **THEN** the package map is built before Pass 1
- **AND** `prepare` is called once and re-export linking completes before the first `resolveImports` call

#### Scenario: Hydrated workspaces are prepared

- **GIVEN** an incremental run where only one workspace changed
- **WHEN** `prepare` is called
- **THEN** it receives every workspace, including the unchanged ones

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

#### Scenario: Hydrated files fill the qualified-name lookup

- **GIVEN** an incremental run where a PHP class file is unchanged and hydrated from the store
- **AND** a changed file imports that class by qualified name
- **WHEN** imports are resolved
- **THEN** the qualified-name lookup contains the hydrated class
- **AND** the result equals a clean rebuild

#### Scenario: Production importers never resolve to a test symbol

- **GIVEN** a symbol in a test file with the same qualified name as no production symbol
- **WHEN** a production file imports that qualified name
- **THEN** the import does not resolve to the test symbol

#### Scenario: A test importer resolves to a test helper

- **GIVEN** a helper symbol declared in a test file
- **WHEN** another test file imports it by qualified name
- **THEN** the import resolves and `graph impact` on the helper lists the importing test as a dependent

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
- **AND** no self-edge is persisted in the graph store
- **THEN** the bulk write session receives no staged row for that dependency

#### Scenario: Indexer stays language-agnostic

- **GIVEN** TypeScript, Python, Go, and PHP files provide binding facts with different receiver spellings
- **WHEN** Pass 2 builds scoped binding environments
- **THEN** receiver lookup uses normalized adapter facts
- **AND** `IndexCodeGraph` does not branch on concrete language identifiers for binding semantics

#### Scenario: Type imported from another workspace produces USES_TYPE

- **GIVEN** a function in workspace `app` whose parameter type is imported from workspace `graph`
- **AND** the import resolved to a declaration in `graph`
- **WHEN** Pass 2 resolves relations
- **THEN** a `USES_TYPE` relation links the function to that declaration in `graph`

#### Scenario: Import wins over a same-name local symbol

- **GIVEN** workspace `app` declares an unrelated symbol named `Node`
- **AND** a file in `app` imports a `Node` from workspace `graph` and uses it as a parameter type
- **WHEN** Pass 2 resolves relations
- **THEN** the `USES_TYPE` relation targets the `Node` of `graph`
- **AND** no relation targets the local `Node`

#### Scenario: Unimported name keeps the workspace lookup

- **GIVEN** a parameter type name that no import binds and one symbol of that name in the workspace
- **WHEN** Pass 2 resolves relations
- **THEN** the relation targets that symbol as before

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

### Requirement: Typed indexing events

#### Scenario: File activity is announced before processing

- **GIVEN** an `onEvent` receiver and a file to process
- **WHEN** the indexer starts that file
- **THEN** a `file-activity` event with its path is delivered before the file is read

#### Scenario: Files skipped by the analysis are announced and counted

- **GIVEN** a document without a language adapter and a file with undecodable content among the files to process
- **WHEN** the indexer traverses them
- **THEN** each of them produces a `file-activity` event
- **AND** each of them is counted in the progress counters

#### Scenario: Files that never enter processing are not announced as activity

- **GIVEN** a file over the size limit and a file excluded by discovery rules
- **WHEN** the indexer runs
- **THEN** neither produces a `file-activity` event
- **AND** the oversized file produces a `file-skipped` event

#### Scenario: Every file is announced with its size

- **GIVEN** thousands of tiny files and one large file processed in one run
- **WHEN** the run proceeds
- **THEN** the receiver gets one `file-activity` event per file, each with the file size when it is known
- **AND** the indexer applies no rate limit of its own

#### Scenario: A size skip produces a typed event

- **GIVEN** an oversized file
- **WHEN** the indexer skips it
- **THEN** a `file-skipped` event carries its path, `sizeBytes`, `limitBytes`, and the reason `file-too-large`

#### Scenario: Events carry data and not sentences

- **GIVEN** any event delivered to the receiver
- **WHEN** it is inspected
- **THEN** it has a stable `kind` and structured fields, and no human-readable message is required to interpret it

#### Scenario: Omitting the receiver changes nothing

- **GIVEN** a run without `onEvent`
- **WHEN** it completes
- **THEN** the result equals the result of the same run with a receiver
- **AND** `onProgress` receives the same calls in both runs

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
- **AND** the indexer did not parse `package.json` itself

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

#### Scenario: Package re-export does not take the first workspace symbol

- **GIVEN** `@specd/code-graph` publishes `runIsolatedGraphIndex` from its public entry
- **AND** another symbol with the same name exists elsewhere in that workspace
- **WHEN** the SDK barrel re-exports that name
- **THEN** the stored binding targets the entry file's published logical id
- **AND** the indexer did not select the other symbol by scanning the workspace

#### Scenario: Unknown package stays unresolved

- **GIVEN** a specifier names a package that no adapter identity maps to a workspace
- **WHEN** the indexer builds the package map and the adapter resolves the re-export
- **THEN** no cross-workspace binding is stored

#### Scenario: Identity collision is reported

- **GIVEN** two workspaces whose manifests declare the same package identity
- **WHEN** the package map is built
- **THEN** an error names both workspaces

#### Scenario: Resolved package import persists binding, step, and IMPORTS

- **GIVEN** `sdk` imports `SymbolNode` from `@specd/code-graph`
- **WHEN** the run is committed
- **THEN** the local binding has the target logical id
- **AND** an `import:package` step exists from that binding to the public binding
- **AND** an `IMPORTS` relation exists from the `sdk` file to the entry file

#### Scenario: Unresolved import persists nothing

- **GIVEN** a package import whose name the entry surface does not publish
- **WHEN** the run is committed
- **THEN** no binding target, step, or relation is stored
- **AND** the reason `not-exported` appears only in non-persisted output

#### Scenario: Unique name is not enough

- **GIVEN** the imported name exists exactly once in the target workspace but not on its entry surface
- **WHEN** the import is resolved
- **THEN** it stays unresolved

#### Scenario: Test files are not entries

- **GIVEN** an entry candidate classified as a test
- **WHEN** the helper filters entries
- **THEN** the candidate is discarded

#### Scenario: Adapters disagree on a name

- **GIVEN** two entries publish the same name with different logical targets
- **WHEN** the helper resolves the name
- **THEN** the reason is `ambiguous` and nothing is persisted

#### Scenario: External packages are counted, not reported as failures

- **GIVEN** files that import `zod` and `node:fs`, which no workspace declares
- **WHEN** the run completes
- **THEN** `importDiagnostics.externalPackageImports` counts those imports
- **AND** they are not part of `total`, `byReason`, or `samples`

#### Scenario: Diagnostics summary is bounded

- **GIVEN** more than 20 imports that fail with the same reason
- **WHEN** the run completes
- **THEN** `byReason` holds the exact count for that reason
- **AND** `samples` holds at most 20 diagnostics for it

#### Scenario: Helper reports its reasons

- **GIVEN** an adapter without `packageResolution`, an unknown package, and a facet returning no indexed entry
- **WHEN** each import is resolved
- **THEN** the reasons are `facet-absent`, `package-unknown`, and `no-entry-surface` respectively

#### Scenario: Every adapter is asked for an identity

- **GIVEN** two registered adapters that both return an identity for one workspace
- **WHEN** the package map is built
- **THEN** both identities are stored for that workspace
- **AND** the indexer still does not open either manifest itself

#### Scenario: Each code root gets the repository root of its own repository

- **GIVEN** a workspace inside the project repository and a workspace whose code root is in another repository
- **WHEN** the package map is built
- **THEN** `identity` receives the project repository root for the first workspace and the other repository's root for the second
- **AND** the project root is not used as the boundary for the second

#### Scenario: No detected VCS inspects only the code root

- **GIVEN** a workspace whose code root is not inside any repository (the VCS detection falls back to the null adapter)
- **WHEN** the package map is built
- **THEN** `identity` receives no repository root
- **AND** only the code root is inspected for the manifest

#### Scenario: VCS detection failure is not fatal

- **GIVEN** a VCS detection that throws for one code root
- **WHEN** the package map is built
- **THEN** that workspace is treated as having no detected repository
- **AND** the run continues

#### Scenario: Partial run maps and prepares every configured workspace

- **GIVEN** workspaces A and B and a run that indexes only A
- **AND** A imports a package declared by B
- **WHEN** the run completes
- **THEN** the import resolves to B
- **AND** the result equals the result of a run that indexes both workspaces

#### Scenario: Inaccessible workspace is skipped without failing the run

- **GIVEN** a configured workspace whose repository is not cloned
- **WHEN** the run executes
- **THEN** a diagnostic is reported for that workspace
- **AND** imports of its packages count as external
- **AND** the other workspaces are indexed normally

#### Scenario: Workspace accessibility is supplied through an application port

- **GIVEN** a fake accessibility port that reports one configured code root as inaccessible and another as accessible
- **WHEN** the indexing use case executes without a real filesystem
- **THEN** it skips and diagnoses only the inaccessible workspace
- **AND** the application use case makes no direct `node:fs` call

#### Scenario: Accessibility probe failure is non-fatal

- **GIVEN** the injected accessibility port throws while probing one configured workspace
- **WHEN** the package map is built
- **THEN** that workspace is diagnosed and treated as inaccessible
- **AND** the other workspaces continue indexing

#### Scenario: Adapter serving several languages is listed once

- **GIVEN** one adapter that serves `typescript`, `tsx`, `javascript`, and `jsx` without `packageResolution`
- **WHEN** the run completes
- **THEN** `adaptersWithoutPackageResolution` lists that adapter once, by its first declared language

### Requirement: Spec dependency indexing

#### Scenario: Total spec count improves progress UX

- **GIVEN** a workspace with 100 specs
- **WHEN** the indexer starts spec discovery
- **THEN** it calls `repo.count()` to determine the total volume
- **AND** it emits progress events using the total spec count as the denominator

#### Scenario: Indexer pulls aggregate persisted state from repository

- **WHEN** indexing specs
- **THEN** the indexer SHALL directly call `repo.list()`, `GetSpecMetadata.execute({ specId })`, and `repo.readPersistedState()` once per processed spec
- **AND** it derives both dependency and implementation coverage links from that persisted-state result
- **AND** it SHALL NOT rely on the CLI to provide pre-resolved spec objects

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

- **GIVEN** a spec was indexed with `metadataFingerprint` `abc`
- **AND** `GetSpecMetadata.execute({ specId })` returns the same `metadataFingerprint` `abc`
- **WHEN** spec indexing runs again
- **THEN** the spec is skipped because its semantic fingerprint matches the value stored on the `SpecNode`

#### Scenario: Semantic fingerprint change forces reprocessing

- **GIVEN** a spec was indexed with `metadataFingerprint` `abc`
- **AND** `GetSpecMetadata.execute({ specId })` now returns `metadataFingerprint` `def`
- **WHEN** spec indexing runs again
- **THEN** the spec is reprocessed even if the underlying cache file's raw bytes or timestamp did not change

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

#### Scenario: Size-skip summary fields in the result

- **GIVEN** a run in which twelve files exceed the limit and one exempt file exceeds it but is analysed
- **WHEN** the run completes
- **THEN** `filesSkippedForSize` is 12
- **AND** `largestSkippedForSize` holds at least ten entries in descending size order and then by path, each with `filePath`, `projectRelativePath`, `sizeBytes`, and `limitBytes`
- **AND** `sizeExemptAnalysed` lists the exempt file with its size

#### Scenario: Result is unchanged when nothing exceeds the limit

- **GIVEN** a run in which no file exceeds the effective limit
- **WHEN** the run completes
- **THEN** `filesSkippedForSize` is 0
- **AND** `largestSkippedForSize` and `sizeExemptAnalysed` are empty

### Requirement: Prefer LLM-optimized description

#### Scenario: Indexer uses optimized description

- **GIVEN** a spec with `optimizedDescription: "AI Summary"` and `description: "Manual"`
- **WHEN** indexing the spec
- **THEN** the resulting `SpecNode` in the graph has `description: "AI Summary"`

### Requirement: Reference fact indexing

#### Scenario: Index run persists reference and coverage evidence

- **GIVEN** files contain overloads, reexports, shadowed aliases, hierarchy, parse failure, and ambiguous coverage links
- **WHEN** two-pass indexing completes
- **THEN** proven logical/binding/hierarchy facts and per-file outcomes are atomic
- **AND** guessed `COVERS_SYMBOL` relations are absent

#### Scenario: High-cardinality relation construction remains bounded

- **GIVEN** an indexing session with thousands of declarations, imports, calls, and re-export routes
- **WHEN** Pass 2 builds dependency and public-binding relations
- **THEN** declaration, logical-symbol, import, symbol, and binding indexes are built once for the session or file
- **AND** resolving each relation uses indexed lookup instead of scanning all declarations, logical symbols, or public bindings
- **AND** relation persistence remains chunked and deduplicated

#### Scenario: Cross-file overrides connect to all overloaded super methods

- **GIVEN** a base class or interface with multiple overloaded declarations of a method
- **AND** a child class declaring an overriding method
- **WHEN** cross-file override relations are derived
- **THEN** `OVERRIDES` relations connect the overriding method to all overloaded super method declaration IDs
- **AND** candidate targets beyond the first overload are not dropped

#### Scenario: Property symbols are persisted with DEFINES relations

- **GIVEN** files declaring properties inside classes, interfaces, structs, or enums
- **WHEN** indexing commits
- **THEN** property symbols are persisted with `kind: 'property'` and their container's `parentId`
- **AND** `DEFINES` relations connect each file to its contained property symbols

#### Scenario: Source content and symbol ranges are indexed atomically

- **GIVEN** a source file contains multi-line named declarations and searchable body text
- **WHEN** indexing completes
- **THEN** FileNode content, complete construct ranges, declared-name selection ranges, and semantic facts are committed in the same generation
- **AND** source-content candidates are available without reading the live filesystem

#### Scenario: Language-specific linking stays in the adapter

- **GIVEN** a TypeScript file re-exports a package specifier and a Go file declares a method
- **WHEN** reference facts are persisted
- **THEN** both bindings and `parentId` values come from the adapter payload
- **AND** the indexer has no TypeScript re-export pass and no hardcoded language allowlist for parents

#### Scenario: Owned members store a qualified name

- **GIVEN** `EditChange` owns `execute` and a top-level function has no owner
- **WHEN** reference facts are persisted
- **THEN** the member's `qualified_name` is `EditChange.execute`
- **AND** the top-level function has no `qualified_name`
- **AND** full-text search text is not the only copy of that spelling

#### Scenario: Relative re-export inside one workspace is kept

- **GIVEN** `code-graph:src/index.ts` re-exports a name from a relative specifier
- **WHEN** reference facts are persisted
- **THEN** the public binding surface is `code-graph:src/index.ts`
- **AND** the target is the logical id published by the relative source file

#### Scenario: Facts are stored before coverage reads them

- **GIVEN** a generation contains a new package re-export
- **WHEN** the index run reaches spec coverage
- **THEN** that generation's public bindings are already stored
- **AND** coverage does not read the pre-re-export declaration list only

### Requirement: Classification-aware logical identity construction

#### Scenario: Lexical bindings do not become logical symbols

- **GIVEN** an adapter classifies a declaration as lexical-binding-only or physical-only
- **WHEN** the indexing session registers declarations
- **THEN** its physical evidence is retained
- **AND** no canonical logical target is manufactured

#### Scenario: Members use canonical logical owners

- **GIVEN** an owned member and its container declaration
- **WHEN** logical identities are constructed
- **THEN** the canonical owner is registered before the member
- **AND** lexical parent identity is used only as physical containment evidence

#### Scenario: Declaration groups require explicit language evidence

- **GIVEN** same-name declarations with similar broad kinds but no grouping evidence
- **WHEN** logical targets are assembled
- **THEN** they remain distinct
- **AND** valid groups retain every declaration and its occurrence form metadata

### Requirement: Incompatible derivation rebuild

#### Scenario: Incompatibility triggers visible full rebuild

- **GIVEN** schema or derivation mismatch
- **WHEN** project indexing runs
- **THEN** generation rotates, all source is re-extracted, and the result reports the reason

#### Scenario: Full rebuild prepares every search index once

- **WHEN** incompatible derivation forces a rebuild
- **THEN** semantic and source-content indexes are rebuilt after the single committed bulk session
- **AND** no partially indexed generation becomes readable

#### Scenario: Subset rebuild preserves other workspaces

- **GIVEN** a store indexed for workspaces `core` and `cli`
- **AND** a forced or fingerprint-mismatch run targets only workspace `core`
- **WHEN** `IndexCodeGraph.execute()` completes
- **THEN** every file, symbol, relation, and coverage record of `cli` is still present
- **AND** only `core` data is cleared and regenerated

#### Scenario: Whole-graph derivation mismatch recreates storage and rotates generation

- **GIVEN** a stored derivation fingerprint that differs from the current one
- **AND** the run indexes every stored workspace and owns its provider
- **WHEN** project indexing runs
- **THEN** storage is physically recreated and its generation rotates before extraction
- **AND** the result reports the fingerprint-mismatch reason

### Requirement: Indexed-input observation capture

#### Scenario: Indexing records every semantic input

- **GIVEN** files, documents, aggregate specs, and repository-backed inputs are indexed
- **WHEN** the bulk generation commits
- **THEN** observations record logical identity, non-absolute locator, content hash, and available mtime, size, or revision evidence
- **AND** workspace and aggregate stale latches are cleared only after success

#### Scenario: A package identity collision does not keep the graph stale

- **GIVEN** two workspaces whose manifests declare the same package identity and a graph whose latches are set
- **WHEN** the indexer completes
- **THEN** the collision is reported in `diagnostics` and `errors` is empty
- **AND** observations are captured for every produced resource
- **AND** the workspace and aggregate stale latches are cleared

#### Scenario: A file that fails does not keep the graph stale

- **GIVEN** a graph whose latches are set and a file whose analysis throws
- **WHEN** the indexer completes and commits
- **THEN** the failure is reported in `errors` and the file's coverage is `parse-failed`
- **AND** the stale latches are cleared and observations are captured for the produced resources
- **AND** the failed file has no observation

#### Scenario: A run that does not commit keeps the latches

- **GIVEN** a graph whose latches are set and a store failure while committing
- **WHEN** the indexer aborts
- **THEN** the latches and the previous observations are unchanged

#### Scenario: A spec that fails has no observation

- **GIVEN** a graph whose latches are set and a spec whose processing throws
- **WHEN** the indexer completes and commits
- **THEN** the failure is in `errors` under the spec identifier and no observation exists for that spec
- **AND** the observations of the other resources are captured

#### Scenario: A hashing failure is one parse-failed error

- **GIVEN** a discovered file that cannot be read for hashing
- **WHEN** the indexer completes
- **THEN** `errors` holds one entry for that path and its coverage is `parse-failed`

#### Scenario: A forced run records the content it read

- **GIVEN** a graph in which a file changed and another file is new, and a forced run
- **WHEN** the indexer completes
- **THEN** each of those files has an observation carrying the hash of the content read by that run

### Requirement: Retry of failed targets

#### Scenario: A non-forced run retries a parse-failed file whose content did not change

- **GIVEN** a file persisted with coverage `parse-failed` and a content hash equal to its current hash
- **WHEN** a normal incremental run executes
- **THEN** the file is analysed again

#### Scenario: A retry that succeeds replaces the failure

- **GIVEN** the same file and an adapter that now analyses it successfully
- **WHEN** a normal incremental run executes
- **THEN** the file is indexed, its coverage is `indexed`, and it has an observation

#### Scenario: A retry that fails again leaves the failure reported

- **GIVEN** the same file and an adapter that still fails
- **WHEN** a normal incremental run executes
- **THEN** the failure is in `errors` and in coverage, and the graph is not stale because of it

### Requirement: Bounded incremental relation construction

#### Scenario: Incremental relation work is proportional to affected evidence

- **GIVEN** a small changed-file set in a large graph
- **WHEN** incremental relation construction runs
- **THEN** reusable declaration, import, symbol, hierarchy, and binding indexes avoid full candidate scans per relation
- **AND** Store validation and hierarchy operations are batched
- **AND** persistence remains bounded, deduplicated, and part of the single bulk session

#### Scenario: A small semantic change processes only its affected closure

- **GIVEN** one source changes in a large graph containing importers, relation or hierarchy dependents, and unrelated files
- **WHEN** the indexer updates the atomic semantic subgraph
- **THEN** only the changed source and its transitive affected closure are re-extracted
- **AND** unrelated files retain their persisted nodes, relations, and reference facts without adapter work
- **AND** changed/skipped counts remain accurate and incremental output equals a full index of the same source state
- **AND** the result exposes counts and timings for import resolution, dependency facts, adapter relations, re-exports, hierarchy/overrides, persistence, and search-index rebuilding

#### Scenario: A newly added target repairs imports absent from native storage

- **GIVEN** a native graph store omitted an import relation because its target file did not exist
- **WHEN** that target file is added during an ordinary incremental run
- **THEN** existing code files are conservatively re-extracted so the importer relation is created
- **AND** unchanged files remain counted as skipped rather than content-indexed
- **AND** the run does not perform a destructive full rebuild

#### Scenario: Unchanged targets avoid semantic and search rebuild work

- **GIVEN** an indexed corpus includes code, documents, and an unsupported non-text target with persisted coverage hash
- **WHEN** the same source state is indexed again
- **THEN** every target is reported skipped and zero files are processed
- **AND** relation phase counts are zero
- **AND** no search-index rebuild is requested
- **AND** matching persisted mtime/size observations avoid rereading unchanged textual content
- **AND** no reference-fact write or replacement operation is invoked
- **AND** logical declarations and public/local bindings are byte-for-byte equivalent before and after the unchanged run

#### Scenario: Persistence and search timing are disjoint

- **GIVEN** one run that rebuilds search indexes and a second fully unchanged run
- **WHEN** phase metrics are returned
- **THEN** persistence includes all non-search transactional work
- **AND** search-index timing covers only the backend search-index step in the changed run
- **AND** the unchanged run reports zero search-index items and zero search-index duration

### Requirement: Identity-sensitive incremental equivalence

#### Scenario: Declaration mutation matches a clean rebuild

- **GIVEN** a declaration is moved, renamed, added, deleted, regrouped, or assigned a different owner
- **WHEN** incremental indexing and a clean rebuild reach identical final source and configuration
- **THEN** their normalized logical symbols, declaration mappings, bindings, relations, evidence, and coverage are equal

#### Scenario: Body edits rebuild affected consumers

- **GIVEN** a body edit or newly resolvable target changes dependency semantics without changing a declaration header
- **WHEN** incremental indexing computes its affected closure
- **THEN** every semantically affected consumer is reconsidered
- **AND** cleanup does not leave missing or stale incident relations

#### Scenario: Incremental mutation matrix matches clean semantic state

- **GIVEN** independent fixtures for body edits, declaration moves, signature changes, overload or merge-group changes, owner changes, renames, deletes, additions, and newly resolvable references
- **WHEN** each fixture is indexed incrementally and from a clean database to the same final source
- **THEN** normalized physical symbols, logical symbols, declaration mappings, bindings, public bindings, dependency relations, provenance, and coverage are identical
- **AND** equality is checked by semantic content rather than aggregate row counts

#### Scenario: Name-addressed imports match a clean rebuild

- **GIVEN** PHP, Python, and Go projects whose imports are addressed by qualified name or namespace
- **WHEN** one file changes in an incremental run
- **THEN** the normalized semantic state equals a clean rebuild of the same final source

### Requirement: Facet-driven language independence

#### Scenario: Stub language resolves package imports without indexer change

- **GIVEN** a stub adapter for a made-up language `zig2` with extension `.z2`, manifest `zig2.pkg`, and a `packageResolution` facet
- **AND** workspace `lib` exports `Widget` and workspace `app` imports it through the made-up package specifier
- **WHEN** both workspaces are indexed using the unmodified indexer
- **THEN** the import resolves, with binding, step, and `IMPORTS`
- **AND** the indexer source contains no reference to `zig2`, `.z2`, or `zig2.pkg`

#### Scenario: Indexer source has no language branches for resolution

- **WHEN** the indexer sources are searched for language identifiers, extensions, and manifest names of the built-in adapters
- **THEN** none appears in package-import resolution code

#### Scenario: Absent facet is skipped with a diagnostic

- **GIVEN** an adapter that provides only the required core
- **WHEN** the run executes
- **THEN** its files are indexed normally
- **AND** no package map entry or package import resolution exists for it
- **AND** the adapter is listed in `importDiagnostics.adaptersWithoutPackageResolution`
- **AND** the listing is not counted in `total`, `byReason`, or `samples`

#### Scenario: A throwing identity does not stop the run

- **GIVEN** an adapter whose `identity` throws for one workspace
- **WHEN** the package map is built
- **THEN** the error is recorded as an indexing error
- **AND** the adapter is treated as without `packageResolution` for the rest of the run and is listed in `adaptersWithoutPackageResolution`
- **AND** the same adapter's relative barrel re-exports are still linked
- **AND** the other workspaces and adapters are still indexed

### Requirement: Package import incremental closure

#### Scenario: Entry change re-resolves importers in other workspaces

- **GIVEN** `sdk` imports `SymbolNode` from `@specd/code-graph` and the graph is current
- **WHEN** `code-graph:src/public.ts` stops exporting `SymbolNode` and an incremental run follows
- **THEN** the importing `sdk` file is re-extracted
- **AND** its binding target, step, and `IMPORTS` edge are removed

#### Scenario: Barrel chain change reaches importers

- **GIVEN** the name is published through `public.ts` → `index.ts` → `domain/index.ts`
- **WHEN** `domain/index.ts` changes what it publishes
- **THEN** importers of the package are re-resolved

#### Scenario: Manifest change reaches importers

- **GIVEN** the `exports` field of the target package changes
- **WHEN** the next run computes the fingerprint
- **THEN** the run is a full rebuild or re-resolves every importer, and equals a clean rebuild

#### Scenario: Newly resolvable import is reconsidered

- **GIVEN** a package import is unresolved because the target workspace is not configured
- **WHEN** the workspace is added and the run is incremental
- **THEN** the import resolves and equals a clean rebuild

#### Scenario: Closure does not scan every file

- **GIVEN** an incremental run that changes one entry file and adds no code file
- **WHEN** the closure for that entry is computed
- **THEN** the importers are found from persisted steps and hydrated bindings only
- **AND** unrelated files are not read

#### Scenario: Added files still re-extract files with possibly unresolved imports

- **GIVEN** a run that adds a new code file
- **WHEN** the closure is computed
- **THEN** existing code files that may hold previously unresolved imports are re-extracted
- **AND** an import whose target workspace file just appeared resolves and equals a clean rebuild
- **AND** a run that adds only a non-code file (a document or an asset) does not trigger that re-extraction
