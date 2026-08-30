# Spec compliance partial: lifecycle core

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** `graph stats` reported `stale: false`, `contentFresh: true`, `currentRef: 2948f1a2`. `graph search` located `evaluateLifecycleVerdict`, `projectArtifacts`, `evaluateLifecycle`, `WorkflowCheck`, `classifyAlong`. `graph search LifecycleEngine` / `LifecycleEngineOptions` returned **zero symbols**. `graph impact --file core:src/domain/services/lifecycle-verdict.ts` failed (`no indexed file matches`). `graph impact --symbol evaluateLifecycleVerdict` failed (`not_found`). **All implementation claims below were verified against current source files**, not graph adjacency.
- **Spec source:** `changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md concatenated).
- **Neither spec nor code is assumed true.**

**Cross-cutting global consistency (architecture / logging / testing)**

| Constraint                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/architecture` — domain does not import application; stateless domain = plain functions | Domain lifecycle is functions in `lifecycle-verdict.ts`. Domain does **not** import `application/`. Domain **does** import `../../observability/logger.js` (ambient `Logger` singleton). Architecture forbids module-level singletons and limits domain deps to stdlib + domain types. Change spec `core:lifecycle-engine` **explicitly permits** `Logger.debug`. **Tension: architecture vs logging exception.** |
| `default:_global/architecture` — inner layers never import outer                                        | `packages/core/src/domain/services/lifecycle-verdict.ts` → `packages/core/src/observability/logger.ts`. Observability is not `domain/`.                                                                                                                                                                                                                                                                           |
| `default:_global/logging`                                                                               | `Logger` implements console-compatible levels including `debug`. Domain uses `Logger.debug` only. Production path avoids raw `console` here.                                                                                                                                                                                                                                                                      |
| `default:_global/testing`                                                                               | Vitest; tests under `packages/core/test/` with `.spec.ts`. Domain verdict tests live at `test/domain/services/lifecycle-engine.spec.ts` while source is `lifecycle-verdict.ts` (name mismatch vs “mirror src”). That file **imports application** `evaluateLifecycle` (layer mixing in a domain test).                                                                                                            |

**Focus-area verification (do not assume)**

| Claim                                                                               | Verdict                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `LifecycleEngine` class                                                          | **Confirmed.** No class in graph or source. `lifecycle-engine.ts` is a re-export barrel only (`packages/core/src/domain/services/lifecycle-engine.ts:1-19`).                                                                          |
| No `@deprecated` shim                                                               | **Confirmed** for lifecycle types. Remaining `@deprecated` in core is unrelated (`rule-evaluator.ts`, `archived-change-index-entry.ts`).                                                                                              |
| No `LifecycleEngineOptions` alias                                                   | **Confirmed.** Input type is `LifecycleVerdictInput` (`lifecycle-verdict.ts:44`).                                                                                                                                                     |
| Domain: `evaluateLifecycleVerdict` / `projectArtifacts` / `nextHop` (no command)    | **Mostly confirmed.** `LifecycleNextHop` has no `command` (`lifecycle-verdict.ts:99-103`). Domain **still defines** `LifecycleNextAction` with `command` (`105-107`) and re-exports it from the domain barrel.                        |
| Application: `evaluateLifecycle` + `lifecycle-guidance.ts` for `nextAction.command` | **Confirmed structurally.** `evaluateLifecycle` at `lifecycle-evaluation.ts:19-36`. Commands in `lifecycle-guidance.ts`. **Happy-path command for `done`→`archivable` is `/specd-verify`, not `/specd-archive` (see discrepancies).** |
| Domain MUST NOT import application                                                  | **Confirmed** (no `application/` imports). Observability import remains.                                                                                                                                                              |
| Overlap review: `nextHop.targetStep` = `designing`                                  | **Implemented** `resolveLifecycleNextHop` `lifecycle-verdict.ts:813-818`. Covered by test `lifecycle-engine.spec.ts:344-382`.                                                                                                         |
| `workflow.requires`: complete \| skipped                                            | **Implemented** `domain/checks/workflow-requires.ts:33-36`. Binding skips `along=recovery` (`check-bindings.ts:35-38`).                                                                                                               |
| Change archive from `archivable` **and** `archiving`                                | **Code yes** (`change.ts:668-671` `isArchivable`; `1070-1073` `assertArchivable`). **Entity tests do not cover `archiving`.** Change **verify** scenario still says “not in `archivable` state” only.                                 |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary

1. **Stateless domain lifecycle verdict** — Plain functions in `lifecycle-verdict.ts`: `evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`. No class, no debug port, no `LifecycleEngineOptions`. Domain return `LifecycleDomainVerdict` without `nextAction.command`. Optional `Logger.debug`.
2. **Centralized validation logic** — Sole domain authority; project caller-supplied predicate `CheckResult`s; no `run:` effects; no snapshot bag; no `check.run` fallback; `projectArtifacts` is not a second availability algorithm.
3. **Effective artifact status** — DAG mapping: drift/review sticky; complete + unsatisfied upstream → `pending-parent-artifact-review`; recursive parent blocks. Spec text still says public contract is `LifecycleEngine.evaluate(...)` and forbids public `computeEffectiveStatus`.
4. **Canonical-state-only** — Ignore display `complete-with-drift` / `hasDrift` as extra states.
5. **Machine-readable blockers** — Structured `Blocker`; skippable omitted when bypass active; no `warnings`; mandatory codes including `INCOMPLETE_ARTIFACT` (not `MISSING_ARTIFACT`); overlap victim ≠ `OVERLAP_CONFLICT`.
6. **Available steps and domain next hop** — One predicate evaluation; `nextHop` without `command`; hop matrix including overlap → `designing`; archiving guidance.
7. **Application lifecycle guidance** — `lifecycle-guidance.ts` + `evaluateLifecycle`; DAG consumers may use empty `checksByTarget`.
8. **Archiving escape transitions** — `archivable` + `designing` in valid/available; recovery skips requires/taskCompletion; redesign for `archiving→designing`.
9. **Review summary** — Drift and overlap as diagnostics (overlap as review, not live archive overlap).
10. **Shared lifecycle interpretation** — Named consumers; no `LifecycleEngine` class; barrel re-export only; `CompileContext` not a consumer.
11. **Next artifact topological order** — `schema.artifactDag().topologicalOrder()`.

### Implementation Status (per requirement)

| Req                       | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain verdict  | **implemented** (with type smell) | Functions `evaluateLifecycleVerdict` `lifecycle-verdict.ts:146`, `projectArtifacts:313`, `findBlockingParent:330`. No class. Re-export `lifecycle-engine.ts:1-19`. `LifecycleNextAction` still in domain `:105-107`.                                                                                                                                                                                                                                       |
| Centralized validation    | **implemented**                   | Projects `options.checksByTarget` `:163-176`. No I/O in verdict. `Logger.debug` `:277`. Does not call `check.run`.                                                                                                                                                                                                                                                                                                                                         |
| Effective artifact status | **implemented**                   | `effectiveStatus` `:356-410`. Recursive parent via `findBlockingParentInternal`. No `computeEffectiveStatus` export.                                                                                                                                                                                                                                                                                                                                       |
| Canonical-state-only      | **implemented**                   | Uses `artifact.status` / file `status`, not `displayStatus` / `hasDrift` (`:362-371`, review from file `status` `:442-444`). Test `treats complete-with-drift as complete` `lifecycle-engine.spec.ts:417`.                                                                                                                                                                                                                                                 |
| Machine-readable blockers | **partial**                       | Shape `LifecycleBlocker` `:72-82`. Bypass omit `:798-800`. No `warnings` on domain verdict. Review overlap does not emit `OVERLAP_CONFLICT` `:551-552`. **`workflow.requires` fail code is always `INCOMPLETE_ARTIFACT` even for `drifted-pending-review` / `pending-review`** (`workflow-requires.ts:45-50`), while `artifactBlockers` would emit `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` (`:678-697`). Dual codes possible when checks + review both apply. |
| Available steps / nextHop | **implemented**                   | `validTransitions` from `VALID_TRANSITIONS` `:153`. `availableTransitions` from non-fail checks `:167-176`. `availableSteps` from `schema.workflow()` `:178`. `nextHop` via `resolveLifecycleNextHop` `:805`. Overlap → designing `:813-818`. Archiving incomplete commit → designing `:960-975`.                                                                                                                                                          |
| Application guidance      | **partial**                       | `evaluateLifecycle` `lifecycle-evaluation.ts:19-36`. `resolveLifecycleCommand` `lifecycle-guidance.ts:13`. Overlap command `/specd-design` because `review.required` `:22-24`. **`done` / `signed-off` always return `/specd-verify`** `:70-72` even when `nextHop.targetStep === 'archivable'`.                                                                                                                                                           |
| Archiving escapes         | **implemented**                   | `VALID_TRANSITIONS.archiving` `change-state.ts:42`. Recovery skip in bindings `exceptAlong: ['recovery']`. Verdict skips transitionBlockers for `archiving→archivable` `lifecycle-verdict.ts:220-222`. Test `keeps archiving recovery available` `lifecycle-engine.spec.ts:825-861`.                                                                                                                                                                       |
| Review summary            | **implemented**                   | `deriveReview` `:438-500`. Overlap without `OVERLAP_CONFLICT` blocker. **Overlap reason only if outstanding pending/drift files exist** (`:456-464`); empty `affectedArtifacts` on invalidation would yield `required: false`.                                                                                                                                                                                                                             |
| Shared consumers          | **implemented**                   | `GetStatus` → `evaluateLifecycle` `get-status.ts:481`. `TransitionChange` → `evaluateLifecycle` `transition-change.ts:219`. `ValidateArtifacts` / `GetArtifactInstruction` → `evaluateLifecycleVerdict` + `checksByTarget: {}` `validate-artifacts.ts:220`, `get-artifact-instruction.ts:97`. `CompileContext` has no lifecycle evaluate import.                                                                                                           |
| Next artifact DAG order   | **implemented**                   | `nextArtifact` uses `schema.artifactDag().topologicalOrder()` `:758`.                                                                                                                                                                                                                                                                                                                                                                                      |

