# Spec-compliance audit (partial): lifecycle core

- **Mode:** change (`workflow-transition-checks`)
- **Auditor:** exhaustive spec-compliance subagent (read-only; previews via `node packages/cli/dist/index.js changes spec-preview`, not disk `specs/`)
- **Assigned specs:** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`
- **Depth-1 globals in the change:** `default:_global/architecture`, `default:_global/logging`
- **Graph notes:** Index treated as fresh (`stale: false`, `contentFresh: true` per parent). `graph search "evaluateLifecycleVerdict"` / `evaluateLifecycle` returned exact public bindings. `graph impact --symbol evaluateLifecycleVerdict --direction dependents` listed 8 files (GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction, lifecycle-evaluation, lifecycle-guidance, lifecycle-verdict, `lifecycle-engine.spec.ts`). **No CALLS edges were invented.** `graph search "LifecycleEngine"` did **not** return a class; BM25 hit CLI `lifecycle` locals and the **re-export module** `core:src/domain/services/lifecycle-engine.ts`. `graph search "isArchivable"` did **not** surface `Change.isArchivable` (unrelated `is*` symbols). **Graph is incomplete for some getters/identifiers**; those were confirmed with working-tree reads.
- **User-enforced layering (re-checked):** Architecture preview is package-agnostic (no `evaluateLifecycle`, no `packages/core` paths, no `LifecycleEngine`). Domain `lifecycle-verdict.ts` imports ambient `Logger` from `observability/logger.js`, not `application/`. No `LifecycleEngine` class, no `@deprecated` shim, no `LifecycleEngineOptions`. Domain: `evaluateLifecycleVerdict` / `projectArtifacts` / `nextHop` without `command`. Application: `evaluateLifecycle` + `LifecycleNextAction.command`.

---

## Prior audit CLOSED vs OPEN (20260829-013719)

| #   | Item                                                                                                                                                                                           | Disposition                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH dist vs src: `LifecycleEngine` class still in `packages/core/dist`; `workflow.requires` always `INCOMPLETE_ARTIFACT` for drift                                                            | **CLOSED (runtime)**                          | `rg LifecycleEngine packages/core/dist` → **0 matches**. Live `changes status workflow-transition-checks` shows **`ARTIFACT_DRIFT`** on `workflow.requires` for `specs` (`status: drifted-pending-review`, label `Checking required artifacts`). Domain runner maps drift explicitly (`packages/core/src/domain/checks/workflow-requires.ts:59-63`). Test `workflow-requires.spec.ts:31-39` asserts `ARTIFACT_DRIFT`.                                                                                                                                                                                                                                                                                                        |
| 2   | MEDIUM leftover `LifecycleEngine` in schema-format DAG consumers, transition-checks verify `LifecycleEngine.evaluate`, TransitionChange pending-gate THENs, lifecycle-engine “Engine …” titles | **MOSTLY CLOSED; leftover titles OPEN (LOW)** | Schema-format canonical DAG consumers list `evaluateLifecycleVerdict` / `projectArtifacts` (preview ~113); **0** `LifecycleEngine` hits in schema-format preview. Transition-checks verify: **0** `LifecycleEngine.evaluate`. Pending gates: change + transition-checks previews keep drain states and **MUST NOT** persist `pending-spec-approval` on new hops; `TransitionChange._assertDrainAndGateTargets` (`transition-change.ts:337-364`) rejects new pending targets unless drain. Remaining: spec **title** still `# Lifecycle Engine`; verify scenario still **“Engine unifies three validation dimensions”** (`lifecycle-engine` preview ~210). Allowed re-export file `lifecycle-engine.ts` still exists by spec. |
| 3   | MEDIUM Change auto-gate on `taskCompletionCheck` vs `requiresTaskCompletion`                                                                                                                   | **CLOSED**                                    | `core:change` Implementation loop (`preview ~114`): hop gated by `workflow.taskCompletion` / `requiresTaskCompletion`, not mere `taskCompletionCheck`. `core:workflow-model` Task completion gating: `CountTasks` via `createWorkflowTaskCompletion`. Application check `packages/core/src/application/checks/workflow-task-completion.ts` composes `CountTasks`; domain `workflow-task-completion.ts` skips when `requiresTaskCompletion` empty. `build-schema.ts:721-736` subset + `hasTasks`. Schema-format constraint: `requiresTaskCompletion` only artifacts with `hasTasks: true`.                                                                                                                                    |
| 4   | Entity `isArchivable` includes `archiving`                                                                                                                                                     | **CLOSED**                                    | `change.ts:668-671` getter `archivable \|\| archiving`. `assertArchivable()` uses getter (`:1070-1073`). Tests `change.spec.ts:1075-1119` cover both states. `VALID_TRANSITIONS.archiving` = `archivable`, `designing` (`change-state.ts:42`). Recovery skips requires: `exceptAlong: ['recovery']` (`check-bindings.ts:35-44`).                                                                                                                                                                                                                                                                                                                                                                                             |

