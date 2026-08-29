# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260829-090131
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state at audit:** designing (`ARTIFACT_DRIFT` on specs/verify; nextAction `/specd-design`)
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** Reindexed before audit (`filesIndexed: 10` core/cli/skills). `graph stats` after index: `stale: false`, `contentFresh: true`, `state: current` at `2026-08-29T07:01:44.495Z` / ref `2948f1a2`. File-level `graph impact` is still incomplete for some getters; source claims verified against working-tree files.
- **Read-only.** Partials in this directory must be kept.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide extras:** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (conformance only). Depth-1 deps noted inside partials.

**Batches:** `_partial-lifecycle-core.md`, `_partial-use-cases.md`, `_partial-archive-hooks.md`, `_partial-cli-skills.md`, `_partial-globals.md`

## Executive summary

Neither spec nor code is assumed true. **Source and shipped dist now agree** on the focus contract: checks own hops; no `LifecycleEngine` class; DAG vs hop split; application owns `nextAction.command`; `workflow.requires` maps drift → `ARTIFACT_DRIFT`.

Live `changes status workflow-transition-checks` shows `workflow.requires` fail **`ARTIFACT_DRIFT`** (`drifted-pending-review`). `rg LifecycleEngine packages/core/dist` → **0 matches**.

### Closed vs prior audit (20260829-013719)

| Prior finding                                                                                                              | Now                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HIGH: dist vs src (`LifecycleEngine` class; `workflow.requires` always `INCOMPLETE_ARTIFACT`)                              | **CLOSED.** Dist rebuilt; live CLI emits `ARTIFACT_DRIFT`.                                                 |
| HIGH: `cli:change-archive` archivable-only vs Core `archiving`                                                             | **CLOSED.** Preview + skill: `archivable` **or** `archiving`; CLI has no second state table.               |
| HIGH: ValidateArtifacts ctor `LifecycleEngine`                                                                             | **CLOSED** (already in 013719; re-verified).                                                               |
| MEDIUM: leftover `LifecycleEngine` in schema-format / transition-checks verify / pending-gate THENs                        | **CLOSED** for those bodies. Leftover **titles** (`# Lifecycle Engine`, “Engine unifies…”) remain **LOW**. |
| MEDIUM: Archive predicates do not fail-fast after `schema.nameMatch`                                                       | **CLOSED.** `failFastOn: 'schema.nameMatch'` + unit test.                                                  |
| LOW: drafted CLI JSON leak of `availableSteps`                                                                             | **CLOSED** (forced `[]`; tested with Core leak).                                                           |
| LOW: dual archive `deps.consistent`; overlap I/O before predicates; Logger `log` vs `info` tests / observability test path | **Still open** (not elevated).                                                                             |

### Highest-severity open findings

**No HIGH.** Remaining work is wording, DAG-walk interpretation, and test gaps.

1. **MEDIUM — spec-wrong:** `core:transition-checks` / `core:change` still say domain `evaluateLifecycleVerdict` projects **`nextAction`**. Code + `core:lifecycle-engine` put `command` only on application `evaluateLifecycle` / `LifecycleNextAction`.
2. **MEDIUM — both:** Effective-status prose says any incomplete parent → `pending-parent-artifact-review`; code maps non-review incomplete parents to **`in-progress`** (tested).
3. **MEDIUM — both:** `projectArtifacts` parent walk uses `artifact.requires` while schema-format Canonical DAG derivation lists it as an `artifactDag()` consumer. `nextArtifact` already uses `topologicalOrder()`.
4. **MEDIUM — both (globals):** Architecture “each package wires Logger” vs logging “each package chooses” vs a single `createKernel` `setImplementation`.
5. **LOW:** Dual `runDepsConsistent`; overlap prefetch before archive predicates; leftover “engine” JSDoc; status `--help` hops vs nested `lifecycle` JSON; Logger test path / `log`≡`info` untested.

### Architecture / logging (user constraint)

`default:_global/architecture` preview stays **package-agnostic**. Domain does not import `application/`. Ambient Logger from `observability/` is the documented exception. **0 blocking** vs that constraint.

### What is aligned

- GetStatus / TransitionChange import `evaluateLifecycle`; DAG UCs use `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`.
- All `resolve*Deps` omit `lifecycle`.
- Draft Core + CLI drafted JSON: empty hops, `nextAction.command` null (CLI sanitizes leaks).
- `--next` → Core `to: 'next'`.
- Approvals stay in `ready`/`done`.
- Archive operation + `archiveBindings`; hooks `createHookPre` / `createHookPost`.
- Skills: `nextAction.command`, overlap → `/specd-design`, archive hop / `archiving` retry.

## Recommended next steps (not part of this audit)

1. Align transition-checks / change “nextAction” wording with domain `nextHop` + application `evaluateLifecycle`.
2. Narrow or implement the parent-status mapping rule (D3) and DAG-walk rule (D4).
3. Optional: archive integration tests for fail-fast vs `list()`; freeze “no `LifecycleEngine` class” on public barrels; Logger `log`≡`info` + `test/observability/` mirror.

---

# Detailed findings (verbatim partials)

---

## Partial file: `_partial-lifecycle-core.md`

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

---

## Partial file: `_partial-use-cases.md`

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change
- **Change:** `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** reindexed (`stale: false`); navigation via `graph search` / `graph impact`
- **User-enforced:** no `domain` → `application` imports; no `LifecycleEngine` class
- **Neither spec nor code is truth.** Discrepancies list Option A (spec wrong / wording drift) and Option B (code wrong).

---

## Requirements Summary

### `core:get-status`

Previewed delta requirements (abridged, all checked):

| ID    | Requirement                                                                                                                         | Spec location (preview)                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                               | Accepts a change name as input                              |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`    | Returns the change and its artifact statuses                |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                             | Returns… / Throws ChangeNotFoundError                       |
| GS-4  | Drafted: empty `availableTransitions`; `nextAction.command` MUST NOT recommend transition/validate; `availableSteps` empty          | Drafted change read-only status / Returns lifecycle context |
| GS-5  | Drafted effective statuses via same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`)              | Drafted change read-only status                             |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only (not detector)                                 | Implementation status / Optional pre-read refresh           |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                            | Drift-aware display status                                  |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`    | Reports task completion counts / Constructor                |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                          | Execute matching predicates then project                    |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`                 | Constructor dependencies                                    |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                       | Config-based factory…                                       |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                       | Reports effective status…                                   |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping is shared with checks | Returns lifecycle context / Identifies blockers             |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                               | Graceful degradation                                        |

### `core:transition-change`

| ID   | Requirement                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 | Import `evaluateLifecycle` as module function; MUST NOT ctor `LifecycleEngine`                                                             |
| TC-2 | `to: 'next'` = `HAPPY_PATH_NEXT`; typed error when undefined (pending-spec-approval, pending-signoff, archivable, archiving, …)            |
| TC-3 | `failFastOn: 'protocol.edge'` for predicate execute                                                                                        |
| TC-4 | Approvals in place: `ready` + spec gate MUST NOT rewrite persist target to `pending-spec-approval`; stay in `ready` on `approval-required` |
| TC-5 | Task gating via `workflow.taskCompletion`; MUST NOT second `CountTasks` after green predicates                                             |
| TC-6 | `resolveTransitionChangeDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`; import `evaluateLifecycle`                                 |
| TC-7 | Constructor: changes, actor, schemaProvider, refresh, approvals, `transitionBindings` (not `RunStepHooks` / `CountTasks`)                  |

### `core:validate-artifacts`

| ID   | Requirement                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| VA-1 | Constructor without `LifecycleEngine`; DAG via `evaluateLifecycleVerdict({ checksByTarget: {} })` once at start; in-memory `markVerdictComplete` |
| VA-2 | MUST NOT hop predicates / `executeChecksByLegalTargets`                                                                                          |
| VA-3 | `resolveValidateArtifactsDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                  |

### `core:get-artifact-instruction`

| ID    | Requirement                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| GAI-1 | Constructor without `LifecycleEngine`; omitted `artifactId` → `evaluateLifecycleVerdict` empty `checksByTarget` → `nextArtifact` |
| GAI-2 | MUST NOT hop predicates / `availableTransitions` evaluation                                                                      |
| GAI-3 | `resolveGetArtifactInstructionDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                             |

### `core:approve-spec` / `core:approve-signoff`

| ID   | Requirement                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| AS-1 | Happy path: record consent in bound `from` (`ready` / `done`); MUST NOT transition to pending parking states |
| AS-2 | Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`                           |
| AS-3 | Gate disabled → `ApprovalGateDisabledError`; ctor `approvals` from config                                    |

### `core:config`

| ID    | Requirement                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| CFG-1 | `approvals.spec` / `approvals.signoff` default false; in-place gates; new work MUST NOT require pending hops as happy path |
| CFG-2 | Config MUST NOT document pending-spec-approval as required graph hop when spec gate is on                                  |

**Global / architecture (depth-1, relevant):** inner layers never import outer (`specs/_global/architecture` layered structure). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted. Dist confirmation: `packages/core/dist/chunk-OEJ6NTAS.js` (bundled).

### Closed vs prior `20260829-013719` (this batch)

