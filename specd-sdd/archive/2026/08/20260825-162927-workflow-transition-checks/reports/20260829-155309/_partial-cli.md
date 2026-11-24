# Partial compliance report — CLI (`packages/cli`)

**Change:** `workflow-transition-checks`  
**Report:** `20260829-155309`  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)

---

## Executive summary

| Metric                                     | Count |
| ------------------------------------------ | ----: |
| Specs audited                              |     4 |
| Requirements / requirement-groups reviewed |    38 |
| **Compliant (implementation)**             |    35 |
| **Partial (implementation)**               |     1 |
| **Non-compliant (implementation)**         |     0 |
| **Test gaps (verify scenarios untested)**  |     9 |
| Discrepancies — **HIGH**                   |     0 |
| Discrepancies — **MEDIUM**                 |     4 |
| Discrepancies — **LOW**                    |     3 |

**Overall:** Source implementation aligns with the merged spec-preview for all four commands. The main gaps are **missing unit tests** for several new verify scenarios (especially approval-gate _failure_ paths and status projection parity) and one **stale bundled CLI description** for `change archive` until `packages/cli` is rebuilt.

---

## Cross-cutting findings

| ID   | Severity | Area            | Finding                                                                                                                                                                                              | Evidence                                                                                 |
| ---- | -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| X-01 | LOW      | Build / runtime | Bundled `dist/index.js` still registers archive with description _"Move a completed change…"_; **source** already matches preview (_"Move an archivable change (or retry from archiving…)"_).        | `packages/cli/dist/index.js:2372` vs `packages/cli/src/commands/change/archive.ts:56-58` |
| X-02 | LOW      | Help text       | `change transition --help` documents success stream shape only; preview also requires JSON/`toon` **failure** terminal record with `blockers` + `nextAction`. Behavior implemented; help incomplete. | `transition.ts:214-221`; preview `change-transition/spec.md` Invalid transition error    |
| X-03 | LOW      | Help text       | `change status --help` lists top-level `availableTransitions` with drafted-only comment; active JSON nests hops under `lifecycle`. Documented in source comment but easy to misread.                 | `status.ts:105-110`, JSON payload `status.ts:476-485`                                    |

Shared infrastructure **`_check-progress-presenter.ts`** matches preview for both transition and archive: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## `cli:change-status`

### Requirements compliance

| Requirement (preview)                                               | Implementation                                                                                                                                                     | Tests                                                             | Status                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------- |
| Lifecycle projections from GetStatus checks (no local graph filter) | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` from `kernel.changes.status.execute`; no `VALID_TRANSITIONS` filter                      | Partial — general transition display tests only                   | ✅ Compliant          |
| Drafted JSON empties hops + null `nextAction.command`               | `status.ts:145-180` forces `availableTransitions: []`, `availableSteps: []`, `command: null`                                                                       | `status.spec.ts` drafted JSON + text tests                        | ✅ Compliant          |
| Text omits duplicated review file lists                             | Review header only; no `affectedArtifacts` paths; overlap peers in `overlap:` section; filters `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'` | Overlap + drift tests                                             | ✅ Compliant          |
| Text blockers include gerund `label`                                | `! CODE — label: message` when `b.label` set                                                                                                                       | `Text blockers include gerund label`                              | ✅ Compliant          |
| JSON/TOON serialize `label`, `checkId` on blockers                  | `status.ts:410-416`                                                                                                                                                | **No dedicated JSON assertion**                                   | ✅ Impl / ⚠️ test gap |
| Help JSON schema lists `overlapDetail`                              | `status.ts:125`                                                                                                                                                    | `help documents nested schema.artifactDag and overlapDetail`      | ✅ Compliant          |
| Incomplete tasks → omit `verifying` from displayed hops             | Delegates to GetStatus (no CLI re-add)                                                                                                                             | **Not tested**                                                    | ✅ Impl / ⚠️ test gap |
| `nextAction` follows GetStatus (verify vs implement)                | Serializes `statusResult.nextAction` unchanged                                                                                                                     | **Not tested**                                                    | ✅ Impl / ⚠️ test gap |
| `artifact-review-required` text omits file paths under `review:`    | Same omission logic as drift/overlap                                                                                                                               | Drift covered; **`artifact-review-required` reason not asserted** | ✅ Impl / ⚠️ test gap |

### Discrepancies