---

## Requirements Summary

Every **spec.md** requirement heading in the assigned **previews** (verify.md duplicates omitted as scenarios, not extra requirements).

### `core:lifecycle-engine` (11)

| Requirement                                       | Intent (preview)                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain lifecycle verdict                | Plain functions in `lifecycle-verdict.ts`; no class / `LifecycleEngineOptions`; `Logger.debug` only; domain verdict has no `command`.                                           |
| Centralized validation logic                      | Project caller `CheckResult`s; no I/O, no snapshot bag, no `check.run` fallback; no `run:` effects.                                                                             |
| Effective artifact status computation             | `projectArtifacts` DAG mapping; no public `computeEffectiveStatus`.                                                                                                             |
| Canonical-state-only lifecycle interpretation     | Ignore `complete-with-drift` / `hasDrift` as extra states.                                                                                                                      |
| Machine-readable blockers                         | Codes including `INCOMPLETE_ARTIFACT` (not `MISSING_ARTIFACT`), `ARTIFACT_DRIFT`, review/parent/tasks/overlap/invalid/approval. Bypass omits skippable blockers; no `warnings`. |
| Available steps and domain next hop               | One predicate evaluation; `availableSteps` = workflow extras rows; `nextHop` without `command`; no pending parking hops.                                                        |
| Application lifecycle guidance                    | `lifecycle-guidance.ts` + `evaluateLifecycle` attach `nextAction.command`. DAG-only UCs may use empty `checksByTarget`.                                                         |
| Archiving escape transitions in lifecycle verdict | `archiving` → `archivable`/`designing`; recovery skips requires.                                                                                                                |
| Review summary integration                        | Drift + historical overlap as review, not live `OVERLAP_CONFLICT`.                                                                                                              |
| Shared lifecycle interpretation for consumers     | GetStatus/TransitionChange/ValidateArtifacts/GetArtifactInstruction; not CompileContext. Re-export-only `lifecycle-engine.ts`.                                                  |
| Next artifact topological order                   | `schema.artifactDag().topologicalOrder()`; null if all complete/skipped.                                                                                                        |

### `core:transition-checks` (13)

| Requirement                               | Intent                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Check identity and result                 | Stable ids/labels/kind/outcome; no `archive.publication`; no `instruction:` checks.                       |
| Check ABI create and WorkflowCheck        | `execute` self-sufficient; no snapshot bag; `passMemo` for CountTasks; skip by binding phase + selectors. |
| One implementation file per check         | Kind on class; applicability on bindings.                                                                 |
| Applicability from, to, and along         | Axis splice `AXIS_FALLBACK`; omitted rows stay in `VALID_TRANSITIONS`.                                    |
| Archive is an operation not an edge       | No `approval.signoff` on archive.                                                                         |
| Binding pipeline phase and failure policy | `phase` / `onFailure`; transition `hook.post` before-persist; archive post after-persist.                 |
| Predicate versus effect                   | Effects not in status `allowed`.                                                                          |
| Evaluation of a transition attempt        | No approval routing rewrite; protocol fail-fast on TransitionChange only.                                 |
| Registry bindings for this capability     | Listed predicates/effects; impl forward-exit only; approvals on delivery edges.                           |
| Actionable fail diagnostics               | Compact impl messages; full lists for deps/readOnly.                                                      |
| Generic check progress bus                | check-start/progress/done; no `Executing:`.                                                               |
| Projections                               | `availableTransitions` from predicates; `nextAction` from evaluation + review.                            |
| No shared snapshot bag                    | One binding table; domain projects from `checksByTarget`.                                                 |

### `core:workflow-model` (11)

