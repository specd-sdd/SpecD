# Partial E: Sovereign Schema Consumers (batch 2)

Change: `schema-workflow-skippable-states`.
Specs in this batch: core:archive-change, core:approve-spec, core:approve-signoff, core:compile-context, core:get-artifact-instruction, core:get-hook-instructions, core:edit-change, core:invalidate-change, core:count-tasks.

Method: merged specs read with `changes spec-preview`, change deltas read under `deltas/core/<spec>/`, and code and tests read directly. Nothing was modified. The audit focuses on the requirements this change touched: sovereign resolution, gates set at construction, and the effects of optional or disabled steps. Requirements this change did not touch were only spot-checked.

---

## Cross-cutting findings (apply to several specs in the batch)

### X1 [HIGH] With `verifying` disabled, archive is blocked, and so is signoff when its gate is on (confirmed)

- `packages/core/src/application/use-cases/reconcile-change-validity.ts:277-286`: `verificationRequired(change)` looks only at the state (`verifying | done | archivable | archiving | pending-signoff | signed-off`). It ignores the schema. Line 203 already has the sovereign schema, but `WorkflowTopology.isStepEnabled('verifying', schema)` is never called.
- `packages/core/src/domain/services/change-validity.ts:478-487`: with `verificationRequired=true` and no completed verification, the verdict is `'absent'`. Lines 541-543 then add a `VERIFICATION_REQUIRED` blocker.
- Archive: `ARCHIVE_BINDING_SPECS` (`packages/core/src/domain/services/check-bindings.ts:126-170`) binds `verification.current` to `scope: 'archive'` with `skippable:false, allowDisable:false`. `domain/checks/verification-current.ts:43-49` fails with `VERIFICATION_REQUIRED`. `archive-change.ts:1556-1560` maps that to `ArchiveImplementationStateError`. `postHookValidityBlocksArchive` (`archive-change.ts:1422-1428`) would block too.
- Signoff: `domain/checks/approval-signoff.ts:56-62` fails with `VERIFICATION_REQUIRED` on the `done -> archivable` edge when the signoff gate is on. `ApproveSignoff.execute` (`approve-signoff.ts:113-121`) throws `VerificationNotFoundError` whenever `verification.completed` is undefined, whatever the schema says.
- In contrast, `lifecycle-verdict.ts:948-950` (`verificationBoundary`) does check the schema and tells the user to go to `/specd-archive`. The guidance points to archive, but archive then fails. `verifying` is not a bedrock state (`workflow-topology.ts:23-29`), and schema validation only protects `ready` against the approval gate (`workflow-topology.ts:267-272`), so this configuration is accepted.
- Two readings:
  - (a) Code bug. `verificationRequired` should become `verificationRequired(change, schema)` and return false when `verifying` is disabled, the same rule `verificationBoundary` uses.
  - (b) Spec gap. archive-change "Canonical validity archive preflight" (lines 92-100) says archive SHALL fail when "verification is absent", with no exception for a disabled verifying step. approve-signoff "Signoff recording" requires "valid verification evidence". If disabling `verifying` is meant to drop verification evidence, both specs need that exception added.
- Tests: none. `transition-change.spec.ts:3661` ("resolves sovereign schema by change.schemaName") stops at `done` with a mocked reconcile. No test covers archive, or signoff with the gate on, after a `verifying`-disabled path.

### X2 [MEDIUM] Archive metadata materialization still uses the workspace default schema

- After the commit, archive calls `this._materializeMetadata.execute({ specId, policy: 'force' })` (`archive-change.ts:605`). That goes `MaterializeSpecMetadata` -> `GenerateSpecMetadata.execute`, which runs `this._schemaProvider.get()` with no name (`generate-spec-metadata.ts:94`). That is the workspace default.
- archive-change "Schema name guard" (the merged text the delta calls "Sovereign schema resolution", line 72) says: "The change's recorded schema is the sovereign authority governing its artifact types, **metadata materialization**, and archive hooks. A different workspace default MUST remain irrelevant."
- The pre-publication metadata-consistency pass and the spec-lock `schema` do use the sovereign schema (`archive-change.ts:938, 952-954`; `resolve-sealed-archive-depends-on.ts:62-69` wraps the resolved schema in a one-shot provider). Only the post-commit materialization falls back.
- Two readings:
  - (a) Code bug. The change's schema should reach `GenerateSpecMetadata` during archive.
  - (b) Spec overreach. Persisted spec metadata is spec-scoped and should follow the workspace or spec-lock schema. If so, the archive spec should not list "metadata materialization" as change-sovereign.
