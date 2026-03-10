# Use Cases

Use cases are the entry points to `@specd/core`'s business logic. Each use case is a class with a single `execute(input)` method. You construct them once (injecting the ports they need) and call `execute` for each operation.

All use cases are exported from `@specd/core`.

## Construction pattern

Every use case follows the same pattern:

```typescript
import { CreateChange, type ChangeRepository, type ActorResolver } from '@specd/core'

const createChange = new CreateChange(changeRepo, actor)
const change = await createChange.execute({
  name: 'add-oauth-login',
  workspaces: ['default'],
  specIds: ['auth/oauth'],
  schemaName: 'spec-driven',
  schemaVersion: 1,
})
```

Use cases are stateless between calls — constructing one instance and reusing it is fine. Dependencies are resolved at construction time; they do not change per call.

---

## Change management

### CreateChange

Creates a new change and persists it to the repository. The initial history contains a single `created` event.

**Constructor:** `new CreateChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field           | Type       | Description                                   |
| --------------- | ---------- | --------------------------------------------- |
| `name`          | `string`   | Unique slug name (e.g. `'add-oauth-login'`).  |
| `workspaces`    | `string[]` | Workspace IDs this change belongs to.         |
| `specIds`       | `string[]` | Spec paths being created or modified.         |
| `schemaName`    | `string`   | Schema name from the active config.           |
| `schemaVersion` | `number`   | Schema version number from the active config. |

**Returns:** `Promise<Change>` — the newly created change.

**Throws:**

| Error                      | Condition                                    |
| -------------------------- | -------------------------------------------- |
| `ChangeAlreadyExistsError` | A change with the given name already exists. |

---

### GetStatus

Loads a change and reports its current lifecycle state and artifact statuses. Artifact statuses are computed with dependency cascade: an artifact with a matching hash is still `'in-progress'` if any of its `requires` dependencies are not `'complete'`.

**Constructor:** `new GetStatus(changes: ChangeRepository)`

**Input:**

| Field  | Type     | Description                 |
| ------ | -------- | --------------------------- |
| `name` | `string` | The change name to look up. |

**Returns:** `Promise<GetStatusResult>`

```typescript
interface GetStatusResult {
  change: Change
  artifactStatuses: ArtifactStatusEntry[]
}

interface ArtifactStatusEntry {
  type: string // artifact type ID
  effectiveStatus: ArtifactStatus
}
```

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### TransitionChange

Advances the change lifecycle from its current state to the requested target. Handles the two approval-gate routing points:

- `ready → implementing` is redirected to `ready → pending-spec-approval` when `approvalsSpec: true`.
- `done → archivable` is redirected to `done → pending-signoff` when `approvalsSignoff: true`.

**Constructor:** `new TransitionChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field                  | Type                           | Description                                                             |
| ---------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `name`                 | `string`                       | The change to transition.                                               |
| `to`                   | `ChangeState`                  | The requested target state.                                             |
| `approvalsSpec`        | `boolean`                      | Whether the spec approval gate is enabled.                              |
| `approvalsSignoff`     | `boolean`                      | Whether the signoff gate is enabled.                                    |
| `contextSpecIds`       | `string[]` (optional)          | Context spec paths to set when transitioning `designing → ready`.       |
| `implementingRequires` | `readonly string[]` (optional) | Artifact IDs whose validation is cleared on `verifying → implementing`. |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                         | Condition                                               |
| ----------------------------- | ------------------------------------------------------- |
| `ChangeNotFoundError`         | No change with the given name exists.                   |
| `InvalidStateTransitionError` | The transition is not permitted from the current state. |

---

### DraftChange

Shelves a change to `drafts/`, appending a `drafted` event to its history. The change retains its full lifecycle state and can be restored at any time.

**Constructor:** `new DraftChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field    | Type                | Description               |
| -------- | ------------------- | ------------------------- |
| `name`   | `string`            | The change to shelve.     |
| `reason` | `string` (optional) | Explanation for shelving. |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### RestoreChange

Recovers a drafted change back to `changes/`, appending a `restored` event.

**Constructor:** `new RestoreChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field  | Type     | Description                    |
| ------ | -------- | ------------------------------ |
| `name` | `string` | The drafted change to restore. |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

### DiscardChange

