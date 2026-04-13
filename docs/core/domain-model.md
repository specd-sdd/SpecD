# Domain Model

This document describes the entities and value objects that `@specd/core` use cases return. As an integrator, you read data from these objects — you do not construct them directly (repositories and use cases do that) and you do not call their mutation methods (only use cases do that).

## Change

`Change` is the central entity. Every use case operates on a change.

### Properties

| Property             | Type                                     | Description                                                                |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `name`               | `string`                                 | Unique slug name. Immutable after creation. Kebab-case.                    |
| `createdAt`          | `Date`                                   | Timestamp when the change was created. Immutable.                          |
| `description`        | `string \| undefined`                    | Optional free-text description of the change's purpose.                    |
| `state`              | `ChangeState`                            | Current lifecycle state, derived from history.                             |
| `isDrafted`          | `boolean`                                | Whether the change is currently shelved in `drafts/`.                      |
| `workspaces`         | `readonly string[]`                      | Workspace IDs derived from `specIds` at runtime.                           |
| `specIds`            | `readonly string[]`                      | Spec IDs being created or modified (e.g. `"default:auth/oauth"`).          |
| `schemaName`         | `string`                                 | Schema name recorded at creation time.                                     |
| `schemaVersion`      | `number`                                 | Schema version recorded at creation time.                                  |
| `specDependsOn`      | `ReadonlyMap<string, readonly string[]>` | Per-spec declared dependencies, keyed by spec ID.                          |
| `history`            | `readonly ChangeEvent[]`                 | Append-only event log.                                                     |
| `artifacts`          | `ReadonlyMap<string, ChangeArtifact>`    | Artifacts tracked in this change, keyed by artifact type ID.               |
| `activeSpecApproval` | `SpecApprovedEvent \| undefined`         | The current spec approval, if any, and not yet superseded by invalidation. |
| `activeSignoff`      | `SignedOffEvent \| undefined`            | The current sign-off, if any, and not yet superseded by invalidation.      |
| `isArchivable`       | `boolean`                                | `true` when the change is in `archivable` or `archiving` state.            |

### state

`state` is always derived from `history` — there is no stored snapshot. The value is the `to` field of the most recent `transitioned` event. If no `transitioned` event exists, the state is `'drafting'`.

```typescript
import { type ChangeState } from '@specd/core'

const state: ChangeState = change.state
```

### isDrafted

`isDrafted` reflects whether the change is currently shelved. It is derived from the most recent `drafted` or `restored` event in the history — whichever appears last.

```typescript
if (change.isDrafted) {
  // Change is in drafts/ — use RestoreChange to return it to active
}
```

### effectiveStatus

`effectiveStatus(type)` computes the artifact status for a given type after cascading through the dependency graph. An artifact that has passed its own validation is still reported as `'in-progress'` if any artifact in its `requires` chain is neither `'complete'` nor `'skipped'`.

```typescript
const status = change.effectiveStatus('tasks') // 'missing' | 'in-progress' | 'complete' | 'skipped'
```

Use this when you need the true readiness of an artifact from a user's perspective. Use `change.artifacts.get(type)?.status` when you need the raw per-artifact status without dependency propagation.

## ChangeState and the lifecycle graph

`ChangeState` is a string union of all valid lifecycle states:

```typescript
type ChangeState =
  | 'drafting'
  | 'designing'
  | 'ready'
  | 'pending-spec-approval'
  | 'spec-approved'
  | 'implementing'
  | 'verifying'
  | 'done'
  | 'pending-signoff'
  | 'signed-off'
  | 'archivable'
  | 'archiving'
```

The permitted transitions are defined in `VALID_TRANSITIONS`. Almost every active state can transition back to `'designing'` — this is the redesign path that allows rework at any point. The terminal state is `'archiving'` — no transitions are valid from it.

```
drafting → designing ⇄ ready ──────────────────────────── → implementing ⇄ verifying → done ──────────────────── → archivable → archiving
                     ↕        ╌→ pending-spec-approval               ↕               ↕      ╌→ pending-signoff ↕
                     ↕             → spec-approved ──────── → implementing            ↕           → signed-off ↕
                     ↕                                                                 ↕                        ↕
                     ←─────────────────────────────── (redesign from any active state) ←───────────────────────┘
```

