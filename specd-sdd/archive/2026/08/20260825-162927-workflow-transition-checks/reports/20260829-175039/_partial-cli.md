# Partial compliance report — CLI (`packages/cli`)

**Change:** `workflow-transition-checks`  
**Report:** `20260829-175039`  
**Prior report:** `20260829-172110` (1 MEDIUM CT-04, 1 LOW X-03)  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)  
**Tests run:** `pnpm --filter @specd/cli test` — 899 passed (includes 102 CLI change-command `it` blocks)

---

## Executive summary

| Metric                                 |     Prior (172110) |                                              Current (175039) |
| -------------------------------------- | -----------------: | ------------------------------------------------------------: |
| Specs audited                          |                  4 |                                                             4 |
| Merged verify scenarios (total)        |                112 |                                                           112 |
| **Compliant (implementation)**         | 38 / 38 req-groups |                                                   **38 / 38** |
| **Partial (implementation)**           |                  0 |                                                         **0** |
| **Non-compliant (implementation)**     |                  0 |                                                         **0** |
| **Delta-focused verify scenarios**     |                 30 |                                                            30 |
| **Delta scenarios with tests**         |                 29 |                                                        **30** |
| **Delta scenarios partial / untested** |                  1 |                                                         **0** |
| Discrepancies — **HIGH**               |                  0 |                                                         **0** |
| Discrepancies — **MEDIUM**             |                  1 |                                                         **0** |
| Discrepancies — **LOW**                |                  1 |                                                         **0** |
| Unit tests (`it` blocks)               |                101 | **102** (34 status + 37 transition + 12 approve + 19 archive) |

**Overall:** All four CLI commands conform to merged spec-preview in source and bundled CLI. All prior discrepancies (CT-04, X-03) are resolved. All 30 delta-focused verify scenarios have dedicated test coverage. No material discrepancies remain.

---

## Prior findings — resolution status

| Prior ID | Severity | Finding                                                                                                         | Status                                                                                                                                                                                                                             |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT-04    | MEDIUM   | Cross-command verify scenario _Status omitted verifying before the failed transition_ untested as a single flow | **FIXED** — `transition.spec.ts:972` chains `change status` then `change transition`, asserts transitions omit `verifying` before failed hop                                                                                       |
| X-03     | LOW      | `change status --help` JSON schema comment implied top-level `availableTransitions` was drafted-only            | **FIXED** — help now reads `// legacy top-level; active changes use lifecycle.availableTransitions` and `lifecycle.availableTransitions` is documented as check-derived for active changes (`status.ts:105-108`; runtime `--help`) |

All other prior findings from `20260829-172110` remain **FIXED** (no regressions observed).

---

## Cross-cutting findings

No material cross-cutting discrepancies. Shared infrastructure **`_check-progress-presenter.ts`** remains compliant: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## Delta scenario matrix (30 / 30)

### `cli:change-status` — 8 / 8

| Scenario                                                                  | Test                          |
| ------------------------------------------------------------------------- | ----------------------------- |
| Incomplete tasks do not list verifying as available                       | `status.spec.ts:1008`         |
| nextAction implements vs verify follows GetStatus                         | `status.spec.ts:1034`         |
| Drafted JSON empties hops even if Core leaks them                         | `status.spec.ts:73`           |
| Artifact-review-required does not reprint files under review              | `status.spec.ts:1154`         |
| Drift is shown only in artifacts details                                  | `status.spec.ts:1095`         |
| Overlap peers still print in text                                         | `status.spec.ts:685`          |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies (+ JSON label) | `status.spec.ts:287`, `:1061` |
| Text output shows overlap peers without review file lists                 | `status.spec.ts:685`          |

### `cli:change-transition` — 16 / 16

| Scenario                                                                | Test                              |
| ----------------------------------------------------------------------- | --------------------------------- |
| Repair guide recommends verify when tasks are complete                  | `transition.spec.ts:1170`         |
| Status omitted verifying before the failed transition                   | `transition.spec.ts:972`          |
| Predicate progress uses gerund label                                    | `transition.spec.ts:639`          |
| Hook progress uses Running hooks labels                                 | `transition.spec.ts:411`, `:579`  |
| Next flag from ready stays in ready when spec gate on                   | `transition.spec.ts:326`          |
| Spec approval gate active (blocked)                                     | `transition.spec.ts:232`          |
| Signoff gate active (blocked)                                           | `transition.spec.ts:281`          |
| Transition failure renders Repair Guide (stderr)                        | `transition.spec.ts:702`          |
| Structured formats emit progress on stdout (`change-transition` stream) | `transition.spec.ts:493`          |
| HookFailedError is exit 2 without repair guide                          | `transition.spec.ts:390`          |
| Next flag from signed-off maps to archivable                            | `transition.spec.ts:368`          |
| CLI does not keep a from-to next table                                  | `transition.spec.ts:65`           |
| Transition check bus does not share hook-progress stream                | `transition.spec.ts:576`          |
| Transition execute omits approval flags                                 | `transition.spec.ts:135`          |
| Allow-out-of-scope forwarded / omitted                                  | `transition.spec.ts:91`, `:117`   |
| Structured success / failure terminal complete records                  | `transition.spec.ts:493`, `:1060` |

