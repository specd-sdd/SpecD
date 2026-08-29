# Specs compliance — change `workflow-transition-checks`

- **Timestamp:** 20260827-142613
- **Mode:** change
- **Verification:** full (scenarios + this audit)
- **Graph:** CONTENT_KNOWN_STALE; `graph index` worker exited unexpectedly; searches often GRAPH_BUSY

## Executive summary

Scenario verification: **PASS** (recorte + remaining assigned specs; targeted CLI/core tests green).

Compliance: **no critical implementation bugs** on the locked product axis (no snapshot bag, no `archive.publication` CheckId, no pending hops for new work, no `RunStepHooks` on production `ArchiveChange`, no `Change.effectiveStatus()` method).

Open audit items (spec-stale / over-specified, not runtime blockers):

| Sev           | Item                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major         | Merged `core:archive-change` **Ports and constructor** still documents `RunStepHooks`; recorte requirement forbids it. Code matches recorte.                                                                                                                                                                                                                         |
| Major         | Merged `core:schema-format` verify GIVEN parent `in-progress` → child `pending-parent-artifact-review`. Engine returns `in-progress` for incomplete parents and `pending-parent-artifact-review` only for **review** parents. Recorte (2) required naming `projectArtifacts` and forbidding `Change.effectiveStatus()`, not unambiguously collapsing those statuses. |
| Medium        | `specd-design` template still says artifacts are listed **under `review:`** (header restored; file list omitted).                                                                                                                                                                                                                                                    |
| Minor         | `core:hook-execution-model` archive numbered flow still says “via RunStepHooks”.                                                                                                                                                                                                                                                                                     |
| Out of change | Workspace `core:storage` still names `Change.effectiveStatus()`.                                                                                                                                                                                                                                                                                                     |

## Severity totals (union of partials)

| Severity | Approx |
| -------- | -----: |
| critical |      0 |
| major    |      2 |
| medium   |      1 |
| minor    |     4+ |
| nit/low  |     8+ |

## Detailed findings

The following sections are the complete partial reports.

---

# Spec compliance (recorte) — `cli:change-status`, `core:archive-change`, `core:schema-format`

- **Mode:** change `workflow-transition-checks` (merged preview via `changes spec-preview`)
- **Scope:** recorte (23): text `review:` header without file lists; `ArchiveChange` ctor / `ArchiveChangeDeps` without `RunStepHooks`; schema-format `requires` → `projectArtifacts` / `pending-parent-artifact-review` / no `Change.effectiveStatus()`
- **Also:** test coverage; hexagonal / global-spec consistency
- **Read-only:** no production code or spec edits
- **Graph:** `graph search` used (`ArchiveChange`, `ArchiveChangeDeps`, `projectArtifacts`, `effectiveStatus`). User note: graph may be `CONTENT_KNOWN_STALE`. Index was busy once (`GRAPH_BUSY`), then searches succeeded.

Neither spec nor code is automatically truth. Each discrepancy lists **spec-wrong** vs **code-wrong**.

---

## `cli:change-status`

### Requirements vs implementation

| Requirement (merged spec.md)                            | Implementation                                                                                                                                                                                                                                          | Verdict                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Command signature `change status <name> [--format]`     | `packages/cli/src/commands/change/status.ts` `registerChangeStatus`                                                                                                                                                                                     | Met                                 |
| Drafted status read-only                                | Draft branch: `isDrafted`, `transitions: (none — change is drafted)`                                                                                                                                                                                    | Met                                 |
| Output format: `hasTasks`, drift-aware DAG `state`      | Structured `artifactDag` + display projection                                                                                                                                                                                                           | Met (not recorte-primary)           |
| Task completion in DAG / details                        | `[hasTasks - N/M done]`, `tasks: N/M`                                                                                                                                                                                                                   | Met                                 |
| Display-state rendering                                 | Text uses `displayStatus`; JSON keeps canonical + display                                                                                                                                                                                               | Met                                 |
| **Lifecycle projections from GetStatus**                | Text `transitions:` = `lifecycle.availableTransitions`; JSON copies the array; no `VALID_TRANSITIONS` union                                                                                                                                             | **Met**                             |
| **Text omits duplicated review file lists**             | Header only: `review:` + `required` / `route` / `reason` (status.ts ~247–252). Paths not printed under `review:`. Files remain under `artifacts (details):`. Overlap peers in `overlap:` (~325–336). JSON still maps `review.affectedArtifacts` (~445+) | **Met** (recorte 23.1)              |
| **Text blockers include check labels**                  | `! ${code} — ${label}: ${message}` vs `! ${code}: ${message}`                                                                                                                                                                                           | **Met**                             |
| Schema version warning from `lifecycle.schemaInfo`      | stderr `warning:` when recorded ≠ current                                                                                                                                                                                                               | Met                                 |
| Change not found                                        | `ChangeNotFoundError` → exit 1, `error:`                                                                                                                                                                                                                | Met                                 |
| Schema-derived fields / DAG from `schema.artifactDag()` | Structured payload builds DAG via `kernel.specs.getActiveSchema` + `childrenOf`                                                                                                                                                                         | Met with constraint tension (below) |
| Delegates refresh to GetStatus                          | Handler calls `kernel.changes.status.execute` only; no `RefreshImplementationTracking` / `ImplementationDetector`                                                                                                                                       | Met                                 |
| Implementation section via SDK                          | `--implementation` → `enrichImplementationTracking` → `buildImplementationReview`                                                                                                                                                                       | Met                                 |
| Basic info: name/state, **no** standalone `specs:`      | Text starts `change:` / `state:` then DAG/details                                                                                                                                                                                                       | **Met in code**                     |
| Specs and dependencies section                          | `specs and dependencies:` after DAG                                                                                                                                                                                                                     | Met                                 |

**Recorte focus — review header:** code prints the header and does **not** reprint `affectedArtifacts` paths. Drift test asserts absolute path absent while `tasks.md` still appears in details.

### Discrepancies

1. **Minor — spec-wrong (Examples vs Basic info).** Merged spec.md **Examples** still show a top-level `specs: auth/oauth` line. Requirement **Basic info section** forbids a standalone `specs:` list. Code matches the requirement, not the example.
   - Spec-wrong: stale example not updated with the recorte/basic-info delta.
   - Code-wrong: no (renderer has no `specs:` header line).

2. **Minor — both (constraint vs Schema-derived fields).** Constraints say the CLI MUST NOT call another use case to recompute lifecycle data. Text/JSON DAG still calls `kernel.specs.getActiveSchema.execute()` to get a live `Schema` for `artifactDag()`. Lifecycle **availability** is not recomputed locally (good for recorte). Schema **shape** is fetched separately.
   - Spec-wrong: constraint is stricter than Schema-derived fields, which require `schema.artifactDag()`.
   - Code-wrong: if GetStatus already carries enough DAG metadata, the extra use case is unnecessary.

