# Proposal: drifted-artifact-status

## Motivation

Artifact drift is currently hard to understand in specd because a previously validated artifact that changes is surfaced as `in-progress`, the same status used for normal unfinished work. The lifecycle also blurs implementation failures with artifact drift, especially when `verifying → implementing` clears validations even if the artifacts themselves did not change.

The current status surfaces also expose review context in terms of internal file keys, which is awkward for agents and operators because it does not directly tell them which file to inspect. In practice, the next action is driven by the affected artifact file and its location on disk, not by the manifest key used internally by the fs repository.

## Current behaviour

Today, an artifact file whose current cleaned hash no longer matches its stored `validatedHash` is reported as `in-progress` rather than as a distinct drift state. When drift invalidates a change, the system can detect which artifact type changed, but the user-facing status surfaces do not clearly show which artifact drifted, and for `scope: spec` artifacts they do not clearly show which spec key drifted.

The current manifest model also persists only `validatedHash` (or the skip sentinel) and derives status at load time from hash and file presence. That is sufficient for today's coarse states, but it is not sufficient for first-class states such as `drifted-pending-review` and `pending-review`, because those states express workflow meaning that cannot be reconstructed reliably from hash comparison alone.

As a result, the source of truth for artifact state needs to move: current and future artifact states should come from an explicit persisted status field, and the statuses that are currently derived from `validatedHash` and file presence should now be materialized into that persisted model.

`validatedHash` still matters, but as an input to state transitions rather than as the status model itself. When the current cleaned hash no longer matches `validatedHash`, core should update the persisted artifact state field to the corresponding non-valid state instead of merely deriving that condition transiently during the read.

The lifecycle also resets artifact validations when a change moves from `verifying` back to `implementing`. This forces users to re-run validation even when the design artifacts are still correct and the problem is only in the code implementation. As a result, specd currently conflates three different situations:

- the implementation failed but the approved design artifacts are still correct
- an artifact actually drifted and the change definition must be revised
- the artifacts have not drifted yet, but verification concluded that they should be reviewed because the desired behavior has changed

There is also a repository-level compatibility issue: older archived and discarded manifests still store `invalidated.cause = "artifact-change"`. The new stricter event model breaks global readers such as dashboard/listing commands if that legacy value is rejected as corrupt instead of being accepted and normalized to the new drift semantics.

## Proposed solution

Introduce an explicit notion of artifact drift so that specd can distinguish "previously validated, later changed" from ordinary `in-progress` work. Status and artifact-listing surfaces should expose the drift clearly, including the affected artifact and, for `scope: spec` artifacts, the affected spec key.

At the same time, clarify the lifecycle semantics around verification failures. The change should distinguish implementation-only failures from actual artifact drift and from "artifact review required" decisions:

- if any artifact file becomes `drifted-pending-review` at any point in the lifecycle, core should use the same invalidation mechanism it already uses today to invalidate the change and return it to `designing`
- `verifying → implementing` should remain a valid transition when verification shows that the implementation is wrong but the artifacts remain unchanged and correct
- that `verifying → implementing` path should not invalidate the change and should not reset unchanged validated artifacts
- if a change returns to `designing`, all artifacts should move to a first-class `pending-review` state; neither `drifted-pending-review` nor `in-progress` is appropriate for that case, because even a small change in direction can affect the full artifact set
- artifacts already marked `drifted-pending-review` must stay in that state when the change returns to `designing`; they must not be overwritten to plain `pending-review`
- drift detection must inspect all files for the affected artifact set before invalidating the change, so that every drifted file key is captured instead of stopping at the first mismatch
- `pending-review` and `drifted-pending-review` are first-class states at both file level and artifact level
- when a change returns to `designing`, every file of every artifact moves to `pending-review`, except files already marked `drifted-pending-review`, which keep that more specific state
- the same `pending-review` downgrade also applies when a scope change keeps the lifecycle in `designing` but invalidates previously validated artifacts; e.g. adding specs while already in `designing` should mark previously validated affected files as `pending-review`
- artifact-level state is an aggregation of file-level state: if any file is `drifted-pending-review`, the artifact is `drifted-pending-review`; otherwise, if all files are `pending-review`, the artifact is `pending-review`
- `requires` should remain the declarative artifact DAG, but its satisfaction should now be evaluated from the persisted artifact `state` rather than from `validatedHash`-derived status
- only artifacts in `complete` or `skipped` satisfy `requires`; artifacts in `missing`, `in-progress`, `pending-review`, or `drifted-pending-review` block dependents
- legacy manifests that still contain `invalidated.cause = "artifact-change"` must remain loadable; core should accept that historical value and normalize it to the new artifact-drift semantics instead of rejecting the manifest as corrupt
- agent-facing review summaries should prioritize the affected filename and absolute path; internal file keys may still be carried as supplemental data where useful, but they should not be the primary outward-facing identifier
- the persisted shape should be explicit and uniform:

  ```json
  {
    "type": "specs",
    "optional": false,
    "requires": ["proposal"],
    "state": "drifted-pending-review",
    "files": [
      {
        "key": "core:core/change",
        "filename": "specs/core/core/change/spec.md",
        "state": "complete",
        "validatedHash": "sha256:..."
      },
      {
        "key": "core:core/get-status",
        "filename": "specs/core/core/get-status/spec.md",
        "state": "drifted-pending-review",
        "validatedHash": "sha256:..."
      }
    ]
  }
  ```

