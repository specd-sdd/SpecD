# Spec compliance partial: CLI + skills (workflow-transition-checks)

- **Mode:** change audit
- **Change:** `workflow-transition-checks`
- **Date:** 2026-08-27
- **Auditor:** read-only; no code or spec edits
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** `project status --graph` reported `stale: false` but `fileCount: 0`, `symbolCount: 0`. `graph search` returned spec hits only; `graph impact --file cli:src/commands/change/transition.ts` failed (`no indexed file`). Navigation: spec search, then Read of command sources, tests, `docs/cli/cli-reference.md`, skill templates.

**Locked product (this batch):** check bus stream `change-transition` / `change-archive` (NOT `hook-progress` for transition); Repair Guide on stderr; `--next` from `signed-off` → `archivable`; `HookFailedError` exit 2 with no repair guide; stay-in-`ready`/`done`.

**Do not recycle:** Repair Guide on stdout, transition JSON `hook-progress`, pending-state hop as happy path, `--next` missing `signed-off` — **those are currently implemented and tested.**

---

## cli:change-status

### Requirements Summary

Merged preview (`changes spec-preview workflow-transition-checks cli:change-status`): 16 requirements.

| Requirement                             | Intent                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Command signature                       | `change status <name> [--format text\|json\|toon]`                                                 |
| Drafted change status is read-only      | No mutating transition ads; indicate drafted (`(drafted)` / `isDrafted: true`); artifacts MAY show |
| Output format                           | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display-state (e.g. `complete-with-drift`)      |
| Task completion display in DAG          | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                   |
| Display-state rendering                 | Text prefers display status; JSON includes canonical + display                                     |
| Lifecycle projections from GetStatus    | No local `VALID_TRANSITIONS` re-filter                                                             |
| Text omits duplicated review file lists | No `review:` file dump; overlap peers still print                                                  |
| Text blockers include check labels      | `! CODE — label: message`                                                                          |
| Schema version warning                  | stderr `warning:`; skip if `schemaInfo` null; no independent schema resolve for the warning        |
| Change not found                        | exit 1, `error:`                                                                                   |
| Schema-derived fields                   | `schema.artifactDag` from `artifactDag()`; text DAG display status; convergent nodes once          |
| Delegates refresh to GetStatus          | No direct refresh/detector                                                                         |
| Implementation section                  | `--implementation` via SDK projection                                                              |
| Task completion in details              | `tasks: N/M`                                                                                       |
| Basic info                              | name + state; no standalone `specs:` line                                                          |
| Specs and dependencies                  | text list + JSON `specDependsOn`                                                                   |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts`.

- Drafted: text `state: … (drafted)`, `transitions: (none — change is drafted)`; JSON `isDrafted: true`.
- Display-state, DAG `hasTasks`, blocker labels, overlap-only review peers, `getActiveSchema` only for DAG (warning uses `lifecycle.schemaInfo`).
- `--implementation` → `buildImplementationReview` (`_implementation-tracking.ts`), not ad-hoc graph matching.
- GetStatus invoked without CLI-side refresh/detector.

**Partial / docs-only:** Commander `--help` JSON schema omits `isDrafted`, `hasTasks`, blocker `label`/`checkId`. `docs/cli/cli-reference.md` **change status** does not document drafted/`isDrafted` (drafting is documented under drafts commands only).

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                  | B (code/docs)                                                                                                                             | Assessment                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ST-1 | Drafted JSON example includes `isDrafted: true`; text indicates drafted                   | Code matches. `cli-reference.md` status section does not mention drafted/`isDrafted`. Status `addHelpText` JSON schema omits `isDrafted`. | **Docs/help drift.** Code is correct. Spec vs `default:_global/docs` (output contract in `docs/cli/` same change). |
| ST-2 | Text DAG `[hasTasks]` when `hasTasks: true` **or** `taskCompletionCheck` (JSON uses both) | Text `renderDag` gates the tag on `artifact.hasTasks` only; JSON uses `hasTasks \|\| taskCompletionCheck`.                                | **Minor code/spec split** if a schema sets only `taskCompletionCheck`. Schema-std typically sets both.             |
| ST-3 | MUST NOT print **actionable lifecycle transitions** for drafted                           | Transitions line is suppressed. `next action` still renders from GetStatus (tests use `command: null`).                                   | **Compliant if** GetStatus never returns a mutating command for drafts. CLI does not extra-filter `nextAction`.    |

No current major: status does not re-add `verifying` locally; review files are not duplicated under a `review:` header.

### Test Coverage

- `packages/cli/test/commands/change-status.spec.ts`: JSON `isDrafted`, text `(drafted)` and no `change transition`.
- `packages/cli/test/commands/change/change-status.spec.ts`: specDependsOn, `complete-with-drift`, overlap without `review:` header, `DEPS_INCONSISTENT` gerund labels, JSON `blockers[].label`.

### Missing Tests

- Help/docs: `--help` JSON schema includes `isDrafted` / `hasTasks`.
- Text DAG tag when `taskCompletionCheck` is set and `hasTasks` is false.
- Drafted `nextAction.command` non-null must still not advertise `change transition` (guard if core ever returns a command).

### Spec Dependency Chain

- `cli:entrypoint` (exit codes, format)
- `core:get-status` / lifecycle check projections (not in this batch)
- `sdk:build-implementation-review` for `--implementation`
- `default:_global/docs` for CLI reference alignment

### Counts

| Metric                   | Count                             |
| ------------------------ | --------------------------------- |
| Requirements             | 16                                |
| Fully implemented        | 15                                |
| Partial (help/docs)      | 1 (drafted contract in help/docs) |
| Code majors              | 0                                 |
| Docs/help minors         | 2 (ST-1, ST-2)                    |
| Test files covering spec | 2                                 |
| Missing tests (material) | 2                                 |

---

## cli:change-transition

### Requirements Summary

Merged preview: command signature (`<step>` xor `--next`, `--skip-hooks`, format); `--next` map including `signed-off` → `archivable` and refuse pending/archivable; refresh false on pre-status and repair GetStatus; no CLI approval rewrite (stay `ready`/`done`); hooks via `skipHookPhases`; **progress stream `change-transition`**, not `hook-progress`; success/failure terminal `complete` on that stream; Repair Guide **stderr**; `HookFailedError` exit **2**, no repair guide; check bus gerund labels, no `Executing:`; incomplete tasks / requires → exit 1.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts` + `createCheckProgressPresenter({ streamName: 'change-transition' })`.

