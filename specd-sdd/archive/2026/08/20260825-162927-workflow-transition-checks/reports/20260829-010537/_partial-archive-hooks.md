# Spec-compliance partial: archive / hooks / approvals / storage / config

**Mode:** change `workflow-transition-checks`  
**Batch:** archive-hooks (`core:archive-change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:storage`, `core:config`)  
**CLI:** `node packages/cli/dist/index.js` (spec-preview + graph)  
**Graph:** `stale: false`, `contentFresh: true`, `currentRef: 2948f1a2`  
**Read-only:** no code or spec files modified.

Evidence: `changes spec-preview workflow-transition-checks <specId>`, then `graph search` (`ArchiveChange`, `RunStepHooks`, `createHookPre`, `createHookPost`, `ApproveSpec`) and source reads under `packages/core/src`. Graph `impact --file` rejected the `core:src/...` file id in this environment; file/symbol search + direct reads used as fallback.

---

## Scope and dependency inclusion (depth 1)

Change specs in this batch declare (among others): `core:transition-checks`, `core:run-step-hooks`, `core:change`, `core:workflow-model`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `default:_global/architecture`. Cross-batch contradictions with those deps are noted where they affect this batch.

---

# Spec: `core:archive-change`

## Requirements Summary

| ID    | Requirement                       | Intent                                                                                                                                                                               |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1  | Ports and constructor             | Inject repos, `archiveBindings`, parsers, schema, materialize, extractors, routes, root, snapshot, hasher. **MUST NOT** take `RunStepHooks` / `HookRunner` / `projectWorkflowHooks`. |
| AC-2  | Archive bindings not RunStepHooks | `archiveBindings` from registry; `RunStepHooks` only on `createHookPre` / `createHookPost`. `ArchiveChangeDeps` MUST NOT list `runStepHooks`.                                        |
| AC-3  | Input                             | `name`; `skipHookPhases` `pre`/`post`/`all`; `allowOverlap`; `allowOutOfScope` skips `impl.linksInScope` only, not `impl.filesResolved`.                                             |
| AC-4  | Schema name guard                 | Operation `archive`: `schema.nameMatch` before archivable, hooks, writes.                                                                                                            |
| AC-5  | ArchivedChange construction       | `ArchiveRepository.archive(change, { actor })`; use case never builds the entity.                                                                                                    |
| AC-6  | Archivable guard                  | `assertArchivable()`; archive is **not** a `from→to` hop; `approval.signoff` MUST NOT bind this operation.                                                                           |
| AC-7  | Deferred transition to archiving  | Mutate to `archiving` after preflight + snapshots, immediately before first `publish()`.                                                                                             |
| AC-8  | ReadOnly workspace guard          | Same runner as enter-`ready`; before hooks/writes; stay `archivable` on throw.                                                                                                       |
| AC-9  | Overlap guard                     | Archive-only `spec.overlap`; skippable with `allowOverlap`; still `archivable`.                                                                                                      |
| AC-10 | Pre-archive hooks                 | Operation-`archive` effects with `phase = before-persist`; select by binding table **not** `check.id === 'hook.pre'`; `onFailure` abort; skip via `skipHookPhases`.                  |
| AC-11 | Tracked artifact selection        | Use tracked `ArtifactFile.filename`; no alternate path probe.                                                                                                                        |
| AC-12 | Prepare archive plan              | Full-batch preflight before any canonical publish.                                                                                                                                   |
| AC-13 | Staged archive commit             | Preflight failure leaves canonical unchanged; commit-phase restore.                                                                                                                  |
| AC-14 | Batch canonical snapshot          | Before deferred `archiving`; no `metadata.json` in backup.                                                                                                                           |
| AC-15 | Batch canonical restore           | Reverse publish order; partial restore stays `archiving`.                                                                                                                            |
| AC-16 | Orphan backup detection           | Matching changeName auto-restore+abort; foreign abort.                                                                                                                               |
| AC-17 | Lifecycle rollback                | Successful restore → `archive-failed` + `archiving`→`archivable`.                                                                                                                    |
| AC-18 | Archive debug logging             | Structured debug at listed steps; no secrets/stderr/full files.                                                                                                                      |
| AC-19 | Delta merge and spec sync         | Per spec-scoped artifacts; parser registry; empty base for new specs.                                                                                                                |
| AC-20 | Archive repository call           | Actor required; then `archive()`; backup cleanup; fs-cache index is adapter detail.                                                                                                  |
| AC-21 | Archive index metadata            | `totalCount` maintained (adapter).                                                                                                                                                   |
| AC-22 | Post-archive hooks                | Effects with `phase = after-persist`; not `check.id === 'hook.post'`; default `collect`.                                                                                             |
| AC-23 | Spec metadata generation          | Preflight extract vs sealed `dependsOn`; post-commit `MaterializeSpecMetadata` `force`.                                                                                              |
| AC-24 | spec-lock sidecar                 | Sealed `dependsOn` precedence; `publish({ persistedState })` not separate write.                                                                                                     |
| AC-25 | Result shape                      | `archivedChange`, `archiveDirPath`, `postHookFailures`, `staleMetadataSpecPaths`, `invalidatedChanges`.                                                                              |
| AC-26 | Typed errors                      | Named `SpecdError` subclasses; no generic `Error` for those cases.                                                                                                                   |
| AC-27 | Archive checks share runners      | Registry order; no `archive.publication` check; remaining merge preflight **inside** use case.                                                                                       |
| AC-28 | Tracked implementation review     | `impl.filesResolved` same runner as forward exit `implementing`.                                                                                                                     |
| AC-29 | Implementation materialization    | Confirmed links into spec-lock.                                                                                                                                                      |
| AC-30 | Out-of-scope sidecar guard        | `impl.linksInScope`; `--allow-out-of-scope`.                                                                                                                                         |
| AC-31 | Config-based factory              | `resolveArchiveChangeDeps` → `createArchiveChange(deps)`; no `runStepHooks` on deps.                                                                                                 |

