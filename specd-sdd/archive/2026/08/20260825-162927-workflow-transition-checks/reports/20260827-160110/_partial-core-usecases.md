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
