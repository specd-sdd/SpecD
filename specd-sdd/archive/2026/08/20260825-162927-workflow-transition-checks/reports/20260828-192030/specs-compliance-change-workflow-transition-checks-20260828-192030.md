# Spec compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260828-192030
- **Graph:** current (`lastIndexedAt` 2026-08-28T17:21:07Z)
- **Read-only audit.** Partial files remain in this directory for traceability.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide globals (depth 0):** conventions, testing, eslint, spec-layout, docs, error-handling-conventions

**Depth-1 deps:** checked for contradictions only (kernel, composition-resolver, count-tasks, run-step-hooks, compile-context, …)

## Executive findings (neither spec nor code is SoT)

### HIGH

1. **Domain imports application** — `packages/core/src/domain/services/lifecycle-engine.ts` imports `evaluateLifecycle` from application. Violates `default:_global/architecture` (Logger is the sole exception) and ESLint `no-restricted-imports`. **code-wrong** vs architecture; **spec-wrong** if `core:lifecycle-engine` still permits a domain shim.
2. **Overlap hop target** — `review.reason === 'spec-overlap-conflict'` keeps `nextHop.targetStep` on current `state`; spec hop matrix requires `designing`. Command is still `/specd-design`. **code-wrong**.
3. **Ctor/factory leftover `LifecycleEngine`** — GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction **code** uses functions; **preview specs/verify** still require injected `LifecycleEngine` / `createEvaluateLifecycle()`. **spec-wrong** (CODE WINS).

### MEDIUM

- DAG consumers call `evaluateLifecycle` (attaches `command`) instead of `evaluateLifecycleVerdict`.
- Domain `blockers` omit hop failures unless `requestedTarget` is set (GetStatus merges separately).
- `done`/`signed-off` command `/specd-verify` vs archive/signoff matrix tension.
- `hook.pre`/`hook.post` share `hook-effect.ts`.
- Committed `specs/cli/change-transition` still describes a CLI `--next` table; preview + code use `to: 'next'`.
- `schema-format` “requires must be complete” vs workflow-model/code `complete|skipped`.
- Conventions Spec Dependencies `_none` plus a list; eslint spec silent on Logger exception; possible ADR gap for ambient Logger.

### LOW

Stale verify names (`LifecycleEngine.evaluate`), CLI given/when/then titles, archive constraint “only archivable”, `log` vs `info` facade alias, schema catch-all, draft `nextAction` print, leftover `regenerateMetadata` in archive verify.

## Aggregate counts (sum of batches; requirements may overlap across batches)

| Batch              | Requirements | Discrepancies | Missing tests |
| ------------------ | -----------: | ------------: | ------------: |
| lifecycle-core     |           66 |            28 |            33 |
| archive-validate   |          105 |            19 |            16 |
| workflow-approvals |           87 |            13 |            21 |
| cli-skills         |           66 |            13 |             6 |
| globals            |           64 |            17 |            10 |
| **Sum**            |      **388** |        **90** |        **86** |

**Implementation:** no missing capability for the product model (checks, empty `checksByTarget` DAG, in-place approvals, CLI presenter). Gaps are layering (shim), hop target on overlap, and spec/verify lag.

**Focus pass on globals:** architecture preview has no `evaluateLifecycle` / core file paths; logging preview is generic ambient Logger.

## Batches

1. `_partial-lifecycle-core.md`
2. `_partial-archive-validate.md`
3. `_partial-workflow-approvals.md`
4. `_partial-cli-skills.md`
5. `_partial-globals.md`

---

# Detailed Findings

The following sections are the complete contents of each `_partial-*.md` file, verbatim.

---

## Partial: lifecycle-core

# Partial audit: lifecycle core (change `workflow-transition-checks`)

Mode: change. Graph freshness: 2026-08-28T17:21:07.186Z (`stale: false`). CLI: `node packages/cli/dist/index.js`. Specs read via `change spec-preview workflow-transition-checks <id>` (spec.md + verify.md).

Assigned specs: `core:lifecycle-engine`, `core:transition-checks`, `core:get-status`, `core:transition-change`.

Globals/deps checked (preview/show, depth 1): `default:_global/architecture`, `default:_global/logging`, `default:_global/testing`, `default:_global/conventions`, `core:change`, `core:workflow-model`, `core:schema-format`, `core:kernel`, `core:composition-resolver`, `core:count-tasks`, `core:run-step-hooks`, `core:hook-execution-model`, `core:refresh-implementation-tracking`.

Architecture observed (not assumed): domain `evaluateLifecycleVerdict` / `projectArtifacts` / `resolveLifecycleNextHop` in `packages/core/src/domain/services/lifecycle-verdict.ts`; application `evaluateLifecycle` in `lifecycle-evaluation.ts` attaching `nextAction.command` via `lifecycle-guidance.ts`; deprecated `LifecycleEngine` class still in domain `lifecycle-engine.ts` and **imports the application layer**.

---

## Spec: core:lifecycle-engine

### Requirements Summary

1. **Stateless domain lifecycle verdict** — plain functions in `lifecycle-verdict.ts` (`evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`); no ctor/debug port; `LifecycleDomainVerdict` has `nextHop` without `command`.
2. **Centralized validation logic** — sole domain authority; project caller-supplied `CheckResult`s; no `run:` effects, no snapshot bag, no `check.run` fallback.
3. **Effective artifact status computation** — DAG projection; mapping rules; no public `computeEffectiveStatus`.
4. **Canonical-state-only interpretation** — ignore display `complete-with-drift` / `hasDrift` as extra states.
5. **Machine-readable blockers** — codes, skippable/bypass, `affectedArtifacts`; no `MISSING_ARTIFACT`; no `warnings`; overlap from archive predicates only.
6. **Available steps and domain next hop** — `validTransitions` / `availableTransitions` / `availableSteps` / hop matrix; no approval rewrite of target.
7. **Application lifecycle guidance** — `lifecycle-guidance.ts` + `evaluateLifecycle`; commands not in domain.
8. **Archiving escape transitions** — `archivable`+`designing`; recovery skips requires; failed commit → designing.
9. **Review summary integration** — drift vs overlap vs review; overlap is review not `OVERLAP_CONFLICT`.
10. **Shared lifecycle interpretation** — GetStatus/TransitionChange/ValidateArtifacts/GetArtifactInstruction; CompileContext not a consumer; no `gatherPredicateSnapshots`.
11. **Next artifact topological order** — `schema.artifactDag().topologicalOrder()`; `null` when all complete/skipped.

### Implementation Status (implemented / partial / missing, with file:symbol evidence)

| Req                       | Status          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stateless domain verdict  | **partial**     | `lifecycle-verdict.ts:function:evaluateLifecycleVerdict:149` is a plain function; input `LifecycleVerdictInput` has no logger port. `LifecycleNextHop` (lines 99–103) has no `command`. **But** `lifecycle-engine.ts:class:LifecycleEngine:36` still exists as a domain class whose `evaluate` calls application `evaluateLifecycle` (line 38). Domain barrel re-exports that class.                                     |
| Centralized validation    | **implemented** | Verdict loops `options.checksByTarget` (`lifecycle-verdict.ts:169–178`); does not `execute` checks. `projectArtifacts:313` is pure DAG. `Logger.debug` only (`:277`).                                                                                                                                                                                                                                                    |
| Effective artifact status | **implemented** | `effectiveStatus:356` + `findBlockingParent:330`. Parent-review when upstream pending/drifted.                                                                                                                                                                                                                                                                                                                           |
| Canonical-state-only      | **implemented** | `effectiveStatus` uses `artifact.status` only; `hasDrift` unused.                                                                                                                                                                                                                                                                                                                                                        |
| Machine-readable blockers | **partial**     | `blockersFromFailedChecks:778`, `artifactBlockers:633` use `INCOMPLETE_ARTIFACT` (no `MISSING_ARTIFACT`). Bypass omits skippable (`:798`). Review overlap returns `[]` (`reviewBlockersFromSummary:551`). **Gap:** without `requestedTarget`, hop predicate fails are not in `verdict.blockers` (`:243–257`).                                                                                                            |
| Available steps / nextHop | **partial**     | `validTransitions` from `VALID_TRANSITIONS`. `availableTransitions` from injected checks with no `fail`. `availableSteps` from `schema.workflow()` (`:181`). Hop matrix in `resolveLifecycleNextHop:805`. **Gap:** `review.required` sets `targetStep: state` (`:813–818`), not `designing` for overlap.                                                                                                                 |
| Application guidance      | **partial**     | `lifecycle-evaluation.ts:function:evaluateLifecycle:19` + `lifecycle-guidance.ts:function:resolveLifecycleCommand:13`. Commands live in application. **Gap:** `done`/`signed-off` command is `/specd-verify` while hop is `archivable` (`lifecycle-guidance.ts:70–72`).                                                                                                                                                  |
| Archiving escapes         | **implemented** | Recovery skips requires in `transitionBlockers` (`:223–225`) and `requestedTargetBlockers` (`:608–609`). Failed `archive-failed`+`commitStarted` → `targetStep: designing` (`:952–966`).                                                                                                                                                                                                                                 |
| Review summary            | **implemented** | `deriveReview:438`, `collectUnhandledOverlaps:503` reverse-scan until `transitioned` with `to !== 'designing'`.                                                                                                                                                                                                                                                                                                          |
| Shared consumers          | **partial**     | GetStatus/TransitionChange call `evaluateLifecycle`. ValidateArtifacts (`validate-artifacts.ts:221`) and GetArtifactInstruction (`get-artifact-instruction.ts:99`) call **`evaluateLifecycle`**, not `evaluateLifecycleVerdict`. CompileContext is **not** in `evaluateLifecycleVerdict` dependents (graph impact affectedFiles). `PredicateSnapshots` / `gatherPredicateSnapshots` absent from graph (no exact symbol). |
| Next artifact topo        | **implemented** | `nextArtifact:754` uses `schema.artifactDag().topologicalOrder()`.                                                                                                                                                                                                                                                                                                                                                       |

`projectArtifacts` also exported from `lifecycle-verdict.ts:313` and re-exported via `lifecycle-engine.ts:2`.

### Discrepancies

1. **Domain `LifecycleEngine` shim imports application** — evidence: `packages/core/src/domain/services/lifecycle-engine.ts` lines 22–38 import `evaluateLifecycle` from `../../application/services/lifecycle-evaluation.js` and class `evaluate` returns `LifecycleVerdict` (with `command`). Global `default:_global/architecture`: inner must not import outer. Spec allows a deprecated shim but also says `LifecycleEngine` MUST NOT remain a domain type. **both** (spec permits a domain-named shim; code places application import inside domain). **severity: high**

2. **`review.reason === 'spec-overlap-conflict'` does not set `nextHop.targetStep` to `designing`** — evidence: `resolveLifecycleNextHop` first branch `if (review.required) { return { targetStep: state, ... } }` (`lifecycle-verdict.ts:813–818`). Spec hop matrix: overlap MUST be `designing`. Application still sets `command: '/specd-design'` (`lifecycle-guidance.ts:22–24`). Agents can see `targetStep` stay in current state while command says design. **code-wrong** (spec+guidance agree on design skill; hop target does not). **severity: high**

3. **DAG-only consumers attach commands** — evidence: `ValidateArtifacts` and `GetArtifactInstruction` call `evaluateLifecycle(..., { checksByTarget: {} })`, which always builds `nextAction.command`. Spec: MUST use `evaluateLifecycleVerdict` and MUST NOT attach commands. **code-wrong** (or spec-over-strict if unused `nextAction` is harmless). **severity: medium**

4. **Domain `blockers` omit hop failures unless `requestedTarget` is set** — evidence: `evaluateLifecycleVerdict:243–257`. GetStatus compensates with `_mergeBlockers` over all `checksByTarget` (`get-status.ts:721`). Direct `evaluateLifecycle` consumers without requested target see review-only blockers. Spec: every preventing condition MUST be a `Blocker`. **code-wrong** for the domain contract; GetStatus papered over it. **severity: medium**

5. **Happy-path command for `done`/`signed-off` is `/specd-verify` while `targetStep` is `archivable`** — evidence: `lifecycle-guidance.ts:70–72` vs `resolveLifecycleNextHop:922–928`. Tests lock this in (`lifecycle-engine.spec.ts:749–766`). `core:transition-checks` verify “Backward hops listed but not happy-path nextAction” expects archive or signoff-approve, not implement — **does not assert verify**. Spec application matrix lists `/specd-archive` for archive work. **both** (lifecycle-engine tests vs transition-checks verify vs guidance). **severity: medium**

6. **`availableSteps` still independently walks `requires` for `blockingArtifacts` even when check results exist** — evidence: `lifecycle-verdict.ts:184–187`. `isReady` uses `workflow.requires` fail when checks present (`:191–197`); step `blockers` are emptied when checks exist (`:215–217`). Spec forbids a second blocker code walk; extra `blockingArtifacts` array remains. **code-wrong** (weak). **severity: low**

7. **Verify.md still names `LifecycleEngine.evaluate`** — most scenarios. Code under test is `evaluateLifecycle` / `evaluateLifecycleVerdict`. **spec-wrong**. **severity: low**

8. **GetArtifactInstruction JSDoc still says declaration-order next artifact** — `get-artifact-instruction.ts:24–27`. Runtime uses `lifecycle.nextArtifact` (topo). **code-wrong** (comment). **severity: low**

9. **`evaluateLifecycle` re-exported through domain services** — `lifecycle-engine.ts:22` plus domain index star-export. Integrators can import an application function from `@specd/core` domain surface. **both**. **severity: medium**

### Test Coverage

File: `packages/core/test/domain/services/lifecycle-engine.spec.ts` (describe still `LifecycleEngine`). Asserts: effective status / parent-review; no overlap blocker from invalidation; bypass overlap; canonical complete-with-drift and missing+hasDrift; topo next artifact; archiving escapes; incomplete tasks hide `verifying`; complete tasks → `/specd-verify`; designing→ready hop; impl skippable flags; done skill hops without `/specd-implement`; debug logs.

Adjacent: `get-status.spec.ts`, `transition-change.spec.ts`, `transition-checks.spec.ts` cover projections and execute path.

Several tests call `evaluateLifecycle` (with `nextAction`) rather than asserting `evaluateLifecycleVerdict.nextHop` has **no** `command` key.

### Missing Tests

- No ctor / no debug port on `evaluateLifecycleVerdict` (verify: “No LifecycleEngine class constructor”).
- `availableSteps` omits extras row when `workflow[]` omits `implementing` while `validTransitions` includes it.
- Dual-write: `INCOMPLETE_ARTIFACT` without `MISSING_ARTIFACT`.
- Domain `nextHop` has no `command` field (type + runtime).
- Historical overlap: `evaluateLifecycleVerdict` does not embed `/specd-design`; only guidance does.
- CompileContext does not call evaluate (graph-only; no test).
- ValidateArtifacts / GetArtifactInstruction use empty `checksByTarget` **and** `evaluateLifecycleVerdict` (current tests if any would pass `evaluateLifecycle`).
- Skip bypass: `isPermitted` true and no warning object.
- All-artifacts-complete → `nextArtifact === null` (topo incomplete case exists).
- `nextHop.targetStep === 'designing'` when `review.reason === 'spec-overlap-conflict'`.

### Spec Dependency Chain / contradictions with globals or deps

- **architecture:** domain importing application in `lifecycle-engine.ts` contradicts hexagonal inner-never-imports-outer. Logging exception (`Logger.debug` in domain) is consistent with `default:_global/logging` and this spec’s ambient-logger note.
- **transition-checks:** hop projections must come from one evaluation — GetStatus does; domain `blockers` without `requestedTarget` do not. Recovery `exceptAlong: ['recovery']` on requires/taskCompletion in `TRANSITION_BINDING_SPECS` matches archiving escape.
- **get-status / transition-change:** still mention `LifecycleEngine` in verify/ctor in places; implementation moved to functions.
- **conventions:** kebab files, named exports, tests under `test/` mirroring src — OK. `lifecycle-engine.spec.ts` tests both domain and application `evaluateLifecycle` in one file (not a hard conventions fail).
- **testing:** many `it` titles are `given…when…then`; some are not (`computes effective status…`).

### Summary: requirements 11, implemented 6, partial 5, missing 0, discrepancies 9, missing tests 11

---

## Spec: core:transition-checks

### Requirements Summary

1. Check identity/result (`id`, gerund `label`, kind, outcome, codes; no `archive.publication`; no instruction hooks as checks).
2. Check ABI: `Check` / `WorkflowCheck` / `create*`; no snapshot bag; `CheckExecutionContext` host fields including `passMemo` / `onCheckProgress`.
3. One implementation file per check id; kind on class; applicability on bindings.
4. `from`/`to`/`along` including AXIS_FALLBACK splice; redesign vs recovery.
5. Archive is operation not edge; no `approval.signoff` on archive.
6. Effect bindings: `phase` / `onFailure`; skip by phase+selector not `check.id`.
7. Predicates vs effects; skip-hooks skips effects only.
8. Evaluation of one attempt; protocol fail-fast on TransitionChange only; no pending rewrite.
9. Registry bindings for this capability (impl forward-exit, approval.spec, etc.).
10. Actionable fail diagnostics (deps extracted vs persisted; impl compact message).
11. Generic check progress bus.
12. Projections (`availableTransitions`, `nextAction`).
13. No shared snapshot bag; one binding table; hooks via `check.execute`.

### Implementation Status

