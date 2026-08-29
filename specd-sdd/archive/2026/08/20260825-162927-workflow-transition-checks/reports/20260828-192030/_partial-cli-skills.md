# Partial audit: CLI + skills (change `workflow-transition-checks`)

- **Mode:** change spec-preview (not archived workspace `specs/` alone)
- **Change:** `workflow-transition-checks`
- **Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`
- **Globals checked:** `default:_global/architecture` (adapters contain no business logic; CLI/MCP/plugins delegate to core via SDK), `default:_global/testing` (Vitest; `test/` mirrors `src`; given/when/then names)
- **Graph:** index fresh (`stale: false`, 2026-08-28T17:21:07.186Z). Navigation via `graph search` / `graph impact` on CLI/skills surfaces (`registerChangeStatus`, `registerChangeTransition`, `registerChangeApprove`, `registerChangeArchive`, `createCheckProgressPresenter`, `createHookProgressPresenter`, skill templates).
- **Core deps:** `@specd/cli` depends on `@specd/sdk` (not `@specd/core`). `@specd/skills` depends on `@specd/core` (allowed: plugin-\* → skills → core). CLI command modules import SDK types/use cases only.

---

## cli:change-status

### Requirements Summary

Change preview (`changes spec-preview workflow-transition-checks cli:change-status`):

| #   | Requirement                                      | Intent                                                                                                            |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                                | `change status <name> [--format text\|json\|toon]`                                                                |
| 2   | Drafted change status is read-only               | No mutate transitions; mark drafted; MAY show artifact statuses                                                   |
| 3   | Output format                                    | `artifactDag[].hasTasks`; DAG `state` is display projection                                                       |
| 4   | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                  |
| 5   | Display-state rendering                          | Text prefers display; JSON includes canonical + display                                                           |
| 6   | Lifecycle projections come from GetStatus checks | No local `VALID_TRANSITIONS` filter; render `availableTransitions` / `nextAction` from GetStatus                  |
| 7   | Text status omits duplicated review file lists   | Review header without file paths; overlap peers still print; no `OVERLAP_CONFLICT` line for invalidation          |
| 8   | Text blockers include check labels               | `! CODE — label: message`; JSON `label`/`checkId`                                                                 |
| 9   | Schema version warning                           | stderr; compare recorded vs `lifecycle.schemaInfo`; skip if null; exit 0                                          |
| 10  | Change not found                                 | exit 1, `error:`                                                                                                  |
| 11  | Schema-derived fields                            | Nested `schema.artifactDag` via `childrenOf`/`roots`; text DAG uses display status; convergent nodes at most once |
| 12  | Delegates refresh policy to GetStatus            | No direct `RefreshImplementationTracking` / `ImplementationDetector`                                              |
| 13  | Implementation section                           | `--implementation` uses SDK `buildImplementationReview`; no independent graph matching                            |
| 14  | Task completion in details                       | `tasks: N/M`                                                                                                      |
| 15  | Basic info section                               | Name + state; no standalone `specs:` line                                                                         |
| 16  | Specs and dependencies                           | Text section + JSON `specDependsOn`                                                                               |

**Constraints:** Serialize Core/SDK results; do not recompute lifecycle; do not second-filter `availableTransitions`.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`, lines 81–519) plus `renderDag` (529–597) and `enrichImplementationTracking` (`_implementation-tracking.ts` → `buildImplementationReview`).

- Invokes `kernel.changes.status.execute({ name })` only (default refresh). Tests assert `refreshImplementationTracking.execute` is not called.
- Text: DAG from `schema.artifactDag()` when `getActiveSchema` returns a live schema; fallback `ArtifactDag.from(schemaInfo.artifacts)`. Display status in DAG and details. Blocker labels. Review header without `affectedArtifacts` paths. Overlap section from `overlapDetail`. Filters `OVERLAP_CONFLICT` in **text** when `review.reason === 'spec-overlap-conflict'` (explicit presentation rule in this spec, not a local protocol graph).
- JSON: `artifactDag[].state` from `displayStatus`; artifacts include `state` + `displayStatus`; `blockers[].label`/`checkId`; full `review` including `overlapDetail`; help text lists `overlapDetail` beside `affectedArtifacts`.
- `--implementation` delegates to SDK; `graphHint` is presentation-only.
- **No `@specd/core` import.** Schema version warning uses `lifecycle.schemaInfo` vs `change.schemaName@version` (does not independently resolve schema for the warning). `getActiveSchema` is used only for DAG children/roots (allowed by Schema-derived fields).

