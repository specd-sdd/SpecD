# Partial batch D — core:approve-spec, core:approve-signoff, core:archive-change

Read-only audit. Impl paths under /Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core. Spec IDs for spec-preview are `core:approve-spec` etc. (not `core:core/...`). Change delta touches only a subset of requirements; the rest of each spec is pre-existing and was audited at lower depth (mostly reconciler/composition behaviour).

---

## 1. core:approve-spec

### Requirements Summary

Gate guard; change lookup; artifact hash computation; recording (state from `boundFromStates('approval.spec')`, never transitions); canonical reconciliation; persistence/return; input contract; gates baked at construction; factory/deps. Delta changes only wording (Purpose, "Approval recording...", "Persistence...") to host-neutral/no-transition language. No CLI strings in the spec.

### Implementation Status (src/application/use-cases/approve-spec.ts)

- Gate guard: OK — gate check first (:80-82), then get (:84-87), ResolveChangeSchema (:89-93), actor (:95). Schema errors propagate before actor/consent.
- Change lookup: OK (:84-87).
- Artifact hash computation: OK (delegated to `_fingerprint.specApprovalFingerprint` :104, `blockingArtifact` :147-172 excludes `hasTasks`). Cleanup/scope fingerprint lives in ValidityFingerprintService (not re-verified in depth).
- Recording / no transition: OK — `boundFromStates('approval.spec')` (:102), no hardcoded names, only `recordSpecApproval` (:112), no transition call.
- Canonical reconciliation: OK — everything through `_reconcile.mutate` (:96).
- Persistence/return: OK — returns `mutation.change` (:131); ineligible -> `InvalidStateTransitionError` (:127).
- Input contract: OK (`name`, `reason` readonly, :16-21).
- Gates baked: OK (ctor :53-70, `_approvals.spec`).
- Factory: PARTIAL — not re-read in depth; composition tests exist (test/composition/use-cases/approve-spec.spec.ts, 1.9K).

### Discrepancies

- LOW: Spec says state-ineligible/ineligible fails with `InvalidStateTransitionError`; code uses target `'ready'` hard-coded (:121,:127) rather than a binding-derived target. Spec does not mandate the target. Either spec should state the target, or code should derive it from the binding `to`. Evidence: approve-spec.ts:121.
- LOW: stale-approval-in-`implementing` flow depends on the reconciler (not in this file); not asserted in this use case's tests.

### Test Coverage (test/application/use-cases/approve-spec.spec.ts)

Gate disabled (:343), not found (:428), records consent in ready stays (:139), renewal keeps prior events (:161), drift persists review w/o consent (:192), pending-spec-approval no transition (:246-290), single decorated actor (:118), wrong state -> InvalidStateTransitionError (:373), sovereign schema + identity mismatch (:389,:409), mutate usage (:325).

### Missing Tests

- Scenario "Task artifacts excluded from fingerprint" / "Missing required artifact blocks approval" / "Approval snapshots canonical scope" (use-case level; may live in fingerprint service tests).
- "Approval renewed only in ready (implementing -> designing -> ready)" at this level.
- "Eligible states come from the check bindings" — wrong-state test uses a default state, does not prove bindings drive eligibility (no test overriding bindings).
- "Consent in a parking state never transitions" for `spec-approved` (only `pending-spec-approval` tested).
- "Factory equivalence / invalid mixed args" — verify in composition test (only 1.9K).
- "Factory passes config.approvals".

### Summary counts

Requirements 9: OK 8, PARTIAL 1, MISSING 0. Discrepancies: 2 (low). Untested scenarios: ~7.

---

## 2. core:approve-signoff

### Requirements Summary

Same structure as approve-spec plus implementation fingerprint, verification eligibility errors (NotFound / InProgress / Stale / FingerprintMismatch), disabled `verifying` bypass, and (delta) `VerificationStaleError` host-neutral message + structured `changeName`.

### Implementation Status (src/application/use-cases/approve-signoff.ts, errors/verification-stale-error.ts)

- Gate guard: OK (:96-112; schema before refresh/actor).
- Change lookup: OK.
- Artifact hash computation: OK — refresh tracking (:117), `completeFingerprint` (:134); whole-file/`text-v1` details live in the fingerprint service (not re-audited).
- Recording / no transition: OK — `boundFromStates('approval.signoff')` (:124), only `recordSignoff`, verifying-disabled branch skips evidence (:119-122, :149-158).
- Verification errors distinct: OK — NotFound/InProgress/Stale/Mismatch mapping (:167-185); stale never reported as not found.
- VerificationStaleError host-neutral: OK — message "Verification for change 'X' is stale; renew verification before sign-off" (no `specd`, `--`, `/specd-`), code `VERIFICATION_STALE`, `changeName` getter (verification-stale-error.ts:5-28).
- Canonical reconciliation / persistence: OK (`_reconcile.mutate`).
- Input contract, gates baked: OK.
- Factory: PARTIAL — not audited in depth.

