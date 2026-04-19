# @specd/core — Overview

`@specd/core` is the domain library for SpecD. It contains all business logic — entities, use cases, ports, and errors — with zero I/O dependencies. The CLI, MCP server, and plugins are adapters that translate between their delivery mechanism and the core.

## Who this documentation is for

`docs/core/` targets integrators: developers who want to build a new delivery adapter (a CLI, an HTTP API, an IDE extension), implement a custom port (a database-backed repository, a remote schema registry), or consume the core as a standalone SDK.

If you are using the `specd` CLI or MCP server, you do not need to read these documents — the [configuration reference](../config/config-reference.md) and [schema format reference](../schemas/schema-format.md) are the right starting points.

## Architecture

`@specd/core` is organized in three layers. The dependency flow is strictly one-way: domain has no dependencies, application depends on domain, infrastructure depends on application and domain.

```
┌──────────────────────────────────────────┐
│               domain/                    │
│  Entities · Value objects · Errors       │
│  No I/O. No external dependencies.       │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│             application/                 │
│  Use cases · Ports (interfaces)          │
│  Depends on domain only.                 │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│           infrastructure/                │
│  Fs adapters · Git · Hooks               │
│  Internal. Never imported directly.      │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│            composition/                  │
│  Factory functions for adapter creation  │
│  Exported. Returns abstract port types.  │
└──────────────────────────────────────────┘
```

The `infrastructure/` layer is internal — never import from it directly. Infrastructure adapters are created exclusively through the factory functions in `composition/`, which is the only layer permitted to instantiate them. Factories accept a discriminated union config (e.g. `{ type: 'fs', ... }`) and return the abstract port type, keeping callers decoupled from the concrete implementation.

## Public exports

`@specd/core` exports from a single entry point:

```typescript
import { ... } from '@specd/core'       // domain + application + composition
```

Everything exported is a domain type (entity, value object, error, service), an application type (use case, port interface, error, config type), or a composition factory / adapter class.

### What is exported

**From the domain layer — entities:**

| Export           | Kind  | Description                                                      |
| ---------------- | ----- | ---------------------------------------------------------------- |
| `Change`         | class | The central entity representing an in-progress spec change.      |
| `Spec`           | class | Metadata for a spec directory.                                   |
| `ChangeArtifact` | class | A single artifact file tracked within a change.                  |
| `ArchivedChange` | class | An immutable historical record of a completed change.            |
| `Delta`          | class | A delta file record.                                             |
| `SYSTEM_ACTOR`   | const | The built-in system actor identity used by automated operations. |

**From the domain layer — value objects:**

| Export                | Kind      | Description                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------------ |
| `SpecPath`            | class     | Validated, immutable spec path value object.                                   |
| `ArtifactType`        | class     | Describes a single artifact type as declared in the schema.                    |
| `Schema`              | class     | A fully-constructed schema with artifacts, workflow, and extraction.           |
| `ArtifactFile`        | class     | A spec-scoped artifact file record.                                            |
| `SpecArtifact`        | class     | A spec-scoped artifact record with metadata.                                   |
| `HookResult`          | class     | The outcome of a `run:` hook execution.                                        |
| `ChangeState`         | type      | Union of all valid lifecycle state strings.                                    |
| `ArtifactStatus`      | type      | `'missing' \| 'in-progress' \| 'complete' \| 'skipped'`                        |
| `ArtifactScope`       | type      | `'spec' \| 'change'` — whether an artifact lives on the spec or change.        |
| `ArtifactFormat`      | type      | `'markdown' \| 'json' \| 'yaml' \| 'plaintext'`                                |
| `ActorIdentity`       | interface | `{ name: string; email: string }` — actor identity.                            |
| `ChangeEvent`         | type      | Discriminated union of all change history event types.                         |
| `WorkflowStep`        | type      | A single step entry in the schema workflow. Includes `requiresTaskCompletion`. |
| `HookEntry`           | type      | A single hook declaration within a workflow step.                              |
| `ValidationRule`      | type      | A structural validation rule from the schema.                                  |
| `PreHashCleanup`      | type      | A pre-hash substitution rule from the schema.                                  |
| `TaskCompletionCheck` | type      | Pattern-based task completion check from the schema.                           |
| `Selector`            | type      | An AST node selector used in validations and extractors.                       |
| `Extractor`           | type      | An extraction configuration for metadata derivation.                           |
| `MetadataExtraction`  | type      | The full metadata extraction block from a schema.                              |
| `VALID_TRANSITIONS`   | const     | Map of valid transitions per lifecycle state.                                  |
| `isValidTransition`   | function  | Returns whether a state transition is permitted.                               |

