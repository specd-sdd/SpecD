# Spec-compliance partial: archive, hooks, approvals, storage, config

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:storage`, `core:config`
- **Sources:** `specd changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md); graph index `stale: false` (`2948f1a2`); application/domain/composition under `packages/core`
- **Read-only:** no spec or source files were modified
- **Architecture checks:** domain has no `application/` imports; no `class LifecycleEngine`; DAG cascade is `projectArtifacts` + module-local `effectiveStatus` in `lifecycle-verdict.ts`; no `Change.effectiveStatus()`

---

## Requirements Summary

### `core:archive-change`

Archive is an **operation** (`scope: 'archive'`), not a lifecycle hop. Constructor takes `archiveBindings` (`readonly CheckBinding[]`) and **must not** take `RunStepHooks` / `HookRunner` / `projectWorkflowHooks`. Composition: `resolveArchiveChangeDeps` pulls `archiveBindings` from `resolveWorkflowCheckRegistry`; `ArchiveChangeDeps` has no `runStepHooks`.

Guards: `schema.nameMatch` then `archive.archivable` via `assertArchivable()` for **`archivable` and `archiving`** (retry after failed commit). Overlap (`spec.overlap`, skippable `allowOverlap`) and `workspace.readOnly` (same runner as enter-`ready`) before effects. Effects: `matchingEffects(..., 'before-persist')` then persist/publish; `after-persist` for `hook.post` (`collect`). Pre-hooks use workflow step `archiving` while lifecycle state may still be `archivable`. Deferred `transition('archiving')` inside `mutate` after full-batch preflight and snapshots, skipped if already `archiving`. Merge-extract is the sealed-set `deps.consistent` guard in preflight (`runDepsConsistent` → `ArchiveDependencyMismatchError`). Remaining publication checks stay inside the use case, not as `archive.publication` on the table. Config factory delegates through `resolveArchiveChangeDeps`.

### `core:hook-execution-model`

Two hook kinds: `instruction:` (passive, `GetHookInstructions` only) vs `run:` (`HookRunner` / `RunStepHooks`). `TransitionChange` / `ArchiveChange` auto-execute matching **effects** after predicates; slot and `onFailure` come from **bindings**, not check-id branches. `RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost`, not of the lifecycle use cases. Skip via `skipHookPhases` selectors (`target.pre` / `source.post` / archive `pre`/`post` / `all`), **not** `binding.phase` alone (transition `hook.pre` and `hook.post` both `before-persist`). Archive post: `collect` / `after-persist`. Change entity does not run hooks. Template tokens: no `{{change.workspace}}`.

### `core:approve-spec` / `core:approve-signoff`

Gates baked at construction (`ApprovalGates`). Happy path: record history in **`ready` / `done`**, do **not** hop to `pending-*` or `spec-approved` / `signed-off`. Drain from `pending-spec-approval` / `pending-signoff` still transitions. Hashes from disk + schema cleanup; persist via `mutate`. Config factories go through `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`. Bindings: `approval.spec` `from=ready`; `approval.signoff` `from=done` (not archive).

### `core:storage` (change-relevant slice)

