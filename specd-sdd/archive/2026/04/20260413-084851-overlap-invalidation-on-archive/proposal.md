# Proposal: overlap-invalidation-on-archive

## Motivation

When archiving a change with `--allow-overlap`, the archive succeeds but other active changes sharing the same specs receive no notification. Their spec content has been silently modified by the delta merge, yet they continue working against stale assumptions. This produces conflicting deltas and broken workflows downstream.

## Current behaviour

`ArchiveChange` detects spec overlap before archiving. If overlap exists and `allowOverlap` is `false`, it throws `SpecOverlapError` and blocks. If `allowOverlap` is `true`, it skips the overlap check entirely and proceeds — but the overlapping changes are left untouched. They remain in their current state with no indication that their spec baseline has changed.

The `InvalidatedEvent.cause` union supports three causes: `spec-change`, `artifact-drift`, and `artifact-review-required`. None of these capture "another change was archived with overlapping specs."

`GetStatus` derives `ReviewSummary.reason` from file states only, producing `'artifact-drift'` or `'artifact-review-required'`. There is no mechanism to surface overlap-related invalidation to agents or skills reading `change status`.

## Proposed solution

When `allowOverlap=true`, instead of skipping the overlap check, `ArchiveChange` will:

1. Run `detectSpecOverlap` to identify which other active changes overlap with the change being archived
2. Invalidate each overlapping change back to `designing` with a new cause `'spec-overlap-conflict'`
3. Record an invalidation message identifying the archived change name and overlapping spec IDs
4. Return the list of invalidated changes in its result so the CLI can report them

`ReviewSummary.reason` in `GetStatus` will be extended to include `'spec-overlap-conflict'`, derived from the latest `InvalidatedEvent.cause` in the change's history. The `change status` CLI output will display this new reason, giving agents and skills a clear signal that a change was invalidated due to an overlap conflict.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/change`: add `'spec-overlap-conflict'` as a fourth cause to `InvalidatedEvent.cause`; update `Change.invalidate()` to accept and handle it
  - Depends on (added): none

- `core:core/archive-change`: change the overlap guard behaviour — when `allowOverlap=true`, detect overlapping changes and invalidate them instead of skipping the check; extend the result shape with `invalidatedChanges`
  - Depends on (added): `core:core/spec-overlap`

- `core:core/get-status`: extend `ReviewSummary.reason` type to include `'spec-overlap-conflict'`; derive it from the latest `InvalidatedEvent.cause` when it matches
  - Depends on (added): none

- `core:core/spec-overlap`: no spec changes needed — the existing `detectSpecOverlap` domain service and `OverlapReport` are reused as-is
  - Depends on (added): none

- `cli:cli/change-archive`: extend output to report invalidated changes when archiving with `--allow-overlap`
  - Depends on (added): none

- `cli:cli/change-status`: extend the review reason display to include `'spec-overlap-conflict'`
  - Depends on (added): none

## Impact

- **Domain**: `InvalidatedEvent` cause union expands; `Change.invalidate()` accepts a new cause
- **Application**: `ArchiveChange` gains overlap-invalidation logic; `GetStatus` reason derivation changes
- **CLI**: `change archive` output format gains a new field; `change status` review section shows a new reason value
- **Agents/skills**: Any skill reading `change status` JSON will see a new `reason` value (`'spec-overlap-conflict'`) when a change was invalidated by overlap — no breaking change, additive only

## Technical context

- The `detectSpecOverlap` domain service already returns an `OverlapReport` with `OverlapEntry` objects containing `specId` and `changes[]`. `ArchiveChange` will consume this directly.
- `Change.invalidate()` already handles rollback to `designing` and appending the `InvalidatedEvent`. The new cause follows the same path.
- `ArchiveChange` already calls `ChangeRepository.list()` for the overlap guard — the same call provides the data for invalidation.
- Each invalidated change requires its own `ChangeRepository.mutate()` call (serialized mutation). The use case will loop over overlapping changes individually.
- The `ReviewSummary.reason` type in `GetStatus` is currently `'artifact-drift' | 'artifact-review-required' | null`. Adding `'spec-overlap-conflict'` is a union extension — no existing values change.
- Rejected alternatives: auto-discard (too destructive), warn-only (leads to conflicting deltas), separate `--invalidate-overlap` flag (redundant with `--allow-overlap`).

## Open questions

_none_
