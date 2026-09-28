# Partial compliance audit — core validity use cases

Change: `versioned-approval-invalidation`  
Mode: delegated, shared attempt `verification-attempt-3`  
Audit scope: `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:invalidate-change`, `core:edit-change`, `core:transition-change`, `core:get-status`, `core:archive-change`, and `core:invalidate-verification`, plus relevant global specs and direct dependencies at depth 1.

The delegated auditor did not start or complete verification and did not modify product code, specs, manifests, or lifecycle state.

## Method and evidence

- `changes status` confirmed the shared attempt is active in `verifying`.
- `graph stats` reported a current graph: 1,214 code files, 43,763 symbols, 280 specs, no stale workspace, no parse failures.
- Merged change specs and verification artifacts were read with `changes spec-preview` rather than raw delta files.
- Code was located through `graph search` and `graph impact`; relevant source and mirrored tests were then read directly.
- The selected test set passed: **11 files, 353 tests**. Passing tests do not erase the uncovered contract gaps listed below.
- The merged verification surface contains **161 requirements and 404 scenarios** across this batch. Existing legacy scenarios were checked through their source/test surfaces; the validity-related deltas were traced line by line.

## Executive summary

Most discrepancies from the preceding audit are fixed:

- scope changes now compare the canonical scope fingerprint, so reorder-only edits preserve consent;
- sign-off distinguishes missing, active, stale, and mismatched verification;
- `GetStatus` now exposes `ValidityStatusProjection` and retains active attempt plus completed evidence;
- transition post-hook reconciliation refreshes implementation tracking;
- `TransitionChange`, `ValidateArtifacts`, and `GetStatus` reject a missing reconciler;
- repeated verification invalidation observes/reconciles and retains the first reason;
- scope snapshots, task exclusion, history retention, and decorated actor values are present on the normal composed paths.

The audit found **7 material discrepancies**: 3 high, 4 medium. It also found scenario-level test gaps despite the green suite.

| ID    | Severity | Spec(s)                                                                    | Summary                                                                                                                                                                                                                          |
| ----- | -------: | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CU-01 |     High | `core:archive-change`                                                      | Archive still permits a direct-deps path without the central reconciler and retains a legacy `Change.invalidate` fallback.                                                                                                       |
| CU-02 |     High | `core:archive-change`                                                      | Archive builds and snapshots its publication plan before the mandatory post-hook tracking refresh/reconciliation, so the published plan can represent the pre-refresh link set.                                                  |
| CU-03 |     High | `core:get-status`                                                          | The real reconciler resolves schema before `GetStatus`'s graceful-degradation catch, making the required read-only schema-failure result unreachable on the normal composed path.                                                |
| CU-04 |   Medium | `core:transition-change`                                                   | A committed automatic recovery is preserved, but the thrown error does not carry canonical blockers or next action.                                                                                                              |
| CU-05 |   Medium | `core:archive-change`                                                      | Archive recovery/validity failures are reduced to generic `InvalidStateTransitionError`, losing the committed recovery diagnostics required by the spec.                                                                         |
| CU-06 |   Medium | `core:invalidate-change`                                                   | The no-force guard reports affected gates but not their recovery targets.                                                                                                                                                        |
| CU-07 |   Medium | `core:approve-spec`, `core:approve-signoff` (and invalidation composition) | Approval operations resolve actor identity twice; invalidation use-case actor dependencies are unused. Normal config wiring uses the decorator, but the “resolve once/reuse exactly” and direct-deps contracts are not enforced. |

## Detailed discrepancies

### CU-01 — Archive reconciler remains optional and has a legacy mutation bypass

**Contract.** The design makes `ReconcileChangeValidity` the sole application orchestration path for artifact review, projection invalidation, audit, and automatic recovery. Its edge-case inventory explicitly requires a typed construction/configuration failure when any direct-deps path omits the reconciler. `core:archive-change` requires canonical reconciliation before archive and requires peer-overlap invalidation to delegate to the peer reconciler.

**Implementation evidence.** `ArchiveChange` stores `ReconcileChangeValidity | undefined`; its constructor parameter is optional (`packages/core/src/application/use-cases/archive-change.ts:205,223-240`). Initial and post-hook reconciliation are guarded by `if (this._reconcile !== undefined)` (`:280-287`, `:425-451`). Peer overlap falls back to `freshOverlapping.invalidate(...)` when it is absent (`:1190-1215`). `ArchiveChangeDeps.reconcile` is likewise optional (`packages/core/src/composition/use-cases/archive-change.ts:104-119`), and the explicit-deps factory forwards `undefined` (`:172-208`). Config composition supplies it, but the public direct-deps path does not require it.

