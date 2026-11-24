# Spec compliance partial — archive / validate / instruction / storage / change

**Change:** `workflow-transition-checks`  
**Assigned specs:** `core:archive-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:storage`, `core:change`  
**Globals / depth-1:** `default:_global/architecture`, `default:_global/logging`, `default:_global/testing`; deps include `composition-resolver`, `lifecycle-engine`, `delta-format`, `spec-overlap`, `change-manifest`, `transition-checks`, `schema-format`.  
**Mode:** change (`change spec-preview workflow-transition-checks <specId>`)  
**Read-only.** No code or spec files modified.  
**Graph:** `stale: false` (`lastIndexedAt` 2026-08-28T17:21:07Z). Locate via `graph search` / `graph impact` then Read.

**Product decisions used as CODE WINS when specs still lag:**

1. Archive is operation-`archive` **checks** (`archiveBindings`), not a lifecycle hop and not `RunStepHooks` on `ArchiveChange`.
2. DAG status uses `evaluateLifecycle` / `evaluateLifecycleVerdict` with **empty `checksByTarget`** — not hop predicates.
3. **No `LifecycleEngine` constructor injection** on validate / get-artifact-instruction (deprecated class in `lifecycle-engine.ts` wraps functions; composition does not pass it).
4. Overlap split: live archive predicate `OVERLAP_CONFLICT` vs review/invalidation cause `spec-overlap-conflict`.
5. Artifact `requires` cascade is `projectArtifacts` / `_effectiveStatus` in `lifecycle-verdict.ts`, not `Change.effectiveStatus()`.

---

## Spec: `core:archive-change`

### Requirements Summary