- `--next` map includes `signed-off` → `archivable`.
- Repair guide: `writeTextRepairGuide` → **stderr**; JSON failure is `stream: "change-transition"` `complete`/`failure`.
- `isRepairGuideError` does **not** include `HookFailedError`; that falls through to `handleError` → exit 2, `error: hook '…' failed`.
- Text check progress on **stderr**; JSON records on **stdout**.
- Commander description: in-place gates (`ready`/`done`; pending drain only).
- Help: `{ stream: "change-transition", … }` — matches locked product.
- `docs/cli/cli-reference.md` **change transition**: Repair Guide on **stderr**; JSON `change-transition`; not `hook-progress`; `signed-off -> archivable`; stay in `ready`/`done`. **Aligned with code.**

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                | B (code/docs)                                                                                                                                                                                     | Assessment                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| TR-1 | Transition JSON stream is `change-transition`                                           | Code, tests, Commander help, `cli-reference.md` match. `docs/guide/workflow.md` Hooks section still says JSON in-flight hook progress is on **stderr** with final result on stdout.               | **Not a CLI bug.** Stale **guide** vs current CLI contract (`default:_global/docs`: any doc with the old shape is in scope). |
| TR-2 | `run-hooks` MAY keep `hook-progress`; MUST NOT share public JSON stream with transition | `run-hooks.ts` still emits `hook-progress`. `cli-reference.md` run-hooks says it “shares the same live hook-progress presentation as change transition” then documents `stream: "hook-progress"`. | **Wording collision** (stream name vs “presentation”). JSON names are distinct. Minor docs.                                  |

No current major: Repair Guide is not on stdout; transition does not emit `hook-progress`.

### Test Coverage

- `packages/cli/test/commands/change-transition.spec.ts`: `--next` including `signed-off` → `archivable`; no pending rewrite; HookFailedError exit 2 and **no** `repair guide:` on stderr/stdout; JSON NDJSON `change-transition` through `complete`; Repair Guide on stderr not stdout; refresh `false`.
- `packages/cli/test/commands/change/change-transition.spec.ts`: repair guide for typed errors; no silent implementing → pending.
- `packages/cli/test/commands/change.spec.ts`: JSON terminal `change-transition` `complete`.
- `packages/cli/test/handle-error.spec.ts`: HookFailedError → exit 2.