3. **Nit — spec-wrong (verify vs spec).** Merged `verify.md` dropped “review section shows affected absolute file paths” (base still had it). Merged spec + merged verify agree on header-without-files. No code issue.

### Test coverage

| Recorte / related scenario                           | Tests                                                                                                                                                                        | Adequacy                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Review header, no file paths under `review:` (drift) | `packages/cli/test/commands/change.spec.ts` — `given artifact drift, when text status renders, then omits duplicated review file paths`                                      | Adequate                  |
| Overlap peers without file lists                     | `packages/cli/test/commands/change-status.spec.ts` — `given spec-overlap-conflict, when text status renders, then prints review header and overlap peers without file lists` | Adequate                  |
| JSON still has `review.affectedArtifacts`            | `change.spec.ts` JSON review files test                                                                                                                                      | Adequate                  |
| `availableTransitions` not unioned with protocol     | `change-status.spec.ts` — `renders availableTransitions from GetStatus without unioning protocol edges`                                                                      | Adequate                  |
| Blocker gerund label                                 | `change-status.spec.ts` — `given DEPS_INCONSISTENT blocker with label, when text status renders, then shows gerund label`                                                    | Adequate                  |
| No standalone `specs:`                               | Indirect (output contains `specs and dependencies:`; no assertion that a header `specs:` is absent)                                                                          | **Gap (nit)**             |
| `artifact-review-required` specifically              | Covered by same header path as drift; dedicated scenario exists in merged verify                                                                                             | Partial (shared renderer) |

**Missing tests:** explicit `not.toMatch(/^specs:/m)` / `not.toContain('\nspecs:       ')` for Basic info; `artifact-review-required` as its own it() (verify has it).

### Spec dependency chain / globals

- Depends on `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`. Recorte behaviour is presentation of GetStatus fields — consistent with those specs.
- **Hexagonal:** CLI is an adapter; it serializes GetStatus. Layering OK. `enrichImplementationTracking` is presentation over SDK, not Core graph matching.
- **`default:_global/testing`:** several tests use `given…when…then` names; older tests do not. Nit only.

### Counts (`cli:change-status`)

- Critical: **0**
- Major: **0**
- Minor: **2**
- Nit: **2**

---

## `core:archive-change`

### Requirements vs implementation (recorte ctor + bindings)

| Requirement                                                                                                                             | Implementation                                                                                                                                                                                                                                                             | Verdict                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Archive bindings not RunStepHooks on the use case**                                                                                   | `ArchiveChange` ctor (`archive-change.ts` ~218–231): `archiveBindings: readonly CheckBinding[]`. Fields: `_archiveBindings` only. No `RunStepHooks` param, no `defaultArchiveBindings` / `runStepHooks ?? make…` on the class                                              | **Met (production)**                 |
| `resolveArchiveChangeDeps` includes `archiveBindings` from `resolveWorkflowCheckRegistry`; **no** `runStepHooks` on `ArchiveChangeDeps` | `packages/core/src/composition/use-cases/archive-change.ts` `ArchiveChangeDeps` (~104–117): `archiveBindings`, no `runStepHooks`. `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings`. `isArchiveChangeDeps` requires `'archiveBindings' in value` | **Met**                              |
| `ListWorkspaces` not `ReadonlyMap<SpecRepository>` on the use case                                                                      | Ctor takes `ListWorkspaces`                                                                                                                                                                                                                                                | **Met** (new req)                    |
| **Ports and constructor** (still in merged spec.md **before** the recorte requirement)                                                  | Still documents `RunStepHooks`, `runStepHooks: RunStepHooks`, and `ReadonlyMap` of spec repos                                                                                                                                                                              | **Internal spec contradiction**      |
| Effects via binding table, not `check.id === 'hook.pre'`                                                                                | `matchingEffects(this._archiveBindings, …)`; no `check.id === 'hook.*'` in use case                                                                                                                                                                                        | Met                                  |
| `RunStepHooks` only on `createHookPre` / `createHookPost`                                                                               | Production wiring: registry factories. Tests still pass a `RunStepHooks` stub into **`newArchiveChange` helper**                                                                                                                                                           | Production Met; test helper residual |

Graph: `ArchiveChange` class `core:src/application/use-cases/archive-change.ts` line 188; `ArchiveChangeDeps` `core:src/composition/use-cases/archive-change.ts` line 104.

### Discrepancies

1. **Major — spec-wrong (merged spec.md self-contradiction).** Requirement **Ports and constructor** still says `ArchiveChange` receives `RunStepHooks` and shows a TypeScript ctor with `runStepHooks: RunStepHooks`. Immediately after, **Archive bindings not RunStepHooks** forbids that constructor argument and forbids a ctor fallback from `RunStepHooks`.
   - Spec-wrong: the first requirement was not rewritten when the recorte requirement was **added**. Delta only **added** a section; it did not **modify** Ports and constructor.
   - Code-wrong: no — production matches the recorte requirement, not the leftover snippet.

2. **Minor — test residual (not production ctor fallback).** `newArchiveChange` in `packages/core/test/application/use-cases/helpers.ts` (~943–980) still takes `runStepHooks: RunStepHooks` as the 4th argument and does `archiveBindings ?? makeArchiveBindings({ runStepHooks, … })`. That **is** a fallback that builds default bindings from `RunStepHooks`, but it lives on the **test factory**, not `ArchiveChange`.
   - Spec-wrong: if the requirement is read as “no helper may map RunStepHooks → bindings”, tests fail the letter.
   - Code-wrong: production class has no fallback. Helper exists so hook tests can still inject `makeRunStepHooks({ execute })` without touching composition. Prefer treating as test-layer leftover, not a Kernel bug.

3. **Nit — constructor unit test is weak.** `archive-change.spec.ts` `does not store RunStepHooks on the instance` still **passes** `makeRunStepHooks()` into `newArchiveChange` and only asserts `'runStepHooks' in uc` / `'_runStepHooks' in uc` are false. It does not type-check that `new ArchiveChange(..., runStepHooks, …)` is a compile error.

### Test coverage

| Scenario (merged verify)                                      | Tests                                                                                                    | Adequacy                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Constructor does not take / store `RunStepHooks`              | Instance property check via helper                                                                       | Weak (see nit)                                                        |
| `ArchiveChangeDeps` has `archiveBindings`, not `runStepHooks` | `packages/core/test/composition/use-cases/archive-change.spec.ts` builds deps **without** `runStepHooks` | Adequate for composition surface; no `expect('runStepHooks' in deps)` |
| Hook pre/post still work                                      | Many `archive-change.spec.ts` cases via `makeArchiveBindings` + stub `RunStepHooks`                      | Adequate for behaviour; encodes helper mapping                        |

