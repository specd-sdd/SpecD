# Proposal: remove-archived-change-workspace

## Motivation

The `ArchivedChange` domain entity currently stores a `workspace: SpecPath` property that is redundant and inconsistent with how `Change` handles workspaces. `Change` derives its workspaces at runtime via a getter that parses `specIds`, while `ArchivedChange` stores it as a persisted field. This creates an inconsistency in the domain model and adds unnecessary data to the archive index.

## Current behaviour

When a change is archived, the `FsArchiveRepository._buildArchivedChange()` method extracts the workspace from the first specId in the manifest using `deriveFirstWorkspace()`, which parses `specIds[0].workspace`. This value is then stored as a static `workspace: SpecPath` property in the `ArchivedChange` entity and persisted to the archive index (`.specd-index.jsonl`).

The archive index entry contains:

```json
{"name": "change-name", "workspace": "core", "specIds": ["core:core/..."], ...}
```

This `workspace` field is redundant since it can be derived from `specIds[0]`.

## Proposed solution

Remove the `workspace` property from the `ArchivedChange` entity and derive it at runtime using a getter (similar to `Change.workspaces`). Also remove the `workspace` field from the archive index entries.

Affected code:

1. `packages/core/src/domain/entities/archived-change.ts` — remove `_workspace` field and add `workspaces` getter
2. `packages/core/src/infrastructure/fs/archive-repository.ts` — remove `deriveFirstWorkspace()` and the `workspace` field from `_buildArchivedChange()` and `_buildIndexEntry()`

## Specs affected

### Modified specs

- `core:core/archive-change`: Remove the requirement for `workspace` in the `ArchivedChange` record (line ~141 in spec.md). The spec should no longer require `workspace` as a field — it will be derived from `specIds` at runtime.
  - Depends on (added): none
  - This change also affects the archive index but that's not a separate spec — it's implementation detail

## Impact

- Domain entity change: `ArchivedChange` no longer stores workspace, computes it
- Archive index: removes redundant `workspace` field from each JSONL entry
- Minimal blast radius — only affects archive-related code

## Technical context

The inconsistency was discovered during code review:

- `Change` has `workspaces` as a computed getter (line 246 in change.ts)
- `ArchivedChange` incorrectly stores it as `_workspace: SpecPath`

The fix aligns `ArchivedChange` with the `Change` pattern.

## Open questions

None — the change is straightforward refactoring.
