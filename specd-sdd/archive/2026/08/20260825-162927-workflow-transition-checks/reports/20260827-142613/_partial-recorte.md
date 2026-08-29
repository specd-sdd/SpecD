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
