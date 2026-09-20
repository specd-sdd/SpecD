# Spec-compliance audit (partial): archive-change / hook-execution-model / storage

**Change:** `workflow-transition-checks`  
**Mode:** change  
**Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**CLI:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`  
**Graph:** reindexed, `stale: false` (per parent). Navigation via `specd graph search` / file reads.  
**Scope note:** Storage is audited against the change-preview requirements that this batch was assigned to check (`projectArtifacts`, no `Change.effectiveStatus()`, no `LifecycleEngine` class / `LifecycleEngine.projectArtifacts`). The rest of `core:storage` (fs-cache layout, archive pattern variables, locks, etc.) is not re-litigated here.  
**Prior 013719:** OPEN MEDIUM `failFastOn: 'schema.nameMatch'` is implemented. CLI archivable-only vs Core `archiving` is **out of this batch**; noted only if still visible from Core/CLI wiring.  
**User-enforced:** domain must not import application; there must be no `LifecycleEngine` class.

Neither spec nor code is treated as sole truth. Evidence is `path:line`.

---

## Requirements Summary

### `core:archive-change`

| Requirement                                 | Spec intent (preview)                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor                       | Inject `archiveBindings`; no `RunStepHooks` / `HookRunner` / `projectWorkflowHooks` on the use case. `ListWorkspaces`, parsers, `MaterializeSpecMetadata`, hasher, batch snapshot, etc.                                                                                                                                                                                 |
| Archive bindings not RunStepHooks           | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                                                                                                       |
| Input                                       | `name`, `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`, `allowOutOfScope`.                                                                                                                                                                                                                                                                                       |
| Schema name guard                           | Evaluate `schema.nameMatch` on operation `archive` **before** archivable guard, hooks, file writes. Matching predicates `failFastOn: 'schema.nameMatch'`.                                                                                                                                                                                                               |
| Archivable guard                            | `archive.archivable` / `change.assertArchivable()`; allow `archivable` **or** `archiving`. Not a lifecycle hop. **`approval.signoff` MUST NOT be bound on archive.**                                                                                                                                                                                                    |
| Deferred `archiving`                        | After full-batch preflight + snapshots; mutate then `transition('archiving')` if not already `archiving`. Hooks use workflow step `archiving` while lifecycle may still be `archivable`.                                                                                                                                                                                |
| Shared runners                              | Predicates: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly` + `deps.consistent` (same runners as enter-`ready`; archive facts = **sealed** `dependsOn`), `impl.filesResolved` + `impl.linksInScope` (same as exit-`implementing`). No `archive.publication` binding. Remaining merge/publish preflight stays **inside** `ArchiveChange`. |
| Overlap / readOnly                          | After archivable, before hooks; overlap skippable; readOnly uses same runner as enter-`ready`.                                                                                                                                                                                                                                                                          |
| Pre/post hooks                              | Effects selected by **binding `phase`**, not `check.id`. `before-persist` + `abort`; `after-persist` + `collect`. Skip selectors skip effects only.                                                                                                                                                                                                                     |
| Plan / snapshot / restore / metadata / lock | Unchanged atomic archive contract (preflight, staged publish, restore, `MaterializeSpecMetadata` post-move).                                                                                                                                                                                                                                                            |
| Factory                                     | `createArchiveChange` via `resolveArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                   |

### `core:hook-execution-model` (archive-facing)

| Requirement                  | Spec intent                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two hook types               | `instruction:` never executed; `run:` via `HookRunner` / `RunStepHooks`.                                                                                                                                                              |
| Default execution            | `ArchiveChange` auto-runs matching `run:` effects after predicates; slot/policy from binding (`phase`, `onFailure`). No private “always source.post” path; no branch on `hook.pre`/`hook.post` **ids** for timing/policy/skip/launch. |
| `RunStepHooks` placement     | Constructor dep of **hook checks**, not of `ArchiveChange`.                                                                                                                                                                           |
| Skip                         | `skipHookPhases`: `pre` / `post` / `all`; predicates still run.                                                                                                                                                                       |
| Fail-fast pre / collect post | Pre abort + no files; post collect + no rollback.                                                                                                                                                                                     |
| Change entity                | Must not execute hooks.                                                                                                                                                                                                               |
| Template tokens              | `HookVariables` without `{{change.workspace}}` (HookRunner / template spec; not re-proven in this file beyond hook check wiring).                                                                                                     |

### `core:storage` (assigned focus)

| Requirement                 | Spec intent                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact dependency cascade | Cascade owned by `projectArtifacts` / `effectiveStatus` (see lifecycle-engine **functions**). **No** `Change.effectiveStatus()`. Load-time file status remains hash-derived on the repository. |

---

## Implementation Status

### Archive bindings + `failFastOn` (prior OPEN MEDIUM — **closed in Core**)

- `ArchiveChange` stores `_archiveBindings` and takes them as ctor arg 4 (`packages/core/src/application/use-cases/archive-change.ts:202`, `:226–248`).
- `execute` builds `{ scope: 'archive' }` and calls `executeMatchingPredicates(..., { failFastOn: 'schema.nameMatch' })` (`archive-change.ts:290–305`).
- `executeMatchingPredicates` stops later **predicate** `execute` when that id fails (`packages/core/src/application/services/execute-matching-predicates.ts:129–148`).
- Unit test: `packages/core/test/application/services/execute-matching-predicates.spec.ts:105–138` (`later` for `archive.archivable` not called).
- Composition: `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (`packages/core/src/composition/use-cases/archive-change.ts:134–148`). `ArchiveChangeDeps` lists `archiveBindings`, not `runStepHooks` (`:105–118`). Factory constructs with bindings only (`:191–205`).
- Registry table (no `approval.signoff` on archive): `ARCHIVE_BINDING_SPECS` (`packages/core/src/domain/services/check-bindings.ts:84–94`). Signoff is **only** `done → archivable` forward (`TRANSITION_BINDING_SPECS` `:61–65`).
- Failures map through `throwMappedArchiveFailure` (`archive-change.ts:1278–1348`), including `schema.nameMatch` → `SchemaMismatchError` (`:1286–1287`).

