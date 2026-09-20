# Batch: cli

Audit of change `workflow-transition-checks` against spec-preview for `cli:change-status`, `cli:change-transition`, and `cli:change-archive`. Graph was current (`stale: false`). Navigation used `specd graph search` / `specd graph impact` then targeted reads. No code or spec files were modified.

Focus: CLI must **present** engine check progress, blockers, and repair data from GetStatus / TransitionChange / ArchiveChange predicates. It must not re-filter the protocol graph (`VALID_TRANSITIONS`) or invent a second rule engine.

---

## Per spec: `cli:change-status`

### Requirements summary

| ID  | Requirement                                                                    | Implementation                                                                                                                                 | Tests                                      |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| S1  | Command signature `status <name> [--format]`                                   | Implemented in `registerChangeStatus`                                                                                                          | Covered                                    |
| S2  | Drafted status is read-only                                                    | Implemented (`draftView` path, `isDrafted`, no transition list)                                                                                | **Missing** CLI tests                      |
| S3  | JSON/toon `artifactDag` has `hasTasks`; `state` is display projection          | Implemented                                                                                                                                    | Covered                                    |
| S4  | DAG `[hasTasks - N/M done]` / fallback `[hasTasks]`                            | Implemented in `renderDag`                                                                                                                     | Partial (tree tests; counts less explicit) |
| S5  | Display-state rendering (text prefers display; JSON both)                      | Implemented                                                                                                                                    | Covered                                    |
| S6  | Lifecycle projections from GetStatus only (no local `VALID_TRANSITIONS` union) | Implemented; text prints `lifecycle.availableTransitions`; JSON copies `validTransitions` / `availableTransitions` / `nextAction` / `blockers` | Covered                                    |
| S7  | Text omits duplicated `review:` file lists; overlap peers still print          | Implemented                                                                                                                                    | Covered                                    |
| S8  | Text blockers include gerund `label` (`! CODE — label: message`)               | Implemented                                                                                                                                    | Covered                                    |
| S9  | Schema version warning from `lifecycle.schemaInfo` only                        | Implemented                                                                                                                                    | Covered                                    |
| S10 | Change not found → exit 1, `error:`                                            | Delegated to `handleError`                                                                                                                     | Covered                                    |
| S11 | Schema-derived `schema.artifactDag` via `artifactDag()` / `childrenOf`         | Implemented via `resolveStatusSchemaDag`                                                                                                       | Covered                                    |
| S12 | Delegates refresh to GetStatus (no direct refresh/detector)                    | `kernel.changes.status.execute({ name })` only                                                                                                 | Covered                                    |
| S13 | `--implementation` uses SDK `buildImplementationReview`                        | `enrichImplementationTracking`                                                                                                                 | Covered                                    |
| S14 | Details `tasks: N/M`                                                           | Implemented                                                                                                                                    | Covered                                    |
| S15 | Basic info: name/state, no standalone `specs:`                                 | Implemented                                                                                                                                    | Covered                                    |
| S16 | Specs and dependencies section + JSON `specDependsOn`                          | Implemented                                                                                                                                    | Covered                                    |

**Requirements: 16. Implemented: 16. Partial: 0. Missing: 0.**

### Implementation status

- **No second rule engine.** `packages/cli/src/commands/change/status.ts` does not import `VALID_TRANSITIONS`. Text `transitions:` is `lifecycle.availableTransitions.join`. JSON serializes GetStatus fields as-is, including optional `checks` / `checksByTarget` via `optionalCheckFields`.
- **Repair-oriented blockers** are printed from `statusResult.blockers` (code, optional label/checkId, message). No local rewrite of nextAction.
- Schema DAG uses `getActiveSchema` + `schema.artifactDag()` when the instance is real; fallback `ArtifactDag.from(schemaInfo.artifacts)` when `raw` is set. This is presentation, not lifecycle recompute. Constraint “MUST NOT call another use case to recompute **lifecycle** data” is met; schema lookup is required by S11.
- Drafted path: `transitions: (none — change is drafted)`, JSON `isDrafted: true`, still prints `nextAction` from GetStatus (verify says do not suggest `specd change transition`; code does not invent that command).

### Discrepancies

