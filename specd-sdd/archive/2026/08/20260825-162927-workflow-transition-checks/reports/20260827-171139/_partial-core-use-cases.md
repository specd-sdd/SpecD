# Spec-compliance partial: core use cases

**Auditor:** read-only (this file only).
**Change:** `workflow-transition-checks`
**Mode:** spec-preview deltas vs `packages/core` implementation
**Graph:** fresh (`stale: false`, indexed `2026-08-27T15:08:18.609Z`)
**CLI:** `node packages/cli/dist/index.js`

**Assigned specs**

| Spec ID                         | Implementation entry                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `core:get-status`               | `packages/core/src/application/use-cases/get-status.ts`               |
| `core:transition-change`        | `packages/core/src/application/use-cases/transition-change.ts`        |
| `core:archive-change`           | `packages/core/src/application/use-cases/archive-change.ts`           |
| `core:validate-artifacts`       | `packages/core/src/application/use-cases/validate-artifacts.ts`       |
| `core:get-artifact-instruction` | `packages/core/src/application/use-cases/get-artifact-instruction.ts` |
| `core:hook-execution-model`     | hooks via `createHookPre` / `createHookPost` + use-case effect loops  |

**Graph navigation used:** `graph search` on `GetStatus`, `TransitionChange`, `ArchiveChange`, `ValidateArtifacts`, `MaterializeSpecMetadata`, `executeCheckWithProgress`, `CheckProgressEvent`; `graph impact --file` on the three lifecycle use-case files; spec search for empty `checksByTarget`.

**Neither spec nor code is truth.** Each discrepancy lists both interpretations.

---

## Focus-delta scorecard

| Delta                                                                 | Verdict                         | Evidence                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress bus `check-start` / `check-progress` / `check-done`          | **Mostly implemented**          | `executeCheckWithProgress` emits start/done; `emitHookAsCheckProgress` maps `RunStepHooks` onto `check-progress` `detail`. Tests: `execute-check-with-progress.spec.ts`, `transition-change.spec.ts` (hook.post then hook.pre then `transitioned`). |
| GetStatus schema-complete `artifactStatuses`                          | **Implemented on success path** | `_buildActiveResult` iterates `schema.artifacts()`, not `change.artifacts`. Schema-failure / `unchanged` paths intentionally omit full schema projection.                                                                                           |
| `taskCompletion` from checks (no second CountTasks paint)             | **Implemented for one execute** | `taskCompletionFromChecks` reads `details.byArtifact` from `workflow.taskCompletion`. Domain runner always attaches `byArtifact`. CountTasks omits empty/missing files. **Cache over-scopes across executes** (finding F1).                         |
| TransitionChange `source.post` then `target.pre` before persist       | **Implemented**                 | `TRANSITION_BINDING_SPECS` lists `hook.post` then `hook.pre`, both `phase: before-persist`. `matchingEffects(..., 'before-persist')` preserves registry order. `_changes.mutate` follows the loop. Test asserts event order.                        |
| ArchiveChange no `RunStepHooks` ctor arg                              | **Implemented**                 | Ctor takes `archiveBindings`. `ArchiveChangeDeps` has no `runStepHooks`. Registry composes `createHookPre`/`createHookPost({ runStepHooks })`.                                                                                                      |
| `MaterializeSpecMetadata` post-commit                                 | **Implemented**                 | After `archive()` + `_batchSnapshot.cleanup`, `execute({ specId, policy: 'force' })`; failures → `staleMetadataSpecPaths`.                                                                                                                          |
| Archive post after persist, `collect`                                 | **Implemented**                 | `ARCHIVE_BINDING_SPECS` `hook.post`: `phase: after-persist`, `onFailure: collect`. Fail-soft maps to `postHookFailures`.                                                                                                                            |
| Empty `checksByTarget` for ValidateArtifacts / GetArtifactInstruction | **Implemented**                 | Both call `lifecycle.evaluate(..., { checksByTarget: {} })`. Tests spy `objectContaining({ checksByTarget: {} })`.                                                                                                                                  |

