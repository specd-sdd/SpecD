# Specs compliance — change `workflow-transition-checks`

- **Timestamp:** 20260827-160110
- **Mode:** change
- **Graph:** `stale: false` after `graph index` (indexed 2026-08-27T14:01:20Z); cli/skills CONTENT_HASH then reindexed
- **Read-only:** no production code or spec edits
- **Scope:** 19 change specs (merged via `changes spec-preview`) + project-wide `default:_global/*` + depth-1 deps (notably `core:storage`)

## Executive summary

Recorte 24 items from the prior audit are **closed** on this change: archive Ports/`archiveBindings`, schema-format cascade vs `_effectiveStatus`, specd-design review scope, archive numbered hook flow, change-status examples + `overlapDetail` help.

**No critical / high implementation bugs** on the locked product axis (no snapshot bag, no `archive.publication` CheckId, no pending hops for new work, no `RunStepHooks` on production `ArchiveChange`, no `Change.effectiveStatus()` method, hop vs DAG split).

| Sev    | Item                                                                    | In change?                 |
| ------ | ----------------------------------------------------------------------- | -------------------------- |
| Major  | Workspace `core:storage` still names `Change.effectiveStatus()`         | **Out of change**          |
| Medium | Archive-change leftover prose (`RegenerateSpecMetadata`, `index.jsonl`) | Yes (spec-wrong)           |
| Medium | Overlap bypass: spec says warning, engine omits blocker                 | Yes                        |
| Medium | GetStatus `artifactStatuses` map vs schema types                        | Yes                        |
| Medium | Transition verify still names first-class `hook-start`/`hook-done`      | Yes                        |
| Medium | Transition verify `{ name, to }` only vs `skipHookPhases`               | Yes                        |
| Medium | Garbled merged archive “Output on success” paragraph                    | Yes                        |
| Medium | CLI `--next` table vs hexagonal “no business logic”                     | Yes (architecture tension) |

## Severity totals (union of partials; not de-duplicated by unique root cause)

| Severity  |            Approx |
| --------- | ----------------: |
| critical  |                 0 |
| high      |                 0 |
| major     | 1 (out of change) |
| medium    |                 8 |
| minor/low |               11+ |

## Detailed findings

The following sections are the complete partial reports.

---

<!-- begin _partial-recorte.md -->

# Spec compliance (recorte) — assigned specs

Mode: change `workflow-transition-checks`. Graph freshness: `stale: false` (2026-08-27T14:01:20Z). CLI: `node packages/cli/dist/index.js`. Read-only; no code/spec edits.

Locked product (not re-litigated): no snapshot bag; no `archive.publication` CheckId; `ArchiveChange` ctor takes `archiveBindings` not `RunStepHooks`; no `Change.effectiveStatus()` method; engine `_effectiveStatus`: incomplete parent → `in-progress` cascade; review parent → `pending-parent-artifact-review`.

---

## cli:change-status

### Requirements Summary

- `specd change status <name> [--format text|json|toon]`; drafted changes are read-only.
- Structured DAG includes `hasTasks`; `state` is display projection (e.g. `complete-with-drift`).
- Text: DAG/details use display status; no duplicated review file lists under `review:`; overlap peers still print from `overlapDetail`.
- JSON/TOON serialize full `review` including `overlapDetail`. Command `--help` JSON schema for `review` MUST list `overlapDetail` alongside `affectedArtifacts`.
- Lifecycle projections come from `GetStatus` only (no local `VALID_TRANSITIONS` filter, no direct refresh/detector).
- Basic info MUST NOT include a standalone `specs:` list; dedicated “specs and dependencies” section + `specDependsOn` in structured output.
- Blockers with gerund `label` render `! CODE — label: message`.

### Implementation Status

**Implemented.** Handler: `packages/cli/src/commands/change/status.ts`.

- Help schema includes `overlapDetail` with `archivedChangeName` / `overlappingSpecIds` (`status.ts:116-125`).
- Text overlap peers: `status.ts:329-335` (`archived: …, specs: …`).
- No standalone `specs:` in the change-status renderer (only overlap-peer line uses `specs:` as a field label inside overlap bullets).
- Spec **Examples** block (change preview, after `## Examples`) shows `change` / `state` / DAG / next action / lifecycle — **no** standalone `specs:` list.

### Discrepancies

None on the recorte-24 items for this spec.

Residual (not recorte-24): there is **no test** that `--help` text contains the `overlapDetail` schema lines. Runtime help text exists; JSON serialize tests exist. Classification: **missing test**, not spec/code conflict.

### Test Coverage

- `packages/cli/test/commands/change-status.spec.ts`: omits standalone `specs:` (`:165`); overlap text peers (`:666-684`); JSON `overlapDetail` with `archivedChangeName` / `overlappingSpecIds` (`:687-726`); empty `overlapDetail` (`:729-762`).
- `packages/cli/test/commands/change/change-status.spec.ts`: also asserts no `specs:       …` basic-info line (`:108`, `:270`).

### Missing Tests

- `--help` after-text includes `overlapDetail: Array<{ archivedChangeName, overlappingSpecIds }>` (spec Requirement: Text status omits duplicated review file lists).

### Spec Dependency Chain

`cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`. Depth-1 `core:storage` is **not** a listed dependency of this spec.

---

## core:archive-change

### Requirements Summary

