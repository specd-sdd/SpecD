# Spec compliance audit — CLI + skills (batch)

- **Change:** `workflow-transition-checks`
- **Mode:** change spec-preview (deltas applied)
- **Read-only:** no code or spec files modified
- **Graph:** `stale: false`, `contentFresh: true`, indexed `2026-08-27T08:44:02.754Z` / `2948f1a2`
- **CLI:** `node packages/cli/dist/index.js`
- **Specs in this batch:**
  - `cli:change-status`
  - `cli:change-transition`
  - `cli:change-approve`
  - `cli:change-archive`
  - `skills:skill-templates-source`
- **Focus:** presenters; no pending hops in templates; archive `--skip-hooks pre`; verify drain; implement verify gate; specd router-only
- **Project-wide constraints consulted:** `default:_global/architecture` (CLI delegates to core/SDK), `default:_global/testing`, `default:_global/conventions`

---

## Method

- Spec content via `changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md).
- Navigation via `specd graph search` / `specd graph impact` (`createCheckProgressPresenter`, `CheckProgressStreamName`, CLI command files). Direct reads used after graph located the files.
- Implementation files:
  - `packages/cli/src/commands/change/status.ts`
  - `packages/cli/src/commands/change/transition.ts`
  - `packages/cli/src/commands/change/archive.ts`
  - `packages/cli/src/commands/change/approve.ts`
  - `packages/cli/src/commands/change/_check-progress-presenter.ts`
  - `packages/cli/src/commands/change/_hook-progress-presenter.ts` (run-hooks only)
  - `packages/cli/src/handle-error.ts`
  - `packages/skills/templates/skills/{specd,specd-verify,specd-implement,specd-archive,specd-design,specd-new}/SKILL.md.tpl`
  - `packages/skills/templates/shared/shared.md.tpl`
- Tests: `packages/cli/test/commands/change-*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

---

## Focus findings (executive)

| Focus                        | Verdict                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presenters                   | **Compliant**                                 | Transition and archive share `createCheckProgressPresenter`. Text: `<label> (<id>)` then `✓`/`✗` with no `Executing:` prefix. JSON/TOON: `stream: "change-transition"` / `"change-archive"`. `run-hooks` keeps `_hook-progress-presenter` with `stream: "hook-progress"`. Status text uses GetStatus `availableTransitions`, gerund blocker labels, omits `review:` header, prints `overlap:` only for spec-overlap peers. |
| No pending hops in templates | **Compliant** (with one related drift, below) | Verify/design/archive/entry do not teach `change transition` into `pending-*`. Shared copy is stay-in-`ready`/`done`. New-skill table marks pending rows as drain-only.                                                                                                                                                                                                                                                    |
| Archive `--skip-hooks pre`   | **Compliant**                                 | Archive skill examples use `--skip-hooks pre` only; forbids `--skip-hooks all` on archive; does not call `run-hooks … --phase post` after persist; still fetches post `hook-instruction`. CLI maps `pre`/`post`/`all` to `ArchiveChangeInput.skipHookPhases`.                                                                                                                                                              |
| Verify drain                 | **Compliant**                                 | Verify skill stays in-skill on `IMPLEMENTATION_STATE` / open files, points at `shared.md`, does not bounce to `/specd-implement` for that blocker alone.                                                                                                                                                                                                                                                                   |
| Implement verify gate        | **Compliant**                                 | Implement requires `implementation list` with zero `open` files before recommending `/specd-verify`; does not hop `implementing` when spec gate blocks.                                                                                                                                                                                                                                                                    |
| specd router-only            | **Compliant**                                 | Entry skill: does not execute lifecycle phases; no signoff / `approve signoff` / `pending-signoff`.                                                                                                                                                                                                                                                                                                                        |

**Related drift (not a failed focus scenario):** text status no longer prints `review: required: yes`, but several skills still branch on that exact string. See discrepancy D1.

---

## `cli:change-status`

### Requirements summary

