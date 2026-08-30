# Spec-compliance audit (partial): archive-change / hook-execution-model / storage

**Change:** `workflow-transition-checks`  
**Mode:** change  
**Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**CLI:** `node packages/cli/dist/index.js` (`changes spec-preview workflow-transition-checks <specId>`)  
**Graph:** `stale: false`, `contentFresh: true` (`graph stats`). Navigation via `graph search` + targeted reads.  
**Scope note:** Storage is audited against the change-preview cascade rule this batch was assigned (`projectArtifacts` / `effectiveStatus` functions; no `Change.effectiveStatus()`; no `LifecycleEngine` class). Fs-cache layout, archive pattern catalog, locks, and named factories are not re-litigated here.  
**Prior 090131 LOW (re-verify):** overlap host `list`/`get` before predicates; dual `runDepsConsistent`; `assertArchivable` JSDoc; domain hook stub comments.

Neither spec nor code is treated as sole truth. Evidence is `path:line`.

---

## Requirements Summary

### `core:archive-change` (change preview)

| Requirement                                 | Spec intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor                       | Inject `archiveBindings`; no `RunStepHooks` / `HookRunner` / `projectWorkflowHooks` on the use case. `ListWorkspaces`, parsers, `MaterializeSpecMetadata`, hasher, batch snapshot.                                                                                                                                                                                                                                                                                                                                                                                |
| Archive bindings not RunStepHooks           | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Input                                       | `name`, `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`, `allowOutOfScope`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Schema name guard                           | Evaluate `schema.nameMatch` on operation `archive` **before** archivable guard, hooks, file writes. Matching predicates `failFastOn: 'schema.nameMatch'`. **Host MUST NOT `list()`/`get()` other active changes before predicates return.** Overlap peer loading MAY run after a failed `spec.overlap` or when `allowOverlap` invalidation is required.                                                                                                                                                                                                           |
| Archivable guard                            | `archive.archivable` / `change.assertArchivable()`; allow `archivable` **or** `archiving`. Not a lifecycle hop. **`approval.signoff` MUST NOT be bound on archive.**                                                                                                                                                                                                                                                                                                                                                                                              |
| Deferred `archiving`                        | After full-batch preflight + snapshots; mutate then `transition('archiving')` if not already `archiving`. Hooks use workflow step `archiving` while lifecycle may still be `archivable`.                                                                                                                                                                                                                                                                                                                                                                          |
| Shared runners                              | Predicates: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly` + `deps.consistent` (same runners as enter-`ready`; archive facts = **sealed** `dependsOn`), `impl.filesResolved` + `impl.linksInScope`. No `archive.publication` binding. Remaining merge/publish preflight stays **inside** `ArchiveChange`. **After merge extract, re-run `runDepsConsistent` against sidecar `finalDependsOn` (merge-time sealed set).** Named predicate uses pre-merge sealed set; private pass is merge-time comparison, not a second algorithm. |
| Overlap / readOnly                          | After archivable, before hooks; overlap skippable; readOnly uses same runner as enter-`ready`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Pre/post hooks                              | Effects selected by **binding `phase`**, not `check.id`. `before-persist` + `abort`; `after-persist` + `collect`. Skip selectors skip effects only.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Plan / snapshot / restore / metadata / lock | Unchanged atomic archive contract (preflight, staged publish, restore, `MaterializeSpecMetadata` post-move).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Factory                                     | `createArchiveChange` via `resolveArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

| Requirement                 | Spec intent                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact dependency cascade | Cascade owned by `projectArtifacts` / `effectiveStatus` (see lifecycle-engine **functions**). **No** `Change.effectiveStatus()` method. Load-time file status remains hash-derived on the repository. |

---

## Implementation Status

### `failFastOn: 'schema.nameMatch'` — **still implemented**

- `ArchiveChange.execute` calls `executeMatchingPredicates(..., { failFastOn: 'schema.nameMatch' })` (`packages/core/src/application/use-cases/archive-change.ts:280–292`).
- Runner stops later **predicate** `execute` when that id fails (`packages/core/src/application/services/execute-matching-predicates.ts:129–148`).
- Unit test: `packages/core/test/application/services/execute-matching-predicates.spec.ts:105–138` (`later` for `archive.archivable` not called).
- Failures map through `throwMappedArchiveFailure` including `schema.nameMatch` → `SchemaMismatchError` (`archive-change.ts:1300–1309`).
- Integration throws `SchemaMismatchError` (`archive-change.spec.ts:273–287`) but does **not** assert peer `list`/`get` were skipped.

