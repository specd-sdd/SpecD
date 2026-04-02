# Use Cases

Use cases are the entry points to `@specd/core`'s business logic. Each use case is a class with an `execute(input)` method. You construct them once — injecting the ports and sub-use-cases they need — and call `execute` for each operation.

All use case classes and their associated input/result types are exported from `@specd/core`.

## Construction pattern

Every use case follows the same pattern:

```typescript
import {
  CreateChange,
  type ChangeRepository,
  type ActorResolver,
  type SchemaProvider,
} from '@specd/core'

const createChange = new CreateChange(changeRepo, specs, actor)
const result = await createChange.execute({
  name: 'add-oauth-login',
  specIds: ['default:auth/oauth'],
  schemaName: 'specd-std',
  schemaVersion: 1,
})
// result.change — the Change entity
// result.changePath — absolute path to the change directory
```

Use cases are stateless between calls. Constructing one instance and reusing it is safe. Dependencies are resolved at construction time and do not change per call.

---

## Change management

### CreateChange

Creates a new change and persists it to the repository. Scaffolds the change directory with any relevant spec artifacts. The initial history contains a single `created` event.

**Constructor:** `new CreateChange(changes: ChangeRepository, specs: ReadonlyMap<string, SpecRepository>, actor: ActorResolver)`

**Input:**

| Field           | Type                | Required | Description                                   |
| --------------- | ------------------- | -------- | --------------------------------------------- |
| `name`          | `string`            | yes      | Unique slug name (e.g. `'add-oauth-login'`).  |
| `description`   | `string`            | no       | Optional free-text description of the change. |
| `specIds`       | `readonly string[]` | yes      | Spec paths being created or modified.         |
| `schemaName`    | `string`            | yes      | Schema name from the active config.           |
| `schemaVersion` | `number`            | yes      | Schema version number from the active config. |

**Returns:** `Promise<CreateChangeResult>`

```typescript
interface CreateChangeResult {
  change: Change // the newly created change entity
  changePath: string // absolute filesystem path to the change directory
}
```

**Throws:**

| Error                      | Condition                                    |
| -------------------------- | -------------------------------------------- |
| `ChangeAlreadyExistsError` | A change with the given name already exists. |

---

### GetStatus

Loads a change and reports its current lifecycle state, artifact statuses, and pre-computed lifecycle context including available transitions and blockers.

**Constructor:** `new GetStatus(changes: ChangeRepository, schemaProvider: SchemaProvider, approvals: { spec: boolean; signoff: boolean })`

**Input:**

| Field  | Type     | Required | Description                 |
| ------ | -------- | -------- | --------------------------- |
| `name` | `string` | yes      | The change name to look up. |

**Returns:** `Promise<GetStatusResult>`

```typescript
interface GetStatusResult {
  change: Change
  artifactStatuses: ArtifactStatusEntry[]
  lifecycle: LifecycleContext
}

interface ArtifactStatusEntry {
  type: string // artifact type ID
  effectiveStatus: ArtifactStatus
  files: ArtifactFileStatus[]
}

interface ArtifactFileStatus {
  key: string // artifact type ID (scope:change) or specId (scope:spec)
  filename: string // basename
  status: ArtifactStatus
}

interface LifecycleContext {
  validTransitions: readonly ChangeState[]
  availableTransitions: readonly ChangeState[] // subset where workflow requires are satisfied
  blockers: readonly TransitionBlocker[]
  approvals: { spec: boolean; signoff: boolean }
  nextArtifact: string | null // next artifact in the DAG whose requires are satisfied
  changePath: string
  schemaInfo: { name: string; version: number } | null
}

interface TransitionBlocker {
  transition: ChangeState
  reason: 'requires' | 'tasks-incomplete'
  blocking: readonly string[]
}
```

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### TransitionChange

Performs a lifecycle state transition on a change. Enforces approval-gate routing, workflow `requires`, task completion gating (via `requiresTaskCompletion`), and executes `run:` hooks at step boundaries.

The final persisted lifecycle update is applied through `ChangeRepository.mutate(...)` so hook execution and routing stay outside the lock while the manifest mutation runs against fresh state.

Smart routing applies at two points:

- `ready → implementing` is redirected to `ready → pending-spec-approval` when `approvalsSpec` is `true`.
- `done → archivable` is redirected to `done → pending-signoff` when `approvalsSignoff` is `true`.

When the change is already at a human approval boundary, `TransitionChange` does
not attempt to synthesize a forward transition. Instead, it throws
`InvalidStateTransitionError` with `reason.type === 'approval-required'`:

- `pending-spec-approval` -> any target other than `designing` yields `{ type: 'approval-required', gate: 'spec' }`
- `pending-signoff` -> any target other than `designing` yields `{ type: 'approval-required', gate: 'signoff' }`

This keeps redesign available while giving adapters enough context to explain why
normal progression is blocked.

**Constructor:** `new TransitionChange(changes: ChangeRepository, actor: ActorResolver, schemaProvider: SchemaProvider, runStepHooks: RunStepHooks)`

**Input:**