| Req                 | Status          | Evidence                                                                                                                                                                                                                                                     |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity/result     | **implemented** | `transition-checks.ts:CheckId:20`, `CHECK_LABELS:42`, `CheckResult:70`. No `archive.publication` in union.                                                                                                                                                   |
| ABI / WorkflowCheck | **implemented** | `workflow-check.ts:class:WorkflowCheck:17`. Factories e.g. `createWorkflowTaskCompletion:84`. `passMemo` in `workflow-task-completion.ts:54–68`. Context built in `buildCheckExecutionContext:52`.                                                           |
| One file per check  | **partial**     | Application: `protocol-edge.ts`, `workflow-requires.ts`, … Domain stubs: `domain/checks/*`. **Exception:** `hook.pre` and `hook.post` share `application/checks/hook-effect.ts` (`HookEffectCheck:88`, `createHookPre`/`createHookPost`).                    |
| along / axis        | **implemented** | `classifyAlong:167`, `AXIS_FALLBACK:107`, `buildAxis:139` splices omitted fallbacks. Tests in `transition-checks.spec.ts:30–80`.                                                                                                                             |
| Archive operation   | **implemented** | `ARCHIVE_BINDING_SPECS:84` — no `approval.signoff`.                                                                                                                                                                                                          |
| Phase / onFailure   | **implemented** | Transition `hook.post` `phase: 'before-persist'` (`check-bindings.ts:67–70`); archive post `after-persist` + `collect` (`:93`). `matchingEffects:23` filters by `binding.phase`.                                                                             |
| Predicate vs effect | **implemented** | `executeMatchingPredicates` uses `matchingPredicates` (non-effects). TransitionChange runs effects after predicates (`transition-change.ts:252–259`). Skip inside `HookEffectCheck.execute:133–149`.                                                         |
| Attempt evaluation  | **implemented** | `failFastOn: 'protocol.edge'` (`transition-change.ts:215`). GetStatus `executeChecksByLegalTargets:203` collects all targets, no fail-fast. No target rewrite (`effectiveTarget = requestedTarget`).                                                         |
| Registry bindings   | **implemented** | Impl checks `from: implementing`, `along: forward` (`:48–55`). `approval.spec` `from: ready`, `along: forward` (`:57–59`).                                                                                                                                   |
| Diagnostics         | **implemented** | `impl-files-resolved.ts:formatOpenTrackedFilesMessage:21` (count + ≤3 examples; `details.files` full list). Deps check has extracted/persisted details (domain `deps-consistent`).                                                                           |
| Progress bus        | **implemented** | `executeCheckWithProgress:76` emits `check-start`/`check-done`. Hook maps RunStepHooks onto `check-progress` (`hook-effect.ts:emitHookAsCheckProgress:36`).                                                                                                  |
| Projections         | **partial**     | Availability from checks in verdict. Command matrix in guidance (see lifecycle-engine discrepancy on `done` → `/specd-verify`).                                                                                                                              |
| No snapshot bag     | **implemented** | No `PredicateSnapshots` symbol. Task counts via CountTasks + `passMemo`. Domain `TRANSITION_BINDINGS` documented as test fixtures (`check-bindings.ts:114–121`). Use cases inject composed registry (`resolveGetStatusDeps`, `resolveTransitionChangeDeps`). |

### Discrepancies

1. **`hook.pre` and `hook.post` share one application module** — evidence: `packages/core/src/application/checks/hook-effect.ts`. Spec: each check id in its own module pair; execute body MUST NOT live in another check’s file. Domain still has `hook-pre` / `hook-post` stubs. **code-wrong**. **severity: medium**

2. **Projections verify vs guidance for `done`** — verify “Backward hops…” wants archive or signoff-approve, not implement. Code recommends `/specd-verify` with `targetStep: archivable` (`lifecycle-engine.spec.ts:765–766`). **both**. **severity: medium**

3. **`resolveLifecycleCommand(nextHop, context)` signature in lifecycle-engine spec** vs implementation `(change, nextHop, review, availableTransitions, approvals)` — **spec-wrong**. **severity: low**

4. **Closed `CheckId` union in domain** — spec allows closed union of listed ids and says it MUST NOT be the plugin ABI. OK; no plugin path in this change.

5. **Domain `TRANSITION_BINDINGS` still materialized** — allowed as fixtures; use-case spec forbids defaulting to them. TransitionChange constructor requires injected bindings (no default in `transition-change.ts:129–142`). **none** if composition always injects `create*`. Residual risk if a caller passes `TRANSITION_BINDINGS` (stubs). **severity: low**

6. **GetStatus/TransitionChange specs still list `LifecycleEngine` in deps/verify** while this spec says projections come from check evaluation + guidance. **spec-wrong** (sibling drift). **severity: medium**

### Test Coverage

- `transition-checks.spec.ts`: classifyAlong axis cases (omit implementing/ready, unknown step, recovery, redesign); binding table; labels; deps/impl fail text; archive bindings without publication.
- `workflow-check-factories.spec.ts`: factory returns WorkflowCheck; hook uses RunStepHooks.
- `execute-matching-predicates.spec.ts`, `execute-check-with-progress.spec.ts`, `matching-effects.spec.ts`.
- GetStatus/TransitionChange specs cover approval stay-in-ready, impl forward vs redesign, skip-hooks.

### Missing Tests

- Instruction hooks are not emitted as check rows.
- CountTasks memo is per `passMemo` pass, not instance (verify ABI scenario) — may exist in get-status; not in check unit tests as “second pass recounts”.
- Archive post selected by `phase` not `check.id === 'hook.post'` (ArchiveChange is out of this batch; flag as coverage gap for this spec).
- Archive pre `onFailure=abort` prevents persist.
- Status `allowed` ignores matching effects (GetStatus never runs effects — implicit).
- Protocol fail-fast **order** (`protocol.edge` first) on TransitionChange.
- Generic bus: `deps.consistent` start/done labels; hook `check-progress` heartbeats.
- “One binding table” — domain specs vs application `create*` row lists not independently copied (composition `applyBindingSpecs`).

### Spec Dependency Chain / contradictions with globals or deps

- **architecture:** application checks extend `WorkflowCheck`; domain `run(facts)` stubs — matches “domain MAY export pure run + stub Check”. Domain `check-bindings.ts` importing `../checks/*` stays in domain. Good.
- **run-step-hooks / hook-execution-model:** effects delegate to `RunStepHooks` inside `HookEffectCheck`, not the use-case loop. Matches this spec. TransitionChange MUST NOT take RunStepHooks — it does not.
- **count-tasks:** only `createWorkflowTaskCompletion` holds CountTasks. Matches.
- **logging:** progress is a callback bus, not console. OK.
- **testing:** unit tests mock ports; unused methods not always `throw 'not implemented'` in factory tests (narrow mocks). **low** conventions/testing tension.

### Summary: requirements 13, implemented 11, partial 2, missing 0, discrepancies 6, missing tests 9

---

## Spec: core:get-status

### Requirements Summary

Accepts name; returns change + artifact persisted/effective/file state; revision `ifModifiedSince`; drafted read-only; implementation tracking projection; optional refresh via `RefreshImplementationTracking` (not detector); drift display; task counts from task-completion execute (no second CountTasks); execute matching predicates then project; ChangeNotFoundError; constructor deps; config factory bootstrap; effective status for every schema artifact; review/lifecycle context; blockers; schema-fail degradation; `resolveGetStatusDeps`.

### Implementation Status

| Req                             | Status          | Evidence                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name input                      | **implemented** | `GetStatus.execute:332`                                                                                                                                                                                                                                                                                                |
| Artifact statuses               | **implemented** | `_buildActiveResult:367`; `artifactStatuses` with `state`, `effectiveStatus`, file `state`                                                                                                                                                                                                                             |
| Revision                        | **implemented** | `ifModifiedSince` parse + `>= updatedAt` → `_buildUnchangedResult:569`; no refresh                                                                                                                                                                                                                                     |
| Drafted                         | **implemented** | `get` then `getDraft`; empty `availableTransitions`; `getDiscarded` unused                                                                                                                                                                                                                                             |
| Impl projection                 | **implemented** | `projectImplementationTracking(change)`                                                                                                                                                                                                                                                                                |
| Refresh                         | **implemented** | Default `refreshImplementationTracking !== false` (`:349`); drafts skip (`_buildDraftedResult` has no refresh)                                                                                                                                                                                                         |
| Drift display                   | **implemented** | `file.displayStatus()` + `aggregateDisplayStatus`                                                                                                                                                                                                                                                                      |
| Task counts                     | **implemented** | `taskCompletionFromChecks(checksByTargetMap)` (`:484`); no CountTasks on GetStatus                                                                                                                                                                                                                                     |
| Execute then project            | **implemented** | `executeChecksByLegalTargets:453` then `evaluateLifecycle:477`; archivable also `executeMatchingPredicates` on `archiveBindings` (`:461–476`)                                                                                                                                                                          |
| ChangeNotFoundError             | **implemented** | `:337`                                                                                                                                                                                                                                                                                                                 |
| Constructor deps                | **partial**     | Ctor (`:306–312`): changes, schemaProvider, approvals, refresh, transitionBindings, archiveBindings. **No** `evaluateLifecycle` / `LifecycleEngine` injection — module import `evaluateLifecycle`. Spec.md lists `evaluateLifecycle` as constructor argument and factory `createEvaluateLifecycle()` (does not exist). |
| Config factory bootstrap        | **implemented** | `composition/use-cases/get-status.ts` `resolveGetStatusDeps` + `createGetStatus`                                                                                                                                                                                                                                       |
| Effective status every artifact | **implemented** | Loop `schema.artifacts()` (`:486`)                                                                                                                                                                                                                                                                                     |
| Lifecycle / review              | **implemented** | `_projectReview:798` from verdict; overlap scan in domain `collectUnhandledOverlaps`                                                                                                                                                                                                                                   |
| Blockers                        | **partial**     | `_mergeBlockers:721` unions review + all hop fails + archive checks; impl bypass only `impl.linksInScope`; overlap overlay `_nextActionAfterArchiveOverlap:771`                                                                                                                                                        |
| Schema degradation              | **partial**     | `try/catch` around `schemaProvider.get()` (`:394–396`) swallows **any** error, not only `SchemaNotFoundError`. Sets empty availableTransitions, null nextArtifact/schemaInfo.                                                                                                                                          |
| resolveGetStatusDeps            | **partial**     | Resolves listed ports **except** `evaluateLifecycle` / `LifecycleEngine` (`get-status.ts` composition `:39–50`). Verify.md still lists `lifecycle: LifecycleEngine`. Spec.md lists `evaluateLifecycle` from `createEvaluateLifecycle()`.                                                                               |

Draft DAG: `_buildDraftedResult` uses `projectArtifacts` (`:633`) for `effectiveStatus` including parent-review. `availableTransitions` empty. `nextArtifact` forced `null` (`:672`) — not computed for drafts.

### Discrepancies

1. **Constructor / factory still specified as injecting lifecycle engine or `createEvaluateLifecycle()`** — evidence: spec.md “Constructor dependencies” + “resolveGetStatusDeps MUST resolve evaluateLifecycle from createEvaluateLifecycle()”; verify “GetStatus receives LifecycleEngine through construction” and factory scenario listing `lifecycle: LifecycleEngine`. Code: pure-function import; `GetStatusDeps` has no lifecycle field. **spec-wrong** (code matches transition-checks “no engine class”). **severity: high** (docs/verify would fail a literal composition audit)

2. **Schema failure catch is not typed to `SchemaNotFoundError`** — evidence: `get-status.ts:394-396` bare `catch`. Spec: GIVEN `SchemaProvider.get()` throws `SchemaNotFoundError`. Other schema errors also degrade. **code-wrong** if only not-found should degrade; **spec-wrong** if silent degrade for all failures is intended. **severity: medium**

3. **Archive overlap nextAction is a second guidance rewrite** — evidence: `_nextActionAfterArchiveOverlap` forces `targetStep: 'archivable'`, `command: '/specd-archive'`, overlap reason (`:771–788`). Domain hop for archivable with `archiving` in `availableTransitions` is `targetStep: 'archiving'`, reason `'Ready to archive'` (`lifecycle-verdict.ts:945–949`). Spec GetStatus **requires** this overlay. Lifecycle-engine application guidance also says overlap while archivable must keep `/specd-archive` and `archivable`. Overlay is necessary because archive predicates are not hop checks. **both** (split brain between hop evaluation and operation predicates). **severity: medium**

4. **Verify draft scenario names `result.artifacts`** — code field is `artifactStatuses`. **spec-wrong**. **severity: low**

5. **Verify “uses LifecycleEngine to derive lifecycle interpretation”** — code uses `evaluateLifecycle` + `projectArtifacts`. **spec-wrong**. **severity: low**

6. **Draft status never sets `review.required`** even if draft files are `pending-review` (`_buildDraftedResult:694–700`). Spec review scenarios are for `execute()` generally; drafted-specific scenarios do not require review flags. **unclear**; if drafts can have pending-review, **code-wrong**. **severity: low**

7. **Public blockers from all hops** can include `INCOMPLETE_TASKS` for `verifying` while `nextAction` is implement — required by spec. Implemented.

8. **`unchanged` path does not invoke refresh** — matches spec.

### Test Coverage

`packages/core/test/application/use-cases/get-status.spec.ts` (large) plus `composition/use-cases/get-status.spec.ts`. Expected coverage from naming/typical cases: revision short-circuit, draft vs active, refresh default/opt-out, drift display, taskCompletion mapping, deps.consistent hides ready, overlap review vs OVERLAP_CONFLICT, archivable overlap overlay, schema degrade, factory deps.

Tests that still construct `new LifecycleEngine()` would be **stale relative to ctor spec** — ctor no longer takes it; tests should use `GetStatus(..., transitionBindings, archiveBindings)`.

### Missing Tests

- `createEvaluateLifecycle()` does not exist — factory verify cannot pass as written; need tests that `GetStatusDeps` has **no** lifecycle field and `evaluateLifecycle` is the module function.
- Catch distinguishes `SchemaNotFoundError` vs other throws (if spec stays strict).
- Draft pending-parent-artifact-review (verify “Drafted status DAG-projects effective status”).
- CountTasks memo across two `GetStatus.execute` with different file contents (verify “CountTasks memo is per evaluation pass”).
- Check rows include `label` on failed blockers (spec blockers MUST include gerund label).
- `refreshImplementationTracking` default vs explicit false with spy (likely exists — confirm in full get-status spec tests).
- Discarded-only name does not call `getDiscarded`.

### Spec Dependency Chain / contradictions with globals or deps

- **lifecycle-engine:** GetStatus is the public `evaluateLifecycle` consumer — matches. Overlay for archive overlap contradicts “one projection from evaluateLifecycle” slightly.
- **refresh-implementation-tracking:** delegated; no detector on GetStatus. Matches.
- **count-tasks:** not a GetStatus ctor dep. Matches.
- **kernel / composition-resolver:** `resolveGetStatusDeps(resolver)` exists; does not resolve a LifecycleEngine. Kernel wiring follows composition file.
- **architecture:** GetStatus (application) imports domain `projectArtifacts` + application `evaluateLifecycle` — OK.
- **conventions `exactOptionalPropertyTypes`:** `unchanged?` optional on result — OK.

### Summary: requirements 17, implemented 13, partial 4, missing 0, discrepancies 8, missing tests 7

---

## Spec: core:transition-change

### Requirements Summary

Input contract (no execute-time approval flags; `allowOutOfScope`); baked approvals; change must exist; optional refresh; spec/signoff as checks not pending hops; drain-only pending states; direct target when gates off; workflow requires + task completion via predicates; verifying→implementing validation clearing; skill-aligned backward invalidation; designing from any; archiving→archivable recovery; pre/post hooks via effect checks; persist via `mutate`; result `{ change }`; progress bus; deps; `to: 'next'`; shared runner errors; `resolveTransitionChangeDeps`.

### Implementation Status

| Req                             | Status                | Evidence                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract                  | **implemented**       | `TransitionChangeInput:42` — `name`, `to`, `skipHookPhases`, `refreshImplementationTrackingBefore`, `allowOutOfScope`. No approval fields.                                                                                                                          |
| Baked approvals                 | **implemented**       | Ctor `approvals: ApprovalGates` (`:134`). Composition `resolver.config.approvals`.                                                                                                                                                                                  |
| Change exists                   | **implemented**       | `get` → `ChangeNotFoundError` (`:166–167`)                                                                                                                                                                                                                          |
| Refresh                         | **implemented**       | Default refresh then reload (`:170–176`); `false` skips                                                                                                                                                                                                             |
| Spec/signoff checks             | **implemented**       | Failed `approval.spec`/`signoff` → `InvalidStateTransitionError` `{ type: 'approval-required', gate }` (`:421–427`). Persist target is requested state.                                                                                                             |
| Pending drain                   | **implemented**       | `_assertDrainAndGateTargets:337` allows pending→designing / spec-approved / signed-off                                                                                                                                                                              |
| Direct when gates off           | **implemented**       | No rewrite; `effectiveTarget = requestedTarget` (`:217`)                                                                                                                                                                                                            |
| Requires / tasks                | **implemented**       | Predicates via `executeMatchingPredicates`; `_mapFailedPredicate` maps `workflow.requires` / `workflow.taskCompletion` including `findBlockingParent` (`:391–419`). No second DAG gate after green execute.                                                         |
| verifying→implementing clearing | **not fully re-read** | Mutate path (`:261–289`) invalidates on designing; skill hops `invalidateSignoff` only. Implementation-only retry preserve-validated is entity `transition` — **assumed implemented** in Change; not re-asserted in this file. **partial** pending entity behavior. |
| Skill-aligned backward          | **implemented**       | `SKILL_HOP_SOURCES/TARGETS:96–97`; `invalidateSignoff` (`:282–284`). `hook.post` only `along: forward` so done→implementing skips source post.                                                                                                                      |
| Designing from any              | **implemented**       | `invalidate` on enter designing (`:264–279`)                                                                                                                                                                                                                        |
| Archiving→archivable            | **implemented**       | `classifyAlong` recovery; requires `exceptAlong: recovery`                                                                                                                                                                                                          |
| Hooks                           | **implemented**       | `matchingEffects(..., 'before-persist', along)` then `executeCheckWithProgress`. Skip selectors in hook execute. No `check.id === 'hook.pre'` in use case.                                                                                                          |
| Persistence                     | **implemented**       | `_changes.mutate` (`:261`)                                                                                                                                                                                                                                          |
| Result / transitioned event     | **implemented**       | `{ change: persistedChange }`; `onProgress` `transitioned` (`:291–293`)                                                                                                                                                                                             |
| Progress                        | **implemented**       | Maps check bus; `requires-check` / `task-completion-failed` from failed predicates (`:468–525`). No first-class hook-start types.                                                                                                                                   |
| Dependencies                    | **partial**           | Ctor: changes, actor, schema, refresh, approvals, transitionBindings. **No LifecycleEngine, no RunStepHooks, no CountTasks.** Spec.md still lists LifecycleEngine.                                                                                                  |
| `to: 'next'`                    | **implemented**       | `HAPPY_PATH_NEXT[fromState]` (`:182–187`); missing → `HappyPathNextUnavailableError`                                                                                                                                                                                |
| Shared runner errors            | **implemented**       | Maps deps/readOnly/impl to typed errors (`:429–459`)                                                                                                                                                                                                                |
| Factory                         | **partial**           | `resolveTransitionChangeDeps:41` — no `lifecycle`. Spec/verify still require resolving `lifecycle: LifecycleEngine`.                                                                                                                                                |

Protocol fail-fast: `{ failFastOn: 'protocol.edge' }` (`:215`). After fail, still calls `evaluateLifecycle` then `_mapFailedPredicate` — extra projection, not a second gate.

### Discrepancies

1. **Dependencies / factory still require `LifecycleEngine`** — evidence: spec.md Requirements Dependencies + Config-based factory; verify “TransitionChange depends on LifecycleEngine and transitionBindings” and `resolveTransitionChangeDeps` resolves `lifecycle`. Code: `evaluateLifecycle` import; deps have no lifecycle. **spec-wrong**. **severity: high**