| ID    | Severity | Finding                                                                                                                                  | Evidence                                                             |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| CS-01 | MEDIUM   | Verify scenario **"Incomplete tasks do not list verifying as available"** has no unit test. Regression would not be caught at CLI layer. | Preview verify L129-134; no matching test in `status.spec.ts`        |
| CS-02 | MEDIUM   | Verify scenario **"nextAction implements vs verify follows GetStatus"** untested.                                                        | Preview verify L136-140                                              |
| CS-03 | MEDIUM   | Verify scenario **"Artifact-review-required does not reprint files under review"** untested (drift-only variant exists).                 | Preview verify L154-164; `status.spec.ts` uses `artifact-drift` only |
| CS-04 | LOW      | Verify requires JSON `blockers[].label`; only text label assertion exists.                                                               | Preview verify L183-192; `status.spec.ts:287-314` text only          |

### Test coverage (delta-focused verify scenarios)

| Scenario                                                     | Covered   |
| ------------------------------------------------------------ | --------- |
| Drafted JSON empties hops even if Core leaks them            | ✅        |
| Incomplete tasks do not list verifying as available          | ❌        |
| nextAction implements vs verify follows GetStatus            | ❌        |
| Artifact-review-required does not reprint files under review | ❌        |
| Drift is shown only in artifacts details                     | ✅        |
| Overlap peers still print in text                            | ✅        |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies   | ✅ (text) |
| JSON output includes `blockers[].label`                      | ❌        |

**Tests file:** `status.spec.ts` — ~35 examples; strong overlap/drift/drafted/blocker-label coverage; weak on new projection-parity scenarios.

---

## `cli:change-transition`

### Requirements compliance

| Requirement (preview)                                                                                                  | Implementation                                                         | Tests                                     | Status       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| No approval-gate CLI routing (`implementing`/`archivable` targets passed through)                                      | `transition.ts:261-267` — no pending rewrite; passes `to` as requested | Success-path "does not rewrite" tests     | ✅ Compliant |
| `--next` → `to: 'next'` (no local from→to table)                                                                       | `transition.ts:255-256, 264`                                           | Multiple `--next` tests                   | ✅ Compliant |
| `--allow-out-of-scope` forwarded / omitted by default                                                                  | `transition.ts:266, 132`                                               | Dedicated tests                           | ✅ Compliant |
| Omit approval flags on execute                                                                                         | Only `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`        | `Transition execute omits approval flags` | ✅ Compliant |
| Repair guide on stderr (text) with check labels                                                                        | `writeTextRepairGuide`                                                 | Repair Guide + typed-error tests          | ✅ Compliant |
| JSON failure: terminal `change-transition` `complete` with `result: "failure"`, `blockers`, `nextAction`, `from`, `to` | `transition.ts:298-311`                                                | `JSON incomplete-tasks failure…`          | ✅ Compliant |
| `HookFailedError` → exit 2, no repair guide                                                                            | Rethrown to `handleError`                                              | Hook failure tests                        | ✅ Compliant |
| Check progress bus (not `hook-progress`)                                                                               | `createCheckProgressPresenter` + `streamName: 'change-transition'`     | Progress + JSON stream tests              | ✅ Compliant |
| Help mentions `--allow-out-of-scope`, approval stay-in-state semantics                                                 | `--help` output matches                                                | Manual `--help` check                     | ✅ Compliant |

### Discrepancies

| ID    | Severity | Finding                                                                                                                                                                                          | Evidence                                                                             |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| CT-01 | MEDIUM   | Verify **"Spec approval gate active"** expects exit 1, change stays `ready`, no `pending-spec-approval` on stdout when gate blocks. Tests only mock **successful** transition to `implementing`. | Preview verify L117-124; `transition.spec.ts:161-184` mocks resolve → `implementing` |
| CT-02 | MEDIUM   | Verify **"Signoff gate active"** (exit 1, stay `done`) untested; test mocks success to `archivable`.                                                                                             | Preview verify L126-133; `transition.spec.ts:186-205`                                |
| CT-03 | MEDIUM   | Verify **"Next flag from ready… stays in ready when spec gate on"** expects failure path; test mocks success.                                                                                    | Preview verify L45-52; `transition.spec.ts:207-229`                                  |
| CT-04 | MEDIUM   | Verify **"Status omitted verifying before the failed transition"** (cross-command) untested.                                                                                                     | Preview verify L217-221                                                              |
| CT-05 | LOW      | `--help` JSON schema omits failure `complete.result` fields (`blockers`, `nextAction`).                                                                                                          | `transition.ts:214-221`                                                              |