1. **Spec-internal: Examples vs Basic info (S15)**
   - **Spec:** Examples still show a top-level `specs:` line. Requirement and verify say text MUST NOT include a standalone `specs:` list.
   - **Code:** Omits `specs:`; uses `specs and dependencies:`.
   - **Verdict:** Spec drift in the Examples block. Code matches the requirement. Prefer fixing the example, not the CLI.

2. **Undeclared dependency on check payloads**
   - **Spec dependencies (preview):** `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`. No `core:transition-checks`.
   - **Code:** Passes through `lifecycle.checks` / `checksByTarget` when present.
   - **Verdict:** Extra serialization is consistent with “present engine checks.” Spec should declare `core:transition-checks` (or GetStatus check fields) so CLI is not an implicit consumer. Not an implementation bug.

3. **Convergent DAG nodes**
   - **Spec:** Render each artifact id at most once; MAY omit or annotate `see <id> above`.
   - **Code:** `visited.has(id)` returns without a reference line.
   - **Verdict:** Allowed by MAY omit. Weaker UX, still compliant.

### Test coverage

Covered well: signature, not-found, schema warning, DAG childrenOf, display/drift, availableTransitions vs protocol edges, nextAction verify vs implement, blocker labels, review/overlap text, implementation section, specDependsOn, refresh not called.

**Missing tests (verify scenarios with no CLI test):**

- Drafted change does not list transition commands / JSON `isDrafted` / discarded name via status (S2, four verify scenarios). Implementation exists; `change-status.spec.ts` and `change/change-status.spec.ts` have **zero** `draftView` cases.
- DAG `[hasTasks - 3/10 done]` vs fallback `[hasTasks]` not asserted as clearly as verify.md (tree tests exist).

### Spec dependency chain

- Aligns with `core:get-status` (serialize projections).
- Gap: no explicit dependsOn for `core:transition-checks` despite check rows in JSON.
- Global: CLI remains a presenter; invariants stay in core.

### Summary counts (`cli:change-status`)

| Metric                     | Count                             |
| -------------------------- | --------------------------------- |
| Requirements               | 16                                |
| Implemented                | 16                                |
| Partial                    | 0                                 |
| Missing implementation     | 0                                 |
| Discrepancies (actionable) | 2 spec-side, 0 code-side blockers |
| Verify scenarios (approx.) | 35                                |
| Scenarios with CLI tests   | ~31                               |
| Missing/weak tests         | 4 drafted + 2 DAG hasTasks tags   |

---

## Per spec: `cli:change-transition`

### Requirements summary

| ID  | Requirement                                                                                       | Implementation                                          | Tests                                                         |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| T1  | Signature: `<name> [step]`, `--next`, `--skip-hooks`, `--format`                                  | Implemented                                             | Covered                                                       |
| T2  | `--next` mapping + refuse pending/archivable                                                      | Implemented; extra `signed-off → archivable`            | Covered for listed refusals                                   |
| T3  | Refresh: pre-status and repair GetStatus with `refreshImplementationTracking: false`; no detector | Implemented                                             | Covered                                                       |
| T4  | No approval flags / no rewrite to pending parking states                                          | `execute({ name, to, skipHookPhases })` only            | Covered (code + tests **match spec.md**, not leftover verify) |
| T5  | `--skip-hooks` → `skipHookPhases`                                                                 | Implemented                                             | Covered                                                       |
| T6  | Progress via `onProgress`                                                                         | Implemented                                             | Covered                                                       |
| T7  | Hook observability during failure                                                                 | Check bus before `HookFailedError`                      | Covered                                                       |
| T8  | Shared hook presentation with `run-hooks`                                                         | **Partial / conflict**                                  | Tests cover check-bus only                                    |
| T9  | Success text stdout; JSON/TOON terminal `stream: change-transition` `complete`                    | Implemented                                             | Covered                                                       |
| T10 | Hook failure exit 2, not post-transition warning                                                  | `handleError` / not repair-guide                        | Covered                                                       |
| T11 | Invalid transition + Repair Guide from GetStatus                                                  | `writeTextRepairGuide` from blockers + `nextAction`     | Covered                                                       |
| T12 | Incomplete tasks error names artifact; status already omitted `verifying`                         | CLI surfaces engine error; status omission is GetStatus | Covered at CLI for error                                      |
| T13 | Check progress: gerund `<label> (<id>)`, `✓`/`✗`, no `Executing:`; hooks on same bus              | `createCheckProgressPresenter`                          | Covered                                                       |
| T14 | Unsatisfied requires → exit 1; repair from core                                                   | Via engine + repair guide                               | Covered                                                       |

