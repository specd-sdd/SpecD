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