`ArchiveChange` is gated on archivable **state** but archive itself is **not** a `from → to` hop. Constructor takes `archiveBindings` (`CheckBinding[]`), `ListWorkspaces`, `ContentHasher` (param `hasher`), not `RunStepHooks`. Predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent` (sealed set), `impl.filesResolved` / `impl.linksInScope`. Remaining merge/publish preflight stays inside the use case (no `archive.publication` binding). Overlap is archive-only, skippable with `allowOverlap`; when allowed, peers are invalidated with cause `spec-overlap-conflict`. Hooks are `before-persist` / `after-persist` effects on the binding table. Deferred `archiving` transition after full-batch preflight + snapshots. Factory: `resolveArchiveChangeDeps` with `archiveBindings` from `resolveWorkflowCheckRegistry({ includeOverlapDetection: true })`, `materializeMetadata`, `contentHasher`; MUST NOT put `runStepHooks` / `regenerateMetadata` on `ArchiveChangeDeps`.

### Implementation Status

**Implemented** for this change’s archive-as-checks model.

- Ctor: `packages/core/src/application/use-cases/archive-change.ts` — `archiveBindings`, no `RunStepHooks`, no `LifecycleEngine`.
- Composition: `packages/core/src/composition/use-cases/archive-change.ts` `ArchiveChangeDeps` / `resolveArchiveChangeDeps`; `archiveBindings: registry.archiveBindings`; guard requires `archiveBindings` + `contentHasher`.
- Execute: `executeMatchingPredicates(this._archiveBindings, …)` then effects via `matchingEffects(..., 'before-persist'|'after-persist')`.
- `archive.archivable` runner: `packages/core/src/domain/checks/archive-archivable.ts` calls `change.assertArchivable()` (`archivable` **or** `archiving`).
- Overlap: application `createSpecOverlap` fails with code `OVERLAP_CONFLICT`; allow-overlap path `_invalidateOverlappingChanges` uses cause `'spec-overlap-conflict'` + `SYSTEM_ACTOR`.
- Deferred mutate: `assertArchivable()` then `transition('archiving')` if not already archiving.

### Discrepancies (evidence + spec-wrong vs code-wrong vs both + severity)

#### LOW — Verify factory scenario still names `regenerateMetadata`

**Evidence:** Preview verify.md scenario _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata or SaveSpecMetadata directly_ THEN still `regenerateMetadata: RegenerateSpecMetadata`. Spec.md factory requirement and first verify scenario require `materializeMetadata`. Code: `ArchiveChangeDeps.materializeMetadata` only.

**A (spec-wrong):** leftover heading from the port rename. **B (code-wrong):** factory should expose `regenerateMetadata` — contradicted by spec.md + `ArchiveChangeDeps`.

#### LOW — Constraints still say hook execution is delegated to `RunStepHooks`

**Evidence:** Spec.md Constraints: “Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly.” Adjacent requirement: MUST NOT take `RunStepHooks`; I/O lives on `createHookPre` / `createHookPost`. Spec Dependencies still list `core:run-step-hooks` and `core:regenerate-spec-metadata`.

**A:** constraint is leftover wording (hooks still _implemented_ via that use case **inside bindings**). **B:** ctor should take `RunStepHooks` — contradicted by bindings requirement + code.

#### LOW — `hasher?` still optional on ctor while factory requires `contentHasher`

**Evidence:** Spec constructor snippet still shows `hasher?: ContentHasher`. Runtime lock-less on-disk path needs hasher. Composition always injects `contentHasher`. No test that omitted hasher throws.

**A:** spec should mark hasher required. **B:** ctor optional is a test-friendly default — both: spec vs composition contract.

#### LOW — Constraint “assertArchivable before any hooks” vs check-table order

**Evidence:** Constraints: `change.assertArchivable()` must be called before any hooks. Execute runs **predicates** (including `archive.archivable`) then before-persist effects; entity `assertArchivable` also runs inside mutate before `archiving`. Product: archive is checks, not a hop — the **check** is the guard.

**A:** constraint should say “archive.archivable predicate before effects”. **B:** extra direct `assertArchivable` before predicates — code-wrong vs constraint only; aligned with “checks not a hop”.

### Test Coverage

| Requirement                                                        | Status                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Archive bindings, not `RunStepHooks`                               | Covered (`archive-change.spec.ts` / composition)  |
| Overlap throw vs `allowOverlap` invalidate `spec-overlap-conflict` | Covered                                           |
| Sealed `dependsOn` plan / lock / resolveInitial / extract          | Covered                                           |
| Empty-path publication preflight stays in use case                 | Covered                                           |
| Factory `archiveBindings` + `contentHasher`                        | Composition factory tests                         |
| Shared runners readOnly / deps / impl                              | Existing archive-change tests                     |
| Debug logging structured fields                                    | Partial (behavior tests more than log assertions) |

### Missing Tests

- Workspace-local `graph.excludePaths` only skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` equals lock list
- Lock-less on-disk archive without `ContentHasher` throws
- Config factory does **not** put `regenerateMetadata` on `ArchiveChangeDeps` (or rewrite stale verify scenario)
- `metadata.json` `dependsOn` must not become sealed set when lock or resolveInitial applies

### Spec Dependency Chain

- `core:change` — `assertArchivable` / `archiving` retry; overlap invalidation cause. Constraint on change still says “archivable is the only archive state” while this spec + entity allow `archiving` retry (**change spec-wrong**, see `core:change`).
- `core:spec-overlap` / `core:transition-checks` — live `OVERLAP_CONFLICT` vs review `spec-overlap-conflict`. **Aligned** with get-status composition comment (`archivable` only for live overlap).
- `core:storage` — staged archive / fs-cache index. **Aligned**.
- `core:validate-artifacts` — `markComplete` sole path. **Aligned**.
- `default:_global/architecture` — use case orchestrates ports; bindings composed in `composition-resolver`. **Aligned** for archive. Adapter-owned drift is storage’s issue.
- `default:_global/logging` — structured debug at archive steps. Spec lists fields; implementation emits `Logger.debug` with `change` / `specId` / step keys. Not exhaustively asserted.
- `core:lifecycle-engine` — archive does **not** inject engine; predicates are the registry. **Aligned** with “not a hop”.
- `core:composition-resolver` — `resolveArchiveChangeDeps` matches factory spec.md (except leftover verify).

### Summary counts

- Requirements reviewed: 31
- Confirmed: 27
- Discrepancies: 0 HIGH, 0 MEDIUM, 4 LOW
- Missing tests: 5 titles

---

## Spec: `core:validate-artifacts`

### Requirements Summary