**Why it matters.** Direct hosts and most legacy unit fixtures can archive without canonical approval/verification freshness or can invalidate overlapping peers outside the sole coordinator. Graph impact classifies `archive-change.ts` as **CRITICAL** (6 direct and 90 indirect dependents), so this is not an isolated test-only path.

**Possible interpretations.**

- If the design is authoritative, this is an implementation bug: make the constructor and `ArchiveChangeDeps.reconcile` mandatory, reject malformed explicit deps with the standard typed factory error, and remove both fallback branches.
- If compatibility with direct construction without reconciliation is intentionally retained, the design/spec must explicitly define it as a temporary unsafe compatibility path. That would weaken the central-reconciler invariant and is inconsistent with the edge-case inventory.

**Tests.** No mandatory-reconciler test covers Archive. `mandatory-validity-reconciler.spec.ts` covers only Edit and Validate. Most `archive-change.spec.ts` fixtures omit a reconciler, so the suite positively exercises the path the new design forbids.

### CU-02 — Archive publication plan is prepared from the pre-refresh snapshot

**Contract.** After mutation-capable pre-archive hooks, Archive must refresh implementation tracking, reconcile fresh files/links, rerun live predicates, and only then proceed with a plan representing that same accepted snapshot. The archive scenario says hooks that modify fingerprinted inputs or add tasks must be caught before publication; the design additionally requires whole current linked-file materialization.

**Implementation evidence.** After before-persist effects, Archive calls `_prepareArchivePlan(change, ...)` and `_prepareArchivePreflight(...)` at `archive-change.ts:368-407`, derives `batchSpecIds`/`publishOrder`, and writes snapshots at `:408-424`. Only afterward does it call reconciliation with `refreshImplementationTracking: true` (`:425-451`). The returned `change` is used for rerun checks, but `preparedPlan` and `preparedPreflight` are not rebuilt before publication.

**Failure mode.** A hook can add or remove a valid in-scope implementation link. The refresh may accept the new tracking state and all rerun checks may pass, while publication still writes the pre-refresh implementation link set captured in the old plan. Out-of-scope links are tested because they fail a predicate; a new valid in-scope link is not tested and can be silently omitted from `spec-lock`.

**Possible interpretations.**

- If the plan must be snapshot-consistent with accepted validity, move refresh/reconciliation and predicate rerun immediately after hooks and before plan/preflight/snapshot creation, or rebuild the entire plan after reconciliation.
- If preparation before reconciliation is intentional, the contract needs an explicit revision/fingerprint guard proving the plan's link/artifact inputs are unchanged. No such guard currently connects `preparedPlan` to the refreshed aggregate.

**Tests.** Existing tests cover stale verification, absent approval, and out-of-scope links after the second reconciliation, but not an accepted in-scope link-set change or removal reflected in the final persisted sidecar.

### CU-03 — Active status cannot gracefully degrade when schema resolution fails

**Contract.** `core:get-status` retains “Schema resolution failure returns actionable read-only status”: artifact state remains inspectable, lifecycle mutation is disabled, and a `SCHEMA_RESOLUTION_FAILED` blocker is returned. The new contract also requires reconciliation for active status.

**Implementation evidence.** `GetStatus.execute` invokes the mandatory reconciler before `_buildActiveResult` (`packages/core/src/application/use-cases/get-status.ts:432-446`). The real reconciler calls `schemaProvider.get()` inside `_apply`; therefore a missing schema throws before `_buildActiveResult` reaches its `SchemaNotFoundError` catch (`get-status.ts:485-535`). The graceful branch is reachable only with a fake/no-op reconciler. Because reconciliation refreshes implementation tracking before schema resolution, merely catching afterward could also leave a partial operational write before the purported read-only result.

**Possible interpretations.**

- Preserve the existing status requirement: preflight schema availability before reconciliation and return the read-only projection without refresh/validity writes when unavailable; alternatively give reconciliation an explicit non-mutating “schema unavailable” result.
- Prefer fail-fast canonical validity: remove or revise the graceful-degradation requirement and its test. The current merged spec promises both behaviours without defining their precedence, so the spec is internally incomplete even though production behaviour currently chooses fail-fast.