### Overlap host load after predicates — **prior 090131 LOW closed**

- Spec now: host MUST NOT `list()`/`get()` other active changes **before predicates return**; MAY load after failed `spec.overlap` or `allowOverlap` invalidation (preview Requirement: Schema name guard).
- Code: predicates first (`archive-change.ts:280–293`); `needsOverlapScan` is overlap fail **or** (`failedPredicates.length === 0 && allowOverlap`) (`:294–303`); then `_loadArchiveOverlap` (`:1063–1080`).
- On schema mismatch, `failFastOn` leaves `failedPredicates` with `schema.nameMatch` only → `needsOverlapScan` is false → host peer load skipped.
- Named `spec.overlap` still lists peers **during** its own `execute` via registry `includeOverlapDetection` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:41–62`; `spec-overlap.ts:72–80`). That is the overlap **predicate**, after `schema.nameMatch` in table order (`check-bindings.ts:85–87`). Not host prefetch before predicates.
- Overlap-fail / `allowOverlap` paths still pay **two** peer scans (check + host). Spec explicitly allows the second scan for error mapping / invalidation. Treated as efficiency leftover, not a MUST violation.

### Dual `runDepsConsistent` — **prior 090131 LOW closed as spec gap**

- Spec now: “After merge extract, `ArchiveChange` MUST re-run `runDepsConsistent` against sidecar `finalDependsOn`… The named `deps.consistent` predicate uses the pre-merge sealed set; the private pass is the merge-time comparison, not a second algorithm.”
- Named archive predicate: `createDepsConsistent` uses `loadArchiveSealedDependsOnBySpecId` when `attempt.scope === 'archive'` (`packages/core/src/application/checks/deps-consistent.ts:59–68`; loader `packages/core/src/application/services/ready-predicate-facts.ts:97–113`).
- Merge-time pass: `_prepareArchivePreflight` → `_assertArchiveDepsConsistent` (`archive-change.ts:781`, `:1150–1177`) calling `runDepsConsistent` on extract vs `finalDependsOn`.
- Same domain runner; two **times** (pre-merge sealed vs merge-time sidecar), as specified. Not a duplicate algorithm.

### `isArchivable` includes `archiving` — **still implemented**

- Getter: `state === 'archivable' || state === 'archiving'` (`packages/core/src/domain/entities/change.ts:668–671`).
- `assertArchivable()` uses that getter (`:1070–1073`).
- Domain `runArchiveArchivable` (`packages/core/src/domain/checks/archive-archivable.ts:18–25`, `:44–45`).
- Tests: `packages/core/test/domain/entities/change.spec.ts:1075–1119`.

### `assertArchivable` JSDoc — **prior 090131 LOW closed**

- Comment and `@throws` now say `archivable` **or** `archiving` (`change.ts:1065–1068`). Matches getter and archive-change Archivable guard.
- Error still uses target `'archivable'` (`:1072`) — historical `InvalidStateTransitionError(from, 'archivable')` shape, not comment drift.

### Domain hook stub comments — **prior 090131 LOW closed**

- `hook-pre.ts:3–17` / `hook-post.ts:3–17`: domain `execute` always skip; comments state application `createHookPre` / `createHookPost` run `RunStepHooks`.

### Archive bindings + composition — **aligned**

- `ArchiveChange` ctor arg 4 is `archiveBindings` (`archive-change.ts:202`, `:222–248`). No `RunStepHooks` / `HookRunner` on the class (`rg` in that file: none).
- `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (`packages/core/src/composition/use-cases/archive-change.ts:134–148`). `ArchiveChangeDeps` has no `runStepHooks` (`:105–118`). Factory constructs with bindings only (`:191–205`).
- Registry table: `ARCHIVE_BINDING_SPECS` (`check-bindings.ts:84–94`) has no `approval.signoff`. Signoff is **only** `done → archivable` forward (`TRANSITION_BINDING_SPECS` `:61–65`).
- Effects: `matchingEffects(..., 'before-persist'|'after-persist')` (`archive-change.ts:323–347` and post-persist loop). Skip via `ctx.skipHookPhases` in `HookEffectCheck` (`hook-effect-shared.ts:131–147`), not use-case `check.id` switch. Archive step `'archiving'` (`hookStep` `:18–21`).
- Factories: `createHookPre` / `createHookPost` (`hook-pre.ts:12–14`, `hook-post.ts`). Registry attaches `RunStepHooks` (`workflow-check-registry.ts:67–74`).
- `Change` has no hook runner (entity `change.ts`).