**Missing tests:** compile/type-level test that `ArchiveChange` constructor arity/types exclude `RunStepHooks`; assertion that `ArchiveChangeDeps` keys exclude `runStepHooks`.

### Hexagonal / global specs

- **`default:_global/architecture`:** `ArchiveChange` is application; no `infrastructure/` imports. Bindings are `CheckBinding[]` (domain service types). Hook I/O stays in application `createHook*` / `RunStepHooks`. Domain `workflow-requires` / `detectSpecOverlap` remain I/O-free. **Consistent.**
- Use case still calls `detectSpecOverlap` **and** runs archive predicates (including overlap). Possible duplication vs “named checks” — out of recorte ctor focus; not counted.
- **`default:_global/testing`:** unit tests mock ports; `newArchiveChange` is a test helper, not a snapshot test. Hook stubs use `as unknown as RunStepHooks` in `makeRunStepHooks` — **nit** vs “typed full port mocks” if `RunStepHooks` is a class port.

### Counts (`core:archive-change`)

- Critical: **0**
- Major: **1** (leftover Ports and constructor vs recorte requirement)
- Minor: **1**
- Nit: **2**

---

## `core:schema-format`

### Requirements vs implementation (recorte `requires`)

Merged **Artifact definition** (`requires` bullet, delta `core/schema-format/spec.md.delta.yaml`):

- `requires` feeds `LifecycleEngine.projectArtifacts` and `Schema.artifactDag()`.
- A dependency is resolved when status is `complete` or `skipped`.
- If the dependent is `complete` and a required artifact is **not** `complete` or `skipped`, effective status is **`pending-parent-artifact-review`** (**not** `in-progress`, **not** `Change.effectiveStatus()`).
- Constraints: same “no `Change.effectiveStatus()`” + `projectArtifacts`.

Merged **verify** scenario **Artifact with dependency chain**:

- GIVEN B `requires: [a]`, A `in-progress`, B `complete`
- THEN `LifecycleEngine.projectArtifacts` effective status for `b` is `pending-parent-artifact-review`
- AND there is no `Change.effectiveStatus()` method

**Code:**

- `Change` entity (`packages/core/src/domain/entities/change.ts`): **no** `effectiveStatus` method (graph + file read). **Matches “no Change.effectiveStatus()”.**
- `LifecycleEngine.projectArtifacts` (`lifecycle-engine.ts` ~288–300) maps `_effectiveStatus`.
- `_effectiveStatus` (~328–381):
  - Parent `in-progress` / `missing` / incomplete (non-review) → dependent returns **`in-progress`** (early return at ~365–366).
  - Parent `pending-review` / `drifted-pending-review` / `pending-parent-artifact-review` → dependent **`pending-parent-artifact-review`**.
- Tests **encode the engine split**, not the schema-format verify scenario:
  - `lifecycle-engine.spec.ts`: incomplete upstream chain → `tasks` **`in-progress`**.
  - Same file: upstream **`pending-review`** → `verify` **`pending-parent-artifact-review`**.
  - `get-status.spec.ts`: drafted dependents project `pending-parent-artifact-review` without `evaluate`.

`workflow.requires` check (`domain/checks/workflow-requires.ts`) consumes **maps of** `effectiveStatus` from engine facts, not `Change.effectiveStatus()`.

### Discrepancies

1. **Major — both (cascade status for incomplete vs review parents).** Recorte 23.2 / design (“complete-with-unready-parent → `pending-parent-artifact-review`”) and merged schema-format **collapse all unready parents** into `pending-parent-artifact-review`, including A=`in-progress`. Engine **distinguishes** incomplete (`in-progress`) vs review-blocked (`pending-parent-artifact-review`). Status **name** “parent-**review**” matches the engine, not the verify GIVEN (`in-progress`).
   - **Spec-wrong (preferred if engine semantics stay):** verify/delta over-simplified; should GIVEN A=`pending-review` (or `drifted-pending-review`) for `pending-parent-artifact-review`, and keep `in-progress` cascade for incomplete parents. Aligns with `core:lifecycle-engine` tests and UX (review vs “not done yet”).
   - **Code-wrong (if recorte 23.2 is locked literally):** `_effectiveStatus` should return `pending-parent-artifact-review` whenever a complete child has any unresolved parent, including `in-progress`. Then `lifecycle-engine.spec.ts` incomplete-chain test is wrong.

   **Do not treat either side as automatic truth.** Product lock in `proposal.md` recorte (2) only required naming `projectArtifacts` and forbidding `Change.effectiveStatus()`; it did **not** unambiguously delete the review vs incomplete split. The **delta text** did.

2. **Nit — missing negative test.** No test asserts `Change.prototype` / instance has no `effectiveStatus` method (verify AND clause). Absence is true today; unguarded against regression.

### Test coverage

| Requirement                                                          | Tests                                                     | Adequacy                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| No `Change.effectiveStatus()`                                        | None named                                                | **Gap**                                                  |
| `projectArtifacts` is the DAG projector                              | `lifecycle-engine.spec.ts` uses `engine.projectArtifacts` | Adequate for engine, not under `schema-format` test tree |
| Incomplete parent → `pending-parent-artifact-review` (merged verify) | **No test matches this GIVEN/THEN**                       | **Fail vs merged verify** / **pass vs engine**           |
| Review parent → `pending-parent-artifact-review`                     | `lifecycle-engine.spec.ts` upstream review blockers       | Adequate for engine semantics                            |
| Cycles / optional requires                                           | Schema validation tests (pre-existing)                    | Not recorte                                              |

### Spec dependency / globals

- `core:schema-format` now describes **runtime DAG status**, which is implemented in `LifecycleEngine`, not in YAML parse. That coupling is intentional (delta) but splits SoT across `core:lifecycle-engine` and `core:schema-format`. If those specs disagree, agents will implement the wrong cascade.
- **Hexagonal:** `projectArtifacts` / `_effectiveStatus` are domain-pure. `workflow-requires` `run(facts)` is a pure function. **Consistent** with `default:_global/architecture`.
- **`default:_global/spec-layout`:** verify scenario heading still sits under **Artifact definition** — OK. Content disagrees with engine verify.

### Counts (`core:schema-format`)

- Critical: **0**
- Major: **1** (requires cascade: `pending-parent-artifact-review` vs `in-progress`)
- Minor: **0**
- Nit: **1**

---

## Cross-spec / recorte summary

| Recorte item                                                                 | Production code                          | Merged spec                                    | Tests                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| Text `review:` header, no file lists                                         | Implemented                              | Spec + verify aligned                          | Covered (drift + overlap)                   |
| `ArchiveChange` / `ArchiveChangeDeps` without `RunStepHooks`                 | Implemented                              | New req OK; **Ports and constructor leftover** | Helper still maps `RunStepHooks` → bindings |
| schema-format `requires` → `projectArtifacts`, no `Change.effectiveStatus()` | `projectArtifacts` yes; no entity method | Named correctly                                | Cascade THEN **does not match engine**      |

