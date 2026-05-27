# Kernel

## Purpose

Consumers of `@specd/core` need a single, stable entry point that exposes every use case without requiring knowledge of internal wiring or adapter construction. The kernel serves this role: it assembles all use cases from a resolved `SpecdConfig` and exposes them as a typed object grouped by domain area. Delivery mechanisms (CLI, MCP, plugins) consume use cases exclusively through the kernel interface, which defines the contract between `@specd/core` and its consumers.

## Requirements

### Requirement: Kernel interface groups use cases by domain area

The `Kernel` interface organises use cases into three groups that mirror the domain areas of the platform:

- `changes` — use cases that operate on change lifecycle (create, transition, draft, restore, discard, archive, validate, compile context, list, edit, skip artifact, update spec deps, list drafts, list discarded, list archived, get archived, get status, detect overlap)
- `specs` — use cases that operate on specs and approval gates (approve spec, approve signoff, list, get, save metadata, invalidate metadata, get active schema, validate, generate metadata, get context)
- `project` — use cases that operate on the project configuration (init, record skill install, get skills manifest, get project context)

Use cases must not appear at the top level of the kernel object — they must be nested under their domain-area group.

### Requirement: Every exported use case must have a kernel entry

Every use case class exported from `application/use-cases/` must have a corresponding entry in the `Kernel` interface. If a new use case is added to the application layer and exported, it must also be wired into `createKernel` and exposed via the `Kernel` interface.

Shared utilities in `application/use-cases/_shared/` are exempt — they are internal building blocks, not standalone use cases.

### Requirement: Kernel entries must match use case types

Each entry in the `Kernel` interface must be typed as the concrete use case class it wraps. The kernel does not define its own method signatures — it delegates to the use case instances directly. Callers invoke use cases as `kernel.changes.create.execute(...)`, not through a kernel-level abstraction.

### Requirement: createKernel constructs shared adapters once

`createKernel(config, options?)` instantiates every shared dependency once, wires them
together, and returns a `Kernel` object. The construction MUST include:

