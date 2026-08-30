# Spec-compliance partial: CLI (`cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`)

- **Mode:** change `workflow-transition-checks` (merged spec-preview, not archived `specs/`)
- **Auditor:** read-only; no code or spec files modified
- **Sources:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive,_check-progress-presenter}.ts`, `packages/cli/src/handle-error.ts`
- **Tests:** `packages/cli/test/commands/change-{status,transition,approve,archive}.spec.ts` plus `packages/cli/test/commands/change/change-{status,transition,approve}.spec.ts`
- **Graph:** not stale (`stale: false` at audit time)

This batch is the **CLI adapter**. Kernel/engine behaviour (whether `TransitionChange` actually stays in `ready` when `approval.spec` fails) is delegated; this audit judges whether the CLI rewrites targets, how it presents progress/errors, and whether tests lock the merged CLI contract.

---

## Requirements summary

### `cli:change-status` (merged)

| ID  | Requirement                                     | Intent (change deltas highlighted)                                                                                                                                                      |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                               | `change status <name> [--format]`                                                                                                                                                       |
| S2  | Drafted status is read-only                     | No mutating next-action; `isDrafted` in JSON                                                                                                                                            |
| S3  | Output format                                   | DAG `hasTasks`; `artifactDag[].state` is display-state                                                                                                                                  |
| S4  | Task completion in DAG                          | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                                                                                                                                        |
| S5  | Display-state rendering                         | `complete-with-drift`; JSON has canonical + display                                                                                                                                     |
| S6  | **Lifecycle projections from GetStatus checks** | Render `availableTransitions` / `nextAction` / blockers as GetStatus returned them; **do not** union protocol `VALID_TRANSITIONS` (e.g. advertising `verifying` while tasks incomplete) |
| S7  | **Text omits duplicated review file lists**     | No `review:` header/files for artifact-review/drift; overlap peers still printed; JSON keeps full `review`                                                                              |
| S8  | **Text blockers include check labels**          | `! CODE — <gerund label>: <message>`; JSON `label` / `checkId`                                                                                                                          |
| S9  | Schema version warning                          | stderr `warning:`; exit 0; compare via `lifecycle.schemaInfo`                                                                                                                           |
| S10 | Change not found                                | exit 1 + `error:`                                                                                                                                                                       |
| S11 | Schema-derived fields                           | DAG via `schema.artifactDag()`; display status; no convergent repeats                                                                                                                   |
| S12 | Delegates refresh to GetStatus                  | No direct refresh/detector                                                                                                                                                              |
| S13 | Implementation section                          | `--implementation` uses SDK projection                                                                                                                                                  |
| S14 | Task completion in details                      | `tasks: N/M`                                                                                                                                                                            |
| S15 | Basic info                                      | name + state; no standalone `specs:` line                                                                                                                                               |
| S16 | Specs and dependencies                          | text section + JSON `specDependsOn`                                                                                                                                                     |

**Constraints (merged):** CLI must not apply a second `VALID_TRANSITIONS`-only filter vs `GetStatus.availableTransitions`. Lifecycle is a projection of GetStatus + check evaluation.

### `cli:change-transition` (merged)

| ID  | Requirement                   | Intent (change deltas highlighted)                                                                                                                                                            |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature             | `<name> [step]` or `--next`; `--skip-hooks` phases                                                                                                                                            |
| T2  | Next-transition map           | drafting→designing … done→archivable; **signed-off→archivable**; pending-\* and archivable fail with explanatory `error:`                                                                     |
| T3  | Refresh policy                | GetStatus `refreshImplementationTracking: false` before execute and for repair diagnostics                                                                                                    |
| T4  | **No silent pending routing** | Do **not** rewrite `implementing`→`pending-spec-approval` or `archivable`→`pending-signoff`. User names delivery target; failed `approval.spec` / `approval.signoff` stay in `ready` / `done` |
| T5  | Hook execution                | Map `--skip-hooks` to `skipHookPhases`; fail-fast                                                                                                                                             |
| T6  | Progress output               | Generic check bus; JSON/TOON `stream: "change-transition"`; **no** `stream: "hook-progress"` from this command                                                                                |
| T7  | Hook observability            | Progress before hook-triggered failure                                                                                                                                                        |
| T8  | Shared presentation           | Transition uses **check-progress presenter**; `run-hooks` may keep `_hook-progress-presenter`; **must not share public JSON stream name**                                                     |
| T9  | Success output                | Text confirmation on stdout; structured terminal `complete` on same stream                                                                                                                    |
| T10 | Post-hook / hook failure      | Fail-fast; **exit 2**; `error:` (not a post-transition warning)                                                                                                                               |
| T11 | Invalid transition            | exit 1; **Repair Guide on stderr** (not stdout); labeled blockers; **`HookFailedError` MUST NOT render Repair Guide**                                                                         |
| T12 | Incomplete tasks              | exit 1 naming artifact; status should already omit `verifying`                                                                                                                                |
| T13 | Check progress rendering      | `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix; hooks as `Running pre/post hooks`                                                                                                      |
| T14 | Unsatisfied requires          | exit 1; repair from GetStatus                                                                                                                                                                 |