| Requirement                                          | Intent                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Command signature                                    | `change status <name> [--format text\|json\|toon]`                             |
| Drafted change status is read-only                   | Render `draftView`; no mutating transitions; indicate drafted                  |
| Output format                                        | JSON/TOON `artifactDag` includes `hasTasks`; DAG `state` is display projection |
| Task completion display in DAG                       | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                               |
| Display-state rendering                              | Text prefers display status; JSON has canonical + display                      |
| **Lifecycle projections come from GetStatus checks** | MUST NOT locally re-filter protocol graph / `VALID_TRANSITIONS`                |
| **Text status omits duplicated review file lists**   | No `review:` header/files in text; overlap peers still print                   |
| **Text blockers include check labels**               | `! <CODE> — <label>: <message>`                                                |
| Schema version warning                               | Compare recorded vs `lifecycle.schemaInfo`; skip if null                       |
| Change not found                                     | exit 1 + `error:`                                                              |
| Schema-derived fields                                | DAG from `schema.artifactDag()`, children from `childrenOf`                    |
| Delegates refresh policy to GetStatus                | No direct RefreshImplementationTracking / ImplementationDetector               |
| Implementation section                               | `--implementation` uses SDK projection                                         |
| Task completion in details                           | `tasks: N/M`                                                                   |
| Basic info section                                   | name + state; no standalone `specs:` list                                      |
| Specs and dependencies                               | `specDependsOn` in text and JSON                                               |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/status.ts`.

- Calls `kernel.changes.status.execute({ name })` only (default refresh). No `RefreshImplementationTracking` / `ImplementationDetector` in this file.
- Text `lifecycle.transitions` is `lifecycle.availableTransitions.join` — no second `VALID_TRANSITIONS` union (`packages/cli/src/commands/change/status.ts` ~256–257).
- Blockers: `! ${code} — ${label}: ${message}` when `label` present (~237–241); JSON includes `label`/`checkId` (~386–391).
- Review: text prints `overlap:` for `spec-overlap-conflict` only (~317–328); no `review:` header. JSON still serializes full `review` (~437–449).
- Draft path: `(drafted)` in text; `isDrafted: true` in JSON (~141–177).
- DAG: `getActiveSchema` + `schema.artifactDag()` when available; displayStatus for node state; task suffix in details.

Architecture: CLI is an adapter that serializes GetStatus; lifecycle is not recomputed locally. Matches `default:_global/architecture`.

### Discrepancies

None for this spec’s own requirements vs CLI code.

**Cross-surface (templates):** D1 — skills still look for `review: required: yes` in **text** status. After this spec, that string is intentionally absent. JSON/TOON still have `review.required`. Templates that already use `--format text` can miss review routing unless they use **blockers** (`REVIEW_REQUIRED`) or structured status.

Interpretation:

- **Spec correct / templates stale:** `cli:change-status` forbids reprinting review in text; templates were not updated to use blockers / JSON.
- **Templates correct / spec over-strict:** agents need a visible `review:` block in text.
- Evidence favors the first: verify.md explicitly tests “does not include a `review:` header”; CLI tests assert `not.toContain('review:')`.

### Test coverage

Covered:

- Available transitions passthrough, no protocol-edge union — `packages/cli/test/commands/change/change-status.spec.ts`
- Gerund blocker labels in text + JSON `blockers[].label` — same file
- No `review:` header; `overlap:` for spec-overlap — `change-status.spec.ts` / `change/change-status.spec.ts`
- Drafted read-only / `isDrafted` — `packages/cli/test/commands/change-status.spec.ts`

### Missing tests

- No dedicated assertion that `status.execute` is **not** passed `refreshImplementationTracking: false` (default-on is implied by omitting the flag). Low risk.
- Implementation `--implementation` SDK projection is out of this change’s focus; not re-audited in depth.

### Spec dependency chain

- `cli:entrypoint` — formats, exit codes (used via `handleError` / `output`)
- `core:get-status` / `core:transition-checks` — CLI projects checks; does not re-evaluate
- `sdk:build-implementation-review` — `--implementation` path
- **No contradiction** with those deps: “do not re-filter transitions” aligns with check-derived `availableTransitions`.

### Summary counts (`cli:change-status`)

|                            |                         Count |
| -------------------------- | ----------------------------: |
| Requirements               |                            16 |
| Implemented                |                            16 |
| Partial                    |                             0 |
| Missing                    |                             0 |
| Spec-vs-code discrepancies | 0 (1 cross-template drift D1) |
| Covered by tests           |                            15 |
| Missing/weak tests         |           1 (refresh default) |

---

## `cli:change-transition`

### Requirements summary

| Requirement                           | Intent                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Command signature                     | `transition <name> <step>\| --next` + `--skip-hooks` phases `source.pre/post`, `target.pre/post`, `all` |
| Next-transition resolution            | Fixed forward map; `--next` forbidden from pending/archivable                                           |
| Delegates refresh to TransitionChange | Pre-status and repair GetStatus use `refreshImplementationTracking: false`                              |
| Approval-gate routing                 | Do not pass gate flags; do not rewrite `implementing`/`archivable` to pending                           |
| Hook execution                        | Map `--skip-hooks` → `skipHookPhases`                                                                   |
| Progress output                       | Generic check bus; no `stream: "hook-progress"`                                                         |
| Transition hook observability         | Surface hook progress while in flight                                                                   |
| Shared hook progress presentation     | Transition uses check presenter; run-hooks may keep hook-progress stream                                |
| Output on success                     | Text confirmation; JSON terminal `complete` on `change-transition`                                      |
| Post-hook failure warning             | Hook fail → exit 2, `error:`; no separate warning state                                                 |
| Invalid transition error              | Repair guide on stderr from GetStatus; HookFailedError no repair guide                                  |
| Incomplete tasks error                | exit 1 naming artifact (core); CLI surfaces GetStatus repair                                            |
| Check progress rendering              | Gerund labels; no `Executing:`                                                                          |
| Unsatisfied requires error            | exit 1                                                                                                  |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/transition.ts` + `_check-progress-presenter.ts`.