### Totals (this batch)

| Severity | Count |
| -------- | ----- |
| Critical | **0** |
| Major    | **2** |
| Minor    | **3** |
| Nit      | **5** |

### Suggested reviewer calls (not implemented here)

1. Rewrite **Ports and constructor** so it matches `archiveBindings` + `ListWorkspaces` (spec-wrong).
2. Narrow schema-format verify/delta: `in-progress` parent → `in-progress` child cascade; review parent → `pending-parent-artifact-review` — **or** change `_effectiveStatus` if product wants a single status.
3. Optionally drop `RunStepHooks` from `newArchiveChange` signature (pass `archiveBindings` only) so tests cannot imply a use-case fallback.
4. Fix change-status **Examples** `specs:` line.

---

# Partial audit: core remaining (product-axis leftovers)

Mode: change audit (read-only). Change `workflow-transition-checks`. Specs via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`.

Graph: `graph search` returned `GRAPH_BUSY` (index in progress). User noted graph may be stale. Navigation used spec-preview plus targeted source/test reads. No reindex.

**Product-axis leftovers checked (this batch):** snapshot bag; `archive.publication` as `CheckId`; pending hops; `RunStepHooks` on `ArchiveChange`; `Change.effectiveStatus()`.

**Verdict:** those leftovers are **gone from production code**. Remaining notes are drain-state protocol (required), a test-helper positional `RunStepHooks`, one stale archive-flow paragraph in `core:hook-execution-model`, and unmerged workspace `specs/` text for `schema-format` / out-of-change `core:storage`.

Assigned specs: `core:transition-checks`, `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:validate-artifacts`, `core:get-artifact-instruction`.

Not in this batch: `core:archive-change` (still inspected for the RunStepHooks leftover), `core:schema-format` (inspected via spec-preview for `Change.effectiveStatus()`).

---

## Leftover lens (cross-spec)

| Leftover                                                                                     | Production code                                                                                                                                                                                                                                                                                                                                                                                                                  | Merged assigned specs                                                                                                                                                                                         | Tests                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot bag (`PredicateSnapshots` / `gatherPredicateSnapshots` / `emptyPredicateSnapshots`) | **Absent.** No type, no gather file, no public/domain export. `LifecycleEngineOptions` has `checksByTarget` only (no `snapshots`).                                                                                                                                                                                                                                                                                               | Forbids bag; engine must not accept a snapshot struct.                                                                                                                                                        | `transition-checks.spec.ts` 382–388: module does not export those names. `workflow-check-factories.spec.ts`: protocol execute without a bag. |
| `archive.publication` as `CheckId`                                                           | **Absent.** `CheckId` union + `CHECK_LABELS` (`transition-checks.ts` 20–57) have no publication id. `ARCHIVE_BINDING_SPECS` (`check-bindings.ts` 84–94) lists nameMatch, archivable, overlap, workspace, deps, impl.\*, hooks only. Comment: “Publication is not a check.” Merge/publish stays inside `ArchiveChange` (`PreparedArchivePublication`, `ArchivePreflightError` path).                                              | MUST NOT be a `CheckId` or registered check.                                                                                                                                                                  | `transition-checks.spec.ts` 390–391: archive binding ids do not contain `archive.publication`.                                               |
| Pending hops (new work)                                                                      | **No rewrite.** `_resolveTarget` is identity (`lifecycle-engine.ts` 310–311). `VALID_TRANSITIONS['ready']` = implementing/designing only; `done` has no `pending-signoff` (`change-state.ts` 30–39). `TransitionChange` persists requested target; `_assertDrainAndGateTargets` only allows drain from already-pending states. Failed `approval.spec` / `approval.signoff` throw `approval-required` and leave `ready` / `done`. | Stay-in-ready/done; MUST NOT rewrite implementing→pending-spec-approval or archivable→pending-signoff. Drain from in-flight pending states remains.                                                           | `transition-change.spec.ts` 275–289 stay in ready; 333+ stay in done; 392–417 drain only.                                                    |
| `RunStepHooks` on `ArchiveChange`                                                            | **Gone.** Constructor (`archive-change.ts` 218–244) takes `archiveBindings`, not `RunStepHooks`. No `_runStepHooks` field. `ArchiveChangeDeps` / `resolveArchiveChangeDeps` inject `archiveBindings` only. Effects: `matchingEffects` + `check.execute`.                                                                                                                                                                         | Assigned `hook-execution-model` / `transition-change`: use cases MUST NOT launch `RunStepHooks` by check id. Archive ctor requirement lives on `core:archive-change` (out of batch); code matches that delta. | `archive-change.spec.ts` 168–180: `'runStepHooks' in uc` and `'_runStepHooks' in uc` are false.                                              |
| `Change.effectiveStatus()`                                                                   | **Absent on the entity.** `packages/core/src/domain/entities/change.ts` has no `effectiveStatus`. DAG status is `LifecycleEngine._effectiveStatus` / `projectArtifacts` (`lifecycle-engine.ts` 288–298, 328+).                                                                                                                                                                                                                   | `core:workflow-model` merged: never from `change.effectiveStatus()` (entity has no such method). Other assigned specs talk about artifact `effectiveStatus` fields / maps, not a Change method.               | Engine/GetStatus tests assert projected `effectiveStatus`. No test that `Change` lacks the method (**gap**).                                 |

**Drain (not a leftover hop):** pending states remain `ChangeState` values. Engine `_isStepPermitted` still special-cases `pending-spec-approval` / `pending-signoff` when extras checks are missing (`lifecycle-engine.ts` 319–324). `nextAction` still recommends approve for those drain states (851–857, 903–909). `ApproveSpec` / `ApproveSignoff` still drain-transition when already pending. Specs require this.

---

## Spec: `core:transition-checks`

### Requirements Summary (leftover-relevant)

Self-sufficient `Check.execute`; no `PredicateSnapshots` / gatherer; `archive.publication` not a `CheckId`; no pending rewrite; effects call `RunStepHooks` from hook-check constructors, not use-case id switches; projections from predicate results.

### Implementation Status

| Area                    | Status      | Evidence                                                                                                                                                          |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No snapshot bag         | Implemented | No gather module; `CheckExecutionContext` has `effectiveStatusByArtifact` map from `projectArtifacts`, not a closed bag type. Domain `run` takes per-check facts. |
| `archive.publication`   | Implemented | Not in `CheckId` / `CHECK_LABELS` / `ARCHIVE_BINDING_SPECS`.                                                                                                      |
| No pending rewrite      | Implemented | Matcher + bindings: `approval.spec` `from=ready` `along=forward`; signoff `done→archivable`. Spec text: MUST NOT match hop into pending.                          |
| Hooks via check execute | Implemented | `hook-effect.ts` `HookEffectCheck` holds `RunStepHooks`.                                                                                                          |

### Discrepancies

None on this leftover axis.

### Test Coverage

Absence of snapshot exports; absence of `archive.publication` on archive bindings; classifyAlong for drain pending→approved as `forward` (historic states, not new parking).

### Missing Tests

- No compile-time/runtime assertion that `'archive.publication'` is not assignable to `CheckId` beyond string-not-in-list.
- Direct `buildAxis` splice vs tail-append still only covered via `classifyAlong` (prior gap; not leftover-axis).

### Spec Dependency Chain

Consistent with `core:change` (no pending enter from ready/done) and `core:workflow-model` (no `Change.effectiveStatus()`).

### Counts

| Metric                            | Count |
| --------------------------------- | ----- |
| pass (leftover-axis requirements) | 4     |
| fail (discrepancies)              | 0     |
| gaps (missing tests)              | 2     |
| critical                          | 0     |
| major                             | 0     |
| minor                             | 0     |
| LOW                               | 0     |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary (leftover-relevant)

Project from caller `CheckResult`s; no snapshot bag; no `check.run` fallback; `_resolveTarget` identity; nextAction must not recommend pending hops for new work; DAG-only consumers pass empty `checksByTarget`.

### Implementation Status

| Area                     | Status      | Evidence                                                                                                                                              |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| No bag / no run fallback | Implemented | `evaluate` uses `options.checksByTarget` (`lifecycle-engine.ts` 129–154). Missing injected target → skip from `availableTransitions`, no `check.run`. |
| Identity resolve         | Implemented | `_resolveTarget` returns `requestedTarget`.                                                                                                           |
| nextAction new work      | Implemented | `ready` + missing spec approval → `specd changes approve spec` (not pending hop). Drain copy remains when `state === 'pending-spec-approval'`.        |
| DAG helper               | Implemented | `projectArtifacts` / `_effectiveStatus` on the engine, not `Change`.                                                                                  |

### Discrepancies

None that restore a pending hop or snapshot bag.

`_isStepPermitted` pending keys: drain/empty-injection fallback. Spec allows drain. Not counted as fail.

### Test Coverage

Engine specs cover extras vs protocol, incomplete tasks, dual-write INCOMPLETE vs MISSING. Drain nextAction is implicit via status integration.

### Missing Tests

- Engine unit that `evaluate` options type has no `snapshots` field.
- `_isStepPermitted` documented as drain-only.

### Spec Dependency Chain

Consistent with `core:transition-checks` and `core:change`. Merged `core:schema-format` (preview, out of batch) now names engine DAG, not `Change.effectiveStatus()`.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 4     |
| fail     | 0     |
| gaps     | 2     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:get-status`