- Failures are swallowed (`catch { failedMetadataSpecPaths.push }`), so a mismatch shows up only as stale or wrong metadata.
- `CompileContext` (through `GetSpecMetadata`) has the same transitive path. Its spec, though, limits sovereignty to "instructions and artifact templates", so for compile-context this is LOW.

### X3 [MEDIUM] `ResolveChangeSchema` result contract does not match its spec (depth-1 dependency of all 9 specs)

- `packages/core/src/application/services/resolve-change-schema.ts:35-60` returns a bare `Schema` and reports a same-name version drift through `Logger.warn`.
- core:resolve-change-schema "Input and result contract" requires `{ schema, warnings }`, with typed advisory records carrying the recorded and resolved versions. "Constraints" says "The use case does not mutate the change or persist warnings itself", which implies the caller gets the warnings.
- None of the 9 consumers can surface the advisory to callers or the CLI. Either change the code or relax the spec. The owner is the resolve-change-schema audit; it is listed here because every spec in this batch depends on it.

### X4 [LOW] The reconciler skips the shared resolver

- `reconcile-change-validity.ts:203` calls `this._deps.schemaProvider.get(change.schemaName)` directly, without the identity check or version advisory. resolve-change-schema "Shared change-operation boundary" says callers "MUST NOT duplicate named lookup, identity validation …". The name is correct, so there is no fallback to the default. A misbehaving provider would only be caught at the first consumer's own resolve. That holds for all 9 in this batch, since each resolves before it reconciles.
- edit-change's "Serialized reconciliation owns artifact topology" explicitly hands this lookup to the reconciler, so the reconciler must perform it. It just does not go through `ResolveChangeSchema`.

### X5 [LOW] Delta heading rename was not applied in the merged specs

- The archive-change, compile-context, get-artifact-instruction and get-hook-instructions deltas use `op: modified` with selector `Requirement: Schema name guard`, and their content starts with `### Requirement: Sovereign schema resolution`. The merged previews still show `### Requirement: Schema name guard` (archive line 70, compile-context line 70, get-artifact-instruction line 39, get-hook-instructions line 44), with the new body under it.
- Either the merge drops the heading from `content` (a delta authoring problem: rename needs another op), or the merge engine ignores heading renames on `modified`. Either way, the requirement is still called "Schema name guard" while it now describes sovereign resolution. archive-change "Archivable guard" also still says "After the schema name guard".

### X6 [LOW] Dead `_schemaProvider` fields

Each of the 9 use cases keeps `this._schemaProvider` and only passes it to the fallback `new ResolveChangeSchema(schemaProvider)`: approve-spec.ts:33/61, approve-signoff.ts:39/70, archive-change.ts:201/253, compile-context.ts:202/245, get-artifact-instruction.ts:53/78, get-hook-instructions.ts:36/58, edit-change.ts:77/105, invalidate-change.ts:74/96. count-tasks takes it as a ctor parameter. This is harmless, but it leaves a reference to the raw provider that could later be used for an unnamed `get()`.

### Workspace-default fallback sweep

No direct `schemaProvider.get()` without a name remains in any of the 9 use cases. Every one calls `this._resolveChangeSchema.execute({ changeName, schemaName: change.schemaName, schemaVersion })`, and every composition factory injects the shared `resolver.getResolveChangeSchema()` (`composition-resolver.ts:564-567`). Remaining unnamed lookups across core: `generate-spec-metadata.ts:94` (X2), `validate-specs.ts:124`, `get-project-context.ts:143`, `get-spec-context.ts:391`, `get-spec-outline.ts:65`, and `resolve-initial-persisted-depends-on.ts:59`. In archive, the last one is safely wrapped with the sovereign schema. The others are spec-scoped or project-scoped and outside this batch.