- `VALID_HOOK_PHASES` matches spec. `--skip-hooks` parsed into `skipHookPhases` Set on execute input. Execute payload is `{ name, to, skipHookPhases }` — **no approval flags**.
- `--next` map includes `signed-off → archivable`; pending-spec-approval / pending-signoff / archivable / archiving → `cliError` (~159–188).
- Pre-transition and repair `status.execute({ name, refreshImplementationTracking: false })` (~297–300, ~343–346).
- `makeProgressRenderer` uses `createCheckProgressPresenter({ streamName: 'change-transition' })`. Text progress on **stderr**; structured on **stdout**. Check events routed; no `hook-progress` stream.
- Repair guide: `! CODE — label: message` then `repair guide:` with `nextAction` from GetStatus (~88–102). Repair-guide errors: `InvalidStateTransitionError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`. `HookFailedError` is rethrown → `handleError` exit 2 (`packages/cli/src/handle-error.ts`).
- Help text: “Approval gates stay in ready/done; pending states drain in-flight work only.”

Presenter (`_check-progress-presenter.ts`):

- `check-start` → `<label> (<id>)`
- `check-done` fail → `✗ <label>: <reason>`; pass → `✓ <label>`
- Hook details: `command:`, ` |`/` !`, `still running (Ns)`
- Structured: `{ stream: streamName, event }` — stream limited to `'change-transition' | 'change-archive'`

### Discrepancies

**D2 (low, spec incomplete vs CLI extra events):** Progress renderer still handles legacy `requires-check`, `task-completion-failed`, `transitioned` event types. Spec’s public contract is the generic check bus. If core still emits those, CLI still renders them; if core only emits check events, the branches are dead. Not a user-facing violation of the new contract.

**D3 (informational):** Isolated unit tests live on the command specs, not `_check-progress-presenter.spec.ts` (unlike `_hook-progress-presenter.spec.ts`). Behaviour is covered; presenter file itself is untested in isolation.

No contradiction with `core:hook-execution-model` / `core:transition-checks`: skip-hooks mapping and gerund check bus match.

### Test coverage

Covered in `packages/cli/test/commands/change-transition.spec.ts` and `packages/cli/test/commands/change/change-transition.spec.ts`:

- Gerund predicate + hook progress; no `Executing:`
- JSON stream `change-transition`; no `hook-progress`
- Repair guide on stderr; HookFailedError exit 2 without repair guide
- `refreshImplementationTracking: false` on status calls
- `--next` / skip-hooks (existing command tests)

### Missing tests

- No test that `transition.execute` is called **without** `approvalsSpec` / `approvalsSignoff` keys (code review confirms; verify.md scenario “Transition execute omits approval flags” is only weakly asserted by “called with `{ name, to }` only” — actual call also has `skipHookPhases`). **Spec vs test wording:** extra `skipHookPhases` is required by another requirement; tests should allow that field.

### Spec dependency chain

- `cli:entrypoint`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`
- Repair guide `nextAction` from GetStatus — consistent with check-derived verify vs implement recommendation.

### Summary counts (`cli:change-transition`)

|                            |                                           Count |
| -------------------------- | ----------------------------------------------: |
| Requirements               |                                              14 |
| Implemented                |                                              14 |
| Partial                    |                                               0 |
| Missing                    |                                               0 |
| Spec-vs-code discrepancies |                        0 material (D2/D3 notes) |
| Covered by tests           |                                              13 |
| Missing/weak tests         | 1 (execute input exact-shape vs skipHookPhases) |

---

## `cli:change-approve`

### Requirements summary

| Requirement                    | Intent                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Command signatures             | `approve spec\|signoff <name> --reason`                                                  |
| Delegates gate state to kernel | Only `{ name, reason }`; `kernel.changes.approveSpec` / `approveSignoff`                 |
| Artifact hash computation      | CLI does not hash                                                                        |
| Approve spec behaviour         | Valid from `ready` or drain `pending-spec-approval`; stay in ready; help uses bound-from |
| Approve signoff behaviour      | Valid from `done` or drain `pending-signoff`; stay in done                               |
| Output on success              | `approved <gate> for <name>` / JSON `{ result, gate, name }`                             |
| Error cases                    | Missing `--reason` usage error; wrong state / missing change → exit 1                    |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- `requiredOption('--reason')`
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags
- Help: “Record spec-gate consent for a change in ready (pending-spec-approval remains valid for drain).” Analogous for signoff/`done`.
- Success text/JSON as specified

### Discrepancies

None vs this spec.

Help still **mentions** pending drain states. That is required for drain, not a “pending hop.” Skills (not this CLI spec) forbid teaching pending as happy-path.

### Test coverage

`packages/cli/test/commands/change-approve.spec.ts` and `packages/cli/test/commands/change/change-approve.spec.ts`:

- Execute `{ name, reason }`
- Ready/done stay-in-state; stdout does not print pending
- Drain from pending still invokes use case
- Missing reason / unknown sub-verb / not found (legacy file)

### Missing tests

- Verify.md: “`kernel.specs.approveSpec` is not invoked” — **no explicit `expect(kernel.specs.*).not.toHaveBeenCalled()`**. Implementation only calls `kernel.changes.*`. Coverage gap, not a code bug.

### Spec dependency chain

- `core:change`, `core:transition-checks` (approval.spec / approval.signoff bindings)
- Consistent: CLI does not rewrite to pending parking states.

### Summary counts (`cli:change-approve`)

|                            |                            Count |
| -------------------------- | -------------------------------: |
| Requirements               |                                7 |
| Implemented                |                                7 |
| Partial                    |                                0 |
| Missing                    |                                0 |
| Spec-vs-code discrepancies |                                0 |
| Covered by tests           |                                6 |
| Missing/weak tests         | 1 (`kernel.specs.*` not invoked) |

---

## `cli:change-archive`

### Requirements summary

| Requirement              | Intent                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Command signature        | Canonical `changes archive`; alias `change archive`; `--skip-hooks pre\|post\|all`; `--allow-overlap` |
| Prerequisites            | Must be `archivable`; else exit 1 naming state                                                        |
| Behaviour                | Delegate to `ArchiveChange`                                                                           |
| Hook execution           | Map skip-hooks to archive phase selector                                                              |
| Check progress rendering | Same gerund check presenter as transition                                                             |
| Post-archive hooks       | Failures → exit 2                                                                                     |
| Output on success        | Path line; invalidated section only when non-empty                                                    |
| JSON output on success   | Terminal `stream: "change-archive"` `complete`; no second unwrapped object                            |
| Error cases              | not found / not archivable / merge fail → 1                                                           |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Registered on `program.command('changes').alias('change')` in `packages/cli/src/index.ts` — canonical plural + singular alias.
- `VALID_ARCHIVE_HOOK_PHASES = pre | post | all` forwarded as `skipHookPhases`.
- Progress: `createCheckProgressPresenter({ streamName: 'change-archive' })`.
- `postHookFailures.length > 0` → `cliError(..., 2)`.
- Text: archive path; optional invalidated list. JSON: single terminal complete record after progress rows.
- `--allow-overlap` forwarded.

**Extra CLI surface (not in this spec’s signature):** `--allow-out-of-scope`. Templates and implementation-tracking archive flow use it. Pre-existing / adjacent feature.

### Discrepancies

**D4 (low, spec incomplete):** `cli:change-archive` command signature omits `--allow-out-of-scope` while CLI and `specd-archive` template document it. Options:

- Spec should list the flag (spec drift).
- Flag is out of this change’s scope and should stay undocumented in this spec.

Not a failure of skip-hooks / presenter requirements.

### Test coverage

`packages/cli/test/commands/change-archive.spec.ts`:

- `--skip-hooks all` / `pre,post` / default empty set
- Check progress gerund + hook output; no `Executing:`
- JSON `change-archive` stream then `complete`
- Post-hook failure exit 2
- Not-archivable / not found

### Missing tests

- Dedicated `--skip-hooks pre` **only** (not `pre,post`) — parser is the same path; skill tests cover the template contract, CLI tests cover comma-separated pre+post.
- Singular alias `change archive` vs `changes archive` — registration via parent alias; no dedicated parse test in the files sampled.

### Spec dependency chain

- `core:archive-change`, `core:hook-execution-model`, `core:transition-checks`, `cli:command-resource-naming`
- Archive skip `pre` vs transition skip `target.pre` — different selector vocabularies, correctly not mixed in CLI.

### Summary counts (`cli:change-archive`)

|                            |                               Count |
| -------------------------- | ----------------------------------: |
| Requirements               |                                   9 |
| Implemented                |                                   9 |
| Partial                    |                                   0 |
| Missing                    |                                   0 |
| Spec-vs-code discrepancies |               1 low (D4 extra flag) |
| Covered by tests           |                                   8 |
| Missing/weak tests         | 1 (`--skip-hooks pre` alone; alias) |

---

## `skills:skill-templates-source`

This spec is large (template layout, frontmatter, graph guidance, optimizer gating, command roles). **This batch focused on the change’s workflow-check UX deltas.** Other template requirements (optimizer agents, graph `--snippet`, frontmatter matrix) were not exhaustively re-audited; `template-workflow.spec.ts` still asserts several of them.

### Requirements in focus

#### In-place approval gates (no pending hops)

| Scenario                                                   | Template                       | Status                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify does not route to pending-signoff                   | `specd-verify/SKILL.md.tpl`    | **Pass.** Signoff: stay in `done`, `approve signoff`. No `pending-signoff`; no `change transition` into pending.                                                  |
| Implement does not hop implementing while spec gate blocks | `specd-implement/SKILL.md.tpl` | **Pass.** Stay in `ready`; do not `transition implementing`.                                                                                                      |
| Shared approvals stay-in-state                             | `shared.md.tpl`                | **Pass.** MUST NEVER run `changes approve`; stays in `ready` or `done`; pending MAY appear as drain only; no “reaches `pending-spec-approval`”.                   |
| Shared hook list no pending as happy-path                  | `shared.md.tpl`                | **Pass.** Delivery states listed; “Do **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates”; drain MAY still name those step ids. |
| New-skill table pending = drain only                       | `specd-new/SKILL.md.tpl`       | **Pass.** `pending-signoff` / `pending-spec-approval` rows are “Drain only”.                                                                                      |
| Design stays in ready for spec gate                        | `specd-design/SKILL.md.tpl`    | **Pass.** Stay in `ready`; `approve spec`; no `pending-spec-approval`.                                                                                            |
| specd entry does not teach signoff                         | `specd/SKILL.md.tpl`           | **Pass.** Router; “does NOT execute lifecycle phases”; no signoff / `approve signoff` / `pending-signoff`.                                                        |
| specd-archive mentions in-place gates                      | `specd-archive/SKILL.md.tpl`   | **Pass.** Requires `archivable`; signoff wait owned by `/specd-verify` in `done`; no `pending-signoff`.                                                           |

#### Implementation tracking in verify and implement

| Scenario                                         | Status                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared documents list/resolve/ignore             | **Pass.** `shared.md.tpl` + `template-workflow.spec.ts`                                                                                                  |
| Verify drains open files; no bounce to implement | **Pass.** `IMPLEMENTATION_STATE`; drain via shared; “Do **not** redirect to `/specd-implement` solely for open files”                                    |
| Implement zero-open gate before `/specd-verify`  | **Pass.** `implementation list`; “do **not** tell the user to run `/specd-verify` yet”; guardrail “Never recommend `/specd-verify` while … `open` files” |

#### Archive skill skips only pre hooks

| Scenario                                                                         | Status                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--skip-hooks pre` not `all`; no post `run-hooks`; still `hook-instruction` post | **Pass.** `specd-archive/SKILL.md.tpl` steps 5–6; tests in `template-workflow.spec.ts` |

