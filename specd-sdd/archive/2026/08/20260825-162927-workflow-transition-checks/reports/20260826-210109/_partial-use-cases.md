# Batch: use-cases

Read-only spec-compliance audit of change `workflow-transition-checks` for:

- `core:get-status`
- `core:transition-change`
- `core:archive-change`
- `core:validate-artifacts`
- `core:get-artifact-instruction`

Specs read via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon` (merged deltas). Graph freshness: `stale: false` (`specd project status --graph`). Navigation via `specd graph search` / file impact on use-case classes. No code or spec files were modified.

## Shared contract (this change)

Hop consumers (`GetStatus` active path, `TransitionChange`, `ArchiveChange`): matching predicate `execute`, then engine/project from those `CheckResult`s. No global snapshot bag (`gatherPredicateSnapshots` MUST NOT exist — confirmed in `packages/core/test/domain/services/transition-checks.spec.ts`).

DAG-only consumers (`ValidateArtifacts`, `GetArtifactInstruction`, `GetStatus` drafts): `LifecycleEngine.evaluate(..., { checksByTarget: {} })` / `projectArtifacts`. MUST NOT run hop predicates (`executeChecksByLegalTargets`).

Use-case constructors MUST inject application `create*` bindings. MUST NOT default to domain stub `TRANSITION_BINDINGS`.

`skipHookPhases` skips **effects only**. Skip matching uses binding `phase` **and** skip selectors, not `check.id === 'hook.pre'|'hook.post'` in the use-case loop.

`archive.publication` is **not** a `CheckId`. Remaining merge/publish preflight stays inside `ArchiveChange`.

`CheckId` (`packages/core/src/domain/services/transition-checks.ts:19-33`) is: `protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `hook.pre`, `hook.post`. No `archive.publication`.

---

## Per spec

### core:get-status

#### Requirements summary

Read-only status projection. Resolve `ChangeRepository.get` then `getDraft` (never `getDiscarded`). Optional `ifModifiedSince` 304 short-circuit (no refresh, empty `artifactStatuses`). Optional pre-read `RefreshImplementationTracking` on active changes. Active full path: DAG `projectArtifacts`, then matching **predicates** for each protocol-legal target (`executeChecksByLegalTargets`), then `LifecycleEngine.evaluate` with those results. Paint `taskCompletion` from `workflow.taskCompletion` details (`CountTasks` inside that check only). Blockers merge review codes plus failed predicates (`INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`, `IMPLEMENTATION_STATE` bypass only for `impl.linksInScope`). Schema miss degrades lifecycle fields without throwing. Drafts: inspection-only (`availableTransitions` empty); SHOULD DAG-project effective status via `evaluate` with empty `checksByTarget`. Constructor: no sibling `CountTasks`. Factory: `resolveGetStatusDeps` includes `transitionBindings` from `resolveWorkflowCheckRegistry`.

#### Implementation status

**Aligned on the hop path.**

- Class: `packages/core/src/application/use-cases/get-status.ts` (`GetStatus` ~L278). Constructor requires `transitionBindings: readonly CheckBinding[]` — no default `TRANSITION_BINDINGS`.
- Active: `projectArtifacts` → `executeChecksByLegalTargets` → `lifecycle.evaluate(..., { checksByTarget })` (`get-status.ts` ~L438–451).
- Factory: `packages/core/src/composition/use-cases/get-status.ts` `resolveGetStatusDeps` pulls `registry.transitionBindings`.
- Draft: `_buildDraftedResult` uses `projectArtifacts` (same DAG cascade as empty `checksByTarget` evaluate) and sets `checksByTarget: {}`, empty transitions (`get-status.ts` ~L585–641). Does **not** call `evaluate`.
- Schema catch wraps only `SchemaProvider.get()`; check `execute` is outside that catch.
- `_mergeBlockers`: `impl.filesResolved` does not advertise `--allow-out-of-scope`; `impl.linksInScope` does; failed predicates carry `label` / `checkId`.

#### Discrepancies