**Requirements: 14. Implemented: 13. Partial: 1 (T8). Missing: 0.**

### Implementation status

- **Not a second rule engine.** Target validation is “is this a `ChangeState` name?” (`CHANGE_STATES`). Availability is not computed in CLI. `--next` is a **fixed human shortcut table**, then `TransitionChange.execute`. Repair guide copies `status.blockers` and `status.nextAction` after a failed execute; no local `VALID_TRANSITIONS` filter.
- **Check progress is the public bus.** `makeProgressRenderer` routes `check-start` / `check-progress` / `check-done` through `createCheckProgressPresenter` (`streamName: 'change-transition'`). Legacy events `requires-check`, `task-completion-failed`, `transitioned` still render on the same stream (text: stderr).
- **Repair guide** (text): stderr `error:` + `! CODE — label: message` + `repair guide:` from GetStatus. JSON failure: stdout complete record with `blockers` and `nextAction`.
- Graph: `registerChangeTransition` → presenter + GetStatus; impact shows no local protocol filter.

### Discrepancies

1. **Spec vs verify vs code: approval-gate routing (T4)**
   - **spec.md:** CLI MUST NOT rewrite `implementing` → `pending-spec-approval` or `archivable` → `pending-signoff`. User names the delivery target.
   - **verify.md (preview):** still says `transition implementing` **THEN** state becomes `pending-spec-approval` and stdout shows that rewrite; same for signoff. `--next` from ready “honors approval routing” to pending-spec-approval.
   - **Code/tests:** `to: 'implementing'` / `to: 'archivable'`; stdout `ready → implementing`, not parking states.
   - **Verdict:** Implementation matches **spec.md** and the change intent. **verify.md is stale.** Fix verify (and any core scenarios that still describe CLI rewrite). Possible readings: spec correct / verify wrong (preferred); or product still wants parking rewrite in core (CLI would still not rewrite).

2. **Spec vs code: structured hook stream (T6 vs T13)**
   - **Progress output + verify “Structured formats emit progress”:** hook lifecycle events MUST use `stream: "hook-progress"`; transition events use `change-transition`.
   - **Check progress rendering:** hooks MUST ride the **same** bus (`Running pre/post hooks`), not a separate public contract.
   - **Code/tests:** hook `check-*` records use `stream: "change-transition"`. No `hook-progress` on this command.
   - **Verdict:** Internal spec contradiction. Code follows the **new check-progress** requirement (correct for this change). Progress-output / that verify scenario are spec drift. Prefer deleting `hook-progress` from `cli:change-transition` JSON contract.

3. **Shared helper with `run-hooks` (T8)**
   - **Spec:** MUST centralize presentation in a shared helper (`run-hooks` and `transition`) so labels/tail/liveness/failed output do not drift.
   - **Code:** `run-hooks` still uses `createHookProgressPresenter` (`_hook-progress-presenter.ts`, comment still says it is used by transition). Transition uses `_check-progress-presenter.ts`. Duplicate ANSI stripping, different event shapes, different JSON `stream` names.
   - **Verdict:** Implementation gap vs T8 **or** T8 is obsolete after the check bus. Recommended: update T8 to “transition/archive share `createCheckProgressPresenter`; `run-hooks` may keep hook-progress until it is remapped,” **or** adapt `run-hooks` onto the check bus. Do not keep both as the same public contract.

4. **Repair guide destination (T11 verify)**
   - **verify.md:** `repair guide:` section **to stdout**.
   - **spec.md example** does not name the stream; constraints say text progress on stderr, confirmation on stdout.
   - **Code/tests:** entire guide on **stderr**.
   - **Verdict:** Verify scenario wrong (or underspecified). Code is consistent with “progress/diagnostics on stderr.” Update verify to stderr.

5. **HookFailedError vs Repair Guide (T10 vs T11)**
   - **T11 spec.md:** “When the transition fails (e.g. `InvalidStateTransitionError`, `HookFailedError`), MUST render a Repair Guide.”
   - **T10:** hook failure exit **2**, no separate post-hook warning.
   - **Code:** `isRepairGuideError` does **not** include `HookFailedError`; hooks get check-bus `✗` then exit 2.
   - **Verdict:** Spec contradiction. Code matches T10 + T13 (preferred). Remove HookFailedError from the Repair Guide bullet.