| Field              | Type                             | Required | Description                                                                                                   |
| ------------------ | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `name`             | `string`                         | yes      | The change to transition.                                                                                     |
| `to`               | `ChangeState`                    | yes      | The requested target state.                                                                                   |
| `approvalsSpec`    | `boolean`                        | yes      | Whether the spec approval gate is enabled.                                                                    |
| `approvalsSignoff` | `boolean`                        | yes      | Whether the signoff gate is enabled.                                                                          |
| `skipHookPhases`   | `ReadonlySet<HookPhaseSelector>` | no       | Hook phases to skip. Valid values: `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`. |

**Returns:** `Promise<TransitionChangeResult>`

```typescript
interface TransitionChangeResult {
  change: Change
}
```

The `execute` method accepts an optional `onProgress: OnTransitionProgress` callback for streaming progress events.

```typescript
type TransitionProgressEvent =
  | { type: 'requires-check'; artifactId: string; satisfied: boolean }
  | {
      type: 'task-completion-failed'
      artifactId: string
      incomplete: number
      complete: number
      total: number
    }
  | { type: 'hook-start'; phase: 'pre' | 'post'; hookId: string; command: string }
  | { type: 'hook-done'; phase: 'pre' | 'post'; hookId: string; success: boolean; exitCode: number }
  | { type: 'transitioned'; from: ChangeState; to: ChangeState }
```

**Throws:**

| Error                         | Condition                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChangeNotFoundError`         | No change with the given name exists.                                                                                                                                                   |
| `InvalidStateTransitionError` | Transition not permitted, requires unsatisfied, tasks incomplete, or progression blocked at a human approval boundary. Carries a structured `reason` field (`TransitionFailureReason`). |
| `HookFailedError`             | A source.post or target.pre hook exited with a non-zero code.                                                                                                                           |

---

### EditChange

Edits the spec scope of an existing change by adding or removing spec IDs. Any modification to `specIds` triggers approval invalidation.

The effective `specIds` update is persisted through `ChangeRepository.mutate(...)`; scaffold cleanup and creation remain outside that serialized manifest mutation.

**Constructor:** `new EditChange(changes: ChangeRepository, specs: ReadonlyMap<string, SpecRepository>, actor: ActorResolver)`

**Input:**

| Field           | Type       | Required | Description                          |
| --------------- | ---------- | -------- | ------------------------------------ |
| `name`          | `string`   | yes      | The change to edit.                  |
| `addSpecIds`    | `string[]` | no       | Spec paths to add to `specIds`.      |
| `removeSpecIds` | `string[]` | no       | Spec paths to remove from `specIds`. |

**Returns:** `Promise<EditChangeResult>`

```typescript
interface EditChangeResult {
  change: Change
  invalidated: boolean // true when approvals were invalidated by the edit
}
```

**Throws:**

| Error                  | Condition                                                  |
| ---------------------- | ---------------------------------------------------------- |
| `ChangeNotFoundError`  | No change with the given name exists.                      |
| `SpecNotInChangeError` | A spec to remove is not in the change's current `specIds`. |

---

### DraftChange

Shelves a change to `drafts/`, appending a `drafted` event. The change retains its full lifecycle state and can be restored at any time.

Persistence is performed through `ChangeRepository.mutate(...)`, so the drafted event is recorded against the latest persisted change state.

**Constructor:** `new DraftChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field    | Type     | Required | Description               |
| -------- | -------- | -------- | ------------------------- |
| `name`   | `string` | yes      | The change to shelve.     |
| `reason` | `string` | no       | Explanation for shelving. |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### RestoreChange

Recovers a drafted change back to `changes/`, appending a `restored` event.

Persistence is performed through `ChangeRepository.mutate(...)`, so restoration always runs against fresh persisted state.

**Constructor:** `new RestoreChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field  | Type     | Required | Description                    |
| ------ | -------- | -------- | ------------------------------ |
| `name` | `string` | yes      | The drafted change to restore. |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### DiscardChange

Permanently abandons a change, appending a `discarded` event and moving the directory to `discarded/`. This operation cannot be undone.

Persistence is performed through `ChangeRepository.mutate(...)`, which serializes the manifest update before the repository relocates the change directory.

**Constructor:** `new DiscardChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field          | Type       | Required | Description                           |
| -------------- | ---------- | -------- | ------------------------------------- |
| `name`         | `string`   | yes      | The change to permanently discard.    |
| `reason`       | `string`   | yes      | Mandatory explanation for discarding. |
| `supersededBy` | `string[]` | no       | Change names that replace this one.   |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### SkipArtifact

Explicitly marks an optional artifact as skipped on a change. Only optional artifacts can be skipped.

The skip event and updated artifact status are persisted through `ChangeRepository.mutate(...)`.

