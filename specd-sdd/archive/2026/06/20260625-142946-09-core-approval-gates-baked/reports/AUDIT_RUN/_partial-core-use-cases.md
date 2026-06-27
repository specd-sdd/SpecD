# Spec Compliance Audit — Core Use Cases (Approval Gates Baked)

**Change:** `09-core-approval-gates-baked` (`20260625-142946-09-core-approval-gates-baked`)  
**Audit date:** 2026-06-27  
**Scope:** `core:transition-change`, `core:approve-spec`, `core:approve-signoff`  
**Implementation:** `packages/core/src/application/use-cases/`  
**Tests:** `packages/core/test/application/use-cases/`  
**Composition:** `packages/core/src/composition/use-cases/`, `packages/core/src/composition/kernel.ts`  
**Spec source:** merged preview via `specd changes spec-preview`

---

## core:transition-change

### Requirements Summary

| #   | Requirement                                                                                                                      | Change relevance                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | Input contract — no `approvalsSpec`/`approvalsSignoff` on execute input; removed `implementingTaskChecks`/`implementingRequires` | **Primary change**              |
| 2   | Approval gates baked at construction — `ApprovalGates` via constructor; factory/kernel pass `config.approvals`                   | **Primary change**              |
| 3   | Change must exist                                                                                                                | Existing                        |
| 4   | Optional pre-transition implementation tracking refresh                                                                          | Existing                        |
| 5   | Approval-gate routing for spec approval (`ready` → `implementing` reroutes when `approvals.spec: true`)                          | Existing (now uses baked gates) |
| 6   | Approval-gate routing for signoff (`done` → `archivable` reroutes when `approvals.signoff: true`)                                | Existing (now uses baked gates) |
| 7   | Human-approval pending states produce explicit `approval-required` failures                                                      | Existing                        |
| 8   | Direct transition when gates are inactive                                                                                        | Existing                        |
| 9   | Workflow requires enforcement via `LifecycleEngine`                                                                              | Existing                        |
| 10  | Task completion check during requires enforcement                                                                                | Existing                        |
| 11  | Artifact validation clearing on `verifying → implementing`                                                                       | Existing                        |
| 12  | Transition to `designing` from any state (invalidation, downgrade)                                                               | Existing                        |
| 13  | Transition from `archiving` to `archivable`                                                                                      | Existing                        |
| 14  | Pre-hook execution (target pre before mutation)                                                                                  | Existing                        |
| 15  | Transition delegation to entity                                                                                                  | Existing                        |
| 16  | Transition event (`transitioned` progress)                                                                                       | Existing                        |
| 17  | Post-hook execution (source post before target pre)                                                                              | Existing                        |
| 18  | Persistence via `ChangeRepository.mutate`                                                                                        | Existing                        |
| 19  | Result type returns updated `change`                                                                                             | Existing                        |
| 20  | Progress callback for hook/requires events                                                                                       | Existing                        |
| 21  | Dependencies (`LifecycleEngine`, `RunStepHooks`, `RefreshImplementationTracking`, etc.)                                          | Existing                        |

### Implementation Status