- Ctor: `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, `archiveBindings`, `ActorResolver`, parsers, `SchemaProvider`, `MaterializeSpecMetadata`, extractor transforms, workspace routes, project root, `ArchiveBatchSnapshotPort`.
- MUST NOT take `RunStepHooks` / `HookRunner` / `projectWorkflowHooks`. Hooks via `createHookPre` / `createHookPost` on the binding table.
- `resolveArchiveChangeDeps` includes `archiveBindings` from `resolveWorkflowCheckRegistry`; `ArchiveChangeDeps` MUST NOT list `runStepHooks`.
- No `archive.publication` CheckId; remaining merge/publish preflight stays inside the use case.
- Archive effects selected by binding `phase` (`before-persist` / `after-persist`), not `check.id === 'hook.pre'|'hook.post'`.
- Batch canonical snapshot/restore is the **spec directory backup** adapter (`ArchiveBatchSnapshotPort`), not a check “snapshot bag”.

### Implementation Status

**Production ctor and composition match the change spec.**

- Use-case class: `packages/core/src/application/use-cases/archive-change.ts:188-244` — 4th parameter is `archiveBindings: readonly CheckBinding[]`; fields include `_archiveBindings` only (no `_runStepHooks`).
- Composition: `packages/core/src/composition/use-cases/archive-change.ts:104-147` — `ArchiveChangeDeps.archiveBindings`; `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings`; factory passes `archiveBindings` into `new ArchiveChange(...)` (`:187-200`). `isArchiveChangeDeps` requires `'archiveBindings' in value` (`:207-221`).
- Effects: `matchingEffects(..., 'before-persist'|'after-persist')` then `executeCheckWithProgress` (`archive-change.ts:318-336`, `:526-541`). Skip lives in `HookEffectCheck.execute` (`hook-effect.ts:133-144`), not a use-case `RunStepHooks` call.
- Bindings: `ARCHIVE_BINDING_SPECS` has `hook.pre` / `hook.post` and **no** `archive.publication` (`check-bindings.ts:84-93`). Test: `transition-checks.spec.ts:390-391`.
- Test adapter `newArchiveChange` still accepts a `RunStepHooks` argument and **maps it into** `makeArchiveBindings` (`helpers.ts:940-971`). That is test wiring, not the production ctor.

### Discrepancies

1. **Spec-wrong (medium)** — Requirement: Spec metadata generation still says call `RegenerateSpecMetadata.execute({ specId })`. Code calls `this._materializeMetadata.execute({ specId, policy: 'force' })` (`archive-change.ts:510-511`). `RegenerateSpecMetadata` still exists as a class (`regenerate-spec-metadata.ts:37`) but is not the archive path. Spec text did not catch up to `MaterializeSpecMetadata` already listed on the ctor.

2. **Spec-wrong (medium)** — Requirement: Archive repository call still says `FsArchiveRepository` “appends an entry to `index.jsonl`”. Storage/fs-cache uses `.specd-index.jsonl` under `{configPath}/tmp/fs-cache/archive/` (`archive-repository.ts` `LEGACY_INDEX_FILE = '.specd-index.jsonl'`). This is stale adapter prose inside the change spec, not a production ctor mismatch.

3. **Spec-wrong (minor)** — Requirement: Input lists `name`, `skipHookPhases`, `allowOverlap` only. Code also has `allowOutOfScope` (`archive-change.ts:90`, passed into check context `:295`, `:332`, `:537`). Behavior is real; the Input section omits it.

4. **Spec-wrong (low)** — Requirement: Result shape omits `archiveDirPath`, which the result interface and execute path return (`archive-change.ts:107`, `:477-484`). Extra field; not a recorte-24 failure.

No production ctor vs `ArchiveChangeDeps` split remaining. No snapshot-bag of checks. No `archive.publication` on the table.

### Test Coverage

- `packages/core/test/application/use-cases/archive-change.spec.ts`: `does not store RunStepHooks on the instance` (`:168-180`); skip `all`/`pre`/`post`; hook fail-fast/fail-soft via `makeRunStepHooks` injected **through bindings**.
- `packages/core/test/composition/use-cases/archive-change.spec.ts`: deps object **must** include `archiveBindings` (`:30-45`, `:49-61`).
- `packages/core/test/application/use-cases/archive-change-batch-restore.spec.ts`: batch snapshot/restore (canonical backups, not check bags).
- `packages/core/test/domain/services/transition-checks.spec.ts`: `archive.publication` absent.

### Missing Tests

- Direct assertion that `ArchiveChange` constructor **parameter list** rejects a `RunStepHooks` 4th argument (TypeScript already enforces; runtime test uses helper).
- Spec Input `allowOutOfScope` once the spec section is updated.

### Spec Dependency Chain

Depends on transition-checks / hook-execution-model / storage / change / schema-format (via archive bindings and cascade). Depth-1 **out-of-change** contradiction: `core:storage` (below).

---

## core:schema-format

### Requirements Summary (delta relevant to recorte)

Artifact `requires` is used by `LifecycleEngine.projectArtifacts` (DAG effective status). Cascade:

- dependency resolved when status is `complete` or `skipped`;
- if dependent is `complete` and a required artifact is not `complete`/`skipped`: incomplete / missing / `in-progress` parents → dependent `in-progress`; parents in `pending-review` / `drifted-pending-review` / `pending-parent-artifact-review` → dependent `pending-parent-artifact-review`;
- **There is no `Change.effectiveStatus()` method.**

Also: `schema.artifactDag()` is the canonical DAG API; workflow steps are lookup rows, not a second state machine.

### Implementation Status

**Aligned with locked product.**

- `LifecycleEngine.projectArtifacts` (`lifecycle-engine.ts:288-299`) sets `effectiveStatus: this._effectiveStatus(...)`.
- `_effectiveStatus` (`:328-382`): own missing / pending-review / drifted-pending-review / skipped / in-progress returned as-is; else walk `requires`; non-review blockers return `'in-progress'`; review blockers set `blockedByReview` then return `'pending-parent-artifact-review'`.
- `packages/core/src/domain/entities/change.ts`: **no** `effectiveStatus` symbol (graph + file search).

### Discrepancies

None between **this change’s** `core:schema-format` and `LifecycleEngine._effectiveStatus`.

**Out-of-change (major, spec-wrong vs locked product):** `core:storage` still requires `Change.effectiveStatus(type)` and verify scenarios call `Change.effectiveStatus('a')`. See Spec Dependency Chain.

### Test Coverage

- `packages/core/test/domain/services/lifecycle-engine.spec.ts:196-216` — incomplete ancestor → dependent `in-progress`.
- Same file `:219-241` — upstream `pending-review` → `pending-parent-artifact-review` (including transitive `verify`).

### Missing Tests

- Explicit `_effectiveStatus` case: parent `missing` while child hash-complete → `in-progress` (implied by cascade loop; not a named scenario).
- No schema-format package test file; behavior is covered in lifecycle-engine tests (acceptable if schema-format verify points at engine).

### Spec Dependency Chain

`core:delta-format`, `core:selector-model`, `core:transition-checks`. **Depth-1 contradiction (not in change): `core:storage`.**

---

## core:hook-execution-model

### Requirements Summary

- Two hook types (`instruction:` vs `run:`); external hooks are a third explicit form.
- Default: `TransitionChange` / `ArchiveChange` auto-execute matching `run:` **effects** after predicates; slot/failure from binding (`phase`, `onFailure`).
- `RunStepHooks` SHALL be a constructor dep of hook **checks**, not launched by check id in the use case; no private always-source.post path.
- Archive defaults: `hook.pre` abort/`before-persist`; `hook.post` collect/`after-persist`.
- `skipHookPhases` selects by binding phase + selectors (`pre`/`post`/`all` on archive).
- Change entity does not execute hooks.

### Implementation Status

**Aligned with recorte-24 item 4.**

- `ArchiveChange` does **not** call `RunStepHooks`. It runs `matchingEffects` + `executeCheckWithProgress` (`archive-change.ts:318-336`, `:526-541`).
- `createHookPre` / `createHookPost` take `{ runStepHooks }` (`hook-effect.ts:187-198`). `HookEffectCheck.execute` calls `this._runStepHooks.execute` (`:157-159`) after skip selectors.
- Archive skip: `skip.has('pre')` / `'post'` / `'all'` inside the check (`hook-effect.ts:134-144`), not `binding.check.id` in the use case.

Verify scenario “Hook execution delegated to RunStepHooks” is still true **at the check**, not as `ArchiveChange` ctor injection.

### Discrepancies

None that reopen recorte-24. Residual wording tension (low, documentation): verify still says “THEN `RunStepHooks` is used for collection…” which is easy to misread as use-case ctor; spec.md body already forbids that. **Spec-ok + code-ok** if read as check-layer.

### Test Coverage

- `packages/core/test/application/use-cases/archive-change.spec.ts`: skip all/pre/post; instruction hooks skipped; fail-fast pre; collect post (`~1424-1600`, hook sections).
- `packages/core/test/application/use-cases/transition-change.spec.ts`: skip `all` / `target.pre` / `source.post`; predicates still fail when hooks skipped.

### Missing Tests

- ArchiveChange unit test that spies `RunStepHooks.execute` is **never** called from the use-case instance (only from the check). Current tests spy via `makeRunStepHooks` passed through `newArchiveChange` helper, which is equivalent if bindings wrap that spy.

### Spec Dependency Chain

`core:transition-checks`, `core:template-variables`, `core:change`, `core:schema-format` (workflow hook YAML).

---

## skills:skill-templates-source

### Requirements Summary (recorte-relevant)

Requirement: Design skill review scope without review file lists:

- MUST NOT say artifacts are listed under `review:`.
- MAY/MUST still use `review: required: yes` as review-mode trigger.
- First review scope is `artifacts (details):` and/or structured `affectedArtifacts`.

(Other requirements in this spec — graph impact wording, optimizer gating, in-place approval gates, archive `--skip-hooks pre` — were spot-checked via `packages/skills/test/template-workflow.spec.ts`; recorte-24 item 3 is the assigned close-out.)

### Implementation Status

**Aligned.**

- `packages/skills/templates/skills/specd-design/SKILL.md.tpl:48-50` — trigger `review: required: yes`; scope `artifacts (details):` / `review.affectedArtifacts`; explicit “Text `review:` only has `required` / `route` / `reason` — not file paths.”
- Same file `:178` — `reason`, `artifacts (details):`, structured `affectedArtifacts`.
- Repo-wide templates: **no** `listed under \`review:\`` match.

### Discrepancies

None.

### Test Coverage

- `packages/skills/test/template-workflow.spec.ts:147-153`:
  - `toContain('review: required: yes')`
  - `not.toMatch(/listed under \`review:\`)`
  - `toContain('artifacts (details):')`
  - `toContain('affectedArtifacts')`
- Adjacent: archive `--skip-hooks pre` (`:139-145`).

### Missing Tests

None for recorte-24 item 3.

### Spec Dependency Chain

`cli:spec-optimizations`, workflow CLI specs, `cli:change-status` (review header contract).

---

## Depth-1: core:storage (NOT in the change)

**Out-of-change contradiction — flag only.**

- `specs/core/storage/spec.md:32` — Requirement: Artifact dependency cascade: `` `Change.effectiveStatus(type)` must cascade... ``
- `specs/core/storage/verify.md:89,94` — scenarios still `THEN`/`WHEN` `Change.effectiveStatus('a')`.

Locked product and change `core:schema-format` forbid `Change.effectiveStatus()`. Engine owns cascade via `LifecycleEngine._effectiveStatus` / `projectArtifacts`. Storage’s load-time file status derivation (`missing`/`in-progress`/`complete`/`skipped` from hash) is a different layer and can remain; the **method name on `Change`** is spec drift.

**Verdict: spec-wrong (storage spec/verify vs locked API). Code-ok. Out of change `workflow-transition-checks`.**

Storage verify also does **not** mention review-status cascade (`pending-parent-artifact-review`). Incomplete vs schema-format; still out-of-change.

---

## Severity counts (this batch)

| Severity | Count | Notes                                                                                                                                                   |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| critical | 0     |                                                                                                                                                         |
| major    | 1     | Out-of-change `core:storage` still names `Change.effectiveStatus()`                                                                                     |
| medium   | 2     | archive-change metadata API name (`RegenerateSpecMetadata` vs `MaterializeSpecMetadata`); archive-change `index.jsonl` vs fs-cache `.specd-index.jsonl` |
| minor    | 1     | `allowOutOfScope` missing from ArchiveChange Input section                                                                                              |
| low      | 2     | `archiveDirPath` extra on result; hook-execution-model verify wording vs ctor (not a product bug)                                                       |

Missing tests (not counted as discrepancies): CLI `--help` schema line for `overlapDetail`; optional missing-parent cascade named test.

---

## Closed vs still-open recorte items

| #   | Item                                                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Merged archive-change Ports/constructor vs production `ArchiveChange` / `ArchiveChangeDeps`                                                     | **CLOSED** | Production ctor 4th arg `archiveBindings` (`archive-change.ts:222`); `ArchiveChangeDeps.archiveBindings` (`composition/.../archive-change.ts:116`); factory pass-through `:187-200`. Tests use `newArchiveChange(..., runStepHooks, ...)` only as a **helper** that builds bindings (`helpers.ts:943-971`). |
| 2   | schema-format requires cascade vs `LifecycleEngine._effectiveStatus`                                                                            | **CLOSED** | Change spec: no `Change.effectiveStatus()`; cascade rules match `_effectiveStatus` (`lifecycle-engine.ts:328-382`) + tests (`lifecycle-engine.spec.ts:196-241`). Residual: **out-of-change** `core:storage` still names the removed method.                                                                 |
| 3   | specd-design SKILL.md.tpl must NOT say artifacts listed under `review:`; MAY use `review: required: yes` + details/`affectedArtifacts`          | **CLOSED** | `SKILL.md.tpl:48-50`, `:178`; `template-workflow.spec.ts:147-153`.                                                                                                                                                                                                                                          |
| 4   | hook-execution-model: archiving uses hook.pre/post **execute**, not `ArchiveChange` calling `RunStepHooks`                                      | **CLOSED** | Use case: `matchingEffects` + `executeCheckWithProgress` (`archive-change.ts:318-336`, `:526-541`). I/O: `HookEffectCheck.execute` → `RunStepHooks` (`hook-effect.ts:133-159`).                                                                                                                             |
| 5   | change-status Examples: no standalone `specs:` list; JSON help schema includes `overlapDetail` with `archivedChangeName` / `overlappingSpecIds` | **CLOSED** | Examples in spec-preview (no `specs:` line). Help: `status.ts:116-125`. Tests: `change-status.spec.ts:165`, `:666-726`.                                                                                                                                                                                     |