**Constructor:** `new SkipArtifact(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field        | Type     | Required | Description                                    |
| ------------ | -------- | -------- | ---------------------------------------------- |
| `name`       | `string` | yes      | The change name.                               |
| `artifactId` | `string` | yes      | The artifact type ID to skip (e.g. `'tasks'`). |
| `reason`     | `string` | no       | Optional explanation for skipping.             |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                      | Condition                                          |
| -------------------------- | -------------------------------------------------- |
| `ChangeNotFoundError`      | No change with the given name exists.              |
| `ArtifactNotFoundError`    | The artifact does not exist on the change.         |
| `ArtifactNotOptionalError` | The artifact is not marked optional in the schema. |

---

## Listing

### ListChanges

Lists all active (non-drafted, non-discarded) changes.

**Constructor:** `new ListChanges(changes: ChangeRepository)`

**Input:** none

**Returns:** `Promise<Change[]>` — all active changes, oldest first.

---

### ListDrafts

Lists all drafted (shelved) changes.

**Constructor:** `new ListDrafts(changes: ChangeRepository)`

**Input:** none

**Returns:** `Promise<Change[]>` — all drafted changes, oldest first.

---

### ListDiscarded

Lists all discarded changes.

**Constructor:** `new ListDiscarded(changes: ChangeRepository)`

**Input:** none

**Returns:** `Promise<Change[]>` — all discarded changes, oldest first.

---

### ListArchived

Lists all archived changes.

**Constructor:** `new ListArchived(archive: ArchiveRepository)`

**Input:** none

**Returns:** `Promise<ArchivedChange[]>` — all archived changes, oldest first.

---

### GetArchivedChange

Retrieves a single archived change by name.

**Constructor:** `new GetArchivedChange(archive: ArchiveRepository)`

**Input:**

| Field  | Type     | Required | Description                 |
| ------ | -------- | -------- | --------------------------- |
| `name` | `string` | yes      | The change name to look up. |

**Returns:** `Promise<ArchivedChange>`

**Throws:**

| Error                 | Condition                                      |
| --------------------- | ---------------------------------------------- |
| `ChangeNotFoundError` | No archived change with the given name exists. |

---

## Approvals

### ApproveSpec

Records a spec approval and transitions the change to `spec-approved`. Requires the spec approval gate to be enabled. Artifact hashes are computed internally from the change's artifacts on disk, applying schema-defined pre-hash cleanup rules.

Once prerequisites are ready, the approval event and state transition are persisted through `ChangeRepository.mutate(...)` on fresh change state.

**Constructor:** `new ApproveSpec(changes: ChangeRepository, actor: ActorResolver, schemaProvider: SchemaProvider, hasher: ContentHasher)`

**Input:**

| Field           | Type      | Required | Description                                         |
| --------------- | --------- | -------- | --------------------------------------------------- |
| `name`          | `string`  | yes      | The change to approve the spec for.                 |
| `reason`        | `string`  | yes      | Free-text rationale recorded in the approval event. |
| `approvalsSpec` | `boolean` | yes      | Whether the spec approval gate is enabled.          |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                         | Condition                                       |
| ----------------------------- | ----------------------------------------------- |
| `ApprovalGateDisabledError`   | `approvalsSpec` is `false`.                     |
| `ChangeNotFoundError`         | No change with the given name exists.           |
| `InvalidStateTransitionError` | Change is not in `pending-spec-approval` state. |

---

### ApproveSignoff

Records a sign-off and transitions the change to `signed-off`. Requires the signoff gate to be enabled. Artifact hashes are computed internally.

Once prerequisites are ready, the sign-off event and state transition are persisted through `ChangeRepository.mutate(...)` on fresh change state.

**Constructor:** `new ApproveSignoff(changes: ChangeRepository, actor: ActorResolver, schemaProvider: SchemaProvider, hasher: ContentHasher)`

**Input:**

| Field              | Type      | Required | Description                                         |
| ------------------ | --------- | -------- | --------------------------------------------------- |
| `name`             | `string`  | yes      | The change to sign off.                             |
| `reason`           | `string`  | yes      | Free-text rationale recorded in the sign-off event. |
| `approvalsSignoff` | `boolean` | yes      | Whether the signoff gate is enabled.                |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                         | Condition                                 |
| ----------------------------- | ----------------------------------------- |
| `ApprovalGateDisabledError`   | `approvalsSignoff` is `false`.            |
| `ChangeNotFoundError`         | No change with the given name exists.     |
| `InvalidStateTransitionError` | Change is not in `pending-signoff` state. |

---

## Archiving

### ArchiveChange

Finalises a completed change: runs pre-archive hooks, merges delta artifacts into the project specs, moves the change to the archive, runs post-archive hooks, and regenerates spec metadata. The change must be in `archivable` state.

Only the initial persisted move into `archiving` is serialized through `ChangeRepository.mutate(...)`; overlap checks, hooks, spec sync, archive storage, and metadata generation remain outside that critical section.

This use case is the most port-intensive — it composes `RunStepHooks`, `GenerateSpecMetadata`, and `SaveSpecMetadata` alongside five direct ports.

**Constructor:**

```typescript
new ArchiveChange(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,
  archive: ArchiveRepository,
  runStepHooks: RunStepHooks,
  actor: ActorResolver,
  parsers: ArtifactParserRegistry,
  schemaProvider: SchemaProvider,
  generateMetadata: GenerateSpecMetadata,
  saveMetadata: SaveSpecMetadata,
)
```

**Input:**

| Field       | Type      | Required | Description                                                     |
| ----------- | --------- | -------- | --------------------------------------------------------------- |
| `name`      | `string`  | yes      | The change name to archive.                                     |
| `skipHooks` | `boolean` | no       | When `true`, skips all `run:` hook execution. Default: `false`. |

**Returns:** `Promise<ArchiveChangeResult>`

```typescript
interface ArchiveChangeResult {
  archivedChange: ArchivedChange
  archiveDirPath: string // absolute path to the archive directory
  postHookFailures: string[] // commands of post-hooks that failed; empty on full success
  staleMetadataSpecPaths: string[] // spec IDs where metadata generation failed
}
```

**Throws:**

| Error                         | Condition                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| `ChangeNotFoundError`         | No change with the given name exists.                                |
| `SchemaNotFoundError`         | The schema reference cannot be resolved.                             |
| `SchemaMismatchError`         | The active schema name differs from the one on record in the change. |
| `InvalidStateTransitionError` | Change is not in `archivable` state.                                 |
| `HookFailedError`             | A pre-archive `run:` hook exited with a non-zero code.               |

---

## Validation

### ValidateArtifacts

Validates a change's artifact files against the active schema and marks them complete. This is the only path through which an artifact can reach `'complete'` status.

Also enforces approval invalidation: if any artifact's content has changed since an approval was recorded, an `invalidated` event is appended.

Validation and file reads happen outside the lock; the final persisted invalidation, `markComplete(...)`, and `setSpecDependsOn(...)` updates are applied through `ChangeRepository.mutate(...)` on a fresh reload.

**Constructor:**

```typescript
new ValidateArtifacts(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  parsers: ArtifactParserRegistry,
  actor: ActorResolver,
  hasher: ContentHasher,
)
```

**Input:**

| Field        | Type     | Required | Description                                                                              |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------------------- |
| `name`       | `string` | yes      | The change name to validate.                                                             |
| `specPath`   | `string` | yes      | The spec path to validate, encoded as `<workspace>:<capability-path>`.                   |
| `artifactId` | `string` | no       | When present, only this artifact is validated; the required-artifacts check is bypassed. |

**Returns:** `Promise<ValidateArtifactsResult>`

```typescript
interface ValidateArtifactsResult {
  passed: boolean
  failures: ValidationFailure[]
  warnings: ValidationWarning[]
}

