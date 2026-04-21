# Changelog

## 0.1.0

### Minor Changes

- 7ac27d1: 20260418- - plugin-system-phase-1: Phase 1 introduces the plugin-based agent architecture and migrates the CLI and core flows from skills-manifest management to plugin lifecycle management. It adds the plugin-manager package, agent plugin packages (Claude/Copilot/Codex), canonical skills template/repository infrastructure, and new plugins install/list/show/update/uninstall command flows, including project init/update integration. The change also updates documentation, hooks, tests, and config persistence so plugin declarations in specd.yaml become the authoritative installation source.

  Modified packages:
  - @specd/cli
  - @specd/core
  - @specd/plugin-agent-claude
  - @specd/plugin-agent-copilot
  - @specd/plugin-agent-codex
  - @specd/plugin-manager
  - @specd/skills

  Specs affected:
  - `cli:cli/plugins-install`
  - `cli:cli/plugins-list`
  - `cli:cli/plugins-show`
  - `cli:cli/plugins-update`
  - `core:core/config`
  - `core:core/config-writer-port`
  - `cli:cli/project-init`
  - `cli:cli/project-update`
  - `cli:cli/plugins-uninstall`
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-manager:install-plugin-use-case`
  - `plugin-manager:uninstall-plugin-use-case`
  - `plugin-manager:update-plugin-use-case`
  - `plugin-manager:list-plugins-use-case`
  - `plugin-manager:load-plugin-use-case`
  - `plugin-manager:plugin-repository-port`
  - `plugin-manager:specd-plugin-type`
  - `plugin-manager:agent-plugin-type`
  - `plugin-manager:plugin-errors`
  - `plugin-manager:plugin-loader`
  - `skills:skill`
  - `skills:skill-bundle`
  - `skills:skill-repository`
  - `skills:list-skills`
  - `skills:get-skill`
  - `skills:resolve-bundle`
  - `skills:skill-repository-port`
  - `skills:skill-repository-infra`
  - `skills:skill-templates-source`

- 9225d20: 20260421 - complete-agent-plugins-codex-copilot-open-code: Replace stub Codex and Copilot agent plugins with real install/uninstall behavior at parity with Claude, create a new Open Code plugin package following the same architecture, update CLI wizard and metapackage wiring, and expand the skills template source spec to cover all four runtimes' frontmatter contracts.

  Modified packages:
  - @specd/plugin-agent-codex
  - @specd/plugin-agent-copilot
  - @specd/skills
  - @specd/cli

  Specs affected:
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `skills:skill-templates-source`
  - `plugin-agent-opencode:plugin-agent`
  - `cli:cli/project-init`
  - `specd:meta-package`

### Patch Changes

- 4b28916: 20260417- - change-edit-description: Implements the --description option in the specd change edit command, which was documented in the spec but never implemented. Adds description field to EditChangeInput, updateDescription() method to the Change entity, and modifies EditChange.execute() to persist the description without invalidating the change.

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/change-edit`
  - `core:core/edit-change`
  - `core:core/change`

- 026650f: 20260418- - add-archived-name-template-variable: Formalize change.archivedName as an officially supported template variable for archived-change flows (post-archive hooks, changeset generation). Updates run-step-hooks and template-variables specs to document the variable contract.

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/run-step-hooks`
  - `core:core/template-variables`

- 58c75d9: Add `Bash(specd *)` to frontmatter allowed-tools and add specd graph support.
  - Add `Bash(specd *)` to all .opencode/skills SKILL.md frontmatter
  - Use specd CLI commands for code analysis:
    - `specd spec list` and `specd spec show` for reading specs
    - `specd graph search`, `specd graph impact`, `specd graph stats` for code analysis
  - Add guardrails to specd and specd-new skills preventing code writes
  - Update single spec mode to use `workspace:path` format instead of `specs/` paths

- 58f8092: 20260418- - fix-metadata-workspace-prefix: Fix metadata storage path to include workspace name — metadata should be stored at .specd/metadata/<workspace>/<prefix>/<spec> not just .specd/metadata/<prefix>/<spec>

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/spec-metadata`

