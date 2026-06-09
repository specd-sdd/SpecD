## Context: improve-code-graph-path-search

### Binding directives

```text
GRAPH-FIRST PROTOCOL: You MUST use `specd graph` for all code exploration.
Generic grep/glob tools are only for non-code files or as a last resort.
Index the graph (`specd graph index`) if it is stale or missing.

specd is a spec-driven development platform. TypeScript, pnpm monorepo,
ESM only. Hexagonal architecture: domain (no I/O), application (ports),
infrastructure (fs adapters). Rich entities enforce invariants; pure
functions for stateless services; manual DI, no IoC. Packages: @specd/core
(business logic), @specd/cli, @specd/mcp, @specd/skills,
@specd/schema-std, plugins (claude, copilot, codex). Never write directly
to specs/ folder. Use specd workflow skills or specd commands: draft spec,
implement, review, approve, merge, archive. Specs live in specs/ — they
are requirements, not documentation. Code implements specs. Don't write
code without a spec. Use specd's workflow: draft spec, implement, review,
approve, merge, archive. Always keep specs up to date. Specs are the
source of truth, not code comments or external docs. Always read existing
specs before drafting new ones. Avoid duplicates; update existing specs
instead. Use specd's context features to include relevant specs in
workflow steps. For example, include 'default:*' to always have global
specs in context. Always write artifacts, code, comments, and
documentation in english.
```

### Decision Areas

#### Public CLI/API contract