Sole `markComplete` path. Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, hasher, extractors, routes — **preview still lists `LifecycleEngine`**. DAG: one `evaluateLifecycleVerdict` with empty `checksByTarget` at execute start; in-memory `markVerdictComplete`; MUST NOT persist-and-re-evaluate; MUST NOT run hop predicates. Baseline `validatedHash` drift is **not** this use case. Consent-hash scan after `get()` over `schema.artifacts()` (not `--artifact` scoped), `ActorResolver` not `SYSTEM_ACTOR`. Factory `contentHasher` **and still `lifecycle: LifecycleEngine`**. Traversal `artifactDag().topologicalOrder()`.

### Implementation Status

**Implemented for DAG + drift ownership; constructor/factory LifecycleEngine requirement is not implemented (product: no ctor injection).**

- Ctor 8 params, no `lifecycle`: `validate-artifacts.ts` ~137–155.
- `evaluateLifecycle(change, schema, { checksByTarget: {} })` then `markVerdictComplete` patches `state`/`effectiveStatus` to `'complete'` (`~221–235`).
- `resolveValidateArtifactsDeps` has no `lifecycle` field (`composition/use-cases/validate-artifacts.ts`).
- Baseline: `get()` first; consent loop over `schema.artifacts()`.
- Dependency failures use `findBlockingParent` + effective status from the in-memory verdict map.

### Discrepancies

#### MEDIUM — Spec still requires `LifecycleEngine` ctor + factory dep; code uses functions only

**Evidence:** Preview spec.md Ports/constructor and factory MUST resolve `lifecycle: LifecycleEngine`. Verify: _ValidateArtifacts is constructed with LifecycleEngine_; factory THEN-list includes `lifecycle`; DAG scenario THEN `LifecycleEngine.evaluate`.  
Code: no ctor param; composition omits it; tests construct without it; spy is `evaluateLifecycle` with `{ checksByTarget: {} }` (`validate-artifacts.spec.ts` _evaluates lifecycle with empty checksByTarget_). Deprecated class `LifecycleEngine` in `lifecycle-engine.ts` is a thin wrapper, unused here.

**A (spec-wrong, CODE WINS):** drop ctor/factory `lifecycle`; name `evaluateLifecycleVerdict` / `evaluateLifecycle` with empty `checksByTarget`. **B (code-wrong):** inject `LifecycleEngine` again — contradicts this change’s “no constructor injection” and composition-resolver pattern (`default:_global/architecture` / `core:composition-resolver`).

#### LOW — Spec names `evaluateLifecycleVerdict`; code calls `evaluateLifecycle`

**Evidence:** `evaluateLifecycle` wraps verdict and adds `nextAction` via `resolveLifecycleNextAction` (`lifecycle-evaluation.ts`). Empty `checksByTarget` means **no hop predicate execute**; `availableTransitions` stays empty. Extra hop **guidance** is computed but unused for validation.

**A:** spec should allow the application wrapper. **B:** call `evaluateLifecycleVerdict` / `projectArtifacts` only to avoid hop-shaped fields. Severity low: predicates are not run.

#### LOW — Leftover / duplicate verify titles

Preview still has stale headings (e.g. _Missing file can still carry hasDrift…_ with new GIVEN/THEN) plus _ValidateArtifacts does not compare missing files…_. Verify DAG text still says `LifecycleEngine.evaluate`.

#### LOW — No dedicated composition test for `resolveValidateArtifactsDeps`

Unlike archive, `packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` and **absence of `lifecycle`** unasserted at composition layer.

#### LOW — Consent-hash invalidation actor not asserted as non-`SYSTEM_ACTOR`

Spec requires `ActorResolver` identity. Tests assert invalidation happened, not `by !== SYSTEM_ACTOR`.

### Test Coverage

| Requirement                                   | Status                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| Empty `checksByTarget`                        | Covered                                                      |
| Same-execute parent then child; evaluate once | Covered (`toHaveBeenCalledTimes(1)`)                         |
| Does not own baseline drift                   | Covered                                                      |
| Consent scan not scoped to `artifactId`       | Covered                                                      |
| ListWorkspaces ctor                           | Used throughout                                              |
| Factory `contentHasher` / no `lifecycle`      | **Not** composition-tested                                   |
| Ctor without `LifecycleEngine`                | Implicit in unit tests, not a named scenario matching verify |

