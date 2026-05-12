# Design: drifted-artifact-status

## Non-goals

- Introduce a new change lifecycle state. The lifecycle stays `drafting → designing → ready → implementing → verifying ...`; the change is in artifact/file state semantics, not in a new top-level workflow.
- Let agents read or reason directly from `manifest.json`. The manifest remains an internal persistence detail of `@specd/core`; agent-facing behavior must flow through `GetStatus`, `change context`, and the CLI.
- Add migration tooling for old manifests. The implementation should be backward-compatible on read, but it does not need a standalone migration command or rewrite pass beyond normal save behavior.

## Affected areas

- `packages/core/src/domain/value-objects/artifact-status.ts`
  Change: extend `ArtifactStatus` to `missing | in-progress | complete | skipped | pending-review | drifted-pending-review`.
  Callers: shared value object used across domain, application, fs serialization, and CLI serialization. Risk: HIGH because every artifact-state comparison now needs to treat `pending-review` and `drifted-pending-review` as non-satisfying states.

- `packages/core/src/domain/value-objects/artifact-file.ts`
  Change: make file state fully first-class. `ArtifactFile` needs explicit transitions for `pending-review` and `drifted-pending-review`, and it must stop treating `validatedHash` as the only source of truth for state.
  Callers: owned by `ChangeArtifact`, loaded by `FsChangeRepository`, surfaced by `GetStatus`. Risk: HIGH because file state becomes the source of truth for change-scoped and spec-scoped artifacts.

- `packages/core/src/domain/entities/change-artifact.ts`
  Change: materialize and persist aggregate artifact state instead of deriving it only at read time. The aggregate must be recomputed from `files[].state` with precedence `drifted-pending-review > pending-review > skipped/complete/missing/in-progress`.
  Callers: all artifact lifecycle code routes through this entity. Risk: HIGH because `status` is used by validation, transition, repository sync, and CLI views.

- `packages/core/src/domain/entities/change.ts`
  Change: redesign invalidation and downgrade semantics. `invalidate()` is the high-risk integration point here: graph impact shows 9 direct dependents and `riskLevel: HIGH`. The change entity must:
  - record structured `invalidated` events with `cause`, `message`, and `affectedArtifacts`
  - downgrade files to `pending-review` or `drifted-pending-review`
  - preserve `drifted-pending-review` when a broader downgrade happens
  - keep `requires` evaluation based on persisted state instead of `validatedHash`
  - stop using `verifying → implementing` as an implicit artifact reset
    Note: this is the core blast-radius hotspot for the change.

- `packages/core/src/infrastructure/fs/manifest.ts`
  Change: extend manifest schemas and raw event types so both `artifacts[].state` and `artifacts[].files[].state` are persisted, `invalidated` events carry a human-readable message plus per-artifact file details, and legacy `cause: 'artifact-change'` remains readable as backward-compatible drift history.
  Callers: repository load/save path, corruption checks. Risk: HIGH because malformed persistence here corrupts every change load.

- `packages/core/src/infrastructure/fs/change-repository.ts`
  Change: stop reconstructing artifact state purely from `validatedHash`. `_manifestToChange()` and `_deriveFileStatus()` must become state-aware, drift detection must collect all affected file keys before invalidating, `changeToManifest()` must emit file state plus aggregate artifact state, and invalidated-event deserialization must normalize legacy `artifact-change` to the current artifact-drift cause at this fs boundary.
  Callers: every `get()` and `save()` goes through this path. Risk: HIGH because this is the persistence gateway and auto-drift safety net.

- `packages/core/src/application/use-cases/validate-artifacts.ts`
  Change: drift detection must collect `Map<artifactId, Set<fileKey>>`, not just artifact IDs, and then call the redesigned invalidation API. Validation completion still marks individual files `complete`, but approval invalidation must now preserve which files drifted.
  Callers: CLI `change validate`, future skill automation, approval invalidation. Risk: HIGH because it mutates state during both validation and approval invalidation.

