# Batch B compliance audit: core:get-status, core:change

Change: decouple-core-cli-workflow-guidance. Read-only audit. Scope note: depth concentrated on the change theme (host-neutral intents/actions, no CLI strings/bypass flags in core). The very large `core:change` spec was audited mainly on its delta (Lifecycle wording, legacy-state exits) plus theme-related text; the remaining unchanged requirements were not re-verified line by line.

---

## Spec 1: core:get-status

---

### Requirements Summary

Active GetStatus refreshes impl tracking, reconciles validity, projects artifacts/blockers/nextAction from check evaluation. Drafts are read-only. Blockers carry `isSkippable`/`checkId`/`label`/`action` but never CLI `bypassFlag`; `nextAction` is `{targetStep, actionType, reason, intent, action?}` with no command strings; archive overlap keeps intent `archive` with a host-neutral reason.

### Implementation Status

- Accepts name input (+refresh/ifModifiedSince): OK. `packages/core/src/application/use-cases/get-status.ts` `execute` ~L491.
- Returns change/draftView/artifactStatuses/specDependsOn/review/blockers/nextAction: OK. Result type L363-391.
- Resolution order get -> getDraft -> ChangeNotFoundError; no getDiscarded: OK (L493-500; getDiscarded not referenced).
- Revision evaluation (reconcile before unchanged): OK per code path (tests L1245-1320). Drafts ignore `ifModifiedSince` (spec says "may"): OK.
- Drafted read-only (empty transitions, intent null, no action): OK. `_buildDraftedResult` L841-945.
- Implementation status projection: OK (`projectImplementationTracking`, L632/775).
- Pre-read refresh / operational reconciliation / schema-failure degradation: OK (L504-520, `_buildActiveResult` L578-638, tests L336-435).
- Drift-aware display status: OK (L601-607, L711-721).
- Task completion counts from check, no 2nd CountTasks: OK (`taskCompletionFromChecks` L696; tests L582-680).
- Execute matching predicates + archive bindings: OK (L650-685). Archive overlap carries `isSkippable` only from resolved archive binding (`_mergeBlockers` L959-1042). No bypassFlag field exists in `Blocker` (L264-279). No `--skip-checks`/CLI strings found anywhere under `packages/core/src` (grep).
- Archive overlap nextAction: OK. `_nextActionAfterArchiveOverlap` L1052-1066 uses `overlap.message` as reason; intent `archive`, targetStep `archivable`.
- Shared candidate evaluation: OK (`evaluateLegalTargets`, `evaluate-transition-candidate.ts`).
- Blockers incl. label/action propagation: OK (L1014-1039). `details` field exists for schema identity mismatch (L399+).
- IMPLEMENTATION_STATE skippability only for impl.linksInScope: OK via resolved bindings (tests L732-900).
- Approval/verification/fingerprint projection (`ValidityStatusProjection`, `fingerprintIssues`): OK (L312-322, L781).
- Constructor deps / resolveGetStatusDeps / createGetStatus config: OK per tests in `composition/use-cases/workflow-check-registry.spec.ts`, `composition/use-cases/get-status.spec.ts`.
- Schema warnings as structured result field: OK (`schemaWarnings`).

### Discrepancies

1. LOW (spec wording): verify.md "Drafted result still includes artifact statuses" says `result.artifacts`; code field is `artifactStatuses`. Spec typo; code is consistent with spec.md body.
2. LOW: `OVERLAP_CONFLICT` nextAction reason is simply the failed check's message (`get-status.ts` L1063). Spec requires only "names live overlap in host-neutral terms". Satisfied only as long as the spec.overlap check message stays host-neutral. Current detection messages contain no flags (grep clean), but this is an implicit coupling with no guard test on the real check (the test at get-status.spec.ts L1395-1433 uses a stub check message "Specs overlap with other active changes"). Either spec is fine and code is fine, or add a guard test on real `spec-overlap.ts`.
3. INFO: `_nextActionAfterArchiveOverlap` drops any `action` from the verdict nextAction when overlap present; spec silent. Acceptable.
4. INFO: `hook-effect-shared.ts` / `transition-checks.ts:396` use `command` in hook progress details; this is the hook shell command, not CLI guidance. Not a violation of the theme.

### Test Coverage (`packages/core/test/application/use-cases/get-status.spec.ts`, plus composition tests)

Covered: not-found, sovereign schema, refresh toggles, schema degradation + identity mismatch (L336-435), shortcut/step-skip evaluation (L437-540), CountTasks memo (L582-680), bypassFlag absence (L732, 846, 1426, 1471, 1636, 1792), gerund label, overlap vs invalidation, archive binding overrides (L1728-1918), validity projection, ifModifiedSince (L1245-1320), fingerprint diagnostics (L1920), draft read-only (L1078-1220).

### Missing Tests

- MISSING: "Failed gate check action reaches blocker and nextAction" at GetStatus level (blocker `action: {kind:'approve-spec'}` and `nextAction.action`, intent null). Only verdict-level coverage (`domain/services/lifecycle-verdict.spec.ts` L408) and `lifecycle-guidance.spec.ts` L125; `get-status.spec.ts` has no `approve-spec` assertion.
- PARTIAL: "Verification blocker carries start-verification" for a stale-verification `done` change. get-status.spec.ts L1548 asserts only `nextAction.action`; the blocker `action` and absence of `details.command` are not asserted.
- MISSING: "Discarded-only name is not found / getDiscarded not invoked" at GetStatus level (getDiscarded appears only in helper files).
- MISSING: "Draft resolution uses getDraft not get" spy assertion is only implicit.
- MISSING: "Drafted status ... nextAction.action is undefined" not explicitly asserted (intent null covered).
- MISSING: "Archive predicates run without user bypass" (empty skipChecks assertion) and "Status evaluation has no transition effects" (no hook/persist) not found as explicit tests.
- MISSING: "Missing reconciler fails instead of falling back" at GetStatus level (a composition-level `mandatory-validity-reconciler.spec.ts` exists; not verified to cover GetStatus direct deps).
- No guard test that the real spec.overlap message is flag-free (see discrepancy 2).

