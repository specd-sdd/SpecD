# Spec compliance partial — core archive / validate / storage / instruction / schema-format

**Change:** `workflow-transition-checks`  
**Mode:** change (delta-applied via `changes spec-preview`)  
**Read-only.** No code or spec files modified.  
**Graph:** `graph search "ValidateArtifacts"` returned symbols; index may still be stale. Implementation checks used Read/Grep after graph locate.

**Product decision (H2):** CODE WINS — `FsChangeRepository.get` owns baseline `validatedHash` vs disk invalidation with `SYSTEM_ACTOR`. `ValidateArtifacts` does **not** own baseline drift; it only compares approval/signoff `artifactHashes` after `get()`.

---

## Critical re-checks (previous findings)

### H2 — Dual ownership of baseline artifact-drift — **CLOSED**

**Delta-applied specs agree (CODE WINS):**

- `core:storage` › Artifact status derivation: when `artifactTypes.length > 0`, load detects baseline drift vs `validatedHash` and calls `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat that comparison. Consent-hash drift stays on the use case.
- `core:validate-artifacts` › Policy-aware drift materialization: MUST NOT compare disk to `validatedHash`, MUST NOT mark `hasDrift` for that reason, MUST NOT invalidate for baseline mismatch. Load via `ChangeRepository.get` first. Approval/signoff scan uses `ActorResolver`, not `SYSTEM_ACTOR`.
- Verify scenarios: _ValidateArtifacts does not own baseline validatedHash drift_; _Consent-hash drift still invalidates once…_; storage _Hash mismatch on load invalidates with artifact-drift_ (`SYSTEM_ACTOR`).

**Code matches:**

- `packages/core/src/infrastructure/fs/change-repository.ts` (~1523–1574): grouped `invalidate(..., SYSTEM_ACTOR, ...)` after hash/status derivation.
- `packages/core/src/application/use-cases/validate-artifacts.ts` (~168–169 `get()`, ~300–336): scan only if `activeSpecApproval` or `activeSignoff`; hashes vs `artifactHashes`; skip `missing`/`skipped`; no `validatedHash` baseline compare.

**Tests match:** `change-repository.spec.ts` _Hash mismatch on load invalidates with artifact-drift_ (`by === SYSTEM_ACTOR`); _Uninitialized repository_ bypass; `validate-artifacts.spec.ts` _does not own baseline…_ (`mutate` not called); _Consent-hash drift still invalidates once…_.

**Residual (not H2):** hexagonal “use case owns policy” vs adapter calling the entity (`M7` below) is an architecture-taste leftover. Storage + validate-artifacts no longer contradict each other.

**Verdict:** H2 **closed** in specs **and** code+tests.

---

### Previous MEDIUM — Lock without plan keeps lock `dependsOn` — **CLOSED** (small test/spec hygiene leftover)

**Spec (preview):** _Lock without a plan keeps lock dependsOn_ — existing lock, no `change.specDependsOn` entry, extract differs → sealed set is lock; `resolveInitialPersistedDependsOn` not called; `deps.consistent` fails against that lock list.

**Code:** `resolveSealedArchiveDependsOn` (`resolve-sealed-archive-depends-on.ts`): plan → `persistedDependsOn !== null` (lock) → on-disk `resolveInitial` → new-spec extract/`[]`. `loadArchiveSealedDependsOnBySpecId` uses the same helper for archive `deps.consistent`.

**Test:** `archive-change.spec.ts` _Lock without a plan keeps lock dependsOn_ (~760–859): lock `['core:from-lock']`, extract `core:from-extract`, no plan → `ArchiveDependencyMismatchError`, `resolveInitial` spy not called.

**Leftover LOW:** test does not assert `expectedDeps === ['core:from-lock']` vs `actualDeps` extract. Error ctor still documents “change metadata” rather than “sealed/lock set”. Verify has a **duplicate empty** heading for _No-lock spec resolves initial dependsOn…_ immediately before the real scenario.

---

### Previous MEDIUM — `graph.excludePaths` skipped at archive materialization — **CLOSED**

**Spec:** ignore confirmed links whose raw path falls under the **target workspace** `graph.excludePaths`.

**Code:** `_materializeImplementationLinks` uses `this._listWorkspaces.excludePathsFor(workspace)` then `isExcludedByPrefix`. `ProjectWorkspace` has **no** `graph` field (`list-workspaces.ts` execute payload: name, prefix, codeRoot, isExternal, ownership, specRepo). `excludePathsFor` merges `config.graph.excludePaths` + `workspace.graph.excludePaths`.

**Test:** _Excluded path is ignored during sidecar materialization_ (`archive-change.spec.ts` ~3361) via `makeListWorkspaces(..., { excludePaths: ['node_modules'] })`. `list-workspaces.spec.ts` _excludePathsFor merges project and workspace prefixes_.

**Leftover LOW:** archive test only plants **project-level** `excludePaths`, not workspace-local-only. Spec wording “target workspace `graph.excludePaths`” is still satisfied because `excludePathsFor` includes workspace-local prefixes.

---

### Previous MEDIUM — Factory naming `contentHasher` vs ctor `hasher` — **CLOSED**

Delta-applied `core:validate-artifacts`: deps list `contentHasher`; “The constructor parameter remains `hasher`.” Code: `ValidateArtifactsDeps.contentHasher`, ctor param `hasher`, factory passes `contentHasher` into that slot. Guard `'contentHasher' in value`.

---

### Previous MEDIUM — `templateExpander` vs verify `templates` — **CLOSED**

Delta-applied verify factory scenario lists `templateExpander: TemplateExpander`. Code: `GetArtifactInstructionDeps.templateExpander`. Residual LOW: **ctor** parameter is still named `templates` (spec snippet says `expander`).

---

### Previous MEDIUM — `rules.pre` `instruction` not `text` — **CLOSED**

Delta-applied get-artifact-instruction spec+verify use `{ id, instruction }`. `core:schema-format` constraints: `{ id, instruction }`. Code: `r.instruction`. Test: _expands pre and post rule instructions_.

---

# Spec: `core:archive-change`

## Requirements Summary

Archive is operation-`archive` checks (`archiveBindings`), not `RunStepHooks` on the use case. Workspace lookup via `ListWorkspaces`. Sealed `dependsOn`: plan → lock → lock-less on-disk `resolveInitialPersistedDependsOn()` (no `explicitDependsOn`) → new-spec merge-extract/`[]`. `ContentHasher` required for lock-less on-disk. Implementation links: normalize, skip `excludePathsFor`, fail outside `codeRoot`. Predicates share runners with enter-ready / exit-implementing. Publication preflight stays inside the use case (no `archive.publication` binding).

## Implementation Status

**Mostly implemented.** `ArchiveChange` ctor takes `archiveBindings`, `ListWorkspaces`, `contentHasher`. Composition: `resolveArchiveChangeDeps` sets `archiveBindings` from `resolveWorkflowCheckRegistry`, `materializeMetadata`, `contentHasher`; no `runStepHooks` on deps. Sealed dependsOn + `excludePathsFor` as above.

## Discrepancies

### MEDIUM — Factory requirement in spec.md still lists `runStepHooks` / `regenerateMetadata`

**Where:** preview spec.md › _Config-based factory delegates through resolveArchiveChangeDeps_ still lists `runStepHooks: RunStepHooks` and `regenerateMetadata: RegenerateSpecMetadata`. Adjacent requirements and **verify** say `archiveBindings`, `materializeMetadata`, `contentHasher`, and MUST NOT resolve `runStepHooks` onto the use case. Second verify scenario still says `regenerateMetadata: RegenerateSpecMetadata` while the first lists `materializeMetadata`.

**Interpretation A (spec drift):** factory bullet list was not updated when ports moved to bindings + `MaterializeSpecMetadata`. Code + composition tests are the intended contract.

**Interpretation B (implementation bug):** factory should still inject `RunStepHooks` / `RegenerateSpecMetadata` on the use case — contradicted by the same spec’s _Archive bindings not RunStepHooks_ and by code.

**Evidence:** `composition/use-cases/archive-change.ts` `ArchiveChangeDeps`; `test/composition/use-cases/archive-change.spec.ts`.

### LOW — Duplicate empty verify heading for no-lock `resolveInitial`

Two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings; first has no GIVEN/WHEN/THEN.

### LOW — Lock-without-plan test does not assert error payload is lock vs extract

Throws `ArchiveDependencyMismatchError` only. Spec AND of `deps.consistent` vs **lock list** is implied, not asserted via `expectedDeps`.

### LOW — `ArchiveChange` ctor still types `hasher?` / several ports optional

Spec still shows optional `extractorTransforms?`, `projectRoot?`, `hasher?`. Runtime throws if hasher missing on lock-less on-disk. No test that omitted hasher throws.

## Test Coverage

| Requirement                                                                                | Status                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Sealed dependsOn plan / no-lock resolveInitial / new spec extract/`[]` / lock without plan | Covered in `archive-change.spec.ts`                       |
| `deps.consistent` mismatch → `ArchiveDependencyMismatchError`                              | Covered (plan vs extract and lock vs extract)             |
| Excluded path skipped                                                                      | Covered (project-level exclude)                           |
| Factory `archiveBindings` + `contentHasher`                                                | Composition factory tests                                 |
| Shared archive bindings / hooks / overlap / readOnly                                       | Existing archive-change tests (this change’s check table) |

## Missing Tests (titles)

- Workspace-local `graph.excludePaths` only (no project-level list) skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` is the lock list
- Lock-less on-disk archive without `ContentHasher` throws
- `metadata.json` `dependsOn` must not become the sealed set when lock or resolveInitial applies
- Factory spec.md `runStepHooks` list is not a composition contract (or delete that list)