| Requirement                                             | Intent                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Step names reference domain lifecycle states            | Lookup extras; unknown step fails at `buildSchema`; omit row ≠ remove protocol state. |
| Step semantics                                          | Designing/implementing/verifying/archiving roles; drift forces designing.             |
| Requires-based gating                                   | Shared `workflow.requires`; skip empty requires.                                      |
| Task completion gating                                  | `requiresTaskCompletion` subset; CountTasks; no engine file walk.                     |
| Step availability evaluation                            | Verdict projections; CompileContext MUST NOT evaluate hops.                           |
| Workflow array order is display order and progress axis | Display + `along`; not sequential locking.                                            |
| Step-to-state mapping                                   | Step name IS state name.                                                              |
| Hook execution at step boundaries                       | Effects via matcher; transition post before persist.                                  |
| Two execution modes                                     | Auto-run unless `skipHookPhases`.                                                     |
| Step requires reference artifact IDs                    | Not step names; cycles impossible.                                                    |

### `core:change` (22 spec.md)

Identity; Revision timestamp; Workspaces and specs; Lifecycle (incl. drain pending states, `VALID_TRANSITIONS`, HAPPY_PATH_NEXT ≠ GetStatus.nextAction); Skill-aligned backward hops; Archiving escape transitions; Implementation and verification loop (`requiresTaskCompletion` not auto `taskCompletionCheck`); Implementation tracking state; Explicit vs container-only file links; Historical implementation detection guard; Spec approval gate (stay in `ready`); Signoff gate (stay in `done`); Artifacts; Artifact sync; History and event sourcing; Archive outcome history; Historical implementation detection; Schema version; Drafting and discarding; Drafted read-only semantics; Lifecycle interpretation authority; Policy-aware invalidation; Per-file drift tracking.

### `core:schema-format` (21 real + 1 template heading)

Schema file structure; Schema kind field; Schema extends; Array entry identity; Artifact definition; Schema artifact DAG API; Canonical artifact DAG derivation; preHashCleanup; taskCompletionCheck; Template resolution; Validation rules; Delta validation rules; Cross-artifact validation rules; Per-spec approval; Metadata extraction; Artifact scope; Workflow; Explicit external hook entries; Schema plugin kind; Schema resolution; Schema validation on load; verify.md format. Preview verify.md also contains a **documentation template** heading `### Requirement: <Name>` (not a product requirement).

### `default:_global/architecture` (13)

Layered structure; Domain layer is pure (+ ambient Logger exception); Application uses ports only; Rich domain entities; Value objects expose behaviour; Ports as abstract classes; Pure functions for stateless domain services; Manual DI; Composition layer; YAML validated at infrastructure boundary; Adapter packages no business logic; No circular package deps; Curated public entry points.

### `default:_global/logging` (6)

Console compatibility; Method aliasing; Level mapping; Log level semantics; Policy on console usage; Ambient Logger.

---

## Implementation Status

