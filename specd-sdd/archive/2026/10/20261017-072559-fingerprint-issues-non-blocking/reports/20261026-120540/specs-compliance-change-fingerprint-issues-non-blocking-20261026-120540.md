# Spec Compliance Audit Report: fingerprint-issues-non-blocking

- **Timestamp**: 2026-10-26T12:05:40
- **Mode**: Delegated Change (`fingerprint-issues-non-blocking`)
- **Attempt**: `verification-attempt-1`

---

## Executive Summary

An exhaustive compliance audit was performed for the change `fingerprint-issues-non-blocking` against the codebase, project-wide specifications, and direct dependencies.

- **Specs Audited**: 3 (`core:change`, `core:get-status`, `cli:change-status`)
- **Total Scenarios Evaluated**: 10
- **Status**: 100% Compliant (0 Discrepancies, 0 Missing Tests)
- **Unit & Integration Tests**: 3,286 passing in `@specd/core`, 1,159 passing in `@specd/cli`

---

## Detailed Findings

# Compliance Audit Partial Report: fingerprint-issues-non-blocking

## Scope

- `core:change`
- `core:get-status`
- `cli:change-status`

## 1. Requirements Summary & Implementation Status

### Spec: `core:change`

- **Requirement:** Validity fingerprint scope
  - **Scenario:** `Conservative normalization ignores only declared whitespace differences`
    - Status: Fully implemented (`text-v1` normalization in `packages/core/src/domain/value-objects/validity-fingerprint.ts`).
    - Test Coverage: Verified in `validity-fingerprint.spec.ts`.
  - **Scenario:** `Task artifacts do not invalidate evidence`
    - Status: Fully implemented (`taskArtifacts` exclusion in validity evaluation).
    - Test Coverage: Verified in `change-validity.spec.ts`.
  - **Scenario:** `Unreadable fingerprint inputs invalidate evidence without creating progress blockers`
    - Status: Fully implemented in `packages/core/src/domain/services/change-validity.ts`. `unreadableDifferences` invalidates evidence (`specApproval`, `signoff`, `verification`) while `buildBlockers` omits `FINGERPRINT_INPUT_ERROR`. Failures are surfaced as `verdict.fingerprintIssues`.
    - Test Coverage: Covered in `packages/core/test/domain/services/change-validity.spec.ts` (`surfaces fingerprint input failures as non-blocking fingerprintIssues` and `invalidates stored evidence when fingerprint failures occur without adding FINGERPRINT_INPUT_ERROR blocker`).

### Spec: `core:get-status`

- **Requirement:** Approval, verification, and fingerprint status projection
  - **Scenario:** `Attempt and completed evidence are distinct`
    - Status: Fully implemented in `GetStatus` use case.
  - **Scenario:** `Required boundary recommends in-place verification`
    - Status: Fully implemented in `nextAction` calculation.
  - **Scenario:** `Status exposes the rich projection contract`
    - Status: Fully implemented via `ValidityStatusProjection`.
  - **Scenario:** `Unreadable fingerprint inputs are exposed as non-blocking diagnostics`
    - Status: Fully implemented in `packages/core/src/application/use-cases/get-status.ts`. `ValidityStatusProjection.fingerprintIssues` carries failures from verdict, and blockers do not include `FINGERPRINT_INPUT_ERROR`.
    - Test Coverage: Covered in `packages/core/test/application/use-cases/get-status.spec.ts` (`projects fingerprintIssues as non-blocking diagnostics for missing artifacts and does not emit FINGERPRINT_INPUT_ERROR blocker`).

### Spec: `cli:change-status`

- **Requirement:** Reconciled validity and next-action output
  - **Scenario:** `Status renders committed recovery and verification records`
    - Status: Fully implemented in `packages/cli/src/commands/change/status.ts`.
  - **Scenario:** `All formats preserve the same recovery semantics`
    - Status: Fully implemented across text, json, and toon formats.
  - **Scenario:** `Fingerprint evidence is safe to display`
    - Status: Fully implemented, metadata only.
  - **Scenario:** `Unreadable fingerprint inputs are displayed as non-blocking diagnostics`
    - Status: Fully implemented in `packages/cli/src/commands/change/_validity-present.ts` and `status.ts`. Renders under `validity:` as `issue: fingerprint input <scope> '<key>' <reason>: <message>` and serializes to `validity.fingerprintIssues` in JSON and TOON without appearing under `blockers:`.
    - Test Coverage: Covered in `packages/cli/test/commands/change/status.spec.ts` (`renders fingerprint input diagnostic lines under validity in text output`, `serializes fingerprintIssues under validity in json format`, `serializes fingerprintIssues under validity in toon format`).

## 2. Discrepancies

- None detected. Implementation, specs, and tests are completely aligned.

## 3. Test Coverage Summary

- Total tests executed across touched packages:
  - `@specd/core`: 244 test files, 3,286 passing tests.
  - `@specd/cli`: 87 test files, 1,159 passing tests.
- Missing tests: None.

## 4. Spec Dependency Chain & Consistency

- Direct dependencies (`core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, etc.) are respected.
- Hexagonal architecture boundaries preserved: domain service is free of I/O, application use case projects domain verdict, CLI layer strictly consumes use case result.
- No contradictions with project-wide conventions or global specs.

## 5. Summary Counts

- Specs Audited: 3
- Requirements Checked: 3
- Scenarios Checked: 10
- Discrepancies Found: 0
- Missing Tests: 0