---

## core:archive-change

### Requirements Summary

Sovereign resolution through `ResolveChangeSchema` before preflight, hooks or commit, with errors propagated. No peer `list()`/`get()` before the predicates return. Plus the existing archive pipeline: bindings, archivable guard, canonical preflight, deferred `archiving` transition, staged commit, restore, spec-lock, metadata.

### Implementation Status

| Requirement                                           | Status                      | Evidence                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign resolution)              | Implemented                 | `archive-change.ts:284-291`: resolve runs right after load and before reconcile, predicates and hooks                                                                        |
| Identity mismatch propagates, no peer loading         | Implemented                 | resolver throws before anything else. `schema.nameMatch` maps to `SchemaProviderIdentityMismatchError` (`:1477-1478`). Overlap peers load only after predicates (`:337-345`) |
| Metadata materialization governed by sovereign schema | Partial                     | X2: post-commit `GenerateSpecMetadata` uses the default                                                                                                                      |
| Canonical validity archive preflight                  | Implemented, with X1 defect | `:294-307, :396-415`; verification is state-only (X1)                                                                                                                        |
| Archive bindings / no RunStepHooks                    | Implemented                 | ctor `:236-266`; deps resolve `archiveBindings`                                                                                                                              |
| Config factory via resolveArchiveChangeDeps           | Implemented                 | `composition/use-cases/archive-change.ts:153, 194-212` passes `resolveChangeSchema`                                                                                          |

### Discrepancies

- **HIGH (X1)**: with verifying disabled, archive fails with `VERIFICATION_REQUIRED` / `ArchiveImplementationStateError`.
- **MEDIUM (X2)**: metadata materialization uses the workspace default.
- **LOW**: the Constraints say "Hook execution is delegated to `RunStepHooks`", but the requirements say `ArchiveChange` MUST NOT take `RunStepHooks`. Hooks now go through `hook.pre`/`hook.post` binding effects. The constraint is outdated, or should say "via binding effects".
- **LOW (X5)**: the heading is still "Schema name guard".
- **LOW**: the `@throws` JSDoc (`:276`) lists `SchemaNotFoundError` but not `SchemaProviderIdentityMismatchError`.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `archive-change.spec.ts:331` "uses the recorded sovereign schema on a successful archive". The provider returns a distinct `workspace-default` for any other ref, and the test asserts `get('custom-workflow')` and success. **Covered.** The scenario name does not match the test title.
- Identity mismatch: `archive-change.spec.ts:313` "rejects the sovereign lookup integrity failure without listing peer changes". Covered.
- `makeMaterializeMetadata()` is mocked, so X2 cannot be caught.

### Missing Tests

- Archive after a schema with `verifying: { disabled: true }` (X1).
- Archive metadata materialization using the change schema when the default differs (X2).
- A propagated general resolution failure (not identity mismatch) before hooks run, asserting no hook execution or snapshot.

### Spec Dependency Chain

- core:resolve-change-schema: result contract mismatch (X3).
- core:transition-checks / check-registry: `verification.current` on archive is `allowDisable:false` with no condition on the step being enabled (X1).
- core:materialize-spec-metadata / spec-metadata: default-schema lookup conflicts with the sovereign wording (X2).
- default:\_global/error-handling-conventions: typed errors are used (`SchemaProviderIdentityMismatchError`, `ArchiveImplementationStateError`). OK.

### Summary

6 requirements checked (sovereign-related): 4 implemented, 1 partial (X2), 1 implemented with a defect (X1). Discrepancies: 1 HIGH, 1 MEDIUM, 3 LOW.

---

## core:approve-spec

### Requirements Summary

Gate guard sequence: disabled gate fails first with no I/O, then load, actor, sovereign schema (errors propagate). Consent recorded in `ready`; historic drain from `pending-spec-approval` to `spec-approved`. Gates set at construction from `config.approvals`. Factory through `resolveApproveSpecDeps`.