---

## `core:get-status`

### Requirements summary (delta-relevant)

- Input: `name`, optional `refreshImplementationTracking`, `ifModifiedSince`.
- Result: `artifactStatuses` schema-complete on full evaluation; empty when `unchanged`.
- Task counts from `workflow.taskCompletion` details; no global snapshot bag; no CountTasks-after-evaluate paint.
- Predicates via `check.execute` per legal target; engine I/O-free projection.
- Ctor: repo, schema, approvals, refresh, lifecycle, `transitionBindings` from `create*`.
- Factory: `resolveGetStatusDeps` + full repository bootstrap.

### Implementation status

**Aligned**

- Resolution: `get` then `getDraft`; never `getDiscarded`.
- Refresh before load unless `ifModifiedSince` short-circuit or draft / `refreshImplementationTracking === false`.
- `_buildUnchangedResult`: `artifactStatuses: []`, `unchanged: true`, no refresh.
- Success path: `projectArtifacts` → `executeChecksByLegalTargets` → `evaluate(checksByTarget)` → paint statuses from **schema artifact list**.
- `taskCompletionFromChecks` keyed by artifact type id; omitted when check details lack counts (CountTasks skips empty content).
- Schema miss: no throw; empty availableTransitions/blockers; `schemaInfo` null; statuses from attached change artifacts only (degraded path matches verify.md).
- Draft: `projectArtifacts` (spec explicitly allows this as the empty-`checksByTarget` DAG); empty `availableTransitions`.
- Composition: `createGetStatus` / `resolveGetStatusDeps` injects `transitionBindings` from `resolveWorkflowCheckRegistry`; CountTasks is inside `createWorkflowTaskCompletion`, not a GetStatus ctor port.
- Kernel: `createGetStatus(resolveGetStatusDeps(resolver))` uses the same `ChangeRepository` as the rest of the kernel (not a weaker bootstrap).

**Tests present:** `get-status.spec.ts` (CountTasks once and **before** `evaluate`; incomplete tasks hide `verifying`; blocker merge; ifModifiedSince).

### Discrepancies

#### F1 — MEDIUM — `workflow.taskCompletion` CountTasks cache is process-lifetime, not per execute

- **Spec:** GetStatus must not call CountTasks a second time **to paint** after evaluate; one CountTasks outcome may serve every legal target in **that** status evaluation.
- **Code:** `WorkflowTaskCompletionCheck` caches `{ changeName, taskCounts }` on the check instance (`workflow-task-completion.ts`). Kernel holds one `GetStatus` (`composition/kernel.ts` `status = createGetStatus(...)`) for the process. A second `GetStatus.execute` for the same name reuses stale counts.
- **If spec is right:** cache must be scoped to one `executeChecksByLegalTargets` / one TransitionChange attempt (or keyed by `updatedAt` / content), then cleared.
- **If code is right:** spec should say “at most one CountTasks per check instance until change name changes,” and accept stale status on long-lived kernels (MCP). CLI one-shot kernels hide this.
- **Tests:** `get-status.spec.ts` asserts `countTasks.execute` once **within a single execute**, which both interpretations pass. No test for two executes with intervening file edits.

#### F2 — LOW — “one status entry per artifact **attached to the change**” vs schema iteration

- **Spec (result shape):** `artifactStatuses` is one entry per artifact attached to the change.
- **Spec (factory / this change):** statuses must reflect **complete schema-driven** derivation.
- **Code:** success path is `for (const artifactType of schema.artifacts())`. Extra change-only types are dropped; schema types with no change artifact appear as `missing`.
- **If spec result-shape is right:** iterate `change.artifacts` (or union).
- **If schema-complete delta is right (likely):** tighten the result-shape sentence to “one row per schema artifact type.”
- **Tests:** full-status tests assert `artifactStatuses.length > 0` but not “every schema id present when the change has a subset.”

