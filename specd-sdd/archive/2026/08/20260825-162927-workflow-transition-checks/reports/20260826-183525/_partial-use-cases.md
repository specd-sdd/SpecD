# Batch: use-cases

Audit of specd change `workflow-transition-checks` against implementation and tests. Specs read via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`. Navigation via `specd graph` (`stale: false`). Compared against `core:lifecycle-engine` and `core:transition-checks` (change deltas + new spec). No code or spec files were modified.

Shared contradiction used below (`core:lifecycle-engine` / `core:transition-checks`):

- Use cases that need DAG-aware answers MUST call matching predicate `execute`, then `LifecycleEngine.evaluate` with those `CheckResult`s.
- There MUST be no global snapshot bag (`gatherPredicateSnapshots` MUST NOT exist). Confirmed absent in domain (`packages/core/test/domain/services/transition-checks.spec.ts` asserts `'gatherPredicateSnapshots' in mod` is false).
- Engine MUST remain I/O-free and MUST NOT fall back to `check.run` when `checksByTarget` is missing. Empty `checksByTarget` currently skips availability projection (`continue` when injected results are undefined) but still computes `projectArtifacts` / `nextArtifact`.

---

## Per spec

### core:get-status

- Requirements summary

  `GetStatus` is a read-only status projection: resolve active change then draft (`get` / `getDraft`, never discarded), optional `ifModifiedSince` 304-style short-circuit, optional pre-read `RefreshImplementationTracking`, DAG-aware artifact statuses plus display/drift, task counts painted from `workflow.taskCompletion` (CountTasks inside that check, not a sibling constructor port), and lifecycle guidance (`availableTransitions`, `nextAction`, blockers, check rows) projected by `LifecycleEngine` from per-legal-target predicate `execute`. Schema resolution failure MUST degrade lifecycle fields without throwing. Drafts MUST be inspection-only (empty `availableTransitions`, no mutable `Change`).

- Implementation status

  **Mostly implemented and aligned with this change.**
  - `packages/core/src/application/use-cases/get-status.ts`: constructor is `ChangeRepository`, `SchemaProvider`, approvals, `RefreshImplementationTracking`, `LifecycleEngine`, `CheckBinding[]`. No `CountTasks` sibling.
  - Full path: `projectArtifacts` → `executeChecksByLegalTargets` (predicates only) → `lifecycle.evaluate(..., { checksByTarget })` → paint `taskCompletion` from `workflow.taskCompletion` details (`taskCompletionFromChecks`).
  - Short-circuit and draft paths skip refresh and skip full check evaluation as specified.
  - Blocker merge: `impl.filesResolved` does not advertise `--allow-out-of-scope`; `impl.linksInScope` does; failed checks carry `label` / `checkId`.
  - Factory: `resolveGetStatusDeps` pulls `transitionBindings` from `resolveWorkflowCheckRegistry` (`packages/core/src/composition/use-cases/get-status.ts`).

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **Medium — draft effective status is not DAG-projected (code-wrong, spec slightly loose).** Spec: drafted status MUST compute artifact/lifecycle projections for inspection and MAY use an internal `Change` for effective status. Code `_buildDraftedResult` copies persisted `artifact.status` as `effectiveStatus` and never calls `projectArtifacts` / predicate `execute`. Cascade (`pending-parent-artifact-review`) will not appear on drafts. Evidence: `get-status.ts` `_buildDraftedResult`; test `projects read-only views with empty transitions for drafted changes` does not assert cascade.

  2. **Low — factory bullet list vs deps shape (spec-wrong / incomplete).** Spec `resolveGetStatusDeps` lists composed `create*` checks in prose but does not name `transitionBindings`. Code’s `GetStatusDeps` requires `transitionBindings: readonly CheckBinding[]`. Behaviour matches Constraints; the factory requirement text lagged the ABI.

  3. **Low — leftover “gather” language in tests (tests-wrong, not product).** `get-status.spec.ts` still has `it('gathers CountTasks before LifecycleEngine.evaluate')`. Implementation order is check `execute` then `evaluate` (compliant). Spec forbids a global snapshot bag; the test name contradicts the spec wording while asserting the correct call order.

  No contradiction found between GetStatus **active** path and `core:lifecycle-engine` / `core:transition-checks` (predicates then project; no snapshot bag; engine I/O-free).

- Test coverage / missing tests

  Covered: not found; refresh default/skip/draft; `ifModifiedSince`; schema-provider failure; task painting via CountTasks inside checks; incomplete tasks omit `verifying` + `INCOMPLETE_TASKS`; impl bypass split; deps gerund label; cascade effectiveStatus (active); displayStatus; review blockers; factory `createGetStatus`.

  Missing or weak:
  - Verify scenario **Enter-ready deps check omits ready when extract mismatches**: tests inject a failing `deps.consistent` for blocker shape only; they do not assert `ready` absent from `availableTransitions` after a real extract/persist mismatch.
  - Draft DAG cascade / `pending-parent-artifact-review`.
  - Explicit assertion that `effect` rows are absent from status `allowed` (predicates-only `executeChecksByLegalTargets` implies this; no test names it).
  - `taskCompletion` omitted for missing/empty artifact files (spec MUST omit; painting trusts check details).

- Counts
  - Requirements reviewed: 16
  - Implemented as specified: 14
  - Discrepancies: 3 (1 medium, 2 low)
  - Missing/weak tests: 4
  - Spec-wrong: 1 (factory wording) + test naming
  - Code-wrong: 1 (draft effective status)
  - Both: 0

---

### core:transition-change

- Requirements summary

  `TransitionChange` persists the **requested** target (no rewrite to pending-approval states). Approval is `approval.spec` / `approval.signoff`. Matching **predicates** `execute` for the classified attempt; map the first fail to existing typed errors; do not re-walk requires/tasks after a green execute. Then matching **effects** (`before-persist`: source.post only when `along=forward`, then target.pre) via check `execute` (RunStepHooks inside hook checks, not a use-case port). Redesign invalidates; skill-aligned backward hops clear signoff only and skip source.post. Recovery `archiving → archivable` skips archivable requires/hooks. Optional refresh before evaluation. `skipHookPhases` skips effects only. Schema/missing workflow step: skip requires/hooks. Persistence via `ChangeRepository.mutate`.

- Implementation status

  **Core transition/check path implemented; factory/docs and schema-failure behaviour diverge.**
  - `packages/core/src/application/use-cases/transition-change.ts`: `executeMatchingPredicates` + `lifecycle.evaluate` with `{ [requestedTarget]: evaluation.checks }`; fail mapping for protocol/requires/tasks/approval/deps/readOnly/impl; effects via `matchingEffects` + `executeCheckWithProgress`; redesign `invalidate`; skill hop `invalidateSignoff`; drain/gate assertions; `allowOutOfScope` on input.
  - Constructor: repository, actor, schema, refresh, approvals, engine, `transitionBindings` (default `TRANSITION_BINDINGS`). No `RunStepHooks`.
  - Factory: `resolveTransitionChangeDeps` matches Constraints (`transitionBindings` from registry), not the stale factory requirement that still lists `runStepHooks`.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — factory / verify still require `RunStepHooks` on the use case (spec-wrong).** Spec Constraints and `core:transition-checks` say `RunStepHooks` is composed into `createHookPre` / `createHookPost`; use-case constructor MUST inject bindings. Previewed **Config-based factory** requirement and verify scenario **TransitionChange depends on LifecycleEngine and RunStepHooks** still list `runStepHooks: RunStepHooks` on `resolveTransitionChangeDeps`. Code + composition tests use `transitionBindings` only (`packages/core/src/composition/use-cases/transition-change.ts`, `test/composition/use-cases/transition-change.spec.ts`). **Align factory/verify with Constraints.**

  2. **Medium — schema resolution failure (code-wrong vs spec; tests lock the code).** Spec: if schema cannot be resolved, requires and hooks are skipped. Code: `await this._schemaProvider.get()` with no catch — throws. Test `throws when schema cannot be resolved` documents throw. `GetStatus` degrades; `TransitionChange` does not. **both** if the intended product is fail-fast (then spec is wrong); as written, spec wants skip and code throws.

  3. **Low — `allowOutOfScope` (spec-wrong / incomplete Input contract).** Constraints: input MAY include `allowOutOfScope` for `impl.linksInScope`. Requirement **Input contract** lists name/to/skipHookPhases/refresh only. Code has `allowOutOfScope?: boolean` on `TransitionChangeInput`.

  4. **Low — Purpose text still says the use case “owns hook execution”** while hooks run only through matching effect `execute`. Constraints are the binding source of truth. Stale purpose vs code (**spec-wrong**).

  Alignment with `core:lifecycle-engine`: no pending-target rewrite; requested target is persist target; predicates then map errors without a second requires algorithm. `evaluate` is used for artifact verdicts / logging; gate is `evaluation.allowed` from predicate execute — compliant.

- Test coverage / missing tests

  Strong: approval-required stays in ready/done; drain pending hops; task gating / missing-task-capability / progress events; requires + skipped optional; skipHookPhases; hook order post→pre→transitioned; redesign vs drafting/designing; archiving→archivable without archive hooks; CountTasks not called twice after green evaluate; skipHookPhases does not skip predicates; redesign skips source.post; done→implementing clears signoff without downgrading artifacts.

  Missing:
  - Verify **source.post skipped on backward hop** (`done`/`signed-off`/`archivable` → `implementing`/`verifying`): no assertion that `hook.post` / `RunStepHooks` is not called (only redesign skip is tested).
  - Factory verify still expects `runStepHooks` on deps (would fail if updated to match Constraints; current composition tests match code).
  - Graceful schema-miss skip (spec scenario vs throw test).

- Counts
  - Requirements reviewed: 18
  - Implemented as specified (Constraints + check model): 15
  - Discrepancies: 4 (1 high, 1 medium, 2 low)
  - Missing/weak tests: 3
  - Spec-wrong: 3 (factory/verify RunStepHooks, Input omit allowOutOfScope, purpose)
  - Code-wrong: 1 (schema get throw) — optionally **both** if fail-fast is intended
  - Both: 1 (schema failure, if counting dual lock-in)

---

### core:validate-artifacts

- Requirements summary

  Single chokepoint to mark artifacts complete: schema name guard, required-artifact set (skipped when `artifactId` set), DAG dependency order via `LifecycleEngine`, topological traversal, complete/skipped bypass, approval/signoff drift invalidation, expected paths, delta/no-op, structural and cross-artifact rules, metadata extraction, persist completions. **This change adds:** when DAG-aware status is needed, call matching workflow predicate `execute` then `evaluate` with those results; MUST NOT gather a snapshot bag. Also: recompute lifecycle interpretation after each persisted completion in a multi-artifact `execute`.

- Implementation status

  **Validation engine implemented; new transition-check wiring is not.**
  - `packages/core/src/application/use-cases/validate-artifacts.ts`: `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })` then local `artifactVerdicts` / `markVerdictComplete`. No `executeMatchingPredicates` / `executeChecksByLegalTargets`. No `CheckBinding` constructor port.
  - Constructor uses `ListWorkspaces` (not `ReadonlyMap<string, SpecRepository>` as in spec snippet), plus hasher, extractor transforms, workspace routes, engine.
  - Completions and invalidation persist in **one** `mutate` at the end; in-pass dependents see `markVerdictComplete`, not a re-`evaluate` after persist.
  - `gatherPredicateSnapshots` is not called (compliant with the negative). The **positive** “matching predicates execute” is missing.
  - Factory `resolveValidateArtifactsDeps` does not inject transition bindings.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — no predicate `execute` before `evaluate` (code-wrong vs this change and `core:lifecycle-engine` “Shared lifecycle interpretation”).** Spec: MUST call matching workflow predicates’ `execute` then `evaluate` with those `CheckResult`s. Code always passes `{}`. Engine then skips availability for every target (`injected === undefined`). DAG `projectArtifacts` still runs, so dependency-blocked validation mostly still works **without** checks. That satisfies older “interpret through LifecycleEngine” but **not** the change’s “same path as GetStatus”.

     **both (design overreach):** ValidateArtifacts has no transition `attempt`. The change spec does not say which targets to execute (all legal hops vs none). Running full `executeChecksByLegalTargets` would add CountTasks/deps/impl I/O on every validate. Spec may be over-applying the GetStatus pipeline; code under-implements the letter of the new requirement.

  2. **Medium — constructor ports (spec-wrong vs long-standing code).** Spec constructor: `specs: ReadonlyMap<string, SpecRepository>`. Code: `ListWorkspaces` then `listWorkspaces.execute()` for repos. Tests construct with `makeListWorkspaces`. Not introduced solely by this change, but still a spec/code split.

  3. **Medium — “recompute after each persisted completion” (code-wrong if literal; both if in-memory mark is accepted).** Spec MUST recompute lifecycle after each persist so later artifacts in the same `execute` see parents completed. Code mutates an in-memory verdict map and persists once. Topological order + `markVerdictComplete` can satisfy same-pass dependents without re-`evaluate`. It does **not** re-run predicate execute or persist between artifacts.

  4. **Contradiction with `core:transition-checks`:** “GetStatus, TransitionChange, ArchiveChange, ValidateArtifacts, and GetArtifactInstruction MUST NOT gather a global snapshot” — ValidateArtifacts complies (no gather). The same family of specs also require predicate execute; only the gather half is met.

- Test coverage / missing tests

  Large existing suite for rules, deltas, drift, missing files, cross-artifact, etc. **Zero** tests for:
  - Verify **ValidateArtifacts does not gather PredicateSnapshots** / matching predicates execute (no `checksByTarget`, no spy on check `execute`).
  - Re-evaluate after mid-pass persist.
  - Composition `createValidateArtifacts` / `resolveValidateArtifactsDeps` in `packages/core/test/composition` (not found).

- Counts
  - Requirements reviewed: 20+ (full validate spec; this change adds 1)
  - New check-pipeline requirement: not implemented
  - Pre-existing validation behaviour: largely implemented
  - Discrepancies: 3 (1 high, 2 medium)
  - Missing tests (this change): 3
  - Spec-wrong: 1 (constructor Map vs ListWorkspaces) + possible overreach on predicate execute
  - Code-wrong: 2 (no predicate execute; persist/recompute wording)
  - Both: 1 (whether validate should run transition predicates at all)

---

### core:get-artifact-instruction

- Requirements summary

  Read-only instruction payload: change lookup, schema name guard, artifact resolution, template expansion with `change.name` / `change.path` only, rules pre/instruction/template/delta outlines/rules post. Omitted `artifactId` uses `LifecycleEngine.nextArtifact` (first DAG node whose deps are complete/skipped and which is not itself complete/skipped). **This change:** MUST use engine **after matching predicates `execute` (same path as GetStatus)**; MUST NOT gather a snapshot bag. Factory via `resolveGetArtifactInstructionDeps`.

- Implementation status

  **Instruction resolution implemented; new check pipeline is not.**
  - `packages/core/src/application/use-cases/get-artifact-instruction.ts`: `evaluate(change, schema, { checksByTarget: {} })` then `input.artifactId ?? lifecycle.nextArtifact`. No bindings, no predicate execute.
  - `nextArtifact` still works because `_nextArtifact` uses `projectArtifacts` inside `evaluate`, independent of checks.
  - Constructor default `new LifecycleEngine(...)` if omitted.
  - Factory deps field is `templateExpander` (spec says `templates`).
  - No `packages/core/test/composition` coverage for this factory.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — empty `checksByTarget`, no matching predicate `execute` (code-wrong vs new requirement and `core:lifecycle-engine` shared consumers).** Same pattern as ValidateArtifacts. Auto-select still DAG-correct today because `nextArtifact` does not need transition checks. Spec explicitly demands GetStatus’s path.

  2. **Medium — internal spec contradiction (spec-wrong).** Constraints: “The use case does not evaluate step availability or artifact status.” New requirement: MUST use engine after predicate execute for next/readiness. Constraints were not updated when the delta was added.

  3. **Low — factory naming (spec-wrong).** Spec: `templates: TemplateExpander`. Code: `templateExpander` on `GetArtifactInstructionDeps`. Wiring is otherwise correct.

  4. **both (same design question as ValidateArtifacts):** omitted-`artifactId` only needs DAG effective status (`projectArtifacts`). Forcing full legal-target predicate I/O is not required for instruction text. Spec and lifecycle-engine over-couple this use case to transition evaluation.

- Test coverage / missing tests

  Covered: not found, schema mismatch, unknown artifact, rules/instruction/delta, outlines skip missing, template vars without workspace, auto-select first incomplete in topo order, all-complete throws `ArtifactNotFoundError`.

  Missing (verify scenarios):
  - **Omitted artifactId ignores persisted complete when engine reports `pending-parent-artifact-review`** — no test.
  - **GetArtifactInstruction does not gather PredicateSnapshots** / uses matching predicate execute — no test (and code would fail a strict execute assertion).
  - `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps` composition tests.

- Counts
  - Requirements reviewed: 10
  - Implemented as specified (pre-change instruction behaviour): 8
  - New check-pipeline requirement: not implemented
  - Discrepancies: 4 (1 high, 1 medium, 1 low, 1 both/design)
  - Missing tests: 3
  - Spec-wrong: 2 (constraints vs new req; `templates` vs `templateExpander`)
  - Code-wrong: 1 (no predicate execute)
  - Both: 1 (whether instruction needs transition predicates)

---

## Batch totals

| Spec                          | Reqs reviewed | Discrepancies |  High | Medium |   Low | Missing tests |
| ----------------------------- | ------------: | ------------: | ----: | -----: | ----: | ------------: |
| core:get-status               |            16 |             3 |     0 |      1 |     2 |             4 |
| core:transition-change        |            18 |             4 |     1 |      1 |     2 |             3 |
| core:validate-artifacts       |            21 |             3 |     1 |      2 |     0 |             3 |
| core:get-artifact-instruction |            10 |             4 |     1 |      1 |     1 |             3 |
| **Batch**                     |        **65** |        **14** | **3** |  **5** | **5** |        **13** |

(Plus one **both/design** on validate + instruction sharing the “must execute transition predicates without a defined attempt” overreach.)

### Cross-cutting vs core:lifecycle-engine / core:transition-checks

| Consumer                      | Predicate `execute` then `evaluate` | Snapshot bag | Notes                                                         |
| ----------------------------- | ----------------------------------- | ------------ | ------------------------------------------------------------- |
| GetStatus (active)            | Yes (`executeChecksByLegalTargets`) | No           | Compliant                                                     |
| GetStatus (draft / unchanged) | No                                  | No           | Allowed by those paths’ own requirements                      |
| TransitionChange              | Yes (`executeMatchingPredicates`)   | No           | Compliant; factory/verify stale on RunStepHooks               |
| ValidateArtifacts             | No (`checksByTarget: {}`)           | No           | Violates shared-consumer MUST                                 |
| GetArtifactInstruction        | No (`checksByTarget: {}`)           | No           | Violates shared-consumer MUST; `nextArtifact` still DAG-based |

`gatherPredicateSnapshots` does not exist. The remaining gap is **empty `checksByTarget` on validate and instruction**, not a resurrected snapshot type.

### Suggested fix direction (audit only; not applied)

- Treat GetStatus as the reference application path for status/transition UX.
- Either implement a documented, minimal predicate execute for ValidateArtifacts / GetArtifactInstruction (and inject bindings via composition), **or** narrow `core:lifecycle-engine` / those two specs so DAG `projectArtifacts` / `nextArtifact` is enough without legal-target check I/O.
- Update TransitionChange factory + verify to `transitionBindings` / hook checks; decide schema-miss: throw vs skip; add `allowOutOfScope` to the Input contract.
- Add the listed missing tests, especially deps.consistent omitting `ready`, backward-hop skipped source.post, and parent-review auto-select.