1. **Low — draft SHOULD `evaluate` with empty `checksByTarget` (spec-loose vs code).** Merged **Drafted change read-only status**: SHOULD use `LifecycleEngine.evaluate` with empty `checksByTarget` so parent-review cascade appears. Code calls `projectArtifacts` only. If `evaluate` ≡ `projectArtifacts` plus hop projection (skipped when `{}`), cascade is equivalent. **Spec-wrong if SHOULD was meant as MUST; code-wrong only if `evaluate` adds DAG rules `projectArtifacts` lacks.** Evidence: `_buildDraftedResult`; test `projects read-only views with empty transitions for drafted changes` does not assert `pending-parent-artifact-review`.

2. **Low — verify factory scenario lagged (spec-wrong).** Merged spec.md factory lists `transitionBindings`. Merged verify **createGetStatus config form…** still enumerates deps without `transitionBindings`. Code + `packages/core/test/composition/use-cases/get-status.spec.ts` require `transitionBindings`.

3. **Low — test name “gathers CountTasks” (tests-wrong).** `get-status.spec.ts` `it('gathers CountTasks before LifecycleEngine.evaluate')` asserts execute-then-evaluate order and `checksByTarget` defined. Spec forbids a global snapshot bag. Behaviour matches; wording contradicts the change vocabulary.

No contradiction between the **active** GetStatus path and `core:lifecycle-engine` / `core:transition-checks` (predicates then project; engine I/O-free).

#### Test coverage

Covered: not found; refresh default/skip/draft; `ifModifiedSince`; schema-provider degradation; CountTasks inside check before evaluate; incomplete tasks omit `verifying` + `INCOMPLETE_TASKS`; impl bypass split; deps gerund label; cascade effectiveStatus (active); displayStatus; review blockers; composition `createGetStatus`.

Missing / weak:

- Verify **Enter-ready deps check omits ready when extract mismatches**: failing `deps.consistent` asserts blocker shape only, not `ready` absent from `availableTransitions`.
- Verify **Drafted status DAG-projects effective status** (`pending-parent-artifact-review`).
- Verify **Status exposes check rows** / `effect` rows not required for `allowed` (implied by predicates-only execute; not named).
- `taskCompletion` omitted for missing/empty artifact files (painting trusts check details).

#### Counts

- Requirements reviewed: 17
- Implemented as specified: 16
- Discrepancies: 3 (0 high, 0 medium, 3 low)
- Missing/weak tests: 4
- Spec-wrong: 1 (verify factory list) + test naming
- Code-wrong: 0 (draft SHOULD only)
- Both: 0

---

### core:transition-change

#### Requirements summary

Persist the **requested** target (no rewrite to pending-approval). Matching **predicates** `execute` for the classified attempt; map first fail to existing typed errors; do not re-walk requires/tasks after a green execute. Matching **effects** (`before-persist`: source.post only when `along=forward`, then target.pre) via `check.execute` (`RunStepHooks` inside hook checks). `skipHookPhases` skips effects only; skip by binding phase **and** selector, not use-case `check.id` switch. Redesign invalidates; skill-aligned backward hops clear signoff only and skip source.post. Recovery `archiving → archivable` skips archivable requires/hooks. Schema miss MUST throw (merged Constraints). Constructor / factory inject `transitionBindings` from registry; MUST NOT default to `TRANSITION_BINDINGS`; MUST NOT take `RunStepHooks` / `CountTasks` as use-case ports. Input MAY include `allowOutOfScope`.

#### Implementation status

**Hop path implemented and aligned with merged Constraints.**

- `packages/core/src/application/use-cases/transition-change.ts`: `executeMatchingPredicates` then `lifecycle.evaluate` with `{ [requestedTarget]: evaluation.checks }` (`~L189–209`). Effects: `matchingEffects(..., 'before-persist', along)` then `executeCheckWithProgress` (`~L238–245`). No `check.id` switch to launch hooks.
- Constructor requires `transitionBindings` with **no default** (`~L129–137`). Graph: `TRANSITION_BINDINGS` is only defined in `check-bindings.ts` and used from domain tests / `matching-effects.spec.ts`, not this use case.
- Factory: `resolveTransitionChangeDeps` → `registry.transitionBindings`; type guard requires `transitionBindings` (`packages/core/src/composition/use-cases/transition-change.ts`).
- Schema: `await this._schemaProvider.get()` with no catch — throws (matches merged Constraints: schema miss is not a silent skip).
- `skipHookPhases` forwarded on effect (and also on predicate ctx). Actual skip lives in `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts` ~L133–149): `all` / `target.pre` / `source.post`. Predicates ignore those selectors (tested: incomplete tasks still fail when skip is `all`).

