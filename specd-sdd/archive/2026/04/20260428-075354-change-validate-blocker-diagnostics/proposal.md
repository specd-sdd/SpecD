# Proposal: change-validate-blocker-diagnostics

## Motivation

`change validate` currently reports dependency blockers with generic wording that hides the blocker's real state. This slows diagnosis when a downstream artifact is blocked by review-state propagation in the artifact DAG.

## Current behaviour

When an artifact dependency is not `complete` or `skipped`, validation fails with a message like `blocked by incomplete dependency`, without exposing whether the dependency is `missing`, `in-progress`, or `pending-parent-artifact-review`, and without recursive parent blocker detail.

## Proposed solution

Align dependency-block diagnostics in `change validate` with the transition diagnostics model so validation failures report the dependency's effective status and, for review-propagation cases, include upstream parent blocker context.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/validate-artifacts`: Update dependency-block failure requirement to include effective blocker status and parent blocker context for recursive review blockers.
  - Depends on (added): none
- `cli:cli/change-validate`: Clarify that dependency-block failures are rendered with the richer status-aware message emitted by core validation.
  - Depends on (added): none

## Impact

- Core use case diagnostics in `packages/core/src/application/use-cases/validate-artifacts.ts`.
- Possible reuse/alignment of wording patterns from transition diagnostics in `packages/core/src/domain/errors/invalid-state-transition-error.ts`.
- CLI surface in `packages/cli/src/commands/change/validate.ts` and corresponding tests.

## Technical context

The requested behavior is explicitly to make validation diagnostics similar to `change transition`. Investigation confirmed transition diagnostics were improved recently, while validation kept generic dependency wording. The change should keep ownership of diagnostic semantics in core and let CLI render the structured message/result as returned.

## Open questions

_none_