## Spec Dependency issues

Depends on `core:storage`, `core:validate-artifacts`, `core:schema-format`, `core:initialize-persisted-spec-state`, `core:transition-checks`. Factory spec.md contradicts its own bindings requirement and `core:composition-resolver` style used by siblings. `ArchiveDependencyMismatchError` comment still says “change metadata” vs sealed lock/plan.

## Counts (`core:archive-change`)

- Requirements reviewed: 28
- Confirmed: 24
- Discrepancies: 1 MEDIUM, 3 LOW
- Missing tests: 5 titles

---

# Spec: `core:validate-artifacts`

## Requirements Summary

Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, `hasher` (ContentHasher), extractors, routes, `LifecycleEngine`. DAG via `evaluate` with empty `checksByTarget`. Baseline drift is **not** this use case. Consent-hash drift after `get()`. `markComplete` only here. Metadata extract uses permissive schema. Factory deps field `contentHasher`.

## Implementation Status

**Implemented for this change’s deltas** (ListWorkspaces, empty `checksByTarget`, baseline not owned, consent-hash invalidate, `contentHasher` deps). Broader validate behavior (delta preview, metadata, bypass) pre-existed.

## Discrepancies

### H2 — **CLOSED** (see critical re-check)

### MEDIUM — Approval/signoff hash scan is not scoped to `artifactId` (prior M4, still open)