## Implementation Status

| ID                                    | Status                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1                                  | **Implemented**                                                                                                                               | `ArchiveChange` ctor in `packages/core/src/application/use-cases/archive-change.ts` (~222–249): `archiveBindings` 4th; no `RunStepHooks`.                                                                                                                                                                                                                              |
| AC-2                                  | **Implemented**                                                                                                                               | `ArchiveChangeDeps` in `packages/core/src/composition/use-cases/archive-change.ts` (~105–118): `archiveBindings`, no `runStepHooks`. Registry: `createWorkflowCheckRegistry` injects `runStepHooks` into `createHookPre`/`createHookPost` (`workflow-check-registry.ts` ~73–74, 109–110).                                                                              |
| AC-3                                  | **Implemented**                                                                                                                               | `ArchiveChangeInput`: `skipHookPhases`, `allowOverlap`, `allowOutOfScope`. Passed into check context.                                                                                                                                                                                                                                                                  |
| AC-4                                  | **Implemented**                                                                                                                               | `ARCHIVE_BINDING_SPECS` first row `schema.nameMatch` (`check-bindings.ts` ~84–85). Evaluated via `executeMatchingPredicates` before effects.                                                                                                                                                                                                                           |
| AC-5                                  | **Implemented**                                                                                                                               | `archiveRepository.archive(change, { actor })` after publications (flow ~after snapshots).                                                                                                                                                                                                                                                                             |
| AC-6                                  | **Implemented**                                                                                                                               | `archive.archivable` on archive table; `approval.signoff` only on `TRANSITION_BINDING_SPECS` (`from: done`, `to: archivable`). Archive applicability is `{ scope: 'archive' }` — not a hop.                                                                                                                                                                            |
| AC-7                                  | **Implemented**                                                                                                                               | Deferred mutate to `archiving` after plan/snapshots (spec + existing tests).                                                                                                                                                                                                                                                                                           |
| AC-8                                  | **Implemented**                                                                                                                               | `workspace.readOnly` on archive bindings; same `createWorkspaceReadOnly` instance as transitions.                                                                                                                                                                                                                                                                      |
| AC-9                                  | **Implemented**                                                                                                                               | `spec.overlap` archive-only; `allowOverlap` on context. Host still lists peers for invalidation when allowed.                                                                                                                                                                                                                                                          |
| AC-10                                 | **Implemented**                                                                                                                               | `matchingEffects(..., 'before-persist')` then `executeCheckWithProgress`; fail-fast → `throwHookFailed`. Comments state “not check id”.                                                                                                                                                                                                                                |
| AC-11–AC-21, AC-23–AC-26, AC-28–AC-29 | **Implemented** (pre-existing archive pipeline; this change wraps predicates/effects). Not re-proven line-by-line beyond hook/binding wiring. |
| AC-22                                 | **Implemented**                                                                                                                               | `matchingEffects(..., 'after-persist')`; `onFailure collect` → `postHookFailures`.                                                                                                                                                                                                                                                                                     |
| AC-27                                 | **Mostly implemented**                                                                                                                        | No `archive.publication` id. Predicates run via registry. **Also** `_assertArchiveDepsConsistent` re-invokes domain `runDepsConsistent` during `_prepareArchivePlan` (~784, 1127–1154) after before-persist effects. Spec explicitly allows remaining preflight **inside** `ArchiveChange`; this is a second invocation of the same runner, not a binding-table check. |
| AC-30                                 | **Implemented**                                                                                                                               | `impl.linksInScope` on archive table; `allowOutOfScope` on context (`impl-links-in-scope.ts`).                                                                                                                                                                                                                                                                         |
| AC-31                                 | **Implemented**                                                                                                                               | `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (~148); config factory delegates. Composition test constructs deps **without** `runStepHooks`.                                                                                                                                                                                             |

## Discrepancies

### D-AC-1 — Dual `deps.consistent` evaluation (hooks already ran)

- **Severity:** low
- **Blame:** both (spec allows in-use-case preflight; also says mismatch SHALL throw **via** `deps.consistent`)
- **Spec:** AC-27: named archive predicates include `deps.consistent` with sealed-set facts; remaining merge/publish preflight stays inside the use case after those predicates. AC-10: before-persist effects run after predicates that must precede effects.
- **Code:** `createDepsConsistent` loads sealed maps via `loadArchiveSealedDependsOnBySpecId` **before** hooks (`deps-consistent.ts` ~59–68). Later `_assertArchiveDepsConsistent` runs the same `runDepsConsistent` on publication-plan `finalDependsOn` **after** before-persist effects (`archive-change.ts` ~1127–1154).
- **Impact:** If merge-time extract disagrees with the earlier sealed snapshot, `run:` pre-hooks have already executed. Spec order (predicates → effects → remaining preflight) **requires** that. The second path does not go through `Check.execute` / `throwMappedArchiveFailure`.
- **If spec is wrong:** tighten AC-27 to say merge-time `runDepsConsistent` is required remaining preflight, not “via the check”.
- **If code is wrong:** fail archive on the named check only, or move merge-time assert before effects (would contradict “remaining preflight after predicates+effects”).

### D-AC-2 — verify.md leftover “state transition” wording vs deferred `archiving`

- **Severity:** low
- **Blame:** spec-wrong
- **Spec:** verify scenario “Guard runs after archivable check and **state transition**” still implies a hop before readOnly; spec.md deferred transition is after snapshots.
- **Code:** readOnly is an archive **predicate** while still `archivable`.
- **If spec is wrong:** rename the verify scenario.
- **If code is wrong:** N/A for this wording.

No leftover `hook.pre`/`hook.post` id branching in the use-case loop: selection is `matchingEffects` + `binding.phase` (`execute-hook-effect.ts`).

## Test Coverage

| Area                                                            | Tests                                                                   | Adequacy                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ctor without stored `RunStepHooks`                              | `archive-change.spec.ts` “does not store RunStepHooks”                  | Adequate for instance fields; helper still **takes** `RunStepHooks` to build bindings (`helpers.ts` `newArchiveChange`). |
| `ArchiveChangeDeps` has `archiveBindings`, not `runStepHooks`   | `composition/use-cases/archive-change.spec.ts`                          | Adequate.                                                                                                                |
| Skip `all`/`pre`/`post`                                         | `archive-change.spec.ts` skipHookPhases cases                           | Adequate.                                                                                                                |
| Matching archive effect slots                                   | `matching-effects.spec.ts` before-persist abort / after-persist collect | Adequate for binding policy; uses **domain** `ARCHIVE_BINDINGS` (noop execute).                                          |
| Constructor does not accept `RunStepHooks` as a typed parameter | Implicit via production ctor                                            | Weak: tests never type-fail a `RunStepHooks` 4th argument because the helper maps it to bindings.                        |

## Missing Tests

- Direct test that `ArchiveChange` constructor **parameter list** has no `RunStepHooks` (compile/API), not only `'runStepHooks' in uc`.
- Application-registry (I/O) archive effect order: `createWorkflowCheckRegistry` bindings, not only domain stubs.
- Divergence: early `loadArchiveSealedDependsOnBySpecId` pass vs later `_assertArchiveDepsConsistent` fail (documents D-AC-1).
- `throwHookFailed` unit tests (`hook-failed.ts` has none).

## Spec Dependency Chain

`core:archive-change` → `core:transition-checks` (archive operation + shared runners), `core:hook-execution-model` / `core:run-step-hooks` (effects via checks), `core:storage` (archive adapter), `core:change`, `core:schema-format`, `core:composition-resolver`. **Consistent** with archive-as-operation and `archiveBindings` vs `transitionBindings`.

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID   | Requirement                           | Intent                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1  | Two hook types                        | `instruction:` vs `run:`; exclusive keys (schema).                                                                                                                                                                                                                  |
| H-2  | External hooks explicit               | `external: { type, config }`; `HookRunner` still shell-only.                                                                                                                                                                                                        |
| H-3  | External hooks follow phase semantics | Same pre fail-fast / post collect-or-abort as shell.                                                                                                                                                                                                                |
| H-4  | instruction hooks passive             | Skip in Transition/Archive/`RunStepHooks`; `GetHookInstructions` only.                                                                                                                                                                                              |
| H-5  | Default execution                     | After predicates; slot from **binding** `phase`/`onFailure`; `RunStepHooks` ctor dep of hook **checks**, not launched by id in use cases; no private always-source.post; `skipHookPhases` by skip selectors because transition both effects share `before-persist`. |
| H-6  | Two execution modes                   | Standalone `RunStepHooks` fail-fast pre / fail-soft post; use cases use binding `onFailure`. Transition `hook.post` abort before persist.                                                                                                                           |
| H-7  | Change entity does not execute hooks  | Application layer.                                                                                                                                                                                                                                                  |
| H-8  | Manual skipHooks                      | Transition: `source.pre`/`source.post`/`target.pre`/`target.post`/`all`; archive: `pre`/`post`/`all`. `source.pre`/`target.post` no-ops on this table.                                                                                                              |
| H-9  | Pre-hook failure                      | Fail-fast; Transition/Archive throw `HookFailedError`; no persist / no files.                                                                                                                                                                                       |
| H-10 | Post-hook failure                     | Binding `onFailure`; archive post collect; transition post abort.                                                                                                                                                                                                   |
| H-11 | Hook ordering                         | Schema then project declaration order (in `RunStepHooks`).                                                                                                                                                                                                          |
| H-12 | Template variables                    | `change.name`/`path`, `project.root`; no `change.workspace`.                                                                                                                                                                                                        |

## Implementation Status

| ID                   | Status                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1, H-4, H-11, H-12 | **Implemented** (primarily `RunStepHooks` / schema; not re-audited in full).           |
| H-2, H-3             | **Not re-verified** in this batch beyond model text; dispatch lives in `RunStepHooks`. |
| H-5                  | **Implemented**                                                                        | Separate modules: `hook-pre.ts`, `hook-post.ts`; shared **class** `HookEffectCheck` in `hook-effect-shared.ts` (not a barrel re-exporting factories). `hook-failed.ts` is `throwHookFailed`, not a Check. Use cases: `matchingEffects` by `phase`. Skip: `HookEffectCheck.execute` uses `all` / archive `pre`/`post` / transition `target.pre`/`source.post` — **not** `binding.phase` alone (`hook-effect-shared.ts` ~131–147). |
| H-6                  | **Implemented**                                                                        | `hookFailureMode`: abort → fail-fast, collect → fail-soft (`execute-hook-effect.ts`). Transition bindings: both hook effects `before-persist` + `abort`. Archive post: `after-persist` + `collect`.                                                                                                                                                                                                                              |
| H-7                  | **Implemented**                                                                        | No `HookRunner` on `Change`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| H-8                  | **Implemented**                                                                        | Skip selectors as above; tests in `transition-change.spec.ts` for `source.pre`/`target.post` no-ops.                                                                                                                                                                                                                                                                                                                             |
| H-9, H-10            | **Implemented**                                                                        | `throwHookFailed` on abort; archive collect appends `details.commands`.                                                                                                                                                                                                                                                                                                                                                          |
| Domain stubs         | **Fixture-only**                                                                       | `domain/checks/hook-pre.ts` / `hook-post.ts` **always skip**. Comments still say “execute calls `RunStepHooks`” — false for domain objects. Production I/O is application `create*`.                                                                                                                                                                                                                                             |

## Discrepancies

### D-H-1 — No leftover factory barrel; shared implementation file remains

- **Severity:** info / none as defect
- **Blame:** n/a (compliant with “no leftover hook-effect barrel re-exporting factories”)
- **Code:** Glob: only `hook-effect-shared.ts`, not `hook-effect.ts`. Factories live in `hook-pre.ts` / `hook-post.ts` and import the class.
- **Note:** `hook-failed.ts` is an abort helper, not a Check module. Focus list named it beside Check files; `core:hook-execution-model` does not define a `hook.failed` check id.

### D-H-2 — Domain hook Check comments vs always-skip execute

- **Severity:** low
- **Blame:** code-wrong (comments)
- **Spec:** H-5: `RunStepHooks` is a constructor dep of hook **checks** (application `create*`). Domain table exists for matcher tests (`TRANSITION_BINDINGS`).
- **Code:** `domain/checks/hook-pre.ts` JSDoc: “execute calls `RunStepHooks`”; `execute` always `skip`.
- **If spec is wrong:** document domain stubs as skip-only.
- **If code is wrong:** fix comments (or stop claiming domain execute runs hooks).

### D-H-3 — `matchingEffects` tests use domain bindings (noop execute)

- **Severity:** low
- **Blame:** both (tests vs production registry)
- **Spec:** use cases MUST compose application `create*`.
- **Code:** `matching-effects.spec.ts` imports `TRANSITION_BINDINGS` / `ARCHIVE_BINDINGS` (domain). Slot/policy assertions still valid. Execution of real `RunStepHooks` is covered in use-case specs via `makeArchiveBindings` / transition helpers.

## Test Coverage

| Requirement                        | Coverage                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| H-5 skip not by phase alone        | `transition-change.spec.ts` source.pre / target.post / target.pre / source.post |
| Recovery omits both effects        | `matching-effects.spec.ts` `archiving → archivable`                             |
| Redesign/backward omit `hook.post` | `matching-effects.spec.ts`                                                      |
| Factory injects `RunStepHooks`     | `workflow-check-factories.spec.ts` `createHookPre`                              |
| `createHookPost` kind effect       | factories spec (build only, no execute)                                         |

## Missing Tests

- `createHookPost.execute` archive skip `pre` vs `post`.
- `throwHookFailed` mapping of missing `details`.
- Negative: no `packages/core/src/application/checks/hook-effect.ts` barrel (documentation/guard).
- External hook phase semantics (H-2/H-3) not in this file’s tests.

## Spec Dependency Chain

Depends on `core:workflow-model`, `core:run-step-hooks`, `core:transition-change`, `core:archive-change`, `core:transition-checks`, `core:config` (skip is use-case/CLI, not yaml). **Consistent** with checks owning `RunStepHooks`.

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                 | Intent                                                                                                                                                                       |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                  | Disabled → `ApprovalGateDisabledError` `'spec'`, no I/O; then load, actor, schema, name match.                                                                               |
| AS-2 | Change lookup               | `ChangeNotFoundError`.                                                                                                                                                       |
| AS-3 | Artifact hash computation   | Skip missing/skipped; skip null loads; cleanup then hash; keys `type:key`.                                                                                                   |
| AS-4 | Approval recording          | `recordSpecApproval`; **no** hop to `pending-spec-approval` / `spec-approved` when in bound `from` (`ready`); drain from `pending-spec-approval` MAY hop to `spec-approved`. |
| AS-5 | Persistence                 | `mutate`; return mutated `Change`.                                                                                                                                           |
| AS-6 | Input contract              | `name` + `reason` only.                                                                                                                                                      |
| AS-7 | Gates baked at construction | `approvals: ApprovalGates`.                                                                                                                                                  |
| AS-8 | Factory                     | `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`.                                                                                                              |

## Implementation Status

| ID                   | Status          | Evidence                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1–AS-3, AS-5–AS-8 | **Implemented** | `approve-spec.ts`; composition `resolveApproveSpecDeps` (~37–).                                                                                                                                                                                                                                                  |
| AS-4                 | **Implemented** | `boundFromStates('approval.spec')` (`check-bindings.ts` → `ready`). Mutate: `recordSpecApproval`; `transition('spec-approved')` **only if** `pending-spec-approval`. No `pending-spec-approval` write on ready. `VALID_TRANSITIONS.ready` is `implementing`/`designing` only — happy path cannot hop to pending. |

## Discrepancies

None material for in-place ready consent.

**Note:** verify “Change is not in ready or pending-spec-approval” / drafting → `InvalidStateTransitionError` is implemented via `consentFrom` + drain state (~86–88). Error `to` uses `consentFrom[0] ?? 'ready'`, not a pending hop.

## Test Coverage

| Scenario                           | Test                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| Ready stays ready                  | `approve-spec.spec.ts` “records consent and stays in ready” |
| Drain to spec-approved             | same file drain describe                                    |
| Gate disabled / not found / hashes | existing describes                                          |

## Missing Tests

- Explicit assert that `transition('pending-spec-approval')` is **never** called (spy on `Change.transition`).
- `boundFromStates('approval.spec')` equals `['ready']` coupled to bindings (would catch binding drift).

## Spec Dependency Chain

`core:transition-checks` (`from` states). Aligns with `core:config` Approvals (in-place `approval.spec`). No contradiction with `VALID_TRANSITIONS` (pending is drain-only inbound).

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec: stay in **`done`**; drain `pending-signoff` → `signed-off`; gate `'signoff'`; `resolveApproveSignoffDeps`.

## Implementation Status

**Implemented** (`approve-signoff.ts` ~86–98; `boundFromStates('approval.signoff')` → `done`). `VALID_TRANSITIONS.done` has no `pending-signoff`. Archive operation does **not** bind `approval.signoff` (AC-6).

## Discrepancies

None material.

## Test Coverage

`approve-signoff.spec.ts` “records consent and stays in done”; drain to `signed-off`.

## Missing Tests

Same as ApproveSpec: spy that `pending-signoff` is not written on `done`.

## Spec Dependency Chain

Same pattern as ApproveSpec + `approval.signoff` binding `done → archivable` forward only.

---

# Spec: `core:storage`

## Requirements Summary (focus + rest)

This change’s delta for storage is **Artifact dependency cascade**: DAG owned by `LifecycleEngine.projectArtifacts` / `_effectiveStatus`; **no** `Change.effectiveStatus()`; load-time file statuses from hashes; rewrite persisted `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory; effective DAG may still **report** `pending-parent-artifact-review`.

