# Partial compliance report — CLI (`packages/cli`)

**Change:** `workflow-transition-checks`  
**Report:** `20260829-172110`  
**Prior report:** `20260829-155309` (4 MEDIUM, 3 LOW)  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)

---

## Executive summary

| Metric                                 |      Prior (155309) |                                              Current (172110) |
| -------------------------------------- | ------------------: | ------------------------------------------------------------: |
| Specs audited                          |                   4 |                                                             4 |
| Merged verify scenarios (total)        |                 112 |                                                           112 |
| **Compliant (implementation)**         |  35 / 38 req-groups |                                                   **38 / 38** |
| **Partial (implementation)**           | 1 (stale dist help) |                                                         **0** |
| **Non-compliant (implementation)**     |                   0 |                                                         **0** |
| **Delta-focused verify scenarios**     |                  30 |                                                            30 |
| **Delta scenarios with tests**         |                  21 |                                                        **29** |
| **Delta scenarios partial / untested** |                   9 |                                                         **1** |
| Discrepancies — **HIGH**               |                   0 |                                                         **0** |
| Discrepancies — **MEDIUM**             |                   4 |                                                         **1** |
| Discrepancies — **LOW**                |                   3 |                                                         **1** |
| Unit tests (`it` blocks)               |                ~112 | **101** (34 status + 36 transition + 12 approve + 19 archive) |

**Overall:** All four CLI commands match the merged spec-preview in source and in the rebuilt bundled CLI. Eight of nine prior test gaps are closed. One cross-command verify scenario (`change-transition`: _Status omitted verifying before the failed transition_) remains partially covered. One pre-existing LOW help-text nit on `change status` persists.

---

## Prior findings — resolution status

| Prior ID | Severity | Finding                                                             | Status                                                                          |
| -------- | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CS-01    | MEDIUM   | Incomplete tasks omit `verifying` from displayed hops               | **FIXED** — `status.spec.ts` `Lifecycle projections from GetStatus`             |
| CS-02    | MEDIUM   | `nextAction` verify vs implement follows GetStatus                  | **FIXED** — `status.spec.ts:1034`                                               |
| CS-03    | MEDIUM   | `artifact-review-required` omits duplicated review paths            | **FIXED** — `status.spec.ts:1154`                                               |
| CS-04    | LOW      | JSON `blockers[].label` untested                                    | **FIXED** — `status.spec.ts:1061`                                               |
| CT-01    | MEDIUM   | Spec approval gate blocked (exit 1, stay `ready`)                   | **FIXED** — `transition.spec.ts:231`                                            |
| CT-02    | MEDIUM   | Signoff gate blocked (exit 1, stay `done`)                          | **FIXED** — `transition.spec.ts:280`                                            |
| CT-03    | MEDIUM   | `--next` from `ready` blocked by spec gate                          | **FIXED** — `transition.spec.ts:325`                                            |
| CT-04    | MEDIUM   | Status omits `verifying` _before_ failed transition (cross-command) | **OPEN (partial)** — status isolation tested; no chained status→transition test |
| CA-01    | MEDIUM   | `archiving` state may retry archive                                 | **FIXED** — `archive.spec.ts:217`                                               |
| X-01     | LOW      | Bundled `dist` archive description stale                            | **FIXED** — `dist/index.js:2378` matches source                                 |
| X-02     | LOW      | `change transition --help` omits failure JSON schema                | **FIXED** — help documents failure `complete` record                            |
| CT-05    | LOW      | (same as X-02)                                                      | **FIXED**                                                                       |
| X-03     | LOW      | `change status --help` drafted-only `availableTransitions` comment  | **OPEN** — documentation clarity only; behavior correct                         |

---

## Cross-cutting findings

| ID    | Severity | Area      | Finding                                                                                                                                                                                                                                          | Evidence                                                                               |
| ----- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| X-03  | LOW      | Help text | `change status --help` notes top-level `availableTransitions` as _drafted JSON only_; active hops live under `lifecycle`. Correct in source; easy to misread.                                                                                    | `status.ts:105-110`; runtime `--help`                                                  |
| CT-04 | MEDIUM   | Test gap  | Verify scenario _Status omitted verifying before the failed transition_ expects a status call **before** a transition attempt in one flow. Status projection is unit-tested; incomplete-tasks transition is unit-tested; no integrated sequence. | Preview `change-transition/verify.md`; `status.spec.ts:1008`; `transition.spec.ts:971` |