| Requirement                                               | Status      | Evidence                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract                                            | **OK**      | `TransitionChangeInput` (`transition-change.ts:22-51`) has `name`, `to`, optional `skipHookPhases`, `refreshImplementationTrackingBefore` only. No approval gate fields.                                                                                                                                                                             |
| Approval gates baked at construction                      | **OK**      | `ApprovalGates` type (L18-19); constructor stores `_approvals` (L99, L119, L127); `execute` passes `this._approvals` to `LifecycleEngine.evaluate` (L162-165). `createTransitionChange` passes `config.approvals` / `opts.approvals` (`composition/use-cases/transition-change.ts:141, 186`). Kernel wires `config.approvals` (`kernel.ts:249-252`). |
| Change must exist                                         | **OK**      | `get` + `ChangeNotFoundError` (L148-151).                                                                                                                                                                                                                                                                                                            |
| Optional pre-transition refresh                           | **OK**      | Conditional `_refresh.execute` (L153-155); tests cover default/opt-out.                                                                                                                                                                                                                                                                              |
| Spec approval routing                                     | **OK**      | Delegated to `LifecycleEngine` with baked `approvals`; tests at `transition-change.spec.ts:201-235`.                                                                                                                                                                                                                                                 |
| Signoff routing                                           | **OK**      | Same pattern; tests at `transition-change.spec.ts:238-275`.                                                                                                                                                                                                                                                                                          |
| Human-approval pending failures                           | **OK**      | Explicit throws (L177-188); tests at `transition-change.spec.ts:304-342`.                                                                                                                                                                                                                                                                            |
| Direct transition when gates inactive                     | **OK**      | `effectiveTarget` from lifecycle or `input.to`; tests confirm direct routing when gates off.                                                                                                                                                                                                                                                         |
| Workflow requires enforcement                             | **OK**      | Loop over `workflowStep.requires` with lifecycle verdicts (L217-232).                                                                                                                                                                                                                                                                                |
| Task completion check                                     | **PARTIAL** | Gating loop present (L235-261) but `_checkTaskCompletionForArtifact` returns early when `taskCheck.incompletePattern === undefined` (L359) and outer loop `continue`s when `artifactType.taskCompletionCheck === undefined` (L252). Spec requires default markdown checkbox patterns when patterns are omitted.                                      |
| Artifact validation clearing (`verifying → implementing`) | **OK**      | No clearing on that path; tests at `transition-change.spec.ts:345-414`.                                                                                                                                                                                                                                                                              |
| Transition to designing                                   | **OK**      | Invalidation in mutate callback (L282-298); extensive tests.                                                                                                                                                                                                                                                                                         |
| Transition from archiving                                 | **OK**      | `isArchivingRecovery` bypasses hooks/requires (L214, L217, L237, L269); tests present.                                                                                                                                                                                                                                                               |
| Pre-hook execution                                        | **OK**      | Target pre before mutate (L274-277).                                                                                                                                                                                                                                                                                                                 |
| Transition delegation                                     | **OK**      | `freshChange.transition(effectiveTarget, actor)` (L301).                                                                                                                                                                                                                                                                                             |
| Transition event                                          | **OK**      | `onProgress` emitted (L307).                                                                                                                                                                                                                                                                                                                         |
| Post-hook execution                                       | **OK**      | Source post before target pre (L268-277); skip logic matches spec.                                                                                                                                                                                                                                                                                   |
| Persistence                                               | **OK**      | Final `mutate` (L279-305).                                                                                                                                                                                                                                                                                                                           |
| Result type                                               | **OK**      | Returns `{ change: persistedChange }` (L309).                                                                                                                                                                                                                                                                                                        |
| Progress callback                                         | **OK**      | `requires-check`, hook events, `transitioned` wired.                                                                                                                                                                                                                                                                                                 |
| Dependencies                                              | **OK**      | All listed deps in constructor.                                                                                                                                                                                                                                                                                                                      |

**Note:** Implementation adds defensive `gate-not-required` errors (L191-206) when callers request gate states with gates disabled at construction. Not specified in merged preview; benign extension.

### Discrepancies

#### D-TC-1: Default task-completion patterns not applied (PARTIAL)

- **Spec says:** When `requiresTaskCompletion` lists an artifact, use default `incompletePattern` / `completePattern` if `taskCompletionCheck` patterns are omitted (`spec.md` Requirement: Task completion check, step 7).
- **Code does:** Skips the artifact entirely when `taskCompletionCheck` is `undefined` (`transition-change.ts:252`, `359`).
- **Ambiguity:** Spec may intend defaults only when `taskCompletionCheck` object exists but patterns are empty vs. when the whole `taskCompletionCheck` property is absent. Code treats both as "no check."
- **Likely fix direction:** If spec intent is strict, apply defaults when `requiresTaskCompletion` references an artifact with `hasTasks: true` regardless of `taskCompletionCheck` presence.

#### D-TC-2: No composition-level test for factory wiring (test gap, not impl gap)

- **Spec says:** `createTransitionChange(config)` passes `config.approvals` (verify scenario).
- **Code does:** Factory passes `config.approvals` at `composition/use-cases/transition-change.ts:141`.
- **Gap:** No unit test invokes `createTransitionChange` and asserts baked approvals.

### Test Coverage

| Verify scenario (change-relevant)                        | Covered?        | Test location                                                 |
| -------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| Input accepts transition controls without approval flags | Implicit (type) | No dedicated runtime test; constructor uses `approvals` param |
| Approval gates fixed at construction                     | **Yes**         | `transition-change.spec.ts:209-235`, `249-275`                |
| Factory passes `config.approvals`                        | **No**          | —                                                             |
| Execute does not accept gate overrides (compile-time)    | Implicit        | TypeScript enforcement only                                   |
| Ready→implementing reroute/direct                        | **Yes**         | `transition-change.spec.ts:209-235`                           |
| Done→archivable reroute/direct                           | **Yes**         | `transition-change.spec.ts:249-275`                           |
| Pending approval blocks / allows redesign                | **Yes**         | `transition-change.spec.ts:304-342`                           |
| Task completion (with explicit patterns)                 | **Yes**         | `transition-change.spec.ts:416-700+`                          |
| Task completion default patterns when omitted            | **No**          | —                                                             |