| Prior claim                                                        | Re-verify                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH: ValidateArtifacts ctor `LifecycleEngine`                     | **CLOSED.** Ctor `packages/core/src/application/use-cases/validate-artifacts.ts:136-154` has no lifecycle engine. Call `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })` at `:220-222`. Dist `chunk-OEJ6NTAS.js:28556` same call. Test `validate-artifacts.spec.ts:241` spies empty `checksByTarget`. Graph: class `ValidateArtifacts` at `validate-artifacts.ts:114`. |
| GetStatus / GAI leftover engine **language**                       | **Mostly closed for call graph; leftover comments remain.** GetStatus imports `evaluateLifecycle` `:18`, calls `:481-484`. GAI imports `evaluateLifecycleVerdict` `:15`, calls `:97-99`. **No `engine` token in GAI source.** GetStatus JSDoc still says “engine” at `:232`, `:723`, `:771-801`.                                                                                        |
| TransitionChange pending-gate verify still named `LifecycleEngine` | **CLOSED in previewed deltas.** `spec-preview core:transition-change` pending scenarios now say `evaluateLifecycle` (preview ~369–379). Implementation: `evaluateLifecycle` import `:14`, call `:219-223`; drain/gate `_assertDrainAndGateTargets` `:337-366`; no pending rewrite of `to`. Tests `transition-change.spec.ts:377-391` stay in `ready` on approval-required.              |
| composition `lifecycle: {} as never`                               | **CLOSED.** `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` returns changes/schema/approvals/refresh/bindings only. Same pattern for TransitionChange `:41-50`, ValidateArtifacts `:38-53`, GAI `:37-48`, ApproveSpec `:37-44`, ApproveSignoff `:37-44`. Workspace search: no `lifecycle: {} as never`.                                                              |
| dist stale / `INCOMPLETE_ARTIFACT` from old engine                 | **src + dist + tests agree.** Dist has `evaluateLifecycleVerdict` (`chunk-OEJ6NTAS.js:22600`, GAI `:23272`, ValidateArtifacts `:28556`). **Zero** `LifecycleEngine` matches under `packages/core/dist`. Graph search for `class LifecycleEngine`: **no class**. `lifecycle-engine.ts` is a **re-export barrel** of `lifecycle-verdict.js` (`:1-18`).                                    |

### Per-spec implementation

**GetStatus — IMPLEMENTED (contracts hold)**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`.
- Active path: `executeChecksByLegalTargets` `:457` then `evaluateLifecycle` `:481-484`; task paint `taskCompletionFromChecks` `:96-120`, `:488`.
- Drafted: `_buildDraftedResult` `:621-715` — `availableTransitions: []` `:675`, `availableSteps: []` `:676`, `nextAction.command: null` `:709-713`. Effective status via `projectArtifacts` `:640-641` (same DAG as `evaluateLifecycleVerdict` which calls `projectArtifacts` at `lifecycle-verdict.ts:153`). Explicitly does **not** call `evaluateLifecycle` (test spy `get-status.spec.ts:847-850`).
- Schema fail: try/catch `SchemaNotFoundError` `:395-444`; `availableTransitions` stays `[]`.
- Composition: `resolveGetStatusDeps` does not resolve lifecycle (`get-status.ts` composition `:39-50`).

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187` (`change-state.ts:49-58`).
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with `checksByTarget: { [requestedTarget]: evaluation.checks }`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); comments `:48-50` forbid pending rewrite.
- `resolveTransitionChangeDeps` `:41-50` — no lifecycle key.

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor `:136-154` — no engine.
- `resolveValidateArtifactsDeps` `:38-53` — no lifecycle.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Ctor `:66-72` — no engine.
- `resolveGetArtifactInstructionDeps` `:37-48` — no lifecycle.

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: consent in `boundFromStates('approval.spec')`; drain only if `pending-spec-approval` (`approve-spec.ts:86-98`). Ready path does not `transition` to pending.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- Ctor comments still say “engine binds” (`approve-spec.ts:23`, `approve-signoff.ts:23`) — wording only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:219-220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Preview: gates stay in `ready`/`done`; pending not happy-path.

**Architecture / domain imports — IMPLEMENTED**

- Grep `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain (`:1-12` domain-only imports).

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

Matches the assigned contract.

---

## Discrepancies

### D1 — LOW — leftover “engine” **wording** (GetStatus + domain checks + change specs)

**Evidence (code):** `get-status.ts:232` “from the engine”; `:723`, `:771-801` “Engine” JSDoc. `workflow-requires.ts:22-23`, `:96` “Engine bindings”. ApproveSpec/Signoff class JSDoc “engine binds” (`approve-spec.ts:23`, `approve-signoff.ts:23`).

**Evidence (spec):** GetStatus “availableSteps MUST be the extras-bearing `schema.workflow()` rows from the **engine**”; GAI verify scenario title “Omitted artifactId uses **engine-derived** readiness”; ApproveSpec depends-on text “engine check bindings”.

**Option A (prefer for wording):** Specs and comments still name the removed class; behaviour already uses `evaluateLifecycle` / `evaluateLifecycleVerdict` / `boundFromStates`. Update wording to those names.

**Option B:** Treat leftover “engine” as a remaining `LifecycleEngine` abstraction — **rejected by graph**: no `class LifecycleEngine`; barrel only.

**Severity:** documentation / spec-preview drift, not a ctor/import violation.

### D2 — LOW — drafted GetStatus does not call `evaluateLifecycleVerdict`

**Spec:** compute effective statuses via the same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`). Also: compute artifact **and lifecycle projections** for inspection.

**Code:** `projectArtifacts` only (`get-status.ts:640-667`). Lifecycle inspection fields zeroed (`validTransitions: []`, `nextArtifact: null`, empty checks). Test **asserts** `evaluateLifecycle` is not called (`get-status.spec.ts:816-857`).

**Option A:** Spec’s parenthetical `projectArtifacts` plus “MUST NOT surface transitions” is the intended draft path; empty lifecycle extras are correct.

**Option B:** Spec wants a full `evaluateLifecycleVerdict(..., { checksByTarget: {} })` for inspection (`nextArtifact`, review) while still emptying mutation surfaces. Then code under-projects `nextArtifact`/review on drafts.

**Assessment:** functional contract for **empty transitions / null command / parent-review cascade** is met (`pending-parent-artifact-review` test `:852-853`). Gap is only whether draft inspection must include verdict `nextArtifact`/`review`.

### D3 — INFO — GetStatus `LifecycleContext.availableSteps` comment vs implementation

Comment `:232` says “from the engine”; implementation copies `verdict.availableSteps` from `evaluateLifecycle` (`:524`). Same as D1.

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no dist symbol, no `lifecycle:` composition stub. **Compliant** with user-enforced rule.

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                       | Verdict                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`                  | Covered                           |
| Drafted empty transitions / steps                                     | `get-status.spec.ts:795-857`                                            | Covered (`availableSteps` `:856`) |
| Drafted parent-review cascade                                         | `get-status.spec.ts:816-857`                                            | Covered                           |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:362-434` (`toHaveBeenCalledTimes(1)` `:430`)        | Covered                           |
| Recount on second `GetStatus.execute` (no instance cache)             | `get-status.spec.ts:437-454`                                            | Covered                           |
| Schema degrade empty `availableTransitions`                           | `get-status.spec.ts:286-296`                                            | Covered                           |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215`    | Covered                           |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-254`                                     | Covered                           |
| Approvals stay in `ready`                                             | `transition-change.spec.ts:377-391`                                     | Covered                           |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241`                                        | Covered                           |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-50`                                       | Covered                           |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                            | Covered                           |
| Dist vs src DAG functions                                             | `chunk-OEJ6NTAS.js` `evaluateLifecycleVerdict` at ValidateArtifacts/GAI | Covered by rebuild artifact       |

---

## Missing Tests

| Gap                                                                  | Spec                | Suggested assertion                                                                                                                         |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafted `nextAction.command === null`                                | GS-4                | `get-status.spec.ts` drafted block asserts `result.nextAction.command` is `null` (currently only transitions/steps/nextArtifact)            |
| Drafted `evaluateLifecycleVerdict` not required vs spec dual wording | GS-5 / D2           | If Option A: assert `projectArtifacts` / parent-review only. If Option B: spy `evaluateLifecycleVerdict` once with `{ checksByTarget: {} }` |
| GetStatus `failFastOn` omitted (collect all fails)                   | GS-9                | Exists at `execute-matching-predicates.spec.ts:43` — **not missing**; ensure GetStatus integration still has a hop with two fails           |
| GAI verify title “engine-derived”                                    | GAI verify          | Rename scenario; keep `evaluateLifecycleVerdict` spy (`empty checksByTarget`)                                                               |
| TransitionChange verify scenarios named `LifecycleEngine`            | TC (historical)     | **Re-previewed closed**; keep tests on `evaluateLifecycle` import (`transition-change.spec.ts:15`)                                          |
| Composition never resolves `lifecycle`                               | GS-11 / TC-6 / VA-3 | Source-string tests exist for overlap flag; could assert deps object keys omit `lifecycle`                                                  |

No missing test for **second CountTasks on GetStatus** — `toHaveBeenCalledTimes(1)` on a single execute is present.

---

## Spec Dependency Chain

From `changes status workflow-transition-checks` `specDependsOn` (depth 1, assigned specs):

- **core:get-status** → `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:transition-change** → `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:validate-artifacts** → `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, `core:spec-id-format`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:get-artifact-instruction** → `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-spec** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-signoff** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:config** → `core:vcs-adapter-port`, `default:_global/architecture`, `core:transition-checks`

**Consistency note:** several specs still **depend on** `core:lifecycle-engine` while implementation uses `evaluateLifecycle` / `evaluateLifecycleVerdict`. That is a **spec-id naming** leftover (the engine spec now describes functions). Not a code import of a class.

**Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

---

## Summary counts

| Metric                                     | Count                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| Specs in this batch                        | 7                                                               |
| Requirements tracked (tables above)        | 32                                                              |
| Implemented (behaviour)                    | 31                                                              |
| Partial / wording-only                     | 1 (D1 leftover “engine” strings)                                |
| Functional discrepancies                   | 0 HIGH; 1 LOW optional (D2 draft verdict vs `projectArtifacts`) |
| Missing tests                              | 1–2 (draft `command: null`; optional verdict spy)               |
| Prior HIGH ValidateArtifacts ctor          | **CLOSED**                                                      |
| Prior composition `lifecycle: {} as never` | **CLOSED**                                                      |
| Prior dist stale engine                    | **CLOSED** (src + `dist/chunk-OEJ6NTAS.js` + tests)             |
| `LifecycleEngine` class                    | **ABSENT**                                                      |
| domain → application imports               | **ABSENT**                                                      |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)        |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`)                                  |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (all six composition helpers in this batch)                    |
| Drafted GetStatus empty transitions / steps / `command` null     | **PASS** (`:675-676`, `:713`)                                           |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`)                                 |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`)                                                       |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`)                          |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready`)   |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430` one execute) |