**Tests.** The schema-failure test passes through test wiring that does not reproduce the real mandatory reconciler's schema access. Add a config-wired or real-reconciler test with a failing schema provider and assert both returned blockers and absence of repository mutation.

### CU-04 — Transition recovery error omits blockers and next action

**Contract.** Scenario “Committed recovery survives failed requested transition” requires the failed request to identify the committed state, blockers, and next action, without undoing recovery.

**Implementation evidence.** Recovery is correctly committed first. When it changes state, `TransitionChange` throws `new InvalidStateTransitionError(change.state, requested)` (`packages/core/src/application/use-cases/transition-change.ts:180-190`; similarly after hooks at `:277-285`). `InvalidStateTransitionError` contains only `from`, `to`, and the limited `TransitionFailureReason` union; it has no canonical blocker, next-action, or automatic-return payload (`packages/core/src/domain/errors/invalid-state-transition-error.ts:3-59`). The integration test asserts only error class and persisted state (`reconciled-transition-status.spec.ts:28-62`).

**Possible interpretations.**

- Add an application-layer recovery-committed error/result carrying state, `AutomaticRecovery`, blockers, and `NextAction`; keeping this out of the domain error avoids a domain-to-application dependency.
- If callers are expected to run `GetStatus` after every transition error, revise the scenario to say diagnostics are obtained by a second status call. The current wording requires them in the failed transition result.

### CU-05 — Archive recovery is reported as generic invalid state

**Contract.** Scenario “Archive reports committed recovery separately from eligibility” requires committed recovery to remain persisted and the failure to include canonical blockers and next action, rather than being reduced to a generic invalid-state error. Stale verification must recommend renewal in place.

**Implementation evidence.** Initial recovery and post-hook recovery/validity rejection both throw `InvalidStateTransitionError(change.state, 'archiving')` (`archive-change.ts:280-286`, `:425-437`). The canonical verdict is discarded. A stale verification, absent gate, and committed return therefore share an indistinguishable error surface unless an adapter performs a separate status read.

**Possible interpretations.** Same options as CU-04: return/throw an application diagnostic carrying the canonical result, or explicitly change the spec to require a separate status projection. The latter is simpler but contradicts the current archive scenario.

**Tests.** Archive tests assert failure class, state, and lack of publication, but not blockers, automatic return, or next action.

### CU-06 — Force guard lacks recovery targets

**Contract.** `core:invalidate-change` says that a no-force request affecting valid consent performs no mutation and reports affected gates **and recovery targets**. The design says the use case returns exact affected gates and Core-selected targets without hard-coded CLI recovery.

**Implementation evidence.** `consentToRevoke` selects current valid gates and `InvalidateChange` throws before reconciliation (`packages/core/src/application/use-cases/invalidate-change.ts:112-120`). `InvalidateRequiresForceError` exposes only `gates`; its message says Core will choose a target later, but there is no structured target field (`packages/core/src/application/errors/invalidate-requires-force-error.ts:6-29`). The previous hard-coded “designing” message was fixed, but the required information is still absent.

**Possible interpretations.**

- Compute a non-mutating canonical preview using the same pure recovery selector and attach exact gate/target pairs to the error.
- If recovery is deliberately unknowable until force authorizes mutation, revise the scenario to require only affected gates and say targets appear only in the successful forced result. This is a reasonable simpler product contract, but it is not the current one.

**Tests.** Current tests assert error code/message and forced recovery, not structured preflight recovery targets or the already-stale non-guard case.

### CU-07 — Actor values are decorated, but “resolve once and reuse” is not enforced

**Contract.** The design requires approval, sign-off, verification, and invalidation operations to resolve one decorated `ActorIdentity` per logical operation and reuse that exact value. Direct-deps tests should prove no second privacy application or alternate identity path.

**Implementation evidence.** `ApproveSpec` resolves `_actor.identity()` and then calls `ReconcileChangeValidity.mutate` (`approve-spec.ts:90-104`); `ApproveSignoff` does the same (`approve-signoff.ts:102-104`). `mutate` independently calls its own `ActorResolver.identity()` before applying reconciliation (`reconcile-change-validity.ts:138-153`). Thus every approval resolves twice, even on success. Projection and approval event use the same local actor, so ordinary persisted approval values are correct, but reconciliation consequences in the same operation can use the second result. Conversely, `InvalidateChange` stores an `_actor` that is never read, and `InvalidateVerificationDeps.actor` is not used by the use case; their events use the actor embedded in the separately supplied reconciler. Config composition currently supplies the same decorated resolver instance, so mask/hash/anonymous tests pass, but a public direct-deps caller can supply inconsistent resolvers and the declared use-case actor has no authority.

