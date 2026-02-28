# Errors

All errors thrown by `@specd/core` extend `SpecdError`. Every concrete error class exposes a machine-readable `code` string for programmatic handling in delivery adapters (CLI exit codes, MCP error responses, HTTP status codes).

All error classes are exported from `@specd/core`.

## SpecdError — base class

```typescript
import { SpecdError } from '@specd/core'

abstract class SpecdError extends Error {
  abstract get code(): string // machine-readable error code
  readonly name: string // set to the concrete class name
  readonly message: string // human-readable description
}
```

Use `instanceof SpecdError` to catch any SpecD error in your adapter before letting it propagate as an unhandled exception.

```typescript
try {
  await createChange.execute(input)
} catch (error) {
  if (error instanceof SpecdError) {
    // error.code — route to appropriate response
    // error.message — surface to user
  }
  throw error // re-throw non-SpecD errors
}
```

---

## Application errors

These are thrown by use cases. They represent conditions the caller can handle gracefully.

### ChangeNotFoundError

**Code:** `'CHANGE_NOT_FOUND'`

Thrown when a use case looks up a change by name and it does not exist in the repository.

```typescript
import { ChangeNotFoundError } from '@specd/core'

// Message: "Change '<name>' not found"
```

**Thrown by:** `GetStatus`, `TransitionChange`, `DraftChange`, `RestoreChange`, `DiscardChange`, `ApproveSpec`, `ApproveSignoff`, `ArchiveChange`, `ValidateArtifacts`, `CompileContext`.

---

### ChangeAlreadyExistsError

**Code:** `'CHANGE_ALREADY_EXISTS'`

Thrown when `CreateChange` is called with a name that is already in use.

```typescript
import { ChangeAlreadyExistsError } from '@specd/core'

// Message: "Change '<name>' already exists"
```

**Thrown by:** `CreateChange`.

---

### ApprovalGateDisabledError

**Code:** `'APPROVAL_GATE_DISABLED'`

Thrown when an approval use case is called but the corresponding gate is not enabled in the active configuration. The caller should check whether the gate is enabled before invoking the use case.

```typescript
import { ApprovalGateDisabledError } from '@specd/core'

// Message: "Approval gate '<gate>' is not enabled in the active configuration"
// gate is 'spec' or 'signoff'
```

**Thrown by:** `ApproveSpec` (when `approvalsSpec: false`), `ApproveSignoff` (when `approvalsSignoff: false`).

---

### SchemaNotFoundError

**Code:** `'SCHEMA_NOT_FOUND'`

Thrown when `SchemaRegistry.resolve()` returns `null` and the caller converts it to an error. The `ref` field of the error message identifies which reference was not found.

```typescript
import { SchemaNotFoundError } from '@specd/core'

// Message: "Schema '<ref>' not found"
```

**Thrown by:** `ArchiveChange`, `ValidateArtifacts`, `CompileContext`.

---

## Domain errors

These are thrown by entities and domain services. Use cases may propagate them to the caller.

### InvalidStateTransitionError

**Code:** `'INVALID_STATE_TRANSITION'`

Thrown when a lifecycle transition is attempted that is not permitted from the current state. See [`VALID_TRANSITIONS`](domain-model.md#changestate-and-valid_transitions) for the complete transition graph.

```typescript
import { InvalidStateTransitionError } from '@specd/core'

// Message: "Cannot transition from '<from>' to '<to>'"
```

**Thrown by:** `TransitionChange`, `ApproveSpec`, `ApproveSignoff`, `ArchiveChange`.

Also thrown directly by `ArchiveRepository.archive()` when the change is not in `archivable` state and `force` is not set.

---

### ApprovalRequiredError

**Code:** `'APPROVAL_REQUIRED'`

Thrown when attempting to archive a change that has structural spec modifications but has not received the required approval.

```typescript
import { ApprovalRequiredError } from '@specd/core'

// Message: "Change '<name>' has structural spec modifications and requires approval before archiving"
```

**Thrown by:** `ArchiveChange`.

---

### HookFailedError

**Code:** `'HOOK_FAILED'`

Thrown when a `run:` pre-hook exits with a non-zero exit code. Carries the command, exit code, and captured stderr so the adapter can surface a detailed error message.

```typescript
import { HookFailedError } from '@specd/core'

try {
  await archiveChange.execute(input)
} catch (error) {
  if (error instanceof HookFailedError) {
    console.error(`Hook failed: ${error.command}`)
    console.error(`Exit code: ${error.exitCode}`)
    console.error(`Stderr: ${error.stderr}`)
  }
}
```

**Additional properties:**

| Property   | Type     | Description                     |
| ---------- | -------- | ------------------------------- |
| `command`  | `string` | The shell command that failed.  |
| `exitCode` | `number` | The non-zero exit code.         |
| `stderr`   | `string` | Captured standard error output. |

**Thrown by:** `ArchiveChange` (pre-archive hooks).

---

### ArtifactConflictError

**Code:** `'ARTIFACT_CONFLICT'`

Thrown when an artifact file was modified on disk between the time it was loaded and the time a save was attempted. This indicates a concurrent write — typically an LLM agent or another process wrote to the file after the caller loaded it.

The error carries both the incoming content (what the caller is trying to write) and the current on-disk content, so the adapter can present a diff to the user.

```typescript
import { ArtifactConflictError } from '@specd/core'

try {
  await specRepo.save(spec, artifact)
} catch (error) {
  if (error instanceof ArtifactConflictError) {
    console.error(`Conflict in: ${error.filename}`)
    // error.incomingContent — what the caller tried to write
    // error.currentContent  — what is currently on disk
    // offer the user: force-save or abort
  }
}
```

**Additional properties:**

| Property          | Type     | Description                                            |
| ----------------- | -------- | ------------------------------------------------------ |
| `filename`        | `string` | The artifact filename where the conflict was detected. |
| `incomingContent` | `string` | Content the caller is trying to write.                 |
| `currentContent`  | `string` | Content currently on disk.                             |

**Thrown by:** `SpecRepository.save()`, `ChangeRepository.saveArtifact()`.

To force-save despite the conflict, retry the call with `{ force: true }`.

---

### DeltaApplicationError

**Code:** `'DELTA_APPLICATION'`

Thrown by `ArtifactParser.apply()` when a selector fails to resolve (no match, ambiguous match) or when a structural conflict is detected in the delta entries (two operations targeting the same node, rename collision, etc.).

```typescript
import { DeltaApplicationError } from '@specd/core'

// Message: human-readable description of the application failure
```

**Thrown by:** `ArtifactParser.apply()`.

---

## Error codes reference

| Code                       | Class                         | Layer       |
| -------------------------- | ----------------------------- | ----------- |
| `CHANGE_NOT_FOUND`         | `ChangeNotFoundError`         | Application |
| `CHANGE_ALREADY_EXISTS`    | `ChangeAlreadyExistsError`    | Application |
| `APPROVAL_GATE_DISABLED`   | `ApprovalGateDisabledError`   | Application |
| `SCHEMA_NOT_FOUND`         | `SchemaNotFoundError`         | Application |
| `INVALID_STATE_TRANSITION` | `InvalidStateTransitionError` | Domain      |
| `APPROVAL_REQUIRED`        | `ApprovalRequiredError`       | Domain      |
| `HOOK_FAILED`              | `HookFailedError`             | Domain      |
| `ARTIFACT_CONFLICT`        | `ArtifactConflictError`       | Domain      |
| `DELTA_APPLICATION`        | `DeltaApplicationError`       | Domain      |