### Missing Tests

- Commander `.description()` / `--help` asserts in-place-gate copy (behavior is already in description).
- Explicit assert JSON lines never have `stream: "hook-progress"` (implied by equality to `change-transition`).

### Spec Dependency Chain

- `cli:entrypoint`
- `core:transition-change`, `core:transition-checks`, `core:get-status`
- `core:hook-execution-model`
- `default:_global/docs`

### Counts

| Metric                                         | Count                                  |
| ---------------------------------------------- | -------------------------------------- |
| Requirements (spec.md)                         | 14 named + constraints                 |
| Fully implemented (CLI)                        | all locked-product items               |
| Code majors                                    | 0                                      |
| Docs minors (outside cli-reference transition) | 2 (TR-1 guide, TR-2 run-hooks wording) |
| Tests covering locked product                  | strong                                 |
| Missing tests                                  | 1 (help text)                          |

---

## cli:change-approve

### Requirements Summary

Subcommands `spec` / `signoff`; `--reason` required; pass only `{ name, reason }` via `kernel.changes.approveSpec|approveSignoff`; hashes not computed in CLI; from `ready` stay in `ready` (no print of hop to `pending-spec-approval`); from `done` stay in `done`; help uses bound-`from` language; text `approved <gate> for <name>`; JSON `{ result, gate, name }`; errors exit 1.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- Descriptions: `ready` / drain `pending-spec-approval`; `done` / drain `pending-signoff`.
- `docs/cli/cli-reference.md` approve spec/signoff: leave in `ready`/`done`; drain pending. **Aligned.**

### Discrepancies (A vs B)

None material. CLI never prints a transition to pending; success copy is `approved spec|signoff for <name>`. Stay-in-state is owned by core; CLI tests assert execute payload and stdout.

### Test Coverage

- `packages/cli/test/commands/change-approve.spec.ts` and `packages/cli/test/commands/change/change-approve.spec.ts`: ready/done consent, no pending in stdout, drain still invoked, `{ name, reason }` only.

### Missing Tests

- `--help` bound-from strings (`ready` / `done`) as required by spec “Help text MUST…”.
- JSON success shape is covered in root approve spec file (verify.md scenario).

### Spec Dependency Chain

- `cli:entrypoint`
- `core:change`, `core:transition-checks` (approval.spec / approval.signoff)

### Counts

| Metric            | Count                       |
| ----------------- | --------------------------- |
| Requirements      | 7                           |
| Fully implemented | 7                           |
| Code majors       | 0                           |
| Missing tests     | 1 (Commander help language) |

---

## cli:change-archive

### Requirements Summary

`changes archive` canonical + `change archive` alias; `--skip-hooks` `pre|post|all`; `--allow-overlap`; must be `archivable`; delegate `ArchiveChange`; check bus gerunds, hooks on same bus; post-hook failures exit 2; text archive path + optional invalidated section; **JSON/TOON terminal `stream: "change-archive"` `complete` with `result/name/archivePath/invalidatedChanges`**; progress on same stream; **no second unwrapped JSON object**.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Presenter `streamName: 'change-archive'`; text progress stderr; JSON complete record on stdout.
- Commander help documents `change-archive` stream and terminal `complete` — **matches spec and code**.
- Post-hook failures: `cliError(..., 2)` before success print.

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                                              | B (code/docs)                                                                                                                                                                               | Assessment                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AR-1 | JSON success is a structured stream `change-archive` + `complete`; callers MUST NOT require a second unwrapped object | Code emits only the stream record. Tests `JSON.parse(stdout())` for success **without** progress events (single JSON value).                                                                | **Code compliant** for the no-progress path.                                           |
| AR-2 | Same as AR-1, plus `default:_global/docs`: CLI docs MUST describe machine output                                      | `docs/cli/cli-reference.md` **change archive** has flags and archivable/overlap/`--allow-out-of-scope` but **does not** mention `stream: "change-archive"`, NDJSON, or terminal `complete`. | **Current docs gap** (not an old recycled major). Help text is ahead of cli-reference. |
| AR-3 | Spec.md “Output on success” body is truncated/malformed in the merged preview                                         | Implementation still has a coherent text/JSON split.                                                                                                                                        | **Spec quality** in the change delta, not a CLI bug.                                   |