### Requirements Summary (leftover-relevant)

Execute matching predicates then project; MUST NOT gather a global snapshot bag; drafts use `projectArtifacts` / empty hop checks, not hop `evaluate`.

### Implementation Status

| Area   | Status      | Evidence                                                                                                                                                              |
| ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No bag | Implemented | `executeChecksByLegalTargets` + `projectArtifacts` map (`get-status.ts` 443–455). No `CountTasks` on the use case. Task paint from `workflow.taskCompletion` details. |
| Drafts | Implemented | `_buildDraftedResult` uses `projectArtifacts` only; `checksByTarget: {}`; empty `availableTransitions` / `availableSteps` (`593–657`).                                |

### Discrepancies

None.

### Test Coverage

GetStatus tests cascade `effectiveStatus`; domain module tests bag absence. Spec verify “does not pass a global snapshot bag” is behavioural (no bag argument exists).

### Missing Tests

- GetStatus test named “no PredicateSnapshots argument” (vacuous).
- Draft path spy that `executeChecksByLegalTargets` is not called.

### Spec Dependency Chain

Consistent with lifecycle-engine + transition-checks.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 2     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:transition-change`

### Requirements Summary (leftover-relevant)

No pending rewrite; persist requested target; MUST NOT take `RunStepHooks` / `CountTasks` as use-case ports; hook `execute` calls `RunStepHooks`; no snapshot bag.

### Implementation Status

| Area        | Status      | Evidence                                                                                                                                             |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constructor | Implemented | Ports: changes, actor, schema, refresh, approvals, lifecycle, `transitionBindings` (`transition-change.ts` 129–137). `TransitionChangeDeps` matches. |
| No rewrite  | Implemented | Input JSDoc + execute uses `requestedTarget`. Tests stay in ready/done.                                                                              |
| Drain       | Implemented | `_assertDrainAndGateTargets`; tests drain pending→approved.                                                                                          |
| Effects     | Implemented | `matchingEffects` + `executeCheckWithProgress`; no `check.id === 'hook.*'` launch.                                                                   |

### Discrepancies

None in production.

Merged verify still expects `RunStepHooks.execute` with `{ step, phase }` — still true via `HookEffectCheck`, not the use case.

### Test Coverage

Stay-in-ready/done; drain; factory without RunStepHooks on the use case (verify delta).

### Missing Tests

None leftover-critical.

### Spec Dependency Chain

Consistent with `core:change` VALID_TRANSITIONS and `core:hook-execution-model` (no id switch).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 4     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:workflow-model`

### Requirements Summary (leftover-relevant)

`workflow[]` extras lookup; taskCompletion check; step availability from engine CheckResults + `projectArtifacts` — never `change.effectiveStatus()`.

### Implementation Status

| Area                         | Status      | Evidence                                                                                           |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| No Change.effectiveStatus    | Implemented | Constraint line in merged spec (~110). Code: engine only.                                          |
| effectiveStatus as DAG field | Implemented | `workflow.requires` / task checks consume `ctx.effectiveStatusByArtifact` from `projectArtifacts`. |

### Discrepancies

None vs merged preview.

### Test Coverage

Engine/GetStatus cascade. No `Change` method-absence test.

### Missing Tests

Lock that `Change` has no `effectiveStatus` (would freeze schema-format/storage workspace leftovers as wrong).

### Spec Dependency Chain

Merged preview **consistent** with engine. Workspace `specs/core/schema-format/spec.md` still says “used to compute `Change.effectiveStatus()`” until archive (delta already rewrites this in spec-preview). `specs/core/storage/spec.md` still requires `Change.effectiveStatus(type)` and is **not** in this change — cross-spec leftover (see batch summary).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:change`

### Requirements Summary (leftover-relevant)

Pending states remain drain-only; new transitions MUST NOT enter pending from ready/done; stay-in-ready/done for approvals.

### Implementation Status

| Area              | Status      | Evidence                                         |
| ----------------- | ----------- | ------------------------------------------------ |
| VALID_TRANSITIONS | Implemented | `change-state.ts` 30–40 as specified.            |
| Entity API        | Implemented | No `effectiveStatus` method. State from history. |

### Discrepancies

None.

### Test Coverage

`change-state.spec.ts`: `ready` → `pending-spec-approval` false; `done` → `pending-signoff` false; drain edges true.

### Missing Tests

None leftover-critical.

### Spec Dependency Chain

Consistent with transition-checks / config.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:hook-execution-model`