- 99f23ff: 20260418 - fix-spec-overlap-conflict: Fixes corrupted manifest error when reading changes with `spec-overlap-conflict` invalidation cause. The `INVALIDATED_CAUSES` array in `change-repository.ts` was missing the `'spec-overlap-conflict'` value, causing `change list` and other commands to fail with "Corrupted manifest: invalid invalidated cause in manifest". Also updates the `core:core/change` spec documentation to include `spec-overlap-conflict` in the list of valid invalidation causes.

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change`

- 7942039: 20260418- - remove-archived-change-workspace: Remove redundant workspace field from ArchivedChange entity and archive index

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/archive-change`

- f70f882: 20260419- - refactor-async-spec-reference-resolution: This change refactors spec-reference normalization so metadata extraction can use repository-backed resolution asynchronously without coupling to filesystem-specific path math. It updates the extraction pipeline to await transform callbacks end-to-end and injects a shared cross-workspace resolver runtime that normalizes escaped references like ../../\_global/architecture/spec.md to default:\_global/architecture. The same awaited resolver path is applied consistently across GenerateSpecMetadata and metadata-fallback flows used by compile-context, project-context, and artifact validation.

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/content-extraction`
  - `core:core/generate-metadata`
  - `core:core/spec-repository-port`

- 80dbaaf: 20260420 - context-display-mode-config: Add configurable context display modes (list, summary, full, hybrid) to replace lazy/full tier model

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/compile-context`
  - `core:core/config`
  - `cli:cli/change-context`
  - `core:core/get-project-context`
  - `core:core/get-spec-context`
  - `cli:cli/project-context`
  - `cli:cli/spec-context`

- 0109e6d: 20260420 - fix-agent-plugin-type-check: The `isAgentPlugin` type guard now validates that `plugin.type === 'agent'` in addition to checking for `install` and `uninstall` methods, ensuring runtime consistency with the `AgentPlugin` interface definition.

  Modified packages:
  - @specd/plugin-manager

  Specs affected:
  - `plugin-manager:plugin-loader`

- 5215349: 20260420- - plugin-type-validation: Add plugin type validation to plugin-manager. Derive PluginType from PLUGIN_TYPES const array, add isSpecdPlugin and isAgentPlugin type guards to domain, and verify AgentPlugin in use cases before install/uninstall to prevent runtime errors with unknown plugin types.

  Modified packages:
  - @specd/plugin-manager

  Specs affected:
  - `plugin-manager:specd-plugin-type`
  - `plugin-manager:agent-plugin-type`
  - `plugin-manager:install-plugin-use-case`
  - `plugin-manager:uninstall-plugin-use-case`
  - `plugin-manager:update-plugin-use-case`
  - `plugin-manager:plugin-loader`

- 4dd5db8: 20260421 - move-change-locks-to-config-tmp: Move change lock directories under configPath/tmp instead of the storage root.

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change-repository-port`
  - `core:core/storage`
  - `core:core/config`
  - `core:core/repository-port`

- aa2e957: 20260421 - plugin-manifest-version: Add version field to plugin manifests, read version from manifest in plugin factories, remove hardcoded versions from plugin classes, add sync script to build pipeline

  Modified packages:
  - @specd/plugin-manager
  - @specd/plugin-agent-claude
  - @specd/plugin-agent-copilot
  - @specd/plugin-agent-codex

  Specs affected:
  - `plugin-manager:plugin-loader`
  - `plugin-manager:specd-plugin-type`
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`

- Updated dependencies [4b28916]
- Updated dependencies [026650f]
- Updated dependencies [58c75d9]
- Updated dependencies [58f8092]
- Updated dependencies [99f23ff]
- Updated dependencies [7ac27d1]
- Updated dependencies [7942039]
- Updated dependencies [f70f882]
- Updated dependencies [80dbaaf]
- Updated dependencies [0109e6d]
- Updated dependencies [5215349]
- Updated dependencies [9225d20]
- Updated dependencies [4dd5db8]
- Updated dependencies [aa2e957]
  - @specd/cli@0.1.0
  - @specd/core@0.1.0
  - @specd/plugin-agent-claude@0.1.0
  - @specd/skills@0.1.0
  - @specd/plugin-agent-copilot@0.1.0
  - @specd/plugin-agent-codex@0.1.0
  - @specd/plugin-manager@0.1.0
  - @specd/code-graph@0.0.3
  - @specd/plugin-agent-opencode@0.0.2

# @specd/specd

## 0.0.2

### Patch Changes