### Summary counts

Requirements: 24 | OK: 24 | PARTIAL: 0 | MISSING: 0 | Discrepancies: 2 LOW + 2 INFO | Untested/partially tested scenarios: 7

---

## Spec 2: core:change

---

### Requirements Summary

Change entity owns persisted lifecycle facts: identity, lifecycle table, gates, verification/approval projections, artifacts, history, drafting. Change delta: host-neutral Lifecycle wording and legacy pending-state exit edges (`pending-spec-approval` -> implementing/designing; `pending-signoff` -> archivable/designing/done; no edge into `spec-approved`/`signed-off`).

### Implementation Status (delta + theme-related)

- Lifecycle table / VALID_TRANSITIONS: OK. `packages/core/src/domain/value-objects/change-state.ts` L32-45 matches the delta exactly (ready: implementing,designing; done includes archivable,designing,implementing,verifying; pending-spec-approval and pending-signoff exits ordered forward-first; archiving: archivable,designing; no entry edges to spec-approved/signed-off).
- Sign-off recovery edges only via central reconciliation: OK. `RECOVERY_ONLY_TRANSITIONS` L63-100 (`signed-off`/`archivable` -> `done`), absent from VALID_TRANSITIONS.
- Designing self-entry: OK (`designing: ['ready','designing']`).
- Lifecycle interpretation authority: PARTIAL (see discrepancy 1).
- Remaining unchanged requirements (identity, workspaces, artifacts, history, drafting, fingerprints): not re-verified in depth; no contradictions with theme noticed.

### Discrepancies

1. MEDIUM: Stale text in core:change "Requirement: Lifecycle interpretation authority" (merged spec ~L409): "which blocker or domain `nextHop` should be surfaced (`evaluateLifecycle` attaches `nextAction.command`)". Code has no `nextAction.command` (`grep nextAction.command packages/core` empty); `NextAction` is `{targetStep, actionType, reason, intent, action?}` (get-status.ts L282-293). core:get-status explicitly says "neither nextAction nor any blocker may carry a CLI or slash-command string". Either the spec should be updated to "attaches host-neutral `nextAction.intent`/`action`" (code correct, spec stale; recommended, and this line is not touched by any delta of this change) or core really should expose a command (contradicts the change theme). Not covered by `deltas/core/change/spec.md.delta.yaml` (only Lifecycle section is modified).
2. LOW: "Requirement: Artifacts" says skip is performed "via a CLI command ... defined in the CLI spec" and via "skill definition". Core spec referencing CLI/skill delivery is mild theme leakage but is descriptive, not a core output string. Either leave (documentation) or reword to "delivery adapter". Code is unaffected.
3. LOW: History table row `description-updated` references `EditChange` "with `--description`", a CLI flag in a core spec. Same class as 2.
4. INFO: Delta verify.md adds three scenarios under "Requirement: Lifecycle" while the merged verify.md also has other scenarios (e.g. L663-683); consistent.

### Test Coverage

`packages/core/test/domain/value-objects/change-state.spec.ts`: covers pending-spec-approval exits (L33-34), pending-signoff exits (L46-48), `isValidTransition('pending-spec-approval','spec-approved')` false (L84), `pending-signoff -> signed-off` false (L85), `spec-approved -> pending-spec-approval` false (L107), recovery edges kept out of manual (L70, L157), ready/done/archivable/archiving tables (L130-150), HAPPY_PATH_NEXT (L76).

### Missing Tests

- PARTIAL: scenario "spec-approved and signed-off have no entry edge" (scan every source state): only pairwise checks at L84/85/107 exist; no loop asserting no source state lists either target.
- PARTIAL: "exactly `implementing` and `designing`" ordering for `pending-spec-approval` is checked via pairwise `isValidTransition` rows (L33-34), not an exact-array/ordering assertion (verify "forward exit listed first").
- Other unchanged scenarios of core:change were not audited for coverage in this pass.

### Summary counts

Requirements audited in depth: 3 (Lifecycle, Neutral designing self-entry, Lifecycle interpretation authority) | OK: 2 | PARTIAL: 1 | MISSING: 0 | Discrepancies: 1 MEDIUM, 2 LOW, 1 INFO | Partially untested delta scenarios: 2

---

## Top findings

1. core:change still says `evaluateLifecycle` attaches `nextAction.command`; code and core:get-status say there is no command string (spec stale, MEDIUM).
2. core:get-status implementation is fully host-neutral (no bypassFlag, no CLI strings in core); gaps are test-only: GetStatus-level `approve-spec` action propagation, blocker-level `start-verification`, discarded-only not-found, no-effects/empty-skipChecks.
3. core:change delta lifecycle table matches code exactly; the "no entry edge" scenario lacks a full-scan test.
4. Core specs still mention CLI flags (`--description`, CLI command for skip) in core:change (LOW).
