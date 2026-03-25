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

### AlreadyInitialisedError

**Code:** `'ALREADY_INITIALISED'`

Thrown when `InitProject` is called but a `specd.yaml` already exists at the target path and `force` is not set.

```typescript
import { AlreadyInitialisedError } from '@specd/core'

// Message: "Project already initialised at '<configPath>'"
```

**Thrown by:** `InitProject`.

---

### ArtifactNotFoundError

**Code:** `'ARTIFACT_NOT_FOUND'`

Thrown when a referenced artifact type does not exist on a given change.

```typescript
import { ArtifactNotFoundError } from '@specd/core'

// Message: "Artifact '<artifactId>' not found on change '<changeName>'"
```

**Thrown by:** Use cases that reference a specific artifact by type ID.

---

### ParserNotRegisteredError

**Code:** `'PARSER_NOT_REGISTERED'`

Thrown when a required format parser is not present in the `ArtifactParserRegistry`. This happens when an artifact's `format` field refers to a format for which no parser was registered at startup.

```typescript
import { ParserNotRegisteredError } from '@specd/core'

// Message: "No parser registered for format '<format>'"
// Optional context suffix: "(context)"
```

**Thrown by:** Use cases that parse or validate artifact content.

---

### SpecNotInChangeError

**Code:** `'SPEC_NOT_IN_CHANGE'`

Thrown when attempting to remove a spec from a change that does not include that spec in its current `specIds`.

```typescript
import { SpecNotInChangeError } from '@specd/core'

// Message: "Spec '<specId>' is not in the current specIds of change '<changeName>'"
```

**Thrown by:** `EditChange`.

---

### SchemaMismatchError

**Code:** `'SCHEMA_MISMATCH'`

Thrown when a change was originally created with a different schema than the one currently active. A name mismatch indicates structural incompatibility — different artifact types, formats, or delta rules.

```typescript
import { SchemaMismatchError } from '@specd/core'

// Message: "Change '<name>' was created with schema '<expected>' but the active schema
//           is '<actual>'. Cannot operate on a change with an incompatible schema."
```

**Thrown by:** Use cases that load a change alongside the active schema.

---

### SpecNotFoundError

**Code:** `'SPEC_NOT_FOUND'`

Thrown when a requested spec directory does not exist in any configured workspace.

```typescript
import { SpecNotFoundError } from '@specd/core'

// Message: "Spec '<specId>' not found"
```

**Thrown by:** `GetSpec`, `CompileContext`, and use cases that load spec files.

---

### WorkspaceNotFoundError

**Code:** `'WORKSPACE_NOT_FOUND'`

Thrown when a spec ID references a workspace name that is not present in the project configuration.

```typescript
import { WorkspaceNotFoundError } from '@specd/core'

// Message: "Workspace '<name>' not found"
```

**Thrown by:** Use cases that resolve spec IDs against workspace configuration.

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

**Thrown by:** `TransitionChange`, `ApproveSpec`, `ApproveSignoff`, `ArchiveChange`, and directly by `ArchiveRepository.archive()` when the change is not in an archivable state and `force` is not set.

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

**Thrown by:** `ArchiveChange`, `TransitionChange` (pre/post hooks), `RunStepHooks`.

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

### InvalidSpecPathError

**Code:** `'INVALID_SPEC_PATH'`

Thrown when a spec path string is syntactically invalid — for example, empty, containing `.` or `..` segments, or using reserved characters.

```typescript
import { InvalidSpecPathError } from '@specd/core'

// Message: "Invalid spec path: <reason>"
```

**Thrown by:** `SpecPath` constructor during path validation.

---

### InvalidChangeError

**Code:** `'INVALID_CHANGE'`

Thrown when a `Change` is constructed with properties that violate domain invariants — for example, empty workspaces or spec IDs.

```typescript
import { InvalidChangeError } from '@specd/core'

// Message: <description of the violated invariant>
```

**Thrown by:** `Change` entity constructor.

---

### ArtifactNotOptionalError

**Code:** `'ARTIFACT_NOT_OPTIONAL'`

Thrown when `markSkipped()` is called on a required (non-optional) artifact. Only artifacts declared as `optional: true` in the schema may be skipped.

```typescript
import { ArtifactNotOptionalError } from '@specd/core'

// Message: "Artifact \"<type>\" is required — only optional artifacts may be skipped"
```

**Thrown by:** `ChangeArtifact.markSkipped()`.

---

### SchemaValidationError

**Code:** `'SCHEMA_VALIDATION_ERROR'`

Thrown when a schema file fails structural validation — for example, duplicate artifact IDs, circular `requires` dependencies, or invalid step names. Carries the schema reference (`ref`) and a human-readable reason.