Full transition table from `VALID_TRANSITIONS`:

| From                    | To                                                   |
| ----------------------- | ---------------------------------------------------- |
| `drafting`              | `designing`                                          |
| `designing`             | `ready`, `designing`                                 |
| `ready`                 | `implementing`, `pending-spec-approval`, `designing` |
| `pending-spec-approval` | `spec-approved`, `designing`                         |
| `spec-approved`         | `implementing`, `designing`                          |
| `implementing`          | `verifying`, `designing`                             |
| `verifying`             | `implementing`, `done`, `designing`                  |
| `done`                  | `archivable`, `pending-signoff`, `designing`         |
| `pending-signoff`       | `signed-off`, `designing`                            |
| `signed-off`            | `archivable`, `designing`                            |
| `archivable`            | `archiving`, `designing`                             |
| `archiving`             | _(terminal — no valid transitions)_                  |

```typescript
import { VALID_TRANSITIONS, isValidTransition } from '@specd/core'

// Check whether a transition is permitted
isValidTransition('ready', 'implementing') // true
isValidTransition('archiving', 'designing') // false

// Inspect valid targets from a given state
VALID_TRANSITIONS['done'] // ['archivable', 'pending-signoff', 'designing']
```

Use `isValidTransition` when you want to determine which actions are available in a given state without attempting the transition and catching an error.

## ChangeEvent

`history` is an append-only array of typed events. Every event carries `type`, `at: Date`, and `by: ActorIdentity`. Use the history to reconstruct audit trails, display timelines, or inspect approval state.

```typescript
import { type ChangeEvent } from '@specd/core'

for (const event of change.history) {
  switch (event.type) {
    case 'created':
      // event.specIds: readonly string[]
      // event.schemaName: string
      // event.schemaVersion: number
      break
    case 'transitioned':
      // event.from: ChangeState
      // event.to: ChangeState
      break
    case 'spec-approved':
      // event.reason: string
      // event.artifactHashes: Record<string, string>
      break
    case 'signed-off':
      // event.reason: string
      // event.artifactHashes: Record<string, string>
      break
    case 'invalidated':
      // event.cause: 'spec-change' | 'artifact-change' | 'redesign'
      break
    case 'drafted':
      // event.reason?: string
      break
    case 'restored':
      // (no additional fields beyond type, at, by)
      break
    case 'discarded':
      // event.reason: string
      // event.supersededBy?: readonly string[]
      break
    case 'artifact-skipped':
      // event.artifactId: string
      // event.reason?: string
      break
    case 'artifacts-synced':
      // event.typesAdded: readonly string[]
      // event.typesRemoved: readonly string[]
      // event.filesAdded: ReadonlyArray<{ type: string; key: string }>
      // event.filesRemoved: ReadonlyArray<{ type: string; key: string }>
      break
  }
}
```

### Event reference

| Event type         | Appended when                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created`          | The change is first created.                                                                                                                        |
| `transitioned`     | The lifecycle state advances or rolls back.                                                                                                         |
| `spec-approved`    | The spec approval gate is passed.                                                                                                                   |
| `signed-off`       | The sign-off gate is passed.                                                                                                                        |
| `invalidated`      | Spec IDs or artifact content changes, superseding any active approval.                                                                              |
| `drafted`          | The change is shelved to `drafts/`.                                                                                                                 |
| `restored`         | A drafted change is moved back to `changes/`.                                                                                                       |
| `discarded`        | The change is permanently abandoned.                                                                                                                |
| `artifact-skipped` | An optional artifact is explicitly skipped.                                                                                                         |
| `artifacts-synced` | The artifact map is reconciled against the schema and spec IDs. Appended automatically by the repository layer; the actor is always `SYSTEM_ACTOR`. |

### invalidated — cause values

| Cause               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `'spec-change'`     | The set of spec IDs was updated.                          |
| `'artifact-change'` | Artifact file content changed since the last approval.    |
| `'redesign'`        | An explicit transition back to `designing` was requested. |

An `invalidated` event clears `activeSpecApproval` and `activeSignoff`. If the change was not already in `designing`, a `transitioned` event rolling back to `designing` is appended immediately after.

## ActorIdentity and SYSTEM_ACTOR

`ActorIdentity` is a plain interface carried by every event:

```typescript
interface ActorIdentity {
  readonly name: string // display name
  readonly email: string // email address
}
```

`SYSTEM_ACTOR` is a predefined constant identity used for automated operations (such as artifact sync) that are not triggered by a human:

```typescript
import { SYSTEM_ACTOR } from '@specd/core'

