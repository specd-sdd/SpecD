# Proposal: cli-change-next-flag

## Motivation

Currently, transitioning a change between lifecycle states requires the user to know the exact target state and type it explicitly. This adds friction in the common case where the user only wants to advance the change to its next workflow step and does not care about the exact state name.

## Current behaviour

```
specd change transition <name> <step>
```

The user must specify `<step>` explicitly (for example `designing`, `implementing`, or `verifying`). There is no shorthand for "advance this change to the next step from its current state", even though the CLI can already read the current state and the lifecycle model already defines which transitions are valid.

## Proposed solution

Add a `--next` flag that lets the CLI resolve the next user-facing lifecycle action from the change's current state:

```
specd change transition <name> --next
```

The command will:

1. Load the current change state
2. Resolve the next transition target for normal workflow states
3. Execute the existing transition flow unchanged once the target is known

The feature should reduce repetitive lifecycle navigation without changing the underlying transition rules, approval gates, or hook execution semantics already defined in core.
When `--next` resolves to a state that is not reachable through a normal lifecycle transition, the command should rely on the existing transition validation path and surface a clearer invalid-transition error instead of introducing a separate execution path.

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/change-transition`: Extend the command signature and behaviour to support `--next`, define how the target state is derived, and clarify how transition failures are surfaced to users when the logical next step cannot be reached through `change transition`.
- `core:core/transition-change`: Clarify the failure semantics for invalid transitions so callers receive more specific reasons when a transition is blocked by approval/signoff states or by archive-only workflow boundaries.

## Impact

- **CLI package**: Modify `packages/cli/src/commands/change/transition.ts` to accept `--next` and resolve the current state before delegating to the existing transition use case
- **Core package**: Improve invalid transition errors so the CLI can explain why a lifecycle step cannot be advanced through `change transition`
- **Tests**: Add or update command tests for `--next`, including success cases and state-specific failure guidance
- **User workflow**: Reduces the need to remember lifecycle state names for the common "move forward" action

## Open questions

- What should `--next` do in states whose next user action is not another `change transition` call?
  Suggested resolution:
  - `--next` should keep using the normal transition path rather than introducing bespoke handling for approval or archive states
  - If the resolved logical next step is not reachable through `change transition`, the command should fail normally
  - The actual improvement should be better `InvalidStateTransitionError` messages that explain why the transition is blocked