**From the domain layer — errors:**

| Export                         | Code                        |
| ------------------------------ | --------------------------- |
| `SpecdError`                   | abstract base class         |
| `InvalidStateTransitionError`  | `INVALID_STATE_TRANSITION`  |
| `ApprovalRequiredError`        | `APPROVAL_REQUIRED`         |
| `HookFailedError`              | `HOOK_FAILED`               |
| `ArtifactConflictError`        | `ARTIFACT_CONFLICT`         |
| `DeltaApplicationError`        | `DELTA_APPLICATION`         |
| `InvalidSpecPathError`         | `INVALID_SPEC_PATH`         |
| `InvalidChangeError`           | `INVALID_CHANGE`            |
| `ArtifactNotOptionalError`     | `ARTIFACT_NOT_OPTIONAL`     |
| `SchemaValidationError`        | `SCHEMA_VALIDATION_ERROR`   |
| `ConfigValidationError`        | `CONFIG_VALIDATION_ERROR`   |
| `CorruptedManifestError`       | `CORRUPTED_MANIFEST`        |
| `MetadataValidationError`      | `METADATA_VALIDATION_ERROR` |
| `DependsOnOverwriteError`      | `DEPENDS_ON_OVERWRITE`      |
| `HookNotFoundError`            | `HOOK_NOT_FOUND`            |
| `StepNotValidError`            | `STEP_NOT_VALID`            |
| `PathTraversalError`           | `PATH_TRAVERSAL`            |
| `UnsupportedPatternError`      | `UNSUPPORTED_PATTERN_ERROR` |
| `MissingDefaultWorkspaceError` | `MISSING_DEFAULT_WORKSPACE` |
| `ArtifactParseError`           | `ARTIFACT_PARSE_ERROR`      |

**From the domain layer — services:**

| Export                     | Kind     | Description                                                                |
| -------------------------- | -------- | -------------------------------------------------------------------------- |
| `hashFiles`                | function | Applies a hash function to each entry in a file-content map.               |
| `applyPreHashCleanup`      | function | Applies schema-declared pre-hash substitutions to artifact content.        |
| `buildSchema`              | function | Constructs a typed `Schema` from validated YAML data and templates.        |
| `buildSelector`            | function | Converts a raw selector shape into the domain `Selector` type.             |
| `mergeSchemaLayers`        | function | Applies ordered customisation layers to a base schema's intermediate data. |
| `parseSpecId`              | function | Splits a spec ID into workspace and capability path.                       |
| `extractSpecSummary`       | function | Extracts a short summary from `spec.md` content.                           |
| `extractMetadata`          | function | Async metadata extraction orchestration across multiple artifact ASTs.     |
| `extractContent`           | function | Async extractor runtime for one AST root (supports promise transforms).    |
| `evaluateRules`            | function | Evaluates validation rules against an AST, returning failures/warnings.    |
| `findNodes`                | function | Finds all nodes matching a selector in an AST.                             |
| `nodeMatches`              | function | Tests whether a single AST node matches a selector.                        |
| `selectBySelector`         | function | Selects nodes using a selector with parent-scope and index support.        |
| `collectAllNodes`          | function | Recursively collects all nodes in an AST.                                  |
| `safeRegex`                | function | Compiles a user-supplied pattern, returning `null` if invalid or unsafe.   |
| `inferFormat`              | function | Infers artifact format from a filename extension.                          |
| `shiftHeadings`            | function | Shifts Markdown heading levels by a given delta.                           |
| `selectByJsonPath`         | function | Navigates an AST using a simplified JSONPath expression.                   |
| `tokenizeJsonPath`         | function | Tokenises a JSONPath expression into segments.                             |
| `specMetadataSchema`       | const    | Lenient Zod schema for reading `metadata.json`.                            |
| `strictSpecMetadataSchema` | const    | Strict Zod schema for writing `metadata.json`.                             |

**From the application layer — ports:**

