# Proposal: fix-archive-new-spec-sync

## Motivation

`ArchiveChange.execute()` fails to copy new spec files to the project `specs/` directory when the artifact type has `delta: true`. The delta merge branch assumes a `.delta.yaml` file always exists, but for newly created specs the change directory contains a full `spec.md` (or `verify.md`) instead. When the delta file is not found, the code does `continue` and silently skips the spec — leaving the project without the new spec files after archiving.

This was discovered when archiving `extract-schema-repository`: the deltas for `schema-registry-port` merged correctly, but the new `schema-repository-port` spec files were never copied to `specs/`. They had to be copied manually.

## Current behaviour

In `ArchiveChange.execute()`, the delta merge loop (lines 186-225) has two branches:

1. `if (artifactType.delta)` — looks for a `.delta.yaml` file. If not found (`null`), does `continue`.
2. `else` — copies the primary file from the change dir to the spec dir.

For a new spec with a `delta: true` artifact type, branch 1 is entered, the delta file is not found, and the spec is skipped. Branch 2 (which would copy the file) is never reached because it's the `else` of the delta check, not a fallback.

## Proposed solution

Add a fallback in the `if (artifactType.delta)` branch: when no `.delta.yaml` is found, check for the primary file at the `specs/` path in the change directory and copy it directly — the same logic as the `else` branch for non-delta artifacts.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/archive-change`: Add requirement that new specs with `delta: true` artifact types are copied to the project spec directory during archiving.

## Impact

- `ArchiveChange` use case (`packages/core/src/application/use-cases/archive-change.ts`) — delta merge loop
- Tests in `packages/core/test/application/use-cases/archive-change.spec.ts`
- No API or external dependency changes

## Open questions

_(none)_