### Implementation status (focus)

All focus scenarios are present in templates and locked by `packages/skills/test/template-workflow.spec.ts` (`does not teach pending parking…`, `verify drains…`, `archive skips only pre hooks`).

Shared vs archive hook policy is **intentionally split:** shared still says every **transition** uses `--skip-hooks all` with manual run-hooks; archive is the exception (`--skip-hooks pre` so post `run:` cannot be forgotten). Matches `cli:change-archive` + hook-execution-model.

### Discrepancies

**D1 (medium, template vs `cli:change-status`):** These templates still key off text `review: required: yes`:

- `packages/skills/templates/skills/specd/SKILL.md.tpl` (~80)
- `specd-verify/SKILL.md.tpl` (~33)
- `specd-implement/SKILL.md.tpl` (~30, ~317)
- `specd-archive/SKILL.md.tpl` (~30)

`cli:change-status` text MUST NOT print a `review:` header. `specd-new` uses structured `review.required` (better). Blockers section may still show `REVIEW_REQUIRED`, so routing is not fully dead — the exact-string branch is.

Interpretations:

- **Templates should switch to blockers / JSON `review.required`** (implementation follow-up; `skills:skill-templates-source` in-place-gate scenarios do not mention this string).
- **CLI text should keep a compact review signal** (would violate current `cli:change-status` verify scenarios).

