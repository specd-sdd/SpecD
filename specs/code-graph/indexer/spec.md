# Indexer

## Purpose

Source files change constantly and the code graph must be kept in sync without re-parsing the entire workspace every time. The indexer orchestrates the pipeline from file discovery through parsing to graph storage, using content hashing for incremental updates and language adapters for extraction. It is the primary write path into the code graph.

## Requirements

### Requirement: IndexCodeGraph use case

`IndexCodeGraph` SHALL be the primary entry point for building and updating the code graph. It is an application-layer use case that orchestrates:

1. **Discover** — walk the workspace roots AND project-global graph paths to find source files and documents
2. **Diff** — compare content hashes (or spec metadata fingerprints) with the store to identify new, changed, and deleted resources
3. **Extract** — run the appropriate language adapter on code files, or index textual content as documents
4. **Spec Indexing** — consume `SpecRepository` from each workspace plus Core's `GetSpecMetadata` to materialize normalized metadata, dependencies, and coverage links
5. **Store** — upsert extracted data and relations into the `GraphStore`
6. **Clean** — remove deleted resources from the store
7. **Persist VCS ref** — store `lastIndexedRef` after success

Extraction and storage include hierarchy relations (`EXTENDS`, `IMPLEMENTS`, `OVERRIDES`) alongside existing file, symbol, and dependency relations.

The indexer SHALL directly consume `SpecRepository` methods (`list`, `artifact`, `readPersistedState`) and Core's `GetSpecMetadata` use case (for title, description, and the semantic `metadataFingerprint`) to build `SpecNode` and coverage relations. The aggregate persisted state SHALL supply both dependency and implementation data. It MUST NOT parse raw sidecar files and MUST NOT read a raw metadata snapshot directly when a materialized, self-healing projection is available through `GetSpecMetadata`.

### Requirement: Incremental indexing

The indexer SHALL compute a content hash for each discovered file and compare it against the hash stored in the `GraphStore`. It SHALL also compare the persisted graph fingerprint against the current fingerprint for the indexing run.

The current graph fingerprint for this iteration SHALL be computed from:

- the effective `@specd/code-graph` package version loaded by the running process
- a canonical hash of the resolved workspace objects used for indexing
- the effective discovery configuration in Requirement: Discovery fingerprint uses effective config
- the adapter-declared resolution manifests in Requirement: Adapter-sourced resolution fingerprint

Only three categories of files are processed during a normal incremental run when the graph fingerprint matches:

- **New** — file exists on disk but not in the store → extract and upsert
- **Changed** — file exists in both but hashes differ → extract and upsert (replaces previous data)
- **Deleted** — file exists in the store but not on disk → remove from store. Only files belonging to workspaces being indexed are considered for deletion — files from other workspaces are left untouched. This allows `--workspace <name>` to index a single workspace without destroying data from others.

Files whose hash matches the stored hash are skipped entirely — no parsing, no I/O beyond the hash comparison — only during a non-forced run when the persisted graph fingerprint matches the current fingerprint and the persisted indexed resource needed by downstream phases still exists.

When the persisted graph fingerprint differs from the current fingerprint, the indexer SHALL treat the run as a full rebuild of the active graph store rather than a normal incremental skip. The preferred behavior is to recreate the store and re-index every discovered file while surfacing this visible explanation: `Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed`. If a backend cannot safely recreate in-place, the caller MAY fail fast and require an explicit force-reindex command instead.

Changed files are removed from the store before their re-extracted data is written, so the replacement generation never conflicts with stale rows for the same file.

A forced run SHALL reconsider every discovered input selected for that run. Persisted file nodes, document nodes, index-coverage hashes, observations, semantic lookup state, or any other reusable artifact MUST NOT authorize an unchanged-file or unchanged-spec skip during that run. The resulting committed generation SHALL contain the nodes, semantic state, coverage relations, coverage records, and derivation metadata produced from that complete reconsideration.

### Requirement: Deterministic implementation coverage projection

Spec indexing SHALL read implementation links through the canonical `SpecRepository` persisted-state API and project coverage against the semantic generation that will be committed by the same indexing run.

A file-only implementation link SHALL produce `COVERS_FILE` when its canonical workspace-prefixed file target exists in that generation. A symbol-qualified implementation link SHALL produce `COVERS_SYMBOL` only when the shared symbol resolver returns exactly one logical symbol for that link anchored to the linked file. The relation target MUST be that logical symbol identity rather than a declaration-occurrence ID.

The anchored file's declarations and its public bindings SHALL both be visible to that resolution. A name that the file re-exports MUST match the public binding on that file. Qualified-member parsing MUST NOT move a link to a different file. Coverage projection MUST run after the adapter's re-export bindings for that generation are stored. Exact `SymbolNode.name` equality MUST NOT be the identity proof.

Coverage projection SHALL have access to the current or persisted semantic state required for resolution even when no code file was analyzed in the current run. A persisted implementation-only change MUST therefore be able to add, remove, or replace coverage during an otherwise incremental run.

When a code file or its declarations change, coverage for affected specs SHALL be reprojected from canonical persisted implementation state against the refreshed logical-symbol generation. The indexer MUST NOT preserve an obsolete physical-symbol relation as a substitute for reprojection.

An unresolved or ambiguous symbol-qualified link MUST NOT create a guessed `COVERS_SYMBOL` relation and MUST NOT be silently converted into `COVERS_FILE`. The index result SHALL expose a stable per-link diagnostic identifying the spec, linked file, symbol name, and unresolved or ambiguous reason while allowing unrelated inputs to complete.

### Requirement: Discovery fingerprint uses effective config

The graph fingerprint for an indexing run SHALL be computed from the effective discovery configuration actually used by the indexer, not only from the raw config declared in `specd.yaml`.

The effective fingerprint inputs MUST include:

- project-global `graph.includePaths`
- global `graph.excludePaths`
- each workspace's `allowedPaths`
- each workspace's `excludePaths`
- each workspace's `respectGitignore`
- each workspace's effective `maxFileBytes` (the workspace value, otherwise the project value, otherwise the default)
- each workspace's effective `largeFilePaths` (the project patterns and the workspace patterns, kept as two lists in the fingerprint; both are project-relative)
- the effective `testPaths` and `ignorePaths` of each workspace (project patterns and workspace patterns, kept as two lists)
- each workspace's project-relative `codeRoot` (its path from the project root)
- any synthetic exclusions derived from filesystem-backed repository `specsPath` roots
- a path-semantics marker identifying the project-relative evaluation defined by Requirement: Project-relative path evaluation. The marker MUST change whenever the reference root of any configured path or pattern changes, so that an index built under earlier semantics is fully rebuilt even though `specd.yaml` is unchanged
- the newline-normalized resolution-manifest hashes from Requirement: Adapter-sourced resolution fingerprint