Drafted path: `isDrafted: true` in JSON; text `state: … (drafted)` and `transitions: (none — change is drafted)`.

### Discrepancies

| ID   | Verdict                                     | Severity | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS-1 | **code-wrong**                              | low      | Drafted text still prints `next action:` / `command:` from GetStatus. Spec: MUST NOT print **actionable lifecycle transitions** that would mutate a draft. CLI hardcodes empty `transitions:` but does not suppress `nextAction.command` if Core ever returns one. Tests only cover `command: null`. Alternative reading: CLI is a presenter of GetStatus (constraint: do not recompute). Prefer adding a presentation guard or specifying that GetStatus must null the command for drafts. |
| CS-2 | **spec-wrong** (help vs body)               | low      | `--help` JSON sketch lists `schema: { name, version }` without `artifactDag`, while Requirement Schema-derived fields and the handler emit `schema.artifactDag`. Review help **does** list `overlapDetail` as required.                                                                                                                                                                                                                                                                     |
| CS-3 | **code-wrong** vs `default:_global/testing` | low      | `status.spec.ts` names are mostly phrase titles, not `given…, when…, then…`. Widespread CLI pattern, not unique to this change.                                                                                                                                                                                                                                                                                                                                                             |
| CS-4 | **compliant** (called out)                  | —        | Text filter of `OVERLAP_CONFLICT` is specified presentation, not lifecycle recomputation. Architecture “no business logic in CLI” holds if this stays a display rule tied to `review.reason`.                                                                                                                                                                                                                                                                                               |

No high/critical implementation bugs found against the **change preview**. Archived `specs/cli/change-status` on disk may lag the preview until archive.

### Test Coverage

`packages/cli/test/commands/change/status.spec.ts` (mirrors `src/commands/change/status.ts`): drafted JSON/text, signature, DAG/hasTasks/drift state, implementation flag, schema mismatch warning, not-found, overlap/review/drift file-list omission, details `tasks: N/M`, blockers with labels (overlap path).

Additional overlap with `change.spec.ts` and implementation-review integration tests.

### Missing Tests

- Verify scenario **nextAction implements vs verify follows GetStatus** (CLI must not substitute `/specd-implement` when GetStatus says `/specd-verify`).
- Verify scenario **text DAG does not repeat convergent nodes** (schema-std `design` under proposal and specs).
- Verify scenario **DEPS_INCONSISTENT — Checking spec dependencies** (label format is covered via overlap blockers, not this code).
- Schema warning skipped when `lifecycle.schemaInfo` is `null`.
- Drafted `nextAction.command` non-null must not print a `change transition` line (CS-1).

### Spec Dependency Chain

- `cli:entrypoint` — output/exit conventions
- `core:change` — state model
- `core:get-status` — projections (`availableTransitions`, `nextAction`, blockers, review)
- `sdk:build-implementation-review` — `--implementation`
- Globals: architecture (presenter/adapter), testing (layout/names)

### Summary counts (`cli:change-status`)

- Requirements: **16**
- Implemented: **16** (CS-1 residual on drafts)
- Missing: **0**
- Partial: **1** (draft nextAction)
- Discrepancies: **3** (1 low code, 1 low spec-help, 1 low testing names)
- Covered by tests: **14**
- Untested / weakly tested requirements: **2** (lifecycle nextAction passthrough; convergent DAG)

---

## cli:change-transition

### Requirements Summary

Change preview (supersedes on-disk `specs/cli/change-transition` routing table):

| #   | Requirement                       | Intent                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                 | `<name> [step]`, `--next`, `--skip-hooks`, `--allow-out-of-scope`, `--format`; alias `change`/`changes` |
| 2   | Next-transition resolution        | `to: 'next'` to `TransitionChange`; **no** CLI from→to table; **no** `GetStatus.nextAction` as resolver |
| 3   | Delegates refresh policy          | No detector/refresh in CLI; pre/post GetStatus `refreshImplementationTracking: false`                   |
| 4   | Approval-gate routing             | No gate flags on execute; no rewrite to pending parking                                                 |
| 5   | Hook execution                    | Map `--skip-hooks` to `skipHookPhases`                                                                  |
| 6   | Progress output                   | Generic check bus; **no** `stream: "hook-progress"`; structured `stream: "change-transition"`           |
| 7   | Transition hook observability     | Surface hook progress before failure                                                                    |
| 8   | Shared hook progress presentation | Transition uses check presenter; `run-hooks` MAY keep hook-progress stream                              |
| 9   | Output on success                 | Text confirmation; JSON terminal `complete` on same stream                                              |
| 10  | Post-hook failure                 | exit 2, `error:`; not a post-transition warning                                                         |
| 11  | Invalid transition error          | Repair guide on stderr from GetStatus; `HookFailedError` no guide, exit 2                               |
| 12  | Incomplete tasks error            | exit 1; name blocking artifact (Core message)                                                           |
| 13  | Check progress rendering          | Gerund `(id)`, ✓/✗, no `Executing:`; hooks on same bus                                                  |
| 14  | Unsatisfied requires              | Surface Core blockers; repair guide from GetStatus                                                      |