- ## Initial Alpha Release

  specd is a spec-driven development platform built as a TypeScript pnpm monorepo with hexagonal architecture.

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

  ### Technical Stack
  - TypeScript with strict mode
  - pnpm monorepo with workspaces
  - ESM modules
  - tree-sitter for code parsing
  - SQLite for graph storage
  - YAML for schema format
  - Zod for validation

  ### Repository Structure

  ```
  specd/
  ├── packages/
  │   ├── core/          # @specd/core (79 specs)
  │   ├── cli/           # @specd/cli (54 specs)
  │   ├── code-graph/    # @specd/code-graph (11 specs)
  │   ├── skills/        # @specd/skills
  │   ├── schema-std/    # @specd/schema-std
  │   ├── mcp/           # @specd/mcp
  │   ├── public-web/    # @specd/public-web (2 specs)
  │   └── plugins/       # plugin stubs
  ├── specs/
  │   ├── _global/      # 8 global specs
  │   ├── core/          # 79 core specs
  │   ├── cli/           # 54 cli specs
  │   └── code-graph/    # 11 code-graph specs
  └── docs/              # documentation
  ```

  ### Getting Started

  ```bash
  # Create a new change
  specd change create my-feature

  # Release
  pnpm release:version
  pnpm release:publish
  ```

  Full documentation at: https://getspecd.dev

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

- Add --artifact flag to change validate for single-artifact validation

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/validate-artifacts`
  - `cli:cli/change-validate`

- Fix \_deriveFileStatus to apply preHashCleanup before comparing hashes

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/storage`

- Fix markdown delta merge so archive preserves inline formatting and list markers

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/archive-change`
  - `core:core/artifact-parser-port`
  - `core:core/artifact-ast`
  - `core:core/delta-format`

- Allow transitioning from archivable back to designing, invalidating approvals

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/transition-change`

- Fix step validation to accept schema workflow step names, not just change states

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/get-hook-instructions`
  - `core:core/run-step-hooks`
  - `core:core/archive-change`

- Invalidation should only reset the drifted artifact and its downstream dependents, not all artifacts

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change`
  - `core:core/change-repository-port`
  - `core:core/validate-artifacts`

- Enrich GetStatus with lifecycle context (transitions, blockers, approvals, nextArtifact, changePath) so consumers can drive the lifecycle with a single call

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/get-status`
  - `cli:cli/change-status`

- Add description, output, and hasTaskCompletionCheck to schema show JSON output so skills can be schema-agnostic

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/schema-show`
  - `core:core/schema-format`
  - `core:core/get-artifact-instruction`
  - `cli:cli/change-artifact-instruction`

- config show must serialize all SpecdConfig fields — currently omits workflow, schemaOverrides, context, contextIncludeSpecs, contextExcludeSpecs, llmOptimizedContext, schemaPlugins, artifactRules

  Modified packages:
  - @specd/cli

  Specs affected:
  - `cli:cli/config-show`

- Fix schemaOverrides hook format normalization and remove redundant top-level workflow from config

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/resolve-schema`
  - `core:core/run-step-hooks`
  - `core:core/get-hook-instructions`
  - `core:core/config`
  - `core:core/kernel`

- change edit --remove-spec leaves orphan scaffold directories

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/edit-change`
  - `core:core/change-repository-port`

- Introduce a lazy SchemaProvider port so all use cases get the fully resolved schema (with plugins and overrides) instead of calling SchemaRegistry directly

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/kernel`
  - `core:core/run-step-hooks`
  - `core:core/transition-change`
  - `core:core/get-status`
  - `core:core/get-hook-instructions`
  - `core:core/validate-artifacts`
  - `core:core/compile-context`
  - `core:core/archive-change`
  - `core:core/get-artifact-instruction`
  - `core:core/approve-spec`
  - `core:core/approve-signoff`
  - `core:core/get-project-context`
  - `core:core/validate-specs`
  - `core:core/generate-metadata`

- Fix post-archive phase: RunStepHooks and GetHookInstructions fail with CHANGE_NOT_FOUND after ArchiveChange moves the change to archive

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/run-step-hooks`
  - `core:core/get-hook-instructions`
  - `core:core/archive-repository-port`

- Add --all flag to change validate for batch validation of all specIds

  Modified packages:
  - @specd/cli

  Specs affected:
  - `cli:cli/change-validate`