**Base→merged reversal:** archived spec still described silent routing to pending-\* states. Merged spec forbids CLI rewrite and forbids persisting pending via CLI routing.

### `cli:change-approve` (merged)

| ID  | Requirement                     | Intent                                                                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| A1  | Command signatures              | `approve spec                                                                                                                                                | signoff <name> --reason` |
| A2  | Delegates gate to kernel        | `{ name, reason }` only; `kernel.changes.approve*`                                                                                                           |
| A3  | No CLI hashes                   | Use case owns hashes                                                                                                                                         |
| A4  | **Approve spec from `ready`**   | Valid binding `from` is `ready` (drain: `pending-spec-approval`); stay in `ready`; **must not print transition to pending**; help uses bound-`from` language |
| A5  | **Approve signoff from `done`** | Same pattern for `done` / drain `pending-signoff`                                                                                                            |
| A6  | Success output                  | text `approved <gate> for <name>`; JSON `result/gate/name`                                                                                                   |
| A7  | Errors                          | missing `--reason` usage 1; wrong state / not found exit 1 + `error:`                                                                                        |

### `cli:change-archive` (merged)

| ID    | Requirement                  | Intent                                                                                     |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| R1    | Command signature            | `changes archive` + singular alias; skip-hooks pre/post/all; `--allow-overlap`             |
| R2    | Prerequisites                | must be `archivable`; else exit 1 naming state                                             |
| R3    | Behaviour                    | Delegate `ArchiveChange`                                                                   |
| R4    | Hook execution               | Map `--skip-hooks` to archive selector                                                     |
| R5    | **Check progress rendering** | Same gerund bus as transition; stream `change-archive`; no `Executing:`; hooks on same bus |
| R6    | Post-archive hooks           | post-hook failures → **exit 2**                                                            |
| R7–R9 | Success text/JSON            | archive path; invalidated section; JSON `result/name/archivePath`                          |
| R10   | Errors                       | not found / not archivable / merge fail → 1                                                |

---

## Implementation status

### Shared presenter

`createCheckProgressPresenter` (`_check-progress-presenter.ts`) implements the merged text contract (`label (id)`, indented progress, `✓`/`✗`, no `Executing:`). Structured records use `streamName` `'change-transition' | 'change-archive'`. Text goes to **stderr**; JSON/TOON to **stdout**. Transition wires `streamName: 'change-transition'`. Archive wires `'change-archive'`.

`change run-hooks` still uses `_hook-progress-presenter.ts` and public `stream: "hook-progress"`. That matches merged **T8** (different public stream). JSDoc on the hook presenter still claims it is used by `change transition` — stale comment only.

### `change status`

- Text `transitions:` is `lifecycle.availableTransitions.join`, not a local protocol union (**S6** implemented).
- `nextAction` is printed from GetStatus as-is (**S6**).
- Blockers: `! ${code} — ${label}: ${message}` when `label` present (**S8**). JSON maps `label`/`checkId`.
- Review files: no `review:` header; overlap-only `overlap:` bullets when `reason === 'spec-overlap-conflict'` (**S7**). JSON still serializes full `review`.
- No `VALID_TRANSITIONS` symbol in CLI package.
- Pre-existing behaviour (DAG, draft branch, schema warning, implementation flag, specs section) remains.

### `change transition`

