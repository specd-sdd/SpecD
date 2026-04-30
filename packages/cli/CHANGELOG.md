# @specd/cli

## 0.2.0

### Minor Changes

- 90da65f: 20260424 - multi-language-call-resolution: Implements issues 52 and 54 by extending code-graph dependency resolution across the current built-in language adapters with deterministic binding/call facts, shared scoped resolution, and first-class USES_TYPE / CONSTRUCTS relations. The change also removes noisy self-relations and updates graph impact CLI/docs/skills to prefer the clearer dependents / dependencies direction aliases while preserving upstream / downstream compatibility.

  Specs affected:
  - `code-graph:code-graph/language-adapter`
  - `code-graph:code-graph/indexer`
  - `code-graph:code-graph/symbol-model`
  - `cli:cli/graph-impact`
  - `skills:skill-templates-source`
  - `default:_global/docs`

- 60ea657: 20260427 - schema-artifact-hastasks: Introduced an explicit hasTasks boolean field to artifact definitions in the schema as a master switch for task tracking. Implemented semantic validation at schema load and defensive runtime checks in TransitionChange to ensure requiresTaskCompletion consistency, while providing default markdown checkbox patterns when enabled.

  Specs affected:
  - `core:core/schema-format`
  - `cli:cli/change-status`
  - `core:core/transition-change`

- c88761e: 20260428 - change-spec-preview-artifact-flag: This change adds an optional --artifact <name> flag to specd change spec-preview so reviewers can focus output on a single spec-scoped artifact such as spec.md or verify.md. The CLI now resolves artifact IDs via the active schema, filters merged/diff/json preview output accordingly, and reports consistent errors for unknown, wrong-scope, or missing artifacts.

  Specs affected:
  - `cli:cli/change-spec-preview`

- 1c1c54a: 20260428 - context-modes-ux: Adds an explicit --mode flag to context commands and aligns full/hybrid rendering behavior across project context, change context, and spec context. The implementation now defaults full-mode output to structured Description + Rules + Constraints, with section filters overriding defaults while preserving header context. Core and CLI context use cases/tests were updated to enforce consistent mode semantics and predictable context output for agents.

  Specs affected:
  - `cli:cli/project-context`
  - `cli:cli/change-context`
  - `cli:cli/spec-context`
  - `core:core/compile-context`
  - `core:core/get-spec-context`
  - `core:core/get-project-context`
  - `core:core/config`

- c558cb2: 20260430 - compact-and-complete-outlines: Implemented a compact-first outline workflow by keeping changes artifact-instruction focused on availableOutlines references and moving full structure retrieval to on-demand specs outline. Added --full and --hints modes, with parser-owned default subsets and parser-provided root-level selectorHints, reducing verbosity while preserving complete selector coverage when needed. Updated core/CLI contracts, parser adapters, tests, and workflow guidance to keep the behavior consistent across current and future parsers.

  Specs affected:
  - `cli:cli/change-artifact-instruction`
  - `core:core/get-artifact-instruction`
  - `core:core/delta-format`
  - `cli:cli/spec-outline`
  - `core:core/get-spec-outline`
  - `core:core/artifact-parser-port`
  - `skills:workflow-automation`

### Patch Changes

- c7c485e: 20260422 - fix-config-compliance: Align config behavior with current spec contracts by removing legacy artifactRules/skills handling, enforcing plugins validation at load time, and tightening workspace contextMode errors. The change also adds unknown-template warning callbacks and updates config show/docs so runtime output, verification scenarios, and documentation all reflect the same model. This closes the compliance gaps without changing the broader plugin-manager workflow.

  Specs affected:
  - `core:core/config`
  - `cli:cli/config-show`
  - `core:core/template-variables`
  - `core:core/config-writer-port`

- 27fc818: 20260423 - cli-init-alias: Add specd init as a top-level CLI alias that delegates to specd project init, giving new users a shorter, conventional command to bootstrap a project. Both invocation forms share the same handler, flags, interactive wizard, and output — no duplication needed since registerProjectInit() already parameterises the parent command.

  Specs affected:
  - `cli:cli/project-init`
  - `cli:cli/entrypoint`

- ec47a74: 20260423 - project-status-command: Add specd project status command consolidating workspace info, spec/change counts, graph freshness, and context references into one output. Enhance change status with schema-derived artifactDag and approval gates. Update skill templates to use the new command.

  Specs affected:
  - `cli:cli/project-status`
  - `cli:cli/change-status`

- c5c8f64: 20260424 - enforce-artifact-path-validation: Ensures change manifests and validation strictly target correct artifact paths (deltas vs specs) from creation time, and enhances CLI output to report explicit file paths with merged-spec preview guidance.

  Specs affected:
  - `core:core/change-layout`
  - `core:core/change-manifest`
  - `core:core/validate-artifacts`
  - `cli:cli/change-validate`

