# Proposal: Add archiving as a ChangeState

## Motivation

`GetHookInstructions` and `RunStepHooks` validate the `step` input against `CHANGE_STATES`, but `archiving` is not a `ChangeState` — it only exists as a workflow step name in the schema. This causes `change archive`, `change hook-instruction <name> archiving`, and `change run-hooks <name> archiving` to fail with `StepNotValidError`.

The root cause is that the lifecycle model is incomplete: the real flow is `archivable → archiving → archived`, but `archiving` was never modeled as a state. It's a transitional state where pre/post hooks execute before the change becomes an `ArchivedChange`.

## Current behaviour

`ChangeState` has 11 values ending at `archivable`. The `archiving` step exists only in the schema's `workflow` array. Both hook use cases reject it because it's not in `CHANGE_STATES`. `ArchiveChange` passes `step: 'archiving'` to `RunStepHooks`, which throws.

## Proposed solution

1. Add `'archiving'` to `ChangeState` as a terminal-like state: `archivable → archiving`, with `archiving` having no further transitions (the change exits the state machine as an `ArchivedChange`).

2. Update `ArchiveChange` to transition the change to `archiving` before executing hooks and performing the archive.

3. Update `buildSchema` to validate that workflow step names are valid `ChangeState` values — reject unknown step names at schema load time.

4. The step validation in `GetHookInstructions` and `RunStepHooks` stays as-is (checking `CHANGE_STATES`) — it now works because `archiving` is a `ChangeState`. Update the "Step resolution" requirement text in both specs to remove the contradiction with "Works for any step".

## Specs affected

### New specs

None.

### Modified specs

- `core:core/get-hook-instructions`: Update "Requirement: Step resolution" to clarify that `archiving` is now a valid `ChangeState`.
- `core:core/run-step-hooks`: Same update. Remove contradiction with "Requirement: Works for any step".
- `core:core/archive-change`: Add requirement for transitioning to `archiving` before hook execution.

## Impact

- **Value object** (`change-state.ts`): add `'archiving'` to `ChangeState` and `VALID_TRANSITIONS`.
- **Domain service** (`build-schema.ts`): add validation that workflow step names are valid `ChangeState` values.
- **Use case** (`archive-change.ts`): transition to `archiving` before pre-hooks.
- **Use cases** (`get-hook-instructions.ts`, `run-step-hooks.ts`): no code change needed — `archiving` is now in `CHANGE_STATES`.
- **CLI**: no change needed.
- **No breaking changes for end users**: `archiving` was already used in schemas; now it's properly modeled.

## Open questions

None.