| Area                                              | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `LifecycleEngine` class / options              | **implemented**                       | Dist 0 hits; src `rg` no class; `lifecycle-engine.ts` is re-export only (`:1-18`). Graph public binding is the re-export surface, not a class.                                                                                                                                                                                          |
| Domain verdict functions                          | **implemented**                       | `evaluateLifecycleVerdict` `lifecycle-verdict.ts:142-300`; `projectArtifacts` `:309-324`; `findBlockingParent` `:326-332`. `LifecycleNextHop` has `targetStep`/`actionType`/`reason` only (`:99-103`).                                                                                                                                  |
| Application `evaluateLifecycle` + command         | **implemented**                       | `lifecycle-evaluation.ts:20-37`; `LifecycleNextAction.command` `lifecycle-guidance.ts:10-12`, `resolveLifecycleCommand` `:17-106`.                                                                                                                                                                                                      |
| Logger from observability, not application        | **implemented**                       | `lifecycle-verdict.ts:13`. `application/logger.ts` re-exports observability (composition convenience). Tests import `application/logger.js` (`lifecycle-engine.spec.ts:2`) — test-only.                                                                                                                                                 |
| Architecture global agnostic                      | **implemented (preview)**             | Architecture spec-preview has no `evaluateLifecycle` / `LifecycleEngine` / `packages/core`.                                                                                                                                                                                                                                             |
| `workflow.requires` status-specific codes         | **implemented**                       | `workflow-requires.ts:49-74`. Live status: drift → `ARTIFACT_DRIFT`.                                                                                                                                                                                                                                                                    |
| Recovery skips requires/tasks                     | **implemented**                       | `check-bindings.ts:35-44` `exceptAlong: ['recovery']`. Verdict `transitionBlockers` skips archiving→archivable (`lifecycle-verdict.ts:216-218`).                                                                                                                                                                                        |
| `isArchivable` includes archiving                 | **implemented**                       | `change.ts:668-671`; tests `:1075-1119`.                                                                                                                                                                                                                                                                                                |
| Task gating via `requiresTaskCompletion`          | **implemented**                       | Domain + application task-completion checks; schema build validation.                                                                                                                                                                                                                                                                   |
| Consumers                                         | **implemented**                       | GetStatus `get-status.ts:481` `evaluateLifecycle`; TransitionChange `transition-change.ts:219` `evaluateLifecycle`; ValidateArtifacts `validate-artifacts.ts:220-222` empty `checksByTarget`; GetArtifactInstruction `get-artifact-instruction.ts:97`. CompileContext: no `evaluateLifecycle*` under `packages/core/src` compile paths. |
| No snapshot bag                                   | **implemented**                       | `rg PredicateSnapshots\|gatherPredicateSnapshots` in core src → 0.                                                                                                                                                                                                                                                                      |
| `VALID_TRANSITIONS` / drain pending               | **implemented**                       | `change-state.ts:30-43`. Guidance still maps drain states `pending-spec-approval` / `pending-signoff` (`lifecycle-guidance.ts:54-72`) — consistent with drain, not new parking hops from ready/done.                                                                                                                                    |
| Next artifact DAG order                           | **implemented**                       | `nextArtifact` uses `schema.artifactDag().topologicalOrder()` (`lifecycle-verdict.ts:754`).                                                                                                                                                                                                                                             |
| Parent-review mapping vs “any incomplete parent”  | **partial vs spec prose**             | See discrepancy D3.                                                                                                                                                                                                                                                                                                                     |
| `projectArtifacts` parent walk vs `artifactDag()` | **partial vs schema-format DAG MUST** | See discrepancy D4.                                                                                                                                                                                                                                                                                                                     |
| Domain `isReady` when checks present              | **implemented**                       | Uses `workflow.requires` fail (`lifecycle-verdict.ts:184-190`); does not emit a second blocker list when checks injected (`:207-210`). Still computes `blockingArtifacts` from DAG for extras rows.                                                                                                                                     |

---

## Discrepancies

### D1 — MEDIUM — **spec-wrong** — `evaluateLifecycleVerdict` must project `nextAction`

- **Specs:** `core:transition-checks` Requirement: No shared snapshot bag (preview ~204): _"`evaluateLifecycleVerdict` SHALL project `validTransitions` / `availableTransitions` / `nextAction`"_. `core:change` Lifecycle interpretation authority (preview ~363): _“which blocker or **next action** should be surfaced”_ via `evaluateLifecycleVerdict` / `projectArtifacts`.
- **Code:** Domain `LifecycleDomainVerdict` has `nextHop`, not `nextAction`/`command` (`lifecycle-verdict.ts:105-119`). Application attaches `nextAction` (`lifecycle-evaluation.ts:13-37`). `core:lifecycle-engine` Application lifecycle guidance **forbids** command on domain.
- **Why spec-wrong:** Contradicts the change’s own lifecycle-engine + architecture split. Code matches the stricter, later engine spec.
- **Option A:** Edit transition-checks + change previews to say domain projects `nextHop`; application `evaluateLifecycle` projects `nextAction`.
- **Option B:** Put `command` on domain (violates architecture / logging-adjacent purity of product strings).

### D2 — LOW — **spec-wrong** — leftover “Engine” titles / module names

- **Specs:** Document title `# Lifecycle Engine`; verify _“Engine unifies three validation dimensions”_; comments in `workflow-requires.ts:22` “engine binding”. Spec still **allows** `domain/lifecycle-engine.ts` re-export (`lifecycle-engine` preview ~175).
- **Code:** Functions + re-export; test file still `lifecycle-engine.spec.ts`.
- **Why spec-wrong:** Prior item #2 asked to drop class-era naming. Functional leftovers remain in titles/filenames, not ABI.
- **Option A:** Rename titles/scenarios/test file to verdict language; keep re-export path if public.
- **Option B:** Keep “engine” as informal synonym (risks auditors re-opening class hunt).