- `packages/core/src/application/use-cases/transition-change.ts`
  Change: remove the current `verifying → implementing` reset path that calls `clearArtifactValidations()`. When the caller sends the change back to `designing`, transition logic must invoke the redesigned invalidation/downgrade path so files become `pending-review` unless already `drifted-pending-review`.
  Callers: all lifecycle transitions. Risk: HIGH because this file decides whether a verification failure becomes implementation work or artifact review.

- `packages/core/src/application/use-cases/get-status.ts`
  Change: expose persisted artifact state and file state, including the stored `validatedHash`, plus a derived review summary for agents and CLI that prioritizes file names and absolute paths over manifest-internal keys. This is the public read model that hides the manifest from agents.
  Callers: `change status`, `change artifacts`, agent routing, skill context. Risk: HIGH because downstream tools consume this shape directly.

- `packages/cli/src/commands/change/status.ts`
  Change: show aggregate artifact state and file state in text/JSON/TOON output, plus a `review` section when review is required. The review section must show affected filenames and absolute paths rather than only file keys. This command currently only shows `effectiveStatus`, so it must be refactored to display persisted state without hiding file-level drift.
  Callers: human operators and skills. Risk: HIGH because CLI output is a high-fan-in hotspot through `output()` / `parseFormat()`.

- `packages/cli/src/commands/change/artifacts.ts`
  Change: stop flattening to one `effectiveStatus` per displayed row. This command must show artifact-level state, per-file state, existence, the absolute file path for each row, the absolute change directory in structured output, and delta rows without erasing the distinction between `pending-review` and `drifted-pending-review`.
  Callers: human operators and automation inspecting artifacts. Risk: MEDIUM-HIGH because it already depends on `GetStatus` plus schema delta metadata.

- `packages/cli/test/commands/change.spec.ts`
  Change: extend `change status` expectations for text and JSON output to include artifact/file state and review summary.
  Risk: MEDIUM. These tests are the regression guard for the new public shape.

- `packages/cli/test/commands/change-artifacts.spec.ts`
  Change: extend artifact listing tests for per-file rows, aggregate artifact state, and new review states.
  Risk: MEDIUM.

- `packages/core/test/application/use-cases/*` and `packages/core/test/domain/*` (new or existing focused suites)
  Change: add or update tests around `Change.invalidate()`, repository manifest load/save, `GetStatus`, `TransitionChange`, and `ValidateArtifacts`.
  Risk: HIGH. The domain and application behavior here is central and needs direct coverage, not only CLI assertions.

## New constructs

- `InvalidatedArtifactEntry` in `packages/core/src/domain/entities/change.ts`
  Shape:

  ```ts
  export interface InvalidatedArtifactEntry {
    readonly type: string
    readonly files: readonly string[]
  }
  ```

  Responsibility: machine-readable list of affected file keys per artifact for `invalidated` events. This remains an internal/domain representation keyed for stable matching.
  Relationships: stored on `InvalidatedEvent`, serialized by `manifest.ts`, resolved by `GetStatus` into an agent-facing file/path projection.

- Expanded `InvalidatedEvent` in `packages/core/src/domain/entities/change.ts`
  Shape:

  ```ts
  export interface InvalidatedEvent {
    readonly type: 'invalidated'
    readonly at: Date
    readonly by: ActorIdentity
    readonly cause: 'spec-change' | 'artifact-drift' | 'artifact-review-required'
    readonly message: string
    readonly affectedArtifacts: readonly InvalidatedArtifactEntry[]
  }
  ```

  Responsibility: append-only audit event that explains why the change returned to review and which files caused it.
  Relationships: produced by `Change.invalidate(...)`, stored in `manifest.json`, read by `GetStatus` for review summary derivation.