**Possible interpretations.**

- Make the reconciled mutation context expose its single resolved actor and have approvals record with that actor; remove redundant actor deps from invalidation use cases or validate/share them through one composition object.
- If “same decorated resolver” rather than “one resolved value” is sufficient, relax the design wording and remove unused public actor dependencies. This permits time-varying/provider-varying identities across one operation and is weaker than the current audit invariant.

**Tests.** Privacy tests verify stored decorated values for mask/hash/anonymous modes, but do not assert one identity resolution or intentionally supply different direct-deps actors to the use case and reconciler.

## Per-spec implementation status

### `core:approve-spec` — implemented with one identity-wiring gap

All 9 requirements / 17 scenarios were mapped. Disabled-gate I/O guard, lookup/schema errors, reconciled mutation, scope-aware fingerprint, history retention, ready-state behaviour, legacy pending drain, task-aware fingerprint service, and factory wiring are present. CU-07 remains. End-to-end use-case tests do not explicitly exercise task exclusion, missing required artifact, or sorted/deduplicated multi-spec scope; those behaviours are principally covered in fingerprint/domain tests rather than by scenario-named approval tests.

### `core:approve-signoff` — implemented with one identity-wiring gap

All 9 requirements / 17 scenarios were mapped. Tracking refresh, whole-file fingerprint comparison, valid empty implementation map, distinct missing/active/stale/mismatch errors, done-state success, legacy drain, atomic sign-off record, and shared composition are present. CU-07 remains. Whole linked-file and empty-map scenarios are mainly service/entity coverage rather than explicit use-case tests; add end-to-end assertions that the sign-off projection carries the exact implementation fingerprint and verification ID.

### `core:validate-artifacts` — compliant on the mandatory reconciler path

All 26 requirements / 83 scenarios were mapped. The former optional `Change.invalidate` fallback is removed: constructor omission throws the standard composition error, and completion/baseline mutation runs through `reconcile.mutate`. Non-task drift is observed before the new validated hash, task artifacts are excluded by `hasTasks`, structural validation remains active, and no projection is renewed. No functional discrepancy found. Coverage is strong for the legacy validation surface and includes non-task approval staleness plus task-name independence; the exact `preserve` “review blocks forward progress” assertion lives mainly in validity/transition tests rather than this suite.

### `core:invalidate-change` — mostly compliant

All 13 requirements / 19 scenarios were mapped. Structured policy overlays, target normalization, transient override, canonical intent delegation, atomic forced revocation/recovery, DAG expansion, cause, drift neutrality, and repeat safety are present. CU-06 remains. Test gaps include structured recovery targets on the force error, already-stale gate bypass, exact idempotent result fields, and workflow-only override independence.

### `core:edit-change` — compliant

All 16 requirements / 31 scenarios were mapped. Scope edits occur inside `reconcile.mutate`; canonical scope differences carry `spec-added`/`spec-removed`; reorder-only edits preserve consent; unrelated verification/sign-off are fingerprint-driven; policy-only edits do not invent drift; output separates `scopeChanged` from `validityChanged`; refresh removes dangling links. No functional discrepancy found. Several inherited no-op combinations are covered indirectly rather than with one test per merged scenario, but the new scope fingerprint cases are present.

### `core:transition-change` — behaviour mostly compliant; recovery diagnostics incomplete

All 29 requirements / 68 scenarios were mapped. Reconciler is mandatory, pre-transition refresh is configurable, post-hook refresh is unconditional, checks are rerun, entry to verifying creates no attempt, exit does not complete verification, readiness IDs are deduplicated, backward matching evidence is preserved, and designing no longer broad-invalidates. CU-04 remains. Also add a test that asserts the error payload, not only persisted recovery state.

### `core:get-status` — rich projection implemented; schema-failure contract unresolved

All 19 requirements / 50 scenarios were mapped. Active status always reconciles despite `ifModifiedSince`, drafts remain read-only, rich approval/sign-off/verification projection is returned, active attempt and completed evidence coexist, and phase-aware guidance is present. CU-03 remains. Real-composition coverage is needed for schema failure and for refresh-disabled-but-still-reconciled behaviour.

