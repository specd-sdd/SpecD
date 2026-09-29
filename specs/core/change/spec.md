# Change

## Purpose

Without a single entity that owns spec work end-to-end, lifecycle state, approval gates, and artifact tracking would scatter across uncoordinated subsystems. A Change is the central domain entity in specd — a discrete, named unit of in-progress spec work covering one or more workspaces that moves from drafting through implementation and into the archive. Every specd operation targets a Change, and the Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`) and a `createdAt` timestamp recorded at creation time. Both are immutable.

Identities in specd are represented by the `ActorIdentity` interface:

- **`name`** — human-readable name of the actor
- **`email`** — unique identifier (often a real email, but may be a hash or masked value)
- **`provider`** — optional identifier of the identity source (e.g. 'git', 'ldap')
- **`providerId`** — optional unique ID within that provider (e.g. LDAP DN)
- **`metadata`** — optional bag of arbitrary string-valued metadata (`Record<string, string>`)

### Requirement: Change names reject Windows device names

A change slug that is a Windows device name MUST be rejected on every operating system. The reserved names are `con`, `prn`, `aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9`, compared case-insensitively as the whole slug. A slug that only contains a device name as part of a larger segment, such as `con-foo`, MUST remain legal when it matches the existing slug pattern.

### Requirement: Revision timestamp

The `Change` entity SHALL maintain a `updatedAt` property representing its last modification timestamp.

- `updatedAt` MUST NOT be prior to `createdAt`.
- If `updatedAt` is omitted at construction, it SHALL default to `createdAt`.
- `Change` SHALL provide a `touchUpdatedAt(at: Date = new Date())` method to set or advance `updatedAt` (defaulting to current date/time when omitted).

### Requirement: Workspaces and specs

A Change declares:

- **`specIds`** — zero or more spec IDs being created or modified by this change (e.g. `['auth/login', 'billing:invoices']`). An empty list is allowed before specs are assigned.
- **`workspaces`** — a computed getter derived from `specIds` through `parseSpecId()`, never a persisted field. It is empty when `specIds` is empty.
- **`specDependsOn`** — a map of per-spec declared dependencies, used by `CompileContext` as the highest-priority dependency source. Updating dependencies alone does not trigger approval invalidation.

Workspace components MUST be validated against `specd.yaml` at creation; spec paths need not already exist. Scope remains mutable after creation. Active scope edits MUST pass through canonical reconciliation. A canonical set addition or removal makes existing spec consent stale with precise scope differences; reordering or duplicating the same canonical set MUST NOT invalidate consent. Gate recovery and workflow policy determine any lifecycle consequence; a scope edit alone MUST NOT unconditionally return the change to `designing` or revoke unrelated evidence.

Scope replacement SHALL remove `specDependsOn` entries whose keys no longer occur in `specIds`, while preserving remaining entries. The legacy `updateSpecIds` helper may record artifact-review evidence with cause `spec-change`; this is not the active edit orchestration path and MUST NOT independently decide lifecycle recovery.

`CompileContext` SHALL derive active workspaces from the current `specIds` and resolve dependencies dynamically, with change-local declarations taking precedence over persisted spec dependencies. See `core:spec-metadata` for dependency metadata.

`workspaces` is the plural touched set, never a primary or home workspace. Consumers including template variables and archive paths MUST NOT use `workspaces[0]` or any other index as a singular change identity. This remains true when the set contains only one workspace.

### Requirement: Lifecycle

A Change progresses through the following states. Two approval gates are configurable in `specd.yaml` (`approvals.spec` and `approvals.signoff`, both default `false`). When a gate is on, the change **stays** in `ready` or `done` until `ApproveSpec` / `ApproveSignoff` records consent; `change transition` does not enter pending parking states.

```
drafting → designing → ready → implementing ⇄ verifying → done → archivable → archiving
```

`pending-spec-approval`, `spec-approved`, `pending-signoff`, and `signed-off` remain valid `ChangeState` values so in-flight changes can drain. New transitions MUST NOT enter `pending-spec-approval` from `ready` or `pending-signoff` from `done`.

| State                   | Meaning                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `drafting`              | Initial state; the change has been created but no design work has started                          |
| `designing`             | The agent is elaborating or revising the change artifacts                                          |
| `ready`                 | The design artifact set is complete; awaiting implementation (or spec approval if gate is enabled) |
| `pending-spec-approval` | Waiting for human approval of the spec before implementation may begin                             |
| `spec-approved`         | Spec has been approved; implementation may begin                                                   |
| `implementing`          | Code is being written against the current artifacts and task set                                   |
| `verifying`             | The implementation is being verified against the current verify scenarios                          |
| `done`                  | Verification is complete; the change is ready to archive                                           |
| `pending-signoff`       | Waiting for human sign-off on the completed work before archiving                                  |
| `signed-off`            | Work has been signed off; the change may be archived                                               |
| `archivable`            | Final archival checks have passed; the change may enter archive commit                             |
| `archiving`             | Archive commit in progress — canonical publication and archive move underway                       |

- `archiving → archivable` MAY occur automatically when an archive commit fails and batch canonical restore completes successfully, or when a pre-commit archive guard fails before commit begins (change never entered `archiving`).
- `archiving → designing` MUST remain available as a manual escape when spec or delta revision is required, or when batch restore itself fails.

`archiving` permits `archivable` after successful batch restore, `designing` as the manual redesign escape, and `done` only as the canonical automatic recovery for required stale or revoked sign-off. It MUST NOT permit manual retry hops to `implementing` or `verifying`.

Skill-aligned retry hops from `done`, `signed-off`, or `archivable` to `implementing` or `verifying` remain distinct from gate recovery. `archivable → done` and `signed-off → done` are valid only when central reconciliation applies sign-off recovery; callers MUST NOT infer or synthesize those targets independently.

`VALID_TRANSITIONS` MUST also permit skill-aligned backward hops (retry, not redesign):

- `done → implementing`, `done → verifying`
- `signed-off → implementing`, `signed-off → verifying`
- `archivable → implementing`, `archivable → verifying`

`VALID_TRANSITIONS['ready']` MUST be `implementing` and `designing` only (no `pending-spec-approval`). `VALID_TRANSITIONS['done']` MUST include `archivable`, `designing`, `implementing`, and `verifying` (no `pending-signoff`). Drain: `pending-spec-approval` MAY still go to `spec-approved` or `designing`; `pending-signoff` MAY still go to `signed-off` or `designing`.

The `implementing ↔ verifying` loop may repeat any number of times. The transition `implementing → verifying` is only valid when all tasks in the `tasks` artifact are complete (enforced as the `workflow.taskCompletion` check; see [`core:transition-checks`](../transition-checks/spec.md)). The transition `verifying → implementing` is valid only for implementation-only failures: the current artifacts still describe the intended behavior and the required fix fits within the already-defined tasks. If verification concludes that the artifacts themselves must be revised, or that new tasks are required before implementation can resume, the change returns to `designing` instead.

Every state except `drafting` MAY return to `designing`. This includes `archiving`. However, when the change is already in `designing` (a `designing → designing` transition), this is a state-preserving re-entry and MUST NOT trigger approval invalidation or artifact downgrade.

Returning to `designing` from a later state (e.g. `implementing → designing`, `ready → designing`, `archiving → designing`) does not imply that artifacts drifted; it means the artifact set must be reviewed again before work can proceed.

### Requirement: Neutral designing self-entry

An application request to enter `designing` while the change is already in `designing` SHALL be a neutral no-op. It MUST NOT append a `transitioned` event, change the lifecycle state, downgrade artifacts, or invalidate approval or verification evidence. The `Change` entity SHALL continue to reject a direct real self-transition; the application handles the neutral request before invoking the entity. `verifying → verifying` is not a neutral request and MUST remain an invalid protocol hop.

### Requirement: Skill-aligned backward hops

Transitions from `done`, `signed-off`, or `archivable` to `implementing` or `verifying` SHALL be treated as implementation/verification retry, not as redesign.

Those hops MUST NOT mass-invalidate artifacts (same spirit as `verifying → implementing`). They MUST invalidate an active **signoff** so a later forward move toward `archivable` requires approve again. They MUST NOT invalidate **spec** approval unless artifact files actually change.

The `Change` entity SHALL still reject any pair not listed in `VALID_TRANSITIONS`.

### Requirement: Archiving escape transitions

From `archiving`, ordinary manual escape targets are `archivable` and `designing`. Central reconciliation additionally MAY apply `archiving → done` when required sign-off is stale or revoked.

- `archiving → archivable` MAY occur automatically after a failed archive commit when batch canonical restore succeeds.
- `archiving → designing` MUST remain available as a manual recovery path, including when batch restore fails.
- `archiving → done` MUST be reserved for the atomic mandatory sign-off recovery selected by the central reconciler; it is not an implementation or verification retry.
- Transitions from `archiving` to `implementing`, `verifying`, or any other state MUST throw `InvalidStateTransitionError`.

### Requirement: Implementation and verification loop

`implementing` and `verifying` form a repeatable loop. Entry to `verifying` requires applicable task completion and implementation readiness but does not capture a baseline. `verifying → done` requires already-completed current verification through a registered predicate; the transition MUST NOT complete an attempt.

An implementation-only failure may require returning to implementation for repairs without reopening unchanged artifacts. Lifecycle movement alone preserves unchanged verification evidence. If desired behaviour or design decisions change, reconciliation applies policy-aware artifact review and consent invalidation. Fingerprint mismatch alone permits a new explicit verification attempt in the current state and does not force rollback.

Artifact or implementation drift is reconciled independently. `workflow: preserve` may retain the phase when no mandatory gate recovery applies, while non-task drift still blocks forward progress. Required stale spec consent returns immediately to `designing`. A stale verification record is contextual before `verifying`, requires a fresh attempt in `verifying`, and blocks `done`/archive until renewed.

The loop may repeat without deleting prior attempts or approvals; history and materialized invalidity explain every round.

### Requirement: Implementation tracking state

A `Change` SHALL persist implementation-tracking state separately from artifact state.

This state MUST distinguish:

- `trackedImplementationFiles` — tracked raw project-relative files under review for the change
- `implementationLinks` — confirmed `spec + file` implementation links, optionally refined by one or more symbols

Each tracked implementation file MUST carry an explicit review state of `open`, `resolved`, `ignored`, or `removed`.

`removed` means the file remains part of the change's tracked review history, but refresh has confirmed that the file is no longer present on disk. A `removed` file is not implicitly untracked and is not manually reopened through `resolve`; it returns to `open` only when refresh confirms the file exists again.

`implementationLinks` MUST support both:

- file-level links (`spec -> file`)
- symbol-level refinements (`spec -> file -> symbols`)

A confirmed link's raw file path remains project-relative while the change is active. Canonical `workspace:path` normalization happens later during archive-time materialization.

### Requirement: Explicit vs container-only file links

The `Change` entity MUST preserve whether a file-level implementation link was explicitly created on its own or exists only as the container for symbol-level links.

This distinction governs link-removal behavior:

- removing the last symbol from a container-only `spec + file` set MAY remove the whole set
- removing the last symbol from a `spec + file` set whose file-level link was explicitly created MUST preserve the file-level link

### Requirement: Historical implementation detection guard

The `Change` entity SHALL expose whether the change has ever entered `implementing` in its history.

Lifecycle use cases use this historical fact to decide when demand-driven implementation autodetection is meaningful. The `Change` entity itself does not perform implementation detection.

### Requirement: Explicit implementation tracking activation

A `Change` SHALL expose explicit implementation tracking activation state and baseline timing.

The `Change` entity MUST:

- maintain an `implementationTrackingStartedAt: Date | null` property
- expose `isImplementationTrackingActive: boolean` returning `true` when `implementationTrackingStartedAt` is not `null`
- provide `startImplementationTracking(at?: Date): void` to record tracking commencement
- ensure `startImplementationTracking` is idempotent: calling it when tracking is already active MUST preserve the initial `implementationTrackingStartedAt` timestamp

### Requirement: Spec approval gate

When `approvals.spec: true`, forward progress from `ready` requires a materialized spec-approval projection with status `valid` for the current canonical spec scope and non-task artifact fingerprint. Approval is granted only in `ready` after required artifact validation and semantic review with no unresolved drift or pending review. `TransitionChange` never parks new work in pending approval states.

When disabled, the approval predicate skips, but artifact freshness still applies. Historic pending/spec-approved states remain drain-only compatibility values.

### Requirement: Signoff gate

When `approvals.signoff: true`, `done → archivable` requires materialized sign-off status `valid` for current non-task artifacts and implementation files, plus valid verification evidence. Sign-off is granted only while the change remains in `done`. New work never parks in pending sign-off states.

When disabled, the sign-off predicate skips, but verification, artifact freshness, tasks, and archive checks still apply. Historic pending/signed-off states remain drain-only compatibility values.

### Requirement: Materialized approval and verification projections

A v2 `Change` SHALL own optional current projections for spec approval, sign-off, and verification while preserving its append-only history as audit evidence.

Each approval projection MUST have status `valid`, `stale`, or `revoked`, approval actor, reason, timestamp, and an invalidation cause when not valid. Spec approval carries a scope-aware fingerprint containing the exact canonical `specIds` and reviewed artifact fingerprint. Sign-off carries the reviewed artifact fingerprint plus the implementation fingerprint used at approval time. Absence means the gate has never been approved. A legacy spec approval with no scope snapshot, or legacy sign-off with no implementation fingerprint, is unknown evidence and MUST NOT be fabricated from current state or files.

The verification projection MUST distinguish an active attempt baseline from a completed record. Explicit start captures current non-task artifact and fully resolved implementation fingerprints from any active lifecycle state. Explicit completion succeeds only if current inputs still match that attempt and persists a new `valid` record with completion actor and timestamp. Later drift or explicit invalidation marks completed evidence `stale`; revalidating artifacts or restoring bytes MUST NOT heal it. Lifecycle movement alone neither captures nor completes nor invalidates verification.

Invalidating or renewing a projection SHALL append an explanatory event and update the current projection without deleting its earlier approval or verification events. Once `stale` or `revoked` is materialized, hash equality alone SHALL NOT restore `valid`.

### Requirement: State-independent verification operations and audit

`StartVerification.execute({ name })` SHALL operate from any active lifecycle state. It refreshes implementation tracking and link resolution and executes `impl.filesResolved` and `impl.linksInScope` before capturing a baseline. Missing or unreadable inputs fail explicitly. A successful start appends `verification-attempt-started` with actor, time, current state, attempt identity, and fingerprint algorithm metadata, then persists the active attempt atomically. Starting again supersedes the active attempt while preserving its historical evidence. Start never records successful completion.

`CompleteVerification.execute({ name })` SHALL require an active attempt, acquire fresh inputs, and use the shared fingerprint-validity evaluator to compare them to that attempt's baseline. Missing attempts, unresolvable inputs, or changed fingerprints fail without replacing the baseline or recording success. Success atomically records completed verification, actor, time, attempt identity, and fingerprint with an append-only completion event. The use case records the caller's successful verification declaration and does not run tests itself. Both operations delegate validity and any mandatory gate recovery to the central reconciler; neither performs a lifecycle transition merely to verify.

Both use cases SHALL expose typed input/result/deps contracts, canonical `createX(deps)` and convenience `createX(config, options?)` factories, and `resolveXDeps(resolver)`. They follow the established composition normalization and invalid-factory-arguments contract. `StartVerificationDeps` SHALL include the schema provider required to construct the operation-specific registered-check context. Domain invariants remain free of I/O; application dependencies supply schema, tracking, checks, fingerprint evaluation, actor, reconciliation, and serialized persistence.

Explicit withdrawal of completed verification SHALL append `verification-invalidated` with actor, time, reason, and completed verification identity while retaining the original verified fingerprint.

`verifying → verifying` is never permitted or required. A new explicit start renews the attempt in place. Prior attempts, invalidations, and completed-verification evidence remain in append-only history.

### Requirement: Artifacts

A Change tracks artifacts declared by the schema. Each `ChangeArtifact` owns a map of `ArtifactFile` records. Canonical file states that MAY be persisted are:

- `missing`
- `in-progress`
- `complete`
- `skipped`
- `pending-review`
- `drifted-pending-review`

`pending-parent-artifact-review` is **verdict-derived** on the lifecycle projection (`projectArtifacts` / `evaluateLifecycleVerdict`). It MUST NOT be a persistable file state. `ArtifactFile` MUST reject constructing that token in memory. Load/save MUST **sanitize** (coerce) a wire/legacy file `state` of `pending-parent-artifact-review` to `in-progress` (compatibility), not throw. Aggregate persisted `ChangeArtifact.state` MUST NOT store `pending-parent-artifact-review` — parent-blocked completeness belongs only on the lifecycle verdict projection.

`validatedHash` still participates in drift detection and approval signatures, but it is no longer the source of truth for artifact status. A file's current state is read from its persisted `state`, and hash comparison is one of the mechanisms that may change that state.

The aggregated `state` on `ChangeArtifact` is materialized from file states and is also persisted:

- `drifted-pending-review` — at least one file is `drifted-pending-review`
- `pending-review` — no file is `drifted-pending-review`, and at least one file is `pending-review`
- `complete` — all files are `complete` or `skipped`, and at least one file exists
- `skipped` — all files are `skipped`, and at least one file exists
- `missing` — all files are `missing`, or the artifact has no files
- `in-progress` — any remaining mixed or partially-authored state

`skipped` is only valid for `optional: true` artifacts. Attempting to skip a non-optional artifact throws an error.

The `skipped` state must be set explicitly by an actor — human or agent via a CLI command. The agent must be instructed (via the schema `instruction` or skill definition) to call that command when it decides not to produce an optional artifact. The specific CLI command is defined in the CLI spec.

`ChangeArtifact.markComplete(key, hash)` takes two arguments — the file key and the content hash — and delegates to the corresponding `ArtifactFile.markComplete(hash)`. A successful completion sets the file state to `complete`, updates `validatedHash`, and recomputes the parent artifact state. `ChangeArtifact.markSkipped()` marks ALL files in the artifact as `skipped`. These may only be called by the `ValidateArtifacts` and skip use cases respectively. No other code path may set these values.

Dependency satisfaction for persisted facts uses persisted artifact `state`. Only artifacts in `complete` or `skipped` satisfy `requires` at persist. Verdict effective status (`projectArtifacts` / `evaluateLifecycleVerdict`) MAY additionally report `pending-parent-artifact-review` when a complete file is blocked by an upstream parent that is `pending-review` or `drifted-pending-review`.

**Invalidation:** Drifted files keep focused `hasDrift` and review evidence. Additional reopening follows `invalidation.artifacts`, and lifecycle recovery follows the canonical reconciler. Returning to `designing` does not imply a second unconditional mass downgrade beyond the effective artifact policy. Task artifacts are excluded from automatic drift and parent-propagated reopening.

### Requirement: Artifact sync

A Change can reconcile its artifact map against the current schema's artifact types via the `syncArtifacts(artifactTypes)` method. This method:

1. Compares the current artifact map against the provided `artifactTypes` array.
2. Adds new artifact types and their expected files (based on scope and specIds).
3. Removes artifact types no longer in the schema.
4. For existing artifacts, adds files for new spec IDs and removes files for spec IDs no longer in the change.
5. Returns `true` if any changes were made, `false` if the artifact map was already in sync.
6. When changes are made, appends an `ArtifactsSyncedEvent` to history with the `SYSTEM_ACTOR` identity.

`SYSTEM_ACTOR` is a constant `{ name: 'specd', email: 'system@getspecd.dev', provider: 'system' }` used for automated operations.

### Requirement: History and event sourcing

The change manifest contains an **append-only `history` array** of typed events. Every significant operation appends one or more events. Events are never modified or removed.

The **current lifecycle state** of a Change is derived entirely from its history: the `to` field of the most recent `transitioned` event. If no `transitioned` event exists, the state is `drafting`. No separate state snapshot is stored. The JSON serialization of these events in `manifest.json` is defined in [`core:change-manifest` — Requirement: Manifest structure](../change-manifest/spec.md).

The **current draft/active status** is derived from history: if the most recent `drafted` or `restored` event is of type `drafted`, the change is currently stored under `drafts/` and outside the active working set; otherwise it is active under `changes/`.

Current approval and verification validity is read from materialized projections. Approval, verification, invalidation, revocation, and recovery events remain append-only audit evidence and adapt legacy v1 records; a broad later event MUST NOT make unrelated evidence disappear implicitly.

All events share common fields:

- **`type`** — identifies the event kind
- **`at`** — ISO 8601 timestamp
- **`by`** — the `ActorIdentity` of the person or system performing the operation, mandatory on all events

The event table below includes legacy artifact-hash-only approval records and broad scope-review invalidations for compatibility. New v2 approval records SHALL carry the fingerprints defined by the materialized projection requirements. Active scope reconciliation SHALL record changed consent through `approval-invalidated` with cause `scope-change` and `spec-added` or `spec-removed` differences; it MUST NOT require a broad `invalidated` event merely because scope changed. The legacy `invalidated` cause `spec-change` describes artifact-review evidence, not an instruction to clear approvals or roll back lifecycle. Current projection invalidation and artifact review are separate audit facts.

Event types:

| Type                  | Additional fields                                          | When appended                                                                |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `created`             | `specIds`, `schemaName`, `schemaVersion`                   | Once, when the change is first created                                       |
| `transitioned`        | `from: ChangeState`, `to: ChangeState`                     | Each lifecycle state transition                                              |
| `spec-approved`       | `reason: string`, `artifactHashes: Record<string, string>` | When the spec approval gate is passed                                        |
| `signed-off`          | `reason: string`, `artifactHashes: Record<string, string>` | When the signoff gate is passed                                              |
| `invalidated`         | `cause`, `message`, `affectedArtifacts`                    | When scope or artifact review invalidates prior approvals                    |
| `drafted`             | `reason?: string`                                          | When a change is moved to `drafts/`                                          |
| `restored`            | _(none beyond common fields)_                              | When a drafted change is moved back to `changes/`                            |
| `artifact-skipped`    | `artifactId: string`, `reason?: string`                    | When an optional artifact is explicitly marked as not produced               |
| `artifacts-synced`    | `typesAdded`, `typesRemoved`, `filesAdded`, `filesRemoved` | When artifact sync reconciles the artifact map against schema                |
| `description-updated` | `description: string`                                      | When the change description is updated via `EditChange` with `--description` |
| `discarded`           | `reason: string`, `supersededBy?: string[]`                | When a change is permanently abandoned                                       |

`invalidated.cause` is explicit and machine-readable:

- `spec-change` — the change scope changed (for example, `specIds` were edited)
- `artifact-drift` — one or more validated artifact files changed on disk
- `artifact-review-required` — the change returned to `designing` because the artifacts must be revised even though no drifted file was detected
- `spec-overlap-conflict` — the change was invalidated because an archived change with overlapping specs was archived with `allowOverlap: true`

`invalidated.message` is a clear human-readable explanation, not a one-word label. `invalidated.affectedArtifacts` is a structured list of the affected artifact types and file keys so callers can explain exactly what triggered the review:

- `type` — artifact type ID
- `files` — list of file keys, using the artifact file key for `scope: change` and the spec ID for `scope: spec`

Approval invalidation caused by artifact drift MUST capture the full set of affected files before the event is appended. If multiple files drift in the same invalidation pass, they are recorded in the same `invalidated` event.

#### Scenario: Overlap conflict invalidation

- **GIVEN** active change `beta` overlaps specs archived by `alpha`
- **WHEN** archive reconciliation records `spec-overlap-conflict` for `beta`
- **THEN** one focused invalidation event names `alpha` and the overlapping spec IDs
- **AND** artifact reopening follows `beta`'s artifact policy
- **AND** lifecycle recovery follows its workflow policy unless required stale spec consent mandates `designing`
- **AND** repeated observation does not append duplicate invalidation or recovery events

### Requirement: Archive outcome history

A failed archive attempt MUST be traceable through change history without making a failed pre-commit attempt appear as a completed archive.

The `archive-failed` event records that an archive attempt failed while the change was still active. It MUST capture at minimum:

- `step` — the failing phase (`prepare`, `commit`, or `archive`)
- `message` — human-readable failure summary
- `commitStarted` — whether canonical publication or archive move had begun

`archive-failed` captures diagnostics for the failed attempt. It does not by itself advance the external archive lifecycle outcome.

Lifecycle rollback rules:

- Failures before archive commit begins (hooks, preflight, guards while still in `archivable`) MUST leave the change in `archivable`.
- Failures during archive commit (publish or archive move) MUST attempt batch canonical restore first. When restore succeeds, the change MUST transition from `archiving` to `archivable`. When restore fails, the change MUST remain in `archiving` until manual escape to `designing`.
- After a successful archive move, no lifecycle rollback occurs. Metadata generation failures and post-archive hook failures do not undo archive completion.

Successful archive completion is not represented by appending another event to the active change's history after the change has ceased to be an active change. Success traceability belongs to the archived record and archived manifest metadata.

### Requirement: Historical implementation detection

A Change SHALL treat any historical transition to `implementing` as evidence that implementation may already exist, even if the current lifecycle state later returns to `designing`, `verifying`, or another non-terminal state.

This detection is temporary and pragmatic. Until specd can detect whether a change has actually modified code files, the system SHALL derive this signal by scanning the append-only history for any `transitioned` event whose `to` field is `implementing`.

The signal is historical, not state-based. It remains true once reached unless the project later introduces a more precise file-level implementation detector.

### Requirement: Schema version

The `created` event records the `schemaName` and `schemaVersion` of the schema active at creation time.

A **`schemaName` mismatch** (e.g. `schema-std` → `custom-schema`) indicates structural incompatibility. When a use case detects that `schema.name() !== change.schemaName`, it MUST throw `SchemaMismatchError` before performing any work.

A **`schemaVersion` mismatch** within the same schema name is advisory. When a change is loaded and the active schema version differs from the one recorded in the change, the system MUST emit a warning. The change remains fully usable. Archiving with a `schemaVersion` mismatch is allowed.

### Requirement: Drafting and discarding

A change may be moved between storage locations without affecting its lifecycle state. All operations are recorded as events in history.

- **Draft** (`changes/` → `drafts/`) — moves the change to drafted storage. Appends a `drafted` event. If the change has ever reached `implementing`, drafting SHALL fail by default.
  - **`by`** — mandatory `ActorIdentity`
  - **`at`** — timestamp
  - **`reason`** — optional explanation
- **Restore** (`drafts/` → `changes/`) — returns a drafted change to the active working set. Appends a `restored` event. Only `RestoreChange` (via `mutateDraft`) may perform this while the change is drafted.
- **Discard** (`changes/` or `drafts/` → `discarded/`) — permanently abandons the change. Appends a `discarded` event. If the change has ever reached `implementing`, discarding SHALL fail by default.
  - **`reason`** — mandatory human-provided explanation
  - **`by`** — mandatory `ActorIdentity`
  - **`at`** — timestamp
  - **`supersededBy`** — optional list of change names that replace this one

### Requirement: Drafted read-only semantics

When `isDrafted === true`, the change is outside the active working set and MUST be treated as read-only.

While drafted, the change MUST NOT:

- receive lifecycle `transitioned` events
- persist artifact validation outcomes, scope edits, approvals, invalidations, or implementation-tracking updates
- have artifact files written via transforming use cases

While drafted, the only transforming operations permitted are:

- **Restore** — via `RestoreChange` and `ChangeRepository.mutateDraft`
- **Discard** — via `DiscardChange` and `ChangeRepository.mutateDraft`

Read-only inspection MUST use `ChangeRepository.getDraft` or `GetDraft` and MUST return `DraftedChangeView`, not a mutable `Change` exposed to application callers.

Attempts to transform a drafted change through active-change APIs MUST fail with `ChangeNotFoundError` when resolution is active-only, or `DraftedChangeReadOnlyError` when a low-level persistence primitive is invoked incorrectly.

### Requirement: Lifecycle interpretation authority

The `Change` entity is the source of truth for persisted lifecycle facts: history, the current persisted state, artifact files, aggregate artifact states, approvals, and invalidation events.

Dependency-aware lifecycle interpretation is a separate concern. Any decision that depends on the schema DAG, workflow `requires`, recursive parent blocking, approval-gate checks, or hop availability SHALL be interpreted by `evaluateLifecycleVerdict` / `projectArtifacts`, not by the `Change` entity itself.

This separation ensures the entity does not need schema knowledge in order to answer questions such as:

- whether an artifact is effectively blocked by an upstream parent
- which lifecycle hop is protocol-legal next (`VALID_TRANSITIONS`) and which of those hops pass blocking predicates (`availableTransitions`)
- whether a requested forward leave of `ready` / `done` is blocked by an in-place approval check
- which blocker or domain `nextHop` should be surfaced (`evaluateLifecycle` attaches `nextAction.command`)

Schema `workflow[]` lookup rows MUST NOT be treated as the set of participating states.

### Requirement: Policy-aware invalidation

`Change.invalidate()` SHALL accept a structured policy with independent `artifacts` and `workflow` dimensions, a domain cause, a human-readable message, a focused `affectedArtifacts` payload, and the schema-derived `ArtifactDag` used for expansion.

Artifact review SHALL follow `invalidation.artifacts`:

- `none` reopens no additional file, but does not make existing drift or pending review acceptable for forward progress
- `surgical` reopens only the normalized affected set
- `downstream` reopens the normalized affected set and its DAG descendants
- `global` reopens every non-task artifact file

Artifacts whose schema type has `hasTasks: true` SHALL be excluded from drift-driven reopening and from propagation originating in another artifact. Explicit task review remains permitted.

Lifecycle movement SHALL follow `invalidation.workflow`: `preserve` retains the current state and `redesign` requests a return to `designing`. The aggregate MUST NOT infer approval-gate recovery from this policy. A central reconciler supplies the final recovery decision, where required stale spec approval returns to `designing`, required stale sign-off returns a later state to `done`, and spec recovery has priority when both gates are invalid. Recovery MUST NOT advance a change that is already earlier than its target.

Invalidation SHALL append audit evidence without deleting or rewriting prior events. Applying the same invalidity and recovery more than once SHALL be idempotent.

### Requirement: Per-file drift tracking

Each tracked artifact file SHALL persist a boolean `hasDrift` signal alongside its canonical workflow state and validated baseline hash.

`hasDrift=true` means the file's current state does not match its validated baseline. This includes changed content and file absence.

`hasDrift=false` means the file's current state matches the validated baseline.

`Change.invalidate()` SHALL materialize `hasDrift=true` only when the invalidation cause is `artifact-drift`, and only for the focused artifact/file entries supplied in `affectedArtifacts`.

Manual invalidation (`artifact-review-required`) SHALL NOT set or clear `hasDrift`.

When a file is canonically `complete` and `hasDrift=true`, human-facing read models MAY render it as `complete-with-drift`.

When a file is canonically `missing`, `missing` remains the canonical state even if `hasDrift=true`.

### Requirement: Task completion scope

A change MUST require task completion only for artifact types that declare `hasTasks: true` and a task-completion check. It MUST NOT infer that every task-like statement belongs to the tasks artifact or block a lifecycle transition for an artifact without a declared task check.

### Requirement: Validity fingerprint scope

Spec approval SHALL fingerprint the exact sorted, deduplicated canonical spec scope together with schema-relevant non-task artifact files after their configured `preHashCleanup`. Scope equality is set equality: ordering alone is immaterial, while additions and removals produce explicit differences. Verification and sign-off SHALL fingerprint the same artifact view plus the confirmed in-scope implementation file set.

Implementation fingerprints SHALL be deterministic maps from deduplicated project-relative paths to whole-file hashes. The complete path set participates in equality, so adding, removing, renaming, or unlinking a file changes the fingerprint. An empty map is a valid observed snapshot; missing or `null` is legacy unknown evidence.

Text fingerprint algorithm `text-v1` removes an initial UTF-8 BOM, converts CRLF and CR to LF, removes trailing horizontal whitespace, turns whitespace-only lines into empty lines, and normalizes the final newline. It MUST NOT parse source languages, format code, strip internal whitespace, or hash only symbol ranges. Binary inputs SHALL be hashed byte-for-byte with their algorithm recorded. Missing or unreadable linked files SHALL fail fingerprint calculation rather than being omitted.

Artifacts marked `hasTasks: true` SHALL be excluded from approval and verification fingerprints and automatic content-drift invalidation. They remain required when declared, structurally validated, live-counted for task completion, and checked again before archive.

## Constraints

- `name` and `createdAt` are immutable; `workspaces` is derived from `specIds`, never persisted independently.
- Lifecycle state is derived from append-only transition history; approval and verification validity is read from materialized projections whose audit events are never erased.
- Scope or artifact changes append focused invalidation evidence and are applied by the central reconciler. Lifecycle recovery follows structured workflow policy and mandatory gate precedence, never an unconditional repository-read return to `designing`.
- Re-entering `designing` from `designing` does not invalidate consent or reopen artifacts.
- File state is explicit and aggregated into `ChangeArtifact`; `validatedHash` is only the last structural baseline and `hasDrift` is persisted independently.
- `skipped` is valid only for optional artifacts and satisfies declared artifact dependencies.
- Artifact reopening is policy-driven. `verifying → implementing` does not mass-reopen unchanged artifacts or invalidate unchanged verification or spec approval; movement below sign-off retains its independent sign-off invalidation rules.
- `ChangeArtifact.markComplete` is reserved for validation and `markSkipped` for the skip use case.
- `syncArtifacts` reconciles schema-declared artifact/file shape and appends an actor-attributed audit event when it changes persisted state.
- `archivable` and `archiving` remain the only archive-operation source states.
- Approval gates default off. When enabled, spec approval requires current valid consent before implementation and sign-off requires current valid consent before archivable.
- Task completion is controlled by schema `hasTasks`, `taskCompletionCheck`, and workflow `requiresTaskCompletion`; task content is not approval evidence.
- Archive is an operation evaluated by shared transition checks, not a normal lifecycle edge.

## Spec Dependencies

- [`core:change-manifest`](../change-manifest/spec.md) — manifest serialization of artifact and history state
- [`core:workflow-model`](../workflow-model/spec.md) — workflow step semantics and requires gating
- [`core:spec-metadata`](../spec-metadata/spec.md) — dependency metadata resolution used during context compilation
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` identifiers for spec-scoped files
- [`default:_global/architecture`](../../_global/architecture/spec.md) — domain ownership of lifecycle and artifact invariants
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md) — interprets schema-aware lifecycle and dependency status from persisted change facts
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging conventions for archive-attempt diagnostics reflected in change history
- [`core:implementation-detector-port`](../implementation-detector-port/spec.md) — triggers autodetection before status load and transitions
- [`core:transition-checks`](../transition-checks/spec.md) — shared transition-attempt evaluation consumed by status and execute