### Requirements Summary (leftover-relevant)

Use cases select effects by matcher + `phase`; `RunStepHooks` is a dep of hook checks, not launched by check id; archive pre abort / post collect; skip selectors because transition pre/post share `before-persist`.

### Implementation Status

| Area       | Status      | Evidence                                                                            |
| ---------- | ----------- | ----------------------------------------------------------------------------------- |
| Transition | Implemented | `TransitionChange` matchingEffects `before-persist` only.                           |
| Archive    | Implemented | `ArchiveChange` before-persist then after-persist; no RunStepHooks ctor.            |
| Skip       | Implemented | `hook-effect.ts` selectors `all` / `target.pre` / `source.post` / archive pre/post. |

### Discrepancies

**1. Archive flow diagram still says ArchiveChange runs hooks “via RunStepHooks” (spec-stale, minor)**

- **Merged spec:** numbered “Deterministic step (archiving)” still lists `a. runs pre-archive run: hooks (fail-fast) via RunStepHooks` and `d. ... via RunStepHooks`. Later requirement: hook `execute` SHALL call `RunStepHooks`; use cases MUST NOT launch by check id.
- **Code:** ArchiveChange iterates bindings and `check.execute`. `RunStepHooks` is inside `HookEffectCheck`.
- **Interpretation A (later requirement + code right):** diagram leftover; should say “via matching `hook.pre` / `hook.post` execute”. **Interpretation B (diagram right):** ArchiveChange should take/call `RunStepHooks` again — contradicts this change’s locked product and the later requirement.
- **Severity:** minor (spec-internal). Not an implementation bug.

### Test Coverage

Archive/transition hook spies on `RunStepHooks.execute` through bindings. Constructor unused-field test on ArchiveChange.

### Missing Tests

None beyond archive-change verify “constructor does not accept RunStepHooks” (out of batch; code already matches).

### Spec Dependency Chain

Later hook-execution requirements consistent with archive-change delta. Numbered flow is the leftover.

### Counts

| Metric               | Count                         |
| -------------------- | ----------------------------- |
| pass                 | 3                             |
| fail (discrepancies) | 1 (minor, spec-wrong diagram) |
| gaps                 | 0                             |
| critical             | 0                             |
| major                | 0                             |
| minor                | 1                             |
| LOW                  | 0                             |

---

## Spec: `core:approve-spec`

### Requirements Summary (leftover-relevant)

Happy path stays in `ready`; MUST NOT transition into pending/spec-approved; drain from `pending-spec-approval` allowed.

### Implementation Status

| Area          | Status      | Evidence                                                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Stay in ready | Implemented | `recordSpecApproval` without `transition` unless already pending (`approve-spec.ts` 91–98). |
| Drain         | Implemented | `freshChange.state === 'pending-spec-approval'` → `transition('spec-approved')`.            |

### Discrepancies

None. Drain is specified, not a leftover hop.

### Test Coverage

Approve-spec drain + not-in-ready tests.

### Missing Tests

None leftover-critical.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:approve-signoff`

Same pattern as approve-spec for `done` / `pending-signoff` (`approve-signoff.ts` 91–98).

### Discrepancies

None.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:config`

### Requirements Summary (leftover-relevant)

`approvals.spec` / `approvals.signoff`: stay in ready/done; new work MUST NOT enter pending via `change transition`.

### Implementation Status

Gates baked at use-case construction from `SpecdConfig.approvals`. Behaviour enforced in checks + TransitionChange, not by rewriting config.

### Discrepancies

None.

### Test Coverage

Config verify scenario “Spec gate on does not require pending-spec-approval in the graph” (merged). Domain VALID_TRANSITIONS tests.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 1     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:validate-artifacts`

### Requirements Summary (leftover-relevant)

DAG answers from `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates; `gatherPredicateSnapshots` MUST NOT exist.

### Implementation Status

| Area         | Status      | Evidence                                   |
| ------------ | ----------- | ------------------------------------------ |
| Empty checks | Implemented | `validate-artifacts.ts` 224–226.           |
| No gather    | Implemented | No gather module anywhere under packages/. |

### Discrepancies

None on leftover axis. (Same-execute refresh of lifecycle after `markComplete` is a different requirement; not re-audited here.)

### Test Coverage

Verify “`gatherPredicateSnapshots` is not called”.

### Missing Tests

Spy that `executeChecksByLegalTargets` is not imported/called.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:get-artifact-instruction`

### Requirements Summary (leftover-relevant)

`evaluate` with empty `checksByTarget` (`nextArtifact` / `projectArtifacts`); no hop predicates; no snapshot bag.

### Implementation Status

`get-artifact-instruction.ts` 103–106: `evaluate(change, schema, { checksByTarget: {} })`.

### Discrepancies

None.

### Test Coverage

Verify “does not gather a global snapshot bag”.

### Missing Tests

Spy vs hop execute path (same as validate).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 1     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Adjacent (not assigned, inspected for leftovers)

### `ArchiveChange` constructor / composition

Production: bindings required; no `RunStepHooks` param; no ctor fallback `defaultArchiveBindings`. **Closed.**

Test helper `newArchiveChange` (`helpers.ts` 939–971) still takes `runStepHooks` as the **4th positional** and maps it onto `makeArchiveBindings` → `createHook*`. Comment documents the mapping. This is harness leftover, not the use-case ABI. **LOW / not a product fail.**

### `core:schema-format` (in the change, not this batch)

spec-preview: artifact `requires` feeds `LifecycleEngine.projectArtifacts`; “there is no `Change.effectiveStatus()` method”; verify scenario asserts no such method.

Workspace `specs/core/schema-format/spec.md` line 77 still has the old “used to compute `Change.effectiveStatus()`” until archive. **Expected overlay**, not a merged-spec fail.

### `core:storage` (not in this change)

`specs/core/storage/spec.md` still requires `Change.effectiveStatus(type)` cascade and verify still calls `Change.effectiveStatus('a')`. Code + this change’s engine-as-sole-authority contradict that.

- **Interpretation A:** storage spec leftover; should cite `LifecycleEngine.projectArtifacts`.
- **Interpretation B:** Change should own DAG status — would undo this change.

**Minor, spec-wrong, out of assigned list.** Same product-axis leftover, different spec.

---

## Batch summary

| Metric                                        | Count                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Assigned specs audited                        | 12                                                                                                       |
| Product leftover bugs still in production     | **0**                                                                                                    |
| fail (discrepancies in assigned merged specs) | **1** (hook-execution archive flow diagram)                                                              |
| critical                                      | 0                                                                                                        |
| major                                         | 0                                                                                                        |
| minor                                         | 1 (spec-stale diagram)                                                                                   |
| LOW                                           | 1 (test helper still takes `RunStepHooks` to build bindings)                                             |
| gaps                                          | 9 (mostly naming/absence tests)                                                                          |
| Out-of-batch leftover                         | workspace `core:storage` (+ unarchived `schema-format` file text) still names `Change.effectiveStatus()` |

**Do not recycle as open product bugs:** snapshot bag; `archive.publication` CheckId; new-work pending hops; `RunStepHooks` on `ArchiveChange` ctor/deps/field; `Change.effectiveStatus()` method.

**Still true / allowed:** drain pending states; engine nextAction for those states; publication preflight inside ArchiveChange; `RunStepHooks` on `createHookPre` / `createHookPost` and standalone CLI.

---

# Partial: CLI + skills + global (recorte leftover)

**Mode:** change `workflow-transition-checks`  
**Batch:** `cli:change-status` (leftover vs recorte: skills + `review: required: yes`), `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`, `default:_global/architecture`, `default:_global/conventions`  
**Preview:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <id> --format toon`  
**Globals:** `specd specs show` (not in change specIds)  
**Code:** 2026-08-27 worktree; graph search used (`review.required`); no production edits.

