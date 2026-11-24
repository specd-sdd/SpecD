# Partial batch A (round 11): core:get-status, core:lifecycle-engine, core:change, core:workflow-model

Read-only audit. Method: merged spec+verify via `change spec-preview`, code reading, and scratch probes (outside the repo, under the session scratchpad) driving the real `GetStatus` with the real check registry.

## Test run

`vitest run` in packages/core: 1272 suites, 4053 tests, 4051 passed, 0 failed, 0 pending (2 tests unreported by the JSON counters, most likely todo).

## core:get-status (changed, detailed)

Requirements summary (round-11 relevant):

- Blocker merge is by condition family: spec-consent (`APPROVAL_*` validity vs `approval.spec`), signoff-consent (`SIGNOFF_*` vs `approval.signoff` with `APPROVAL_*`), verification (`VERIFICATION_*` vs `verification.current`; `approval.signoff` `VERIFICATION_*` yields to `verification.current`, kept only when it is absent). With at least one check failure in a family, every validity blocker of that family is dropped; check message/label/checkId/action win. `VERIFICATION_VALIDITY_UNAVAILABLE`, per-artifact and per-spec codes never merge.
- `OVERLAP_CONFLICT` keeps `nextAction` archive/archivable only when it is the ONLY blocker; otherwise guidance is unchanged and `nextAction.action` is not set.

Implementation status: implemented and conforming. get-status.ts:417-455 (families), 1004-1140 (`_mergeBlockers`), 1142-1160 (`_nextActionAfterArchiveOverlap`).

### (1) Exhaustive enumeration of the merge

Probe: real registry, approvals spec+signoff on, validity blockers generated exactly as `buildBlockers` does, states {ready, implementing, verifying, done, archivable} x specApproval {valid, absent, stale, revoked} x signoff {same} x verification {valid, absent, attempt-active, stale} = 320 combinations. Result: 0 duplicated families, 0 hidden conditions (every present condition is represented by exactly one blocker per family), 0 merged blockers lacking an action. Cross-family retention (spec-consent validity blocker kept next to an `approval.signoff` failure) confirmed. Verification: `verification.current` wins over `approval.signoff` `VERIFICATION_*` in all done/archivable combos.

Dropped-action analysis: validity consent blockers (`APPROVAL_*`, `SIGNOFF_*`) never carry an action (change-validity.ts:626-632). Only validity `VERIFICATION_*` carries `start-verification` (same builder as `verification.current`). So the "adopt the dropped action" path (get-status.ts:1071-1081, 1108-1109) is observable only for a kept `approval.signoff` `VERIFICATION_*` failure (no `verification.current` failure), which has no action of its own and adopts `start-verification`.

Ordering: merged Map insertion order = surviving verdict blockers (review, hop, kept validity), then check failures in `Object.entries(checksByTarget)` order, then archive. Deterministic for deterministic inputs. A dropped validity blocker's winning check blocker moves later in the list (for example, spec-consent validity blocker sits after check blockers in done/stale/revoked/absent). No spec ordering requirement.

### (1b) Skippability

- `transitionSkippable ?? archiveSkippable` (1090): `transitionSkippable` is populated only from failing transition rows, and verdict hop blockers only exist for failing transition rows, so the `?? archiveSkippable` branch is a dead fallback. The reverse regression (archive-origin blocker using transition binding) does not exist: new check blockers pick the map by `source` (1119), and archive-only checks (for example `spec.overlap`) never appear in `transitionSkippable`.
- Residual: when the same check fails with the same `code:message` on a transition AND on archive with different bindings, one merged blocker carries the transition verdict and the archive verdict is lost (conservative direction pinned by get-status-families.spec.ts:264-313). Also `transitionSkippable` ORs across targets.

### (2) `_nextActionAfterArchiveOverlap`

Probe in `archivable` with real registry, live overlap forced: overlap alone -> intent archive, targetStep archivable, reason is the overlap message (conforming). Overlap + stale/absent verification -> intent verify, step archiving, `nextAction.action` unset, `start-verification` stays on the verification blocker (conforming, with or without unresolved review). Overlap + review -> intent design. Overlap + synthetic consent validity blockers (`SIGNOFF_REQUIRED/STALE`, `APPROVAL_STALE`) -> unchanged guidance "Ready to archive" (intent archive, step archiving). Those states are unreachable after real reconciliation (recovery returns the change to done/designing), so LOW.

### Discrepancies (get-status)