Artifact `requires` cascade owned by **`projectArtifacts` / `effectiveStatus`** (see `core:lifecycle-engine` as the verdict module, **not** `LifecycleEngine.projectArtifacts`). **No** `Change.effectiveStatus()`. Load-time file statuses from hashes; rewrite wire `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory; DAG may still **report** `pending-parent-artifact-review`. Rest of storage (indexes, archive pattern, locks, staged archive) is background for this change.

### `core:config` (change-relevant slice)

`approvals.spec` / `approvals.signoff` default false. When true: in-place consent on **`ready` / `done`**; no happy-path hops into pending states; drain remains legal. Spec dependency: `core:transition-checks` for in-place checks.

---

## Implementation Status

| Requirement area                         | Status          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hook factories, no factory barrel        | **Implemented** | `application/checks/hook-pre.ts` (`createHookPre`), `hook-post.ts` (`createHookPost`). Shared **class** `HookEffectCheck` in `hook-effect-shared.ts` (not `hook-effect.ts`, not a re-export barrel). Registry: `createWorkflowCheckRegistry` wires both via `RunStepHooks`.                                                                                                                                          |
| Archive bindings, not RunStepHooks on UC | **Implemented** | `ArchiveChange` ctor `archiveBindings` (`archive-change.ts:222–248`). Composition `archiveBindings: registry.archiveBindings`; no `runStepHooks` on `ArchiveChangeDeps`. Test: `'runStepHooks' in uc` is false.                                                                                                                                                                                                      |
| Archive = operation, not hop             | **Implemented** | `ARCHIVE_BINDING_SPECS` all `scope: 'archive'` (`check-bindings.ts:84–94`). `archiveAttempt = { scope: 'archive' }`. `approval.signoff` is transition `done → archivable` only, not archive.                                                                                                                                                                                                                         |
| Archivable **and** archiving             | **Implemented** | `Change.isArchivable`: `archivable \|\| archiving` (`change.ts:669–671`). `assertArchivable` uses that getter. Mutate: `transition('archiving')` only if not already `archiving` (`archive-change.ts:409–413`). Domain tests: `change.spec.ts` both states.                                                                                                                                                          |
| Effect selection by binding phase        | **Implemented** | `matchingEffects` filters `isEffectCheck` + `binding.phase` + `bindingMatches` (`execute-hook-effect.ts`). Archive: `before-persist` then `after-persist`. No `check.id === 'hook.pre'` in the use-case loop.                                                                                                                                                                                                        |
| Skip selectors not phase-alone           | **Implemented** | `HookEffectCheck.execute`: `all` / archive `pre`/`post` / transition `target.pre`/`source.post` (`hook-effect-shared.ts:131–147`).                                                                                                                                                                                                                                                                                   |
| onFailure abort vs collect               | **Implemented** | `hookFailureMode`; archive post `onFailure: 'collect'`; transition hooks `abort`/`before-persist`. Fail-fast throws `HookFailedError`; collect fills `postHookFailures`.                                                                                                                                                                                                                                             |
| Predicates then effects                  | **Implemented** | `executeMatchingPredicates` then `matchingEffects(..., 'before-persist')`. Predicates include schema, archivable, overlap, readOnly, deps, impl.                                                                                                                                                                                                                                                                     |
| Same runners as ready / implementing     | **Implemented** | `createDepsConsistent` / `createWorkspaceReadOnly` shared; archive persisted map from `loadArchiveSealedDependsOnBySpecId`. Impl checks on archive bindings.                                                                                                                                                                                                                                                         |
| Merge-extract deps guard                 | **Implemented** | `_assertArchiveDepsConsistent` → `runDepsConsistent` after publication preflight (`archive-change.ts:784, 1127–1154`).                                                                                                                                                                                                                                                                                               |
| Approve stay in ready/done               | **Implemented** | `ApproveSpec` / `ApproveSignoff`: `recordSpecApproval` / `recordSignoff`; transition only if pending drain. `boundFromStates('approval.spec'\|'approval.signoff')`. Tests: stay `ready`/`done`.                                                                                                                                                                                                                      |
| Approve factories                        | **Implemented** | `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` pass `resolver.config.approvals`; config form delegates to deps form.                                                                                                                                                                                                                                                                                         |
| Config approvals wording                 | **Implemented** | Preview: stay in `ready`/`done`; no happy-path pending hops. Loader: `approvals: { spec, signoff }` required booleans on resolved config.                                                                                                                                                                                                                                                                            |
| Storage DAG naming                       | **Implemented** | Preview: `projectArtifacts` / `effectiveStatus`, no `Change.effectiveStatus()`. Code: `projectArtifacts` in `lifecycle-verdict.ts:309`; `effectiveStatus` is a **function** in the same file, not a Change method. `lifecycle-engine.ts` re-exports only. Fs rewrite `pending-parent-artifact-review` → `in-progress` (`change-repository.ts:1422–1424`); `ArtifactFile` rejects persist (`artifact-file.ts:52–54`). |
| Domain / engine architecture             | **Implemented** | No domain→application imports. No `class LifecycleEngine`.                                                                                                                                                                                                                                                                                                                                                           |
| Instruction vs run                       | **Implemented** | `RunStepHooks` filters instruction; `GetHookInstructions` for text. `hookStep` archive → `'archiving'`.                                                                                                                                                                                                                                                                                                              |
| Overlap I/O vs guard order               | **Partial**     | Detection runs **before** predicate loop (`list` + `detectSpecOverlap` at `archive-change.ts:277–288`). Throw only after `spec.overlap` fails. Extra I/O on schema/state failure.                                                                                                                                                                                                                                    |
| Predicate fail-fast after schema         | **Partial**     | `executeMatchingPredicates` without `failFast` (`archive-change.ts:293–304`). Later predicates (including I/O-backed `deps.consistent`) still execute after `schema.nameMatch` fail. Spec: name match **before** archivable / hooks / file mods.                                                                                                                                                                     |

---

## Discrepancies

### 1. medium | code-wrong | Archive predicates do not fail-fast after `schema.nameMatch`

- **Spec:** Schema name guard MUST run before the archivable guard, hooks, or file modifications. Predicates are evaluated in registry order (`schema.nameMatch`, `archive.archivable`, …).
- **Code:** `ArchiveChange.execute` calls `executeMatchingPredicates` with **default options** (no `failFast` / `failFastOn`). The helper only stops early when those flags are set (`execute-matching-predicates.ts:143–147`). `TransitionChange` uses `{ failFastOn: 'protocol.edge' }`; archive does not.
- **Code-wrong:** After a schema mismatch result, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, and impl predicates still `execute`. `deps.consistent` performs extract/lock I/O. `throwMappedArchiveFailure` later maps the **first** failed check in the collected list, so the user still sees `SchemaMismatchError` if nameMatch failed first — but work already ran.
- **Spec-wrong alternative:** Spec could explicitly require collecting all archive predicate results for progress UI. Unlikely: “before the archivable guard” is sequential abort language.
- **Fix (if code):** `{ failFast: true }` or `failFastOn: 'schema.nameMatch'` on the archive call.

### 2. low | both | Dual `runDepsConsistent` (registry predicate + post-hook preflight)

- **Spec:** Registry includes archive `deps.consistent` (sealed persisted set, same runner as enter-`ready`). Separately: “Merge extraction is the `deps.consistent` guard against the sealed set.” Mismatch SHALL throw `ArchiveDependencyMismatchError` via `deps.consistent`.
- **Code:** (1) `createDepsConsistent` in the predicate loop **before** hooks (`deps-consistent.ts:59–68` + `ARCHIVE_BINDING_SPECS`). (2) `_assertArchiveDepsConsistent` **after** pre-hooks during `_prepareArchivePreflight` (`archive-change.ts:784`).
- **Both:** The change spec describes two slots with different fact sources (sidecar/lock vs merge-extract). Code faithfully dual-runs `runDepsConsistent`. Prior LOW stands: operators/tests can hit the runner twice; spec does not say “exactly once after pre-hooks.”
- **Fix (if spec):** Name “early sealed-set predicate” vs “merge-extract confirmation” as two requirements. **Fix (if code):** Drop one slot if product intent is a single guard.

### 3. low | code-wrong | Overlap scan before schema/archivable predicates

- **Spec:** Overlap after the archivable guard and before pre-archive hooks.
- **Code:** `ChangeRepository.list` + per-change `get` + `detectSpecOverlap` **before** `executeMatchingPredicates` (`archive-change.ts:277–304`). Side effects (invalidation) still wait for `allowOverlap` after predicates pass.
- **Code-wrong:** Unnecessary listing on non-archivable / schema-mismatch changes.
- **Spec-wrong alternative:** Spec could allow prefetching overlap for progress. Current text is sequential.

### 4. low | spec-wrong | Stale “archivable-only” comments vs entity + change spec

- **Change spec / verify:** `assertArchivable()` MUST pass for `archivable` **or** `archiving`.
- **Code:** Getter and tests are correct (`change.ts:669–671`, `change.spec.ts`).
- **Spec-wrong (docs in code):** `assertArchivable` JSDoc still says “in `archivable` state” (`change.ts:1066–1068`). `ArchiveChange.execute` `@throws` still says “not in `archivable` state” (`archive-change.ts:261`). Class purpose comment still “Gated on `archivable` state” (`archive-change.ts:187–188`). Preview **Purpose** line also says “gated on `archivable` state” while Requirements include `archiving`.

### 5. low | spec-wrong | Approve hash-then-mutate wording vs serialized hashes

- **Spec:** Compute hashes, **then** `mutate`; inside mutate, record on the fresh change.
- **Code:** Hashes computed **inside** the mutate callback on `freshChange` (`approve-spec.ts:91–99`, same for signoff). Safer under concurrent writes.
- **Spec-wrong:** Sequence “after computing hashes, MUST record through mutate” implies a pre-lock hash of the first loaded entity. Drain/ready behavior still matches.

**Resolved vs prior audits (not counted as open):**

- `LifecycleEngine.projectArtifacts` in storage preview: **gone**. Current text is `projectArtifacts` / `effectiveStatus` and “no `Change.effectiveStatus()`”.
- `hook-effect.ts` factory barrel: **gone**. Factories are `hook-pre.ts` / `hook-post.ts`.
- Approvals happy-path pending hops: **code and config preview** keep `ready`/`done`.

---

## Test Coverage

| Area                                        | Coverage                          | Notes                                                                                             |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Archive skip `all` / `pre` / `post`         | **Adequate**                      | `archive-change.spec.ts` (~1837–2017); step `'archiving'` for RunStepHooks.                       |
| Archive no RunStepHooks on instance         | **Adequate**                      | ~180–181.                                                                                         |
| Pre/post hook step + phase                  | **Adequate**                      | ~2791–2836.                                                                                       |
| Deferred archiving mutate                   | **Adequate**                      | ~2963–3017.                                                                                       |
| Batch restore / stay archiving              | **Adequate**                      | `archive-change-batch-restore.spec.ts`.                                                           |
| `deps.consistent` mismatch no publish       | **Partial**                       | Spy on `runDepsConsistent` exists (~991) but does not assert **call count** (dual-run).           |
| Hook factories + RunStepHooks               | **Adequate**                      | `workflow-check-factories.spec.ts` (`createHookPre` execute, `createHookPost` kind).              |
| Instruction skip / GetHookInstructions      | **Adequate**                      | `run-step-hooks.spec.ts`, `get-hook-instructions.spec.ts`.                                        |
| Transition hook skip / abort before persist | **Adequate**                      | `transition-change.spec.ts` (out of this file’s primary UC but required by hook-execution-model). |
| Approve ready/done + drain + gate off       | **Adequate**                      | `approve-spec.spec.ts`, `approve-signoff.spec.ts` (no `get` when gate disabled).                  |
| Approve composition factory                 | **Partial**                       | Instance from config/deps; **no** assertion that `resolveApproveSpecDeps` ran.                    |
| Archive composition factory                 | **Partial**                       | Same pattern; no `resolveArchiveChangeDeps` spy.                                                  |
| `assertArchivable` both states              | **Adequate**                      | `change.spec.ts`.                                                                                 |
| Archive **execute** starting in `archiving` | **Missing**                       | No `archive-change.spec.ts` success path from `archiving`.                                        |
| Storage DAG / wire rewrite                  | **Adequate**                      | `lifecycle-engine.spec.ts`, `change-repository.spec.ts`, `artifact-file.spec.ts`.                 |
| Config approvals defaults                   | **Out of this file’s test sweep** | Covered by config package tests historically; preview scenarios exist in `core:config` verify.    |

---

## Missing Tests

1. **`ArchiveChange.execute` when the change is already `archiving`** — preflight, skip second `transition('archiving')`, complete archive (spec retry). Entity-level `assertArchivable` is not enough.
2. **`failFast` after `schema.nameMatch`** — subsequent archive predicates (especially `deps.consistent`) must not run.
3. **`runDepsConsistent` call count / phase** — document whether 1 vs 2 invocations is required (ties to discrepancy 2).
4. **Composition:** `createApproveSpec(config)` / `createApproveSignoff(config)` / `createArchiveChange(config)` invoke `resolve*Deps` (verify.md factory scenarios). Current tests only check `instanceof`.
5. **Negative guard:** no `application/checks/hook-effect.ts` barrel (optional documentation test).
6. **Overlap not listed** when schema mismatch / not archivable (if discrepancy 3 is treated as a bug).

---

## Spec Dependency Chain

```
core:archive-change
  → core:change, schema-format, composition, kernel, composition-resolver,
    transition-checks (archiveBindings / operation archive),
    hook-execution-model (effects),
    (impl / deps / workspace checks shared with enter-ready / exit-implementing)