### Discrepancies

1. **high | code-wrong | done/signed-off command is `/specd-verify` while `nextHop` is `archivable`**
   - **Evidence:** Spec hop matrix + application guidance: happy path from `done` with `archivable` available → archive (`spec-preview` Application lifecycle guidance / Projections). Code: `resolveLifecycleNextHop` sets `targetStep: 'archivable'` (`lifecycle-verdict.ts:930-936`) but `resolveLifecycleCommand` returns `'/specd-verify'` (`lifecycle-guidance.ts:70-72`). Test **locks this in**: `lifecycle-engine.spec.ts:751-769` expects `targetStep: 'archivable'` **and** `command: '/specd-verify'`.
   - **Option A:** Change `resolveLifecycleCommand` so `done`/`signed-off` with next hop `archivable` (or available `archivable`) maps to `/specd-archive`, and signoff-required stays `specd changes approve signoff`. Update the test.
   - **Option B:** Rewrite lifecycle-engine + transition-checks projection requirements to say the verify skill owns `done` until the user archives (contradicts `/specd-archive` in the same specs).

2. **high | both | `workflow.requires` vs mandatory blocker codes**
   - **Evidence:** Spec: `INCOMPLETE_ARTIFACT` for missing/in-progress; `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` for those states. Check `run()` fails every non-complete/skipped status as `INCOMPLETE_ARTIFACT` with `details.status` (`workflow-requires.ts:33-50`). Live change status for this worktree used `INCOMPLETE_ARTIFACT` with `drifted-pending-review`. Review path still adds `ARTIFACT_DRIFT` (`lifecycle-verdict.ts:528-537`).
   - **Option A:** Map requires failures to the same codes as `artifactBlockers` (drift/review/parent/incomplete).
   - **Option B:** Amend lifecycle-engine mandatory codes: requires-check failures are always `INCOMPLETE_ARTIFACT`; drift/review codes are review-summary only.

3. **medium | spec-wrong | Spec/verify still say `LifecycleEngine` / `LifecycleEngine.evaluate`**
   - **Evidence:** Purpose line 6; Effective status “public contract remains centered on `LifecycleEngine.evaluate`”; verify scenarios “WHEN `LifecycleEngine.evaluate` runs”; Next artifact “LifecycleEngine MUST scan”. Code and the **same spec’s** first requirement forbid the class.
   - **Option A:** Mechanical rename in spec.md/verify.md to `evaluateLifecycleVerdict` / `projectArtifacts`.
   - **Option B:** Restore a class named `LifecycleEngine` (rejected by this change’s explicit requirement).

4. **medium | spec-wrong | `resolveLifecycleCommand(nextHop, context)` signature**
   - **Evidence:** Spec lists two-arg form. Code is `resolveLifecycleCommand(change, nextHop, review, availableTransitions, approvals)` (`lifecycle-guidance.ts:13-18`).
   - **Option A:** Update spec to the real signature.
   - **Option B:** Narrow the function to `(nextHop, context)` wrapping those fields.

5. **medium | both | Domain owns `LifecycleNextAction.command` type**
   - **Evidence:** Spec: domain MUST NOT include command. Type lives in `lifecycle-verdict.ts:105-107` and is re-exported from domain `lifecycle-engine.ts:14`. Application attaches the field in `evaluateLifecycle`.
   - **Option A:** Move `LifecycleNextAction` to application.
   - **Option B:** Spec allows domain DTO for public merge as long as `evaluateLifecycleVerdict` does not populate `command`.

6. **medium | both | Ambient `Logger` vs hexagonal purity**
   - **Evidence:** Architecture: no module-level singletons; domain = stdlib + domain types. Code: `Logger` static impl `observability/logger.ts:28-38`; domain imports it `lifecycle-verdict.ts:13`. Lifecycle spec permits `Logger.debug`.
   - **Option A:** Document Logger as an architecture exception in `default:_global/architecture`.
   - **Option B:** Remove domain logging or inject a domain-safe no-op.

7. **low | spec-wrong | Incomplete restore vs `commitStarted` only**
   - **Evidence:** Spec: latest `archive-failed` with `commitStarted: true` **and** batch restore did not complete. Code treats `commitStarted` + still `archiving` as enough (`lifecycle-verdict.ts:964-974`). No explicit restore-success flag checked.
   - **Option A:** Add restore-incomplete fact to the event and branch on it.
   - **Option B:** Spec: remaining in `archiving` after `commitStarted` **is** incomplete restore.

8. **low | code-wrong | `isStepPermitted` still special-cases pending parking states**
   - **Evidence:** Spec: do not rewrite implementing/archivable to pending gates. Fallback `isStepPermitted` (`lifecycle-verdict.ts:342-354`) still keys off `pending-spec-approval` / `pending-signoff`. Used when `checksByTarget` lacks that step.
   - **Option A:** Permit only via `VALID_TRANSITIONS` + injected protocol checks.
   - **Option B:** Keep drain-state fallback; document it.

### Test Coverage / Missing Tests

