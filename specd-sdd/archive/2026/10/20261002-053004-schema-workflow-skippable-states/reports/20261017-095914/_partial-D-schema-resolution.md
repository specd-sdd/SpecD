# Partial D: Sovereign schema resolution and the change aggregate

Change: `schema-workflow-skippable-states`
Specs: `core:resolve-change-schema`, `core:change` (delta-scoped), `core:fs-change-repository`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`
Method: merged spec content from `changes spec-preview`. The code was read directly: grep and Read in `packages/core/src` and `packages/cli/src`. No mutating specd commands were run.

---

## 0. Classification of `schemaProvider.get(` calls (packages/core/src)

| Call site                                                          | Form                    | Change-bound?                                                                                                                                                                                                       | Verdict                            |
| ------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `application/services/resolve-change-schema.ts:62`                 | `get(input.schemaName)` | yes (this is the boundary)                                                                                                                                                                                          | OK                                 |
| `application/use-cases/generate-spec-metadata.ts:94`               | `get()` (unnamed)       | **yes, transitively.** `ArchiveChange` calls it for post-archive metadata (`archive-change.ts:605` → `MaterializeSpecMetadata` → `GenerateSpecMetadata`). `CompileContext` also calls it through `GetSpecMetadata`. | **Violation for archive** (see X1) |
| `application/use-cases/get-spec-context.ts:391`                    | `get()`                 | no (spec-scoped, project context)                                                                                                                                                                                   | OK                                 |
| `application/use-cases/get-spec-outline.ts:65`                     | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/get-project-context.ts:143`                 | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/validate-specs.ts:124`                      | `get()`                 | no                                                                                                                                                                                                                  | OK                                 |
| `application/use-cases/resolve-initial-persisted-depends-on.ts:59` | `get()`                 | no (spec persisted state init)                                                                                                                                                                                      | OK                                 |

No other `_schemaProvider.get(`/`schemaProvider.get(` exists. Every change-bound use case in this batch (`EditChange`, `InvalidateChange`, `CountTasks`, `StartVerification`, `ReconcileChangeValidity`, `ValidityFingerprintService`) goes through `ResolveChangeSchema`. The composition resolver injects the shared instance (`composition-resolver.ts:579-583`, `:709-720`; `composition/use-cases/{edit-change,invalidate-change,count-tasks}.ts`, `verification-factories.ts:47,125,249`).

One caveat: each consumer still keeps a `?? new ResolveChangeSchema(schemaProvider)` constructor fallback (for example `edit-change.ts:111`, `invalidate-change.ts:98`, `count-tasks.ts:37`, `validity-fingerprint-service.ts:52-53`, `start-verification.ts:66-67`). See X5.

---

## 1. core:resolve-change-schema

### Requirements Summary

- An input/result contract: `{schema, warnings}`, with no workspace-default dependency.
- A sovereign named lookup that has no unnamed or default fallback.
- A provider identity check that throws `SchemaProviderIdentityMismatchError` when the returned name differs.
- A same-name version mismatch gives a non-blocking typed advisory, never one computed against the default.
- Failure propagation: mutators stop; status may degrade, with distinct codes.
- A shared boundary for every change-bound operation (reconciler, repo sync, archive incl. post-archive metadata, CLI DAG commands). Callers propagate warnings.
- Composition: `createResolveChangeSchema(deps|config)` and `kernel.changes.resolveSchema` as the shared instance.

### Implementation Status

| Requirement                         | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input and result contract           | Implemented                            | `resolve-change-schema.ts:6-40,61-85`. The input has an extra `changeName`, which is harmless.                                                                                                                                                                                                                                                                                     |
| Sovereign named lookup              | Partial at the provider level          | The service calls `get(schemaName)` (`:62`). But `LazySchemaProvider.get(ref)` always resolves the workspace default first (`composition/lazy-schema-provider.ts:40-48`) before it resolves `ref`. See X2.                                                                                                                                                                         |
| Provider identity integrity         | Implemented                            | `:64-70`. The error is `application/errors/schema-provider-identity-mismatch-error.ts`, extends `SpecdError`, code `SCHEMA_PROVIDER_IDENTITY_MISMATCH`, and carries the requested and returned names.                                                                                                                                                                              |
| Same-name version advisory          | Implemented                            | `:72-82` emits `SCHEMA_VERSION_DRIFT` with `recordedVersion` and `resolvedVersion`. The repo and manifest loader have no version warning (no `warn` in `infrastructure/fs/change-repository.ts`, `manifest-change-loader.ts`).                                                                                                                                                     |
| Failure propagation / caller policy | Implemented for this batch's consumers | Errors propagate unchanged. `GetStatus` maps them to `SCHEMA_IDENTITY_MISMATCH` and `SCHEMA_RESOLUTION_FAILED` (`get-status.ts:386-391`).                                                                                                                                                                                                                                          |
| Shared change-operation boundary    | Partial                                | Reconciler (`reconcile-change-validity.ts:206`), fingerprints (`validity-fingerprint-service.ts:120`), repo sync (`composition-resolver.ts:441-455`) and CLI DAG commands (`cli/src/helpers/change-schema.ts:15-36`, used by status/validate/spec-preview/artifacts) all use the resolver. **Post-archive metadata materialization does not** (X1). The CLI drops `warnings` (X4). |
| Composition                         | Implemented                            | `composition/use-cases/resolve-change-schema.ts:35-81`. The config form goes through `createCompositionResolver(...).getResolveChangeSchema()`. Kernel: `kernel.ts:373,433` uses `resolver.getResolveChangeSchema()`, the same memoized instance injected into consumers.                                                                                                          |

### Discrepancies

- **X1 [HIGH] Post-archive spec metadata materialization uses the workspace default.**
  - The spec text: "archive operations (including post-archive spec metadata materialization for the archived change's specs)".
  - The code path: `archive-change.ts:605` calls `this._materializeMetadata.execute({ specId, policy: 'force' })`, which goes through `MaterializeSpecMetadata` to `GenerateSpecMetadata.execute`. That calls `this._schemaProvider.get()` unnamed (`generate-spec-metadata.ts:94`). Neither `MaterializeSpecMetadataInput` (`materialize-spec-metadata.ts:20-25`) nor `GenerateSpecMetadataInput` (`generate-spec-metadata.ts:33-38`) can carry a schema.
  - For a `custom-workflow` change, the archived specs' metadata is extracted with the default schema's `metadataExtraction` rules.
  - Possibilities: (a) implementation bug: thread the change's resolved schema (or schema name) into materialize/generate for archive; or (b) spec drift: remove the parenthetical, if metadata is deliberately project-scoped.
  - The spec is explicit, so (a) is more likely. This belongs to the archive-change batch, but the shared-boundary requirement is in this spec.
  - `CompileContext` has the same transitive path through `GetSpecMetadata` (LOW, context-only).
- **X2 [MEDIUM] `LazySchemaProvider` always resolves the workspace default before a named lookup.**
  - The code: `lazy-schema-provider.ts:40-48` runs `this._resolve.execute()` for the default on every first call, even when `ref` names a different schema.
  - If the workspace default is missing or invalid, resolving `custom-workflow` for an existing change throws. That breaks the constraint "The workspace default cannot authorize, reject, or alter an existing change's schema resolution". It also breaks the verify text "the workspace default is not requested" (scenario "Named lookup failure does not fall back").
  - Possibilities: (a) implementation bug: only resolve the default when `ref === undefined`, or when `ref` matches `schemaRef` or a cached default name; or (b) spec drift: limit the "not requested" wording to the `ResolveChangeSchema` call contract.
  - The constraint wording favours (a).
- **X3 [LOW] Repo sync swallows `SchemaProviderIdentityMismatchError`.**
  - The code: `composition-resolver.ts:448-453` returns `null` (skip sync) for both `SchemaNotFoundError` and identity mismatch.
  - This matches fs-change-repository "skip artifact synchronization", and no schema-derived data is used. But identity mismatch is silent at load time. This is acceptable; note it for traceability.
  - The `null` result is cached per schema name for the repository's lifetime (`change-repository.ts:347-351`).
- **X4 [LOW–MEDIUM] CLI DAG commands discard `warnings`.**
  - The code: `status.ts:236,408`, `validate.ts:222,245`, `spec-preview.ts:78` and `artifacts.ts:57` read only `.schema`.
  - The spec says: "Callers that surface diagnostics SHALL propagate the returned warnings". `changes status` also gets them from `GetStatus` (`get-status.ts:500,841`), so the impact is limited to validate, spec-preview and artifacts.
  - Possibilities: (a) surface the warnings in those presenters; or (b) narrow the requirement to callers with structured diagnostic results.
- **X5 [LOW] Per-consumer default construction.**
  - `?? new ResolveChangeSchema(schemaProvider)` in every consumer creates a non-shared instance when the dependency is omitted. The spec allows "an equivalent dependency resolved from the same canonical composition boundary". The fallback is equivalent in behaviour but not composed through the boundary.
  - It also keeps vestigial `_schemaProvider` fields (`edit-change.ts:77`, `invalidate-change.ts:74`, `count-tasks.ts:34`).
  - Fix options: either make `resolveChangeSchema` required, or document the fallback.
- **X6 [LOW] "use case" vs service placement.** The spec calls it a use case. The class lives in `application/services/` and its factory in `composition/use-cases/`. This is acceptable under the architecture spec ("use cases and application services"); wording drift only.
- **X7 [LOW] Error message is not actionable.** `schema-provider-identity-mismatch-error.ts:27-28` states the facts without remediation guidance, which `_global/error-handling-conventions` asks for ("tell the user how to fix"). The JSDoc for `execute` (`:59`) omits the propagating `SchemaNotFoundError`/`SchemaValidationError`.

### Test Coverage

- Matching schema with no advisory: `test/application/services/resolve-change-schema.spec.ts:36`.
- Different default never consulted: `:55`. It uses a keyed fake that rejects unnamed `get()`. The real `LazySchemaProvider` is not covered.
- Named lookup failure propagates: `:78`.
- Identity mismatch, typed with both names: `:91`.
- Version drift advisory, with no logging: `:128`.
- Status degrades with `SCHEMA_IDENTITY_MISMATCH`: `test/application/use-cases/get-status.spec.ts:393,1124`.
- Advisory on the status result: `get-status.spec.ts:1167`.
- Kernel mapping only: `test/barrel-kernel-coverage.spec.ts:17`.

### Missing Tests

- "Workspace default version does not create advisory". No test has the same name, the default at v9 and the record at v1.
- `LazySchemaProvider` named lookup with a different or broken default. `test/composition/lazy-schema-provider.spec.ts` tests only unnamed `get()`, which is what would expose X2.
- `createResolveChangeSchema(deps)` and `createResolveChangeSchema(config)` both working (verify "Kernel exposes the shared resolver").
- `kernel.changes.resolveSchema` being the same instance injected into change-bound use cases.
- "Reconciler, repository sync, and CLI DAG use the shared resolver" end-to-end with a `custom-workflow` change and a different default. Only unit-level pieces exist.
- Archive post-archive metadata using the change schema (X1).

### Spec Dependency Chain

- `core:change`: consistent; the Schema version requirement now delegates advisories to this boundary.
- `core:schema-format`: not contradicted.
- `_global/error-handling-conventions`: the error extends `SpecdError` and the code is UPPER_SNAKE. The message is not actionable (X7).

---

## 2. core:change (delta-scoped requirements)

### Requirements Summary

The delta adds or modifies these requirements:

- StartVerification sovereign schema resolution.
- Schema version, now sovereign: no default rejection, identity mismatch is fatal, version drift is advisory only in the resolver.
- Sovereign schema for validity fingerprints.
- Verification requirement follows workflow topology.
- Signoff gate, which now follows topology.
- Artifact sync from the change's schema.
- A new `core:workflow-topology` dependency.

### Implementation Status

| Requirement                            | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StartVerification sovereign resolution | Implemented (ordering note) | `start-verification.ts:122-131` resolves before building the `verification-start` check context. Refresh (`:80`) and reconcile (`:81`) run first, but the reconciler resolves through the same boundary first (`reconcile-change-validity.ts:206`). So a failure still propagates before any attempt is created (`:84-97`).                                                 |
| Schema version                         | Implemented                 | Change-bound consumers resolve by `change.schemaName`. No repo or loader version warning. Identity mismatch comes from the resolver.                                                                                                                                                                                                                                        |
| Sovereign fingerprints                 | Implemented                 | `validity-fingerprint-service.ts:120-128` takes the artifact set and `hasTasks` exclusions from the resolved schema. Failures propagate with no fallback.                                                                                                                                                                                                                   |
| Verification follows topology          | Implemented                 | `reconcile-change-validity.ts:225,296-297`: `isWorkflowStepEnabled('verifying', schema) && VERIFICATION_STATES.has(state)`. The verdict is `not-required` (`change-validity.ts:485`). The `verification.current` check skips on `not-required` (`domain/checks/verification-current.ts`). `approve-signoff.ts:107-126` skips verification gates when verifying is disabled. |
| Signoff gate                           | Implemented                 | As above. Sign-off is only accepted in `done`/`pending-signoff` (`approve-signoff.ts:112`).                                                                                                                                                                                                                                                                                 |
| Artifact sync from the change schema   | Implemented                 | `syncArtifacts` is fed by `_artifactTypesFor({schemaName: change.schemaName})` (`change-repository.ts:686-691,1468-1503`).                                                                                                                                                                                                                                                  |

### Discrepancies

- **C1 [LOW] `VERIFICATION_STATES` ordering vs the spec list.** The code set (`reconcile-change-validity.ts:278-285`) has the same members as the spec list: verifying, done, pending-signoff, signed-off, archivable, archiving. Consistent; no action needed.
- **C2 [LOW] Dead `Change.updateSpecIds`.** `domain/entities/change.ts:1639` has no production caller after the EditChange rewrite. edit-change explicitly forbids calling it. Either remove it or keep it as legacy API. This is only drift risk.
- **C3 [LOW] Missing `@throws` for resolver errors.** `start-verification.ts:75-77` and `reconcile-change-validity.ts:124` do not document `SchemaProviderIdentityMismatchError` or `SchemaNotFoundError`, which `_global/error-handling-conventions` requires for use cases.

### Test Coverage

- StartVerification readiness from the change schema: `test/application/use-cases/start-verification.spec.ts:127`. The failure creates no attempt: `:140`.
- Disabled verifying gives `not-required` with no VERIFICATION\_\* blockers: `reconcile-change-validity.spec.ts:300`. Enabled verifying gives `absent`: `:290`.
- Fingerprints use the sovereign schema: `test/application/services/validity-fingerprint-service.spec.ts:172`. No fallback evidence on failure: `:203`.
- Signoff without verification when verifying is disabled: `approve-signoff.spec.ts:182,194`.
- Archive integrity failure and the recorded schema used: `archive-change.spec.ts:314,334`.
- `syncArtifacts` basic behaviour: `test/domain/entities/change.spec.ts:1218-1311`.

### Missing Tests

- Verify scenario "Reconciler resolves the schema through ResolveChangeSchema": the identity mismatch should fail and persist no projection. No `IdentityMismatch` test exists in `reconcile-change-validity.spec.ts`.
- "Enabled verifying still requires evidence at done": `:290` asserts `absent` but does not assert the `VERIFICATION_REQUIRED` blocker.
- "Schema version mismatch does not block archive": no archive test with same-name version drift.
- "Different workspace default does not reject an existing change" at load time with a real composition. The fs test `change-repository.spec.ts:2667` uses no resolver at all.
- "Custom-schema change is never synced from the workspace default": no test with two schemas and different artifact sets.
- StartVerification with a _different_ default schema. The test at `:127` only asserts that the lookup name equals `test-schema`; it does not show that the default's topology or checks are unused.

### Spec Dependency Chain

- `core:workflow-topology` (`isWorkflowStepEnabled`): it is used consistently in the reconciler, approve-signoff, lifecycle-evaluation and lifecycle-verdict.
- `core:resolve-change-schema`: consistent.

---

## 3. core:fs-change-repository

### Requirements Summary

- `resolveArtifactTypes` receives the change's schema reference and returns the sovereign artifact types through `ResolveChangeSchema`.
- All load and save paths use it.
- An unresolvable schema skips sync and leaves the map unchanged.
- No version warning against the default.

### Implementation Status

| Requirement                                   | Status      | Evidence                                                                                                                                         |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Callback takes the change's schema reference  | Implemented | `ChangeSchemaRef` and the callback type at `change-repository.ts:87-105`. Composition wiring: `composition-resolver.ts:441-455`.                 |
| All sync paths use the recorded schema        | Implemented | `_persistManifest` (used by save/mutate/create) `:686-691`. `_manifestToChange` (get/list) `:1367-1371,1503`. Scaffold `:895-901`.               |
| Unresolvable schema: skip sync, map unchanged | Implemented | `null` maps to `[]`, and `artifactTypes.length > 0` guards sync and normalization (`:1373,1502`). Raw artifacts are preserved from the manifest. |
| No version warning vs the default             | Implemented | No `Logger.warn` or version comparison in the fs repository or loader.                                                                           |

### Discrepancies

- **F1 [LOW] Stale `activeSchema` callback in the existing requirement.** The "Validate options at construction" requirement (merged spec, line 14) lists an `activeSchema` callback in `ChangeRepositoryConfig`. The code has none (`change-repository.ts:96-108`); `activeSchema` does not appear in the repository or the resolver.
  - Possibilities: (a) spec drift: remove `activeSchema`, which is consistent with the new sovereign requirement; or (b) restore a callback, which is unlikely and would contradict the new requirement.
- **F2 [LOW] The artifact-type cache keys only on schema name, and caches `null` for the repository's lifetime.** A transient `SchemaNotFoundError` (for example a plugin loaded later) disables sync until the process restarts. This is acceptable for CLI lifetimes, but the spec does not mention it.
- **F3 [LOW] Identity mismatch is swallowed into a skipped sync.** Same as X3.

### Test Coverage

- No default consulted on hydrate (no resolver configured): `test/infrastructure/fs/change-repository.spec.ts:2667`.
- No version warning on load: `:2686`.
- The callback receives the change's schema identity, cached per name: `:2695-2718`.
- Unresolvable schema skips sync, with no `artifacts-synced`: `:2720-2747`.
- Composition callback resolves real schema-std types: `test/composition/shared-repository-wiring.spec.ts:79-90`.

### Missing Tests

- "Custom-schema change syncs against its own artifact types" with a different `config.schemaRef`. No test configures two schemas and checks that the persisted map contains no default types after `get` and `mutate`.
- The no-version-warning test at `:2686` does not set up a recorded v1 against a default v2 (no default exists in that harness), so it passes vacuously.
- The composition `resolveArtifactTypes` returning `null` on `SchemaNotFoundError` or identity mismatch (`composition-resolver.ts:448-453`) is untested.

### Spec Dependency Chain

- `core:resolve-change-schema`: consistent.
- `core:change` "Artifact sync": consistent.

---

## 4. core:edit-change

### Requirements Summary

- The compatibility guardrail uses the change's sovereign schema.
- Uninitialized specs adopt the change schema, with no `GetActiveSchema`.
- Resolve once before mutation.
- The serialized mutation uses `replaceSpecIds` plus `ctx.reconcileAfter()`, with no `updateSpecIds` and no second lookup.
- Errors abort before or without persistence.

### Implementation Status

| Requirement                                             | Status      | Evidence                                                                                                                   |
| ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compatibility via `ResolveChangeSchema`                 | Implemented | `edit-change.ts:142-160`. Name match or `schema.compat()?.name`. Throws `IncompatibleSchemaError`.                         |
| Uninitialized spec adopts the change schema             | Implemented | `:152`: when `persisted.schema === null` it uses `schema.name()`, which is always compatible. No `GetActiveSchema` import. |
| Single resolution before mutation                       | Implemented | One `execute` call (`:143`) runs before `_executeScopeEdit`.                                                               |
| `replaceSpecIds` + `reconcileAfter`, no `updateSpecIds` | Implemented | `:227-259`. `updateSpecIds` has no callers in `src`.                                                                       |
| Errors stop persistence                                 | Implemented | A resolution error throws before `mutate`. A reconcile rejection runs inside `_reconcile.mutate`.                          |

### Discrepancies

- **E1 [LOW] Resolution also runs for removal-only edits.** The resolver runs when `hasSpecChanges`, including remove-only, even though compatibility is only checked for adds. The spec says "MUST resolve that sovereign schema once before mutation when validating added-spec compatibility". This is harmless (it fails closed) but stricter than specified. It could also be read as intended fail-closed behaviour.
- **E2 [LOW] Advisory warnings are dropped.** `EditChangeResult` has no warnings channel. This relates to the "Callers that surface diagnostics" rule; `EditChange` exposes no diagnostics, so it is likely acceptable.
- **E3 [LOW] Conventions.**
  - The `import { ResolveChangeSchema }` sits mid-file at `edit-change.ts:65`, after the type declarations.
  - `@throws` (`:119`) omits `IncompatibleSchemaError`, `SchemaProviderIdentityMismatchError` and `SchemaNotFoundError`.
- **E4 [LOW] Constructor requirement drift.** The merged spec (line 105, constructor list line 118) lists `SchemaProvider` but not the optional `ResolveChangeSchema` constructor parameter (`:100`).

### Test Coverage

- Compatibility and DAG sync use `custom-workflow`, `get` is called once with the name, and the default throws if consulted: `test/application/use-cases/edit-change.spec.ts:485`. This also covers the uninitialized spec, because `auth/logout` has no `spec-lock`.
- Resolution failure leaves scope unchanged: `:522`.
- Reconcile rejection is atomic (no partial scope, history, artifacts or validity): `:434`.
- Same, compatible and incompatible schemas: `:564,593,624`.

### Missing Tests

- An explicit assertion that `replaceSpecIds` and `reconcileAfter` are invoked and `updateSpecIds` is not. This is structurally true but not asserted.
- The test named `:541` "allows uninitialized spec fallback when global schema matches change" still carries the wording of the REMOVED scenario. It should be renamed, or replaced with the new scenario (an incompatible default and an uninitialized spec accepted).

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## 5. core:invalidate-change

### Requirements Summary

- Resolve through `ResolveChangeSchema` after loading.
- Derive targets, global targets and downstream propagation from the change DAG.
- No default.
- Errors propagate before persistence.

### Implementation Status

| Requirement                    | Status      | Evidence                                                                                                                                                                                          |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve after load             | Implemented | `invalidate-change.ts:107-126`                                                                                                                                                                    |
| Targets from the sovereign DAG | Implemented | `resolveTargets(..., schema.artifacts())` at `:130`; `globalTargets(change, schema)` at `:138,341-343`. Downstream expansion happens in the reconciler, which resolves through the same boundary. |
| Errors before persistence      | Implemented | Resolution (`:122`) runs before `_reconcile.execute` (`:146`).                                                                                                                                    |

### Discrepancies

- **I1 [LOW] Double resolution.** Both `InvalidateChange` and the reconciler resolve the schema (memoized by `LazySchemaProvider`). This is consistent but redundant.
- **I2 [LOW] Missing `@throws`.** The JSDoc does not document resolver errors (`@throws` near `:237` only).

### Test Coverage

- Targets come from the change schema: `test/application/use-cases/invalidate-change.spec.ts:158`.
- A failure persists nothing: `:180`.

### Missing Tests

- The test at `:158` uses a change whose `schemaName` is `@specd/schema-std`, the same schema as the harness default. The verify scenario needs a `custom-workflow` change whose DAG differs from the default. The current test cannot detect a default leak where the two names coincide.

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## 6. core:count-tasks

### Requirements Summary

- `execute({change})` resolves through `ResolveChangeSchema` and derives task artifacts and patterns from it.
- No default.
- Errors propagate.

### Implementation Status

| Requirement          | Status      | Evidence                          |
| -------------------- | ----------- | --------------------------------- |
| Sovereign resolution | Implemented | `count-tasks.ts:48-52`            |
| No default influence | Implemented | Only the resolved schema is used. |
| Errors propagate     | Implemented | No catch.                         |

### Discrepancies

- **T1 [LOW] Existing requirements are stale relative to the new one.**
  - Merged spec line 12: "obtain the resolved schema through `SchemaProvider`".
  - Merged spec line 35: "MUST accept `ChangeRepository` and `SchemaProvider` as constructor dependencies".
  - The new requirement mandates `ResolveChangeSchema`, and the constructor also takes an optional `ResolveChangeSchema` (`:35`).
  - Possibility: spec drift in the untouched requirements. Update them to say "through `ResolveChangeSchema` (backed by `SchemaProvider`)".
- **T2 [LOW] Vestigial `_schemaProvider`.** The private field at `:34` is only used for the fallback (X5).

### Test Coverage

- Counts tasks declared only by the custom schema; the default throws if consulted: `test/application/use-cases/count-tasks.spec.ts:17`.
- A failure gives no fallback counts: `:48`.

### Missing Tests

None for the delta scenarios.

### Spec Dependency Chain

`core:resolve-change-schema`: consistent.

---

## Cross-cutting consistency with global specs

- `_global/architecture`:
  - The application layer depends on ports only: the resolver imports only the `SchemaProvider` port and domain values. OK.
  - The config factory goes through the shared resolver. OK.
  - The kernel capability is also obtainable via `createResolveChangeSchema`, which is exported from `public.ts:337`. OK.
- `_global/error-handling-conventions`:
  - `SpecdError` subclass and UPPER_SNAKE code: OK.
  - Actionable message: missing (X7).
  - `@throws` on use cases: missing for resolver errors in EditChange, InvalidateChange, CountTasks, StartVerification and ReconcileChangeValidity (C3, E3, I2).
- `_global/testing`: unit tests use keyed fakes that reject unnamed `get()`, which is good. There are no integration tests with two real schemas: the gaps listed above.

## Summary

| Severity | Count | IDs                                                                                                                                                      |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 1     | X1 (post-archive metadata materialization uses the workspace default)                                                                                    |
| MEDIUM   | 2     | X2 (`LazySchemaProvider` always resolves the default before a named lookup), X4 (CLI validate/spec-preview/artifacts drop resolver warnings; LOW–MEDIUM) |
| LOW      | 16    | X3, X5, X6, X7, C1 (no action needed), C2, C3, F1, F2, F3, E1, E2, E3, E4, I1, I2, T1, T2 (some grouped)                                                 |

Requirements audited: 22 across 6 specs. Implemented: 20. Partial: 2 (resolve-change-schema "Sovereign named lookup" at the provider level, and "Shared change-operation boundary" for archive metadata).

Main missing tests:

- Reconciler identity-mismatch.
- A different-default load/sync integration for the fs repository.
- `LazySchemaProvider` named lookup with a broken default.
- Factory and kernel instance-identity tests.
- Archive with version drift.
- InvalidateChange with a non-default schema name.
- A rename or replacement of the stale EditChange "global schema fallback" test.