### `isArchivable` includes `archiving`

- Getter: `state === 'archivable' || state === 'archiving'` (`packages/core/src/domain/entities/change.ts:668–671`).
- `assertArchivable()` uses that getter (`:1070–1073`).
- Domain `runArchiveArchivable` / `archive.archivable` (`packages/core/src/domain/checks/archive-archivable.ts:18–25`, `:44–45`).
- Application factory `createArchiveArchivable` (`packages/core/src/application/checks/archive-archivable.ts:38–49`).
- Tests: `packages/core/test/domain/entities/change.spec.ts:1108–1119`.
- Retry mutate: `freshChange.assertArchivable()` then transition if not already `archiving` (`archive-change.ts:410–414`).

### Schema name match vs later **check** I/O

- Predicate order in table: `schema.nameMatch` then `archive.archivable` then `spec.overlap` then readOnly / deps / impl (`check-bindings.ts:85–91`).
- Fail-fast prevents later **check.execute** after name mismatch (see above).
- Host still loads overlap **before** predicates: `list()` + per-name `get()` (`archive-change.ts:277–288`) then predicates (`:293`). That I/O is **not** gated by `failFastOn` (LOW leftover).

### Dual `runDepsConsistent`

- Named archive predicate: `createDepsConsistent` uses `loadReadyPredicateFacts` extract + `loadArchiveSealedDependsOnBySpecId` when `attempt.scope === 'archive'` (`packages/core/src/application/checks/deps-consistent.ts:59–68`; sealed loader `packages/core/src/application/services/ready-predicate-facts.ts:97–113`).
- Second pass after merge preflight: `_prepareArchivePreflight` calls `_assertArchiveDepsConsistent` (`archive-change.ts:785`; `:1128–1155`) which calls `runDepsConsistent` on **preflight** extract vs `finalDependsOn`.
- Spec also says remaining merge/publish checks stay **inside** `ArchiveChange` after named predicates (`archive-change` Requirement: Archive checks share runners). The private method is therefore both a **duplicate runner** and a **merge-time** consistency gate. Treated as LOW leftover vs “single named predicate only,” not as a missing sealed-set path.