Other storage requirements (directory naming, archive pattern, fs-cache index, staged archive, locks, etc.) are **unchanged by this delta** and treated as inherited; not re-audited exhaustively here.

## Implementation Status

| Focus item                        | Status          | Evidence                                                                                                                              |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No `Change.effectiveStatus()`     | **Implemented** | No matches in `packages/core/src/domain/entities`.                                                                                    |
| `projectArtifacts` owns cascade   | **Implemented** | `lifecycle-verdict.ts` `projectArtifacts` (~313–327) calls private `effectiveStatus` (~356+). Re-exported from `lifecycle-engine.ts`. |
| Load rewrite PPAR → `in-progress` | **Implemented** | `change-repository.ts` (~1422, ~1701).                                                                                                |
| `ArtifactFile` rejects PPAR       | **Implemented** | `artifact-file.ts` (~52–54).                                                                                                          |
| Effective DAG may be PPAR         | **Implemented** | `effectiveStatus` returns `pending-parent-artifact-review` (~406).                                                                    |

## Discrepancies

### D-ST-1 — Spec name `_effectiveStatus` vs code `effectiveStatus`

- **Severity:** low
- **Blame:** spec-wrong
- **Spec:** “`LifecycleEngine.projectArtifacts` / `_effectiveStatus`”.
- **Code:** function is `effectiveStatus` (unexported) in `lifecycle-verdict.ts`, not a method `_effectiveStatus` on `LifecycleEngine` (that file is a re-export barrel).
- **If spec is wrong:** say `projectArtifacts` + private `effectiveStatus` in `lifecycle-verdict.ts`.
- **If code is wrong:** rename to `_effectiveStatus` on an engine object (unlikely desired).