- One `ChangeRepository` instance (shared by all change use cases)
- One `SpecRepository` per workspace
- One `SchemaRegistry` instance
- One `SchemaProvider` instance — a lazy, caching provider that resolves the schema (with plugins and overrides) on first access via `ResolveSchema`, then returns the cached result. If resolution fails, the error propagates directly — the provider does not cache failures. All use cases that need the schema MUST receive this provider instead of the raw `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple.
- One `HookRunner` instance
- One `RunStepHooks` instance (shared by `TransitionChange`, `ArchiveChange`, and exposed directly)
- One `ContentHasher` instance
- One `ArtifactParserRegistry` instance

No use case constructor may call `SchemaRegistry.resolve()` directly. Schema access is exclusively through `SchemaProvider.get()`, which returns the fully-resolved schema with extends chains, plugins, and `schemaOverrides` applied. `get()` throws `SchemaNotFoundError` or `SchemaValidationError` on failure — it never returns `null`.

`RunStepHooks` and `GetHookInstructions` do not receive project-level workflow hooks — all hooks are merged into the schema by `ResolveSchema` via `schemaOverrides`. The kernel does not read `config.workflow`.

### Requirement: Project-level VCS and actor adapters must use auto-detect

`createKernelInternals` must use `createVcsAdapter(config.projectRoot)` and `createVcsActorResolver(config.projectRoot)` to construct the project-level `VcsAdapter` and `ActorResolver`. It must NOT hardcode a specific VCS implementation (e.g. `new GitVcsAdapter()`).

The same rule applies to the standalone use-case factory functions in `composition/use-cases/`: they must use `createVcsActorResolver()` instead of `new GitActorResolver()`.

This ensures specd works correctly in git, Mercurial, Subversion, and non-VCS environments without caller-visible changes.

### Requirement: Auto-invalidation on get when artifact files drift

When `ChangeRepository.get()` loads a change, the `FsChangeRepository` implementation must check whether any previously-validated artifact file has drifted — i.e. the file had a `validatedHash` set but now has a persisted or derived non-complete state caused by content drift. If drift is detected AND either of the following conditions holds, the repository must collect the full set of affected files per artifact, call `change.invalidate('artifact-drift', SYSTEM_ACTOR, ...)`, and persist the updated state before returning **only when** invalidation appends new history:

1. The change is beyond `designing` state (has progressed past the initial design phase), OR
2. The change has an active approval (spec approval or signoff) not superseded by a subsequent `invalidated` event.

When the change is already in `designing` and the drift scope matches the most recent `artifact-drift` invalidation per `core:change`, repeated loads MUST NOT append duplicate history or rewrite the manifest. This keeps kernel-triggered status polls (Studio, API, CLI) honest and side-effect free when drift scope is unchanged.

The invalidation payload must preserve every drifted file key for every affected artifact before the rollback is recorded. This ensures that both state-inconsistent artifact changes and approval drift are detected eagerly on any change load, not only during explicit validation. See [`core:change-repository-port`](../change-repository-port/spec.md) for the full port-level contract.

Historical manifests may still contain `invalidated` events whose persisted cause is `"artifact-change"`. The fs read path must accept that legacy value as backward-compatible history and normalize it to the current artifact-drift semantics when the raw manifest is deserialized.

### Requirement: Kernel exposes repository instances for adapter access

The kernel must expose the underlying `ChangeRepository` as `changes.repo` and the `SpecRepository` map as `specs.repos`. These allow delivery mechanisms to perform adapter-level queries (path resolution, existence checks) that do not warrant a full use case.

### Requirement: createKernel accepts optional KernelOptions

`createKernel(config, options?)` accepts an optional `KernelOptions` object. The `extraNodeModulesPaths` option appends additional `node_modules` directories to the schema search path, so that globally-installed schema packages are found even when the project has no local copy.

`KernelOptions` SHALL also support graph-store composition inputs:

- **`graphStoreId`** (`string`, optional) — the backend id selected from the merged graph-store registry for this kernel construction path
- additive graph-store factory registrations that extend the built-in graph-store registry without replacing it

When `graphStoreId` is omitted, the kernel uses the current built-in default graph-store id exposed by the code-graph composition layer.

### Requirement: KernelOptions supports additive registries

`KernelOptions` SHALL support additive registration of external capabilities before kernel construction. At minimum, it SHALL include extension points for:

- storage factories
- graph-store factories
- VCS providers
- actor providers
- artifact parsers
- external hook runners

These registrations SHALL extend the built-in capability set rather than replacing it.

### Requirement: Kernel exposes merged registries

The `Kernel` interface SHALL expose the merged built-in plus external registries used during construction. The exposed registry view SHALL let consumers inspect which storages, graph stores, parsers, providers, and external hook runners are available from the built kernel.

The exposed registries MUST reflect the final additive capability set actually used during construction — not just the raw external registrations supplied by the caller.

### Requirement: Kernel rejects invalid registry references

Kernel composition MUST reject conflicting registrations and unknown registry references with clear errors.

Conflicting registrations include attempts to overwrite an existing built-in or already-registered external entry for the same registry category. Unknown references include configuration or workflow data that names an adapter, parser, provider, external hook type, or graph-store id that is not present in the merged registry set.

### Requirement: Kernel entry mapping

The following table is the exhaustive mapping between kernel paths and use case classes. Each entry is a binding contract — consumers access use cases exclusively through these paths.

#### kernel.changes

| Kernel path                      | Use case class           | Spec                                                                 | Description                                             |
| -------------------------------- | ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `changes.repo`                   | `ChangeRepository`       | —                                                                    | Underlying repository for adapter-level queries         |
| `changes.create`                 | `CreateChange`           | [core:create-change](../create-change/spec.md)                       | Creates a new change                                    |
| `changes.status`                 | `GetStatus`              | [core:get-status](../get-status/spec.md)                             | Reports lifecycle state and artifact statuses           |
| `changes.transition`             | `TransitionChange`       | [core:transition-change](../transition-change/spec.md)               | Performs a lifecycle state transition                   |
| `changes.draft`                  | `DraftChange`            | [core:draft-change](../draft-change/spec.md)                         | Shelves a change to drafts                              |
| `changes.restore`                | `RestoreChange`          | [core:restore-change](../restore-change/spec.md)                     | Recovers a drafted change                               |
| `changes.discard`                | `DiscardChange`          | [core:discard-change](../discard-change/spec.md)                     | Permanently abandons a change                           |
| `changes.archive`                | `ArchiveChange`          | [core:archive-change](../archive-change/spec.md)                     | Finalises a change: merges deltas, moves to archive     |
| `changes.validate`               | `ValidateArtifacts`      | [core:validate-artifacts](../validate-artifacts/spec.md)             | Validates artifact files against the active schema      |
| `changes.compile`                | `CompileContext`         | [core:compile-context](../compile-context/spec.md)                   | Assembles the context block for a lifecycle step        |
| `changes.list`                   | `ListChanges`            | [core:list-changes](../list-changes/spec.md)                         | Lists all active changes                                |
| `changes.listDrafts`             | `ListDrafts`             | [core:list-drafts](../list-drafts/spec.md)                           | Lists all drafted changes                               |
| `changes.listDiscarded`          | `ListDiscarded`          | [core:list-discarded](../list-discarded/spec.md)                     | Lists all discarded changes                             |
| `changes.edit`                   | `EditChange`             | [core:edit-change](../edit-change/spec.md)                           | Edits the spec scope of a change                        |
| `changes.skipArtifact`           | `SkipArtifact`           | [core:skip-artifact](../skip-artifact/spec.md)                       | Explicitly skips an optional artifact                   |
| `changes.updateSpecDeps`         | `UpdateSpecDeps`         | [core:update-spec-deps](../update-spec-deps/spec.md)                 | Updates declared dependencies for a spec                |
| `changes.listArchived`           | `ListArchived`           | [core:list-archived](../list-archived/spec.md)                       | Lists all archived changes                              |
| `changes.getArchived`            | `GetArchivedChange`      | [core:get-archived-change](../get-archived-change/spec.md)           | Retrieves a single archived change by name              |
| `changes.runStepHooks`           | `RunStepHooks`           | [core:run-step-hooks](../run-step-hooks/spec.md)                     | Executes run: hooks for a step and phase                |
| `changes.getHookInstructions`    | `GetHookInstructions`    | [core:get-hook-instructions](../get-hook-instructions/spec.md)       | Returns instruction: hook text for a step and phase     |
| `changes.getArtifactInstruction` | `GetArtifactInstruction` | [core:get-artifact-instruction](../get-artifact-instruction/spec.md) | Returns artifact instruction block with rules and delta |
| `changes.detectOverlap`          | `DetectOverlap`          | [core:spec-overlap](../spec-overlap/spec.md)                         | Detects specs targeted by multiple active changes       |

#### kernel.specs

| Kernel path                | Use case class                        | Spec                                                                 | Description                                                 |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `specs.repos`              | `ReadonlyMap<string, SpecRepository>` | —                                                                    | Spec repositories keyed by workspace name                   |
| `specs.approveSpec`        | `ApproveSpec`                         | [core:approve-spec](../approve-spec/spec.md)                         | Records a spec approval and transitions state               |
| `specs.approveSignoff`     | `ApproveSignoff`                      | [core:approve-signoff](../approve-signoff/spec.md)                   | Records a sign-off and transitions state                    |
| `specs.list`               | `ListSpecs`                           | [core:list-specs](../list-specs/spec.md)                             | Lists all specs across all workspaces                       |
| `specs.search`             | `SearchSpecs`                         | [core:search-specs](../search-specs/spec.md)                         | Searches spec content across all workspaces                 |
| `specs.get`                | `GetSpec`                             | [core:get-spec](../get-spec/spec.md)                                 | Loads a spec and all artifact files                         |
| `specs.saveMetadata`       | `SaveSpecMetadata`                    | [core:save-spec-metadata](../save-spec-metadata/spec.md)             | Writes a `.specd-metadata.yaml` file                        |
| `specs.invalidateMetadata` | `InvalidateSpecMetadata`              | [core:invalidate-spec-metadata](../invalidate-spec-metadata/spec.md) | Invalidates a spec's metadata                               |
| `specs.getActiveSchema`    | `GetActiveSchema`                     | [core:get-active-schema](../get-active-schema/spec.md)               | Resolves and returns the active schema                      |
| `specs.validate`           | `ValidateSpecs`                       | [core:validate-specs](../validate-specs/spec.md)                     | Validates spec artifacts against schema rules               |
| `specs.generateMetadata`   | `GenerateSpecMetadata`                | [core:generate-metadata](../generate-metadata/spec.md)               | Generates deterministic metadata from extraction rules      |
| `specs.getContext`         | `GetSpecContext`                      | [core:get-spec-context](../get-spec-context/spec.md)                 | Builds structured context entries with dependency traversal |
| `specs.resolveSchema`      | `ResolveSchema`                       | [core:resolve-schema](../resolve-schema/spec.md)                     | Resolves base schema with extends, plugins, and overrides   |

#### kernel.project

| Kernel path                  | Use case class       | Spec                                                         | Description                                     |
| ---------------------------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `project.init`               | `InitProject`        | [core:init-project](../init-project/spec.md)                 | Initialises a new specd project                 |
| `project.recordSkillInstall` | `RecordSkillInstall` | [core:record-skill-install](../record-skill-install/spec.md) | Records that skills were installed for an agent |
| `project.getSkillsManifest`  | `GetSkillsManifest`  | [core:get-skills-manifest](../get-skills-manifest/spec.md)   | Reads the installed skills manifest             |
| `project.getProjectContext`  | `GetProjectContext`  | [core:get-project-context](../get-project-context/spec.md)   | Compiles the project-level context block        |

Adding, removing, or renaming an entry in this table is a contract change and must be reflected in both the `Kernel` interface and `createKernel`.

## Examples

```typescript
import { createKernel, createConfigLoader } from '@specd/core'