Shared infrastructure **`_check-progress-presenter.ts`** remains compliant: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## `cli:change-status`

**Merged verify scenarios:** 37  
**Unit tests:** 34

### Requirements compliance

| Requirement (preview)                                               | Implementation                                                            | Tests                                                          | Status       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| Lifecycle projections from GetStatus checks (no local graph filter) | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` | `Lifecycle projections from GetStatus` describe block          | ✅ Compliant |
| Drafted JSON empties hops + null `nextAction.command`               | `status.ts:145-180`                                                       | `JSON drafted status includes isDrafted and empty transitions` | ✅ Compliant |
| Text omits duplicated review file lists                             | Review header only; overlap peers in `overlap:` section                   | Drift, overlap, artifact-review-required tests                 | ✅ Compliant |
| Text blockers include gerund `label`                                | `! CODE — label: message` when `b.label` set                              | Text + JSON blocker label tests                                | ✅ Compliant |
| JSON/TOON serialize `label`, `checkId` on blockers                  | `status.ts:410-416`                                                       | `JSON output includes blockers label and checkId`              | ✅ Compliant |
| Help JSON schema lists `overlapDetail`                              | `status.ts:125`                                                           | `help documents nested schema.artifactDag and overlapDetail`   | ✅ Compliant |
| Incomplete tasks → omit `verifying` from displayed hops             | Delegates to GetStatus (no CLI re-add)                                    | `given GetStatus omits verifying…`                             | ✅ Compliant |
| `nextAction` follows GetStatus (verify vs implement)                | Serializes `statusResult.nextAction` unchanged                            | `given GetStatus recommends verify…`                           | ✅ Compliant |
| `artifact-review-required` text omits file paths under `review:`    | Same omission logic as drift/overlap                                      | `given artifact-review-required…`                              | ✅ Compliant |
| Delegates refresh policy                                            | No direct `RefreshImplementationTracking` call                            | `Normal status output` asserts no refresh call                 | ✅ Compliant |

### Delta-focused verify scenarios (8)

| Scenario                                                                  | Covered |
| ------------------------------------------------------------------------- | ------- |
| Incomplete tasks do not list verifying as available                       | ✅      |
| nextAction implements vs verify follows GetStatus                         | ✅      |
| Drafted JSON empties hops even if Core leaks them                         | ✅      |
| Artifact-review-required does not reprint files under review              | ✅      |
| Drift is shown only in artifacts details                                  | ✅      |
| Overlap peers still print in text                                         | ✅      |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies (+ JSON label) | ✅      |
| Text output shows overlap peers without review file lists                 | ✅      |

### Discrepancies

None material for implementation or delta test scope.

### Pre-existing base-scenario notes (informational)

Several base verify scenarios (e.g. _Discarded name is not found_, _Text DAG does not repeat convergent nodes_, _Status uses the shared SDK projection_) have no dedicated CLI unit tests. These pre-date this change and were not flagged in the prior delta audit.

---

## `cli:change-transition`

**Merged verify scenarios:** 45  
**Unit tests:** 36

### Requirements compliance

| Requirement (preview)                                                                                    | Implementation                                                     | Tests                                     | Status       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------ |
| No approval-gate CLI routing                                                                             | Targets passed verbatim; no `pending-*` rewrite                    | Success + blocked gate tests              | ✅ Compliant |
| `--next` → `to: 'next'` (no local from→to table)                                                         | `transition.ts:255-256, 264`                                       | `--next` resolution tests                 | ✅ Compliant |
| `--allow-out-of-scope` forwarded / omitted by default                                                    | `transition.ts:266, 132`                                           | Dedicated tests                           | ✅ Compliant |
| Omit approval flags on execute                                                                           | Only `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`    | `Transition execute omits approval flags` | ✅ Compliant |
| Repair guide on stderr (text) with check labels                                                          | `writeTextRepairGuide`                                             | Repair Guide + typed-error tests          | ✅ Compliant |
| JSON failure: terminal `change-transition` `complete` with `result: "failure"`, `blockers`, `nextAction` | `transition.ts:298-311`                                            | `JSON incomplete-tasks failure…`          | ✅ Compliant |
| JSON success: terminal `complete` with `result: "ok"`, `from`, `to`                                      | `transition.ts` presenter                                          | `JSON output on successful transition`    | ✅ Compliant |
| `HookFailedError` → exit 2, no repair guide                                                              | Rethrown to `handleError`                                          | Hook failure tests                        | ✅ Compliant |
| Check progress bus (not `hook-progress`)                                                                 | `createCheckProgressPresenter` + `streamName: 'change-transition'` | Progress + JSON stream tests              | ✅ Compliant |
| Help mentions failure terminal record                                                                    | `--help` output                                                    | Runtime `--help` check                    | ✅ Compliant |
| Pre/repair GetStatus skips refresh                                                                       | `refreshImplementationTracking: false`                             | Blocked-gate + repair-guide tests         | ✅ Compliant |

### Delta-focused verify scenarios (16)

| Scenario                                                                | Covered                     |
| ----------------------------------------------------------------------- | --------------------------- |
| Repair guide recommends verify when tasks are complete                  | ✅                          |
| Status omitted verifying before the failed transition                   | ⚠️ Partial (isolation only) |
| Predicate progress uses gerund label                                    | ✅                          |
| Hook progress uses Running hooks labels                                 | ✅                          |
| Next flag from ready stays in ready when spec gate on                   | ✅                          |
| Spec approval gate active (blocked)                                     | ✅                          |
| Signoff gate active (blocked)                                           | ✅                          |
| Transition failure renders Repair Guide (stderr)                        | ✅                          |
| Structured formats emit progress on stdout (`change-transition` stream) | ✅                          |
| HookFailedError is exit 2 without repair guide                          | ✅                          |
| Next flag from signed-off maps to archivable                            | ✅                          |
| CLI does not keep a from-to next table                                  | ✅                          |
| Transition check bus does not share hook-progress stream                | ✅                          |
| Transition execute omits approval flags                                 | ✅                          |
| Allow-out-of-scope forwarded / omitted                                  | ✅                          |
| Structured success / failure terminal complete records                  | ✅                          |

### Discrepancies

| ID    | Severity | Finding                                                 | Evidence                                 |
| ----- | -------- | ------------------------------------------------------- | ---------------------------------------- |
| CT-04 | MEDIUM   | Cross-command verify scenario untested as a single flow | Preview verify; separate unit tests only |

---

## `cli:change-approve`

**Merged verify scenarios:** 12  
**Unit tests:** 12

### Requirements compliance

| Requirement (preview)                                      | Implementation                               | Tests                                           | Status       |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------ |
| Approve spec from `ready` (drain: `pending-spec-approval`) | Delegates to `kernel.changes.approveSpec`    | `records spec approval from ready…`, drain test | ✅ Compliant |
| Approve signoff from `done` (drain: `pending-signoff`)     | Delegates to `kernel.changes.approveSignoff` | `records signoff from done…`, drain test        | ✅ Compliant |
| No gate flags on execute input                             | `{ name, reason }` only                      | Call-shape assertions in spec/signoff tests     | ✅ Compliant |
| Help uses bound-from language (`ready` / `done`)           | `--help` text                                | Not asserted in tests; runtime matches preview  | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                          | stdout assertions                               | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                          | JSON tests                                      | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                   | Missing-reason test                             | ✅ Compliant |

### Delta-focused verify scenarios (3)

| Scenario                                           | Covered |
| -------------------------------------------------- | ------- |
| Successful spec approval from ready                | ✅      |
| Successful signoff from done                       | ✅      |
| JSON output on successful approval (GIVEN `ready`) | ✅      |

### Discrepancies

None material. Pre-existing scenario _Hashes computed by use case from disk_ remains an integration concern (not CLI-layer unit test); unchanged from prior audits.

---

## `cli:change-archive`

**Merged verify scenarios:** 18  
**Unit tests:** 19

### Requirements compliance

| Requirement (preview)                                                      | Implementation                                                | Tests                                                | Status       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| Signature includes `--allow-out-of-scope`                                  | Option + forward to execute                                   | Test present                                         | ✅ Compliant |
| Prerequisites: `archivable` **or** `archiving` (delegate to ArchiveChange) | No CLI-only archivable gate; forwards to execute              | `forwards archive when change is in archiving state` | ✅ Compliant |
| Check progress bus (gerund labels, hooks on same bus)                      | `_check-progress-presenter` via `makeArchiveProgressRenderer` | Text + JSON stream tests                             | ✅ Compliant |
| JSON success: NDJSON `change-archive` stream terminal `complete`           | `archive.ts:125-136`                                          | JSON + stream-order tests                            | ✅ Compliant |
| No second unwrapped `{ result: "ok" }` after stream                        | Single structured record on success                           | JSON tests                                           | ✅ Compliant |
| Text success: archive path + optional invalidated summary                  | `archive.ts:115-123`                                          | Text tests                                           | ✅ Compliant |
| Post-hook failure → exit 2                                                 | `archive.ts:110-113`                                          | Test present                                         | ✅ Compliant |
| Help description mentions archivable/archiving retry                       | Source + bundled dist aligned                                 | Runtime `--help`                                     | ✅ Compliant |

### Delta-focused verify scenarios (4)

| Scenario                                        | Covered |
| ----------------------------------------------- | ------- |
| Change in archiving may retry archive           | ✅      |
| Text gerund check progress + hook bus           | ✅      |
| JSON stream check-progress then complete        | ✅      |
| JSON output on success (stream terminal record) | ✅      |

### Discrepancies

None.

---

## JSON failure / success payloads

| Command                     | Preview contract                                                                                                         | Implementation               | Test |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---- |
| `change transition` success | NDJSON terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "ok", name, from, to } } }` | Implemented                  | ✅   |
| `change transition` failure | NDJSON terminal `{ … result: "failure", blockers, nextAction }`                                                          | `transition.ts:298-311`      | ✅   |
| `change status`             | JSON blockers include optional `label`, `checkId`; full `review` incl. `overlapDetail`                                   | `status.ts:410-416, 461-475` | ✅   |
| `change approve`            | Success only: `{ result, gate, name }`                                                                                   | `approve.ts:49, 87`          | ✅   |
| `change archive`            | Success stream terminal record                                                                                           | `archive.ts:125-136`         | ✅   |