Comments in `transition-change.spec.ts` still say `effectiveStatus('tasks')` as a shorthand for DAG projection — not a `Change` method.

## Test Coverage

`lifecycle-engine.spec.ts` / `get-status.spec.ts` cascade cases. `artifact-file` reject token. Fs load rewrite: `change-repository.spec.ts` (inherited).

## Missing Tests

- Explicit `expect(Change.prototype).not.toHaveProperty('effectiveStatus')` or similar API lock.
- Config-level test N/A.

## Spec Dependency Chain

Storage → `core:lifecycle-engine` for DAG. **Consistent** with GetStatus/TransitionChange using `projectArtifacts`, not entity methods.

---

# Spec: `core:config`

## Requirements Summary

This change’s delta is **Requirement: Approvals**: `approvals.spec` / `approvals.signoff` are **in-place checks**, not pending hops; stay in `ready` / `done`; drain remaining; `change transition` targeting pending is never next-action.

**`skipHookPhases`:** not a `specd.yaml` field in this spec (or this delta). It is use-case/CLI input (`core:hook-execution-model`, CLI flags).

**`allow-out-of-scope`:** not a config key; `ArchiveChangeInput` / `TransitionChangeInput` + `impl.linksInScope`.

All other config requirements (discovery, workspaces, storage paths, plugins, …) are inherited; not the focus of this delta.