### Discrepancies

- LOW: JSDoc `@throws` on `execute` omits `VerificationInProgressError` and `VerificationStaleError` (approve-signoff.ts:~100). Doc drift only.
- MEDIUM (spec vs impl wording): scenario "Signoff requires current completed verification" says "in-place verification renewal is recommended". The use case only throws `VerificationStaleError`; the recommendation must be rendered by the CLI from `changeName`. Either spec should say "the error carries the data for hosts to recommend renewal" or core should expose a structured action. Evidence: verification-stale-error.ts exposes only `changeName`; no `action`. (Consistent with change theme, but the scenario text is imprecise.)
- LOW: `InvalidStateTransitionError(state,'done')` target hard-coded (:158,:176).

### Test Coverage (test/application/use-cases/approve-signoff.spec.ts)

Verifying disabled w/o evidence (:199) and active-only (:211); NotFound (:223), InProgress (:231), Stale incl. code/changeName/no-CLI regex (:240-258), legacy-unknown stale (:260), fingerprint mismatch (:285); consent stays in done (:316); renewal append-only (:331); pending-signoff no transition (:368-415); gate disabled (:463); wrong state (:493); sovereign schema/identity mismatch (:179,:509); single actor (:159).

### Missing Tests

- Whole-file implementation fingerprint scenarios (dedupe/sort, symbol ranges, unreadable file fails, empty observed map) at use-case level.
- "Eligible states come from the check bindings" (no binding-override test); `signed-off` parking never transitions.
- "Reconciliation blocks signing a changed snapshot", "Signoff fingerprint atomically current", "Failed eligibility never signs".
- "Signoff requires current completed verification ... renewal recommended" (no recommendation asserted).
- Factory equivalence / invalid mixed args (composition test only 2.0K).

### Summary counts

Requirements 9: OK 8, PARTIAL 1, MISSING 0. Discrepancies: 3 (1 medium, 2 low). Untested scenarios: ~8.

---

## 3. core:archive-change

### Requirements Summary (delta-touched)

Typed errors (list incl. `CheckPredicateFailedError` for all archive predicates; `ArchiveDependencyMismatchError`/`SpecOverlapError` retired; no switch on check id); readOnly guard (details.specs + specific message format); overlap guard (details.entries, `skippable`, no delivery flags in message, peer invalidation via `spec-overlap-conflict` intent); archive checks share runners (mismatches in details); out-of-scope sidecar guard; canonical validity preflight (next action from `evaluateLifecycle` over committed state with forward-candidate checks, never hard-coded; disabled verifying never routes to verify).

### Implementation Status (src/application/use-cases/archive-change.ts etc.)

- Typed errors / generic check error: OK — `throwArchivePredicateFailure` (:1503-1517) builds `CheckPredicateFailedError` from check result with `skippable` from resolved binding and `{from,to:'archiving'}`; no switch on check id.
- Retired errors: OK — `ArchiveDependencyMismatchError`/`SpecOverlapError` not referenced except a stale JSDoc (see below).
- readOnly guard: PARTIAL — `details.specs` provided (domain/checks/workspace-read-only.ts:60-66), runs as binding before hooks; BUT message format differs from spec (see Discrepancy 1). Locked/non-skippable on archive: covered by validateSkipChecks (tests :4601).
- Overlap guard: OK — check emits `details.entries`/`peers` (domain/checks/spec-overlap.ts:58-62), message "Specs overlap with other active changes: peer (ids)" has no CLI flags; peers invalidated through `_reconcile.execute({intent:{type:'spec-overlap-conflict'}})` (:1256-1291), after first predicate pass and before hooks (:422-430); no `Change.invalidate` call in the use case.
- Checks share runners: OK/PARTIAL — merge-time `runDepsConsistent` re-run with `finalDependsOn` (:1303-1328) throws `CheckPredicateFailedError` with `details.mismatches`; the merge-time error carries only `{to:'archiving'}` (no `from`) and `skippable:false` — spec says `from`/`to` attempted (minor).
- Out-of-scope sidecar guard: OK — `impl.linksInScope` skippable via skipChecks; non-skippable rejection tested (:5085).
- Canonical validity preflight: OK — `_archiveRecoveryError` (:297-333) uses `evaluateLegalTargets` + `evaluateLifecycle` with `checksByTarget`/`bindingsByTarget`; only `reason` overridden; not hard-coded. Reconciler mandatory in ctor (test :198).
- verification.current action: OK in code — `startVerificationAction` (`kind:'start-verification'`) attached (domain/checks/verification-current.ts:47-82).