`--allow-out-of-scope` is extra vs the spec signature table; docs list it. Not a locked-product regression.

### Test Coverage

- `packages/cli/test/commands/change-archive.spec.ts`: text path; exit 2 post-hooks without success line; JSON `stream === 'change-archive'` + `complete` + `invalidatedChanges`; text invalidated section; skip-hooks forwarding; text check bus (gerund, `Running pre hooks`, no `Executing:`).

### Missing Tests

- JSON **with** in-flight `check-*` events: NDJSON lines all `stream: "change-archive"`, last event `complete`, `JSON.parse` of **full** stdout must fail (proves no extra unwrapped object / that consumers must read NDJSON). Current success tests would break if progress were emitted on stdout in the same test.

### Spec Dependency Chain

- `cli:entrypoint`, `cli:command-resource-naming`
- `core:archive-change`, `core:change`, `core:hook-execution-model`, `core:transition-checks`

### Counts

| Metric                         | Count                             |
| ------------------------------ | --------------------------------- |
| Requirements                   | 10 named                          |
| Code vs spec                   | implemented                       |
| Docs vs spec (`cli-reference`) | **gap (AR-2)**                    |
| Code majors                    | 0                                 |
| Missing tests                  | 1 (JSON progress+complete NDJSON) |

---

## skills:skill-templates-source

### Requirements Summary

Large template-source spec (locations, metadata, Handlebars, graph impact/search wording, frontmatter, implementation tracking, metadata self-heal, optimizer gating, command roles, **in-place approval gates**).

This batch’s locked focus: stay-in-`done` / stay-in-`ready`; pending parking **drain-only** for new work; no `change transition` into pending as happy path.

### Implementation Status

**In-place gates: implemented** in templates:

- `specd-verify/SKILL.md.tpl`: signoff on → stay in `done`; `approve signoff`; do not transition into `pending-signoff`.
- `specd-implement/SKILL.md.tpl`: spec gate → stay in `ready`; do not `transition implementing`.
- `shared.md.tpl`: never run `changes approve`; **stays** in `ready` or `done`; pending drain-only; hook “states you pass through” lists delivery states only, not pending as happy-path intermediates.
- `specd-new/SKILL.md.tpl` `targetStep` table: pending rows **Drain only**; `ready`/`done` gate copy.
- `specd-design/SKILL.md.tpl`: stay in `ready`; no happy-path pending wait.
- `specd/SKILL.md.tpl` and `specd-archive/SKILL.md.tpl`: in-place gates on `ready`/`done`; no transition into pending.

`packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` asserts the above.

Other template requirements (snippet opt-in, optimizer `llmOptimizedContext`, metadata self-heal) still have dedicated tests in the same file; `--changes` impact selector not present in templates (grep).

### Discrepancies (A vs B)

None found for in-place-gate / no-pending-parking requirements.

### Test Coverage

`template-workflow.spec.ts`: verify stay in `done`; implement stay in `ready` and do not unconditional `transition implementing`; shared no `reaches pending-spec-approval`; new Drain only; design Stay in `ready`; entry/archive in-place.

### Missing Tests

- Exact Commander-unrelated: none for locked product.
- Keyword tests do not freeze full `targetStep` table rows (acceptable; table was inspected).

### Spec Dependency Chain

- Workflow skills consume `cli:change-*` contracts; `cli:spec-optimizations` for optimizer persistence; graph CLI specs for impact/search wording.

### Counts

| Metric                              | Count |
| ----------------------------------- | ----- |
| In-place-gate scenarios (verify.md) | 7     |
| Implemented                         | 7     |
| Code/template majors                | 0     |
| Missing tests (locked product)      | 0     |

---

## default:\_global/docs (CLI output contract)

### Requirements Summary (relevant)

- Every command documented under `docs/cli/`.
- Command-specific machine output MUST be described so readers need not read implementation.
- Output-contract changes MUST update `docs/cli/` **in the same change**.
- Other `docs/` files documenting the **same stale shape** are in scope.

### Implementation Status vs this change