## Implementation Status

| Item                       | Status                    | Evidence                                                           |
| -------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Approvals yaml shape       | **Implemented**           | Spec preview Approvals section; `ApprovalGates` on use cases.      |
| In-place spec gate         | **Implemented**           | `approval.spec` check + `VALID_TRANSITIONS.ready` without pending. |
| In-place signoff           | **Implemented**           | `approval.signoff` on `done → archivable`; archive unbound.        |
| skipHookPhases in yaml     | **N/A (correct absence)** | No matches in `specd-config.ts`.                                   |
| allow-out-of-scope in yaml | **N/A (correct absence)** | Flag on check context, not config.                                 |

## Discrepancies

### D-CFG-1 — Config verify scenario not covered under config-loader tests

- **Severity:** low
- **Blame:** both
- **Spec:** verify “Spec gate on does not require pending-spec-approval in the graph” (WHEN change in `ready` evaluated for `implementing`, wait is `approval.spec`).
- **Code:** behavior lives in transition checks + `TransitionChange`, not config-loader. Grep of `packages/core/test` `*config*` found **no** `pending-spec-approval` assertion.
- **If spec is wrong:** move scenario to `core:transition-checks` / `core:get-status` verify only.
- **If code is wrong:** add a config-package test that only documents defaults (weak) **or** keep scenario in transition tests and drop it from config verify.