2. **`evaluateLifecycle` after predicates is unused for gating** — used for `_emitRequiresProgress` artifact statuses and logging (`:219–233`). Spec allows projection via evaluate. OK if not a second requires walk. `_emitRequiresProgress` uses verdict artifacts for satisfaction, not a new algorithm. **none** / **low** if considered duplicate interpretation.

3. **Human-approval pending hops still exist** — required for drain. New work must not persist `pending-spec-approval`. Implementation stays in `ready` when approval.spec fails. Matches. Verify still describes pending→spec-approved via LifecycleEngine blockers — drain path. **spec-ok**.

4. **`allowOutOfScope` omitted keeps `impl.linksInScope` strict** — `allowOutOfScope = input.allowOutOfScope === true` (`:191`); default false. Matches.

5. **Post-hook order source.post then target.pre** — both `before-persist`; registry order is `hook.post` then `hook.pre` (`TRANSITION_BINDING_SPECS:67–77`). Matches “source post then target pre then persist”. **implemented**

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts` (very large) plus composition factory spec. Typical coverage: not found, refresh, approval stay-in-ready/done, incomplete tasks, incomplete artifact + parent review, designing invalidation, skipHookPhases, mutate, `to: 'next'`, ReadOnlyWorkspaceError / ArchiveDependencyMismatchError / ArchiveImplementationStateError, progress events.

`lifecycle-engine.spec.ts` does not replace TransitionChange execute tests.

### Missing Tests

- Factory does **not** resolve `lifecycle` / LifecycleEngine (current verify would fail).
- `to: 'next'` from `archivable` throws `HappyPathNextUnavailableError`.
- Protocol fail-fast: illegal pair does not run later predicates (order).
- Does not branch on `check.id === 'hook.pre'` (structural).
- Green `workflow.requires` then no second effective-status walk (hard to assert except by spy).
- `allowOutOfScope: true` skips `impl.linksInScope` via context flag (check execute skip).

### Spec Dependency Chain / contradictions with globals or deps

- **lifecycle-engine shared consumers:** TransitionChange MUST NOT re-walk requires after green evaluate — maps first failed predicate only. Matches.
- **hook-execution-model / run-step-hooks:** use case does not own RunStepHooks; effect check does. Matches transition-checks; contradicts older “Pre-hook execution” wording that still says `RunStepHooks.execute` in verify scenarios (verify.md truncated “THEN RunStepHooks.execute is called with `{ step: 'implementing', phase: 'post' }`”). That verify is **spec-wrong** vs check ABI (hooks run inside `hook.post.execute`). **severity: medium** for verify.md vs transition-checks.
- **refresh-implementation-tracking:** default on, opt-out flag. Matches.
- **architecture:** application use case → domain projectArtifacts + application evaluateLifecycle + application executeMatchingPredicates. OK. No domain→application from this file.
- **error-handling:** typed SpecdError subclasses. Matches globals.

### Summary: requirements 25, implemented 22, partial 3, missing 0, discrepancies 5, missing tests 6

---

## Cross-cutting: globals and depth-1 deps

### default:\_global/architecture

**Contradiction (high):** `packages/core/src/domain/services/lifecycle-engine.ts` imports application `lifecycle-evaluation.js`. Domain services barrel can export `evaluateLifecycle` (application type `LifecycleVerdict` with `command`) into the domain public surface.

Otherwise: checks in application, pure `run` in domain, ports on `create*` factories, composition in `packages/core/src/composition/use-cases/*` — conformant.

### default:\_global/logging

Domain `lifecycle-verdict.ts` uses `Logger.debug` from `observability/logger.ts` (ambient, no ctor port). Matches this change’s logging exception and global “prefer logging abstraction”. GetStatus/TransitionChange also `Logger.debug`.

### default:\_global/testing / conventions

Vitest; `test/` mirrors `src` for use cases and domain services. `lifecycle-engine.spec.ts` lives under `test/domain/services/` but imports application `evaluateLifecycle` and `Logger` from `application/logger.js` — layering of tests is looser than production. `given/when/then` naming incomplete. No snapshots observed in sampled tests.

### Direct deps (depth 1)

| Dep                                  | Consistency                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| core:change                          | Persisted aggregate status + history remain on Change; engine derives effective status. Invalidation/signoff on mutate uses entity methods.                  |
| core:workflow-model                  | `VALID_TRANSITIONS`, workflow `requires` / `requiresTaskCompletion` consumed via checks + schema.workflowStep.                                               |
| core:schema-format                   | Artifact DAG `topologicalOrder`, `schema.workflow()`.                                                                                                        |
| core:kernel                          | Factories `createGetStatus` / `createTransitionChange` used by kernel builder; no LifecycleEngine on those deps objects.                                     |
| core:composition-resolver            | `resolveGetStatusDeps` / `resolveTransitionChangeDeps` + `resolveWorkflowCheckRegistry`.                                                                     |
| core:count-tasks                     | Only inside `WorkflowTaskCompletionCheck`; GetStatus reuses check details via `taskCompletionFromChecks`.                                                    |
| core:run-step-hooks                  | Constructor dep of hook checks, not TransitionChange.                                                                                                        |
| core:hook-execution-model            | Skip selectors `all` / `target.pre` / `source.post` / archive `pre`/`post` in `HookEffectCheck.execute`. `source.pre` / `target.post` are no-ops (spec MAY). |
| core:refresh-implementation-tracking | GetStatus and TransitionChange default-on refresh for active changes.                                                                                        |

---

## Batch totals

| Spec                   |    Req | Implemented (full) | Partial | Missing | Discrepancies | Missing tests |
| ---------------------- | -----: | -----------------: | ------: | ------: | ------------: | ------------: |
| core:lifecycle-engine  |     11 |                  6 |       5 |       0 |             9 |            11 |
| core:transition-checks |     13 |                 11 |       2 |       0 |             6 |             9 |
| core:get-status        |     17 |                 13 |       4 |       0 |             8 |             7 |
| core:transition-change |     25 |                 22 |       3 |       0 |             5 |             6 |
| **Total**              | **66** |             **52** |  **14** |   **0** |        **28** |        **33** |

Highest-severity themes: (1) domain shim importing application + leftover `LifecycleEngine` type; (2) sibling specs/verify still requiring ctor-injected `LifecycleEngine` / `createEvaluateLifecycle()` after code moved to functions; (3) overlap `nextHop.targetStep` stays on current state; (4) split command matrix (`/specd-verify` on done vs archive/signoff verify text).

---

## Partial: archive-validate

# Spec compliance partial — archive / validate / instruction / storage / change

**Change:** `workflow-transition-checks`  
**Assigned specs:** `core:archive-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:storage`, `core:change`  
**Globals / depth-1:** `default:_global/architecture`, `default:_global/logging`, `default:_global/testing`; deps include `composition-resolver`, `lifecycle-engine`, `delta-format`, `spec-overlap`, `change-manifest`, `transition-checks`, `schema-format`.  
**Mode:** change (`change spec-preview workflow-transition-checks <specId>`)  
**Read-only.** No code or spec files modified.  
**Graph:** `stale: false` (`lastIndexedAt` 2026-08-28T17:21:07Z). Locate via `graph search` / `graph impact` then Read.

**Product decisions used as CODE WINS when specs still lag:**

1. Archive is operation-`archive` **checks** (`archiveBindings`), not a lifecycle hop and not `RunStepHooks` on `ArchiveChange`.
2. DAG status uses `evaluateLifecycle` / `evaluateLifecycleVerdict` with **empty `checksByTarget`** — not hop predicates.
3. **No `LifecycleEngine` constructor injection** on validate / get-artifact-instruction (deprecated class in `lifecycle-engine.ts` wraps functions; composition does not pass it).
4. Overlap split: live archive predicate `OVERLAP_CONFLICT` vs review/invalidation cause `spec-overlap-conflict`.
5. Artifact `requires` cascade is `projectArtifacts` / `_effectiveStatus` in `lifecycle-verdict.ts`, not `Change.effectiveStatus()`.

---

## Spec: `core:archive-change`

### Requirements Summary

`ArchiveChange` is gated on archivable **state** but archive itself is **not** a `from → to` hop. Constructor takes `archiveBindings` (`CheckBinding[]`), `ListWorkspaces`, `ContentHasher` (param `hasher`), not `RunStepHooks`. Predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent` (sealed set), `impl.filesResolved` / `impl.linksInScope`. Remaining merge/publish preflight stays inside the use case (no `archive.publication` binding). Overlap is archive-only, skippable with `allowOverlap`; when allowed, peers are invalidated with cause `spec-overlap-conflict`. Hooks are `before-persist` / `after-persist` effects on the binding table. Deferred `archiving` transition after full-batch preflight + snapshots. Factory: `resolveArchiveChangeDeps` with `archiveBindings` from `resolveWorkflowCheckRegistry({ includeOverlapDetection: true })`, `materializeMetadata`, `contentHasher`; MUST NOT put `runStepHooks` / `regenerateMetadata` on `ArchiveChangeDeps`.

### Implementation Status

**Implemented** for this change’s archive-as-checks model.

- Ctor: `packages/core/src/application/use-cases/archive-change.ts` — `archiveBindings`, no `RunStepHooks`, no `LifecycleEngine`.
- Composition: `packages/core/src/composition/use-cases/archive-change.ts` `ArchiveChangeDeps` / `resolveArchiveChangeDeps`; `archiveBindings: registry.archiveBindings`; guard requires `archiveBindings` + `contentHasher`.
- Execute: `executeMatchingPredicates(this._archiveBindings, …)` then effects via `matchingEffects(..., 'before-persist'|'after-persist')`.
- `archive.archivable` runner: `packages/core/src/domain/checks/archive-archivable.ts` calls `change.assertArchivable()` (`archivable` **or** `archiving`).
- Overlap: application `createSpecOverlap` fails with code `OVERLAP_CONFLICT`; allow-overlap path `_invalidateOverlappingChanges` uses cause `'spec-overlap-conflict'` + `SYSTEM_ACTOR`.
- Deferred mutate: `assertArchivable()` then `transition('archiving')` if not already archiving.

### Discrepancies (evidence + spec-wrong vs code-wrong vs both + severity)

#### LOW — Verify factory scenario still names `regenerateMetadata`

**Evidence:** Preview verify.md scenario _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata or SaveSpecMetadata directly_ THEN still `regenerateMetadata: RegenerateSpecMetadata`. Spec.md factory requirement and first verify scenario require `materializeMetadata`. Code: `ArchiveChangeDeps.materializeMetadata` only.

**A (spec-wrong):** leftover heading from the port rename. **B (code-wrong):** factory should expose `regenerateMetadata` — contradicted by spec.md + `ArchiveChangeDeps`.

#### LOW — Constraints still say hook execution is delegated to `RunStepHooks`

**Evidence:** Spec.md Constraints: “Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly.” Adjacent requirement: MUST NOT take `RunStepHooks`; I/O lives on `createHookPre` / `createHookPost`. Spec Dependencies still list `core:run-step-hooks` and `core:regenerate-spec-metadata`.

**A:** constraint is leftover wording (hooks still _implemented_ via that use case **inside bindings**). **B:** ctor should take `RunStepHooks` — contradicted by bindings requirement + code.

#### LOW — `hasher?` still optional on ctor while factory requires `contentHasher`

**Evidence:** Spec constructor snippet still shows `hasher?: ContentHasher`. Runtime lock-less on-disk path needs hasher. Composition always injects `contentHasher`. No test that omitted hasher throws.

**A:** spec should mark hasher required. **B:** ctor optional is a test-friendly default — both: spec vs composition contract.

#### LOW — Constraint “assertArchivable before any hooks” vs check-table order

**Evidence:** Constraints: `change.assertArchivable()` must be called before any hooks. Execute runs **predicates** (including `archive.archivable`) then before-persist effects; entity `assertArchivable` also runs inside mutate before `archiving`. Product: archive is checks, not a hop — the **check** is the guard.

**A:** constraint should say “archive.archivable predicate before effects”. **B:** extra direct `assertArchivable` before predicates — code-wrong vs constraint only; aligned with “checks not a hop”.

### Test Coverage

| Requirement                                                        | Status                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Archive bindings, not `RunStepHooks`                               | Covered (`archive-change.spec.ts` / composition)  |
| Overlap throw vs `allowOverlap` invalidate `spec-overlap-conflict` | Covered                                           |
| Sealed `dependsOn` plan / lock / resolveInitial / extract          | Covered                                           |
| Empty-path publication preflight stays in use case                 | Covered                                           |
| Factory `archiveBindings` + `contentHasher`                        | Composition factory tests                         |
| Shared runners readOnly / deps / impl                              | Existing archive-change tests                     |
| Debug logging structured fields                                    | Partial (behavior tests more than log assertions) |

### Missing Tests

- Workspace-local `graph.excludePaths` only skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` equals lock list
- Lock-less on-disk archive without `ContentHasher` throws
- Config factory does **not** put `regenerateMetadata` on `ArchiveChangeDeps` (or rewrite stale verify scenario)
- `metadata.json` `dependsOn` must not become sealed set when lock or resolveInitial applies

### Spec Dependency Chain

- `core:change` — `assertArchivable` / `archiving` retry; overlap invalidation cause. Constraint on change still says “archivable is the only archive state” while this spec + entity allow `archiving` retry (**change spec-wrong**, see `core:change`).
- `core:spec-overlap` / `core:transition-checks` — live `OVERLAP_CONFLICT` vs review `spec-overlap-conflict`. **Aligned** with get-status composition comment (`archivable` only for live overlap).
- `core:storage` — staged archive / fs-cache index. **Aligned**.
- `core:validate-artifacts` — `markComplete` sole path. **Aligned**.
- `default:_global/architecture` — use case orchestrates ports; bindings composed in `composition-resolver`. **Aligned** for archive. Adapter-owned drift is storage’s issue.
- `default:_global/logging` — structured debug at archive steps. Spec lists fields; implementation emits `Logger.debug` with `change` / `specId` / step keys. Not exhaustively asserted.
- `core:lifecycle-engine` — archive does **not** inject engine; predicates are the registry. **Aligned** with “not a hop”.
- `core:composition-resolver` — `resolveArchiveChangeDeps` matches factory spec.md (except leftover verify).

### Summary counts

- Requirements reviewed: 31
- Confirmed: 27
- Discrepancies: 0 HIGH, 0 MEDIUM, 4 LOW
- Missing tests: 5 titles

---

## Spec: `core:validate-artifacts`

### Requirements Summary

Sole `markComplete` path. Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, hasher, extractors, routes — **preview still lists `LifecycleEngine`**. DAG: one `evaluateLifecycleVerdict` with empty `checksByTarget` at execute start; in-memory `markVerdictComplete`; MUST NOT persist-and-re-evaluate; MUST NOT run hop predicates. Baseline `validatedHash` drift is **not** this use case. Consent-hash scan after `get()` over `schema.artifacts()` (not `--artifact` scoped), `ActorResolver` not `SYSTEM_ACTOR`. Factory `contentHasher` **and still `lifecycle: LifecycleEngine`**. Traversal `artifactDag().topologicalOrder()`.

### Implementation Status

**Implemented for DAG + drift ownership; constructor/factory LifecycleEngine requirement is not implemented (product: no ctor injection).**

- Ctor 8 params, no `lifecycle`: `validate-artifacts.ts` ~137–155.
- `evaluateLifecycle(change, schema, { checksByTarget: {} })` then `markVerdictComplete` patches `state`/`effectiveStatus` to `'complete'` (`~221–235`).
- `resolveValidateArtifactsDeps` has no `lifecycle` field (`composition/use-cases/validate-artifacts.ts`).
- Baseline: `get()` first; consent loop over `schema.artifacts()`.
- Dependency failures use `findBlockingParent` + effective status from the in-memory verdict map.

### Discrepancies

#### MEDIUM — Spec still requires `LifecycleEngine` ctor + factory dep; code uses functions only

**Evidence:** Preview spec.md Ports/constructor and factory MUST resolve `lifecycle: LifecycleEngine`. Verify: _ValidateArtifacts is constructed with LifecycleEngine_; factory THEN-list includes `lifecycle`; DAG scenario THEN `LifecycleEngine.evaluate`.  
Code: no ctor param; composition omits it; tests construct without it; spy is `evaluateLifecycle` with `{ checksByTarget: {} }` (`validate-artifacts.spec.ts` _evaluates lifecycle with empty checksByTarget_). Deprecated class `LifecycleEngine` in `lifecycle-engine.ts` is a thin wrapper, unused here.

**A (spec-wrong, CODE WINS):** drop ctor/factory `lifecycle`; name `evaluateLifecycleVerdict` / `evaluateLifecycle` with empty `checksByTarget`. **B (code-wrong):** inject `LifecycleEngine` again — contradicts this change’s “no constructor injection” and composition-resolver pattern (`default:_global/architecture` / `core:composition-resolver`).

#### LOW — Spec names `evaluateLifecycleVerdict`; code calls `evaluateLifecycle`

**Evidence:** `evaluateLifecycle` wraps verdict and adds `nextAction` via `resolveLifecycleNextAction` (`lifecycle-evaluation.ts`). Empty `checksByTarget` means **no hop predicate execute**; `availableTransitions` stays empty. Extra hop **guidance** is computed but unused for validation.

**A:** spec should allow the application wrapper. **B:** call `evaluateLifecycleVerdict` / `projectArtifacts` only to avoid hop-shaped fields. Severity low: predicates are not run.

#### LOW — Leftover / duplicate verify titles

Preview still has stale headings (e.g. _Missing file can still carry hasDrift…_ with new GIVEN/THEN) plus _ValidateArtifacts does not compare missing files…_. Verify DAG text still says `LifecycleEngine.evaluate`.

#### LOW — No dedicated composition test for `resolveValidateArtifactsDeps`

Unlike archive, `packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` and **absence of `lifecycle`** unasserted at composition layer.

#### LOW — Consent-hash invalidation actor not asserted as non-`SYSTEM_ACTOR`

Spec requires `ActorResolver` identity. Tests assert invalidation happened, not `by !== SYSTEM_ACTOR`.

### Test Coverage

| Requirement                                   | Status                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| Empty `checksByTarget`                        | Covered                                                      |
| Same-execute parent then child; evaluate once | Covered (`toHaveBeenCalledTimes(1)`)                         |
| Does not own baseline drift                   | Covered                                                      |
| Consent scan not scoped to `artifactId`       | Covered                                                      |
| ListWorkspaces ctor                           | Used throughout                                              |
| Factory `contentHasher` / no `lifecycle`      | **Not** composition-tested                                   |
| Ctor without `LifecycleEngine`                | Implicit in unit tests, not a named scenario matching verify |

### Missing Tests

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher` and **excluding** `lifecycle`
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)
- In-memory `markVerdictComplete` does not re-run pending-parent cascade (spec forbids re-walk; patch is a map set)
- Constructor / factory **must not** require `LifecycleEngine` (or rewrite verify)

### Spec Dependency Chain

- `core:storage` — baseline drift on load; validate MUST NOT repeat. **Aligned** (CODE WINS).
- `core:lifecycle-engine` — DAG via `projectArtifacts` / evaluate with empty checks. **Behavior aligned**; **injection wording not aligned**.
- `core:change` — no `Change.effectiveStatus()`; engine-derived `pending-parent-artifact-review`. **Aligned**.
- `core:composition-resolver` — factory helper exists; spec still lists `lifecycle` on deps. **Spec-wrong**.
- `default:_global/testing` — WHEN/THEN in verify; leftover titles fail “scenario names the behavior”.
- `default:_global/architecture` — use case calls domain/application evaluate functions rather than a constructed engine. **Code matches architecture better than the ctor snippet.**

### Summary counts

- Requirements reviewed: 24
- Confirmed: 19
- Discrepancies: 0 HIGH, 1 MEDIUM, 4 LOW
- Missing tests: 4 titles

---

## Spec: `core:get-artifact-instruction`

### Requirements Summary

Read-only instruction assembly. Preview ctor still includes `LifecycleEngine`. Auto `artifactId` via `nextArtifact` from evaluate with empty `checksByTarget`; MUST NOT run hop predicates / gather snapshot bags. Factory MUST resolve `templateExpander` **and still `lifecycle: LifecycleEngine`**. Templates: spec says read path via `SchemaRegistry`; variables `change.name` + `change.path` only. Depends on `core:transition-checks` — no `gatherPredicateSnapshots`.

### Implementation Status

**DAG empty-checks path implemented; LifecycleEngine injection is not (product: no ctor injection).**

- Ctor 5 args: changes, specs map, schema, parsers, `templates` — `get-artifact-instruction.ts` ~68–80.
- Always `evaluateLifecycle(change, schema, { checksByTarget: {} })`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` (~99–102).
- `GetArtifactInstructionDeps` has no `lifecycle` (`composition/use-cases/get-artifact-instruction.ts`).
- Template: expands `artifactType.template` as string, no SchemaRegistry I/O.
- Auto-select tests cover topological first incomplete, parent-review blockage, all-complete `ArtifactNotFoundError`.
- Empty `checksByTarget` asserted inside template test via `evaluateLifecycle` spy (~99–105).

### Discrepancies

#### MEDIUM — Spec ctor/factory still require `LifecycleEngine`; code does not inject it

**Evidence:** Spec constructor block and `resolveGetArtifactInstructionDeps` MUST include `lifecycle: LifecycleEngine`. Verify: _GetArtifactInstruction is constructed with LifecycleEngine_; omitted-id scenarios name `LifecycleEngine.nextArtifact` / `LifecycleEngine.evaluate`.  
Code/composition: five-arg ctor; deps guard has no `lifecycle`. `markdown-parser-real-merge.spec.ts` even embeds the old verify heading as a string fixture.

**A (spec-wrong):** update ports/factory/verify to `evaluateLifecycle`/`evaluateLifecycleVerdict` + empty `checksByTarget`. **B (code-wrong):** inject engine — rejected by this change.

#### LOW — `evaluateLifecycle` vs `evaluateLifecycleVerdict`; hop fields unused

Same as validate: wrapper computes `nextAction` / `availableSteps` fallbacks without executing hop checks. Spec: MUST NOT evaluate hop availability. Predicates are not run; extra fields unused except `nextArtifact`.

**A:** allow wrapper. **B:** call `projectArtifacts` + `nextArtifact` helper only.

#### LOW — Template resolution: spec `SchemaRegistry` file read vs in-memory `ArtifactType.template`

**A:** schema load already inlined content. **B:** execute-time path read. Tests use inline template strings.

#### LOW — Ctor param `templates` vs spec `expander` vs deps `templateExpander`

Same hasher/`contentHasher` naming pattern. Not a behavior bug.

#### LOW — Always evaluates lifecycle even when `artifactId` is provided

Spec: use evaluate when resolving next/readiness. Code always evaluates. Harmless extra work; still empty `checksByTarget`.

### Test Coverage

| Requirement                                            | Status                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| Empty `checksByTarget`                                 | Covered (piggybacked on template expand)      |
| Auto-select topological / parent-review / all complete | Covered                                       |
| Change not found / schema mismatch / unknown id        | Covered                                       |
| Factory without `lifecycle`                            | Implicit only                                 |
| Ctor with `LifecycleEngine`                            | **Not** implemented; verify still requires it |

### Missing Tests

- Dedicated scenario: GetArtifactInstruction calls evaluate with empty `checksByTarget` and does **not** receive `LifecycleEngine`
- `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps` does not resolve `lifecycle`
- Omitted `artifactId` uses `nextArtifact` from evaluate, not declaration-order walk independent of engine (JSDoc on input still says “declaration order”)

### Spec Dependency Chain

- `core:lifecycle-engine` / `core:transition-checks` — empty checks, no hop predicates. **Behavior aligned**; injection **not**.
- `core:composition-resolver` — helper exists; spec extra `lifecycle` field. **Spec-wrong**.
- `core:template-variables` — no singular workspace. **Aligned** (test _does not expand change.workspace_).
- `core:delta-format` — `deltaInstructions()` / outlines. **Aligned**.
- `default:_global/testing` — verify still describes injected engine.

### Summary counts

- Requirements reviewed: 9
- Confirmed: 6
- Discrepancies: 0 HIGH, 1 MEDIUM, 4 LOW
- Missing tests: 3 titles

---

## Spec: `core:storage`

### Requirements Summary

Ports vs `fs` adapter. Artifact status derived at load from `validatedHash` + disk + `preHashCleanup`; drift invalidation when `artifactTypes.length > 0` via `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat baseline compare. **Artifact `requires` cascade owned by `LifecycleEngine.projectArtifacts` / `_effectiveStatus` — no `Change.effectiveStatus()`.** Load/save rewrite wire `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory. Archive pattern catalog, fs-cache indexes, locks under `configPath`, staged archive, debug logging.

### Implementation Status

**Implemented** for cascade ownership + wire coercion + load-time baseline drift.

- `projectArtifacts` / `effectiveStatus` in `lifecycle-verdict.ts` (~313–410); `Change` has **no** `effectiveStatus` method (`graph search` / entity Read).
- Load: `if (status === 'pending-parent-artifact-review') status = 'in-progress'` (`change-repository.ts` ~1422–1424).
- Save: `persistableArtifactStatus` maps parent-review → `in-progress` (~1700–1727).
- `ArtifactFile` constructor rejects persist of parent-review (`artifact-file.ts` ~52–54).
- Load invalidation ~SYSTEM_ACTOR (test _Hash mismatch on load invalidates with artifact-drift_).

### Discrepancies

#### LOW — Hexagonal layering vs `default:_global/architecture`

Invalidation **decision** lives in `FsChangeRepository` (infrastructure) calling domain `Change.invalidate`. After CODE WINS this is **required** by `core:storage`. Architecture still prefers use cases orchestrating ports.

**A:** adapter may apply persistence-time invariants using the entity. **B:** a dedicated application service should own drift before save. Product picks A.

#### LOW — Drift when canonical status is not `complete` under-tested

Spec: drifted if non-sentinel hash and not already review/skipped, and either complete-but-disk-not-complete **or** canonical not complete (including missing after validated file disappeared). Tests emphasize complete→mismatch more than missing-with-hash.

### Test Coverage

| Requirement                                                | Status                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Hash mismatch → invalidate `SYSTEM_ACTOR`                  | Covered                                                          |
| Uninitialized skip (`artifactTypes.length === 0`)          | Covered                                                          |
| Wire pending-parent-artifact-review → in-progress get/save | Covered (`change-repository.spec.ts`)                            |
| `ArtifactFile` rejects parent-review token                 | Covered (`artifact-file.spec.ts`)                                |
| Cascade not on `Change.effectiveStatus`                    | Implicit (no method); engine tests in `lifecycle-engine.spec.ts` |
| Archive pattern / fs-cache / locks                         | Pre-existing (not re-audited line-by-line)                       |

### Missing Tests

- Validated file absent on disk (`missing`) with non-sentinel `validatedHash` invalidates once with `SYSTEM_ACTOR` when types resolved
- Policy `none` on load: entity does not reopen but adapter still persists history (if not already only on `Change`)

### Spec Dependency Chain

- `core:lifecycle-engine` / `core:schema-format` — cascade. **Aligned** with code (`projectArtifacts`).
- `core:change` / `core:change-manifest` — persistable file states; parent-review not on wire after sanea. **Aligned**.
- `core:validate-artifacts` — MUST NOT repeat baseline. **Aligned**.
- `default:_global/architecture` — adapter-owned invalidate. **Tension (LOW)**.
- `default:_global/logging` — storage debug diagnostics. Pre-existing.

### Summary counts

- Requirements reviewed: 18 (change-touched status/cascade/drift + skim of indexes/patterns)
- Confirmed: 16
- Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW
- Missing tests: 2 titles

---

## Spec: `core:change`

### Requirements Summary

Entity owns persisted lifecycle, artifacts, approvals, invalidation. `VALID_TRANSITIONS` includes `archivable → archiving|designing|implementing|verifying`, `archiving → archivable|designing`, skill-aligned backward hops; archive is **not** a lifecycle from→to pair (see transition-checks). `pending-parent-artifact-review` engine-derived only; load/save **sanea** wire token to `in-progress`. Invalidation cause `spec-overlap-conflict` when another change archived with `allowOverlap`. `assertArchivable` / `isArchivable` cover `archivable` **and** `archiving`. Lifecycle interpretation authority: DAG/hops belong to `LifecycleEngine`, not the entity. Constraints still say “archivable is the only state from which a change may be archived”.

### Implementation Status

**Implemented** for transitions, parent-review persist rules, overlap cause, interpretation split.

- `VALID_TRANSITIONS` / `HAPPY_PATH_NEXT`: `change-state.ts` ~30–58 — matches lifecycle requirement.
- `isArchivable`: `state === 'archivable' || state === 'archiving'` (`change.ts` ~669–670); `assertArchivable` uses that getter.
- No `Change.effectiveStatus()`.
- History cause includes `spec-overlap-conflict` (`change.ts` ~95).
- Constraint line 435: “Archive is not a lifecycle from→to pair” — **aligned** with archive-as-checks.

### Discrepancies

#### LOW — Constraint “archivable is the only archive state” vs `isArchivable` + archive-change retry

**Evidence:** Constraints: “archivable is the only state from which a change may be archived; attempting to archive from any other state throws”. Signoff requirement: archive from non-archivable throws. Entity + `archive.archivable` + archive-change deferred retry **allow `archiving`**. Archive-change spec: retry when already `archiving`.

**A (spec-wrong):** constraints should say `assertArchivable` / `archivable|archiving`. **B (code-wrong):** reject archive unless `state === 'archivable'` — would break commit retry. CODE WINS retry.

#### LOW — Typo “sanea” in Artifacts requirement

Preview: “Load/save MUST **sanea** (coerce)”. Should be “sanitize” / “coerce”. Does not affect code (`persistableArtifactStatus`).

#### LOW — “Interpreted by `LifecycleEngine`” vs function-first API

Requirement: Lifecycle interpretation authority names `LifecycleEngine`. Code: `evaluateLifecycleVerdict` / `projectArtifacts`; class is `@deprecated`. Conceptual module vs ctor. Consistent with “no constructor injection” if read as the engine **module**, not a use-case dep.

**A:** reword to evaluate/projectArtifacts. **B:** keep class as the public facade — contradicted by deprecation + use cases.

### Test Coverage

| Requirement                                           | Status                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| VALID_TRANSITIONS / archiving escapes / backward hops | Covered (`change` / transition tests)                       |
| pending-parent not persistable on ArtifactFile        | Covered                                                     |
| Wire coerce on load/save                              | Covered (storage tests)                                     |
| spec-overlap-conflict invalidation                    | Covered via archive-change allow-overlap                    |
| Archive is not a hop                                  | Covered at check-registry / archive-change, not entity-only |
| isArchivable includes archiving                       | Implicit via archive retry tests                            |

### Missing Tests

- Entity-level: `assertArchivable` passes in `archiving` and fails in `done`
- Constraint vs retry: archive from `archiving` is allowed (if not only in archive-change.spec)

### Spec Dependency Chain

- `core:lifecycle-engine` — interpretation authority. **Aligned** (no entity cascade).
- `core:archive-change` / `core:transition-checks` — archive not a hop; overlap split. **Aligned** except “only archivable” constraint.
- `core:storage` / `core:change-manifest` — persistable states. **Aligned**.
- `core:spec-overlap` — live fail vs this cause for allow-overlap invalidation. **Aligned**.
- `default:_global/architecture` — rich entity invariants. **Aligned**.
- `default:_global/logging` — archive diagnostics in history. Indirect.

### Summary counts

- Requirements reviewed: 23 (spec.md unique headings; verify duplicates not double-counted)
- Confirmed: 20
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 2 titles

---

## Cross-cutting (globals + depth-1)

| Topic                              | Verdict                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive as checks not a hop        | **Code + archive-change + change constraint 435 aligned.** `VALID_TRANSITIONS['archivable']` still lists `archiving` as the commit state machine, not as `TransitionChange`’s happy-path “archive” hop.                                                                                                                          |
| Empty `checksByTarget` for DAG     | **Validate + GetArtifactInstruction call `evaluateLifecycle(..., { checksByTarget: {} })`.** Engine skips injected hop results when missing (`lifecycle-verdict.ts` ~170–174).                                                                                                                                                   |
| No LifecycleEngine ctor injection  | **Code/composition aligned.** **Validate + GetArtifactInstruction spec.md/verify still require injection (MEDIUM spec-wrong).**                                                                                                                                                                                                  |
| Overlap split                      | Live `OVERLAP_CONFLICT` (`domain/checks/spec-overlap.ts`); review/invalidation `spec-overlap-conflict` (archive invalidate + `reviewBlockersFromSummary` does **not** emit OVERLAP_CONFLICT for that reason — `lifecycle-verdict.ts` ~551–552). GetStatus composition: archive predicates only in `archivable` for live overlap. |
| Storage `projectArtifacts` cascade | **No `Change.effectiveStatus()`; cascade in `lifecycle-verdict.ts`.** Load/save rewrite parent-review token.                                                                                                                                                                                                                     |
| `default:_global/architecture`     | Composition helpers + manual DI. Storage load invalidate in adapter = residual LOW. Engine as functions > injecting deprecated class.                                                                                                                                                                                            |
| `default:_global/logging`          | Archive/validate/instruction emit structured `Logger.debug`. Not full WHEN/THEN coverage.                                                                                                                                                                                                                                        |
| `default:_global/testing`          | Stale verify scenarios (`LifecycleEngine` ctor, `regenerateMetadata`) fail “name the current behavior”.                                                                                                                                                                                                                          |

---

## Batch totals (this partial)

| Spec                            |    Reqs | Confirmed |  HIGH | MEDIUM |    LOW | Missing tests |
| ------------------------------- | ------: | --------: | ----: | -----: | -----: | ------------: |
| `core:archive-change`           |      31 |        27 |     0 |      0 |      4 |             5 |
| `core:validate-artifacts`       |      24 |        19 |     0 |      1 |      4 |             4 |
| `core:get-artifact-instruction` |       9 |         6 |     0 |      1 |      4 |             3 |
| `core:storage`                  |      18 |        16 |     0 |      0 |      2 |             2 |
| `core:change`                   |      23 |        20 |     0 |      0 |      3 |             2 |
| **Sum**                         | **105** |    **88** | **0** |  **2** | **17** |        **16** |

**Open MEDIUM (both spec-wrong, CODE WINS):** drop `LifecycleEngine` from `ValidateArtifacts` and `GetArtifactInstruction` constructors/factories/verify; document `evaluateLifecycle`/`evaluateLifecycleVerdict` + empty `checksByTarget` instead.

---

## Partial: workflow-approvals

# Partial audit: workflow / approvals / schema extras

**Mode:** change `workflow-transition-checks` (assigned batch)  
**Graph:** `stale: false`, `contentFresh: true` (`lastIndexedAt` 2026-08-28T17:21:07Z)  
**CLI:** `node packages/cli/dist/index.js`  
**Sources:** `changes spec-preview` for the six spec IDs; implementation via `graph search` / `graph impact` then targeted reads.  
**Read-only:** no code or spec files modified.

**Focus applied:** pending states drain-only; approval as checks not pending hops; hooks as check `execute`; schema `workflow[]` extras vs protocol membership.

**Consistency lens:** `default:_global/architecture` (domain vs application vs composition), `default:_global/logging`, `default:_global/testing`; deps `core:transition-checks`, `core:composition`, `core:kernel`, `HookRunner` port.

---

# Spec: `core:workflow-model`

## Requirements Summary

| ID    | Requirement                                  | Normative gist                                                                                                                                                            |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1  | Step names reference domain lifecycle states | `workflow[]` is extras lookup onto `ChangeState`. Omit ≠ delete protocol. Unknown `step` → `SchemaValidationError` at `buildSchema`. `workflowStep` null means no extras. |
| WM-2  | Step semantics                               | Designing / implementing / verifying outcomes / archiving atomic. Drift → designing.                                                                                      |
| WM-3  | Requires-based gating                        | `workflow.requires` with `to = effective`; complete **or** skipped; status and execute share evaluation.                                                                  |
| WM-4  | Task completion gating                       | `workflow.taskCompletion` via `CountTasks` / `createWorkflowTaskCompletion`; subset of `requires`; skip missing file / invalid regex.                                     |
| WM-5  | Step availability evaluation                 | `LifecycleEngine` / predicate projections; `GetStatus` reports; `CompileContext` MUST NOT evaluate hops.                                                                  |
| WM-6  | Workflow array order                         | Display + progress axis (`buildAxis` / `AXIS_FALLBACK` splice). `to=designing` is redesign; `archiving→archivable` is recovery.                                           |
| WM-7  | Step-to-state mapping                        | Step name IS target `ChangeState`.                                                                                                                                        |
| WM-8  | Hook execution at step boundaries            | Matching `run:` effects; pre `to=step`; post `from=step` + `along=forward`; before persist. Archive via operation `archive`.                                              |
| WM-9  | Two execution modes                          | Auto-run unless `skipHookPhases`; not a second engine.                                                                                                                    |
| WM-10 | Requires are artifact IDs                    | Not step names; `buildSchema` rejects step-as-require.                                                                                                                    |

## Implementation Status

| ID    | Status                                    | Evidence                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1  | Implemented                               | `buildSchema` rejects unknown steps (`workflow step '…' is not a valid lifecycle state`); `Schema.workflowStep` Map lookup; `VALID_TRANSITIONS` keys remain protocol. `lifecycle-engine.spec.ts`: omit `implementing` → no extras row, hop still protocol-evaluated. |
| WM-2  | Partial                                   | Routing outcomes live in skills/guidance + `TransitionChange` invalidate-on-designing. No dedicated domain enum for `implementation-failure` vs `artifact-review-required` as transition inputs.                                                                     |
| WM-3  | Implemented                               | `domain/checks/workflow-requires.ts`: skip if no row or empty requires; fail unless `complete`/`skipped`. Shared via bindings on `GetStatus` / `TransitionChange`.                                                                                                   |
| WM-4  | Implemented                               | `createWorkflowTaskCompletion` + `CountTasks`; `buildSchema` subset + `hasTasks`.                                                                                                                                                                                    |
| WM-5  | Implemented                               | `GetStatus` copies engine `availableTransitions` / `availableSteps`. `CompileContext` JSDoc: hook instructions are `GetHookInstructions`, not this UC. `compile-context.spec.ts` asserts no `stepAvailable`.                                                         |
| WM-6  | Implemented (in `core:transition-checks`) | `buildAxis` in `transition-checks.ts`; redesign/recovery classified there.                                                                                                                                                                                           |
| WM-7  | Implemented                               | `TransitionChange` `input.to` is `ChangeState`.                                                                                                                                                                                                                      |
| WM-8  | Implemented                               | Bindings: `hook.post` forward + `before-persist`/`abort`; `hook.pre` `*` except recovery. `HookEffectCheck.execute` → `RunStepHooks`.                                                                                                                                |
| WM-9  | Implemented                               | `skipHookPhases` on effect checks; predicates still run (`transition-change.spec.ts`).                                                                                                                                                                               |
| WM-10 | Implemented                               | `requires` typed as artifact IDs; `buildSchema` validates IDs against artifacts.                                                                                                                                                                                     |

## Discrepancies

1. **`hasTasks` vs `taskCompletionCheck` (spec-wrong vs spec-internal)**  
   WM-4 / `WorkflowStep` JSDoc require listed IDs to declare `taskCompletionCheck`. `core:schema-format` and `buildSchema` require `hasTasks: true` only. Code follows schema-format. An artifact can have `hasTasks` without `taskCompletionCheck`.
   - If specs should be identical: **workflow-model spec-wrong**.
   - If both flags must hold: **code-wrong** (missing `taskCompletionCheck` check).

2. **`core:schema-format` Workflow vs WM-3 (spec-wrong on schema-format)**  
   Schema-format says requires must be `complete`. Workflow-model and `workflow-requires` allow `skipped`. Code matches workflow-model.

3. **Step-semantics scenarios (both / underspecified in code)**  
   Verify scenarios (`implementation-failure` → implementing, `artifact-review-required` → designing) are agent/skill routing, not `TransitionChange` inputs. Code implements designing-return invalidation, not named verification outcomes. Spec reads as product behavior; core does not encode those labels.

4. **Architecture**  
   Domain stubs (`workflowRequires.execute`) vs application `create*` I/O: matches hexagonal split. Axis/`along` live in `transition-checks`, not this spec’s files — acceptable dependency, not a layering break.

## Test Coverage

- Unknown step: `build-schema.spec.ts` (`reviewing`).
- Omit implementing extras: `lifecycle-engine.spec.ts`.
- Requires complete/skipped/incomplete: domain + transition/get-status suites.
- Task completion + CountTasks: `transition-change.spec.ts`, `get-status.spec.ts`, `workflow-check-factories.spec.ts`.
- CompileContext no hop field: `compile-context.spec.ts`.
- Hooks auto/skip/along: `transition-change.spec.ts`, `archive-change.spec.ts`.

## Missing Tests

- `buildSchema` fixture: `workflow[]` lists only `designing`+`ready` and **asserts** `implementing` remains a `ChangeState` (engine test covers extras; schema-format verify scenario is thin).
- Explicit `workflow.requires` skip when `workflowStep(to)===null` (implied by omit-implementing engine test, not named at check unit).
- Named verification-outcome routing (if those WM-2 scenarios are in-scope for core).
- `requiresTaskCompletion` artifact with `hasTasks` but no `taskCompletionCheck` (documents intended invariant).

## Spec Dependency Chain

- Declared: `core:transition-checks` (axis, check ids, along).
- Implicit: `core:change` (states), `core:schema-format` / `core:build-schema`, `core:hook-execution-model`, `core:compile-context`, `core:get-status`.
- **Consistency:** WM extras-vs-protocol matches `transition-checks` / design. Tension with schema-format `requires: complete` only and `hasTasks` vs `taskCompletionCheck`.

## Summary

- Requirements: **10**
- Implemented: **8** (WM-2 partial counted separately)
- Partial: **1** (WM-2)
- Missing: **0**
- Discrepancies: **3** (1 spec-internal/code fork, 1 schema-format vs this spec, 1 semantic routing)
- Test gaps: **4**

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID    | Requirement                           | Normative gist                                                                                                       |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------- | ---- | --------------------------------------------------------- |
| HE-1  | Two hook types                        | `instruction:` vs `run:`; mutually exclusive at schema.                                                              |
| HE-2  | Explicit external hooks               | `external: { type, config }`; `HookRunner` shell-only; unknown type fails.                                           |
| HE-3  | External hooks follow phase semantics | Same pre fail-fast / post collect-or-abort as shell.                                                                 |
| HE-4  | instruction hooks passive             | Skipped by Transition/Archive/`RunStepHooks`; `GetHookInstructions` only; not predicates/effects.                    |
| HE-5  | Default execution                     | Effects after predicates; binding `phase`/`onFailure`; `RunStepHooks` ctor dep of hook checks; no id-switch launch.  |
| HE-6  | Two modes for run                     | Standalone fail-fast pre / fail-soft post; UC uses binding `onFailure`. Transition `hook.post` abort before persist. |
| HE-7  | Change entity does not execute hooks  | Application layer; auto-run still required.                                                                          |
| HE-8  | Manual skipHooks                      | Transition: `source.pre                                                                                              | post`, `target.pre | post`, `all`. Archive: `pre | post | all`. `source.pre`/`target.post` no-ops on current table. |
| HE-9  | Pre-hook failure                      | Fail-fast; Transition/Archive `HookFailedError`; standalone CLI 2.                                                   |
| HE-10 | Post-hook failure                     | Binding `abort` vs `collect`. Archive post collect after persist.                                                    |
| HE-11 | Ordering                              | Schema hooks then project overrides, declaration order.                                                              |
| HE-12 | Template expansion                    | `change.name/path`, `project.root`; no `change.workspace`; unknown left literal; shell-escaped.                      |

## Implementation Status

| ID      | Status      | Evidence                                                                                                                                                                     |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HE-1    | Implemented | `HookEntry` union; schema YAML Zod.                                                                                                                                          |
| HE-2    | Implemented | `RunStepHooks` + `ExternalHookRunner` map; `ExternalHookTypeNotRegisteredError`.                                                                                             |
| HE-3    | Implemented | Same `HookEffectCheck` / `_executeHooks` phase loops.                                                                                                                        |
| HE-4    | Implemented | `_collectHooks` filters run/external; instructions via `GetHookInstructions`.                                                                                                |
| HE-5    | Implemented | `createHookPre`/`createHookPost({ runStepHooks })`; `TransitionChange._executeEffect` calls `binding.check.execute` (no `hook.pre` switch). Bindings in `check-bindings.ts`. |
| HE-6    | Implemented | `RunStepHooks` phase policy vs effect `onFailure` + `throwHookFailed`.                                                                                                       |
| HE-7    | Implemented | `Change` has no `HookRunner`.                                                                                                                                                |
| HE-8    | Implemented | `HookEffectCheck` skip set: `all`, archive `pre`/`post`, transition `target.pre`/`source.post` only. Tests for no-op selectors.                                              |
| HE-9–10 | Implemented | Archive/transition specs + tests.                                                                                                                                            |
| HE-11   | Implemented | Schema merge / overrides (schema-format + merge tests).                                                                                                                      |
| HE-12   | Implemented | `HookRunner` / template-variables specs; tests for unknown + no workspace.                                                                                                   |

## Discrepancies

1. **`workflow-step.ts` comments vs HE-4 (code-wrong comments / spec-right)**  
   Comments still say `instruction:` hooks “inject text into the compiled agent instruction block” / “compiled context block”. `CompileContext` class JSDoc and HE-4 say the opposite (`GetHookInstructions` only). Runtime matches spec; **comments are stale** (documentation drift in domain VO, not behavior).

2. **schema-format verify “Post hook failure prompts user / not rolled back” vs HE-6/HE-10 (spec-wrong on schema-format)**  
   Transition `hook.post` is `abort` + `before-persist` (state not persisted). Archive post is collect after persist. Generic “prompt user” is CLI-era wording, not core.

3. **Logging**  
   Hook progress maps to check-progress events; Transition uses `Logger.debug` for routing. Compatible with `default:_global/logging`. No finding.

## Test Coverage

- `workflow-check-factories.spec.ts`: hook execute uses `RunStepHooks`.
- `transition-change.spec.ts`: skip `all` / `target.pre` / `source.post` / no-op `source.pre`/`target.post`; predicates still run with skip all.
- `archive-change.spec.ts`: skip pre/post/all; post collect.
- Run-hooks CLI/use-case tests for instruction skip and fail-soft post.

## Missing Tests

- Dedicated `hook-effect.ts` unit file (behavior covered via factories + transition).
- Recovery `archiving → archivable` omits `hook.pre`/`hook.post` (`exceptAlong: recovery`) at effect execute (binding matcher tests exist in transition-checks suite; confirm coverage of execute skip vs unmatched).
- Comment/JSDoc drift not testable.

## Spec Dependency Chain

- `core:transition-checks` (bindings, along, phase/onFailure).
- `core:workflow-model`, `core:template-variables`, `core:change`.
- Ports: `HookRunner`, `ExternalHookRunner`.
- Composition: `workflow-check-registry` injects `createRunStepHooks`.
- **Kernel:** effects composed with use cases, not entity methods. Aligns with architecture.

## Summary

- Requirements: **12**
- Implemented: **12**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (stale VO comments; schema-format verify leftover)
- Test gaps: **2**

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                 | Normative gist                                                                                                                            |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                  | Disabled → `ApprovalGateDisabledError` `'spec'`, no repo I/O; then get/actor/schema/mismatch.                                             |
| AS-2 | Change lookup               | Missing → `ChangeNotFoundError`.                                                                                                          |
| AS-3 | Artifact hashes             | Skip missing/skipped; null load skip; cleanup then hash; `type:key` keys.                                                                 |
| AS-4 | Recording and transition    | `recordSpecApproval`; **no** hop to pending/`spec-approved` from bound `from` (`ready`); drain `pending-spec-approval` → `spec-approved`. |
| AS-5 | Persistence                 | `mutate`; return updated Change.                                                                                                          |
| AS-6 | Input                       | `name` + `reason` only.                                                                                                                   |
| AS-7 | Gates baked at construction | `ApprovalGates` from `config.approvals`.                                                                                                  |
| AS-8 | Factory                     | `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`.                                                                        |

## Implementation Status

| ID   | Status      | Evidence                                                                                     |
| ---- | ----------- | -------------------------------------------------------------------------------------------- |
| AS-1 | Implemented | Gate first; `get` not called when disabled (`approve-spec.spec.ts`).                         |
| AS-2 | Implemented |                                                                                              |
| AS-3 | Implemented | `_computeArtifactHashes` inside mutate on **fresh** change.                                  |
| AS-4 | Implemented | `boundFromStates('approval.spec')` + drain branch; no `transition('pending-spec-approval')`. |
| AS-5 | Implemented | `mutate` once.                                                                               |
| AS-6 | Implemented | `ApproveSpecInput`.                                                                          |
| AS-7 | Implemented | Ctor + kernel `resolveApproveSpecDeps` → `resolver.config.approvals`.                        |
| AS-8 | Implemented | `composition/use-cases/approve-spec.ts`.                                                     |

Happy path is **consent in `ready`**, not a pending hop. `approval.spec` predicate (`domain/checks/approval-spec.ts`) gates **forward leave of ready**. Aligns with `core:config` / `core:transition-checks`.

## Discrepancies

1. **Hash-then-mutate order (spec-wrong)**  
   Spec Persistence: compute hashes **then** `mutate`. Code hashes **inside** the mutate callback on `freshChange`. Safer vs TOCTOU; tests assert `mutate` + ready stays `ready`. Treat as **spec wording lag**.

2. **“Obtain schema once” (minor code vs spec)**  
   Gate calls `schemaProvider.get()`; hashes call `get()` again. Not forbidden strongly; slight duplication.

3. **Architecture**  
   Use case in application; `boundFromStates` from domain `check-bindings` — avoids hardcoding `ready`. Matches composition/kernel. **No layering violation.**

4. **Testing names**  
   Drain tests still dominate hashing/persist; ready-path persist-through-mutate is only implied by the ready consent test (no dedicated `mutate` spy on ready).

## Test Coverage

- Ready stays `ready` + event.
- Drain → `spec-approved`.
- Disabled gate no `get`.
- Drafting → `InvalidStateTransitionError`.
- Schema mismatch before mutate.
- Not found.
- Composition factory instance + deps form.

## Missing Tests

- Schema `get()` throw propagates (verify: Schema resolution failure).
- Cleanup-rule vs no-cleanup hashing (verify: two artifact types).
- Null artifact skip not in hash map.
- `createApproveSpec(config)` receives `config.approvals` (spy / baked-gate), not only `toBeInstanceOf`.
- Ready-path `mutate` spy (verify Persistence scenario names `ready`).
- Input-type compile-only (acceptable).

## Spec Dependency Chain

- `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks` (`from` for `approval.spec`).
- **Consistent** with drain-only pending + in-place consent.

## Summary

- Requirements: **8**
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (order wording; double schema get)
- Test gaps: **5**

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec for signoff: gate `'signoff'`; `recordSignoff`; stay in **`done`**; drain `pending-signoff` → `signed-off`; `approval.signoff` bound `from=done`, `to=archivable`, `along=forward`.

## Implementation Status

Symmetric to ApproveSpec (`approve-signoff.ts`, `resolveApproveSignoffDeps`, kernel). Drain-only pending. No happy-path `pending-signoff` hop.

## Discrepancies

Same hash-inside-mutate and double `schemaProvider.get()` as ApproveSpec (**spec-wrong** order vs **code-right**).

Test describe `'given the change is not in pending-signoff state'` covers drafting (also not `done`) — **test title drift**, behavior matches verify “not in done or pending-signoff”.

## Test Coverage

Parallel to ApproveSpec (`approve-signoff.spec.ts`, composition factory).

## Missing Tests

Same five gaps as ApproveSpec, plus: factory baked `approvals.signoff`; schema throw; cleanup hashing; null skip; `mutate` spy on **done** happy path.

## Spec Dependency Chain

Same as ApproveSpec with `approval.signoff` bindings. Consistent with config: stay in `done`; pending drain-only.

## Summary

- Requirements: **8**
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (mutate order; test title)
- Test gaps: **5**

---

# Spec: `core:schema-format`

## Requirements Summary (change-relevant + rest)

Full spec is the YAML contract (kind, extends, artifacts, DAG, cleanup, `taskCompletionCheck`, templates, validations, metadata, scope, **Workflow**, external hooks, plugins, resolve, load validation, verify.md format).

**Change-critical Workflow (SF-W):** `workflow[]` attaches extras to existing states; MUST NOT define occupancy set or hops; omit MUST NOT delete protocol; unknown `step` MUST NOT occupy axis; `buildSchema` `SchemaValidationError`; `requiresTaskCompletion` invariant `hasTasks: true`; hooks pre/post.

## Implementation Status

| Area                                          | Status      | Evidence                                                                        |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| File/kind/extends/artifacts/DAG               | Implemented | Parser + `buildSchema` + registry tests.                                        |
| `taskCompletionCheck` / `hasTasks`            | Implemented | Artifact type + schema-format verify.                                           |
| Workflow extras vs protocol                   | Implemented | `buildSchema` valid-state check; `WorkflowStep` docs; engine omit-implementing. |
| Unknown step                                  | Implemented | `reviewing` test.                                                               |
| External hook YAML                            | Implemented | Parser + execution registry.                                                    |
| CompileContext MUST NOT evaluate availability | Implemented | No `stepAvailable`; separate GetStatus.                                         |

## Discrepancies

1. **Requires wording vs workflow-model / code (spec-wrong)**  
   “must be `complete`” omits `skipped`. Code: `complete` \| `skipped`.

2. **Post-hook verify scenarios (spec-wrong)**  
   “prompt user / do not roll back” conflicts with transition `hook.post` abort-before-persist (`core:hook-execution-model`). Archive post collect matches “not rolled back” only for archive.

3. **Pre-hook verify “agent offers to fix” (spec-wrong / CLI)**  
   Core throws `HookFailedError`; offer-to-fix is skill/CLI, not schema-format runtime.

4. **`SchemaRegistry.resolve()` vs `buildSchema` for unknown step**  
   Spec text uses both. Code rejects at `buildSchema` (called from resolve). **Aligned** if resolve always builds.

5. **Architecture**  
   YAML at infra (`schema-yaml-parser`); semantic workflow membership in domain `buildSchema`. Matches architecture (validate at boundary + domain invariants).

## Test Coverage

- Unknown step, hook ids, `requiresTaskCompletion`/`hasTasks`, omitted-step **engine** behavior.
- CompileContext no availability field.
- Broad schema-yaml-parser / schema-registry / build-schema suites for non-workflow requirements (not re-audited line-by-line here; no contradiction found with architecture).

## Missing Tests

- schema-format verify: omitted `implementing` still a ChangeState **at `buildSchema` return** (engine-only today).
- Axis: unknown name never appears in `buildAxis` (transition-checks tests cover `reviewing` on axis if it slipped through — should be unreachable).
- GetStatus blocked hop + CompileContext jointly (split across files).

## Spec Dependency Chain

- `core:workflow-model`, `core:transition-checks`, `core:build-schema`, `core:hook-execution-model`.
- **Inconsistency:** complete-only requires; post-hook UX verify vs effect bindings.

## Summary

- Requirements: **22** (spec.md `### Requirement` count before verify.md duplicate)
- Implemented: **22** (behavior); **2** workflow verify scenarios stale vs engine
- Partial: **0** implementation; **verify.md Workflow hook UX** stale
- Missing: **0** features
- Discrepancies: **3** (requires complete; post/pre hook UX; vs workflow-model)
- Test gaps: **3**

---

# Spec: `core:config`

## Requirements Summary (change-relevant)

**Approvals:** defaults `spec`/`signoff` false; when true, wait is **check** on `ready` / `done`, stay in those states; redesign `ready → designing` MUST NOT require spec gate; omitted `implementing` still `ready → verifying` needs spec consent; **no** happy-path pending hops; drain pending remains legal; `change transition` to pending is never next-action.

Other requirements (file location, privacy, env, workspaces, storage, plugins, context, logging, LLM, writer port, startup, legacy) are unchanged by this change’s intent.

## Implementation Status

| Area                       | Status      | Evidence                                                                       |
| -------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Approvals parse/default    | Implemented | `config-loader.ts`: `data.approvals?.spec ?? false`. Tests parse `spec: true`. |
| In-place checks            | Implemented | `approval.spec` / `approval.signoff` bindings; Approve\* stay in ready/done.   |
| Redesign without spec gate | Implemented | `approval.spec` `along: forward` only (`check-bindings.ts`).                   |
| Kernel wiring              | Implemented | `resolver.config.approvals` into Transition/GetStatus/Approve\*.               |
| Logging section            | Implemented | Defaults `info`; `Logger` used in TransitionChange.                            |

## Discrepancies

1. **Approvals verify “config MUST NOT be documented as requiring a pending hop”**  
   This is a **docs** constraint. Living docs are out of this batch’s files; not verified here. Code/config types do not mention pending as required.

2. **Missing default-false unit test**  
   Loader implements `?? false`. `config-loader.spec.ts` tests explicit true/false parse; **no** dedicated “section omitted → both false” case (verify scenarios exist).

3. **Architecture**  
   Config load infra → `SpecdConfig` application type → composition. Approvals consumed as ctor deps. Aligns with composition spec.

## Test Coverage

- Parse approvals booleans.
- Transition/get-status with gates on (in-place wait).
- Logging level present/absent in config-loader (other describes).

## Missing Tests

- Omit `approvals` key → `{ spec: false, signoff: false }`.
- `approvals.spec: true` + `ready → designing` does not fail `approval.spec` (may live in transition-checks/transition-change; flag if absent as named config scenario).
- Docs audit for pending-hop language (out of code).

## Spec Dependency Chain

- `core:transition-checks`, `core:approve-spec`, `core:approve-signoff`, `core:workflow-model` (omit implementing still gated on forward leave ready).
- **Consistent** with drain-only pending and checks-not-hops.

## Summary

- Requirements: **27** (spec.md unique names)
- Implemented: **27** (Approvals + rest assumed present; this batch did not re-verify every workspace/graph paragraph)
- Partial: **0** for Approvals behavior
- Missing: **0**
- Discrepancies: **1** (docs scenario not code-checked)
- Test gaps: **2** (default false; named redesign+gate)

---

# Cross-cutting: architecture / logging / testing / deps

| Topic                    | Finding                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture             | Application checks (`HookEffectCheck`, Approve*) use ports; domain owns bindings/`along`/`VALID_TRANSITIONS`; composition `resolve*Deps` + kernel. No IoC. **Compliant.** |
| Logging                  | TransitionChange `Logger.debug` for engine routing. Approve\* silent. Logging config in `core:config`. **Compliant** (no extra console).                                  |
| Testing                  | Vitest, `test/` mirrors, mocked ports. Approve tests use `vi.fn()` spies. **Compliant** with gaps listed.                                                                 |
| `transition-checks`      | Bindings match specs: approval from ready/done; hooks phase/onFailure; requires/taskCompletion except recovery.                                                           |
| `composition` / `kernel` | `createApproveSpec(resolveApproveSpecDeps(resolver))` and signoff analog; check registry wires `CountTasks` + `RunStepHooks`.                                             |
| `HookRunner`             | Shell-only port; effects do not call it directly — `RunStepHooks` does. **Matches HE-2/HE-5.**                                                                            |

---

# Batch totals (this partial)

| Spec                        |   Reqs |   Impl | Partial | Missing impl | Discrepancies | Test gaps |
| --------------------------- | -----: | -----: | ------: | -----------: | ------------: | --------: |
| `core:workflow-model`       |     10 |      8 |       1 |            0 |             3 |         4 |
| `core:hook-execution-model` |     12 |     12 |       0 |            0 |             2 |         2 |
| `core:approve-spec`         |      8 |      8 |       0 |            0 |             2 |         5 |
| `core:approve-signoff`      |      8 |      8 |       0 |            0 |             2 |         5 |
| `core:schema-format`        |     22 |     22 |       0 |            0 |             3 |         3 |
| `core:config`               |     27 |     27 |       0 |            0 |             1 |         2 |
| **Sum**                     | **87** | **85** |   **1** |        **0** |        **13** |    **21** |

**Focus verdict:** Pending parking is drain-only in Approve\* and config/transition bindings. Approval is predicate checks, not happy-path hops. Hooks run as effect `execute` via `RunStepHooks`. `workflow[]` is extras lookup; protocol membership stays `ChangeState`/`VALID_TRANSITIONS`. Remaining issues are spec wording collisions (`complete` vs `skipped`, `hasTasks` vs `taskCompletionCheck`, schema-format hook UX) and test holes (hash cleanup, schema throw, omitted-step at `buildSchema`, approvals default).

---

## Partial: cli-skills

# Partial audit: CLI + skills (change `workflow-transition-checks`)

- **Mode:** change spec-preview (not archived workspace `specs/` alone)
- **Change:** `workflow-transition-checks`
- **Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`
- **Globals checked:** `default:_global/architecture` (adapters contain no business logic; CLI/MCP/plugins delegate to core via SDK), `default:_global/testing` (Vitest; `test/` mirrors `src`; given/when/then names)
- **Graph:** index fresh (`stale: false`, 2026-08-28T17:21:07.186Z). Navigation via `graph search` / `graph impact` on CLI/skills surfaces (`registerChangeStatus`, `registerChangeTransition`, `registerChangeApprove`, `registerChangeArchive`, `createCheckProgressPresenter`, `createHookProgressPresenter`, skill templates).
- **Core deps:** `@specd/cli` depends on `@specd/sdk` (not `@specd/core`). `@specd/skills` depends on `@specd/core` (allowed: plugin-\* → skills → core). CLI command modules import SDK types/use cases only.

---

## cli:change-status

### Requirements Summary

Change preview (`changes spec-preview workflow-transition-checks cli:change-status`):

| #   | Requirement                                      | Intent                                                                                                            |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                                | `change status <name> [--format text\|json\|toon]`                                                                |
| 2   | Drafted change status is read-only               | No mutate transitions; mark drafted; MAY show artifact statuses                                                   |
| 3   | Output format                                    | `artifactDag[].hasTasks`; DAG `state` is display projection                                                       |
| 4   | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                  |
| 5   | Display-state rendering                          | Text prefers display; JSON includes canonical + display                                                           |
| 6   | Lifecycle projections come from GetStatus checks | No local `VALID_TRANSITIONS` filter; render `availableTransitions` / `nextAction` from GetStatus                  |
| 7   | Text status omits duplicated review file lists   | Review header without file paths; overlap peers still print; no `OVERLAP_CONFLICT` line for invalidation          |
| 8   | Text blockers include check labels               | `! CODE — label: message`; JSON `label`/`checkId`                                                                 |
| 9   | Schema version warning                           | stderr; compare recorded vs `lifecycle.schemaInfo`; skip if null; exit 0                                          |
| 10  | Change not found                                 | exit 1, `error:`                                                                                                  |
| 11  | Schema-derived fields                            | Nested `schema.artifactDag` via `childrenOf`/`roots`; text DAG uses display status; convergent nodes at most once |
| 12  | Delegates refresh policy to GetStatus            | No direct `RefreshImplementationTracking` / `ImplementationDetector`                                              |
| 13  | Implementation section                           | `--implementation` uses SDK `buildImplementationReview`; no independent graph matching                            |
| 14  | Task completion in details                       | `tasks: N/M`                                                                                                      |
| 15  | Basic info section                               | Name + state; no standalone `specs:` line                                                                         |
| 16  | Specs and dependencies                           | Text section + JSON `specDependsOn`                                                                               |

**Constraints:** Serialize Core/SDK results; do not recompute lifecycle; do not second-filter `availableTransitions`.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`, lines 81–519) plus `renderDag` (529–597) and `enrichImplementationTracking` (`_implementation-tracking.ts` → `buildImplementationReview`).

- Invokes `kernel.changes.status.execute({ name })` only (default refresh). Tests assert `refreshImplementationTracking.execute` is not called.
- Text: DAG from `schema.artifactDag()` when `getActiveSchema` returns a live schema; fallback `ArtifactDag.from(schemaInfo.artifacts)`. Display status in DAG and details. Blocker labels. Review header without `affectedArtifacts` paths. Overlap section from `overlapDetail`. Filters `OVERLAP_CONFLICT` in **text** when `review.reason === 'spec-overlap-conflict'` (explicit presentation rule in this spec, not a local protocol graph).
- JSON: `artifactDag[].state` from `displayStatus`; artifacts include `state` + `displayStatus`; `blockers[].label`/`checkId`; full `review` including `overlapDetail`; help text lists `overlapDetail` beside `affectedArtifacts`.
- `--implementation` delegates to SDK; `graphHint` is presentation-only.
- **No `@specd/core` import.** Schema version warning uses `lifecycle.schemaInfo` vs `change.schemaName@version` (does not independently resolve schema for the warning). `getActiveSchema` is used only for DAG children/roots (allowed by Schema-derived fields).

Drafted path: `isDrafted: true` in JSON; text `state: … (drafted)` and `transitions: (none — change is drafted)`.

### Discrepancies

| ID   | Verdict                                     | Severity | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS-1 | **code-wrong**                              | low      | Drafted text still prints `next action:` / `command:` from GetStatus. Spec: MUST NOT print **actionable lifecycle transitions** that would mutate a draft. CLI hardcodes empty `transitions:` but does not suppress `nextAction.command` if Core ever returns one. Tests only cover `command: null`. Alternative reading: CLI is a presenter of GetStatus (constraint: do not recompute). Prefer adding a presentation guard or specifying that GetStatus must null the command for drafts. |
| CS-2 | **spec-wrong** (help vs body)               | low      | `--help` JSON sketch lists `schema: { name, version }` without `artifactDag`, while Requirement Schema-derived fields and the handler emit `schema.artifactDag`. Review help **does** list `overlapDetail` as required.                                                                                                                                                                                                                                                                     |
| CS-3 | **code-wrong** vs `default:_global/testing` | low      | `status.spec.ts` names are mostly phrase titles, not `given…, when…, then…`. Widespread CLI pattern, not unique to this change.                                                                                                                                                                                                                                                                                                                                                             |
| CS-4 | **compliant** (called out)                  | —        | Text filter of `OVERLAP_CONFLICT` is specified presentation, not lifecycle recomputation. Architecture “no business logic in CLI” holds if this stays a display rule tied to `review.reason`.                                                                                                                                                                                                                                                                                               |

No high/critical implementation bugs found against the **change preview**. Archived `specs/cli/change-status` on disk may lag the preview until archive.

### Test Coverage

`packages/cli/test/commands/change/status.spec.ts` (mirrors `src/commands/change/status.ts`): drafted JSON/text, signature, DAG/hasTasks/drift state, implementation flag, schema mismatch warning, not-found, overlap/review/drift file-list omission, details `tasks: N/M`, blockers with labels (overlap path).

Additional overlap with `change.spec.ts` and implementation-review integration tests.

### Missing Tests

- Verify scenario **nextAction implements vs verify follows GetStatus** (CLI must not substitute `/specd-implement` when GetStatus says `/specd-verify`).
- Verify scenario **text DAG does not repeat convergent nodes** (schema-std `design` under proposal and specs).
- Verify scenario **DEPS_INCONSISTENT — Checking spec dependencies** (label format is covered via overlap blockers, not this code).
- Schema warning skipped when `lifecycle.schemaInfo` is `null`.
- Drafted `nextAction.command` non-null must not print a `change transition` line (CS-1).

### Spec Dependency Chain

- `cli:entrypoint` — output/exit conventions
- `core:change` — state model
- `core:get-status` — projections (`availableTransitions`, `nextAction`, blockers, review)
- `sdk:build-implementation-review` — `--implementation`
- Globals: architecture (presenter/adapter), testing (layout/names)

### Summary counts (`cli:change-status`)

- Requirements: **16**
- Implemented: **16** (CS-1 residual on drafts)
- Missing: **0**
- Partial: **1** (draft nextAction)
- Discrepancies: **3** (1 low code, 1 low spec-help, 1 low testing names)
- Covered by tests: **14**
- Untested / weakly tested requirements: **2** (lifecycle nextAction passthrough; convergent DAG)

---

## cli:change-transition

### Requirements Summary

Change preview (supersedes on-disk `specs/cli/change-transition` routing table):

| #   | Requirement                       | Intent                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                 | `<name> [step]`, `--next`, `--skip-hooks`, `--allow-out-of-scope`, `--format`; alias `change`/`changes` |
| 2   | Next-transition resolution        | `to: 'next'` to `TransitionChange`; **no** CLI from→to table; **no** `GetStatus.nextAction` as resolver |
| 3   | Delegates refresh policy          | No detector/refresh in CLI; pre/post GetStatus `refreshImplementationTracking: false`                   |
| 4   | Approval-gate routing             | No gate flags on execute; no rewrite to pending parking                                                 |
| 5   | Hook execution                    | Map `--skip-hooks` to `skipHookPhases`                                                                  |
| 6   | Progress output                   | Generic check bus; **no** `stream: "hook-progress"`; structured `stream: "change-transition"`           |
| 7   | Transition hook observability     | Surface hook progress before failure                                                                    |
| 8   | Shared hook progress presentation | Transition uses check presenter; `run-hooks` MAY keep hook-progress stream                              |
| 9   | Output on success                 | Text confirmation; JSON terminal `complete` on same stream                                              |
| 10  | Post-hook failure                 | exit 2, `error:`; not a post-transition warning                                                         |
| 11  | Invalid transition error          | Repair guide on stderr from GetStatus; `HookFailedError` no guide, exit 2                               |
| 12  | Incomplete tasks error            | exit 1; name blocking artifact (Core message)                                                           |
| 13  | Check progress rendering          | Gerund `(id)`, ✓/✗, no `Executing:`; hooks on same bus                                                  |
| 14  | Unsatisfied requires              | Surface Core blockers; repair guide from GetStatus                                                      |

**On-disk `specs/cli/change-transition` still describes a CLI-owned `drafting→designing` table.** Change preview is the opposite (`to: 'next'`). After archive, workspace spec must match preview. That is **change vs committed spec**, not CLI vs preview.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts`.

- `--next` → `to: requestedTarget` with `'next'`; mutually exclusive with `<step>` (`validateRequestedTarget`).
- `--allow-out-of-scope` → `allowOutOfScope: true` **only when set**; omitted otherwise (does not invent skippable bypass of `impl.filesResolved` — Core owns that).
- `skipHookPhases` from comma list; empty set when omitted.
- Execute input has no approval flags.
- Pre-status and repair-status: `refreshImplementationTracking: false`.
- Progress: `createCheckProgressPresenter({ streamName: 'change-transition' })` for `check-*` events. Text check progress on **stderr**; structured on **stdout**. `run-hooks` still uses `_hook-progress-presenter.ts` with `stream: "hook-progress"` (allowed).
- Repair guide: GetStatus blockers + `nextAction` (including verify vs implement tests).
- `HookFailedError` falls through to `handleError` → exit 2, no repair guide.
- Argument validation uses `CHANGE_STATES` (membership only, not availability) — not a protocol filter.

**Architecture:** CLI presents `TransitionChange` / `GetStatus` results. Residual presentation for legacy events `requires-check` and `task-completion-failed` (switch in `makeProgressRenderer`) if Core still emits them; preview’s public bus is `check-start` / `check-progress` / `check-done`.

### Discrepancies

| ID   | Verdict                                     | Severity | Evidence                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT-1 | **spec-wrong** (workspace vs change)        | medium   | Committed `specs/cli/change-transition/spec.md` still requires a CLI routing table for `--next`. **Change preview and code** pass `to: 'next'`. Until archive, agents reading `specs/` without preview will be wrong.                                                                     |
| CT-2 | **code-wrong** (dead/legacy adapter)        | low      | `makeProgressRenderer` still special-cases `requires-check` and `task-completion-failed` outside the generic check presenter. If Core only emits `check-*`, this is unused; if Core still emits them, the public bus is split. Spec wants one bus.                                        |
| CT-3 | **code-wrong** vs `default:_global/testing` | low      | No `test/commands/change/_check-progress-presenter.spec.ts` mirroring `src/commands/change/_check-progress-presenter.ts`. Behaviour covered inside `transition.spec.ts` / `archive.spec.ts`. `_hook-progress-presenter.spec.ts` lives under `test/commands/` not `test/commands/change/`. |
| CT-4 | **both**                                    | low      | Repair-guide spec example `error: cannot transition to <step>`; implementation prints `error: ${err.message}`. Tests match Core error strings. Spec example is illustrative **or** CLI should normalize the prefix.                                                                       |

`--next` / `--allow-out-of-scope` **match the change preview**.

### Test Coverage

`packages/cli/test/commands/change/transition.spec.ts`: missing step vs `--next`, mutual exclusion, `to: 'next'`, `allowOutOfScope` set/omitted, no approval flags, no pending rewrite, hook failure exit 2 without repair guide, check-bus hook progress, JSON `change-transition` not `hook-progress`, repair guide from GetStatus (verify skill), `--next` failures (`HappyPathNextUnavailableError`), incomplete tasks / skip-hooks still blocked, refresh flags.

### Missing Tests

- Dedicated unit tests for `createCheckProgressPresenter` (heartbeat / sanitization) — currently only via command tests.
- Incomplete-tasks scenario that the **CLI** (not Core) names the artifact independently — CLI correctly relays Core `message`; no extra CLI logic to test.
- Explicit assertion that `GetStatus.nextAction` is **not** used to pick `to` (only that `to: 'next'` is passed). Current tests imply this.

### Spec Dependency Chain

- `cli:entrypoint`
- `core:transition-change` (happy-path `next`, `allowOutOfScope`, hooks)
- `core:get-status` (repair guide)
- `core:transition-checks` (check bus, gerund labels)
- `core:hook-execution-model`
- Globals: architecture, testing

### Summary counts (`cli:change-transition`)

- Requirements: **14**
- Implemented: **14** against **change preview**
- Missing: **0** (preview)
- Partial: **1** (legacy progress event types)
- Discrepancies: **4** (1 medium committed-spec drift, 3 low)
- Covered by tests: **13**
- Untested / layout gaps: **1** (mirrored presenter spec file)

---

## cli:change-approve

### Requirements Summary

| #   | Requirement                    | Intent                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------ |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + `--format`                     |
| 2   | Delegates gate state to kernel | `{ name, reason }` only; `kernel.changes.approveSpec` / `approveSignoff` |
| 3   | Artifact hash computation      | CLI must not hash or pass hashes                                         |
| 4   | Approve spec behaviour         | Stay in `ready`; no print of `pending-spec-approval`; bound-from help    |
| 5   | Approve signoff behaviour      | Stay in `done`; bound-from help                                          |
| 6   | Output on success              | `approved <gate> for <name>` or `{ result, gate, name }`                 |
| 7   | Error cases                    | Missing `--reason`; wrong state; not found → exit 1                      |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- `requiredOption('--reason')`.
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags, not `kernel.specs.*`.
- Help: ready / pending drain for spec; done / pending drain for signoff.
- Success strings and JSON match spec.
- Errors via `handleError`.

**Architecture:** thin adapter. **Core deps:** SDK only.

### Discrepancies

| ID   | Verdict                         | Severity | Evidence                                                                                                                                                                                                               |
| ---- | ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-1 | **code-wrong** (test vs verify) | low      | Wrong-state scenario is exercised with `ApprovalGateDisabledError`, not a state-mismatch error. CLI still prints `error:` and exit 1. Verify.md wants “not in expected state”; gate-disabled is a different Core code. |
| CA-2 | **code-wrong** vs testing names | low      | Same given/when/then gap as other CLI tests.                                                                                                                                                                           |

No business-logic leak.

### Test Coverage

`packages/cli/test/commands/change/approve.spec.ts`: success spec/signoff, no pending in stdout, execute `{ name, reason }`, JSON, missing reason, not found, unknown sub-verb `review`.

Does **not** assert `kernel.specs.approveSpec` was not called (verify scenarios). Implementation makes that call impossible without a new import.

### Missing Tests

- `kernel.specs.*` not invoked (verify “execute call shape”).
- Signoff JSON output (spec JSON scenario is spec-gate only; signoff JSON is implied).
- Hash-not-passed is implied by call args; no explicit `expect(call).not.toHaveProperty('artifactHashes')`.

### Spec Dependency Chain

- `cli:entrypoint`
- `core:change` — approval records
- `core:transition-checks` — `approval.spec` / `approval.signoff` in-place gates

### Summary counts (`cli:change-approve`)

- Requirements: **7**
- Implemented: **7**
- Missing: **0**
- Partial: **0**
- Discrepancies: **2** (low test/global)
- Covered by tests: **6**
- Untested verify rows: **1** (specs namespace not used)

---

## cli:change-archive

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                                                    |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature            | `changes archive` canonical; `change archive` alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope`; `--format` |
| 2   | Prerequisites                | Must be `archivable`; else exit 1 naming state                                                                                            |
| 3   | Behaviour                    | Delegate `ArchiveChange` (merge, move, history)                                                                                           |
| 4   | Hook execution               | Map skip set onto `ArchiveChangeInput`                                                                                                    |
| 5   | Check progress rendering     | Same gerund bus as transition; `stream: "change-archive"`                                                                                 |
| 6   | Post-archive hooks           | Failures → exit 2                                                                                                                         |
| 7   | Output on success            | Path line; invalidated section when non-empty                                                                                             |
| 8   | Output on success (extended) | `--allow-overlap` invalidated list                                                                                                        |
| 9   | JSON output on success       | Terminal `change-archive` complete; no second unwrapped object                                                                            |
| 10  | Error cases                  | not found / not archivable / merge fail → exit 1                                                                                          |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Options match spec; `allowOverlap` / `allowOutOfScope` only when flags set.
- Progress: `createCheckProgressPresenter({ streamName: 'change-archive' })`.
- Post-hook failures: `cliError(..., 2)`.
- Text path + invalidated list; JSON single stream complete record.
- `SpecOverlapError` → stderr + `--allow-overlap` hint, exit 1.
- Parent `changes` has `.alias('change')` in `packages/cli/src/index.ts`.

**Architecture:** presenter + flag mapping. No archive merge logic in CLI.

### Discrepancies

| ID    | Verdict                   | Severity | Evidence                                                                                                                                                                                                                   |
| ----- | ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAR-1 | **code-wrong** vs verify  | low      | Verify “Singular alias invocation” is not tested against the real program (`changes`.alias(`change`)). Unit tests register archive on a parent named `change` only. Alias wiring lives in `index.ts` and is untested here. |
| CAR-2 | **code-wrong** vs testing | low      | No mirrored `_check-progress-presenter.spec.ts`; archive check-bus covered in `archive.spec.ts`.                                                                                                                           |
| CAR-3 | **both**                  | low      | Prerequisites “stderr mentioning current state” depends on Core error text; CLI `handleError` prints `err.message`.                                                                                                        |

`--allow-out-of-scope` is specified and forwarded; tests exist.

### Test Coverage

`archive.spec.ts`: text path, post-hook exit 2, JSON complete stream + preceding check events, skip-hooks all/pre/post, `allowOutOfScope` set/omitted, check-bus gerund + no `Executing:`, overlap handling.

### Missing Tests

- Full-program `specd change archive` vs `specd changes archive` alias.
- Not-archivable current-state string (Core-driven).
- Merge conflict descriptive error (Core-driven).

### Spec Dependency Chain

- `cli:entrypoint`
- `cli:command-resource-naming` — plural canonical + singular alias
- `core:change` / `core:archive-change`
- `core:hook-execution-model`
- `core:transition-checks` — check bus

### Summary counts (`cli:change-archive`)

- Requirements: **10**
- Implemented: **10**
- Missing: **0**
- Partial: **0**
- Discrepancies: **3** (low)
- Covered by tests: **9**
- Untested: **1** (real alias at argv)

---

## skills:skill-templates-source

### Requirements Summary

Base spec + change deltas (in-place gates, overlap vs invalidation, implementation drain, archive `--skip-hooks pre`, design review scope):

| #    | Requirement                                                             | Intent (this change + standing)                                                |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1–10 | Template layout, metadata, Handlebars, graph impact/search, frontmatter | Standing skills package contract                                               |
| 11   | Implementation tracking instructions                                    | add + archive integrity                                                        |
| 12   | Metadata self-healing                                                   | no status scans; generate-metadata is repair-only                              |
| 13   | Optimizer gating                                                        | `llmOptimizedContext` from `project status`                                    |
| 14   | Agent-facing command roles                                              | show / context / metadata                                                      |
| 15   | In-place approval gates                                                 | stay in ready/done; no transition into pending; router skill silent on signoff |
| 16   | Overlap vs invalidation                                                 | hop skills: no `OVERLAP_CONFLICT` as typical; archive: live overlap only       |
| 17   | Verify/implement tracking ownership                                     | shared cookbook; verify drains; implement zero-open before `/specd-verify`     |
| 18   | Archive skips only pre                                                  | `--skip-hooks pre`, not `all`; no post `run-hooks`                             |
| 19   | Design review scope                                                     | not “listed under review:”; details / `affectedArtifacts`                      |

**nextAction / command (user focus):** Requirement 14 + shared “Next Action engine”: prefer `nextAction.command` / Repair Guide over local routing. `specd-new` table uses `nextAction.targetStep` with drain-only pending rows. Skills that **own a hop** still show explicit `changes transition <name> <step> --skip-hooks all` (or archive `--skip-hooks pre`). Spec does **not** require teaching CLI `--next`; Core `--next` is a CLI convenience. Templates should not contradict `nextAction`.

### Implementation Status

Templates under `packages/skills/templates/skills/` and `shared/shared.md.tpl`. Contract tests: `packages/skills/test/template-workflow.spec.ts`.

- Shared: nextAction object; Repair Guide; never run `changes approve`; stay in ready/done; drain pending only; implementation list/resolve/ignore/add; `--snippet` opt-in.
- Design/implement/verify/archive/new: in-place gates; overlap copy; implement zero-open; verify drain; archive `--skip-hooks pre` + `--allow-out-of-scope` example; design review from details.
- Entry `specd` skill: router only; tests forbid signoff / pending / approve spec.
- `--next` is **absent** from skill templates (explicit hops + nextAction). Consistent with “CLI must not treat nextAction as `--next` resolver” while skills **do** follow nextAction for **what to run**.

**Architecture:** templates are not CLI adapters; no business logic in CLI. Skills package → `@specd/core` is the allowed dependency direction.

### Discrepancies

| ID   | Verdict                       | Severity | Evidence                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SK-1 | **spec-wrong** (optional gap) | low      | Change CLI spec adds `--next` / `--allow-out-of-scope` as operator flags. Skill templates document `--allow-out-of-scope` on **archive**, not on **transition**, and never `--next`. If agents should offer happy-path `--next`, the skills spec does not say so — they follow `nextAction.command` instead. Not a code bug unless product intent was to teach `--next`. |
| SK-2 | **compliant**                 | —        | Hop skills hardcode `transition … verifying` **and** tell agents to follow nextAction/Repair Guide. Tension is procedural (skill owns hop) vs status-driven. Tests lock gate copy.                                                                                                                                                                                       |

Standing template requirements (frontmatter, optimizer agents, graph terminology) were not fully re-indexed file-by-file in this batch; graph search + `template-workflow.spec.ts` + spot-checks of shared/new/design/implement/verify/archive show change deltas **present**. No contradiction with `core:transition-checks` in-place gates found in those templates.

### Test Coverage

`template-workflow.spec.ts` asserts: optimizer gates, command roles, pending-not-happy-path, implementation drain, archive pre-only, design review header, OVERLAP_CONFLICT split, generate-metadata not routine. Matches “assert exact commands/fields, not keyword-only” for the gated strings.

### Missing Tests

- Explicit assertion that **transition** examples never use `stream: hook-progress` (N/A in templates).
- Explicit `--next` presence/absence if product wants a contract.
- `changes transition … --allow-out-of-scope` in implement/verify templates (spec does not require it; CLI flag exists).

### Spec Dependency Chain

- `skills:skill`
- `cli:spec-optimizations`
- `skills:workflow-automation`
- `core:transition-checks` (change delta)
- Indirect: `cli:change-status` / `cli:change-transition` presentation that templates describe

### Summary counts (`skills:skill-templates-source`)

- Requirements: **19** (standing + 5 change-owned)
- Implemented: **19** for change-owned; standing assumed from existing templates/tests
- Missing: **0** (change-owned)
- Partial: **0**
- Discrepancies: **1** (low: `--next` not in templates; spec-optional)
- Covered by tests: **change-owned 5/5** plus standing optimizer/roles tests
- Untested: `--next` contract (unspecified)

---

## Cross-cutting: architecture, testing, core deps

| Check                          | Result                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI imports `@specd/core`      | **None** (`graph`/package.json: `@specd/sdk` + plugins + schema-std)                                                                                 |
| CLI contains lifecycle routing | **No** for `--next` (preview). `CHANGE_STATES` is argv validation only.                                                                              |
| CLI check vs hook progress     | **Split as specified:** transition/archive → `createCheckProgressPresenter` / `change-transition` \| `change-archive`; `run-hooks` → `hook-progress` |
| Skills → core                  | **Allowed**                                                                                                                                          |
| `test/` mirrors `src/`         | **Mostly.** Gap: `_check-progress-presenter.ts`; hook presenter spec one directory up                                                                |
| given/when/then names          | **Mostly not** in CLI command tests (global testing spec)                                                                                            |

---

## Batch totals

| Spec                          | Reqs   | Impl   | Missing reqs | Partial | Disc.  | Tests cover | Weak/missing tests |
| ----------------------------- | ------ | ------ | ------------ | ------- | ------ | ----------- | ------------------ |
| cli:change-status             | 16     | 16     | 0            | 1       | 3      | 14          | 2                  |
| cli:change-transition         | 14     | 14     | 0            | 1       | 4      | 13          | 1                  |
| cli:change-approve            | 7      | 7      | 0            | 0       | 2      | 6           | 1                  |
| cli:change-archive            | 10     | 10     | 0            | 0       | 3      | 9           | 1                  |
| skills:skill-templates-source | 19     | 19     | 0            | 0       | 1      | 18          | 1                  |
| **Sum**                       | **66** | **66** | **0**        | **2**   | **13** | **60**      | **6**              |

**Severity mix:** 1 medium (committed `cli:change-transition` `--next` table vs preview/code), 12 low.

**Highest-priority follow-up:** archive the change so workspace `specs/cli/change-transition` matches preview (`to: 'next'`), or agents will implement the old CLI routing table.

---

## Partial: globals

# Partial audit: project globals (architecture / logging + consistency globals)

- **Mode:** change `workflow-transition-checks`
- **Graph:** `stale: false`, indexed `2026-08-28T17:21:07.186Z`, ref `2948f1a2`
- **Change-owned (previewed via `changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Disk base (not change-owned):** `default:_global/conventions`, `testing`, `eslint`, `spec-layout`, `docs`, `error-handling-conventions`
- **Read-only:** no spec or source files modified

---

## `default:_global/architecture` (CHANGE PREVIEW)

### Requirements Summary

| Requirement                                  | Normative intent                                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure                            | Packages with business logic use `domain` / `application` / `infrastructure`; inner never imports outer. Notes `@specd/core` as current only such package.                                      |
| Domain layer is pure                         | Domain: stdlib + domain types only. **Exception:** ambient `Logger` for diagnostics in any layer/package; sole intentional cross-layer import exception. Composition root wires implementation. |
| Application layer uses ports only            | Use cases talk through `application/ports/` only. Ambient `Logger` is **not** an infrastructure adapter import.                                                                                 |
| Rich domain entities                         | Entities own invariants/transitions; typed domain errors.                                                                                                                                       |
| Domain value objects                         | Behaviour via methods/getters; no leaked internals.                                                                                                                                             |
| Ports with shared construction               | Abstract classes + explicit methods, not property signatures.                                                                                                                                   |
| Pure functions for stateless domain services | Stateless domain ops = exported functions in `domain/services/`, not classes.                                                                                                                   |
| Manual DI                                    | No IoC; constructors receive ports.                                                                                                                                                             |
| Composition layer                            | `composition/` only may import `infrastructure/`; Kernel/`createX`/`CompositionResolver` contract (heavily named after core/sdk).                                                               |
| YAML validated at infra boundary             | `ConfigValidationError` / `SchemaValidationError` extend `SpecdError`.                                                                                                                          |
| Adapter packages                             | CLI/MCP/plugins contain no business logic.                                                                                                                                                      |
| No circular workspace deps                   | Directed graph `plugin-*` → `skills` → `core`; `cli`/`mcp` → `sdk` → `core`,`code-graph`.                                                                                                       |
| Curated public entry points                  | `.` / `./ports` / `./extensions` / `./internal` export rules.                                                                                                                                   |

**Change delta vs disk:** only Domain purity + Application ports sections gained the Logger exception. Disk architecture has **no** `evaluateLifecycle` and **no** lifecycle file paths. Change preview also has **no** `evaluateLifecycle` and **no** `lifecycle-*.ts` paths. Focus criterion (architecture package-agnostic for this Logger work) is **met for the delta**. Residual core-named Kernel/SDK/error types remain in unchanged sections.

### Implementation Status

| Area                                       | Status            | Evidence                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ambient Logger in domain                   | **Compliant**     | `packages/core/src/domain/services/lifecycle-verdict.ts` imports `Logger` from `../../observability/logger.js`. ESLint on this file: **0 errors**.                                                                     |
| Logger not treated as infra adapter        | **Compliant**     | Facade lives in `src/observability/`, not `infrastructure/`. `PinoLogger` is the adapter. Application re-export: `src/application/logger.ts` → observability.                                                          |
| Composition wires Logger                   | **Compliant**     | `packages/core/src/composition/kernel.ts` calls `Logger.setImplementation(createDefaultLogger(...))`.                                                                                                                  |
| Domain must not import application         | **Non-compliant** | `packages/core/src/domain/services/lifecycle-engine.ts` import/re-export of `evaluateLifecycle` from `../../application/services/lifecycle-evaluation.js`. ESLint: `no-restricted-imports` ×2.                         |
| Stateless domain services as functions     | **Partial**       | Verdict is `evaluateLifecycleVerdict` (function). Deprecated `LifecycleEngine` **class** remains in domain with public field initializers (`projectArtifacts`, `findBlockingParent`) — also `no-restricted-syntax` ×2. |
| Three named layers only                    | **Partial**       | Code adds sibling `src/observability/` (not in the three-layer list). This is how domain can import Logger without hitting `**/application/**`.                                                                        |
| Layer ESLint                               | **Enforced**      | `eslint.config.js` restricts domain→application/infrastructure/composition. Does **not** restrict `observability/`.                                                                                                    |
| Verify: “TS compiler rejects domain→infra” | **Drift**         | Enforcement is ESLint `no-restricted-imports`, not `tsc` path mapping. Pre-existing.                                                                                                                                   |

Graph: `Logger` dependents include `lifecycle-verdict.ts`, `lifecycle-engine.ts` (indirect), application use cases, `kernel.ts`. `evaluateLifecycle` is application (`lifecycle-evaluation.ts`), not architecture.

### Discrepancies

1. **code-wrong (HIGH)** — Domain file `lifecycle-engine.ts` imports application `evaluateLifecycle`. Architecture (change): inner layers never import outer; Logger is the **sole** exception. ESLint agrees (2× `no-restricted-imports`). Architecture is right; this shim belongs outside `domain/` (e.g. application or public barrel).

2. **spec-wrong (change `core:lifecycle-engine` vs this global) (HIGH)** — Change lifecycle-engine spec says a deprecated shim MAY live in domain and MUST delegate to `evaluateLifecycle` / `evaluateLifecycleVerdict`, and names `domain/services/lifecycle-verdict.ts`. That **contradicts** architecture’s sole-exception rule and “stateless domain services are functions, not classes”. Architecture/global is the constraint spec; lifecycle-engine should move the application re-export out of `domain/`.

3. **both (MEDIUM)** — Architecture still describes only three folders. Implementation’s `observability/` is a fourth, package-local module that makes the Logger exception lint-legal. Spec could name “ambient Logger module, not `application/`/`infrastructure/`” without listing core paths. Code could document why observability sits beside domain.

4. **spec-wrong (LOW, residual, not this delta)** — Composition / YAML / barrels still name `SpecdConfig`, `@specd/core`, `FsConfigLoader` (verify), `ChangeRepository`. Does **not** include `evaluateLifecycle` or lifecycle file paths (focus check **pass**). Package-agnostic purity of the whole architecture spec is incomplete, but the Logger delta did not add core lifecycle APIs.

5. **spec-wrong (LOW)** — Verify still says “TypeScript compiler must reject” domain→infra / use-case→adapter. Reality: ESLint. `tsc` does not encode those folder rules.

### Test Coverage

| Requirement                        | Tests                                                                                                                     | Adequacy                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Domain may import Logger           | `test/domain/services/lifecycle-engine.spec.ts` spies `Logger.debug` during `evaluateLifecycleVerdict`                    | Covers ambient use, not lint permission |
| Application may import Logger      | Indirect via use-case tests + kernel                                                                                      | Weak as architecture scenario           |
| Domain must not import application | **None** as a positive architecture test; ESLint is the fitness function and currently **fails** on `lifecycle-engine.ts` | Gap + failing production file           |
| Layered imports                    | No dedicated eslint fixture tests                                                                                         | Relies on CI lint                       |
| Ports / Kernel / YAML / adapters   | Covered by other package specs                                                                                            | Out of this batch’s focus               |

### Missing Tests

- Scenario: domain file importing `../observability/logger` does **not** trip `no-restricted-imports`.
- Scenario: domain file importing `../application/**` **does** trip lint (currently true in production, so a regression test would fail until the shim moves).
- Architecture verify “compiler rejects” vs lint: no automated mapping.

### Spec Dependency Chain

- Architecture: `_none — this is a global constraint spec`
- **Dependents in this change:** `default:_global/logging` (change), `core:lifecycle-engine`, `core:transition-change`, `core:transition-checks`, `core:change`, `core:archive-change`, `core:storage`, `core:config`, `core:validate-artifacts`, …
- **Contradiction:** `core:lifecycle-engine` (change) depends on architecture but authorizes a domain→application shim.

### Summary counts

- Requirements: **13**
- Implemented: **11** (Logger exception + layers generally hold; composition/ports exist)
- Partial: **2** (observability folder; `LifecycleEngine` class + public fields)
- Missing implementation: **1** clean domain boundary for lifecycle shim
- Discrepancies: **5** (1 code-wrong, 2 spec-wrong, 1 both, 1 residual spec-wrong)
- Missing tests: **3**
- Change-spec conflicts with this global: **1** (`core:lifecycle-engine` domain shim)

---

## `default:_global/logging` (CHANGE PREVIEW)

### Requirements Summary

| Requirement                               | Normative intent                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console Compatibility                     | Interface MUST have `log`, `info`, `debug`, `warn`, `error` with console-like signatures.                                                                                                                                                                 |
| Method Aliasing                           | `log()` SHALL be an alias of `info()`.                                                                                                                                                                                                                    |
| Level Mapping for Minimal Implementations | **If** implementation is console-based: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`.                                                                                                                               |
| Log Level Semantics                       | Ordered severity `trace` < `debug` < `info` < `warn` < `error` < `fatal`.                                                                                                                                                                                 |
| Policy on Console Usage                   | Prefer logging abstraction over global `console` in production.                                                                                                                                                                                           |
| Ambient Logger (**added by change**)      | Packages MAY expose static `Logger`; composition root assigns impl; pre-wire **no-op** (no throw, no console); any layer MAY import; not for control flow; **does not prescribe constructor injection vs ambient**. Exception documented in architecture. |

**Change vs disk:** disk logging had no Ambient Logger requirement and Spec Dependencies `_none`. Change adds Ambient Logger and depends on architecture. Preview is **generic** (monorepo-wide), **not** core-only constructor-injection rules. Focus criterion **met**.

### Implementation Status

| Area                          | Status                       | Evidence                                                                                                                                                                                            |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console-compatible methods    | **Compliant**                | `LoggerPort` + static `Logger` expose required methods plus `fatal`, `trace`, `isLevelEnabled`, `child`.                                                                                            |
| `log` ≡ `info`                | **Partial**                  | Facade delegates `log`→`impl.log` and `info`→`impl.info` separately. `PinoLogger` maps **both** to `pino.info`. NullLogger both no-op. Alias is by convention of impls, not a single facade method. |
| Console prefix mapping        | **N/A for Pino**             | Spec scopes prefixes to console-based minimal impls. `PinoLogger` uses pino levels, not `[FATAL]`/`[TRACE]` prefixes. No console-adapter class found.                                               |
| Console policy in core `src/` | **Compliant (spot-check)**   | No `console.log/warn/error/debug/info` under `packages/core/src`.                                                                                                                                   |
| Ambient no-op                 | **Compliant**                | `NullLogger`; `Logger.resetImplementation()`. Test: `test/application/logger-port.spec.ts` “does not throw when using default null implementation”.                                                 |
| Wired at composition          | **Compliant**                | `createKernel` → `Logger.setImplementation`.                                                                                                                                                        |
| Domain without logger port    | **Compliant**                | `evaluateLifecycleVerdict` has no logger ctor arg; uses `Logger.debug`. Matches verify “Ambient import without logger port”.                                                                        |
| Generic vs core-only          | **Compliant to change spec** | Spec text is package-agnostic. Code comments still say “across core” (`logger.ts`) — implementation locality, not a spec constructor rule.                                                          |

### Discrepancies

1. **both (LOW)** — `log()` is not implemented as a call-through to `info()` on the facade. Spec wants aliasing; code uses parallel methods. Pino happens to alias. A custom `LoggerPort` could split them.

2. **spec-wrong (LOW)** — Verify “linting or code review SHOULD flag `console.*`” is not an ESLint rule in `eslint.config.js` (no `no-console`). Policy is social/CI-optional. Core src currently clean.

3. **none (constructor rules)** — Change logging does **not** require injecting a logger port into domain constructors. Code matches. Old worry (core-only ctor rules in logging) is **not** present in preview.

### Test Coverage

| Requirement              | Tests                                             | Adequacy                                                                                    |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Methods exist / delegate | `logger-port.spec.ts`                             | Good for proxy; does not assert `log` vs `info` identity                                    |
| No-op before wiring      | Same file, no-throw                               | Does **not** spy `console` to prove no write                                                |
| Pino routing             | `test/infrastructure/logging/pino-logger.spec.ts` | Callback dest, child, `isLevelEnabled`; no fatal/trace prefix (correct if not console impl) |
| Ambient domain logging   | `lifecycle-engine.spec.ts` `Logger.debug` spy     | Good                                                                                        |
| Severity order           | **None**                                          | Spec verify scenario untested as data                                                       |

### Missing Tests

- `Logger.log` and `Logger.info` invoke the same underlying level/method.
- No-op impl does not call `console.*` (spy).
- Console-adapter `[FATAL]`/`[TRACE]` if such an adapter is ever added.
- Cross-package ambient Logger (cli/code-graph) — spec allows “packages MAY”; only core implements the facade.

### Spec Dependency Chain

- Depends on: `default:_global/architecture` (change)
- Used by: `core:lifecycle-engine`, `core:change`, `core:archive-change`, `core:storage` (change specDependsOn)
- Consistent with architecture Logger exception.

### Summary counts

- Requirements: **6**
- Implemented: **5** (aliasing partial)
- Partial: **1**
- Missing implementation: **0** (no console mapper required while Pino is the adapter)
- Discrepancies: **2** (both LOW)
- Missing tests: **4**
- Change-spec conflicts with this global: **0**

---

## `default:_global/conventions` (DISK)

### Requirements Summary

Strict TS (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESM `type:module` + NodeNext; named exports only; kebab-case `src`, tests in `test/**/*.spec.ts`, no `index.ts` except package root (layer barrels allowed if >50 modules); no `any`; explicit return types on public APIs; core user-facing errors extend `SpecdError`; `_backing` fields; lazy list/search metadata vs get/artifact/resolve; prefer `readonly` / `as const`.

### Implementation Status

Monorepo `tsconfig.base.json` + eslint `no-explicit-any`, `explicit-module-boundary-types`, default-export ban, kebab-case filenames align. Out of change focus except where Logger/JSDoc interact.

### Discrepancies

1. **spec-wrong (MEDIUM)** — `## Spec Dependencies` both says `_none — this is a global constraint spec_` **and** lists `default:_global/error-handling-conventions`. Violates `default:_global/spec-layout` (section must be `_none` **or** a list).