### Overlap I/O before predicates (LOW leftover)

- Host overlap scan: `archive-change.ts:277–288`.
- Predicate overlap I/O (production): `resolveWorkflowCheckRegistry` `includeOverlapDetection: true` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:41–62`; wired from `resolveArchiveChangeDeps` `:134`).
- `spec.overlap` execute: `packages/core/src/application/checks/spec-overlap.ts:72–80`.
- Host scan is also used for `SpecOverlapError(overlapEntries)` and `allowOverlap` invalidation (`archive-change.ts:312–315`, `:1291–1292`).

### Hooks: `createHookPre` / `createHookPost`; no engine class

- Factories: `packages/core/src/application/checks/hook-pre.ts:12–14`, `hook-post.ts:12–14`.
- Shared effect: `HookEffectCheck` (`hook-effect-shared.ts:86–175`). Skip by `ctx.skipHookPhases` (`:131–147`), not use-case `check.id` switch. Archive step name `'archiving'` (`hookStep` `:18–21`).
- Registry attaches `RunStepHooks` to those factories (`workflow-check-registry.ts:73–74`, `:104–105`).
- `ArchiveChange` runs `matchingEffects(..., 'before-persist'|'after-persist')` + `executeCheckWithProgress` (`archive-change.ts:325–351`, `:530–569`; `matchingEffects` `packages/core/src/application/services/execute-hook-effect.ts:23–35`).
- Domain stubs skip (no process): `packages/core/src/domain/checks/hook-pre.ts:7–17`, `hook-post.ts:7–17`.
- `Change` has no hook runner (entity `packages/core/src/domain/entities/change.ts`; hooks live in application checks).

### Storage / layering (user-enforced)

- `projectArtifacts` is a **function** on `lifecycle-verdict.ts:309–324`, re-exported from barrel `packages/core/src/domain/services/lifecycle-engine.ts:1–18` (no class).
- Graph search `class LifecycleEngine`: **no** `class LifecycleEngine` under `packages/core/src`.
- `Change.effectiveStatus(`: **no** matches in `change.ts`.
- Domain → application imports: `rg` over `packages/core/src/domain` found **zero** `from '...application/'`.

### CLI tension (other batch; observed from this Core/CLI slice)

- `packages/cli/src/commands/change/archive.ts:96–104` calls `kernel.changes.archive.execute` with no extra “must already be `archivable` only” pre-filter. Retry in `archiving` is therefore Core’s `isArchivable` (`change.ts:668–671`).
- CLI test title still says “not in archivable state” and stubs `InvalidStateTransitionError('done', 'archivable')` (`packages/cli/test/commands/change/archive.spec.ts:215–219`) — wording/Core error shape, not a second CLI gate.

---

## Discrepancies

### HIGH

None in this Core archive / storage / hooks batch. Prior 013719 HIGH (CLI archive archivable-only vs Core `archiving`) is **not reproduced as a CLI pre-gate** in `archive.ts`; Core allows `archiving`. Remaining CLI/docs/test-title alignment belongs to the CLI batch.

### MEDIUM

None remaining for the previously OPEN `failFastOn: 'schema.nameMatch'` item: code + unit test exist (`execute-matching-predicates.ts:143–147`, `execute-matching-predicates.spec.ts:105–138`).

### LOW

1. **Overlap I/O before predicates (leftover).**
   - **Spec:** Schema name guard before later archive I/O / overlap as a **named predicate after** `schema.nameMatch` (`archive-change` Schema name guard + Overlap guard; table `check-bindings.ts:85–87`).
   - **Code:** `ChangeRepository.list`/`get` for peers runs at `archive-change.ts:277–288` **before** `executeMatchingPredicates` at `:293`. A schema mismatch still pays full peer-load cost; `failFastOn` only skips later **check.execute**. Production `spec.overlap` then lists peers **again** (`workflow-check-registry.ts:42–53`).
   - **Either:** spec should allow host prefetch for `SpecOverlapError` mapping; **or** host should defer list until after nameMatch (and/or reuse check `details.peers`).
   - **Tests:** no `archive-change.spec.ts` coverage that `list` is not called on schema mismatch.

2. **Dual `runDepsConsistent` (leftover).**
   - **Spec:** one shared runner; archive facts = sealed set; remaining preflight may stay inside the use case.
   - **Code:** predicate (`deps-consistent.ts:59–68`) **and** `_assertArchiveDepsConsistent` (`archive-change.ts:785`, `:1139–1142`).
   - **Either:** delete the private pass if merge extract is already represented in the named check; **or** spec should explicitly require a second merge-time comparison.
   - **Tests:** no hits for `loadArchiveSealedDependsOnBySpecId` or `_assertArchiveDepsConsistent` under `packages/core/test`.

3. **`assertArchivable` JSDoc vs behaviour.**
   - **Spec / getter:** `archivable` **or** `archiving` (`change.ts:668–671`; archive-change Archivable guard).
   - **Comment:** “Asserts that this change is in `archivable` state” (`change.ts:1065–1068`). Error always uses target `'archivable'` (`:1072`). Comment/error-target wording can mislead operators on retry-from-`archiving`.

4. **Domain hook stub comments vs execute.**
   - **Comments** claim execute calls `RunStepHooks` (`domain/checks/hook-pre.ts:4`, `hook-post.ts:4`).
   - **Code:** domain `execute` always `skip` (`hook-pre.ts:17`). Application `createHookPre`/`createHookPost` own I/O. Comment drift only; layering is correct.

---

## Test Coverage

| Area                                                     | Evidence                                                                          | Verdict                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `failFastOn: 'schema.nameMatch'`                         | `execute-matching-predicates.spec.ts:105–138`                                     | Covered at runner unit level                                                   |
| `isArchivable` / `assertArchivable` includes `archiving` | `change.spec.ts:1108–1119`                                                        | Covered                                                                        |
| Archive skip hooks                                       | `archive-change.spec.ts` (`skipHookPhases` ~1837+, `'pre'` ~1961, `'post'` ~1992) | Covered (via `newArchiveChange` + `makeArchiveBindings`, `helpers.ts:944–982`) |
| `createHookPre` uses `RunStepHooks`                      | `workflow-check-factories.spec.ts:21–40`                                          | Covered (transition attempt in that test)                                      |
| Archive composition bindings                             | `resolveArchiveChangeDeps` + `ARCHIVE_BINDING_SPECS`                              | Indirect via composition tests if present; not re-listed here                  |
| Storage `projectArtifacts` / no entity method            | `lifecycle-verdict.ts:309`; entity tests for artifacts                            | Function exists; no `Change.effectiveStatus` tests needed if method absent     |
| Domain no application imports                            | static `rg`                                                                       | Structural, not a runtime test                                                 |

---

## Missing Tests

1. **ArchiveChange integration:** schema mismatch does **not** call `ChangeRepository.list` / peer `get` (would lock leftover #1).
2. **ArchiveChange integration:** `failFastOn` with real `createSchemaNameMatch` + later spies (`archive.archivable` / `spec.overlap` not executed) — currently only the generic runner test.
3. **Sealed vs merge `deps.consistent`:** `loadArchiveSealedDependsOnBySpecId` vs `_assertArchiveDepsConsistent` disagreement / agreement.
4. **Archive `HookEffectCheck` skip:** `skipHookPhases` `pre`/`post`/`all` on `attempt.scope === 'archive'` (factory test uses a **transition** attempt).
5. **`approval.signoff` absent from `archiveBindings`:** matcher/registry assertion that archive table has no signoff row (`check-bindings.ts:84–94` vs `:61–65`).
6. **CLI (other batch):** archive retry when Core change state is `archiving` (CLI currently only mocks `done` → `archivable` error).

---

## Spec Dependency Chain

From change-preview `core:archive-change` **Spec Dependencies** (depth 1, as listed):

- `core:change`
- `core:schema-format`
- `core:delta-format`
- `core:validate-artifacts`
- `core:storage`
- `core:run-step-hooks`
- `core:hook-execution-model`
- `core:template-variables`
- `core:spec-metadata`
- `core:content-extraction`
- `default:_global/architecture`
- `core:workspace`
- `core:spec-id-format`
- `core:spec-overlap`
- `default:_global/logging`
- `core:spec-lock`
- `default:_global/error-handling-conventions`
- `core:regenerate-spec-metadata`
- `core:spec-optimization`
- `core:initialize-persisted-spec-state`
- `core:composition-resolver`
- `core:transition-checks`

**Consistency with globals / deps (this batch):**

- **Architecture / user rule:** domain does not import application. Hooks I/O is in `application/checks`. No `LifecycleEngine` class. `projectArtifacts` is a domain **function**, re-exported from `lifecycle-engine.ts` barrel — aligns with storage’s “no `Change.effectiveStatus()` / cascade via `projectArtifacts`” if `core:lifecycle-engine` describes functions rather than a class (that spec is not in this assigned triple).
- **`core:transition-checks`:** archive table + shared runners match the archive-change “share runners” requirement; `approval.signoff` is transition-only.
- **`core:hook-execution-model` vs archive-change constraints:** “delegated to `RunStepHooks`” vs “MUST NOT take `RunStepHooks`” is resolved by injecting `RunStepHooks` into `createHookPre`/`createHookPost` only (`workflow-check-registry.ts:73–74`).
- **`core:storage`:** assigned cascade rule matches code (`lifecycle-verdict.ts:309–323`). Full fs-cache / pattern catalog not audited in this partial.

---

## Summary counts

| Spec                            | Req. headings in preview (approx.) |                                                             Implemented as specified |                 Partial / leftover |  HIGH | MEDIUM |   LOW |       Untested gaps (this batch) |
| ------------------------------- | ---------------------------------: | -----------------------------------------------------------------------------------: | ---------------------------------: | ----: | -----: | ----: | -------------------------------: |
| `core:archive-change`           |                                ~31 | Core path: bindings, fail-fast nameMatch, archiving retry, effects by phase, factory | Overlap prefetch; dual deps runner |     0 |      0 |     3 |                                4 |
| `core:hook-execution-model`     |               ~12 archive-relevant |             `createHook*` + `HookEffectCheck` skip/policy; Change does not run hooks |               Domain stub comments |     0 |      0 |     1 | 1 (archive skip on effect class) |
| `core:storage` (assigned slice) |                1 cascade + related | `projectArtifacts` function; no `Change.effectiveStatus`; no `LifecycleEngine` class |                                  — |     0 |      0 |     0 |                                0 |
| **Totals**                      |                                    |                                                                                      |                                    | **0** |  **0** | **4** |               **5** listed above |

**Prior 013719 OPEN MEDIUM (`failFastOn: 'schema.nameMatch'`):** **implemented** (`archive-change.ts:304`, `execute-matching-predicates.ts:145`, test `:105–138`).

**CLI vs Core `archiving`:** Core allows archive from `archiving` (`change.ts:669–670`). CLI `change archive` does not add an archivable-only pre-check (`cli/.../archive.ts:96`). Treat residual HIGH as **out of batch** unless CLI/docs still assert archivable-only elsewhere.