interface ValidationFailure {
  artifactId: string
  description: string
}

interface ValidationWarning {
  artifactId: string
  description: string
}
```

**Throws:**

| Error                  | Condition                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| `ChangeNotFoundError`  | No change with the given name exists.                               |
| `SchemaNotFoundError`  | The schema reference cannot be resolved.                            |
| `SchemaMismatchError`  | The active schema name differs from the one recorded on the change. |
| `SpecNotInChangeError` | The given `specPath` is not in the change's `specIds`.              |

---

### ValidateSpecs

Validates existing spec artifacts (not change artifacts) against the active schema's structural rules. Supports validating a single spec, all specs in a workspace, or all specs across all workspaces.

**Constructor:**

```typescript
new ValidateSpecs(
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  parsers: ArtifactParserRegistry,
)
```

**Input:**

| Field       | Type     | Required | Description                                                                             |
| ----------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| `specPath`  | `string` | no       | Single spec in `workspace:capability-path` format. Mutually exclusive with `workspace`. |
| `workspace` | `string` | no       | Validate all specs in this workspace. Mutually exclusive with `specPath`.               |

When both fields are absent, all specs across all workspaces are validated.

**Returns:** `Promise<ValidateSpecsResult>`

```typescript
interface ValidateSpecsResult {
  entries: SpecValidationEntry[]
  totalSpecs: number
  passed: number
  failed: number
}

interface SpecValidationEntry {
  spec: string // qualified label 'workspace:path'
  passed: boolean
  failures: ValidationFailure[]
  warnings: ValidationWarning[]
}
```

**Throws:**

| Error                    | Condition                                |
| ------------------------ | ---------------------------------------- |
| `SchemaNotFoundError`    | The schema reference cannot be resolved. |
| `WorkspaceNotFoundError` | The given workspace does not exist.      |
| `SpecNotFoundError`      | The given `specPath` does not exist.     |

---

### ValidateSchema

Validates a schema file via one of three modes. Returns structured results rather than throwing for validation failures.

**Constructor:**

```typescript
new ValidateSchema(
  schemas: SchemaRegistry,
  schemaRef: string,
  buildSchemaFn: (ref: string, data: SchemaYamlData, templates: ReadonlyMap<string, string>) => Schema,
  resolveSchema: ResolveSchema,
)
```

**Input:**

```typescript
type ValidateSchemaInput =
  | { mode: 'project' } // fully resolved (extends + plugins + overrides)
  | { mode: 'project-raw' } // base schema only, no plugins or overrides
  | { mode: 'file'; filePath: string } // external file with extends chain resolution
```

**Returns:** `Promise<ValidateSchemaResult>`

```typescript
type ValidateSchemaResult =
  | { valid: true; schema: Schema; warnings: string[] }
  | { valid: false; errors: string[]; warnings: string[] }
```

Does not throw for validation failures — errors are returned in the result's `errors` array.

---

## Specs

### ListSpecs

Lists all specs across all configured workspaces, resolving title and optionally a short summary or metadata freshness status per spec.

**Constructor:** `new ListSpecs(specRepos: ReadonlyMap<string, SpecRepository>, hasher: ContentHasher, yaml: YamlSerializer)`

**Input (options object):**

| Option                  | Type      | Description                                                   |
| ----------------------- | --------- | ------------------------------------------------------------- |
| `includeSummary`        | `boolean` | Resolve a short description per spec. Default: `false`.       |
| `includeMetadataStatus` | `boolean` | Resolve metadata freshness status per spec. Default: `false`. |

**Returns:** `Promise<SpecListEntry[]>`

```typescript
interface SpecListEntry {
  workspace: string
  path: string
  title: string // from metadata title, or last path segment as fallback
  summary?: string // present only when includeSummary is true
  metadataStatus?: SpecMetadataStatus // present only when includeMetadataStatus is true
}