- `ReviewSummary` in `packages/core/src/application/use-cases/get-status.ts`
  Shape:

  ```ts
  export interface ReviewArtifactFileSummary {
    readonly key: string
    readonly filename: string
    readonly path: string
  }

  export interface ReviewArtifactSummary {
    readonly type: string
    readonly files: readonly ReviewArtifactFileSummary[]
  }

  export interface ReviewSummary {
    readonly required: boolean
    readonly route: 'designing' | null
    readonly reason: 'artifact-drift' | 'artifact-review-required' | null
    readonly affectedArtifacts: readonly ReviewArtifactSummary[]
  }
  ```

  Responsibility: stable agent-facing summary derived from file states and the latest invalidation context, with filenames and absolute paths ready for tooling.
  Relationships: included in `GetStatusResult`, serialized by `change status`, consumed by skills instead of reading the manifest.

- `ManifestAffectedArtifact` in `packages/core/src/infrastructure/fs/manifest.ts`
  Shape:

  ```ts
  export interface ManifestAffectedArtifact {
    readonly type: string
    readonly files: string[]
  }
  ```

  Responsibility: raw JSON storage shape for `invalidated.affectedArtifacts`.
  Relationships: used only by manifest zod schema + event serialization/deserialization.

- Expanded manifest artifact/file shapes in `packages/core/src/infrastructure/fs/manifest.ts`
  Shape:

  ```ts
  export interface ManifestArtifactFile {
    readonly key: string
    readonly filename: string
    readonly state?: ArtifactStatus
    readonly validatedHash: string | null
  }

  export interface ManifestArtifact {
    readonly type: string
    readonly optional: boolean
    readonly requires: string[]
    readonly state?: ArtifactStatus
    readonly files: ManifestArtifactFile[]
  }
  ```

  Responsibility: persist file-level source-of-truth state plus aggregate artifact state.
  Relationships: loaded by `FsChangeRepository`, defaulted to `missing` when absent, re-emitted by `changeToManifest()`.

## Approach

The implementation stays evolutionary: keep the current change/artifact model and invalidation workflow, but make file state explicit and persistent.

1. Persist state at both levels.
   `manifest.json` becomes the system of record for `artifacts[].state` and `artifacts[].files[].state`. `validatedHash` remains the last validated cleaned hash (or skip sentinel), but it is no longer the field from which state is reconstructed on every read.

2. Make file state authoritative.
   `ArtifactFile` becomes the only place where `complete`, `pending-review`, and `drifted-pending-review` are assigned. The old “derive from hash on load” behavior remains only as a fallback when a manifest entry has no persisted `state`, in which case the repository materializes:
   - `missing` when no file exists
   - `in-progress` when a file exists with no validated hash
   - `skipped` when the skip sentinel is present on an optional artifact
   - `complete` when the current cleaned hash matches `validatedHash`
   - `missing` as the defensive default when neither file nor `state` exists

3. Materialize aggregate artifact state.
   `ChangeArtifact` recomputes and stores an aggregate `_state` whenever files are added, removed, validated, downgraded, or drifted. The precedence is:
   - any file `drifted-pending-review` → artifact `drifted-pending-review`
   - else all files `pending-review` → artifact `pending-review`
   - else all files `skipped` → artifact `skipped`
   - else all files `complete` or `skipped` and at least one file exists → artifact `complete`
   - else all files `missing` or no files → artifact `missing`
   - else → artifact `in-progress`

4. Separate own state from dependency blocking.
   `requires` remains declarative. Satisfaction becomes a small helper (`status === 'complete' || status === 'skipped'`) evaluated from persisted artifact state. This keeps artifact state meaningful and prevents “blocked by dependency” from overwriting `pending-review` or `drifted-pending-review`.
   `Change.effectiveStatus()` can remain as a compatibility helper for lifecycle gating, but `GetStatus` and CLI output must expose the persisted `state` explicitly and treat dependency blockers as separate lifecycle data.