- Add --all and --force-all flags to spec generate-metadata for batch regeneration

  Modified packages:
  - @specd/cli

  Specs affected:
  - `cli:cli/spec-generate-metadata`

- Extract SchemaRepository port from SchemaRegistry to follow the repository pattern used by SpecRepository and ChangeRepository (issue [#32](https://github.com/specd-sdd/SpecD/issues/32))

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/schema-registry-port`
  - `core:core/schema-repository-port`

- Add no-op delta operation and description field to unblock scope:spec artifacts that don't need changes

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/delta-format`
  - `core:core/artifact-parser-port`
  - `core:core/validate-artifacts`

- Separate metadata from spec artifacts in SpecRepository — add dedicated metadata()/saveMetadata() methods, move metadata to .specd/specs/, update all call sites

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/spec-repository-port`
  - `core:core/spec-metadata`
  - `default:_global/spec-layout`
  - `core:core/save-spec-metadata`
  - `core:core/invalidate-spec-metadata`
  - `core:core/compile-context`
  - `core:core/list-specs`
  - `core:core/get-spec-context`
  - `cli:cli/spec-metadata`
  - `cli:cli/spec-generate-metadata`
  - `cli:cli/spec-write-metadata`
  - `cli:cli/spec-invalidate-metadata`
  - `core:core/config`
  - `core:core/config-loader`

- Clean up orphaned specDependsOn entries when specs are removed from specIds via updateSpecIds

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change`

- ArchiveChange skips new specs when artifact has delta:true — only looks for .delta.yaml, never falls back to primary file

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/archive-change`

- TransitionChange executes post hooks for the target step instead of the source step — post hooks should run for the state being left, not the state being entered

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/transition-change`
  - `cli:cli/change-transition`

- Split CompileContext into two tiers: full injection for active specs, catalogue-only for background context specs, with on-demand CLI loading. Add contextMode config field.

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/change-context`
  - `cli:cli/project-context`
  - `core:core/get-project-context`
  - `core:core/compile-context`
  - `core:core/config`

- Switch metadata files from YAML to JSON format (ADR-0019)

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/spec-metadata`
  - `core:core/spec-repository-port`
  - `core:core/save-spec-metadata`
  - `core:core/invalidate-spec-metadata`
  - `core:core/archive-change`
  - `cli:cli/spec-write-metadata`

- Add ID uniqueness validation for validations, deltaValidations, rules, preHashCleanup, and metadataExtraction arrays

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:build-schema`
  - `core:schema-format`

- Derive task completion checks from schema automatically during transitions

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/transition-change`
  - `core:core/change`
  - `core:core/workflow-model`

- Add changePath to change create output so agents know where to write artifacts

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/create-change`
  - `cli:cli/change-create`

- Remove null return from SchemaProvider and propagate schema errors instead of swallowing them

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/kernel`
  - `core:core/validate-specs`
  - `core:core/generate-metadata`
  - `core:core/approve-signoff`
  - `core:core/approve-spec`
  - `core:core/get-status`
  - `core:core/get-project-context`
  - `core:core/resolve-schema`

- Add specd schema validate CLI command to validate schema YAML files (active or standalone)

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/spec-validate`
  - `core:core/resolve-schema`
  - `core:core/build-schema`
  - `cli:cli/entrypoint`
  - `cli:cli/schema-validate`
  - `core:core/validate-schema`

- Add global uniqueness validation for hook IDs across all workflow steps

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/build-schema`
  - `core:core/schema-format`

- Replace hardcoded GitVcsAdapter and GitActorResolver in createKernelInternals with auto-detect factories

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/kernel`
  - `core:core/composition`

- Rename artifact rule field from 'text' to 'instruction' and add validation for missing field

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/schema-format`
  - `core:core/build-schema`
  - `core:core/parse-schema-yaml`
  - `core:core/schema-merge`

- Move task completion gating from artifact config to workflow step config via requiresTaskCompletion

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/schema-format`
  - `core:core/workflow-model`
  - `core:core/build-schema`
  - `core:core/transition-change`

- Add --next flag to change transition command that auto-advances to the next lifecycle step

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/change-transition`
  - `core:core/transition-change`

- Global --config flag, remove --hide-banner, banner in help, improve command descriptions, rename project overview to dashboard, auto-show dashboard on bare invocation

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/entrypoint`
  - `cli:cli/project-overview`
  - `core:core/config-loader`

- Enforce readOnly workspace ownership — block spec and code modifications at change create/edit, archive, and SpecRepository levels with clear error messages

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/workspace`
  - `core:core/spec-repository-port`
  - `core:core/archive-change`
  - `cli:cli/change-create`
  - `cli:cli/change-edit`
  - `core:core/repository-port`

- Early detection and warning when multiple active changes target the same spec

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/kernel`
  - `core:core/archive-change`
  - `core:core/spec-overlap`
  - `cli:cli/change-overlap`

- Materialized delta view in CompileContext and spec preview command (issue [#21](https://github.com/specd-sdd/SpecD/issues/21) levels 1-2)

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/compile-context`
  - `core:core/preview-spec`
  - `cli:cli/change-spec-preview`

- Fix schema fork to use the kernel's schema registry instead of building its own, and respect default schemasPath when workspace doesn't explicitly configure one (issue [#50](https://github.com/specd-sdd/SpecD/issues/50))

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/schema-fork`
  - `cli:cli/schema-extend`
  - `core:core/config`

- Add [ref] positional arg to schema show/validate and --file to schema show, enabling resolution of any schema by reference or path

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/schema-show`
  - `cli:cli/schema-validate`
  - `core:core/validate-schema`
  - `core:core/get-active-schema`

- Make schema show display the complete merged schema by default, add --templates to include template content, and add --raw to show unresolved schema YAML

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/schema-show`
  - `core:core/get-active-schema`

- Add per-workspace graph.excludePaths (gitignore-syntax) and graph.respectGitignore to workspace config, replacing hardcoded EXCLUDED_DIRS

  Modified packages:
  - @specd/core
  - @specd/code-graph
  - @specd/cli

  Specs affected:
  - `core:core/config`
  - `code-graph:code-graph/indexer`
  - `code-graph:code-graph/workspace-integration`
  - `cli:cli/graph-index`

- Unify change archive hook skipping with change transition

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/hook-execution-model`
  - `cli:cli/change-archive`
  - `core:core/archive-change`

- add language-agnostic inheritance and implementation relations to the code graph and propagate them through indexing, traversal, and hotspot analysis

  Modified packages:
  - @specd/code-graph

  Specs affected:
  - `code-graph:code-graph/symbol-model`
  - `code-graph:code-graph/language-adapter`
  - `code-graph:code-graph/traversal`
  - `code-graph:code-graph/hotspots`
  - `code-graph:code-graph/indexer`
  - `code-graph:code-graph/database-schema`
  - `code-graph:code-graph/graph-store`

- Define graph CLI context resolution for --config/--path/cwd/no-config flows and normalize multi-kind filtering

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/graph-hotspots`
  - `cli:cli/graph-index`
  - `cli:cli/graph-search`
  - `cli:cli/graph-stats`
  - `cli:cli/graph-impact`
  - `core:core/config`

- Reduce file-import dominance in hotspot symbol ranking

  Modified packages:
  - @specd/code-graph
  - @specd/cli

  Specs affected:
  - `code-graph:code-graph/hotspots`
  - `cli:cli/graph-hotspots`

- Extend the PHP language adapter to capture require/include dependencies, framework dynamic loaders (CakePHP, CodeIgniter, Yii, Zend, Drupal), and PSR-4 namespace resolution

  Modified packages:
  - @specd/code-graph

  Specs affected:
  - `code-graph:code-graph/language-adapter`
  - `code-graph:code-graph/indexer`

- Broaden PHP CALLS extraction for CakePHP and related loader patterns

  Modified packages:
  - @specd/code-graph

  Specs affected:
  - `code-graph:code-graph/language-adapter`

- Align code-graph specs with the current indexer, graph-store, and PHP language-adapter behaviour.

  Modified packages:
  - @specd/code-graph
  - @specd/core
  - @specd/cli

  Specs affected:
  - `code-graph:code-graph/indexer`
  - `code-graph:code-graph/graph-store`
  - `code-graph:code-graph/language-adapter`
  - `core:core/config`
  - `code-graph:code-graph/ladybug-graph-store`
  - `cli:cli/graph-search`
  - `code-graph:code-graph/database-schema`
  - `cli:cli/graph-index`
  - `cli:cli/graph-hotspots`
  - `cli:cli/graph-impact`
  - `cli:cli/graph-stats`

- Extend createKernel with additive adapter registries for storages, VCS/actor providers, parsers, and external hook runners, and expose the merged registry to consumers.

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/kernel`
  - `core:core/config`
  - `core:core/storage`
  - `core:core/schema-format`
  - `core:core/hook-execution-model`
  - `core:core/hook-runner-port`
  - `core:core/artifact-parser-port`
  - `core:core/vcs-adapter`
  - `core:core/actor-resolver`
  - `core:core/composition`
  - `core:core/kernel-builder`
  - `core:core/external-hook-runner-port`
  - `core:core/run-step-hooks`
  - `cli:cli/config-show`

- serialize ChangeRepository mutations to prevent concurrent lost updates

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change-repository-port`
  - `core:core/validate-artifacts`
  - `core:core/edit-change`
  - `core:core/draft-change`
  - `core:core/restore-change`
  - `core:core/discard-change`
  - `core:core/approve-spec`
  - `core:core/approve-signoff`
  - `core:core/skip-artifact`
  - `core:core/transition-change`
  - `core:core/update-spec-deps`
  - `core:core/archive-change`

- Add --fingerprint flag to change context so agents can detect unchanged context and skip re-reading

  Modified packages:
  - @specd/cli
  - @specd/core

  Specs affected:
  - `cli:cli/change-context`
  - `core:core/compile-context`

- Add metadataExtraction validation to ValidateArtifacts to verify extraction works on merged preview

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/validate-artifacts`
  - `cli:cli/change-validate`

- Add a SQLite-backed code graph store with internal backend selection and switch the default away from Ladybug once SQLite reaches parity.

  Modified packages:
  - @specd/code-graph
  - @specd/core

  Specs affected:
  - `code-graph:code-graph/graph-store`
  - `code-graph:code-graph/ladybug-graph-store`
  - `code-graph:code-graph/composition`
  - `core:core/kernel`
  - `core:core/kernel-builder`
  - `code-graph:code-graph/sqlite-graph-store`

- habilitar transforms con contexto en la extraccion de metadata desde artifacts y eliminar la logica especial de dependsOn

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/content-extraction`
  - `core:core/schema-format`
  - `core:core/generate-metadata`
  - `core:core/validate-artifacts`
  - `core:core/compile-context`
  - `core:core/get-project-context`
  - `default:_global/spec-layout`

- anadir un estado drifted para artifacts y exponer que artifact/spec provoco la invalidacion

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/change`
  - `core:core/change-repository-port`
  - `core:core/get-status`
  - `core:core/validate-artifacts`
  - `cli:cli/change-status`
  - `cli:cli/change-artifacts`
  - `core:core/change-manifest`
  - `core:core/transition-change`
  - `core:core/workflow-model`
  - `core:core/kernel`

- Fix compiled context completeness and expose fingerprint plus mode in CLI output

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/compile-context`
  - `cli:cli/change-context`
  - `default:_global/docs`

- Block drafting or discarding a change once it has ever reached implementing, unless the caller explicitly forces it, to avoid leaving code/specs out of sync.

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/change`
  - `core:core/draft-change`
  - `core:core/discard-change`
  - `cli:cli/change-draft`
  - `cli:cli/change-discard`

- When a change is already in designing and transitions to designing again, artifacts should not be invalidated. Invalidation only makes sense when returning from a later state. Fix excludes designing as an origin state alongside drafting.

  Modified packages:
  - @specd/core

  Specs affected:
  - `core:core/change`
  - `core:core/transition-change`

- When archiving with --allow-overlap, overlapping changes are invalidated with a new spec-overlap-conflict cause, rolled back to designing with a message identifying the archived change and overlapping specs. ReviewSummary.reason and change status output are extended to surface this cause.

  Modified packages:
  - @specd/core
  - @specd/cli

  Specs affected:
  - `core:core/change`
  - `core:core/archive-change`
  - `core:core/get-status`
  - `core:core/spec-overlap`
  - `cli:cli/change-archive`
  - `cli:cli/change-status`

- Updated dependencies []:
  - @specd/core@0.0.2
  - @specd/cli@0.0.2
  - @specd/code-graph@0.0.2
  - @specd/skills@0.0.2
  - @specd/schema-std@0.0.2
  - @specd/plugin-claude@0.0.2
  - @specd/plugin-codex@0.0.2
  - @specd/plugin-copilot@0.0.2