| Export                   | Kind           | Description                                                        |
| ------------------------ | -------------- | ------------------------------------------------------------------ |
| `Repository`             | abstract class | Base class for all repository ports.                               |
| `SpecRepository`         | abstract class | Port for reading and writing specs.                                |
| `ChangeRepository`       | abstract class | Port for snapshot reads and serialized persisted change mutations. |
| `ArchiveRepository`      | abstract class | Port for archiving and querying archived changes.                  |
| `ContentHasher`          | abstract class | Port for computing content hashes.                                 |
| `YamlSerializer`         | abstract class | Port for serialising and deserialising YAML.                       |
| `SchemaRegistry`         | interface      | Port for discovering and resolving schemas.                        |
| `HookRunner`             | interface      | Port for executing built-in `run:` hook commands.                  |
| `ExternalHookRunner`     | interface      | Port for dispatching explicit `external:` workflow hooks by type.  |
| `ActorResolver`          | interface      | Port for resolving the current actor identity.                     |
| `VcsAdapter`             | interface      | Port for querying version control system state.                    |
| `FileReader`             | interface      | Port for reading files by absolute path.                           |
| `ArtifactParser`         | interface      | Port for parsing, applying deltas, and serialising artifacts.      |
| `ArtifactParserRegistry` | type           | `ReadonlyMap<string, ArtifactParser>`                              |
| `SchemaProvider`         | interface      | Port for lazily resolving the active schema.                       |
| `ConfigLoader`           | interface      | Port for loading and resolving `specd.yaml`.                       |
| `ConfigWriter`           | interface      | Port for writing project configuration.                            |

**From the application layer — use cases:**

| Export                   | Kind | Description                                                                                  |
| ------------------------ | ---- | -------------------------------------------------------------------------------------------- |
| `CreateChange`           | type | Creates a new change.                                                                        |
| `GetStatus`              | type | Reports change state and artifact statuses.                                                  |
| `TransitionChange`       | type | Advances the change lifecycle and serializes the final manifest mutation.                    |
| `DraftChange`            | type | Shelves a change to `drafts/` via serialized persistence.                                    |
| `RestoreChange`          | type | Recovers a drafted change via serialized persistence.                                        |
| `DiscardChange`          | type | Permanently abandons a change via serialized persistence.                                    |
| `ApproveSpec`            | type | Records a spec approval through a serialized change mutation.                                |
| `ApproveSignoff`         | type | Records a sign-off through a serialized change mutation.                                     |
| `ArchiveChange`          | type | Finalises and archives a completed change after serializing `archiving`.                     |
| `ValidateArtifacts`      | type | Validates artifact files and serializes completion/invalidation.                             |
| `CompileContext`         | type | Assembles the AI instruction block for a lifecycle step.                                     |
| `ListChanges`            | type | Lists all active changes.                                                                    |
| `ListDrafts`             | type | Lists all drafted changes.                                                                   |
| `ListDiscarded`          | type | Lists all discarded changes.                                                                 |
| `ListArchived`           | type | Lists all archived changes.                                                                  |
| `GetArchivedChange`      | type | Retrieves a single archived change.                                                          |
| `EditChange`             | type | Edits change scope while serializing the persisted `specIds` update.                         |
| `SkipArtifact`           | type | Explicitly skips an optional artifact on a change.                                           |
| `UpdateSpecDeps`         | type | Updates declared spec dependencies within a change.                                          |
| `ListSpecs`              | type | Lists all specs across all configured workspaces.                                            |
| `GetSpec`                | type | Loads a spec and its artifact files.                                                         |
| `SaveSpecMetadata`       | type | Writes validated metadata for a spec.                                                        |
| `InvalidateSpecMetadata` | type | Removes content hashes from a spec's metadata.                                               |
| `GetActiveSchema`        | type | Resolves and returns the active schema.                                                      |
| `ValidateSchema`         | type | Validates a schema against structural rules.                                                 |
| `ValidateSpecs`          | type | Validates spec artifacts against schema structural rules.                                    |
| `GenerateSpecMetadata`   | type | Generates deterministic metadata from schema extraction rules.                               |
| `GetSpecContext`         | type | Builds structured context entries for a spec.                                                |
| `RunStepHooks`           | type | Executes built-in `run:` hooks and explicit `external:` hooks for a workflow step and phase. |
| `GetHookInstructions`    | type | Returns `instruction:` hook text for a workflow step and phase.                              |
| `GetArtifactInstruction` | type | Returns artifact-specific instructions, rules, and delta guidance.                           |
| `InitProject`            | type | Initialises a new specd project.                                                             |
| `RecordSkillInstall`     | type | Records that a skill set was installed for an agent.                                         |
| `GetSkillsManifest`      | type | Reads the installed skills manifest from `specd.yaml`.                                       |
| `GetProjectContext`      | type | Compiles project-level context without a specific change or step.                            |