Broader transition-change verify scenarios (hooks, persistence, designing, archiving, requires) are well covered in `transition-change.spec.ts` (~1900 lines).

### Missing Tests

1. `createTransitionChange(config)` passes `config.approvals` to instance (factory/integration).
2. Task completion with `requiresTaskCompletion` but omitted `taskCompletionCheck` patterns (default regex behavior).
3. Explicit assertion that `TransitionChangeInput` rejects `approvalsSpec`/`approvalsSignoff` at type level (optional compile-time fixture).

### Summary Counts — core:transition-change

| Metric               | Count                             |
| -------------------- | --------------------------------- |
| Requirements audited | 21                                |
| OK                   | 20                                |
| PARTIAL              | 1                                 |
| MISSING              | 0                                 |
| Discrepancies        | 1 (implementation) + 1 (test gap) |
| Missing tests        | 3                                 |

---

## core:approve-spec

### Requirements Summary

| #   | Requirement                                                              | Change relevance                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------- |
| 1   | Gate guard sequence (disabled → load → actor → schema → schema mismatch) | Existing (gate now from construction) |
| 2   | Change lookup                                                            | Existing                              |
| 3   | Artifact hash computation with schema cleanup rules                      | Existing                              |
| 4   | Approval recording and state transition                                  | Existing                              |
| 5   | Persistence and return value via `mutate`                                | Existing                              |
| 6   | Input contract — `name` and `reason` only; no gate on input              | **Primary change**                    |
| 7   | Approval gate baked at construction                                      | **Primary change**                    |

### Implementation Status

| Requirement                         | Status      | Evidence                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate guard                          | **PARTIAL** | Step 1 OK: `!this._approvals.spec` throws before I/O (L65-67). Steps 2-5 diverge: actor resolved before change load (L69); change loaded inside `mutate` (L70); schema resolved in `_computeArtifactHashes` inside mutate (L86), not in gate guard; **no `SchemaMismatchError`** comparing `schema.name()` vs `change.schemaName`. |
| Change lookup                       | **OK**      | `mutate` throws `ChangeNotFoundError` for missing change; test at `approve-spec.spec.ts:210-227`.                                                                                                                                                                                                                                  |
| Artifact hash computation           | **OK**      | Iterates artifacts/files, skips missing/skipped/null, applies `buildCleanupMap` + `computeArtifactHash` (L85-100).                                                                                                                                                                                                                 |
| Approval recording and transition   | **OK**      | `recordSpecApproval` + `transition('spec-approved')` in mutate (L72-73).                                                                                                                                                                                                                                                           |
| Persistence and return value        | **OK**      | Returns result of `mutate` (L70-75); mutate spy test (L122-141).                                                                                                                                                                                                                                                                   |
| Input contract                      | **OK**      | `ApproveSpecInput` has only `name`, `reason` (L11-16).                                                                                                                                                                                                                                                                             |
| Approval gate baked at construction | **OK**      | Constructor stores `_approvals` (L30, L46, L52); `createApproveSpec` passes `config.approvals` (`composition/use-cases/approve-spec.ts:107, 121`); kernel passes `config.approvals` (`kernel.ts:331-334`).                                                                                                                         |

### Discrepancies

#### D-AS-1: Gate guard sequence incomplete (PARTIAL)

- **Spec says:** Ordered sequence: (1) gate check, (2) load change, (3) resolve actor, (4) get schema, (5) schema mismatch check — before hash computation.
- **Code does:** (1) gate check, (2) resolve actor, (3) `mutate` which loads change and computes hashes (schema inside callback).
- **Ambiguity:** Functional outcome may be equivalent for happy path, but schema mismatch is never checked and actor is resolved before confirming change exists (extra I/O on missing change).
- **Evidence for code gap:** `SchemaMismatchError` used in peer use cases (`validate-artifacts.ts`, `archive-change.ts`, `run-step-hooks.ts`) but absent from `approve-spec.ts`.

#### D-AS-2: Schema mismatch not enforced (MISSING within gate guard)

- **Spec says:** Compare `schema.name()` with `change.schemaName`; throw `SchemaMismatchError` on mismatch.
- **Code does:** No comparison anywhere in `ApproveSpec.execute`.
- **Ambiguity:** Low — spec is explicit; pattern exists elsewhere in codebase.

#### D-AS-3: Gate guard schema resolution timing (PARTIAL)

