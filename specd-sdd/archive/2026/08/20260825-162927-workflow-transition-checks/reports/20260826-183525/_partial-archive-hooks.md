# Batch: archive-hooks-config

Change: `workflow-transition-checks`
Mode: spec-preview vs code+tests (graph-first)
Graph: stale=false, lastIndexedAt=2026-08-26T16:29:52.129Z
CLI: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`

Assigned specs:

- `core:archive-change`
- `core:hook-execution-model`
- `core:config`

Design notes confirmed in this batch:

- `archive.publication` is **not** a registry check. `ARCHIVE_BINDING_SPECS` omits it. Failures are labeled via `runArchivePublication` inside `ArchiveChange` preflight. Test: `packages/core/test/domain/services/transition-checks.spec.ts` (`archive.publication is absent`).
- Effects are selected with `matchingEffects(..., phase)` (`before-persist` / `after-persist`), not by iterating `check.id`.
- `skipHookPhases` skip **mapping** still keys off check id / factory phase in `HookEffectCheck.execute` (see discrepancies).

---

## Per spec

### `core:archive-change`

**Requirements summary (33 in spec.md):** ports/constructor; input (`skipHookPhases` `pre`/`post`/`all`, `allowOverlap`); schema name guard; ArchivedChange construction; archivable guard; deferred `archiving` transition; readOnly guard; overlap guard; pre-archive hooks (binding `phase`, not `check.id`); tracked artifacts; full-batch preflight; staged commit; batch snapshot/restore; orphan backups; lifecycle rollback; debug logging; delta merge; archive repository + actor; index metadata; post-archive hooks (`after-persist` / `collect`); spec metadata; spec-lock; result shape; typed errors; archive checks share runners and **must not register `archive.publication`**; impl files/links; out-of-scope; factory via `resolveArchiveChangeDeps`.

**Implementation (symbols):**

- `ArchiveChange` — `packages/core/src/application/use-cases/archive-change.ts:276`
- `defaultArchiveBindings` / `_archiveBindings` — same file; composition `createWorkflowCheckRegistry` → `archiveBindings`
- `ARCHIVE_BINDING_SPECS` — `packages/core/src/domain/services/check-bindings.ts:87` (schema.nameMatch → archive.archivable → spec.overlap → workspace.readOnly → deps.consistent → impl.filesResolved → impl.linksInScope → hook.pre before-persist/abort → hook.post after-persist/collect). No `archive.publication`.
- `matchingEffects` — `packages/core/src/application/services/execute-hook-effect.ts:28`
- `archivePublication` / `runArchivePublication` — `packages/core/src/domain/checks/archive-publication.ts` (labeling only; `execute` is skip)
- Predicates via `executeMatchingPredicates` then effects via `matchingEffects` + `executeCheckWithProgress` (no `RunStepHooks` launch by id in the use case)

**`archive.publication` (by design, not a registry check):**

- Compliant. `CheckId` still includes `'archive.publication'` for labels/logs. `ARCHIVE_BINDINGS` / `createWorkflowCheckRegistry` do not bind it. Preflight I/O stays in `ArchiveChange._prepareArchivePlan` / `_prepareArchivePreflight`; catch blocks log `runArchivePublication('ARCHIVE_PREFLIGHT', ...)`.
- Spec: “MUST NOT register `archive.publication` on the binding table.” Code matches. Remaining merge/publish preflight is inside the use case after predicates 1–7.

**Effects / `skipHookPhases`:**

- Compliant selection: `matchingEffects(this._archiveBindings, archiveAttempt, 'before-persist'| 'after-persist')` (comments: “binding phase; not check id”).
- Skip values `'pre'|'post'|'all'` accepted on `ArchiveChangeInput`. Passed through `CheckExecutionContext.skipHookPhases`. `--skip-hooks` CLI (`packages/cli/src/commands/change/archive.ts`) maps to that set; tests in `packages/cli/test/commands/change-archive.spec.ts`.
- Predicates still run when skip is `all` (tests in `archive-change.spec.ts`: skip all still archives / still generates metadata).
- Skip **decision** is not on the use-case loop; it is inside `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts:133`): archive branch uses factory `_phase` (`pre`/`post`) plus `skip.has('pre'|'post'|'all')`, not `binding.phase` (`before-persist`/`after-persist`). For default bindings this coincides with check ids `hook.pre`/`hook.post`. If a future binding reused those ids with swapped phases, skip selectors would follow factory phase/id, not the binding table.

**Constructor / input / result vs spec:**

- Spec constructor: `ChangeRepository`, `Map<string, SpecRepository>`, `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, `ArtifactParserRegistry`, `ExtractorTransformRegistry`, `SchemaProvider`, `RegenerateSpecMetadata`, `SpecWorkspaceRoute[]`.
- Code constructor: `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, `ArtifactParserRegistry`, `SchemaProvider`, `MaterializeSpecMetadata`, optional transforms/routes/`projectRoot`/`batchSnapshot`/`archiveBindings`. Specs are reached via `ListWorkspaces`, not a constructor `specs` map. Metadata port is `MaterializeSpecMetadata`, not `RegenerateSpecMetadata`.
- Evidence: likely **spec drift** (composition already uses `ListWorkspaces` + batch snapshot + materialize). Extra `archiveBindings` injection is this change’s registry wiring — reasonable, undocumented on the spec constructor.
- `_runStepHooks` is stored and never read after construction (only passed into `defaultArchiveBindings` if bindings are omitted). Spec says `RunStepHooks` is a constructor dep of hook **checks**, not launched by the use case — the unused field is leftover, not a second launch path.
- Extra input `allowOutOfScope` (not in the spec’s input list). Extra result `archiveDirPath` (used by CLI/tests). Spec vs extra fields: **spec incomplete** more than a bug.

**Other archive-check requirements (this change):**

- `approval.signoff` is not in `ARCHIVE_BINDING_SPECS`. Archive is not a lifecycle edge. Compliant.
- Shared runners: `deps.consistent` / `workspace.readOnly` / impl checks reuse the same `Check` instance across transition and archive tables (`transition-checks.spec.ts` “check object is reused”).
- `throwMappedArchiveFailure` maps failed **predicate** ids to typed errors (allowed). Effects fail via `throwHookFailed` / collect `postHookFailures`.

**Tests:**

- `packages/core/test/application/use-cases/archive-change.spec.ts` — skip all / pre / post; instruction entries skipped by `RunStepHooks`; pre fail-fast; post collect.
- `packages/core/test/application/services/matching-effects.spec.ts` — archive before-persist abort, after-persist collect, no id filter for the slot.
- `packages/core/test/domain/services/transition-checks.spec.ts` — archive.publication absent; archive hook phases/onFailure.
- Batch restore / overlap / readOnly covered in existing archive-change / batch-restore specs (broader than this change).

**Discrepancies:**

1. **Skip mapping not by binding `phase`.** Spec: selection and skip must not branch on `hook.pre`/`hook.post` ids; skip by binding `phase` and archive `pre`/`post` selectors. Use case selects by phase (compliant). `HookEffectCheck` skip uses factory `_phase` / check id. **Code incomplete relative to spec** (or spec stricter than default-binding reality).
2. **Constructor/port list stale.** Spec `specs` map + `RegenerateSpecMetadata` vs code `ListWorkspaces` + `MaterializeSpecMetadata` + snapshot/bindings. **Spec drift** (pre-existing) plus undocumented extras.
3. **Debug log `skipped: false` hardcoded** on before-persist start (`archive-change.ts` ~423–427) even when skip selectors are set (effects still “start” then skip inside execute). Weak vs “pre-archive hooks — start and completion (… skipped phases)”.
4. **Input/result extras** (`allowOutOfScope`, `archiveDirPath`) not listed in spec.

**Coverage gaps:**

- No test that skip `'pre'` is decided from `binding.phase === 'before-persist'` independently of `check.id`.
- No test that a hypothetical extra before-persist effect (non-`hook.pre` id) would still run/skip with archive `'pre'`.
- Constructor contract tests still build `new ArchiveChange(...)` with `ListWorkspaces`, not the spec’s TypeScript snippet.

**Counts:** requirements 33; discrepancies 4; covered well (hooks/skip/registry/publication-not-bound) ~22; partial (constructor, skip mapping, logging) ~6; missing tests ~3.

---

### `core:hook-execution-model`

**Requirements summary (12 in spec.md):** two hook types; explicit external hooks; external phase semantics; instruction hooks passive (`GetHookInstructions`, skip in Transition/Archive/`RunStepHooks`); default auto-execute of matching `run:` **effects** after predicates (`phase`/`onFailure` from bindings, not check id; `skipHookPhases` by phase); two execution modes; **“change transition does not execute hooks”** (contradicts default auto-execute); manual `skipHookPhases`; pre fail-fast; post `onFailure`; schema-then-project ordering; template variables (no `{{change.workspace}}`).

**Implementation:**

- `RunStepHooks._collectHooks` keeps only `type === 'run' | 'external'` (`run-step-hooks.ts:209–214`). Instruction entries never execute.
- `createHookPre` / `createHookPost` inject `RunStepHooks`; `kind: 'effect'`. Domain `hookPre`/`hookPost` `execute` is skip (status never waits on effects).
- `TransitionChange` iterates `matchingEffects(..., 'before-persist', along)` then `_executeEffect` → `check.execute` (no id switch to launch hooks). `along` filter drops `hook.post` on redesign (`matching-effects.spec.ts`).
- Archive: before-persist then persist then after-persist, `onFailure` via `hookFailureMode(binding.onFailure)`.
- CLI: transition `--skip-hooks` accepts `source.pre|source.post|target.pre|target.post|all`; archive `pre|post|all`.

**Internal spec contradiction:**

- Requirement “Default hook execution…” + verify “TransitionChange executes pre-hooks…” vs requirement “change transition does not execute hooks” + verify “THEN no hooks are executed”.
- Code implements **auto-execute** (this change). The “does not execute hooks” requirement looks like leftover agent-driven-mode text. **Spec inconsistency**; code follows the newer default-execution requirement.

**`skipHookPhases` by phase, not `check.id`:**

- `HookEffectCheck.execute` (transitions): `this._id === 'hook.pre' && skip.has('target.pre')` / `this._id === 'hook.post' && skip.has('source.post')`. Explicit id branch. Does **not** honor `source.pre` or `target.post` even though `HookPhaseSelector` includes them.
- `shouldExecuteHookEffect` (`execute-hook-effect.ts:110`) also branches on `binding.check.id === 'hook.pre'|'hook.post'`. **No remaining callers** in packages (dead helper). Still documents the forbidden mapping.
- `executeHookEffect` still maps `checkId → RunStepHooks phase` (`hook.pre`→`pre`). Unused by Archive/Transition execute path.

**Instruction hooks as predicates/effects:**

- Compliant: instruction never becomes a check. `RunStepHooks` filters them. `GetHookInstructions` tests exist. Archive instruction+run mix: `archive-change.spec.ts` “instruction-type pre hook”.

**Ordering / templates / external:**

- Schema-before-project is merge-engine / `ResolveSchema` behavior (`resolve-schema.spec.ts` override append). No dedicated `RunStepHooks` test named “schema hooks then project hooks”.
- `{{change.workspace}}` rejected: `get-hook-instructions.spec.ts`, run-hooks tests.
- External hooks: `RunStepHooks` dispatches `external` type; fail-fast/soft follows phase passed to `_executeHooks` (`pre` vs `post`), not archive binding `onFailure` when invoked standalone.

**Tests:**

- Transition skip all / `target.pre` / `source.post`; skip all still fails incomplete tasks (`transition-change.spec.ts`).
- No tests for `source.pre` or `target.post` skip (CLI can pass them; core ignores).
- CLI comma-separated skip (`change-transition.spec.ts`).

**Discrepancies:**

1. **Skip mapping by check id** in `HookEffectCheck` (and dead `shouldExecuteHookEffect`). Spec forbids id branches for skip. **Implementation gap.**
2. **`source.pre` / `target.post` are no-ops.** Type and CLI accept them; execute only maps `target.pre`/`source.post`/`all`. **Implementation gap** or **spec over-specified** unused selectors (both transition hook effects are `before-persist` today, so `target.post` has no binding).
3. **Verify leftover:** “transition does not execute hooks” vs auto-execute. **Spec should drop the old requirement.**
4. Dead `executeHookEffect` / `shouldExecuteHookEffect` still encode id→phase. Harmless if unused; they contradict the spec if treated as the model.

**Coverage gaps:**

- No test that skip uses `binding.phase` without reading `check.id`.
- No test `source.pre` / `target.post`.
- Weak RunStepHooks-level schema-vs-project hook order test.

**Counts:** requirements 12; discrepancies 4; well covered (instruction skip, along filter, archive skip pre/post/all, fail-fast/collect, templates, CLI mapping) ~8; contradictory/legacy ~1; skip-by-phase incomplete ~2.

---

### `core:config`

**Change delta (this change):** Approvals are in-place checks, not pending hops. Depends on `core:transition-checks`. Verify scenario: spec gate on → wait is `approval.spec`; config MUST NOT document a pending hop.

**Scope note:** Full `core:config` has 28 spec.md requirements (discovery, privacy, workspaces, schemaOverrides, graph, etc.). This batch treats non-delta requirements as background. Hook-related dependency: `schemaOverrides` for project workflow hooks (`hook-execution-model` spec dependencies).

**Approvals (delta):**

- Loader: `approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }` (`config-loader.ts:616`). Zod optional booleans (`config-schema.ts:258–263`).
- Runtime: `TransitionChange` with `approvals.spec: true` stays in `ready` and throws approval-required; does not go to `pending-spec-approval` (`transition-change.spec.ts:260–275`). Same pattern for signoff/`done`.
- `approval.spec` / `approval.signoff` are transition bindings only (`TRANSITION_BINDING_SPECS`); not archive. Matches “archive is not a lifecycle edge” / signoff not bound to archive.

**schemaOverrides (hooks):**

- Still parsed and merged (`config-loader.spec.ts` parses overrides; `resolve-schema.spec.ts` append/remove workflow hooks, YAML instruction normalization). No new `specd.yaml` keys for skip-hooks (design: existing CLI flags only). Compliant with “no new config keys” for this change.

**Discrepancies:**

1. **Config-loader tests do not assert default `approvals.spec/signoff === false` when the section is omitted.** Verify scenarios exist; implementation defaults in loader. Coverage gap, not a logic bug.
2. **New verify scenario** (“Spec gate on does not require pending-spec-approval”) is tested in `transition-change.spec.ts`, not under config-loader. Acceptable (behavior is lifecycle), but config verify is not mirrored next to other approvals loader tests.
3. Rest of `core:config` (VCS walk, cascade `remove`, graph excludePaths, etc.) not re-audited as regressions of this change; no delta conflict found with hook/archive work.

**Counts:** requirements 28 (full spec); change-relevant ~2 (Approvals + schemaOverrides-as-hook-layer); discrepancies 0 functional / 2 coverage; remainder assumed prior-compliant.

---

## Spec dependency chain

- `core:hook-execution-model` → `core:config` (`schemaOverrides` project hooks), `cli:change-transition` / `cli:change-archive` (`--skip-hooks`), `core:template-variables`, `core:change`.
- `core:archive-change` → transition-checks / hook-execution-model (archive bindings, effects by phase, `archive.publication` not registered).
- `core:config` (this change) → `core:transition-checks` (in-place `approvals.spec` / `approvals.signoff`).

No contradiction between config approvals (stay in `ready`/`done`) and archive (signoff not an archive predicate).

---

## Batch totals

| Spec                        | Requirements |                           Discrepancies | Coverage gaps | Notes                                                                                          |
| --------------------------- | -----------: | --------------------------------------: | ------------: | ---------------------------------------------------------------------------------------------- |
| `core:archive-change`       |           33 |                                       4 |             3 | publication **not** in registry (pass); skip select-by-phase (pass); skip **map**-by-id (fail) |
| `core:hook-execution-model` |           12 |                                       4 |             3 | auto-execute vs leftover “no hooks” verify; `source.pre`/`target.post` no-ops                  |
| `core:config`               |           28 |              0 functional (2 test gaps) |             2 | approvals in-place; no new yaml keys                                                           |
| **Batch**                   |       **73** | **8** (6 code/spec + 2 config coverage) |         **8** |                                                                                                |

**Highest-signal findings:**

1. `archive.publication` is correctly **not** a binding-table check; labeling helper only.
2. Effect **selection** uses binding `phase`; `skipHookPhases` **filtering** still uses `hook.pre`/`hook.post` ids (and archive factory `pre`/`post`), not `binding.phase`.
3. `core:hook-execution-model` still contains a requirement/scenario that transitions execute **no** hooks; implementation auto-runs matching effects.
4. `core:config` approvals delta matches code (`ready` stays `ready`); loader default-false and pending-hop wording lack config-package tests.
