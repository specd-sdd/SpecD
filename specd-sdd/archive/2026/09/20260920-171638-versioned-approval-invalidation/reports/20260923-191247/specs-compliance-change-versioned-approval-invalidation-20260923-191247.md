# Specs compliance report — versioned approval invalidation

- Change: `versioned-approval-invalidation`
- Mode: full verification / delegated compliance
- Verification attempt: `verification-attempt-3`
- Audit timestamp: `20260923-191247`
- Outcome: **not ready to complete verification**
- Scope: 25 change specs, applicable project-wide specs, and direct dependencies (depth 1)

## Executive summary

The implementation is substantially complete and all functional suites, lint, typecheck, and build pass. The compliance audit nevertheless found contract-level defects that the current suites do not detect.

- Findings: **16 total** — **6 high**, **8 medium**, **2 low**
- Highest-risk areas: v2 manifest round trips, archive reconciliation/snapshot ordering, delegated compliance orchestration, and lifecycle/spec consistency
- Verification evidence: left active and incomplete; no successful verification record was written
- Formatting: repository-wide Prettier check fails on 119 files; `git diff --check` isolates one concrete whitespace issue in `packages/core/src/domain/errors/index.ts`

## Verification evidence executed

| Check                | Result                              |
| -------------------- | ----------------------------------- |
| Core                 | 221 files / 2,712 tests passed      |
| CLI                  | 82 files / 937 tests passed         |
| Skills               | 9 files / 59 tests passed           |
| Code graph           | 59 files / 713 tests passed         |
| Plugin packages      | 17 + 4 + 4 + 5 + 5 + 5 tests passed |
| MCP                  | 2 tests passed                      |
| SDK                  | 73 tests passed                     |
| Lint                 | Passed                              |
| Typecheck            | Passed across 14 packages           |
| Build                | Passed across 12 build tasks        |
| Format check         | Failed: 119 files reported          |
| Verifying post hooks | No hooks or instructions            |

## Recommended disposition

Do not complete `verification-attempt-3` yet. Address or explicitly revise the six high-severity contracts first, then start a replacement attempt because implementation/spec inputs will have changed and repeat full verification. Medium findings should either be fixed in the same pass or consciously resolved as design changes.

## Detailed findings

The following sections preserve every delegated partial report verbatim.

# Partial compliance audit — core model, manifest, configuration, and checks

Change: `versioned-approval-invalidation`  
Mode: delegated, shared attempt `verification-attempt-3`  
Scope: `core:change`, `core:change-repository-port`, `core:config`, `core:change-manifest`, `core:schema-format`, `core:transition-checks`, `core:create-change`, their direct dependencies (depth 1), and applicable global constraints.

## Requirements summary

