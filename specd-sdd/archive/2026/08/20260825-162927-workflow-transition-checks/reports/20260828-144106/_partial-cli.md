# Spec-compliance partial: CLI change commands

- **Mode:** change `workflow-transition-checks` (assigned specs only)
- **Auditor:** read-only; graph `stale: false` (`lastIndexedAt` 2026-08-28T12:41:48Z, `currentRef` 2948f1a2)
- **Sources:** `specd changes spec-preview workflow-transition-checks` for `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`, `_implementation-tracking.ts`; tests under `packages/cli/test/commands/change/`
- **Neither spec nor code is treated as sole truth.** Each finding lists spec-drift vs implementation-bug interpretations.

---

## Previous MEDIUM re-check

### 1. Text status MUST NOT print `OVERLAP_CONFLICT` when `review.reason` is `spec-overlap-conflict`; live archivable overlap MAY print it

**Status: resolved (implementation + tests).**

- Spec (`cli:change-status`): invalidation overlap must not appear as a text `OVERLAP_CONFLICT` blocker line; live overlap may still print it.
- Code (`status.ts`): text blockers are `blockers.filter(code !== 'OVERLAP_CONFLICT')` **only when** `review?.reason === 'spec-overlap-conflict'`. Otherwise all blockers, including `OVERLAP_CONFLICT`, are printed with optional gerund labels.
- JSON/TOON still serializes the unfiltered `blockers` array (spec only forbids the **text** line).
- Tests in `packages/cli/test/commands/change/status.spec.ts`:
  - `hides OVERLAP_CONFLICT in text when review reason is spec-overlap-conflict`
  - `prints live OVERLAP_CONFLICT when review is not spec-overlap-conflict` (archivable change, `review.reason` null)
  - overlap-peer scenario also `expect(out).not.toContain('OVERLAP_CONFLICT')`

**Residual (LOW, not a regression of the MEDIUM):** if Core ever attached `review.reason: 'spec-overlap-conflict'` **and** a live `OVERLAP_CONFLICT` blocker in the same payload, text would hide **all** `OVERLAP_CONFLICT` lines. Spec does not describe that combination; Core is expected not to mix them.

### 2. Text DAG `hasTasks` aligned with JSON (`hasTasks || taskCompletionCheck`)

**Status: resolved (implementation).**

- Spec schema-derived fields: `hasTasks` is true when explicit `hasTasks: true` **or** `taskCompletionCheck` is declared.
- Spec task-completion DAG wording still says “when a schema artifact type has `hasTasks: true`”; jointly with schema-derived fields, JSON and text must use the same boolean.
- Code uses the same expression in three places (`renderDag`, JSON `artifactDag`, nested `schema.artifactDag`):
  `artifact.hasTasks === true || artifact.taskCompletionCheck !== undefined`
- **Coverage gap (missing test, not a code mismatch):** CLI tests only drive `hasTasks: true` on schema artifacts. There is no `it()` that sets `hasTasks: false` + `taskCompletionCheck` and asserts both JSON `hasTasks: true` and text `[hasTasks]`.

### 3. Artifact-drift CLI tests live in `packages/cli/test/commands/change/status.spec.ts`

**Status: resolved.**

- `describe('artifact-drift review rendering')` in that file (not a stray core/SDK file).
- Tests: omits duplicated review file paths under `review:`; JSON still includes `review.affectedArtifacts` with filename and absolute path.
- **Coverage gap:** the text scenario in verify.md also requires `[drift]` on details rows. The mock files omit `hasDrift: true`, so the test never asserts `[drift]`. Implementation does append ` [drift]` when `file.hasDrift` is true.

---

## Spec: `cli:change-status`

### Requirements Summary