- 2064880: 20260424 - suppress-unresolved-template-variable-warnings: Remove console.warn output when {{variable}} tokens cannot be resolved during template expansion in hooks

  Specs affected:
  - `cli:cli/change-hook-instruction`

- f4aa390: 20260427 - improve-specd-diagnostics-and-ux: Rename warnings to notes, provide clear blockers in status/transition, and optimize skill diagnostic output.

  Specs affected:
  - `core:core/get-status`
  - `core:core/transition-change`
  - `cli:cli/change-status`
  - `cli:cli/change-transition`
  - `cli:cli/change-validate`
  - `skills:workflow-automation`
  - `core:core/change`

- ca5082e: 20260427 - project-status-workspace-details: Enhanced the project status command to include isExternal status and codeRoot path for every workspace. This change provides better visibility into workspace locality and implementation roots in both text and structured (JSON/TOON) formats.

  Specs affected:
  - `cli:cli/project-status`

- ef13876: 20260428 - 20260428-unified-logging-system: Introduce a structured logging system using Pino and a global proxy to minimize injection boilerplate.

  Specs affected:
  - `core:core/logger-port`
  - `cli:cli/logging-integration`
  - `core:core/pino-logger`
  - `core:core/kernel-logging`
  - `core:core/config`
  - `default:_global/logging`
  - `cli:entrypoint`

- 5f6a823: 20260428 - change-validate-blocker-diagnostics: Align change validate dependency-blocked diagnostics with change transition by reporting effective blocker status and recursive parent review blockers.

  Specs affected:
  - `cli:cli/change-validate`
  - `core:core/validate-artifacts`

- d32a861: 20260428 - pluralize-cli-resource-commands: Standardize CLI countable resource command groups to canonical plural forms (changes, specs, archives, drafts) while maintaining singular aliases for backward compatibility. This change includes a new governing policy spec (cli:cli/command-resource-naming), updates to affected CLI specs, and comprehensive updates to documentation and skill examples to ensure a consistent command vocabulary across the ecosystem.

  Specs affected:
  - `cli:cli/change-draft`
  - `cli:cli/drafts-list`
  - `cli:cli/drafts-show`
  - `cli:cli/drafts-restore`
  - `cli:cli/command-resource-naming`
  - `cli:cli/change-list`
  - `cli:cli/spec-list`
  - `cli:cli/change-archive`
  - `skills:workflow-automation`

- 2852b44: 20260428 - spec-show-artifact-flag: Added the --artifact <name> flag to the specd spec show command, allowing users to extract specific artifact content (e.g., spec.md, verify.md) by its schema-defined ID.

  Specs affected:
  - `cli:cli/spec-show`

- 873d021: 20260429 - clarify-skill-review-and-command-usage: Align workflow-skill guidance and CLI-facing contracts with the current canonical commands and artifact-focused flags so agents can avoid redundant reads while preserving deterministic safety checks. Clarify that changes validate is structural/state validation only and must not be used as semantic content approval, with explicit review expectations in skills and docs. Reinforce overlap/drift protection by requiring merged-content review patterns (including artifact-filtered preview when targeted) before archiving or accepting spec deltas.

  Specs affected:
  - `skills:workflow-automation`
  - `cli:change-validate`
  - `cli:change-spec-preview`
  - `cli:command-resource-naming`

- Updated dependencies [c7c485e]
- Updated dependencies [0103454]
- Updated dependencies [c5c8f64]
- Updated dependencies [90da65f]
- Updated dependencies [aad2115]
- Updated dependencies [f4aa390]
- Updated dependencies [60ea657]
- Updated dependencies [ef13876]
- Updated dependencies [5f6a823]
- Updated dependencies [1c1c54a]
- Updated dependencies [1bdd9b0]
- Updated dependencies [c558cb2]
- Updated dependencies [76c61c6]
  - @specd/core@0.2.0
  - @specd/code-graph@0.1.0
  - @specd/plugin-manager@0.2.0
  - @specd/plugin-agent-claude@0.2.0
  - @specd/plugin-agent-copilot@0.2.0
  - @specd/plugin-agent-codex@0.2.0
  - @specd/plugin-agent-standard@0.1.0
  - @specd/plugin-agent-opencode@0.0.3

## 0.1.1

### Patch Changes

- Updated dependencies [f9b34f8]
  - @specd/schema-std@0.1.0

## 0.1.0

### Minor Changes