#### Discrepancies

1. **Low — skip is check `_phase` + selector, not `binding.phase` alone (spec-wrong if read strictly; code-correct for transitions).** Merged post-hook requirement: skip MUST use binding `phase` (and skip selector), not `check.id` in the use-case loop. Use-case loop is phase-based (`matchingEffects` filters `binding.phase === 'before-persist'`). Both `hook.post` and `hook.pre` are `before-persist` on transitions (`TRANSITION_BINDING_SPECS`), so **binding.phase cannot distinguish source.post vs target.pre**. Hook check skip uses `_phase` (`pre`/`post`) plus selectors. That is equivalent to check identity of the two effect rows, not to `binding.phase`. **Both:** spec over-states “phase”; product needs the skip selector. Use-case does not `if (check.id === 'hook.pre')`.

2. **Low — `source.pre` / `target.post` selectors are no-ops (spec-wrong / incomplete Input).** `HookPhaseSelector` includes `'source.pre' | 'target.post'`. No transition effect is `after-persist`; hook skip does not read those tokens. Callers can pass them with no effect.

3. **Low — `skipHookPhases` also passed into predicate `execute` context (code-loose).** Spec: skip effects only. Predicates still run; extra field is unused by predicate checks. Tests lock “skip all still fails tasks”.

Purpose/JSDoc now match Constraints (hooks via matching effect `execute`). Factory/verify `RunStepHooks` on the use case from the **previous** audit is **resolved** in merged spec.md.

#### Test coverage

Strong: approval stays in ready/done; drain pending hops; task gating / missing-task-capability / progress; requires + skipped optional; skipHookPhases `all` / `target.pre` / `source.post`; hook order post→pre→transitioned; redesign skips source.post; archiving→archivable; CountTasks not twice after green evaluate; skill hop signoff; composition factory.

Missing / weak:

- Explicit assertion that skip matching is independent of `check.id` in the use-case (covered indirectly by `matchingEffects` tests).
- `source.pre` / `target.post` documented as unused (none).

#### Counts

- Requirements reviewed: 18
- Implemented as specified: 16
- Discrepancies: 3 (0 high, 0 medium, 3 low)
- Missing/weak tests: 2
- Spec-wrong: 2 (phase-only skip wording; unused selectors)
- Code-wrong: 0
- Both: 1 (phase vs selector for dual before-persist effects)

---

### core:archive-change

#### Requirements summary

