# Spec compliance partial — core archive / validate / storage / instruction / schema-format

**Change:** `workflow-transition-checks`  
**Mode:** change (delta-applied via `changes spec-preview`)  
**Read-only.** No code or spec files modified.  
**Graph:** `graph search "ValidateArtifacts"` returned symbols (index may still be stale / prior index failed). Implementation checks used Read after graph locate.

**Product decision (H2):** CODE WINS — `FsChangeRepository.get` owns baseline `validatedHash` vs disk invalidation with `SYSTEM_ACTOR`. `ValidateArtifacts` does **not** own baseline drift; it only compares approval/signoff `artifactHashes` after `get()`.

**Re-audit of 144106:** H2 / M3 / M4 / M5 all **CLOSED**. No HIGH. Unique severity this batch: **LOW**.

---

## Previously OPEN table (144106) — re-check

| ID                                          | Prior status (144106)                                               | This audit                 | Evidence                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H2**                                      | CLOSED — confirm no regression                                      | **CLOSED** (no regression) | Specs: storage load owns baseline; validate MUST NOT compare `validatedHash`. Code: `change-repository.ts` ~1523–1574 `invalidate(..., SYSTEM_ACTOR)`; `validate-artifacts.ts` `get()` then consent scan only. Tests: `Hash mismatch on load invalidates with artifact-drift`; `ValidateArtifacts does not own baseline validatedHash drift` (`mutate` not called). |
| **M3**                                      | OPEN — factory spec.md listed `runStepHooks` / `regenerateMetadata` | **CLOSED**                 | Preview spec.md _Config-based factory…_ lists `archiveBindings`, `materializeMetadata`, `contentHasher` and MUST NOT resolve `runStepHooks`/`regenerateMetadata`. `resolveArchiveChangeDeps` matches. First verify scenario matches. Leftover **LOW**: second verify scenario still says `regenerateMetadata: RegenerateSpecMetadata`.                              |
| **M4**                                      | OPEN — consent scan not `--artifact` scoped                         | **CLOSED**                 | Spec: scan iterates `schema.artifacts()`; `artifactId` MUST NOT skip consent; complete-file bypass is structural only. Code: loop `schema.artifacts()` before `artifactTypesToValidate`. Test: `scans consent hashes across all artifacts even when artifactId is set`. Verify: _Consent-hash scan is not scoped to artifactId_.                                    |
| **M5**                                      | OPEN — same-execute DAG recompute vs persist+evaluate               | **CLOSED**                 | Spec: one `evaluate` then `markVerdictComplete` in-memory; MUST NOT persist-and-re-evaluate; MUST NOT re-walk pending-parent cascade. Code: `evaluate` once; patch `effectiveStatus: 'complete'`. Test: parent+child same `execute`, `evaluateSpy` `toHaveBeenCalledTimes(1)`. Verify: _Lifecycle snapshot refreshes after markComplete in same execute_.           |
| Lock-without-plan sealed `dependsOn`        | CLOSED                                                              | **CLOSED**                 | `resolveSealedArchiveDependsOn`: plan → lock → `resolveInitial` → extract/`[]`. Test _Lock without a plan keeps lock dependsOn_ throws `ArchiveDependencyMismatchError`, `resolveInitial` not called.                                                                                                                                                               |
| `graph.excludePaths` at archive materialize | CLOSED                                                              | **CLOSED**                 | `_materializeImplementationLinks` uses `ListWorkspaces.excludePathsFor(workspace)` then `isExcludedByPrefix`. Test _Excluded path is ignored…_ (project-level). `excludePathsFor` merges project + workspace prefixes.                                                                                                                                              |
| `contentHasher` vs ctor `hasher`            | CLOSED                                                              | **CLOSED**                 | Deps field `contentHasher`; ctor param `hasher` on ValidateArtifacts and ArchiveChange. Spec validate factory: “The constructor parameter remains `hasher`.”                                                                                                                                                                                                        |

---

## Critical re-checks

### H2 — Dual ownership of baseline artifact-drift — **CLOSED** (no regression)

**Delta-applied specs agree (CODE WINS):**