core:hook-execution-model
  → core:transition-checks, schema-format, template-variables, change
  → TransitionChange + ArchiveChange + RunStepHooks + GetHookInstructions

core:approve-spec
  → core:change, schema-format, composition, kernel, composition-resolver,
    transition-checks (approval.spec from states)

core:approve-signoff
  → same pattern, approval.signoff from states

core:storage (delta)
  → core:lifecycle-engine (projectArtifacts / effectiveStatus),
    core:schema-format, core:change-manifest, core:change

core:config (delta)
  → core:transition-checks (in-place approval checks, not pending hops)
```

Direct depth-1 consistency: change specs match global architecture (no domain→application; no LifecycleEngine class; storage names `projectArtifacts`). Config approvals align with ApproveSpec/Signoff stay-in-place. Archive `approval.signoff` is **not** bound on the archive operation (only `done → archivable` transition) — consistent with “archive is not a hop.”

---

## Counts

| Metric                                                                              | Count               |
| ----------------------------------------------------------------------------------- | ------------------- |
| Specs in this partial                                                               | 6                   |
| Requirements reviewed (grouped rows in Implementation Status)                       | 18                  |
| Implemented                                                                         | 14                  |
| Partial                                                                             | 4                   |
| Missing / not implemented                                                           | 0                   |
| Discrepancies                                                                       | 5 (1 medium, 4 low) |
| Blame: code-wrong                                                                   | 2 (plus 1 both)     |
| Blame: spec-wrong                                                                   | 2 (plus 1 both)     |
| Blame: both                                                                         | 1                   |
| Missing test items                                                                  | 6                   |
| Architecture violations (domain→app, LifecycleEngine class, Change.effectiveStatus) | **0**               |

**Prior LOW (dual `deps.consistent` after archive pre-hooks):** still open as discrepancy 2; not elevated.

**Prior medium (`LifecycleEngine.projectArtifacts` in storage spec):** **closed** in current spec-preview.