5. Redesign invalidation around affected files.
   `Change.invalidate(...)` should accept the structured payload:

   ```ts
   invalidate(
     cause: 'spec-change' | 'artifact-drift' | 'artifact-review-required',
     actor: ActorIdentity,
     options?: {
       readonly message?: string
       readonly affectedArtifacts?: readonly InvalidatedArtifactEntry[]
     },
   ): void
   ```

   Behavior:
   - append one structured `invalidated` event
   - transition to `designing` only when the current state is not already `designing`
   - if `cause === 'artifact-drift'`, mark only the explicitly drifted files as `drifted-pending-review`
   - compute the downstream artifact closure from those drifted artifact IDs and mark every other file in that closure `pending-review`
   - if `cause === 'spec-change'` or `cause === 'artifact-review-required'`, mark every existing non-drifted file in the affected artifact set `pending-review`
   - never overwrite `drifted-pending-review` with `pending-review`

6. Treat scope edits as review downgrades.
   `Change.updateSpecIds()` keeps invalidating the change, but when it does so while the lifecycle remains `designing`, it still downgrades already-existing files to `pending-review`. Files introduced by the new scope stay `missing` until written.

7. Stop clearing design artifacts on `verifying → implementing`.
   `TransitionChange.execute()` removes the current `clearArtifactValidations(implementingStep.requires)` behavior. A verification-driven return to `implementing` is now only a lifecycle move; artifact state stays untouched. Returning to `designing` is the only path that downgrades design artifacts, and it does so through the structured invalidation API.

8. Collect all drift before mutating.
   Both eager drift detection in `FsChangeRepository._manifestToChange()` and approval invalidation in `ValidateArtifacts.execute()` must scan every file in every relevant artifact, build the full `affectedArtifacts` structure, and only then call `invalidate('artifact-drift', ...)`. This preserves every drifted spec key instead of stopping at the first mismatch.

9. Expose review state through `GetStatus`, not through the manifest.
   `GetStatusResult` should grow a `review` block derived from current file states and the last invalidation context:
   - `required = true` if any file state is `pending-review` or `drifted-pending-review`
   - `route = 'designing'` when review is required, otherwise `null`
   - `reason = 'artifact-drift'` when any file is `drifted-pending-review`; otherwise `artifact-review-required` when any file is `pending-review`
   - `affectedArtifacts` from the latest relevant invalidation event, filtered to the current outstanding review set and resolved into `{ type, files: [{ key, filename, path }] }`
   - `ArtifactFileStatus.validatedHash` should remain in the DTO so status serializers can expose the last validated content reference without reading the manifest

   The review summary must resolve each file key against the current artifact file entries so outward-facing consumers see concrete files to inspect. For `scope: change`, this turns `tasks` into `tasks.md` plus the absolute change path. For `scope: spec`, it resolves the delta filename/path while preserving the spec ID as supplemental context.

10. Update CLI surfaces to present both levels.
    `change status` must show:
    - artifact aggregate state
    - per-file state under each artifact
    - lifecycle blockers separately
    - a `review` section in text and a stable `review` object in JSON/TOON
    - affected review files rendered with filenames and absolute paths as the primary identifier

    `change artifacts` must show:
    - one row for each file entry with its individual state
    - the parent artifact aggregate state
    - the absolute path for each file row plus the absolute change directory in structured output
    - existence and delta rows without inventing a fake `effectiveStatus`

11. Update docs as part of the implementation.
    The CLI reference for `change status` and `change artifacts` in `docs/cli/` must be updated to document:
    - the new states
    - the `review` block in structured output
    - the fact that `review.affectedArtifacts[].files[]` are projected as filename/path entries rather than as bare manifest keys
    - the text-mode per-file rendering

12. Keep historical manifests readable.
    `manifest.ts` and repository event decoding must accept both `artifact-drift` and the older `artifact-change` persisted cause values. On load, the legacy value maps into the new artifact-drift semantics so global readers do not fail when they encounter archived or discarded manifests written before this change.
    The implementation should also leave a succinct code comment at the compatibility branch explaining why `artifact-change` is still accepted: the repository already contains historical manifests with that persisted value, and breaking reads there would regress global commands such as dashboard, listing, and archive inspection.
    Concretely, this support lives in the fs read path: `manifest.ts` continues to accept the raw persisted event shape, and `change-repository.ts` performs the normalization when raw events are turned into domain `InvalidatedEvent` values. The domain model itself stays canonical on `artifact-drift` and does not carry the legacy alias.