- `core:storage` › Artifact status derivation: when `artifactTypes.length > 0`, load detects baseline drift vs `validatedHash` and calls `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat that comparison. Consent-hash drift stays on the use case.
- `core:validate-artifacts` › Policy-aware drift materialization: MUST NOT compare disk to `validatedHash`, MUST NOT mark `hasDrift` for that reason, MUST NOT invalidate for baseline mismatch. Load via `ChangeRepository.get` first. Approval/signoff scan uses `ActorResolver`, not `SYSTEM_ACTOR`.
- Verify: _ValidateArtifacts does not own baseline validatedHash drift_; _Consent-hash drift still invalidates once…_; storage _Hash mismatch on load invalidates with artifact-drift_.

**Code matches:**

- `packages/core/src/infrastructure/fs/change-repository.ts` (~1523–1574): grouped `invalidate(..., SYSTEM_ACTOR, ...)` after hash/status derivation.
- `packages/core/src/application/use-cases/validate-artifacts.ts` (~168–169 `get()`, ~300–336): scan only if `activeSpecApproval` or `activeSignoff`; hashes vs `artifactHashes`; skip `missing`/`skipped`; no `validatedHash` baseline compare. Invalidate in `mutate` uses `actor` from `ActorResolver.identity()`.

**Tests match:** `change-repository.spec.ts` _Hash mismatch on load invalidates with artifact-drift_ (`by === SYSTEM_ACTOR`); `validate-artifacts.spec.ts` _does not own baseline…_ (`mutate` not called).

**Residual (not H2):** hexagonal “use case owns policy” vs adapter calling the entity (LOW below). Storage + validate-artifacts still do not contradict each other.

### M3 — Archive factory ports — **CLOSED**

**Spec (preview spec.md):** `resolveArchiveChangeDeps` MUST resolve `archiveBindings` from `resolveWorkflowCheckRegistry`, `materializeMetadata`, `contentHasher`. MUST NOT resolve `runStepHooks` or `regenerateMetadata` onto `ArchiveChangeDeps`.

**Code:** `packages/core/src/composition/use-cases/archive-change.ts` `ArchiveChangeDeps` + `resolveArchiveChangeDeps`; factory passes `archiveBindings`, `materializeMetadata`, `contentHasher` into ctor (`hasher` slot). Guard includes `'archiveBindings'`, `'materializeMetadata'`, `'contentHasher'`.

**Verify:** first factory scenario matches code. Second scenario _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata…_ still THEN-lists `regenerateMetadata: RegenerateSpecMetadata` — **LOW spec-wrong leftover**, not enough to keep M3 open.

**Interpretation of leftover:** A = delete/replace second scenario with `materializeMetadata` (spec drift). B = composition should still inject `RegenerateSpecMetadata` (contradicted by spec.md + code).

### M4 — Consent scan vs `artifactId` — **CLOSED**

**Spec:** complete-file bypass is structural/delta/`markComplete` only. Approval requirement: iterate every artifact in `schema.artifacts()`; `artifactId` limits structural validation; MUST NOT skip consent for other types; complete files included in consent scan.

**Code:** consent loop `for (const artifactType of schema.artifacts())` independently of `artifactTypesToValidate`.

**Test:** `scans consent hashes across all artifacts even when artifactId is set` — `--artifact proposal` still invalidates when `specs` consent hash mismatches.

**Interpretation A (now the spec):** global consent integrity on every validate. **B** (old reading): scan only files this invocation structurally validates — **rejected by current spec + verify**.

### M5 — Same-execute DAG patch — **CLOSED**

**Spec (Dependency order check):** one `LifecycleEngine.evaluate` at execute start (empty `checksByTarget`); patch in-memory after each successful completion (`markVerdictComplete`); MUST NOT persist-and-re-evaluate between files; patch MUST NOT re-walk recursive `pending-parent-artifact-review` cascade.

**Code:** `evaluate` once; `markVerdictComplete` sets `state`/`effectiveStatus` `'complete'` on the in-memory map; child uses `artifactVerdicts`.

**Test:** both parent and child incomplete at start; `result.passed`; `evaluateSpy` called once.

**Interpretation A (now the spec):** in-memory patch is the contract. **B:** engine re-evaluate after persist — **rejected**.

### Lock without plan / excludePaths / hasher naming — **CLOSED** (hygiene leftovers only)

- Sealed set: `resolve-sealed-archive-depends-on.ts` plan → `persistedDependsOn !== null` (lock) → on-disk `resolveInitial` → new-spec extract/`[]`.
- Exclude: `excludePathsFor` + `isExcludedByPrefix` at `_materializeImplementationLinks`.
- Naming: deps `contentHasher`, ctor `hasher`.

---

# Spec: `core:archive-change`

## Requirements Summary

Archive is operation-`archive` checks (`archiveBindings`), not `RunStepHooks` on the use case. Workspace lookup via `ListWorkspaces`. Sealed `dependsOn`: plan → lock → lock-less on-disk `resolveInitialPersistedDependsOn()` (no `explicitDependsOn`) → new-spec merge-extract/`[]`. `ContentHasher` required for lock-less on-disk. Implementation links: normalize, skip `excludePathsFor`, fail outside `codeRoot`. Predicates share runners with enter-ready / exit-implementing. Publication preflight stays inside the use case (no `archive.publication` binding). Config factory: `resolveArchiveChangeDeps` with `archiveBindings` / `materializeMetadata` / `contentHasher`.

## Implementation Status

**Mostly implemented.** `ArchiveChange` ctor takes `archiveBindings`, `ListWorkspaces`, `contentHasher` (param `hasher`). Composition matches factory spec.md. Sealed dependsOn + `excludePathsFor` as above.

## Discrepancies

### LOW — Verify factory scenario still names `regenerateMetadata`

**Where:** preview verify.md › _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata or SaveSpecMetadata directly_ THEN still `regenerateMetadata: RegenerateSpecMetadata`. Spec.md and first verify scenario require `materializeMetadata`.

**A (spec-wrong):** leftover heading from the port rename. **B (code-wrong):** factory should expose `regenerateMetadata` — contradicted by spec.md and `ArchiveChangeDeps`.

### LOW — Duplicate empty verify heading for no-lock `resolveInitial`

Two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings; first has no GIVEN/WHEN/THEN.

### LOW — Lock-without-plan test does not assert error payload is lock vs extract

Throws `ArchiveDependencyMismatchError` only. Spec AND of `deps.consistent` vs **lock list** is implied, not asserted via `expectedDeps === ['core:from-lock']`. Error class comments still say “change metadata” / “persisted in the change metadata” rather than sealed lock/plan set.

### LOW — `ArchiveChange` ctor still types `hasher?` / several ports optional

Spec still shows optional `extractorTransforms?`, `projectRoot?`, `hasher?`. Runtime needs hasher on lock-less on-disk. No test that omitted hasher throws.

### LOW — Constraints still say hook execution is delegated to `RunStepHooks`

Spec.md Constraints: “Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly.” Adjacent requirements say the use case MUST NOT take `RunStepHooks`; I/O lives on `createHookPre`/`createHookPost`. **A:** constraint is leftover wording (hooks still _implemented_ via that use case inside bindings). **B:** ctor should take `RunStepHooks` — contradicted by bindings requirement + code.

## Test Coverage

| Requirement                                                                                | Status                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Sealed dependsOn plan / no-lock resolveInitial / new spec extract/`[]` / lock without plan | Covered in `archive-change.spec.ts`           |
| `deps.consistent` mismatch → `ArchiveDependencyMismatchError`                              | Covered (plan vs extract and lock vs extract) |
| Excluded path skipped                                                                      | Covered (project-level exclude)               |
| Factory `archiveBindings` + `contentHasher`                                                | Composition factory tests                     |
| Shared archive bindings / hooks / overlap / readOnly                                       | Existing archive-change tests                 |

## Missing Tests (titles)

- Workspace-local `graph.excludePaths` only (no project-level list) skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` is the lock list
- Lock-less on-disk archive without `ContentHasher` throws
- `metadata.json` `dependsOn` must not become the sealed set when lock or resolveInitial applies
- Config factory does not put `regenerateMetadata` on `ArchiveChangeDeps` (or rewrite the stale verify scenario)