### Missing Tests

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher` and **excluding** `lifecycle`
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)
- In-memory `markVerdictComplete` does not re-run pending-parent cascade (spec forbids re-walk; patch is a map set)
- Constructor / factory **must not** require `LifecycleEngine` (or rewrite verify)

### Spec Dependency Chain

- `core:storage` — baseline drift on load; validate MUST NOT repeat. **Aligned** (CODE WINS).
- `core:lifecycle-engine` — DAG via `projectArtifacts` / evaluate with empty checks. **Behavior aligned**; **injection wording not aligned**.
- `core:change` — no `Change.effectiveStatus()`; engine-derived `pending-parent-artifact-review`. **Aligned**.
- `core:composition-resolver` — factory helper exists; spec still lists `lifecycle` on deps. **Spec-wrong**.
- `default:_global/testing` — WHEN/THEN in verify; leftover titles fail “scenario names the behavior”.
- `default:_global/architecture` — use case calls domain/application evaluate functions rather than a constructed engine. **Code matches architecture better than the ctor snippet.**

### Summary counts

- Requirements reviewed: 24
- Confirmed: 19
- Discrepancies: 0 HIGH, 1 MEDIUM, 4 LOW
- Missing tests: 4 titles

---

## Spec: `core:get-artifact-instruction`

### Requirements Summary

Read-only instruction assembly. Preview ctor still includes `LifecycleEngine`. Auto `artifactId` via `nextArtifact` from evaluate with empty `checksByTarget`; MUST NOT run hop predicates / gather snapshot bags. Factory MUST resolve `templateExpander` **and still `lifecycle: LifecycleEngine`**. Templates: spec says read path via `SchemaRegistry`; variables `change.name` + `change.path` only. Depends on `core:transition-checks` — no `gatherPredicateSnapshots`.

### Implementation Status

**DAG empty-checks path implemented; LifecycleEngine injection is not (product: no ctor injection).**

- Ctor 5 args: changes, specs map, schema, parsers, `templates` — `get-artifact-instruction.ts` ~68–80.
- Always `evaluateLifecycle(change, schema, { checksByTarget: {} })`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` (~99–102).
- `GetArtifactInstructionDeps` has no `lifecycle` (`composition/use-cases/get-artifact-instruction.ts`).
- Template: expands `artifactType.template` as string, no SchemaRegistry I/O.
- Auto-select tests cover topological first incomplete, parent-review blockage, all-complete `ArtifactNotFoundError`.
- Empty `checksByTarget` asserted inside template test via `evaluateLifecycle` spy (~99–105).

### Discrepancies

#### MEDIUM — Spec ctor/factory still require `LifecycleEngine`; code does not inject it

**Evidence:** Spec constructor block and `resolveGetArtifactInstructionDeps` MUST include `lifecycle: LifecycleEngine`. Verify: _GetArtifactInstruction is constructed with LifecycleEngine_; omitted-id scenarios name `LifecycleEngine.nextArtifact` / `LifecycleEngine.evaluate`.  
Code/composition: five-arg ctor; deps guard has no `lifecycle`. `markdown-parser-real-merge.spec.ts` even embeds the old verify heading as a string fixture.

**A (spec-wrong):** update ports/factory/verify to `evaluateLifecycle`/`evaluateLifecycleVerdict` + empty `checksByTarget`. **B (code-wrong):** inject engine — rejected by this change.

#### LOW — `evaluateLifecycle` vs `evaluateLifecycleVerdict`; hop fields unused

Same as validate: wrapper computes `nextAction` / `availableSteps` fallbacks without executing hop checks. Spec: MUST NOT evaluate hop availability. Predicates are not run; extra fields unused except `nextArtifact`.

**A:** allow wrapper. **B:** call `projectArtifacts` + `nextArtifact` helper only.

#### LOW — Template resolution: spec `SchemaRegistry` file read vs in-memory `ArtifactType.template`

**A:** schema load already inlined content. **B:** execute-time path read. Tests use inline template strings.

#### LOW — Ctor param `templates` vs spec `expander` vs deps `templateExpander`