## Key decisions

- **Persist `state` on both artifact and file instead of continuing to derive it from `validatedHash`.**
  Rationale: `pending-review` and `drifted-pending-review` encode workflow meaning that hash comparison alone cannot reconstruct.
  **Alternatives rejected**: keep deriving everything from `validatedHash` plus file existence. Rejected because the user-facing distinction disappears after reload and agents cannot reason reliably about review-required status.

- **Keep file state as the source of truth; materialize artifact state as an aggregate.**
  Rationale: `scope: spec` needs exact per-spec drift reporting, while humans still need an artifact-level summary.
  **Alternatives rejected**: only store artifact state. Rejected because it cannot express which spec/file drifted and would reintroduce ambiguity in status output and history.

- **Use `drifted-pending-review` instead of a plain `drifted` state.**
  Rationale: the lifecycle consequence of drift is review, not an isolated drift flag; the name keeps that routing explicit and prevents later downgrade code from flattening it to plain `pending-review`.
  **Alternatives rejected**: `drifted`. Rejected because it would need extra precedence rules to stop `designing` downgrades from clobbering it.

- **Preserve `validatedHash` when a file becomes `pending-review` or `drifted-pending-review`.**
  Rationale: the hash still represents the last validated content and remains useful for explaining drift, revalidation, and approval invalidation; only the state changes.
  **Alternatives rejected**: clear `validatedHash` on every downgrade. Rejected because it destroys the last-known-good reference and makes later drift explanations weaker.

- **Treat dependency blocking as lifecycle metadata, not as artifact state.**
  Rationale: an artifact can be `pending-review` or `complete` in its own right even when another artifact blocks a transition.
  **Alternatives rejected**: keep user-facing `effectiveStatus` as the only reported status. Rejected because it collapses artifact truth and workflow blockers into one confusing label, the same ambiguity this change is fixing.

- **Make `verifying → implementing` a pure lifecycle transition when artifacts did not change.**
  Rationale: implementation failures should not force mechanical artifact revalidation.
  **Alternatives rejected**: keep resetting validations on every `verifying → implementing`. Rejected because it conflates implementation rework with artifact review and directly contradicts the new workflow semantics.

- **Model invalidation history as structured data plus a human-readable message.**
  Rationale: CLI, agents, and future tooling need stable machine-readable fields, while humans need a clear sentence in the audit trail.
  **Alternatives rejected**: text-only history messages. Rejected because downstream tooling would have to parse prose.

- **Keep invalidation history backward-compatible on read.**
  Rationale: the repository already contains archived/discarded manifests with `cause: 'artifact-change'`, and global readers must not break on historical data.
  **Alternatives rejected**: hard-fail on old manifests or require a dedicated migration before use. Rejected because it breaks dashboard/list/history commands for unrelated existing changes.

- **Project review work as filename/path, not as raw manifest key.**
  Rationale: operators and agents act on files, not on the persistence key chosen by the fs repository. A path-first projection removes an unnecessary lookup step and avoids exposing manifest internals as the primary user-facing concept.
  **Alternatives rejected**: show only file keys. Rejected because it makes `scope: change` artifacts read as `tasks: tasks` and forces agents to infer the real file.

## Trade-offs

- `[Central domain churn]` → `Change`, `ChangeArtifact`, and `ArtifactFile` all change together.
  Mitigation: add focused domain tests before touching CLI formatting, so aggregate/file semantics are pinned down early.

- `[Manifest compatibility]` → introducing required `state` fields and new invalidation causes risks rejecting older manifests.
  Mitigation: zod schemas allow `state` to be optional on read, repository defaults missing `state` to `missing`, legacy `artifact-change` is accepted as a backward-compatible read alias for drift, and save paths always emit the new canonical shape.

- `[Two concepts of status during transition]` → keeping `effectiveStatus()` for internal lifecycle checks while exposing persisted `state` publicly can be confusing during the refactor.
  Mitigation: use `state` consistently in the public DTOs and CLI output, and keep `effectiveStatus()` internal to lifecycle/blocker computation only.