## Spec Dependency issues

Depends on `core:storage`, `core:validate-artifacts`, `core:schema-format`, `core:initialize-persisted-spec-state`, `core:transition-checks`, `default:_global/architecture`. Factory spec.md now matches composition-resolver style; verify second scenario does not. `ArchiveDependencyMismatchError` docs still say “change metadata” vs sealed lock/plan.

## Counts (`core:archive-change`)

- Requirements reviewed: 28
- Confirmed: 25
- Discrepancies: 0 HIGH, 0 MEDIUM, 5 LOW
- Missing tests: 5 titles

---

# Spec: `core:validate-artifacts`

## Requirements Summary

Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, `hasher` (ContentHasher), extractors, routes, `LifecycleEngine`. DAG via `evaluate` with empty `checksByTarget` once per execute; in-memory `markVerdictComplete`. Baseline drift is **not** this use case. Consent-hash scan after `get()` over `schema.artifacts()` (not `--artifact` scoped). `markComplete` only here. Factory deps field `contentHasher`.

## Implementation Status

**Implemented for this change’s deltas** (ListWorkspaces, empty `checksByTarget`, baseline not owned, global consent scan, one evaluate + in-memory patch, `contentHasher` deps). Broader validate behavior (delta preview, metadata, bypass) pre-existed.

