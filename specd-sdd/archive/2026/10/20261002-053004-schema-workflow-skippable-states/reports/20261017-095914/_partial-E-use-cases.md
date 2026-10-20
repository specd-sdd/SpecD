# Partial Compliance Audit E: Other Use Cases

Change: `schema-workflow-skippable-states`
Specs: core:archive-change, core:approve-spec, core:approve-signoff, core:compile-context, core:get-artifact-instruction, core:get-hook-instructions, core:run-step-hooks, core:preview-spec, core:validate-artifacts

Paths are relative to `packages/core/`. Tests live in `test/application/use-cases/`.

Shared baseline: `src/application/services/resolve-change-schema.ts` calls `schemaProvider.get(input.schemaName)`. It throws `SchemaProviderIdentityMismatchError` when the returned `schema.name()` does not match, and emits a `SCHEMA_VERSION_DRIFT` advisory when only the version differs. All nine use cases call `this._resolveChangeSchema.execute(...)` right after loading the change. None of them still uses `SchemaMismatchError`. That class is still exported (`src/application/errors/index.ts:12`, `src/public.ts:440`) and is imported but unused in three tests: `approve-spec.spec.ts:6`, `approve-signoff.spec.ts:6` and `archive-change.spec.ts:6`.

---

## core:archive-change

### Requirements Summary

- **Sovereign schema resolution** (renamed from "Schema name guard"):
  - Resolve the schema through `ResolveChangeSchema`. The workspace default is irrelevant.
  - Resolution failures and identity mismatch propagate before preflight, hooks or commit.
  - No peer `list()`/`get()` runs before the predicates return.
- **Canonical validity archive preflight** (modified): verification is required only when `verifying` is enabled. When it is disabled, `verification.current` and the post-hook validity re-check do not block archive.
- Spec Dependencies: adds core:resolve-change-schema.

### Implementation Status

| Requirement / Scenario                                             | Status                                   | Evidence                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sovereign resolution via ResolveChangeSchema                       | Implemented                              | `src/application/use-cases/archive-change.ts:287`                                                                                                                                                                                                                                                                            |
| Identity mismatch propagates before peer listing                   | Implemented + tested                     | `archive-change.spec.ts:314-332`                                                                                                                                                                                                                                                                                             |
| Resolves sovereign schema when workspace default differs           | Implemented + tested                     | `archive-change.spec.ts:334-356` (`get` called with `custom-workflow`)                                                                                                                                                                                                                                                       |
| Archive without verification when verifying is disabled            | Implemented (indirectly), **NOT TESTED** | `reconcile-change-validity.ts:296-298` makes `verificationRequired` false when the step is disabled, so the verdict is `'not-required'` (`domain/services/change-validity.ts:485`). `domain/checks/verification-current.ts:36` returns skip. `archive-change.ts:1422-1428` (`postHookValidityBlocksArchive`) does not block. |
| Archive still requires verification when verifying is enabled      | Implemented, partially tested            | `archive-change.spec.ts:3717` uses a **stubbed** reconciler verdict `verification: 'stale'`. No test covers the `absent` case with an enabled `verifying` and the real reconciler.                                                                                                                                           |
| Typed recovery diagnostic, mandatory reconciler, live task recount | Implemented + tested (pre-existing)      | `archive-change.spec.ts:~3650-3960`                                                                                                                                                                                                                                                                                          |

### Discrepancies

- **MEDIUM: missing tests for the scenarios this change adds (lead confirmed).**
  - `archive-change.spec.ts` has no test that builds a schema with `makeWorkflowStep('verifying', { disabled: true })`. Grepping for `disabled` or `not-required` finds nothing relevant.
  - The verify scenario explicitly says "runs with the real reconciler". Only the reconciler unit test covers the verdict (`reconcile-change-validity.spec.ts:300`).
  - Implementation bug vs spec drift: this is a test gap, not an implementation bug. The code path is correct by composition.
