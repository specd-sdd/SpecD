# Partial: core domain (lifecycle-engine, transition-checks, change, workflow-model)

**Mode:** change `workflow-transition-checks`  
**Spec source:** `changes spec-preview` (`--artifact specs` / `--artifact verify`)  
**Graph:** fresh (`stale: false`, indexed 2026-08-27T14:01:20.650Z)  
**Symbols:** `LifecycleEngine.evaluate` `core:src/domain/services/lifecycle-engine.ts:129`, `projectArtifacts` `:288`, `_effectiveStatus` `:328`, `classifyAlong` `core:src/domain/services/transition-checks.ts:167`, `CheckId` `:20`, `CheckBinding` `:420`, `VALID_TRANSITIONS` `core:src/domain/value-objects/change-state.ts:30`, `CompileContext` `core:src/application/use-cases/compile-context.ts:198` (no `LifecycleEngine` dependency).  
**Tests inspected:** `packages/core/test/domain/services/lifecycle-engine.spec.ts`, `transition-checks.spec.ts`, `change.spec.ts` (plus `build-schema.spec.ts` for unknown `workflow[]` step).

Neither spec nor code is treated as sole truth. Findings below name **spec-wrong** vs **code-wrong** with evidence.

---

## Requirements Summary

### `core:lifecycle-engine`

- Sole authority for hop interpretation: project **predicate** `CheckResult`s; no `run:` effects, no snapshot bag, no `check.run` fallback when `checksByTarget` is missing.
- `projectArtifacts` is a public pure DAG helper; **not** a second availability algorithm. Public contract is `evaluate(...)`; no public `computeEffectiveStatus(...)`.
- Effective artifact mapping: persist `drifted-pending-review` / `pending-review`; `complete` + unsatisfied upstream review → `pending-parent-artifact-review`; else persist `missing` / `in-progress` / `complete` / `skipped`. Canonical states only (`complete-with-drift` / `hasDrift` are not extra lifecycle states).
- Blockers: structured `code` / `message` / `isSkippable` / optional `bypassFlag` / `affectedArtifacts`. Mandatory codes include `MISSING_ARTIFACT`, `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`. Skippable + active bypass → **warning**, not blocker.
- `validTransitions` = `VALID_TRANSITIONS[state]`; `availableTransitions` = protocol targets whose injected predicates all pass/skip; `availableSteps` = `schema.workflow()` extras rows (omitted `implementing` may be absent from extras while still protocol-legal). `isReady` from `workflow.requires` results when present (no dual-write `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT`). `isPermitted` = `protocol.edge`. `_resolveTarget` must not rewrite to pending parking states.
- `nextAction` happy-path matrix (stay in `ready`/`done` for approvals; backward hops listed but not default). Archiving: `archivable`+`designing`; recovery hop skips `requires`/`taskCompletion`.
- Consumers: GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction use `evaluate`. **CompileContext must not call `evaluate` or compute hop availability.** ValidateArtifacts: empty `checksByTarget` still gets DAG / `nextArtifact`.
- `nextArtifact` from `schema.artifactDag().topologicalOrder()`.

### `core:transition-checks`

- Closed `CheckId` union (no `archive.publication`). Gerund `label`, `kind` on class, `execute(ctx)` self-sufficient. No `PredicateSnapshots` / `gatherPredicateSnapshots`.
- Applicability on **bindings** (`from`/`to`/`along` or archive). `classifyAlong` + `AXIS_FALLBACK` splice (not tail-append). Unknown strings must not occupy axis slots. Archive is an operation. Predicates vs effects; projections from predicate results.
- Registry: impl runners on `from=implementing` `along=forward` only; approvals stay in `ready`/`done`; recovery excludes `requires`/`taskCompletion`.

### `core:change`

- `VALID_TRANSITIONS`: `ready` → `implementing`|`designing` only; `done` → `archivable`|`designing`|`implementing`|`verifying` (no `pending-signoff`). Pending states **drain-only**. Skill-aligned backward hops from `done`/`signed-off`/`archivable`. No `Change.effectiveStatus()`. Entity owns persisted facts; DAG/hop availability is `LifecycleEngine`.

### `core:workflow-model`