**On-disk `specs/cli/change-transition` still describes a CLI-owned `drafting→designing` table.** Change preview is the opposite (`to: 'next'`). After archive, workspace spec must match preview. That is **change vs committed spec**, not CLI vs preview.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts`.

- `--next` → `to: requestedTarget` with `'next'`; mutually exclusive with `<step>` (`validateRequestedTarget`).
- `--allow-out-of-scope` → `allowOutOfScope: true` **only when set**; omitted otherwise (does not invent skippable bypass of `impl.filesResolved` — Core owns that).
- `skipHookPhases` from comma list; empty set when omitted.
- Execute input has no approval flags.
- Pre-status and repair-status: `refreshImplementationTracking: false`.
- Progress: `createCheckProgressPresenter({ streamName: 'change-transition' })` for `check-*` events. Text check progress on **stderr**; structured on **stdout**. `run-hooks` still uses `_hook-progress-presenter.ts` with `stream: "hook-progress"` (allowed).
- Repair guide: GetStatus blockers + `nextAction` (including verify vs implement tests).
- `HookFailedError` falls through to `handleError` → exit 2, no repair guide.
- Argument validation uses `CHANGE_STATES` (membership only, not availability) — not a protocol filter.

**Architecture:** CLI presents `TransitionChange` / `GetStatus` results. Residual presentation for legacy events `requires-check` and `task-completion-failed` (switch in `makeProgressRenderer`) if Core still emits them; preview’s public bus is `check-start` / `check-progress` / `check-done`.

### Discrepancies

| ID   | Verdict                                     | Severity | Evidence                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT-1 | **spec-wrong** (workspace vs change)        | medium   | Committed `specs/cli/change-transition/spec.md` still requires a CLI routing table for `--next`. **Change preview and code** pass `to: 'next'`. Until archive, agents reading `specs/` without preview will be wrong.                                                                     |
| CT-2 | **code-wrong** (dead/legacy adapter)        | low      | `makeProgressRenderer` still special-cases `requires-check` and `task-completion-failed` outside the generic check presenter. If Core only emits `check-*`, this is unused; if Core still emits them, the public bus is split. Spec wants one bus.                                        |
| CT-3 | **code-wrong** vs `default:_global/testing` | low      | No `test/commands/change/_check-progress-presenter.spec.ts` mirroring `src/commands/change/_check-progress-presenter.ts`. Behaviour covered inside `transition.spec.ts` / `archive.spec.ts`. `_hook-progress-presenter.spec.ts` lives under `test/commands/` not `test/commands/change/`. |
| CT-4 | **both**                                    | low      | Repair-guide spec example `error: cannot transition to <step>`; implementation prints `error: ${err.message}`. Tests match Core error strings. Spec example is illustrative **or** CLI should normalize the prefix.                                                                       |

`--next` / `--allow-out-of-scope` **match the change preview**.

### Test Coverage

`packages/cli/test/commands/change/transition.spec.ts`: missing step vs `--next`, mutual exclusion, `to: 'next'`, `allowOutOfScope` set/omitted, no approval flags, no pending rewrite, hook failure exit 2 without repair guide, check-bus hook progress, JSON `change-transition` not `hook-progress`, repair guide from GetStatus (verify skill), `--next` failures (`HappyPathNextUnavailableError`), incomplete tasks / skip-hooks still blocked, refresh flags.

### Missing Tests

- Dedicated unit tests for `createCheckProgressPresenter` (heartbeat / sanitization) — currently only via command tests.
- Incomplete-tasks scenario that the **CLI** (not Core) names the artifact independently — CLI correctly relays Core `message`; no extra CLI logic to test.
- Explicit assertion that `GetStatus.nextAction` is **not** used to pick `to` (only that `to: 'next'` is passed). Current tests imply this.

### Spec Dependency Chain

- `cli:entrypoint`
- `core:transition-change` (happy-path `next`, `allowOutOfScope`, hooks)
- `core:get-status` (repair guide)
- `core:transition-checks` (check bus, gerund labels)
- `core:hook-execution-model`
- Globals: architecture, testing

### Summary counts (`cli:change-transition`)

- Requirements: **14**
- Implemented: **14** against **change preview**
- Missing: **0** (preview)
- Partial: **1** (legacy progress event types)
- Discrepancies: **4** (1 medium committed-spec drift, 3 low)
- Covered by tests: **13**
- Untested / layout gaps: **1** (mirrored presenter spec file)

---

## cli:change-approve

### Requirements Summary

| #   | Requirement                    | Intent                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------ |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + `--format`                     |
| 2   | Delegates gate state to kernel | `{ name, reason }` only; `kernel.changes.approveSpec` / `approveSignoff` |
| 3   | Artifact hash computation      | CLI must not hash or pass hashes                                         |
| 4   | Approve spec behaviour         | Stay in `ready`; no print of `pending-spec-approval`; bound-from help    |
| 5   | Approve signoff behaviour      | Stay in `done`; bound-from help                                          |
| 6   | Output on success              | `approved <gate> for <name>` or `{ result, gate, name }`                 |
| 7   | Error cases                    | Missing `--reason`; wrong state; not found → exit 1                      |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- `requiredOption('--reason')`.
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags, not `kernel.specs.*`.
- Help: ready / pending drain for spec; done / pending drain for signoff.
- Success strings and JSON match spec.
- Errors via `handleError`.

**Architecture:** thin adapter. **Core deps:** SDK only.

### Discrepancies

| ID   | Verdict                         | Severity | Evidence                                                                                                                                                                                                               |
| ---- | ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-1 | **code-wrong** (test vs verify) | low      | Wrong-state scenario is exercised with `ApprovalGateDisabledError`, not a state-mismatch error. CLI still prints `error:` and exit 1. Verify.md wants “not in expected state”; gate-disabled is a different Core code. |
| CA-2 | **code-wrong** vs testing names | low      | Same given/when/then gap as other CLI tests.                                                                                                                                                                           |

No business-logic leak.

### Test Coverage

`packages/cli/test/commands/change/approve.spec.ts`: success spec/signoff, no pending in stdout, execute `{ name, reason }`, JSON, missing reason, not found, unknown sub-verb `review`.

Does **not** assert `kernel.specs.approveSpec` was not called (verify scenarios). Implementation makes that call impossible without a new import.

### Missing Tests

- `kernel.specs.*` not invoked (verify “execute call shape”).
- Signoff JSON output (spec JSON scenario is spec-gate only; signoff JSON is implied).
- Hash-not-passed is implied by call args; no explicit `expect(call).not.toHaveProperty('artifactHashes')`.

### Spec Dependency Chain

- `cli:entrypoint`
- `core:change` — approval records
- `core:transition-checks` — `approval.spec` / `approval.signoff` in-place gates

### Summary counts (`cli:change-approve`)

- Requirements: **7**
- Implemented: **7**
- Missing: **0**
- Partial: **0**
- Discrepancies: **2** (low test/global)
- Covered by tests: **6**
- Untested verify rows: **1** (specs namespace not used)

---

## cli:change-archive

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                                                    |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature            | `changes archive` canonical; `change archive` alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope`; `--format` |
| 2   | Prerequisites                | Must be `archivable`; else exit 1 naming state                                                                                            |
| 3   | Behaviour                    | Delegate `ArchiveChange` (merge, move, history)                                                                                           |
| 4   | Hook execution               | Map skip set onto `ArchiveChangeInput`                                                                                                    |
| 5   | Check progress rendering     | Same gerund bus as transition; `stream: "change-archive"`                                                                                 |
| 6   | Post-archive hooks           | Failures → exit 2                                                                                                                         |
| 7   | Output on success            | Path line; invalidated section when non-empty                                                                                             |
| 8   | Output on success (extended) | `--allow-overlap` invalidated list                                                                                                        |
| 9   | JSON output on success       | Terminal `change-archive` complete; no second unwrapped object                                                                            |
| 10  | Error cases                  | not found / not archivable / merge fail → exit 1                                                                                          |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Options match spec; `allowOverlap` / `allowOutOfScope` only when flags set.
- Progress: `createCheckProgressPresenter({ streamName: 'change-archive' })`.
- Post-hook failures: `cliError(..., 2)`.
- Text path + invalidated list; JSON single stream complete record.
- `SpecOverlapError` → stderr + `--allow-overlap` hint, exit 1.
- Parent `changes` has `.alias('change')` in `packages/cli/src/index.ts`.