- **LOW: orphan duplicate JSDoc.** The doc block at `archive-change.ts:~1405-1413` ("@param check … @throws Typed archive errors") sits directly above another JSDoc for `postHookValidityBlocksArchive`. It is left over from `throwMappedArchiveFailure`. This is a code-quality issue, not a spec issue.
- **LOW: unused import.** `SchemaMismatchError` is imported but unused in `archive-change.spec.ts:6`, which is a lint issue.

### Test Coverage

- Sovereign resolution: `archive-change.spec.ts:314`, `:334`
- Post-hook verification blocking (stubbed): `archive-change.spec.ts:3717`

### Missing Tests

1. Archive with `verifying` disabled, no verification evidence and the real `ReconcileChangeValidity`. It should succeed, with the predicate skipped and no post-hook block.
2. Archive with `verifying` enabled, `archivable`, no completed verification and the real reconciler. It should fail with `ArchiveImplementationStateError`, or `InvalidStateTransitionError` from the post-hook check.

### Spec Dependency Chain

- Consistent with core:change "Verification requirement follows workflow topology" and core:workflow-topology `isWorkflowStepEnabled`.
- Consistent with core:resolve-change-schema.

---

## core:approve-spec

### Requirements Summary

- The Gate guard step 4 now resolves the sovereign schema through ResolveChangeSchema. Resolution failures and identity mismatch propagate before consent.
- Verify adds the scenario "Sovereign schema resolution in gate guard".

### Implementation Status

| Item                                                                 | Status                     | Evidence                                                                         |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Gate disabled throws first, with no I/O                              | Implemented + tested       | `approve-spec.ts:79-81`; `approve-spec.spec.ts:344-372`                          |
| Sovereign resolution                                                 | Implemented + tested       | `approve-spec.ts:88`; `approve-spec.spec.ts:390-410`                             |
| Enabled gate, `pending-spec-approval` transitions to `spec-approved` | Implemented + tested       | `approve-spec.spec.ts:284`                                                       |
| Factory passes `config.approvals`                                    | Implemented, weakly tested | `test/composition/use-cases/approve-spec.spec.ts:22-27` only checks `instanceof` |

### Discrepancies

- **LOW: order of gate-guard steps.**
  - The spec lists: 2 load change, 3 resolve actor, 4 resolve schema.
  - The code runs: load change, then resolve schema (`approve-spec.ts:88`), then actor (`:94`).
  - The observable guarantee ("propagate before consent is recorded") holds either way.
  - Possible fixes: if this is spec drift, reorder the spec. If it is an implementation issue, the cost of fixing it is negligible.
- **LOW: no identity-mismatch test.** The spec requires `SchemaProviderIdentityMismatchError` to propagate, but no test covers it.

### Missing Tests

- Identity mismatch propagates and no consent is recorded.
- The factory receives `config.approvals`, with a behavioral assertion rather than only `instanceof`.

### Spec Dependency Chain

Consistent.

---

## core:approve-signoff

### Requirements Summary

- Gate guard step 4: sovereign resolution.
- **Signoff recording** (modified): when `verifying` is disabled, signoff does not require, look up or fingerprint-compare verification evidence, and raises no eligibility errors. When verification is required, the typed errors stay distinct.

### Implementation Status

| Item                                                                                | Status               | Evidence                                                                                |
| ----------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Sovereign resolution                                                                | Implemented + tested | `approve-signoff.ts:101`; `approve-signoff.spec.ts:488-508`                             |
| `verifyingEnabled` derived from the change schema                                   | Implemented          | `approve-signoff.ts:107` (`isWorkflowStepEnabled('verifying', schema)`)                 |
| Disabled verifying: signoff without evidence                                        | Implemented + tested | `approve-signoff.ts:117-158`; `approve-signoff.spec.ts:182-192` (`verificationId` null) |
| Disabled verifying: active attempt ignored                                          | Implemented + tested | `approve-signoff.spec.ts:194-202`                                                       |
| Distinct errors when required (not-found / in-progress / stale / legacy / mismatch) | Implemented + tested | `approve-signoff.spec.ts:205-290`                                                       |
| Enabled gate, `pending-signoff` transitions to `signed-off`                         | Implemented + tested | `approve-signoff.spec.ts:383`                                                           |