**All five recorte-24 items are closed on assigned specs.** Remaining findings are either out-of-change (`core:storage`) or leftover archive-change prose (metadata class name, archive index filename, extra input/result fields).

<!-- end _partial-recorte.md -->

---

<!-- begin _partial-core-domain.md -->

# Partial: core domain (lifecycle-engine, transition-checks, change, workflow-model)

**Mode:** change `workflow-transition-checks`  
**Spec source:** `changes spec-preview` (`--artifact specs` / `--artifact verify`)  
**Graph:** fresh (`stale: false`, indexed 2026-08-27T14:01:20.650Z)  
**Symbols:** `LifecycleEngine.evaluate` `core:src/domain/services/lifecycle-engine.ts:129`, `projectArtifacts` `:288`, `_effectiveStatus` `:328`, `classifyAlong` `core:src/domain/services/transition-checks.ts:167`, `CheckId` `:20`, `CheckBinding` `:420`, `VALID_TRANSITIONS` `core:src/domain/value-objects/change-state.ts:30`, `CompileContext` `core:src/application/use-cases/compile-context.ts:198` (no `LifecycleEngine` dependency).  
**Tests inspected:** `packages/core/test/domain/services/lifecycle-engine.spec.ts`, `transition-checks.spec.ts`, `change.spec.ts` (plus `build-schema.spec.ts` for unknown `workflow[]` step).

Neither spec nor code is treated as sole truth. Findings below name **spec-wrong** vs **code-wrong** with evidence.

---

## Requirements Summary

### `core:lifecycle-engine`

- Sole authority for hop interpretation: project **predicate** `CheckResult`s; no `run:` effects, no snapshot bag, no `check.run` fallback when `checksByTarget` is missing.
- `projectArtifacts` is a public pure DAG helper; **not** a second availability algorithm. Public contract is `evaluate(...)`; no public `computeEffectiveStatus(...)`.
- Effective artifact mapping: persist `drifted-pending-review` / `pending-review`; `complete` + unsatisfied upstream review → `pending-parent-artifact-review`; else persist `missing` / `in-progress` / `complete` / `skipped`. Canonical states only (`complete-with-drift` / `hasDrift` are not extra lifecycle states).
- Blockers: structured `code` / `message` / `isSkippable` / optional `bypassFlag` / `affectedArtifacts`. Mandatory codes include `MISSING_ARTIFACT`, `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`. Skippable + active bypass → **warning**, not blocker.
- `validTransitions` = `VALID_TRANSITIONS[state]`; `availableTransitions` = protocol targets whose injected predicates all pass/skip; `availableSteps` = `schema.workflow()` extras rows (omitted `implementing` may be absent from extras while still protocol-legal). `isReady` from `workflow.requires` results when present (no dual-write `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT`). `isPermitted` = `protocol.edge`. `_resolveTarget` must not rewrite to pending parking states.
- `nextAction` happy-path matrix (stay in `ready`/`done` for approvals; backward hops listed but not default). Archiving: `archivable`+`designing`; recovery hop skips `requires`/`taskCompletion`.
- Consumers: GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction use `evaluate`. **CompileContext must not call `evaluate` or compute hop availability.** ValidateArtifacts: empty `checksByTarget` still gets DAG / `nextArtifact`.
- `nextArtifact` from `schema.artifactDag().topologicalOrder()`.

### `core:transition-checks`

- Closed `CheckId` union (no `archive.publication`). Gerund `label`, `kind` on class, `execute(ctx)` self-sufficient. No `PredicateSnapshots` / `gatherPredicateSnapshots`.
- Applicability on **bindings** (`from`/`to`/`along` or archive). `classifyAlong` + `AXIS_FALLBACK` splice (not tail-append). Unknown strings must not occupy axis slots. Archive is an operation. Predicates vs effects; projections from predicate results.
- Registry: impl runners on `from=implementing` `along=forward` only; approvals stay in `ready`/`done`; recovery excludes `requires`/`taskCompletion`.

### `core:change`

- `VALID_TRANSITIONS`: `ready` → `implementing`|`designing` only; `done` → `archivable`|`designing`|`implementing`|`verifying` (no `pending-signoff`). Pending states **drain-only**. Skill-aligned backward hops from `done`/`signed-off`/`archivable`. No `Change.effectiveStatus()`. Entity owns persisted facts; DAG/hop availability is `LifecycleEngine`.

### `core:workflow-model`

- `workflow[]` looks up extras; omitting a row does not drop protocol membership. Unknown `step` → **`buildSchema` / resolve `SchemaValidationError`**, not `TransitionChange`. Hop availability from engine projections of `CheckResult`s. `CompileContext` MUST NOT evaluate availability. Never `change.effectiveStatus()`.

### Globals (`default:_global/architecture`)

- Domain: stdlib + domain types only; no I/O. Stateless services as pure functions. Engine projecting caller-supplied results + DAG facts is consistent with hexagonal inner layer.

---

## Implementation Status

| Area                                             | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hop availability from `CheckResult`s             | **Implemented**                        | `evaluate` loops `VALID_TRANSITIONS[change.state]`; skips targets with `injected === undefined`; includes target iff `every(outcome !== 'fail')` (`lifecycle-engine.ts:145-155`). No `check.run` / snapshot bag.                                                                                                          |
| `projectArtifacts` DAG                           | **Implemented**                        | Public method `:288-300`; `_effectiveStatus` walks schema `requires` with cycle guard; recursive parent-review `:328-382`. `nextArtifact` uses `artifactDag().topologicalOrder()` `:738-759`.                                                                                                                             |
| `pending-parent-artifact-review` not persistable | **Implemented (with type-union leak)** | `ArtifactFile` ctor throws `InvalidChangeError` if status is parent-review (`artifact-file.ts:52-56`). Load remaps to `in-progress` (`change-repository.ts:1422-1424`); save via `persistableArtifactStatus` `:1700-1702`. Engine **derives** it (`lifecycle-engine.ts:370-378`).                                         |
| No `Change.effectiveStatus()`                    | **Implemented**                        | Graph: only `_effectiveStatus` on `LifecycleEngine` and CLI test helper `effectiveStatus`. `Change` exposes persisted `state` / artifact `status`.                                                                                                                                                                        |
| Pending-\* drain only; stay in ready/done        | **Implemented**                        | `VALID_TRANSITIONS` (`change-state.ts:30-43`): `ready` has no `pending-spec-approval`; `done` has no `pending-signoff`; drain rows remain. `_resolveTarget` is identity (`lifecycle-engine.ts:310-312`). `nextAction` for missing spec/signoff stays on current state (`:799-822`).                                       |
| CompileContext must not evaluate hops            | **Implemented**                        | `graph impact --file compile-context.ts --direction dependencies`: **no** `lifecycle-engine.ts`. Class comment: artifact instructions are `GetArtifactInstruction`.                                                                                                                                                       |
| Unknown workflow step at `buildSchema`           | **Implemented**                        | `build-schema.ts:687-695` throws `SchemaValidationError` if `step` ∉ `Object.keys(VALID_TRANSITIONS)`. `classifyAlong`/`buildAxis` also filter `step in VALID_TRANSITIONS` (`transition-checks.ts:139-140`). Tests: `build-schema.spec.ts` rejects `reviewing`; `transition-checks.spec.ts` unknown step still `forward`. |
| Check ABI / bindings                             | **Implemented**                        | `CheckId` closed union without `archive.publication`. `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`. `exceptAlong: ['recovery']` on requires/taskCompletion. Impl `from=implementing` `along=forward`. Domain stubs vs application `create*` documented on bindings.                        |
| Architecture (domain no I/O)                     | **Implemented**                        | Engine + `classifyAlong` + domain `run(facts)` are in-memory. Production I/O belongs in `application/checks` (out of this batch). Optional `_debug` callback is not filesystem I/O.                                                                                                                                       |

---

## Discrepancies

### D1 — Overlap bypass: “warning” vs omit blocker — **medium**

- **Spec (`core:lifecycle-engine` Machine-readable blockers):** skippable + active bypass SHALL treat the condition as a **warning**, not a transition blocker. Verify: “downgraded to a warning”.
- **Code:** `_reviewBlockers` with `allow-overlap` **returns `[]`** (`lifecycle-engine.ts:523-525`). `LifecycleVerdict` has **no `warnings` field**. Test `'downgrades overlap blockers when the allow-overlap bypass is active'` asserts `OVERLAP_CONFLICT` **absent**, not present-as-warning (`lifecycle-engine.spec.ts:347-387`).
- **spec-wrong:** If the product intentionally has no warning channel, the spec/verify should say “omit blocker” not “warning”.
- **code-wrong:** If warnings are required, engine (and DTO) must surface a non-blocking warning.
- **Both partially wrong** is most accurate: spec names a warning surface that does not exist; code and tests implement omit.

### D2 — `ArtifactStatus` mixes persistable and derived values — **low**