- `resolveNextTarget` includes **`signed-off` → `archivable`** (**T2**).
- Pending spec/signoff/archivable/archiving `--next` → `cliError` with the specified explanations.
- `transition.execute({ name, to, skipHookPhases }, onProgress)` — **no approval flags**; `to` is the user/logical target, never rewritten to pending-\* (**T4**).
- Pre/post GetStatus both pass `refreshImplementationTracking: false` (**T3**).
- Repair guide: `writeTextRepairGuide` writes **entirely to stderr** (**T11**). `isRepairGuideError` is `InvalidStateTransitionError | ReadOnlyWorkspaceError | ArchiveDependencyMismatchError | ArchiveImplementationStateError`. **`HookFailedError` is not included** → falls through to `handleError` → **exit 2** (**T10/T11**).
- Check events use check presenter; `requires-check` / `task-completion-failed` / `transitioned` also use `stream: "change-transition"` in structured mode. No `hook-progress` emission from this file.
- Success JSON: terminal `{ stream: "change-transition", event: { type: "complete", result: { result, name, from, to } } }`.
- Failure JSON: same stream `complete` with `result: "failure"`, `blockers`, `nextAction`.

Gate _enforcement_ (stay in `ready` when spec approval missing) is **not** implemented in the CLI; it is expected from the kernel. CLI tests that mock `transition.execute` **success** to `implementing` while `approvals.spec: true` only prove **no rewrite**, not kernel rejection.

### `change approve`

- Help: spec from **ready** (drain pending-spec-approval); signoff from **done** (drain pending-signoff) (**A4/A5**).
- Executes `kernel.changes.approveSpec/approveSignoff({ name, reason })` only (**A2/A3**).
- Text: `approved spec|signoff for ${name}` — does not print pending transitions (**A4/A5/A6**).
- State validity is kernel-side; CLI maps errors via `handleError` (exit 1).

### `change archive`

- Delegates to `kernel.changes.archive.execute` with skip-hooks / overlap / out-of-scope.
- Progress via check presenter on `change-archive`.
- `postHookFailures.length > 0` → `cliError(..., 2)` (**R6**).
- JSON success writes a **standalone** `{ result, name, archivePath, invalidatedChanges }` object (not wrapped as `stream`/`complete`). Text success stays on stdout; progress on stderr.

### Exit codes (`handle-error.ts`)

`HookFailedError` / `HOOK_FAILED` → exit **2** with `error: hook '<command>' failed` and stderr detail. Aligns with T10 and archive post-hooks (archive uses `cliError` directly for collected post failures).

---

## Discrepancies

Each item lists **spec-wrong vs code-wrong vs both**, with evidence.

### D1 — `cli:change-transition` verify.md vs spec.md: shared presentation with `run-hooks`

- **Merged spec.md T8:** transition uses check-progress presenter; run-hooks may keep hook presenter; **must not share JSON stream name**.
- **Merged verify.md** still has scenario _“Equivalent hook events render with the same presentation contract as run-hooks”_.
- **Code:** different presenters (`[running] hookId` vs `Running pre hooks (hook.pre)`); streams `hook-progress` vs `change-transition`.
- **Verdict:** **spec-internal drift** (verify lagged spec.md). Code matches **spec.md**. If verify is treated as binding, code would be non-compliant — prefer updating verify, not re-unifying streams.

### D2 — `cli:change-archive` JSON success vs check-progress NDJSON

- **R9** (unchanged): stdout is **valid JSON** with `result/name/archivePath`.
- **R5** (new): JSON/TOON emit newline-delimited `{ stream: "change-archive", event }` records on stdout.
- **Code:** progress records on stdout in json/toon; terminal payload is a **second** unwrapped object. If any check event is emitted, `JSON.parse(entire stdout)` fails.
- **Transition** resolved this by making `complete` a stream record (**T9**). Archive did not.
- **Verdict:** **both partially wrong / incomplete alignment**. Tests pass R9 only because mocks often emit **no** progress. When archive actually streams checks in `--format json`, R9 and R5 conflict.

### D3 — Approve verify.md JSON scenario still GIVEN `pending-spec-approval`

- **Merged spec A4:** success from `ready`.
- **Merged verify “JSON output on successful approval”:** still GIVEN `pending-spec-approval`.
- **Code/tests:** JSON payload does not depend on state; extra tests cover ready/done.
- **Verdict:** **verify lag**, not a CLI bug. Drain GIVEN is still useful; primary GIVEN should be `ready`.

### D4 — Approval-gate **verify** scenarios vs CLI unit tests

- **Merged verify T4:** `transition … implementing` with spec gate on and no approval → **exit 1**, remain `ready`, no pending in stdout.
- **CLI tests:** mock `transition.execute` **resolved** to `implementing` and assert no pending rewrite.
- **Code:** cannot fail the transition by itself; it prints whatever `result.change.state` the kernel returns.
- **Verdict:** **CLI implementation of T4 (no rewrite) is compliant**. Full verify scenario is **integration/kernel**. Risk: if kernel still silently routed, CLI would **print** `ready → pending-spec-approval` (stdout uses `result.change.state`). That would violate merged T4 **output** even without CLI rewrite. Flag for core+CLI integration, not a CLI rewrite bug.