| Surface                                                | Repair Guide stderr | Transition stream `change-transition` | Archive stream `change-archive` | Stay ready/done        |
| ------------------------------------------------------ | ------------------- | ------------------------------------- | ------------------------------- | ---------------------- |
| `docs/cli/cli-reference.md` transition                 | yes                 | yes                                   | n/a                             | yes                    |
| `docs/cli/cli-reference.md` archive                    | n/a                 | n/a                                   | **missing**                     | n/a                    |
| `docs/cli/cli-reference.md` approve                    | n/a                 | n/a                                   | n/a                             | yes                    |
| `docs/cli/cli-reference.md` status drafted/`isDrafted` | n/a                 | n/a                                   | n/a                             | **missing**            |
| `docs/guide/workflow.md` Hooks JSON                    | n/a                 | **stale** (stderr structured events)  | possibly stale                  | n/a                    |
| Commander help transition/archive                      | n/a                 | yes                                   | yes                             | transition/approve yes |

### Discrepancies (A vs B)

| ID    | Severity         | Finding                                                                                                                                                                                                    |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1 | **Major (docs)** | `cli:change-archive` JSON stream contract is implemented and in `--help`, but **not** in `docs/cli/cli-reference.md` archive section. Violates global docs “output contract in cli-reference same change”. |
| DOC-2 | Minor            | Status drafted/`isDrafted` not in cli-reference status section.                                                                                                                                            |
| DOC-3 | Minor            | `docs/guide/workflow.md` still describes JSON hook progress on **stderr**; transition/archive JSON progress is **stdout** NDJSON on `change-transition` / `change-archive`.                                |
| DOC-4 | Nit              | run-hooks “same live hook-progress presentation as change transition” vs distinct JSON stream names (already documented in the next bullets).                                                              |

### Test Coverage

No automated docs contract tests in this batch.

### Missing Tests

Docs alignment is review-gated (`default:_global/docs` verify.md). No CLI unit test for cli-reference contents.

### Spec Dependency Chain

- `default:_global/conventions`
- CLI command specs as the contracts docs must track

### Counts

| Metric                | Count                  |
| --------------------- | ---------------------- |
| Docs majors (current) | 1 (DOC-1 archive JSON) |
| Docs minors           | 3                      |
| Recycled old majors   | 0                      |

---

## Cross-cutting: Commander description vs in-place gates

| Command           | Description / help                                                             | Verdict                                       |
| ----------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `transition`      | “Approval gates stay in ready/done; pending states drain in-flight work only.” | **Matches** spec                              |
| `approve spec`    | bound `ready` + drain pending-spec-approval                                    | **Matches**                                   |
| `approve signoff` | bound `done` + drain pending-signoff                                           | **Matches**                                   |
| `archive`         | “Move a completed change…” (does not say `archivable`)                         | Soft; prerequisites still exit 1 via use case |
| `status`          | no drafted mention in description                                              | Soft; drafted handled in action               |

No test asserts these description strings.

---

## Summary counts (this partial)

| Spec                            | Reqs audited                    | Code majors | Docs majors                       | Missing tests (material) |
| ------------------------------- | ------------------------------- | ----------- | --------------------------------- | ------------------------ |
| `cli:change-status`             | 16                              | 0           | 0 (help/docs minor)               | 2                        |
| `cli:change-transition`         | locked set + full spec.md       | 0           | 0 (`cli-reference` OK)            | 1                        |
| `cli:change-approve`            | 7                               | 0           | 0                                 | 1                        |
| `cli:change-archive`            | 10                              | 0           | **1** (cli-reference JSON stream) | 1                        |
| `skills:skill-templates-source` | in-place gates + sample of rest | 0           | 0                                 | 0                        |
| `default:_global/docs`          | CLI output alignment            | n/a         | **1** (same as archive)           | n/a                      |

**Honest bottom line:** Locked CLI/skill **behavior** matches the merged specs (check bus names, Repair Guide stderr, `--next` signed-off → archivable, HookFailedError exit 2 without repair guide, stay-in-ready/done, skill drain-only pending). The live gap is **documentation of archive JSON `change-archive` in `docs/cli/cli-reference.md`**, plus stale guide wording and incomplete status drafted docs/help — not a regression of the old stdout-repair-guide / `hook-progress`-on-transition majors.