---

## Partial file: `_partial-archive-hooks.md`

# Spec-compliance audit (partial): archive-change / hook-execution-model / storage

**Change:** `workflow-transition-checks`  
**Mode:** change  
**Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**CLI:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`  
**Graph:** reindexed, `stale: false` (per parent). Navigation via `specd graph search` / file reads.  
**Scope note:** Storage is audited against the change-preview requirements that this batch was assigned to check (`projectArtifacts`, no `Change.effectiveStatus()`, no `LifecycleEngine` class / `LifecycleEngine.projectArtifacts`). The rest of `core:storage` (fs-cache layout, archive pattern variables, locks, etc.) is not re-litigated here.  
**Prior 013719:** OPEN MEDIUM `failFastOn: 'schema.nameMatch'` is implemented. CLI archivable-only vs Core `archiving` is **out of this batch**; noted only if still visible from Core/CLI wiring.  
**User-enforced:** domain must not import application; there must be no `LifecycleEngine` class.

Neither spec nor code is treated as sole truth. Evidence is `path:line`.

---

## Requirements Summary

### `core:archive-change`

| Requirement                                 | Spec intent (preview)                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor                       | Inject `archiveBindings`; no `RunStepHooks` / `HookRunner` / `projectWorkflowHooks` on the use case. `ListWorkspaces`, parsers, `MaterializeSpecMetadata`, hasher, batch snapshot, etc.                                                                                                                                                                                 |
| Archive bindings not RunStepHooks           | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                                                                                                       |
| Input                                       | `name`, `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`, `allowOutOfScope`.                                                                                                                                                                                                                                                                                       |
| Schema name guard                           | Evaluate `schema.nameMatch` on operation `archive` **before** archivable guard, hooks, file writes. Matching predicates `failFastOn: 'schema.nameMatch'`.                                                                                                                                                                                                               |
| Archivable guard                            | `archive.archivable` / `change.assertArchivable()`; allow `archivable` **or** `archiving`. Not a lifecycle hop. **`approval.signoff` MUST NOT be bound on archive.**                                                                                                                                                                                                    |
| Deferred `archiving`                        | After full-batch preflight + snapshots; mutate then `transition('archiving')` if not already `archiving`. Hooks use workflow step `archiving` while lifecycle may still be `archivable`.                                                                                                                                                                                |
| Shared runners                              | Predicates: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly` + `deps.consistent` (same runners as enter-`ready`; archive facts = **sealed** `dependsOn`), `impl.filesResolved` + `impl.linksInScope` (same as exit-`implementing`). No `archive.publication` binding. Remaining merge/publish preflight stays **inside** `ArchiveChange`. |
| Overlap / readOnly                          | After archivable, before hooks; overlap skippable; readOnly uses same runner as enter-`ready`.                                                                                                                                                                                                                                                                          |
| Pre/post hooks                              | Effects selected by **binding `phase`**, not `check.id`. `before-persist` + `abort`; `after-persist` + `collect`. Skip selectors skip effects only.                                                                                                                                                                                                                     |
| Plan / snapshot / restore / metadata / lock | Unchanged atomic archive contract (preflight, staged publish, restore, `MaterializeSpecMetadata` post-move).                                                                                                                                                                                                                                                            |
| Factory                                     | `createArchiveChange` via `resolveArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                   |

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

| Requirement                 | Spec intent                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact dependency cascade | Cascade owned by `projectArtifacts` / `effectiveStatus` (see lifecycle-engine **functions**). **No** `Change.effectiveStatus()`. Load-time file status remains hash-derived on the repository. |

---

## Implementation Status

### Archive bindings + `failFastOn` (prior OPEN MEDIUM — **closed in Core**)

- `ArchiveChange` stores `_archiveBindings` and takes them as ctor arg 4 (`packages/core/src/application/use-cases/archive-change.ts:202`, `:226–248`).
- `execute` builds `{ scope: 'archive' }` and calls `executeMatchingPredicates(..., { failFastOn: 'schema.nameMatch' })` (`archive-change.ts:290–305`).
- `executeMatchingPredicates` stops later **predicate** `execute` when that id fails (`packages/core/src/application/services/execute-matching-predicates.ts:129–148`).
- Unit test: `packages/core/test/application/services/execute-matching-predicates.spec.ts:105–138` (`later` for `archive.archivable` not called).
- Composition: `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (`packages/core/src/composition/use-cases/archive-change.ts:134–148`). `ArchiveChangeDeps` lists `archiveBindings`, not `runStepHooks` (`:105–118`). Factory constructs with bindings only (`:191–205`).
- Registry table (no `approval.signoff` on archive): `ARCHIVE_BINDING_SPECS` (`packages/core/src/domain/services/check-bindings.ts:84–94`). Signoff is **only** `done → archivable` forward (`TRANSITION_BINDING_SPECS` `:61–65`).
- Failures map through `throwMappedArchiveFailure` (`archive-change.ts:1278–1348`), including `schema.nameMatch` → `SchemaMismatchError` (`:1286–1287`).

### `isArchivable` includes `archiving`

- Getter: `state === 'archivable' || state === 'archiving'` (`packages/core/src/domain/entities/change.ts:668–671`).
- `assertArchivable()` uses that getter (`:1070–1073`).
- Domain `runArchiveArchivable` / `archive.archivable` (`packages/core/src/domain/checks/archive-archivable.ts:18–25`, `:44–45`).
- Application factory `createArchiveArchivable` (`packages/core/src/application/checks/archive-archivable.ts:38–49`).
- Tests: `packages/core/test/domain/entities/change.spec.ts:1108–1119`.
- Retry mutate: `freshChange.assertArchivable()` then transition if not already `archiving` (`archive-change.ts:410–414`).

### Schema name match vs later **check** I/O

- Predicate order in table: `schema.nameMatch` then `archive.archivable` then `spec.overlap` then readOnly / deps / impl (`check-bindings.ts:85–91`).
- Fail-fast prevents later **check.execute** after name mismatch (see above).
- Host still loads overlap **before** predicates: `list()` + per-name `get()` (`archive-change.ts:277–288`) then predicates (`:293`). That I/O is **not** gated by `failFastOn` (LOW leftover).

### Dual `runDepsConsistent`

- Named archive predicate: `createDepsConsistent` uses `loadReadyPredicateFacts` extract + `loadArchiveSealedDependsOnBySpecId` when `attempt.scope === 'archive'` (`packages/core/src/application/checks/deps-consistent.ts:59–68`; sealed loader `packages/core/src/application/services/ready-predicate-facts.ts:97–113`).
- Second pass after merge preflight: `_prepareArchivePreflight` calls `_assertArchiveDepsConsistent` (`archive-change.ts:785`; `:1128–1155`) which calls `runDepsConsistent` on **preflight** extract vs `finalDependsOn`.
- Spec also says remaining merge/publish checks stay **inside** `ArchiveChange` after named predicates (`archive-change` Requirement: Archive checks share runners). The private method is therefore both a **duplicate runner** and a **merge-time** consistency gate. Treated as LOW leftover vs “single named predicate only,” not as a missing sealed-set path.

### Overlap I/O before predicates (LOW leftover)