- **Spec:** parent-review is **effective**, not a persisted file/aggregate state.
- **Code:** `ArtifactStatus` includes `pending-parent-artifact-review` (`artifact-status.ts:12-19`). Runtime persist is blocked (file ctor + repository remap). `ChangeArtifact._recomputeStatus` comment mentions parent-review aggregation (`change-artifact.ts:197-199`) but the method **never assigns** that status (files cannot hold it).
- **spec-wrong:** Could split `PersistableArtifactStatus` vs effective union.
- **code-wrong:** Shared union lets callers type-pass a non-persistable value until a ctor/repo guard fires.
- **Net:** behavior matches “not persistable”; type model is looser than the prose.

### D3 — `availableSteps` still DAG-walks `requires` when checks exist — **low**

- **Spec:** `isReady` MUST be projected from `workflow.requires` when results are present; MUST NOT independently re-walk to emit a **different blocker code**.
- **Code:** `isReady` uses `workflow.requires` fail when `evaluationChecks` is set (`lifecycle-engine.ts:167-173`). Step `blockers` are emptied when checks exist (`:190-193`). **`blockingArtifacts` is still filled by walking `workflowStep.requires` vs `effectiveStatus` (`:160-163`) even when checks are present.**
- **code-wrong** if `blockingArtifacts` is considered a second algorithm; **spec-wrong** if only blocker **codes** were in scope (then this is extra telemetry, not a dual-write). Dual-write of `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT` on **requested** blockers is avoided when `hasRequiresResult` (`:595-607`); covered by test at `lifecycle-engine.spec.ts:854-867`.

### D4 — Empty `checksByTarget` ⇒ empty `availableTransitions` — **info / aligned**

- Spec: do not fall back to `check.run`; hop availability from results **when supplied**; DAG `isReady` / parent-review MAY use `projectArtifacts` when empty.
- Code: missing injection → `continue` (target not listed). `availableSteps` then uses DAG `blockingArtifacts` for `isReady`. Matches “no second availability from check.run”. Not a defect; callers (GetStatus) must inject results.

No **critical/high** domain mismatches found for the assigned hop/DAG/pending/CompileContext/`buildSchema` focus.

---

## Test Coverage

### `lifecycle-engine.spec.ts` (maps well to verify)

| Verify / requirement                        | Test                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive parent-review                     | `downgrades complete artifacts to pending-parent-artifact-review…`                                                                                                                                |
| Canonical complete-with-drift               | `treats complete-with-drift as complete…`                                                                                                                                                         |
| Canonical missing + hasDrift                | `uses canonical missing state even when hasDrift is true`                                                                                                                                         |
| DAG next artifact vs declaration order      | `selects next artifact in topological order…`                                                                                                                                                     |
| CheckResults, no I/O                        | `projects injected CheckResults without filesystem I/O`                                                                                                                                           |
| availableSteps ≠ protocol                   | `workflow omits implementing` → extras omit `implementing`, `validTransitions` still includes it                                                                                                  |
| Dual-write                                  | `does not dual-write MISSING_ARTIFACT`                                                                                                                                                            |
| Task gating / nextAction                    | hide verifying; include verifying + `/specd-verify`; designing→ready; incomplete design stays designing; verifying→done; archivable→archive; done lists backward hops; done blocked stays on done |
| Approval stay in ready                      | `keeps implementing as effectiveTarget when spec approval is required`; designing + spec gate does not recommend approve                                                                          |
| Archiving escapes / recovery skips requires | `exposes archiving escape…`; `keeps archiving recovery available when archivable requires are incomplete`; failed commit → designing                                                              |
| Impl skippable flags                        | filesResolved not skippable; linksInScope `--allow-out-of-scope`                                                                                                                                  |
| Overlap bypass                              | present without flag; absent with `allow-overlap` (see D1)                                                                                                                                        |

### `transition-checks.spec.ts`

- `classifyAlong`: redesign, backward, recovery, forward, omitted `implementing`/`ready`, unknown `reviewing` not occupying axis.
- Bindings: no applicability on check objects; gerund labels; archive rows; shared runner identity; `approval.spec` vs redesign; effect `phase`/`onFailure`; compact impl messages; actionable `deps.consistent`.

### `change.spec.ts`

- Identity, workspaces, history-derived state, invalid pairs, artifact aggregation — **entity** scope.
- Protocol table is asserted via `VALID_TRANSITIONS` usage in `transition()` (`InvalidStateTransitionError`), not a dedicated “ready has no pending-spec-approval” table test in the portion reviewed. Drain/stay-in-ready behavior is primarily engine + application tests.

### `build-schema.spec.ts` (workflow-model / unknown step)

- Accepts valid `ChangeState` steps; **rejects `reviewing` with `SchemaValidationError`**.

---

## Missing Tests

1. **All artifacts complete/skipped → `nextArtifact === null`** (`core:lifecycle-engine` verify “All artifacts complete yields null next artifact”) — not in `lifecycle-engine.spec.ts`.
2. **Direct `evaluate(..., { checksByTarget: {} })`** — helper always merges `domainChecksByTarget`; empty-map hop emptiness and DAG-only `isReady` are undertested at unit level.
3. **Overlap bypass as warning** — no assertion of a warning object (blocked by D1).
4. **`Change` has no `effectiveStatus` method** — no explicit `expect('effectiveStatus' in change).toBe(false)` (graph-backed; optional).
5. **File persist guard** lives in `artifact-file.spec.ts`, not `change.spec.ts` — acceptable split; parent-review persist is not re-tested on `Change` save path in this batch.
6. **`CompileContext` does not call `evaluate`** — covered structurally by graph; no domain-unit test (belongs to compile-context / lifecycle consumer batch).

---

## Spec Dependency Chain

```
core:lifecycle-engine
  → core:change (persisted facts, VALID_TRANSITIONS)
  → core:workflow-model (workflow extras, axis)
  → core:schema-format (artifact/workflow YAML)
  → core:transition-checks (CheckResult, along, projections)
  → default:_global/architecture (domain purity)

core:transition-checks
  → core:change, core:workflow-model, core:schema-format
  → default:_global/architecture

core:change
  → core:lifecycle-engine (interpretation authority)
  → core:workflow-model, core:transition-checks
  → default:_global/architecture (+ manifest, spec-id, logging, …)

core:workflow-model
  → core:change, core:schema-format, core:build-schema
  → core:compile-context, core:get-status, core:transition-change, core:archive-change
  → core:hook-execution-model
```

**Consistency with globals:** Domain engine + matcher + `buildSchema` stay inside domain with no fs. Application use cases execute checks and inject results — matches hexagonal split. `CompileContext` depending on change/spec/schema **without** lifecycle hop evaluation matches both `lifecycle-engine` and `workflow-model`.

**Internal spec tension (not a code bug):** `lifecycle-engine` still lists `MISSING_ARTIFACT` as a mandatory blocker code while `workflow.requires` (and evaluate when results exist) emit `INCOMPLETE_ARTIFACT` for unsatisfied requires including missing. Dual-write forbid is implemented; the mandatory-code list is partly historical.

---

## Severity counts (this batch)

| Severity | Count | IDs                                        |
| -------- | ----- | ------------------------------------------ |
| critical | 0     | —                                          |
| high     | 0     | —                                          |
| medium   | 1     | D1 overlap warning vs omit                 |
| low      | 2     | D2 status union; D3 blockingArtifacts walk |
| info     | 1     | D4 empty checksByTarget                    |

**Assigned-focus verdict:** Hop availability, DAG `projectArtifacts`, non-persistable parent-review (runtime), no `Change.effectiveStatus()`, pending drain + stay-in ready/done, CompileContext not evaluating hops, and unknown step rejection at `buildSchema` are **implemented and largely test-backed**. Remaining issues are warning-surface / type-union / extras-row walk, not protocol regressions.

<!-- end _partial-core-domain.md -->

---

<!-- begin _partial-core-usecases.md -->

# Partial audit — core use cases

**Batch:** `_partial-core-usecases`  
**Change:** `workflow-transition-checks` (mode: change)  
**Graph:** indexed, `stale: false` (`lastIndexedAt: 2026-08-27T14:01:20.650Z`)  
**Symbols:** `GetStatus`, `TransitionChange`, `ApproveSpec`, `ApproveSignoff`, `ValidateArtifacts`, `GetArtifactInstruction`  
**Out of scope:** `ArchiveChange` (mention only if contradiction — none found)

Neither spec nor code is treated as truth. Evidence is cited from change spec-preview, application use cases, composition factories, and tests under `packages/core/test/application/use-cases/` plus composition tests.

---

## Batch focus verdict

| Focus item                                                  | Status                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Hop consumers execute matching predicates then `evaluate`   | **Aligned** (`GetStatus` → `executeChecksByLegalTargets` then `evaluate`; `TransitionChange` → `executeMatchingPredicates` then `evaluate`) |
| DAG-only consumers pass `checksByTarget: {}`                | **Aligned** (`ValidateArtifacts`, `GetArtifactInstruction`)                                                                                 |
| Drafts use `projectArtifacts`, not `evaluate`               | **Aligned** (`GetStatus._buildDraftedResult`)                                                                                               |
| `GetStatus` paints `taskCompletion` from checks             | **Aligned** (`taskCompletionFromChecks` on `workflow.taskCompletion` details)                                                               |
| Public blockers = failed-predicate codes                    | **Aligned** (`_mergeBlockers`)                                                                                                              |
| `skipHookPhases` by binding phase + selectors, not check id | **Aligned** (`matchingEffects(..., 'before-persist')`; `HookEffectCheck` reads `ctx.skipHookPhases`)                                        |
| `hook.post` before persist; abort = no persist              | **Aligned** (effects then `mutate`; post-fail test leaves state)                                                                            |
| Stay in `ready`/`done` for approve                          | **Aligned**                                                                                                                                 |
| No pending hops for new work                                | **Aligned** (`VALID_TRANSITIONS.ready` has no `pending-spec-approval`; protocol + gate checks)                                              |