### Test coverage (delta-focused verify scenarios)

| Scenario                                                       | Covered                        |
| -------------------------------------------------------------- | ------------------------------ |
| Spec approval gate active (blocked)                            | ❌ (success-only variant only) |
| Signoff gate active (blocked)                                  | ❌                             |
| Next from ready stays in ready when spec gate on               | ❌                             |
| Status omitted verifying before failed transition              | ❌                             |
| Repair guide recommends verify when tasks complete             | ✅                             |
| HookFailedError exit 2 without repair guide                    | ✅                             |
| Predicate / hook check progress (gerund, no Executing)         | ✅                             |
| Structured formats use `change-transition` not `hook-progress` | ✅                             |
| JSON failure terminal record with blockers + nextAction        | ✅                             |
| Allow-out-of-scope forwarded / omitted                         | ✅                             |

**Tests file:** `transition.spec.ts` — ~45 examples; strong progress/repair-guide/JSON-stream coverage; **approval-gate failure scenarios from preview are the largest gap**.

---

## `cli:change-approve`

### Requirements compliance

| Requirement (preview)                                      | Implementation                                                                | Tests                                             | Status       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| Approve spec from `ready` (drain: `pending-spec-approval`) | Delegates to `kernel.changes.approveSpec`                                     | `Successful spec approval from ready`, drain test | ✅ Compliant |
| Approve signoff from `done` (drain: `pending-signoff`)     | Delegates to `kernel.changes.approveSignoff`                                  | `Successful signoff from done`, drain test        | ✅ Compliant |
| No gate flags on execute input                             | `{ name, reason }` only                                                       | Omit-gate-flag tests                              | ✅ Compliant |
| Help uses bound-from language (`ready` / `done`)           | `--help`: _"Record spec-gate consent for a change in ready…"_ / _"…in done…"_ | Not asserted in tests                             | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                                                           | stdout assertions                                 | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                                                           | JSON tests                                        | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                                                    | Missing-reason test                               | ✅ Compliant |

### Discrepancies

None material. Preview deltas for approve are fully reflected in source and tests.

### Test coverage (delta-focused verify scenarios)

| Scenario                            | Covered |
| ----------------------------------- | ------- |
| Successful spec approval from ready | ✅      |
| Successful signoff from done        | ✅      |
| JSON output on successful approval  | ✅      |
| Approve execute omits gate flags    | ✅      |
| Drain from pending states           | ✅      |

**Tests file:** `approve.spec.ts` — 14 examples; **complete** for preview delta scope.

---

## `cli:change-archive`

### Requirements compliance

| Requirement (preview)                                                                                                       | Implementation                                                | Tests                                                             | Status                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| Signature includes `--allow-out-of-scope`                                                                                   | Option + forward to execute                                   | Test present                                                      | ✅ Compliant               |
| Prerequisites: `archivable` **or** `archiving` (delegate to ArchiveChange)                                                  | No CLI-only archivable gate; forwards to execute              | Wrong-state test uses generic error; **archiving retry untested** | ✅ Compliant / ⚠️ test gap |
| Check progress bus (gerund labels, hooks on same bus)                                                                       | `_check-progress-presenter` via `makeArchiveProgressRenderer` | Text + JSON stream tests                                          | ✅ Compliant               |
| JSON success: NDJSON `change-archive` stream terminal `complete` with `result`, `name`, `archivePath`, `invalidatedChanges` | `archive.ts:125-136`                                          | JSON + stream-order tests                                         | ✅ Compliant               |
| No second unwrapped `{ result: "ok" }` after stream                                                                         | Single structured record on success                           | JSON tests                                                        | ✅ Compliant               |
| Text success: archive path + optional invalidated summary                                                                   | `archive.ts:115-123`                                          | Text tests                                                        | ✅ Compliant               |
| Post-hook failure → exit 2                                                                                                  | `archive.ts:110-113`                                          | Test present                                                      | ✅ Compliant               |
| Help description mentions archivable/archiving retry                                                                        | **Source** updated; **bundled dist stale** (see X-01)         | —                                                                 | ⚠️ Partial (runtime help)  |

### Discrepancies