2. **spec-wrong vs eslint/docs (LOW)** — Conventions do not mention ambient Logger; they do not forbid importing observability from domain. No conflict with the change.

### Test Coverage

Enforced by compiler/lint, not Vitest scenarios named after conventions.

### Missing Tests

None required for this change’s Logger work. Spec-layout self-check of the Dependencies section is missing (meta).

### Spec Dependency Chain

Intended: error-handling-conventions. Architecture/logging do not depend on conventions. ESLint depends on conventions.

### Summary counts

- Requirements: **9**
- Implemented: **9** (spot-check; not a full monorepo sweep)
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **1** (spec-wrong Dependencies section)
- Missing tests: **1** (meta)
- Change-spec conflicts: **0**

---

## `default:_global/testing` (DISK)

### Requirements Summary

Vitest only; `test/` mirrors `src`; unit tests for use cases and entity invariants with full port mocks (`Error('not implemented')`); integration tests for fs adapters with tmpdir cleanup; names `given…, when…, then…`; helpers `setupX`/`cleanupX`; no snapshots.

### Implementation Status

Logger tests use Vitest `describe`/`it` with short names, not `given/when/then`. Domain lifecycle tests exist including Logger.debug spy. Unit tests do not need a logger port mock (ambient) — **aligns** with architecture/logging change.