### D3 — MEDIUM — **both** — effective status when parent is `missing` / `in-progress`

- **Spec:** Mapping rule: aggregated `complete` + **any** required upstream not `complete`/`skipped` → `pending-parent-artifact-review` (`lifecycle-engine` preview ~46).
- **Code:** Review-like parents → `pending-parent-artifact-review`; other incomplete parents → child effective **`in-progress`** (`lifecycle-verdict.ts:375-390`). Test `lifecycle-engine.spec.ts:197-217` expects `tasks` effective `in-progress` when `proposal` is `in-progress`.
- **Verify** only covers pending-review parent → parent-review (preview ~244-251).
- **Why both:** Spec prose is wider than scenarios and than code/tests. Code matches the in-progress test and is arguably clearer (missing parent is not “review”).
- **Option A:** Narrow spec mapping rule to review-like parent states only.
- **Option B:** Change `effectiveStatus` to always emit `pending-parent-artifact-review` (breaks existing test and status UX).

### D4 — MEDIUM — **both** — `projectArtifacts` walks `schema.artifact().requires` not `artifactDag()`

- **Spec:** `core:schema-format` Canonical artifact DAG derivation: production MUST use `schema.artifactDag()`, not local `requires` walks (preview ~107-113). Lists `evaluateLifecycleVerdict` / `projectArtifacts` as consumers.
- **Code:** `nextArtifact` uses `artifactDag().topologicalOrder()` (`:754`). `requiresForArtifact` returns `schemaArtifact.requires` (`:986-995`); `effectiveStatus` / `findBlockingParent` recurse that list.
- **Why both:** Edges are the same data `ArtifactDag` is built from; a parallel walk is still a second algorithm. Spec may over-constrain recursive parent-status vs topo order.
- **Option A:** Implement parent iteration via `artifactDag()` helpers only.
- **Option B:** Relax schema-format to allow typed `artifact.requires` for effective-status recursion if `nextArtifact` stays on `topologicalOrder()`.

### D5 — LOW — **code-wrong** — `assertArchivable` JSDoc vs getter

- **Code:** Getter documents archivable **or** archiving (`change.ts:668`). `assertArchivable` JSDoc still says _“in `archivable` state”_ (`:1066-1068`) while the body uses `isArchivable` (`:1071`).
- **Spec:** Change preview does not name `isArchivable`; archive-from-archiving is implied by archiving escape + archive operation.
- **Option A:** Fix JSDoc to match getter (docs-only).
- **Option B:** Split APIs (would break archive retry).

### D6 — LOW — **spec-wrong** — workflow-model still says “plus approval gate states” as if they were first-class schema steps

- **Spec:** `core:workflow-model` Step names (`preview ~12`) lists `drafting`…`archivable` **plus approval gate states**. Same spec: workflow `step` MUST NOT introduce a new lifecycle state.
- **Code:** Pending states remain `ChangeState` drain-only (`change-state.ts`); schema lookup is extras on known names.
- **Aligned in spirit** with `core:change` drain documentation; wording still suggests schema can list pending parking states.
- **Option A:** Say drain `ChangeState` values exist on the entity, not as `workflow[]` extras.
- **Option B:** Allow schema rows for drain states (unused).

No **HIGH** open code-wrong on assigned specs after rebuild. User layering constraints hold.

---

## Test Coverage / Missing Tests