### Test coverage / missing tests

| Requirement                                         | Coverage                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| CountTasks before evaluate, once per execute        | Yes                                                                        |
| `taskCompletion` omitted for empty files            | Indirect (CountTasks unit); GetStatus paint from `byArtifact` not isolated |
| Schema-complete rows for types absent on the change | Missing                                                                    |
| Cross-execute cache freshness                       | Missing                                                                    |
| Progress bus                                        | N/A (GetStatus does not pass `onCheckProgress`)                            |

### Spec dependencies (depth 1)

`core:transition-checks`, `core:lifecycle-engine`, `core:drafted-change-view`, `core:refresh-implementation-tracking`, `core:composition-resolver`. No contradiction found with those beyond F1/F2 wording.

**Counts:** requirements sampled ~14 delta-critical; implemented 12; discrepancies 2; missing tests 2.

---

## `core:transition-change`

### Requirements summary (delta-relevant)

- Predicates via `executeMatchingPredicates`; map first fail to existing errors; no second algorithm.
- Effects: registry `before-persist`, **not** `check.id` switch; `source.post` then `target.pre`; then `mutate`.
- No `RunStepHooks` / `CountTasks` on the use-case ctor.
- Progress: generic check bus + `requires-check` / `task-completion-failed` / `transitioned`.
- No first-class public `hook-start` / `hook-done`.

### Implementation status

**Aligned**

- Ctor: `changes`, `actor`, `schemaProvider`, `refresh`, `approvals`, `lifecycle`, `transitionBindings`.
- `resolveTransitionChangeDeps` does not put `runStepHooks` on the use case.
- `failFast: true` on predicates; `_mapFailedPredicate` covers protocol/requires/tasks/approvals/deps/readOnly/impl.
- Effects: `matchingEffects(bindings, attempt, 'before-persist', along)` then `executeCheckWithProgress(binding.check, ctx)` — no id switch.
- Binding order: `hook.post` (forward) then `hook.pre` (except recovery) in `check-bindings.ts`.
- Skip: `skipHookPhases` on ctx; `HookEffectCheck` matches `all` / `source.post` / `target.pre` — **not** `binding.phase` alone (both effects share `before-persist`).
- Persist only after effects; `HookFailedError` via `throwHookFailed` when `onFailure` abort.
- Progress union includes `CheckProgressEvent`; hooks map to `check-progress` details (`hook-effect.ts`).
- Test: `check-start(hook.post)` → `check-done(hook.post)` → `check-start(hook.pre)` → `check-done(hook.pre)` → `transitioned`.

### Discrepancies

#### F3 — LOW — skipped effects still emit `check-start` / `check-done`

- **Spec:** when `skipHookPhases` includes `all` / `source.post` / `target.pre`, those **run:** effects are skipped.
- **Code:** the use case still iterates matching effects and calls `execute`. Skip is inside `HookEffectCheck.execute` (returns `skip` before `RunStepHooks`). `executeCheckWithProgress` still emits start/done with `outcome: 'skip'`.
- **If spec is right:** omit the effect from the loop when skipped, or do not wrap skip in the bus.
- **If code is right:** spec should say skipped effects still appear on the bus as `check-done` / `skip` so UIs can show “skipped.”
- **Tests:** skip-all still enforces predicates; bus-on-skip not asserted.

#### F4 — INFO — `source.pre` / `target.post` selectors are API-only

- Type and spec list `'source.pre'` and `'target.post'`. No transition effect is `after-persist`. Selectors are no-ops. Acceptable if reserved; otherwise spec over-promises.

### Test coverage / missing tests

| Requirement                                      | Coverage                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Generic bus + hook order before persist          | Yes (`transition-change.spec.ts`)                                     |
| Predicate `check-start`/`check-done` (e.g. deps) | Yes                                                                   |
| `executeCheckWithProgress` throw → done fail     | Yes                                                                   |
| Mid-flight `check-progress` from hooks           | Yes in hook order test (`hook-start` as **detail**, not public type)  |
| Skip-all still rejects incomplete tasks          | Covered in change (skill verify scenarios); confirm in same spec file |