### Discrepancies

- **LOW: the spec text and its verify scenario disagree.**
  - The spec text says signoff "MAY be granted or renewed only while the reconciled change is in `done`".
  - The verify scenario "Enabled gate allows execute" expects `pending-signoff` to transition to `signed-off`, and the code accepts `pending-signoff` (`approve-signoff.ts:113`).
  - "Persistence and return value" reconciles the two through the historic drain.
  - Likely spec drift: the "Signoff recording" wording should mention the drain exception.
- **LOW: wording versus code on evidence lookup.**
  - The spec says "SHALL NOT … look up" verification evidence when verifying is disabled.
  - `approve-signoff.ts:116` reads `ctx.change.verification.completed` unconditionally. It is not used when verifying is disabled.
  - This is harmless, but it does not follow the wording literally.
- **LOW: order of gate-guard steps.** Schema is resolved before the actor, the same as in approve-spec.
- **LOW: unused `SchemaMismatchError` import.** `approve-signoff.spec.ts:6`.

### Missing Tests

- Identity mismatch propagates before consent.
- Disabled verifying while a stale or mismatching completed record exists. Signoff should still succeed and should not reference `completed.id`.
- The factory receives `config.approvals`, beyond `instanceof`.

### Spec Dependency Chain

Consistent with core:change and core:workflow-topology. The domain check `approval-signoff.ts:45` also treats `not-required` as passing.

---

## core:compile-context

### Requirements Summary

"Sovereign schema resolution" was renamed and modified. Instructions and templates come from the change's own schema, and identity mismatch propagates.

### Implementation Status

| Item                                           | Status                                        | Evidence                          |
| ---------------------------------------------- | --------------------------------------------- | --------------------------------- |
| Resolution via ResolveChangeSchema             | Implemented                                   | `compile-context.ts:276`          |
| Resolves sovereign schema when default differs | Tested                                        | `compile-context.spec.ts:544-557` |
| Resolution failure propagates                  | Tested                                        | `compile-context.spec.ts:508-541` |
| Identity mismatch propagates                   | Implemented (via the service), **NOT TESTED** | none                              |

### Discrepancies

- **LOW: incomplete JSDoc.** `@throws` at `compile-context.ts:262-263` omits `SchemaProviderIdentityMismatchError`. The same gap exists in `preview-spec.ts:101`, `validate-artifacts.ts:175`, `approve-*.ts` and `get-hook-instructions.ts:68`.

### Missing Tests

Identity-mismatch propagation.

### Spec Dependency Chain

Consistent.

---

## core:get-artifact-instruction

### Implementation Status

| Item                                                       | Status         | Evidence                                   |
| ---------------------------------------------------------- | -------------- | ------------------------------------------ |
| Resolution via ResolveChangeSchema                         | Implemented    | `get-artifact-instruction.ts:94`           |
| Resolves `custom-schema` when the default is `spec-driven` | Tested, weakly | `get-artifact-instruction.spec.ts:172-192` |
| Resolution failure propagates                              | Tested         | `get-artifact-instruction.spec.ts:153-170` |
| Identity mismatch propagates                               | **NOT TESTED** | none                                       |

### Discrepancies

- **LOW: weak test.** The test uses `vi.fn().mockResolvedValue(schema)`, which returns the same schema for any name. It therefore does not prove that the workspace default is ignored; only the `toHaveBeenCalledWith('custom-schema')` assertion carries the scenario.

### Missing Tests

- Identity mismatch.
- A provider that returns different schemas per name.

---

## core:get-hook-instructions

### Requirements Summary

- Sovereign resolution.
- Hooks declared on a `disabled: true` step are not returned, in either phase.
- Identity mismatch propagates.
- Adds core:workflow-topology as a dependency.

### Implementation Status

