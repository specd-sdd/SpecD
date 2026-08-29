# Spec compliance partial: CLI + skills

- **Mode:** change `workflow-transition-checks` (read-only)
- **Batch:** `cli-skills`
- **Graph:** fresh (`stale: false`, indexed `2026-08-27T00:09:49.894Z`)
- **Sources:** `specd changes spec-preview workflow-transition-checks <specId>` (merged), `specd graph search` / `graph impact`, CLI/skills source + tests, `default:_global/docs`
- **Code not modified.** Specs not modified.

Consistency anchors (not fully audited here): `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending states drain-only; generic check bus `check-start` / `check-progress` / `check-done`; gerund labels; no `Executing:` prefix; `HookFailedError` for aborting effects) and `default:_global/docs` (CLI output-contract docs must update in the same change).

---

## Spec: `cli:change-status`

### Requirements Summary

| #   | Requirement                                      | Intent                                                                             |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | Command signature                                | `change status <name> [--format text\|json\|toon]`                                 |
| 2   | Drafted change status is read-only               | `draftView` → drafted marker; no mutating transition suggestions                   |
| 3   | Output format                                    | `artifactDag[].hasTasks`; DAG `state` is display (e.g. `complete-with-drift`)      |
| 4   | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                   |
| 5   | Display-state rendering                          | Text prefers display; JSON has canonical + display                                 |
| 6   | Lifecycle projections come from GetStatus checks | No local `VALID_TRANSITIONS` union that contradicts execute                        |
| 7   | Text omits duplicated review file lists          | No `review:` header; overlap peers still print                                     |
| 8   | Text blockers include check labels               | `! CODE — <gerund>: message`; JSON `label`/`checkId`                               |
| 9   | Schema version warning                           | stderr from `lifecycle.schemaInfo`, exit 0                                         |
| 10  | Change not found                                 | exit 1, `error:`                                                                   |
| 11  | Schema-derived fields                            | nested `schema.artifactDag` via `schema.artifactDag()` when Schema instance exists |
| 12  | Delegates refresh policy to GetStatus            | no direct Refresh/Detector                                                         |
| 13  | Implementation section                           | `--implementation` uses SDK projection only                                        |
| 14  | Task completion in details                       | `tasks: N/M`                                                                       |
| 15  | Basic info                                       | name/state; no standalone `specs:` line                                            |
| 16  | Specs and dependencies                           | text section + JSON `specDependsOn`                                                |

**Dependencies:** `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`).

- Active path serializes `lifecycle.availableTransitions` / `nextAction` / blockers from `GetStatus` (`optionalCheckFields` for `checks` / `checksByTarget`).
- Text blockers: `! ${code} — ${label}: ${message}` when `label` present.
- DAG uses `displayStatus`; JSON `artifactDag[].state` uses display; artifacts include `state` + `displayStatus`.
- Draft path: `(drafted)` in text; JSON `isDrafted: true`; transitions line is `(none — change is drafted)`.
- Status handler calls `kernel.changes.status.execute({ name })` only (no Refresh/Detector). `--implementation` goes through `enrichImplementationTracking` (SDK), not graph matching in the command.

Consistent with `core:transition-checks` projections (CLI does not recompute allowed edges).

### Discrepancies

1. **nit — spec Examples vs requirements.** `## Examples` still shows a `specs:` line and a `blockers: → ready: requires — …` shape that the merged requirements forbid (no standalone `specs:`; check-label blocker format). Spec example drift vs spec body. Code follows the requirements, not the example.

2. **minor — drafted status tests missing in CLI package.** Code implements `draftView`. Grep of `packages/cli/test` found **no** `draftView` / `isDrafted` assertions on `change status`. Verify scenarios “Drafted change does not list transition commands” / “JSON includes isDrafted” are uncovered at CLI.

### Test Coverage

Covered (non-exhaustive): `packages/cli/test/commands/change-status.spec.ts`, `packages/cli/test/commands/change/change-status.spec.ts`.

- DAG `hasTasks - 3/10 done`, `complete-with-drift` DAG state, availableTransitions passthrough without protocol union, DEPS_INCONSISTENT gerund label, overlap without `review:` header, schema warning, not-found, specDependsOn, no standalone `specs:`.