### Implementation Status

| Requirement                          | Status                     | Evidence                                                                                                                                                     |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate guard step 1 (disabled, no I/O) | Implemented                | `approve-spec.ts:79-81`                                                                                                                                      |
| Gate guard steps 2-4                 | Implemented, order differs | load `:83`, schema `:88-92`, actor `:94`. The spec order is load, **actor**, schema                                                                          |
| Approval gate set at construction    | Implemented                | ctor `approvals` `:54`; `resolveApproveSpecDeps` `approvals: resolver.config.approvals` (`composition/use-cases/approve-spec.ts:52`); kernel `kernel.ts:392` |
| Recording / state transition         | Implemented                | `:95-113`; drain transition `:109-111`                                                                                                                       |
| Input contract                       | Implemented                | `:17-22`                                                                                                                                                     |

### Discrepancies

- **LOW**: gate-guard order. The code resolves the schema before the actor; the spec lists the actor (3) before the schema (4). There is no behavioural impact unless the actor resolver has side effects or fails. Either fix the order in the code or say in the spec that steps 3 and 4 have no fixed order.
- **LOW (spec internal)**: the verify scenario "Enabled gate allows execute with name and reason" requires `pending-spec-approval` -> `spec-approved`. The Purpose says the use case "MUST NOT transition into … `spec-approved` on that happy path" and keeps drain only for in-flight changes. The code does both, so the scenario only exercises the legacy drain and reads as the primary behaviour. Possible fixes: rename it to "drain", or add a `ready` variant.

### Test Coverage

- "Factory passes config.approvals": **not covered**. `test/composition/use-cases/approve-spec.spec.ts:22` only asserts `toBeInstanceOf(ApproveSpec)`. Nothing checks that `resolveApproveSpecDeps(resolver).approvals === config.approvals`, or that a config with `approvals.spec:false` makes `execute` throw `ApprovalGateDisabledError`.
- "Enabled gate allows execute with name and reason": covered in substance by `approve-spec.spec.ts:283` "transitions the change to spec-approved" (pending-spec-approval drain, default `approvals.spec:true`). The title differs.
- "Sovereign schema resolution in gate guard": `approve-spec.spec.ts:390` "resolves schema by change.schemaName and succeeds". The provider returns `fallback` for other refs; the test asserts `get('schema-a')` and success. **Covered (weak)**: it does not check the resulting state or that the fallback was never requested.
- Gate disabled: `:344`, `:360`. Covered.
- `SchemaMismatchError` is imported and unused (`approve-spec.spec.ts:5`).

### Missing Tests

- Factory/config approvals pass-through (both `createApproveSpec(config)` and kernel).
- `SchemaProviderIdentityMismatchError` propagating before consent (gate guard step 4).
- General resolution failure propagating with no mutation.

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:transition-checks: the `approval.spec` binding is `from: ready` (`check-bindings.ts:88-91`), consistent with "Approval recorded in ready".
- core:workflow-model: `ready` cannot be disabled while the spec gate is active (`workflow-topology.ts:267-272`), so the anchor is protected. OK.

### Summary

5 requirements: 5 implemented (1 with an order deviation). Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Missing tests: 3.

---

## core:approve-signoff

### Requirements Summary

Same gate guard sequence for `approvals.signoff`. Implementation-tracking refresh, then reconciliation, fingerprint and signoff in one mutation. Signoff in `done` requires valid verification. Typed verification errors. Gates set at construction.

### Implementation Status

| Requirement                             | Status                     | Evidence                                                                                                     |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Gate guard step 1                       | Implemented                | `approve-signoff.ts:91-93`                                                                                   |
| Gate guard steps 2-4                    | Implemented, order differs | load `:95`, schema `:100-104`, refresh `:106`, actor `:107`                                                  |
| Approval gate set at construction       | Implemented                | `composition/use-cases/approve-signoff.ts:55` `approvals: resolver.config.approvals`; kernel `kernel.ts:393` |
| Signoff recording / verification errors | Implemented                | `:113-124, :151-168` (not-found / in-progress / stale / mismatch are distinct)                               |
| Signoff with verifying disabled         | Defect / spec gap          | X1: `:113-121` always requires `verification.completed`                                                      |