### Storage / layering (user-enforced) — **still aligned**

- `projectArtifacts` is a **function** (`lifecycle-verdict.ts:309–324`), re-exported from barrel `packages/core/src/domain/services/lifecycle-engine.ts:1–18` (no class).
- Graph / `rg`: **no** `class LifecycleEngine` under `packages/core`.
- `Change.effectiveStatus(`: **no** matches in `change.ts`.
- Domain → application imports: `rg` over `packages/core/src/domain` found **zero** `from '...application/'`. Mentions of “application” in domain are comments / `DeltaApplicationError` / layering notes, not imports.

### CLI (other batch; observed)

- Core allows archive from `archiving` (`change.ts:669–670`). CLI archive command is not re-audited here.

---

## Discrepancies

### HIGH

None in this Core archive / storage / hooks batch.

### MEDIUM

None. Prior `failFastOn: 'schema.nameMatch'` remains implemented.

### LOW

None remaining from the 090131 set:

| Prior 090131 LOW                       | Re-verify                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Overlap `list`/`get` before predicates | **Closed.** Host load gated (`archive-change.ts:294–303`). Spec updated to allow post-predicate load.                          |
| Dual `runDepsConsistent`               | **Closed.** Spec documents merge-time second pass; code matches (`deps-consistent.ts:59–68` + `_assertArchiveDepsConsistent`). |
| `assertArchivable` JSDoc               | **Closed.** (`change.ts:1065–1068`)                                                                                            |
| Domain hook stub comments              | **Closed.** (`domain/checks/hook-pre.ts:3–4`, `hook-post.ts:3–4`)                                                              |

**Optional leftover (not a MUST fail):** overlap-fail / `allowOverlap` still lists peers in `spec.overlap` **and** again in `_loadArchiveOverlap`. Spec permits the host scan; it does not require a single scan. No severity bump.

---

## Test Coverage

| Area                                                     | Evidence                                                                                                                                        | Verdict                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `failFastOn: 'schema.nameMatch'`                         | `execute-matching-predicates.spec.ts:105–138`                                                                                                   | Covered at runner unit level                                                                           |
| Schema mismatch throws                                   | `archive-change.spec.ts:273–287`                                                                                                                | Covered (error type); host `list` skip **not** asserted                                                |
| `isArchivable` / `assertArchivable` includes `archiving` | `change.spec.ts:1075–1119`                                                                                                                      | Covered                                                                                                |
| Archive skip hooks `all` / `pre` / `post`                | `archive-change.spec.ts` (~1837+, `'pre'` ~1961, `'post'` ~1992); `HookEffectCheck` skip by archive selectors (`hook-effect-shared.ts:136–142`) | Covered at use-case integration                                                                        |
| `createHookPre` uses `RunStepHooks`                      | `workflow-check-factories.spec.ts:21–40`                                                                                                        | Covered (transition attempt, not archive scope)                                                        |
| Archive hook phases / collect                            | `transition-checks.spec.ts:256–270` (`before-persist`/`abort`, `after-persist`/`collect`)                                                       | Covered                                                                                                |
| Shared `deps.consistent` object on transition + archive  | `transition-checks.spec.ts:213–217`                                                                                                             | Covered (identity of domain check object)                                                              |
| `approval.signoff` on transitions                        | `transition-checks.spec.ts:220–253` (`from: done`, `to: archivable`)                                                                            | Covered for **transition** table; archive absence is implicit via `ARCHIVE_BINDINGS` loop (`:207–210`) |
| Storage `projectArtifacts`                               | `lifecycle-engine.spec.ts` uses `projectArtifacts`                                                                                              | Function exists; no `Change.effectiveStatus` tests needed if method absent                             |
| Domain no application imports                            | static `rg`                                                                                                                                     | Structural, not a runtime test                                                                         |