## Discrepancies

### H2 / M4 / M5 — **CLOSED** (see critical re-check)

### LOW — Leftover verify heading _Missing file can still carry hasDrift…_

Preview still has that heading with the **new** GIVEN/THEN (no invalidate). Also has _ValidateArtifacts does not compare missing files…_. Duplicate/stale title.

### LOW — No composition tests for `resolveValidateArtifactsDeps`

`packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` guard is unasserted (unlike archive). Smoke coverage may exist elsewhere; dedicated factory scenario is missing.

### LOW — Consent-hash invalidation actor identity not asserted

Code uses `ActorResolver` identity in `mutate`. Tests assert invalidation happened, not `by !== SYSTEM_ACTOR`. Spec requires ActorResolver not SYSTEM_ACTOR.

## Test Coverage

| Requirement                                   | Status                                          |
| --------------------------------------------- | ----------------------------------------------- |
| Empty `checksByTarget`                        | `evaluates lifecycle with empty checksByTarget` |
| Same-execute parent then child; evaluate once | Covered (`toHaveBeenCalledTimes(1)`)            |
| Does not own baseline drift                   | Covered                                         |
| Missing file / no consent → no invalidate     | Covered                                         |
| Consent-hash invalidate once                  | Covered                                         |
| Consent scan not scoped to `artifactId`       | Covered                                         |
| ListWorkspaces ctor                           | Used throughout tests                           |
| Factory `contentHasher`                       | **Not** composition-tested                      |