## Severity counts

| Severity | Count |
| -------- | ----: |
| critical |     0 |
| high     |     0 |
| medium   |     1 |
| low      |     3 |
| info     |     2 |

**Headline recorte flags**

- Skills templates **do not** still expect an **omitted** `review:` header. They look for `review: required: yes`, which **matches** restored text status (`status.ts` ~247–252).
- **Product `docs/`** do not contradict the restored header (no hits).
- **Stale change artifacts** still describe the _previous_ omit-header recorte: `tasks.md` 13.3 / 14.1 / 14.3, and prior compliance reports under `reports/20260827-104343/` (and earlier). Task **23.1** is the restored-header source of truth.
- `specd-design` still treats **files listed under `review:`** as the review scope — that expects the **omitted file-list** behaviour, not an omitted header.

---

## Requirements Summary

### `cli:change-status` (merged leftover vs recorte)

| ID      | Requirement                                                                                                                                   | Recorte-relevant?         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| CS-1    | Command signature                                                                                                                             | no                        |
| CS-2    | Drafted status read-only                                                                                                                      | no                        |
| CS-3    | JSON/TOON `hasTasks` + display-state `artifactDag.state`                                                                                      | no                        |
| CS-4    | DAG `[hasTasks - N/M done]`                                                                                                                   | no                        |
| CS-5    | Display-state rendering                                                                                                                       | no                        |
| CS-6    | Lifecycle projections from GetStatus checks; no local `VALID_TRANSITIONS` filter                                                              | yes                       |
| CS-7    | Text `review:` header (`required` / `route` / `reason`); **no** `affectedArtifacts` paths; overlap peers still print; JSON/TOON full `review` | **yes — restored header** |
| CS-8    | Text blockers `! CODE — label: message`                                                                                                       | yes                       |
| CS-9–16 | Schema warning, not found, DAG fields, refresh, implementation, details tasks, basic info, specDependsOn                                      | leftover                  |

**Verify leftover:** base scenario “shows review section … **affected absolute file paths**” is **gone** in merged `verify.md`. Replaced by “does not reprint files under `review:`” + overlap peers **with** header.

### `cli:change-transition` (merged)

Command signature; `--next` map including `signed-off → archivable`; no CLI pending rewrite; GetStatus refresh `false`; check-progress bus (no `hook-progress` stream); Repair Guide **stderr** with gerund labels; `HookFailedError` exit 2 no guide; incomplete tasks; unsatisfied requires; no `Executing:`.

### `cli:change-approve` (merged)

Signatures; no gate flags / hashes; **in-place** spec from `ready` / drain `pending-spec-approval`; signoff from `done` / drain `pending-signoff`; stay in `ready`/`done`; help uses bound-`from`; success `approved <gate> for <name>`; errors.

### `cli:change-archive` (merged)

Signature + alias; `archivable` prerequisite; `ArchiveChange` delegate; `--skip-hooks` phases; **check progress** gerund / no `Executing:`; hooks on same bus; post-hook exit 2; text archive path + overlap invalidation; JSON/TOON **stream** `change-archive` terminal `complete` (no second unwrapped object).

### `skills:skill-templates-source` (merged)

Unchanged template/source/frontmatter/graph/optimizer/command-role reqs **plus**:

- In-place approval gates (no happy-path pending hops)
- Implementation tracking in verify/implement + shared cookbook
- Archive `--skip-hooks pre` not `all`

**Not in this spec:** text `review:` header contract. Skills that parse `review: required: yes` are leftover vs recorte, not a delta requirement.

### `default:_global/architecture` + `conventions` (canonical)

Hexagonal layers; composition-only infra imports; `createX(deps)` + config form via resolver; adapters have no domain logic; manual DI; kebab-case; named exports; no `any`; explicit public return types; `SpecdError`.

**Recorte consistency:** `ArchiveChange` ctor takes `archiveBindings` (not `RunStepHooks`); CLI only **renders** check events / GetStatus fields.

---

## Implementation Status

