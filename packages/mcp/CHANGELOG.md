# @specd/mcp

## 0.0.4

### Patch Changes

- Updated dependencies [c7c485e]
- Updated dependencies [0103454]
- Updated dependencies [c5c8f64]
- Updated dependencies [f4aa390]
- Updated dependencies [60ea657]
- Updated dependencies [ef13876]
- Updated dependencies [5f6a823]
- Updated dependencies [1c1c54a]
- Updated dependencies [c558cb2]
  - @specd/core@0.2.0

## 0.0.3

### Patch Changes

- Updated dependencies [4b28916]
- Updated dependencies [026650f]
- Updated dependencies [58f8092]
- Updated dependencies [99f23ff]
- Updated dependencies [7ac27d1]
- Updated dependencies [7942039]
- Updated dependencies [f70f882]
- Updated dependencies [80dbaaf]
- Updated dependencies [4dd5db8]
  - @specd/core@0.1.0

## 0.0.2

### Patch Changes

- ## Initial Alpha Release

  specd is a spec-driven development platform. This release includes all packages.

  ### @specd/core

  Core domain layer with hexagonal architecture.

  #### Change Lifecycle
  - **States**: draft, designing, ready, implementing, verifying, archivable, archived, discarded
  - **Transitions**: create, edit, approve, reject, transition between states
  - **Validation**: state machine validation, transition guards, hook execution
  - **Artifact tracking**: multi-file artifacts, artifact status (pending, added, modified, drifted), drift detection
  - **Metadata**: change metadata with specIds, ownership, timestamps, author info
  - **Task completion**: derived task completion checks from schema, gating in workflow steps

  #### Schema System
  - **Schema format**: YAML schema with @specd/schema-std
  - **Schema extensions**: `extends` keyword for schema inheritance, fork/resolution chain
  - **Schema merge**: layered schema overrides, append/remove/replace operations
  - **Schema resolution**: ref resolution, schema fork handling, provider pattern
  - **Validation**: schema validation, artifact validation, step validation
  - **Id uniqueness**: validation for unique IDs in schema arrays

  #### Hook System
  - **Hook types**: pre-hooks and post-hooks per workflow step
  - **Hook execution**: shell command execution, variable substitution
  - **Template variables**: `{{change.name}}`, `{{change.archivedName}}`, `{{change.workspace}}`, `{{change.path}}`, `{{project.root}}`
  - **Hook IDs**: global uniqueness validation
  - **Error handling**: non-blocking failures, warning logging
  - **Skip hooks**: skip hooks functionality in archive operations

  #### Workflow Steps
  - **Designing**: design artifact generation, global specs compliance check
  - **Implementing**: test/lint execution hooks, artifact tracking
  - **Verifying**: verification hooks, test/lint execution
  - **Archiving**: archive hooks, changeset generation, skip hook support

  #### Archive System
  - **Archive adapters**: fs adapter with configurable pattern
  - **Archive operations**: archive, discard, restore
  - **Index management**: JSONL index file with change manifests
  - **Metadata preservation**: proposal, design, deltas, artifacts preservation
  - **Safe operations**: directory move with cleanup, empty parent directory cleanup
  - **Overlap detection**: spec overlap checking across changes, archive blocking

  #### Storage Adapters
  - **FS adapter**: file system storage for changes, drafts, archive, discarded
  - **Adapter ports**: storage adapter interface for future extensions

  #### Config System
  - **Workspaces**: multiple workspace support with prefixes and paths
  - **Storage config**: adapter configuration for changes/drafts/archive
  - **Schema overrides**: workflow, artifacts, rules overrides
  - **Approvals**: signoff and spec approval modes
  - **Context**: contextIncludeSpecs, contextExcludeSpecs, llmOptimizedContext

  #### Kernel
  - **Kernel builder**: fluent kernel composition
  - **Adapter registries**: extensible adapter registries for storage, VCS, schema
  - **Auto-detection**: automatic VCS adapter detection

  #### Domain Entities
  - **Change entity**: rich entity with state machine, invariants
  - **ArchivedChange entity**: immutable archived change representation
  - **Value objects**: changeName, artifactId, specId, workspace
  - **Domain errors**: typed error hierarchy

  #### Metadata Extraction
  - **Extractors**: metadata extraction from artifacts
  - **Transforms**: extraction transforms pipeline
  - **Validity checks**: metadata validation, schema conformance

  #### Code Graph Integration
  - **Spec repository port**: abstraction for spec resolution
  - **Graph store port**: abstraction for graph storage backends
  - **SQLite backend**: SQLite-based graph store implementation
  - **Ladybug backend**: Ladybug file-based graph store

  #### Spec Overlap Detection
  - **Overlap detection**: spec overlap checking across changes
  - **Archive blocking**: blocking gate when overlaps detected
  - **Overlap invalidation**: invalidation of affected changes on archive

  #### Drift Management
  - **Drift-aware artifacts**: artifact status with drift tracking
  - **Drifted status**: artifacts that need verification after external changes

  #### Context & Compilation
  - **Lazy context loading**: lazy loading mode for context
  - **Compiled context**: compiled context output for agent consumption
  - **Context fingerprint**: change tracking via context fingerprint

  ### @specd/cli

  Command-line interface with comprehensive subcommands.

  #### Global Flags
  - `--config`: custom config file path
  - `--json`: JSON output mode
  - `--verbose`: verbose output

  #### Change Commands
  - `change create`: create new change with proposal
  - `change edit`: edit change artifacts
  - `change status`: show change status with specIds
  - `change list`: list all changes
  - `change validate`: validate change artifacts
  - `change approve`: approve change
  - `change reject`: reject change
  - `change transition`: transition to next state
  - `change archive`: archive change with hooks
  - `change discard`: discard change
  - `change restore`: restore archived change
  - `change spec-preview`: preview spec changes
  - `change check-overlap`: check for spec overlaps
  - `--next`: use next transition flow with approval boundaries
  - `--artifact`: filter for single artifact validation

  #### Schema Commands
  - `schema show`: show schema with ref resolution
  - `schema validate`: validate schema
  - `schema list`: list all schemas
  - `--raw`: raw schema output
  - `--templates`: show schema templates
  - `[ref]`: positional argument for schema reference

  #### Spec Commands
  - `spec draft`: draft new spec
  - `spec status`: show spec status
  - `spec list`: list specs

  #### Config Commands
  - `config show`: show resolved configuration

  #### Graph Commands
  - `graph index`: index codebase to graph
  - `graph query`: query graph
  - `graph impact`: analyze change impact
  - `--exclude-path`: exclude paths from indexing
  - Context and kind filters for queries

  #### Entrypoint
  - Global config loading
  - Dashboard with change summary
  - Banner and help text

  ### @specd/code-graph

  Code graph indexing and analysis system.

  #### Indexer
  - **Language-agnostic**: tree-sitter based parser framework
  - **PHP support**: PHP language adapter with tree-sitter-php
  - **Framework detection**: Laravel, Symfony framework call detection
  - **Dynamic dependencies**: PHP dynamic dependency resolution

  #### Symbol Tracking
  - **Symbol extraction**: function, class, method, constant symbols
  - **Symbol scoring**: hotspot detection with symbol ranking
  - **Call graphs**: method calls, inheritance relations

  #### Hierarchy Relations
  - **Parent/child relations**: class inheritance, method overrides
  - **Implementation relations**: interface implementation tracking

  #### Storage Backends
  - **SQLite backend**: internal backend selection with batch writes
  - **Ladybug backend**: external Ladybug file format
  - **Graph store port**: abstraction for backend implementations

  #### CLI
  - **Indexing**: codebase indexing with progress
  - **Queries**: graph queries with symbol filtering
  - **Impact analysis**: change impact analysis with symbol scope
  - **Parallel analysis**: parallelized multi-symbol impact analysis

  ### @specd/skills

  Skill registry and shared skill definitions.

  #### Skill Registry
  - `listSkills()`: list available skills
  - `getSkill()`: get skill by name and scope

  #### Shared Skills
  - Lifecycle skill definitions
  - Scoped audit modes
  - Exploration context
  - Spec dependency tracking
  - Workspace guards

  ### @specd/schema-std

  Default YAML schema for specd projects.

  #### Schema Structure
  - Workflow steps definition
  - Artifact definitions
  - Hook definitions
  - Rule definitions
  - Metadata format
  - Context configuration

  #### Schema Components
  - **Workflow**: step sequence with hooks
  - **Artifacts**: proposal, design, specs, deltas
  - **Hooks**: pre/post hooks per step
  - **Rules**: pre/post rules per artifact
  - **Metadata**: spec metadata format
  - **Context**: contextInclude, contextExclude, llmOptimized

  ### @specd/mcp

  Model Context Protocol server adapter (stub).

  ### @specd/specd

  Metapackage tracking cross-cutting changes across all packages.

- Updated dependencies []:
  - @specd/core@0.0.2