| Item                                                  | Status                            | Evidence                                                                                            |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sovereign resolution, for active and archived changes | Implemented + tested              | `get-hook-instructions.ts:103`; `get-hook-instructions.spec.ts:199-237`                             |
| Disabled step returns no hook instructions            | Implemented, **partially tested** | `get-hook-instructions.ts:114`; `get-hook-instructions.spec.ts:239-260` covers only the `pre` phase |
| Identity mismatch propagates                          | Implemented, **NOT TESTED**       | the verify scenario exists, but no test covers it                                                   |

### Discrepancies

- **MEDIUM: verify scenarios with no or partial tests.**
  - "Identity mismatch propagates" has no test.
  - "Disabled step returns no hook instructions" requires "either phase", but only `pre` is exercised.
- **LOW: `--only` on a disabled step.**
  - When `--only <id>` names a hook that exists on a disabled step, the code returns `[]` instead of `HookNotFoundError`, because the disabled check runs before the `only` filter.
  - This is consistent with "SHALL NOT be returned", but the behavior is not specified or tested. Possible fixes: define it in the spec, or add a test.
- **LOW: dependency wording.** The new dependency line says it is used "to decide verification and hook applicability", but this use case does not decide verification.

### Missing Tests

- Identity mismatch.
- Disabled step in the `post` phase.
- `--only` on a disabled step.

---

## core:run-step-hooks

### Requirements Summary

Sovereign resolution only. Resolution failures and identity mismatch propagate before any hook runs. Nothing in this spec is about disabled steps.

### Implementation Status

| Item                                                                          | Status         | Evidence                                                                 |
| ----------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Sovereign resolution, for active and archived changes                         | Implemented    | `run-step-hooks.ts:119`, `:166`. Resolution happens before hooks run.    |
| Resolves `custom-workflow` when the default is schema-std; executes its hooks | Tested, weakly | `run-step-hooks.spec.ts:90-104` (`mockResolvedValue`, no hooks executed) |
| Resolution failure propagates                                                 | Tested         | `run-step-hooks.spec.ts:78-88`                                           |
| Identity mismatch propagates before any hook runs                             | **NOT TESTED** | none                                                                     |

### Discrepancies

- **MEDIUM: the specs disagree on hooks for disabled steps.**
  - `RunStepHooks` does not check `isWorkflowStepEnabled`. It checks only `workflowStep === null` (`run-step-hooks.ts:129-131`, `:177-180`).
  - As a result, `specd changes run-hooks <name> verifying --phase pre` runs `run:` hooks declared on a disabled `verifying` step.
  - `GetHookInstructions` returns `[]` for the same step, on the grounds that "a disabled step is never entered or exited, so it has no applicable hook instructions".
  - design.md R15 states "Disabled step: absent from topology, candidates, and hooks", but R14 only patches `GetHookInstructions`.
  - Two readings are possible:
    - (a) **Spec gap / implementation omission.** core:run-step-hooks should carry the same disabled-step rule, and the code should return an empty result. This is the likely intent, given the design.
    - (b) **Intentional.** Executable hooks are left to callers. The skill routing in skills:workflow-automation never selects disabled-step hooks. If so, core:get-hook-instructions should state that the asymmetry is deliberate.
  - The lead's claim "Disabled step returns no hook instructions" for run-step-hooks is **not covered by any spec or verify scenario** and is **not implemented**.
- **LOW: weak sovereign test.** It does not cover "hooks defined in custom-workflow are resolved and executed".

### Missing Tests

- Identity mismatch, asserting that no hook ran.
- A sovereign test that runs a `custom-workflow` hook while the default schema has different hooks.
- A disabled-step test, once the spec decides which reading applies.

---

## core:preview-spec

### Requirements Summary

- Sovereign resolution.
- **Error handling** (modified): the "always succeeds" rule now covers only content failures. Change lookup failures, schema resolution failures and identity mismatch propagate.
- Verify adds: "Schema identity mismatch propagates instead of a partial result" and "Schema resolution failure propagates".

### Implementation Status