---

## Progress presenters

| Command             | Preview                                                                                                   | Implementation                                   | Tests          |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------- |
| `change transition` | Generic check bus; hooks as `Running pre/post hooks`; no `Executing:`; JSON `stream: "change-transition"` | `_check-progress-presenter.ts` + `transition.ts` | ✅ extensive   |
| `change archive`    | Same pattern; `stream: "change-archive"`                                                                  | `archive.ts:32-44`                               | ✅ text + JSON |

---

## Summary counts

| Category                                    |                     Count |
| ------------------------------------------- | ------------------------: |
| Specs audited                               |                         4 |
| Merged verify scenarios (all four specs)    |                       112 |
| Delta-focused verify scenarios              |                        30 |
| Delta scenarios fully tested                |                        29 |
| Delta scenarios partial / untested          |                         1 |
| Implementation compliant requirement-groups |                   38 / 38 |
| **HIGH discrepancies**                      |                     **0** |
| **MEDIUM discrepancies**                    |    **1** (CT-04 test gap) |
| **LOW discrepancies**                       | **1** (X-03 help clarity) |

---

## Recommendations (informational — no code changes in this audit)

1. Add one integrated unit or integration test chaining `change status` then `change transition` with incomplete tasks, asserting `availableTransitions` omits `verifying` before the failed hop (closes CT-04).
2. Optionally clarify `change status --help` JSON schema comment for active vs drafted lifecycle nesting (closes X-03).

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._