- **Spec verify scenario:** "Schema resolution failure propagates from gate guard before hash computation."
- **Code does:** Schema fetched inside `_computeArtifactHashes` during mutate, after actor resolution.
- **Ambiguity:** Error still propagates, but not from gate guard phase as specified.

### Test Coverage

| Verify scenario                                           | Covered?     | Test location                                                                                            |
| --------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| Spec gate disabled → `ApprovalGateDisabledError`, no repo | **Partial**  | `approve-spec.spec.ts:145-180` — throws correctly; does not spy `get`/`mutate` to prove zero repo access |
| Change not found                                          | **Yes**      | `approve-spec.spec.ts:210-227`                                                                           |
| Artifacts hashed with cleanup rules                       | **No**       | —                                                                                                        |
| Artifact cannot be loaded (skipped)                       | **No**       | —                                                                                                        |
| Schema resolution failure propagates                      | **No**       | —                                                                                                        |
| Pending-spec-approval → spec-approved                     | **Yes**      | `approve-spec.spec.ts:38-78`                                                                             |
| Wrong state → `InvalidStateTransitionError`               | **Yes**      | `approve-spec.spec.ts:183-207`                                                                           |
| Persisted through `mutate`                                | **Yes**      | `approve-spec.spec.ts:122-141`                                                                           |
| Input fields name/reason only                             | **Implicit** | Type + usage in tests                                                                                    |
| Factory passes `config.approvals`                         | **No**       | —                                                                                                        |
| Enabled gate allows execute                               | **Yes**      | `approve-spec.spec.ts:38-78`                                                                             |

### Missing Tests

1. `SchemaMismatchError` when active schema differs from change schema.
2. Schema cleanup rule application (spec vs verify artifact hashing).
3. Artifact skip when `artifact()` returns `null`.
4. Schema resolution failure before hash computation.
5. Gate disabled: assert `mutate`/`get` not called (repo access proof).
6. `createApproveSpec(config)` passes `config.approvals`.

### Summary Counts — core:approve-spec

| Metric               | Count                                 |
| -------------------- | ------------------------------------- |
| Requirements audited | 7                                     |
| OK                   | 5                                     |
| PARTIAL              | 1                                     |
| MISSING              | 1 (schema mismatch within gate guard) |
| Discrepancies        | 3                                     |
| Missing tests        | 6                                     |

---

## core:approve-signoff

### Requirements Summary

| #   | Requirement                                                              | Change relevance                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------- |
| 1   | Gate guard sequence (disabled → load → actor → schema → schema mismatch) | Existing (gate now from construction) |
| 2   | Change lookup                                                            | Existing                              |
| 3   | Artifact hash computation with schema cleanup rules                      | Existing                              |
| 4   | Signoff recording and state transition                                   | Existing                              |
| 5   | Persistence and return value via `mutate`                                | Existing                              |
| 6   | Input contract — `name` and `reason` only; no gate on input              | **Primary change**                    |
| 7   | Approval gate baked at construction (`approvals.signoff`)                | **Primary change**                    |

### Implementation Status

| Requirement                         | Status      | Evidence                                                                                                                                                                        |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate guard                          | **PARTIAL** | Same structural gaps as `ApproveSpec`: gate check OK (L65-67); actor before change load; no schema mismatch; schema in hash callback.                                           |
| Change lookup                       | **OK**      | Via `mutate`; test at `approve-signoff.spec.ts:206-223`.                                                                                                                        |
| Artifact hash computation           | **OK**      | Mirror of `ApproveSpec` (L85-100).                                                                                                                                              |
| Signoff recording and transition    | **OK**      | `recordSignoff` + `transition('signed-off')` (L72-73).                                                                                                                          |
| Persistence and return value        | **OK**      | `mutate` return (L70-75).                                                                                                                                                       |
| Input contract                      | **OK**      | `ApproveSignoffInput`: `name`, `reason` only (L11-16).                                                                                                                          |
| Approval gate baked at construction | **OK**      | Constructor `_approvals` (L30, L46, L52); `createApproveSignoff` passes `config.approvals` (`composition/use-cases/approve-signoff.ts:107, 121`); kernel (`kernel.ts:335-338`). |

### Discrepancies

#### D-ASN-1: Gate guard sequence incomplete (PARTIAL)

Same as D-AS-1; applies to `approve-signoff.ts` with `approvals.signoff`.

#### D-ASN-2: Schema mismatch not enforced (MISSING)

Same as D-AS-2; no `SchemaMismatchError` in `ApproveSignoff.execute`.

#### D-ASN-3: Gate guard schema resolution timing (PARTIAL)

Same as D-AS-3.

### Test Coverage