---

## core:get-status

### Requirements Summary

| Requirement                              | Intent                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Accepts a change name as input           | `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                               |
| Returns the change and artifact statuses | Active `change` XOR `draftView`; no `getDiscarded`                                                |
| Revision evaluation                      | HTTP-304-style short-circuit; no refresh                                                          |
| Drafted change read-only status          | DAG via `projectArtifacts` / empty checks; empty transitions                                      |
| Implementation status projection         | Tracked files + links from persisted change                                                       |
| Optional pre-read refresh                | Active only; not drafts; not short-circuit                                                        |
| Drift-aware display status               | File + aggregate `displayStatus`                                                                  |
| Task completion counts                   | From `workflow.taskCompletion` details; no second `CountTasks`; no constructor `CountTasks`       |
| Execute matching predicates then project | Hop consumer; engine I/O-free                                                                     |
| ChangeNotFoundError                      | Never `null`                                                                                      |
| Constructor dependencies                 | Repo, schema, lifecycle, approvals, refresh, composed checks — not `CountTasks` / detector        |
| Config factory bootstrap                 | Same repository semantics                                                                         |
| Effective status for every artifact      | Engine-derived on full path                                                                       |
| Lifecycle context                        | Review priority, overlap scan, check-projected transitions/steps                                  |
| Identifies blockers                      | Review codes + failed-predicate codes; `IMPLEMENTATION_STATE` bypass only for `impl.linksInScope` |
| Graceful schema miss                     | Degrade lifecycle; do not swallow check `execute`                                                 |
| `resolveGetStatusDeps`                   | Config factory only composition entry                                                             |

**Spec dependencies:** `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`

### Implementation Status

| Area         | Code        | Notes                                                                                                               |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Lookup       | Implemented | `get` then `getDraft`; throws `ChangeNotFoundError`                                                                 |
| Hop path     | Implemented | `projectArtifacts` → `executeChecksByLegalTargets` → `evaluate(..., { checksByTarget })` (`get-status.ts` ~443–456) |
| Draft path   | Implemented | `projectArtifacts` only; `evaluate` not called; `checksByTarget: {}`                                                |
| Task paint   | Implemented | `taskCompletionFromChecks`; no `CountTasks` ctor field                                                              |
| Blockers     | Implemented | `_mergeBlockers`; bypass only when `code === IMPLEMENTATION_STATE && id === impl.linksInScope`                      |
| Factory      | Implemented | `resolveGetStatusDeps` + `transitionBindings` from `resolveWorkflowCheckRegistry`                                   |
| Schema catch | Implemented | `try/catch` wraps only `schemaProvider.get()`                                                                       |

### Discrepancies

1. **Medium — `artifactStatuses` cardinality (spec vs code vs tests)**
   - **Spec:** “exactly one entry per artifact in the change's artifact map” and “MUST NOT include entries for artifacts that do not exist on the change.”
   - **Code:** Active and draft full paths iterate `schema.artifacts()`, emitting `missing` rows for schema types with no change artifact (`get-status.ts` 462–489, 612–640).
   - **Tests:** Draft DAG cases expect missing schema artifacts (`get-status.spec.ts` “projects missing schema artifacts…”).
   - **Readings:** (a) spec stale vs schema-complete status UI; (b) code over-projects vs attached-map contract; (c) both if CLI vs engine consumers disagree.

2. **Low — constructor list vs `transitionBindings`**  
   Spec constructor bullet list names composed `create*` checks but not a `transitionBindings` parameter. Code takes `readonly CheckBinding[]`. Behavior matches factory requirement; naming only.

### Test Coverage

Covered in `packages/core/test/application/use-cases/get-status.spec.ts` and `packages/core/test/composition/use-cases/get-status.spec.ts`:

- Predicate-then-evaluate order (`CountTasks` before `evaluate`; `checksByTarget` defined)
- Task paint from check details; omit when empty
- Draft: empty transitions/steps; **`evaluate` not called**; parent-review cascade
- Blockers: `APPROVAL_REQUIRED`; `INCOMPLETE_TASKS` while omitting hop from `availableTransitions`; `impl.filesResolved` no bypass; `impl.linksInScope` `--allow-out-of-scope`
- Composition: config vs deps factory

### Missing Tests

- Explicit assertion that `GetStatus` constructor / deps type does not include `CountTasks` (implied only).
- Short-circuit + refresh interaction is present in verify; confirm `ifModifiedSince` current skips `RefreshImplementationTracking` if not already asserted in this file.
- Cardinality: no test that **fails** if extra schema types appear (spec) vs **requires** them (draft tests) — the two contracts are unreconciled.

### Spec Dependency Chain

`get-status` → `transition-checks` (hop execute) → `lifecycle-engine` (project) → `count-tasks` (inside `workflow.taskCompletion` only). Drafts skip hop table. `config` supplies baked `approvals`.

**Severity counts:** Critical 0, High 0, Medium 1, Low 1

---

## core:transition-change

### Requirements Summary

Input (`to` is persist target; gates not on input), baked `approvals`, existence, optional refresh, **no pending rewrite** for spec/signoff, drain-only pending states, requires + taskCompletion from predicates, verifying→implementing no mass clear, skill-hop invalidation, designing from any state, archiving→archivable recovery, **effects after predicates**, **source.post then target.pre before persist**, skip effects only, mutate persist, result without `postHookFailures`, progress bus, deps without `RunStepHooks`/`CountTasks` on the use case, `resolveTransitionChangeDeps`.

**Spec dependencies:** `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`

### Implementation Status

| Area                     | Code        | Notes                                                                                                                                                   |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predicates then evaluate | Implemented | `executeMatchingPredicates` + `evaluate({ checksByTarget: { [requestedTarget]: evaluation.checks } })`                                                  |
| No pending rewrite       | Implemented | `effectiveTarget = requestedTarget`; `approval.spec`/`approval.signoff` map to `approval-required`                                                      |
| Stay in ready/done       | Implemented | Fail before `mutate`; tests assert unchanged state                                                                                                      |
| New work pending hops    | Implemented | `VALID_TRANSITIONS.ready` = `implementing`, `designing` only; `ready → pending-spec-approval` is invalid (`change-state.spec.ts`)                       |
| Effects                  | Implemented | `matchingEffects(bindings, attempt, 'before-persist', along)` — **phase, not `check.id`**                                                               |
| Skip                     | Implemented | `HookEffectCheck`: `all`, `target.pre`, `source.post` (archive `pre`/`post`); predicates still run (`skipHookPhases: all` still fails incomplete tasks) |
| Post abort               | Implemented | Effects before `mutate`; fail-fast `throwHookFailed`; test state remains `implementing`                                                                 |
| Schema miss              | Implemented | `schemaProvider.get()` uncaught — throws                                                                                                                |
| Factory                  | Implemented | `resolveTransitionChangeDeps`; no `runStepHooks` on use case                                                                                            |

### Discrepancies

1. **Medium — progress event shape (spec vs code)**
   - **Spec / verify:** first-class `{ type: 'hook-start' \| 'hook-done', phase: 'pre' \| 'post', ... }`.
   - **Code:** `OnTransitionProgress` unions `CheckProgressEvent`; hooks emit `check-start` / `check-done` / `check-progress` with `detail: 'hook-start'|'hook-done'` (`hook-effect.ts`, `executeCheckWithProgress`). Tests assert the generic bus (`emits check-start/done for hook.post`).
   - **Readings:** (a) spec not updated after bus unification; (b) code dropped promised CLI-facing event types; (c) both if some callers still listen for `hook-start`.

2. **Low — unused skip selectors**  
   Type/`HookPhaseSelector` includes `'source.pre'` and `'target.post'`. Transition skip logic never matches those strings; they are no-ops. Spec lists them as valid. Possible leftover from a four-slot pipeline vs current before-persist pair (`source.post` + `target.pre`).

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`, composition `transition-change.spec.ts`:

- Gate off: `ready → implementing`; gate on without consent: **stay `ready`**, `approval-required`
- Signoff analogue: **stay `done`**
- Drain pending → approved / signed-off; redesign from pending
- `source.post` before `target.pre` before persist; post fail **no persist**
- `skipHookPhases` `all` / `source.post` / `target.pre`; predicates not skipped by `all`
- Recovery / redesign skip `source.post` (along)
- Composition: `transitionBindings` on deps

### Missing Tests

- Skip matching **does not** use `check.id === 'hook.pre'` (negative test).
- `'source.pre'` / `'target.post'` documented no-op or rejected.
- First-class `hook-start` events if spec remains authoritative.
- Config-based factory does not put `RunStepHooks` on `TransitionChange` ctor (composition tests wire deps, do not assert absence).

### Spec Dependency Chain

`transition-change` → `transition-checks` (predicates/effects) → `hook-execution-model` / `run-step-hooks` (inside `createHookPre`/`createHookPost`) → `lifecycle-engine` (map fails, not re-walk requires) → `config.approvals`. Aligns with `core:config` “no pending hop for new work.” No contradiction with archive-owned recovery invocation.

**Severity counts:** Critical 0, High 0, Medium 1, Low 1

---

## core:approve-spec

### Requirements Summary

Gate-first (`approvals.spec` baked), lookup, hash with cleanup, **record approval while staying in `approval.spec` `from` (`ready`)**, drain `pending-spec-approval` → `spec-approved`, mutate persist, input `name`+`reason` only, `resolveApproveSpecDeps`.

**Spec dependencies:** `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`

### Implementation Status