- `[CLI output expansion]` → `change status` and `change artifacts` become more verbose.
  Mitigation: keep text output compact with indentation and only emit the `review` section when `review.required === true`.

## Spec impact

The modified specs are all local to this feature area. Direct ripple is limited and there is no evidence of downstream spec dependencies that need their own delta in this change.

### `core:core/change`

- Direct dependents discovered in repo/spec search: no explicit `Spec Dependencies` backlinks found; repo references are example/spec-ID mentions only.
- Impact assessment: safe to update in place. This spec owns the domain semantics for invalidation and artifact status.

### `core:core/change-manifest`

- Direct dependents discovered in repo/spec search: no explicit spec dependency backlinks found.
- Impact assessment: safe to update in place. Manifest field additions remain internal to the fs adapter and `change status`/`change artifacts` projections.

### `core:core/change-repository-port`

- Direct dependents discovered in repo/spec search: `core:core/edit-change/verify` references the port spec by ID in scenarios, but not as a declared dependency.
- Impact assessment: no dependent spec delta required; behavior remains within the same port contract.

### `core:core/kernel`

- Direct dependents discovered in repo/spec search: no declared spec dependency ripple found beyond kernel composition consumers using the documented eager-load contract.
- Impact assessment: this spec must be updated in the same change because it still documents eager drift invalidation using the removed `artifact-change` cause, which would leave a live contract mismatch otherwise.

### `core:core/get-status`, `core:core/validate-artifacts`, `core:core/transition-change`, `core:core/workflow-model`

- Direct dependents discovered in repo/spec search: no declared spec dependency ripple found.
- Impact assessment: these specs form one cohesive workflow cluster and are being updated together in this same change, so their internal ripple is already covered.

### `cli:cli/change-status`, `cli:cli/change-artifacts`

- Direct dependents discovered in repo/spec search: no declared spec dependency ripple found.
- Impact assessment: documentation and command tests need updating, but no extra spec delta outside this change is required.

## Dependency map

```mermaid
graph LR
  Repo[FsChangeRepository] --> Change[Change.invalidate()]
  Validate[ValidateArtifacts.execute()] --> Change
  Transition[TransitionChange.execute()] --> Change
  Change --> Artifact[ChangeArtifact]
  Artifact --> File[ArtifactFile]
  Manifest[manifest.ts] --> Repo
  GetStatus[GetStatus.execute()] --> Change
  GetStatus --> StatusCLI[cli/change status]
  GetStatus --> ArtifactsCLI[cli/change artifacts]
  ChangeSpec[core:core/change] -. updated with .-> ManifestSpec[core:core/change-manifest]
  ChangeSpec -. updated with .-> WorkflowSpec[core:core/workflow-model]
  WorkflowSpec -. drives .-> CliStatusSpec[cli:cli/change-status]
  WorkflowSpec -. drives .-> CliArtifactsSpec[cli:cli/change-artifacts]
```

```text
┌──────────────────────────┐
│ FsChangeRepository       │
│ _manifestToChange()      │
│ changeToManifest()       │
└─────────────┬────────────┘
              │ loads / saves persisted state
              ▼
┌──────────────────────────┐
│ Change.invalidate()      │  [HIGH: 9 direct dependents]
│ updateSpecIds()          │
└───────┬─────────┬────────┘
        │         │
        │         └──────────────────────┐
        ▼                                ▼
┌───────────────┐                  ┌───────────────┐
│ ChangeArtifact│                  │ GetStatus     │
│ aggregate     │                  │ review summary│
└──────┬────────┘                  └──────┬────────┘
       │ file-level truth                 │ agent / CLI projection
       ▼                                  ▼
┌───────────────┐                  ┌──────────────────────┐
│ ArtifactFile  │                  │ change status        │
│ state + hash  │                  │ change artifacts     │
└───────────────┘                  └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│ ValidateArtifacts    │─────▶│ Change.invalidate()  │
└──────────────────────┘      └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│ TransitionChange     │─────▶│ Change.invalidate()  │
│ verifying/designing  │      │ (review-required)    │
└──────────────────────┘      └──────────────────────┘
```