- Host overlap scan: `archive-change.ts:277–288`.
- Predicate overlap I/O (production): `resolveWorkflowCheckRegistry` `includeOverlapDetection: true` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:41–62`; wired from `resolveArchiveChangeDeps` `:134`).
- `spec.overlap` execute: `packages/core/src/application/checks/spec-overlap.ts:72–80`.
- Host scan is also used for `SpecOverlapError(overlapEntries)` and `allowOverlap` invalidation (`archive-change.ts:312–315`, `:1291–1292`).

### Hooks: `createHookPre` / `createHookPost`; no engine class

- Factories: `packages/core/src/application/checks/hook-pre.ts:12–14`, `hook-post.ts:12–14`.
- Shared effect: `HookEffectCheck` (`hook-effect-shared.ts:86–175`). Skip by `ctx.skipHookPhases` (`:131–147`), not use-case `check.id` switch. Archive step name `'archiving'` (`hookStep` `:18–21`).
- Registry attaches `RunStepHooks` to those factories (`workflow-check-registry.ts:73–74`, `:104–105`).
- `ArchiveChange` runs `matchingEffects(..., 'before-persist'|'after-persist')` + `executeCheckWithProgress` (`archive-change.ts:325–351`, `:530–569`; `matchingEffects` `packages/core/src/application/services/execute-hook-effect.ts:23–35`).
- Domain stubs skip (no process): `packages/core/src/domain/checks/hook-pre.ts:7–17`, `hook-post.ts:7–17`.
- `Change` has no hook runner (entity `packages/core/src/domain/entities/change.ts`; hooks live in application checks).

### Storage / layering (user-enforced)

- `projectArtifacts` is a **function** on `lifecycle-verdict.ts:309–324`, re-exported from barrel `packages/core/src/domain/services/lifecycle-engine.ts:1–18` (no class).
- Graph search `class LifecycleEngine`: **no** `class LifecycleEngine` under `packages/core/src`.
- `Change.effectiveStatus(`: **no** matches in `change.ts`.
- Domain → application imports: `rg` over `packages/core/src/domain` found **zero** `from '...application/'`.

### CLI tension (other batch; observed from this Core/CLI slice)

- `packages/cli/src/commands/change/archive.ts:96–104` calls `kernel.changes.archive.execute` with no extra “must already be `archivable` only” pre-filter. Retry in `archiving` is therefore Core’s `isArchivable` (`change.ts:668–671`).
- CLI test title still says “not in archivable state” and stubs `InvalidStateTransitionError('done', 'archivable')` (`packages/cli/test/commands/change/archive.spec.ts:215–219`) — wording/Core error shape, not a second CLI gate.

---

## Discrepancies

### HIGH

None in this Core archive / storage / hooks batch. Prior 013719 HIGH (CLI archive archivable-only vs Core `archiving`) is **not reproduced as a CLI pre-gate** in `archive.ts`; Core allows `archiving`. Remaining CLI/docs/test-title alignment belongs to the CLI batch.

### MEDIUM

None remaining for the previously OPEN `failFastOn: 'schema.nameMatch'` item: code + unit test exist (`execute-matching-predicates.ts:143–147`, `execute-matching-predicates.spec.ts:105–138`).

### LOW

1. **Overlap I/O before predicates (leftover).**
   - **Spec:** Schema name guard before later archive I/O / overlap as a **named predicate after** `schema.nameMatch` (`archive-change` Schema name guard + Overlap guard; table `check-bindings.ts:85–87`).
   - **Code:** `ChangeRepository.list`/`get` for peers runs at `archive-change.ts:277–288` **before** `executeMatchingPredicates` at `:293`. A schema mismatch still pays full peer-load cost; `failFastOn` only skips later **check.execute**. Production `spec.overlap` then lists peers **again** (`workflow-check-registry.ts:42–53`).
   - **Either:** spec should allow host prefetch for `SpecOverlapError` mapping; **or** host should defer list until after nameMatch (and/or reuse check `details.peers`).
   - **Tests:** no `archive-change.spec.ts` coverage that `list` is not called on schema mismatch.

2. **Dual `runDepsConsistent` (leftover).**
   - **Spec:** one shared runner; archive facts = sealed set; remaining preflight may stay inside the use case.
   - **Code:** predicate (`deps-consistent.ts:59–68`) **and** `_assertArchiveDepsConsistent` (`archive-change.ts:785`, `:1139–1142`).
   - **Either:** delete the private pass if merge extract is already represented in the named check; **or** spec should explicitly require a second merge-time comparison.
   - **Tests:** no hits for `loadArchiveSealedDependsOnBySpecId` or `_assertArchiveDepsConsistent` under `packages/core/test`.

3. **`assertArchivable` JSDoc vs behaviour.**
   - **Spec / getter:** `archivable` **or** `archiving` (`change.ts:668–671`; archive-change Archivable guard).
   - **Comment:** “Asserts that this change is in `archivable` state” (`change.ts:1065–1068`). Error always uses target `'archivable'` (`:1072`). Comment/error-target wording can mislead operators on retry-from-`archiving`.

4. **Domain hook stub comments vs execute.**
   - **Comments** claim execute calls `RunStepHooks` (`domain/checks/hook-pre.ts:4`, `hook-post.ts:4`).
   - **Code:** domain `execute` always `skip` (`hook-pre.ts:17`). Application `createHookPre`/`createHookPost` own I/O. Comment drift only; layering is correct.

---

## Test Coverage

| Area                                                     | Evidence                                                                          | Verdict                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `failFastOn: 'schema.nameMatch'`                         | `execute-matching-predicates.spec.ts:105–138`                                     | Covered at runner unit level                                                   |
| `isArchivable` / `assertArchivable` includes `archiving` | `change.spec.ts:1108–1119`                                                        | Covered                                                                        |
| Archive skip hooks                                       | `archive-change.spec.ts` (`skipHookPhases` ~1837+, `'pre'` ~1961, `'post'` ~1992) | Covered (via `newArchiveChange` + `makeArchiveBindings`, `helpers.ts:944–982`) |
| `createHookPre` uses `RunStepHooks`                      | `workflow-check-factories.spec.ts:21–40`                                          | Covered (transition attempt in that test)                                      |
| Archive composition bindings                             | `resolveArchiveChangeDeps` + `ARCHIVE_BINDING_SPECS`                              | Indirect via composition tests if present; not re-listed here                  |
| Storage `projectArtifacts` / no entity method            | `lifecycle-verdict.ts:309`; entity tests for artifacts                            | Function exists; no `Change.effectiveStatus` tests needed if method absent     |
| Domain no application imports                            | static `rg`                                                                       | Structural, not a runtime test                                                 |

---

## Missing Tests

1. **ArchiveChange integration:** schema mismatch does **not** call `ChangeRepository.list` / peer `get` (would lock leftover #1).
2. **ArchiveChange integration:** `failFastOn` with real `createSchemaNameMatch` + later spies (`archive.archivable` / `spec.overlap` not executed) — currently only the generic runner test.
3. **Sealed vs merge `deps.consistent`:** `loadArchiveSealedDependsOnBySpecId` vs `_assertArchiveDepsConsistent` disagreement / agreement.
4. **Archive `HookEffectCheck` skip:** `skipHookPhases` `pre`/`post`/`all` on `attempt.scope === 'archive'` (factory test uses a **transition** attempt).
5. **`approval.signoff` absent from `archiveBindings`:** matcher/registry assertion that archive table has no signoff row (`check-bindings.ts:84–94` vs `:61–65`).
6. **CLI (other batch):** archive retry when Core change state is `archiving` (CLI currently only mocks `done` → `archivable` error).

---

## Spec Dependency Chain

From change-preview `core:archive-change` **Spec Dependencies** (depth 1, as listed):

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

- **Architecture / user rule:** domain does not import application. Hooks I/O is in `application/checks`. No `LifecycleEngine` class. `projectArtifacts` is a domain **function**, re-exported from `lifecycle-engine.ts` barrel — aligns with storage’s “no `Change.effectiveStatus()` / cascade via `projectArtifacts`” if `core:lifecycle-engine` describes functions rather than a class (that spec is not in this assigned triple).
- **`core:transition-checks`:** archive table + shared runners match the archive-change “share runners” requirement; `approval.signoff` is transition-only.
- **`core:hook-execution-model` vs archive-change constraints:** “delegated to `RunStepHooks`” vs “MUST NOT take `RunStepHooks`” is resolved by injecting `RunStepHooks` into `createHookPre`/`createHookPost` only (`workflow-check-registry.ts:73–74`).
- **`core:storage`:** assigned cascade rule matches code (`lifecycle-verdict.ts:309–323`). Full fs-cache / pattern catalog not audited in this partial.

---

## Summary counts

| Spec                            | Req. headings in preview (approx.) |                                                             Implemented as specified |                 Partial / leftover |  HIGH | MEDIUM |   LOW |       Untested gaps (this batch) |
| ------------------------------- | ---------------------------------: | -----------------------------------------------------------------------------------: | ---------------------------------: | ----: | -----: | ----: | -------------------------------: |
| `core:archive-change`           |                                ~31 | Core path: bindings, fail-fast nameMatch, archiving retry, effects by phase, factory | Overlap prefetch; dual deps runner |     0 |      0 |     3 |                                4 |
| `core:hook-execution-model`     |               ~12 archive-relevant |             `createHook*` + `HookEffectCheck` skip/policy; Change does not run hooks |               Domain stub comments |     0 |      0 |     1 | 1 (archive skip on effect class) |
| `core:storage` (assigned slice) |                1 cascade + related | `projectArtifacts` function; no `Change.effectiveStatus`; no `LifecycleEngine` class |                                  — |     0 |      0 |     0 |                                0 |
| **Totals**                      |                                    |                                                                                      |                                    | **0** |  **0** | **4** |               **5** listed above |

**Prior 013719 OPEN MEDIUM (`failFastOn: 'schema.nameMatch'`):** **implemented** (`archive-change.ts:304`, `execute-matching-predicates.ts:145`, test `:105–138`).

**CLI vs Core `archiving`:** Core allows archive from `archiving` (`change.ts:669–670`). CLI `change archive` does not add an archivable-only pre-check (`cli/.../archive.ts:96`). Treat residual HIGH as **out of batch** unless CLI/docs still assert archivable-only elsewhere.

---

## Partial file: `_partial-cli-skills.md`

# Spec compliance partial: CLI + skills (change `workflow-transition-checks`)

**Mode:** change  
**Assigned specs:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Source:** `specd changes spec-preview workflow-transition-checks <specId>`  
**Graph:** reindexed `stale: false` (caller). Navigation via `specd graph search` / `graph impact --file cli:src/commands/change/status.ts`.  
**Read-only.** Neither spec nor code is truth.

**Prior 013719 HIGH #3** (CLI archive archivable-only vs Core allowing `archiving`): **CLOSED** (see `cli:change-archive`).  
**Prior LOW** (drafted JSON `availableSteps` passthrough): **CLOSED** (see `cli:change-status`).

---

## Requirements Summary

### `cli:change-status`

| ID  | Requirement                                                                                                                                                                                                    | Binding points                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| S1  | Command signature `status <name> [--format text\|json\|toon]`                                                                                                                                                  | preview spec.md Command signature                                        |
| S2  | Drafted status is read-only: no mutating transitions; drafted marker; MAY show artifacts                                                                                                                       | Drafted change status is read-only                                       |
| S3  | JSON/toon `artifactDag[].hasTasks`; top-level DAG `state` is display projection                                                                                                                                | Output format                                                            |
| S4  | DAG `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                                                                                                           | Task completion display in DAG                                           |
| S5  | Display-state rendering (complete-with-drift, missing, review states)                                                                                                                                          | Display-state rendering                                                  |
| S6  | Lifecycle projections from GetStatus; no local protocol graph that execute would reject                                                                                                                        | Lifecycle projections come from GetStatus checks                         |
| S7  | Text omits duplicated review file lists; overlap peers still print; JSON keeps full `review`                                                                                                                   | Text status omits duplicated review file lists                           |
| S8  | Text blockers include gerund `label` as `! CODE — label: message`                                                                                                                                              | Text blockers include check labels                                       |
| S9  | Schema version warning from `lifecycle.schemaInfo` only                                                                                                                                                        | Schema version warning                                                   |
| S10 | Change not found → exit 1 `error:`                                                                                                                                                                             | Change not found                                                         |
| S11 | Schema-derived DAG from `schema.artifactDag()`                                                                                                                                                                 | Schema-derived fields                                                    |
| S12 | Invoke GetStatus only; no RefreshImplementationTracking / ImplementationDetector                                                                                                                               | Delegates refresh policy                                                 |
| S13 | `--implementation` uses SDK projection                                                                                                                                                                         | Implementation section                                                   |
| S14 | Details `tasks: N/M`                                                                                                                                                                                           | Task completion in details                                               |
| S15 | Basic info: name/state; no standalone `specs:`                                                                                                                                                                 | Basic info section                                                       |
| S16 | Specs and dependencies + JSON `specDependsOn`                                                                                                                                                                  | Specs and dependencies                                                   |
| S17 | **Constraints:** drafted suppress `nextAction.command`; drafted JSON **MUST** `availableTransitions: []` **AND** `availableSteps: []` even if Core leaked hops; **MUST NOT** second `VALID_TRANSITIONS` filter | Constraints + verify “Drafted JSON empties hops even if Core leaks them” |

### `cli:change-transition`

| ID  | Requirement                                                                                                                  | Binding points                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| T1  | Signature; `--next` mutually exclusive with `<step>`                                                                         | Command signature                                                 |
| T2  | `--next` → `TransitionChange.execute` with `to: 'next'`; no CLI from→to table; no `GetStatus.nextAction` as resolver         | Next-transition resolution                                        |
| T3  | No direct refresh; pre/repair GetStatus `refreshImplementationTracking: false`                                               | Delegates refresh policy                                          |
| T4  | No approval flags; no rewrite to pending parking                                                                             | Approval-gate routing                                             |
| T5  | `--skip-hooks` → `skipHookPhases`; `--allow-out-of-scope` only when set                                                      | Hook execution + signature                                        |
| T6  | Generic check bus; gerund labels; no `Executing:`; hooks on same bus; JSON `stream: "change-transition"` not `hook-progress` | Progress output / Check progress rendering / Shared hook progress |
| T7  | Success text confirmation; JSON terminal `complete`                                                                          | Output on success                                                 |
| T8  | Hook fail → exit 2; no Repair Guide                                                                                          | Post-hook failure / HookFailedError scenario                      |
| T9  | Invalid transition → Repair Guide on stderr with labels; JSON failure complete record                                        | Invalid transition error                                          |
| T10 | Incomplete tasks → exit 1                                                                                                    | Incomplete tasks error                                            |
| T11 | Unsatisfied requires → exit 1                                                                                                | Unsatisfied requires error                                        |

### `cli:change-approve`

| ID  | Requirement                                                                           | Binding points                 |
| --- | ------------------------------------------------------------------------------------- | ------------------------------ |
| A1  | `approve spec\|signoff <name> --reason`                                               | Command signatures             |
| A2  | Kernel only: `kernel.changes.approveSpec/Signoff`; no gate flags; no `kernel.specs.*` | Delegates gate state to kernel |
| A3  | CLI MUST NOT compute hashes                                                           | Artifact hash computation      |
| A4  | Stay in `ready`/`done`; help bound-`from`; drain pending still valid                  | Approve spec/signoff behaviour |
| A5  | Text `approved <gate> for <name>`; JSON `{result,gate,name}`                          | Output on success              |
| A6  | Missing `--reason`, wrong state, not found → exit 1                                   | Error cases                    |

### `cli:change-archive`

| ID  | Requirement                                                                                                                                            | Binding points                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| R1  | `changes archive` + singular alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope`                                           | Command signature                  |
| R2  | Prerequisites: state `archivable` **or** `archiving`; CLI delegates to `ArchiveChange` (`assertArchivable`); **MUST NOT** second, narrower state table | Prerequisites (**013719 HIGH #3**) |
| R3  | Delegate merge/move/history                                                                                                                            | Behaviour                          |
| R4  | Map skip-hooks to `ArchiveChangeInput`                                                                                                                 | Hook execution                     |
| R5  | Check progress gerund bus; no `Executing:`; hooks on same bus                                                                                          | Check progress rendering           |
| R6  | Post-hook failures → exit 2                                                                                                                            | Post-archive hooks                 |
| R7  | Text path + invalidated section; JSON NDJSON `stream: "change-archive"` complete only                                                                  | Output / JSON output on success    |
| R8  | Not found / wrong state / merge fail → exit 1                                                                                                          | Error cases                        |
| R9  | Constraints: only `archivable` or `archiving`                                                                                                          | Constraints                        |

### `skills:skill-templates-source` (change-relevant slice)

| ID  | Requirement                                                                                                                                                                                                                                                  | Binding points                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| K1  | Template tree, `.md.tpl`, `skill.meta.json`                                                                                                                                                                                                                  | Template source / migration / metadata                                         |
| K2  | Graph impact dependents/dependencies; `--file` not `--changes`; snippet opt-in                                                                                                                                                                               | Graph impact / Graph search                                                    |
| K3  | In-place gates; no happy-path pending hops; specd is router; archive `archivable` **or** `archiving`; signoff wait = `/specd-verify` in `done`                                                                                                               | In-place approval gates                                                        |
| K4  | Overlap: hop skills MUST NOT typical `OVERLAP_CONFLICT`; invalidation → `/specd-design`; archive MAY list live overlap + `--allow-overlap`                                                                                                                   | Overlap invalidation vs live archive                                           |
| K5  | `specd-new` `targetStep` table: pending drain-only; `ready`/`done` unsatisfied gate → approve; **done/signed-off → `/specd-archive` when hop is `archivable` else `/specd-verify`** (template; spec.md names ready/done gates, not the archive hop sentence) | specd-new routing                                                              |
| K6  | `specd` / hop skills follow **nextAction.command** (entry: “Trust the CLI's dynamic routing”)                                                                                                                                                                | specd SKILL.md.tpl; design/new “Follow next action command”                    |
| K7  | No `LifecycleEngine` constructor language                                                                                                                                                                                                                    | User focus + core:transition-checks dependency (templates must not teach ctor) |
| K8  | Archive `--skip-hooks pre` not `all`; no post `run-hooks`                                                                                                                                                                                                    | Archive skill skips only pre hooks                                             |
| K9  | Design review scope: details/`affectedArtifacts`, not text `review:` file list                                                                                                                                                                               | Design skill review scope                                                      |
| K10 | Impl tracking ownership (shared / verify / implement)                                                                                                                                                                                                        | Implementation tracking in verify and implement                                |
| K11 | Optimizer gating, metadata self-healing, command roles                                                                                                                                                                                                       | Remaining template requirements                                                |

---

## Implementation Status

### `cli:change-status` — **implemented** (focus items closed)

- Drafted branch: `packages/cli/src/commands/change/status.ts:138-184`. Text marks `(drafted)`, `transitions:  (none — change is drafted)`, `command: (none)` (`141`, `156-163`). JSON **forces** `availableTransitions: []`, `availableSteps: []` (`175-176`) and `nextAction.command: null` (`141`) **after** spreading Core nextAction — even if Core leaked hops.
- Active JSON copies GetStatus hops under `lifecycle` (`472-481`) with no `VALID_TRANSITIONS` import or filter. Graph: `VALID_TRANSITIONS` lives in `core:src/domain/value-objects/change-state.ts:30`, not CLI status. CLI `transition.ts:36-50` `CHANGE_STATES` is **argument validation only** (comment: “not availability”).
- Text blockers: `247-250` emit `! ${code} — ${label}: ${message}` when `label` is set.
- GetStatus-only: `134-136`; tests assert no `refreshImplementationTracking` (`status.spec.ts:165-166`).
- Overlap: filter `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'` (`237-241`); overlap peers `337-348`.

### `cli:change-transition` — **implemented**

- `--next` maps to Core `to: 'next'`: `255-256`, `261-267`. Tests: `transition.spec.ts:64-88`, `207-248` (`to: 'next'`), `646-720` (HappyPathNextUnavailableError still calls execute with `to: 'next'`).
- Progress: `_check-progress-presenter.ts:94-108` (`label (id)`, `✓`/`✗`, no `Executing:`). Transition wires `streamName: 'change-transition'` (`transition.ts:142-146`). Gerund tests: `502-534` (predicate), `442-500` (hooks).
- Repair Guide labels: `88-95`; tested with label at `975-977` (`READ_ONLY_WORKSPACE — Checking workspace ownership`).
- Refresh skip: `246-249`, `289-292`; tests `79-82`, `604-612`.

### `cli:change-approve` — **implemented**

- `packages/cli/src/commands/change/approve.ts:40-43`, `78-81`: `{ name, reason }` only via `kernel.changes.approve*`. Help: ready/done bound-from (`22`, `60`). Tests: `approve.spec.ts:65-68`, `249-252`; stay-in-state stdout (`70-71`, `254-255`).

### `cli:change-archive` — **implemented** (HIGH #3 closed)

- No CLI state table. Handler calls `kernel.changes.archive.execute` only (`archive.ts:96-104`). No GetStatus pre-gate, no `archivable`-only Set.
- Progress: `createCheckProgressPresenter` `streamName: 'change-archive'` (`32-39`); gerund test `archive.spec.ts:425-481`.
- Skip-hooks / overlap / out-of-scope forwarded (`87-102`); tests `230-423`.
- Post-hooks exit 2: `108-111`; test `64-84`.
- JSON stream complete: `123-134`; tests `86-145`.

### `skills:skill-templates-source` — **implemented** for assigned focus

- Archive: `packages/skills/templates/skills/specd-archive/SKILL.md.tpl:8-11`, `39-40` (`archivable` **or** `archiving`); overlap → `/specd-design` (`28-29`); `--skip-hooks pre` (`142-148`); no pending-signoff (asserted `template-workflow.spec.ts:102-107`).
- Overlap → `/specd-design`: design `45-46`, verify `25-26`, new `135-137`, archive `28-29`; tests `156-170`.
- done/signed-off → `/specd-archive` when hop `archivable`: `specd-new/SKILL.md.tpl:151`.
- nextAction.command: `specd/SKILL.md.tpl:86-88`; new `134`; design `43-44`.
- LifecycleEngine: no hits in assigned templates (graph search for `LifecycleEngine` did not surface skill templates; templates speak GetStatus / `changes status` / next action).
- specd router: `specd/SKILL.md.tpl:7-8`, `92-93`; tests `96-100` (no signoff teaching).

---

## Discrepancies

Severity: **HIGH** = execute/agent would do the wrong thing vs paired spec; **MEDIUM** = partial miss; **LOW** = docs/help/verify wording vs code.

### D1 — LOW — Status help schema vs active JSON hop location

- **Spec / help:** `status.ts:105-106` documents top-level `availableTransitions` / `availableSteps`.
- **Code:** Drafted JSON uses those top-level keys (`175-176`). **Active** JSON puts hops under `lifecycle` (`472-481`) and does **not** emit top-level `availableTransitions`/`availableSteps`.
- **Either:** help/schema is leftover from drafted-only shape (**spec/help drift**), or active JSON should also flatten hops (**implementation**). Agents following `--help` on a live change may look at the wrong path. Behaviour of drafted emptying is still correct.

### D2 — LOW — Archive Commander description vs Prerequisites

- **Spec:** archive allowed in `archivable` **or** `archiving` (preview Prerequisites; Constraints).
- **Code:** `archive.ts:56` description: “Move a **completed** change to the archive…” — does not mention `archiving` retry. Execute path is still Core-delegated (not a second gate).
- **Either:** description is stale marketing copy (**spec-right, help-wrong**) or description is fine as user-facing shorthand (**no functional bug**).

### D3 — LOW — Skills verify.md vs spec.md for archive entry state

- **spec.md:** `specd-archive` MUST require `archivable` **or** `archiving`.
- **verify.md** scenario “specd-archive mentions in-place gates”: “requires `archivable`” only (preview verify.md ~777-781).
- **Template:** both states (`SKILL.md.tpl:8-11`, `39`). Tests assert both (`template-workflow.spec.ts:102-104`).
- **Either:** verify scenario under-specified (**spec internal**), or template over-documents. Template matches spec.md.

**No HIGH discrepancy** on assigned CLI archive gate, drafted hops, `--next` → `to: 'next'`, blocker labels (implementation), or second `VALID_TRANSITIONS` filter.

**Prior 013719 HIGH #3 — CLOSED.** Preview Prerequisites now match Core: CLI must not apply a narrower table; `archive.ts` has none. Skill template allows `archiving` retry.

**Prior LOW drafted `availableSteps` — CLOSED.** `status.ts:176` + `status.spec.ts:64-95` (Core leaks `availableSteps` + `availableTransitions: ['ready']`; JSON both `[]`).

---

## Test Coverage

### `cli:change-status` — `packages/cli/test/commands/change/status.spec.ts`

| Scenario                                       | Coverage                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Drafted JSON empties hops if Core leaks        | **Yes** `64-95` (`availableTransitions`/`availableSteps` leaked; expect `[]`; `nextAction.command` null) |
| Drafted text no transition commands            | **Yes** `97-127`                                                                                         |
| Missing name                                   | **Yes** `129-138`                                                                                        |
| GetStatus passthrough of available transitions | **Yes** `209-229` (does not add hops)                                                                    |
| Empty availableTransitions omits line          | **Yes** `231-250`                                                                                        |
| Blockers codes/messages                        | **Partial** `252-276` (no gerund `label` / em-dash shape)                                                |
| Overlap peers / hide OVERLAP_CONFLICT          | **Yes** `646-730`                                                                                        |
| Live OVERLAP with label present                | **Partial** `732-762` asserts code, not `— Checking spec overlap:`                                       |
| Schema warning, not found, DAG, implementation | **Yes** various                                                                                          |
| Incomplete tasks omit `verifying` locally      | **No** (relies on GetStatus mock omitting it)                                                            |
| Drafted: Core leaked **command** still null    | **Partial** — tests set `command: null` already; code `141` would null a leak; not asserted              |

### `cli:change-transition` — `packages/cli/test/commands/change/transition.spec.ts`

| Scenario                              | Coverage                            |
| ------------------------------------- | ----------------------------------- |
| `--next` → `to: 'next'`               | **Yes** `64-88`, `207-248`          |
| Mutual exclusion                      | **Yes** `51-62`                     |
| allowOutOfScope                       | **Yes** `90-132`                    |
| No approval flags                     | **Yes** `134-157`                   |
| Happy-path next failures              | **Yes** `646-720`                   |
| Gerund check bus / no Executing       | **Yes** `442-534`                   |
| HookFailedError exit 2, ✗ hooks       | **Yes** `253-333`                   |
| Repair Guide + verify skill           | **Yes** `565-613`, `910-938`        |
| Repair Guide with gerund label        | **Yes** `941-977`                   |
| JSON success stream not hook-progress | **Yes** `356-440`                   |
| JSON **failure** complete record      | **No** (handler `298-312` untested) |

### `cli:change-approve` — `packages/cli/test/commands/change/approve.spec.ts`

Covers missing reason, unknown sub-verb, execute shape, JSON, not found, wrong state, stay-in-ready/done, drain pending. Hash-not-computed is implicit (CLI never passes hashes).

### `cli:change-archive` — `packages/cli/test/commands/change/archive.spec.ts`

Covers success, JSON stream, skip-hooks, allow flags, overlap output, gerund progress, not found, Core rejection when not archivable (`215-228`). **No** explicit “`archiving` retry is not CLI-gated” test (implied: no state check before `execute`).

### `skills:skill-templates-source` — `packages/skills/test/template-workflow.spec.ts`

Strong on pending-parking absence, overlap vs `OVERLAP_CONFLICT`, archive `--skip-hooks pre`, design review header, impl drain, optimizer/metadata. **Weak** on exact `done`/`signed-off` → `/specd-archive` row and `nextAction.command` string; **no** `LifecycleEngine` absence assertion.

---

## Missing Tests

1. **Drafted JSON:** given GetStatus `nextAction.command: '/specd-design'` (leak), JSON `nextAction.command` is still `null` (S17; code `status.ts:141`).
2. **Status text blockers:** `DEPS_INCONSISTENT` + `label: 'Checking spec dependencies'` renders `! DEPS_INCONSISTENT — Checking spec dependencies: …` and JSON includes `blockers[].label` / `checkId` (S8 verify scenario).
3. **Status:** GetStatus omits `verifying`; CLI text/JSON do not add it from `VALID_TRANSITIONS` (S6).
4. **Status active JSON:** non-empty `lifecycle.availableSteps` passthrough unchanged (prior LOW was drafted-only; active copy is untested).
5. **Transition JSON failure:** terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", blockers, nextAction } } }` (T9).
6. **Archive:** `archiving` state still calls `archive.execute` with no CLI pre-filter (R2 / 013719 #3 regression lock).
7. **Skills contract:** `specd-new` table row `done` / `signed-off` contains `/specd-archive` and `archivable`; `specd` template contains `nextAction`/`command`; templates do not contain `LifecycleEngine`.

---

## Spec Dependency Chain

Depth-1 from previews (not re-audited as assigned specs):

| Spec                            | Direct dependencies                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:change-status`             | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`                              |
| `cli:change-transition`         | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`          |
| `cli:change-approve`            | `cli:entrypoint`, `core:change`, `core:transition-checks`                                                                                    |
| `cli:change-archive`            | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks` |
| `skills:skill-templates-source` | `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`                                             |

**Consistency with dependencies (change vs Core):** CLI archive Prerequisites now align with Core allowing `archiving` (fixes former spec-wrong HIGH). Drafted hop emptying is a **CLI sanitizer** on top of GetStatus (allowed by S17 even if Core leaks). `--next` → `to: 'next'` aligns with `core:transition-change`. Skills in-place gates align with `core:transition-checks`. No contradiction found that would make assigned change specs violate globals beyond D3 (verify.md narrower than spec.md).

---

## Summary counts

| Spec                            |           Reqs reviewed | Implemented | Partial | Missing impl |                Discrepancies |           Tests covering |                               Missing tests |
| ------------------------------- | ----------------------: | ----------: | ------: | -----------: | ---------------------------: | -----------------------: | ------------------------------------------: |
| `cli:change-status`             |                      17 |          17 |       0 |            0 | 1 LOW (D1 help vs JSON path) |                      14+ |                                           4 |
| `cli:change-transition`         |                      11 |          11 |       0 |            0 |                            0 |                      12+ |                     1 (JSON failure stream) |
| `cli:change-approve`            |                       6 |           6 |       0 |            0 |                            0 |                      10+ |                                  0 material |
| `cli:change-archive`            |                       9 |           9 |       0 |            0 |       1 LOW (D2 description) |                      14+ |                    1 (archiving retry lock) |
| `skills:skill-templates-source` | 11 focus + rest present |    11 focus |       0 |            0 | 1 LOW (D3 verify vs spec.md) | template-workflow strong | 3 (routing row / LifecycleEngine / command) |
| **Batch**                       |           **~54 focus** |     **~54** |   **0** |        **0** |     **3 LOW, 0 HIGH/MEDIUM** |                          |                                             |

**Priors:** HIGH #3 CLI archive archivable-only → **CLOSED**. LOW drafted `availableSteps` passthrough → **CLOSED**.

---

## Partial file: `_partial-globals.md`

# Spec-compliance partial: project-wide globals

- **Mode:** change `workflow-transition-checks`
- **Batch:** `_partial-globals.md`
- **Read-only:** no code or spec files were modified. Only this report file was written.
- **Change previews (`changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Conformance-only (`specs show` / disk):** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs`
- **Graph:** parent reported `stale: false`. `graph search "Logger"` → class `core:src/observability/logger.ts` with public bindings on `observability/logger.ts`, `observability/index.ts`, `application/logger.ts`. `graph search "evaluateLifecycle"` → function `core:src/application/services/lifecycle-evaluation.ts` (also `core:src/public.ts`). `graph search "evaluateLifecycleVerdict"` → function `core:src/domain/services/lifecycle-verdict.ts` (re-exported via `domain/services/lifecycle-engine.ts`). `graph search "createDefaultLogger"` → `core:src/infrastructure/logging/pino-logger.ts`. `graph impact --file core:src/observability/logger.ts` failed (`no indexed file matches`); layer/import checks used source reads after graph.

**USER-ENFORCED (blocking if violated):** architecture preview MUST remain package-agnostic — MUST NOT mention `evaluateLifecycle`, `packages/core/...` paths, or `LifecycleEngine`. Ambient `Logger` is the only inner-layer import exception. Domain must not import `application/`. Logging: `log` vs `info`; domain MAY call `Logger.debug`.

**Architecture constraint verdict:** **PASS (0 blocking).** Merged architecture `spec.md` / `verify.md` preview contains none of `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...`. Disk `specs/_global/architecture/spec.md` likewise. `spec-lock.json` lists `packages/core/...` coverage files — lock metadata, not architecture prose.

**Prior LOW (re-checked, still open):** (1) `log()` vs `info()` identity is not asserted on the ambient facade (nor on `PinoLogger` by an explicit alias test). (2) Logger unit tests live at `test/application/logger-port.spec.ts` instead of mirroring `src/observability/`.

---

## Requirements Summary

### `default:_global/architecture` (change preview)

| ID  | Requirement                                                                                                | In this change’s delta? |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| A1  | Packages with business logic: `domain` / `application` / `infrastructure`; inner layers never import outer | No (baseline)           |
| A2  | Domain is pure (no I/O); **exception: ambient Logger** is the sole inner-layer import exception            | **Yes**                 |
| A3  | Application uses `application/ports/` only; ambient Logger is not an infrastructure adapter                | **Yes**                 |
| A4  | Rich domain entities; invalid transitions throw typed errors                                               | No                      |
| A5  | Value objects expose behaviour, not internal structure                                                     | No                      |
| A6  | Ports with shared construction: `abstract class`; methods not property signatures                          | No                      |
| A7  | Stateless domain operations: plain functions in `domain/services/`                                         | No                      |
| A8  | Manual DI at package entry; no IoC                                                                         | No                      |
| A9  | Only `composition/` imports `infrastructure/`; kernel / `createX` factories                                | No                      |
| A10 | YAML validated at infrastructure boundary                                                                  | No                      |
| A11 | Adapter packages contain no business logic                                                                 | No                      |
| A12 | No circular `workspace:*` dependencies                                                                     | No                      |
| A13 | Curated public barrels; hosts use `@specd/sdk`                                                             | No                      |

**Verify.md (change):** scenarios “Domain imports ambient Logger” and “Application imports ambient Logger”.

**Package-agnostic check:** preview does not name `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...`. Application `evaluateLifecycle` (`lifecycle-evaluation.ts`) and domain barrel `lifecycle-engine.ts` exist in code; architecture correctly does not mention them. There is **no** `class LifecycleEngine`.

### `default:_global/logging` (change preview)

| ID  | Requirement                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Interface: `log()`, `info()`, `debug()`, `warn()`, `error()` (console-compatible)                                                                                                                             |
| L2  | `log()` SHALL be an alias of `info()`                                                                                                                                                                         |
| L3  | Minimal **console** impl: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`                                                                                                  |
| L4  | Levels: `trace` < `debug` < `info`/`log` < `warn` < `error` < `fatal`; `fatal` = process-terminating critical                                                                                                 |
| L5  | Production code avoids direct `console.*`; use logging abstraction                                                                                                                                            |
| L6  | **Ambient Logger** (added): composition assigns impl; no-op before wiring; any layer MAY import (`debug`, `trace`, diagnostic `info`); not for control flow / persistence; each package chooses how to use it |

Disk logging has L1–L5 only. Preview adds L6 and `## Spec Dependencies` → architecture.

### `default:_global/conventions` (disk, conformance)

TypeScript `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`; ESM `NodeNext`; named exports only; kebab-case sources; tests `test/` mirroring `src/` with `.spec.ts`; no `any`; explicit return types on public API; core errors extend `SpecdError`; underscore backing fields; lazy `list()`; immutability preference. Layer barrels only for `domain`/`application`/`composition` when >50 modules.

### `default:_global/testing` (disk, conformance)

Vitest; `test/` mirror; unit tests mock ports (no fs/net/process); full typed port mocks; infrastructure integration with tmpdir cleanup; `"given <state>, when <action>, then <outcome>"`; no snapshots.

### `default:_global/eslint` (disk, conformance)

No `any`; named exports; explicit public return types; kebab-case `src/`; JSDoc on functions/classes (tests exempt); `no-restricted-imports` for architecture layers. Spec Dependencies list `conventions` only; body restates architecture layer rules.

### `default:_global/docs` (disk, scoped)

Docs under `docs/`; ADRs MADR; CLI/MCP/core/SDK alignment; JSDoc on symbols; composition-surface and listing-contract docs stay in-change. Audited only for Logger / architecture-delta drift.

---

## Implementation Status

### Architecture (A2 / A3 / layers) — change-relevant

| Req | Status                               | Evidence                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Mostly implemented**               | `@specd/core` has `domain/`, `application/`, `infrastructure/`, `composition/`. Additional sibling **`observability/`** (not named in the spec; package-agnostic spec cannot name core paths).                                                                                                                                    |
| A2  | **Implemented via `observability/`** | Production domain Logger import: only `packages/core/src/domain/services/lifecycle-verdict.ts` → `../../observability/logger.js`. No `src/domain/**` import from `application/`, `infrastructure/`, or `composition/`. Domain calls **`Logger.debug`** (two sites in `lifecycle-verdict.ts`) with no logger constructor argument. |
| A3  | **Implemented**                      | Use cases may import `Logger` from `application/logger.js` (re-export of observability). Logger is not a use-case constructor port.                                                                                                                                                                                               |
| A7  | **Implemented for verdict**          | `evaluateLifecycleVerdict` is a plain exported function. `lifecycle-engine.ts` is a named re-export barrel, not a class. **`LifecycleEngine` does not exist as a class.**                                                                                                                                                         |
| A9  | **Implemented for Logger wiring**    | `composition/kernel.ts` calls `Logger.setImplementation(createDefaultLogger(...))`.                                                                                                                                                                                                                                               |

**Observability vs application shims:**

| Path                                   | Role                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `src/observability/logger.ts`          | Canonical ambient `Logger` + `NullLogger`             |
| `src/observability/logger.port.ts`     | Canonical `LoggerPort` / `LogLevel`                   |
| `src/observability/index.ts`           | Layer barrel re-export                                |
| `src/application/logger.ts`            | `export { Logger } from '../observability/logger.js'` |
| `src/application/ports/logger.port.ts` | Re-export of observability port types                 |

Domain **must not** import `application/logger.js` (`eslint` `**/application/**`). Application/infra/composition **may** import the application shim. Same class, two import graphs.

**`evaluateLifecycle`:** lives only in application (`lifecycle-evaluation.ts`); wraps `evaluateLifecycleVerdict` + guidance. Architecture preview correctly omits it.

### Logging

| Req | Status                                          | Evidence                                                                                                                                                                                                       |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Implemented**                                 | `LoggerPort` + static `Logger` methods include the five console methods plus `fatal`, `trace`, `isLevelEnabled`, `child`.                                                                                      |
| L2  | **Implemented in Pino; facade is pass-through** | `PinoLogger.log` and `PinoLogger.info` both call `this.logger.info(...)`. Ambient `Logger.log` calls `impl.log`, not `impl.info`. Alias holds for the default adapter; a custom `LoggerPort` could split them. |
| L3  | **N/A in repo**                                 | No console-backed logger. Pino has no `[FATAL]` / `[TRACE]` prefixes.                                                                                                                                          |
| L4  | **Partial**                                     | `LogLevel` includes extra `'silent'`. `fatal` logs via pino; does not terminate the process. Ordering not encoded as a comparable type.                                                                        |
| L5  | **Core yes; CLI still `console.*`**             | Verify allows excluding bootstrap. Out of change-member scope except as L5 policy.                                                                                                                             |
| L6  | **Implemented for no-op + ambient debug**       | Default `NullLogger`; `setImplementation` / `resetImplementation`. Domain uses `Logger.debug` without a port. Only **core** `createKernel` assigns the impl.                                                   |

### Conventions / testing / eslint (change-touched Logger / verdict files)

| Check                                                                          | Status                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kebab-case `observability/logger.ts`, `logger.port.ts`, `lifecycle-verdict.ts` | Pass                                                                                                                                                                           |
| Named exports, no default on Logger                                            | Pass                                                                                                                                                                           |
| Explicit return types on `Logger` static methods                               | Pass                                                                                                                                                                           |
| Test path mirror for Logger                                                    | **Fail pairing:** tests at `test/application/logger-port.spec.ts` vs source `src/observability/logger.ts` (and `logger.port.ts`)                                               |
| Lifecycle tests vs source                                                      | **Partial:** `test/domain/services/lifecycle-engine.spec.ts` matches barrel `lifecycle-engine.ts`, not `lifecycle-verdict.ts`                                                  |
| `observability/index.ts` barrel                                                | Extra barrel; conventions exception lists domain/application/composition only                                                                                                  |
| Vitest + full `LoggerPort` mock in `logger-port.spec.ts`                       | Pass                                                                                                                                                                           |
| Test titles `given/when/then`                                                  | Logger tests do not follow the pattern                                                                                                                                         |
| ESLint domain ↛ application/infrastructure/composition                         | **Conformant.** No Logger exception in eslint; domain imports `observability/` which is unrestricted. Importing `application/logger` from `src/domain/` would be a lint error. |
| JSDoc                                                                          | File-level `eslint-disable jsdoc/require-jsdoc` on `observability/logger.ts` (`NullLogger`) and `lifecycle-verdict.ts` (private helpers)                                       |

### Docs

`docs/` has **no** `Logger` / `LoggerPort` / `observability` hits. No stale documented Logger contract. Optional gap only if L6 is treated as a newly specified public integrator API (`Logger` already exported from core via application shims).

---

## Discrepancies

Each item: **severity**, **classification** (`code-wrong` | `spec-wrong` | `both`), evidence, both-sides reading.

### D1 — Architecture still says “three layers”; code has `observability/`

- **Severity:** LOW
- **Classification:** both
- **Spec might be right:** A1 requires three layers; a fourth folder is undescribed.
- **Code might be right:** naming `observability/` or `packages/core/...` in the **global architecture spec would violate the user-enforced package-agnostic constraint**. The exception is “import ambient Logger”, not “import application”.
- **Not a user-constraint violation.**

### D2 — “Each package wires the implementation at its composition root” (architecture A2) vs “each package chooses” (logging L6) vs single `createKernel` call

- **Severity:** MEDIUM
- **Classification:** both (intra-change spec tension; code matches logging better)
- **Evidence:** only `packages/core/src/composition/kernel.ts` calls `Logger.setImplementation`. CLI/code-graph/SDK consume the static facade.
- **Architecture might be right:** every package composition root should assign an impl.
- **Logging + code might be right:** one process-level assignment is enough; other packages choose ambient use without re-wiring.

### D3 — Port types live in `observability/logger.port.ts`, not authored in `application/ports/`

- **Severity:** LOW
- **Classification:** both
- **Architecture A3 / A13:** ports live under `application/ports/` (and `@specd/core/ports`).
- **Code:** types defined in observability, re-exported from `application/ports/logger.port.ts`. Domain importing `application/ports` would fail eslint.
- **Spec might be right:** move the interface into application/ports (would force eslint exception or domain staying on observability types only).
- **Code might be right:** keep port beside the ambient facade so domain never imports `application/`.

### D4 — Architecture `## Spec Dependencies` is still `*none*` while body links to logging; logging (change) depends on architecture

- **Severity:** LOW
- **Classification:** spec-wrong (documentation graph)
- One-way declared dependency + reverse prose link. Not a package cycle.

### D5 — Ambient `Logger.log` does not call `info()` on the facade

- **Severity:** LOW
- **Classification:** both
- **Spec L2:** `log()` SHALL be treated as an alias for `info()`.
- **Code:** `Logger.log` → `impl.log`; `Logger.info` → `impl.info`. Pino aliases both to `info`. A non-aliasing `LoggerPort` would diverge.
- **Spec might be right:** facade should call `impl.info` from both, or document that alias is an adapter contract.
- **Code might be right:** alias is an implementation concern of `LoggerPort` adapters.

### D6 — `LogLevel` includes `silent`; `fatal` does not terminate the process

- **Severity:** LOW
- **Classification:** both
- Spec L4: `fatal` = immediate process termination; no `silent`.
- Code: pino `silent` + `fatal` log only.
- **Spec might be right:** document `silent` and non-terminating fatal, or implement termination.
- **Code might be right:** process kill is a host concern; pino semantics are enough.

### D7 — L3 console prefix mapping has no implementation

- **Severity:** INFO
- **Classification:** spec-wrong _if_ L3 is claimed as always-on; **N/A** if scoped to “minimal console implementations” only
- No console logger in-repo to pass or fail L3.

### D8 — CLI `console.warn` / `console.error`

- **Severity:** LOW
- **Classification:** both
- L5 vs verify “excluding bootstrapping”. CLI warnings are user-facing bootstrap UX. Conformance-only for this batch.

### D9 — JSDoc eslint-disable on observability `NullLogger` and lifecycle-verdict helpers

- **Severity:** LOW
- **Classification:** both
- ESLint/docs: JSDoc on all functions. Code disables the rule for private helpers / no-op methods.
- **Spec might be right:** document `NullLogger` methods.
- **Code might be right:** global JSDoc rule is too strict for no-ops and private engine helpers.

### D10 — `observability/index.ts` barrel not in conventions exception list

- **Severity:** LOW
- **Classification:** both
- Conventions: no `index.ts` except package root and listed layer barrels. Domain already imports `logger.js` directly.

### D11 — Docs silence on public `Logger` / `LoggerPort`

- **Severity:** INFO
- **Classification:** spec-wrong _only if_ L6 is a new public API requiring `docs/core/` in the same change; otherwise **pre-existing** undocumented export
- No contradictory stale docs found.

### D12 — ESLint spec does not declare architecture as a Spec Dependency

- **Severity:** LOW
- **Classification:** spec-wrong
- Disk `default:_global/eslint` body encodes architecture layer rules; `## Spec Dependencies` lists only conventions. Change architecture exception is implemented by placing Logger outside `application/`, so eslint did not need a Logger allow-list.

**Forbidden-term / layer-import findings:** none. Domain does not import `application/`. Ambient Logger is the only production inner-layer exception (`observability/`). Domain **does** call `Logger.debug`.

---

## Test Coverage

| Spec scenario                                     | Coverage                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture: domain ↛ infrastructure / `node:fs` | ESLint + tsc; no dedicated vitest                                                                                                                                                    |
| Architecture: domain MAY import ambient Logger    | Production import compiles; **no** lint fixture asserting allow vs deny paths                                                                                                        |
| Architecture: application MAY import Logger       | Indirect: `lifecycle-engine.spec.ts` spies `Logger.debug` via `src/application/logger.js`                                                                                            |
| Logging L1 methods exist                          | Type-level `LoggerPort`; no interface contract test                                                                                                                                  |
| Logging L2 `log()` ≡ `info()`                     | **Uncovered** on ambient `Logger`. Pino both call `logger.info` — **no explicit test** that `PinoLogger.log` and `.info` are identical. `pino-logger.spec.ts` only exercises `info`. |
| Logging L3 prefixes                               | Missing (no console impl)                                                                                                                                                            |
| Logging L4 severity order                         | Missing                                                                                                                                                                              |
| Logging L5 console lint                           | ESLint does not ban `console.*`                                                                                                                                                      |
| Logging L6 no-throw before wiring                 | Partial: `logger-port.spec.ts` only `info`/`error`; **no** `console` spy proving no-op writes nothing                                                                                |
| Logging L6 no logger port in domain               | Production `evaluateLifecycleVerdict` has no logger param; tests spy `Logger` from **`application/logger.js`** — they do not assert signature omission                               |
| Testing: full port mock                           | `logger-port.spec.ts` implements all `LoggerPort` methods                                                                                                                            |
| Testing: given/when/then                          | Logger tests use informal titles                                                                                                                                                     |

---

## Missing Tests

1. **Prior LOW (still open):** `Logger.log` and `Logger.info` (and/or `PinoLogger.log` / `.info`) produce identical underlying calls.
2. **Prior LOW (still open):** `test/observability/logger.spec.ts` (and/or `logger.port.spec.ts`) mirroring `src/observability/` — today only `test/application/logger-port.spec.ts`.
3. All ambient methods no-throw **and** `console.*` not invoked before `setImplementation`.
4. `resetImplementation` restores no-op (not asserted).
5. ESLint/compiler fixture: domain import of `application/logger` fails; import of `observability/logger` succeeds.
6. Console `[FATAL]`/`[TRACE]` **only if** a console adapter is claimed.
7. Per-package `setImplementation` **only if** architecture A2 wiring sentence is treated as binding.

---

## Spec Dependency Chain

```
default:_global/architecture (change preview)
  Spec Dependencies: none (body still links logging)
  ↑ depended on by: default:_global/logging (change)
  ↑ depended on by: default:_global/testing (disk)
  ↑ restated by: default:_global/eslint layer rules (disk; eslint Spec Dependencies list conventions only)

default:_global/logging (change preview)
  → default:_global/architecture

default:_global/conventions (disk)
  → default:_global/error-handling-conventions
  ↑ depended on by: testing, eslint, docs

default:_global/testing (disk)
  → architecture, conventions

default:_global/eslint (disk)
  → conventions (architecture layers encoded but not listed)

default:_global/docs (disk)
  → conventions
```

This change’s core specs (`core:transition-checks`, `core:lifecycle-engine`, `core:change`, …) depend on architecture via change `specDependsOn`; those are out of this batch except for confirming architecture stays package-agnostic.

---

## Summary counts

| Spec                                     | Reqs reviewed                  | Implemented (change-relevant / conformance)                                                 | Discrepancies                                  | Missing tests         | Blocking (user architecture constraint) |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------- | --------------------------------------- |
| `default:_global/architecture` (preview) | 13                             | A2/A3/A7/A9 yes (observability layout caveat)                                               | 4 (D1–D4)                                      | 3                     | **0**                                   |
| `default:_global/logging` (preview)      | 6                              | L1 yes; L2 yes with facade caveat; L3 N/A; L4 partial; L5 mostly; L6 yes (core-only wiring) | 4 (D5–D8) + shared D2                          | 5 (incl. 2 prior LOW) | 0                                       |
| `default:_global/conventions` (disk)     | 10 (change-relevant subset ~8) | kebab/named/ESM/returns yes; test pairing / extra barrel no                                 | 2 (D10 + test pairing)                         | 0 lint-enforced       | 0                                       |
| `default:_global/testing` (disk)         | 6                              | Vitest/mocks yes; naming informal                                                           | 1 (naming)                                     | shared with logging   | 0                                       |
| `default:_global/eslint` (disk)          | 6                              | Layer rules **conformant** to Logger exception                                              | 2 (D9 JSDoc + D12 undeclared architecture dep) | 0                     | 0                                       |
| `default:_global/docs` (disk)            | scoped                         | no stale Logger docs                                                                        | 1 INFO (D11)                                   | 0                     | 0                                       |

| Totals (this batch)                            | Count                                                      |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Requirements reviewed (conservative unique)    | **40** (13+6+8+6+6+1)                                      |
| Unique discrepancies (D1–D12)                  | **12** (1 MEDIUM, 9 LOW, 2 INFO)                           |
| Missing tests listed                           | **7**                                                      |
| Blocking user-enforced architecture violations | **0**                                                      |
| Prior LOW still open                           | **2** (`log`/`info` tests; observability test path mirror) |

**Highest-signal for parent report:**

1. Architecture **preview is package-agnostic** — no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...` in spec prose. **User constraint held: PASS.**
2. Domain **does not** import `application/`; sole production Logger import is **`observability/logger.js`**; domain **does** call `Logger.debug`. ESLint needs **no** Logger exception if that layout is kept.
3. Dual surface `observability/*` vs `application/logger.ts` is the main layout smell vs “ports live in application/ports”.
4. `log()`↔`info()` holds in Pino, **not tested**; ambient facade does not force alias.
5. Logger tests still under `test/application/`, not `test/observability/`.
6. Architecture vs logging disagree on per-package `setImplementation`; code wires only in `createKernel`.