| Requirement                          | Intent                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                    | `specd change status <name> [--format text\|json\|toon]`                                                                                                        |
| Drafted status is read-only          | No mutating transitions; mark drafted; MAY show artifacts                                                                                                       |
| Output format                        | JSON/TOON `artifactDag[].hasTasks`; `state` is display projection (e.g. `complete-with-drift`)                                                                  |
| Task completion display in DAG       | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` remains boolean                                                                               |
| Display-state rendering              | Text prefers display state; JSON has canonical + display                                                                                                        |
| Lifecycle projections from GetStatus | No local `VALID_TRANSITIONS` re-filter                                                                                                                          |
| Text omits duplicated review files   | `review:` header without file lists; overlap peers still printed; no invalidation `OVERLAP_CONFLICT` line                                                       |
| Text blockers include check labels   | `! CODE — label: message`                                                                                                                                       |
| Schema version warning               | stderr warning vs `lifecycle.schemaInfo`; skip if null; exit 0                                                                                                  |
| Change not found                     | exit 1, `error:`                                                                                                                                                |
| Schema-derived fields                | Nested `schema.artifactDag` via `artifactDag()` / `childrenOf`; `hasTasks` OR `taskCompletionCheck`; text DAG display status; convergent nodes once; cached DAG |
| Delegates refresh to GetStatus       | No direct refresh / detector                                                                                                                                    |
| Implementation section               | `--implementation` uses SDK `buildImplementationReview`                                                                                                         |
| Task completion in details           | `tasks: N/M`                                                                                                                                                    |
| Basic info                           | name/state; no standalone `specs:` list                                                                                                                         |
| Specs and dependencies               | text section + JSON `specDependsOn`                                                                                                                             |

### Implementation Status

| Requirement                  | Status      | Evidence                                                                                                                                                        |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature            | Implemented | `registerChangeStatus`: `status <name>`, `--format`, `--implementation`                                                                                         |
| Drafted read-only            | Implemented | `draftView` branch: `(drafted)`, `transitions: (none — change is drafted)`, JSON `isDrafted: true`                                                              |
| Output format / DAG hasTasks | Implemented | JSON `artifactDag` maps `displayStatus`; `hasTasks` OR `taskCompletionCheck`                                                                                    |
| DAG task tags                | Implemented | `renderDag` taskTag                                                                                                                                             |
| Display-state                | Implemented | Text details use `a.displayStatus`; DAG uses `displayStatus ?? effectiveStatus`; JSON artifacts have `state` + `displayStatus`                                  |
| GetStatus projections        | Implemented | Prints `lifecycle.availableTransitions` / `nextAction` as returned                                                                                              |
| Review / overlap text        | Implemented | Review header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; overlap filter as above                                                       |
| Blocker labels               | Implemented | `b.label` branch                                                                                                                                                |
| Schema warning               | Implemented | Compare `change.schemaName@version` to `lifecycle.schemaInfo`; skip if null                                                                                     |
| Not found                    | Implemented | `handleError` / `ChangeNotFoundError`                                                                                                                           |
| Schema-derived DAG           | Implemented | `getActiveSchema` + `schema.artifactDag()` when not raw; else `ArtifactDag.from(schemaInfo.artifacts)`; `visited` set for convergent ids (omit, no “see above”) |
| Refresh policy               | Implemented | `status.execute({ name })` only; tests assert refresh not called                                                                                                |
| Implementation section       | Implemented | `enrichImplementationTracking` → `buildImplementationReview`                                                                                                    |
| Details tasks                | Implemented | `tasks: complete/total`                                                                                                                                         |
| Basic info / specs section   | Implemented | No standalone `specs:`; `specs and dependencies:` after DAG                                                                                                     |

**Partial notes (not counted as HIGH/MEDIUM mismatches):**

- Draft JSON omits `artifactDag` / nested `schema.artifactDag`. Spec allows MAY for artifact inspection on drafts; JSON draft payload is thinner than active JSON.
- Nested JSON `schema` object **overwrites** the earlier `{ name: change.schemaName, version: change.schemaVersion }` with `schemaInfo` name/version + `artifactDag`. Recorded vs active mismatch is only on stderr warning.

### Discrepancies

**HIGH:** none.

**MEDIUM:** none remaining from the previous trio.

**LOW:**

1. **Help JSON schema vs emitted JSON (`cli:entrypoint` + change-status).** Help documents `schema: { name: string, version: number }` and top-level `artifactDag`, but when `schemaInfo` is present the emitted `schema` object also includes `artifactDag`, `optional`, `output`, `children`.
   - Spec drift: help example is abbreviated.
   - Implementation: richer nested schema is what `Schema-derived fields` requires.
   - Prefer: extend help to match nested `schema.artifactDag`.

2. **Draft `nextAction` is not CLI-stripped.** Spec says MUST NOT print actionable mutating transitions. CLI prints Core’s `nextAction.command` as-is (tests mock `command: null`). If Core ever sent a transition command for a draft, CLI would print it.
   - Spec vs Core contract; CLI is a projector.

3. **Text DAG without `displayStatus` falls back to `effectiveStatus`.** Spec assumes GetStatus supplies display status. Fallback can hide `complete-with-drift` if Core omits `displayStatus`. Robustness only.

### Test Coverage

Primary file: **`packages/cli/test/commands/change/status.spec.ts`** (correct location for artifact-drift).

Covered well: signature missing name; drafted JSON/text; refresh not called; text sections; blockers; JSON lifecycle; DAG children/`hasTasks`/display state in **JSON**; overlap hide/show `OVERLAP_CONFLICT`; overlap peers; JSON `overlapDetail`; schema mismatch warning; not found; implementation section (mocked SDK adapter); details `tasks: N/M`; artifact-drift review header without paths.

### Missing Tests (verify title vs `it()`)

| Verify scenario (spec-preview)                               | Matching `it()`                                                                                               | Gap                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| DAG fallback `[hasTasks]` when no `taskCompletion`           | —                                                                                                             | Tree test always supplies `taskCompletion`               |
| Text prefers `complete-with-drift`                           | JSON-only `JSON output includes hasTasks and drift-aware state`                                               | No text DAG/details assertion for display status / `[!]` |
| JSON row includes canonical **and** display                  | Partial: `artifactDag.state` is display; `artifacts[].state` vs `displayStatus` not both asserted in one test | Weak                                                     |
| Incomplete tasks omit `verifying` from available transitions | —                                                                                                             | Pass-through; untested at CLI                            |
| `nextAction` implement vs verify follows GetStatus           | — (exists on **transition** repair guide)                                                                     | Status command untested                                  |
| Artifact-review-required (not only artifact-drift)           | Drift/overlap tests are analogous                                                                             | No `reason: 'artifact-review-required'`                  |
| Drift shown with `[drift]` in details                        | Drift test asserts `tasks.md` not path under review                                                           | Missing `hasDrift` / `[drift]`                           |
| `DEPS_INCONSISTENT` — Checking spec dependencies             | Labels only asserted indirectly via overlap blockers                                                          | No dedicated status label test                           |
| JSON `artifactDag` for custom/non-std schema                 | —                                                                                                             | Only generic schemaInfo artifacts                        |
| Text DAG convergent nodes once                               | —                                                                                                             | `visited` untested                                       |
| Schema warning skipped when `schemaInfo` is null             | —                                                                                                             |                                                          |
| JSON `specDependsOn` matches manifest                        | Text specs section only; JSON lifecycle test uses `{}`                                                        | No `expect(parsed.specDependsOn)`                        |
| `hasTasks \|\| taskCompletionCheck` on text+JSON             | —                                                                                                             | Alignment untested                                       |
| `--help` lists `overlapDetail`                               | —                                                                                                             | Help text not snapshotted                                |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`.

