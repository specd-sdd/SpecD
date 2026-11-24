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