**Counts:** delta-critical ~12; implemented 11; discrepancies 1–2 (F3/F4); missing tests 1.

---

## `core:archive-change` + `core:hook-execution-model` (archive slice)

### Requirements summary (delta-relevant)

- Ctor: `archiveBindings`, **not** `RunStepHooks`.
- Predicates then `before-persist` effects (abort) then persist/publish then `after-persist` (collect).
- Post-commit `MaterializeSpecMetadata` `policy: 'force'`; failures collected.
- Skip by binding phase + archive selectors `pre`/`post`/`all`, not check id.
- `instruction:` never executed (inside `RunStepHooks` / hook check).

### Implementation status

**Aligned**

- Ctor and `createArchiveChangeFromNormalized` pass `archiveBindings` in the 4th slot; no `RunStepHooks`.
- `resolveArchiveChangeDeps`: `archiveBindings: registry.archiveBindings`; `materializeMetadata: createMaterializeSpecMetadata(...)`.
- Predicates: `executeMatchingPredicates(archiveBindings, archiveAttempt)`.
- Before persist: `matchingEffects(..., 'before-persist')` + fail-fast `throwHookFailed`.
- After `archive()` + `cleanup`: materialize loop, then `matchingEffects(..., 'after-persist')` with collect → `postHookFailures`.
- Archive bindings: `hook.pre` before-persist abort; `hook.post` after-persist collect.
- `archive.archivable` calls `change.assertArchivable()` inside the check.

### Discrepancies

#### F5 — LOW — `ActorResolver.identity()` timing vs “after publications”

- **Spec (Archive repository call):** after canonical publications succeed, resolve actor **then** call `archive()`.
- **Code:** `archivingActor = await this._actor.identity()` **before** hooks/preflight (line ~316); same identity used for `archiving` transition and `archive()`.
- **If spec is right:** move identity() to immediately before `this._archive.archive`, and if it throws after publications, run batch restore (spec’s stated reason).
- **If code is right:** fail closed before any write; spec should allow a single identity captured before the archive pipeline.
- **Tests:** unlikely to distinguish timing unless identity is mocked to fail mid-flight.

#### F6 — INFO — overlap detection runs in the use case **and** in `spec.overlap`

- `execute` still calls `detectSpecOverlap` to build `relevantOverlap` for invalidation / `SpecOverlapError` mapping.
- The `spec.overlap` check also detects via composition `detectSpecOverlap`.
- Not a functional break if both agree; spec’s overlap **algorithm** is duplicated. Prefer one owner.

### Test coverage

- Archive CLI `change-archive.spec.ts` asserts `check-start` on the bus.
- Core archive tests should cover postHookFailures collect and no RunStepHooks ctor (composition/type).

**Counts:** delta-critical ~10; implemented 9; discrepancies 2 (F5/F6); missing tests: identity-after-publish, duplicate overlap.

---

## `core:validate-artifacts`

### Requirements summary (delta-relevant)

- DAG via `LifecycleEngine.evaluate` with **empty** `checksByTarget`; no hop predicates; no `gatherPredicateSnapshots`.
- Factory: `listWorkspaces` + `lifecycle` via `resolveValidateArtifactsDeps`.

### Implementation status

**Aligned (focus)**

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

- No `executeMatchingPredicates` / CountTasks on this path.
- `resolveValidateArtifactsDeps` matches the factory verify scenario (`listWorkspaces`, not a spec-repo map on deps).

### Discrepancies

#### F7 — LOW — constructor snippet in spec.md contradicts factory + code

- **Spec “Ports and constructor”** still shows `specs: ReadonlyMap<string, SpecRepository>` and no `ListWorkspaces`.
- **Spec factory + code:** `ListWorkspaces` (same pattern as ArchiveChange).
- **If constructor snippet is right:** code would be wrong (it is not what the factory/verify require).
- **If factory/code are right:** delete/replace the TypeScript constructor block in spec.md (spec drift from this change).