type SpecMetadataStatus = 'fresh' | 'stale' | 'invalid' | 'missing'
```

---

### GetSpec

Loads a spec and all of its artifact files.

**Constructor:** `new GetSpec(specRepos: ReadonlyMap<string, SpecRepository>)`

**Input:**

| Field       | Type       | Required | Description                         |
| ----------- | ---------- | -------- | ----------------------------------- |
| `workspace` | `string`   | yes      | The workspace name.                 |
| `specPath`  | `SpecPath` | yes      | The spec path within the workspace. |

**Returns:** `Promise<GetSpecResult>`

```typescript
interface GetSpecResult {
  spec: Spec
  artifacts: Map<string, SpecArtifact> // keyed by filename
}
```

**Throws:**

| Error                    | Condition                     |
| ------------------------ | ----------------------------- |
| `WorkspaceNotFoundError` | The workspace does not exist. |
| `SpecNotFoundError`      | The spec does not exist.      |

---

### GetSpecContext

Builds structured context entries for a single spec, optionally following `dependsOn` links transitively. Uses metadata freshness checks — when metadata is stale or absent, returns a minimal stale entry.

**Constructor:** `new GetSpecContext(specs: ReadonlyMap<string, SpecRepository>, hasher: ContentHasher)`

**Input:**

| Field        | Type                                    | Required | Description                                                                          |
| ------------ | --------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `workspace`  | `string`                                | yes      | The workspace name.                                                                  |
| `specPath`   | `SpecPath`                              | yes      | The spec path within the workspace.                                                  |
| `followDeps` | `boolean`                               | no       | When `true`, follows `dependsOn` links transitively.                                 |
| `depth`      | `number`                                | no       | Limits traversal depth. Only meaningful with `followDeps`.                           |
| `sections`   | `ReadonlyArray<SpecContextSectionFlag>` | no       | Restricts output to listed section types: `'rules'`, `'constraints'`, `'scenarios'`. |

**Returns:** `Promise<GetSpecContextResult>`

```typescript
interface GetSpecContextResult {
  entries: readonly SpecContextEntry[]
  warnings: readonly ContextWarning[]
}