- 7ac27d1: 20260418 - plugin-system-phase-1: Phase 1 introduces the plugin-based agent architecture and migrates the CLI and core flows from skills-manifest management to plugin lifecycle management. It adds the plugin-manager package, agent plugin packages (Claude/Copilot/Codex), canonical skills template/repository infrastructure, and new plugins install/list/show/update/uninstall command flows, including project init/update integration. The change also updates documentation, hooks, tests, and config persistence so plugin declarations in specd.yaml become the authoritative installation source.

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

### Patch Changes

- 4b28916: 20260417 - change-edit-description: Implements the --description option in the specd change edit command, which was documented in the spec but never implemented. Adds description field to EditChangeInput, updateDescription() method to the Change entity, and modifies EditChange.execute() to persist the description without invalidating the change.

  Specs affected:
  - `cli:cli/change-edit`
  - `core:core/edit-change`
  - `core:core/change`

- 80dbaaf: 20260420 - context-display-mode-config: Add configurable context display modes (list, summary, full, hybrid) to replace lazy/full tier model

  Specs affected:
  - `core:core/compile-context`
  - `core:core/config`
  - `cli:cli/change-context`
  - `core:core/get-project-context`
  - `core:core/get-spec-context`
  - `cli:cli/project-context`
  - `cli:cli/spec-context`

- 9225d20: 20260421 - complete-agent-plugins-codex-copilot-open-code: Replace stub Codex and Copilot agent plugins with real install/uninstall behavior at parity with Claude, create a new Open Code plugin package following the same architecture, update CLI wizard and metapackage wiring, and expand the skills template source spec to cover all four runtimes' frontmatter contracts.

  Specs affected:
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `skills:skill-templates-source`
  - `plugin-agent-opencode:plugin-agent`
  - `cli:cli/project-init`
  - `specd:meta-package`

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
  - @specd/core@0.1.0
  - @specd/plugin-agent-claude@0.1.0
  - @specd/plugin-agent-copilot@0.1.0
  - @specd/plugin-agent-codex@0.1.0
  - @specd/plugin-manager@0.1.0
  - @specd/code-graph@0.0.3
  - @specd/plugin-agent-opencode@0.0.2

## 0.0.2

### Patch Changes

- Add --artifact flag to change validate for single-artifact validation

  Specs affected:
  - `core:core/validate-artifacts`
  - `cli:cli/change-validate`

- Enrich GetStatus with lifecycle context (transitions, blockers, approvals, nextArtifact, changePath) so consumers can drive the lifecycle with a single call

  Specs affected:
  - `core:core/get-status`
  - `cli:cli/change-status`

- Add description, output, and hasTaskCompletionCheck to schema show JSON output so skills can be schema-agnostic

  Specs affected:
  - `cli:cli/schema-show`
  - `core:core/schema-format`
  - `core:core/get-artifact-instruction`
  - `cli:cli/change-artifact-instruction`

- config show must serialize all SpecdConfig fields — currently omits workflow, schemaOverrides, context, contextIncludeSpecs, contextExcludeSpecs, llmOptimizedContext, schemaPlugins, artifactRules

  Specs affected:
  - `cli:cli/config-show`

- Add --all flag to change validate for batch validation of all specIds

  Specs affected:
  - `cli:cli/change-validate`

- Add --all and --force-all flags to spec generate-metadata for batch regeneration

  Specs affected:
  - `cli:cli/spec-generate-metadata`

- Separate metadata from spec artifacts in SpecRepository — add dedicated metadata()/saveMetadata() methods, move metadata to .specd/specs/, update all call sites

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

- TransitionChange executes post hooks for the target step instead of the source step — post hooks should run for the state being left, not the state being entered

  Specs affected:
  - `core:core/transition-change`
  - `cli:cli/change-transition`

- Split CompileContext into two tiers: full injection for active specs, catalogue-only for background context specs, with on-demand CLI loading. Add contextMode config field.

  Specs affected:
  - `cli:cli/change-context`
  - `cli:cli/project-context`
  - `core:core/get-project-context`
  - `core:core/compile-context`
  - `core:core/config`

- Switch metadata files from YAML to JSON format (ADR-0019)

  Specs affected:
  - `core:core/spec-metadata`
  - `core:core/spec-repository-port`
  - `core:core/save-spec-metadata`
  - `core:core/invalidate-spec-metadata`
  - `core:core/archive-change`
  - `cli:cli/spec-write-metadata`

- Add changePath to change create output so agents know where to write artifacts

  Specs affected:
  - `core:core/create-change`
  - `cli:cli/change-create`

- Add specd schema validate CLI command to validate schema YAML files (active or standalone)

  Specs affected:
  - `cli:cli/spec-validate`
  - `core:core/resolve-schema`
  - `core:core/build-schema`
  - `cli:cli/entrypoint`
  - `cli:cli/schema-validate`
  - `core:core/validate-schema`

- Add --next flag to change transition command that auto-advances to the next lifecycle step

  Specs affected:
  - `cli:cli/change-transition`
  - `core:core/transition-change`