Recommend treating as **template staleness**, not a failed in-place-approval scenario.

**D5 (low, test vs spec wording):** `template-workflow.spec.ts` asserts `expect(entry).not.toMatch(/approve spec/)` on the **entry** skill. Spec says entry must not mention **signoff** / `approve signoff` / `pending-signoff`. Forbidding `approve spec` is stricter than the spec (and currently holds). Fine if intentional.

### Test coverage

`packages/skills/test/template-workflow.spec.ts` uses **exact command/field strings** (satisfies “keyword-only assertions are insufficient” for these contracts).

Covered: pending hops, drain/gate copy, archive `--skip-hooks pre`, verify drain, implement verify gate, router-only, shared approve-never, optimizer/metadata roles (adjacent).

### Missing tests

- No test that workflow skills do **not** match `review: required: yes` against text status, or that they use `REVIEW_REQUIRED` blockers instead (would lock D1).
- No test that `specd-new` pending rows contain “Drain only” (present in template; test only checks “Drain only:” somewhere in file). Weak but the string is unique enough.

### Spec dependency chain

- `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`
- In-place gates align with `cli:change-approve` / `cli:change-transition` (stay in ready/done).
- D1 is a **consistency gap with `cli:change-status`**, not with `core:transition-checks`.

### Summary counts (`skills:skill-templates-source`, **focus subset**)