## Missing Tests (titles)

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher`
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)
- In-memory `markVerdictComplete` does not re-run pending-parent-artifact-review cascade (spec forbids re-walk)

## Spec Dependency issues

Depends on `core:storage` — **aligned** after CODE WINS. Depends on `core:schema-format` / `core:lifecycle-engine` for DAG (no `Change.effectiveStatus()`). Architecture spec vs load-time invalidate is storage’s concern, not a validate dual-owner bug.

## Counts (`core:validate-artifacts`)

- Requirements reviewed: 22
- Confirmed: 20
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 3 titles

---

# Spec: `core:storage`

## Requirements Summary

Load-time status from `validatedHash` + disk + `preHashCleanup`. Drift invalidation when artifact types resolved: `SYSTEM_ACTOR`, cause `artifact-drift`, skip pending-review / drifted-pending-review / skipped. Uninitialized repo (`artifactTypes.length === 0`) skips derivation/invalidation. Cascade is engine `projectArtifacts`, not `Change.effectiveStatus()`. Wire `pending-parent-artifact-review` rewritten to `in-progress`. `ValidateArtifacts` is sole `markComplete` path (convention). Archive pattern, fs-cache indexes, locks under `configPath`, confinement, staged archive.

## Implementation Status

**Implemented** for this change’s storage deltas (load-time baseline drift, cascade ownership note, wire coercion). Other storage requirements pre-existed and were not re-audited line-by-line (indexes, pattern variables, gitignore).

## Discrepancies

### LOW — Hexagonal layering (prior M7, **not** H2)

Invalidation **decision** lives in `FsChangeRepository` (infrastructure) calling domain `Change.invalidate`. After CODE WINS this is **required** by `core:storage`. `default:_global/architecture` still prefers use cases orchestrating ports.

**A:** adapter may apply persistence-time invariants using the entity. **B:** a dedicated application service should own drift before save. Product decision picks A.

### LOW — Drift when canonical status is not `complete`

Spec: drifted if non-sentinel hash and not already review/skipped, and either complete-but-disk-not-complete **or** canonical status is not complete (including missing after validated file disappeared). Code: if status is `complete`, re-derive; **else `drifted = true`**. Matches the second bullet. Tests emphasize complete→mismatch more than missing-with-hash.

## Test Coverage

| Requirement                                         | Status  |
| --------------------------------------------------- | ------- |
| Hash mismatch → invalidate SYSTEM_ACTOR             | Covered |
| Reload after revalidation does not invalidate twice | Covered |
| Uninitialized skip                                  | Covered |
| Wire pending-parent-artifact-review → in-progress   | Covered |
| Status precedence complete/in-progress/skipped      | Covered |

## Missing Tests (titles)

- Validated file absent on disk (`missing`) with non-sentinel `validatedHash` invalidates once with `SYSTEM_ACTOR` when types resolved
- Policy `none` on load: entity does not reopen but adapter still persists history as specified (if not already in `change.spec.ts` only)

## Spec Dependency issues

Points at `core:lifecycle-engine` / `core:schema-format` for cascade — consistent. Explicitly forbids ValidateArtifacts repeating baseline — consistent with validate-artifacts delta.

## Counts (`core:storage`)

- Requirements reviewed: 18 (change-touched + status/cascade/indexes skim)
- Confirmed: 16
- Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW
- Missing tests: 2 titles

---

# Spec: `core:get-artifact-instruction`

## Requirements Summary

Read-only instruction assembly. Ctor: changes, specs map, schema, parsers, `TemplateExpander`, `LifecycleEngine`. Auto `artifactId` via `nextArtifact` / `evaluate` empty `checksByTarget`. `rulesPre`/`rulesPost` from `instruction` fields. Template expanded. Factory field `templateExpander`. Template variables: `change.name` + `change.path` only.

## Implementation Status

**Implemented.** `evaluate(..., { checksByTarget: {} })`. Rules via `r.instruction`. Factory `templateExpander`. Auto-select uses `lifecycle.nextArtifact`.

## Discrepancies

### LOW — Template resolution: spec says `SchemaRegistry` file read; code expands `ArtifactType.template`

Spec: if template **path**, read via `SchemaRegistry`. Code: `artifactType.template` is already file content (resolved at schema load). Tests pass inline template strings.

**A:** spec over-specifies I/O that belongs to schema resolve. **B:** use case should still read the path at execute time.

### LOW — Ctor parameter name `templates` vs spec `expander` vs deps `templateExpander`

Same pattern as hasher/`contentHasher`, but get-artifact-instruction spec ctor block uses `expander`. Code: `templates`. Guard is `templateExpander` on deps. JSDoc on execute still says “declaration order” for auto-select; spec requires engine topological `nextArtifact`.

### LOW — No composition factory test file

No `test/composition/use-cases/get-artifact-instruction.spec.ts`.

## Test Coverage

| Requirement                  | Status                        |
| ---------------------------- | ----------------------------- |
| Empty `checksByTarget`       | Spy in template test          |
| Rule `instruction` expansion | Covered                       |
| Template expand / null       | Covered                       |
| Auto-select / all complete   | Existing auto-selection tests |
| Factory `templateExpander`   | Not composition-tested        |

## Missing Tests (titles)

- `createGetArtifactInstruction` config form resolves `templateExpander` through `resolveGetArtifactInstructionDeps`
- Full result scenario with `rules.pre: [{ id, instruction }]` matching verify GIVEN
- Omitted `artifactId` ignores persisted complete when engine reports `pending-parent-artifact-review`

## Spec Dependency issues

Depends on `core:schema-format` for `{ id, instruction }` — **aligned**. `core:template-variables` (no singular workspace) matches `{ change: { name, path } }`. `core:lifecycle-engine` for `nextArtifact`.

## Counts (`core:get-artifact-instruction`)

- Requirements reviewed: 10
- Confirmed: 8
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 3 titles

---

# Spec: `core:schema-format`

## Requirements Summary (this change)

`workflow[]` is lookup config on existing Change states, not a machine that adds/removes hops. Unknown `step` → `SchemaValidationError`. Artifact `requires` feed `LifecycleEngine.projectArtifacts` / `Schema.artifactDag()`; no `Change.effectiveStatus()`. Parent pending-review → dependent `pending-parent-artifact-review`. `rules.pre`/`post`: `{ id, instruction }`.

## Implementation Status

**Implemented** for change deltas: `buildSchema` rejects invalid `step`; engine cascade in `lifecycle-engine.ts`; `RuleEntry.instruction` in `build-schema.ts`.

## Discrepancies

### LOW — `graph.excludePaths` is **not** this spec

Archive materialization exclusion is config/`ListWorkspaces`, not schema-format. No schema-format contradiction.

No remaining `text` vs `instruction` on **artifact rules** in delta-applied constraints.

Hook YAML in some tests still uses `type: 'instruction', text: 'lint'` (hook entries, not `rules.pre`). Out of this change’s rules.pre finding; flag only if a full schema-format audit is required.

## Test Coverage

| Requirement                                  | Status                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Unknown workflow step rejected               | `build-schema.spec.ts` _rejects workflow steps that are not valid ChangeState values_ |
| DAG cascade in-progress                      | `lifecycle-engine.spec.ts` + get-status cascade                                       |
| Parent pending-review cascade                | `lifecycle-engine.spec.ts` (engine tests)                                             |
| Omitted workflow step still a protocol state | Implicit (engine has full protocol); no schema-only test titled as verify             |

## Missing Tests (titles)

- Omitted `workflow[]` step `implementing` remains a valid ChangeState after `buildSchema` (verify scenario)
- Artifact B `requires: [a]`, A `pending-review`, B complete → `projectArtifacts` `pending-parent-artifact-review` (if not already named that way in engine tests)

## Spec Dependency issues

`core:transition-checks` for axis splicing. `core:get-artifact-instruction` now matches rules field names. Storage/archive depend on DAG text — aligned.

## Counts (`core:schema-format`)

- Requirements reviewed: 8 (change-touched)
- Confirmed: 7
- Discrepancies: 0 HIGH, 0 MEDIUM, 1 LOW
- Missing tests: 2 titles

---

# Global: `default:_global/architecture` (depth 1)

Config-based `createX(config)` MUST delegate through shared composition resolver to `createX(deps)`. Archive / validate / get-artifact-instruction factories follow that pattern. Load-time `Change.invalidate` in `FsChangeRepository` remains the CODE WINS exception vs “use cases orchestrate ports” — LOW layering taste, not a dual-owner bug (H2 closed).

---

# Batch summary

| Spec                            | HIGH | MEDIUM | LOW | Prior IDs                                                             |
| ------------------------------- | ---- | ------ | --- | --------------------------------------------------------------------- |
| `core:archive-change`           | 0    | 0      | 5   | M3 **closed**; lock-without-plan **closed**; excludePaths **closed**  |
| `core:validate-artifacts`       | 0    | 0      | 3   | H2 **closed**; M4 **closed**; M5 **closed**; hasher naming **closed** |
| `core:storage`                  | 0    | 0      | 2   | H2 **closed** (owner is get())                                        |
| `core:get-artifact-instruction` | 0    | 0      | 3   | templateExpander **closed**; rules.instruction **closed**             |
| `core:schema-format`            | 0    | 0      | 1   | rules.instruction **closed**                                          |

**Totals this batch:** HIGH **0** · MEDIUM **0** · LOW **14** (some leftovers overlap conceptually; unique severities: HIGH 0, MEDIUM 0, LOW as listed)

**Unique severity:** **LOW**

**H2:** closed, no regression. **M3/M4/M5:** closed in delta-applied specs **and** code+tests.