- Uses `kernel.specs.getActiveSchema` for cached `artifactDag()`. Change-status forbids calling SchemaRegistry / extra use cases to **recompute lifecycle**; DAG structure is in-scope. No contradiction with `core:get-status` if schemaInfo remains the lifecycle snapshot.
- Implementation tracking goes through SDK review, matching `sdk:build-implementation-review`.
- Entrypoint help-schema completeness: see LOW #1.

### Counts (`cli:change-status`)

| Metric                                      | Count                                     |
| ------------------------------------------- | ----------------------------------------- |
| Requirements                                | 16                                        |
| Implemented                                 | 16                                        |
| Partial                                     | 0 (draft JSON thinner; not a failed MUST) |
| Missing implementation                      | 0                                         |
| HIGH                                        | 0                                         |
| MEDIUM                                      | 0 (3 prior MEDIUMs closed)                |
| LOW                                         | 3                                         |
| Verify scenarios without a dedicated `it()` | 12 (table above)                          |

---

## Spec: `cli:change-transition`

### Requirements Summary

Signature (`<step>` or `--next`, `--skip-hooks`, `--allow-out-of-scope`, `--format`); `--next` → `to: 'next'` (no local routing table); no direct refresh (pre/post GetStatus `refreshImplementationTracking: false`); no approval flags on execute; no rewrite to pending gates; hook skip mapping; generic check-progress bus `stream: "change-transition"` (never `hook-progress`); hook observability; text success confirmation; JSON terminal `complete` with `ok` / `failure`; hook fail exit 2 without repair guide; invalid transition repair guide on **stderr**; incomplete tasks exit 1 naming artifact; gerund progress without `Executing:`; requires blockers via Core.

### Implementation Status