### Discrepancies

1. **code-wrong (LOW vs testing spec)** — `logger-port.spec.ts` / `pino-logger.spec.ts` titles are not `given…, when…, then…`. Widespread repo pattern; not introduced as Logger-specific regression uniquely.

2. **none vs architecture** — Testing spec says domain is unit-testable because it has no I/O. Ambient Logger is a side effect. Change architecture/logging explicitly allow diagnostic logs. Tests that spy `Logger.debug` remain unit tests (no fs). **Compatible** if logging is not treated as I/O. If a reviewer treats any module-level mutable logger as I/O, the exception is the intended resolution.

### Test Coverage

Testing spec itself is process; coverage of Logger scenarios listed under logging/architecture.

### Missing Tests

None unique beyond logging’s missing cases.

### Spec Dependency Chain

Depends on architecture + conventions. Change architecture’s Logger exception should be read as allowing observability in domain unit tests.

### Summary counts

- Requirements: **6**
- Implemented: **6** at strategy level
- Partial: **1** (naming convention in logger tests)
- Missing implementation: **0**
- Discrepancies: **1**
- Missing tests: **0** additional
- Change-spec conflicts: **0** (Logger vs purity resolved by architecture exception)

---

## `default:_global/eslint` (DISK)

### Requirements Summary