6. **`--next` extra edge**
   - **Spec table** omits `signed-off → archivable`.
   - **Code:** maps `signed-off` to `archivable`.
   - **Verdict:** Spec incomplete (likely desirable). Document it; not a second engine.

### Test coverage

Strong: signature, `--next` refusals, skip-hooks, check-bus gerunds, no `Executing:`, JSON NDJSON complete records, repair guide from GetStatus (including verify skill, DEPS/read-only/impl errors), incomplete tasks, hook fail exit 2 with prior check output, no CLI approval rewrite.

**Missing/weak:**

- No test that JSON hook events are **not** `stream: hook-progress` against the old verify line (tests encode the new contract).
- No test that `run-hooks` and `transition` share one presenter (they do not).
- `signed-off --next` untested.
- Repair guide on stdout vs stderr: tests lock stderr (good vs code, bad vs verify.md).

### Spec dependency chain

Preview dependsOn: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.  
**Missing `core:transition-checks`** even though T13 is entirely that bus. Archive spec already lists it. Status/transition CLI specs should too.

Conflicts with leftover `cli:change-transition` progress/`hook-progress` text and with `cli:change-run-hooks` presenter comment.

### Summary counts (`cli:change-transition`)

| Metric                     | Count                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Requirements               | 14                                                         |
| Implemented                | 13                                                         |
| Partial                    | 1 (shared hook presenter)                                  |
| Missing implementation     | 0                                                          |
| Discrepancies              | 6 (mostly spec/verify drift; 1 dual-presenter)             |
| Verify scenarios (approx.) | 39                                                         |
| Scenarios matching code    | ~32                                                        |
| Stale verify scenarios     | ~5 (approval rewrite, hook-progress stream, repair stdout) |

---

## Per spec: `cli:change-archive`

### Requirements summary

| ID  | Requirement                                                                                                        | Implementation                                                        | Tests                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| A1  | Signature: `changes archive` canonical, `change archive` alias; skip-hooks pre/post/all; `--allow-overlap`; format | Registered on `changes` with `change` alias at group; options present | Missing name / skip-hooks covered; alias via group |
| A2  | Must be `archivable`; else exit 1 naming state                                                                     | Delegated to `ArchiveChange`                                          | Covered                                            |
| A3  | Delegates merge/move/history to use case                                                                           | `kernel.changes.archive.execute`                                      | Covered (unit, mocked)                             |
| A4  | `--skip-hooks` → archive phase set                                                                                 | Implemented                                                           | Covered (all, pre+post, default empty)             |
| A5  | Check progress: gerund bus, no `Executing:`; hooks on same bus                                                     | `createCheckProgressPresenter` (`streamName: 'change-archive'`)       | Covered (text)                                     |
| A6  | Post-archive hook failures → exit 2                                                                                | `cliError(..., 2)`                                                    | Covered                                            |
| A7  | Success text: path; omit invalidated section if empty                                                              | Implemented                                                           | Covered                                            |
| A8  | Extended: invalidated N overlapping changes                                                                        | Implemented                                                           | Covered                                            |
| A9  | JSON success: `result`, `name`, `archivePath`                                                                      | Terminal object on stdout                                             | Covered **without** concurrent progress            |
| A10 | Errors: not found / not archivable / merge fail → exit 1                                                           | `handleError` / overlap special-case                                  | Covered not-found and not-archivable               |

**Requirements: 10. Implemented: 10. Partial: 0 (JSON+progress coexistence underspecified). Missing: 0.**

### Implementation status

- Archive CLI is a thin presenter: maps flags, passes `onProgress` into `ArchiveChange`, prints result. No local archivable-state machine beyond forwarding.
- Check progress uses the **same presenter module** as transition (good: one CLI check renderer, not a second engine).
- Extra undocumented flag: `--allow-out-of-scope` forwarded when set. Not in spec-preview. Additive; should be specced or dropped from public help.

### Discrepancies