**Spec tension:** complete-file bypass says do not re-read complete files for structure; approval requirement still scans non-missing/non-skipped files including `complete` when gates are active. Scan loops `schema.artifacts()` before `artifactTypesToValidate`. `--artifact verify` can invalidate because `proposal` consent-hash drifted.

**A:** spec intends global consent integrity on every validate. **B:** spec intends scan only files this invocation validates. Code follows A. Bypass vs approval clauses still conflict if read as “never re-read complete files.”

### MEDIUM — Same-pass DAG “recompute” is an in-memory verdict patch (prior M5)

`evaluate` once; `markVerdictComplete` patches `effectiveStatus: 'complete'`. Recursive `pending-parent-artifact-review` cascade is not re-run. Spec “persisted completion” is not a second persist+evaluate.

**A:** in-memory patch is enough for child-in-same-execute. **B:** spec wants engine re-evaluate after persist.

### LOW — Leftover verify heading _Missing file can still carry hasDrift…_

Preview still has that heading with the **new** GIVEN/THEN (no invalidate). Also has _ValidateArtifacts does not compare missing files…_. Duplicate/stale title.

### LOW — No composition tests for `resolveValidateArtifactsDeps`

`packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` guard is unasserted (unlike archive).

## Test Coverage

| Requirement                               | Status                                          |
| ----------------------------------------- | ----------------------------------------------- |
| Empty `checksByTarget`                    | `evaluates lifecycle with empty checksByTarget` |
| Does not own baseline drift               | Covered                                         |
| Missing file / no consent → no invalidate | Covered                                         |
| Consent-hash invalidate once              | Covered                                         |
| ListWorkspaces ctor                       | Used throughout tests                           |
| Factory `contentHasher`                   | **Not** composition-tested                      |