| Requirement cluster                                 | Tests                                                                         | Gap                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Drift `workflow.requires` → `ARTIFACT_DRIFT`        | `packages/core/test/domain/checks/workflow-requires.spec.ts:31`               | Covered. Live CLI status confirms dist.                                                               |
| No `LifecycleEngine` class                          | None named; absence of symbol in src/dist                                     | **Missing** explicit “export surface has no class” test (verify scenario “No LifecycleEngine class”). |
| Domain vs application command                       | `lifecycle-engine.spec.ts` `describe('evaluateLifecycle')`; domain helper mix | **Weak** assertion that `nextHop` has no `command` key (verify ~363-368).                             |
| `isArchivable` includes archiving                   | `change.spec.ts:1075-1119`                                                    | Covered (prior gap closed).                                                                           |
| Task completion not auto from `taskCompletionCheck` | workflow-model / task-completion / build-schema tests (package)               | Spot-check aligned; full matrix is other batches.                                                     |
| Parent-review vs in-progress parent                 | `lifecycle-engine.spec.ts:197` in-progress chain                              | No test that spec mapping rule 3 (any incomplete → parent-review) holds — because code does not.      |
| `artifactDag().topologicalOrder` next artifact      | engine spec next-artifact scenarios (file)                                    | Covered if those tests still assert `specs` before `design`.                                          |
| Architecture / logging                              | ESLint import layers + Logger no-op tests elsewhere                           | Domain import path not asserted in this file.                                                         |
| Transition pending-gate                             | `transition-change.ts` drain helper                                           | Covered in transition-change tests (out of this file’s exclusive ownership).                          |

**Missing tests (assigned scope):** (1) freeze “no class / no LifecycleEngineOptions” on public barrels; (2) `expect(domain.nextHop).not.toHaveProperty('command')`; (3) optional: `effectiveStatus` documentation test matching whichever mapping rule is chosen after D3.

---

## Spec Dependency Chain (depth 1)

| Edge                                                           | Consistency                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lifecycle-engine → change                                      | Persisted facts vs DAG interpretation: **aligned**. Next-action attribution: **D1**. `isArchivable` not named in change spec but code/tests match archive-from-archiving. |
| lifecycle-engine → workflow-model                              | Shared requires/taskCompletion checks: **aligned**. CompileContext must not evaluate hops: **aligned** (no compile-context evaluate calls).                               |
| lifecycle-engine → schema-format                               | DAG next-artifact: **aligned**. Effective-status walk: **D4**. DAG consumer list updated off `LifecycleEngine`: **aligned**.                                              |
| lifecycle-engine → architecture                                | Plain functions, no class: **aligned**. Logger exception: **aligned** (observability). Architecture preview stays package-agnostic: **aligned**.                          |
| lifecycle-engine → logging                                     | `Logger.debug` diagnostics only: **aligned** (`lifecycle-verdict.ts:273-284`).                                                                                            |
| lifecycle-engine → transition-checks                           | One evaluation / CheckResults: **aligned**. `nextAction` on domain: **D1**. Recovery along: **aligned**.                                                                  |
| transition-checks → change                                     | Drain pending + no rewrite to pending: **aligned** (`VALID_TRANSITIONS.ready` has no pending).                                                                            |
| transition-checks → workflow-model                             | Axis / extras vs protocol: **aligned**.                                                                                                                                   |
| transition-checks → schema-format                              | Workflow YAML extras: **aligned**.                                                                                                                                        |
| transition-checks → architecture                               | Domain stubs vs application `execute`: **aligned**.                                                                                                                       |
| workflow-model → change                                        | Step name = state: **aligned**. Approval gate wording: **D6**.                                                                                                            |
| schema-format → (no lifecycle-engine dep in preview deps list) | DAG consumers still name verdict functions: **aligned** with engine spec.                                                                                                 |
| logging → architecture                                         | Ambient Logger exception: **aligned**.                                                                                                                                    |

---

## Summary counts

| Bucket                                                                    | Count      | Notes                                                              |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Requirements reviewed (unique spec.md headings in assigned + two globals) | **97**     | 11+13+11+22+21+13+6; schema-format template `<Name>` excluded      |
| Implemented (no material gap)                                             | **~90**    | Including prior HIGH dist/drift and isArchivable/task gating       |
| Missing implementation                                                    | **0 HIGH** | Mapping D3/D4 are interpretation, not absent modules               |
| Spec-wrong                                                                | **4**      | D1, D2, D6, plus D3/D4 spec side                                   |
| Code-wrong                                                                | **1 LOW**  | D5 JSDoc; D3/D4 code side if spec kept literally                   |
| Both                                                                      | **2**      | D3, D4                                                             |
| Test gaps                                                                 | **3**      | No class freeze; no `command` absence; D3 rule untested as written |

**Highest findings:** live `ARTIFACT_DRIFT` + empty dist `LifecycleEngine` close prior HIGH; remaining MEDIUM is spec split (`nextAction` on domain vs application) and parent-status / DAG-walk wording vs code.