**Architecture:** presenter + flag mapping. No archive merge logic in CLI.

### Discrepancies

| ID    | Verdict                   | Severity | Evidence                                                                                                                                                                                                                   |
| ----- | ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAR-1 | **code-wrong** vs verify  | low      | Verify “Singular alias invocation” is not tested against the real program (`changes`.alias(`change`)). Unit tests register archive on a parent named `change` only. Alias wiring lives in `index.ts` and is untested here. |
| CAR-2 | **code-wrong** vs testing | low      | No mirrored `_check-progress-presenter.spec.ts`; archive check-bus covered in `archive.spec.ts`.                                                                                                                           |
| CAR-3 | **both**                  | low      | Prerequisites “stderr mentioning current state” depends on Core error text; CLI `handleError` prints `err.message`.                                                                                                        |

`--allow-out-of-scope` is specified and forwarded; tests exist.

### Test Coverage

`archive.spec.ts`: text path, post-hook exit 2, JSON complete stream + preceding check events, skip-hooks all/pre/post, `allowOutOfScope` set/omitted, check-bus gerund + no `Executing:`, overlap handling.

### Missing Tests

- Full-program `specd change archive` vs `specd changes archive` alias.
- Not-archivable current-state string (Core-driven).
- Merge conflict descriptive error (Core-driven).