| ID    | Severity | Finding                                                              | Evidence                                                        |
| ----- | -------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| CA-01 | MEDIUM   | Verify **"Change in archiving may retry archive"** has no unit test. | Preview verify L33-37; no `archiving` case in `archive.spec.ts` |
| CA-02 | LOW      | Runtime `--help` description stale until CLI rebuild (X-01).         | `dist/index.js:2372`                                            |

### Test coverage (delta-focused verify scenarios)

| Scenario                                        | Covered |
| ----------------------------------------------- | ------- |
| Change in archiving may retry archive           | ❌      |
| Text gerund check progress + hook bus           | ✅      |
| JSON stream check-progress then complete        | ✅      |
| JSON output on success (stream terminal record) | ✅      |
| `--allow-out-of-scope` forwarded                | ✅      |
| Invalidated changes in text + JSON              | ✅      |

**Tests file:** `archive.spec.ts` — 18 examples; strong hook/skip/JSON coverage; missing **archiving retry** scenario.

---

## JSON failure payloads (requested focus)

| Command             | Preview contract                                                                                                                                           | Implementation                 | Test                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `change transition` | stdout NDJSON terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", name, from, to, blockers, nextAction } } }` | `transition.ts:298-311`        | ✅ incomplete-tasks JSON test                           |
| `change status`     | JSON blockers include optional `label`, `checkId`; full `review` incl. `overlapDetail`                                                                     | `status.ts:410-416, 461-475`   | Partial — overlap JSON tested; blocker `label` JSON not |
| `change approve`    | Success only: `{ result, gate, name }`                                                                                                                     | `approve.ts:49, 87`            | ✅                                                      |
| `change archive`    | Success stream terminal record; failures via stderr `error:` (no structured failure stream in preview)                                                     | `handleError` / overlap stderr | N/A                                                     |

---

## Progress presenters (requested focus)

| Command             | Preview                                                                                                   | Implementation                                           | Tests          |
| ------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------- |
| `change transition` | Generic check bus; hooks as `Running pre/post hooks`; no `Executing:`; JSON `stream: "change-transition"` | `_check-progress-presenter.ts` + `transition.ts:142-156` | ✅ extensive   |
| `change archive`    | Same pattern; `stream: "change-archive"`; text progress on stderr                                         | `archive.ts:32-44`                                       | ✅ text + JSON |
| `change run-hooks`  | Preview explicitly allows legacy `hook-progress` (out of scope)                                           | Unchanged `_hook-progress-presenter.ts` in bundle        | —              |

---

## Approvals defaults (requested focus)

| Area                     | Preview                                                                                 | Implementation                                         | Tests                        |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| Transition               | Gate checks baked in kernel; CLI must not pass approval flags or rewrite to `pending-*` | No approval fields on execute; targets passed verbatim | Success-path no-rewrite only |
| Approve spec             | Valid from `ready` (+ drain `pending-spec-approval`); stay in `ready` on success        | Help + execute shape match                             | ✅                           |
| Approve signoff          | Valid from `done` (+ drain `pending-signoff`); stay in `done` on success                | Help + execute shape match                             | ✅                           |
| Status lifecycle display | `approvals: spec=on/off signoff=on/off` from GetStatus                                  | `status.ts:291-293`                                    | ✅                           |

---

## Archive behavior (requested focus)

| Area              | Preview                                                   | Implementation          | Tests   |
| ----------------- | --------------------------------------------------------- | ----------------------- | ------- |
| State guard       | `archivable` or `archiving`; delegate to ArchiveChange    | No extra CLI gate       | Partial |
| Flags             | `--allow-overlap`, `--allow-out-of-scope`, `--skip-hooks` | Forwarded conditionally | ✅      |
| Success JSON      | Single NDJSON stream, terminal `complete`                 | Implemented             | ✅      |
| Success text      | Path line + optional invalidated list                     | Implemented             | ✅      |
| Post-hook failure | Exit 2                                                    | Implemented             | ✅      |
| Check progress    | Shared presenter                                          | Implemented             | ✅      |

---

## Recommendations (informational — no code changes in this audit)

1. Add unit tests for the **9 uncovered verify scenarios** listed above (priority: transition approval-gate failures CT-01–03, status projection parity CS-01–02).
2. Rebuild `packages/cli` so runtime `--help` for `change archive` matches source (X-01 / CA-02).
3. Extend `change transition --help` JSON schema with failure terminal record shape (X-02).

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._