- allowed `state` values for both artifact and file are:
  - `missing`
  - `in-progress`
  - `complete`
  - `skipped`
  - `pending-review`
  - `drifted-pending-review`
- `files[].state` is the source of truth at file level
- `artifact.state` is the materialized aggregate of `files[].state` and is persisted too

The proposal does not pre-decide the exact mechanism. The design phase must evaluate whether this is best solved by:

- adding the new `drifted-pending-review` artifact status
- preserving validated artifacts across `verifying → implementing` when no artifact drift occurred
- introducing the first-class `pending-review` state for artifacts that must be revisited whenever a change goes back to `designing`
- clarifying how verification chooses between the `implementing` path and the `designing` path
- persisting enough artifact state in the manifest to distinguish validated, drifted, and pending-review states across process restarts
- moving current artifact status semantics to the persisted state model instead of continuing to derive them implicitly at read time
- recording state transitions at file granularity and aggregating them upward to artifact status

## Specs affected

### New specs

None.

### Modified specs

- `core:core/change`: refine artifact status semantics so `drifted-pending-review` artifacts are distinguishable from ordinary in-progress artifacts, require drift to invalidate the change back to `designing` regardless of the current lifecycle state, preserve `drifted-pending-review` when returning to `designing`, move all other files to `pending-review`, and aggregate file states into artifact states.
  - Depends on (added): none
- `core:core/change-manifest`: clarify how artifact-drift invalidation is represented in persisted history so that the recorded reason is explicit and understandable, and update manifest persistence so first-class file and artifact states survive reloads.
  - Depends on (added): none
- `core:core/change-repository-port`: update eager drift detection requirements so drift reporting is explicit, spec-scoped artifact drift can be surfaced precisely, and all drifted file keys are collected before invalidation is persisted.
  - Depends on (added): none
- `core:core/kernel`: align the kernel-level eager-load contract with the new invalidation cause and structured affected-file payload, so the public composition contract matches the repository behavior used by global readers.
  - Depends on (added): none
- `core:core/get-status`: extend status reporting so callers can see explicit drift information instead of only `in-progress`, including artifact-level aggregation plus per-file state details for files in `drifted-pending-review`, `pending-review`, or any other persisted state.
  - Depends on (added): none
- `core:core/validate-artifacts`: clarify how approval invalidation, drift detection, and selective invalidation behave when artifacts change after validation or approval, including collecting all drifted files before state transition.
  - Depends on (added): none
- `core:core/transition-change`: keep `verifying → implementing` as a valid path for implementation-only failures, but stop treating that transition as implicit artifact invalidation when the artifacts themselves did not change.
  - Depends on (added): none
- `core:core/workflow-model`: define how verification outcomes distinguish implementation rework from artifact review, and how the `pending-review` artifact state interacts with the return to `designing`.
  - Depends on (added): none
- `cli:cli/change-status`: expose explicit artifact-level and file-level state information in status output so users can see the aggregate state of each artifact and the individual state of each file inside it.
  - Depends on (added): none
