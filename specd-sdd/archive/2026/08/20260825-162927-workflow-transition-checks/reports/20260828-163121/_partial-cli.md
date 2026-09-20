# Spec-compliance partial: CLI change commands

- **Mode:** change `workflow-transition-checks` (assigned specs only)
- **Auditor:** read-only; graph index reported FAILED by parent — used `specd graph search` (index still served symbols) then `Read`
- **Sources:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks` for `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`, `_implementation-tracking.ts`; tests under `packages/cli/test/commands/change/`
- **Neither spec nor code is treated as sole truth.** Each finding lists spec-drift vs implementation-bug interpretations.

---

## Prior 144106 re-check

Prior CLI batch: **0 HIGH, 0 MEDIUM remaining** (3 MEDIUMs closed). This pass confirms those closures still hold; remaining items are still **LOW** or **missing tests**.

### 1. Hide `OVERLAP_CONFLICT` in text when `review.reason` is `spec-overlap-conflict`

**Status: still resolved (implementation + tests).**

- Spec (`cli:change-status`): invalidation overlap MUST NOT appear as a text `OVERLAP_CONFLICT` blocker line; live overlap MAY still print it.
- Code (`status.ts` ~237–240): `textBlockers = review?.reason === 'spec-overlap-conflict' ? blockers.filter(code !== 'OVERLAP_CONFLICT') : blockers`.
- JSON/TOON still serializes the unfiltered `blockers` array (spec forbids the **text** line only).
- Tests (`status.spec.ts`):
  - `hides OVERLAP_CONFLICT in text when review reason is spec-overlap-conflict`
  - `prints live OVERLAP_CONFLICT when review is not spec-overlap-conflict` (archivable, `review.reason` null)
  - overlap-peer scenario also `expect(out).not.toContain('OVERLAP_CONFLICT')`

**Residual (LOW, not a MEDIUM regression):** if Core attached `review.reason: 'spec-overlap-conflict'` **and** a live `OVERLAP_CONFLICT` blocker, text would hide **all** such lines. Spec does not describe that mix.

### 2. Repair-guide examples: `MISSING_ARTIFACT` → `INCOMPLETE_ARTIFACT`

**Status: spec + tests aligned on `INCOMPLETE_ARTIFACT`. No leftover `MISSING_ARTIFACT` in CLI change tests.**

- Previewed `cli:change-transition` spec: repair-guide codes list `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`. Verify scenario: `! INCOMPLETE_ARTIFACT`.
- Delta `deltas/cli/change-transition/{spec,verify}.md.delta.yaml` uses `INCOMPLETE_ARTIFACT`.
- Tests: `transition.spec.ts` repair-guide mock + assertion use `INCOMPLETE_ARTIFACT`; `status.spec.ts` blocker text uses `INCOMPLETE_ARTIFACT` (message still says “missing”, which is Core copy, not the old code name).
- Repair guide **uses GetStatus `nextAction`**: `writeTextRepairGuide` prints `status.nextAction.{targetStep,command,reason}`; test `recommends verify when GetStatus nextAction is the verify skill` asserts `/specd-verify` and not `/specd-implement`.

### 3. Archive `--allow-overlap` / `--allow-out-of-scope`

**Status: implemented and unit-tested (flag forwarding).**

- Spec command signature documents both flags; `--allow-out-of-scope` is `impl.linksInScope` only.
- Code (`archive.ts`): optional spread of `allowOverlap` / `allowOutOfScope` onto `ArchiveChange.execute`.
- Tests: `passes allowOverlap when --allow-overlap is set`; `passes allowOutOfScope when --allow-out-of-scope is set`; `omits allowOverlap and allowOutOfScope when those flags are not set`.
- **Still missing:** `SpecOverlapError` stderr + `--allow-overlap` hint (implementation exists, no `it()`).

### 4. Other prior closures still hold

- Text DAG `hasTasks` aligned with JSON via `hasTasks === true || taskCompletionCheck !== undefined` in `renderDag`, top-level `artifactDag`, and nested `schema.artifactDag`.
- Artifact-drift CLI tests live in `status.spec.ts` (`describe('artifact-drift review rendering')`).
- **Coverage gaps unchanged:** no `it()` for `taskCompletionCheck` without `hasTasks: true`; drift test still omits `hasDrift: true` so `[drift]` is never asserted on **status**; JSON failure stream and `SpecOverlapError` still untested.

---

## Spec: `cli:change-status`

### Requirements Summary

| #   | Requirement                          | Intent                                                                                                                                                          |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                    | `specd change status <name> [--format text\|json\|toon]`                                                                                                        |
| 2   | Drafted status is read-only          | No mutating transitions; mark drafted; MAY show artifacts                                                                                                       |
| 3   | Output format                        | JSON/TOON `artifactDag[].hasTasks`; `state` is display projection (e.g. `complete-with-drift`)                                                                  |
| 4   | Task completion display in DAG       | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` remains boolean                                                                               |
| 5   | Display-state rendering              | Text prefers display state; JSON has canonical + display                                                                                                        |
| 6   | Lifecycle projections from GetStatus | No local `VALID_TRANSITIONS` re-filter                                                                                                                          |
| 7   | Text omits duplicated review files   | `review:` header without file lists; overlap peers still printed; no invalidation `OVERLAP_CONFLICT` line                                                       |
| 8   | Text blockers include check labels   | `! CODE — label: message`                                                                                                                                       |
| 9   | Schema version warning               | stderr vs `lifecycle.schemaInfo`; skip if null; exit 0                                                                                                          |
| 10  | Change not found                     | exit 1, `error:`                                                                                                                                                |
| 11  | Schema-derived fields                | Nested `schema.artifactDag` via `artifactDag()` / `childrenOf`; `hasTasks` OR `taskCompletionCheck`; text DAG display status; convergent nodes once; cached DAG |
| 12  | Delegates refresh to GetStatus       | No direct refresh / detector                                                                                                                                    |
| 13  | Implementation section               | `--implementation` uses SDK `buildImplementationReview`                                                                                                         |
| 14  | Task completion in details           | `tasks: N/M`                                                                                                                                                    |
| 15  | Basic info                           | name/state; no standalone `specs:` list                                                                                                                         |
| 16  | Specs and dependencies               | text section + JSON `specDependsOn`                                                                                                                             |