**Implemented.** Gate before I/O; `boundFromStates('approval.spec')`; `recordSpecApproval` without `transition` when not pending; drain `transition('spec-approved')`; hashes inside `mutate`; `contentHasher` on deps.

### Discrepancies

1. **Low — verify vs spec factory field name**  
   Spec/code: `contentHasher`. Verify scenario lists `hasher: ContentHasher`. Composition uses `contentHasher`. Spec/verify drift only.

### Test Coverage

`approve-spec.spec.ts`: disabled gate no repo; not found; cleanup hashing; null skip; **ready stays `ready`**; drain to `spec-approved`; drafting throws; mutate; composition factory.  
`packages/core/test/composition/use-cases/approve-spec.spec.ts`: resolve path.

### Missing Tests

- Schema mismatch before mutate (verify has it; confirm file coverage).
- Explicit “does not call `transition('pending-spec-approval')`” spy (implied by stay-in-ready).

### Spec Dependency Chain

`approve-spec` → `transition-checks` (`from` for `approval.spec`) → `change` history. Consistent with `get-status` / `transition-change` (consent in `ready`, not a pending hop).

**Severity counts:** Critical 0, High 0, Medium 0, Low 1

---

## core:approve-signoff

### Requirements Summary

Mirror of approve-spec for `approvals.signoff`, stay in `done`, drain `pending-signoff` → `signed-off`.

### Implementation Status

**Implemented.** Same structure as `ApproveSpec` with `boundFromStates('approval.signoff')`.

### Discrepancies

Same **Low** `hasher` vs `contentHasher` in verify factory scenario.

### Test Coverage

Stay in `done`; drain to `signed-off`; drafting throws; composition factory.

### Missing Tests

Same as approve-spec (mismatch-before-mutate if not present; no-pending-transition spy).

### Spec Dependency Chain

`approval.signoff` `from=done` ↔ `config` signoff flag ↔ `TransitionChange` `done → archivable`.

**Severity counts:** Critical 0, High 0, Medium 0, Low 1

---

## core:validate-artifacts

### Requirements Summary (change-relevant + DAG)

Large chokepoint spec (ports, required artifacts, DAG order, complete/skipped bypass, drift invalidation, per-file/delta/structural/cross-artifact/metadata, markComplete, mutate, dependsOn). **This change’s binding requirement:** DAG lifecycle via engine **`evaluate` with empty `checksByTarget`** (`projectArtifacts` path); no hop predicates; no `gatherPredicateSnapshots`.

**Spec dependencies:** change/layout/manifest, lifecycle-engine, delta-format, selector-model, storage, architecture, spec-id-format, schema-format, composition-resolver, transition-checks (negative: not a hop consumer)

### Implementation Status

**DAG requirement: Implemented.** `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })` (`validate-artifacts.ts` ~224–226). No `gatherPredicateSnapshots` in application tree. Hop `executeChecksByLegalTargets` not used here.

Remainder of ValidateArtifacts (delta, cross-artifact, etc.) is pre-existing chokepoint behavior; this batch did not re-prove every delta/cross-artifact rule against code line-by-line. No contradiction with hop-consumer specs: empty `checksByTarget` is the documented DAG-only contract.

### Discrepancies

1. **Low — requirement title vs call**  
   Title: “DAG lifecycle from engine **projectArtifacts**.” Body/verify: must call **`evaluate` with empty `checksByTarget`**. Code calls `evaluate`. Engine `projectArtifacts` is the DAG helper; empty-check `evaluate` is specified as that path. Naming only unless engine `evaluate({})` diverges from `projectArtifacts` (lifecycle-engine batch).

### Test Coverage

`validate-artifacts.spec.ts` asserts `evaluate` called with `checksByTarget: {}`. Composition factory tests exist. Broader validation scenarios live in the same large spec file (required artifacts, deltas, etc.).

### Missing Tests

- Negative: `executeChecksByLegalTargets` **not** invoked from `ValidateArtifacts.execute`.
- `gatherPredicateSnapshots` absence is structural (symbol missing) — no test needed beyond compile.

### Spec Dependency Chain

`validate-artifacts` → `lifecycle-engine` DAG-only. Distinct from `get-status` hop path. No archive contradiction.

**Severity counts:** Critical 0, High 0, Medium 0, Low 1

---

## core:get-artifact-instruction

### Requirements Summary

Ports, input with optional auto `nextArtifact`, lookup, schema guard, artifact resolution, instruction/template/delta outlines without `change.workspace`, result shape, `resolveGetArtifactInstructionDeps`, **`evaluate` with `checksByTarget: {}`**, no hop predicates, no snapshot bag.

### Implementation Status

**Implemented.** `evaluate(change, schema, { checksByTarget: {} })` then `input.artifactId ?? lifecycle.nextArtifact` (`get-artifact-instruction.ts` 102–106). Default `lifecycle` in ctor is still a `LifecycleEngine` instance.

### Discrepancies

None material for this change. Optional default `new LifecycleEngine(...)` is extra vs the spec’s required injection; tests/composition still inject.

### Test Coverage

`get-artifact-instruction.spec.ts`: empty `checksByTarget`. Lookup, mismatch, auto-select covered in verify pairing.

### Missing Tests

- Negative: no `executeChecksByLegalTargets` / no `availableTransitions` on this path.

### Spec Dependency Chain

Same DAG-only pattern as ValidateArtifacts; **not** GetStatus hop path (spec says so explicitly).

**Severity counts:** Critical 0, High 0, Medium 0, Low 0

---

## core:config

### Requirements Summary (change delta)

Most of `core:config` is discovery, workspaces, graph, storage, plugins, context. **This change’s behavioral delta** is **Approvals**:

- Defaults `spec`/`signoff` false
- `spec: true` → wait is `approval.spec` on **forward leave of `ready`**; change **stays in `ready`**; redesign not gated
- `signoff: true` → wait on `done → archivable`; **stays in `done`**
- **New work MUST NOT enter `pending-spec-approval` / `pending-signoff` via `change transition`**

### Implementation Status

Loader parses `approvals` (`config-loader.spec.ts` “parses approvals booleans”). Schema: `approvals: z.object({ spec, signoff })`. Protocol graph: `VALID_TRANSITIONS.ready` omits pending; `isValidTransition('ready', 'pending-spec-approval') === false`. Use cases consume baked `config.approvals`.

### Discrepancies

None between Approvals prose and TransitionChange/Approve\* behavior. Other config requirements were **not** fully re-audited in this batch (unrelated to hop checks).

### Test Coverage

- Loader: parse + cascade merge of `approvals`
- Protocol: `change-state.spec.ts` ready↛pending
- Use cases: gate on/off (see TransitionChange / Approve\*)
- Verify scenario “Spec gate on does not require pending-spec-approval **in the graph**” is **not** a dedicated config-loader test; it is covered by `VALID_TRANSITIONS` + transition tests.

### Missing Tests

- Config-loader (or docs fixture) asserting defaults when `approvals` omitted, if not already in `minimalYaml`.
- Explicit documentation/config test that enabling `approvals.spec` does not add a pending node to the protocol table (today: domain `change-state` tests).

### Spec Dependency Chain

`config.approvals` → baked into GetStatus / TransitionChange / ApproveSpec / ApproveSignoff. Consistent with “no pending hops for new work.”

**Severity counts (this delta):** Critical 0, High 0, Medium 0, Low 0 (missing test only)

---

## Cross-spec consistency (assigned set)

- Hop vs DAG split is consistent: GetStatus/TransitionChange execute predicates; ValidateArtifacts/GetArtifactInstruction/GetStatus-drafts do not.
- Approve stay-in-state matches config Approvals and TransitionChange “check not pending hop.”
- `gatherPredicateSnapshots` does not exist (good).
- Archive: TransitionChange recovery `archiving → archivable` is specified as not ArchiveChange’s job to _call_; no contradiction found without auditing archive.

---

## Batch severity totals

| Severity | Count | Items                                                                                                               |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Critical | 0     | —                                                                                                                   |
| High     | 0     | —                                                                                                                   |
| Medium   | 2     | GetStatus `artifactStatuses` map vs schema types; TransitionChange hook progress event types                        |
| Low      | 4     | unused skip selectors; Approve\* verify `hasher` name; ValidateArtifacts title vs `evaluate`; GetStatus ctor naming |

**Implementation status (focus requirements):** largely **implemented**. Remaining issues are contract/doc drift, not missing hop/DAG wiring.

<!-- end _partial-core-usecases.md -->

---

<!-- begin _partial-cli-skills-global.md -->

# Partial audit: CLI + skills spot-check + project-wide globals

