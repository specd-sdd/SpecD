# Partial D (sovereign schema, batch 1): spec compliance audit

Change: `schema-workflow-skippable-states`
Specs: `core:resolve-change-schema`, `core:change`, `core:change-manifest`, `core:get-status`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`
Mode: read-only audit. Merged specs read via `changes spec-preview`. Focus: requirements this change touched (the sovereign-schema and skippable/disabled-step deltas). Unchanged requirements got a lighter check.
Test run: the 8 relevant core test files (resolve-change-schema, get-status, validate-artifacts, run-step-hooks, preview-spec, start-verification, validity-fingerprint-service, reconcile-change-validity) pass: **190/190**.

---

## Cross-cutting findings (summary)

| #   | Sev    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                        |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | HIGH   | `ReconcileChangeValidity` skips the shared resolver. It calls `schemaProvider.get(change.schemaName)` directly, so there is no identity check and no version advisory. It is a mutating, persisting consumer (task-artifact set, DAG expansion, persisted consequences).                                                                                                                                                                                                                                                                                                                                                                                | `packages/core/src/application/use-cases/reconcile-change-validity.ts:203`; deps only hold `schemaProvider` (`:70`); composition `composition-resolver.ts:~703` passes no `resolveChangeSchema` |
| X2  | HIGH   | `verificationRequired(change)` checks lifecycle state only and ignores the schema loaded at line 203. When `verifying` is disabled (`WorkflowTopology.isStepEnabled('verifying', schema) === false`), a change in `done` or `archivable` still gets `verificationRequired=true`. Result: verdict `verification: 'absent'`, then a `VERIFICATION_REQUIRED` validity blocker (`change-validity.ts:541-543`), and `verification.current` fails at archive (`check-bindings.ts:146-150`, `allowDisable:false`; `domain/checks/verification-current.ts:42-50`). A schema with verifying disabled can therefore never archive without a verification attempt. | `reconcile-change-validity.ts:218,277-286`; `workflow-topology.ts:84-99`                                                                                                                        |
| X3  | HIGH   | When the repository loads or saves a change, it syncs the change's artifact map against the **workspace-default** schema. `resolveArtifactTypes` resolves `config.schemaRef`, not `change.schemaName`. `syncArtifacts` then adds and removes artifact types and the result is persisted (`hasChangesToPersist`). A change with a custom schema gets its artifact map rewritten from the default schema.                                                                                                                                                                                                                                                 | `composition-resolver.ts:439-442`; `infrastructure/fs/change-repository.ts:665-668` (save), `1337-1383` (filename normalization), `1480-1517` (sync and persist)                                |
| X4  | MEDIUM | The repository still compares the manifest version with the workspace default and warns. `core:change-manifest` now says loading MUST NOT do this. A test enforces the forbidden behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `change-repository.ts:1343-1352`; test `change-repository.spec.ts:2687` "logs a warning when schema version differs from active schema"                                                         |
| X5  | MEDIUM | `ResolveChangeSchema` does not follow its own result contract. It returns a bare `Schema` and sends the advisory to `Logger.warn`; the spec requires `{ schema, warnings }` with typed advisory records.                                                                                                                                                                                                                                                                                                                                                                                                                                                | `application/services/resolve-change-schema.ts:35-58`                                                                                                                                           |
| X6  | MEDIUM | CLI `changes status` draws the artifact DAG from `getActiveSchema` (the workspace default) and prefers it over `lifecycle.schemaInfo`. Same pattern in `validate.ts:221,308,489`, `spec-preview.ts:74`, `artifacts.ts:56`.                                                                                                                                                                                                                                                                                                                                                                                                                              | `packages/cli/src/commands/change/status.ts:59-78,237,401`                                                                                                                                      |

---

## 1. core:resolve-change-schema (new spec)

### Requirements Summary

Input and result contract (`{schema, warnings}`); sovereign named lookup; provider identity integrity (`SchemaProviderIdentityMismatchError`); same-name version advisory; failure propagation and caller policy; shared change-operation boundary; composition (config factory through the canonical resolver).

### Implementation Status

| Requirement                         | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input and result contract           | **Partial**                 | Input matches (it also takes `changeName`). The return value is `Promise<Schema>`, not `{schema, warnings}`, and there are no typed advisory records (`resolve-change-schema.ts:35`).                                                                                                                                                                                                          |
| Sovereign named lookup              | Implemented                 | `:36` `schemaProvider.get(input.schemaName)`, with no retry or fallback                                                                                                                                                                                                                                                                                                                        |
| Provider identity integrity         | Implemented                 | `:38-44`. The error carries `changeName`, `expectedSchemaName` and `actualSchemaName`, with code `SCHEMA_PROVIDER_IDENTITY_MISMATCH` (`errors/schema-provider-identity-mismatch-error.ts`). It is exported from `errors/index.ts:35` and `public.ts:457`.                                                                                                                                      |
| Same-name version advisory          | **Partial**                 | It compares against the named result, not the default (good). The advisory is a log side effect (`Logger.warn`, `:46-56`), so callers cannot surface it, and `GetStatus` cannot project it.                                                                                                                                                                                                    |
| Failure propagation / caller policy | Implemented in the resolver | Errors propagate unchanged. Caller compliance varies (see X1 and §4).                                                                                                                                                                                                                                                                                                                          |
| Shared change-operation boundary    | **Partial**                 | Most core use cases inject it (see the list from the `rg ResolveChangeSchema` sweep). `ReconcileChangeValidity` does not (X1). Repository hydration uses the default schema (X3). The CLI uses `getActiveSchema` (X6). Every consumer also keeps a `?? new ResolveChangeSchema(schemaProvider)` fallback, which is the same policy but not "the same canonical composition boundary" instance. |
| Composition                         | **Partial / divergent**     | There is no `createResolveChangeSchema(config)` or `createResolveChangeSchema(deps)` factory, and no `composition/use-cases/resolve-change-schema.ts`. Only the lazy singleton `resolver.getResolveChangeSchema()` exists (`composition-resolver.ts:564-568`). The class lives in `application/services/`, not `use-cases/`.                                                                   |

### Discrepancies

- **MEDIUM – result contract (X5).** Either (a) the code is wrong: it should return `{ schema, warnings: SchemaVersionAdvisory[] }` and let callers decide how to surface the advisory; or (b) the spec over-specifies: if log-only advisories are intended, the spec and core:change ("emit a warning") should say "log", and the typed `warnings` requirement should be removed.
- **MEDIUM – composition requirement.** Either (a) add the config and deps factories required by the canonical factory pattern in `_global/architecture`; or (b) amend the spec to say the shared resolver getter is the only composition entry, because this is a service rather than a use case.
- **LOW – the default-constructed fallback in every consumer.** `deps.resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)` gives the same behavior, but the spec says "obtain it through ResolveChangeSchema or an equivalent dependency resolved from the same canonical composition boundary". Either make the dependency required, or accept the fallback as "equivalent".

### Test Coverage

`packages/core/test/application/services/resolve-change-schema.spec.ts`:

- "resolves the sovereign schema when name and version match exactly" covers the matching scenario
- "isolates resolution from the workspace default schema" covers "different workspace default never consulted"
- "propagates provider lookup errors when the schema does not exist" covers named lookup failure with no fallback
- "throws SchemaProviderIdentityMismatchError if the provider returns a different schema name" covers identity mismatch
- "returns schema and emits advisory warning for same-name version drift" covers the advisory (via the Logger spy)

### Missing Tests

- "Workspace default version does not create advisory" (`custom@1` recorded and resolved, default `custom@9`) has no direct test. The isolation test uses different names.
- "Identity mismatch is checked before use" for a mutating caller: no caller-level test proves that nothing runs or persists (see §5–§7).
- "Change-bound consumers use the shared resolver" at composition level: there is no test that every change-bound factory receives `getResolveChangeSchema()`. Such a test would have caught X1.
- Composition factory: none exists, so there is nothing to test.

### Spec Dependency Chain

- `core:change` "Schema version" says "emit a warning". This is consistent with a log, but the result contract in this spec asks for typed warnings. The two dependent specs disagree on the advisory representation.
- `_global/error-handling-conventions`: the error extends `SpecdError` with a stable code, which is consistent.

### Summary counts

7 requirements: 3 implemented, 4 partial/divergent. Discrepancies: 0 HIGH, 2 MEDIUM, 1 LOW (plus cross-cutting X1, X3, X6 for boundary coverage).

---

## 2. core:change

### Requirements Summary (changed by this delta)

- New: "StartVerification sovereign schema resolution"
- Modified: "Schema version" (sovereign resolution, identity mismatch is fatal, same-name version is advisory)
- New: "Sovereign schema for validity fingerprints"
- Relevant pre-existing: "Implementation and verification loop" and "Signoff gate" (verification evidence required at done→archivable), "Artifact sync" (`syncArtifacts` against the "current schema").

### Implementation Status

| Requirement                                                                 | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StartVerification sovereign schema resolution                               | Implemented, with an ordering caveat | `start-verification.ts:122-126` resolves through the shared resolver before building the check context. Composition passes `getResolveChangeSchema()` (`verification-factories.ts:125`). **Caveat:** `execute` runs `refreshImplementationTracking` and `reconcileChangeValidity.execute` (which can persist) **before** the resolver runs (`:80-82`), and the reconciler does its own unchecked lookup (X1). So with an identity mismatch, reconciliation consequences may already have been persisted from the untrusted schema before the error is thrown. No attempt is created (OK). |
| Schema version                                                              | **Partial**                          | Entity props exist (`domain/entities/change.ts:435-469,545-551`). Use-case consumers resolve by name. Violations: X1 (reconciler skips the identity check), X3 (repository syncs artifacts from the default schema, which effectively replaces the recorded artifact model), X4 (default-version warning on load).                                                                                                                                                                                                                                                                        |
| Sovereign schema for validity fingerprints                                  | Implemented                          | `validity-fingerprint-service.ts:52-53,120-124` uses the resolver, and composition passes the shared instance (`composition-resolver.ts:694`). Failure propagates.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Implementation and verification loop / Signoff gate vs disabled `verifying` | **Divergent (X2)**                   | Verification is "required" purely by state (`reconcile-change-validity.ts:277-286`), so schemas with verifying disabled are blocked at done→archivable and at archive.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Artifact sync against "current schema"                                      | **Divergent (X3)**                   | `syncArtifacts` receives the workspace-default artifact types on every load and save.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Discrepancies

- **HIGH – X2, disabled verifying vs state-only `verificationRequired`.** Either (a) the code is wrong: `verificationRequired` should take the schema (already loaded at `:203`) and return false when `!WorkflowTopology.isStepEnabled('verifying', schema)`, with `verification.current` at archive and `approval.signoff` (which also emits `VERIFICATION_REQUIRED`, `domain/checks/approval-signoff.ts:59`) following suit; or (b) the spec intends verification evidence to be mandatory even when the step is disabled. In that case core:change "Signoff gate", core:workflow-model and the change's design must say how evidence is produced without a verifying step (StartVerification is state-independent, so it is possible but unguided), and `GetStatus` must surface that guidance. Option (a) is far more plausible given the "disabled workflow steps" theme.
- **HIGH – X1, the reconciler skips the shared boundary.** Either (a) inject `ResolveChangeSchema` into `ReconcileChangeValidityDeps` and use it at `:203`; or (b) the spec should exempt the reconciler because callers resolve first. Option (b) is not tenable: `ApproveSpec`, `TransitionChange`, `StartVerification` and `EditChange` all call the reconciler, and `StartVerification` calls it **before** its own resolution.
- **HIGH – X3, repository artifact sync uses the workspace default.** Either (a) `resolveArtifactTypes` should be keyed by the change's recorded schema, through the shared resolver or a per-name registry lookup; or (b) the spec should state that repository hydration intentionally uses the default schema. That would contradict core:change "Schema version" ("MUST NOT replace the recorded schema identity", "MUST NOT cause fallback") and core:change-manifest ("not repository hydration").
- **MEDIUM – StartVerification ordering.** Resolution happens after refresh and reconcile. Either move resolution first, so that "Mutating use cases MUST stop before … persistence when resolution fails" holds, or fix X1, which makes the ordering moot.

### Test Coverage

- `start-verification.spec.ts`: "builds readiness from the change sovereign schema"; "does not create an attempt when sovereign schema resolution fails".
- `validity-fingerprint-service.spec.ts`: "uses the change sovereign schema for every artifact-bearing fingerprint API"; "propagates sovereign schema failures without returning fallback evidence".
- `change-repository.spec.ts:2667`: "hydrates change when schema name differs from active schema without error".

### Missing Tests

- Reconciler: no test with a disabled `verifying` step at `done` or `archivable`, and no test with a provider returning the wrong identity (`reconcile-change-validity.spec.ts` has no schema-identity or disabled-step tests).
- No test that a custom-schema change keeps its artifact map through `FsChangeRepository.get`/`save` when the default schema differs (X3).
- No archive test where a custom schema disables `verifying` and archive succeeds without verification evidence.
- No test for StartVerification with an identity mismatch (only a generic `Error` rejection). The StartVerification sovereign test also checks only `get` was called with the name; it does not show that the check context comes "exclusively from the custom schema" against a differing default.
- "Schema version mismatch does not block archive": no archive-level test found in this batch.

### Spec Dependency Chain

- `core:workflow-model` and `core:workflow-topology` (disabled steps) vs core:change "Signoff gate" ("plus valid verification evidence"): the spec chain does not say what happens to verification evidence when verifying is disabled. This is a spec gap that compounds X2.
- `default:_global/architecture` (domain owns invariants, application owns I/O): consistent.

### Summary counts

Changed and relevant requirements audited: 5. Implemented: 2. Partial/divergent: 3. Discrepancies: 3 HIGH, 1 MEDIUM.

---

## 3. core:change-manifest

### Requirements Summary (changed)

"Schema version": the root `schema` is the sovereign source. Loading MUST NOT compare the version with the workspace default. A name difference MUST NOT reject the load. Lookup, identity and advisories belong to the resolver, not to hydration.

### Implementation Status

| Requirement                                     | Status            | Evidence                                                                                                                     |
| ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Root schema hydrates the entity                 | Implemented       | `manifest-change-loader.ts:91-92,276-277`; `change-repository.ts:1450-1451`                                                  |
| Name differs → no rejection                     | Implemented       | No name comparison on load; test `change-repository.spec.ts:2667`                                                            |
| MUST NOT compare version with workspace default | **Violated (X4)** | `change-repository.ts:1343-1352` warns when `manifest.schema.name === activeSchema.name && version !== activeSchema.version` |
| Hydration does not own schema behavior          | **Violated (X3)** | Default-schema artifact types drive filename normalization and `syncArtifacts` during hydration (`:1337-1383,1480-1517`)     |

### Discrepancies

- **MEDIUM – X4.** Either remove the repository warning and its test, or keep it and reword the spec. Note that the spec's own **verify.md is internally inconsistent**: scenario "Schema version bumped" ("WHEN a change is loaded and the active schema has a higher version … THEN specd emits a warning") still describes load-time comparison with the active (default) schema, and "Schema unchanged" talks about the "active schema". These scenarios contradict the modified spec.md text and support the stale code. One side must be fixed. The likely fix is to rewrite those verify scenarios in terms of `ResolveChangeSchema`'s named lookup.
- **HIGH – X3** (see §2).
- **LOW – "Archiving with schema version mismatch remains allowed"** says "the mismatch warning is surfaced". Today it is only surfaced as a log line (X5), and nothing reaches CLI output.

### Test Coverage

- `change-repository.spec.ts:2667` "hydrates change when schema name differs from active schema without error" covers the name-differs scenario.
- `change-repository.spec.ts:2687` "logs a warning when schema version differs from active schema" **tests behavior the spec now forbids**.

### Missing Tests

- No test that loading does **not** consult the workspace default version.
- No test that artifact sync during hydration keeps the custom schema's artifact types.

### Spec Dependency Chain

- Contradicts core:resolve-change-schema "Same-name version advisory" (the advisory MUST come from the named lookup, not the default), through X4.

### Summary counts

4 sub-rules: 2 implemented, 2 violated. Discrepancies: 1 HIGH (X3, shared), 1 MEDIUM, 1 LOW; also a spec-internal contradiction in verify.md.

---

## 4. core:get-status

### Requirements Summary (changed)

- Modified: "Graceful degradation when schema resolution fails" (resolve through `ResolveChangeSchema`; degraded lifecycle shape; `SCHEMA_RESOLUTION_FAILED` vs `SCHEMA_IDENTITY_MISMATCH` with structured requested and returned names; never throw; read-only; no projection from an untrusted schema; applies to drafts via the view fields).
- New: "Shared transition candidate evaluation" (bypassed steps, step-skip predicates, projection only).
- Relevant: "Operational status reconciliation", "Revision evaluation for conditional status queries", "Identifies blockers", "Approval, verification … projection".

### Implementation Status

| Requirement                                                 | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve through ResolveChangeSchema (active)                | Implemented               | `get-status.ts:465-479`. Composition passes the shared resolver (`composition/use-cases/get-status.ts:54,131`).                                                                                                                                                                                                                                                      |
| Degraded lifecycle shape                                    | Implemented (active)      | `get-status.ts:528-594`: empty `validTransitions`/`availableTransitions`, empty `lifecycle.blockers`, approvals populated, `nextArtifact=null`, `changePath` populated, `schemaInfo=null`                                                                                                                                                                            |
| `SCHEMA_RESOLUTION_FAILED` vs `SCHEMA_IDENTITY_MISMATCH`    | **Partial**               | Codes are distinct (`:529-537`). The identity blocker has only a `message`, **no structured details** with requested and returned names, as the spec requires. `SCHEMA_RESOLUTION_FAILED` has no recovery `command` (verify says "with recovery guidance"; only reason text).                                                                                        |
| Never throw / read-only on failure; no refresh or reconcile | Implemented (active)      | The early return skips `_reconcile.execute` (`:472-479`); refresh runs inside reconcile.                                                                                                                                                                                                                                                                             |
| Degradation for drafts                                      | **Violated**              | `_buildDraftedResult` catches **only** `SchemaNotFoundError` (`:805-810`). `SchemaProviderIdentityMismatchError` and every other failure are re-thrown, so `GetStatus` throws for drafts. On failure the draft path still populates `schemaInfo` with name and version (`:852-856`) instead of `null`, and emits **no** `SCHEMA_RESOLUTION_FAILED` blocker (`:879`). |
| Shared transition candidate evaluation                      | Implemented               | `executeChecksByLegalTargets` calls `evaluateTransitionCandidate` for each `WorkflowTopology.legalTransitions` target (`execute-matching-predicates.ts:336-372`). Status runs no effects (`get-status.ts:606-631`).                                                                                                                                                  |
| Operational status reconciliation                           | Implemented, with caveat  | Resolves first, then reconciles. The reconciler then looks up the schema a second time without validation (X1). That is harmless here because GetStatus validated it first, but it is redundant.                                                                                                                                                                     |
| Revision evaluation (`ifModifiedSince`)                     | **Not implemented** (MAY) | `input.ifModifiedSince` is never read. `_buildUnchangedResult` (`:741-781`) is dead code. The spec says MAY, so this is not a violation, but the input contract says the field "is used for conditional status short-circuit".                                                                                                                                       |
| Verification projection when verifying disabled             | **Divergent (X2)**        | A change in `done` with verifying disabled gets a `VERIFICATION_REQUIRED` validity blocker and guidance toward verification.                                                                                                                                                                                                                                         |

### Discrepancies

- **HIGH – X2 surfaces here.** Status reports `VERIFICATION_REQUIRED` at `done`/`archivable` for schemas with verifying disabled. Both possibilities as in §2.
- **MEDIUM – drafted degradation.** Either (a) the code is wrong: apply the same failure policy to drafts (map both failure kinds to blockers, `schemaInfo=null`, never throw); or (b) the spec should restrict degradation to active changes and drop "(or the corresponding read-only view fields for drafts)".
- **MEDIUM – no structured details on `SCHEMA_IDENTITY_MISMATCH`.** Either add `details: { requested, returned }` (the `Blocker` type supports `details` elsewhere, e.g. validity blockers) or relax the spec to "message identifies".
- **LOW – `SCHEMA_RESOLUTION_FAILED` "recovery guidance"** is only prose, with no `command`. Either add a command such as `specd schemas show` or a config hint, or clarify that prose is enough.
- **LOW – `ifModifiedSince` is accepted but ignored.** Either implement it after reconciliation, or document it as reserved or remove it from the input.
- **LOW – the constructor duck-types `SchemaProvider | ResolveChangeSchema`** (`:410-431`). This is not a spec violation, but it is fragile: any provider object with an `execute` method would be taken for a resolver.

### Test Coverage (`packages/core/test/application/use-cases/get-status.spec.ts`)

- "projects workflow from the recorded sovereign schema instead of the workspace default" (`:119`)
- "returns artifacts with missing status when schema provider fails" (`:320`)
- "degrades before refresh or real reconciliation for any schema resolution failure" (`:338`). This one is strong: it uses a real `ReconcileChangeValidity` and asserts that `mutate` is not called.
- "emits SCHEMA_IDENTITY_MISMATCH and fail-closed empty transitions …" (`:383`)
- "populates complete checksByTarget and includes shortcut target …" (`:422`), "… with failing skip check and excludes shortcut" (`:446`), "permits shortcut when step-skip check set is empty" (`:493`)
- "projects read-only views with empty transitions for drafted changes" (`:997`), "does not reconcile drafted changes" (`:1455`)
- ifModifiedSince tests (`:1096-1170`) assert that **no** short-circuit happens.

### Weak or Missing Tests

- **The identity-mismatch test is weak.** The fake provider _throws_ `SchemaProviderIdentityMismatchError` itself (`:386-393`), so the test never exercises the resolver's comparison inside GetStatus. A provider that _returns_ a wrongly named schema is the real scenario.
- **Verification validity is faked.** Most tests use `makeObservingReconcile` (`test/application/use-cases/helpers.ts:1287-1305`), which maps absent verification to `'not-required'` regardless of state. That hides X2 completely: no GetStatus test shows `done`/`archivable` behavior with verifying disabled against the real reconciler.
- The sovereign test only asserts that `availableSteps` excludes `verifying` from `designing`. There is no check of artifact projection from the custom schema, and no check that the default schema is never requested (the mock `get` serves both names).
- No test for drafted changes with an identity mismatch or a non-NotFound failure (they throw today).
- No test asserting structured details on `SCHEMA_IDENTITY_MISMATCH`.
- "Status evaluation has no transition effects": no explicit assertion that hooks or mutation do not run during candidate evaluation.
- The "Passing bypass predicates" test (`:422`) asserts that `checksByTarget['verifying']` contains `protocol.edge` and `workflow.tasksEmpty`, but does not assert the step-skip predicate set explicitly.

### Spec Dependency Chain

- `core:resolve-change-schema` "Status may degrade identity mismatch distinctly" is consistent for active changes and inconsistent for drafts.
- `core:transition-checks` / `core:transition-change`: the shared evaluator is used by both, which is consistent.
- CLI `change-status` (dependent): the CLI renders the DAG from the workspace default (X6), so the core result is correct but the presentation contradicts sovereign status.

### Summary counts

9 requirements audited in depth: 5 implemented, 3 partial/violated, 1 not implemented (MAY). Discrepancies: 1 HIGH (X2), 2 MEDIUM, 3 LOW.

---

## 5. core:validate-artifacts

### Requirements Summary (changed)

"Sovereign schema resolution" (the merged heading is still **"Schema name guard"**): obtain the schema through `ResolveChangeSchema`; the default is irrelevant; failures and identity mismatch propagate before artifact state changes.

### Implementation Status

| Requirement                     | Status      | Evidence                                                                                                                                                                               |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sovereign schema resolution     | Implemented | `validate-artifacts.ts:178-185` resolves right after load, before any state change. Composition passes the shared resolver (`composition/use-cases/validate-artifacts.ts:53,121,133`). |
| Propagation before state change | Implemented | No try/catch around resolution                                                                                                                                                         |

### Discrepancies

- **LOW – spec artifact.** The delta used `op: modified` with a new heading inside `content`, so the merged spec keeps the heading `Requirement: Schema name guard` while the body describes sovereign resolution. Either use a rename operation or accept the stale heading.
- **LOW – spec verify inconsistency.** The scenario expects `SchemaProvider.get('custom-workflow@1.0.0')` (name@version). The resolver calls `get(schemaName)` with the bare recorded name. Fix the scenario text.
- **LOW – "Ports and constructor"** still lists 8 deps and does not mention the optional `resolveChangeSchema` (or the other deps the class now takes). The `_schemaProvider` field is stored but only read in the constructor (1 reference).

### Test Coverage

- `validate-artifacts.spec.ts:160` "resolves sovereign schema by change.schemaName"
- `:140` "throws SchemaNotFoundError when schema cannot be resolved"

### Missing Tests

- No identity-mismatch test (a provider returning the wrong name), and no assertion that artifact state and persistence are untouched on failure.
- No differing-default scenario: the mock returns the same schema for any argument.

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## 6. core:run-step-hooks

### Requirements Summary (changed)

"Sovereign schema resolution" (heading still "Schema name guard"): resolve through `ResolveChangeSchema`; failures propagate before any hook runs.

### Implementation Status

| Requirement                                       | Status      | Evidence                                                           |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Sovereign resolution (active)                     | Implemented | `run-step-hooks.ts:166-170`, before any hook runs                  |
| Sovereign resolution (archived post-archive path) | Implemented | `:119-123` uses the archived record's `schemaName`/`schemaVersion` |
| Composition                                       | Implemented | `composition/use-cases/run-step-hooks.ts:47,107`                   |

### Discrepancies

- **LOW – stale heading** (same delta artifact as §5).
- **LOW – "Ports and constructor"** code block shows a 5-argument constructor without the resolver.
- **LOW – ordering.** Resolution happens before `StepNotValidError` validation. The spec does not fix the order, but an invalid step on a broken schema reports the schema error first.

### Test Coverage

- `run-step-hooks.spec.ts:90` "resolves schema by change.schemaName"; `:78` "throws SchemaNotFoundError when schema cannot be resolved"

### Missing Tests

- No identity mismatch test, and no assertion that no hook runs (`HookRunner.run` not called) when resolution fails.
- No sovereign test for the archived post-archive path.
- No test for the scenario "hooks defined in `custom-workflow` are resolved and executed" (the existing test only checks that `get` was called and success).

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## 7. core:preview-spec

### Requirements Summary (changed)

"Sovereign schema resolution" (heading still "Schema name guard"): resolve through `ResolveChangeSchema`; identity mismatch propagates as `SchemaProviderIdentityMismatchError`.

### Implementation Status

| Requirement          | Status      | Evidence                                                                 |
| -------------------- | ----------- | ------------------------------------------------------------------------ |
| Sovereign resolution | Implemented | `preview-spec.ts:105-112`, with no try/catch, so the mismatch propagates |
| Composition          | Implemented | `composition/use-cases/preview-spec.ts:40,96`                            |

### Discrepancies

- **LOW – intra-spec tension.** "Error handling" says "The preview MUST always succeed — partial results are acceptable, total failure is not", while "Schema name guard" requires identity mismatch to propagate (a total failure). The scope is reasonably per-file merge and diff errors, but the absolute wording conflicts. Either qualify "always succeed" as applying to per-file failures, or degrade schema errors into warnings. The code matches the propagation reading.
- **LOW – stale heading; "Ports and constructor"** omits the resolver.
- **LOW – CLI `spec-preview --artifact`** resolves the artifact type from `getActiveSchema` (`packages/cli/src/commands/change/spec-preview.ts:74`), not from the change's schema (X6).

### Test Coverage

- `preview-spec.spec.ts:140` "resolves schema by change.schemaName"

### Missing Tests

- No identity mismatch propagation test.
- No `SchemaNotFoundError` propagation test.
- No differing-default scenario (the mock returns the same schema for any name).

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## Consumers that skip the shared resolver or use the workspace default

| Consumer                                                                                                                                                                                                                          | Kind                      | Issue                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ReconcileChangeValidity._apply` (`reconcile-change-validity.ts:203`)                                                                                                                                                             | change-bound, mutating    | Named lookup without an identity check or advisory (X1)                                                                             |
| `FsChangeRepository` hydrate/save (`composition-resolver.ts:439-442`; `change-repository.ts:665,1337,1480`)                                                                                                                       | change-bound, persisting  | Workspace-default artifact types drive `syncArtifacts` and filename normalization (X3); default-version warning (X4)                |
| CLI `changes status` (`cli/.../status.ts:237,401`)                                                                                                                                                                                | change-bound presentation | DAG from `getActiveSchema` overrides `schemaInfo` (X6)                                                                              |
| CLI `changes validate` (`validate.ts:221,308,489`), `spec-preview` (`:74`), `artifacts` (`:56`)                                                                                                                                   | change-bound presentation | Artifact lookup from the workspace default (X6, not deep-audited here)                                                              |
| `schemaProvider.get()` with no argument: `resolve-initial-persisted-depends-on.ts:59`, `validate-specs.ts:124`, `get-spec-outline.ts:65`, `generate-spec-metadata.ts:94`, `get-project-context.ts:143`, `get-spec-context.ts:391` | spec/project-scoped       | Not change-bound, so acceptable, except check whether `resolve-initial-persisted-depends-on` is ever called with a change in scope. |

## Totals (this batch)

- HIGH: 3 (X1 reconciler bypass, X2 disabled-verifying `verificationRequired`, X3 repository default-schema artifact sync)
- MEDIUM: 6 (X4 repository default-version warning plus change-manifest verify contradiction, X5 resolver result contract, resolver composition factory missing, GetStatus drafted degradation, GetStatus identity details missing, StartVerification ordering; X6 CLI default-schema DAG, cross-batch)
- LOW: ~14 (stale "Schema name guard" headings ×3, Ports sections ×3, validate-artifacts `name@version` scenario, preview "always succeed" tension, ifModifiedSince ignored, recovery-guidance prose only, duck-typed ctor, default-constructed resolver fallbacks, run-step-hooks ordering, change-manifest warning "surfaced")
- Weak tests to flag: GetStatus identity test (the provider throws the error itself); `makeObservingReconcile` fakes absent verification as `not-required`, which hides X2; sovereign tests use mocks that answer any name; no caller-level identity-mismatch tests for validate-artifacts, run-step-hooks or preview-spec; `change-repository.spec.ts:2687` asserts forbidden behavior.