Permanently abandons a change, appending a `discarded` event. The change is moved to `discarded/`. This operation cannot be undone.

**Constructor:** `new DiscardChange(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field          | Type                  | Description                           |
| -------------- | --------------------- | ------------------------------------- |
| `name`         | `string`              | The change to permanently discard.    |
| `reason`       | `string`              | Mandatory explanation for discarding. |
| `supersededBy` | `string[]` (optional) | Change names that replace this one.   |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                 | Condition                             |
| --------------------- | ------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists. |

---

## Approvals

### ApproveSpec

Records a spec approval and transitions the change to `spec-approved`. Requires the spec approval gate (`approvals.spec: true`) to be enabled. The caller is responsible for collecting current artifact hashes and passing them in — they are recorded in the `spec-approved` event for audit purposes.

**Constructor:** `new ApproveSpec(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field            | Type                     | Description                                         |
| ---------------- | ------------------------ | --------------------------------------------------- |
| `name`           | `string`                 | The change to approve the spec for.                 |
| `reason`         | `string`                 | Free-text rationale recorded in the approval event. |
| `artifactHashes` | `Record<string, string>` | Hashes of the artifacts reviewed.                   |
| `approvalsSpec`  | `boolean`                | Whether the spec approval gate is enabled.          |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                         | Condition                                       |
| ----------------------------- | ----------------------------------------------- |
| `ApprovalGateDisabledError`   | `approvalsSpec` is `false`.                     |
| `ChangeNotFoundError`         | No change with the given name exists.           |
| `InvalidStateTransitionError` | Change is not in `pending-spec-approval` state. |

---

### ApproveSignoff

Records a sign-off and transitions the change to `signed-off`. Requires the signoff gate (`approvals.signoff: true`) to be enabled. The caller is responsible for collecting current artifact hashes.

**Constructor:** `new ApproveSignoff(changes: ChangeRepository, actor: ActorResolver)`

**Input:**

| Field              | Type                     | Description                                         |
| ------------------ | ------------------------ | --------------------------------------------------- |
| `name`             | `string`                 | The change to sign off.                             |
| `reason`           | `string`                 | Free-text rationale recorded in the sign-off event. |
| `artifactHashes`   | `Record<string, string>` | Hashes of the artifacts reviewed.                   |
| `approvalsSignoff` | `boolean`                | Whether the signoff gate is enabled.                |

**Returns:** `Promise<Change>` — the updated change.

**Throws:**

| Error                         | Condition                                 |
| ----------------------------- | ----------------------------------------- |
| `ApprovalGateDisabledError`   | `approvalsSignoff` is `false`.            |
| `ChangeNotFoundError`         | No change with the given name exists.     |
| `InvalidStateTransitionError` | Change is not in `pending-signoff` state. |

---

## Archiving and validation

### ArchiveChange

Finalises a completed change: merges delta artifacts into the project specs, moves the change directory to the archive, and fires lifecycle hooks. The change must be in `archivable` state.

This is the most port-intensive use case — it requires all seven ports.

**Constructor:**

```typescript
new ArchiveChange(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,  // keyed by workspace name
  archive: ArchiveRepository,
  hooks: HookRunner,
  actor: ActorResolver,
  git: GitAdapter,
  parsers: ArtifactParserRegistry,
  schemas: SchemaRegistry,
)
```

**Input:**

| Field                   | Type                          | Description                                        |
| ----------------------- | ----------------------------- | -------------------------------------------------- |
| `name`                  | `string`                      | The change name to archive.                        |
| `schemaRef`             | `string`                      | The schema reference string from `specd.yaml`.     |
| `workspaceSchemasPaths` | `ReadonlyMap<string, string>` | Workspace name → schemas path, from config.        |
| `hookVariables`         | `HookVariables`               | Template variable values for `run:` hook commands. |

**Returns:** `Promise<ArchiveChangeResult>`

```typescript
interface ArchiveChangeResult {
  archivedChange: ArchivedChange
  postHookFailures: string[] // commands of post-hooks that failed; empty on full success
  staleMetadataSpecPaths: string[] // spec paths whose .specd-metadata.yaml should be regenerated
}
```

**Throws:**

| Error                         | Condition                                              |
| ----------------------------- | ------------------------------------------------------ |
| `ChangeNotFoundError`         | No change with the given name exists.                  |
| `SchemaNotFoundError`         | The schema reference cannot be resolved.               |
| `InvalidStateTransitionError` | Change is not in `archivable` state.                   |
| `HookFailedError`             | A pre-archive `run:` hook exited with a non-zero code. |

---

### ValidateArtifacts

Validates a change's artifact files against the active schema and marks them complete. This is the only path through which an artifact can reach `'complete'` status. Validates a single spec path at a time.

Also enforces approval invalidation: if any artifact's content has changed since an approval was recorded, an `invalidated` event is appended and the change transitions back to `designing`.

**Constructor:**

```typescript
new ValidateArtifacts(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,  // keyed by workspace name
  schemas: SchemaRegistry,
  parsers: ArtifactParserRegistry,
  actor: ActorResolver,
)
```

**Input:**

| Field                   | Type                          | Description                                                            |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `name`                  | `string`                      | The change name to validate.                                           |
| `specPath`              | `string`                      | The spec path to validate, encoded as `<workspace>/<capability-path>`. |
| `schemaRef`             | `string`                      | The schema reference string from `specd.yaml`.                         |
| `workspaceSchemasPaths` | `ReadonlyMap<string, string>` | Workspace name → schemas path, from config.                            |

**Returns:** `Promise<ValidateArtifactsResult>`

```typescript
interface ValidateArtifactsResult {
  passed: boolean
  failures: ValidationFailure[] // hard errors: missing artifact, failed required rule
  warnings: ValidationWarning[] // soft mismatches: required: false rule was absent
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

| Error                 | Condition                                |
| --------------------- | ---------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists.    |
| `SchemaNotFoundError` | The schema reference cannot be resolved. |

---

## Context

### CompileContext

Assembles the instruction block an AI agent receives when entering a lifecycle step. Collects context specs via the five-step include/exclude/dependsOn resolution, evaluates step availability, and combines schema instructions, artifact rules, spec content, and step hooks into a single structured output.

**Constructor:**

```typescript
new CompileContext(
  changes: ChangeRepository,
  specs: ReadonlyMap<string, SpecRepository>,  // keyed by workspace name
  schemas: SchemaRegistry,
  files: FileReader,
  parsers: ArtifactParserRegistry,
)
```

**Input:**

| Field                   | Type                          | Description                                                                              |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `name`                  | `string`                      | The change name to compile context for.                                                  |
| `step`                  | `string`                      | The lifecycle step being entered (e.g. `'designing'`, `'implementing'`).                 |
| `activeArtifact`        | `string` (optional)           | Artifact ID being generated. When present, only that artifact's instruction is injected. |
| `schemaRef`             | `string`                      | Schema reference string from `specd.yaml`.                                               |
| `workspaceSchemasPaths` | `ReadonlyMap<string, string>` | Workspace name → schemas path, from config.                                              |
| `config`                | `CompileContextConfig`        | Resolved project configuration subset.                                                   |

**`CompileContextConfig`:**

```typescript
interface CompileContextConfig {
  context?: Array<{ instruction: string } | { file: string }>
  contextIncludeSpecs?: string[]
  contextExcludeSpecs?: string[]
  artifactRules?: Record<string, string[]>
  workflow?: readonly WorkflowStep[]
  workspaces?: Record<
    string,
    {
      contextIncludeSpecs?: string[]
      contextExcludeSpecs?: string[]
    }
  >
}
```

**Returns:** `Promise<CompileContextResult>`

```typescript
interface CompileContextResult {
  stepAvailable: boolean // whether the requested step is currently available
  blockingArtifacts: string[] // artifact IDs blocking the step; empty when available
  instructionBlock: string // the fully assembled instruction text for the AI
  warnings: ContextWarning[] // advisory conditions (stale metadata, missing files, etc.)
}

interface ContextWarning {
  type:
    | 'stale-metadata'
    | 'missing-spec'
    | 'unknown-workspace'
    | 'missing-file'
    | 'cycle'
    | 'missing-parser'
  path?: string
  message: string
}
```

**Throws:**

| Error                 | Condition                                |
| --------------------- | ---------------------------------------- |
| `ChangeNotFoundError` | No change with the given name exists.    |
| `SchemaNotFoundError` | The schema reference cannot be resolved. |