### D5 — Stale comment on `_hook-progress-presenter.ts`

Claims use by `change transition`. Transition no longer imports it. **Docs/comment drift**; behaviour OK.

### D6 — Approve spec.md “Output on success” body still truncated

Base and merged spec.md still say `text` “prints to stdout:” with empty bullets. Tests and code use `approved spec|signoff for <name>`. **Pre-existing spec incompleteness**, not introduced as a functional bug.

### D7 — Repair guide on stdout (base verify) vs stderr (merged)

Base verify said repair guide on **stdout**. Merged spec + verify + **code** use **stderr**. Tests assert stderr and that stdout is not used for the guide. **Compliant with merged spec.** Do not treat base verify as current.

No evidence of CLI silently mapping targets to `pending-spec-approval` / `pending-signoff`.

---

## Test coverage

### `cli:change-status`

| Req                 | Coverage                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1                  | `change-status.spec.ts` missing name                                                                                                                       |
| S2                  | Drafted scenarios not found in these two status files (may live in `change.spec.ts` / drafts); **gap for this change’s files**                             |
| S3–S5, S11, S14–S16 | existing DAG/details/JSON tests                                                                                                                            |
| S6                  | `change/change-status.spec.ts`: availableTransitions not unioned with `validTransitions`; nextAction verify vs implement                                   |
| S7                  | artifact-review-required and artifact-drift omit `review:`; overlap peers without review header (`change-status.spec.ts` + `change/change-status.spec.ts`) |
| S8                  | DEPS_INCONSISTENT gerund in text + JSON `label`                                                                                                            |
| S9–S10              | schema mismatch; unknown name                                                                                                                              |
| S12                 | not a dedicated spy in the new file; transition tests spy refresh more strongly                                                                            |
| S13                 | implementation tracking tests in main status spec                                                                                                          |

### `cli:change-transition`

| Req                      | Coverage                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| T1                       | missing args; `--next` vs step exclusive; `--next` from drafting                                                              |
| T2                       | `--next` designing→ready (via execute `to`); pending-\* and archivable failures; **signed-off→archivable: no test**           |
| T3                       | repair-guide test asserts both GetStatus calls `refreshImplementationTracking: false`                                         |
| T4                       | no rewrite implementing/archivable; `--next` from ready requests implementing                                                 |
| T5                       | skip-hooks all / comma-separated; default empty set                                                                           |
| T6                       | JSON success lines all `stream: "change-transition"` including hook checks; no `hook-progress`                                |
| T7                       | failed hook progress on check bus then exit 2                                                                                 |
| T8                       | not asserted vs run-hooks (correct vs spec.md; contradicts stale verify)                                                      |
| T9                       | text success; JSON complete ok                                                                                                |
| T10                      | `HookFailedError` → `process.exit(2)`                                                                                         |
| T11                      | repair guide on stderr; labeled READ_ONLY_WORKSPACE; **HookFailedError tests do not `expect.not.toContain('repair guide:')`** |
| T12                      | incomplete tasks + skip-hooks still blocked                                                                                   |
| T13                      | gerund `impl.linksInScope`; no `Executing:`                                                                                   |
| T14                      | requires via InvalidStateTransition + GetStatus blockers                                                                      |
| T9 failure JSON complete | **not found**                                                                                                                 |

### `cli:change-approve`

| Req   | Coverage                                                           |
| ----- | ------------------------------------------------------------------ |
| A1    | missing reason; unknown sub-verb                                   |
| A2    | execute `{ name, reason }`                                         |
| A4/A5 | ready/done stay; drain pending still invoked; no pending in stdout |
| A6    | JSON ok/gate/name                                                  |
| A7    | not found; wrong state (`ApprovalGateDisabledError`)               |

### `cli:change-archive`

| Req   | Coverage                                                       |
| ----- | -------------------------------------------------------------- |
| R1    | missing name; skip-hooks all / pre+post                        |
| R2    | not archivable → exit 1                                        |
| R3    | text path confirmation                                         |
| R4    | skip phases forwarded                                          |
| R5    | gerund workspace check + Running pre hooks; no Executing       |
| R6    | post-hook failure exit 2, no success line                      |
| R7–R9 | invalidated text/JSON; JSON.parse success (no progress events) |
| R10   | not found                                                      |