const config = await createConfigLoader({ projectRoot: process.cwd() }).load()
const kernel = createKernel(config)

// Create a change
const change = await kernel.changes.create.execute({
  name: 'add-oauth-login',
  specs: ['core:change'],
})

// Check its status
const status = await kernel.changes.status.execute({ name: 'add-oauth-login' })

// Transition through the lifecycle
await kernel.changes.transition.execute({ name: 'add-oauth-login', to: 'specifying' })

// List all active changes
const active = await kernel.changes.list.execute()

// List all specs across workspaces
const specs = await kernel.specs.list.execute()

// Get structured context for a spec with transitive dependencies
const ctx = await kernel.specs.getContext.execute({
  specId: 'core:change',
  depth: 2,
})

// Initialise a new project
await kernel.project.init.execute({
  projectRoot: '/path/to/project',
  schemaRef: '@specd/schema-std',
})
```

### Requirement: Kernel is a plain object, not a class

`createKernel` returns a plain object literal conforming to the `Kernel` interface. The kernel has no internal state, no lifecycle methods, and no event system. It is a one-shot wiring of use cases — once created, it is immutable.

## Constraints

- The `Kernel` interface is the only way delivery mechanisms should access use cases — direct use case construction is reserved for tests and the composition layer's own factories
- Adding a use case to `application/use-cases/` without adding it to the `Kernel` interface is a spec violation
- Removing a use case from the `Kernel` interface is a breaking change and must follow the breaking change commit convention
- The kernel must not contain business logic — it is purely a wiring and grouping mechanism
- `createKernelInternals` is not exported from `@specd/core` — it is internal to the composition layer
- The `Kernel` interface and `createKernel` function are public exports of `@specd/core`

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:composition`](../composition/spec.md)
- [`core:create-change`](../create-change/spec.md)
- [`core:get-status`](../get-status/spec.md)
- [`core:transition-change`](../transition-change/spec.md)
- [`core:draft-change`](../draft-change/spec.md)
- [`core:restore-change`](../restore-change/spec.md)
- [`core:discard-change`](../discard-change/spec.md)
- [`core:archive-change`](../archive-change/spec.md)
- [`core:validate-artifacts`](../validate-artifacts/spec.md)
- [`core:compile-context`](../compile-context/spec.md)
- [`core:list-changes`](../list-changes/spec.md)
- [`core:list-drafts`](../list-drafts/spec.md)
- [`core:list-discarded`](../list-discarded/spec.md)
- [`core:edit-change`](../edit-change/spec.md)
- [`core:skip-artifact`](../skip-artifact/spec.md)
- [`core:update-spec-deps`](../update-spec-deps/spec.md)
- [`core:list-archived`](../list-archived/spec.md)
- [`core:get-archived-change`](../get-archived-change/spec.md)
- [`core:run-step-hooks`](../run-step-hooks/spec.md)
- [`core:get-hook-instructions`](../get-hook-instructions/spec.md)
- [`core:get-artifact-instruction`](../get-artifact-instruction/spec.md)
- [`core:approve-spec`](../approve-spec/spec.md)
- [`core:approve-signoff`](../approve-signoff/spec.md)
- [`core:list-specs`](../list-specs/spec.md)
- [`core:get-spec`](../get-spec/spec.md)
- [`core:save-spec-metadata`](../save-spec-metadata/spec.md)
- [`core:invalidate-spec-metadata`](../invalidate-spec-metadata/spec.md)
- [`core:get-active-schema`](../get-active-schema/spec.md)
- [`core:validate-specs`](../validate-specs/spec.md)
- [`core:generate-metadata`](../generate-metadata/spec.md)
- [`core:get-spec-context`](../get-spec-context/spec.md)
- [`core:init-project`](../init-project/spec.md)
- [`core:record-skill-install`](../record-skill-install/spec.md)
- [`core:get-skills-manifest`](../get-skills-manifest/spec.md)
- [`core:get-project-context`](../get-project-context/spec.md)
- [`core:resolve-schema`](../resolve-schema/spec.md)
- [`core:spec-overlap`](../spec-overlap/spec.md)