### Implementation Status

| Requirement                    | Status      | Evidence                                                                                                                                                |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Command signature            | Implemented | `registerChangeStatus`: `status <name>`, `--format`, `--implementation`                                                                                 |
| 2 Drafted read-only            | Implemented | `draftView` branch: `(drafted)`, `transitions: (none — change is drafted)`, JSON `isDrafted: true`                                                      |
| 3 Output format / DAG hasTasks | Implemented | JSON `artifactDag` maps `displayStatus` into `state`; `hasTasks` OR `taskCompletionCheck`                                                               |
| 4 DAG task tags                | Implemented | `renderDag` `taskTag`                                                                                                                                   |
| 5 Display-state                | Implemented | Details use `a.displayStatus`; DAG uses `displayStatus ?? effectiveStatus`; JSON artifacts have `state` + `displayStatus`                               |
| 6 GetStatus projections        | Implemented | Prints `lifecycle.availableTransitions` / `nextAction` as returned                                                                                      |
| 7 Review / overlap text        | Implemented | Review header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; text filter as above                                                  |
| 8 Blocker labels               | Implemented | `b.label` branch                                                                                                                                        |
| 9 Schema warning               | Implemented | Compare `change.schemaName@version` to `lifecycle.schemaInfo`; skip if null                                                                             |
| 10 Not found                   | Implemented | `handleError` / `ChangeNotFoundError`                                                                                                                   |
| 11 Schema-derived DAG          | Implemented | `getActiveSchema` + `schema.artifactDag()` when not raw and functions exist; else `ArtifactDag.from(schemaInfo.artifacts)`; `visited` set omits repeats |
| 12 Refresh policy              | Implemented | `status.execute({ name })` only; tests assert refresh not called                                                                                        |
| 13 Implementation section      | Implemented | `enrichImplementationTracking` → `buildImplementationReview`                                                                                            |
| 14 Details tasks               | Implemented | `tasks: complete/total`                                                                                                                                 |
| 15–16 Basic info / specs       | Implemented | No standalone `specs:`; `specs and dependencies:` after DAG                                                                                             |