Focus scenarios audited: 11 (8 in-place + 3 tracking/archive-hooks). All 11 implemented.

|                                         |                Count |
| --------------------------------------- | -------------------: |
| Focus scenarios                         |                   11 |
| Implemented                             |                   11 |
| Partial                                 |                    0 |
| Missing                                 |                    0 |
| Spec-vs-template discrepancies in focus |                    0 |
| Cross-spec drifts                       | 1 (D1 review marker) |
| Covered by tests                        |                   11 |
| Extra test gaps                         |          1 (D1 lock) |

Full spec (frontmatter, graph terminology, optimizer agents, etc.): **not fully re-audited in this batch.** Existing `template-workflow.spec.ts` still covers optimizer gating and command-role copy.

---

## Global / dependency consistency

| Pair                                                                    | Result                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| CLI specs vs `default:_global/architecture`                             | CLI commands delegate to SDK kernel use cases; no local lifecycle engine. **OK** |
| CLI presenters vs `core:transition-checks`                              | Gerund labels + check bus. **OK**                                                |
| Skills in-place gates vs `cli:change-approve` / `cli:change-transition` | Stay-in-state; drain-only pending. **OK**                                        |
| Skills archive hooks vs `cli:change-archive`                            | `--skip-hooks pre` matches CLI archive phases. **OK**                            |
| Skills review text vs `cli:change-status`                               | **D1** — templates still expect a text `review:` line the CLI spec removed       |

No finding that the **change’s spec deltas contradict** global spec-layout or testing conventions. Missing isolated presenter tests are a coverage preference, not a spec-layout violation.

---

## Discrepancy register

| ID  | Severity   | Spec(s)                                                            | Kind                        | Summary                                                                                                                     |
| --- | ---------- | ------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | **medium** | `cli:change-status` vs `skills:skill-templates-source` (templates) | Cross-spec / template stale | Text status omits `review:`; skills still branch on `review: required: yes`. Prefer updating templates to blockers or JSON. |
| D2  | low        | `cli:change-transition`                                            | Extra renderer branches     | Legacy `requires-check` / `task-completion-failed` / `transitioned` still handled.                                          |
| D3  | low        | `cli:change-transition` / `cli:change-archive`                     | Test shape                  | No isolated `_check-progress-presenter.spec.ts`.                                                                            |
| D4  | low        | `cli:change-archive`                                               | Spec incomplete             | `--allow-out-of-scope` in CLI + archive skill, not in spec signature.                                                       |
| D5  | info       | `skills:skill-templates-source`                                    | Test stricter than spec     | Entry skill test also forbids `approve spec`.                                                                               |

No **high/critical** implementation bugs found in the focus area. Presenters, skip-hooks mapping, stay-in-state approvals, verify drain, implement verify gate, and specd router-only **match the change specs**.

---

## Totals (this batch)

| Metric                          |      Count |
| ------------------------------- | ---------: |
| Specs audited                   |          5 |
| Focus scenarios (skills)        | 11/11 pass |
| Material CLI requirement misses |          0 |
| Medium discrepancies            |     1 (D1) |
| Low/info notes                  |  4 (D2–D5) |

---

## Sources (graph / files)

- `cli:src/commands/change/_check-progress-presenter.ts` — `createCheckProgressPresenter`, `CheckProgressStreamName`
- Dependents: `cli:src/commands/change/transition.ts`, `cli:src/commands/change/archive.ts`
- `cli:src/commands/change/_hook-progress-presenter.ts` — `run-hooks` only (`stream: "hook-progress"`)
- Tests: `cli:test/commands/change-transition.spec.ts`, `change-archive.spec.ts`, `change-status.spec.ts`, `change/change-status.spec.ts`, `change/change-transition.spec.ts`, `change/change-approve.spec.ts`, `skills:test/template-workflow.spec.ts`
