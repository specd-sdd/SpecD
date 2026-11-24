# Spec-compliance audit — CLI batch (`workflow-transition-checks`)

- **Change:** `workflow-transition-checks` (state: verifying)
- **Specs:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive` (merged via `changes spec-preview`)
- **Focus (recorte 26):** `--next` → `to: 'next'` (no CLI `HAPPY_PATH` table); text `review.message` + overlap peers; no `OVERLAP_CONFLICT` on invalidation; tests at `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts`; archive `--allow-out-of-scope`
- **Code:** `packages/cli/src/commands/change/{status,transition,archive,approve}.ts`
- **Graph:** treated as possibly stale; navigation used CLI sources/tests + spec-preview (not graph-only)
- **Read-only:** no source or spec edits

---

## Requirements Summary

### Recorte 26 (binding for this batch)

| ID    | Requirement                                                                                                                                                                                                                                           | Spec                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R26-1 | `--next` calls `TransitionChange.execute` with `to: 'next'`. CLI MUST NOT keep a from→to table and MUST NOT use `GetStatus.nextAction` as that resolution. Core owns `HAPPY_PATH_NEXT`.                                                               | `cli:change-transition` Next-transition resolution                 |
| R26-2 | Text status: `review:` header with `required` / `route` / `reason` / human `message` when Core supplies it. MUST NOT print `affectedArtifacts` paths under `review:`.                                                                                 | `cli:change-status` Text status omits duplicated review file lists |
| R26-3 | Invalidation overlap: print overlap peers (`overlapDetail`); MUST NOT show `OVERLAP_CONFLICT` as a blocker line for that invalidation path. JSON/TOON still serialize full `review` including `overlapDetail`. `--help` schema lists `overlapDetail`. | same + overlap verify scenario                                     |
| R26-4 | CLI tests live at `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts` mirroring `src/commands/change/*.ts` (`default:_global/testing`).                                                                                   | global testing + recorte 26                                        |
| R26-5 | `specd changes archive` / `change archive` signature lists `--allow-out-of-scope` and forwards it for `impl.linksInScope`.                                                                                                                            | `cli:change-archive` Command signature                             |

### `cli:change-status` (16 requirements)

1. Command signature (`status <name> [--format]`)
2. Drafted change status is read-only (`isDrafted`, no mutating transitions)
3. Output format (`hasTasks` on DAG; drift-aware `state`)
4. Task completion display in DAG (`[hasTasks - N/M done]` / fallback)
5. Display-state rendering (`complete-with-drift` vs canonical)
6. Lifecycle projections come from GetStatus checks (no local `VALID_TRANSITIONS` filter)
7. Text status omits duplicated review file lists (R26-2/3)
8. Text blockers include check labels (`! CODE — label: message`)
9. Schema version warning (stderr, exit 0; skip if `schemaInfo` null)
10. Change not found (exit 1, `error:`)
11. Schema-derived fields (`schema.artifactDag`, `childrenOf`, no duplicate convergent nodes)
12. Delegates refresh policy to GetStatus (no direct refresh/detector)
13. Implementation section (`--implementation` via SDK projection)
14. Task completion in details (`tasks: N/M`)
15. Basic info (name/state; no standalone `specs:` list)
16. Specs and dependencies (`specDependsOn`)

### `cli:change-transition` (14 requirements)

1. Command signature (`<step>` xor `--next`, `--skip-hooks`, `--format`)
2. Next-transition resolution (R26-1; Core reject → exit 1 + `error:`)
3. Delegates refresh to TransitionChange (`GetStatus` with `refreshImplementationTracking: false`)
4. Approval-gate routing (no gate flags; no rewrite to pending states)
5. Hook execution (`skipHookPhases` mapping)
6. Progress output (generic check bus; `stream: "change-transition"`; no `hook-progress`)
7. Transition hook observability
8. Shared hook progress presentation (distinct stream from `run-hooks`)
9. Output on success (text confirm; JSON/TOON terminal `complete`)
10. Post-hook failure (exit 2, `error:`, not a post-transition warning)
11. Invalid transition error (Repair Guide on stderr; JSON failure `complete` record)
12. Incomplete tasks error (exit 1, artifact named)
13. Check progress rendering (gerund labels, no `Executing:`)
14. Unsatisfied requires error

### `cli:change-approve` (7 requirements)

1. Command signatures (`spec` / `signoff`, `--reason` required)
2. Delegates gate state to kernel (`kernel.changes.approve*`, no gate flags)
3. Artifact hash computation (CLI MUST NOT compute/pass hashes)
4. Approve spec behaviour (stay in `ready`; drain `pending-spec-approval`; bound-from help)
5. Approve signoff behaviour (stay in `done`; drain `pending-signoff`)
6. Output on success (text / JSON `{ result, gate, name }`)
7. Error cases (missing reason, wrong state, not found)

### `cli:change-archive` (10 requirements)

1. Command signature (`changes archive` canonical, `change` alias; `--skip-hooks`, `--allow-overlap`, `--allow-out-of-scope`)
2. Prerequisites (`archivable` or exit 1 naming current state)
3. Behaviour (delegate `ArchiveChange`)
4. Hook execution (archive phase selectors)
5. Check progress rendering (same generic bus)
6. Post-archive hooks (exit 2 on post failures)
7. Output on success (path; omit empty invalidation section)
8. Output on success (extended) (`--allow-overlap` invalidation list)
9. JSON output on success (`stream: "change-archive"` complete; no extra unwrapped object)
10. Error cases (not found, not archivable, merge failure)

**Totals:** 47 requirements (16 + 14 + 7 + 10) plus 5 recorte-26 focus items (overlapping the tables above).

---

## Implementation Status

| Req                                         | Status                                            | Evidence                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R26-1 `--next` → `'next'`                   | **Compliant**                                     | `transition.ts`: `requestedTarget = opts.next === true ? 'next' : step`. `execute({ name, to: requestedTarget, skipHookPhases })`. No `HAPPY_PATH`, `resolveNextTarget`, or from→to switch in CLI. Tests assert `to: 'next'` for drafting/ready/signed-off and for Core `HappyPathNextUnavailableError` paths. |
| R26-2 `review.message`                      | **Compliant**                                     | `status.ts` prints `message:` when non-empty. Header always prints `required` / `route` / `reason`. No `affectedArtifacts` paths under `review:`.                                                                                                                                                              |
| R26-3 overlap / no `OVERLAP_CONFLICT`       | **Compliant**                                     | Overlap peers rendered from `review.overlapDetail` only when `reason === 'spec-overlap-conflict'`. CLI does not synthesize `OVERLAP_CONFLICT` blockers. JSON includes `review.overlapDetail` and `message`. `--help` schema lists `overlapDetail` next to `affectedArtifacts`.                                 |
| R26-4 test path mirror                      | **Partial**                                       | Dedicated files exist and cover recorte-26 behaviour. Leftover `packages/cli/test/commands/change.spec.ts` still hosts `describe('change status')` and `describe('change transition')` (including the artifact-drift omit-paths scenario). That violates one-file-per-src mirroring.                           |
| R26-5 `--allow-out-of-scope`                | **Compliant (code)** / **Partial (verify+tests)** | Option registered and forwarded as `allowOutOfScope: true` on `ArchiveChange.execute`. Help copy differs from spec (see D2). No CLI test; archive `verify.md` delta never added a scenario.                                                                                                                    |
| Status: drafted read-only                   | **Compliant**                                     | Draft branch: `(drafted)` header, `transitions: (none — change is drafted)`, JSON `isDrafted: true`.                                                                                                                                                                                                           |
| Status: projections from GetStatus          | **Compliant**                                     | Renders `lifecycle.availableTransitions` and `nextAction` as returned. No second `VALID_TRANSITIONS` filter.                                                                                                                                                                                                   |
| Status: blockers with labels                | **Compliant**                                     | `! ${code} — ${label}: ${message}` when `label` present. JSON maps `label` / `checkId` / `bypassFlag`.                                                                                                                                                                                                         |
| Status: refresh policy                      | **Compliant**                                     | Single `kernel.changes.status.execute({ name })`. Tests assert `refreshImplementationTracking.execute` not called.                                                                                                                                                                                             |
| Status: DAG / display / tasks / deps        | **Compliant**                                     | `renderDag` uses `displayStatus`, `childrenOf`, visited-set (no duplicate nodes), task tags. Details `tasks: N/M`. Specs section present; no standalone `specs:` line.                                                                                                                                         |
| Status: `getActiveSchema`                   | **Tension**                                       | DAG requirement needs `schema.artifactDag()`. Constraints forbid “another use case to recompute **lifecycle** data”. Call is for DAG shape, not availability. See D4.                                                                                                                                          |
| Transition: skip-hooks / progress / repair  | **Compliant**                                     | Check presenter `streamName: 'change-transition'`. Repair Guide on stderr from GetStatus. `HookFailedError` not in `isRepairGuideError` → exit 2 via `handleError`. Pre/post GetStatus uses `refreshImplementationTracking: false`.                                                                            |
| Transition: approval rewrite                | **Compliant**                                     | Passes user `to` / `'next'` unchanged. No pending-state rewrite.                                                                                                                                                                                                                                               |
| Transition: JSON failure stream             | **Partial**                                       | Repair-guide errors emit structured `complete` + `result: "failure"`. `HappyPathNextUnavailableError` is not a repair-guide error; JSON `--next` failure likely goes through `handleError` (not asserted).                                                                                                     |
| Approve: kernel routing / output            | **Compliant**                                     | `kernel.changes.approveSpec/Signoff.execute({ name, reason })`. Help uses bound-from language (`ready` / `done` + drain). Text/JSON success shapes match.                                                                                                                                                      |
| Archive: hooks / JSON stream / invalidation | **Compliant**                                     | Check bus `change-archive`. Text path + optional invalidated section. JSON single terminal `complete` record. Post-hook failures exit 2 before success print. `SpecOverlapError` custom stderr + `--allow-overlap` hint.                                                                                       |
| Archive: `changes` vs `change`              | **Compliant**                                     | `program.command('changes').alias('change')` then `registerChangeArchive`.                                                                                                                                                                                                                                     |

---

## Discrepancies

Neither spec nor code is automatically truth. Each item presents both readings.

### D1 — Medium — Recorte 26 test layout incomplete

**Spec (`default:_global/testing` + recorte 26):** tests live under `test/` mirroring `src/`. Recorte 26 names `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts`.

**Code:** those four files exist and are the primary recorte-26 coverage. `packages/cli/test/commands/change.spec.ts` still imports `registerChangeStatus` / `registerChangeTransition` and keeps overlapping suites (JSON schema object, not-found, **artifact-drift text omit paths**, JSON `affectedArtifacts`, missing-step, invalid transition).

- **If spec is truth:** finish the split; move remaining status/transition cases into the mirrored files (or drop duplicates). Artifact-drift coverage currently lives only in the leftover file.
- **If code is truth:** recorte 26 is “at least these files exist”; leftover file is historical. Global testing still prefers one mirror file per source.

### D2 — Low — Archive `--allow-out-of-scope` help vs spec; verify gap

**Spec:** “permits archiving when implementation links resolve outside the change scope (`impl.linksInScope`)”.

**Code (`archive.ts` option description):** “allow archive-time implementation sidecar updates outside the current change scope”.

Forwarding `allowOutOfScope: true` matches Core skippable `impl.linksInScope`. Help implies sidecar mutation more than the predicate skip.

- **If spec is truth:** align Commander help (and any skill copy) to `impl.linksInScope`.
- **If code is truth:** spec/help should mention sidecar updates if that is the user-visible effect of the bypass.

**Also:** `cli:change-archive` **spec.md** lists the flag; **verify.md** (change delta) does not add a WHEN/THEN for it. Spec/verify drift inside the change.

### D3 — Low — Spec-gate / signoff-gate verify scenarios vs CLI unit tests

**Verify (`cli:change-transition`):** `transition … implementing` with spec gate on → exit 1, stay in `ready`; signoff analog for `archivable`.

**CLI tests:** mock `transition.execute` **success** and assert the CLI requested `implementing` / `archivable` / `to: 'next'` without pending names. Stay-in-state is Core, not CLI.

- **If spec is truth:** CLI-only tests cannot satisfy “exits with code 1”; need a kernel mock rejection (or integration). The **no pending rewrite** half is covered.
- **If code is truth:** those scenarios belong on `core:transition-change`; CLI spec should say “CLI must not rewrite targets; Core returns stay-in-state”.

### D4 — Low — `getActiveSchema` vs “no other use case for lifecycle”

**Constraint:** CLI MUST NOT call SchemaRegistry / config show / another use case to **recompute lifecycle data**.

**DAG requirement:** use resolved `Schema.artifactDag()`.

**Code:** `kernel.specs.getActiveSchema.execute()` to pick cached DAG vs `ArtifactDag.from(schemaInfo.artifacts)`.

Lifecycle lists still come from GetStatus. Ambiguous whether `getActiveSchema` is forbidden.

- **If spec is truth (strict):** pass DAG only from `lifecycle.schemaInfo` / GetStatus.
- **If DAG paragraph is truth:** the call is required for `childrenOf` parity.

### D5 — Low — JSON `--next` rejection stream

**Spec (Invalid transition):** JSON/TOON failures emit `stream: "change-transition"` `complete` with `result: "failure"`, `blockers`, `nextAction`.

**Code:** that path is only `isRepairGuideError` (`InvalidStateTransitionError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`). `HappyPathNextUnavailableError` falls through to `handleError`.

- **If spec is truth for all failures:** `--next` JSON should be a stream complete record.
- **If spec is truth only for repair-guide errors:** `--next` text `error:` (tested) is enough; document JSON `--next` as `handleError` shape.

### D6 — Info — Archive prerequisites “naming the current state”

**Spec:** not `archivable` → exit 1 and `error:` **naming the current state**.

**Code:** delegates to Core; test mocks `InvalidStateTransitionError('done', 'archivable')` and only asserts `/error:/`. Message content is Core’s, not CLI-composed.

Not a CLI bug if Core messages include the state.

---

## Test Coverage

### Recorte 26

| Focus                                        | Covered?          | Where                                                                                                                                            |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--next` passes `to: 'next'`                 | **Yes**           | `transition.spec.ts`: drafting `--next`, ready `--next`, signed-off `--next`, pending/archivable refusals all `objectContaining({ to: 'next' })` |
| No local HAPPY_PATH table                    | **Yes (source)**  | No symbol in CLI src. Tests would not catch a reintroduced table except via `to` assertion                                                       |
| `review.message` printed                     | **Yes**           | `status.spec.ts` overlap case expects `message:  Conflict detected…`; JSON `parsed.review.message`                                               |
| Overlap peers                                | **Yes**           | `overlap:` bullets for beta/alpha                                                                                                                |
| No `OVERLAP_CONFLICT` on invalidation        | **Yes**           | `expect(out).not.toContain('OVERLAP_CONFLICT')` with empty `blockers: []`                                                                        |
| No `affectedArtifacts` paths under `review:` | **Yes** (overlap) | asserts absolute path absent. **Drift omit** is in `change.spec.ts`, not `status.spec.ts`                                                        |
| `--help` lists `overlapDetail`               | **No test**       | Present in `status.ts` `addHelpText`                                                                                                             |
| Tests in mirrored files                      | **Partial**       | Four files exist; leftover `change.spec.ts` still tests status/transition                                                                        |
| `--allow-out-of-scope` forwarded             | **No test**       | Implemented in `archive.ts` only                                                                                                                 |

### `cli:change-status` vs `status.spec.ts`

| Scenario family                                                  | Coverage                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Drafted JSON/text                                                | Yes                                                                             |
| Missing name / not found                                         | Yes                                                                             |
| Basic info, specs and dependencies, no `specs:`                  | Yes                                                                             |
| Available transitions passthrough / omit empty                   | Yes (does not prove CLI would not _add_ `verifying` from `VALID_TRANSITIONS`)   |
| Blockers without labels                                          | Yes (`MISSING_ARTIFACT`)                                                        |
| Blockers **with** gerund label                                   | **Missing** in status tests (label shape tested on **transition** repair guide) |
| Schema mismatch warning                                          | Yes                                                                             |
| JSON lifecycle + artifactDag `childrenOf` + hasTasks/drift state | Yes                                                                             |
| DAG tree + details `tasks: N/M`                                  | Yes                                                                             |
| Overlap header + peers + JSON overlapDetail                      | Yes                                                                             |
| Implementation `--implementation` / omit default                 | Yes                                                                             |
| artifact-review-required omit paths + `message`                  | **Missing** in `status.spec.ts`                                                 |
| artifact-drift omit paths + `[drift]`                            | **Only** `change.spec.ts`                                                       |
| nextAction `/specd-verify` not overwritten                       | **Missing**                                                                     |
| Convergent DAG node once                                         | **Missing** (visited-set in code)                                               |
| `schemaInfo === null` skips warning                              | **Missing**                                                                     |
| JSON `blockers[].label`                                          | **Missing** (code maps it)                                                      |

### `cli:change-transition` vs `transition.spec.ts`

| Scenario family                                                   | Coverage                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Missing step / mutual exclusion / `--next`                        | Yes                                                                             |
| No pending rewrite on explicit step / `--next`                    | Yes (success mocks)                                                             |
| Signed-off `--next` → Core `'next'`                               | Yes                                                                             |
| Core `--next` refusals + explanatory stderr                       | Yes (pending-spec, pending-signoff, archivable)                                 |
| HookFailedError exit 2, no repair guide, check-bus `✗`            | Yes                                                                             |
| Text success; JSON NDJSON `change-transition` not `hook-progress` | Yes                                                                             |
| Predicate gerund progress, no `Executing:`                        | Yes                                                                             |
| Repair Guide stderr; refresh false twice                          | Yes                                                                             |
| Repair recommends `/specd-verify`                                 | Yes                                                                             |
| Approval-required signoff message                                 | Yes                                                                             |
| skip-hooks `all` / default empty / comma phases                   | Yes                                                                             |
| Incomplete tasks → exit 1 + repair                                | Yes (does not assert artifact name in CLI-composed text beyond Core error)      |
| JSON structured **failure** complete record                       | **Missing**                                                                     |
| skip `target.pre` only vs `source.post` only (separate tests)     | Partial (comma-separated covered; not isolated pre vs post)                     |
| Unsatisfied requires surfaced                                     | Implicit via repair-guide missing artifact; no dedicated requires-progress test |
| Gate exit-1 stay-in-ready                                         | **Missing** as CLI mock-failure (D3)                                            |

### `cli:change-approve` vs `approve.spec.ts`

| Scenario family                        | Coverage                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Success text/JSON spec + signoff       | Yes                                                                                |
| Stay-in-ready / stay-in-done messaging | Yes (stdout has no pending hop)                                                    |
| Drain from pending-\*                  | Yes (CLI still calls execute; does not print “moved to pending”)                   |
| Missing `--reason` / unknown sub-verb  | Yes                                                                                |
| Not found / wrong state                | Yes (wrong state via `ApprovalGateDisabledError`, not designing-state typed error) |
| Execute `{ name, reason }` only        | Yes                                                                                |
| `kernel.specs.approve*` never called   | **Not asserted** (mock kernel likely unused)                                       |
| CLI did not pass hashes                | Implicit (call shape)                                                              |

### `cli:change-archive` vs `archive.spec.ts`

| Scenario family                                         | Coverage                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Text path; JSON stream complete; no second object       | Yes                                                         |
| Invalidated N changes text + JSON                       | Yes                                                         |
| Post-hook exit 2, no success line                       | Yes                                                         |
| Not found / missing name / not archivable               | Yes                                                         |
| skip-hooks all/pre/post/pre,post/default empty          | Yes                                                         |
| Check progress gerund + hook.pre lines, no `Executing:` | Yes                                                         |
| `--allow-overlap` forwarded                             | **Missing** (no `allowOverlap` in CLI tests at all)         |
| `--allow-out-of-scope` forwarded                        | **Missing**                                                 |
| `SpecOverlapError` stderr + hint                        | **Missing**                                                 |
| Singular alias vs `changes archive`                     | Not in this file; wiring is `changes` + alias at entrypoint |
| Merge/parse failure descriptive error                   | **Missing** (delegated to `handleError`)                    |

---

## Missing Tests

Priority for recorte 26 close-out:

1. **`archive.spec.ts`:** `--allow-out-of-scope` → `execute` input includes `allowOutOfScope: true`; omitted flag does not set it.
2. **`archive.spec.ts`:** `--allow-overlap` → `allowOverlap: true`; `SpecOverlapError` prints overlap list and `--allow-overlap` hint.
3. **`status.spec.ts`:** move or duplicate artifact-drift omit-paths (and JSON `affectedArtifacts`) from `change.spec.ts`; add `artifact-review-required` + `review.message` without reprinting paths.
4. **`status.spec.ts`:** text+JSON blocker with `label` / `checkId` (`DEPS_INCONSISTENT — Checking spec dependencies`).
5. **`status.spec.ts`:** `nextAction.command === '/specd-verify'` is printed as-is (CLI does not substitute `/specd-implement`); `availableTransitions` omitting `verifying` while `validTransitions` includes it (CLI does not merge).
6. **`status.spec.ts` or `--help` parse:** help JSON schema mentions `overlapDetail`.
7. **`transition.spec.ts`:** JSON mode repair-guide failure emits terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", blockers, nextAction } } }`.
8. **`transition.spec.ts` (optional):** JSON `--next` + `HappyPathNextUnavailableError` documents actual `handleError` vs stream contract (D5).
9. **Finish D1:** stop testing status/transition from `test/commands/change.spec.ts` once mirrored files own those cases.

Lower priority (pre-existing vs recorte 26): convergent DAG once; `schemaInfo` null skips warning; isolated `--skip-hooks target.pre` vs `source.post`; approve `kernel.specs.*` not invoked; archive merge-error message.

---

## Spec dependency chain (depth 1, change-declared)

| Spec                    | Depends on                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:change-status`     | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`                              |
| `cli:change-transition` | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`          |
| `cli:change-approve`    | `cli:entrypoint`, `core:change`, `core:transition-checks`                                                                                    |
| `cli:change-archive`    | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks` |

**Conformance to globals:** recorte 26 removed the CLI happy-path table, which previously conflicted with `default:_global/architecture` (domain logic in adapters). Current CLI `--next` forwarding is consistent with that constraint. Remaining global tension is **test file mirroring** (D1), not transition routing.

No contradiction found between these four CLI specs and `core:transition-checks` on: `'next'` resolution in Core, invalidation as `review` not `OVERLAP_CONFLICT`, archive `--allow-out-of-scope` for `impl.linksInScope`.

---

## Summary counts

| Metric                     | Count                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Specs in this partial      | 4                                                                                                                     |
| Requirements reviewed      | 47 (+ 5 recorte-26 focus rows)                                                                                        |
| Compliant                  | 42                                                                                                                    |
| Partial                    | 5 (R26-4 layout; R26-5 verify/tests; JSON `--next` failure stream; spec-gate CLI tests; `getActiveSchema` constraint) |
| Missing implementation     | 0                                                                                                                     |
| Discrepancies              | 6 (D1–D6)                                                                                                             |
| Missing tests (actionable) | 9 listed                                                                                                              |

**Recorte 26 score:** implementation of `--next`, review header/message/overlap, and `--allow-out-of-scope` **matches the change specs**. Gaps are **verify/test completeness** (archive flags, status scenarios still in `change.spec.ts`) and **help-text wording** for `--allow-out-of-scope`.