**Covered (file:line):** no class (implicit); DAG parent-review `220-241`; spec approval nextAction `244-281`; overlap hop + `/specd-design` `344-382`; overlap bypass `385-415`; complete-with-drift `417+`; archiving escapes `494+`, `522-551`, `825-861`; implementing task gates `554-595`; designing/ready hops `597-641`; impl skippable flags `695-748`; skill hops from done `751-769` (**asserts the command bug**); next-artifact skipped deps `294-318`.

**Missing / weak:**

- Domain `nextHop` has no `command` asserted via `'command' in nextHop` (guidance tests use `evaluateLifecycle` so `nextAction.command` exists).
- `MISSING_ARTIFACT` absence as a dedicated assertion (partially covered by requires using `INCOMPLETE_ARTIFACT`).
- `availableSteps` omits `implementing` when workflow omits the row (verify scenario) — not found as a dedicated test name in `lifecycle-engine.spec.ts`.
- File-level `affectedArtifacts` for a **single** drifted file among two specs (verify “Detailed affected artifacts for drift”).
- `CompileContext` does not call evaluate — no dedicated compile-context test in this file (absence of import is the evidence).
- Restore incomplete vs restore succeeded still in archiving.
- `done` + signoff gate on → `specd changes approve signoff` (approval.spec covered; signoff analogue in this file not confirmed).

### Spec Dependency Chain

- `core:change` — persisted facts, `VALID_TRANSITIONS`, `isArchivable`.
- `core:workflow-model` — `workflow[]` extras, requires, taskCompletion.
- `core:schema-format` — artifact DAG, workflow YAML.
- `default:_global/architecture` — layers (tension on Logger).
- `default:_global/logging` — debug.
- `core:transition-checks` — check ids, along, projections.

### Summary counts: implemented, partial, missing, discrepancies, uncovered reqs

- **implemented:** 8
- **partial:** 3 (blockers codes; application command matrix; domain NextAction type / Logger)
- **missing:** 0
- **discrepancies:** 8
- **uncovered / weakly covered reqs:** ~5 verify scenarios (availableSteps omission, drift affectedArtifacts exactness, domain-only no-command, restore incompleteness, signoff command)

---

## Spec: `core:transition-checks`

### Requirements Summary

Shared evaluation of one transition **or** archive operation: check identity/labels/results; `WorkflowCheck` + `create*`; one file per check; `from`/`to`/`along` (forward/backward/redesign/recovery/any) + `AXIS_FALLBACK` splice; archive is not an edge; binding `phase`/`onFailure`; predicate vs effect; evaluation algorithm; registry bindings (incl. impl not on redesign; approval.spec not on redesign; approval.signoff not on archive); actionable diagnostics; generic progress bus; projections (`validTransitions` / `availableTransitions` / `nextAction`); no snapshot bag; one binding table.

### Implementation Status (per requirement)

| Req                       | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check identity and result | **implemented**                       | `CheckId` union `transition-checks.ts:20-34`. `CHECK_LABELS` gerunds `:42-57`. `CheckResult` `:70-85`. No `archive.publication` in union.                                                                                                                                                                                                                                                     |
| Check ABI / WorkflowCheck | **implemented**                       | Abstract class `workflow-check.ts:17`. Factories `create*` under `application/checks/`. Domain stubs `domain/checks/*` with `run` + stub `execute`.                                                                                                                                                                                                                                           |
| One file per check        | **implemented**                       | 18 modules under `application/checks/` (protocol, requires, taskCompletion, deps, readOnly, impl×2, approvals×2, schema name, archive.archivable, overlap, hooks).                                                                                                                                                                                                                            |
| Applicability along       | **implemented**                       | `classifyAlong` `transition-checks.ts:167-204`. Recovery `archiving→archivable` `:172-173`. Redesign `to===designing` `:175-176`. `buildAxis` splice `:139-157`. `AXIS_FALLBACK` `:107-114`.                                                                                                                                                                                                  |
| Archive is operation      | **implemented**                       | `ARCHIVE_BINDING_SPECS` `check-bindings.ts:84-94`. No `approval.signoff` on archive.                                                                                                                                                                                                                                                                                                          |
| Binding phase / onFailure | **implemented**                       | Hook rows `phase`/`onFailure` `check-bindings.ts:66-77`, `:92-93`. Transition `hook.post` `before-persist`; archive `hook.post` `after-persist`.                                                                                                                                                                                                                                              |
| Predicate vs effect       | **implemented**                       | `kind` on checks. Status uses predicates via `executeMatchingPredicates` / `executeChecksByLegalTargets`.                                                                                                                                                                                                                                                                                     |
| Evaluation of attempt     | **implemented**                       | `TransitionChange` fail-fast `protocol.edge` `transition-change.ts:215`. `GetStatus` collects all legal targets `get-status.ts:457`. No rewrite to pending (gates via `approval.*`).                                                                                                                                                                                                          |
| Registry bindings         | **implemented**                       | `TRANSITION_BINDING_SPECS` `check-bindings.ts:28-78`. impl `from=implementing` `along=forward` `:48-55`. `approval.spec` `from=ready` `along=forward` `:57-59`. `approval.signoff` `from=done` `to=archivable` `:61-64`. `workflow.requires` `exceptAlong: ['recovery']` `:35-38`. Archive runners listed `:84-91`. Application composes **same specs** `workflow-check-registry.ts:109-110`. |
| Actionable diagnostics    | **partial**                           | Compact impl summary required by spec — tests in `lifecycle-engine.spec.ts` for skippable flags. Full `deps.consistent` extracted vs persisted not re-audited line-by-line here; domain check exists `domain/checks/deps-consistent.ts`.                                                                                                                                                      |
| Progress bus              | **not fully re-traced in this batch** | Types/onCheckProgress exist on context (spec). `TransitionChange` wires `onCheckProgress` `transition-change.ts:199-213`. Treat as **implemented** at wiring level; CLI text rendering is `cli:*` (out of this batch).                                                                                                                                                                        |
| Projections               | **partial**                           | Domain projects availability; **commands are application**. Spec still says “LifecycleEngine SHALL project … nextAction” (No shared snapshot bag). `done` nextAction command mismatch (see lifecycle-engine).                                                                                                                                                                                 |
| No snapshot bag           | **implemented**                       | Test `transition-checks.spec.ts:383-387` asserts no `PredicateSnapshots` / `gatherPredicateSnapshots`. Registry comment GetStatus archive only in `archivable` `workflow-check-registry.ts:44-46`.                                                                                                                                                                                            |