interface SpecContextEntry {
  spec: string // display label 'workspace:path'
  title?: string
  description?: string
  rules?: ReadonlyArray<{ requirement: string; rules: string[] }>
  constraints?: readonly string[]
  scenarios?: ReadonlyArray<{
    requirement: string
    name: string
    given?: string[]
    when?: string[]
    then?: string[]
  }>
  stale: boolean // true when metadata is absent or stale
}
```

**Throws:**

| Error                    | Condition                     |
| ------------------------ | ----------------------------- |
| `WorkspaceNotFoundError` | The workspace does not exist. |
| `SpecNotFoundError`      | The spec does not exist.      |

---

### UpdateSpecDeps

Updates the declared `dependsOn` dependencies for a single spec within a change. Dependencies are stored in `change.specDependsOn` and used by `CompileContext` as the highest-priority source for `dependsOn` resolution.

After input validation, the persisted `specDependsOn` update is applied through `ChangeRepository.mutate(...)`.

**Constructor:** `new UpdateSpecDeps(changes: ChangeRepository)`

**Input:**

| Field    | Type                | Required | Description                                                                     |
| -------- | ------------------- | -------- | ------------------------------------------------------------------------------- |
| `name`   | `string`            | yes      | The change name.                                                                |
| `specId` | `string`            | yes      | The spec whose dependencies are being updated.                                  |
| `add`    | `readonly string[]` | no       | Dependency spec IDs to add. Mutually exclusive with `set`.                      |
| `remove` | `readonly string[]` | no       | Dependency spec IDs to remove. Mutually exclusive with `set`.                   |
| `set`    | `readonly string[]` | no       | Replace all dependencies for this spec. Mutually exclusive with `add`/`remove`. |

**Returns:** `Promise<UpdateSpecDepsResult>`

```typescript
interface UpdateSpecDepsResult {
  specId: string
  dependsOn: readonly string[]
}
```

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

## Spec metadata

### GenerateSpecMetadata

Generates `metadata.json` content deterministically from schema-declared extraction rules, without LLM involvement. Resolves `dependsOn` paths via the spec repository and computes SHA-256 content hashes for freshness tracking.

**Constructor:**

```typescript
new GenerateSpecMetadata(
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  parsers: ArtifactParserRegistry,
  hasher: ContentHasher,
)
```

**Input:**

| Field    | Type     | Required | Description                                                             |
| -------- | -------- | -------- | ----------------------------------------------------------------------- |
| `specId` | `string` | yes      | The full spec ID (e.g. `'core/change'` or `'billing:invoices/create'`). |

**Returns:** `Promise<GenerateSpecMetadataResult>`

```typescript
interface GenerateSpecMetadataResult {
  metadata: SpecMetadata // the generated metadata object
  hasExtraction: boolean // false when the schema has no metadataExtraction
}
```

**Throws:**

| Error                    | Condition                                          |
| ------------------------ | -------------------------------------------------- |
| `SchemaNotFoundError`    | The schema reference cannot be resolved.           |
| `WorkspaceNotFoundError` | The workspace parsed from `specId` does not exist. |
| `SpecNotFoundError`      | The spec does not exist.                           |

---

### SaveSpecMetadata

Writes metadata for a spec. Validates the content against the strict metadata schema before writing. Performs conflict detection using `originalHash` unless `force` is set.

**Constructor:** `new SaveSpecMetadata(specRepos: ReadonlyMap<string, SpecRepository>)`

**Input:**

| Field       | Type       | Required | Description                                            |
| ----------- | ---------- | -------- | ------------------------------------------------------ |
| `workspace` | `string`   | yes      | The workspace name.                                    |
| `specPath`  | `SpecPath` | yes      | The spec path within the workspace.                    |
| `content`   | `string`   | yes      | Raw JSON string to write as metadata.                  |
| `force`     | `boolean`  | no       | Skip conflict detection and overwrite unconditionally. |

**Returns:** `Promise<SaveSpecMetadataResult | null>`

```typescript
interface SaveSpecMetadataResult {
  spec: string // qualified label 'workspace:path'
}
```

Returns `null` if the spec does not exist.

**Throws:**

| Error                     | Condition                                                                |
| ------------------------- | ------------------------------------------------------------------------ |
| `MetadataValidationError` | The content fails structural validation.                                 |
| `ArtifactConflictError`   | A concurrent modification is detected and `force` is not set.            |
| `DependsOnOverwriteError` | Existing `dependsOn` would be overwritten by non-matching incoming deps. |
| `WorkspaceNotFoundError`  | The workspace does not exist.                                            |
| `SpecNotFoundError`       | The spec does not exist.                                                 |

---

### InvalidateSpecMetadata

Invalidates a spec's metadata by removing its `contentHashes`. Without `contentHashes`, the metadata is treated as stale, forcing regeneration on the next metadata pass. All other fields are preserved.

**Constructor:** `new InvalidateSpecMetadata(specRepos: ReadonlyMap<string, SpecRepository>)`

**Input:**

| Field       | Type       | Required | Description                         |
| ----------- | ---------- | -------- | ----------------------------------- |
| `workspace` | `string`   | yes      | The workspace name.                 |
| `specPath`  | `SpecPath` | yes      | The spec path within the workspace. |

**Returns:** `Promise<InvalidateSpecMetadataResult | null>` — returns `null` when no metadata file exists.

```typescript
interface InvalidateSpecMetadataResult {
  spec: string // qualified label 'workspace:path'
}
```

**Throws:**

| Error                    | Condition                     |
| ------------------------ | ----------------------------- |
| `WorkspaceNotFoundError` | The workspace does not exist. |
| `SpecNotFoundError`      | The spec does not exist.      |

---

## Schema

### ResolveSchema

Orchestrates the full schema resolution pipeline: resolves the base schema, walks the `extends` chain, resolves plugins, applies merge layers, and builds the final `Schema` entity.

**Constructor:**

```typescript
new ResolveSchema(
  schemas: SchemaRegistry,
  schemaRef: string,       // project schema reference from specd.yaml
  schemaPlugins: readonly string[],
  schemaOverrides: SchemaOperations | undefined,
)
```

**Input:** none (parameters are bound at construction time)

**Returns:** `Promise<Schema>` — the fully resolved Schema entity.

**Throws:**

| Error                   | Condition                                                   |
| ----------------------- | ----------------------------------------------------------- |
| `SchemaNotFoundError`   | The base schema or any plugin reference cannot be resolved. |
| `SchemaValidationError` | The resolved schema is structurally invalid.                |

---

### GetActiveSchema

Resolves and returns the active schema for the project. A thin delegation to `ResolveSchema` with no additional logic.

**Constructor:** `new GetActiveSchema(resolveSchema: ResolveSchema)`

**Input:** none

**Returns:** `Promise<Schema>`

**Throws:** same as `ResolveSchema`.

---

## Context

### CompileContext

Assembles the structured context an AI agent receives when entering a lifecycle step. Collects context specs via a five-step include/exclude/dependsOn resolution pipeline, evaluates step availability, and returns structured project context entries, spec entries with tier classification, and all workflow steps with availability status.

Artifact instructions and hook instructions are separate concerns handled by `GetArtifactInstruction` and `GetHookInstructions`.

**Constructor:**

```typescript
new CompileContext(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  files: FileReader,
  parsers: ArtifactParserRegistry,
  hasher: ContentHasher,
)
```

**Input:**

| Field        | Type                         | Required | Description                                                                                         |
| ------------ | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `name`       | `string`                     | yes      | The change name to compile context for.                                                             |
| `step`       | `string`                     | yes      | The lifecycle step being entered (e.g. `'designing'`, `'implementing'`).                            |
| `config`     | `CompileContextConfig`       | yes      | Resolved project configuration subset.                                                              |
| `followDeps` | `boolean`                    | no       | When `true`, performs the `dependsOn` transitive traversal (step 5).                                |
| `depth`      | `number`                     | no       | Limits `dependsOn` traversal depth. Only meaningful with `followDeps`.                              |
| `sections`   | `ReadonlyArray<SpecSection>` | no       | Restricts metadata sections rendered per full-mode spec: `'rules'`, `'constraints'`, `'scenarios'`. |

**`CompileContextConfig`:**

```typescript
interface CompileContextConfig {
  context?: Array<{ instruction: string } | { file: string }>
  contextIncludeSpecs?: string[]
  contextExcludeSpecs?: string[]
  contextMode?: 'full' | 'lazy' // default: 'lazy'
  workspaces?: Record<
    string,
    {
      contextIncludeSpecs?: string[]
      contextExcludeSpecs?: string[]
    }
  >
}
```

In `'lazy'` mode, specs from `specIds` and `specDependsOn` are rendered in full; all other matched specs are rendered as summaries (title and description only). In `'full'` mode, all specs are rendered with full content.

**Returns:** `Promise<CompileContextResult>`

```typescript
interface CompileContextResult {
  stepAvailable: boolean
  blockingArtifacts: readonly string[]
  projectContext: readonly ProjectContextEntry[]
  specs: readonly ContextSpecEntry[]
  availableSteps: readonly AvailableStep[]
  warnings: readonly ContextWarning[]
}

