# Proposal: prevent-draft-discard-after-implementation

## Motivation

Changes can currently be drafted or discarded even after implementation has already started. That is unsafe because code may already have diverged while the permanent specs remain in the repository, leaving specd in a state where the workflow says the change was shelved or abandoned but the codebase may already reflect part of it.

## Current behaviour

Today `specd change draft` and `specd change discard` are available broadly before archiving, with no guard based on whether implementation has already happened. The `Change` lifecycle history records transitions, including `implementing`, but draft and discard semantics do not use that history to protect against code/spec drift once implementation has begun.

## Proposed solution

Add a safety guard that blocks drafting or discarding a change once it has ever reached `implementing`, unless the caller explicitly forces the operation. As a temporary pragmatic heuristic, the system will infer "implementation may already exist" by inspecting change history for any past transition to `implementing`, and both the core use cases and CLI commands will expose this behavior consistently.

## Specs affected

### New specs

- none

### Modified specs

- `core:core/change`: tighten the drafting/discarding lifecycle semantics so history can be used to detect whether a change has ever reached `implementing`, and document that this heuristic is temporary until file-level change detection exists.
  - Depends on (added): none
- `core:core/draft-change`: add a force override to the input contract and require the use case to reject drafting by default after a change has ever reached `implementing`.
  - Depends on (added): none
- `core:core/discard-change`: add a force override to the input contract and require the use case to reject discarding by default after a change has ever reached `implementing`.
  - Depends on (added): none
- `cli:cli/change-draft`: extend the command contract with `--force` and document the new failure mode and rationale when implementation has already been reached historically.
  - Depends on (added): none
- `cli:cli/change-discard`: extend the command contract with `--force` and document the new failure mode and rationale when implementation has already been reached historically.
  - Depends on (added): none

## Impact

Affected code areas are the `Change` entity history/lifecycle logic, the `DraftChange` and `DiscardChange` application use cases, and the CLI adapters for `specd change draft` and `specd change discard`. This change also affects the user-facing error contract for those commands, because failures must now explain the risk of leaving permanent specs and already-modified code out of sync.

## Technical context

The user explicitly chose a pragmatic interim solution rather than waiting for true file-level tracking per change. The agreed signal is historical, not structural: if a change has ever been in `implementing`, specd must assume implementation may already exist and must reject draft/discard unless forced.

Relevant code paths already identified during exploration are:

- `packages/core/src/domain/entities/change.ts`
- `packages/core/src/application/use-cases/draft-change.ts`
- `packages/core/src/application/use-cases/discard-change.ts`
- `packages/cli/src/commands/change/draft.ts`
- `packages/cli/src/commands/change/discard.ts`

The `Change` entity already stores append-only history and derives lifecycle state from it, so the requested heuristic fits the existing model. A more accurate future solution based on detecting whether a change actually modified code files was discussed but explicitly deferred.

## Open questions

- none