---

## Missing Tests

1. **ArchiveChange integration:** schema mismatch does **not** call `ChangeRepository.list` / peer `get` (would lock the host-deferral fix). Current test only expects `SchemaMismatchError`.
2. **ArchiveChange integration:** `failFastOn` with real `createSchemaNameMatch` + spies that `archive.archivable` / `spec.overlap` `execute` are not called — currently only the generic runner test with stub checks.
3. **Sealed vs merge `deps.consistent`:** `loadArchiveSealedDependsOnBySpecId` vs `_assertArchiveDepsConsistent` agreement / disagreement (no test hits for those names under `packages/core/test`).
4. **`approval.signoff` absent from `archiveBindings`:** explicit assertion that `ARCHIVE_BINDING_SPECS` / `ARCHIVE_BINDINGS` has no signoff row (today only “every archive row has archive applicability”).
5. **`HookEffectCheck` unit:** `skipHookPhases` `pre`/`post`/`all` with `attempt.scope === 'archive'` (factory test still uses a **transition** attempt; use-case tests already cover archive skip).

CLI retry-from-`archiving` remains other-batch.

---

## Spec Dependency Chain

From change-preview `core:archive-change` **Spec Dependencies** (depth 1):

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

- **Architecture / user rule:** domain does not import application. Hook I/O is in `application/checks`. No `LifecycleEngine` class. `projectArtifacts` is a domain **function**, re-exported from `lifecycle-engine.ts` barrel — aligns with storage’s “no `Change.effectiveStatus()` / cascade via `projectArtifacts`”.
- **`core:transition-checks`:** archive table + shared runners match “share runners”; `approval.signoff` is transition-only.
- **`core:hook-execution-model` vs archive-change:** “delegated to `RunStepHooks`” vs “MUST NOT take `RunStepHooks`” is resolved by injecting `RunStepHooks` into `createHookPre`/`createHookPost` only (`workflow-check-registry.ts:67–74`).
- **`core:storage`:** assigned cascade rule matches code (`lifecycle-verdict.ts:309–323`). Full fs-cache / pattern catalog not audited in this partial.
- **Prior spec-vs-code tension on dual deps:** preview now documents merge-time second pass — consistent with `_assertArchiveDepsConsistent`.

---

## Summary counts

| Spec                            | Req. headings in preview (approx.) |                                                                                                              Implemented as specified |                                        Partial / leftover |  HIGH | MEDIUM |   LOW |                                 Untested gaps (this batch) |
| ------------------------------- | ---------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------: | ----: | -----: | ----: | ---------------------------------------------------------: |
| `core:archive-change`           |                                ~31 | Bindings, fail-fast nameMatch, deferred host overlap load, archiving retry, effects by phase, merge-time `runDepsConsistent`, factory | Dual overlap I/O on fail/`allowOverlap` (allowed by spec) |     0 |      0 |     0 | 3 (list skip lock, real-factory failFast, merge-time deps) |
| `core:hook-execution-model`     |               ~12 archive-relevant |                                                              `createHook*` + `HookEffectCheck` skip/policy; Change does not run hooks |                                   Domain comments aligned |     0 |      0 |     0 |                    1 optional (archive-scope factory unit) |
| `core:storage` (assigned slice) |                1 cascade + related |               `projectArtifacts` function; no `Change.effectiveStatus`; no `LifecycleEngine` class; domain has no application imports |                                                         — |     0 |      0 |     0 |                                                          0 |
| **Totals**                      |                                    |                                                                                                                                       |                                                           | **0** |  **0** | **0** |                                         **5** listed above |

**Prior 090131 LOW (4):** all **closed** (code and/or spec).  
**Re-verify user list:** `failFastOn schema.nameMatch` **yes**; `isArchivable` includes `archiving` **yes**; no `LifecycleEngine` class **yes**; no `Change.effectiveStatus` **yes**; domain no application imports **yes**.