Operation `archive` is **not** a lifecycle hop. Predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent` (same runners as enter-ready), `impl.filesResolved` / `impl.linksInScope` (same as forward exit-implementing). Remaining publication preflight stays **inside** ArchiveChange; MUST NOT register `archive.publication`. Effects: `matchingEffects` `before-persist` then `after-persist`; skip when `'all'`/`'pre'`/`'post'` in `skipHookPhases`; skip by binding phase not `check.id`. `--skip-hooks` skips effects only.

#### Implementation status

**Named archive predicates and phase-selected effects are implemented.**

- `executeMatchingPredicates(this._archiveBindings, archiveAttempt)` then fail mapping (`archive-change.ts` ~L388–409).
- Effects: `matchingEffects(..., 'before-persist')` / after-persist slot (~L419–445, ~L639). `skipHookPhases` passed into check ctx; skip in `HookEffectCheck` for archive `pre`/`post`/`all`.
- `ARCHIVE_BINDING_SPECS` comment: “Publication is not a check.” IDs listed above; test `expect(ARCHIVE_BINDINGS.map(...).join(',')).not.toContain('archive.publication')`.
- Default bindings: `defaultArchiveBindings` → `createWorkflowCheckRegistry(...).archiveBindings` (application `create*`), **not** domain `ARCHIVE_BINDINGS` / `TRANSITION_BINDINGS` stubs. Optional constructor arg `archiveBindings`; factory sets `archiveBindings: registry.archiveBindings`.
- `_runStepHooks` is stored on the class (`~L325`) and **never read** after construction (only used to build default registry). Composition `ArchiveChangeDeps` still requires `runStepHooks`.

#### Discrepancies

1. **Medium — leftover `RunStepHooks` use-case port (both).** Merged archive deltas compose `RunStepHooks` into `createHookPre` / `createHookPost`. `TransitionChange` Constraints forbid it as a use-case port. Archive still **requires** `RunStepHooks` on the constructor/factory even when `archiveBindings` is injected (field unused). **Spec-wrong** if archive constructor was never updated to match transition; **code-wrong** if the unused port should have been removed once bindings are required.

2. **Low — debug log always `skipped: false` (code-wrong, non-behavioural).** before-persist loop logs `skipped: false` even when the check will skip inside `execute`.

3. **Low — archive skip uses effect `_phase`, which maps 1:1 to archive `binding.phase` (aligned).** `hook.pre` → `before-persist`, `hook.post` → `after-persist`. Spec “not `check.id`” is satisfied at the use-case loop (`matchingEffects` by phase).

#### Test coverage

Covered: skip `all` / `pre` / `post`; overlap allow; archivable guard; publication errors as ArchiveChange throws. Domain: `archive.publication` absent from `CheckId` / bindings.

Missing / weak:

- Verify **before-persist slot does not hardcode hook.pre** (no archive-change unit asserting `matchingEffects` vs `check.id` filter). Nearby: `matching-effects.spec.ts` covers archive before/after persist.
- Verify **publication preflight stays in ArchiveChange** as “not a registered check” (indirect: no CheckId; prepare path still throws `ArchivePreflightError`).
- Shared-runner scenarios (enter-ready readOnly / exit-implementing impl) live more naturally in transition/status tests than archive-change.spec.

#### Counts

- Requirements reviewed (delta + constructor/hooks/guards): 14
- Implemented as specified: 12
- Discrepancies: 3 (0 high, 1 medium, 2 low)
- Missing/weak tests: 3
- Spec-wrong: 0–1 (constructor still listing RunStepHooks)
- Code-wrong: 1 (unused `_runStepHooks`)
- Both: 1 (RunStepHooks leftover)

---

### core:validate-artifacts

#### Requirements summary

Existing chokepoint to mark artifacts complete (schema guard, required set, topo order, rules, persist). **This change:** when DAG-aware status is needed, `evaluate` with **empty** `checksByTarget`; MUST NOT run hop predicates; MUST NOT gather a snapshot bag.

#### Implementation status

**DAG-only path matches the merged delta.**

- `packages/core/src/application/use-cases/validate-artifacts.ts` ~L224–226: `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })`. No `CheckBinding` constructor port. No `executeChecksByLegalTargets`.
- Factory `resolveValidateArtifactsDeps` has no transition bindings (`packages/core/src/composition/use-cases/validate-artifacts.ts`).
- Completions: in-memory `markVerdictComplete` + single `mutate` at end (pre-existing vs any “recompute after each persist” wording in the **base** spec, not this delta).

#### Discrepancies

1. **Medium — constructor `specs: ReadonlyMap` vs `ListWorkspaces` (spec-wrong vs long-standing code).** Spec constructor snippet still shows a spec-repo map. Code: `ListWorkspaces` then `listWorkspaces.execute()`. Tests construct with `makeListWorkspaces`. Not introduced solely by this change.

2. **None vs this change’s hop/DAG split.** Empty `checksByTarget` is the specified DAG-only contract (prior audit that demanded hop `execute` is **obsolete** after the delta “MUST NOT run hop predicates”).

#### Test coverage

Large existing suite for rules, deltas, drift, missing files, cross-artifact.

**Zero** tests for verify **ValidateArtifacts uses empty checksByTarget** (no spy that `evaluate` received `{}` / hop execute not called).

No composition test asserting the new negative (no bindings).

#### Counts

- Requirements reviewed: 21 (full spec; this change adds 1)
- New DAG-empty-checks requirement: implemented
- Pre-existing validation behaviour: largely implemented
- Discrepancies: 1 (0 high, 1 medium, 0 low) for this change’s additions; +1 pre-existing constructor
- Missing tests (this change): 1
- Spec-wrong: 1 (constructor Map)
- Code-wrong: 0 vs new requirement
- Both: 0

---

### core:get-artifact-instruction

#### Requirements summary

Read-only instruction payload: change lookup, schema name guard, artifact resolution, template expansion with `change.name` / `change.path` only. Omitted `artifactId` uses engine `nextArtifact`. **This change:** `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates (not GetStatus’s path); MUST NOT gather a snapshot bag. Constraints updated to allow DAG `nextArtifact` / effective status from empty evaluate.

#### Implementation status