### Discrepancies

1. **high | spec-wrong | “LifecycleEngine SHALL project nextAction”**
   - **Evidence:** `core:transition-checks` No shared snapshot bag + Purpose. Implementation split: domain `nextHop`, application `nextAction.command`.
   - **Option A:** Spec: domain projects hop; application attaches command via `evaluateLifecycle`.
   - **Option B:** Put command strings back in domain (violates architecture + lifecycle-engine).

2. **medium | both | Dual materialization `TRANSITION_BINDINGS` vs application registry**
   - **Evidence:** Spec: one binding table; domain must not copy independent `from/to/along` lists. Code: **one** `TRANSITION_BINDING_SPECS`; domain `TRANSITION_BINDINGS` applies domain stub checks (`check-bindings.ts:118-121`); application applies `create*` (`workflow-check-registry.ts:109`). Same rows, two instance tables.
   - **Option A:** Spec: specs are canonical; domain bindings are test fixtures.
   - **Option B:** Delete domain `TRANSITION_BINDINGS`; tests only use specs + matcher.

3. **medium | spec-wrong | GetStatus archive predicates only when `state === 'archivable'`**
   - **Evidence:** Spec: GetStatus runs overlap when `state === 'archivable'` (lifecycle-engine OVERLAP_CONFLICT). Code matches `get-status.ts:465`. Retry archive from **`archiving`** will not show live `OVERLAP_CONFLICT` on status. Archive operation still runs `archive.archivable` which allows `archiving` via `isArchivable`.
   - **Option A:** Also execute archive predicates when `state === 'archiving'`.
   - **Option B:** Spec: status overlap inventory is archivable-only; retry uses ArchiveChange.

4. **low | spec-wrong | verify still says `LifecycleEngine.evaluate` does not fall back to `check.run`**
   - **Evidence:** verify No shared snapshot bag. Function is `evaluateLifecycleVerdict`.

5. **low | both | `hook.pre` along `*` except recovery vs spec “along = \* except recovery”**
   - **Evidence:** Spec hook.pre transition: `to=*, from=*, along=* except recovery`. Code `along: '*'` + `exceptAlong: ['recovery']` `check-bindings.ts:72-76`. Matches intent.

### Test Coverage / Missing Tests

**Covered:** `packages/core/test/domain/services/transition-checks.spec.ts` (along/axis, no snapshot types). `lifecycle-engine.spec.ts` recovery requires skip, impl bypass flags, approval routing. `transition-change.spec.ts` archiving hops. `get-status.spec.ts` evaluateLifecycle / CountTasks.

**Missing / weak for this spec:**

- Dedicated test that `approval.signoff` is absent from archive matching list (verify “Signoff is not an archive predicate”) — not grepped as named scenario in this batch.
- Compact `examples:` text for >3 impl files (verify exists; confirm in impl-files-resolved tests separately if needed).
- Progress bus `check-start`/`check-done` without `Executing:` — likely CLI tests, not core domain.

### Spec Dependency Chain

`core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`.

### Summary counts

- **implemented:** 11
- **partial:** 2 (diagnostics depth; projections/command split)
- **missing:** 0
- **discrepancies:** 5
- **uncovered reqs:** ~3 verify scenarios (archive signoff list, progress bus, impl compact text) not confirmed in assigned files

---

## Spec: `core:change`

### Requirements Summary

Identity, `updatedAt`, workspaces/specIds/`specDependsOn`, **lifecycle** (`VALID_TRANSITIONS`, gates stay in ready/done, skill backward hops, archiving escapes), implementation tracking, approvals, artifacts (canonical states, skipped, parent-review not persistable), sync, history, archive outcome history, draft semantics, **lifecycle interpretation authority** (engine not entity), policy invalidation, per-file drift.