Same hasher/`contentHasher` naming pattern. Not a behavior bug.

#### LOW — Always evaluates lifecycle even when `artifactId` is provided

Spec: use evaluate when resolving next/readiness. Code always evaluates. Harmless extra work; still empty `checksByTarget`.

### Test Coverage

| Requirement                                            | Status                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| Empty `checksByTarget`                                 | Covered (piggybacked on template expand)      |
| Auto-select topological / parent-review / all complete | Covered                                       |
| Change not found / schema mismatch / unknown id        | Covered                                       |
| Factory without `lifecycle`                            | Implicit only                                 |
| Ctor with `LifecycleEngine`                            | **Not** implemented; verify still requires it |

### Missing Tests

- Dedicated scenario: GetArtifactInstruction calls evaluate with empty `checksByTarget` and does **not** receive `LifecycleEngine`
- `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps` does not resolve `lifecycle`
- Omitted `artifactId` uses `nextArtifact` from evaluate, not declaration-order walk independent of engine (JSDoc on input still says “declaration order”)

### Spec Dependency Chain

- `core:lifecycle-engine` / `core:transition-checks` — empty checks, no hop predicates. **Behavior aligned**; injection **not**.
- `core:composition-resolver` — helper exists; spec extra `lifecycle` field. **Spec-wrong**.
- `core:template-variables` — no singular workspace. **Aligned** (test _does not expand change.workspace_).
- `core:delta-format` — `deltaInstructions()` / outlines. **Aligned**.
- `default:_global/testing` — verify still describes injected engine.

### Summary counts

- Requirements reviewed: 9
- Confirmed: 6
- Discrepancies: 0 HIGH, 1 MEDIUM, 4 LOW
- Missing tests: 3 titles

---

## Spec: `core:storage`

### Requirements Summary

Ports vs `fs` adapter. Artifact status derived at load from `validatedHash` + disk + `preHashCleanup`; drift invalidation when `artifactTypes.length > 0` via `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat baseline compare. **Artifact `requires` cascade owned by `LifecycleEngine.projectArtifacts` / `_effectiveStatus` — no `Change.effectiveStatus()`.** Load/save rewrite wire `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory. Archive pattern catalog, fs-cache indexes, locks under `configPath`, staged archive, debug logging.

### Implementation Status

**Implemented** for cascade ownership + wire coercion + load-time baseline drift.

- `projectArtifacts` / `effectiveStatus` in `lifecycle-verdict.ts` (~313–410); `Change` has **no** `effectiveStatus` method (`graph search` / entity Read).
- Load: `if (status === 'pending-parent-artifact-review') status = 'in-progress'` (`change-repository.ts` ~1422–1424).
- Save: `persistableArtifactStatus` maps parent-review → `in-progress` (~1700–1727).
- `ArtifactFile` constructor rejects persist of parent-review (`artifact-file.ts` ~52–54).
- Load invalidation ~SYSTEM_ACTOR (test _Hash mismatch on load invalidates with artifact-drift_).

### Discrepancies

#### LOW — Hexagonal layering vs `default:_global/architecture`

Invalidation **decision** lives in `FsChangeRepository` (infrastructure) calling domain `Change.invalidate`. After CODE WINS this is **required** by `core:storage`. Architecture still prefers use cases orchestrating ports.

**A:** adapter may apply persistence-time invariants using the entity. **B:** a dedicated application service should own drift before save. Product picks A.

#### LOW — Drift when canonical status is not `complete` under-tested

Spec: drifted if non-sentinel hash and not already review/skipped, and either complete-but-disk-not-complete **or** canonical not complete (including missing after validated file disappeared). Tests emphasize complete→mismatch more than missing-with-hash.

### Test Coverage

| Requirement                                                | Status                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Hash mismatch → invalidate `SYSTEM_ACTOR`                  | Covered                                                          |
| Uninitialized skip (`artifactTypes.length === 0`)          | Covered                                                          |
| Wire pending-parent-artifact-review → in-progress get/save | Covered (`change-repository.spec.ts`)                            |
| `ArtifactFile` rejects parent-review token                 | Covered (`artifact-file.spec.ts`)                                |
| Cascade not on `Change.effectiveStatus`                    | Implicit (no method); engine tests in `lifecycle-engine.spec.ts` |
| Archive pattern / fs-cache / locks                         | Pre-existing (not re-audited line-by-line)                       |