| Verify scenario                                     | Covered?     | Test location                                          |
| --------------------------------------------------- | ------------ | ------------------------------------------------------ |
| Signoff gate disabled → `ApprovalGateDisabledError` | **Partial**  | `approve-signoff.spec.ts:141-176` — no repo-access spy |
| Change not found                                    | **Yes**      | `approve-signoff.spec.ts:206-223`                      |
| Cleanup rules / null artifact / schema failure      | **No**       | —                                                      |
| Pending-signoff → signed-off                        | **Yes**      | `approve-signoff.spec.ts:35-75`                        |
| Wrong state                                         | **Yes**      | `approve-signoff.spec.ts:179-203`                      |
| Persisted through `mutate`                          | **Yes**      | `approve-signoff.spec.ts:118-137`                      |
| Input name/reason only                              | **Implicit** | Type + tests                                           |
| Factory passes `config.approvals`                   | **No**       | —                                                      |
| Enabled gate allows execute                         | **Yes**      | `approve-signoff.spec.ts:35-75`                        |

### Missing Tests

Same gaps as `ApproveSignoff` counterpart:

1. `SchemaMismatchError` on schema name mismatch.
2. Cleanup rule hashing scenarios.
3. Null artifact skip.
4. Schema resolution failure propagation timing.
5. Gate disabled repo-access proof.
6. `createApproveSignoff(config)` factory wiring.

### Summary Counts — core:approve-signoff

| Metric               | Count               |
| -------------------- | ------------------- |
| Requirements audited | 7                   |
| OK                   | 5                   |
| PARTIAL              | 1                   |
| MISSING              | 1 (schema mismatch) |
| Discrepancies        | 3                   |
| Missing tests        | 6                   |

---

## Cross-Cutting: Approval Gates Baked at Construction

### Composition / Kernel Wiring

| Use case           | Factory passes `config.approvals`         | Kernel passes `config.approvals` | Execute input free of gate flags |
| ------------------ | ----------------------------------------- | -------------------------------- | -------------------------------- |
| `TransitionChange` | **Yes** (`transition-change.ts:141, 186`) | **Yes** (`kernel.ts:249-252`)    | **Yes**                          |
| `ApproveSpec`      | **Yes** (`approve-spec.ts:107, 121`)      | **Yes** (`kernel.ts:331-334`)    | **Yes**                          |
| `ApproveSignoff`   | **Yes** (`approve-signoff.ts:107, 121`)   | **Yes** (`kernel.ts:335-338`)    | **Yes**                          |

`ApprovalGates` type is defined in `transition-change.ts` and imported by approve use cases — single shared shape `{ spec: boolean; signoff: boolean }`.

### Kernel test coverage

`kernel-get-config.spec.ts` confirms `approveSpec` / `approveSignoff` instances exist on `kernel.changes` but does **not** assert baked approval values match `config.approvals`.

---

## Aggregate Summary

| Spec                     | Requirements | OK     | PARTIAL | MISSING | Discrepancies   | Missing tests |
| ------------------------ | ------------ | ------ | ------- | ------- | --------------- | ------------- |
| `core:transition-change` | 21           | 20     | 1       | 0       | 1 (+1 test gap) | 3             |
| `core:approve-spec`      | 7            | 5      | 1       | 1       | 3               | 6             |
| `core:approve-signoff`   | 7            | 5      | 1       | 1       | 3               | 6             |
| **Total**                | **35**       | **30** | **3**   | **2**   | **7**           | **15**        |

### Change-focus verdict (approval gates baked)

The **primary change objective is implemented**: all three use cases accept `ApprovalGates` at construction, read gate state from `_approvals` in `execute`, expose gate-free input types, and are wired through `create*` factories and `createKernel` with `config.approvals`.

**Remaining gaps are mostly pre-existing or adjacent:**

1. **`ApproveSpec` / `ApproveSignoff` gate guard** — schema mismatch check and ordered guard sequence not fully aligned with merged spec.
2. **`TransitionChange` task completion** — default checkbox patterns when `taskCompletionCheck` omitted.
3. **Test coverage** — factory wiring and gate-guard edge cases (schema mismatch, cleanup rules, repo-access proofs) not covered for approve use cases.

### Recommended reviewer decisions

| Finding                                        | Question for reviewer                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Schema mismatch in approve use cases           | Is mismatch check intentionally deferred to `ChangeRepository` / other layers, or should approve mirror `ValidateArtifacts`? |
| Gate guard ordering (actor before change load) | Acceptable optimization or spec violation?                                                                                   |
| Default task-completion patterns               | Should defaults apply when `taskCompletionCheck` property is wholly absent?                                                  |

---

_End of partial audit — core use cases batch._