**Constraints of interest:** archive from `archivable` **and** `archiving`; skipped satisfies requires; task-completion “any step that requires an artifact with taskCompletionCheck is automatically gated” (**conflicts with workflow-model `requiresTaskCompletion`**).

### Implementation Status (per requirement)

| Req                                       | Status                                                                             | Evidence                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity / revision / workspaces          | **implemented** (pre-existing; not re-proven line-by-line)                         | Entity `change.ts`.                                                                                                                                                                                                                                                                                                  |
| Lifecycle / VALID_TRANSITIONS             | **implemented**                                                                    | `change-state.ts:30-42`. ready: implementing+designing only. done: archivable, designing, implementing, verifying. archiving: archivable+designing. Tests `change-state.spec.ts`.                                                                                                                                    |
| Skill-aligned backward hops               | **implemented**                                                                    | Table includes done/signed-off/archivable → implementing/verifying. `archivable → done` absent.                                                                                                                                                                                                                      |
| Archiving escapes                         | **implemented**                                                                    | Table + `transition()` uses `isValidTransition` `change.ts:680-684`.                                                                                                                                                                                                                                                 |
| Impl/verification loop                    | **implemented** at entity+checks                                                   | Task gate is `workflow.taskCompletion`, not entity.                                                                                                                                                                                                                                                                  |
| Implementation tracking                   | **implemented** (out of focus; entity methods exist).                              |
| Spec / signoff gates                      | **implemented**                                                                    | Stay in ready/done; checks `approval.spec` / `approval.signoff`. Entity still has drain states in `ChangeState`.                                                                                                                                                                                                     |
| Artifacts                                 | **implemented**                                                                    | Parent-review not persistable (spec). Engine derives it.                                                                                                                                                                                                                                                             |
| Artifact sync / history / archive outcome | **implemented** (pre-existing + archive-failed events used by verdict `:961-963`). |
| Drafting / drafted read-only              | **not deeply audited** this batch.                                                 |
| Lifecycle interpretation authority        | **partial naming**                                                                 | Entity does not compute DAG effective status. Spec still names `LifecycleEngine`. Functions are `evaluateLifecycleVerdict` / `projectArtifacts`.                                                                                                                                                                     |
| Policy invalidation / drift               | **implemented** (entity `invalidate`; canonical vs hasDrift).                      |
| Archive from archivable **and** archiving | **implemented in code, tests incomplete**                                          | `isArchivable` `change.ts:668-671`. `assertArchivable` `:1070-1073`. Tests `change.spec.ts:1075-1085` only assert **archivable**; title “returns true **only** in archivable state”. `assertArchivable` non-archivable list **omits `archiving` and `verifying`** (`:1118-1129`) — does not prove archiving allowed. |

### Discrepancies

1. **high | spec-wrong (internal) | Change constraints vs workflow-model on task gating**
   - **Evidence:** Change constraints: “Task completion gating is enforced generically … any step that requires an artifact with `taskCompletionCheck` is automatically gated”. Workflow-model: gating **only** when `requiresTaskCompletion` is set; artifact flag alone is insufficient.
   - **Option A:** Delete/amend the Change constraint to point at `requiresTaskCompletion`.
   - **Option B:** Change workflow-model to auto-gate (would invert this change’s design).

2. **medium | spec-wrong | verify “Archive from non-archivable state”**
   - **Evidence:** Constraints: both `archivable` and `archiving`. Verify: “WHEN archiving is attempted on a Change not in `archivable` state”. Code allows `archiving`.
   - **Option A:** Verify: throw unless `archivable` **or** `archiving`.
   - **Option B:** Disallow archive from `archiving` in `isArchivable` (would break retry).

3. **medium | spec-wrong | Lifecycle interpretation authority still says `LifecycleEngine`**
   - **Evidence:** spec.md requirement + verify “AND `LifecycleEngine` is responsible”.
   - **Option A:** Name the functions.
   - **Option B:** Keep marketing name “engine” without a class (document alias).

4. **low | code-wrong / tests | `isArchivable` tests contradict production getter**
   - **Evidence:** Production `state === 'archivable' \|\| state === 'archiving'`. Tests never transition to `archiving` for `isArchivable`.
   - **Option A:** Add `archiving` case; fix describe string.
   - **Option B:** If tests intended “only archivable”, production is wrong (conflicts with constraints).

5. **low | spec-wrong | `sanea` typo in artifacts requirement**
   - **Evidence:** preview “Load/save MUST **sanea** (coerce)”.
   - **Option A:** Fix to “sanitize”/“coerce”.
   - **Option B:** Ignore.

### Test Coverage / Missing Tests

**Covered:** `change-state.spec.ts` transitions including archiving escapes and skill hops. `change.spec.ts` identity, artifacts, `isArchivable` (archivable only), `assertArchivable`. `archive-change.spec.ts` archiving mutate. `transition-change.spec.ts` from archiving.

**Missing:** `isArchivable === true` when `state === 'archiving'`. `assertArchivable()` no-throw in `archiving`. Verify scenario update.