// { name: 'specd', email: 'system@getspecd.dev' }
```

When iterating history, check `event.by.email === SYSTEM_ACTOR.email` to distinguish automated events from human-initiated ones.

## ChangeArtifact

A `ChangeArtifact` represents one artifact type tracked within a change (e.g. `proposal`, `specs`, `tasks`). It contains one or more `ArtifactFile` entries. Its status is the aggregate of all its files.

### Properties

| Property     | Type                                | Description                                                               |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `type`       | `string`                            | Artifact type ID from the schema (e.g. `'proposal'`, `'specs'`).          |
| `optional`   | `boolean`                           | Whether the artifact is optional in the schema.                           |
| `requires`   | `readonly string[]`                 | Artifact type IDs that must be complete before this one can be validated. |
| `files`      | `ReadonlyMap<string, ArtifactFile>` | All files in this artifact, keyed by file key.                            |
| `status`     | `ArtifactStatus`                    | Aggregated validation status across all files.                            |
| `isComplete` | `boolean`                           | `true` when `status` is `'complete'` or `'skipped'`.                      |

### File keys

The key used in `files` depends on the artifact's scope, which is defined in the schema:

- `scope: 'change'` — one file keyed by the artifact type ID (e.g. `'proposal'`). The file lives in the change root directory.
- `scope: 'spec'` — one file per spec ID in the change (e.g. `'default:auth/oauth'`). Each file corresponds to that spec's artifact path.

### Aggregated status

`status` is computed from all files:

| Status          | Condition                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `'missing'`     | No files exist, or all files have `status === 'missing'`.                 |
| `'in-progress'` | At least one file exists but not all files are complete or skipped.       |
| `'complete'`    | All files are complete or skipped, and at least one is `'complete'`.      |
| `'skipped'`     | All files are `'skipped'` (only possible for `optional: true` artifacts). |

### ArtifactStatus

```typescript
type ArtifactStatus = 'missing' | 'in-progress' | 'complete' | 'skipped'
```

| Value           | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `'missing'`     | The file has not been created yet.                                                  |
| `'in-progress'` | The file exists but has not been validated yet.                                     |
| `'complete'`    | The file has been validated and its hash recorded.                                  |
| `'skipped'`     | The file is optional and was explicitly skipped; satisfies dependency requirements. |

### getFile

```typescript
const file = artifact.getFile('proposal') // scope:change — key is type ID
const file = artifact.getFile('default:auth/oauth') // scope:spec — key is spec ID
// Returns ArtifactFile | undefined
```

## ArtifactFile

`ArtifactFile` tracks the validation state of a single file within a `ChangeArtifact`.

### Properties

| Property        | Type                  | Description                                                                                             |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `key`           | `string`              | File identifier within the artifact (type ID for scope:change, spec ID for scope:spec).                 |
| `filename`      | `string`              | Relative path within the change directory (e.g. `'proposal.md'`, `'specs/default/auth/oauth/spec.md'`). |
| `status`        | `ArtifactStatus`      | Current validation status of this file.                                                                 |
| `validatedHash` | `string \| undefined` | SHA-256 hash recorded at the last successful validation, or `undefined`.                                |
| `isComplete`    | `boolean`             | `true` when `status === 'complete'`.                                                                    |

`ArtifactFile` instances are mutable but only modified by `ChangeArtifact` methods, which are themselves called only by use cases. Do not hold references to `ArtifactFile` instances across use case calls — always re-read from the artifact map.

## Delta

`Delta` records the named blocks changed within a single spec by a change. It is returned by `ArtifactParser.parse()` when reading a delta file.

### Properties

| Property   | Type                | Description                        |
| ---------- | ------------------- | ---------------------------------- |
| `specPath` | `SpecPath`          | The spec path this delta targets.  |
| `added`    | `readonly string[]` | Block names added to the spec.     |
| `modified` | `readonly string[]` | Block names modified in the spec.  |
| `removed`  | `readonly string[]` | Block names removed from the spec. |

### Methods

| Method           | Returns   | Description                                                                                                                                                   |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isStructural()` | `boolean` | `true` if the delta contains any MODIFIED or REMOVED blocks. Structural deltas may break downstream consumers and require explicit approval before archiving. |
| `isEmpty()`      | `boolean` | `true` if all three operation lists are empty.                                                                                                                |