**Partial notes (not HIGH/MEDIUM):**

- Draft JSON omits `artifactDag` / nested `schema.artifactDag`. Spec MAY show artifacts on drafts; payload is thinner than active JSON.
- Nested JSON `schema` **overwrites** `{ name: change.schemaName, version: change.schemaVersion }` with `schemaInfo` + `artifactDag`. Recorded vs active mismatch is only on stderr.
- Default `getActiveSchema` mock in CLI tests has no `artifactDag()`; unit tests mostly hit the `ArtifactDag.from(schemaInfo)` fallback, not the cached-schema branch.

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Help JSON schema vs emitted JSON.** Help documents `schema: { name, version }` and top-level `artifactDag`. When `schemaInfo` is present, emitted `schema` also includes `artifactDag`, `optional`, `output`, `children`. Help `artifacts[].files` omits `hasDrift` / `displayStatus`.
   - Spec-wrong: help example is abbreviated vs Schema-derived fields.
   - Code-wrong: none; nested schema is required.
   - Prefer: extend help to match nested `schema.artifactDag` and file display fields.

2. **Draft `nextAction` is not CLI-stripped.** Spec MUST NOT print actionable mutating transitions. CLI prints Core’s `nextAction.command` as-is (tests mock `command: null`). If Core sent a transition command for a draft, CLI would print it.
   - Spec vs Core contract; CLI is a projector.

3. **Text DAG without `displayStatus` falls back to `effectiveStatus`; details do not.** DAG: `displayStatus ?? effectiveStatus`. Details: always `a.displayStatus` (can print `undefined` if Core omits it). Spec assumes GetStatus supplies display status.
   - Spec-wrong if Core may omit the field.
   - Code-wrong if CLI MUST always show `complete-with-drift` even when Core only sets `hasDrift`.
   - Robustness only unless Core actually omits `displayStatus`.

### Test Coverage

Primary file: **`packages/cli/test/commands/change/status.spec.ts`**.

Covered: missing name; drafted JSON/text; refresh not called; text sections; blockers (`INCOMPLETE_ARTIFACT`); JSON lifecycle; DAG children/`hasTasks`/display state in **JSON**; overlap hide/show `OVERLAP_CONFLICT`; overlap peers; JSON `overlapDetail`; schema mismatch warning; not found; implementation section (mocked SDK adapter); details `tasks: N/M`; artifact-drift review header without paths.

`[drift]` **is** covered for `change artifacts` (`change-artifacts.spec.ts`), **not** for `change status`.

### Missing Tests (verify title vs `it()`)