### `core:archive-change` — canonical composed path exists but public and snapshot gaps remain

All 34 requirements / 113 scenarios were mapped. Normal config composition injects reconciliation; post-hook refresh, live predicates/tasks, verification/gates, deferred transition, v2 evidence preservation, and peer intent delegation exist. CU-01, CU-02, and CU-05 remain. The suite is broad but much of it constructs Archive without the reconciler, and it does not prove that an accepted post-hook in-scope link change is included in the publication plan.

### `core:invalidate-verification` — implementation matches the revised contract

All 6 requirements / 6 scenarios were mapped. Attempt-only evidence fails without mutation; valid completion becomes stale without losing baseline; sign-off consequence and blockers are returned; repeat invalidation observes canonical facts, retains the first reason, and appends no duplicate event; no baseline or lifecycle self-transition is created; factory forms exist. No functional discrepancy found. The dedicated use-case file has only two tests: add explicit boundary guidance/current-state, unchanged fingerprint preservation, no-transition, continued-observation-with-new-drift, and factory behaviour tests (some factory coverage currently lives in composition tests).

## Dependency and global-spec consistency

- **Architecture:** domain validity evaluation remains pure; file collection is application/port based; config composition uses the shared resolver. CU-01 is the exception because Archive directly invokes aggregate invalidation outside the designated coordinator.
- **Error contract:** new verification and fingerprint errors extend `SpecdError` with stable uppercase codes. CU-04/CU-05/CU-06 are payload-completeness issues, not base error-contract violations.
- **Testing conventions:** Vitest and mirrored paths are followed; no snapshots were found in this scope. The contract's stronger rule—explicit tests named for every changed scenario with state/event/policy/blocker/next-action assertions—is not fully met.
- **Approval decorators:** normal config composition obtains actors through `CompositionResolver.getActorResolver()` and privacy tests cover mask/hash/anonymous stored values. CU-07 concerns duplicate resolution and inconsistent explicit-deps wiring, not absence of the decorator in the normal kernel path.
- **Direct dependencies:** no contradiction was found with `core:change`, `core:change-repository-port`, `core:transition-checks`, `core:schema-format`, or the global testing/error specs beyond the findings above. Archive's optional reconciler contradicts the new central-validity dependency expected by its own change delta and design.

## Test coverage summary

| Spec                    | Selected suite status | Coverage assessment                                                                      |
| ----------------------- | --------------------: | ---------------------------------------------------------------------------------------- |
| approve-spec            |                  pass | Partial scenario-level coverage; fingerprint-service coverage fills task/scope mechanics |
| approve-signoff         |                  pass | Partial scenario-level coverage; service coverage fills whole-file mechanics             |
| validate-artifacts      |                  pass | Strong; one cross-suite preserve-routing assertion                                       |
| invalidate-change       |                  pass | Functional happy paths strong; force diagnostics/idempotent output incomplete            |
| edit-change             |                  pass | New scope/reorder behaviour covered                                                      |
| transition-change       |                  pass | Broad; recovery payload not asserted                                                     |
| get-status              |                  pass | Rich projection covered; real schema-failure composition missing                         |
| archive-change          |                  pass | Broad legacy surface; mandatory reconciler and post-refresh plan consistency missing     |
| invalidate-verification |                  pass | Only 2 direct use-case tests for 6 scenarios; composition tests cover factories          |

## Counts

- Specs audited: **9**
- Merged requirements mapped: **161**
- Merged scenarios mapped: **404**
- Selected tests executed: **353 passed, 0 failed**
- Material discrepancies: **7** (**3 high**, **4 medium**)
- Specs with no functional discrepancy: **3** (`validate-artifacts`, `edit-change`, `invalidate-verification`)
- Explicit scenario-coverage gap groups: **12**

## Recommended resolution order

1. Make Archive reconciliation mandatory and remove its fallback (`CU-01`).
2. Move/rebuild Archive planning after post-hook refresh and reconciliation (`CU-02`).
3. Decide the GetStatus schema-failure precedence and align spec plus production composition (`CU-03`).
4. Introduce one application diagnostic contract for committed recovery in Transition and Archive (`CU-04`, `CU-05`).
5. Decide whether no-force invalidation must preview recovery targets; implement or revise the scenario (`CU-06`).
6. Make actor ownership single-source for reconciled human operations and add call-count/direct-deps tests (`CU-07`).
