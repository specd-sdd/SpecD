# Proposal: cross-artifact-ready-participants

## Motivation

Cross-artifact rules are intended to catch relational drift between artifacts such as `spec.md` and `verify.md`, but today they can be deferred repeatedly even after one participant has already been validated successfully. This weakens the validation chokepoint and lets requirement parity gaps survive normal artifact-by-artifact workflows.

## Current behaviour

`ValidateArtifacts` builds `readyParticipants` only from artifacts parsed during the current `execute()` invocation. When a user validates `spec.md` first and `verify.md` later, the second validation does not rehydrate the already-complete `spec.md` participant, so cross-artifact rules such as `specs-verify-requirement-parity` are deferred again instead of being evaluated.

The result is that cross-artifact validation effectively requires all participants to be ready in the same invocation, even when the counterpart artifact already exists, is complete, and should be reusable.

## Proposed solution

Change `ValidateArtifacts` so cross-artifact rules can reuse already-complete participants when validating a later artifact. If a required participant for a rule is already complete, `ValidateArtifacts` should reload the participant's expected artifact content, materialize the parsed/merged output needed by the evaluator, and include it in `readyParticipants` before deciding whether the rule must be deferred.

This keeps one-pass deferral for genuinely missing participants, but removes repeated deferral when the only missing piece is rehydration of a participant that has already completed validation.

## Specs affected

### New specs

- None.

### Modified specs

- `core:validate-artifacts`: define that cross-artifact readiness includes already-complete participants that can be rehydrated for evaluation, not only artifacts parsed in the current invocation.
  - Depends on (added): none

## Impact

Affected code is centered in `packages/core/src/application/use-cases/validate-artifacts.ts`, with likely supporting changes in the cross-artifact participant preparation path and its tests. The graph impact for `validate-artifacts.ts` is `CRITICAL`, so implementation must be careful about shared validation behavior and regression coverage even though the spec scope stays narrow.

## Technical context

The current gap is caused by three concrete behaviors in `ValidateArtifacts`:

- `artifactId` filtering skips non-requested artifacts entirely, so validating `verify` does not process `specs` in the same invocation.
- `readyParticipants` is populated only from artifacts that were parsed successfully during the current invocation.
- cross-artifact rules are evaluated only against that in-memory invocation-local participant map.

The intended fix direction already agreed with the user is:

- first-pass deferral is still acceptable when the counterpart artifact does not exist yet;
- when the counterpart artifact already exists and is `complete`, validating the second artifact should rehydrate that participant instead of deferring again;
- cross-validation should run against real parsed or merged outputs, not just persisted artifact status.

## Open questions

- None.