| Verify scenario (spec-preview)                               | Matching `it()`                                                                                      | Gap                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| DAG fallback `[hasTasks]` when no `taskCompletion`           | —                                                                                                    | Tree test always supplies `taskCompletion`                                         |
| `hasTasks \|\| taskCompletionCheck` on text+JSON             | —                                                                                                    | Schema fixtures use `hasTasks: true` only; **taskCompletionCheck DAG still a gap** |
| Text prefers `complete-with-drift`                           | JSON-only `JSON output includes hasTasks and drift-aware state`                                      | No text DAG/details assertion for display status / `[!]`                           |
| JSON row includes canonical **and** display                  | Partial: `artifactDag.state` is display; `artifacts[].state` vs `displayStatus` not both in one test | Weak                                                                               |
| Incomplete tasks omit `verifying` from available transitions | —                                                                                                    | Pass-through; untested at CLI                                                      |
| `nextAction` implement vs verify follows GetStatus           | exists on **transition** repair guide                                                                | Status command untested                                                            |
| Artifact-review-required (not only artifact-drift)           | Drift/overlap tests are analogous                                                                    | No `reason: 'artifact-review-required'`                                            |
| Drift shown with `[drift]` in details                        | Drift test asserts `tasks.md` not path under review                                                  | Mock files omit `hasDrift`; **`[drift]` tag still a gap on status**                |
| `DEPS_INCONSISTENT` — Checking spec dependencies             | Labels only via overlap blockers                                                                     | No dedicated status label test                                                     |
| JSON `artifactDag` for custom/non-std schema                 | —                                                                                                    | Only generic schemaInfo artifacts                                                  |
| Text DAG convergent nodes once                               | —                                                                                                    | `visited` untested                                                                 |
| Cached `schema.artifactDag()` vs `ArtifactDag.from`          | —                                                                                                    | Mock schema lacks `artifactDag()`                                                  |
| Schema warning skipped when `schemaInfo` is null             | —                                                                                                    |                                                                                    |
| JSON `specDependsOn` matches manifest                        | Text specs section only; JSON lifecycle uses `{}`                                                    | No `expect(parsed.specDependsOn)`                                                  |
| `--help` lists `overlapDetail`                               | Help source includes it                                                                              | Help text not snapshotted                                                          |
| JSON still includes `OVERLAP_CONFLICT` when text hides it    | —                                                                                                    | Spec allows JSON to keep the blocker                                               |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`.

- `kernel.specs.getActiveSchema` is used for cached `artifactDag()`, not to recompute lifecycle. Compatible with `core:get-status` if `schemaInfo` remains the lifecycle snapshot.
- Implementation tracking goes through SDK review.
- Entrypoint help-schema completeness: LOW #1.

### Counts (`cli:change-status`)

| Metric                                      | Count                                     |
| ------------------------------------------- | ----------------------------------------- |
| Requirements                                | 16                                        |
| Implemented                                 | 16                                        |
| Partial                                     | 0 (draft JSON thinner; not a failed MUST) |
| Missing implementation                      | 0                                         |
| HIGH                                        | 0                                         |
| MEDIUM                                      | 0                                         |
| LOW                                         | 3                                         |
| Verify scenarios without a dedicated `it()` | 16 (table above)                          |

---

## Spec: `cli:change-transition`

### Requirements Summary

| #   | Requirement                           | Intent                                                                                  |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Command signature                     | `<step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope`; `--format`                |
| 2   | Next-transition resolution            | `--next` → `to: 'next'` (no local routing table)                                        |
| 3   | Delegates refresh to TransitionChange | Pre/post GetStatus `refreshImplementationTracking: false`                               |
| 4   | Approval-gate routing                 | No approval flags on execute; no rewrite to pending gates                               |
| 5   | Hook execution                        | Map `--skip-hooks` to `skipHookPhases`                                                  |
| 6   | Progress output                       | Generic check-progress bus `stream: "change-transition"` (never `hook-progress`)        |
| 7   | Transition hook observability         | Progress visible even if hook later fails                                               |
| 8   | Shared hook progress presentation     | Distinct stream from `run-hooks`                                                        |
| 9   | Output on success                     | Text confirmation; JSON terminal `complete` with `ok`                                   |
| 10  | Post-hook failure                     | Exit 2; no repair guide                                                                 |
| 11  | Invalid transition error              | Repair guide on stderr; JSON `result: "failure"` stream; labels; GetStatus `nextAction` |
| 12  | Incomplete tasks error                | Exit 1 naming artifact                                                                  |
| 13  | Check progress rendering              | Gerund labels; no `Executing:`                                                          |
| 14  | Unsatisfied requires                  | Surface Core blockers; repair guide from GetStatus                                      |

### Implementation Status

| Area                                                             | Status                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| Signature / `--next` / skip / allowOutOfScope                    | Implemented (`transition.ts`)                            |
| Pre-status refresh false + drafted block                         | Implemented                                              |
| Execute input (no approval flags; allowOutOfScope only if flag)  | Implemented                                              |
| Check presenter `change-transition`                              | Implemented (`_check-progress-presenter.ts`)             |
| Text success `transitioned name: from → to`                      | Implemented                                              |
| JSON complete ok                                                 | Implemented                                              |
| JSON complete failure + blockers/nextAction                      | Implemented (`result: 'failure'`, `to: requestedTarget`) |
| Repair guide stderr; HookFailedError → handleError exit 2        | Implemented                                              |
| Repair guide from GetStatus `nextAction`                         | Implemented (`writeTextRepairGuide`)                     |
| Progress: requires-check / task-completion-failed / transitioned | Implemented                                              |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Repair-guide example vs actual first line.** Spec example: `error: cannot transition to <step>`. Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Tests assert the Core message.
   - Spec-wrong if the example is a literal contract.
   - Code-wrong if the example MUST be the first line.
   - Prefer: treat example as illustrative; spec already says GetStatus drives the guide body.

2. **JSON `--next` failure `to` field.** Failure record uses `to: requestedTarget`, which can be `'next'` rather than a resolved state. Spec lists `from`/`to` on the complete record.
   - Spec-wrong: `to` may mean requested target including `'next'`.
   - Code-wrong: agents expecting a concrete lifecycle state.
   - Edge: Core rejection of `to: 'next'` may go through `handleError` (`HappyPathNextUnavailableError`) instead of the repair-guide JSON path.

### Test Coverage

File: `packages/cli/test/commands/change/transition.spec.ts` (approval-flag overlap also in `change.spec.ts`).

Covered: missing args; `--next` vs step exclusivity; `to: 'next'`; allowOutOfScope on/off; no approval flags; no pending rewrite; hook failure exit 2 without repair guide; hook progress before fail; JSON **success** stream + no `hook-progress`; gerund progress / no `Executing:`; illegal transition; repair guide with **`INCOMPLETE_ARTIFACT`**; approval-required stderr; `--next` from pending-spec-approval / pending-signoff / archivable; skip-hooks parse; incomplete tasks; repair guide verify skill from GetStatus; ReadOnlyWorkspace / ArchiveDependency / ArchiveImplementation repair guides; refresh false on status calls.

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                     | Matching `it()`                        | Gap                                                                        |
| ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Structured **failure** terminal `complete` with `result: "failure"` | JSON success stream only               | **JSON failure stream still a gap** (code writes it)                       |
| Repair guide not on stdout (JSON mode)                              | Text mode asserted                     | JSON failure path untested                                                 |
| `--skip-hooks target.pre` vs `source.post` **execution**            | Parse `skipHookPhases` set             | Does not prove Core hook behaviour (CLI maps flags only)                   |
| Unsatisfied requires surfaced                                       | Repair guide uses Core blockers        | No dedicated `requires` event / requires-only case                         |
| `--next` rejected from `archiving`                                  | pending/signoff/**archivable** covered | `archiving` state not a dedicated `--next` case (spec lists it with those) |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.

- CLI does not bake approval routing; refresh owned by TransitionChange.
- Repair guide second GetStatus uses `refreshImplementationTracking: false`.
- “Status omitted verifying before failed transition” is a **status** scenario; transition tests do not call the status command.

### Counts (`cli:change-transition`)

| Metric                           | Count |
| -------------------------------- | ----- |
| Requirements (spec.md groups)    | 14    |
| Implemented                      | 14    |
| HIGH                             | 0     |
| MEDIUM                           | 0     |
| LOW                              | 2     |
| Notable missing `it()` vs verify | 5     |

---

## Spec: `cli:change-approve`

### Requirements Summary

| #   | Requirement                    | Intent                                                                            |
| --- | ------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + `--format`                              |
| 2   | Delegates gate state to kernel | No gate flags; `kernel.changes.approve*` not `kernel.specs.*`                     |
| 3   | Artifact hash computation      | No CLI hashes                                                                     |
| 4   | Approve spec behaviour         | From `ready` (drain `pending-spec-approval`); no pending print; bound-`from` help |
| 5   | Approve signoff behaviour      | From `done` (drain `pending-signoff`); bound-`from` help                          |
| 6   | Output on success              | Text `approved <gate> for <name>`; JSON `{ result, gate, name }`                  |
| 7   | Error cases                    | Missing `--reason` / unknown sub-verb / wrong state / not found → exit 1          |

### Implementation Status

All Implemented in `approve.ts`: `requiredOption('--reason')`; execute `{ name, reason }` only; help uses bound-from language (`ready` / `done` + drain). Does not print `pending-spec-approval` / `moved`.

Handler never calls `kernel.changes.status`; tests still mock it. Harmless.

### Discrepancies

**HIGH / MEDIUM / LOW:** none on the CLI command itself.

### Test Coverage

File: `packages/cli/test/commands/change/approve.spec.ts`.

Covered: success text/JSON spec and signoff; execute shape `{ name, reason }`; stay in ready/done messaging; drain from pending states; missing reason; unknown sub-verb `review`; not found; wrong state (`ApprovalGateDisabledError`).

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                  | Matching `it()`                                     | Gap                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `approvalsSpec` / `approvalsSignoff` not on input                | Implied by `toHaveBeenCalledWith({ name, reason })` | No explicit `not.toHaveProperty('approvalsSpec')` (transition has this pattern)                       |
| Routed through `kernel.changes.approveSpec` not `kernel.specs.*` | Uses `kernel.changes.approveSpec.execute`           | No `expect(kernel.specs.approveSpec).not.toHaveBeenCalled()` (mock kernel has no `specs.approveSpec`) |
| Hashes computed by use case, CLI did not pass hashes             | Call shape has no hash fields                       | No history/hash assertion (Core’s job)                                                                |
| Help bound-`from` language                                       | —                                                   | Help strings untested                                                                                 |

None of these are implementation gaps.

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-checks`.