---

## Missing tests

1. **`--next` from `signed-off` resolves `to: 'archivable'`** (merged T2 / verify scenario). Implementation exists; **no CLI test**.
2. **JSON/TOON failure terminal record** `{ stream: "change-transition", event.type: "complete", result.result: "failure", blockers, nextAction }`.
3. **`HookFailedError` does not print `repair guide:`** (verify T11). Exit 2 and `✗ Running post/pre hooks` are covered; absence of repair guide is not.
4. **Archive JSON with in-flight check events** — NDJSON `change-archive` + terminal shape (exposes D2).
5. **`--next` from ready when kernel rejects missing spec approval** (exit 1, stay ready) — CLI-only mock of `transition.execute` **rejection**, not success (verify T4 as user-visible CLI).
6. **Status: `availableTransitions` omit `verifying` with incomplete tasks** is covered at renderer level (S6); **status-then-transition pairing** (verify T12 second scenario) is not a single CLI test.
7. **Drafted status (S2)** not in the change-focused status extras (pre-existing home may be elsewhere).
8. **Skip-hooks `target.pre` vs `source.post` independently** — comma parse exists; per-phase execute assertions vs hook runner are thin (mostly forwarding the set).
9. **Dedicated `_check-progress-presenter.spec.ts`** — none; behaviour covered only through command tests.

---

## Spec dependency chain

| Spec                    | Declared deps (merged)                                                                                                                                                       | Notes                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `cli:change-status`     | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, **`core:transition-checks`** (new)                                                    | S6/S8 depend on GetStatus check-derived blockers/labels           |
| `cli:change-transition` | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, **`core:transition-checks`** (new: check bus, no pending rewrite) | T4/T6/T11 are CLI projections of that core spec                   |
| `cli:change-approve`    | `cli:entrypoint`, `core:change`, **`core:transition-checks`** (approval.spec / approval.signoff)                                                                             | Help/`from` language must stay aligned with binding `from` states |
| `cli:change-archive`    | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, **`core:transition-checks`**                             | R5 shares presenter with transition                               |

**Global / architecture:** CLI remains an adapter (no domain routing logic). That matches T4 (no local pending rewrite). Hexagonal: progress presenter is presentation, not policy.

**Consistency:** Merged CLI specs agree with each other on no silent pending, repair-on-stderr, check bus, approve-from-ready/done. Conflicts are **within** transition (spec.md T8 vs verify shared-run-hooks) and **archive JSON** (R5 vs R9).

---

## Summary counts

Counted against **merged** requirements in the four specs (S1–S16, T1–T14, A1–A7, R1–R10). Implementation “implemented” means CLI adapter behaviour matches merged spec.md even if kernel is mocked.

| Metric                                           | Count                                                          |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Specs in this batch                              | 4                                                              |
| Requirements (merged, named)                     | 47                                                             |
| Implemented in CLI (aligned with merged spec.md) | 45                                                             |
| Partial / contract tension                       | 2 (D2 archive JSON+stream; D1 verify-only shared presenter)    |
| Missing CLI implementation of merged spec.md     | 0 (signed-off `--next` is implemented, untested)               |
| Discrepancies filed                              | 7 (D1–D7; D4/D6/D7 are verify/base/docs, not CLI rewrite bugs) |
| Requirements with solid CLI tests                | ~38                                                            |
| Requirements with weak/missing CLI tests         | ~9 (see Missing tests)                                         |
| New-change checks of interest                    |                                                                |
| — Silent pending routing in CLI                  | **Absent** (compliant)                                         |
| — Repair guide on stderr                         | **Present**                                                    |
| — Transition JSON stream `change-transition`     | **Present** (hooks on same stream)                             |
| — `HookFailedError` exit 2                       | **Present**                                                    |
| — `--next` signed-off → archivable               | **Implemented, untested**                                      |
| — Approve from ready/done                        | **Present** (help + tests)                                     |

**Bottom line:** CLI matches the **merged spec.md** for no silent pending rewrite, stderr repair guides, check-bus progress, HookFailedError exit 2, and approve-from-ready/done. Highest-value gaps are **unsigned `--next` from `signed-off`**, **JSON failure complete records**, **explicit no-repair-guide on hook failure**, and **archive JSON vs NDJSON progress**. Treat verify.md “same presentation as run-hooks” as stale relative to spec.md.