**Batch:** cli-skills-global  
**Mode:** change (`workflow-transition-checks`)  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** `stale: false`, indexed `2026-08-27T14:01:20.650Z`, CLI workspace `VCS_UNMODIFIED`  
**CLI surface (graph):** `cli:src/commands/change/transition.ts`, `archive.ts`, `approve.ts`, `status.ts`, `_check-progress-presenter.ts`  
**Tests in scope:** `packages/cli/test/commands/change*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

---

## Requirements Summary

Assigned **change** specs (via `changes spec-preview`): `cli:change-transition`, `cli:change-approve`, `cli:change-archive`.  
`cli:change-status` and `skills:skill-templates-source` are owned by the recorte batch; this file only notes contradictions and a template spot-check.

### cli:change-transition (14 requirements)

| #   | Requirement                       | Normative gist                                                                                                                                             |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature                 | `transition <name> <step>` or `--next`; `--skip-hooks` tokens `source.pre`, `source.post`, `target.pre`, `target.post`, `all`; `--format text\|json\|toon` |
| T2  | Next-transition resolution        | Fixed forward map; `--next` forbidden on pending gates / `archivable`; `signed-off` → `archivable`                                                         |
| T3  | Delegates refresh policy          | No direct refresh/detector; pre and repair `GetStatus` use `refreshImplementationTracking: false`                                                          |
| T4  | Approval-gate routing             | No gate flags on execute; do not rewrite `implementing`/`archivable` to pending parking states                                                             |
| T5  | Hook execution                    | Map `--skip-hooks` → `skipHookPhases` on `TransitionChangeInput`                                                                                           |
| T6  | Progress output                   | Shared check bus; JSON/TOON NDJSON `stream: "change-transition"`; never `hook-progress`                                                                    |
| T7  | Transition hook observability     | Surface hook progress even if the transition later fails                                                                                                   |
| T8  | Shared hook progress presentation | Transition uses check-progress presenter; distinct public stream from `run-hooks`                                                                          |
| T9  | Output on success                 | Text confirmation on stdout; JSON/TOON terminal `complete` with `result/name/from/to`                                                                      |
| T10 | Post-hook failure warning         | Hook fail → exit 2, `error:` on stderr; no separate post-hook warning; no Repair Guide                                                                     |
| T11 | Invalid transition error          | Exit 1; Repair Guide **on stderr**; `! CODE — label: message` when label present; JSON failure `complete` record with `blockers`/`nextAction`              |
| T12 | Incomplete tasks error            | Exit 1; name blocking artifact; skip-hooks must not bypass predicates                                                                                      |
| T13 | Check progress rendering          | Gerund `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix; hooks on same bus                                                                            |
| T14 | Unsatisfied requires error        | Exit 1; repair guide from GetStatus, CLI does not invent routes                                                                                            |

### cli:change-approve (7 requirements)

| #   | Requirement               | Normative gist                                                                                |
| --- | ------------------------- | --------------------------------------------------------------------------------------------- |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` required; format optional                             |
| A2  | Delegates gate state      | `kernel.changes.approveSpec` / `approveSignoff` with `{ name, reason }` only                  |
| A3  | Artifact hash computation | CLI must not compute or pass hashes                                                           |
| A4  | Approve spec behaviour    | Stay in `ready` on success; help uses bound-`from` language (`ready`)                         |
| A5  | Approve signoff behaviour | Stay in `done` on success; help uses bound-`from` language (`done`)                           |
| A6  | Output on success         | Text `approved <gate> for <name>`; JSON/TOON `{ result, gate, name }` (not a progress stream) |
| A7  | Error cases               | Missing `--reason`, unknown sub-verb, wrong state, missing change → exit 1                    |

### cli:change-archive (10 requirements)

| #   | Requirement                  | Normative gist                                                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| R1  | Command signature            | Canonical `changes archive`; alias `change archive`; `--skip-hooks` `pre`/`post`/`all`  |
| R2  | Prerequisites                | Must be `archivable`; else exit 1 naming current state                                  |
| R3  | Behaviour                    | Delegate merge/move/history to `ArchiveChange`                                          |
| R4  | Hook execution               | Map `--skip-hooks` to archive `skipHookPhases`                                          |
| R5  | Check progress rendering     | Same gerund bus as transition; stream name `change-archive`                             |
| R6  | Post-archive hooks           | Post-hook failures → exit 2                                                             |
| R7  | Output on success            | Text archive path; omit invalidated section when empty                                  |
| R8  | Output on success (extended) | Invalidated list when overlap; JSON includes `invalidatedChanges`                       |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"`; terminal `complete`; no second unwrapped JSON object |
| R10 | Error cases                  | Missing name, not found, not archivable, merge failure → exit 1                         |

### Project-wide specs (scoped to this change’s CLI/skills/core delivery)

- **default:\_global/architecture** — CLI is an adapter: SDK-only, no domain logic in the delivery package; core layers stay inward-only.
- **default:\_global/conventions** — kebab-case, named exports, tests under `test/` mirroring `src/`, no `any`, JSDoc/return types on public APIs.
- **default:\_global/testing** — Vitest, `test/**/*.spec.ts` mirroring `src`, given/when/then naming, no snapshots, unit tests without fs.
- **default:\_global/spec-layout** — change deltas vs `spec.md`/`verify.md` pairing; requirement prose vs WHEN/THEN split.
- **default:\_global/docs** — CLI output/flag contract changes must update living `docs/cli/` (and related guide pages) in the same change.
- **default:\_global/eslint** — kebab-case src, JSDoc including internals in `src/`, layer `no-restricted-imports` (core).

---

## Implementation Status

### cli:change-transition — implemented

- **T1/T5:** `VALID_HOOK_PHASES` + `parseCommaSeparatedValues` → `skipHookPhases` (`transition.ts` ~28–34, 290–320). Graph: `HookPhaseSelector` in `core:src/application/use-cases/transition-change.ts`.
- **T2:** `resolveNextTarget` implements the table including `signed-off` → `archivable` and stderr `--next` refusals for pending/archivable/archiving.
- **T3:** First and repair `status.execute({ name, refreshImplementationTracking: false })`. Tests assert refresh use case is not called.
- **T4:** `transition.execute({ name, to, skipHookPhases }, onProgress)` — no `approvalsSpec`/`approvalsSignoff`. Help/docs: stay in ready/done.
- **T6–T8/T13:** `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`. Check events only; lifecycle extras (`requires-check`, `transitioned`) also tagged `change-transition`. Tests assert no `hook-progress`.
- **T9:** Text `transitioned ${name}: ${from} → ${to}` on stdout; JSON/TOON terminal `complete`.
- **T10:** Uncaught `HookFailedError` falls through to `handleError` → exit 2; tests assert no `repair guide:`.
- **T11:** `writeTextRepairGuide` writes **stderr** only; JSON failure `complete` with `blockers`/`nextAction`. Label form: `! ${code} — ${label}: ${message}` else `! ${code}: ${message}`.
- **T12:** CLI forwards skip-hooks; tests show incomplete-tasks still fail with `--skip-hooks all` (predicate not skipped at CLI).

**Possible code-or-spec (not a hard fail):** Repair Guide example in spec.md uses `error: cannot transition to <step>`. Code prints `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Spec also says “prints an `error:` message”; the boxed example looks illustrative. Tests lock the domain error text.

### cli:change-approve — implemented

- Commander `requiredOption('--reason')`; `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape; no hashes, no gate flags.
- Help: “change in **ready**” / “change in **done**” with drain language for pending states.
- Success copy `approved spec|signoff for <name>`; JSON `{ result, gate, name }` (not a check stream — matches this spec, unlike transition/archive).
- Docs `docs/cli/cli-reference.md` state stay-in-`ready` / stay-in-`done`.

### cli:change-archive — implemented

- Registered on `program.command('changes').alias('change')` (`cli:src/index.ts`) — canonical plural + singular alias.
- Archive selectors `pre`/`post`/`all` distinct from transition’s `source.*`/`target.*`.
- Progress presenter `streamName: 'change-archive'`; JSON terminal `complete` with `archivePath` + `invalidatedChanges`; no extra unwrapped object.
- Post-hook failures: `cliError(..., 2)` before success print.
- Text invalidated section only when `invalidatedChanges.length > 0`.

### Skills templates (spot-check vs recorte)