- `cli:cli/change-artifacts`: expose explicit per-file or per-spec drift information in artifact listings, including the absolute change/file paths needed to locate each listed artifact entry directly from CLI output.
  - Depends on (added): none

## Impact

The main affected areas are `@specd/core` domain and lifecycle behavior plus the CLI status/reporting layer. Likely code touch points include `packages/core/src/domain/entities/change.ts`, `packages/core/src/application/use-cases/validate-artifacts.ts`, repository drift detection in the filesystem change repository, lifecycle transition logic for `verifying → implementing`, and the CLI commands that serialize change and artifact status. Both `change status` and `change artifacts` now need to present file-level state, not just artifact-level aggregation.

For `scope: spec`, this is now explicit: each persisted `files[]` entry remains keyed by `specId`, each file entry carries its own `state`, and the parent artifact stores only the materialized aggregate of those file states.

`change status` should also expose a review summary derived from file states. In structured output (`json`/`toon`), this should be a stable `review` block with at least:

- `required`
- `route`
- `reason`
- `affectedArtifacts`

In text output, the same information should appear as a concise human-readable review section whenever `review.required = true`.

`GetStatus` should also project the persisted `validatedHash` for each file entry so downstream CLI serializers and tests can distinguish "current file state" from "last validated content". `change artifacts` should now expose both the change directory and the absolute path of each listed file row in structured output, with the text renderer showing the absolute file path directly.

The agent workflow layer is also affected. If specd distinguishes "implementation failed but artifacts are still valid" from "artifacts must be reviewed/redesigned" and from actual drift, the `/specd-verify` skill and any related verification guidance must route the user back to `implementing` or `designing` accordingly, following the lifecycle semantics defined in core rather than inventing their own rule. If an agent modifies artifacts directly during verification, core drift detection should remain the safety net and automatically invalidate the change back to `designing`.

More generally, skills that encounter artifacts in `drifted-pending-review` or `pending-review` should route the work back through `designing`, primarily by sending the workflow to `/specd-design`, and treat those artifacts as needing fresh review against two things:

- the current conversation and latest user intent
- the current persisted state of the change

They should not assume that previously written artifact content is still valid just because it exists on disk.

For `/specd-verify`, the decision should be explicit rather than inferred indirectly:

- `implementation-failure` means the code does not satisfy the current artifacts, but the artifacts still correctly describe the intended behavior and the required fix fits within the already-defined task set; this routes back to `implementing`
- `artifact-review-required` means verification concluded that the artifacts themselves should be revised; this routes back to `designing` and hands control to `/specd-design`

If returning to implementation would require new tasks that were not already defined, that is treated as an artifact-review case rather than a pure implementation failure. In that case the change returns to `designing` so that `design.md` and `tasks.md` can be revised before implementation resumes.

The change also has testing impact because status derivation, invalidation behavior, and lifecycle transitions are widely covered by unit and CLI tests. There are no external API integrations involved, but the blast radius inside core is high because `Change.invalidate()` and status reporting are central flows.

## Technical context

Exploration found that the system already has partial drift awareness internally. `Change.invalidate()` already accepts `driftedArtifactIds`, and repository-driven eager invalidation already detects artifact drift and can invalidate selectively. The ambiguity is therefore not that drift is impossible to detect, but that the visible model does not express it clearly enough.

The user also raised a closely related workflow issue: when verification fails, it is not obvious whether the failure means "the implementation is wrong", "the artifacts should be reviewed because the desired behavior changed", or "an artifact actually drifted on disk". If the artifacts remain correct, forcing artifact revalidation is mostly mechanical and does not add much value. If the artifacts must change, the change should return to `designing`, and when that happens all artifacts should become `pending-review`. The rationale is conservative: even a seemingly small change in intent can ripple through proposal, specs, verify, design, and tasks. If an artifact changes directly, core should detect that drift automatically and invalidate the change without relying on the skill layer.

The same reasoning applies to scope edits while already in `designing`: adding or removing specs may leave the lifecycle state unchanged, but it still invalidates prior review of affected artifacts because the artifact set and its obligations have changed.