- Gate enablement baked in kernel matches `core:transition-checks`.
- No contradiction with global CLI error/format conventions.

### Counts (`cli:change-approve`)

| Metric                   | Count             |
| ------------------------ | ----------------- |
| Requirements             | 7                 |
| Implemented              | 7                 |
| HIGH                     | 0                 |
| MEDIUM                   | 0                 |
| LOW                      | 0                 |
| Missing dedicated `it()` | 4 (coverage nits) |

---

## Spec: `cli:change-archive`

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                               |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature            | Canonical `specd changes archive <name>` + singular alias; `--skip-hooks`; `--allow-overlap`; `--allow-out-of-scope` |
| 2   | Prerequisites                | Must be `archivable`; error names current state                                                                      |
| 3   | Behaviour                    | Delegate to `ArchiveChange` (merge, move, history)                                                                   |
| 4   | Hook execution               | Map skip set                                                                                                         |
| 5   | Check progress rendering     | Gerund bus; no `Executing:`                                                                                          |
| 6   | Post-archive hooks           | Post-hook fail exit 2                                                                                                |
| 7   | Output on success            | Text archive path; invalidated section only when non-empty                                                           |
| 8   | Output on success (extended) | Invalidated list with `--allow-overlap`                                                                              |
| 9   | JSON output on success       | NDJSON `stream: "change-archive"` complete record (no second unwrapped `{ result: "ok" }`)                           |
| 10  | Error cases                  | not found / not archivable / merge fail exit 1                                                                       |