```typescript
import { SchemaValidationError } from '@specd/core'

try {
  await buildSchema(ref, data, templates)
} catch (error) {
  if (error instanceof SchemaValidationError) {
    console.error(`Schema '${error.ref}' is invalid: ${error.reason}`)
  }
}
```

**Additional properties:**

| Property | Type     | Description                                |
| -------- | -------- | ------------------------------------------ |
| `ref`    | `string` | The schema reference string that failed.   |
| `reason` | `string` | Human-readable description of the failure. |

**Thrown by:** `buildSchema`, `mergeSchemaLayers`, and `SchemaRegistry.resolve()` during schema loading.

---

### ConfigValidationError

**Code:** `'CONFIG_VALIDATION_ERROR'`

Thrown when `specd.yaml` (or `specd.local.yaml`) fails structural validation. Distinct from `SchemaValidationError`: config errors indicate a problem with the project config file itself; schema errors indicate a problem with a referenced schema file.

```typescript
import { ConfigValidationError } from '@specd/core'

// Message: "Config validation failed in '<configPath>': <reason>"
```

**Additional properties:**

| Property     | Type     | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `configPath` | `string` | The config file path that failed parsing. |

**Thrown by:** `ConfigLoader.load()`.

---

### CorruptedManifestError

**Code:** `'CORRUPTED_MANIFEST'`

Thrown when a change manifest on disk is corrupted — missing required events, containing invalid state values, or failing schema validation.

```typescript
import { CorruptedManifestError } from '@specd/core'

// Message: "Corrupted manifest: <context>"
```

**Thrown by:** `ChangeRepository.load()` when manifest parsing fails.

---

### MetadataValidationError

**Code:** `'METADATA_VALIDATION_ERROR'`

Thrown when `metadata.json` content fails structural validation during a write operation. The read path (`parseMetadata`) is lenient and never throws.

```typescript
import { MetadataValidationError } from '@specd/core'

// Message: "Metadata validation failed: <reason>"
```

**Thrown by:** `SaveSpecMetadata`.

---

### DependsOnOverwriteError

**Code:** `'DEPENDS_ON_OVERWRITE'`

Thrown when a metadata write would change existing `dependsOn` entries without the `force` flag. The `dependsOn` field is considered curated — it may have been manually verified by a human. Carries both the existing and incoming dependency lists so the caller can present a diff.

```typescript
import { DependsOnOverwriteError } from '@specd/core'

try {
  await saveMetadata.execute(input)
} catch (error) {
  if (error instanceof DependsOnOverwriteError) {
    // error.existingDeps — current on-disk dependsOn
    // error.incomingDeps — what the caller is trying to write
    // retry with { force: true } to overwrite
  }
}
```

**Additional properties:**

| Property       | Type                | Description                                |
| -------------- | ------------------- | ------------------------------------------ |
| `existingDeps` | `readonly string[]` | The `dependsOn` entries currently on disk. |
| `incomingDeps` | `readonly string[]` | The `dependsOn` entries being written.     |

**Thrown by:** `SaveSpecMetadata`.

---

### HookNotFoundError

**Code:** `'HOOK_NOT_FOUND'`

Thrown when a hook ID does not match any hook in the resolved workflow, or matches a hook of the wrong type (e.g. an `instruction:` hook when a `run:` hook was expected). Carries the hook ID and the reason for the lookup failure.

```typescript
import { HookNotFoundError } from '@specd/core'

// Message (not-found):   "Hook '<hookId>' not found"
// Message (wrong-type):  "Hook '<hookId>' is not a run/instruction hook"
```

**Additional properties:**

| Property | Type                          | Description                                   |
| -------- | ----------------------------- | --------------------------------------------- |
| `hookId` | `string`                      | The hook ID that was not found or mismatched. |
| `reason` | `'not-found' \| 'wrong-type'` | Why the lookup failed.                        |

**Thrown by:** `RunStepHooks`, `GetHookInstructions`.

---

### StepNotValidError

**Code:** `'STEP_NOT_VALID'`

Thrown when a step name does not correspond to a valid lifecycle state.

```typescript
import { StepNotValidError } from '@specd/core'

// Message: "Step '<step>' is not a valid lifecycle state"
```

**Additional properties:**

| Property | Type     | Description            |
| -------- | -------- | ---------------------- |
| `step`   | `string` | The invalid step name. |

**Thrown by:** `CompileContext`, `RunStepHooks`, `GetHookInstructions`.

---

### PathTraversalError

**Code:** `'PATH_TRAVERSAL'`

Thrown when a file read is attempted that resolves to a path outside the configured base directory. This protects against path-traversal attacks or misconfigured relative paths.

```typescript
import { PathTraversalError } from '@specd/core'

// Message: "Path traversal detected: \"<resolvedPath>\" resolves outside the allowed base directory"
```