Enforce conventions + architecture layers via root `eslint.config.js`; type-aware; no `any`; no default export; explicit returns; kebab-case `src`; JSDoc on all functions/classes/types including internals (`test/**/*.spec.ts` exempt); `no-restricted-imports` for domain/application/infrastructure folder rules; lint-staged.

### Implementation Status

`eslint.config.js` matches the three folder patterns. **No Logger allowlist** and **none needed** while Logger lives under `observability/` (not in restricted groups). Domain `lifecycle-verdict.ts` Logger import is legal. Domain `lifecycle-engine.ts` application import is **correctly rejected**.

JSDoc: `logger.ts` and `pino-logger.ts` use file-level `eslint-disable` for jsdoc rules. `lifecycle-verdict.ts` disables jsdoc for private helpers.

### Discrepancies

1. **spec-wrong (MEDIUM)** — ESLint spec does not mention the architecture Logger exception. Implementation accidentally supports it via folder placement. If Logger were re-exported only from `application/logger.ts` and domain imported that path, lint would **forbid** the architecture-permitted import. Spec should say: do not restrict the ambient Logger module; **do** keep forbidding `application/` including `application/logger.ts` from domain.

2. **both (HIGH, cross-spec)** — ESLint + docs spec: JSDoc required on **all** source symbols. Docs **verify** says internal helpers without JSDoc **must not** error. Direct contradiction. Code uses eslint-disable in logging/lifecycle files.