### Discrepancies

- **HIGH (X1)**: with signoff gate on and `verifying` disabled, signoff can never succeed (`VerificationNotFoundError`), and `approval.signoff` on `done -> archivable` fails with `VERIFICATION_REQUIRED`. The spec says "valid verification evidence" without exception. Fix the code, or add to the spec that this schema/gate combination is invalid and have schema validation reject it.
- **LOW**: gate-guard order (schema before actor), same as approve-spec.
- **LOW (spec internal)**: the "Enabled gate allows execute" scenario targets the `pending-signoff` -> `signed-off` drain while the Purpose says new work stays in `done`. Same ambiguity as approve-spec.

### Test Coverage

- "Factory passes config.approvals": **not covered** (`test/composition/use-cases/approve-signoff.spec.ts:22` is an instanceOf check only).
- "Enabled gate allows execute with name and reason": `approve-signoff.spec.ts:355` "transitions the change to signed-off". Covered in substance.
- "Sovereign schema resolution in gate guard": `approve-signoff.spec.ts:461` "resolves schema by change.schemaName and succeeds". **Covered (weak)**: pending-signoff drain only, and no assertion on the fallback.
- Unused `SchemaMismatchError` import (`:5`).

### Missing Tests

- Factory/config approvals pass-through.
- Identity mismatch and general failure propagating before refresh or mutation. It is untested whether `RefreshImplementationTracking` stays un-invoked on failure (the code resolves before refresh, which is correct).
- Signoff with a verifying-disabled schema (X1).

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:transition-checks: `approval.signoff` on `done -> archivable` reads `validity.verification`, which is state-only (X1).
- core:workflow-model: no validation rule ties the signoff gate to the `verifying` step being enabled. A cross-spec gap.

### Summary

5 requirements: 4 implemented, 1 defect or spec gap (X1). Discrepancies: 1 HIGH, 0 MEDIUM, 2 LOW. Missing tests: 3.

---

## core:compile-context

### Requirements Summary

Resolve the change's sovereign schema through `ResolveChangeSchema`; the default is irrelevant; identity mismatch propagates. The rest of the context-assembly requirements did not change in this delta.

### Implementation Status

| Requirement                   | Status      | Evidence                                                                               |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Schema name guard (sovereign) | Implemented | `compile-context.ts:273-280`, before any other I/O except change load                  |
| Factory wiring                | Implemented | `composition/use-cases/compile-context.ts:63, 69, 133-147` injects the shared resolver |

### Discrepancies

- **LOW (X2 transitive)**: `GetSpecMetadata` -> `GenerateSpecMetadata` uses the default schema for per-spec metadata. The compile-context spec limits sovereignty to "instructions and artifact templates", so this is consistent with the spec as written. The archive-change wording, however, treats metadata materialization as change-sovereign.
- **LOW**: the `@throws` JSDoc (`:263`) lists `SchemaNotFoundError` only. `SchemaProviderIdentityMismatchError` is missing.
- **LOW (X5)**: the heading is still "Schema name guard".

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `compile-context.spec.ts:544` "resolves sovereign schema by change.schemaName". **Weak**: `makeSut({ change, schema })` gives a provider that returns the same schema for any ref, so no distinct default is modelled and fallback is not ruled out. The test also passes `config: noOp`, which the input contract says MUST NOT be accepted (a leftover).
- Identity mismatch propagation: **not covered**.

### Missing Tests

- A provider that returns a distinct default for other refs, or throws on them.
- Propagation of `SchemaProviderIdentityMismatchError`.

### Spec Dependency Chain

- core:resolve-change-schema (X3). The other dependencies in this delta have no conflicts.

### Summary

2 requirements in scope: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW. Tests: 1 weak, 1 missing.

---

## core:get-artifact-instruction

### Implementation Status