| Surface                            | Status                                                                                                    | Evidence                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text `review:` header              | **Compliant with CS-7**                                                                                   | `packages/cli/src/commands/change/status.ts` 247–252: `review:` + `required: yes/no` + `route` + `reason`. No `affectedArtifacts` paths.                                                                                                                                                               |
| Overlap peers                      | **Compliant**                                                                                             | Same file 325–336: `overlap:` when `reason === 'spec-overlap-conflict'`. Tests: `change-status.spec.ts` 678–684, `change/change-status.spec.ts` 443–446.                                                                                                                                               |
| JSON/TOON `review`                 | **Compliant**                                                                                             | `status.ts` 445–458 includes `overlapDetail` + `affectedArtifacts`. Commander help schema 116–124 **omits** `overlapDetail` (docs drift, low).                                                                                                                                                         |
| Blocker labels                     | **Compliant**                                                                                             | `status.ts` 237–241; transition Repair Guide `transition.ts` 88–95.                                                                                                                                                                                                                                    |
| Check presenter                    | **Compliant**                                                                                             | `_check-progress-presenter.ts` 95–107: `<label> (<id>)` then `✓`/`✗`; no `Executing:`. Shared by `transition.ts` / `archive.ts`. Tests assert `not.toContain('Executing:')`.                                                                                                                           |
| `--next` / no pending rewrite      | **Compliant**                                                                                             | `transition.ts` 160–176 includes `signed-off → archivable`; 177–185 drain errors. Tests: `change-transition.spec.ts` no pending rewrite.                                                                                                                                                               |
| Approve help + execute             | **Compliant**                                                                                             | `approve.ts` 21–23, 59–60 bound-`from` language; `{ name, reason }` only. Tests: `change-approve.spec.ts` ready / drain.                                                                                                                                                                               |
| Archive stream + DI                | **Compliant**                                                                                             | CLI `archive.ts` uses presenter stream `change-archive`. `createArchiveChange(deps)` injects `archiveBindings` (`composition/use-cases/archive-change.ts` 150–200). `ArchiveChange` ctor 218–243. Composition imports `FsArchiveBatchSnapshot` / `FsSpecRepository` — **allowed** (composition layer). |
| Skills `review: required: yes`     | **Aligned with restored header**                                                                          | `specd`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive` templates. `specd-new` uses structured `review.required` (JSON).                                                                                                                                                           |
| Skills file-list under `review:`   | **Gap**                                                                                                   | `specd-design/SKILL.md.tpl` 50, 178.                                                                                                                                                                                                                                                                   |
| In-place approval / skip-hooks pre | **Not re-audited line-by-line**; prior batch + templates grep show archive/verify/implement copy present. |

---

## Discrepancies

### D1 — medium — `skills:skill-templates-source` leftover vs CS-7 (file lists, not header)

**Spec (CS-7):** print `review:` with `required` / `route` / `reason`; **MUST NOT** print `review.affectedArtifacts` paths; files live under `artifacts (details):`.

**Code:** matches CS-7.

**Template:** `packages/skills/templates/skills/specd-design/SKILL.md.tpl`:

- L50: “Treat the artifacts listed under `review:` as the first review scope”
- L178: “use the reason and **affected artifacts**” after `review: required: yes`

Those lines still assume a **file dump under `review:`** (the duplication recorte removed). Header string `review: required: yes` is **correct**.

**Possibilities:** template stale (likely); spec should tell agents to use `artifacts (details):` + `reason` / JSON `affectedArtifacts`.

### D2 — low — `cli:change-status` examples vs Basic info

Merged `spec.md` Examples still show a `specs:` line. Requirement “Basic info … SHALL NOT include a standalone `specs:` list”. Pre-existing leftover, not recorte.

### D3 — low — Commander JSON schema omits `overlapDetail`

`status.ts` help `review:` block lists `affectedArtifacts` but not `overlapDetail`. Runtime JSON emits `overlapDetail`. Spec: JSON/TOON MUST serialize full `review`. Help-only drift.

### D4 — low — `tasks.md` 13.x / 14.x contradict task 23.1

Completed tasks 13.3 / 14.1 / 14.3 say skip `review:` header / “no legacy `review:` header”. Task **23.1** restores the header. Living task log disagrees with itself; 23.1 + merged spec win.

### D5 — info — Prior compliance reports contradict restored header

`reports/20260827-104343/_partial-cli-skills.md` (and compiled report) D1: “Text status omits `review:`; skills still branch on `review: required: yes`.” That finding is **obsolete**. Skills+header are now aligned. Do not copy D1 forward.

### D6 — info — Skills do **not** expect omitted header

All workflow skills that key off text status still look for `review: required: yes`. That is **not** an omitted-header expectation. **Do not** flag as template-vs-omit-header.

No architecture/conventions contradiction found for ArchiveChange DI or CLI text rendering (presenter is adapter-only; bindings injected at composition).

---

## Test Coverage

| Requirement                            | Tests                                                                                   | Adequate?                      |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| CS-7 header + no paths                 | `change/change-status.spec.ts` artifact-review / drift; `change-status.spec.ts` overlap | yes                            |
| CS-8 labels                            | implied via status/transition tests                                                     | yes (spot)                     |
| CS-6 no local verifying                | change-status / transition tests                                                        | yes                            |
| Transition check bus / no Executing    | `change-transition.spec.ts`                                                             | yes                            |
| Repair guide stderr                    | transition tests (per merged verify)                                                    | yes                            |
| Approve ready / drain                  | `change-approve.spec.ts`, `change/change-approve.spec.ts`                               | yes                            |
| Archive gerund / stream                | `change-archive.spec.ts`                                                                | yes                            |
| Skills `review: required: yes`         | **no** template contract asserting header vs details                                    | gap vs D1                      |
| Skills in-place gates / skip-hooks pre | `skill-templates-source` verify scenarios; tests if present in skills package           | assumed from delta; not re-run |

---

## Missing Tests

- Template contract: `specd-design` MUST NOT say artifacts are **listed under `review:`**; MAY key on `review: required: yes` + `reason` + details/JSON.
- Optional: Commander help `review` schema includes `overlapDetail`.
- Optional: text example in `cli:change-status` spec.md drops `specs:`.

---

## Spec Dependency Chain

- `cli:change-status` → `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`
- `cli:change-transition` → entrypoint, change, `core:transition-change`, hook-execution-model, get-status, transition-checks
- `cli:change-approve` → entrypoint, change, transition-checks
- `cli:change-archive` → entrypoint, change, `core:archive-change`, hook-execution-model, command-resource-naming, transition-checks
- `skills:skill-templates-source` → skill, spec-optimizations, workflow-automation, transition-checks
- Architecture / conventions: no deps; constrain ArchiveChange composition + CLI adapter rendering

**Consistency:** merged CLI/skills deltas agree on in-place gates and check bus. CS-7 restored header **agrees** with skills’ `review: required: yes` probe. Only design-skill **file listing under `review:`** disagrees. Architecture: `createArchiveChange` deps path + `archiveBindings` matches “manual DI / composition wiring”; CLI does not construct `ArchiveChange`.

---

## Per-spec summary counts

| Spec                                 |                    Reqs checked |                    Compliant | Discrepancy |                                                                Spec-only leftover |        Missing tests |
| ------------------------------------ | ------------------------------: | ---------------------------: | ----------: | --------------------------------------------------------------------------------: | -------------------: |
| cli:change-status (recorte leftover) |                              16 |                           14 |  2 (D2, D3) |                                                    examples `specs:`; help schema |           1 optional |
| cli:change-transition                |                             ~15 |                          ~15 |           0 |                                                                                 — |                    — |
| cli:change-approve                   |                               8 |                            8 |           0 |                                                                                 — |                    — |
| cli:change-archive                   |                             ~10 |                          ~10 |           0 |                                                                                 — |                    — |
| skills:skill-templates-source        | recorte + leftover review probe | in-place/skip-pre assumed OK |      1 (D1) |                                                          header probe **aligned** | 1 (design file-list) |
| default:\_global/architecture        |                      recorte DI |                            1 |           0 |                                                                                 — |                    — |
| default:\_global/conventions         |             CLI kebab presenter |                            1 |           0 | `_check-progress-presenter.ts` underscore prefix is package-private, pre-existing |                    — |

**Batch totals:** critical 0, high 0, medium 1 (D1), low 3 (D2–D4), info 2 (D5–D6).