3. **code-wrong (HIGH)** — `lifecycle-engine.ts` fails eslint (`no-restricted-imports`, `no-restricted-syntax`, `jsdoc/require-jsdoc`). Fitness function works; production file is red.

### Test Coverage

No eslint rule unit tests. CI lint is the verifier. Current failure on `lifecycle-engine.ts` means CI lint of that file cannot be green.

### Missing Tests

- Fixture: domain → `observability/logger` allowed.
- Fixture: domain → `application/logger` denied (protects exception from being implemented as application import).

### Spec Dependency Chain

Depends on conventions. **Should** depend on architecture (layer rules); currently does not list it. Architecture verify overlaps eslint.

### Summary counts

- Requirements: **6**
- Implemented: **6** (rules exist; one production file violates them)
- Partial: **0**
- Missing implementation: **0** of rules; **1** violating file
- Discrepancies: **3**
- Missing tests: **2**
- Change-spec conflicts: **0** with logging; **eslint vs architecture** only if Logger is imported from `application/`

---

## `default:_global/spec-layout` (DISK)

### Requirements Summary

`specs/_global/` for cross-cutting only; package specs under `specs/<package>/`; paired `spec.md`/`verify.md`; required sections; Spec Dependencies `_none` or list with canonical IDs; deltas stay in change dirs.