`TransitionChange._assertDrainAndGateTargets` blocks targeting pending **when the gate is off** (`gate-not-required`). When the gate is **on**, protocol still cannot hop `ready → pending-spec-approval` because it is not in `VALID_TRANSITIONS`. Compliant with “new work MUST NOT enter pending as happy-path hop”.

## Test Coverage

Config verify load defaults / `approvals.spec: true` — existing config-loader tests (inherited). In-place wait: `transition-change` / approval check tests, not config package.

## Missing Tests

- Config verify scenario “Spec gate on does not require pending hop” as an automated test (or relocate the scenario).
- No tests should assert `skipHookPhases` on `SpecdConfig` (would be spec-wrong).

## Spec Dependency Chain

`core:config` now depends on `core:transition-checks`. Aligns with ApproveSpec/Signoff and `approval.*` bindings. Does **not** contradict skip-hook CLI mapping living on lifecycle use cases.

---

# Cross-cutting (focus checklist)

| Focus                                                      | Verdict                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive is operation not hop                               | **Pass** — `ARCHIVE_BINDING_SPECS` `scope: 'archive'`; no `protocol.edge`; no `approval.signoff` on archive.                                      |
| `archiveBindings` vs `transitionBindings`                  | **Pass** — `WorkflowCheckRegistry` both tables from `applyBindingSpecs`.                                                                          |
| Separate Check modules; no factory barrel                  | **Pass** — `hook-pre.ts` / `hook-post.ts`; helper `hook-failed.ts`; `hook-effect-shared.ts` is shared **implementation**, not a re-export barrel. |
| `RunStepHooks` dep of hook checks, not use-case loop-by-id | **Pass** — registry injects into `createHook*`; use cases call `matchingEffects` + `check.execute`.                                               |
| Approvals stay ready/done                                  | **Pass** — use cases + `VALID_TRANSITIONS`.                                                                                                       |
| Storage DAG / no `Change.effectiveStatus()`                | **Pass** (naming nit D-ST-1).                                                                                                                     |
| Config skipHook / allow-out-of-scope                       | **N/A on yaml**; implemented on use-case input + checks.                                                                                          |