- `workflow[]` looks up extras; omitting a row does not drop protocol membership. Unknown `step` → **`buildSchema` / resolve `SchemaValidationError`**, not `TransitionChange`. Hop availability from engine projections of `CheckResult`s. `CompileContext` MUST NOT evaluate availability. Never `change.effectiveStatus()`.

### Globals (`default:_global/architecture`)

- Domain: stdlib + domain types only; no I/O. Stateless services as pure functions. Engine projecting caller-supplied results + DAG facts is consistent with hexagonal inner layer.

---

## Implementation Status

| Area                                             | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hop availability from `CheckResult`s             | **Implemented**                        | `evaluate` loops `VALID_TRANSITIONS[change.state]`; skips targets with `injected === undefined`; includes target iff `every(outcome !== 'fail')` (`lifecycle-engine.ts:145-155`). No `check.run` / snapshot bag.                                                                                                          |
| `projectArtifacts` DAG                           | **Implemented**                        | Public method `:288-300`; `_effectiveStatus` walks schema `requires` with cycle guard; recursive parent-review `:328-382`. `nextArtifact` uses `artifactDag().topologicalOrder()` `:738-759`.                                                                                                                             |
| `pending-parent-artifact-review` not persistable | **Implemented (with type-union leak)** | `ArtifactFile` ctor throws `InvalidChangeError` if status is parent-review (`artifact-file.ts:52-56`). Load remaps to `in-progress` (`change-repository.ts:1422-1424`); save via `persistableArtifactStatus` `:1700-1702`. Engine **derives** it (`lifecycle-engine.ts:370-378`).                                         |
| No `Change.effectiveStatus()`                    | **Implemented**                        | Graph: only `_effectiveStatus` on `LifecycleEngine` and CLI test helper `effectiveStatus`. `Change` exposes persisted `state` / artifact `status`.                                                                                                                                                                        |
| Pending-\* drain only; stay in ready/done        | **Implemented**                        | `VALID_TRANSITIONS` (`change-state.ts:30-43`): `ready` has no `pending-spec-approval`; `done` has no `pending-signoff`; drain rows remain. `_resolveTarget` is identity (`lifecycle-engine.ts:310-312`). `nextAction` for missing spec/signoff stays on current state (`:799-822`).                                       |
| CompileContext must not evaluate hops            | **Implemented**                        | `graph impact --file compile-context.ts --direction dependencies`: **no** `lifecycle-engine.ts`. Class comment: artifact instructions are `GetArtifactInstruction`.                                                                                                                                                       |
| Unknown workflow step at `buildSchema`           | **Implemented**                        | `build-schema.ts:687-695` throws `SchemaValidationError` if `step` ∉ `Object.keys(VALID_TRANSITIONS)`. `classifyAlong`/`buildAxis` also filter `step in VALID_TRANSITIONS` (`transition-checks.ts:139-140`). Tests: `build-schema.spec.ts` rejects `reviewing`; `transition-checks.spec.ts` unknown step still `forward`. |
| Check ABI / bindings                             | **Implemented**                        | `CheckId` closed union without `archive.publication`. `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`. `exceptAlong: ['recovery']` on requires/taskCompletion. Impl `from=implementing` `along=forward`. Domain stubs vs application `create*` documented on bindings.                        |
| Architecture (domain no I/O)                     | **Implemented**                        | Engine + `classifyAlong` + domain `run(facts)` are in-memory. Production I/O belongs in `application/checks` (out of this batch). Optional `_debug` callback is not filesystem I/O.                                                                                                                                       |

---

## Discrepancies

### D1 — Overlap bypass: “warning” vs omit blocker — **medium**

- **Spec (`core:lifecycle-engine` Machine-readable blockers):** skippable + active bypass SHALL treat the condition as a **warning**, not a transition blocker. Verify: “downgraded to a warning”.
- **Code:** `_reviewBlockers` with `allow-overlap` **returns `[]`** (`lifecycle-engine.ts:523-525`). `LifecycleVerdict` has **no `warnings` field**. Test `'downgrades overlap blockers when the allow-overlap bypass is active'` asserts `OVERLAP_CONFLICT` **absent**, not present-as-warning (`lifecycle-engine.spec.ts:347-387`).
- **spec-wrong:** If the product intentionally has no warning channel, the spec/verify should say “omit blocker” not “warning”.
- **code-wrong:** If warnings are required, engine (and DTO) must surface a non-blocking warning.
- **Both partially wrong** is most accurate: spec names a warning surface that does not exist; code and tests implement omit.

