# Spec compliance — versioned-approval-invalidation

Mode: delegated (full verify attempt verification-attempt-1). Verification start and complete were not run by this audit.

Automated scenario suites during verify: @specd/core 2697 passed, @specd/cli 935 passed, @specd/skills 59 passed, @specd/code-graph 713 passed.

Slice verdicts: core-domain ISSUES, core-usecases ISSUES, cli ISSUES, skills CONFORMANT.

## Detailed findings

### core-domain

# Partial compliance: core domain (versioned-approval-invalidation)

Delegated audit. No `changes verification start` or `complete`. Graph `stale: false` with `CONTENT_DIRTY` / `CONTENT_KNOWN_STALE` on core; index was not rewritten. Spec text is merged `changes spec-preview` for `versioned-approval-invalidation`. Design contract is `specd-sdd/changes/20260920-171638-versioned-approval-invalidation/design.md`.

Scope is this change’s behavior: v1/v2 manifests, no read-time migration write, structured invalidation, fingerprints, `verification.current`, recovery priority, `hasTasks` exclusion. Unrelated identity, archive-history, and schema-YAML groups were not re-litigated scenario by scenario.

## core:change

### Requirements summary

v2 `Change` owns materialized spec-approval, sign-off, and verification projections. History stays append-only audit. Structured `invalidation` has independent `artifacts` and `workflow` dimensions. `hasTasks` artifacts stay out of fingerprints and automatic drift. Explicit start/complete verification is state-independent and does not itself move lifecycle. Gate recovery is owned by the reconciler: required spec consent returns to `designing`, required sign-off returns a later state to `done`, workflow `preserve` does not waive drift, and verification staleness does not force a rollback.

### Implementation status (pass/partial/fail per scenario group)

| Group                                                                           | Status |
| ------------------------------------------------------------------------------- | ------ |
| Materialized projections and renewal does not heal `stale`/`revoked`            | pass   |
| State-independent start/complete; no test execution; no `verifying → verifying` | pass   |
| Policy-aware `invalidate` (no gate recovery inside the aggregate)               | pass   |
| Fingerprint scope (`text-v1`, empty map vs null legacy, `hasTasks` exclusion)   | pass   |
| Task completion only when `hasTasks`                                            | pass   |
| Spec approval / sign-off gates (ready / done only; disabled gate skips)         | pass   |
| “Spec added after creation” always appends `transitioned` back to `designing`   | fail   |

### Discrepancies (spec vs code AND design.md vs code)

1. **Scope edit does not unconditionally roll back to `designing`.** Verify scenario “Spec added after creation” still requires an `invalidated` event with `cause: 'spec-change'` and a `transitioned` event to `designing`. `Change.updateSpecIds` (`packages/core/src/domain/entities/change.ts` around 1594) only calls `replaceSpecIds` plus `invalidate`; it does not append `transitioned`. Production `EditChange` with a reconciler (`edit-change.ts` `_executeScopeEdit`) uses `replaceSpecIds` and `ctx.reconcileAfter({ type: 'scope-change' })`, so recovery follows policy. **The older scenario is likely stale.** The newer “Policy-aware invalidation” requirement and design.md (reconciler owns recovery; `workflow: preserve` may retain phase) match the code. If the scenario is still binding, the code is wrong.

2. **`StartVerificationDeps` includes `schemaProvider`.** Design.md interface (around the verification use-case contracts) lists `changes`, `actor`, `reconcileChangeValidity`, `refreshImplementationTracking`, `fingerprint`, and `implementationChecks` only. Code (`packages/core/src/application/use-cases/start-verification.ts` lines 37–45) adds `schemaProvider: SchemaProvider`, with a comment that the check context cannot be built without the active schema. **Design is incomplete; the extra port is justified.** The merged spec only requires tracking, checks, fingerprint, actor, and persistence, and does not forbid the extra dependency. `packages/core/test/composition/use-cases/verification-factories.spec.ts` expects `schemaProvider` from the resolver.

### Test coverage

- `packages/core/test/domain/services/change-validity.spec.ts` covers spec-approval recovery beating `workflow: preserve`, redesign recovery, and no move when already in `designing`.
- `packages/core/test/application/services/validity-fingerprint-service.spec.ts` covers `hasTasks` exclusion by marker, including a non-`tasks.md` filename.
- `packages/core/test/application/use-cases/start-verification.spec.ts` covers readiness failure before baseline.
- Missing: a direct entity test that adding a spec id does **not** append `transitioned` under `workflow: preserve`, which would retire the stale scenario. The class comment on `EditChange` still says scope edits go through `updateSpecIds`, which is only the no-reconciler fallback.

### Summary counts: requirements checked, discrepancies, missing tests

Change-relevant groups checked: 7. Discrepancies: 2 (1 stale scenario, 1 design omission). Missing tests: 1 (preserve-policy scope edit vs the old rollback scenario).

## core:change-manifest

### Requirements summary

New writes are `manifestVersion: 2` with structured `invalidation`, optional `specApproval` / `signoff` / `verification`, and fingerprint algorithm maps. Missing version is v1, adapted in memory. Future versions fail closed. Plain reads do not rewrite v1. Fingerprint equality includes the full key set. Attempt events do not store source bytes.

### Implementation status (pass/partial/fail per scenario group)

| Group                                                             | Status                         |
| ----------------------------------------------------------------- | ------------------------------ |
| Native v2 round-trip; `invalidation` not `invalidationPolicy`     | pass                           |
| Missing version adapts as v1; version other than exact `2` throws | pass                           |
| No eager v1 rewrite on read; next mutation writes v2              | pass                           |
| Fingerprint key order and algorithm ids                           | pass                           |
| Atomic temp-file rename                                           | pass (pre-existing write path) |

### Discrepancies (spec vs code AND design.md vs code)

None that contradict the merged manifest requirements or design.md’s parse rules. `parseChangeManifest` (`packages/core/src/infrastructure/fs/manifest.ts` 815–838) treats a missing `manifestVersion` as v1 and any present value other than `2` as `UnsupportedManifestVersionError`. Serialize (`change-repository.ts` `toManifest` around 1669) always emits `manifestVersion: 2` and `invalidation`, never `invalidationPolicy`. Design.md’s “v2 writes never emit `invalidationPolicy`” matches.

### Test coverage

`packages/core/test/infrastructure/fs/change-repository.spec.ts` (“writes manifestVersion 2 on create and does not rewrite v1 on get”) and `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts` cover version discrimination and v1 adaptation. Event payload byte-absence is structural (no content field on the zod event schemas) rather than a dedicated “must not serialize source” assertion.

### Summary counts: requirements checked, discrepancies, missing tests

Groups checked: 5. Discrepancies: 0. Missing tests: 0 blocking; event byte-exclusion is implicit.

## core:change-repository-port

### Requirements summary

`get` hydrates and may expose fresh file facts, but must not choose validity, append recovery, or rewrite a manifest only to migrate v1. Unsupported versions fail before hydration. `mutate` is the serialized write window. A failed later transition must not roll back an already committed recovery.

### Implementation status (pass/partial/fail per scenario group)