| Requirement                   | Status      | Evidence                                                                                                              |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign) | Implemented | `get-artifact-instruction.ts:91-98`; the schema feeds `evaluateLifecycleVerdict`, artifact lookup, rules and template |
| Factory wiring                | Implemented | `composition/use-cases/get-artifact-instruction.ts:49, 105-113`                                                       |

### Discrepancies

- **LOW (X5)**: heading not renamed.
- **LOW**: the "Ports and constructor" ctor signature in the spec has no optional `resolveChangeSchema` parameter, and `resolveGetArtifactInstructionDeps` does not list it. The same pattern holds for all specs in this batch. The code adds an optional 6th or later parameter and `resolveChangeSchema` on the deps. Spec text is behind the code.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `get-artifact-instruction.spec.ts:172` "resolves sovereign schema by change.schemaName". **Weak**: `get: vi.fn().mockResolvedValue(schema)` returns the same schema for any ref, so the `spec-driven` default in the scenario is not modelled. It does assert `get('custom-schema')`.
- Identity mismatch: not covered.

### Missing Tests

- A distinct default or throwing provider for other refs.
- Identity mismatch propagation.

### Summary

2 requirements: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Tests: 1 weak, 1 missing.

---

## core:get-hook-instructions

### Implementation Status

| Requirement                                        | Status      | Evidence                                                                                                                  |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign, active and archived) | Implemented | `get-hook-instructions.ts:69-106`: recorded `schemaName`/`schemaVersion` taken from the active change or `ArchivedChange` |
| Change lookup / archive fallback                   | Implemented | `:72-99`                                                                                                                  |
| Step resolution                                    | Implemented | `:108-115`                                                                                                                |

### Discrepancies

- **LOW**: step validity is checked after schema resolution. Before this change it ran before any provider I/O. With an invalid `step` and a broken schema, the user now sees the schema error instead of `StepNotValidError`. The spec does not set an order.
- **LOW (optional/disabled steps)**: `schema.workflowStep(step)` returns a step even when it is declared `disabled: true`, so instruction hooks of a disabled step are still returned. The spec is silent. Decide whether disabled steps should yield `[]`.
- **LOW (X5)**: heading.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `get-hook-instructions.spec.ts:198` "uses the recorded schema for active and archived instruction lookups". The provider returns a distinct default schema with a different hook; the test asserts the sovereign hook for both the active and the archived path. **Covered (strong)**.
- Identity mismatch: not covered.

### Missing Tests

- Identity mismatch propagation.
- Hooks of a disabled step (if the behaviour gets specified).

### Summary

3 requirements: 3 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## core:edit-change

### Requirements Summary

Sovereign resolution once before mutation for added-spec compatibility. In the mutation: `replaceSpecIds()` and `ctx.reconcileAfter()`, with no `updateSpecIds()` and no second direct `SchemaProvider.get()`. Resolution errors abort before mutation; reconciliation errors prevent partial persistence.

### Implementation Status

| Requirement                                 | Status      | Evidence                                                                                                                                      |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve once before mutation                | Implemented | `edit-change.ts:142-147`, only when `hasSpecChanges`                                                                                          |
| Compatibility uses sovereign schema         | Implemented | `:149-158`: `specSchemaName = persisted.schema?.name ?? schema.name()`; compatible if equal to `change.schemaName` or `schema.compat()?.name` |
| `replaceSpecIds()` + `ctx.reconcileAfter()` | Implemented | `:239, :245`                                                                                                                                  |
| No `updateSpecIds()` / no second lookup     | Implemented | no call in edit-change. `Change.updateSpecIds` still exists (`domain/entities/change.ts:1639`) but edit-change does not use it                |
| Resolution error aborts before mutation     | Implemented | resolve runs before `_executeScopeEdit`                                                                                                       |

### Discrepancies