### Spec Dependency Chain

`core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`, `core:transition-checks`.

### Summary counts

- **implemented:** 16 (lifecycle-related + core entity; draft/schema-version treated implemented-preexisting without new findings)
- **partial:** 2 (interpretation naming; archive-from-archiving tests)
- **missing:** 0 for required behaviours in code
- **discrepancies:** 5
- **uncovered reqs:** archive-from-archiving entity tests; Change vs workflow-model constraint; several non-lifecycle reqs not re-listed as findings

---

## Spec: `core:workflow-model`

### Requirements Summary

`workflow[]` is lookup extras not protocol membership; unknown `step` rejected at `buildSchema`; step semantics (designing/implementing/verifying/archiving); **requires** as `workflow.requires` with complete\|skipped; **taskCompletion** via `requiresTaskCompletion` + `CountTasks` / `createWorkflowTaskCompletion`; availability from engine projections; workflow order = display + progress axis + AXIS_FALLBACK; step name = state; hooks as effects; two execution modes; requires are artifact IDs.

### Implementation Status (per requirement)

| Req                     | Status                                                          | Evidence                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step names / protocol   | **implemented**                                                 | `VALID_TRANSITIONS` independent of workflow rows. Omitted row → `workflowStep` null (schema). Unknown step: schema validation (schema-format).                                                                 |
| Step semantics          | **implemented** as documentation + routing in verdict/use cases | Drift → designing via review. Verification outcomes are skill/use-case, not a single function named in this file.                                                                                              |
| Requires-based gating   | **implemented**                                                 | `workflow.requires` `complete`/`skipped` `workflow-requires.ts:35`. Shared by GetStatus/TransitionChange via same check.                                                                                       |
| Task completion gating  | **implemented**                                                 | `createWorkflowTaskCompletion`; bindings `to=*`. Engine does not walk task files (`lifecycle-verdict` has no artifact content I/O).                                                                            |
| Step availability       | **partial naming**                                              | Projections from `evaluateLifecycleVerdict`, not `LifecycleEngine.evaluate`. `CompileContext` does not evaluate hops (no import). `isReady` may DAG-walk when checks missing (`lifecycle-verdict.ts:181-194`). |
| Workflow order / axis   | **implemented**                                                 | `classifyAlong` + `buildAxis`. `to=designing` → redesign. `archiving→archivable` → recovery.                                                                                                                   |
| Step-to-state mapping   | **implemented**                                                 | `TransitionChange` uses step name as `ChangeState`.                                                                                                                                                            |
| Hooks / two modes       | **implemented** at binding/use-case level                       | See transition-checks.                                                                                                                                                                                         |
| Requires = artifact IDs | **implemented**                                                 | Schema `requires` arrays; DAG cycle at build.                                                                                                                                                                  |

### Discrepancies

1. **medium | spec-wrong | Remaining `LifecycleEngine` / `LifecycleEngine.evaluate` / “engine walking files”**
   - **Evidence:** Step availability, constraints, verify “LifecycleEngine does not read the tasks file”, “CompileContext MUST NOT call LifecycleEngine.evaluate”.
   - **Option A:** Rename to `evaluateLifecycleVerdict` / `projectArtifacts`.
   - **Option B:** Keep informal “engine”.

2. **medium | spec-wrong | Availability scenario “reads persisted artifact state”**
   - **Evidence:** verify Step availability: persisted `complete` → available. Production requires **effective** status (parent-review can block a persisted-complete artifact). Requires-based scenarios correctly use pending-review / drift.
   - **Option A:** Availability scenarios use effective status.
   - **Option B:** Code should ignore parent-review for requires (would violate lifecycle-engine mapping).

3. **low | both | `isReady` DAG re-walk when checks absent**
   - **Evidence:** Spec: MUST project from `workflow.requires` when present; DAG allowed when `checksByTarget` empty. Code: `requiresFailed` from checks **or** `blockingArtifacts.length` (`lifecycle-verdict.ts:188-194`). Also fills `blockingArtifacts` from DAG even when checks exist (field, not second code).
   - **Option A:** Spec: `blockingArtifacts` may still list DAG ids.
   - **Option B:** Populate `blockingArtifacts` only from check details.

### Test Coverage / Missing Tests

Covered indirectly via lifecycle-engine + transition-checks + schema build tests. Missing dedicated workflow-model-named tests for “CompileContext MUST NOT report stepAvailable” (schema-format verify) — CompileContext has no such field (good). Unknown step `reviewing` covered at schema build (schema-format).

### Spec Dependency Chain

`core:change`, `core:schema-format`, `core:build-schema`, `core:compile-context`, `core:get-status`, `core:transition-change`, `core:archive-change`, `core:hook-execution-model`.

### Summary counts

- **implemented:** 8
- **partial:** 1 (naming + isReady extra walk)
- **missing:** 0
- **discrepancies:** 3
- **uncovered reqs:** 2 verify wording gaps (persisted vs effective; LifecycleEngine name)

---

## Spec: `core:schema-format`

### Requirements Summary