| Area                                                             | Status                                             |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| Signature / `--next` / skip / allowOutOfScope                    | Implemented (`transition.ts`)                      |
| Pre-status refresh false + drafted block                         | Implemented                                        |
| Execute input (no approval flags; allowOutOfScope only if flag)  | Implemented                                        |
| Check presenter `change-transition`                              | Implemented (`_check-progress-presenter.ts`)       |
| Text success `transitioned name: from → to`                      | Implemented                                        |
| JSON complete ok                                                 | Implemented                                        |
| JSON complete failure + blockers/nextAction                      | Implemented                                        |
| Repair guide stderr; HookFailedError → handleError exit 2        | Implemented                                        |
| Progress: requires-check / task-completion-failed / transitioned | Implemented (text on stderr; structured on stdout) |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Repair-guide example vs actual first line.** Spec example: `error: cannot transition to <step>`. Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Example is illustrative; Core message is richer. Spec-drift if the example is taken as a literal contract.

2. **JSON `--next` failure `to` field.** Failure record uses `to: requestedTarget` which can be `'next'` rather than a resolved state. Spec lists `from`/`to` on the complete record; Core rejection of `to: 'next'` may never hit the repair-guide JSON path (handleError instead). Edge only.

### Test Coverage

File: `packages/cli/test/commands/change/transition.spec.ts` (plus overlapping cases in `change.spec.ts` for approval flags).

Covered: missing args; `--next` vs step exclusivity; `to: 'next'`; allowOutOfScope on/off; no approval flags; no pending rewrite; hook failure exit 2 without repair guide; hook progress before fail; JSON success stream + no `hook-progress`; gerund progress / no `Executing:`; illegal transition; repair guide; approval-required stderr; `--next` from pending-spec-approval / pending-signoff / archivable; skip-hooks parse; incomplete tasks; repair guide verify skill; ReadOnlyWorkspace / ArchiveDependency / ArchiveImplementation repair guides; refresh false on status calls.

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                                 | Matching `it()`                    | Gap                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Structured **failure** terminal `complete` with `result: "failure"`             | —                                  | Implementation exists; no JSON parse of failure stream                     |
| `--skip-hooks target.pre` vs `source.post` **execution** (hooks skipped vs run) | Only parse `skipHookPhases` set    | Does not prove Core hook behaviour (CLI maps flags only)                   |
| Unsatisfied requires surfaced                                                   | Repair guide uses Core blockers    | No dedicated `requires` event / MISSING requires-only case                 |
| Repair guide not on stdout (JSON mode)                                          | Text mode asserted                 | JSON failure path untested                                                 |
| `--next` rejected from `archiving`                                              | pending/signoff/archivable covered | `archiving` not listed in tests (spec mentions it with pending/archivable) |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.

- Aligns with Core: CLI does not bake approval routing; refresh owned by TransitionChange.
- Repair guide second GetStatus uses `refreshImplementationTracking: false` as required.
- Change-status “status omitted verifying before failed transition” is a **status** scenario; transition tests do not call the status command. Cross-spec, not a CLI transition bug.

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

`approve spec|signoff <name> --reason` + `--format`; no gate flags on execute; `kernel.changes.approve*` not `kernel.specs.*`; no CLI hashes; spec approval from `ready` (drain `pending-spec-approval`) without printing pending transition; signoff from `done` (drain `pending-signoff`); text `approved <gate> for <name>`; JSON `{ result, gate, name }`; missing `--reason` / unknown sub-verb / wrong state / not found → exit 1.

### Implementation Status

All Implemented in `approve.ts`: `requiredOption('--reason')`; execute `{ name, reason }` only; help uses bound-from language (`ready` / `done` + drain). Does not print `pending-spec-approval` / `moved`.

### Discrepancies

**HIGH / MEDIUM / LOW:** none on the CLI command itself.

Note: tests mock `kernel.changes.status` but the handler never calls status. Harmless; does not violate the spec.

### Test Coverage

File: `packages/cli/test/commands/change/approve.spec.ts`.

Covered: success text/JSON spec and signoff; execute shape `{ name, reason }`; stay in ready/done messaging; drain from pending states; missing reason; unknown sub-verb `review`; not found; wrong state (`ApprovalGateDisabledError`).

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                  | Matching `it()`                                     | Gap                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `approvalsSpec` / `approvalsSignoff` not on input                | Implied by `toHaveBeenCalledWith({ name, reason })` | No explicit `not.toHaveProperty('approvalsSpec')` (transition has this pattern) |
| Routed through `kernel.changes.approveSpec` not `kernel.specs.*` | Uses `kernel.changes.approveSpec.execute`           | No `expect(kernel.specs.approveSpec).not.toHaveBeenCalled()`                    |
| Hashes computed by use case, CLI did not pass hashes             | Call shape has no hash fields                       | No history/hash assertion (Core’s job)                                          |
| Help bound-`from` language                                       | —                                                   | Help strings untested                                                           |

