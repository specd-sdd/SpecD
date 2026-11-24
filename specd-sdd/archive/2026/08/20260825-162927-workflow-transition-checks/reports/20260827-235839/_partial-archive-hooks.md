# Spec compliance — archive / hooks batch

**Change:** `workflow-transition-checks`  
**Mode:** spec-preview (merged deltas)  
**Specs:** `core:archive-change`, `core:hook-execution-model`, `core:workflow-model`, `core:validate-artifacts`, `core:get-artifact-instruction`  
**Focus:** `skipHookPhases` `source.pre` / `target.post` no-ops; archive `--allow-overlap` / `--allow-out-of-scope`; `archiveBindings` vs GetStatus; `hook.pre` / `hook.post` as effects; `ValidateArtifacts` ctor `ListWorkspaces`  
**Graph:** indexed `current` at audit time (`knownStaleSinceLastIndex: false`). Implementation paths confirmed via graph search + file read. No source/spec edits.

---

## Requirements Summary

### `core:archive-change` (32 unique requirements)

| ID          | Requirement                                                                                                              | Intent                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01       | Ports and constructor                                                                                                    | Inject `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, **`archiveBindings`**, actor, parsers, schema, materialize metadata, extractors, routes, project root, batch snapshot. No `RunStepHooks` / `HookRunner` on the use case. Workspace lookup via `ListWorkspaces`. |
| AC-02       | Archive bindings not RunStepHooks                                                                                        | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`. No ctor fallback that builds default bindings from `RunStepHooks`. `RunStepHooks` lives on `createHookPre` / `createHookPost` only.                                                       |
| AC-03       | Input                                                                                                                    | `skipHookPhases` (`pre` / `post` / `all`), `allowOverlap` (default false), `allowOutOfScope` skippable `impl.linksInScope` only — **MUST NOT** bypass `impl.filesResolved`.                                                                                                       |
| AC-04       | Schema name guard                                                                                                        | `schema.nameMatch` on operation `archive` before archivable guard, hooks, or writes.                                                                                                                                                                                              |
| AC-05       | ArchivedChange construction                                                                                              | `ArchiveRepository.archive(change, { actor })`; result includes that entity.                                                                                                                                                                                                      |
| AC-06       | Archivable guard                                                                                                         | `archive.archivable` / `assertArchivable()`; not a lifecycle `from→to`; `approval.signoff` not bound. Retry from `archiving` allowed.                                                                                                                                             |
| AC-07       | Deferred transition to archiving                                                                                         | Stay `archivable` through overlap, readOnly, pre-hooks, preflight; mutate to `archiving` after snapshots, before first `publish()`.                                                                                                                                               |
| AC-08       | ReadOnly workspace guard                                                                                                 | Same runner as enter-`ready`; before hooks/writes.                                                                                                                                                                                                                                |
| AC-09       | Overlap guard                                                                                                            | `spec.overlap` skippable with `allowOverlap` / `--allow-overlap`; archive-only (not enter-`ready`). On allow: invalidate peers.                                                                                                                                                   |
| AC-10       | Pre-archive hooks                                                                                                        | Operation-`archive` **effects** with `phase = before-persist`; select by binding phase not `check.id === 'hook.pre'`; `onFailure` abort; skip via `pre`/`all`. Skip never drops predicates.                                                                                       |
| AC-11–AC-20 | Tracked files, preflight, staged commit, snapshots, restore, orphans, rollback, debug logging, delta merge, archive repo | Atomic multi-spec archive contract (unchanged by this change’s check-table work except logging of skipped hook phases).                                                                                                                                                           |
| AC-21       | Post-archive hooks                                                                                                       | Effects with `phase = after-persist`, `onFailure = collect`.                                                                                                                                                                                                                      |
| AC-22–AC-24 | Spec metadata, spec-lock, result shape                                                                                   | Post-commit materialization + `postHookFailures` / `invalidatedChanges`.                                                                                                                                                                                                          |
| AC-25       | Typed errors                                                                                                             | `SpecOverlapError`, `HookFailedError`, `ArchiveImplementationStateError`, etc.                                                                                                                                                                                                    |
| AC-26       | Archive checks share runners                                                                                             | Registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`; no `archive.publication` check.                                                                                     |
| AC-27       | Tracked implementation review                                                                                            | Same `impl.filesResolved` runner as forward exit from `implementing`.                                                                                                                                                                                                             |
| AC-28       | Implementation materialization                                                                                           | Sidecar `spec-lock` writes.                                                                                                                                                                                                                                                       |
| AC-29       | Out-of-scope sidecar update guard                                                                                        | Default fail; `--allow-out-of-scope` allows; same skippable flag on exit-implementing.                                                                                                                                                                                            |
| AC-30       | Config factory                                                                                                           | `resolveArchiveChangeDeps` → canonical ctor; `archiveBindings` from registry; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                           |

### `core:hook-execution-model` (14 unique requirements)

| ID        | Requirement                          | Intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HEM-01    | Two hook types                       | `instruction:` query-only; `run:` via `HookRunner`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| HEM-02–03 | External hooks                       | Explicit `external:` type; same pre/post failure semantics as `run:`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| HEM-04    | instruction hooks are passive        | `TransitionChange` / `ArchiveChange` / `RunStepHooks` skip them; not predicates/effects.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| HEM-05    | Default execution                    | After predicates pass, execute matching **effects**. Slot/failure from **binding** (`phase`, `onFailure`), not check id. Transition: both `hook.pre` and `hook.post` are `before-persist` / `abort`. Archive: `hook.pre` abort/before-persist; `hook.post` collect/after-persist. No private always-source.post path. `skipHookPhases` selects by binding phase **plus** skip selectors. Transition skip **MUST NOT** rely on `binding.phase` alone (`source.pre` / `target.post` no-ops on this table). |
| HEM-06    | Two execution modes                  | Standalone `RunStepHooks` fail-fast pre / fail-soft post; use cases apply binding `onFailure`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| HEM-07    | Change entity does not execute hooks | Application layer only; default path still auto-runs effects.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| HEM-08    | Manual skipHooks                     | Transition: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. Archive: `pre`, `post`, `all`. Predicates still run.                                                                                                                                                                                                                                                                                                                                                                        |
| HEM-09–11 | Pre/post failure + ordering          | Fail-fast abort before persist; archive post collect; schema then project order.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| HEM-12    | Template variables                   | `change.name` / `change.path` / `project.root`; no `change.workspace`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### `core:workflow-model` (11 unique requirements)

| ID    | Requirement                  | Intent                                                                                                                                                                                                       |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WM-01 | Step names = domain states   | `workflow[]` configures extras; unknown step rejected at `buildSchema`.                                                                                                                                      |
| WM-02 | Step semantics               | Designing / implementing / verifying / archiving roles; drift → designing.                                                                                                                                   |
| WM-03 | Requires-based gating        | `workflow.requires` with `to = effective`; **GetStatus and TransitionChange share evaluation**.                                                                                                              |
| WM-04 | Task completion gating       | `workflow.taskCompletion` via `CountTasks`; not engine file walks.                                                                                                                                           |
| WM-05 | Step availability            | Engine projections of predicate `CheckResult`s; CompileContext must not evaluate hops.                                                                                                                       |
| WM-06 | Workflow array order         | Display + progress axis for `along`; designing = redesign; archiving→archivable = recovery.                                                                                                                  |
| WM-07 | Step-to-state mapping        | Step name IS state name.                                                                                                                                                                                     |
| WM-08 | Hook execution at boundaries | `run:` are **effects** with same matcher as predicates; post `along = forward` only; instruction not in pipeline. Transition effects **before persist**. Archive hooks are operation `archive`, not `along`. |
| WM-09 | Two execution modes          | One pipeline: predicates then matching effects; `skipHookPhases` is not a second engine.                                                                                                                     |
| WM-10 | Requires are artifact IDs    | Not step names.                                                                                                                                                                                              |
| WM-11 | (implicit from deps)         | Transition-checks table is source of matcher/`along`.                                                                                                                                                        |

### `core:validate-artifacts` (27 unique requirements)

| ID          | Requirement                                                                                                                                                                                 | Intent                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VA-01       | Ports and constructor                                                                                                                                                                       | `ChangeRepository`, **`ListWorkspaces`** (not `ReadonlyMap<SpecRepository>`), schema, parsers, actor, hasher, extractors, routes, **`LifecycleEngine`**. |
| VA-02–VA-23 | Input, schema guard, required/deps, topo order, bypass complete, approval/drift, per-file, expected paths, delta/no-op, structural, cross-artifact, metadata, hash, result, save, dependsOn | Existing validation chokepoint (mostly unchanged).                                                                                                       |
| VA-24       | Config factory                                                                                                                                                                              | `resolveValidateArtifactsDeps` must include `listWorkspaces` + `lifecycle`; no inline fs wiring.                                                         |
| VA-25       | DAG lifecycle from engine evaluate                                                                                                                                                          | `LifecycleEngine.evaluate` with **empty `checksByTarget`**. No hop predicates. No `gatherPredicateSnapshots`.                                            |

### `core:get-artifact-instruction` (10 unique requirements)

| ID        | Requirement                                                                     | Intent                                                                               |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GAI-01    | Ports and constructor                                                           | Changes, **spec repo map**, schema, parsers, expander, **`LifecycleEngine`**.        |
| GAI-02    | Input                                                                           | Optional `artifactId`; else `LifecycleEngine.nextArtifact`.                          |
| GAI-03–07 | Lookup, schema guard, artifact resolution, instruction resolution, result shape | Read-only instruction payload; `change` vars = `name`+`path` only.                   |
| GAI-08    | Config factory                                                                  | `resolveGetArtifactInstructionDeps` includes `lifecycle`.                            |
| GAI-09    | Effective status from DAG evaluate                                              | `evaluate(..., { checksByTarget: {} })`. Not GetStatus hop path. Not a snapshot bag. |

---

## Implementation Status

### Focus: `skipHookPhases` `source.pre` / `target.post` no-ops

**Implemented.** `HookPhaseSelector` includes all four dotted selectors plus `all`. Skip is applied inside `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts`):

- `all` skips both phases
- transition `pre` skips only on `target.pre`
- transition `post` skips only on `source.post`
- archive uses `pre` / `post`

`source.pre` and `target.post` are accepted in the type/CLI set but never tested in that skip table, so matching `hook.pre` / `hook.post` still run. That matches HEM-05/HEM-08 scenarios (“no-op on this table”) because both transition hook effects share `phase = before-persist` and skip must not key off `binding.phase` alone.

`TransitionChange` does not branch on check id to launch `RunStepHooks`; it loops `matchingEffects(..., 'before-persist', along)` then `check.execute`.

**Tests:** `packages/core/test/application/use-cases/transition-change.spec.ts` — `skipHookPhases source.pre does not skip hook.pre or hook.post`, `target.post does not skip…`, `source.post skips only post hooks`. CLI maps comma selectors including `source.pre`/`target.post` (`packages/cli/src/commands/change/transition.ts`, `cli/test/commands/change/transition.spec.ts`).

### Focus: archive `--allow-overlap` / `--allow-out-of-scope`

**Implemented on use case + CLI wiring.**

- `ArchiveChangeInput.allowOverlap` / `allowOutOfScope` default false; passed into `buildCheckExecutionContext`.
- Domain `spec.overlap` skips when `allowOverlap`; else fails `OVERLAP_CONFLICT`.
- Domain `impl.linksInScope` skips when `allowOutOfScope`.
- Domain `impl.filesResolved` does **not** read `allowOutOfScope` (AC-03 / AC-27).
- On `allowOverlap === true`, use case still lists peers via `detectSpecOverlap` and invalidates (`spec-overlap-conflict`) — AC-09.
- CLI `change archive`: `--allow-overlap`, `--allow-out-of-scope`, `--skip-hooks pre|post|all` map onto the use case (`packages/cli/src/commands/change/archive.ts`).

**Tests:** `archive-change.spec.ts` covers overlap throw, `allowOverlap` proceed+invalidate, `allowOutOfScope` sidecar path. CLI tests cover `--skip-hooks` only — **not** the two allow flags (see Missing Tests).

### Focus: `archiveBindings` vs GetStatus

**Partial / split composition.**

Same **spec table** `ARCHIVE_BINDING_SPECS` is applied for both use cases (`check-bindings.ts`: nameMatch → archivable → overlap → readOnly → deps → filesResolved → linksInScope → hook.pre effect → hook.post effect).

Same **predicate filter**: `executeMatchingPredicates` uses `matchingPredicates` (`!isEffectCheck`), so GetStatus never waits on `hook.pre`/`hook.post`. GetStatus runs archive predicates only when `change.state === 'archivable'`, with `allowOverlap: false` and `allowOutOfScope: false`, then merges failures (overlap → `bypassFlag: '--allow-overlap'`).

**Production wiring diverges:**

| Path                       | Registry call                                                               | `spec.overlap` detector                            |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `resolveArchiveChangeDeps` | `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })` | Real `ChangeRepository.list` + `detectSpecOverlap` |
| `resolveGetStatusDeps`     | `resolveWorkflowCheckRegistry(resolver)` (flag omitted)                     | Default `() => ({ blocked: false })`               |

Comment on `CreateWorkflowCheckRegistryDeps` documents this: “GetStatus / TransitionChange do not bind this check” — meaning the **I/O port** is omitted, not that `spec.overlap` is absent from the table. The check still **runs** on GetStatus but cannot fail.

Unit tests that assert live `OVERLAP_CONFLICT` on GetStatus **inject** a failing `archiveBindings` row (`get-status.spec.ts` “given archivable live overlap”). Default `makeGetStatus` uses the same no-detector registry as production GetStatus.

**Evidence of execute vs status disagree:** Archive unit tests with `makeArchiveBindings` (which **does** pass `detectSpecOverlap`) fail overlapping archives. Kernel `specd change status` on an `archivable` overlapping change would report `spec.overlap` pass and no `OVERLAP_CONFLICT`.

This is the main discrepancy in this batch (see Discrepancies). ArchiveChange itself matches AC-02/AC-09/AC-26. GetStatus’s **injected type** `archiveBindings` matches the design; the **composed instances** do not share overlap I/O with ArchiveChange.

### Focus: `hook.pre` / `hook.post` as effects, not predicates

**Implemented.**

- Domain stubs: `kind: 'effect'`; `execute` returns skip (status never waits).
- Application: `HookEffectCheck.kind === 'effect'`; `createHookPre` / `createHookPost` take `RunStepHooks`.
- Bindings: `phase` + `onFailure` on the spec rows (transition both `before-persist`/`abort`; archive post `after-persist`/`collect`).
- `isEffectCheck` excludes them from predicate evaluation (`execute-matching-predicates.ts`, `evaluate-transition-predicates.ts`).
- Use cases launch via `matchingEffects` by **pipeline phase**, not `check.id` switch (`archive-change.ts` comments: “binding phase; not check id”).
- `instruction:` never appears as a Check id.

**Tests:** constructor “does not store RunStepHooks on the instance”; hook delegation via `makeArchiveBindings` → `createHook*`; transition skip/no-op tests; `transition-checks` matcher tests for along/forward/recovery.

### Focus: `ValidateArtifacts` ctor `ListWorkspaces`

**Implemented.** Second constructor argument is `ListWorkspaces`. `ValidateArtifactsDeps` / `resolveValidateArtifactsDeps` resolve `listWorkspaces: resolver.getListWorkspaces()`. No spec-repo map on the use case.

`execute` calls `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })`.

**Tests:** every `new ValidateArtifacts(...)` in `validate-artifacts.spec.ts` passes `makeListWorkspaces(...)`. Dedicated scenario “evaluates lifecycle with empty checksByTarget”. No composition-package test file for `createValidateArtifacts`. No test that **asserts** “not a ReadonlyMap” by type/shape (covered only by TypeScript + helper usage).

### `core:get-artifact-instruction`

**Implemented** for this change’s deltas: `LifecycleEngine` ctor dep; config factory `resolveGetArtifactInstructionDeps` includes `lifecycle`; `evaluate` with `checksByTarget: {}`; `nextArtifact` auto-select; contextual vars `{ change: { name, path } }` only.

Still uses `ReadonlyMap<string, SpecRepository>` as specified (unlike ValidateArtifacts/ArchiveChange). Default `lifecycle = new LifecycleEngine(...)` on the class is extra vs the spec snippet (optional convenience; composition always injects).

**Tests:** `get-artifact-instruction.spec.ts` asserts `checksByTarget: {}`. No `packages/core/test/composition/use-cases/get-artifact-instruction.spec.ts`.

### `core:workflow-model` (non-hook)

**Implemented** for gating/hooks/axis as far as this batch’s files: requires/taskCompletion as named checks; `along` via `classifyAlong`/`exceptAlong`; archive not a hop; CompileContext not in these files (other batch). Status vs execute share **transition** bindings; they do **not** share overlap I/O (above).

---

## Discrepancies

Present both readings. Neither spec nor code is assumed correct.

### D1. GetStatus `archiveBindings` omit overlap detection (HIGH)

**Spec (this change):**

- `core:archive-change` AC-09/AC-26: evaluate `spec.overlap` on archive.
- `core:workflow-model` WM-03: status and execute share evaluation for requires (spirit: one contract).
- Sister spec `core:get-status` (same change, not in this file’s exclusive list) requires GetStatus, when `state === 'archivable'`, to run archive-scope predicates with `allowOverlap: false` so **live** `spec.overlap` can surface `OVERLAP_CONFLICT` + `--allow-overlap`.

**Code:**

- `GetStatus` **does** execute `this._archiveBindings` predicates in `archivable`.
- `resolveGetStatusDeps` does **not** pass `includeOverlapDetection: true`.
- `createSpecOverlap` then uses `() => ({ blocked: false })`.
- `resolveArchiveChangeDeps` **does** wire the real detector.

**If spec is right:** production status lies (green overlap) while `change archive` throws `SpecOverlapError`. Fix: share overlap-wired `archiveBindings` (or always pass `includeOverlapDetection: true` into the GetStatus registry).

**If code is right:** GetStatus should not pay for `list()` of all changes on every status of `archivable`. Then `core:get-status` / tasks 26.2 / GetStatus unit test that injects a failing overlap check are over-specified; default registry comment should be elevated into archive-change/get-status specs as an explicit exception.

**Evidence:** `packages/core/src/composition/use-cases/get-status.ts` vs `archive-change.ts`; `workflow-check-registry.ts` default detector; `get-status.spec.ts` live-overlap test only works with **injected** bindings.

### D2. Dual overlap listing inside `ArchiveChange.execute` (LOW / design smell)

**Spec:** overlap check uses `ChangeRepository.list` + `detectSpecOverlap`; `allowOverlap` then invalidates peers.

**Code:** predicates already run `spec.overlap` (when detector is wired). Execute **also** lists changes and calls `detectSpecOverlap` for `relevantOverlap` used in `throwMappedArchiveFailure` and invalidation.

**If spec is right:** acceptable as long as both use the same algorithm (they do in composition tests / `makeArchiveBindings`).

**If code is right:** could drop the private list and read peers from check `details` to avoid drift. Not a functional fail today when both paths share the repo.

### D3. CLI `--allow-out-of-scope` help vs AC-03 (LOW, copy)

**Spec:** skippable `impl.linksInScope` only; MUST NOT bypass `impl.filesResolved`.

**Code:** flags map correctly; `impl.filesResolved` ignores the flag.

**Help text** (`archive.ts`): “allow archive-time implementation sidecar updates outside the current change scope” — accurate for links-in-scope, silent on files-resolved. Spec-correct behavior; help could mention open tracked files still block.

**If spec is right:** help is incomplete, not a runner bug.  
**If help is the product contract:** would incorrectly imply all implementation guards are bypassed — they are not.

### D4. Optional `LifecycleEngine` defaults on ValidateArtifacts / GetArtifactInstruction (LOW)

**Spec snippets** show `lifecycle` as a required constructor parameter.

**Code:** default `new LifecycleEngine(Logger.debug.bind(Logger))` on both classes.

**If spec is right:** defaults hide missing composition (tests/kernel still inject).  
**If code is right:** spec TypeScript block should mark the parameter optional. Composition factories always pass the engine.

### D5. No contradiction found on effect-vs-predicate or skip no-ops

Hook kinds, `matchingEffects` vs `matchingPredicates`, skip selector table, and archive `phase`/`onFailure` match HEM-05 / WM-08 / AC-10 / AC-21. Not a discrepancy.

---

## Test Coverage

| Area                                                          | Status                                                                               | Where                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `source.pre` / `target.post` no-ops                           | Covered                                                                              | `transition-change.spec.ts`                              |
| `source.post` / `target.pre` skip                             | Covered                                                                              | same + CLI transition `--skip-hooks`                     |
| Archive skip `pre`/`post`/`all`                               | Covered (use case + CLI)                                                             | `archive-change.spec.ts`, `cli/.../archive.spec.ts`      |
| `allowOverlap` execute + invalidate                           | Covered                                                                              | `archive-change.spec.ts`                                 |
| `allowOutOfScope` execute                                     | Covered                                                                              | `archive-change.spec.ts`                                 |
| `impl.filesResolved` not skipped by allowOutOfScope           | Indirect (separate fail tests); no explicit “allowOutOfScope still fails open files” | archive / transition impl tests                          |
| Archive ctor no `RunStepHooks`                                | Covered                                                                              | `archive-change.spec.ts` constructor                     |
| `ArchiveChangeDeps` has `archiveBindings`, no `runStepHooks`  | Covered (shape)                                                                      | `composition/use-cases/archive-change.spec.ts`           |
| Hook effects kind + RunStepHooks on createHook\*              | Covered via bindings helpers                                                         | `helpers.ts` `makeArchiveBindings`, hook execution tests |
| GetStatus archive predicates + overlap **when bindings fail** | Covered                                                                              | `get-status.spec.ts` injected `archiveBindings`          |
| GetStatus **default/composed** overlap I/O                    | **Not covered** (would currently fail D1)                                            | —                                                        |
| ValidateArtifacts `ListWorkspaces` + empty `checksByTarget`   | Covered (usage + evaluate spy)                                                       | `validate-artifacts.spec.ts`                             |
| ValidateArtifacts factory `resolveValidateArtifactsDeps`      | **No composition spec file**                                                         | application tests only                                   |
| GetArtifactInstruction empty `checksByTarget`                 | Covered                                                                              | `get-artifact-instruction.spec.ts`                       |
| GetArtifactInstruction composition factory                    | **No composition spec file**                                                         | —                                                        |
| CLI `--allow-overlap` / `--allow-out-of-scope` argv → input   | **Missing**                                                                          | `cli/test/commands/change/archive.spec.ts`               |
| Workflow `along` / recovery omit hooks                        | Covered in transition-checks / transition-change (other + this)                      | matcher + “recovery omits hook” HEM scenarios            |

Broader archive atomicity (snapshots, restore, orphans) remains covered in `archive-change.spec.ts` / `archive-change-batch-restore.spec.ts` — treated as **still implemented**, not re-audited line-by-line in this focus pass.

---

## Missing Tests

1. **Composition: GetStatus live overlap** — two archivable-or-active peers sharing a specId; `createGetStatus(config)` / `resolveGetStatusDeps`; expect `blockers` `OVERLAP_CONFLICT` and `--allow-overlap`. Today this would document D1 (fail) or lock the noop detector (if spec is revised).
2. **CLI archive `--allow-overlap`** — assert `kernel.changes.archive.execute` received `{ allowOverlap: true }`.
3. **CLI archive `--allow-out-of-scope`** — assert `{ allowOutOfScope: true }`.
4. **`allowOutOfScope` does not skip `impl.filesResolved`** — open tracked file + `allowOutOfScope: true` still throws `ArchiveImplementationStateError` / filesResolved fail.
5. **Dedicated VA constructor contract** — assemble `createValidateArtifacts` / ctor and assert deps include `listWorkspaces` and do not include a spec-repo map field (verify.md “Constructor receives ListWorkspaces”).
6. **`createGetArtifactInstruction` composition** — deps include `lifecycle`; evaluate path not hop predicates (parity with validate-artifacts composition tests if added).
7. **Shared registry instance** — one `resolveWorkflowCheckRegistry(..., { includeOverlapDetection: true })` fed to both GetStatus and ArchiveChange (guards D1 regressions).

---

## Spec Dependency Chain (depth 1, this batch)

- `core:archive-change` → change, schema-format, delta-format, validate-artifacts, storage, run-step-hooks, hook-execution-model, template-variables, spec-metadata, content-extraction, architecture, workspace, spec-id-format, spec-overlap, logging, spec-lock, error-handling, regenerate-spec-metadata, spec-optimization, initialize-persisted-spec-state, composition-resolver, **transition-checks**
- `core:hook-execution-model` → workflow-model, schema-format, hook-runner-port, transition-change, archive-change, run-step-hooks, get-hook-instructions, config, cli transition/archive, **transition-checks**
- `core:workflow-model` → change, schema-format, build-schema, compile-context, get-status, transition-change, archive-change, hook-execution-model
- `core:validate-artifacts` → change, change-layout, change-manifest, lifecycle-engine, delta-format, selector-model, storage, architecture, spec-id-format, schema-format, composition-resolver, **transition-checks**
- `core:get-artifact-instruction` → delta-format, change, schema-merge, template-variables, lifecycle-engine, schema-format, composition-resolver, **transition-checks**

Consistency: change specs treat hooks as effects and skip as selector-based; that matches `core:transition-checks` binding specs. The GetStatus overlap I/O split is the only material cross-use-case contradiction.

---

## Summary counts

| Spec                          | Requirements | Implemented | Partial | Missing |                    Discrepancies | Covered |   Gaps |
| ----------------------------- | -----------: | ----------: | ------: | ------: | -------------------------------: | ------: | -----: |
| core:archive-change           |           32 |          30 |       2 |       0 | 2 (D1 composition, D2 dual list) |      28 |      4 |
| core:hook-execution-model     |           14 |          14 |       0 |       0 |                                0 |      13 |      1 |
| core:workflow-model           |           11 |          10 |       1 |       0 | 1 (status/execute overlap share) |       9 |      2 |
| core:validate-artifacts       |           27 |          27 |       0 |       0 |              1 (D4 default ctor) |      25 |      2 |
| core:get-artifact-instruction |           10 |          10 |       0 |       0 |              1 (D4 default ctor) |       8 |      2 |
| **Total**                     |       **94** |      **91** |   **3** |   **0** |             **5 unique (D1–D5)** |  **83** | **11** |

Focus outcomes: skip no-ops **pass**; allow flags **pass** in core (CLI tests missing); hooks-as-effects **pass**; ValidateArtifacts `ListWorkspaces` **pass**; archiveBindings vs GetStatus **fail in production composition** (D1).