---

# Summary counts

| Spec                               | Requirements reviewed | Implemented                    | Partial               | Missing | Discrepancies                                      |
| ---------------------------------- | --------------------- | ------------------------------ | --------------------- | ------- | -------------------------------------------------- |
| `core:archive-change`              | 31                    | 30                             | 1 (AC-27 dual runner) | 0       | 2 (D-AC-1 low both; D-AC-2 low spec-wrong)         |
| `core:hook-execution-model`        | 12                    | 12 (H-2/H-3 not deep-verified) | 0                     | 0       | 2 (D-H-2 low code-wrong comments; D-H-3 low tests) |
| `core:approve-spec`                | 8                     | 8                              | 0                     | 0       | 0                                                  |
| `core:approve-signoff`             | 8                     | 8                              | 0                     | 0       | 0                                                  |
| `core:storage` (focus + inherited) | 1 delta + inherited   | Focus 5/5                      | 0                     | 0       | 1 (D-ST-1 low spec-wrong)                          |
| `core:config` (Approvals delta)    | 1 delta + N/A flags   | Delta implemented              | 0                     | 0       | 1 (D-CFG-1 low both)                               |

**Totals (this batch):**

- **Requirements with a finding:** 6 discrepancy rows (none high/critical).
- **Highest severity:** low.
- **Blockers for “checks own hooks / archive is an operation / in-place approvals”:** none found.

**Severity × blame**

| ID      | Severity | Blame      |
| ------- | -------- | ---------- |
| D-AC-1  | low      | both       |
| D-AC-2  | low      | spec-wrong |
| D-H-2   | low      | code-wrong |
| D-H-3   | low      | both       |
| D-ST-1  | low      | spec-wrong |
| D-CFG-1 | low      | both       |