#### F8 — LOW (out of focus but adjacent) — in-invocation DAG update is a local `markVerdictComplete`, not `evaluate` again

- Spec: recompute lifecycle after each persisted completion in one `execute`.
- Code: completions are persisted in **one** `mutate` at the end; during the loop, `markVerdictComplete` patches `effectiveStatus: 'complete'` without re-running `evaluate` (cascade / pending-parent may stay stale for later artifacts).
- Dual: spec wants full engine re-project; code wants cheap local complete flags. Not the empty-`checksByTarget` delta.

### Test coverage

- `validate-artifacts.spec.ts` spies `evaluate(..., { checksByTarget: {} })`.
- Missing: constructor-snippet vs ListWorkspaces (docs); re-evaluate after in-pass completion.

**Counts:** focus requirements 2; implemented 2; spec-internal 1 (F7); adjacent 1 (F8).

---

## `core:get-artifact-instruction`

### Requirements summary (delta-relevant)

- `evaluate` with empty `checksByTarget` for `nextArtifact` / DAG; no hop predicates; no snapshot bag.
- Ctor includes `LifecycleEngine`.
- Factory through `resolveGetArtifactInstructionDeps`.

### Implementation status

**Aligned**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

- Default `new LifecycleEngine(...)` in ctor is a test convenience; kernel injects `resolver.getLifecycleEngine()`.
- Template vars: `{ change: { name, path } }` only.
- Tests: `get-artifact-instruction.spec.ts` `checksByTarget: {}` spy; omitted `artifactId` uses engine.

### Discrepancies

None on the assigned empty-`checksByTarget` delta.

**Counts:** focus requirements 3; implemented 3; discrepancies 0.

---

## `core:hook-execution-model` (cross-cutting)

### Aligned

- Two hook kinds; `run:` via `RunStepHooks` inside effect checks.
- Transition: both hook effects `before-persist` + `abort`; archive post `after-persist` + `collect`.
- Use cases do not branch on `hook.pre` / `hook.post` **ids** for slot/policy; they filter `matchingEffects(..., phase)`.
- Skip selectors for the two real slots: transition `source.post`/`target.pre`/`all`; archive `pre`/`post`/`all`.
- `Change` entity does not run hooks.

### Residual

- F3 (bus still fires on skip).
- F4 (unused `source.pre` / `target.post`).
- Transition `hook.pre` `along: '*'` except recovery matches redesign (spec: target.pre including redesign).

---

## Spec vs global constraints

- Hexagonal: I/O in application checks (`create*`), engine I/O-free — **held**.
- `default:_global/testing`: use-case tests exist for the bus, empty `checksByTarget`, CountTasks-once-per-execute.
- `core:transition-checks`: progress event types match `transition-checks.ts` `CheckProgressEvent`.

---

## Summary counts (this batch)

|                            |                                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| Specs audited              | 6                                                                |
| Focus deltas checked       | 8                                                                |
| Focus deltas implemented   | 8 (F1 is a cache-scope defect on an otherwise implemented delta) |
| Findings high              | 0                                                                |
| Findings medium            | 1 (F1)                                                           |
| Findings low               | 6 (F2–F5, F7–F8)                                                 |
| Findings info              | 2 (F4, F6)                                                       |
| Highest risk for reviewers | F1 (stale taskCompletion / gating on long-lived Kernel)          |

### Suggested reviewer actions (do not apply in this audit)

1. Scope `WorkflowTaskCompletionCheck` cache to a single host execute (or include `change.updatedAt`).
2. Fix `core:validate-artifacts` constructor TypeScript to `ListWorkspaces`.
3. Decide whether skipped effects belong on the progress bus.
4. Optionally add GetStatus test: schema type with no change artifact still appears in `artifactStatuses`.