- `packages/skills/test/template-workflow.spec.ts`: archive template `--skip-hooks pre` (not `all` + separate post `run-hooks`); design template `review: required: yes`, `artifacts (details):`, `affectedArtifacts`, and **not** “listed under \`review:\`”.
- Aligns with `cli:change-status` text review header (status prints `review:` + required/route/reason, files under artifacts details). **No contradiction found** with status blocker/review text in `status.ts` ~235–254.

### Globals vs this change

| Spec                 | Status for this implementation                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| architecture         | CLI depends on `@specd/sdk` only (no `@specd/core` / `@specd/code-graph` in `packages/cli/package.json`). Commands call `kernel.changes.*`. Domain `node:fs` not imported under `packages/core/src/domain` in a spot check.                |
| conventions / eslint | New presenter and command files are kebab-case; named exports; JSDoc on exported + internal helpers in the files read.                                                                                                                     |
| testing              | Vitest `.spec.ts` under `test/`; command tests mock kernel (no real fs). **Layout naming does not strictly mirror `src/`** (see discrepancies).                                                                                            |
| spec-layout          | Change uses deltas; verify scenarios grouped under requirement headings. Merged `cli:change-archive` **base** “Output on success” prose is incomplete (see discrepancies).                                                                 |
| docs                 | `docs/cli/cli-reference.md` and `docs/guide/workflow.md` document `change-transition` / `change-archive` streams, skip-hooks token sets, Repair Guide on stderr, stay-in-state approve copy. Living-page contract **met** for this change. |

---

## Discrepancies

Neither side assumed correct. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `cli:change-transition` verify vs spec.md execute payload

**Spec:** `spec.md` Hook execution: CLI maps `--skip-hooks` to `skipHookPhases`.  
**Verify:** “Transition execute omits approval flags” THEN `TransitionChange.execute` is called with `{ name, to }` **only**.  
**Code:** Always passes `{ name, to, skipHookPhases }` (empty set when flag omitted).

- **Spec/verify drift:** The verify scenario over-constrains the input object; it meant “no approval flags,” not “exactly two keys.”
- **Implementation bug:** Unlikely; omitting `skipHookPhases` would break T5.
- **Fix either:** Relax verify AND-clause to “approval flags absent; `skipHookPhases` may be present,” or stop sending an empty set (weaker, worse).

### D2 — Medium — Merged `cli:change-archive` “Output on success” prose is incomplete

**Spec-preview** of `cli:change-archive` Requirement “Output on success” is truncated/garbled (“prints to stdout: The invalidated changes section is omitted…”; JSON bullet trails off).  
**This change’s delta** correctly rewrites **“JSON output on success”** to the NDJSON `change-archive` complete record; it does **not** repair the older “Output on success” paragraph.  
**Code + verify + docs** describe a complete, consistent contract (path line, optional invalidated block, stream complete).

- **Spec drift (base spec leftover):** Agents reading only the merged “Output on success” requirement could implement a second unwrapped JSON object (the thing R9 forbids).
- **Implementation bug:** Not observed; tests parse `stream: "change-archive"` and NDJSON progress+complete.

### D3 — Medium — `default:_global/architecture` vs CLI `--next` mapping

**Architecture:** Adapter packages contain no business logic; they translate to use cases.  
**cli:change-transition:** CLI MUST implement the drafting→…→archivable table in the command.  
**Code:** `resolveNextTarget` in `transition.ts` (lifecycle graph in the adapter). `GetStatus.nextAction` is a **skill command**, not a lifecycle `to` state, so it cannot fully replace this table.

- **Global spec over-strict for this command** _or_ **change spec should have required a core `resolveNextTransitionTarget` use case.**
- Current code matches the **change** spec. Hexagonal purity would move the table to core/application.

### D4 — Low — `default:_global/testing` + conventions file layout

**Global:** Test for `src/commands/change/transition.ts` lives at `test/commands/change/transition.spec.ts` (same basename).  
**Code:** `test/commands/change-transition.spec.ts` **and** `test/commands/change/change-transition.spec.ts` (split suites). Same pattern for approve/archive/status. Presenter: `src/commands/change/_check-progress-presenter.ts` has **no** matching `test/commands/change/_check-progress-presenter.spec.ts` (unlike `_hook-progress-presenter.spec.ts` under `test/commands/`).

- **Convention drift** (CLI historical naming) vs **missing mirrored presenter unit file**.
- Behaviour is still covered by command tests (not an implementation gap of T13/R5).

### D5 — Low — Archive skip-hooks verify scenarios vs CLI tests

**Verify:** Isolated `--skip-hooks pre` (post still enabled) and `--skip-hooks post` (pre still enabled).  
**CLI tests:** `all`, combined `pre,post`, and default empty set. Parser would accept `pre` or `post` alone; **no CLI test asserts the singleton sets.** Core `ArchiveChange` likely owns actual skip behaviour.

- **Missing CLI test** vs **spec expecting CLI-level proof of forwarding.** Parser is shared; risk is low.

### Not a contradiction (recorte-owned)

- Status text blockers: `  ! CODE — label: message` (`status.ts` ~240–242). Repair guide: same tokens **without** the two-space indent. Both match their specs. JSON status serializes `label`/`checkId`. Tests in `change/change-status.spec.ts` cover DEPS_INCONSISTENT gerund labels.
- Design skill template vs status `review:` header: aligned (header is not a file list).

---

## Test Coverage

| Requirement                                         | Tests (representative)                                                                                                     | Adequacy                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| T1 signature / `--next` mutex                       | `change-transition.spec.ts` Command signature                                                                              | Adequate                                 |
| T2 `--next` map + refusals                          | Approval-gate routing; `--next` failures; `signed-off` → archivable                                                        | Adequate                                 |
| T3 no double refresh                                | Repair Guide test asserts `refreshImplementationTracking: false` twice                                                     | Adequate                                 |
| T4 no pending rewrite / no approval flags           | `change.spec.ts` + `change/change-transition.spec.ts`                                                                      | Adequate                                 |
| T5 skip-hooks parse `all` / comma / empty           | `--skip-hooks flag` describe                                                                                               | Adequate for parser; actual skip is core |
| T6–T8 stream name, no `hook-progress`               | JSON success with check events                                                                                             | Adequate                                 |
| T7/T10 hook fail progress + exit 2, no repair guide | Pre- and post-hooks                                                                                                        | Adequate                                 |
| T9 text + JSON complete                             | Output on success                                                                                                          | Adequate                                 |
| T11 Repair Guide stderr + labels                    | Invalid transition; ReadOnlyWorkspace `! CODE — label`; JSON failure complete                                              | Adequate                                 |
| T12 incomplete tasks + skip-hooks still blocks      | Incomplete tasks; `change/change-transition.spec.ts`                                                                       | Adequate                                 |
| T13 gerund, no `Executing:`                         | predicate + hook progress tests                                                                                            | Adequate                                 |
| T14 repair from GetStatus nextAction                | Repair Guide from GetStatus; verify skill not implement                                                                    | Adequate                                 |
| A1–A7                                               | `change-approve.spec.ts` + `change/change-approve.spec.ts` (reason, JSON, stay-in-state, unknown verb, drain invoke)       | Adequate                                 |
| R1–R6, R8–R10                                       | `change-archive.spec.ts` (alias via `change archive` in tests, skip-hooks, JSON stream, post-hook exit 2, gerund progress) | Adequate except D5                       |
| R7 omit invalidated                                 | Text omit / include tests                                                                                                  | Adequate                                 |
| Skills archive skip-pre / design review             | `template-workflow.spec.ts`                                                                                                | Spot-check only                          |
| Globals docs                                        | Living pages updated (manual read of `docs/cli/cli-reference.md`)                                                          | Met; no automated doc test               |

CLI command tests mock `resolveCliContext` / kernel: appropriate for an adapter package (`default:_global/testing` unit tests without fs).

---

## Missing Tests

1. **Isolated** `changes archive --skip-hooks pre` and `--skip-hooks post` forwarding (`skipHookPhases` singleton) — `cli:change-archive` verify.
2. **Unit** file for `createCheckProgressPresenter` (heartbeat `still running`, stderr `!` prefix, ANSI strip, structured `stream` discriminator). Covered indirectly.
3. **JSON structured failure** `complete` for transition (verify “Structured failure result”) — confirm whether `change-transition.spec.ts` covers `result: "failure"` NDJSON; text repair guide is well covered. If absent, add one JSON failure stream test.
4. **Help-text** assertions for approve bound-`from` language (`ready` / `done`) — spec MUST; currently only description strings in source, not asserted.
5. **Invalid `--skip-hooks` token** (e.g. `pre` on **transition**, or `source.post` on **archive**) → usage error. Specs imply closed token sets; parser throws `CliValidationError`.

Not missing: approve JSON (`change-approve.spec.ts` ~140–160, ~321–343); Repair Guide label line (`change-transition.spec.ts` ReadOnlyWorkspace).

---

## Spec Dependency Chain

```
cli:change-transition
  → cli:entrypoint
  → core:change
  → core:transition-change
  → core:hook-execution-model
  → core:get-status
  → core:transition-checks

cli:change-approve
  → cli:entrypoint
  → core:change
  → core:transition-checks   (approval.spec / approval.signoff)

cli:change-archive
  → cli:entrypoint
  → core:change
  → core:archive-change
  → core:hook-execution-model
  → cli:command-resource-naming
  → core:transition-checks

cli:change-status (recorte; depth-1 note only)
  → cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks

skills:skill-templates-source (recorte; spot-check)
  → skills:skill, cli:spec-optimizations, skills:workflow-automation, core:transition-checks

Project-wide (always in scope for this batch)
  default:_global/architecture
  default:_global/conventions  → default:_global/error-handling-conventions
  default:_global/testing      → architecture, conventions
  default:_global/spec-layout  → core:schema-format, content-extraction, spec-id-format
  default:_global/docs
  default:_global/eslint       → conventions
```

**Consistency:** Change CLI specs correctly depend on `core:transition-checks` for the generic bus and gerund labels. Archive skip-hooks token set (`pre`/`post`) correctly does **not** reuse transition selectors (`source.post`/`target.pre`). That split is consistent with `core:hook-execution-model` / `core:archive-change` (depth-1). No clash with `cli:change-status` blocker label shape.

---

## Hexagonal / layout / docs flags (this change)

- **Hexagonal:** CLI → SDK kernel only. No core+code-graph mix. Presentation (Repair Guide, skip-hooks parse, check-progress rendering) belongs in the adapter. The `--next` state table is the one architecture tension (D3).
- **Test layout:** Split `test/commands/change-*.spec.ts` vs `test/commands/change/change-*.spec.ts`; presenter tests not mirrored (D4).
- **docs/:** Living CLI reference and workflow guide updated for streams, skip-hooks, Repair Guide stderr, approve stay-in-state. **No docs gap** for this batch.

---

## Summary counts

|                                    | Count                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Change specs fully audited         | 3 (`cli:change-transition`, `cli:change-approve`, `cli:change-archive`) |
| Recorte specs (contradiction-only) | 2 (`cli:change-status`, `skills:skill-templates-source`)                |
| Global specs scoped                | 6                                                                       |
| Requirements tracked (change CLI)  | 31 (14+7+10)                                                            |
| Implemented as specified           | 31 (behaviour); 2 spec-internal/verify/layout issues                    |
| Discrepancies                      | 5 (D1–D5)                                                               |
| Missing tests                      | 5 items (none block the main contracts)                                 |
| **Critical**                       | **0**                                                                   |
| **High**                           | **0**                                                                   |
| **Medium**                         | **3** (D1, D2, D3)                                                      |
| **Low**                            | **2** (D4, D5)                                                          |
| Recorte contradictions             | **0**                                                                   |

**Headline:** Transition skip-hooks selectors, check-progress bus (`change-transition` / `change-archive`), Repair Guide on stderr with labeled blockers, archive JSON stream, and approve stay-in-ready/done copy are implemented and tested. Remaining issues are verify-over-constraint, a leftover garbled archive “Output on success” paragraph in the merged spec, hexagonal placement of `--next`, and test-file layout — not a failed delivery of the CLI UX this change specified.

<!-- end _partial-cli-skills-global.md -->

---