- **MEDIUM (spec internal contradiction)**: "Schema compatibility guardrail" step 1 says an uninitialized spec "assumes it uses the project's active global schema (`GetActiveSchema`)", and the verify scenario "Uninitialized spec fallback allows addition if global schema matches change" agrees. The new "Sovereign schema resolution" requirement says "A workspace default that differs from `change.schemaName` MUST NOT affect compatibility results." The code follows the new rule: an uninitialized spec is treated as having the change's sovereign schema, so it is always compatible. Two readings:
  - (a) The guardrail step 1 text and its scenario are outdated and should say "the change's sovereign schema". This is the likely intent.
  - (b) The code should still consult `GetActiveSchema` for uninitialized specs. That would contradict the new requirement.
    The test `edit-change.spec.ts:536` "allows uninitialized spec fallback when global schema matches change" passes only because the default and the change schema share a name. It does not tell the two readings apart.
- **LOW**: in the non-scope branch (`:164-195`), `persisted.invalidated` is always `false` (`:175`), so the unscaffold, scaffold and refresh code after it can never run.
- **LOW**: the "Dependencies" requirement and `resolveEditChangeDeps` list do not mention the reconciler or `resolveChangeSchema`, both of which composition injects (`composition/use-cases/edit-change.ts:42, 103-112`). Spec text is behind the code.

### Test Coverage

- "Added-spec compatibility ignores a different workspace default": `edit-change.spec.ts:482` "uses the change schema for compatibility and fresh mutation DAG synchronization". The provider throws for any ref other than `custom-workflow`; the test asserts `get` called once with it. **Covered**. A real incompatible-compat default schema is not modelled, but the throwing provider gives an equivalent guarantee.
- "Serialized reconciliation owns artifact topology": **partially covered**. The same test's `toHaveBeenCalledOnce()` rules out a second direct lookup, assuming `makeObservingReconcile` does not call the provider. No test asserts that `replaceSpecIds()` and `ctx.reconcileAfter()` run, or that `updateSpecIds()` does not. That is verified only by code inspection (`:239, :245`).
- "Schema resolution failure leaves scope unchanged" (failure inside `reconcileAfter`): `edit-change.spec.ts:433` "keeps the persisted scope atomic when reconciliation rejects". **Weak**: the mocked `reconcile.mutate` never writes to `repo`, so "nothing persisted" holds by construction. The repository's real rollback is not exercised.
- Pre-mutation resolution failure: `edit-change.spec.ts:517`. Covered.

### Missing Tests

- Spy on `Change.prototype.replaceSpecIds`, `updateSpecIds` and `reconcileAfter` to make the "Serialized reconciliation owns artifact topology" scenario explicit.
- An atomicity test with a real or in-memory `ReconcileChangeValidity.mutate` that rejects after `replaceSpecIds`.
- A test separating the guardrail-step-1 readings (default schema name differs from the change schema, spec uninitialized).

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:get-active-schema (named in guardrail step 1) conflicts with the sovereign requirement (see MEDIUM above).
- core:change: `replaceSpecIds` exists, and `updateSpecIds(…, artifactDag)` remains as a legacy API. Consider deprecating it.

### Summary

5 requirements: 5 implemented. Discrepancies: 0 HIGH, 1 MEDIUM (spec contradiction), 2 LOW. Tests: 2 covered, 1 partial, 1 weak.

---

## core:invalidate-change

### Implementation Status

| Requirement                                           | Status      | Evidence                                                                                                                                                                                                              |
| ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve after load, DAG targets from sovereign schema | Implemented | `invalidate-change.ts:122-142`: `resolveTargets(…, schema.artifacts())`, `globalTargets(change, schema)`. Downstream expansion happens in the reconciler with `schemaProvider.get(change.schemaName)` (same name, X4) |
| Errors propagate before persistence                   | Implemented | resolve runs before `_reconcile.execute`                                                                                                                                                                              |

### Discrepancies

- **LOW**: resolution happens after `validateCommandShape` (`:117-120`), not straight "after loading". Pure input validation comes first, which is harmless.
- **LOW (X4)**: downstream propagation's DAG comes from the reconciler's direct lookup, not from the resolved instance. The name is the same, so this is consistent.

### Test Coverage