| Item                                             | Status                      | Evidence                                                      |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------- |
| Resolution, not wrapped in try/catch             | Implemented                 | `preview-spec.ts:108-112`, before the per-artifact try blocks |
| Resolves `custom-schema`                         | Tested, weakly              | `preview-spec.spec.ts:139-158` (`mockResolvedValue`)          |
| Identity mismatch propagates (no partial result) | Implemented, **NOT TESTED** | none                                                          |
| Schema resolution failure propagates             | Implemented, **NOT TESTED** | none                                                          |
| Content failures become a warning and `missing`  | Tested                      | `preview-spec.spec.ts:337-478`                                |
| `DiffGenerationError` becomes a warning          | Tested                      | `preview-spec.spec.ts:574`                                    |

### Discrepancies

- **MEDIUM: both new verify scenarios under "Error handling" have no tests.** `preview-spec.spec.ts` has no `SchemaProviderIdentityMismatchError` or `SchemaNotFoundError` cases. The implementation is correct.
- **LOW: incomplete JSDoc.** `@throws` (`preview-spec.ts:100-101`) omits schema resolution and identity-mismatch errors.

### Missing Tests

- A provider that returns a wrong-name schema should make `execute` reject with `SchemaProviderIdentityMismatchError` and return no result.
- A provider that throws should make `execute` reject with the same error.

---

## core:validate-artifacts

### Implementation Status

| Item                                                      | Status                 | Evidence                                                             |
| --------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| Resolution before any artifact-state change               | Implemented            | `validate-artifacts.ts:181`, the first step after loading the change |
| Resolves `custom-workflow@1.0.0` when the default differs | Tested (as `schema-a`) | `validate-artifacts.spec.ts:161-180`                                 |
| Resolution failure propagates                             | Tested                 | `validate-artifacts.spec.ts:141-156`                                 |
| Identity mismatch propagates before state changes         | **NOT TESTED**         | none                                                                 |

### Discrepancies

- **LOW: verify fixture name.** The scenario uses `custom-workflow@1.0.0` as the `schemaName`, which mixes a version into the name. The test uses `schema-a`. This is cosmetic drift in the verify scenario.

### Missing Tests

Identity mismatch, asserting that artifact state is unchanged and nothing is saved.

---

## Global Spec Consistency

- **Architecture** (application layer depends on ports; domain services are pure): respected. `isWorkflowStepEnabled` is a domain service consumed by application use cases. `ResolveChangeSchema` is an application service built on the `SchemaProvider` port.
- **Error handling:** typed `SpecdError` subclasses (`SchemaProviderIdentityMismatchError`, `VerificationNotFoundError` and others) propagate unchanged. No catch-to-generic was found in this batch.
- **Testing:** most of the identity-mismatch scenarios this change adds have no tests (see below). Several "workspace default differs" tests use `mockResolvedValue`, which returns the same schema for every name, so they cannot detect a regression that falls back to the default.
- **Conventions:** stale `SchemaMismatchError` imports remain in three tests, and `@throws` JSDoc is incomplete in several use cases.

## Summary

| Severity | Count | Items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 0     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| MEDIUM   | 4     | (1) archive-change: no tests for disabled or enabled verifying with the real reconciler. (2) get-hook-instructions: identity-mismatch scenario untested, disabled step tested only in `pre`. (3) run-step-hooks: hooks of a disabled step still run, inconsistent with get-hook-instructions and design R15 (spec gap). (4) preview-spec: both new error-propagation scenarios untested.                                                                                                                                                                                                                                                     |
| LOW      | 12    | approve-spec / approve-signoff: gate-guard order differs from the spec. approve-signoff: "only in `done`" wording versus the `pending-signoff` drain; unconditional `verification.completed` read. Identity-mismatch tests missing in approve-spec, approve-signoff, compile-context, get-artifact-instruction, run-step-hooks and validate-artifacts. Weak `mockResolvedValue` sovereign tests. Incomplete `@throws` JSDoc. Orphan JSDoc in `archive-change.ts:~1405`. Unused `SchemaMismatchError` imports. `--only` on a disabled step is unspecified. Dependency wording in get-hook-instructions. `custom-workflow@1.0.0` fixture name. |

Implementation status: every changed requirement in this batch is implemented, apart from the open question on run-step-hooks disabled steps. The gaps are mostly in test coverage.