| Spec                          | Main contract audited                                                                                                                   | Status                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core:change`                 | Materialized approval/verification projections, structured invalidation, fingerprint semantics, lifecycle recovery, append-only history | Partially compliant: lifecycle contract is internally inconsistent                                       |
| `core:change-repository-port` | Atomic mutation, read-only hydration, v1 compatibility, v2 persistence, projection/history preservation                                 | Partially compliant through the manifest parser defect                                                   |
| `core:config`                 | Structured artifact/workflow policy, preserve defaults, conservative legacy adaptation, ambiguity rejection                             | Implemented                                                                                              |
| `core:change-manifest`        | Versioned v1/v2 parsing, strict v2 events, scope-aware fingerprints, stable serialization and audit history                             | Partially compliant: strict event schema rejects valid scope differences                                 |
| `core:schema-format`          | `hasTasks` controls fingerprint/drift exclusion while preserving structural/task checks                                                 | Implemented                                                                                              |
| `core:transition-checks`      | Shared verdict/recovery semantics, fail-closed verification, deduplicated implementation boundary checks                                | Implemented in this model/check layer; use-case diagnostics are covered in the separate use-case partial |
| `core:create-change`          | Structured policy input, configured/default resolution, v2 persistence without legacy scalar                                            | Implemented                                                                                              |

## Implementation status and positive evidence

- The domain owns structured invalidation policy and validity projections without I/O. Configuration and repository adapters perform boundary validation, preserving the global hexagonal dependency rule.
- New changes resolve configured policy or the default `{ artifacts: 'downstream', workflow: 'preserve' }`; legacy scalar manifests adapt conservatively to `workflow: 'redesign'`. Unsupported future manifest versions fail with the typed version error and reads do not eagerly rewrite v1.
- Spec approval fingerprints contain sorted/deduplicated `specIds`; equality ignores ordering and emits `spec-added` / `spec-removed` for true set differences. Artifact and implementation maps are deterministic, include algorithms and full key sets, and preserve observed-empty implementation evidence.
- `hasTasks`, rather than an artifact filename, excludes task-bearing artifacts from validity fingerprints and automatic drift propagation while leaving structural validation and live completion checks applicable.
- The transition registry runs both implementation readiness checks at implementing-exit and verifying-entry boundaries, deduplicates overlapping IDs, and treats only an explicit `not-required` verification verdict as skippable.
- Core's complete suite passed: **221 files, 2,712 tests**. Graph state was current and complete. Those passing suites do not exercise the invalid v2 round trip identified below.

## Discrepancies

### MODEL-01 — HIGH — Strict v2 history schema rejects valid scope-aware approval invalidation

**Affected specs:** `core:change-manifest`, `core:change-repository-port`, `core:change`, with direct impact on `core:edit-change`.

The domain fingerprint contract deliberately emits scope differences as:

- `{ scope: 'spec', kind: 'spec-added' }`
- `{ scope: 'spec', kind: 'spec-removed' }`

The domain event type and repository serializer accept the general `FingerprintDifference[]`, and scope-edit tests prove that `EditChange` can append such an `approval-invalidated` event. The standalone `fingerprintDifferenceSchema` is also correct. However, the strict `rawChangeEventV2Schema` duplicates a narrower inline schema at `packages/core/src/infrastructure/fs/manifest.ts:531-551`: it permits only scopes `artifact | implementation` and kinds `added | removed | changed | algorithm-changed | unreadable`.

**Failure mode.** A real scope change can atomically persist a v2 manifest containing the intended `scope: spec` audit difference. A later repository read validates the same history against the strict event union and rejects it. This violates native-v2 round-trip preservation and can make an otherwise successfully edited change unloadable.

**Why tests missed it.** Fingerprint tests cover `spec-added` / `spec-removed`; entity/edit tests cover event creation; manifest tests cover v2 projections. No test round-trips a v2 `approval-invalidated` history event carrying a scope difference through serializer, parser, and loader.

**Possible interpretations and resolution.**

1. **Implementation bug (recommended):** make the event field reuse `fingerprintDifferenceSchema` instead of duplicating a narrower object. Prefer `.strict()` consistently if strict nested objects are intended. Add repository and loader round-trip tests for added and removed specs, plus a negative unknown-kind case.
2. **Spec bug:** remove scope differences from audit events. This would contradict the approved design goal that historical approval scope remain explicit and would discard the exact reason consent became stale.

### MODEL-02 — HIGH — `archiving → done` is simultaneously required and forbidden

**Affected spec:** `core:change`; related proposal/design recovery invariant and transition-check behaviour.

The merged `core:change` lifecycle and “Archiving escape transitions” requirements state that `archiving` may target only `archivable` or `designing`, and explicitly forbid `archiving → done`. Yet the same change's proposal says required stale sign-off returns **any change beyond `done`** immediately to `done`; the design records this as an invariant. The policy-aware invalidation delta likewise says the central reconciler returns a later state to `done`.

The implementation follows proposal/design: `VALID_TRANSITIONS.archiving` is `['archivable', 'designing', 'done']`, with explicit tests asserting it. Therefore the code cannot conform to the merged lifecycle requirement and the gate-recovery invariant at the same time.

**Operational consequence.** If sign-off becomes stale while archive work is still active, central reconciliation needs a legal atomic recovery target. Removing the edge would either leave stale consent beyond its required boundary or require a special mutation that bypasses the entity transition table. Keeping the edge violates the current spec text.

**Possible interpretations and resolution.**

1. **Spec bug (recommended, consistent with the user's approved proposal/design):** update the lifecycle table, archiving escape requirement, constraints, and verification scenarios to allow `archiving → done` exclusively for central mandatory sign-off recovery. Keep manual transition semantics narrow if needed by distinguishing recovery-owned transitions from user-requested escape transitions.
2. **Implementation/design bug:** prohibit the edge and redefine sign-off recovery while `archiving` (for example, restore to `archivable` first and then recover). This adds a two-step non-atomic path and contradicts the central “detect and return together” decision.

**Missing tests.** Add a reconciler-level test for stale sign-off detected in `archiving`, proving exact state/event ordering and idempotence, plus a transition/API test showing whether a user may request the same edge or only the reconciler may apply it.

## Per-spec implementation status

### `core:change`

Materialized projections, append-only audit history, policy-aware focused invalidation, task exclusion, scope-aware fingerprints, explicit verification attempt/completion/invalidation, and preservation of unchanged evidence are implemented and broadly tested. MODEL-02 leaves lifecycle topology contradictory; MODEL-01 can make a valid domain history unreadable after persistence.

### `core:change-repository-port`

Repository mutation remains serialized/atomic and hydration is read-only. V1/transitional adaptation and v2-only-on-real-mutation behaviour are present. The port implementation inherits MODEL-01 because its accepted write shape is broader than its subsequent read validation.

### `core:config`

Structured policy loading, independent dimensions, preserve defaults, legacy scalar mapping, and ambiguous dual-shape rejection are implemented. No functional discrepancy was found.

### `core:change-manifest`

Version discrimination, future-version failure, projection serialization, canonical fingerprint maps, legacy unknown evidence, and explicit verification events are present. MODEL-01 is a critical round-trip hole in the strict event union.

### `core:schema-format`

Operational task semantics are marker-driven through `hasTasks`; arbitrary artifact IDs work. Task content is excluded from fingerprints/drift propagation without disabling structure or completion requirements. No functional discrepancy was found.

### `core:transition-checks`

Shared registry bindings, fail-closed verification, explicit `not-required`, duplicated-boundary deduplication, and operation-context checks for verification start are implemented. No additional model-layer discrepancy was found; missing recovery payloads in use cases are reported in the core-use-cases partial.

### `core:create-change`

Creation accepts one complete structured policy, uses configured/default values when omitted, rejects partial schema override, and persists v2 policy without rewriting later creation history. No functional discrepancy was found.

## Test coverage and edge cases to add

1. Serialize, parse, load, and reserialize a native-v2 `approval-invalidated` event for both `spec-added` and `spec-removed`.
2. Repository integration: approve scope A, edit to scope B, save, reload, and assert stale approval plus exact historical differences.
3. Negative strict-schema test for an unknown difference scope/kind.
4. Reconcile stale sign-off from `archiving`, with exact transition and invalidation event ordering and repeat idempotence.
5. Decide and test whether `archiving → done` is recovery-only or also a normal explicit edge; align `VALID_TRANSITIONS`, status availability, and merged spec wording.
6. Add symmetric config tests for partial structured overrides across project defaults and transitional manifests if not already covered at the repository boundary.

## Dependency and global-spec consistency

- Domain/application/infrastructure direction is respected in this batch; no domain I/O or adapter-owned business rule was found.
- The manifest defect is a boundary-schema inconsistency: domain and serializer agree, but strict input validation disagrees.
- The lifecycle defect is a contradiction between the merged capability spec and its proposal/design invariant, not merely code drift. Based on the approved design discussion, the spec text is the likely stale side.
- Error and testing conventions are otherwise followed: typed errors, Vitest mirrored tests, no snapshots, strict ESM/named exports.

## Summary counts

- Specs audited: **7**, plus project-wide constraints and direct dependencies.
- Fully compliant in this batch: **4** (`config`, `schema-format`, `transition-checks`, `create-change`).
- Partially compliant: **3** (`change`, `change-repository-port`, `change-manifest`).
- Findings: **2 high**, **0 medium**, **0 low**.
- Core suite evidence: **2,712 passing tests**; both findings require new cross-boundary/contract tests.

---

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

---

# Compliance audit — CLI and skills batch

Change: `versioned-approval-invalidation`  
Delegated verification attempt: `verification-attempt-3`  
Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, `cli:change-verification`, `skills:workflow-automation`, `skills:skill-templates-source`, their direct dependencies (depth 1), and applicable global constraints.

## Requirements summary

| Spec                            | Main contract audited                                                                                                                                            | Status                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `cli:change-status`             | Render reconciled state, validity projections, separate active/completed verification evidence, safe fingerprint differences, canonical blockers and next action | Implemented; minor coverage gaps                                               |
| `cli:change-invalidate`         | Independent artifact/workflow flags, thin Core delegation, exact force refusal, policy/evidence/recovery/blocker output                                          | Partially compliant                                                            |
| `cli:change-approve`            | Core-owned fingerprinting/reconciliation, ready/done gate eligibility, materialized evidence output, canonical failure guidance                                  | Partially compliant                                                            |
| `cli:change-transition`         | Canonical status/use-case guidance, no retry/alternate hop/restart flag/self-transition, generic check output                                                    | Implemented                                                                    |
| `cli:change-create`             | Structured policy flags, config-derived defaults, no legacy scalar new-write surface                                                                             | Implemented; missing edge-case tests                                           |
| `cli:change-edit`               | Partial structured policy edits, Core-owned reconciliation, distinct scope/validity effects, blockers and next action in all formats                             | Partially compliant                                                            |
| `cli:change-verification`       | State-independent start/complete/invalidate commands, thin delegation, safe evidence output, stable mismatch guidance                                            | Implemented                                                                    |
| `skills:workflow-automation`    | Fresh-status recovery, in-place preserve review, explicit verification-attempt ownership, delegated compliance sharing                                           | Partially compliant because delegated compliance procedure is incomplete       |
| `skills:skill-templates-source` | Consistent source/generated lifecycle protocol, standalone/delegated attempt ownership, report-only non-change modes                                             | Partially compliant because phrase parity hides an incomplete delegated branch |

## Implementation status and evidence

The CLI commands consistently import the integration surface from `@specd/sdk`, preserving the global architecture rule that CLI is an adapter rather than a business-logic owner. Graph impact confirms the new command handlers are registered from `packages/cli/src/index.ts` and directly covered by their mirrored test files. `registerChangeVerification`, `registerChangeEdit`, and `registerChangeInvalidate` are all classified HIGH risk by the graph because their direct dependents include the CLI entrypoint and their command suites. The shared `summarizeFingerprint` presenter reaches all approval/status/transition/verification presenters and sixteen source/test files, so output-safety behavior is correctly centralized.

Positive implementation evidence:

- Status consumes `kernel.changes.status.execute`, renders `change.state` after that call, emits Core-provided blockers/next action, separates `verification.activeAttempt` from `verification.completed`, strips digest/content fields, and exposes both invalidation policy dimensions.
- Transition obtains status before resolving `next`, delegates the hop once, and on typed transition failures reloads status for a repair guide. It does not expose `--restart-verification`, does not implement attempt start/complete, and substitutes the actual change name through the Core-provided command.
- Create/edit/invalidate expose the new independent policy flags and use shared parsers. Create overlays explicit values on the already validated Core config projection; edit sends only supplied dimensions; invalidate marks overrides as command-scoped.
- Verification start, complete, and invalidate each invoke exactly one corresponding Core use case. Their presenters summarize fingerprints without file contents/digests. Mismatch guidance explicitly requires a new start and repeated work. Repeated invalidation renders the persisted reason returned by Core in text, JSON, and TOON.
- Skill source templates and installed copies contain the new reconciliation and attempt-ownership language. The generated-copy parity test covers `.agents`, `.codex`, `.claude`, `.github`, `.opencode`, and the installed shared protocol.

Executed evidence:

- `@specd/cli`: **82 files, 937 tests passed**.
- `@specd/skills`: **9 files, 59 tests passed**.
- Code graph: current, complete, schema-compatible; 1,214 indexed code files, 280 specs, no stale fingerprint.

## Discrepancies

### CLI-SKILLS-01 — HIGH — Delegated compliance is detected but has no complete workflow branch

**Affected specs:** `skills:workflow-automation`, `skills:skill-templates-source`.

The compliance template correctly detects `--change <name> --delegated --attempt <attemptId>` and says that delegated mode must not start or complete verification. However, all later change-scoped branches are restricted to `mode = change`:

- report placement uses the change directory only for `mode = change`; delegated mode falls into the generic config reports directory (`packages/skills/templates/skills/specd-compliance/SKILL.md.tpl:154-161`);
- scope discovery/status/project context/direct dependencies has a branch for `mode = change` but none for `mode = delegated` (`:171-200`);
- merged change previews are selected only for `mode = change`, so delegated mode is instructed to use the non-change `specs show` path (`:224-228`);
- final filenames enumerate full/change/diff/PR/single but not delegated (`:250-257`).

This is not merely cosmetic. A literal execution cannot determine the delegated audit scope or a valid final report filename, and may audit base specs rather than merged change specs. The current parent verification succeeded only because its delegation prompt supplied the scope, attempt, and exact report path externally.

**Why tests missed it:** `template-workflow.spec.ts:248-271` asserts that key phrases exist and that mode detection ordering is correct, but never executes or structurally checks every downstream mode branch. `generated-skill-protocol.spec.ts` likewise checks phrase parity, not procedural completeness.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** treat `delegated` as change-scoped for discovery, report placement, merged previews, dependency expansion, and filename generation, while retaining its distinct attempt ownership. Use conditions equivalent to `mode = change OR mode = delegated`; add a delegated filename or deliberately reuse the change filename. Add an executable/structural test that walks every detected mode through directory, scope, fetch, filename, and attempt-ownership decisions.
2. **Spec/design bug:** if the caller is intended to supply all scope/report details, state that as a required delegated input contract and remove self-contained discovery/report promises. This is weaker and tightly couples verify to compliance internals, so it conflicts with the current reusable compliance design.

### CLI-SKILLS-02 — MEDIUM — `changes edit` text output drops canonical blockers, next action, and explicit scope-change status

**Affected spec:** `cli:change-edit`.

The handler reads `scopeChanged`, `blockers`, and `nextAction` from Core (`packages/cli/src/commands/change/edit.ts:122-131`). JSON/TOON include them (`:175-193`), but text output only renders specs, workspaces, state, policy dimensions, projection changes, and automatic return (`:165-174`, `:210-230`). This violates the merged requirement that text, JSON, and TOON render Core-owned recovery guidance and that `scopeChanged` remain distinct from actual validity change. In the important ungated-preserve case, the text user can see a retained lifecycle state but not the forward-progress blocker or what to do next.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** add `scope changed`, `validity changed`, blocker rows (including labels/check IDs if Core supplies them), and the canonical next-action block to text output. Keep structured output unchanged except preferably emit stable empty arrays where its public schema promises them.
2. **Spec too strict:** declare only structured formats machine-complete and reduce text requirements. That conflicts with the rest of the CLI contract, where text is the primary agent/human repair surface.

**Missing test:** an ungated `workflow: preserve` edit returning `ARTIFACT_DRIFT` plus a next action must assert equivalent semantic fields in text, JSON, and TOON.

### CLI-SKILLS-03 — MEDIUM — Edit warning conflates any validity change with approval invalidation

**Affected spec:** `cli:change-edit`.

At `packages/cli/src/commands/change/edit.ts:136-142`, any truthy `validityChanged` prints `warning: approvals invalidated`. The result can contain verification-only or sign-off-only projection changes; the merged spec requires reporting exactly which approval or verification projection changed and warns about approval invalidation only when Core reports such a committed projection change. The structured `projectionChanges` already contains the necessary discriminator, but the warning ignores it.

**Possible interpretations and resolution:**

1. **Implementation bug (recommended):** derive warning wording from `projectionChanges`: name spec approval, sign-off, and/or verification separately. Treat legacy `invalidated` only as a fallback with neutral wording (`validity evidence changed`) rather than asserting approvals.
2. **Core contract ambiguity:** redefine `validityChanged` to mean approval-only. That would make the name misleading and still loses verification/sign-off specificity required by the CLI spec.

**Missing tests:** verification-only drift and sign-off-only recovery must not print `approvals invalidated`; canonical scope reordering/no-op must print no validity warning.

### CLI-SKILLS-04 — MEDIUM — Approval failures do not render committed recovery and canonical next action

**Affected spec:** `cli:change-approve`.

Successful output is strong: materialized status, decorated approver, decision time, verification identity, and safe fingerprint summary are rendered. On failure, however, both approval handlers only call the shared `handleError` (`packages/cli/src/commands/change/approve.ts:40-70`, `:89-119`). They do not consume a reconciled result or query fresh status after a domain rejection. Consequently, when pre-approval reconciliation commits recovery or exposes pending review, text output cannot show the actual state, recovery cause, blockers, and next action as required. Existing wrong-state tests assert only exit code and an `error:` prefix.

This spans the CLI/Core boundary: the approval use cases currently return a change only on success and throw on ineligibility. A generic error may carry a code/metadata, but it is not the complete canonical routing projection.

**Possible interpretations and resolution:**

1. **CLI adaptation (recommended if use-case signatures remain):** catch expected approval eligibility/reconciliation failures, call `GetStatus` once after the failed use-case, and render the same repair guidance as transition without retrying approval.
2. **Core API redesign:** return a discriminated approval result containing reconciliation/status guidance on refusal. This gives the thinnest CLI but is a broader contract change.
3. **Spec relaxation:** require only the stable Core error. This loses the explicitly designed “committed recovery is visible” behavior and leaves approval UX inconsistent with transition/edit/status.

**Missing tests:** stale spec consent recovered to designing, unresolved review in ready, stale verification blocking sign-off, and sign-off recovery to done should all assert no success headline plus canonical state/blockers/next action in text and structured formats.

### CLI-SKILLS-05 — MEDIUM — Force refusal names gates but cannot identify their canonical recovery targets

**Affected spec:** `cli:change-invalidate`; dependency `core:invalidate-change` / Core error contract.

The CLI catches `InvalidateRequiresForceError` and prints one warning per gate, but each warning says only that Core will report the recovery target after rerunning with `--force` (`packages/cli/src/commands/change/invalidate.ts:222-231`). The merged spec requires the refusal itself to name each affected gate **and its canonical recovery target**, with no mutation. Core's error stores only `gates` and a generic message (`packages/core/src/application/errors/invalidate-requires-force-error.ts:12-29`), so the CLI has no target information and correctly avoids inventing it—but the end-to-end contract is unmet.

**Possible interpretations and resolution:**

1. **Cross-layer implementation bug (recommended):** enrich the Core refusal with structured entries such as `{ gate: 'spec', target: 'designing' }` / `{ gate: 'signoff', target: 'done' | null }`, derived by the reconciler, and render them in text/JSON/TOON. Do not make the CLI calculate targets.
2. **Design correction:** if recovery cannot be known until forced mutation, change the spec to require gates only and explain that the target will be returned on success. This weakens the pre-mutation consent prompt and contradicts the stated “exact recovery” objective.

**Missing tests:** separate spec-only, signoff-only, both-gates, and no-return force refusals; assert exact gate-target pairs and zero repository mutation in all formats.

### CLI-SKILLS-06 — LOW — New create-policy scenario coverage is incomplete

**Affected spec:** `cli:change-create`.

Implementation uses shared parsers for both dimensions and resolves both flags correctly, so no code defect was found. Tests cover configured defaults, artifact-only overlay, and invalid artifact policy (`packages/cli/test/commands/change-create.spec.ts:490-558`). They do not cover workflow-only overlay, both flags together, or invalid workflow policy, despite the merged scenarios explicitly addressing independent policy flags and unsupported values.

**Resolution:** add the three symmetrical tests. This is a coverage gap, not current behavioral evidence of failure.

### CLI-SKILLS-07 — LOW — Reconciled status scenario is under-tested across required formats

**Affected spec:** `cli:change-status`.

The implementation has common presenters for safe validity/evidence fields and appears conformant. The new reconciled-validity test exercises JSON only (`packages/cli/test/commands/change/status.spec.ts:1297+`), while the scenario requires text and structured output. There is no direct assertion that text shows the committed recovery cause plus active attempt and stale completed evidence together, nor an explicit TOON assertion.

**Resolution:** parameterize the new scenario over text/JSON/TOON, including digest/content non-disclosure and the earlier-phase rule that stale verification does not replace the normal next action.

## Test coverage assessment

| Area            | Existing coverage                                                                                               | Assessment                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Status          | Broad legacy/status DAG/review/blocker tests plus one new JSON validity/evidence test                           | Good implementation coverage; new cross-format recovery scenario incomplete  |
| Invalidate      | Policies, targets, affected ordering, none semantics, structured success, basic force error                     | Good happy-path coverage; exact gate-target refusal absent                   |
| Approve         | Ready/drain states, success formats, materialized actor/time/fingerprint, empty vs legacy implementation        | Strong success coverage; canonical failure guidance absent                   |
| Transition      | Next/direct hops, checks/hooks, repair guide, no restart flag, committed recovery                               | Strong and aligned                                                           |
| Create          | Defaults and artifact overlay/parser                                                                            | Workflow dimension edge cases missing                                        |
| Edit            | Basic edits, one partial policy update, JSON projection/recovery                                                | Text recovery and projection-specific warnings missing                       |
| Verification    | Single-call delegation, supersession, completion, persisted invalidation reason in all formats, mismatch safety | Strong and aligned                                                           |
| Skill templates | Phrase presence and generated-copy parity                                                                       | Insufficient for control-flow/mode completeness; delegated branch bug passes |

## Spec dependency consistency

- The CLI specs consistently depend on `cli:entrypoint` for registration, formatting, and exit behavior. The commands use Commander, shared `output`/`parseFormat`, and shared error handling; no contradiction was found.
- CLI-to-Core dependency direction is respected: command modules import `@specd/sdk` and delegate to kernel use cases. No direct infrastructure/business-logic dependency was found.
- `cli:change-verification` is consistent with `core:invalidate-verification`, `core:get-status`, `core:change`, and `core:transition-checks`: commands do not transition state, run tests, or calculate fingerprints. The delegated compliance procedural gap is in skill orchestration, not this CLI command.
- `cli:change-transition` is consistent with the Core check registry: readiness and `verification.current` remain generic checks; the CLI does not special-case their predicates.
- `skills:workflow-automation` and `skills:skill-templates-source` are semantically consistent with Core recovery priority and the global architecture/testing rules, except for the incomplete delegated-mode workflow described in CLI-SKILLS-01.
- Generated copies are synchronized for the phrases currently asserted. Synchronization itself is not the problem; the same incomplete delegated branch is faithfully copied.

## Missing tests and edge cases to add

1. Execute a delegated compliance-mode decision table: report directory, scope discovery, merged preview selection, output filename, and absence of start/complete.
2. Edit output parity for text/JSON/TOON with preserve + drift blocker + next action.
3. Edit projection-specific warnings: spec approval, sign-off, verification only, combined, and no-op canonical scope reorder.
4. Approval refusal after committed spec/sign-off recovery with full canonical routing in all formats.
5. Invalidate force refusal with spec-only, signoff-only, both, and null/no-return targets.
6. Create workflow-only, both-policy, and invalid-workflow flag cases.
7. Status committed recovery + simultaneous active attempt/completed stale evidence in text and TOON, including safe difference redaction.
8. A template behavioral test should parse every declared compliance mode and require branches for discovery, content source, report path/name, and verification-attempt ownership; phrase tests alone are insufficient.

## Summary counts

- Specs audited: **9** change specs, plus relevant global constraints and direct dependencies.
- Fully implemented in this batch: **4** (`cli:change-status`, `cli:change-transition`, `cli:change-create`, `cli:change-verification`), with low-severity test gaps noted for two.
- Partially compliant: **5** (`cli:change-invalidate`, `cli:change-approve`, `cli:change-edit`, `skills:workflow-automation`, `skills:skill-templates-source`).
- Findings: **7 total** — **1 high**, **4 medium**, **2 low**.
- Confirmed product/protocol defects: **5** (findings 01–05).
- Test-only gaps: **2** (findings 06–07), plus missing regression coverage attached to the confirmed defects.
- Test execution: **996 passing** across CLI and skills; no failing suite, demonstrating that the present tests do not detect the listed contract gaps.