interface ProjectContextEntry {
  source: 'instruction' | 'file'
  path?: string
  content: string
}

interface ContextSpecEntry {
  specId: string
  title: string
  description: string
  source: 'specIds' | 'specDependsOn' | 'includePattern' | 'dependsOnTraversal'
  mode: 'full' | 'summary'
  content?: string // present only when mode is 'full'
}

interface AvailableStep {
  step: string
  available: boolean
  blockingArtifacts: readonly string[]
}
```

**Throws:**

| Error                 | Condition                                                           |
| --------------------- | ------------------------------------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists.                               |
| `SchemaNotFoundError` | The schema reference cannot be resolved.                            |
| `SchemaMismatchError` | The active schema name differs from the one recorded on the change. |

---

### GetProjectContext

Compiles the project-level context block without a specific change or lifecycle step. Performs steps 1–4 of the context pipeline (project `context:` entries, project-level and workspace-level include/exclude patterns) with all configured workspaces treated as active. Step 5 (dependsOn traversal from a change's `specIds`) is not performed.

**Constructor:**

```typescript
new GetProjectContext(
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  files: FileReader,
  parsers: ArtifactParserRegistry,
  hasher: ContentHasher,
)
```

**Input:**

| Field        | Type                         | Required | Description                                                            |
| ------------ | ---------------------------- | -------- | ---------------------------------------------------------------------- |
| `config`     | `CompileContextConfig`       | yes      | Resolved project configuration.                                        |
| `followDeps` | `boolean`                    | no       | Follows `dependsOn` links from included specs. Default: `false`.       |
| `depth`      | `number`                     | no       | Limits traversal depth. Only meaningful with `followDeps`.             |
| `sections`   | `ReadonlyArray<SpecSection>` | no       | Restricts sections rendered per spec. Same values as `CompileContext`. |

**Returns:** `Promise<GetProjectContextResult>`

```typescript
interface GetProjectContextResult {
  contextEntries: string[]
  specs: ContextSpecEntry[]
  warnings: ContextWarning[]
}
```

**Throws:**

| Error                 | Condition                                |
| --------------------- | ---------------------------------------- |
| `SchemaNotFoundError` | The schema reference cannot be resolved. |

---

### GetArtifactInstruction

Returns artifact-specific instructions: the schema `instruction:` text, composition rules (`rules.pre`/`rules.post`), and delta guidance with existing artifact outlines. Rule entries use `instruction:` text too. Read-only — never modifies state or executes commands.

When `artifactId` is omitted, auto-resolves the next artifact to work on by walking the schema's artifact dependency graph.

**Constructor:**

```typescript
new GetArtifactInstruction(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,
  schemaProvider: SchemaProvider,
  parsers: ArtifactParserRegistry,
  templates: TemplateExpander,
)
```

**Input:**

| Field        | Type     | Required | Description                                                             |
| ------------ | -------- | -------- | ----------------------------------------------------------------------- |
| `name`       | `string` | yes      | The change name.                                                        |
| `artifactId` | `string` | no       | The artifact ID. When absent, the next incomplete artifact is resolved. |

**Returns:** `Promise<GetArtifactInstructionResult>`

```typescript
interface GetArtifactInstructionResult {
  artifactId: string
  rulesPre: readonly string[]
  instruction: string | null
  template: string | null
  delta: {
    formatInstructions: string
    domainInstructions: string | null
    outlines: readonly { specId: string; outline: readonly OutlineEntry[] }[]
  } | null
  rulesPost: readonly string[]
}
```

**Throws:**

| Error                   | Condition                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `ChangeNotFoundError`   | No change with the given name exists.                                                  |
| `SchemaNotFoundError`   | The schema reference cannot be resolved.                                               |
| `SchemaMismatchError`   | The active schema name differs from the one recorded on the change.                    |
| `ArtifactNotFoundError` | The given `artifactId` does not exist in the schema, or auto-resolution found nothing. |

---

## Hooks

### RunStepHooks

Executes `run:` hooks for a given workflow step and phase. Resolves hooks from the schema, builds template variables from the active change, and executes them via `HookRunner`.

Pre-phase hooks use fail-fast semantics (stop on first failure). Post-phase hooks use fail-soft semantics (run all, collect failures).

For post-archive hooks, falls back to reading from `ArchiveRepository` when the change has already been moved to the archive.

**Constructor:**

```typescript
new RunStepHooks(
  changes: ChangeRepository,
  archive: ArchiveRepository,
  hooks: HookRunner,
  schemaProvider: SchemaProvider,
)
```

**Input:**

| Field   | Type              | Required | Description                                                 |
| ------- | ----------------- | -------- | ----------------------------------------------------------- |
| `name`  | `string`          | yes      | The change name.                                            |
| `step`  | `string`          | yes      | The workflow step name (e.g. `'designing'`, `'archiving'`). |
| `phase` | `'pre' \| 'post'` | yes      | The hook phase to execute.                                  |
| `only`  | `string`          | no       | When present, executes only the hook with this ID.          |

The `execute` method accepts an optional `onProgress: OnHookProgress` callback.

**Returns:** `Promise<RunStepHooksResult>`

```typescript
interface RunStepHooksResult {
  hooks: readonly RunStepHookEntry[]
  success: boolean
  failedHook: RunStepHookEntry | null
}