- Global --config flag, remove --hide-banner, banner in help, improve command descriptions, rename project overview to dashboard, auto-show dashboard on bare invocation

  Specs affected:
  - `cli:cli/entrypoint`
  - `cli:cli/project-overview`
  - `core:core/config-loader`

- Enforce readOnly workspace ownership — block spec and code modifications at change create/edit, archive, and SpecRepository levels with clear error messages

  Specs affected:
  - `core:core/workspace`
  - `core:core/spec-repository-port`
  - `core:core/archive-change`
  - `cli:cli/change-create`
  - `cli:cli/change-edit`
  - `core:core/repository-port`

- Early detection and warning when multiple active changes target the same spec

  Specs affected:
  - `core:core/kernel`
  - `core:core/archive-change`
  - `core:core/spec-overlap`
  - `cli:cli/change-overlap`

- Materialized delta view in CompileContext and spec preview command (issue [#21](https://github.com/specd-sdd/SpecD/issues/21) levels 1-2)

  Specs affected:
  - `core:core/compile-context`
  - `core:core/preview-spec`
  - `cli:cli/change-spec-preview`

- Fix schema fork to use the kernel's schema registry instead of building its own, and respect default schemasPath when workspace doesn't explicitly configure one (issue [#50](https://github.com/specd-sdd/SpecD/issues/50))

  Specs affected:
  - `cli:cli/schema-fork`
  - `cli:cli/schema-extend`
  - `core:core/config`

- Add [ref] positional arg to schema show/validate and --file to schema show, enabling resolution of any schema by reference or path

  Specs affected:
  - `cli:cli/schema-show`
  - `cli:cli/schema-validate`
  - `core:core/validate-schema`
  - `core:core/get-active-schema`

- Make schema show display the complete merged schema by default, add --templates to include template content, and add --raw to show unresolved schema YAML

  Specs affected:
  - `cli:cli/schema-show`
  - `core:core/get-active-schema`

- Add per-workspace graph.excludePaths (gitignore-syntax) and graph.respectGitignore to workspace config, replacing hardcoded EXCLUDED_DIRS

  Specs affected:
  - `core:core/config`
  - `code-graph:code-graph/indexer`
  - `code-graph:code-graph/workspace-integration`
  - `cli:cli/graph-index`

- Unify change archive hook skipping with change transition

  Specs affected:
  - `core:core/hook-execution-model`
  - `cli:cli/change-archive`
  - `core:core/archive-change`

- Define graph CLI context resolution for --config/--path/cwd/no-config flows and normalize multi-kind filtering

  Specs affected:
  - `cli:cli/graph-hotspots`
  - `cli:cli/graph-index`
  - `cli:cli/graph-search`
  - `cli:cli/graph-stats`
  - `cli:cli/graph-impact`
  - `core:core/config`

- Reduce file-import dominance in hotspot symbol ranking

  Specs affected:
  - `code-graph:code-graph/hotspots`
  - `cli:cli/graph-hotspots`

- Align code-graph specs with the current indexer, graph-store, and PHP language-adapter behaviour.

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

- Add --fingerprint flag to change context so agents can detect unchanged context and skip re-reading

  Specs affected:
  - `cli:cli/change-context`
  - `core:core/compile-context`

- Add metadataExtraction validation to ValidateArtifacts to verify extraction works on merged preview

  Specs affected:
  - `core:core/validate-artifacts`
  - `cli:cli/change-validate`

- anadir un estado drifted para artifacts y exponer que artifact/spec provoco la invalidacion

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

  Specs affected:
  - `core:core/compile-context`
  - `cli:cli/change-context`
  - `default:_global/docs`

- Block drafting or discarding a change once it has ever reached implementing, unless the caller explicitly forces it, to avoid leaving code/specs out of sync.

  Specs affected:
  - `core:core/change`
  - `core:core/draft-change`
  - `core:core/discard-change`
  - `cli:cli/change-draft`
  - `cli:cli/change-discard`

- When archiving with --allow-overlap, overlapping changes are invalidated with a new spec-overlap-conflict cause, rolled back to designing with a message identifying the archived change and overlapping specs. ReviewSummary.reason and change status output are extended to surface this cause.

  Specs affected:
  - `core:core/change`
  - `core:core/archive-change`
  - `core:core/get-status`
  - `core:core/spec-overlap`
  - `cli:cli/change-archive`
  - `cli:cli/change-status`

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
  - @specd/code-graph@0.0.2
  - @specd/skills@0.0.2
  - @specd/schema-std@0.0.2
  - @specd/plugin-claude@0.0.2
  - @specd/plugin-codex@0.0.2
  - @specd/plugin-copilot@0.0.2
