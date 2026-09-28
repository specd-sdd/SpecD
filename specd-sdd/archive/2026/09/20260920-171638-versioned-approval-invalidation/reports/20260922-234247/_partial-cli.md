# Partial audit: CLI adapters

Change: `versioned-approval-invalidation`
Mode: delegated (no `changes verification start` or `complete`)
Scope: `cli:change-create`, `cli:change-edit`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-status`, `cli:change-verification`
Specs loaded with `node packages/cli/dist/index.js changes spec-preview versioned-approval-invalidation <specId> --artifact verify --format text`
Design contract: `specd-sdd/changes/20260920-171638-versioned-approval-invalidation/design.md` (CLI section, lines 842–851 and 978–1025) and tasks 10.1–10.12.

Graph: `graph stats` reported `state: stale`, `contentFresh: false`, `CONTENT_KNOWN_STALE` (last index `2026-09-22T21:43:34.445Z`). This audit did not reindex. Symbol search was used as a lead; every cited behaviour was confirmed in source.

Shared helpers:

- `packages/cli/src/commands/change/_invalidation-flags.ts` — `--artifact-policy` / `--workflow-policy` only. No `--invalidation-policy`. Unknown values call `cliError` (one `process.exit(1)`) before any use-case call. No Commander `.choices()`, so an invalid enum does not also fail inside Commander.
- `packages/cli/src/commands/change/_validity-present.ts` — text and structured fingerprint views keep algorithm names and file counts. `publicDifferences` drops digest fields. `summarizeFingerprint` does not copy file bytes.

## cli:change-create

Requirements: 10. Scenarios: 20.

Implementation status: conformant.

- `packages/cli/src/commands/change/create.ts` registers `--artifact-policy` and `--workflow-policy`. It does not register `--invalidation-policy`.
- `resolveCreateInvalidationPolicy` passes one complete `{ artifacts, workflow }` object on `kernel.changes.create.execute`. Loaded project config already exposes structured `invalidation` (`packages/core/src/application/specd-config.ts`). Legacy scalar adaptation stays in the config loader.
- One mutation call: `kernel.changes.create.execute`. Overlap is read from that result. The handler does not call `detectOverlap.execute`.
- `includeOverlapCheck: true` only when `specIds.length > 0`.
- `getActiveSchema` is not called. Read-only workspace checks happen before execute and exit 1 with no create. Success text is `created change <name>`. JSON includes `changePath`.

Discrepancies: none.

Test coverage: `packages/cli/test/commands/change-create.spec.ts` covers workspace resolution, read-only rejection, overlap delegation, schema non-call, JSON `changePath`, config overlay, artifact-only overlay, and unknown `--artifact-policy` exiting 1 before `create.execute`.

Missing tests:

- Unknown `--workflow-policy`.
- Both policy flags invalid in one invocation (implementation exits on the first `cliError`).

## cli:change-edit

Requirements: 7. Scenarios: 17.

Implementation status: partial.

Conformant:

- Flags are the two optional dimensions. Omitted dimensions are omitted from `invalidation` (`resolveInvalidationOverride`).
- No edit flags: `cliError` before core. Message names `--artifact-policy` and `--workflow-policy` and does not mention `--invalidation-policy`.
- Read-only add is rejected before `edit.execute`. Workspace derivation is not recomputed in the CLI; the handler prints `change.workspaces` from core.
- Text prints `state`. Projection differences are reduced to scope, key, and kind. JSON test asserts `sha256:` is absent (`change-edit.spec.ts`).
- Policy-only edits do not take the stderr warning, because that warning is gated on `invalidated`, and core sets `invalidated` from `scopeChanged` (`edit-change.ts` lines 28–29 and 279–283).

Discrepancies:

1. **Approval invalidation / “do not claim invalidation without a reported drift”, and the stderr warning on any scope edit.** `edit.ts` lines 122–137 warn `approvals invalidated` whenever `result.invalidated` is true. Core defines that flag as “whether spec scope changed”, and defines `validityChanged` as projection or automatic-return drift. A scope edit with no projection change still prints the approval warning. `validityChanged` and `affectedArtifacts` are never read. The older JSON scenario still requires `invalidated: true` for a scope edit, so the JSON field can stay; the warning text treats scope change as approval invalidation.
   - Spec may be using `invalidated` in the historical sense (scope edit from `spec-approved`).
   - Code may be wrong if the new scenario requires a drift signal before any invalidation claim. Evidence favours the code bug for the warning, because core already split `validityChanged` from `invalidated`.

2. **Ungated preserve “forward-progress blocker”.** Verify scenario: retained state and a forward-progress blocker, with no invented return. The handler prints `change.state` and, when present, `automatic return: (none)`. It has no blocker line. `EditChangeResult` has no `blockers` or `nextAction`. Showing a blocker would require either those fields on the one `edit.execute` result or a second use-case call.
   - Spec expects blocker text on this command.
   - Core result does not carry a blocker, and the CLI correctly avoids inventing one. Both are incomplete relative to the scenario.

`detectOverlap.execute` still runs after a successful scope edit. That is a second core execute. The versioned “delegate once” task (10.7) is written for verification, and the edit verify spec still expects overlap behaviour to remain outside policy handling. Not counted as a policy-flag defect.

Test coverage: `packages/cli/test/commands/change-edit.spec.ts` covers empty invocation, partial workflow overlay, hash stripping, automatic return, read-only rejection, and the historical `invalidated: true` warning.

Missing tests:

- Policy-only edit asserts no approval warning (true today only because `invalidated` is false).
- Scope edit with `invalidated: true`, `validityChanged: false`, and empty `projectionChanges` (would still warn).
- Preserve scope edit that must show a forward blocker without an invented return.
- Unknown `--workflow-policy`.

## cli:change-invalidate

Requirements: 10. Scenarios: 17.

Implementation status: partial.

Conformant:

- Independent `--artifact-policy` and `--workflow-policy` map to `policyOverride` with only supplied keys. No scalar flag.
- Missing `--reason` is `requiredOption` (Commander failure, no execute).
- One call: `kernel.changes.invalidate.execute`. Target strings are split on `@` and sent through; compatibility and “all invalid targets” stay in core (`InvalidInvalidateTargetError` message is printed by `handleError`).
- Effective policy is rendered from `result.effectivePolicy` via `describeEffectivePolicy`. A command-scoped override line says the stored policy was not changed.
- `none` text says no additional reopen, and that drift, blockers, and stale evidence are not cleared. Projection lines and `automaticReturn` still print when core returns them (`change-invalidate.spec.ts` override test).
- Recovery state and cause come from `result.change.state` and `automaticReturn`. The handler does not pick a target state.
- Hash-bearing difference fields are dropped by `publicProjectionChanges`.

Discrepancies:

1. **Reporting: preserve blockers, and recovery next action.** Verify scenarios require both policy dimensions, affected evidence, and the forward blocker; recovery output must name committed state, cause, and next action. `invalidate.ts` lines 120–204 print policy, affected files, projections, and automatic return. They do not print blockers or next action. `InvalidateChangeResult` (`invalidate-change.ts` lines 45–52) is `change`, `effectivePolicy`, `affected`, `projectionChanges`, `automaticReturn` only.
   - Spec/task 10.3 asks the CLI to render blockers and recovery guidance.
   - Core does not return blockers or `nextAction` on this result, so a thin one-execute adapter cannot show them without a follow-up `status.execute` or a result-contract change.

2. **Approval guard names gates, then reprints a designing-only core message.** `invalidate.ts` lines 206–216, on `InvalidateRequiresForceError`, write one line per `gates` entry: spec → `designing`, signoff → `done`. `handleError` then prints the error message from `invalidate-requires-force-error.ts` lines 20–22, which always says “return the change to designing”. A signoff-only refusal therefore shows both `done` and `designing`.
   - CLI gate lines match the scenario.
   - The core message, which the CLI also prints, does not. The test double `TestInvalidateRequiresForceError` is a local `SpecdError`, not `InvalidateRequiresForceError`, so the gate lines are untested. The test only asserts the old “invalidate the active approval/signoff” sentence.

Test coverage: `packages/cli/test/commands/change/change-invalidate.spec.ts` covers override shape, target parsing, `none` copy, JSON affected files, missing change, and target errors delegated to core.

Missing tests:

- Real `InvalidateRequiresForceError` with `gates: ['signoff']` (and both gates).
- Structured policy without `--reason` (Commander path is unasserted in this file).
- Preserve success that must show a blocker and a next action.
- Unknown policy enum exit-once.

## cli:change-approve

Requirements: 7. Scenarios: 14.

Implementation status: conformant for the adapter contract.

- `approve spec` and `approve signoff` each call one execute with `{ name, reason }` only (`approve.ts` lines 46–49 and 95–98). No `approvalsSpec` / `approvalsSignoff`. No `kernel.specs.approve*`.
- No fingerprint math. `summarizeFingerprint` prints counts, algorithms, `observed empty`, or `legacy unknown`. Tests assert full `sha256:` digests and file bytes are absent.
- Sign-off text includes verification id, `legacy unknown` when the id is null, actor, and time.
- Ineligible approval: a rejected execute goes to `handleError` and does not print `approved spec` / `approved signoff`. A resolved execute always prints success. That matches the scenario only when core rejects ineligible approval instead of returning a change.

Discrepancies: none confirmed in the CLI. The ineligible-return scenario has no CLI test.

Test coverage: `packages/cli/test/commands/change/approve.spec.ts` covers reason required, unknown sub-verb, call shape, ready/done success, wrong state, not found, empty vs null implementation, and hash-free spec JSON.

Missing tests:

- Core rejection that carries recovery or unresolved review, asserting success copy is absent and the blocker is visible.
- Text and JSON both for the same sign-off evidence object (empty case is text-only; spec evidence case is JSON-only).

## cli:change-transition

Requirements: 15. Scenarios: 46.

Implementation status: conformant for the versioned contract. Historical hook, skip-hooks, and check-bus behaviour remains in `transition.ts` and `transition.spec.ts`; this pass re-read the execute shape and the new repair path rather than re-deriving every hook scenario.

- `--next` sends `to: 'next'`. No local from→to table (`transition.ts` lines 295–306).
- No `--restart-verification` option (asserted in `transition.spec.ts`).
- `status.execute` is called with `refreshImplementationTracking: false` before transition and again on a repair-guide failure. The handler does not call `RefreshImplementationTracking` or `ImplementationDetector`.
- `transition.execute` input is `name`, `to`, `skipHookPhases`, and `allowOutOfScope` only when the flag is set. No approval flags.
- Repair text uses `validityTextLines` (counts and algorithms, no digests) plus core `blockers` and `nextAction`. It does not start or complete verification.
- Structured records use `stream: "change-transition"`.

The extra `status.execute` calls are required by the verify spec (pre-transition and repair-guide reads). They are not a violation of the verification “one execute” rule.

Discrepancies: none in the versioned guidance.

Test coverage: `packages/cli/test/commands/change/transition.spec.ts` includes `validity-aware transition guidance` (recovery line, in-place command, no restart). Older scenarios for gates, hooks, incomplete tasks, and repair codes remain in the same file.

Missing tests: none required for the new validity scenario. A text repair case that feeds a fingerprint containing source bytes is not present; the presenter used here is the same hash-stripping helper covered by status and verification tests.

## cli:change-status

Requirements: 18. Scenarios: 40.

Implementation status: conformant to `cli:change-status` verify scenarios. One residual against the change-wide “no full hashes in text” rule.

Conformant:

- One status read: `kernel.changes.status.execute`. `getActiveSchema.execute` is an additional schema read for the DAG, not a second status reconciliation. No direct refresh or detector call.
- Text and JSON render `publicValidity` and `publicVerificationEvidence`: spec/sign-off/verification, recovery, blockers, projection identity (not digests), active attempt separate from completed evidence.
- `nextAction` is copied from `GetStatus`. Drafted JSON forces empty transitions and `nextAction.command: null`.
- Review file paths stay under artifact details; overlap peers still print.

Residual (design/task hash rule, not a verify.md failure):

- `status.ts` lines 386–391 append `file.validatedHash` on text artifact rows when core set it. JSON copies `validatedHash` at lines 481–482. The new validity block does not. The status help schema still documents `validatedHash`. Fingerprint fixtures in the validity test are asserted hash-free only for `--format json`.

Discrepancies against verify.md: none.

Test coverage: `packages/cli/test/commands/change/status.spec.ts` `reconciled validity and next action` covers JSON state, attempt vs completed evidence, core next command, and digest omission. Broader DAG, review, blocker-label, and drafted cases remain in that file.

Missing tests:

- Text status for the same validity fixture (shared presenter, unasserted in text mode).
- Text artifact row that includes `validatedHash`, if the project decides that row must stay or must be removed.

## cli:change-verification

Requirements: 6. Scenarios: 6.

Implementation status: partial.

Conformant:

- `registerChangeVerification` is mounted from `packages/cli/src/index.ts`.
- Signatures: `verification start <name>`, `verification complete <name>`, `verification invalidate <name> --reason <text>`, each with `--format` and `--config`.
- Each action calls exactly one of `startVerification.execute({ name })`, `completeVerification.execute({ name })`, or `invalidateVerification.execute({ name, reason })`.
- Empty `--reason` calls `cliError` once before execute.
- No lifecycle guard in the handler. No fingerprint, manifest, test, or transition logic.
- Text, JSON, and TOON use `summarizeFingerprint` / `publicDifferences`. `verification.spec.ts` plants source bytes and a full `sha256:` digest and asserts they are absent. Idempotent invalidate prints `verification already stale`, blockers, and `nextAction.command`.
- Mismatch writes the repeat-start guidance, exits 1, and keeps code `VERIFICATION_FINGERPRINT_MISMATCH` with hash-free differences.

Discrepancy:

- **Success output JSON/TOON must include `reason`.** `spec.md` requirement “Success and idempotent output”: JSON and TOON include `invalidated`, verification status, **reason**, current state, automatic return, and next action. `renderInvalidate` (`verification.ts` lines 252–266) emits `invalidated`, `verificationStatus`, `state`, `automaticReturn`, `blockers`, `nextAction`, and a summarized fingerprint. It does not emit `reason`. Text also omits the reason. The TOON test checks `invalidated: false` and the next command, not `reason`.
  - Spec requires the audit reason in structured output.
  - The adapter treats reason as input-only. The use-case result type in the CLI (`InvalidateVerificationCliResult`) has no `reason` field, so this is fixed by echoing `opts.reason` or by core returning it.

`Status and skill discoverability` (compliance must not start/complete) is a skill rule. This CLI audit did not run those commands. The verification command group itself does not encode compliance ownership.

Test coverage: `packages/cli/test/commands/change/verification.spec.ts` (7 tests) covers one core call per command, missing reason, empty reason, idempotent TOON, mismatch metadata without digests, and unknown change.

Missing tests:

- Start/complete/invalidate from a non-`verifying` state (CLI has no state check; unasserted).
- Structured invalidate payload contains `reason`.
- Text complete (only JSON is tested) and text invalidate (only TOON is tested).

## Spec dependency chain (depth 1, CLI-relevant)

| Spec                       | Direct dependencies exercised by these adapters                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `cli:change-verification`  | `cli:entrypoint`, `core:invalidate-verification`, `core:get-status`, `core:change`, `core:transition-checks` |
| create / edit / invalidate | structured policy from core config and `EditChange` / `InvalidateChange` / `CreateChange` results            |
| approve                    | `ApproveSpec` / `ApproveSignoff` inputs stay `{ name, reason }`                                              |
| transition / status        | `GetStatus` and `TransitionChange`; CLI does not own recovery                                                |

No CLI adapter computes a fingerprint or selects a recovery state. Gaps are missing fields on the rendered result (edit blocker, invalidate blocker/next action, verification `reason`), plus the edit warning using the scope flag.

## Summary counts

| Spec                      | Requirements | Scenarios | Implementation         | Discrepancies | Test gaps |
| ------------------------- | -----------: | --------: | ---------------------- | ------------: | --------: |
| `cli:change-create`       |           10 |        20 | conformant             |             0 |         2 |
| `cli:change-edit`         |            7 |        17 | partial                |             2 |         4 |
| `cli:change-invalidate`   |           10 |        17 | partial                |             2 |         4 |
| `cli:change-approve`      |            7 |        14 | conformant             |             0 |         2 |
| `cli:change-transition`   |           15 |        46 | conformant             |             0 |         0 |
| `cli:change-status`       |           18 |        40 | conformant (verify.md) |             0 |         1 |
| `cli:change-verification` |            6 |         6 | partial                |             1 |         3 |
| **Total**                 |       **73** |   **160** |                        |         **5** |    **16** |

Design checks:

| Check                                                                 | Result                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--artifact-policy` / `--workflow-policy` on create, edit, invalidate | present                                                                                                                                                                                                    |
| no `--invalidation-policy`                                            | absent from CLI sources                                                                                                                                                                                    |
| verification `start` \| `complete` \| `invalidate`                    | registered                                                                                                                                                                                                 |
| text fingerprint output omits source bytes and full hashes            | yes, via `_validity-present.ts`                                                                                                                                                                            |
| status artifact rows                                                  | still print `validatedHash` when present                                                                                                                                                                   |
| one core execute                                                      | verification: one per command (tested). create/invalidate/approve: one mutation execute. edit also calls `detectOverlap` after scope edits. transition/status call the extra reads their own specs require |
| invalid enums exit once                                               | `cliError` → single `process.exit(1)` before execute; workflow enum untested                                                                                                                               |

ISSUES