interface RunStepHookEntry {
  id: string
  command: string
  exitCode: number
  stdout: string
  stderr: string
  success: boolean
}
```

**Throws:**

| Error                 | Condition                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `ChangeNotFoundError` | No change (or archived change, for post-archive) with the given name.         |
| `SchemaMismatchError` | The active schema name differs from the one recorded on the change.           |
| `StepNotValidError`   | The given `step` is not a valid `ChangeState`.                                |
| `HookNotFoundError`   | The `only` filter references a non-existent hook or a hook of the wrong type. |

---

### GetHookInstructions

Returns instruction text for `instruction:` hooks at a given step and phase. Read-only — never executes commands or modifies state.

**Constructor:**

```typescript
new GetHookInstructions(
  changes: ChangeRepository,
  archive: ArchiveRepository,
  schemaProvider: SchemaProvider,
  templates: TemplateExpander,
)
```

**Input:**

| Field   | Type              | Required | Description                                                   |
| ------- | ----------------- | -------- | ------------------------------------------------------------- |
| `name`  | `string`          | yes      | The change name.                                              |
| `step`  | `string`          | yes      | The workflow step name.                                       |
| `phase` | `'pre' \| 'post'` | yes      | The hook phase.                                               |
| `only`  | `string`          | no       | When present, returns only the instruction hook with this ID. |

**Returns:** `Promise<GetHookInstructionsResult>`

```typescript
interface GetHookInstructionsResult {
  phase: 'pre' | 'post'
  instructions: readonly { id: string; text: string }[]
}
```

**Throws:**

| Error                 | Condition                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `ChangeNotFoundError` | No change (or archived change, for post-archive) with the given name.         |
| `SchemaMismatchError` | The active schema name differs from the one recorded on the change.           |
| `StepNotValidError`   | The given `step` is not a valid `ChangeState`.                                |
| `HookNotFoundError`   | The `only` filter references a non-existent hook or a hook of the wrong type. |

---

## Project initialisation

### InitProject

Initialises a new specd project by writing `specd.yaml`, creating storage directories, and updating `.gitignore`. Delegates all filesystem operations to the `ConfigWriter` port.

**Constructor:** `new InitProject(writer: ConfigWriter)`

**Input:**

| Field         | Type      | Required | Description                                                    |
| ------------- | --------- | -------- | -------------------------------------------------------------- |
| `projectRoot` | `string`  | yes      | The directory to initialise (absolute path).                   |
| `schemaRef`   | `string`  | yes      | Schema reference string (e.g. `'@specd/schema-std'`).          |
| `workspaceId` | `string`  | yes      | The default workspace name (e.g. `'default'`).                 |
| `specsPath`   | `string`  | yes      | Relative path for the specs directory (e.g. `'specs/'`).       |
| `force`       | `boolean` | no       | When `true`, overwrite an existing `specd.yaml` without error. |

**Returns:** `Promise<InitProjectResult>`

```typescript
interface InitProjectResult {
  configPath: string // absolute path to the created specd.yaml
  schemaRef: string
  workspaces: readonly string[]
}
```

**Throws:**

| Error                     | Condition                                           |
| ------------------------- | --------------------------------------------------- |
| `AlreadyInitialisedError` | `specd.yaml` already exists and `force` is not set. |

---

## Skills

### GetSkillsManifest

Reads the installed skills manifest from `specd.yaml`.

**Constructor:** `new GetSkillsManifest(writer: ConfigWriter)`

**Input:**

| Field        | Type     | Required | Description                                |
| ------------ | -------- | -------- | ------------------------------------------ |
| `configPath` | `string` | yes      | Absolute path to the `specd.yaml` to read. |

**Returns:** `Promise<Record<string, string[]>>` — a map of agent name to installed skill names.

---

### RecordSkillInstall

Records that a set of skills was installed for an agent by merging the skill names into the `skills` key of `specd.yaml`.

**Constructor:** `new RecordSkillInstall(writer: ConfigWriter)`

**Input:**

| Field        | Type                | Required | Description                                  |
| ------------ | ------------------- | -------- | -------------------------------------------- |
| `configPath` | `string`            | yes      | Absolute path to the `specd.yaml` to update. |
| `agent`      | `string`            | yes      | The agent name (e.g. `'claude'`).            |
| `skillNames` | `readonly string[]` | yes      | The skill names to record.                   |

**Returns:** `Promise<void>`
