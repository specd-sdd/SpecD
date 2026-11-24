# Tasks: fingerprint-issues-non-blocking

## 1. Core Domain Services

- [x] 1.1 Remove `FINGERPRINT_INPUT_ERROR` from `ValidityBlocker` code union
      `packages/core/src/domain/services/change-validity.ts`: `ValidityBlocker` — remove `'FINGERPRINT_INPUT_ERROR'` from code union
      Approach: Remove the `'FINGERPRINT_INPUT_ERROR'` variant from `ValidityBlocker['code']` so blockers only represent operational lifecycle gating conditions.
      (Req: Validity fingerprint scope)
- [x] 1.2 Add `fingerprintIssues` to `ChangeValidityVerdict`
      `packages/core/src/domain/services/change-validity.ts`: `ChangeValidityVerdict` — add `readonly fingerprintIssues: readonly FingerprintInputFailure[]`
      Approach: Declare `readonly fingerprintIssues: readonly FingerprintInputFailure[]` on the verdict interface so input failures are preserved without being blockers.
      (Req: Validity fingerprint scope)
- [x] 1.3 Remove `FINGERPRINT_INPUT_ERROR` push from `buildBlockers`
      `packages/core/src/domain/services/change-validity.ts`: `buildBlockers` — remove condition that pushes `FINGERPRINT_INPUT_ERROR`
      Approach: Delete the `if (facts.fingerprintFailures.length > 0)` block pushing `FINGERPRINT_INPUT_ERROR` to `blockers`.
      (Req: Validity fingerprint scope)
- [x] 1.4 Populate `fingerprintIssues` in `evaluateChangeValidity`
      `packages/core/src/domain/services/change-validity.ts`: `evaluateChangeValidity` — set `fingerprintIssues: facts.fingerprintFailures`
      Approach: Pass `fingerprintIssues: facts.fingerprintFailures` directly to the returned `ChangeValidityVerdict`.
      (Req: Validity fingerprint scope)

## 2. Core Application Use Cases

- [x] 2.1 Add `fingerprintIssues` to `ValidityStatusProjection`
      `packages/core/src/application/use-cases/get-status.ts`: `ValidityStatusProjection` — add `readonly fingerprintIssues?: readonly FingerprintInputFailure[]`
      Approach: Add optional `readonly fingerprintIssues?: readonly FingerprintInputFailure[]` property to `ValidityStatusProjection` for delivery consumers.
      (Req: Approval, verification, and fingerprint status projection)
- [x] 2.2 Propagate `fingerprintIssues` in `projectValidityStatus`
      `packages/core/src/application/use-cases/get-status.ts`: `projectValidityStatus` — copy `fingerprintIssues` from verdict
      Approach: When `verdict.fingerprintIssues` has items, copy them to `ValidityStatusProjection.fingerprintIssues`.
      (Req: Approval, verification, and fingerprint status projection)

## 3. CLI Delivery Presentation

- [x] 3.1 Define `PublicFingerprintIssue` and update `PublicValidity`
      `packages/cli/src/commands/change/_validity-present.ts`: `PublicFingerprintIssue` & `PublicValidity` — define type and add property
      Approach: Export `PublicFingerprintIssue` interface with `scope`, `key`, `reason`, and `message`, and add `fingerprintIssues?: readonly PublicFingerprintIssue[]` to `PublicValidity`.
      (Req: Reconciled validity and next-action output)
- [x] 3.2 Map `fingerprintIssues` in `publicValidity`
      `packages/cli/src/commands/change/_validity-present.ts`: `publicValidity` — map `record.fingerprintIssues`
      Approach: Parse and map array items into `PublicFingerprintIssue[]` when present on the input record.
      (Req: Reconciled validity and next-action output)
- [x] 3.3 Render `fingerprintIssues` in `validityTextLines`
      `packages/cli/src/commands/change/_validity-present.ts`: `validityTextLines` — format issues as diagnostic lines
      Approach: Iterate over `validity.fingerprintIssues` and append formatted diagnostic lines `issue:         fingerprint input ${issue.scope} '${issue.key}' ${issue.reason}: ${issue.message}`.
      (Req: Reconciled validity and next-action output)

## 4. Documentation

- [x] 4.1 Update ReconcileChangeValidity docs in `use-cases.md`
      `docs/core/use-cases.md`: `ReconcileChangeValidity` — update line ~495 description
      Approach: Clarify that fingerprint collection failures produce `validity.fingerprintIssues` diagnostics and a `null` fingerprint rather than verdict blockers.
      (Req: Validity fingerprint scope)

## 5. Automated Tests & Verification

- [x] 5.1 Add unit tests for `evaluateChangeValidity` fingerprint issues
      `packages/core/test/domain/services/change-validity.spec.ts`: describe block for fingerprint issues
      Approach: Assert that non-empty `facts.fingerprintFailures` populates `verdict.fingerprintIssues` and does not add `FINGERPRINT_INPUT_ERROR` to `verdict.blockers`.
      (Req: Validity fingerprint scope)
- [x] 5.2 Add unit tests for `GetStatus` validity projection
      `packages/core/test/application/use-cases/get-status.spec.ts`: describe block for fingerprint issues
      Approach: Assert that a change with unwritten artifacts projects `validity.fingerprintIssues` and does not include `FINGERPRINT_INPUT_ERROR` in `blockers`.
      (Req: Approval, verification, and fingerprint status projection)
- [x] 5.3 Add CLI presentation tests for `change status`
      `packages/cli/test/commands/change-status.spec.ts`: assert text and JSON/TOON format handling
      Approach: Assert that `changes status` shows diagnostic lines under `validity:` and zero `blockers:` for missing artifacts.
      (Req: Reconciled validity and next-action output)
- [x] 5.4 Run end-to-end status verification on active change
      `node packages/cli/dist/index.js changes status fingerprint-issues-non-blocking`
      Approach: Verify both `--format text` and `--format toon` output to confirm absence of blockers and correct presentation of diagnostics.
      (Req: Reconciled validity and next-action output)