1. **JSON success vs check-progress stream (A5 + A9)**
   - **A9 / verify:** stdout is **valid JSON** with `result`, `name`, `archivePath`.
   - **A5 + help text:** JSON also emits `{ stream: "change-archive", event }` lines, then a **non-stream** terminal object `{ result, name, archivePath, invalidatedChanges }`.
   - **Code:** json check events go to **stdout**; then `writeStructuredRecord` of the terminal payload. Combined stdout is **NDJSON**, not one JSON document. Text mode is fine (progress on stderr).
   - **Verdict:** Dual-use of stdout. Either: (a) progress JSON on stderr / omit progress in json, or (b) wrap the terminal result as a stream `complete` record like transition, and update A9. Tests only cover JSON **without** emitting progress. Spec and code both incomplete relative to each other.

2. **`--allow-out-of-scope`**
   - Present in CLI, absent from spec-preview. Spec drift (undocumented surface).

3. **Singular alias verify**
   - Spec: `specd change archive` is alias of `specd changes archive`.
   - Code: parent is `changes` with `.alias('change')`. Compliant. No dedicated archive test for the alias (group-level tests may exist elsewhere).

### Test coverage

Covered: success text/JSON, invalidated lists, not found, missing name, not archivable, skip-hooks all / pre+post / default, post-hook exit 2, text check progress (workspace.readOnly + Running pre hooks, no `Executing:`).

**Missing:** isolated skip `pre` only and `post` only; JSON archive **with** check-progress events; `--allow-out-of-scope`; alias invocation.

No `_check-progress-presenter.spec.ts`; coverage is command-level only.

### Spec dependency chain

Preview correctly includes `core:transition-checks` plus `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`. Aligns with A5. JSON wrapping should stay consistent with `cli:change-transition` once that stream story is unified.

### Summary counts (`cli:change-archive`)

| Metric                 | Count                                               |
| ---------------------- | --------------------------------------------------- |
| Requirements           | 10                                                  |
| Implemented            | 10                                                  |
| Partial                | 0                                                   |
| Missing implementation | 0                                                   |
| Discrepancies          | 2 (JSON+progress; extra flag)                       |
| Verify scenarios       | 16                                                  |
| Scenarios with tests   | ~12                                                 |
| Missing tests          | skip-pre-only, skip-post-only, JSON+progress, alias |

---

## Batch totals

| Metric                                        | `change-status` | `change-transition` | `change-archive`              | Batch  |
| --------------------------------------------- | --------------- | ------------------- | ----------------------------- | ------ |
| Requirements                                  | 16              | 14                  | 10                            | **40** |
| Implemented                                   | 16              | 13                  | 10                            | **39** |
| Partial                                       | 0               | 1                   | 0                             | **1**  |
| Missing implementation                        | 0               | 0                   | 0                             | **0**  |
| Code-side blockers (CLI re-implements engine) | 0               | 0                   | 0                             | **0**  |
| Spec/verify drift findings                    | 2               | 5                   | 2                             | **9**  |
| Dual-presenter / contract conflict            | 0               | 1                   | (shares transition presenter) | **1**  |
| Missing/weak test clusters                    | 2               | 2                   | 3                             | **7**  |

### Batch conclusion

CLI status, transition, and archive **do present engine check/repair data** and **do not** apply a second `VALID_TRANSITIONS` filter. Status copies GetStatus `availableTransitions`, `nextAction`, labeled blockers, and optional `checks` / `checksByTarget`. Transition and archive render `check-start` / `check-progress` / `check-done` with gerund labels and no `Executing:` prefix; repair guides copy GetStatus.

The remaining work is **spec hygiene and one presenter-unification decision**, not a hidden CLI rule engine:

1. Rewrite `cli:change-transition` verify (and leftover Progress JSON) so approval parking is **not** a CLI rewrite, hooks use the **check** bus (`change-transition` / `change-archive` streams), repair guide is **stderr**, and `HookFailedError` is **exit 2** not a repair guide.
2. Resolve **T8**: either document two presenters (`run-hooks` vs check bus) or migrate `run-hooks` onto `_check-progress-presenter.ts`.
3. Add **drafted status** CLI tests; clarify **archive JSON** when checks emit; spec `--allow-out-of-scope` or hide it.
4. Add `core:transition-checks` to `cli:change-status` and `cli:change-transition` dependsOn (archive already has it).