## Missing Tests (titles)

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher`
- Approval drift scan with `--artifact` does not invalidate unselected artifacts **or** a verify scenario that explicitly requires global scan
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)

## Spec Dependency issues

Depends on `core:storage` — **aligned** after CODE WINS. Depends on `core:schema-format` / `core:lifecycle-engine` for DAG (no `Change.effectiveStatus()`). Architecture spec vs load-time invalidate is storage’s concern, not a validate dual-owner bug.

## Counts (`core:validate-artifacts`)

- Requirements reviewed: 22
- Confirmed: 18
- Discrepancies: 0 HIGH, 2 MEDIUM (M4/M5 residual), 2 LOW
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

**Implemented.** `evaluate(..., { checksByTarget: {} })`. Rules via `r.instruction`. Factory `templateExpander`.

## Discrepancies

### LOW — Template resolution: spec says `SchemaRegistry` file read; code expands `ArtifactType.template`

Spec: if template **path**, read via `SchemaRegistry`. Code: `artifactType.template` is already file content (resolved at schema load). Tests pass inline template strings.

**A:** spec over-specifies I/O that belongs to schema resolve. **B:** use case should still read the path at execute time.

### LOW — Ctor parameter name `templates` vs spec `expander` vs deps `templateExpander`

Same pattern as hasher/`contentHasher`, but get-artifact-instruction spec ctor block uses `expander`. Code: `templates`. Not a type-guard bug (guard is `templateExpander` on deps).

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

Depends on `core:schema-format` for `{ id, instruction }` — **aligned**. `core:template-variables` (no singular workspace) matches `{ change: { name, path } }`.

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

**Implemented** for change deltas: `buildSchema` rejects `step: reviewing`; engine cascade in `lifecycle-engine.ts`; `RuleEntry.instruction` in `build-schema.ts`.

## Discrepancies

### LOW — `graph.excludePaths` is **not** this spec

Archive materialization exclusion is config/`ListWorkspaces`, not schema-format. No schema-format contradiction.

No remaining `text` vs `instruction` on **artifact rules** in delta-applied constraints.

Hook YAML in some tests still uses `type: 'instruction', text: 'lint'` (hook entries, not `rules.pre`). Out of this change’s rules.pre MEDIUM; flag only if a full schema-format audit is required.

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

# Batch summary

| Spec                            | HIGH | MEDIUM                              | LOW | H2 / prior MEDIUMs                                        |
| ------------------------------- | ---- | ----------------------------------- | --- | --------------------------------------------------------- |
| `core:archive-change`           | 0    | 1 (stale factory list)              | 3   | Lock-without-plan **closed**; excludePaths **closed**     |
| `core:validate-artifacts`       | 0    | 2 (M4 scan scope, M5 in-memory DAG) | 2   | H2 **closed**; hasher naming **closed**                   |
| `core:storage`                  | 0    | 0                                   | 2   | H2 **closed** (owner is get())                            |
| `core:get-artifact-instruction` | 0    | 0                                   | 3   | templateExpander **closed**; rules.instruction **closed** |
| `core:schema-format`            | 0    | 0                                   | 1   | rules.instruction **closed**                              |

**Totals this batch:** HIGH **0** · MEDIUM **3** · LOW **11**

**H2:** closed in delta-applied specs **and** code+tests. Specs no longer assign baseline drift to both layers.