**DAG-only path matches the merged delta.**

- `packages/core/src/application/use-cases/get-artifact-instruction.ts` ~L102–106: `evaluate(change, schema, { checksByTarget: {} })` then `input.artifactId ?? lifecycle.nextArtifact`.
- No bindings, no hop execute.
- Constructor default `lifecycle: LifecycleEngine = new LifecycleEngine(...)` if omitted.
- Factory: `templateExpander` field (`GetArtifactInstructionDeps`); spec lists `templates: TemplateExpander`.

#### Discrepancies

1. **Low — factory naming `templates` vs `templateExpander` (spec-wrong).** Wiring is otherwise correct (`resolveGetArtifactInstructionDeps`).

2. **Low — default `LifecycleEngine` in constructor (code-loose).** Spec lists `LifecycleEngine` as a constructor argument; default engine is extra convenience. Composition always injects resolver engine.

3. **None vs hop predicates.** Empty `checksByTarget` is **required**, not a gap (prior audit that treated this as missing hop execute is **obsolete**).

#### Test coverage

Covered: not found, schema mismatch, unknown artifact, rules/instruction/delta, outlines skip missing, template vars without workspace, auto-select first incomplete in topo order, all-complete throws `ArtifactNotFoundError`.

Missing (verify):

- **GetArtifactInstruction uses empty checksByTarget** / does not run hop predicates (no spy).
- **Omitted artifactId ignores persisted complete when engine reports `pending-parent-artifact-review`**.
- Composition `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps`.

#### Counts

- Requirements reviewed: 11
- Implemented as specified: 10
- Discrepancies: 2 (0 high, 0 medium, 2 low)
- Missing tests: 3
- Spec-wrong: 1 (`templates`)
- Code-wrong: 0 vs new requirement
- Both: 0

---

## Cross-cutting checklist

| Check                                              | Result                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hop consumers execute then evaluate                | **Pass:** GetStatus active (`executeChecksByLegalTargets` then `evaluate`); TransitionChange (`executeMatchingPredicates` then `evaluate`); ArchiveChange (`executeMatchingPredicates` then phase effects; archive is not a hop evaluate).       |
| DAG-only consumers `checksByTarget: {}`            | **Pass:** ValidateArtifacts, GetArtifactInstruction; GetStatus draft/unchanged use `{}` (draft uses `projectArtifacts` instead of `evaluate`).                                                                                                   |
| No default `TRANSITION_BINDINGS` stub on use cases | **Pass:** GetStatus / TransitionChange require injected bindings. Archive defaults to `createWorkflowCheckRegistry` application bindings, not `TRANSITION_BINDINGS`. Domain stub exists for matcher tests only.                                  |
| `skipHookPhases` by binding phase                  | **Mostly pass:** use-case loops select effects via `matchingEffects(..., phase)`. Granular skip is check `_phase` + selector (`target.pre` / `source.post` / archive `pre`/`post`), because both transition hook effects share `before-persist`. |
| `archive.publication` is not a CheckId             | **Pass:** absent from `CheckId`, `CHECK_LABELS`, `ARCHIVE_BINDING_SPECS`; domain test asserts absence; publication stays in `_prepareArchivePlan`.                                                                                               |

`gatherPredicateSnapshots` does not exist.

---

## Batch totals

| Spec                          | Reqs reviewed | Discrepancies |  High | Medium |    Low | Missing tests |
| ----------------------------- | ------------: | ------------: | ----: | -----: | -----: | ------------: |
| core:get-status               |            17 |             3 |     0 |      0 |      3 |             4 |
| core:transition-change        |            18 |             3 |     0 |      0 |      3 |             2 |
| core:archive-change           |            14 |             3 |     0 |      1 |      2 |             3 |
| core:validate-artifacts       |            21 |             1 |     0 |      1 |      0 |             1 |
| core:get-artifact-instruction |            11 |             2 |     0 |      0 |      2 |             3 |
| **Batch**                     |        **81** |        **12** | **0** |  **2** | **10** |        **13** |

Interpretation vs 20260826-183525 `_partial-use-cases.md`: the previous “high: validate/instruction missing hop execute” findings are **invalid against current merged specs**. Those use cases are specified as DAG-only. Remaining medium issues: unused ArchiveChange `RunStepHooks` port; ValidateArtifacts constructor Map vs `ListWorkspaces`.