### Missing Tests

- Drafted `draftView` text + JSON (`isDrafted`, no `change transition` next action).
- Explicit assertion that CLI does not union `verifying` from protocol when GetStatus omits it (partially covered by “without unioning protocol edges”).

### Spec Dependency Chain

`cli:change-status` → `core:get-status` / `core:transition-checks`. CLI correctly treats projections as opaque. No contradiction with in-place gates (status does not advertise pending hops).

### Counts (`cli:change-status`)

- Requirements: **16**
- Implemented: **16**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (0 critical, 0 major, 1 minor, 1 nit)
- Test gaps: **2**

---

## Spec: `cli:change-transition`

### Requirements Summary

| #   | Requirement                       | Intent                                                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                 | `<name> [step]` XOR `--next`; `--skip-hooks` phase set                                                                    |
| 2   | Next-transition resolution        | Fixed map; pending/archivable/archiving refuse `--next`; **from `signed-off`, `--next` → `archivable`**                   |
| 3   | Delegates refresh                 | GetStatus `refreshImplementationTracking: false` before and on repair                                                     |
| 4   | Approval-gate routing             | No rewrite to pending; user names delivery target                                                                         |
| 5   | Hook execution                    | map `--skip-hooks` → `skipHookPhases`                                                                                     |
| 6   | Progress output                   | Generic check bus; **`stream: "change-transition"`**; must not emit `stream: "hook-progress"`                             |
| 7   | Transition hook observability     | Progress before failure                                                                                                   |
| 8   | Shared hook progress presentation | Transition uses **check-progress presenter**; `run-hooks` may keep hook presenter; **different public JSON stream names** |
| 9   | Output on success                 | text stdout confirmation; JSON/TOON terminal `stream: change-transition` `event.type: complete`                           |
| 10  | Post-hook failure                 | **HookFailedError → exit 2**; no separate warning                                                                         |
| 11  | Invalid transition error          | **Repair Guide on stderr**; HookFailedError **must not** render repair; `--next` from signed-off → archivable             |
| 12  | Incomplete tasks                  | exit 1; status already omitted verifying                                                                                  |
| 13  | Check progress rendering          | gerund `(id)` / `✓`/`✗`; no `Executing:`                                                                                  |
| 14  | Unsatisfied requires              | exit 1                                                                                                                    |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts`.

- `makeProgressRenderer` uses `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`.
- **Does not import** `_hook-progress-presenter` (graph + source).
- `isRepairGuideError` = `InvalidStateTransitionError` \| `ReadOnlyWorkspaceError` \| `ArchiveDependencyMismatchError` \| `ArchiveImplementationStateError`. **`HookFailedError` is not included** → falls through to `handleError` → **exit 2**.
- `writeTextRepairGuide` writes **only `process.stderr`**.
- JSON failure/success: `writeStructuredRecord` with `stream: 'change-transition'`, `event.type: 'complete'`.
- `resolveNextTarget('signed-off')` returns `'archivable'`.
- GetStatus calls pass `refreshImplementationTracking: false`.
- Execute input: `{ name, to, skipHookPhases }` — no approval flags.

Consistent with `core:transition-checks` check bus and no pending rewrite.

### Discrepancies

1. **major — `docs/cli/cli-reference.md` contradicts merged spec + code (also `default:_global/docs`).**
   - Line ~124: Repair Guide rendered **to stdout**. Spec + code: **stderr**.
   - Lines ~144–155: transition uses the **same hook-progress presentation** as `run-hooks`; JSON hook events use **`stream: "hook-progress"`**, lifecycle uses `change-transition`. Spec: transition MUST use check bus only; MUST NOT emit `hook-progress`; commands MUST NOT advertise the same public JSON stream name.
   - `--next` table omits **`signed-off → archivable`** (required in spec “Invalid transition error” / verify).
   - `default:_global/docs`: “Changes to a command's documented output contract MUST update `docs/cli/` in the same change.” Docs still describe the old contract. **Spec/code correct; docs wrong.**

2. **minor — spec internal: Purpose vs requirements.** Purpose still says transitions “transparently **routing through approval gates**”. Requirements forbid CLI rewrite to `pending-*`. Spec body vs purpose. Code matches requirements.

3. **minor — Next-transition resolution list incomplete.** The bullet map under that requirement lists `done → archivable` but not `signed-off → archivable`. The later Invalid-transition requirement does. Code implements signed-off. **Spec incomplete in the first list; later requirement + code correct.**

4. **minor — verify vs code: execute call shape.** Verify “Transition execute omits approval flags” says `TransitionChange.execute` is called with `{ name, to }` **only**. Implementation always passes `skipHookPhases` (empty set by default). Approval flags are correctly omitted. **Verify over-constrained; code correct.**

5. **nit — Commander description** still reads `designing → ready → implementing → verifying` and does not mention in-place gates. Help JSON schema for the stream is accurate.

### Test Coverage

`packages/cli/test/commands/change-transition.spec.ts`, `packages/cli/test/commands/change/change-transition.spec.ts`, `packages/cli/test/handle-error.spec.ts`, plus overlapping cases in `change.spec.ts`.

Covered:

- `--next` from ready stays ready / no pending; **signed-off → archivable**.
- JSON NDJSON `stream: 'change-transition'` including check-start/progress/done + complete.
- Repair guide **on stderr** for InvalidStateTransitionError and other typed errors; refresh skipped.
- Hook fail: check bus `✗ Running pre hooks`, **exit 2**, no `Executing:`.
- `handleError(HookFailedError)` → exit 2.

### Missing Tests

- Verify: “stdout does not contain the repair guide” — tests never `expect(stdout()).not.toContain('repair guide:')`.
- Verify: HookFailedError **stderr does not contain `repair guide:`** — exit 2 + check bus covered; explicit negative assertion missing.
- `--next` from `archiving` (spec mentions it; verify lists pending/archivable only).

### Spec Dependency Chain

Aligns with `core:transition-checks` (no pending rewrite; check bus; HookFailedError not a repair-guide error). Conflicts with **published** `docs/cli/cli-reference.md` (see discrepancy 1).

### Counts (`cli:change-transition`)

- Requirements: **14**
- Implemented: **14**
- Partial: **0**
- Missing: **0**
- Discrepancies: **5** (0 critical, **1 major**, 3 minor, 1 nit)
- Test gaps: **3**

---

## Spec: `cli:change-approve`

### Requirements Summary

| #   | Requirement                    | Intent                                                                                                                                      |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + format                                                                                            |
| 2   | Delegates gate state to kernel | only `{ name, reason }`; `kernel.changes.approve*`                                                                                          |
| 3   | Artifact hash computation      | CLI must not hash                                                                                                                           |
| 4   | Approve spec behaviour         | binding `from` currently `ready`; drain `pending-spec-approval`; stay in ready; no print of hop to pending; help uses bound-`from` language |
| 5   | Approve signoff behaviour      | `done` / drain `pending-signoff`; stay in done                                                                                              |
| 6   | Output on success              | text `approved <gate> for <name>`; JSON `{ result, gate, name }`                                                                            |
| 7   | Error cases                    | missing reason / wrong state / not found → exit 1                                                                                           |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- Help: “Record spec-gate consent for a change in **ready** (pending-spec-approval remains valid for **drain**)” and analogous signoff/`done`.
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags.
- Success text/JSON as specified; does not print `pending-*` on success.

Consistent with `core:transition-checks` in-place consent.

### Discrepancies

None between merged spec and CLI implementation.

**nit — hash scenario is owned by core.** CLI tests cannot see `artifactHashes` on disk events without a real use case; verify “Hashes computed by use case from disk” is a core concern. CLI correctly does not pass hashes.

### Test Coverage

`packages/cli/test/commands/change-approve.spec.ts`, `packages/cli/test/commands/change/change-approve.spec.ts`.

- `{ name, reason }` only; stay-in-ready copy (no pending in stdout); drain from pending still invoked; missing reason / unknown sub-verb; JSON success; not found.

### Missing Tests

- Explicit signoff-from-`done` stay-in-done stdout assertion (signoff tests exist; weaker than spec-from-ready).
- Help-text assertion for bound-`from` language (implemented; not asserted).

### Spec Dependency Chain

Matches `core:transition-checks` / `core:change` (approvals as records, not parking hops).

### Counts (`cli:change-approve`)

- Requirements: **7**
- Implemented: **7**
- Partial: **0**
- Missing: **0**
- Discrepancies: **1** (nit)
- Test gaps: **2**

---

## Spec: `cli:change-archive`

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                                                                                                                             |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Command signature            | `changes archive` + singular alias; skip-hooks pre/post/all; allow-overlap                                                                                                                                         |
| 2   | Prerequisites                | must be `archivable`; else exit 1 + current state                                                                                                                                                                  |
| 3   | Behaviour                    | delegate ArchiveChange                                                                                                                                                                                             |
| 4   | Hook execution               | skip-hooks → ArchiveChangeInput                                                                                                                                                                                    |
| 5   | Check progress rendering     | gerund bus; hooks on same bus; no `Executing:`                                                                                                                                                                     |
| 6   | Post-archive hooks           | post-hook failures → **exit 2**                                                                                                                                                                                    |
| 7   | Output on success            | text path + optional invalidated section                                                                                                                                                                           |
| 8   | Output on success (extended) | overlap listing                                                                                                                                                                                                    |
| 9   | JSON output on success       | **`stream: "change-archive"`**, `event.type: "complete"`, `event.result` with `result/ok`, `name`, `archivePath`, `invalidatedChanges`; progress records **precede** complete; **no second unwrapped JSON object** |
| 10  | Error cases                  | not found / not archivable / merge fail → 1                                                                                                                                                                        |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- `createCheckProgressPresenter({ streamName: 'change-archive', … })` — **not** `_hook-progress-presenter`.
- JSON success: `writeStructuredRecord({ stream: 'change-archive', event: { type: 'complete', result: { result: 'ok', name, archivePath, invalidatedChanges } } })`.
- `postHookFailures.length > 0` → `cliError(..., 2)`.
- Text progress on stderr; success line on stdout.

Aligned with `core:transition-checks` generic progress bus.

### Discrepancies

1. **major — Commander `--help` JSON schema vs merged spec + code.** `addHelpText` still documents:

   ```
   Terminal record:
     { result: "ok", name: string, archivePath: string }
   ```

   Spec requires a **stream envelope** (`stream: "change-archive"`, `event.type: "complete"`). Code emits the envelope. **Help is stale (spec/code correct; help wrong).** Also violates `default:_global/docs` CLI contract-in-same-change if this help is treated as the operator contract (help is in-binary, not `docs/cli/`, but same class of drift).

2. **major — merged `verify.md` not updated to the stream complete record.** Scenario “JSON output on success” still: “stdout is valid JSON with `result` equal to `"ok"`, `name`, `archivePath`” with **no** `stream` / `event.type`. Implementation + unit test parse `parsed.stream === 'change-archive'` / `parsed.event.result`. **Spec.md vs verify.md: spec.md + code correct; verify.md stale.** Callers using verify literally would reject compliant NDJSON.

3. **minor — spec.md “Output on success” still has placeholder fragments** (“prints to stdout: The invalidated changes section is omitted…”, “outputs the following… where `<archive-path>`”). Incomplete sentences in the merged spec body. Code implements the intended behaviour.

4. **nit — JSON unit test uses `JSON.parse(stdout())` as a single object.** That only works when **no** progress records were emitted. Spec says progress MUST precede complete. Implementation is NDJSON when progress exists; the happy-path JSON test never emits progress, so it does not lock the “no second unwrapped object / NDJSON” contract.

### Test Coverage

`packages/cli/test/commands/change-archive.spec.ts`.

- Stream complete record (no progress).
- Text path; invalidated listing; skip-hooks mapping; post-hook **exit 2**; gerund progress + hook lines on stderr; no `Executing:`.

### Missing Tests

- JSON/TOON **NDJSON**: progress `stream: change-archive` records **then** `complete` (parse line-by-line, not whole stdout).
- Verify-aligned assertion that callers must not expect a trailing unwrapped `{ result: "ok" }` after the stream.
- `toon` format complete record (json covered).

### Spec Dependency Chain

Depends on `core:transition-checks` for the bus. CLI rendering matches. Archive JSON contract is internally inconsistent (spec.md vs verify.md vs help).

### Counts (`cli:change-archive`)

- Requirements: **10**
- Implemented: **10**
- Partial: **0**
- Missing: **0**
- Discrepancies: **4** (0 critical, **2 major**, 1 minor, 1 nit)
- Test gaps: **3**

---

## Spec: `skills:skill-templates-source`

### Requirements Summary (lifecycle-relevant + rest)

Focus of this change: **In-place approval gates in workflow templates**. Other requirements (template layout, Handlebars, graph impact wording, frontmatter, metadata self-healing, optimizer gating, command roles) remain in the merged spec.

**In-place gates (binding):**

- Templates MUST describe gates on `ready` / `done`; MUST NOT teach `change transition` into `pending-*` as happy path.
- `shared.md.tpl`: agents NEVER `changes approve`; stay in ready/done; pending = **drain only**; hooks MUST NOT list pending as happy-path intermediates.
- `specd-design`: stay in `ready`; no hop to `pending-spec-approval`.
- `specd-implement`: must not `transition implementing` from ready while spec gate unsatisfied.
- **`specd-verify`: stay in `done`; MUST NOT say transition “routes to `pending-signoff`”; still owns `done → archivable` after consent.**
- `specd-new`: pending rows drain-only; ready/done + unsatisfied gate → approve, not parking.
- `specd` / `specd-archive`: in-place mention; no parking hops.

### Implementation Status

**Focus requirement: implemented** in templates:

| Template                       | Evidence                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `specd-verify/SKILL.md.tpl`    | “If signoff=on: **stay in `done`**”; “Do not `change transition` into `pending-signoff`”; **no** “routes to `pending-signoff`” |
| `specd-design/SKILL.md.tpl`    | Stay in `ready`; do not transition into pending-spec-approval                                                                  |
| `specd-implement/SKILL.md.tpl` | stay in `ready`; do not `transition implementing` while gated                                                                  |
| `specd-new/SKILL.md.tpl`       | table: `pending-spec-approval` / `pending-signoff` **Drain only**                                                              |
| `specd/SKILL.md.tpl`           | in-place on ready/done; do not transition into pending                                                                         |
| `specd-archive/SKILL.md.tpl`   | in-place on `done`; not a transition into pending-signoff                                                                      |
| `shared.md.tpl`                | **stays** in ready/done; pending MAY appear as drain; do not list pending as happy-path intermediates                          |

`packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` asserts verify `not.toMatch(/routes to \`pending-signoff\`)`, stay in done, drain-only table, design stay in ready, shared stay-in-state, archive in-place.

**Remainder of the spec** (layout, graph `--direction`, `--snippet`, frontmatter, optimizer gating, command roles): not fully re-walked file-by-file in this batch. Existing `template-workflow.spec.ts` still covers command-role and optimizer/metadata gating scenarios in verify.md.

### Discrepancies

None for the in-place-gates requirement vs templates vs `core:transition-checks`.

**nit:** `specd/SKILL.md.tpl` still says “This skill … **routes to** the right skill” (skill dispatcher, not signoff). Harmless; the forbidden phrase is specifically “routes to `pending-signoff`”.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts` — in-place gates + several other template contracts.

### Missing Tests

- Positive assertion that verify still owns **`done → archivable`** after signoff (template contains `transition … archivable`; test does not assert that ownership sentence).
- Shared “MUST NOT run `source.post` on `along` backward” is asserted; good.

### Spec Dependency Chain

Matches `core:transition-checks` (in-place gates; pending drain-only). No CLI/skills contradiction on parking hops.

### Counts (`skills:skill-templates-source`)

- Requirements (merged spec headings): **16** (including In-place approval gates)
- Focus requirement implemented: **yes**
- Remainder: **not exhaustively re-audited this batch** (no additional lifecycle discrepancies found in templates searched for `pending-signoff` / `pending-spec-approval` / `routes to`)
- Discrepancies (lifecycle): **1 nit**
- Test gaps (lifecycle): **1**

---

## Consistency: `core:transition-checks` (previewed, not counted as this batch’s primary spec)

CLI/skills behaviour checked against merged core:

| Core rule                                                     | CLI/skills                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| No `change transition` into pending                           | CLI does not rewrite targets; skills forbid parking hops                  |
| Stay in ready/done until Approve\*                            | approve CLI + skill copy                                                  |
| Check bus + gerund labels                                     | `_check-progress-presenter`; status/repair labels                         |
| Hooks on same bus                                             | transition/archive map hook events to check-progress                      |
| `_hook-progress-presenter` not the transition public contract | **only `run-hooks.ts` + unit tests import `createHookProgressPresenter`** |
| `HookFailedError` abort                                       | `handleError` exit 2; transition does not attach repair guide             |

No CLI/skills contradiction with core on these points. **Docs** still describe the pre-check-bus hook-progress stream for `change transition`.

---

## Consistency: `default:_global/docs`

Requirement: command output-contract changes MUST update `docs/cli/` in the same change.

**Failing artifacts:**

- `docs/cli/cli-reference.md` — Repair Guide **stdout**; transition JSON **`stream: "hook-progress"`** for hooks; `--next` map missing `signed-off → archivable`.
- `docs/cli/cli-reference.md` run-hooks section saying it **shares the same live presentation as change transition** is now only true at a high level (both show live output) and **false** as a public stream contract.

Guide/core docs (`docs/guide/workflow.md`, `docs/core/use-cases.md`) correctly describe drain-only pending and in-place approve. Drift is concentrated in **CLI reference output contract**.

---

## Focus checklist (requested)

| Focus                                                   | Result                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repair on stderr                                        | **Code + unit tests: stderr.** Docs still say stdout. Missing stdout-negative test.                                                        |
| Check bus `stream: change-transition`                   | **Implemented + tested.** Docs still mention `hook-progress` for transition hooks.                                                         |
| HookFailedError exit 2                                  | **`handleError` + transition tests.** Missing “no repair guide” assertion.                                                                 |
| `--next` signed-off → archivable                        | **Code + test.** Spec first `--next` list omits it; docs omit it.                                                                          |
| Archive JSON success = stream `change-archive` complete | **Code + test.** Help + **verify.md** still describe unwrapped JSON.                                                                       |
| Skills stay-in-ready/done                               | **Templates + contract test.**                                                                                                             |
| Pending drain-only                                      | **specd-new table + shared.md.tpl.**                                                                                                       |
| specd-verify MUST NOT say routes to pending-signoff     | **Absent in template; test forbids the phrase.**                                                                                           |
| `_hook-progress-presenter` is run-hooks only            | **Confirmed:** importers are `run-hooks.ts` and `_hook-progress-presenter.spec.ts`. Transition/archive use `_check-progress-presenter.ts`. |

---

## Batch totals (this partial)

| Spec                          | Reqs   | Impl                                               | Disc. (crit/maj/min/nit) | Test gaps |
| ----------------------------- | ------ | -------------------------------------------------- | ------------------------ | --------- |
| cli:change-status             | 16     | 16                                                 | 0/0/1/1                  | 2         |
| cli:change-transition         | 14     | 14                                                 | 0/1/3/1                  | 3         |
| cli:change-approve            | 7      | 7                                                  | 0/0/0/1                  | 2         |
| cli:change-archive            | 10     | 10                                                 | 0/2/1/1                  | 3         |
| skills:skill-templates-source | 16     | focus yes                                          | 0/0/0/1                  | 1         |
| **Sum**                       | **63** | **63 impl (skills remainder not fully re-walked)** | **0 / 3 / 5 / 5**        | **11**    |

Highest-severity: **docs + archive help + archive verify.md** lag the implemented stream/stderr contracts. Runtime CLI/skills match `core:transition-checks` for the focus items.