### D2 — `ArtifactStatus` mixes persistable and derived values — **low**

- **Spec:** parent-review is **effective**, not a persisted file/aggregate state.
- **Code:** `ArtifactStatus` includes `pending-parent-artifact-review` (`artifact-status.ts:12-19`). Runtime persist is blocked (file ctor + repository remap). `ChangeArtifact._recomputeStatus` comment mentions parent-review aggregation (`change-artifact.ts:197-199`) but the method **never assigns** that status (files cannot hold it).
- **spec-wrong:** Could split `PersistableArtifactStatus` vs effective union.
- **code-wrong:** Shared union lets callers type-pass a non-persistable value until a ctor/repo guard fires.
- **Net:** behavior matches “not persistable”; type model is looser than the prose.

### D3 — `availableSteps` still DAG-walks `requires` when checks exist — **low**

- **Spec:** `isReady` MUST be projected from `workflow.requires` when results are present; MUST NOT independently re-walk to emit a **different blocker code**.
- **Code:** `isReady` uses `workflow.requires` fail when `evaluationChecks` is set (`lifecycle-engine.ts:167-173`). Step `blockers` are emptied when checks exist (`:190-193`). **`blockingArtifacts` is still filled by walking `workflowStep.requires` vs `effectiveStatus` (`:160-163`) even when checks are present.**
- **code-wrong** if `blockingArtifacts` is considered a second algorithm; **spec-wrong** if only blocker **codes** were in scope (then this is extra telemetry, not a dual-write). Dual-write of `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT` on **requested** blockers is avoided when `hasRequiresResult` (`:595-607`); covered by test at `lifecycle-engine.spec.ts:854-867`.

### D4 — Empty `checksByTarget` ⇒ empty `availableTransitions` — **info / aligned**

- Spec: do not fall back to `check.run`; hop availability from results **when supplied**; DAG `isReady` / parent-review MAY use `projectArtifacts` when empty.
- Code: missing injection → `continue` (target not listed). `availableSteps` then uses DAG `blockingArtifacts` for `isReady`. Matches “no second availability from check.run”. Not a defect; callers (GetStatus) must inject results.

No **critical/high** domain mismatches found for the assigned hop/DAG/pending/CompileContext/`buildSchema` focus.

---

## Test Coverage

### `lifecycle-engine.spec.ts` (maps well to verify)

| Verify / requirement                        | Test                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive parent-review                     | `downgrades complete artifacts to pending-parent-artifact-review…`                                                                                                                                |
| Canonical complete-with-drift               | `treats complete-with-drift as complete…`                                                                                                                                                         |
| Canonical missing + hasDrift                | `uses canonical missing state even when hasDrift is true`                                                                                                                                         |
| DAG next artifact vs declaration order      | `selects next artifact in topological order…`                                                                                                                                                     |
| CheckResults, no I/O                        | `projects injected CheckResults without filesystem I/O`                                                                                                                                           |
| availableSteps ≠ protocol                   | `workflow omits implementing` → extras omit `implementing`, `validTransitions` still includes it                                                                                                  |
| Dual-write                                  | `does not dual-write MISSING_ARTIFACT`                                                                                                                                                            |
| Task gating / nextAction                    | hide verifying; include verifying + `/specd-verify`; designing→ready; incomplete design stays designing; verifying→done; archivable→archive; done lists backward hops; done blocked stays on done |
| Approval stay in ready                      | `keeps implementing as effectiveTarget when spec approval is required`; designing + spec gate does not recommend approve                                                                          |
| Archiving escapes / recovery skips requires | `exposes archiving escape…`; `keeps archiving recovery available when archivable requires are incomplete`; failed commit → designing                                                              |
| Impl skippable flags                        | filesResolved not skippable; linksInScope `--allow-out-of-scope`                                                                                                                                  |
| Overlap bypass                              | present without flag; absent with `allow-overlap` (see D1)                                                                                                                                        |