### Requirement: Adapter-sourced resolution fingerprint

Resolution manifests that participate in the graph fingerprint MUST come from `resolutionManifests()` on the registered language adapters. The indexer MUST NOT keep a separate hardcoded manifest list.

For each workspace, discovery SHALL start at that workspace's `codeRoot` and walk parent directories until the repository root, inclusive. When the indexing run has no repository root, the project root is the bound. The walk MUST NOT continue above that bound.

Every existing file on that walk whose basename is declared by a registered adapter SHALL be included. Missing basenames SHALL be omitted. `computeGraphFingerprint`, `computeWorkspaceFingerprint`, and `computeRootFingerprint` MUST use this same per-workspace set.

Each included file SHALL be read as UTF-8 text. Its fingerprint digest SHALL be the SHA-256 hex of the text after the same newline normalization as `normalizeNewlines` in `@specd/core` (CRLF and a lone CR become LF). The fingerprint module MUST NOT depend on that symbol being imported when it is not part of the `@specd/core` public API; a private function with those same replacements is required in that case. The digest MUST NOT use a `sha256:` prefix and MUST NOT hash raw file bytes. CRLF and LF encodings of the same manifest MUST produce the same digest. A newline-only change of a declared manifest MUST NOT by itself make the persisted fingerprint differ, so it MUST NOT by itself escalate the run to a full rebuild.

Application code that discovers or hashes these manifests MUST read existence and text through an application port. That application code MUST NOT import `node:fs` or `node:fs/promises`. An infrastructure adapter MUST implement the port with the filesystem. Composition MUST supply that adapter to indexing and graph-health callers.

Project-relative paths in the fingerprint payload MUST be sorted deterministically.

### Requirement: Multi-workspace file discovery

The indexer SHALL discover files from two sources:

**1. Workspace Discovery**
For each `ProjectWorkspace` provided in options:

- Resolve the global exclusion layer (global `graph.excludePaths` and repository-derived spec-root exclusions) and the workspace exclusion layer (the workspace's `excludePaths`), kept separate as in Requirement: Project-relative path evaluation
- Call `discoverFiles` on `codeRoot` with the project-relative base of that `codeRoot`, filtered by the workspace's `allowedPaths` (if configured, project-relative globs)
- Prefix each path with `{workspaceName}:`
- Diff against the store filtered by workspace prefix

**2. Project-Global Discovery**

- Call `discoverFiles` on the project root using patterns from `graphConfig.includePaths`
- Prefix each path with `root:` to form the globally unique identity
- Resources discovered here are treated as project-global documents or scripts only when they are outside every configured workspace `codeRoot`

Files matching a language adapter become `FileNode`. Files without an adapter but with textual content become `DocumentNode` under the same identity format.

When a workspace repository exposes a filesystem-backed `specsPath`, the indexer SHALL derive a synthetic exclusion for that root and apply it to file/document discovery. Spec artifacts MUST be indexed through spec indexing only, not as files or documents.

Textual fallback SHALL decode document content using this policy:

- Detect and accept BOM-marked `utf-8`, `utf-16le`, and `utf-16be`
- Otherwise try `utf-8`
- Otherwise accept `utf-16le` or `utf-16be` when the byte pattern matches UTF-16 null-byte layout
- Otherwise accept `windows-1252` only when the file does not contain NUL bytes
- Otherwise skip the file as non-textual

`discoverFiles` accepts a root directory plus exclusion options:

- **`respectGitignore`** (default `true`): when `true`, `.gitignore` files are loaded hierarchically and applied with absolute priority.
- **`excludePaths`** (default: built-in list): gitignore-syntax patterns applied as an additional exclusion layer, evaluated against the project-relative path. Built-in default excludes MUST include `.git/`, `.hg/`, and `.svn/`.
- **`pathBase`** (project-relative directory of the discovery root, default empty): the path from the project root to the discovery root. Patterns are matched against `pathBase` joined with the path below the discovery root.
- **`vcsRoot`** (`string | null`): the root directory of the VCS repository, resolved upstream from `VcsAdapter.rootDir()` and used to bound hierarchical `.gitignore` searches. Callers MUST pass `null` explicitly when no repository root exists. `discoverFiles` MUST NOT probe for repository markers on its own.

### Requirement: Project-relative path evaluation

The indexer SHALL evaluate every configured path and pattern (`graph.includePaths`, `graph.excludePaths`, `allowedPaths`, `testPaths`, `ignorePaths`, `largeFilePaths`, at project and workspace level) against the file's project-relative path, as defined by `core:config` Requirement: Project-relative graph path semantics. The `codeRoot`-relative path remains the persisted file identity (`{workspaceName}:{path}`); it MUST NOT be used as the matching subject.

- Workspace discovery SHALL walk `codeRoot` but match patterns against `join(relative(projectRoot, codeRoot), pathBelowCodeRoot)`, including when pruning directories during the walk. A pattern that excludes a directory project-relative MUST prune that directory.
- Exclusion SHALL be evaluated in two non-interchangeable layers, in this order: (1) the global layer: project `graph.excludePaths` (or the built-in defaults) plus the synthetic spec-root exclusions; (2) the workspace layer: the workspace's `excludePaths`. A path excluded by layer 1 SHALL NOT be re-included by any pattern of layer 2, including `!` negations. A `!` negation reverses only earlier patterns of its own list.
- `.gitignore` retains absolute priority over both layers when `respectGitignore` is `true`.
- Categorization (`ignored`, `test`, `source`) SHALL match project-level and workspace-level `ignorePaths` and `testPaths` against the project-relative path. The default test patterns remain valid because they are unanchored.
- The size-limit exemption SHALL match both project-level and workspace-level `largeFilePaths` against the project-relative path.
- When a workspace's `codeRoot` is outside the project root, the project-relative path starts with `../`; anchored project-relative patterns SHALL NOT match, unanchored patterns match against the path below `codeRoot`, and the run SHALL NOT fail for that reason.
- Category lists are evaluated as one ordered list per kind (`ignorePaths`, then `testPaths`; project patterns first, then workspace patterns), so a workspace `!` negation can cancel a project pattern of the same kind; `largeFilePaths` lists are evaluated separately and an exemption from either list applies.
- Graph input visibility and graph health SHALL use the same effective configuration and the same evaluation as indexing, so freshness and health agree with what the indexer reads.
- The decision for a file SHALL be obtainable together with the winning rule and its origin (`.gitignore`, global layer, synthetic spec-root, workspace layer, `allowedPaths`, size gate, category rule) through the same evaluation functions used for indexing, so that path explanation reuses indexing logic rather than reimplementing it.

### Requirement: Workspace overlap diagnostic

When the same physical file is discovered and kept by more than one workspace (it passes discovery in each, so it receives one graph identity per workspace), the indexer SHALL record a workspace-overlap diagnostic instead of staying silent.

- A diagnostic carries the `projectRelativePath` and the names of all owning workspaces.
- The index result SHALL expose the diagnostics as a stable list together with their total count, bounded in size like other diagnostic lists, so that a large overlap does not grow the result without limit.
- The diagnostic is a warning. It MUST NOT fail the run, change what is indexed, or alter incremental behaviour.
- A file excluded by every workspace but one, or discovered by only one workspace, produces no diagnostic.
- Hosts that render the diagnostic SHALL state that overlapping ownership usually means the `excludePaths` or `allowedPaths` of the workspaces do not partition the files, and name `graph why <path>` as the way to inspect it. The result itself carries only structured data.

### Requirement: Portable graph paths

Relative paths persisted by the indexer MUST use `/` as the separator. That conversion MUST NOT collapse `.` or `..` segments.

A key that begins with a Windows drive letter, matching `^[A-Za-z]:[/\\]`, MUST NOT be split into a workspace name and a path. A bare drive letter, matching `^[A-Za-z]:$`, is the same kind of path: the directory of a file at the drive root. `goPackageSurface('C:/a.go')` is `C:`, and that string MUST NOT parse as workspace `C`. The drive letter is part of the path, not a workspace prefix. Every graph-identity split MUST use that rule, including language-adapter relative imports, package surfaces, scoped binding, and hotspot caller classification. A PHP namespace separator is not a graph identity and MUST stay local.

### Requirement: Binary file filtering

The indexer's discovery process SHALL filter out known binary and non-source file extensions by default (e.g., `.gif`, `.png`, `.jpg`, `.jpeg`, `.pdf`, `.sql`, `.zip`, `.tiff`, `.pack`). This prevents the engine from attempting to parse large binary payloads as text or document nodes, which causes CPU saturation and out-of-memory errors during hashing and extraction. This global binary filter runs before any document decoding heuristics are applied.

### Requirement: Bounded analysis memory

The indexer SHALL reduce repeated allocation pressure by reusing shared session lookups across passes and by storing compact per-file analysis results instead of re-deriving imports, bindings, and relations from raw content multiple times.

The indexer MUST NOT retain parser ASTs, parse trees, or equivalent heavyweight parser objects across the full run. Pass 1 MAY allocate such structures transiently while analyzing an individual file, but the retained run-scoped state MUST be limited to compact normalized facts and common indexes that Pass 2 requires.

This bound applies to retention across files and chunks, not only within one file: at any moment the indexer SHALL retain the parser-owned resources of at most the one file being analysed, as defined by Requirement: Parser resource lifecycle.

### Requirement: Parser resource lifecycle

The indexing session SHALL expose a parser-resource scope. A language adapter that parses with a library holding native, WASM, or otherwise explicitly managed memory SHALL register what it parsed in that scope, optionally together with a disposal function when its library requires explicit release. Adapters whose libraries need no retention or release SHALL register nothing. The indexer and the session MUST NOT depend on any specific parsing library, node type, or binding, and an adapter MUST NOT keep parser objects in adapter-private session state.

The indexer SHALL close the scope's current epoch after every file it begins to analyse, including files that exit early because they are binary, unsupported, over the size limit, or fail to parse. The close MUST run on every exit path of the per-file work: success, parse failure, cancellation, persistence failure, and any thrown error. Closing an epoch SHALL:

1. run every registered disposal function, in reverse registration order, so that a failing disposal neither prevents the remaining disposals nor replaces the error that caused the exit;
2. drop every reference held by the scope;
3. request a garbage collection when the epoch held at least one registered resource and the host exposes one, as a best-effort action that has no effect when it is unavailable. Closing an epoch that held nothing performs no garbage-collection request.

A disposal failure SHALL be reported as a typed diagnostic and MUST NOT fail the run on its own.

The indexer has no cooperative abort of its own. An in-process run ends early when a host callback (such as the progress callback) throws, and an isolated run is cancelled by terminating the child; the close rules above apply to every such exit.

Analysis results retained after an epoch closes MUST NOT reference parser-owned resources. After a run ends, whether it succeeded, failed, or was cancelled, no parser-owned resource SHALL remain reachable from the session. The indexer MUST NOT keep a run-wide collection of parser resources, and the `napi-keepalive` adapter-state key SHALL NOT exist.

### Requirement: Per-file size limit

The indexer SHALL NOT read, hash, decode, analyse, or store a file whose size exceeds the effective `maxFileBytes` limit, unless the file is exempt. The limit applies to every file the indexer would read in full in order to index it, whether it would become source nodes or a document, regardless of its category (source, test, or ignored) and of its language.

The effective limit for a file SHALL be the `maxFileBytes` of the workspace that owns it, otherwise the project-level `maxFileBytes`, otherwise the built-in default of 262144 bytes. A limit of `0` SHALL mean that no limit applies.

The size SHALL be the size in bytes on disk, obtained from the filesystem metadata, decided once per file from a single filesystem-metadata request made before any content is read, and reused by every phase that needs the size decision. Other phases MAY request metadata for their own purposes, such as change detection. Discovery rules (`excludePaths`, `allowedPaths`, gitignore, and the binary file filter) SHALL be applied first; the size check applies only to files that discovery keeps.

A file is exempt when it matches the effective `largeFilePaths`: the project-level patterns together with the patterns of the owning workspace, both evaluated against the file's project-relative path. The exemption applies only to the size limit and MUST NOT make a file that discovery rules exclude become indexed.

A file skipped for size SHALL be recorded in index coverage with status `unsupported` and reason `file-too-large`; the persisted coverage carries no size or limit, because those are reported by the run result and the `file-skipped` event of the run that skipped the file. A lookup addressed to such a file SHALL report it as not indexed, and absence claims that could depend on it SHALL be treated as unproven: graph health reports the coverage as `complete-with-warnings` as defined by `code-graph:get-graph-health`. No file node, document node, symbol, or relation SHALL be created for it.

### Requirement: Size skip in incremental runs and dependents

When a file that is already in the graph now exceeds the effective limit and is not exempt, the indexer SHALL remove its previously indexed nodes, symbols, and relations exactly as for a file that is no longer indexed, and SHALL record the size skip in coverage. When a previously skipped file falls below the limit or becomes exempt, the indexer SHALL index it in the next run. A change of the effective limit or of the exemptions is a change of the discovery fingerprint, so it triggers the rebuild defined by Requirement: Incompatible derivation rebuild.

An import or reference that resolves to a file skipped for size SHALL remain unresolved, exactly as for any file that is not indexed. The cause SHALL be discoverable without inspecting the importer: the skipped file has a coverage entry with reason `file-too-large`, and the run result lists it among the files skipped for size.

### Requirement: Two-pass extraction with in-memory index

Extraction proceeds in two passes over the discovered files, using a shared in-memory `IndexSession` rather than repeated adapter extraction or graph-store lookups during analysis:

- **Pass 1 (Analyze files, per workspace)** — For each workspace, for each file in chunks: read content, derive a complete `FileAnalysis` through the language adapter, register the file analysis in the shared `IndexSession`, and emit `DEFINES` and `EXPORTS` relations from the registered symbols. The session owns common in-memory lookups for files, symbols, qualified names, and parser-emitted facts. No store queries are needed during extraction.
- **Before Pass 1** — The indexer builds the `packageName → workspaceName` map from the `packageResolution` facets. Package identity comes from manifests only and needs no analysis.
- **Between the passes** — After every workspace has completed Pass 1 and unchanged workspaces have been hydrated, the indexer (1) calls `packageResolution.prepare` once per adapter so the data for all workspaces is stored in the session, and (2) runs every present `reExportLinking` facet so public bindings are final. No import is resolved before these steps finish.
- **Pass 2 (Resolve imports + scoped bindings + relations, all workspaces)** — For each analyzed file, resolve imports and cross-file targets from the facts stored in the `IndexSession`, then derive `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, hierarchy, and other deterministic relations from the stored facts without re-parsing the file. Shared scoped resolution owns cross-language receiver, type-reference, constructor, and call-candidate lookup against the session indexes.
- **Specs (per workspace)** — For each workspace: iterate through specs provided by the `SpecRepository`.

This approach ensures all symbols and final public bindings exist in the shared session before import, binding, call, and hierarchy resolution, while avoiding store queries and repeated file analysis during indexing.

- **Bulk commit** — After all passes complete, commit one bulk write session so the indexed generation is persisted atomically.
- **Search index rebuild** — The commit rebuilds the semantic and content search indexes once before the store reports ready.

### Requirement: Shared indexing session

The indexer SHALL maintain a run-scoped in-memory `IndexSession` for the full indexing operation.

The `IndexSession` MUST provide shared lookup and deduplication facilities for:

- registered files and their stable run-local numeric IDs
- registered file analyses keyed by file ID and workspace-prefixed file path
- registered symbols keyed by file, name, and qualified name
- registered documents, specs, and deterministic cross-entity lookups such as file-to-symbol and spec-to-symbol
- deterministic parser-emitted facts required by Pass 2 relation building
- deduplicated relations accumulated before the final store commit

The `IndexSession` MUST expose a common API for all built-in adapters and indexer phases. Adapters MAY store compact run-scoped adapter cache state through that API, but they MUST NOT bypass the session with direct access to raw internal maps.

The qualified-name lookup SHALL be filled identically for files analyzed in the run and for files hydrated from the persisted store: a hydrated file contributes `namespace` + `namespaceSeparator` + symbol name for each of its symbols, using the `namespace` and `namespaceSeparator` persisted on its file node, without re-analysing the file. Therefore a name-addressed import resolves the same in an incremental run as in a clean rebuild. A symbol that belongs to a file classified as a test SHALL be excluded from the lookup seen by an importing file that is not a test, so production code never resolves to a test symbol. An importing file that is itself a test SHALL see test symbols, so a test-to-test-helper import resolves.

The `IndexSession` SHALL remain an in-memory indexing primitive only. It MUST NOT change persisted graph-store schemas, persisted graph IDs, or final graph relation semantics.

### Requirement: Scoped binding environment resolution

During Pass 2, the indexer SHALL build a per-file scoped binding environment from adapter-provided binding facts, call facts, symbols, import declarations, resolved import maps, namespace maps, and the shared `IndexSession` lookups.

The scoped binding environment builder SHALL be shared code-graph logic, not adapter-local full environment logic. It SHALL provide deterministic lookup for:

- source location to enclosing scope
- lexical shadowing
- local, parameter, property/field, class-managed, inherited, file/global, framework-managed, and imported type bindings
- receiver identities such as `this`, `self`, `cls`, `parent`, `super`, and language equivalents when represented by adapter facts
- free call, member call, static call, and constructor call candidates

The indexer SHALL use the environment to resolve `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` only when the target can be selected deterministically. It MUST NOT query the store during analysis and MUST NOT add language-specific resolution rules to `IndexCodeGraph`.

A name that an import binds to a resolved declaration SHALL resolve to that declaration, in whichever workspace it is declared. The environment MUST resolve it through the session lookup of that declaration by id, and MUST NOT replace it with a same-name symbol of the importing workspace. A same-name search within the importing workspace is only allowed for a name that no import binds.

The indexer SHALL drop any resolved symbol-to-symbol dependency relation whose source symbol id equals its target symbol id before staging relations for persistence.

Unresolved or ambiguous binding facts SHALL NOT create persisted relations. The indexer MAY retain non-persisted diagnostics for tests, debugging, or result reporting if doing so does not change the graph-store contract.

### Requirement: Chunked processing

Files are grouped into chunks where each chunk's total source size does not exceed a configurable byte budget (default: 20 MB). Each chunk is processed sequentially so that content and intermediate extraction state from completed chunks are eligible for garbage collection, bounding peak memory usage.

The chunk budget is configurable via `IndexOptions.chunkBytes`.

Implementations MAY spill intermediate indexing artifacts to disk instead of retaining the full run in memory. When they do:

- staged artifacts MUST live under the graph temporary directory derived from project configuration
- staged artifacts MUST be scoped to the current indexing run
- staged artifacts MUST be cleaned up after successful completion
- staged artifacts SHOULD be cleaned up after failure when the process remains alive long enough to do so

### Requirement: Progress reporting

`IndexOptions` accepts an optional `onProgress` callback `(percent: number, phase: string) => void`. The indexer reports granular progress:

- 0-5%: File discovery and content hashing
- 5-7%: Diff computation and cleanup of deleted/changed files
- 7-50%: Pass 1 — file analysis and symbol registration (updates per file)
- 50-80%: Pass 2 — import resolution and relation building from stored facts (updates per file)
- 80-83%: Spec discovery
- 83-95%: Bulk loading (updates per table and relation batch)
- 100%: Done

Progress updates include a detail string (e.g. `"150/460 files"`) for phases that process individual items.

The indexer SHALL ensure progress callbacks are fired immediately when a phase finishes, before starting the next synchronous or heavy CPU-bound internal processing (such as session index finalization or relation aggregation), so the user interface does not display stale phase labels.

### Requirement: Typed indexing events

`IndexOptions` SHALL accept an optional `onEvent` receiver, in addition to the unchanged `onProgress` callback. The receiver SHALL be called with presentation-neutral, serializable events that carry a stable `kind` identifier and structured fields, never display sentences. The following kinds SHALL exist:

- `file-activity` — the file about to be processed (`filePath`, `sizeBytes` when known, and its position among the files to process), emitted for every file that enters per-file processing before its content is read, including files that processing then skips because they have no language adapter or their content cannot be decoded; files that never enter per-file processing (excluded by discovery rules or skipped for size) are not announced by this event, and size skips are reported by `file-skipped`; the indexer MUST NOT throttle it, because a receiver that must name the file responsible for a stall needs the announcement of every file being processed, and rate limiting belongs to the receiver
- `file-skipped` — a file skipped for size (`filePath`, `sizeBytes`, `limitBytes`, `reason: file-too-large`)
- `resource-disposal-failed` — a registered parser-resource disposal that failed (`filePath`, `message`)

Files that enter per-file processing and are then skipped by the analysis (no language adapter, undecodable content) SHALL be counted in the progress counters, so that the progress detail does not stall while such files are being traversed. Existing behaviour of `onProgress` SHALL be preserved.

### Requirement: Phase execution timing logging

The indexer SHALL log the execution time of each major internal phase (e.g., File Discovery, Pass 1, Pass 2, Spec Indexing, Bulk Load) at the `debug` level to facilitate performance diagnostics and bottleneck detection without blocking or polluting standard output.

### Requirement: Cross-workspace package resolution

Before Pass 1, the indexer SHALL resolve, once per run and per configured workspace, the root of the repository that contains the workspace code root, using the VCS adapter detection (`createVcsAdapter(codeRoot)` followed by `rootDir()`). A workspace whose code root belongs to another repository than the project (for example a multirepo setup) therefore gets its own repository root. When no VCS is detected for a code root, or the detection fails, no repository root is provided for that workspace and its manifest search inspects only the code root. The project root is never used as the search boundary.

The indexer SHALL then build a `packageName → workspaceName` map by calling `packageResolution.identity(codeRoot, repoRoot, report)` for each configured workspace on every registered adapter that provides the facet, with the `repoRoot` of that workspace. Every adapter is asked, so a workspace that holds several manifests (for example `package.json` and `composer.json`) keeps one identity per language. Non-fatal manifest skip diagnostics emitted via `report` SHALL be appended to `IndexResult.errors` without disabling the adapter. A failure thrown inside `identity` SHALL be recorded in `IndexResult.errors`, that adapter SHALL be treated as not providing `packageResolution` for the rest of the run, and any package identities claimed solely by that adapter on earlier workspaces SHALL be removed from `packageName → workspaceName`; it MUST NOT stop the run and it MUST NOT disable the same adapter's `reExportLinking` facet for relative routes. Each adapter reads its own manifest. The indexer MUST NOT parse `package.json`, `exports`, `main`, `go.mod`, `pyproject.toml`, or `composer.json` itself, and MUST NOT branch on a language identifier, file extension, or manifest name. A package identity claimed by two different workspaces SHALL be reported as an error naming both workspaces and SHALL resolve to no workspace; one workspace claiming the same identity through several adapters is not a conflict.

The map and the prepared data SHALL cover every configured workspace (`IndexOptions.configuredWorkspaces ?? IndexOptions.workspaces`), not only the workspaces selected for incremental diffing and file extraction in the run (for example by `--workspace`), so the result for an indexed workspace does not depend on which subset was requested; files and symbols from unselected configured workspaces remain available from the hydrated store. A configured workspace whose code root is not accessible (for example a repository that is not cloned on this machine) SHALL be skipped with a diagnostic in `IndexResult.errors`, its packages SHALL count as external, and it MUST NOT fail the run or the indexing of the other workspaces. The application use case SHALL obtain the accessibility and directory probe through an injected application port; it MUST NOT import or call `node:fs` directly. A filesystem-backed implementation SHALL be supplied by the composition layer, and a probe failure SHALL be handled as an inaccessible workspace with the same non-fatal diagnostic behavior.

The indexer SHALL then call `packageResolution.prepare` once per adapter with every accessible configured workspace, including workspaces that were only hydrated in an incremental run or not selected for the run, so entry surfaces are available for all packages. If `prepare` throws, the error SHALL be recorded in `IndexResult.errors`, the adapter SHALL be treated as not providing `packageResolution` for the rest of the run, and any package identities claimed solely by that adapter SHALL be removed from `packageName → workspaceName`.

The indexer SHALL implement `packageEntryFiles` and `resolvePackageExport` of `ImportResolutionContext` generically, using only the importing adapter's `packageResolution` facet and the session's public bindings:

1. match the specifier to a known package with `matchSpecifier`;
2. obtain the entries with `entrySurface` and keep those whose file is indexed and not classified as a test (a test file is never a package entry);
3. read the public bindings stored under each entry's surface for the requested name and symbol space;
4. resolve the name only when every entry that publishes it leads to the same logical target, and otherwise report `ambiguous` or `not-exported`.

The helper reports `facet-absent` when the importing adapter does not provide `packageResolution`, `package-unknown` when no known package matches, and `no-entry-surface` when the facet returns no indexed entry. It MUST NOT search symbols by name, and it MUST NOT select a candidate because its name is unique.

Public re-export bindings, including bindings whose target is another workspace, SHALL be the facts the adapter emits through `reExportLinking` after resolving the specifier to an entry file. The indexer MUST NOT extract a package specifier and then select the first symbol of that name in the target workspace.

The map SHALL work for workspaces in one repo and for workspaces configured from separate repos, because identity comes from the adapter reading each workspace manifest and the search boundary is the repository of each code root.

A resolved import SHALL set the local binding target, persist the returned `import:package` step, and add the file-level `IMPORTS` relation to the entry file. An unresolved import SHALL leave nothing persisted. Its reason SHALL be reported as a non-persisted diagnostic in the indexing output, and SHALL NOT be written to the graph store.

An import of a package that no workspace declares (reason `package-unknown`) is an external dependency, not a resolution failure. The run SHALL only count such imports, in `IndexResult.importDiagnostics.externalPackageImports`, and SHALL NOT include them in the failure total, the per-reason counts, or the samples.

`IndexResult.importDiagnostics` SHALL be a summary with `total` (the number of unresolved package imports excluding external ones), `byReason` (the exact count per reason, omitting reasons that never occurred), `samples` (at most 20 diagnostics per reason, in discovery order), `externalPackageImports`, and `adaptersWithoutPackageResolution` (one entry for each distinct registered adapter that does not provide the facet or whose package resolution was disabled by a facet failure, named by the first language identifier the adapter declares and sorted alphabetically; an adapter serving several languages is listed once, never once per language). An adapter without the facet is listed once per run; it is not a resolution failure and is never counted in `total`, `byReason`, or `samples`. In an incremental run the counts and samples cover only the files reprocessed in that run. The full list is not kept because it can be as large as the number of imports in the corpus.

### Requirement: Error isolation

Errors during extraction or storage for a single file MUST NOT abort the entire indexing run. The indexer SHALL:

- Catch errors per file
- Record the file path and error message in the index result
- Continue processing remaining files
- Include the error count and details in the final result

Only infrastructure-level errors (e.g. store connection lost, disk full) may abort the entire run.

### Requirement: Index result

`IndexCodeGraph` SHALL return an `IndexResult` value object containing:

- **`filesDiscovered`** — total files found during discovery (across all workspaces)
- **`filesIndexed`** — files that were new or changed and successfully processed
- **`filesRemoved`** — files removed from the store (deleted from disk)
- **`filesSkipped`** — files skipped because their hash matched and the graph fingerprint was still valid
- **`filesSkippedForSize`** — files not indexed because they exceeded the effective size limit and were not exempt
- **`largestSkippedForSize`** — a bounded list of the largest of those files, in descending size order and then by path, each `{ filePath, projectRelativePath, sizeBytes, limitBytes }`; the list MUST hold at least ten entries when that many exist
- **`sizeExemptAnalysed`** — the files that exceeded the effective size limit but were analysed because they are exempt, each `{ filePath, projectRelativePath, sizeBytes }`
- **`workspaceOverlaps`** — a list of at most 25 files kept by more than one workspace in the run, each `{ projectRelativePath, workspaces }`, sorted by `projectRelativePath`
- **`workspaceOverlapCount`** — the exact number of overlapping files, including those omitted from `workspaceOverlaps`
- **`specsDiscovered`** — total spec directories found
- **`specsIndexed`** — specs that were new or changed and successfully processed
- **`errors`** — array of `{ filePath: string; message: string }` for files or specs that failed to produce their indexed content
- **`diagnostics`** — array of `{ filePath: string; message: string }` for problems found while resolving packages or linking re-exports (a package identity declared by several workspaces, an inaccessible workspace root, an adapter that failed to prepare or link). A diagnostic does not mean that a file or spec failed.
- **`duration`** — elapsed time in milliseconds
- **`workspaces`** — per-workspace breakdown array of `{ name, filesDiscovered, filesIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed }`
- **`vcsRef`** — the VCS ref that was persisted, or `null` if none was provided
- **`graphFingerprint`** — the fingerprint persisted for the completed run
- **`fullRebuildReason`** — `null` for a normal incremental run, or a human-readable reason when the run escalated to a full rebuild because the stored fingerprint no longer matched

The result also carries the coverage, phase-metrics and import-diagnostic summaries defined by their own requirements.

### Requirement: Spec dependency indexing

The indexer SHALL build `SpecNode` entries and relations by directly consuming the `SpecRepository` instance from each workspace, together with Core's `GetSpecMetadata` use case:

1. Use `repo.count()` to discover the total spec volume upfront for accurate progress reporting
2. Use `repo.list()` to enumerate spec identities
3. For each spec, call `GetSpecMetadata.execute({ specId })` and compare the returned `metadataFingerprint` against the value stored on the corresponding `SpecNode` to enable incremental skipping — a spec is reprocessed only when its semantic fingerprint changed, not merely because a cache file's raw bytes or timestamp changed
4. Load `title` and `description` from the materialized `GetSpecMetadata` result rather than a raw `repo.metadata()` read
5. Load `COVERS_FILE`, `COVERS_SYMBOL`, and `DEPENDS_ON` relations from one `repo.readPersistedState()` result

The indexer SHALL NOT rely on the CLI to pre-extract spec data. It owns the semantic mapping from repository data to graph nodes.

### Requirement: Prefer LLM-optimized description

When indexing specs into the code graph, the indexer SHALL prefer `optimizedDescription` (if it exists and is not empty) over the standard `description` for BM25 full-text indexing and display metadata.

### Requirement: Reference fact indexing

The indexing session SHALL persist the logical symbols, member semantics, declaration occurrences, public bindings, local bindings, hierarchy facts, and resolution steps emitted by language adapters. Each persisted logical symbol that has an owner SHALL store `qualified_name` as the generic dotted path rebuilt from the owner chain and the simple name. A symbol with no owner MUST NOT store a qualified name. The indexer MUST NOT treat full-text search text as that exact spelling. The indexer MUST NOT hardcode a language name, parser-state kind, package manifest, or syntax rule. It MUST NOT contain a TypeScript re-export pass and MUST NOT assign declaration parents from a fixed language set.

When deriving cross-file override relations (`OVERRIDES`), the indexer SHALL iterate through all target method declaration IDs associated with each matching super method name (supporting overload sets and multi-declaration methods), rather than dropping targets beyond the first entry.

`SymbolKind.Property` declarations SHALL be indexed and persisted alongside other symbol kinds, emitting `DEFINES` relations from the declaring file and preserving the enclosing container's `parentId`.

The indexer SHALL persist a coverage outcome for every discovered or considered source target, including indexed content hash, excluded, unsupported capability, parse-failed, and partial states. Index errors required for later absence decisions MUST NOT exist only in the transient `IndexResult`.

`COVERS_SYMBOL` relations SHALL resolve to logical-symbol identity rather than an arbitrary declaration occurrence. Ambiguous, runtime-only, or conditional-without-context references MUST NOT create guessed relations.

Every persisted source file SHALL retain the indexed textual content used for analysis. Every emitted symbol SHALL carry its parser-derived complete construct range and declared-name selection range through chunking, semantic reconstruction, backend persistence, and structured query results without recomputing ranges from neighboring symbols.

Relation construction SHALL build reusable declaration, logical-symbol, import, and public-binding lookup indexes once per indexing session. Resolving an individual call, dependency, import, or re-export MUST NOT scan the complete logical declaration or symbol collection. Persistence SHALL retain bounded chunk and batch writes so the work of building relations grows with the processed relation facts rather than multiplying them by the full graph size. Adapter-emitted reference facts SHALL be stored before spec-coverage projection.

### Requirement: Classification-aware logical identity construction

The indexing session SHALL preserve each adapter's declaration classification and MUST NOT manufacture a logical target for a lexical-binding-only or physical-only declaration. It SHALL register canonical logical owners before constructing owned member identities and SHALL use the adapter-provided lexical occurrence parent only as physical containment evidence.

Logical declaration groups SHALL be assembled from explicit language-provided grouping evidence. An absent or undefined group key SHALL mean that no group has been proven; it MUST NOT be normalized into a shared key. The indexer MUST NOT merge declarations by file, simple name, broad `SymbolKind`, or mutual absence of grouping evidence alone. Every logical target SHALL persist its complete deterministic declaration set, including declaration-level form metadata required to distinguish signatures, implementations, and other occurrences without changing target identity.

### Requirement: Incompatible derivation rebuild

When package derivation fingerprint or backend schema is incompatible, project indexing SHALL perform a visible destructive full rebuild through provider-owned recreation, rotate storage generation, and report the rebuild reason. Ordinary read paths MUST NOT perform this repair or serve a silently empty graph.

Recreation applies when the run replaces the whole graph, that is, when every stored workspace is indexed. A run that indexes only some stored workspaces SHALL clear and regenerate only those workspaces and MUST NOT recreate storage or alter the others. A caller that supplies an already-open provider cannot have it recreated; indexing then performs an in-place logical rebuild that clears the derived graph and reports the same reason.

### Requirement: Indexed-input observation capture

A successful index SHALL atomically replace indexed-input observations for every produced file, document, and spec resource, including every physical or repository input of aggregate specs. It SHALL record current hash and observation evidence with `stale: false`, replace workspace VCS-scope base-ref/diff evidence, and clear workspace and aggregate stale latches only when the complete indexing session commits.

An index is successful when its generation commits, whether or not `errors` or `diagnostics` hold entries. Freshness and processing outcome are separate axes: observations record the content the indexer saw, and a file that failed to be analysed is reported in `errors` and in coverage as `parse-failed` (which makes coverage incomplete), not as stale content. A failed resource has no observation, so health reports it with the reason `OBSERVATION_MISSING` as unknown until it is indexed successfully. A failed file is identified by its workspace-prefixed path and a failed spec by its spec identifier, in the same form that the observation of that resource uses, so that the failure and the missing observation always refer to the same resource. A failure while hashing or inspecting a discovered file counts as a failure of that file: it is recorded once in `errors` and in coverage as `parse-failed`.

Every observation MUST carry the hash and the filesystem stamp of the content that this run read for the resource, on every kind of run, including a forced run and a run after a fingerprint mismatch. A resource for which the run did not read content does not receive an observation. Only a run that does not commit, such as an infrastructure failure of the store or the disk, leaves the latches and the previous observations as they were.

Failed or partial indexing MUST NOT clear stale evidence. Removed resources and obsolete inputs SHALL be pruned in the same committed generation.

### Requirement: Retry of failed targets

A normal incremental run SHALL reconsider every discovered target whose last persisted outcome is a failure: a coverage record with status `parse-failed`, or a target for which the last run reported an error and left no observation. Persisted content hashes, coverage hashes, and observations MUST NOT authorize treating such a target as unchanged. A run that retries and succeeds replaces the failure with the normal outcome and records its observation; a run that fails again leaves the failure in `errors` and in coverage without keeping the graph stale.

### Requirement: Bounded incremental relation construction

Incremental indexing SHALL use persisted filesystem mtime/size observations as a read-avoidance fast path and content hashes as the authoritative comparison whenever a stamp differs or no observation exists. Equal stamps SHALL reuse the indexed content hash; changed stamps with equal content SHALL remain unchanged. The result SHALL identify changed, removed, and unchanged inputs and report those counts accurately. A normal semantic refresh SHALL re-extract only new and changed targets plus the transitive importer, relation-dependent, hierarchy-dependent, or public-route closure whose derived facts may change. Because native stores cannot retain relations to absent endpoints, a run containing newly added code files SHALL conservatively re-extract existing code files that may contain previously unresolved imports; this addition-only fallback MUST NOT classify unchanged files as content-indexed. Unaffected files and documents MUST retain their persisted nodes, symbols, relations, and reference facts without adapter extraction outside that addition-only fallback. The run SHALL hydrate the compact persisted facts needed to resolve affected files against unchanged declarations and bindings. Full-corpus destructive replacement is reserved for an explicit force operation, an incompatible derivation/schema rebuild, or an initial empty graph.

Re-export and public-binding propagation SHALL use indexed affected-route work queues rather than repeated full-file passes. Enclosing-symbol, ownership, hierarchy, and relation-endpoint resolution SHALL use run-scoped indexes and batch Store operations instead of repeated sorting, whole-collection scans, or N+1 queries.

The indexer SHALL append bounded chunks to one Store bulk session, commit once, and request at most one final rebuild covering semantic, document, spec, and source-content indexes when searchable content changed. A fully unchanged generation SHALL preserve the existing semantic reference-fact snapshot while updating metadata and freshness state, without re-extracting files, replacing reference facts, constructing relations, or rebuilding search indexes. Persisted coverage hashes SHALL participate in diffing targets such as non-text content that intentionally has no File or Document node. Full and incremental indexing of equivalent source state MUST produce equivalent nodes, ranges, semantic facts, relations, and source-search behavior. Progress SHALL report separate counts and timings for import resolution, dependency facts, adapter relations, re-exports, hierarchy/overrides, persistence, and search-index rebuilding. Persistence timing SHALL include cleanup, staged writes, observation/reference-fact writes, relation writes, and non-search commit work; search-index timing SHALL be zero when no search rebuild is requested and SHALL cover only the backend search-index step when requested.

`IndexResult` SHALL expose `fullRebuild: boolean` directly in addition to `fullRebuildReason`, so every Code Graph, SDK, and CLI caller receives the same rebuild truth without reconstructing it at a higher layer.

### Requirement: Identity-sensitive incremental equivalence

Given identical final source and configuration, an incremental indexing run SHALL produce the same logical symbols, declaration mappings, local bindings, dependency relations, public bindings, resolution evidence, and spec coverage as a clean full rebuild. This includes imports that are addressed by qualified name or namespace (PHP, Python, and Go), which depend on the hydrated qualified-name lookup and on the prepared manifests of every configured workspace.

The affected closure SHALL reconsider every consumer whose semantic result can change because of declaration movement, body edits, owner changes, overload or merge-group changes, renames, moves, additions, deletions, or a previously unresolved target becoming resolvable. Cleanup MUST NOT delete incident physical relations without either rebuilding every affected consumer or preserving equivalent committed evidence.

Equivalence tests SHALL compare normalized semantic state after each identity-sensitive mutation rather than relying only on file or relation counts.

### Requirement: Facet-driven language independence

The indexer SHALL obtain every language-specific resolution fact from the facets that registered adapters provide. It MUST NOT branch on language identifiers, file extensions, or manifest names, and MUST NOT assume how a language maps a specifier to files.

Before using a facet, the indexer SHALL check that the adapter provides it. An adapter that does not provide a facet SHALL be skipped for the behaviour that facet enables, with no error and no heuristic fallback, and the run result SHALL list the adapter in `importDiagnostics.adaptersWithoutPackageResolution` when the absent facet is `packageResolution`.

Registering a new adapter SHALL be enough for the indexer to index its language and, when the adapter provides `packageResolution`, to resolve package imports to and from workspaces of that language. No indexer change SHALL be required.

### Requirement: Package import incremental closure

Resolved package imports are persisted as `import:package` resolution steps from the importing local binding to the entry public binding. The incremental closure SHALL use those steps in reverse, so that when a target workspace changes the files that import from it are re-resolved: a change to an entry file, to any file reached through its re-export chain, to a package manifest declared in `resolutionManifests()` that alters its identity or entry surface, or to the set of workspaces SHALL re-extract the importing files in other workspaces.

A previously unresolved package import SHALL be reconsidered when its target becomes resolvable, including when the target workspace is newly added. The resulting graph SHALL equal a clean rebuild of the same final source.

To find the importers of a changed entry, the closure SHALL read only persisted steps, hydrated public bindings, and manifest facts prepared for the run. It MUST NOT scan every file to find them. A run that adds new code files (files an adapter analyzes, not documents, assets, or other non-code files) still re-extracts the existing code files that may contain previously unresolved imports (the addition-only fallback); that is how an import becomes resolvable when its target appears, and it is not a scan to find importers of a changed entry. A run that adds only non-code files MUST NOT trigger that fallback.

## Constraints

- The `GraphStore` must be opened before calling the use case — the indexer does not manage store lifecycle
- Discovery always uses forward-slash-normalized paths; configured patterns are matched against the project-relative path, and persisted identities use the `codeRoot`-relative path
- When `excludePaths` is not provided, built-in default patterns apply (node_modules/, .git/, .specd/, dist/, build/, coverage/, .next/, .nuxt/)
- When `excludePaths` is provided, it replaces built-in defaults entirely — no merging occurs
- When `respectGitignore` is `true`, `.gitignore` exclusions have absolute priority and cannot be overridden by `excludePaths` patterns of either layer
- Global exclusions (project `excludePaths`, synthetic spec-root exclusions) cannot be overridden by workspace `excludePaths`, including `!` negations
- Pass 2 depends on Pass 1 completing for all files — they are not interleaved per file
- Per-file errors are collected, not thrown — only infrastructure errors abort the run
- Spec indexing uses the workspace's `specs()` callback exclusively — no filesystem fallback
- Pass 2 depends on Pass 1 completing for ALL workspaces — they are not interleaved per workspace
- The scoped binding environment builder MUST use only in-memory pass data and adapter-provided facts; it MUST NOT query the graph store during analysis
- `IndexCodeGraph` MUST NOT contain language-specific binding or call-resolution rules
- Unresolved scoped binding facts MUST NOT produce persisted graph relations
- Resolved self-relations where the source symbol id equals the target symbol id MUST NOT be persisted
- The indexer MUST NOT contain language-specific resolution logic; it consumes adapter facets
- A new language MUST NOT require an indexer change
- Package-import diagnostics are never persisted
- Pass 2 import resolution performs no filesystem I/O

## Examples

```typescript
const store = new SQLiteGraphStore({ storagePath: '/project' })
await store.open()

const registry = new AdapterRegistry()
const indexer = new IndexCodeGraph(store, registry)

// Workspaces are typically obtained via ListWorkspaces use case
const result = await indexer.execute({
  workspaces: orchestratedWorkspaces,
  graphConfig: { includePaths: ['docs/**'] },
  projectRoot: '/project',
})

await store.close()
```

## Spec Dependencies

- [`code-graph:graph-store`](../graph-store/spec.md) — abstract graph-store contract used by the indexer
- [`code-graph:language-adapter`](../language-adapter/spec.md) — adapter extraction and resolution capabilities
- [`code-graph:symbol-model`](../symbol-model/spec.md) — files, symbols, specs, relations, and result types
- [`code-graph:workspace-integration`](../workspace-integration/spec.md) — workspace-prefixed path and spec identity rules
- [`code-graph:sqlite-graph-store`](../sqlite-graph-store/spec.md) — persisted graph identity must survive SQLite storage
- [`core:config`](../../core/config/spec.md) — graph discovery config and config-derived graph/temp directories
- [`core:spec-repository-port`](../../core/spec-repository-port/spec.md) — semantic spec repository contract consumed during spec indexing
- [`core:list-workspaces`](../../core/list-workspaces/spec.md) — orchestrated workspace and repository source for indexing
- [`code-graph:document-model`](../document-model/spec.md) — document-node identity and textual fallback semantics
- [`core:get-spec-metadata`](../../core/get-spec-metadata/spec.md) — self-healing metadata materialization and semantic fingerprint for incremental spec indexing