- LOW (spec gap): adoption of a dropped validity blocker's action when the winning check has none is not in the spec ("the check's ... action win"). Behaviour is sensible and reachable only for the `approval.signoff` `VERIFICATION_*` fallback. Evidence get-status.ts:1071-1081, 1108-1109.
- LOW: skippability of a same-key transition/archive failure resolves to the transition verdict only (get-status.ts:1114-1130 via key dedupe at 1111-1116). Spec says `isSkippable` reflects the evaluated candidate; ambiguous when two scopes share one blocker.
- LOW (INFO): dead fallback `?? archiveSkippable.get` at get-status.ts:1090.
- LOW: with a review blocker present in `archivable` and overlap (or no overlap), `nextAction.reason` stays "Ready to archive" while `intent` is design (probe: reason "Ready to archive", intent design, step archiving). Pre-existing, outside the overlap rule.
- LOW (unverified): non-overlap archive-only predicates (`deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `schema.nameMatch`, `archive.archivable`) feed only `blockers`, not the verdict (`evaluateLifecycle` receives archive bindings for skippability only: get-status.ts:733-738), so by code reading `nextAction` can say "Ready to archive" while archive would refuse. I could not confirm empirically (my injected archive binding was not executed by the registry-resolved bindings). The spec only mandates the overlap rule.
- INFO: per-artifact duplicates are spec-conformant ("MUST NOT be merged") but visible: probe shows a drifted file yields both `ARTIFACT_DRIFT` (review message) and `ARTIFACT_DRIFT` (validity message "Artifact files differ ..."), and a pending-review file yields both `REVIEW_REQUIRED` and `ARTIFACT_REVIEW_REQUIRED`. The public code `ARTIFACT_REVIEW_REQUIRED` is not in the spec's blocker code list.

### Tests (new)

- get-status-families.spec.ts discriminates: revoked sign-off with differing codes (one blocker), verification absent/stale/active with duplicate signoff failure (one blocker, `verification.current`), signoff-only fallback, revoked spec at ready, cross-family two blockers, `VERIFICATION_VALIDITY_UNAVAILABLE` unmerged, transition-origin skippability.
- get-status-audit.spec.ts:331-420 covers overlap sole blocker and overlap + stale verification (pins `action` undefined).
- Missing: (a) the signoff `VERIFICATION_*` fallback test asserts `checkId` only, not the adopted `start-verification` action; (b) no test for the opposite skippability direction (archive-origin blocker whose check is also transition-bound with a different verdict and different message); (c) no test for overlap + consent/review combos or for non-overlap archive-only blockers vs `nextAction`; (d) no test asserting blocker ordering.

## core:lifecycle-engine

Requirements: evaluateLifecycle projects availableTransitions/nextAction from predicate results; overlap scenarios mirrored from get-status. Implementation consistent with probes above (verify intent kept when stale verification coexists with overlap; no action on `nextAction`, action on blocker). No new discrepancies beyond the get-status items.

## core:change

- "One reconciliation commits at most one recovery": reconciler calls `change.recover` once (reconcile-change-validity.ts:623-624) from a single `selectAutomaticRecovery` result; test reconcile-change-validity-recovery.spec.ts:155 pins archivable->done then done->designing. Conforming.
- Independent derivation: all 12 states x spec {valid, stale, revoked, absent} x signoff x workflow {preserve, redesign} x review {false, true} = 384 combos through `selectAutomaticRecovery`; every selected recovery has a matching `RECOVERY_ONLY_TRANSITIONS[cause][from]` entry equal to `to` (0 mismatches), and no table entry is unreachable. Spec-consent: pending-spec-approval, spec-approved, implementing..archiving -> designing, `ready` exempt (no table entry), drafting/designing none. Sign-off: pending-signoff, signed-off, archivable, archiving -> done. Redesign: ready and every later state -> designing. Matches the spec text at lines 426-430 (including legacy parking states).
- Tests for ready exemption exist (recovery spec lines 116, 132). Not verified: reconciler-level tests that pending-spec-approval/spec-approved/pending-signoff/signed-off sources recover.
- No discrepancies.

## core:workflow-model

Reread fully; spot-checked against code: bedrock states (build-schema.ts:810, 847-856), `skipChecks` on disabled step rejected (859-860), `archiveChecks` only on `archiving` (862-866), archive check locks and `workflow.taskCompletion` at archive scope (check-bindings.ts ARCHIVE_BINDING_SPECS), approval anchor validation (workflow-topology.ts). No drift found. Not exhaustively verified: governance error class mappings and the two-execution-modes/hooks sections.

## Counts

HIGH 0, MEDIUM 0, LOW 5 (one unverified), INFO 2. Missing tests: 4 groups (listed above).
