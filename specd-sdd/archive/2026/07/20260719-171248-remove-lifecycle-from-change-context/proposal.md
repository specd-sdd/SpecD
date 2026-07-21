# Proposal: remove-lifecycle-from-change-context

## Motivation

`change context` should be a stable working-context payload for agents. Lifecycle
availability changes as artifacts progress, but it does not change the information
an agent needs to understand the work; including it unnecessarily invalidates the
context fingerprint.

## Current behaviour

`CompileContext` evaluates lifecycle readiness and returns `stepAvailable`,
`blockingArtifacts`, and `availableSteps`. The CLI renders per-step availability
and emits an unavailable-step warning. Those lifecycle projections participate in
the context response and consequently cause the fingerprint to change when a
change transitions, even when project context and spec content are unchanged.

## Proposed solution

Remove lifecycle state, availability, and blocker projections from `change context`
and from `CompileContextResult`. `change status` remains the canonical command for
lifecycle state and readiness. The context fingerprint will then be calculated only
from the context payload and its genuine context diagnostics.

## Specs affected

### New specs

None.

### Modified specs

- `core:compile-context`: remove lifecycle evaluation and lifecycle fields from the
  compiled-context contract, including their fingerprint semantics.
  - Depends on (added): none.
  - Depends on (removed): `core:lifecycle-engine`.
- `cli:change-context`: remove lifecycle availability rendering and unavailable-step
  warnings while preserving context compilation, formatting, and context warnings.
  - Depends on (added): none.
  - Depends on (removed): none.

## Impact

- `packages/core/src/application/use-cases/compile-context.ts` and
  `packages/core/src/application/use-cases/_shared/compile-context-fingerprint.ts`.
- `packages/cli/src/commands/change/context.ts` and their unit tests.
- Structured `change context` consumers will no longer receive lifecycle fields;
  they must query `change status` when they need lifecycle information.

## Technical context

`CompileContext` and `compileContextFingerprint` are high-coupling Core code. The
change must remove the result-contract fields deliberately and update callers and
tests together. Keeping lifecycle data in the response but excluding it only from
the fingerprint was considered and rejected: an unchanged fingerprint would no
longer describe the complete response.

## Open questions

None. The positional step remains part of the command's context-selection contract;
the change only removes lifecycle readiness reporting from the response.