### Missing Tests

- Validated file absent on disk (`missing`) with non-sentinel `validatedHash` invalidates once with `SYSTEM_ACTOR` when types resolved
- Policy `none` on load: entity does not reopen but adapter still persists history (if not already only on `Change`)

### Spec Dependency Chain

- `core:lifecycle-engine` / `core:schema-format` — cascade. **Aligned** with code (`projectArtifacts`).
- `core:change` / `core:change-manifest` — persistable file states; parent-review not on wire after sanea. **Aligned**.
- `core:validate-artifacts` — MUST NOT repeat baseline. **Aligned**.
- `default:_global/architecture` — adapter-owned invalidate. **Tension (LOW)**.
- `default:_global/logging` — storage debug diagnostics. Pre-existing.

### Summary counts

- Requirements reviewed: 18 (change-touched status/cascade/drift + skim of indexes/patterns)
- Confirmed: 16
- Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW
- Missing tests: 2 titles

---

## Spec: `core:change`

### Requirements Summary

Entity owns persisted lifecycle, artifacts, approvals, invalidation. `VALID_TRANSITIONS` includes `archivable → archiving|designing|implementing|verifying`, `archiving → archivable|designing`, skill-aligned backward hops; archive is **not** a lifecycle from→to pair (see transition-checks). `pending-parent-artifact-review` engine-derived only; load/save **sanea** wire token to `in-progress`. Invalidation cause `spec-overlap-conflict` when another change archived with `allowOverlap`. `assertArchivable` / `isArchivable` cover `archivable` **and** `archiving`. Lifecycle interpretation authority: DAG/hops belong to `LifecycleEngine`, not the entity. Constraints still say “archivable is the only state from which a change may be archived”.

### Implementation Status

**Implemented** for transitions, parent-review persist rules, overlap cause, interpretation split.

- `VALID_TRANSITIONS` / `HAPPY_PATH_NEXT`: `change-state.ts` ~30–58 — matches lifecycle requirement.
- `isArchivable`: `state === 'archivable' || state === 'archiving'` (`change.ts` ~669–670); `assertArchivable` uses that getter.
- No `Change.effectiveStatus()`.
- History cause includes `spec-overlap-conflict` (`change.ts` ~95).
- Constraint line 435: “Archive is not a lifecycle from→to pair” — **aligned** with archive-as-checks.

### Discrepancies

#### LOW — Constraint “archivable is the only archive state” vs `isArchivable` + archive-change retry

**Evidence:** Constraints: “archivable is the only state from which a change may be archived; attempting to archive from any other state throws”. Signoff requirement: archive from non-archivable throws. Entity + `archive.archivable` + archive-change deferred retry **allow `archiving`**. Archive-change spec: retry when already `archiving`.

**A (spec-wrong):** constraints should say `assertArchivable` / `archivable|archiving`. **B (code-wrong):** reject archive unless `state === 'archivable'` — would break commit retry. CODE WINS retry.

#### LOW — Typo “sanea” in Artifacts requirement

Preview: “Load/save MUST **sanea** (coerce)”. Should be “sanitize” / “coerce”. Does not affect code (`persistableArtifactStatus`).

#### LOW — “Interpreted by `LifecycleEngine`” vs function-first API

Requirement: Lifecycle interpretation authority names `LifecycleEngine`. Code: `evaluateLifecycleVerdict` / `projectArtifacts`; class is `@deprecated`. Conceptual module vs ctor. Consistent with “no constructor injection” if read as the engine **module**, not a use-case dep.

**A:** reword to evaluate/projectArtifacts. **B:** keep class as the public facade — contradicted by deprecation + use cases.

### Test Coverage

| Requirement                                           | Status                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| VALID_TRANSITIONS / archiving escapes / backward hops | Covered (`change` / transition tests)                       |
| pending-parent not persistable on ArtifactFile        | Covered                                                     |
| Wire coerce on load/save                              | Covered (storage tests)                                     |
| spec-overlap-conflict invalidation                    | Covered via archive-change allow-overlap                    |
| Archive is not a hop                                  | Covered at check-registry / archive-change, not entity-only |
| isArchivable includes archiving                       | Implicit via archive retry tests                            |

