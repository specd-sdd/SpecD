# Proposal: fingerprint-issues-non-blocking

## Motivation

Running `specd changes status <name>` on a freshly created change (in `drafting` or `designing` state) emits a high-visibility blocker: `FINGERPRINT_INPUT_ERROR: Fingerprint inputs could not be read`. This occurs because unwritten artifacts are in `missing` status and treated by the fingerprint collector as unreadable inputs, which currently synthesizes an unconditional blocker. In early lifecycle states, neither spec approval nor verification exists, making this blocker misleading noise that prematurely signals invalidity.

## Current behaviour

`ValidityFingerprintService.completeFingerprint()` returns `null` and records a failure with `reason: 'missing'` when an artifact file does not exist on disk. While this null-on-missing behaviour is intentional to prevent capturing partial baselines, `buildBlockers()` in `packages/core/src/domain/services/change-validity.ts` unconditionally pushes `{ code: 'FINGERPRINT_INPUT_ERROR', message: 'Fingerprint inputs could not be read', details: { failures } }` whenever `facts.fingerprintFailures` is non-empty.

As a result:

- Any new change without complete artifact files is marked blocked by `FINGERPRINT_INPUT_ERROR`.
- `ValidityStatusProjection` in `GetStatus` has no dedicated diagnostic field for unreadable fingerprint inputs, relying solely on `blockers` to surface missing or unreadable inputs.
- The CLI status display classifies these unreadable inputs as blocking errors rather than informative diagnostics.

## Proposed solution

1. **Remove the Blocker**: Remove `FINGERPRINT_INPUT_ERROR` from `ValidityBlocker['code']` and delete the blocker emission from `buildBlockers()`.
2. **Preserve Invalidation & Consumer Guarding**:
   - Keep `completeFingerprint()`, `facts.fingerprintFailures`, and `unreadableDifferences()` so unreadable inputs continue to invalidate stored spec approval, sign-off, and verification evidence.
   - Keep `ApproveSpec`, `ApproveSignoff`, `StartVerification`, and `CompleteVerification` throwing `FingerprintInputError` when required fingerprints cannot be read.
3. **Expose Non-Blocking Diagnostic**:
   - Add `fingerprintIssues?: readonly FingerprintInputFailure[]` to `ValidityStatusProjection` (and `ChangeValidityVerdict`) so unreadable inputs remain observable without blocking transitions.
4. **CLI Presentation**:
   - Render `fingerprintIssues` as diagnostic warnings under `validity` in `specd changes status` (in text and structured formats) instead of listing them under `blockers:`.
5. **Documentation**:
   - Update `docs/core/use-cases.md` to reflect that unreadable fingerprint inputs are surfaced as diagnostics rather than verdict blockers.

## Specs affected

### New specs

None.

### Modified specs

- `core:change`: Clarify that unreadable fingerprint inputs invalidate stored evidence but do not produce a lifecycle progress blocker.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: Expose unreadable fingerprint inputs as a non-blocking diagnostic field `validity.fingerprintIssues` on `ValidityStatusProjection` instead of a verdict blocker.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: Render `validity.fingerprintIssues` as diagnostic warnings in text and structured status projections instead of progress blockers.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `packages/core/src/domain/services/change-validity.ts`: Remove `FINGERPRINT_INPUT_ERROR` from `ValidityBlocker` and `buildBlockers`; carry `fingerprintIssues` on `ChangeValidityVerdict`.
- `packages/core/src/application/use-cases/get-status.ts`: Expose `fingerprintIssues` on `ValidityStatusProjection` and project from verdict.
- `packages/cli/src/commands/change/_validity-present.ts` & `status.ts`: Render `fingerprintIssues` as warnings instead of blockers.
- `docs/core/use-cases.md`: Update validity section description.
- Unit and integration tests covering change validity, status projection, and CLI output.

## Technical context

- **Guiding principle**: The check or use case that requires a valid fingerprint should fail if inputs are missing; general status observation and early lifecycle progression should not synthesize a false blocker.
- **Alternatives evaluated and ruled out**:
  - _Option 1: Delete the blocker with no replacement._ Ruled out because `specs/core/get-status/spec.md` requires status to expose missing or unreadable inputs.
  - _Option 2: Gate blocker by lifecycle state (e.g., verifying onwards)._ Ruled out because consumers already enforce fingerprint presence; duplicating state gating in validity evaluation adds coupling and redundancy.
  - _Option 3: Treat missing artifacts as neutral (not failures)._ Ruled out because `ValidityFingerprintService` intentionally avoids partial baselines.

## Open questions

None.