### Spec Dependency Chain

- `cli:entrypoint`
- `cli:command-resource-naming` — plural canonical + singular alias
- `core:change` / `core:archive-change`
- `core:hook-execution-model`
- `core:transition-checks` — check bus

### Summary counts (`cli:change-archive`)

- Requirements: **10**
- Implemented: **10**
- Missing: **0**
- Partial: **0**
- Discrepancies: **3** (low)
- Covered by tests: **9**
- Untested: **1** (real alias at argv)

---

## skills:skill-templates-source

### Requirements Summary

Base spec + change deltas (in-place gates, overlap vs invalidation, implementation drain, archive `--skip-hooks pre`, design review scope):

| #    | Requirement                                                             | Intent (this change + standing)                                                |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1–10 | Template layout, metadata, Handlebars, graph impact/search, frontmatter | Standing skills package contract                                               |
| 11   | Implementation tracking instructions                                    | add + archive integrity                                                        |
| 12   | Metadata self-healing                                                   | no status scans; generate-metadata is repair-only                              |
| 13   | Optimizer gating                                                        | `llmOptimizedContext` from `project status`                                    |
| 14   | Agent-facing command roles                                              | show / context / metadata                                                      |
| 15   | In-place approval gates                                                 | stay in ready/done; no transition into pending; router skill silent on signoff |
| 16   | Overlap vs invalidation                                                 | hop skills: no `OVERLAP_CONFLICT` as typical; archive: live overlap only       |
| 17   | Verify/implement tracking ownership                                     | shared cookbook; verify drains; implement zero-open before `/specd-verify`     |
| 18   | Archive skips only pre                                                  | `--skip-hooks pre`, not `all`; no post `run-hooks`                             |
| 19   | Design review scope                                                     | not “listed under review:”; details / `affectedArtifacts`                      |

**nextAction / command (user focus):** Requirement 14 + shared “Next Action engine”: prefer `nextAction.command` / Repair Guide over local routing. `specd-new` table uses `nextAction.targetStep` with drain-only pending rows. Skills that **own a hop** still show explicit `changes transition <name> <step> --skip-hooks all` (or archive `--skip-hooks pre`). Spec does **not** require teaching CLI `--next`; Core `--next` is a CLI convenience. Templates should not contradict `nextAction`.

### Implementation Status

Templates under `packages/skills/templates/skills/` and `shared/shared.md.tpl`. Contract tests: `packages/skills/test/template-workflow.spec.ts`.

- Shared: nextAction object; Repair Guide; never run `changes approve`; stay in ready/done; drain pending only; implementation list/resolve/ignore/add; `--snippet` opt-in.
- Design/implement/verify/archive/new: in-place gates; overlap copy; implement zero-open; verify drain; archive `--skip-hooks pre` + `--allow-out-of-scope` example; design review from details.
- Entry `specd` skill: router only; tests forbid signoff / pending / approve spec.
- `--next` is **absent** from skill templates (explicit hops + nextAction). Consistent with “CLI must not treat nextAction as `--next` resolver” while skills **do** follow nextAction for **what to run**.