- "Invalidation targets come from the change schema": `invalidate-change.spec.ts:157` "resolves invalidation targets from the change sovereign schema". **Weak**: the change's `schemaName` is `@specd/schema-std`, the usual default name. The scenario requires `custom-workflow` with a default whose DAG is different. A throwing provider for other refs gives partial assurance, but differing target sets are not demonstrated.
- "Schema resolution failure precedes persistence": `invalidate-change.spec.ts:182`. Covered (history length unchanged).

### Missing Tests

- A custom-named schema with a DAG that differs from the default, asserting the selected targets, including `global` and downstream expansion.

### Summary

2 requirements: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Tests: 1 weak, 1 covered.

---

## core:count-tasks

### Implementation Status

| Requirement                                       | Status      | Evidence                                               |
| ------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Sovereign resolution, tasks from sovereign schema | Implemented | `count-tasks.ts:48-52`, iterating `schema.artifacts()` |
| No fallback counts on failure                     | Implemented | the resolve error propagates; there is no catch        |
| Composition                                       | Implemented | `composition/use-cases/count-tasks.ts:27, 71-74`       |

### Discrepancies

- **LOW**: "Counts qualifying task artifacts" still says "obtain the resolved schema through `SchemaProvider`", and "Supports composition" lists only `ChangeRepository` and `SchemaProvider` as dependencies. This is consistent but does not mention `ResolveChangeSchema`. It is a small wording gap next to the new requirement.
- **LOW**: the `check.incompletePattern!` / `completePattern!` non-null assertions (`:57-58`) rely on the schema always filling them in. That is consistent with the spec ("schema MUST materialize"), so this is an observation only.

### Test Coverage

- "Counts tasks declared only by the change schema": `count-tasks.spec.ts:17` "resolves task declarations from the change sovereign schema". The provider throws on non-sovereign refs, and the test asserts counts from the custom `checklist` artifact. **Covered.** The title differs.
- "Sovereign schema failure does not return fallback counts": `count-tasks.spec.ts:48`. Covered.

### Missing Tests

- None material. Optional: identity mismatch propagation.

### Summary

3 requirements: 3 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW.

---

## Batch totals

| Spec                     | HIGH               | MEDIUM                                   | LOW        | Missing or weak tests                                            |
| ------------------------ | ------------------ | ---------------------------------------- | ---------- | ---------------------------------------------------------------- |
| archive-change           | 1 (X1)             | 1 (X2)                                   | 3          | 3 missing                                                        |
| approve-spec             | 0                  | 0                                        | 2          | 1 missing (factory approvals), 1 weak, 2 missing (failure paths) |
| approve-signoff          | 1 (X1)             | 0                                        | 2          | 1 missing (factory approvals), 1 weak, 2 missing                 |
| compile-context          | 0                  | 0                                        | 3          | 1 weak, 1 missing                                                |
| get-artifact-instruction | 0                  | 0                                        | 2          | 1 weak, 1 missing                                                |
| get-hook-instructions    | 0                  | 0                                        | 3          | 1 missing                                                        |
| edit-change              | 0                  | 1 (guardrail vs sovereign contradiction) | 2          | 1 partial, 1 weak, 1 missing                                     |
| invalidate-change        | 0                  | 0                                        | 2          | 1 weak                                                           |
| count-tasks              | 0                  | 0                                        | 2          | 0                                                                |
| Cross-cutting            | X1 (counted above) | X3 (resolver contract)                   | X4, X5, X6 | none                                                             |

Overall, every consumer in the batch resolves the change's recorded `schemaName` through the shared `ResolveChangeSchema`. None calls the workspace default directly, and errors propagate before mutation. The remaining risks:

1. The state-only `verificationRequired` breaks archive and signoff when `verifying` is disabled (HIGH).
2. Post-commit archive metadata materialization still uses the workspace default (MEDIUM).
3. The resolver returns no typed warnings, unlike its spec (MEDIUM).
4. The edit-change guardrail text contradicts the sovereign requirement (MEDIUM).
5. No test checks that factories pass `config.approvals`, and several sovereign tests use providers that return the same schema for any ref.