This makes the change broader than a serializer tweak. The design must define the contract between artifact status, invalidation, and lifecycle routing so that specd does not treat implementation failures as artifact drift, does not hide genuine artifact drift under ordinary `in-progress`, preserves valid artifacts when only implementation work is needed, and always routes real drift back to `designing`.

The intended direction is evolutionary rather than a brand-new flow: reuse the current change invalidation mechanism, but when the cause is artifact drift, mark the affected files and their parent artifacts as `drifted-pending-review` instead of surfacing them under the current generic state. In other words, the change-level lifecycle consequence stays aligned with today's invalidation behavior, while the file-level and artifact-level states become more precise.

Because `drifted-pending-review` and `pending-review` are intended as first-class states, the persistence model must evolve as well. It should no longer rely exclusively on deriving status from `validatedHash` and file presence. The manifest needs to persist enough per-file and per-artifact state so that a reloaded change can still distinguish "validated", "`drifted-pending-review`", and `pending-review` without guessing from side effects.

This also implies a broader normalization: the current artifact states should be read from the new persisted state field too, rather than keeping two parallel models where some states are persisted and others are still inferred ad hoc. The steady-state model should read artifact status from the stored field.

The same normalization should apply to dependency gating. `requires` should keep expressing the artifact dependency graph, but the system should determine whether a dependency is satisfied by reading the persisted `state` of the dependency artifact rather than by consulting `validatedHash` or reconstructing an implicit status at read time.

In that steady-state model, hash validation remains one of the mechanisms that mutates the stored state. A previously validated artifact file whose hash no longer matches should not just "appear" drifted at read time; the system should persist the state transition so subsequent reads see the same result without re-deriving it from scratch. The detection pass must finish collecting all drifted files before persisting the invalidation, otherwise the first mismatch would hide later drifted file keys.

Compatibility with older history must be handled during load. The project should not require a one-off migration before commands such as dashboard, list, or archive can read existing manifests. Historical `artifact-change` invalidation events should therefore deserialize as the new artifact-drift cause while preserving the rest of the event payload.

The history/audit trail must also become more explicit. When a change is invalidated because artifacts drifted, the recorded history reason should be a clear message that explains what happened, not an opaque one-word label. Users reviewing the manifest or change history should be able to understand that the change was invalidated due to artifact drift and see the full set of changed files together with the artifact each file belongs to.

The intended shape is structured rather than free-form, for example:

```json
{
  "type": "invalidated",
  "at": "...",
  "by": { "name": "...", "email": "..." },
  "cause": "artifact-drift",
  "message": "Invalidated because validated artifacts drifted",
  "affectedArtifacts": [
    {
      "type": "specs",
      "files": ["core:core/change", "core:core/get-status"]
    },
    {
      "type": "verify",
      "files": ["cli:cli/change-status"]
    }
  ]
}
```

This gives core and CLI a stable machine-readable structure (`cause`, `affectedArtifacts`) while still preserving a human-readable explanation in `message`.

That machine-readable structure must still be projected into an agent-friendly form. `change status` and related agent-facing surfaces should summarize outstanding review work using file names and absolute paths first, because that is what lets a skill jump directly to the affected artifact content. Internal keys remain an implementation detail of persistence and should not be the main identifier in the review summary.

It also means the verification workflow cannot remain purely binary. A failed verification may now imply one of two different outcomes:

- return to `implementing` because only code changed and the artifacts remain valid
- return to `designing` because artifacts must be reviewed or because an artifact actually drifted

Whenever the change returns to `designing`, the file-level consequence should be uniform: all files move to `pending-review`, except files already marked `drifted-pending-review`, which keep their more specific state. Artifact-level state is then recomputed from those file-level states.

That distinction must be visible enough for the verification skill layer to act on it deterministically.

The same derived information should be visible to agents without exposing persistence details directly. `review.required` is `true` whenever at least one file is in `pending-review` or `drifted-pending-review`; this feeds `change status` and `change context`, which are the intended agent-facing surfaces.

As a robustness fallback, if an older manifest ever appears without the new `state` field, the system should default that missing state to `missing`. This is not an expected steady-state case for the project, but it prevents ambiguous behavior if such a manifest is encountered.

## Open questions