| Group                                                         | Status                                       |
| ------------------------------------------------------------- | -------------------------------------------- |
| `get` / `_getInternal` load without write                     | pass                                         |
| v1 read does not upgrade on disk                              | pass                                         |
| Future version rejected                                       | pass                                         |
| Older “get MAY auto-invalidate and persist” clause            | fail (spec text vs code)                     |
| Reconciler mutation commits recovery before a later operation | pass (application owner, not the repository) |

### Discrepancies (spec vs code AND design.md vs code)

**The port spec contradicts itself.** “Hydration reports fresh file facts without deciding validity” says a plain read, including v1 and archive inspection, must not rewrite the manifest. The older “get returns a Change” requirement and the Constraints section still say `get()` may auto-invalidate and persist drift under the change lock. Code follows the newer requirement and design.md (“Do not rewrite … v1 active manifests merely because they are read”): `FsChangeRepository.get` delegates to `_getInternal`, whose comment and body load and return without `_writeManifestAtomic` (`change-repository.ts` 425–445). **The older clauses are stale; the code is right relative to design and the hydration requirement.**

### Test coverage

Repository spec asserts v1 `get` does not rewrite and that a later mutation upgrades to v2. No test still expects hydration-time `change.invalidate`.

### Summary counts: requirements checked, discrepancies, missing tests

Groups checked: 5. Discrepancies: 1 (internal spec drift). Missing tests: 0 for the no-write rule.

## core:config

### Requirements summary

`invalidation.artifacts` is `none | surgical | downstream | global`. `invalidation.workflow` is `preserve | redesign`. Omitted config for a new change is `{ artifacts: downstream, workflow: preserve }`. Legacy `invalidationPolicy` maps to `{ artifacts: <scalar>, workflow: redesign }`. Both keys together fail as ambiguous. Workflow policy must not waive freshness or override gate recovery.

### Implementation status (pass/partial/fail per scenario group)

| Group                                    | Status                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Structured schema and strict object      | pass                                                                   |
| Default `downstream` + `preserve`        | pass                                                                   |
| Legacy scalar → `workflow: redesign`     | pass                                                                   |
| Both keys rejected                       | pass                                                                   |
| Workflow does not override gate recovery | pass (enforced in `selectAutomaticRecovery`, not in the config parser) |

### Discrepancies (spec vs code AND design.md vs code)

None. `config-schema.ts` superRefine rejects both shapes. `resolveConfiguredInvalidation` in `config-loader.ts` prefers native `invalidation`, then `fromLegacyInvalidationPolicy`, else `DEFAULT_INVALIDATION_POLICY` (`invalidation-policy.ts` lines 35–44 and 119–128). v1 manifests still adapt a missing scalar through `LEGACY_DEFAULT_INVALIDATION_POLICY` (`workflow: redesign`), which matches the manifest spec, not the new-change default.

### Test coverage

Policy resolution is covered indirectly by config parsing and `change-validity` recovery tests. A single config-loader test that both keys fail and that absence yields `preserve` was not re-read here; the implementation is direct.

### Summary counts: requirements checked, discrepancies, missing tests

Groups checked: 5. Discrepancies: 0. Missing tests: 0 blocking.

## core:schema-format

### Requirements summary

`hasTasks` defaults to false and is the master switch for task capability. `hasTasks: true` means the whole artifact is operational task state, identified by the marker rather than id or filename. Those artifacts are excluded from approval and verification fingerprints, automatic drift, and parent-originated review propagation, and remain subject to presence, structure, live task counts, and archive.

### Implementation status (pass/partial/fail per scenario group)

| Group                                                                           | Status                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `hasTasks` default false; `requiresTaskCompletion` must reference `hasTasks`    | pass                                             |
| Fingerprint collector skips `type.hasTasks`                                     | pass                                             |
| Reconcile / invalidate / approve paths collect task ids via `artifact.hasTasks` | pass                                             |
| `preHashCleanup` still documents checkbox normalization                         | pass (orthogonal; applies to non-task artifacts) |

### Discrepancies (spec vs code AND design.md vs code)

None against design.md’s rule “Do not make `hasTasks` depend on artifact IDs or filenames.” Exclusion is `if (type.hasTasks) continue` in `validity-fingerprint-service.ts` `_collectArtifacts`, and the same marker in `reconcile-change-validity.ts`, `invalidate-change.ts`, `approve-spec.ts`, and `approve-signoff.ts`.

### Test coverage

`validity-fingerprint-service.spec.ts` asserts a `hasTasks` artifact named `checklist.md` is omitted. Schema build still rejects `requiresTaskCompletion` without `hasTasks` (`build-schema.ts`).

### Summary counts: requirements checked, discrepancies, missing tests

Groups checked: 4. Discrepancies: 0. Missing tests: 0 for the marker rule.

## core:transition-checks

### Requirements summary

One pure verdict and one reconciler. Recovery order is spec consent, then sign-off, then workflow policy; stale verification does not move lifecycle and does not block entry to `verifying`. `verification.current` is bound to `verifying → done`, consumes the verdict, and skips only when verification is not required. `impl.filesResolved` and `impl.linksInScope` run for every transition into `verifying` and again inside explicit verification start. `GetStatus` delegates to the reconciler even when `ifModifiedSince` matches.

### Implementation status (pass/partial/fail per scenario group)

| Group                                                         | Status         |
| ------------------------------------------------------------- | -------------- |
| `selectAutomaticRecovery` priority and no forward move        | pass           |
| Verification staleness is not a recovery cause                | pass           |
| `verification.current` bound `verifying → done` (and archive) | pass           |
| Check skips when verdict is `not-required`                    | pass           |
| Check skips when `ctx.validity` is missing                    | fail vs design |
| `impl.*` on every transition whose target is `verifying`      | fail           |
| `GetStatus` always reconciles                                 | partial        |
| Status `validity` shape vs design `ValidityStatusProjection`  | fail vs design |

### Discrepancies (spec vs code AND design.md vs code)

1. **`verification.current` skips when validity is undefined.** Design.md: skip only when the shared verdict says verification is not required. Code (`packages/core/src/domain/checks/verification-current.ts` lines 27–29) skips when `validity === undefined` **or** `verification === 'not-required'`. `CheckExecutionContext.validity` is optional (`transition-checks.ts`). The application check only forwards `ctx.validity`. **Code is looser than design.** A `verifying → done` attempt that forgets to attach the verdict is allowed instead of failing closed. The merged spec’s “missing, stale, legacy-unknown, mismatched, and unresolved inputs” refers to evidence, but an absent verdict is unresolved input; failing would match that wording better. **Tests currently encode the skip** (`verification-current.spec.ts`: `run()` with no verdict expects `skip`), so the tests and design disagree. Spec or tests may need to adopt the design rule; the implementation should not stay skipped if the design rule stands.

2. **Implementation readiness is not bound to every entry into `verifying`.** Spec and design.md say entering `verifying` runs `impl.filesResolved` and `impl.linksInScope`. Bindings (`check-bindings.ts` 55–62) are only `{ from: 'implementing', to: '*', along: 'forward' }`. `VALID_TRANSITIONS` also allows `done`, `signed-off`, and `archivable` → `verifying` (`change-state.ts` 39–42), which are backward hops and do not match that binding. Explicit `StartVerification` still runs those checks before a baseline, which is a different operation. **Code is wrong relative to spec and design** for lifecycle entry from states other than `implementing`. The spec sentence is not an old leftover: it is in the merged “Registry bindings for this capability” requirement.

