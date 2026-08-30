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