### `cli:change-approve` — 3 / 3

| Scenario                                           | Test                  |
| -------------------------------------------------- | --------------------- |
| Successful spec approval from ready                | `approve.spec.ts:74`  |
| Successful signoff from done                       | `approve.spec.ts:258` |
| JSON output on successful approval (GIVEN `ready`) | `approve.spec.ts:137` |

### `cli:change-archive` — 4 / 4

| Scenario                                        | Test                  |
| ----------------------------------------------- | --------------------- |
| Change in archiving may retry archive           | `archive.spec.ts:217` |
| Text gerund check progress + hook bus           | `archive.spec.ts:452` |
| JSON stream check-progress then complete        | `archive.spec.ts:114` |
| JSON output on success (stream terminal record) | `archive.spec.ts:88`  |

---

## `cli:change-status`

**Merged verify scenarios:** 37  
**Unit tests:** 34

### Requirements compliance

| Requirement (preview)                                                  | Implementation                                                            | Tests                                                                          | Status       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| Lifecycle projections from GetStatus checks (no local graph filter)    | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` | `Lifecycle projections from GetStatus` describe block                          | ✅ Compliant |
| Drafted JSON empties hops + null `nextAction.command`                  | `status.ts:145-180`                                                       | `JSON drafted status includes isDrafted and empty transitions`                 | ✅ Compliant |
| Text omits duplicated review file lists                                | Review header only; overlap peers in `overlap:` section                   | Drift, overlap, artifact-review-required tests                                 | ✅ Compliant |
| Text blockers include gerund `label`                                   | `! CODE — label: message` when `b.label` set                              | Text + JSON blocker label tests                                                | ✅ Compliant |
| JSON/TOON serialize `label`, `checkId` on blockers                     | `status.ts:410-416`                                                       | `JSON output includes blockers label and checkId`                              | ✅ Compliant |
| Help JSON schema lists `overlapDetail` and clarifies lifecycle nesting | `status.ts:105-110, 125`                                                  | `help documents nested schema.artifactDag and overlapDetail`; runtime `--help` | ✅ Compliant |
| Incomplete tasks → omit `verifying` from displayed hops                | Delegates to GetStatus (no CLI re-add)                                    | `given GetStatus omits verifying…`                                             | ✅ Compliant |
| `nextAction` follows GetStatus (verify vs implement)                   | Serializes `statusResult.nextAction` unchanged                            | `given GetStatus recommends verify…`                                           | ✅ Compliant |
| `artifact-review-required` text omits file paths under `review:`       | Same omission logic as drift/overlap                                      | `given artifact-review-required…`                                              | ✅ Compliant |
| Delegates refresh policy                                               | No direct `RefreshImplementationTracking` call                            | `Normal status output` asserts no refresh call                                 | ✅ Compliant |

### Discrepancies

None.

---

## `cli:change-transition`

**Merged verify scenarios:** 45  
**Unit tests:** 37

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

### Discrepancies

None.

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
| Help uses bound-from language (`ready` / `done`)           | `--help` text                                | Runtime matches preview                         | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                          | stdout assertions                               | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                          | JSON tests                                      | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                   | Missing-reason test                             | ✅ Compliant |

### Discrepancies

None.

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

| Category                                    |       Count |
| ------------------------------------------- | ----------: |
| Specs audited                               |           4 |
| Merged verify scenarios (all four specs)    |         112 |
| Delta-focused verify scenarios              |          30 |
| Delta scenarios fully tested                |      **30** |
| Delta scenarios partial / untested          |       **0** |
| Implementation compliant requirement-groups | **38 / 38** |
| **HIGH discrepancies**                      |       **0** |
| **MEDIUM discrepancies**                    |       **0** |
| **LOW discrepancies**                       |       **0** |

---

## Informational notes (not discrepancies)

1. Several base verify scenarios pre-dating this change (e.g. _Discarded name is not found_, _Status uses the shared SDK projection_) still lack dedicated CLI unit tests; unchanged from prior audits.
2. X-03 help-text fix is verified via source and runtime `--help`; no dedicated assertion for the legacy/lifecycle comment wording (documentation-only change).
3. _Hashes computed by use case from disk_ (approve base scenario) remains an integration concern, not a CLI-layer unit test.

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._