**Thrown by:** `FileReader` implementations that enforce a base directory constraint.

---

### UnsupportedPatternError

**Code:** `'UNSUPPORTED_PATTERN_ERROR'`

Thrown when an archive path pattern contains a variable that is explicitly unsupported. For example, `{{change.scope}}` is unsupported because scope paths contain `/`, which produces ambiguous directory names. Carries the offending variable name.

```typescript
import { UnsupportedPatternError } from '@specd/core'

// Message: "Archive pattern variable {{change.scope}} is not supported — <reason>"
```

**Additional properties:**

| Property   | Type     | Description                       |
| ---------- | -------- | --------------------------------- |
| `variable` | `string` | The unsupported pattern variable. |

**Thrown by:** `ArchiveChange` during archive path resolution.

---

### MissingDefaultWorkspaceError

**Code:** `'MISSING_DEFAULT_WORKSPACE'`

Thrown when the `'default'` workspace is missing from a `SpecdConfig`. Every valid configuration must contain exactly one workspace named `'default'`.

```typescript
import { MissingDefaultWorkspaceError } from '@specd/core'

// Message: "SpecdConfig is missing a 'default' workspace — every config must have one"
```

**Thrown by:** `ConfigLoader.load()` during config validation.

---

### ArtifactParseError

**Code:** `'ARTIFACT_PARSE_ERROR'`

Thrown when an artifact file cannot be parsed due to malformed content. Wraps low-level parse errors (e.g. `JSON.parse`, YAML parser) into a typed `SpecdError` for programmatic handling.

```typescript
import { ArtifactParseError } from '@specd/core'

// Message: "Failed to parse <format> artifact: <reason>"
```

**Thrown by:** `ArtifactParser.parse()` implementations.

---

## Error codes reference

| Code                        | Class                          | Layer       |
| --------------------------- | ------------------------------ | ----------- |
| `CHANGE_NOT_FOUND`          | `ChangeNotFoundError`          | Application |
| `CHANGE_ALREADY_EXISTS`     | `ChangeAlreadyExistsError`     | Application |
| `APPROVAL_GATE_DISABLED`    | `ApprovalGateDisabledError`    | Application |
| `SCHEMA_NOT_FOUND`          | `SchemaNotFoundError`          | Application |
| `ALREADY_INITIALISED`       | `AlreadyInitialisedError`      | Application |
| `ARTIFACT_NOT_FOUND`        | `ArtifactNotFoundError`        | Application |
| `PARSER_NOT_REGISTERED`     | `ParserNotRegisteredError`     | Application |
| `SPEC_NOT_IN_CHANGE`        | `SpecNotInChangeError`         | Application |
| `SCHEMA_MISMATCH`           | `SchemaMismatchError`          | Application |
| `SPEC_NOT_FOUND`            | `SpecNotFoundError`            | Application |
| `WORKSPACE_NOT_FOUND`       | `WorkspaceNotFoundError`       | Application |
| `INVALID_STATE_TRANSITION`  | `InvalidStateTransitionError`  | Domain      |
| `APPROVAL_REQUIRED`         | `ApprovalRequiredError`        | Domain      |
| `HOOK_FAILED`               | `HookFailedError`              | Domain      |
| `ARTIFACT_CONFLICT`         | `ArtifactConflictError`        | Domain      |
| `DELTA_APPLICATION`         | `DeltaApplicationError`        | Domain      |
| `INVALID_SPEC_PATH`         | `InvalidSpecPathError`         | Domain      |
| `INVALID_CHANGE`            | `InvalidChangeError`           | Domain      |
| `ARTIFACT_NOT_OPTIONAL`     | `ArtifactNotOptionalError`     | Domain      |
| `SCHEMA_VALIDATION_ERROR`   | `SchemaValidationError`        | Domain      |
| `CONFIG_VALIDATION_ERROR`   | `ConfigValidationError`        | Domain      |
| `CORRUPTED_MANIFEST`        | `CorruptedManifestError`       | Domain      |
| `METADATA_VALIDATION_ERROR` | `MetadataValidationError`      | Domain      |
| `DEPENDS_ON_OVERWRITE`      | `DependsOnOverwriteError`      | Domain      |
| `HOOK_NOT_FOUND`            | `HookNotFoundError`            | Domain      |
| `STEP_NOT_VALID`            | `StepNotValidError`            | Domain      |
| `PATH_TRAVERSAL`            | `PathTraversalError`           | Domain      |
| `UNSUPPORTED_PATTERN_ERROR` | `UnsupportedPatternError`      | Domain      |
| `MISSING_DEFAULT_WORKSPACE` | `MissingDefaultWorkspaceError` | Domain      |
| `ARTIFACT_PARSE_ERROR`      | `ArtifactParseError`           | Domain      |