```typescript
if (delta.isStructural()) {
  // This delta modifies or removes existing blocks — approval may be required
}
```

## Spec

`Spec` is a lightweight metadata object for a spec directory. It holds no artifact content — content is loaded on demand by `SpecRepository.artifact()`.

### Properties

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

### Properties

| Property        | Type                         | Description                                                       |
| --------------- | ---------------------------- | ----------------------------------------------------------------- |
| `name`          | `string`                     | The original change name.                                         |
| `archivedName`  | `string`                     | The directory name used in the archive (may differ from `name`).  |
| `workspace`     | `SpecPath`                   | The workspace under which the change's specs lived.               |
| `archivedAt`    | `Date`                       | Timestamp when the change was archived.                           |
| `archivedBy`    | `ActorIdentity \| undefined` | The actor who performed the archive, if recorded.                 |
| `artifacts`     | `readonly string[]`          | Artifact type IDs that were present when the change was archived. |
| `specIds`       | `readonly string[]`          | Spec IDs that were associated with the change at archive time.    |
| `schemaName`    | `string`                     | Name of the schema that governed the change.                      |
| `schemaVersion` | `number`                     | Version of the schema that governed the change.                   |

## SpecPath

`SpecPath` is a validated, immutable value object representing a path within a workspace (e.g. `auth/oauth`, `billing/payments`). It rejects invalid characters and traversal segments at construction time.

### Construction

```typescript
import { SpecPath } from '@specd/core'

const path = SpecPath.parse('auth/oauth')
// Throws InvalidSpecPathError if the path is empty, contains '.' or '..',
// or contains reserved characters (\, :, *, ?, ", <, >, |)

const path2 = SpecPath.fromSegments(['auth', 'oauth'])
// Equivalent to SpecPath.parse, but takes an array of segments directly
```

### Properties and methods

| Member                | Returns            | Description                                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `leaf`                | `string`           | The last segment (e.g. `'oauth'` for `'auth/oauth'`).                           |
| `parent`              | `SpecPath \| null` | The parent path, or `null` for a single-segment path.                           |
| `child(segment)`      | `SpecPath`         | A new path with `segment` appended. Validates the segment.                      |
| `isAncestorOf(other)` | `boolean`          | `true` if `other` starts with all of this path's segments and has more.         |
| `equals(other)`       | `boolean`          | Structural equality by string representation.                                   |
| `toString()`          | `string`           | The canonical slash-separated representation (e.g. `'auth/oauth'`).             |
| `toFsPath(sep)`       | `string`           | OS-native path using the provided separator (pass `path.sep` from `node:path`). |

```typescript
const p = SpecPath.parse('auth/oauth')

p.leaf // 'oauth'
p.parent // SpecPath('auth')
p.child('flows') // SpecPath('auth/oauth/flows')
p.isAncestorOf(SpecPath.parse('auth/oauth/flows')) // true
p.equals(SpecPath.parse('auth/oauth')) // true
p.toString() // 'auth/oauth'
p.toFsPath('/') // 'auth/oauth' (POSIX)
p.toFsPath('\\') // 'auth\\oauth' (Windows)
```

You typically receive `SpecPath` values from `Spec.name` or `ArchivedChange.workspace` and pass them to `SpecRepository` methods. You rarely need to construct them yourself unless building a custom adapter.

Note that `SpecPath` is distinct from spec IDs. A spec ID is the full `workspace:capability-path` string (e.g. `'default:auth/oauth'`), while a `SpecPath` is the capability path portion only (e.g. `'auth/oauth'`).