### Discrepancies

1. MEDIUM — readOnly message format. Spec (requirement "ReadOnly workspace guard") prescribes: `Cannot archive change "<name>" — it contains specs from readOnly workspaces:` + per-spec `- <specId>  →  workspace "<workspace>" (readOnly)` + `Archiving would write deltas into protected specs.` Implementation message is `Change contains specs from readOnly workspaces: <specId> (workspace '<ws>')...` (domain/checks/workspace-read-only.ts:50-62); the old formatted message existed at HEAD archive-change.ts:1519 and was dropped; no code or test emits/asserts the spec's format (grep for "Archiving would write" finds nothing in src/test). Possibility A: code regression — restore format (host-neutral already). Possibility B: spec is stale — relax to "message lists all affected specs and workspaces" (verify scenario already only requires that). Design.md does not mention the format.
2. LOW — stale JSDoc `@throws {ArchiveDependencyMismatchError}` on `_assertArchiveDepsConsistent` (archive-change.ts:1297); class retired. Code should say `CheckPredicateFailedError`.
3. LOW — merge-time `deps.consistent` error omits `from` and uses `skippable:false` rather than the resolved binding's skippability (:1308-1326). Spec says `skippable` taken from the resolved binding.
4. LOW — `ArchiveChange.execute` JSDoc `@throws` lists only plugin failures for `CheckPredicateFailedError` (:347), whereas spec lists all archive predicates.
5. INFO — spec "overlap scenario": `details.entries` and message include peer; verified in code, not asserted in tests.

### Test Coverage (test/application/use-cases/archive-change.spec.ts)

readOnly -> CheckPredicateFailedError/READ_ONLY_WORKSPACE (:3535); overlap throws (:3346); bypass proceeds/invalidates peers (:3387,:3433,:4152,:4235); overlap non-skippable/no-CLI-flag message & skippable (:4712-4753); other failing checks not bypassed (:4755,:4775); deps mismatch fails archive (:1232); open tracked files (:3570,:3593); out-of-scope links (:3617,:3664); plugin failure id/code/details (:4864); verification.current missing/stale (:405,:415); recovery to done projects `approve-signoff`, intent != verify (:3915); skipChecks validation (:4578-4682); ctor requires reconciler (:198).

### Missing Tests

- readOnly: no assertion of `details.specs` content, message content, "no hooks executed / no files written", nor that the change stays archivable (scenario "Archive rejected when change contains readOnly specs").
- Overlap block scenario: `details.entries` and message include `core:config`/`beta` not asserted (:3346 only checks id/code).
- Dependency mismatch scenario: `details.mismatches` with extracted + persisted deps not asserted (:1232 block checks id/code only; `typeof runDepsConsistent` is a vacuous assertion at :1317 area).
- Open implementation file: `details.files` not asserted.
- Stale verification scenario ("Stale verification fails archive through the generic error"): no assertion of `start-verification` action nor absence of `ArchiveImplementationStateError` (archive-change.spec.ts:415-460; grep `start-verification` = 0 hits).
- Built-in failures use the generic check error: no test that `verification.current`/`impl.filesResolved`/`deps.consistent` carry details per per-code contract nor "no switch on check id".
- readOnly `workspace.readOnly` locked binding via `--skip-checks` => CheckNotSkippableError (:4601 covers "locked and non-skippable built-ins" generically; not verified for this check specifically).
- Merge-time deps re-run against sidecar `finalDependsOn` reporting through same error.
- `typeof runWorkspaceReadOnly`-style assertions (:3566) are vacuous.

### Summary counts

Delta-touched requirements 6 (+ ~15 pre-existing, not individually re-audited): OK 5, PARTIAL 1 (readOnly message), MISSING 0. Discrepancies: 5 (1 medium, 3 low, 1 info). Missing/weak tests: ~8, including 2 vacuous assertions.

---

## Cross-spec check vs project/global specs

- No contradiction found with `_global/error-handling-conventions` for the three specs (errors carry structured data; core messages free of CLI/slash tokens in the audited files).
- grep of core/src for `--skip-checks|--allow-overlap|/specd-` in non-comment code returned no hits in the audited use cases/checks/errors.

## Overall

Totals: 3 specs, 0 MISSING requirements, 3 PARTIAL (factories/readOnly message), 10 discrepancies (1 medium workspace.readOnly message-format regression/spec drift, 1 medium signoff "renewal recommended" wording, 8 low/info), ~23 untested/weakly tested scenarios.