### Implementation Status

| Area                                                             | Status                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Flags + skip set + optional allow flags                          | Implemented                                                                    |
| Progress presenter `change-archive` (text stderr, JSON stdout)   | Implemented                                                                    |
| Text success + invalidated list                                  | Implemented                                                                    |
| JSON stream complete only (no extra object)                      | Implemented                                                                    |
| Post-hook failures → `cliError` exit 2 before success print      | Implemented                                                                    |
| SpecOverlapError custom stderr + `--allow-overlap` hint + exit 1 | Implemented                                                                    |
| Alias                                                            | Implemented at program: `command('changes').alias('change')` in `src/index.ts` |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none vs change-archive MUST lines.

**LOW:**

1. **`SpecOverlapError` bypasses `handleError`.** Always plain stderr + `process.exit(1)`. `--format json` does not emit a structured error object on stdout.
   - Spec-wrong: `Error cases` does not mention overlap; `--allow-overlap` implies overlap is a failure. Entrypoint: errors go to stderr as `error:` (this path complies).
   - Code-wrong: JSON/TOON parity with other domain errors if entrypoint implies `handleError` for all failures.
   - Prefer: document overlap in Error cases; optionally route through `handleError` for JSON.

2. **Prerequisites “naming the current state”.** CLI relies on `InvalidStateTransitionError` / `handleError` message. Test only checks `/error:/`, not that `done` appears. If Core’s message omitted the from-state, CLI would not add it.
   - Spec-wrong: MAY be Core’s message contract.
   - Code-wrong: if CLI MUST mention state even when Core is terse.