None of these are implementation gaps.

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-checks`.

- Gate enablement baked in kernel matches `core:transition-checks` / change approve Core specs.
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

Canonical `specd changes archive <name>` + singular alias; `--skip-hooks pre|post|all`; `--allow-overlap`; `--allow-out-of-scope`; must be `archivable`; delegate to `ArchiveChange`; check-progress gerund bus; post-hook fail exit 2; text archive path; invalidated section only when non-empty; JSON NDJSON `stream: "change-archive"` complete record (no second unwrapped `{ result: "ok" }`); errors: not found / not archivable / merge fail exit 1.

### Implementation Status

| Area                                                           | Status                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Flags + skip set + optional allow flags                        | Implemented                                                                    |
| Progress presenter `change-archive` (text stderr, JSON stdout) | Implemented                                                                    |
| Text success + invalidated list                                | Implemented                                                                    |
| JSON stream complete only (no extra object)                    | Implemented                                                                    |
| Post-hook failures → `cliError` exit 2 before success print    | Implemented                                                                    |
| SpecOverlapError custom stderr + exit 1                        | Implemented                                                                    |
| Alias                                                          | Implemented at program: `command('changes').alias('change')` in `src/index.ts` |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none vs change-archive MUST lines.

**LOW:**

1. **`SpecOverlapError` bypasses `handleError`.** Always plain stderr + `process.exit(1)`. `--format json` does not emit a structured error object on stdout (unlike other domain errors).
   - `cli:entrypoint`: errors always go to stderr as `error:` (this path complies). Structured JSON extras are a handleError convention, not strictly required by entrypoint “Errors always go to stderr”.
   - Prefer: route through `handleError` for JSON/TOON parity with other commands.

2. **Prerequisites “naming the current state”.** CLI relies on `InvalidStateTransitionError` / handleError message. Test only checks `/error:/`, not that `done` (or current state) appears. If Core’s message omitted the from-state, CLI would not add it. Spec could be read as a CLI MUST to mention state even when Core is terse.

### Test Coverage

File: `packages/cli/test/commands/change/archive.spec.ts`.

Covered: text path; post-hook exit 2 without success line; JSON complete + `archivePath` / `invalidatedChanges`; NDJSON check-start/done then complete; invalidated text/JSON; not found; missing name; not archivable; skip-hooks all/pre/post/comma; empty skip set; allowOverlap / allowOutOfScope on/off; gerund progress + hook bus, no `Executing:`.

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

- Plural canonical + singular alias matches `cli:command-resource-naming` via parent alias (not a second `archive` registration).
- `--allow-out-of-scope` documented as `impl.linksInScope` — consistent with transition.
- Check-progress labels match `core:transition-checks` gerund bus.
- LOW overlap with entrypoint structured-error path (see above).

### Counts (`cli:change-archive`)

| Metric                 | Count |
| ---------------------- | ----- |
| Requirements           | 11    |
| Implemented            | 11    |
| HIGH                   | 0     |
| MEDIUM                 | 0     |
| LOW                    | 2     |
| Notable missing `it()` | 6     |

---

## Batch summary (CLI assigned specs)

| Spec                    | HIGH  | MEDIUM | LOW   | Impl gaps |
| ----------------------- | ----- | ------ | ----- | --------- |
| `cli:change-status`     | 0     | 0      | 3     | 0         |
| `cli:change-transition` | 0     | 0      | 2     | 0         |
| `cli:change-approve`    | 0     | 0      | 0     | 0         |
| `cli:change-archive`    | 0     | 0      | 2     | 0         |
| **Total**               | **0** | **0**  | **7** | **0**     |

**Previous MEDIUMs:** all three closed in code; remaining work is tests (taskCompletionCheck DAG, `[drift]` tag, JSON failure stream, SpecOverlapError, status label/display-state text).

**Highest-value missing tests (not discrepancies):**

1. `status.spec.ts`: `taskCompletionCheck` without `hasTasks: true` → JSON + text DAG tags.
2. `status.spec.ts`: text `complete-with-drift` / `[drift]`.
3. `transition.spec.ts`: JSON `event.result.result === 'failure'` complete record.
4. `archive.spec.ts`: `SpecOverlapError` stderr + `--allow-overlap` hint.