**From the application layer — config types:**

| Export                 | Kind     | Description                                                   |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `SpecdConfig`          | type     | The fully-resolved project configuration structure.           |
| `SpecdWorkspaceConfig` | type     | Per-workspace configuration within `SpecdConfig`.             |
| `SpecdStorageConfig`   | type     | Storage (paths) configuration within `SpecdConfig`.           |
| `SpecdContextEntry`    | type     | A single entry in the project context block.                  |
| `isSpecdConfig`        | function | Type guard for `SpecdConfig`.                                 |
| `TemplateExpander`     | class    | Expands template variables in hook commands and instructions. |

**From the application layer — errors:**

| Export                      | Code                     |
| --------------------------- | ------------------------ |
| `ChangeNotFoundError`       | `CHANGE_NOT_FOUND`       |
| `ChangeAlreadyExistsError`  | `CHANGE_ALREADY_EXISTS`  |
| `ApprovalGateDisabledError` | `APPROVAL_GATE_DISABLED` |
| `SchemaNotFoundError`       | `SCHEMA_NOT_FOUND`       |
| `AlreadyInitialisedError`   | `ALREADY_INITIALISED`    |
| `ArtifactNotFoundError`     | `ARTIFACT_NOT_FOUND`     |
| `ParserNotRegisteredError`  | `PARSER_NOT_REGISTERED`  |
| `SpecNotInChangeError`      | `SPEC_NOT_IN_CHANGE`     |
| `SchemaMismatchError`       | `SCHEMA_MISMATCH`        |
| `SpecNotFoundError`         | `SPEC_NOT_FOUND`         |
| `WorkspaceNotFoundError`    | `WORKSPACE_NOT_FOUND`    |

**From the composition layer — kernel:**

| Export                | Kind      | Description                                                                                            |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `createKernel`        | function  | Constructs all use cases from a `SpecdConfig` and returns them as a grouped `Kernel`.                  |
| `Kernel`              | interface | The fully-wired set of use cases, grouped as `kernel.changes.*`, `kernel.specs.*`, `kernel.project.*`. |
| `KernelOptions`       | interface | Options for `createKernel`, including extra `node_modules` paths for schema discovery.                 |
| `createKernelBuilder` | function  | Creates a fluent builder for additive kernel registrations before `build()`.                           |
| `KernelBuilder`       | interface | Fluent registration surface for parsers, storages, providers, and external hook runners.               |

**From the composition layer — repository and schema factories:**

| Export                         | Kind      | Description                                                                                |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------ |
| `createSchemaRegistry`         | function  | Constructs a `SchemaRegistry` for the given adapter type (`'fs'`).                         |
| `createSchemaRepository`       | function  | Constructs a `SchemaRepository` for the given adapter type.                                |
| `createConfigLoader`           | function  | Creates a filesystem-backed `ConfigLoader` that discovers and parses `specd.yaml`.         |
| `createArtifactParserRegistry` | function  | Creates the default `ArtifactParserRegistry` with all built-in format adapters registered. |
| `KernelRegistryInput`          | type      | Additive registration inputs accepted by `createKernel` and `createKernelBuilder`.         |
| `KernelRegistryView`           | type      | Final merged registry surface exposed as `kernel.registry`.                                |
| `SpecStorageFactory`           | interface | Named storage factory for workspace specs repositories.                                    |
| `SchemaStorageFactory`         | interface | Named storage factory for workspace schema repositories.                                   |
| `ChangeStorageFactory`         | interface | Named storage factory for active and shelved changes.                                      |
| `ArchiveStorageFactory`        | interface | Named storage factory for archived changes.                                                |
| `VcsProvider`                  | interface | External-first VCS detection provider used by the kernel registry.                         |
| `ActorProvider`                | interface | External-first actor detection provider used by the kernel registry.                       |

**From the composition layer — VCS and actor adapters:**

