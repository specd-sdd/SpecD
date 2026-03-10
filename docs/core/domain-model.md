# Domain Model

This document describes the entities and value objects that `@specd/core` use cases return. As an integrator, you read data from these objects — you do not construct them directly (repositories and use cases do that) and you do not call their mutation methods (only use cases do that).

## Change

`Change` is the central entity. Every use case operates on a change.

### Readable properties

| Property         | Type                                  | Description                                                  |
| ---------------- | ------------------------------------- | ------------------------------------------------------------ |
| `name`           | `string`                              | Unique slug name. Immutable after creation.                  |
| `createdAt`      | `Date`                                | Timestamp when the change was created. Immutable.            |
| `state`          | `ChangeState`                         | Current lifecycle state, derived from history.               |
| `workspaces`     | `readonly string[]`                   | Workspace IDs this change belongs to.                        |
| `specIds`        | `readonly string[]`                   | Spec paths being created or modified.                        |
| `contextSpecIds` | `readonly string[]`                   | Spec paths providing context but not being modified.         |
| `history`        | `readonly ChangeEvent[]`              | Append-only event log.                                       |
| `artifacts`      | `ReadonlyMap<string, ChangeArtifact>` | Artifacts tracked in this change, keyed by artifact type ID. |

### state

`state` is always derived from `history` — there is no stored snapshot. The value is the `to` field of the most recent `transitioned` event. If no `transitioned` event exists, the state is `'drafting'`.

```typescript
import { type ChangeState } from '@specd/core'

// All possible states:
// 'drafting' | 'designing' | 'ready' | 'pending-spec-approval' | 'spec-approved'
// 'implementing' | 'verifying' | 'done' | 'pending-signoff' | 'signed-off' | 'archivable'

const state: ChangeState = change.state
```

The full transition graph:

```
drafting → designing → ready ──────────────────────────────────── → implementing ⇄ verifying → done ────────────────── → archivable
                             ╌→ pending-spec-approval → spec-approved ┘                          ╌→ pending-signoff → signed-off ┘
                               (approvals.spec: true)                                              (approvals.signoff: true)
```

`archivable` is terminal — no further transitions are possible from it.

### history and ChangeEvent

`history` is an append-only array of typed events. Use it to reconstruct audit trails, display timelines, or inspect approvals.

```typescript
import { type ChangeEvent } from '@specd/core'

for (const event of change.history) {
  switch (event.type) {
    case 'created':
      // event.workspaces, event.specIds, event.schemaName, event.schemaVersion
      break
    case 'transitioned':
      // event.from: ChangeState, event.to: ChangeState
      break
    case 'spec-approved':
      // event.reason: string, event.artifactHashes: Record<string, string>
      break
    case 'signed-off':
      // event.reason: string, event.artifactHashes: Record<string, string>
      break
    case 'invalidated':
      // event.cause: 'workspace-change' | 'spec-change' | 'artifact-change'
      break
    case 'drafted':
      // event.reason?: string
      break
    case 'restored':
      // (no additional fields)
      break
    case 'discarded':
      // event.reason: string, event.supersededBy?: string[]
      break
    case 'artifact-skipped':
      // event.artifactId: string, event.reason?: string
      break
  }
}
```

All events share three common fields: `type`, `at: Date`, and `by: ActorIdentity`.

### ActorIdentity

```typescript
interface ActorIdentity {
  readonly name: string // actor display name
  readonly email: string // actor email
}
```

### artifacts

`artifacts` is a `ReadonlyMap<string, ChangeArtifact>` keyed by artifact type ID (e.g. `'proposal'`, `'specs'`, `'tasks'`). See [`ChangeArtifact`](#changeartifact) below.

## ChangeArtifact

`ChangeArtifact` tracks the validation state of a single artifact file within a change.

### Readable properties

| Property        | Type                  | Description                                                                |
| --------------- | --------------------- | -------------------------------------------------------------------------- |
| `type`          | `string`              | Artifact type ID from the schema (e.g. `'proposal'`, `'specs'`).           |
| `filename`      | `string`              | Artifact filename relative to the change directory (e.g. `'proposal.md'`). |
| `optional`      | `boolean`             | Whether the artifact is optional in the schema.                            |
| `requires`      | `readonly string[]`   | Artifact type IDs that must be complete before this one.                   |
| `status`        | `ArtifactStatus`      | Current validation status.                                                 |
| `validatedHash` | `string \| undefined` | SHA-256 hash recorded at last validation, or `undefined`.                  |
| `isComplete`    | `boolean`             | Shorthand for `status === 'complete'`.                                     |

### ArtifactStatus

```typescript
type ArtifactStatus = 'missing' | 'in-progress' | 'complete' | 'skipped'
```

| Status        | Meaning                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `missing`     | The artifact file has not been created yet.                                  |
| `in-progress` | The file exists but has not been validated, or a dependency is not complete. |
| `complete`    | The file has been validated and its hash recorded.                           |
| `skipped`     | The artifact is optional and was explicitly marked as not produced.          |

Status is always derived from the artifact's `validatedHash` and the presence of its file on disk — it is never stored as a raw field. `'skipped'` is only reachable for `optional: true` artifacts.

## Spec

`Spec` is a lightweight metadata object for a spec directory. It holds no artifact content — content is loaded on demand by `SpecRepository.artifact()`.

### Readable properties

| Property    | Type                | Description                                                        |
| ----------- | ------------------- | ------------------------------------------------------------------ |
| `workspace` | `string`            | The workspace name this spec belongs to (from `specd.yaml`).       |
| `name`      | `SpecPath`          | The spec's identity path within the workspace (e.g. `auth/oauth`). |
| `filenames` | `readonly string[]` | Artifact filenames present in this spec directory.                 |

### hasArtifact

```typescript
spec.hasArtifact('spec.md') // true | false
```

## ArchivedChange

`ArchivedChange` is an immutable historical record created when a change is archived. Once created it is never mutated.

### Readable properties

| Property       | Type                | Description                                                      |
| -------------- | ------------------- | ---------------------------------------------------------------- |
| `name`         | `string`            | The original change name.                                        |
| `archivedName` | `string`            | The directory name used in the archive (may differ from `name`). |
| `workspace`    | `SpecPath`          | The workspace under which the change's specs lived.              |
| `archivedAt`   | `Date`              | Timestamp when the change was archived.                          |
| `artifacts`    | `readonly string[]` | Artifact type IDs present when the change was archived.          |

## SpecPath

`SpecPath` is a validated, immutable value object representing a spec's location within a workspace. It is a slash-separated path (e.g. `auth/oauth`, `billing/payments`) with invalid characters rejected at construction time.

```typescript
import { SpecPath } from '@specd/core'

const path = SpecPath.parse('auth/oauth') // throws InvalidSpecPathError if invalid
path.toString() // 'auth/oauth'
path.segments // ['auth', 'oauth']
path.child('flows') // SpecPath('auth/oauth/flows')
```

You typically receive `SpecPath` values from `Spec.name` or `ArchivedChange.workspace` and pass them to `SpecRepository` methods. You rarely need to construct them yourself unless building your own adapter.

## ChangeState and VALID_TRANSITIONS

```typescript
import { type ChangeState, VALID_TRANSITIONS, isValidTransition } from '@specd/core'

// Check whether a transition is permitted
isValidTransition('ready', 'implementing') // true
isValidTransition('archivable', 'designing') // false

// Inspect valid targets from a given state
VALID_TRANSITIONS['ready'] // ['implementing', 'pending-spec-approval']
```

Use `isValidTransition` when you want to present available actions to a user without attempting the transition and catching an error.