Full schema YAML contract (kind, extends, array ids, artifacts, DAG API, validations, workflow extras, plugins, resolve, etc.). **This change’s relevant slice:** `artifacts[].requires` feeds `projectArtifacts` / `artifactDag()`; no `Change.effectiveStatus()`; `workflow[]` lookup + complete\|skipped requires; omitted step ≠ deleted protocol state; unknown step rejected at build; consumers must use `schema.artifactDag()`.

### Implementation Status (per requirement)

| Req                                                                 | Status                                                                    | Evidence                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Schema file structure / kind / extends / array identity             | **implemented** (pre-existing; not re-audited every YAML rule).           |
| Artifact definition + requires cascade                              | **implemented**                                                           | Matches `effectiveStatus` cascade (`lifecycle-verdict.ts:379-407`). Naming still `LifecycleEngine.projectArtifacts` in spec.             |
| Schema artifact DAG API                                             | **implemented**                                                           | `schema.ts:98-103` lazy-cached `ArtifactDag`. Methods in `artifact-dag.ts` (`roots`, `childrenOf`, `topologicalOrder`, `descendantsOf`). |
| Canonical DAG derivation                                            | **implemented** for next-artifact                                         | `nextArtifact` uses `artifactDag().topologicalOrder()` only. `artifactDagFromChangeArtifacts` exists for tests (`artifact-dag.ts:168`).  |
| Workflow extras                                                     | **implemented**                                                           | Preview: requires complete\|skipped; AXIS_FALLBACK via transition-checks; unknown step SchemaValidationError.                            |
| verify.md format / other schema features                            | **implemented** (out of lifecycle focus).                                 |
| Explicit external hooks / plugins / resolution / validation on load | **not re-proven** this batch; no contradiction found with lifecycle code. |

### Discrepancies

1. **medium | spec-wrong | `LifecycleEngine` / `LifecycleEngine.projectArtifacts` in artifact requires + constraints**
   - **Evidence:** Artifact definition requires bullet; constraints “Artifact `requires` feeds `LifecycleEngine` DAG…”. Verify Workflow still says `GetStatus` / `LifecycleEngine`.
   - **Option A:** `projectArtifacts` / `evaluateLifecycleVerdict`.
   - **Option B:** Informal engine name.

2. **low | spec-wrong | Workflow verify “not `complete`” vs skipped**
   - **Evidence:** Scenario: requires artifact that is not `complete` → blocked. Spec.md: complete **or skipped**. A skipped optional should **not** block.
   - **Option A:** “not `complete` or `skipped`”.
   - **Option B:** Leave scenario as incomplete-status only.

3. **low | spec-wrong | CompileContext `stepAvailable`**
   - **Evidence:** verify “CompileContext MUST NOT report `stepAvailable`”. CompileContext has no such API (good). Spec invents a field name.
   - **Option A:** “MUST NOT compute hop availability”.
   - **Option B:** N/A.

### Test Coverage / Missing Tests

DAG/next-artifact: `lifecycle-engine.spec.ts` skipped-deps next artifact. Schema workflow omitted/unknown: schema-format verify — rely on existing `build-schema` / registry tests (not opened exhaustively). **Uncovered in this batch:** full schema-format suite vs every validation rule.

### Spec Dependency Chain

`core:delta-format`, `core:selector-model`, `core:content-extraction`, `core:schema-merge`. (Change-preview `specDependsOn` for schema-format has no `core:lifecycle-engine`; lifecycle-engine depends **on** schema-format.)

### Summary counts

- **implemented:** 6 (lifecycle-touching) + remainder assumed implemented-preexisting
- **partial:** 0 for lifecycle slice (naming only)
- **missing:** 0 for DAG/workflow extras
- **discrepancies:** 3 (all spec naming/verify wording)
- **uncovered reqs:** majority of non-workflow schema-format requirements not line-audited (~15); **not counted as missing implementation**

---

## Batch rollup (assigned five specs)

| Spec                                 | impl | partial | missing | discrepancies |                uncovered/weak |
| ------------------------------------ | ---: | ------: | ------: | ------------: | ----------------------------: |
| core:lifecycle-engine                |    8 |       3 |       0 |             8 |                            ~5 |
| core:transition-checks               |   11 |       2 |       0 |             5 |                            ~3 |
| core:change                          |   16 |       2 |       0 |             5 |                            ~3 |
| core:workflow-model                  |    8 |       1 |       0 |             3 |                            ~2 |
| core:schema-format (lifecycle slice) |    6 |       0 |       0 |             3 | many non-slice reqs unaudited |

**Highest-priority code issue:** `lifecycle-guidance.ts` maps `done`/`signed-off` → `/specd-verify` while domain `nextHop.targetStep` is `archivable`; tests currently require that pair.

**Highest-priority spec issue:** Widespread leftover `LifecycleEngine` / `.evaluate` after the class was removed; Change constraint auto-gates tasks vs `requiresTaskCompletion`.

**Highest-priority consistency issue:** `workflow.requires` always emits `INCOMPLETE_ARTIFACT` (including drift/review statuses) vs lifecycle-engine’s distinct blocker codes.