3. **`GetStatusResult.validity` is `ChangeValidityVerdict`, not design.md’s `ValidityStatusProjection`.** `get-status.ts` lines 281–282. The domain verdict has flat `specApproval` / `signoff` / `verification` strings, `blockers`, and `recovery`. Design’s projection nests `required`, `decision`, `invalidation`, `activeAttempt`, `completed`, and `freshness`. Those facts still exist on the `Change` aggregate and on `nextAction`, but they are not the status DTO design specified. **Design and code diverged; the spec never names `ValidityStatusProjection`.** The merged transition-checks text also says the verdict reports task completion and recommended next action. Design’s verdict interface does not include those fields, and `ChangeValidityVerdict` does not either. Task completion stays on `workflow.taskCompletion`. **That spec sentence is broader than both design and code; design/code are aligned with each other on task completion living outside the verdict.**

4. **Reconcile is optional on `GetStatus`.** Composed `resolveGetStatusDeps` always passes `resolver.getReconcileChangeValidity()`, and when `_reconcile` is set, `execute` reconciles before the `ifModifiedSince` shortcut (`get-status.ts` 351–363), matching design. `GetStatusDeps.reconcile` is optional, and a deps caller that omits it still uses the mtime shortcut and returns no `validity`. **Production wiring matches the spec; the public deps contract does not force it.** Same pattern on `EditChange`: scope edits without a reconciler still call `updateSpecIds`.

5. **Verdict blocker command is a placeholder.** `buildBlockers` (`change-validity.ts` around 525–530) sets `command: 'specd changes verification start <name>'`. The check itself interpolates `facts.name`. Status surfaces that copy verdict blockers will not show the real change name. **Code is slightly wrong** against “actionable” failure details. The check path is fine.

`verification.current` on archive (`ARCHIVE_BINDING_SPECS`) matches the spec’s archive freshness checks. Stale details on the check come from `projectionChanges` filtered to `verification`. An already-stale projection produces an empty diff list on a later idempotent verdict, so legacy-unknown differences appear only on the transition that first marks it stale.

### Test coverage

- `verification-current.spec.ts` covers pass / skip-not-required / absent / in-progress / stale command, and **asserts the undefined-verdict skip**.
- `change-validity.spec.ts` covers recovery priority.
- No test found that `done → verifying` runs `impl.filesResolved` or `impl.linksInScope`.
- No test that `GetStatusResult.validity` matches `ValidityStatusProjection` (it cannot; the type does not exist).

### Summary counts: requirements checked, discrepancies, missing tests

Groups checked: 8. Discrepancies: 5. Missing tests: 2 (non-`implementing` entry to `verifying`; status DTO vs design projection).

## Known spots

1. **`StartVerificationDeps.schemaProvider`** — present beyond design.md. Design omission; implementation needs the schema to build the check context. Not a spec violation.
2. **`verification-current` skip** — skips when validity is `undefined` or `not-required`. Design allows only the `not-required` branch. Tests lock the extra skip.
3. **`GetStatusResult.validity`** — typed as `ChangeValidityVerdict`, not design.md’s `ValidityStatusProjection`.

ISSUES

### core-usecases

# Partial audit: core use cases — versioned-approval-invalidation

Mode: delegated. Verification start/complete were not run.
Graph: `graph stats` reported `CONTENT_KNOWN_STALE` (lastIndexedAt 2026-09-22T21:43:34.445Z). Index was not rebuilt. Symbols were located with `graph search` / `graph impact`, then confirmed by reading the cited source. Line numbers below are from those reads.

Design contract: `specd-sdd/changes/20260920-171638-versioned-approval-invalidation/design.md`.
Verify text: `changes spec-preview versioned-approval-invalidation <specId> --artifact verify --format text`.

Cross-cutting design checks (used by every spec below):