## Migration / Rollback

- Deployment is code-only; there is no external service migration.
- On read, missing `state` in manifest artifact/file entries defaults to `missing`.
- On the next save, manifests are rewritten in the new shape with explicit `state`.
- Rollback is safe as long as the branch rollback also restores the previous manifest reader. There is no forward-compatibility guarantee from old code to the new manifest shape, so rollback should be code + manifest reader together rather than code alone.

## Testing

**Automated tests**

- `packages/core/test/domain/entities/change.spec.ts`
  Add scenarios for:
  - artifact invalidation marks specific files `drifted-pending-review`
  - returning to `designing` marks all other files `pending-review`
  - `drifted-pending-review` is preserved when broader downgrades happen
  - artifact aggregate precedence (`drifted-pending-review`, `pending-review`, mixed states)

- `packages/core/test/domain/entities/change-artifact.spec.ts`
  Add unit coverage for aggregate `state` recomputation from file states and `requires` satisfaction semantics.

- `packages/core/test/domain/value-objects/artifact-file.spec.ts`
  Add state-transition tests for `markComplete()`, `markSkipped()`, `markPendingReview()`, and `markDriftedPendingReview()`, including `validatedHash` preservation.

- `packages/core/test/application/use-cases/get-status.spec.ts`
  Add coverage for:
  - `review.required` true/false derivation
  - `reason` selection (`artifact-drift` vs `artifact-review-required`)
  - per-artifact and per-file state projection

- `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
  Add coverage for:
  - collecting all drifted file keys before invalidation
  - keeping validated files `complete` after a successful validation run
  - structured `invalidated` event payload generation

- `packages/core/test/application/use-cases/transition-change.spec.ts`
  Add coverage for:
  - `verifying → implementing` leaving artifact states unchanged
  - `verifying/designing → designing` downgrading to `pending-review`
  - scope edits while already `designing` marking prior files `pending-review`

- `packages/core/test/infrastructure/fs/change-repository.spec.ts`
  Add coverage for:
  - manifest round-trip with `state`
  - missing-state fallback to `missing`
  - eager drift detection marking all affected file keys and persisting structured invalidation

- `packages/cli/test/commands/change.spec.ts`
  Add assertions for:
  - text output shows artifact aggregate state plus per-file state
  - JSON/TOON output include `review`
  - `review` block is omitted or `required: false` when no review is required

- `packages/cli/test/commands/change-artifacts.spec.ts`
  Add assertions for:
  - per-file rows include file `state`
  - artifact aggregate state is present
  - `drifted-pending-review` and `pending-review` are rendered distinctly

**Manual / E2E verification**

- Run:

  ```bash
  node packages/cli/dist/index.js change status drifted-artifact-status --format text
  node packages/cli/dist/index.js change status drifted-artifact-status --format json
  node packages/cli/dist/index.js change artifacts drifted-artifact-status --format text
  node packages/cli/dist/index.js change artifacts drifted-artifact-status --format json
  ```

  Expected: artifact rows show aggregate state and per-file state; structured output includes `review`.

- Exercise verification rollback manually:
  1. validate all design artifacts
  2. transition to `verifying`
  3. simulate an implementation-only failure and transition back to `implementing`
  4. confirm artifacts remain `complete`
  5. edit a validated artifact file directly
  6. reload status and confirm the file becomes `drifted-pending-review`, the change returns to `designing`, and the rest of the affected files become `pending-review`

- Run targeted tests:

  ```bash
  pnpm --filter @specd/core test -- change
  pnpm --filter @specd/core test -- get-status
  pnpm --filter @specd/core test -- validate-artifacts
  pnpm --filter @specd/cli test -- change
  pnpm --filter @specd/cli test -- change-artifacts
  ```

- Update and spot-check docs in `docs/cli/` so the documented JSON/text examples match the new output.