### Implementation Status

Architecture/logging deltas live under the change path, not synced to `specs/` — **compliant**. Previewed architecture/logging keep Purpose/Requirements/Dependencies. Logging change adds Dependencies on architecture (was `_none` on disk).

### Discrepancies

1. **spec-wrong (MEDIUM)** — Architecture (even after Logger delta) still contains core Kernel/`@specd/core` barrel details in `_global/`. Spec-layout: `_global/` is not for a single package’s internals. Pre-existing; Logger delta did not worsen it.

2. **spec-wrong** — `default:_global/conventions` Dependencies section invalid (see conventions).

3. **LOW** — Preview title `default:\_global/logging` uses escaped underscore in heading; cosmetic.

### Test Coverage

N/A (layout). Change `deps.consistent` check passed on change status.

### Missing Tests

None for this batch.

### Spec Dependency Chain

spec-layout → schema-format, content-extraction, spec-id-format.

### Summary counts

- Requirements: **6**
- Implemented: **6** for change artifacts
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **2** (architecture-in-\_global; conventions Dependencies)
- Missing tests: **0**
- Change-spec conflicts: **0** for logging/architecture pairing

---

## `default:_global/docs` (DISK)

### Requirements Summary

`docs/{adr,cli,mcp,core,schemas}/` tree (spec tree is incomplete vs repo `guide/`, `sdk/`, `config/`); MADR ADRs; CLI/MCP/core/sdk docs; JSDoc on all symbols with `@param`/`@returns`/`@throws`; docs stay aligned with composition and template-variable contracts.

### Implementation Status

Not change-owned. Logger/architecture deltas do not update ADRs or `docs/core`. Ambient Logger is a significant architectural exception (ADR-0001 hexagonal) without a new ADR in this change.

### Discrepancies

1. **spec-wrong (LOW)** — Directory structure requirement omits `docs/sdk`, `docs/guide`, `docs/config` that later requirements reference.

2. **both (HIGH)** — JSDoc verify vs eslint/docs requirement on **internal** helpers (see eslint).

3. **spec-wrong vs ADR creation (MEDIUM)** — Ambient Logger as sole cross-layer exception is a non-obvious architecture change. Docs “ADR creation” says significant multi-package constraints get an ADR. This change did not add one. Could be “follows from observability already in code” (spec-wrong if required; skippable if considered implementation detail of logging).

### Test Coverage

Linter JSDoc; no docs tests.

### Missing Tests

None.

### Spec Dependency Chain

Depends on conventions.

### Summary counts

- Requirements: **11**
- Implemented: **n/a full sweep**
- Partial: **1** (JSDoc disables in logger/lifecycle)
- Missing implementation: **0** for Logger docs unless ADR required
- Discrepancies: **3**
- Missing tests: **0**
- Change-spec conflicts: **0** directly; ADR gap is process

---

## `default:_global/error-handling-conventions` (DISK)

### Requirements Summary

Specd Error Contract (`Error`, `specd=true`, `code`, message); core `SpecdError`; package bases SHOULD exist; `UPPER_SNAKE_CASE` codes; actionable messages; optional metadata; JSDoc on errors. Generic `Error` only for OOM/network/bugs.

### Implementation Status

Logging is not an error channel. Architecture YAML errors still name `SpecdError` subclasses. Domain Logger must not be used for control flow (logging spec); lifecycle still throws typed errors separately.

### Discrepancies

None specific to this change’s Logger/architecture deltas. Testing spec’s mock `new Error('not implemented')` is a documented exception for unused mock methods, not production domain errors.

### Test Coverage

Package error tests exist elsewhere.

### Missing Tests

None for this batch.

### Spec Dependency Chain

Depends on conventions. Architecture YAML requirement depends on `SpecdError` types (implicit).

### Summary counts

- Requirements: **7**
- Implemented: **7** (not re-audited exhaustively)
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **0** (this focus)
- Missing tests: **0**
- Change-spec conflicts: **0**

---

## Cross-cutting: change specs vs these globals

| Change spec              | vs architecture                                                                                                                                   | vs logging                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `core:lifecycle-engine`  | **Conflict:** domain path `lifecycle-verdict.ts`; allows `LifecycleEngine` class shim; re-exports application `evaluateLifecycle` from **domain** | **Aligned:** `Logger.debug` diagnostics, no logger port                  |
| `core:transition-checks` | Depends on architecture; check I/O in execute not domain — aligned with purity                                                                    | n/a                                                                      |
| Other change specs       | Must not put `evaluateLifecycle` into **architecture** — they did not                                                                             | Must not add core-only logger ctor rules into **logging** — they did not |

`evaluateLifecycle` correctly lives in **application** (`lifecycle-evaluation.ts`) per graph. Architecture global does not mention it. The defect is the **domain** shim importing it.

---

## Batch totals

| Spec                                |   Reqs | Impl | Partial | Missing impl | Discrepancies | Missing tests |
| ----------------------------------- | -----: | ---: | ------: | -----------: | ------------: | ------------: |
| architecture (change)               |     13 |   11 |       2 |            1 |             5 |             3 |
| logging (change)                    |      6 |    5 |       1 |            0 |             2 |             4 |
| conventions                         |      9 |    9 |       0 |            0 |             1 |             1 |
| testing                             |      6 |    6 |       1 |            0 |             1 |             0 |
| eslint                              |      6 |    6 |       0 |       1 file |             3 |             2 |
| spec-layout                         |      6 |    6 |       0 |            0 |             2 |             0 |
| docs                                |     11 |    — |       1 |            0 |             3 |             0 |
| error-handling                      |      7 |    7 |       0 |            0 |             0 |             0 |
| **Sum (do not double-count files)** | **64** |      |         |              |        **17** |        **10** |

**Highest severity:** domain `lifecycle-engine.ts` vs architecture + eslint (`no-restricted-imports`). **Focus pass:** architecture preview has no `evaluateLifecycle` / lifecycle file paths; logging preview is generic ambient Logger, not core constructor rules. **Logger vs domain purity:** `lifecycle-verdict.ts` import of `observability/logger` is the intended exception and is lint-clean.