| Contract                                                                     | Result                                                                                | Evidence                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReconcileChangeValidity` is the configured mutation coordinator             | Config factories inject `resolver.getReconcileChangeValidity()`                       | `packages/core/src/composition/use-cases/{get-status,transition-change,archive-change,validate-artifacts,edit-change,invalidate-change}.ts`                                                                     |
| Residual bypass when the optional reconciler is omitted                      | Transition and validate still call `Change.invalidate`                                | `transition-change.ts` 310–326; `validate-artifacts.ts` 742–757                                                                                                                                                 |
| Recovery priority and no self-transition                                     | Matches design                                                                        | `change-validity.ts` `selectAutomaticRecovery` 180–200, `isAfter` 575–577; `change.ts` `transition` 909–913 rejects `from === to`; `persistConsequences` 618–624                                                |
| Verification start/complete/invalidate                                       | Mostly matches; see `core:invalidate-verification` and design notes                   | `start-verification.ts`, `complete-verification.ts`, `invalidate-verification.ts`                                                                                                                               |
| Status writes only when facts change; v1 read without drift does not rewrite | Repository stamp matches; status always enters `mutate` when a reconciler is injected | `change-repository.ts` `mutate` 375–378, `changeMutationStamp` 2034–2036; test `change-repository.spec.ts` 2824                                                                                                 |
| Archive does not complete verification                                       | No `completeVerification` / `startVerification` in archive                            | `archive-change.ts` depends on `ReconcileChangeValidity` only (`graph impact --file core:src/application/use-cases/archive-change.ts`); `graph impact --symbol CompleteVerification` dependents exclude archive |
| `GetStatusResult` vs `ValidityStatusProjection`                              | Shape missing                                                                         | `get-status.ts` 257–283 has `validity?: ChangeValidityVerdict`. Graph search for `ValidityStatusProjection` has no such symbol                                                                                  |

---

## core:create-change

### Requirements summary

Previewed requirements: name uniqueness, actor resolution, single `created` event, construction, `specDependsOn` seeding, input contract, active schema resolution, optional overlap check, initial invalidation policy, persistence/scaffolding, dependencies, config factory.

Delta requirements for this change: complete structured policy input; partial schema pair still invalid; explicit policy wins over `{ downstream, preserve }`; later policy edits do not rewrite creation history.

### Implementation status

`CreateChangeInput.invalidation` is an optional structured `InvalidationPolicy`. Omission persists `DEFAULT_INVALIDATION_POLICY` (`{ artifacts: 'downstream', workflow: 'preserve' }`). The use case does not parse a legacy scalar. Creation does not call the reconciler (no projections exist yet).

Evidence: `packages/core/src/application/use-cases/create-change.ts` lines 41–45 and 149.

### Discrepancies

None found in the delta requirements. Pre-existing uniqueness, seeding, overlap, and factory scenarios were not re-executed.

### Test coverage

Design names `create-change.spec.ts`. This pass did not re-read every assertion. Default policy persistence is also asserted on create in `packages/core/test/infrastructure/fs/change-repository.spec.ts` (`manifestVersion: 2`, `{ downstream, preserve }`) around line 2833.

### Summary counts

- Requirements reviewed (delta): 2
- Implementation matches delta: 2
- Discrepancies: 0
- Test gaps noted: 0 for the delta (full legacy suite not re-counted)

---

## core:edit-change

### Requirements summary

Previewed requirements include lookup, no-op edits, description vs invalidation, removal-before-addition, seeding, directory cleanup, tracking refresh, policy edits, output contract, dependencies, factory.

Delta: scope change reconciles atomically and required stale spec consent returns to design while ungated preserve retains state; unaffected evidence stays valid; policy-only edit invents no drift; repeating the same policy is a no-op; result separates edits from invalidation and reports committed recovery.

### Implementation status

Scope edits require a reconciler and run inside `ReconcileChangeValidity.mutate`, then `reconcileAfter({ type: 'scope-change' })`. Config resolution always supplies the shared reconciler. Policy resolution is structured.

Evidence: `packages/core/src/application/use-cases/edit-change.ts` 230–264; `packages/core/src/composition/use-cases/edit-change.ts`.

### Discrepancies

1. **Scope change always stales valid spec approval, even when the fingerprinted input set is unchanged.**
   - Spec scenario “Unaffected evidence remains valid”: a scope change that does not alter a projection’s fingerprinted input set leaves that projection unchanged.
   - Design compares each valid projection to its own baseline; stale is caused by a changed or unprovable reviewed input.
   - `applyIntent` treats every `scope-change` as `pushStaleGate(..., 'spec', 'scope-change')`, and `pushStaleGate` marks any `valid` spec projection stale with empty differences.
   - Evidence: `packages/core/src/application/use-cases/reconcile-change-validity.ts` 430–432 and 504–515; caller `edit-change.ts` 263.
   - Either the spec/design should say every spec-id edit withdraws spec consent, or the reconciler should stale spec approval only when the artifact fingerprint actually changes. Sign-off and verification are not blindly staled by this intent.

### Test coverage

`edit-change.spec.ts` is the named suite. No test was found in this pass that asserts a scope edit with an unchanged fingerprint leaves spec approval `valid`. Recovery and policy scenarios need that assertion to lock the scenario above.

### Summary counts

- Delta requirements: 4
- Matching: 3
- Discrepancies: 1
- Missing/insufficient tests: 1 (unaffected fingerprint)

---

## core:invalidate-change

### Requirements summary

Independent override dimensions; invalid values rejected before mutation; execution override is not persisted; workflow override does not change target rules; downstream requires a target and global forbids one; invalid targets report every problem; force only for current consent; forced revocation is atomic; gate priority over `preserve`; ungated preserve keeps state; cause `artifact-review-required`; downstream expansion; `hasDrift` unchanged; idempotent reopen; result reports canonical effects; DAG order; factory.

### Implementation status

`InvalidateChange` resolves a structured overlay, validates targets, and delegates mutation to `reconcile.execute` with `manual-invalidation`. Force passes `revoke` only for projections whose status is `valid`. Config factory requires the reconciler (not optional). Manual cause in `artifactCause` is `artifact-review-required`.

Evidence: `invalidate-change.ts` 100–151 and `consentToRevoke` 257–261; `reconcile-change-validity.ts` `artifactCause` 656–663.

### Discrepancies

1. **Force guard is any valid consent, and the failure does not report recovery targets.**
   - Spec: when the request affects valid approval and force is absent, no mutation occurs and affected gates and recovery targets are reported. Already-stale evidence does not trip the guard (implemented: only `status === 'valid'`).
   - Design affected-area line: guard only valid consent affected by the request.
   - `consentToRevoke` returns every valid spec and sign-off gate, with no comparison to targets or fingerprints. The throw happens before `reconcile.execute`, so recovery is not computed.
   - `InvalidateRequiresForceError` exposes `gates` and a fixed message that always says return to `designing` (`invalidate-requires-force-error.ts` 20–22). A sign-off-only case whose recovery is `done` is not described.
   - Evidence: `invalidate-change.ts` 113–116, 257–261.

2. **Possible spec/design split, not a second code bug:** repeating an already-open invalidation is idempotent inside the reconciler (`markApprovalInvalid` / `needsArtifactReview`). The force-absent path never reaches that idempotent success result; it throws instead. The “output reflects idempotent repetition” scenario is therefore only reachable when force is set or no valid consent remains.

### Test coverage

Named suite: `invalidate-change.spec.ts`. This pass did not find an assertion that an unaffected valid gate is left alone, or that the force error carries a recovery target other than the hardcoded designing sentence.

### Summary counts

- Delta requirements checked: 8
- Matching: 6
- Discrepancies: 2
- Test gaps: 2 (affected-only guard, recovery target on the force error)

---

## core:validate-artifacts

### Requirements summary

Large pre-existing validation surface (required artifacts, dependency order, traversal, complete/skipped bypass, per-file paths, delta eligibility, metadata, factory, DAG via `evaluateLifecycleVerdict`, `ChangeNotFoundError`).

Delta: validation cannot erase detected drift and does not renew projections; `preserve` allows in-place validation but not forward progress while review is pending; task content does not invalidate approvals or propagate review; non-task drift follows artifact policy and gate/workflow priority.

### Implementation status

When a reconciler is present, persistence goes through `reconcile.mutate`. The callback only `markComplete`s and `setSpecDependsOn`. It does not call `Change.invalidate` or record approval. Drift/recovery is the pre-pass inside `mutate`. Task exclusion is in `collectReviewTargets` (`taskArtifacts.has` skip).

Evidence: `validate-artifacts.ts` 727–741; `reconcile-change-validity.ts` 272–273.

### Discrepancies

1. **Optional reconciler still invalidates outside the coordinator.** If `reconcile` is omitted, the same persistence step calls `freshChange.invalidate` directly (`validate-artifacts.ts` 742–757). Config `resolveValidateArtifactsDeps` always injects the shared reconciler. Direct construction can still bypass the design invariant. Same pattern as transition.

No delta-logic bug found on the injected path. Pre-existing path/delta/metadata scenarios were not re-audited line by line.

### Test coverage

Named suite: `validate-artifacts.spec.ts`. Design asks for pre/post reconciliation and the task exception. This pass did not re-open that file; coverage of “validation does not renew” should be confirmed there. The legacy `invalidate` branch is still compilable, so a test that omits the reconciler would not prove the design invariant.

### Summary counts

- Delta requirements: 4
- Matching on the injected path: 4
- Discrepancies: 1 (optional bypass)
- Test gaps: 1 (bypass path vs sole-coordinator invariant)

---

## core:approve-spec

### Requirements summary

Gate disabled before repository access; missing change; task artifacts excluded from the consent fingerprint; missing/pending non-task blocks approval; renewal only in `ready` with no deleted history; pre-approval drift persists recovery and does not record consent; approval and fingerprint share one mutation; ineligible approval commits only reconciliation; input is name and reason; factory equivalence; no kernel bootstrap.

Conflicting legacy scenario still in the preview: enabled gate with the change in `pending-spec-approval` transitions to `spec-approved`. Schema mismatch is thrown before `mutate`.

### Implementation status

Disabled gate throws `ApprovalGateDisabledError` before `get`. Schema mismatch is checked after `get` and before `mutate`. Recording uses `reconcile.mutate`, `artifactFingerprint`, and `recordSpecApproval` with the same actor. `hasTasks` files are skipped in `blockingArtifact`. Drift uses `ctx.before.artifactReviewRequired` and does not record consent.

Evidence: `approve-spec.ts` 75–123 and 135–160.

### Discrepancies

1. **Design says approval only in `ready` and does not move state. Code still drains `pending-spec-approval` to `spec-approved`.**
   - Design “Approval flows”: require the committed state to be exactly `ready`; do not move state.
   - Newer scenario “Approval is renewed only in ready” routes stale implementing consent through designing and ready and says no pending state is produced.
   - Older scenario “Enabled gate allows execute…” still requires `pending-spec-approval` → `spec-approved`.
   - Code allows both states and calls `transition('spec-approved')` (`approve-spec.ts` 93–107). Comment documents the historic drain.
   - The verify artifact contradicts the design. Implementation follows the leftover scenario and violates the design sentence. Spec author should delete one of the two scenarios.

### Test coverage

`approve-spec.spec.ts` still has “given … pending-spec-approval (drain)” around line 192, so the legacy transition is tested. A test that forbids that transition would fail today. Task exclusion and drift-before-approval were not re-read in this pass.

### Summary counts

- Requirements in conflict: 2 scenarios, 1 design rule
- Implementation matches design: no
- Implementation matches both verify scenarios: yes (both behaviors exist)
- Discrepancies: 1
- Test gaps: the suite locks the behavior the design rejects

---

## core:approve-signoff

### Requirements summary

Gate guard; lookup; whole linked files once, lexical, unreadable fails; empty implementation map is valid and distinct from legacy `null`; sign-off requires current completed verification and recommends in-place renewal when stale; success stays in `done`; reconciliation blocks a changed snapshot; fingerprint is the one from the same mutation; failed eligibility adds no sign-off event; input is name and reason; factory reuses tracking and reconciler.

Legacy scenario still present: `pending-signoff` transitions to `signed-off`.

### Implementation status

Disabled gate throws before repository access. Tracking refresh runs, then `reconcile.mutate`. Eligible path records `recordSignoff` with `completed.id` and the fresh complete fingerprint. State stays `done` unless it was `pending-signoff`, which is transitioned to `signed-off`.

Evidence: `approve-signoff.ts` 85–133.

### Discrepancies

1. **Stale or legacy-null completed verification is reported as missing evidence.**
   - Spec: change is `done`, completed verification is stale → no sign-off, recommend in-place renewal.
   - Design: legacy `implementation: null` cannot authorize sign-off; current completed verification is required; do not approve a later snapshot.
   - Code treats `completed === undefined`, `status !== 'valid'`, and `implementation === null` as one outcome and throws `VerificationNotFoundError` (`approve-signoff.ts` 107–110, 140–141).
   - Stale evidence exists. The error says it was not found. No next-action / in-place renewal payload is returned. `VerificationFingerprintMismatchError` is only for a valid concrete fingerprint that differs.

2. **Design “exactly `done`, do not move state” vs historic `pending-signoff` → `signed-off`.**
   - Same split as spec approval. Code 104–133. Verify preview still contains the pending-signoff scenario. Design forbids the move.

Archive and transition do not call this use case to invent verification. Sign-off itself does not call `CompleteVerification`.

### Test coverage

`approve-signoff.spec.ts` had no matches for `stale`, `in-place`, or `VerificationNotFoundError` in this pass. The stale-recommends-renewal scenario looks untested. The pending-signoff drain is likely still tested by analogy with approve-spec; not re-opened here.

### Summary counts

- Delta requirements: 6
- Matching: 4
- Discrepancies: 2
- Test gaps: 1 confirmed (stale sign-off renewal), 1 likely (design ban on pending drain)

---

## core:transition-change

### Requirements summary

Change must exist; refresh default and opt-out; no direct detector; stale approval returns to design instead of a pending hop; valid consent allows normal edges; sign-off check needs current verification; disabled sign-off skips; parked approval failures; task completion; committed recovery survives a failed request and is not rolled back; workflow requires; verifying→implementing does not clear validated artifacts; entering verifying does not create an attempt; exit reruns `verification.current` after hooks; backward movement preserves matching verification; explicit redesign is policy-focused; hooks, persistence, input, factory, historic drain precedence. Truncated tail of the preview was not fully listed; the delta scenarios above were read.

### Implementation status

With a reconciler: refresh flag is forwarded, `reconcile.execute` runs first, a state change throws `InvalidStateTransitionError` and does not continue the requested hop. After before-persist effects, reconcile runs again and predicates are rerun. Entering verifying is an ordinary `transition` inside the final `mutate`; this file does not call `startVerification` or `completeVerification`. `graph impact` on class `CompleteVerification` does not list `transition-change.ts`.

Evidence: `transition-change.ts` 173–184, 278–307, 310–327.

Recovery selection itself is in `selectAutomaticRecovery` (see cross-cutting table). `verifying → verifying` is still a self-transition rejected by `Change.transition`.

### Discrepancies

1. **Committed recovery failure does not carry blockers or next action.**
   - Spec: “Committed recovery survives failed requested transition” — fail with the committed state, blockers, and next action, and do not undo recovery.
   - Recovery is committed by the first `execute` (not rolled back). The throw is `new InvalidStateTransitionError(change.state, requested)` with no `reason`, blockers, or next action (`transition-change.ts` 182–184 and again 282–284).
   - `InvalidStateTransitionError` (`invalid-state-transition-error.ts` 36–58) has only from, to, and an optional `TransitionFailureReason`. It cannot hold blockers or next action.
   - The committed state is the `from` argument, so the message reads as “Cannot transition from 'designing' to '<requested>'”, which is easy to misread as a protocol failure rather than a completed recovery.

2. **Post-hook reconciliation does not refresh implementation tracking.**
   - Design: reconcile again because hooks may modify files or links.
   - Second call is `execute({ name })` (`transition-change.ts` 279). `_refresh` runs only when `refreshImplementationTracking === true` (`reconcile-change-validity.ts` 166–168). Already-linked file bytes are re-read; newly discovered links are not refreshed.

3. **Optional reconciler still broad-invalidates on the way to designing.**
   - `transition-change.ts` 310–326 calls `freshChange.invalidate` for every artifact when `this._reconcile === undefined`. Design says callers must not invalidate outside the coordinator and must remove unconditional invalidate on transition to designing. Config factory always injects the reconciler (`composition/use-cases/transition-change.ts`).

### Test coverage

`transition-change.spec.ts` still covers pending-spec-approval drain (around 498). A search for “committed recovery” / “does not undo” did not show a dedicated test name. `change-validity.spec.ts` covers priority and no forward/self recovery at the pure function (lines 97–217). The use-case error payload (blockers, next action) is not covered by the error type.

### Summary counts

- Delta requirements checked: 8
- Matching: 5
- Discrepancies: 3
- Test gaps: 2 (recovery error payload, post-hook link refresh)

---

## core:get-status

### Requirements summary

Artifact/effective/file state, review summary, blockers, `specDependsOn`, revision shortcut, draft read-only, implementation projection, refresh flag, active status persists recovery once, display status, task counts, predicate rows, not-found, lifecycle routing for preserve vs redesign, schema failure stays read-only, blocker merge rules, attempt vs completed evidence, in-place verification recommendation, factory resolves one reconciler, draft composition does not reconcile.

Design status projection (authoritative for this change):

```ts
ValidityStatusProjection {
  specApproval: ApprovalStatusProjection
  signoff: ApprovalStatusProjection
  verification: VerificationStatusProjection
  automaticReturn: AutomaticRecovery | null
}
```

`ApprovalStatusProjection` includes required, status, optional decision and invalidation. `VerificationStatusProjection` includes `requiredAtCurrentBoundary`, optional `activeAttempt` and `completed`, and `freshness`.

Also: active status always reconciles, including when `ifModifiedSince` matches; may write only when facts change; v1 read without drift must not rewrite the file.

### Implementation status

`GetStatusResult` (`get-status.ts` 257–283) adds optional `validity?: ChangeValidityVerdict`. It does not add `ValidityStatusProjection`. Decision, invalidation, attempt, and completed records are only on `result.change`.

When `reconcile` is injected, `execute` always calls it and never takes the `ifModifiedSince` early return (351–356). `refreshImplementationTracking: false` is passed through; the reconciler skips refresh and still evaluates. Drafts return before that branch. Schema resolution failure after reconcile returns a result that omits `validity` (462–470).

Write suppression: `ChangeRepository.mutate` persists only when `changeMutationStamp` changes. The stamp is `JSON.stringify(changeToManifest(change))`, which is v2-shaped, but an unchanged stamp skips `_persistManifest`. A v1 `get` is tested not to rewrite (`change-repository.spec.ts` 2824–2843). A no-op reconcile sets `changed: false` (`reconcile-change-validity.spec.ts` 126–131). Together this implements “v1 read without drift must not rewrite” and “write only when facts change”, as long as the callback does not touch stamped fields.

`verificationField` (`change-validity.ts` 453–465) returns a single enum. If completed evidence is stale, the result is `'stale'` even when an active attempt also exists. The attempt is still on the aggregate and is not marked completed.

### Discrepancies

1. **`GetStatusResult` is not `ValidityStatusProjection`.**
   - Missing `required`, `decision`, `invalidation` on each gate; missing `requiredAtCurrentBoundary`, separate attempt and completed objects, and `freshness` beside them; `automaticReturn` is `verdict.recovery`, not a sibling of those projections.
   - Evidence: design.md “Status projection”; `get-status.ts` 257–283; no symbol `ValidityStatusProjection`.
   - Spec scenario “Attempt and completed evidence are distinct” can be satisfied by reading `result.change.verification` plus a stubbed verdict. The test does that with a fake reconciler (`get-status.spec.ts` 1168–1203) and does not build the designed projection. A consumer of `result.validity` alone cannot show both records.
   - `verificationField` hides an in-progress attempt whenever completed evidence is already stale (453–461). The spec asks for both records and their freshness separately.

2. **`ifModifiedSince` tests still describe the no-reconciler path.**
   - Implementation with a reconciler ignores the timestamp shortcut, which matches “Matching manifest timestamp does not hide external drift”.
   - `get-status.spec.ts` 914–975 expects an early unchanged result and those cases do not inject a reconciler (the reconciler suite starts at 1132). The new scenario is implemented and not locked by those tests.
   - Refresh-disabled test (271–279) also uses the no-reconciler branch, so it does not prove “skip refresh but still reconcile”.

3. **Schema-failure result drops `validity` after reconciliation may already have written.** The public result then has no validity projection (`get-status.ts` 415–470). Spec asks for a read-only schema-failure view and not to enable a further lifecycle mutation. The omitted field is a projection gap, not a second write.

### Test coverage

Present: stubbed attempt vs completed, stale verification in an earlier phase, committed spec recovery, draft does not reconcile (`get-status.spec.ts` 1132–1281). Present elsewhere: v1 `get` does not rewrite; fresh reconcile `changed: false`.

Missing: real (non-stub) status projection equal to `ValidityStatusProjection`; `ifModifiedSince` plus external drift with the reconciler injected; `refreshImplementationTracking: false` still calls reconcile; status observe of a v1 manifest without drift does not rewrite (only `get` and a real mutation are tested).

### Summary counts

- Delta requirements: 6
- Matching: 3 (reconcile-before-shortcut when injected, draft skip, write suppression in the repository)
- Discrepancies: 3
- Test gaps: 4

---

## core:archive-change

### Requirements summary

Preview is large (hooks, overlap, read-only, delta merge, spec-lock, restore, implementation guards, factory). Delta scenarios read in full:

- “Archive rechecks all live blockers after hooks.”
- “Archived v2 retains audit evidence.”

Design: reconcile before preflight and again after hooks; do not call `CompleteVerification`; archive does not change validity evidence; overlapping peers go through their reconciler.

### Implementation status

`execute` reconciles first and rejects when state is no longer `archivable`/`archiving` (280–286). After prepare/hooks it reconciles again and `postHookValidityBlocksArchive` can stop archive (425–434). No call to `completeVerification` or `startVerification` in this file. Peer overlap uses `this._reconcile.execute` (around 1187–1191).

### Discrepancies

1. **Post-hook reconcile does not refresh implementation tracking** (`archive-change.ts` 426), same as transition. Live file bytes of known links are re-read; new links from hooks are not.

2. **Recovery that leaves `archivable` throws `InvalidStateTransitionError` without blockers or next action** (284–286, 429–431), same payload gap as transition. The first reconciliation is already committed.

No evidence that archive completes verification. That design rule holds.

Pre-existing archive scenarios (spec-lock, batch restore, overlap allow flag) were not re-audited in this pass.

### Test coverage

Named suite: `archive-change.spec.ts` (design also cites a recovery fixture near line 3607). This pass did not re-read those assertions. Absence of `completeVerification` in the use case is the compliance evidence for “archive does not complete verification”.

### Summary counts

- Delta requirements: 2 design rules plus 2 scenarios
- Matching: archive does not complete verification; second reconcile exists
- Discrepancies: 2 (post-hook refresh, error payload)
- Test gaps: 1 (post-hook new links; error payload)

---

## core:invalidate-verification

### Requirements summary

Result exposes stale projection, `invalidated: true`, sign-off consequence, recovery, and change. Attempt-only evidence throws `VerificationNotFoundError` without mutation. Repeat is `invalidated: false`, original cause kept, no duplicate event. Boundary stays in place, sign-off becomes stale, spec approval stays. No transition, tests, validation, approval, or new baseline. Factories match and reject mixed arguments.

### Implementation status

`InvalidateVerification.execute` loads the change, throws `VerificationNotFoundError` when `completed` is absent, and returns a no-op when status is already `stale` before calling the reconciler. Otherwise it submits `intent: { type: 'verification-invalidation' }`.

The reconciler’s `applyIntent` stales valid completed verification and a valid sign-off, and does not push spec approval (`reconcile-change-validity.ts` 423–426). `selectAutomaticRecovery` ignores verification staleness. `Change.transition` rejects a self-transition. The use case does not call start, complete, or a test runner.

`StartVerification` refreshes tracking, runs injected implementation checks, and only then `startVerification` inside `mutate`. Failure to fingerprint does not call `startVerification`. `CompleteVerification` compares with `compareValidityFingerprints` and does not run tests. Mismatch throws `VerificationFingerprintMismatchError` after the reconciler callback returns, so pre-pass drift can already be committed and the baseline is not replaced (complete is not called).

Design `StartVerificationDeps` has no `schemaProvider`. Code adds it (`start-verification.ts` 37–44) so checks can build a context. Checks use `to: change.state` (a self-edge context) at lines 113–120.

### Discrepancies

1. **Already-stale invalidation skips reconciliation.**
   - Repeat scenario is satisfied (`invalidated: false`, no second event) by returning the pre-reconcile snapshot (`invalidate-verification.ts` 76–85).
   - New artifact drift discovered at the same time is not applied. Design calls the repeat a no-op for verification invalidation, not a full observe. Spec does not require a second drift pass. Recorded as a behavior limit, not a failed scenario, unless reviewers want every invalidate call to observe.

2. **`nextAction` on a real invalidation is `/specd-verify` or null, not the start/checks/complete command.**
   - Spec: progress blocked with start/checks/complete guidance in the current state.
   - `nextFrom` (`invalidate-verification.ts` 129–143) sets `command` to `/specd-verify` when state is `verifying` or `done` and recovery is null. Blockers may still contain `command: 'specd changes verification start <name>'` from `applyIntent` (437–445). The two channels differ.

3. **Start deps and check context differ from the design signature.** Extra `schemaProvider`. Readiness checks run on a self-transition attempt (`from === to`). If `impl.filesResolved` / `impl.linksInScope` are bound only to real edges, they can skip or fail differently from “the normal check execution context” in the design. This is outside `core:invalidate-verification`’s own scenarios and is part of the design verification contract the user asked to compare.

No self-transition is selected for verification invalidation alone. Dependent valid sign-off past `done` can still recover to `done` via sign-off priority. That matches design (sign-off recovery, not verification recovery) and can move state at an archive boundary even though the spec sentence says “in the current state”.

### Test coverage

`invalidate-verification.spec.ts` has two tests: stale once including sign-off (line 67) and attempt-only rejection (line 81). Design also names idempotent repeat, factory equivalence, and in-place blocking. Only two `it` blocks were found. Repeat idempotence and “no self-transition” are not named in that file.

`change-validity.spec.ts` covers “verification staleness does not move lifecycle”. `start-verification.spec.ts` and `complete-verification.spec.ts` exist per the design map; this pass did not re-read them.

### Summary counts

- Requirements: 6
- Matching: 4
- Discrepancies: 2 inside this spec, plus 1 design-contract note on start
- Test gaps: repeat idempotence and no-self-transition are not in the two-test file

---

## Design comparison (requested)

### ReconcileChangeValidity is the only mutation coordinator

Config-based factories for status, transition, archive, validate, edit, and invalidate all resolve one shared reconciler. Edit scope edits throw if it is missing. Invalidate’s constructor requires it.

Bypasses that remain:

- `TransitionChange` designing hop calls `Change.invalidate` when the reconciler argument is omitted.
- `ValidateArtifacts` calls `Change.invalidate` when the reconciler argument is omitted.

Those paths violate design invariant 2 and “Callers must not invoke `Change.invalidate` … outside this coordinator” if a host uses the deps constructor without the reconciler. Kernel composition does not omit it.

### Recovery priority and no self-transition

`selectAutomaticRecovery` order is: required spec consent after `designing` → `designing`; else required sign-off after `done` → `done`; else `workflow: redesign` with non-task review after `designing` → `designing`; else null. `isAfter` is a strict index compare, so the current state is never the target. `Change.transition` throws if `from === to`. Verification staleness is not a recovery cause. This matches the design priority table.

### Verification start / complete / invalidate

- Start: any caller with the use case; checks before baseline; new attempt via `startVerification`; no lifecycle move in that use case.
- Complete: requires an active attempt; equality records completion; no test run; mismatch does not replace the baseline.
- Invalidate: completed evidence required; attempt-only throws; valid evidence goes through `verification-invalidation`; already stale is a no-op; does not start an attempt.

Gaps: extra `schemaProvider`; self-edge check context; stale repeat skips observe; next action skill name vs start command.

### Status reconcile and v1 no-rewrite

Active `GetStatus` with a reconciler always reconciles, including when `ifModifiedSince` matches. `mutate` writes only when the manifest stamp changes. v1 `get` is tested not to rewrite. A no-op reconcile reports `changed: false`. This matches “may write only when facts change” and “v1 read without drift must not rewrite”.

The status DTO is still `ChangeValidityVerdict`, not `ValidityStatusProjection`.

### Archive does not complete verification

Confirmed. Archive reconciles and checks. It does not call `CompleteVerification`.

### GetStatusResult vs ValidityStatusProjection

Not conformant. See `core:get-status` discrepancy 1.

---

## Totals

| Spec                         | Discrepancies | Notes                                                 |
| ---------------------------- | ------------- | ----------------------------------------------------- |
| core:create-change           | 0             | Delta policy default matches                          |
| core:edit-change             | 1             | Scope intent always stales spec approval              |
| core:invalidate-change       | 2             | Force guard and error text                            |
| core:validate-artifacts      | 1             | Optional invalidate bypass                            |
| core:approve-spec            | 1             | Pending drain vs design                               |
| core:approve-signoff         | 2             | Stale reported as not found; pending drain            |
| core:transition-change       | 3             | Error payload, post-hook refresh, optional invalidate |
| core:get-status              | 3             | Projection shape, test/shortcut split, schema drop    |
| core:archive-change          | 2             | Post-hook refresh, error payload                      |
| core:invalidate-verification | 2             | Stale path skips observe; next-action channel         |

Graph limitation: index was stale. Findings above were checked against source after graph location.

ISSUES

### cli

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

### skills

# Partial compliance: skills protocol

Change: `versioned-approval-invalidation`
Scope: `skills:workflow-automation`, `skills:skill-templates-source`
Mode: delegated (no `changes verification start` / `complete`)
Compared: `design.md` “Skill protocol” (lines 1010–1018) against source templates and installed copies.

Sources of truth for this slice:

- `packages/skills/templates/skills/{specd-verify,specd-compliance,specd-design,specd-implement,specd-archive}/SKILL.md.tpl`
- `packages/skills/templates/shared/shared.md.tpl`
- Installed copies under `.agents/skills`, `.codex/skills`, `.claude/skills`, `.github/skills`, `.opencode/skills`, and `.specd/config/skills/shared/shared.md`

## skills:workflow-automation

Spec preview: 11 requirements, 27 verify scenarios.

### Requirement: Cross-skill artifact review and recovery

Status: conformant.

| Design / spec rule                                                                                                                                                                   | Where it lives                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle skills start from fresh canonical status and follow committed recovery                                                                                                     | `shared.md.tpl` “Canonical validity reconciliation”; step 1 status in design, implement, verify, archive; compliance “Trust fresh `specd changes status`” |
| Stale required spec consent stops work and routes through `designing` → `ready` → human `approve spec`                                                                               | verify step 1; implement step 1; design recovery bullets; compliance ownership section; archive preflight                                                 |
| `workflow: preserve` allows in-place semantic review; structural validate is not semantic review, approval, or verification renewal                                                  | shared; design; implement; verify; archive                                                                                                                |
| Standalone verify and standalone `--change` compliance: start, checks, report/hooks, complete only after success; any active state; entering `verifying` does not capture a baseline | verify §3c and §6; compliance “Standalone”; shared “Verification attempt ownership”                                                                       |
| Full verify passes attempt id plus delegated marker; delegated compliance does not start or complete; verify completes only after scenarios and audit succeed                        | verify §5b and §6; compliance “Delegated”; shared                                                                                                         |
| Existing active attempt does not imply delegation                                                                                                                                    | verify §5b; compliance standalone + mode detection                                                                                                        |
| Report-only modes (all, diff, PR, single spec, selection) do not start or complete                                                                                                   | compliance “Report-only” and Phase 0                                                                                                                      |
| Changed inputs: start again, repeat work, do not complete with the previous baseline                                                                                                 | verify §3c and fingerprint-mismatch paragraph; compliance step 5; shared                                                                                  |
| Failure or interruption leaves the attempt active                                                                                                                                    | verify §6; compliance step 4; shared                                                                                                                      |
| `verification invalidate` only withdraws completed evidence                                                                                                                          | verify §3c; compliance; shared                                                                                                                            |
| No restart-verification flag; transitions and status do not create successful evidence                                                                                               | verify (twice); compliance; archive; shared. No template contains `--restart-verification`                                                                |

Verify scenarios for this requirement (independent verify, shared full-mode attempt, standalone compliance, changed inputs) are covered by the same template text and by `template-workflow.spec.ts` (“gives verify and compliance explicit attempt ownership”, “teaches canonical reconciliation…”) and `generated-skill-protocol.spec.ts`.

### Other requirements in this spec

Not re-checked line-by-line in this partial (diagnostic priority, data extraction, spec read surfaces, outlines, repair strategy, canonical commands, command freshness, structural validation review surfaces, implementation traceability, context optimization). No discrepancy was opened for them.

## skills:skill-templates-source

Spec preview: 23 requirements, 61 verify scenarios.

### Requirement: Reconciled invalidation protocol in lifecycle templates

Status: conformant.

- Shared, design, implement, verify, compliance, and archive tell the agent to read fresh status and follow committed state / next action before change-scoped work.
- Shared states the protocol bullets in the spec: independent policies, `artifacts: none` does not waive freshness, `preserve` vs `redesign`, validation is not approval, spec consent returns to design and renews in `ready`, stale sign-off later than `done` returns to `done`, entering `verifying` does not capture a baseline, explicit start does, independent vs delegated ownership, invalidate does not start an attempt, `hasTasks` excluded from fingerprints but still completion-checked.
- Templates do not teach fingerprint calculation, hand-editing validity projections, appending invalidation events, or choosing recovery apart from core status.

Generated-copy scenario: installed bodies match a render of the source templates (see below). They are not a second source of truth.

Report-only scenario: compliance without a concrete active change (`--all`, `--diff`, `--pr`, single spec, selection) is instructed not to run verification start or complete and not to claim successful verification completion.

### Required phrases (verify and compliance templates)

| Phrase                                          | specd-verify `SKILL.md.tpl`                                                           | specd-compliance `SKILL.md.tpl`                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| verification start                              | `specd changes verification start <name> --format text`                               | same, plus report-only prohibition                                                              |
| complete                                        | `specd changes verification complete <name> --format text`                            | same                                                                                            |
| delegated attempt                               | `/specd-compliance --change <name> --delegated --attempt <attemptId>`                 | `` `--change <name> --delegated --attempt <attemptId>` `` and `mode = delegated`                |
| no restart-verification flag                    | “There is no restart-verification flag” (steps 2 and 6)                               | “There is no restart-verification flag”                                                         |
| delegated compliance must not start or complete | “Delegated compliance … must not run `verification start` or `verification complete`” | “Do not run `verification start` or `verification complete`”; “`mode = delegated` runs neither” |

The exact sentence “Delegated compliance must not start or complete that attempt” is in `shared.md.tpl`. Verify and compliance use the same prohibition with command names. No template uses a `--restart-verification` flag.

### Generated copies are not the source of truth

Body comparison after stripping runtime frontmatter, substituting `{{sharedFolder}}` / `@{{sharedFolder}}`, and rendering `{{#if capabilities.agents}}`:

- `specd-verify`, `specd-compliance`, `specd-design`, `specd-archive`: body matches the template in all five install roots.
- `specd-implement`: `.codex`, `.claude`, `.github`, `.opencode` include the agents parallel-mode block; `.agents` omits it. That matches plugin capabilities (`plugin-agent-standard` passes only `frontmatter`; Claude, Codex, Copilot, and OpenCode pass `agents`).
- `.specd/config/skills/shared/shared.md` matches `shared.md.tpl` after `{{sharedFolder}}` substitution.
- Frontmatter differs per runtime (expected injection). Protocol paragraphs are not hand-edited.

### Other requirements in this spec

Not re-checked line-by-line in this partial (template location/migration/metadata, capability rendering, graph impact/search wording, frontmatter matrix, implementation-tracking cookbook, metadata self-healing, optimizer gating, command-role surfaces, in-place approval gates, overlap vs `OVERLAP_CONFLICT`, archive `--skip-hooks pre`, design review scope, fast-track). Spot checks that overlap this change (in-place gates, overlap wording, archive preflight, verify/implement tracking) appear in the same templates and in `template-workflow.spec.ts`. No discrepancy was opened for them.

## Discrepancies

None in the assigned protocol slice.

Observation, not a defect: verify runs `verifying` post-hooks (step 5) before the delegated compliance audit (step 5b). Design lists delegation before “applicable report/hooks”. The spec only requires hooks and the report to precede completion, and completion still waits for both scenario checks and the delegated audit.

## Tests

Ran (read-only): `packages/skills/test/template-workflow.spec.ts`, `packages/skills/test/generated-skill-protocol.spec.ts`, `packages/skills/test/infrastructure/skill-repository.spec.ts`.

Result: 32 passed, 0 failed.

Those tests assert start/complete, `--delegated --attempt <attemptId>`, absence of `--restart-verification`, report-only wording, repeated work after a new start, and installed-copy phrase parity with the templates.

## Counts

| Spec                          | Requirements | Verify scenarios | Protocol requirements checked                | Discrepancies |
| ----------------------------- | ------------ | ---------------- | -------------------------------------------- | ------------- |
| skills:workflow-automation    | 11           | 27               | 1 (Cross-skill artifact review and recovery) | 0             |
| skills:skill-templates-source | 23           | 61               | 1 (Reconciled invalidation protocol)         | 0             |

Assigned slice: CONFORMANT