- Requirement: cli:graph-search — Command signature: ```text
  specd graph search <query> [--symbols] [--specs] [--documents] [--kind <kinds>] [--file <path>] [--wo…
- Constraint: cli:graph-search — - The CLI does not contain search logic — it delegates to `CodeGraphProvider.searchSymbols`, `CodeGraphProvid…
- Scenario: cli:graph-search — Text output groups document results separately: - **GIVEN** document search returns one or more matching documents
- **WHEN** `specd graph search "Change"` i…
- Scenario: cli:graph-impact — Ambiguous unprefixed selector fails with canonical matches: - **GIVEN** two indexed files share config-relative path `src/index.ts`
- **WHEN** `specd graph impact --file…

#### Identity / selector normalization

- Requirement: cli:graph-impact — Command signature: ```text
  specd graph impact [--file <paths...>] [--symbol <name>] [--spec <id>] [--direction dependents|depend…
- Constraint: cli:graph-impact — - The CLI does not contain impact analysis logic — it delegates entirely to `@specd/code-graph`
- `process.ex…
- Scenario: cli:graph-impact — Ambiguous unprefixed selector fails with canonical matches: - **GIVEN** two indexed files share config-relative path `src/index.ts`
- **WHEN** `specd graph impact --file…
- Scenario: code-graph:composition — Provider normalizes file selectors: - **WHEN** `resolveFileSelector()` is called with a project-relative path
- **THEN** it resolves correctly to…

#### Search / ranking semantics

- Requirement: cli:graph-search — Command signature: ```text
  specd graph search <query> [--symbols] [--specs] [--documents] [--kind <kinds>] [--file <path>] [--wo…
- Constraint: cli:graph-search — - The CLI does not contain search logic — it delegates to `CodeGraphProvider.searchSymbols`, `CodeGraphProvid…
- Scenario: cli:graph-search — Text output groups document results separately: - **GIVEN** document search returns one or more matching documents
- **WHEN** `specd graph search "Change"` i…
- Scenario: code-graph:graph-store — Exact Document Path match is prioritized first: - **GIVEN** a document with path `root:package.json`
- **AND** a search query `root:package.json`
- **WHEN**…

#### Discovery / indexing / fingerprinting

- Requirement: cli:graph-index — Indexing behaviour: The command uses the shared graph CLI context model together with `withProvider`, which manages the `CodeGrap…
- Constraint: cli:graph-index — - The CLI does not contain indexing logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)`…
- Scenario: cli:graph-index — graph index flags documented: - **WHEN** the `### graph index` subsection is read
- **THEN** `--exclude-path`, `--force`, `--config`, `--pa…
- Scenario: cli:graph-stats — Explicit path enters bootstrap mode: - **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph stats --path /tmp/repo…

#### Workspace / ownership rules

- Requirement: core:list-workspaces — ProjectWorkspace entity properties: Each `ProjectWorkspace` entity MUST include the following immutable properties derived from the project confi…
- Constraint: core:list-workspaces — - The use case MUST NOT modify the configuration or the repository states.
- The `ProjectWorkspace` entity SH…
- Scenario: core:list-workspaces — Entity contains all mandatory fields: - **WHEN** a `ProjectWorkspace` is returned by the orchestrator
- **THEN** it includes `name`, `codeRoot`, `i…
- Scenario: core:workspace — ReadOnly workspace blocks direct spec writes: - **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `save()` or `saveMet…

#### Implementation / testing constraints

- Requirement: default:\_global/architecture — Composition layer for use-case wiring: Each package with business logic may have a `composition/` layer above `infrastructure/`. This layer is the o…
- Constraint: default:\_global/architecture — - In any package with business logic, `domain/` must not import from `application/`, `infrastructure/`, or `c…
- Scenario: default:\_global/architecture — Application imports infrastructure directly: - **WHEN** a use case imports a concrete adapter instead of the port interface
- **THEN** the TypeScript comp…
- Scenario: default:\_global/conventions — Repository list does not load content: - **WHEN** `SpecRepository.list()` is called
- **THEN** it returns `Spec` objects with filenames but no artif…

### High-signal spec excerpts

#### Direct scope (6)

- code-graph:indexer: Source files change constantly and the code graph must be kept in sync without re-parsing the entire workspace every time. The indexer orchestrates the pipeline from file discovery through parsing to graph storage, usin…
  - Requirement: Multi-workspace file discovery — The indexer SHALL discover files from two sources:
    **1. Workspace Discovery**
    For each `ProjectWorkspace` provided in options:
- Resolve one effective exclusion set composed of global `graph.excludePaths`, repository-derived spec-root exclusions, and the workspace's `excludePaths`
- Call `discoverFiles` on `codeRoot`, filtered by the workspace's `allowedPaths` (if configured)
- Prefix each path with `{workspaceName}:`
- Diff against the store filtered by workspace prefix
  **2. Project-Global Discovery**
- Call `dis…
  - Scenario: Filesystem-backed spec roots are excluded from document discovery — - **GIVEN** a workspace repository exposes a filesystem-backed `specsPath`
- **WHEN** the indexer discovers files and documents
- **THEN** files under that spec root are excluded from file/document discovery
- **AND** they are indexed only through spec indexing
- code-graph:workspace-integration: `@specd/code-graph` must integrate with specd's multi-workspace system to index code and specs from each workspace individually, while storing everything in a single graph database. This enables cross-workspace impact a…
  - Requirement: FileNode path and workspace semantics — All node identities (Files and Documents) SHALL be globally unique by prefixing the owning workspace name to the relative path:
- **Workspace Identity**: `{workspaceName}:{relativeToCodeRoot}` (e.g. `core:src/index.ts`).
- **Root Identity**: `root:{projectRelativePath}` (e.g. `root:docs/adr/0001.md`).
  `root` is a reserved namespace for files discovered via project-global `graph.includePaths` that are not owned by any specific workspace.
  If a physical file falls under a configured workspace `codeRoot`, the workspac…
  - Scenario: Absolute selector normalizes to configRelativePath before lookup — - **GIVEN** the active `specd.yaml` lives at `/project/specd.yaml`
- **AND** file `core:src/index.ts` is indexed with `configRelativePath` `packages/core/src/index.ts`
- **WHEN** a CLI command resolves `/project/packages/core/src/index.ts`
- **THEN** it normalizes the absolute path to `packages/core/src/index.ts`
- **AND** resolves the canonical file `core:src/index.ts`
- cli:graph-impact: search and ranking semantics; selector normalization and path handling; indexing and discovery configuration; workspace orchestration and ownership rules; repository semantics and metadata/count integration; implementation architecture constraints
  - Requirement: Command signature — ```text
    specd graph impact [--file <paths...>] [--symbol <name>] [--spec <id>] [--direction dependents|dependencies|upstream|downstream|both] [--depth <n>] [--config <path> | --path <path>] [--format text|json|toon]

```
Exactly one of `--file`, `--symbol`, or `--spec` must be provided.
- `--file` — analyze impact of one or more files. Each path MAY be workspace-prefixed, config-relative, or absolute.
- `--symbol` — analyze impact of a symbol by name. If multiple symbols match, all are analyzed and results listed
-…
  - Scenario: Ambiguous unprefixed selector fails with canonical matches — - **GIVEN** two indexed files share config-relative path `src/index.ts`
- **WHEN** `specd graph impact --file src/index.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr lists the matching canonical workspace-prefixed files
- cli:graph-index: search and ranking semantics; document indexing and namespace rules; indexing and discovery configuration; workspace orchestration and ownership rules; repository semantics and metadata/count integration; implementation architecture constraints; verification constraints for indexing/storage changes
  - Requirement: Indexing behaviour — The command uses the shared graph CLI context model together with `withProvider`, which manages the `CodeGraphProvider` lifecycle and registers `SIGINT`/`SIGTERM` signal handlers for graceful shutdown.
The command:
1. Validates that `--config` and `--path` are not both present
2. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
3. In configured mode, obtains the orchestrated project structure via `ListWorkspaces` and uses the rich `Pro…
  - Scenario: graph index flags documented — - **WHEN** the `### graph index` subsection is read
- **THEN** `--exclude-path`, `--force`, `--config`, `--path`, and `--format` are documented with descriptions
- **AND** project-global `graph.includePaths`, global `graph.excludePaths`, and workspace `graph.respectGitignore` / `graph.allowedPaths` behavior are explained
- **AND** the bootstrap-only nature of `--path` and no-config fallback is stated
- code-graph:document-model: The code graph traditionally focuses on parser-recognized source code and symbol semantics, but a complete project includes valuable textual information in non-code files such as documentation (ADRs, guides), configurat…
  - Requirement: DocumentNode properties — A `DocumentNode` SHALL represent a textual non-code project resource. It MUST include the following properties:
- `path` — the unique identifier for the node (e.g., `core:docs/adr/0001.md` or `root:package.json`)
- `configRelativePath` — the path relative to the project root used for UI rendering
- `contentHash` — SHA-256 hash of the content used for incremental indexing
- `content` — the raw textual content used for full-text search
- `workspace` — the owning workspace name, or `root` for project-global documents
  - Scenario: Workspace-owned file is not duplicated as root document — - **GIVEN** a file under a configured workspace `codeRoot`
- **AND** it also matches a project-global `graph.includePaths` pattern
- **WHEN** indexing runs
- **THEN** it is indexed only under the workspace-owned identity
- **AND** no duplicate `root:` document is created
- core:spec-repository-port: Use cases need to read and write specs without knowing how or where they are stored on disk, so a port boundary is essential for testability and storage-strategy independence. `SpecRepository` is the application-layer p…
  - Requirement: Filesystem-backed specs capability — A `SpecRepository` implementation whose source of truth lives on a local or mounted filesystem MUST expose its canonical `specsPath` as an absolute path.
This capability exists so application services and graph indexers can reason about the physical root that owns the repository's spec directories without depending on adapter-specific sidecar layout.
Repositories that are not backed by a directly addressable filesystem MUST NOT be required to expose `specsPath`.
When `specsPath` is exposed:
- it MUST identify the…
  - Scenario: Count returns total spec size — - **GIVEN** a workspace with a known number of specs
- **WHEN** `SpecRepository.count()` is called
- **THEN** it returns an integer equal to the number of specs in the workspace

#### Filtered context (5)

- code-graph:language-adapter: Different programming languages have fundamentally different syntax for functions, classes, imports, and calls. The code graph needs a pluggable abstraction that extracts symbols and relations from source files without…
  - Requirement: Import specifier resolution — `LanguageAdapter` MAY provide optional methods for resolving import specifiers to file paths. This moves all language-specific resolution logic out of the indexer:
- **`resolvePackageFromSpecifier?(specifier: string, knownPackages: string[]): string | undefined`** — given a non-relative import specifier and the list of known package names, returns which package the specifier refers to. Each language has its own rules:
| Language   | Specifier example                | Package extraction rule…
  - Scenario: Adapter without getPackageIdentity — - **GIVEN** an adapter that does not implement `getPackageIdentity`
- **WHEN** the indexer queries it for a workspace's package identity
- **THEN** it returns `undefined` and cross-workspace resolution is skipped for that language
- code-graph:staleness-detection: The code graph powers impact analysis, search, and hotspot detection — but there is no way to know whether it reflects the current state of the codebase. Users and agents can operate on stale data without realising it,…
  - Requirement: Derivation mismatch policy — Commands that read from the graph (e.g. `graph stats`, `graph search`, `graph impact`, `graph hotspots`) SHALL surface derivation-mismatch metadata when it is known, but they SHALL NOT silently reinterpret a mismatched graph as fresh.
`graph index` is the repair path for derivation mismatch. When indexing detects that the persisted graph fingerprint differs from the current fingerprint, it SHALL either:
- recreate the active graph and perform a full rebuild while printing a visible reason, or
- fail with a clear m…
  - Scenario: Derivation mismatch despite matching VCS ref — - **GIVEN** `lastIndexedRef` is `"abc1234"`
- **AND** the current VCS ref is also `"abc1234"`
- **AND** the persisted graph fingerprint differs from the fingerprint computed for the current config and code-graph package version
- **WHEN** freshness is checked
- **THEN** VCS freshness remains fresh
- **AND** derivation freshness is reported as mismatched
- core:schema-format: Without a single declarative definition of a project's artifact workflow, every tool in the ecosystem would need to hardcode artifact types, validation rules, and AI instructions independently. A specd schema is a YAML…
  - Requirement: Artifact definition — Each entry in `artifacts` must include:
- `id` (string, required) — unique identifier within the schema, e.g. `proposal`, `specs`, `design`, `tasks`
- `scope` (`spec` | `change`, required) — declares where this artifact lives after the change is archived. `spec` means the artifact file is synced to the `SpecRepository` (e.g. `spec.md`, `verify.md` — files that become part of the project's permanent spec record). `change` means the artifact stays only in the change directory and is never synced (e.g. `proposal.md`,…
  - Scenario: count min rejects too few matching delta entries — - **GIVEN** a `deltaValidations` rule with `count: { min: 2 }`
- **AND** only one delta entry matches its selector
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** `ValidateArtifacts` records a validation failure for the count mismatch
- code-graph:traversal: Once a code graph is built, developers need to answer questions like "what breaks if I change this function?" and "what does this function depend on?" Traversal operations walk the graph to compute blast radius, find ca…
  - Requirement: Impact analysis — `analyzeImpact(store: GraphStore, target: string, direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<ImpactResult>` SHALL compute the blast radius of modifying the target symbol. The optional `maxDepth` parameter (default: 3) controls how deep the traversal goes — it is passed through to `getUpstream`/`getDownstream` and limits the IMPORTS BFS loop.
The function produces an `ImpactResult` containing:
- **`target`** — the symbol being analyzed
- **`directDependents`** — count of depth-1 resu…
  - Scenario: custom maxDepth limits traversal — - **GIVEN** a call chain of depth 5
- **WHEN** `analyzeImpact(store, target.id, 'upstream', 5)` is called
- **THEN** symbols up to depth 5 are included in `affectedSymbols`
- **AND** `transitiveDependents` counts depths 3 through 5
- core:spec-lock: Archived specs need a durable sidecar that preserves spec identity, persisted dependencies, and implementation traceability independently of metadata regeneration or graph re-indexing. `spec-lock.json` is that sidecar:…
  - Requirement: Archive-time materialization — `spec-lock.json` SHALL be written or updated only by archive-time materialization and explicit integrity-maintenance flows.
Archive-time materialization MUST:
- read raw project-relative implementation paths from the active change state
- validate that each linked file belongs to the workspace implied by the archived `specId`
- ignore entries whose raw file path falls under that workspace's `graph.excludePaths`
- discard entries that cannot be normalized into a valid `workspace:path` identity
- fail archive when a…
  - Scenario: Excluded path is ignored during materialization — - **GIVEN** a confirmed raw implementation link falls under the target workspace `graph.excludePaths`
- **WHEN** archive materializes implementation links
- **THEN** that link is skipped for `spec-lock.json`
- **AND** archive does not fail solely because of that excluded path
```