| Export                   | Kind     | Description                                                               |
| ------------------------ | -------- | ------------------------------------------------------------------------- |
| `createVcsAdapter`       | function | Auto-detects the active VCS (git/hg/svn/null) and returns a `VcsAdapter`. |
| `createVcsActorResolver` | function | Auto-detects the active VCS and returns an `ActorResolver`.               |
| `GitVcsAdapter`          | class    | `VcsAdapter` implementation for git repositories.                         |
| `HgVcsAdapter`           | class    | `VcsAdapter` implementation for Mercurial repositories.                   |
| `SvnVcsAdapter`          | class    | `VcsAdapter` implementation for Subversion repositories.                  |
| `NullVcsAdapter`         | class    | No-op `VcsAdapter` for projects without version control.                  |
| `GitActorResolver`       | class    | `ActorResolver` that reads actor identity from git config.                |
| `HgActorResolver`        | class    | `ActorResolver` that reads actor identity from hg config.                 |
| `SvnActorResolver`       | class    | `ActorResolver` that reads actor identity from svn info.                  |
| `NullActorResolver`      | class    | `ActorResolver` that returns a fixed anonymous identity.                  |
| `NodeContentHasher`      | class    | `ContentHasher` implementation using Node.js `crypto` (SHA-256).          |
| `NodeYamlSerializer`     | class    | `YamlSerializer` implementation using the `yaml` npm package.             |

**From the composition layer — use case creator functions (fs-wired):**

These functions wire a single use case to the filesystem, creating a self-contained async function. Each accepts an options object with the relevant paths and config flags, and returns a callable function. Use them when you need only one or two use cases without constructing a full `Kernel`.

| Export                         | Description                               |
| ------------------------------ | ----------------------------------------- |
| `createCreateChange`           | Wires `CreateChange` to the fs.           |
| `createGetStatus`              | Wires `GetStatus` to the fs.              |
| `createTransitionChange`       | Wires `TransitionChange` to the fs.       |
| `createDraftChange`            | Wires `DraftChange` to the fs.            |
| `createRestoreChange`          | Wires `RestoreChange` to the fs.          |
| `createDiscardChange`          | Wires `DiscardChange` to the fs.          |
| `createApproveSpec`            | Wires `ApproveSpec` to the fs.            |
| `createApproveSignoff`         | Wires `ApproveSignoff` to the fs.         |
| `createArchiveChange`          | Wires `ArchiveChange` to the fs.          |
| `createValidateArtifacts`      | Wires `ValidateArtifacts` to the fs.      |
| `createCompileContext`         | Wires `CompileContext` to the fs.         |
| `createListChanges`            | Wires `ListChanges` to the fs.            |
| `createListDrafts`             | Wires `ListDrafts` to the fs.             |
| `createListDiscarded`          | Wires `ListDiscarded` to the fs.          |
| `createListArchived`           | Wires `ListArchived` to the fs.           |
| `createGetArchivedChange`      | Wires `GetArchivedChange` to the fs.      |
| `createEditChange`             | Wires `EditChange` to the fs.             |
| `createSkipArtifact`           | Wires `SkipArtifact` to the fs.           |
| `createListSpecs`              | Wires `ListSpecs` to the fs.              |
| `createGetSpec`                | Wires `GetSpec` to the fs.                |
| `createSaveSpecMetadata`       | Wires `SaveSpecMetadata` to the fs.       |
| `createInvalidateSpecMetadata` | Wires `InvalidateSpecMetadata` to the fs. |
| `createGetActiveSchema`        | Wires `GetActiveSchema` to the fs.        |
| `createValidateSpecs`          | Wires `ValidateSpecs` to the fs.          |
| `createGetSpecContext`         | Wires `GetSpecContext` to the fs.         |
| `createInitProject`            | Wires `InitProject` to the fs.            |
| `createRecordSkillInstall`     | Wires `RecordSkillInstall` to the fs.     |
| `createGetSkillsManifest`      | Wires `GetSkillsManifest` to the fs.      |
| `createGetProjectContext`      | Wires `GetProjectContext` to the fs.      |

## Where to go next

| Document                                                           | Read when you need to…                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [domain-model.md](domain-model.md)                                 | Understand the entities and value objects you receive as return values. |
| [ports.md](ports.md)                                               | Implement a repository, schema registry, or other port.                 |
| [use-cases.md](use-cases.md)                                       | Wire and call use cases from your adapter.                              |
| [errors.md](errors.md)                                             | Handle errors from use cases and ports in your delivery layer.          |
| [services.md](services.md)                                         | Use domain service functions such as `hashFiles` and `buildSchema`.     |
| [examples/implementing-a-port.md](examples/implementing-a-port.md) | See a full port implementation from scratch.                            |