### Missing Tests

- Entity-level: `assertArchivable` passes in `archiving` and fails in `done`
- Constraint vs retry: archive from `archiving` is allowed (if not only in archive-change.spec)

### Spec Dependency Chain

- `core:lifecycle-engine` — interpretation authority. **Aligned** (no entity cascade).
- `core:archive-change` / `core:transition-checks` — archive not a hop; overlap split. **Aligned** except “only archivable” constraint.
- `core:storage` / `core:change-manifest` — persistable states. **Aligned**.
- `core:spec-overlap` — live fail vs this cause for allow-overlap invalidation. **Aligned**.
- `default:_global/architecture` — rich entity invariants. **Aligned**.
- `default:_global/logging` — archive diagnostics in history. Indirect.

### Summary counts

- Requirements reviewed: 23 (spec.md unique headings; verify duplicates not double-counted)
- Confirmed: 20
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 2 titles

---

## Cross-cutting (globals + depth-1)

| Topic                              | Verdict                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive as checks not a hop        | **Code + archive-change + change constraint 435 aligned.** `VALID_TRANSITIONS['archivable']` still lists `archiving` as the commit state machine, not as `TransitionChange`’s happy-path “archive” hop.                                                                                                                          |
| Empty `checksByTarget` for DAG     | **Validate + GetArtifactInstruction call `evaluateLifecycle(..., { checksByTarget: {} })`.** Engine skips injected hop results when missing (`lifecycle-verdict.ts` ~170–174).                                                                                                                                                   |
| No LifecycleEngine ctor injection  | **Code/composition aligned.** **Validate + GetArtifactInstruction spec.md/verify still require injection (MEDIUM spec-wrong).**                                                                                                                                                                                                  |
| Overlap split                      | Live `OVERLAP_CONFLICT` (`domain/checks/spec-overlap.ts`); review/invalidation `spec-overlap-conflict` (archive invalidate + `reviewBlockersFromSummary` does **not** emit OVERLAP_CONFLICT for that reason — `lifecycle-verdict.ts` ~551–552). GetStatus composition: archive predicates only in `archivable` for live overlap. |
| Storage `projectArtifacts` cascade | **No `Change.effectiveStatus()`; cascade in `lifecycle-verdict.ts`.** Load/save rewrite parent-review token.                                                                                                                                                                                                                     |
| `default:_global/architecture`     | Composition helpers + manual DI. Storage load invalidate in adapter = residual LOW. Engine as functions > injecting deprecated class.                                                                                                                                                                                            |
| `default:_global/logging`          | Archive/validate/instruction emit structured `Logger.debug`. Not full WHEN/THEN coverage.                                                                                                                                                                                                                                        |
| `default:_global/testing`          | Stale verify scenarios (`LifecycleEngine` ctor, `regenerateMetadata`) fail “name the current behavior”.                                                                                                                                                                                                                          |

---

## Batch totals (this partial)

| Spec                            |    Reqs | Confirmed |  HIGH | MEDIUM |    LOW | Missing tests |
| ------------------------------- | ------: | --------: | ----: | -----: | -----: | ------------: |
| `core:archive-change`           |      31 |        27 |     0 |      0 |      4 |             5 |
| `core:validate-artifacts`       |      24 |        19 |     0 |      1 |      4 |             4 |
| `core:get-artifact-instruction` |       9 |         6 |     0 |      1 |      4 |             3 |
| `core:storage`                  |      18 |        16 |     0 |      0 |      2 |             2 |
| `core:change`                   |      23 |        20 |     0 |      0 |      3 |             2 |
| **Sum**                         | **105** |    **88** | **0** |  **2** | **17** |        **16** |

**Open MEDIUM (both spec-wrong, CODE WINS):** drop `LifecycleEngine` from `ValidateArtifacts` and `GetArtifactInstruction` constructors/factories/verify; document `evaluateLifecycle`/`evaluateLifecycleVerdict` + empty `checksByTarget` instead.