**Architecture:** templates are not CLI adapters; no business logic in CLI. Skills package → `@specd/core` is the allowed dependency direction.

### Discrepancies

| ID   | Verdict                       | Severity | Evidence                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SK-1 | **spec-wrong** (optional gap) | low      | Change CLI spec adds `--next` / `--allow-out-of-scope` as operator flags. Skill templates document `--allow-out-of-scope` on **archive**, not on **transition**, and never `--next`. If agents should offer happy-path `--next`, the skills spec does not say so — they follow `nextAction.command` instead. Not a code bug unless product intent was to teach `--next`. |
| SK-2 | **compliant**                 | —        | Hop skills hardcode `transition … verifying` **and** tell agents to follow nextAction/Repair Guide. Tension is procedural (skill owns hop) vs status-driven. Tests lock gate copy.                                                                                                                                                                                       |

Standing template requirements (frontmatter, optimizer agents, graph terminology) were not fully re-indexed file-by-file in this batch; graph search + `template-workflow.spec.ts` + spot-checks of shared/new/design/implement/verify/archive show change deltas **present**. No contradiction with `core:transition-checks` in-place gates found in those templates.

### Test Coverage

`template-workflow.spec.ts` asserts: optimizer gates, command roles, pending-not-happy-path, implementation drain, archive pre-only, design review header, OVERLAP_CONFLICT split, generate-metadata not routine. Matches “assert exact commands/fields, not keyword-only” for the gated strings.

### Missing Tests

- Explicit assertion that **transition** examples never use `stream: hook-progress` (N/A in templates).
- Explicit `--next` presence/absence if product wants a contract.
- `changes transition … --allow-out-of-scope` in implement/verify templates (spec does not require it; CLI flag exists).

### Spec Dependency Chain

- `skills:skill`
- `cli:spec-optimizations`
- `skills:workflow-automation`
- `core:transition-checks` (change delta)
- Indirect: `cli:change-status` / `cli:change-transition` presentation that templates describe

### Summary counts (`skills:skill-templates-source`)

- Requirements: **19** (standing + 5 change-owned)
- Implemented: **19** for change-owned; standing assumed from existing templates/tests
- Missing: **0** (change-owned)
- Partial: **0**
- Discrepancies: **1** (low: `--next` not in templates; spec-optional)
- Covered by tests: **change-owned 5/5** plus standing optimizer/roles tests
- Untested: `--next` contract (unspecified)

---

## Cross-cutting: architecture, testing, core deps

| Check                          | Result                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI imports `@specd/core`      | **None** (`graph`/package.json: `@specd/sdk` + plugins + schema-std)                                                                                 |
| CLI contains lifecycle routing | **No** for `--next` (preview). `CHANGE_STATES` is argv validation only.                                                                              |
| CLI check vs hook progress     | **Split as specified:** transition/archive → `createCheckProgressPresenter` / `change-transition` \| `change-archive`; `run-hooks` → `hook-progress` |
| Skills → core                  | **Allowed**                                                                                                                                          |
| `test/` mirrors `src/`         | **Mostly.** Gap: `_check-progress-presenter.ts`; hook presenter spec one directory up                                                                |
| given/when/then names          | **Mostly not** in CLI command tests (global testing spec)                                                                                            |

---

## Batch totals

| Spec                          | Reqs   | Impl   | Missing reqs | Partial | Disc.  | Tests cover | Weak/missing tests |
| ----------------------------- | ------ | ------ | ------------ | ------- | ------ | ----------- | ------------------ |
| cli:change-status             | 16     | 16     | 0            | 1       | 3      | 14          | 2                  |
| cli:change-transition         | 14     | 14     | 0            | 1       | 4      | 13          | 1                  |
| cli:change-approve            | 7      | 7      | 0            | 0       | 2      | 6           | 1                  |
| cli:change-archive            | 10     | 10     | 0            | 0       | 3      | 9           | 1                  |
| skills:skill-templates-source | 19     | 19     | 0            | 0       | 1      | 18          | 1                  |
| **Sum**                       | **66** | **66** | **0**        | **2**   | **13** | **60**      | **6**              |

**Severity mix:** 1 medium (committed `cli:change-transition` `--next` table vs preview/code), 12 low.

**Highest-priority follow-up:** archive the change so workspace `specs/cli/change-transition` matches preview (`to: 'next'`), or agents will implement the old CLI routing table.