### Test Coverage

File: `packages/cli/test/commands/change/archive.spec.ts`.

Covered: text path; post-hook exit 2 without success line; JSON complete + `archivePath` / `invalidatedChanges`; NDJSON check-start/done then complete; invalidated text/JSON; not found; missing name; not archivable; skip-hooks all/pre/post/comma; empty skip set; **allowOverlap / allowOutOfScope on/off**; gerund progress + hook bus, no `Executing:`.

### Missing Tests (verify title vs `it()`)

| Verify scenario                              | Matching `it()`                                                            | Gap                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Singular alias `specd change archive`        | Tests register on `command('change')`                                      | Does not prove `index.ts` `changes` + alias wiring                      |
| Successful archive merges deltas / moves dir | Mocked use case only                                                       | CLI does not re-implement; no FS assertion (correct for CLI unit tests) |
| Omit invalidated section when empty          | `confirms archive in text format` does not assert absence of `invalidated` | Weak                                                                    |
| JSON no second unwrapped object              | JSON tests parse one object or NDJSON lines                                | Implicitly OK; no explicit “only stream records”                        |
| Spec overlap error + `--allow-overlap` hint  | Implementation in `archive.ts`                                             | **No `SpecOverlapError` test**                                          |
| Delta merge conflict/parse error             | —                                                                          | Relies on handleError                                                   |
| Error mentions current state (`done`)        | `exits 1 when change is not in archivable state`                           | Message not asserted                                                    |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks`.

- Plural canonical + singular alias matches `cli:command-resource-naming` via parent alias.
- `--allow-out-of-scope` documented as `impl.linksInScope` — consistent with transition.
- Check-progress labels match `core:transition-checks` gerund bus.
- LOW overlap with entrypoint structured-error path (see above).

### Counts (`cli:change-archive`)

| Metric                 | Count |
| ---------------------- | ----- |
| Requirements           | 10    |
| Implemented            | 10    |
| HIGH                   | 0     |
| MEDIUM                 | 0     |
| LOW                    | 2     |
| Notable missing `it()` | 7     |

---

## Batch summary (CLI assigned specs)

| Spec                    | Requirements | Implemented | HIGH  | MEDIUM | LOW   | Impl gaps |
| ----------------------- | ------------ | ----------- | ----- | ------ | ----- | --------- |
| `cli:change-status`     | 16           | 16          | 0     | 0      | 3     | 0         |
| `cli:change-transition` | 14           | 14          | 0     | 0      | 2     | 0         |
| `cli:change-approve`    | 7            | 7           | 0     | 0      | 0     | 0         |
| `cli:change-archive`    | 10           | 10          | 0     | 0      | 2     | 0         |
| **Unique totals**       | **47**       | **47**      | **0** | **0**  | **7** | **0**     |

**Prior MEDIUMs:** remain closed. Repair-guide copy is `INCOMPLETE_ARTIFACT` in spec + tests. Overlap text filter and archive skippable flags remain implemented.

**Highest-value missing tests (not discrepancies):**

1. `status.spec.ts`: `taskCompletionCheck` without `hasTasks: true` → JSON + text DAG tags.
2. `status.spec.ts`: text `complete-with-drift` / `[drift]` (`hasDrift: true` on details files).
3. `transition.spec.ts`: JSON `event.result.result === 'failure'` complete record on the `change-transition` stream.
4. `archive.spec.ts`: `SpecOverlapError` stderr + `Use --allow-overlap` hint.