### `transition-checks.spec.ts`

- `classifyAlong`: redesign, backward, recovery, forward, omitted `implementing`/`ready`, unknown `reviewing` not occupying axis.
- Bindings: no applicability on check objects; gerund labels; archive rows; shared runner identity; `approval.spec` vs redesign; effect `phase`/`onFailure`; compact impl messages; actionable `deps.consistent`.

### `change.spec.ts`

- Identity, workspaces, history-derived state, invalid pairs, artifact aggregation — **entity** scope.
- Protocol table is asserted via `VALID_TRANSITIONS` usage in `transition()` (`InvalidStateTransitionError`), not a dedicated “ready has no pending-spec-approval” table test in the portion reviewed. Drain/stay-in-ready behavior is primarily engine + application tests.

### `build-schema.spec.ts` (workflow-model / unknown step)

- Accepts valid `ChangeState` steps; **rejects `reviewing` with `SchemaValidationError`**.

---

## Missing Tests

1. **All artifacts complete/skipped → `nextArtifact === null`** (`core:lifecycle-engine` verify “All artifacts complete yields null next artifact”) — not in `lifecycle-engine.spec.ts`.
2. **Direct `evaluate(..., { checksByTarget: {} })`** — helper always merges `domainChecksByTarget`; empty-map hop emptiness and DAG-only `isReady` are undertested at unit level.
3. **Overlap bypass as warning** — no assertion of a warning object (blocked by D1).
4. **`Change` has no `effectiveStatus` method** — no explicit `expect('effectiveStatus' in change).toBe(false)` (graph-backed; optional).
5. **File persist guard** lives in `artifact-file.spec.ts`, not `change.spec.ts` — acceptable split; parent-review persist is not re-tested on `Change` save path in this batch.
6. **`CompileContext` does not call `evaluate`** — covered structurally by graph; no domain-unit test (belongs to compile-context / lifecycle consumer batch).

---

## Spec Dependency Chain

```
core:lifecycle-engine
  → core:change (persisted facts, VALID_TRANSITIONS)
  → core:workflow-model (workflow extras, axis)
  → core:schema-format (artifact/workflow YAML)
  → core:transition-checks (CheckResult, along, projections)
  → default:_global/architecture (domain purity)

core:transition-checks
  → core:change, core:workflow-model, core:schema-format
  → default:_global/architecture

core:change
  → core:lifecycle-engine (interpretation authority)
  → core:workflow-model, core:transition-checks
  → default:_global/architecture (+ manifest, spec-id, logging, …)

core:workflow-model
  → core:change, core:schema-format, core:build-schema
  → core:compile-context, core:get-status, core:transition-change, core:archive-change
  → core:hook-execution-model
```

**Consistency with globals:** Domain engine + matcher + `buildSchema` stay inside domain with no fs. Application use cases execute checks and inject results — matches hexagonal split. `CompileContext` depending on change/spec/schema **without** lifecycle hop evaluation matches both `lifecycle-engine` and `workflow-model`.

**Internal spec tension (not a code bug):** `lifecycle-engine` still lists `MISSING_ARTIFACT` as a mandatory blocker code while `workflow.requires` (and evaluate when results exist) emit `INCOMPLETE_ARTIFACT` for unsatisfied requires including missing. Dual-write forbid is implemented; the mandatory-code list is partly historical.

---

## Severity counts (this batch)

| Severity | Count | IDs                                        |
| -------- | ----- | ------------------------------------------ |
| critical | 0     | —                                          |
| high     | 0     | —                                          |
| medium   | 1     | D1 overlap warning vs omit                 |
| low      | 2     | D2 status union; D3 blockingArtifacts walk |
| info     | 1     | D4 empty checksByTarget                    |

**Assigned-focus verdict:** Hop availability, DAG `projectArtifacts`, non-persistable parent-review (runtime), no `Change.effectiveStatus()`, pending drain + stay-in ready/done, CompileContext not evaluating hops, and unknown step rejection at `buildSchema` are **implemented and largely test-backed**. Remaining issues are warning-surface / type-union / extras-row walk, not protocol regressions.
