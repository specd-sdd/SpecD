# Partial audit: CLI + skills + approve/config (assigned batch)

**Batch:** cli-skills  
**Mode:** change (`workflow-transition-checks`) via `changes spec-preview`  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** `stale: false`, `contentFresh: true`, indexed `2026-08-27T15:08:18.609Z`, ref `2948f1a2`, CLI workspace `VCS_UNMODIFIED`  
**CLI:** `node packages/cli/dist/index.js`

**Assigned specs (spec-preview):**

- `cli:change-status`
- `cli:change-transition`
- `cli:change-approve`
- `cli:change-archive`
- `skills:skill-templates-source`
- `core:approve-spec`
- `core:approve-signoff`
- `core:config`

**Focus:** text status review header without file lists; `--next` adapter routing; check progress presenter; stay-in-ready/done approvals; skill templates stay-in-state; archive `--skip-hooks pre`. Also `default:_global/testing` test-path mirroring vs CLI tests under `test/commands/change/`.

**Project-wide specs consulted (depth 1 / globals):** `default:_global/architecture`, `default:_global/testing`, `default:_global/conventions`, `default:_global/spec-layout`. Direct deps noted per spec.

---

## Method

- Spec content: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`
- Navigation: `graph stats`, `graph search` (`createCheckProgressPresenter`, `resolveNextTarget`, `ApproveSpec`, `boundFromStates`, `recordSpecApproval`, `skipHookPhases`), `graph impact --file` on CLI command files
- Implementation (after graph locate):
  - `packages/cli/src/commands/change/status.ts`
  - `packages/cli/src/commands/change/transition.ts` (`resolveNextTarget`)
  - `packages/cli/src/commands/change/archive.ts`
  - `packages/cli/src/commands/change/approve.ts`
  - `packages/cli/src/commands/change/_check-progress-presenter.ts`
  - `packages/cli/src/handle-error.ts`
  - `packages/core/src/application/use-cases/approve-spec.ts`
  - `packages/core/src/application/use-cases/approve-signoff.ts`
  - `packages/core/src/composition/use-cases/approve-spec.ts`
  - `packages/skills/templates/skills/*/SKILL.md.tpl`, `templates/shared/shared.md.tpl`
- Tests: `packages/cli/test/commands/change-*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/core/test/application/use-cases/approve-*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

Graph dependents of `_check-progress-presenter.ts`: `archive.ts`, `transition.ts`, plus tests `change-archive.spec.ts`, `change-transition.spec.ts`, `change/change-transition.spec.ts`, `change.spec.ts`. Not used by `run-hooks` (still `_hook-progress-presenter`).

---

## Focus findings (executive)

| Focus                                        | Verdict                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text status review header without file lists | **Compliant**                          | When `review.required`, text prints `review:` + `required` / `route` / `reason` only. Absolute `affectedArtifacts` paths are not reprinted. Files appear under `artifacts (details):`. Overlap peers print as `overlap:` when `reason === 'spec-overlap-conflict'`. JSON/TOON still serialize full `review` including `overlapDetail` and `affectedArtifacts`. Help schema lists both. Tests: `change/change-status.spec.ts`, `change-status.spec.ts`, `change.spec.ts`. |
| `--next` adapter routing                     | **Compliant** (cross-spec tension, D3) | `resolveNextTarget` implements the documented table including `signed-off → archivable` and stderr refusals for pending/archivable/archiving. CLI then calls `TransitionChange.execute({ name, to, skipHookPhases })`. Spec now labels this **adapter routing**, not a second availability algorithm. Architecture still forbids domain logic in adapters; the change spec carves an explicit exception.                                                                 |
| Check progress presenter                     | **Compliant**                          | Shared `createCheckProgressPresenter`. Text: `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix. Streams `change-transition` / `change-archive`. Hooks ride the same bus. `HookFailedError` → exit 2 via `handleError`, no Repair Guide.                                                                                                                                                                                                                              |
| Stay-in-ready / stay-in-done approvals       | **Compliant**                          | `ApproveSpec` / `ApproveSignoff` record consent without transitioning from bound `from` states; drain only from pending. CLI help uses bound-`from` language (`ready` / `done`). CLI passes `{ name, reason }` only.                                                                                                                                                                                                                                                     |
| Skill templates stay-in-state                | **Compliant**                          | `template-workflow.spec.ts` asserts no happy-path pending hops; design/implement/verify/archive/entry/shared copy matches `In-place approval gates`. Design must not say files are listed under `review:`.                                                                                                                                                                                                                                                               |
| Archive `--skip-hooks pre`                   | **Compliant**                          | Archive skill examples use `--skip-hooks pre` not `all`; no post `run-hooks`. CLI maps `pre`/`post`/`all` to `skipHookPhases`. Tests: `change-archive.spec.ts` + `template-workflow.spec.ts`.                                                                                                                                                                                                                                                                            |
| `default:_global/testing` path mirroring     | **Discrepancy D1**                     | CLI tests do not mirror `src/commands/change/<file>.ts` → `test/commands/change/<file>.spec.ts`. Split between flat `test/commands/change-*.spec.ts` and nested `test/commands/change/change-*.spec.ts`.                                                                                                                                                                                                                                                                 |

---

## Requirements Summary

### cli:change-status (15 requirements)

| #   | Requirement                                        | Normative gist                                                                                                                                                                |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                                  | `change status <name> [--format text\|json\|toon]`                                                                                                                            |
| S2  | Drafted change status is read-only                 | `draftView`; no mutating transitions; indicate drafted                                                                                                                        |
| S3  | Output format                                      | JSON/TOON `artifactDag.hasTasks`; DAG `state` is display projection                                                                                                           |
| S4  | Task completion display in DAG                     | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                                                                                                                              |
| S5  | Display-state rendering                            | Text prefers display status; JSON has canonical + display                                                                                                                     |
| S6  | Lifecycle projections from GetStatus               | MUST NOT locally re-filter protocol graph / `VALID_TRANSITIONS`                                                                                                               |
| S7  | **Text status omits duplicated review file lists** | Print `review:` header (`required`/`route`/`reason`); MUST NOT print `affectedArtifacts` paths; overlap peers still print; JSON has full `review`; help lists `overlapDetail` |
| S8  | Text blockers include check labels                 | `! <CODE> — <label>: <message>`                                                                                                                                               |
| S9  | Schema version warning                             | Compare recorded vs `lifecycle.schemaInfo`; skip if null                                                                                                                      |
| S10 | Change not found                                   | exit 1 + `error:`                                                                                                                                                             |
| S11 | Schema-derived fields                              | DAG from `schema.artifactDag()`, `childrenOf`                                                                                                                                 |
| S12 | Delegates refresh to GetStatus                     | No direct Refresh/Detector; default refresh unless future opt-out                                                                                                             |
| S13 | Implementation section                             | `--implementation` uses SDK projection                                                                                                                                        |
| S14 | Task completion in details                         | `tasks: N/M`                                                                                                                                                                  |
| S15 | Basic info + specs and dependencies                | name/state; no standalone `specs:` list; `specDependsOn` section                                                                                                              |

### cli:change-transition (14 requirements)

| #   | Requirement                       | Normative gist                                                                                                  |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature                 | `<name> <step>` or `--next`; skip-hooks `source.pre`…`all`; format                                              |
| T2  | Next-transition resolution        | Fixed forward map as **adapter routing**; `--next` forbidden on pending/archivable; `signed-off` → `archivable` |
| T3  | Delegates refresh policy          | No direct refresh; pre + repair `GetStatus` with `refreshImplementationTracking: false`                         |
| T4  | Approval-gate routing             | No gate flags on execute; do not rewrite to pending parking states                                              |
| T5  | Hook execution                    | Map `--skip-hooks` → `skipHookPhases`                                                                           |
| T6  | Progress output                   | Shared check bus; JSON/TOON `stream: "change-transition"`; never `hook-progress`                                |
| T7  | Transition hook observability     | Surface hook progress even if later fail                                                                        |
| T8  | Shared hook progress presentation | Check-progress presenter; distinct from `run-hooks`                                                             |
| T9  | Output on success                 | Text confirmation stdout; JSON terminal `complete` with `result/name/from/to`                                   |
| T10 | Post-hook failure                 | Hook fail → exit 2; no Repair Guide                                                                             |
| T11 | Invalid transition error          | Exit 1; Repair Guide **stderr**; label form; JSON failure `complete`                                            |
| T12 | Incomplete tasks error            | Exit 1; skip-hooks must not bypass predicates                                                                   |
| T13 | Check progress rendering          | Gerund `<label> (<id>)` then `✓`/`✗`; no `Executing:`                                                           |
| T14 | Unsatisfied requires error        | Exit 1; repair from GetStatus                                                                                   |

### cli:change-approve (7 requirements)

| #   | Requirement               | Normative gist                                                               |
| --- | ------------------------- | ---------------------------------------------------------------------------- |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` required                             |
| A2  | Delegates gate state      | `kernel.changes.approveSpec` / `approveSignoff` with `{ name, reason }` only |
| A3  | Artifact hash computation | CLI must not compute or pass hashes                                          |
| A4  | Approve spec behaviour    | Stay in `ready` on success; help uses bound-`from` (`ready`)                 |
| A5  | Approve signoff behaviour | Stay in `done` on success; help uses bound-`from` (`done`)                   |
| A6  | Output on success         | Text `approved <gate> for <name>`; JSON `{ result, gate, name }`             |
| A7  | Error cases               | Missing `--reason`, unknown sub-verb, wrong state, missing change → exit 1   |

### cli:change-archive (10 requirements)

| #   | Requirement                  | Normative gist                                                                         |
| --- | ---------------------------- | -------------------------------------------------------------------------------------- |
| R1  | Command signature            | Canonical `changes archive`; alias `change archive`; `--skip-hooks` `pre`/`post`/`all` |
| R2  | Prerequisites                | Must be `archivable`; else exit 1 naming state                                         |
| R3  | Behaviour                    | Delegate merge/move/history to `ArchiveChange`                                         |
| R4  | Hook execution               | Map `--skip-hooks` to archive `skipHookPhases`                                         |
| R5  | Check progress rendering     | Same gerund bus; stream `change-archive`                                               |
| R6  | Post-archive hooks           | Post-hook failures → exit 2                                                            |
| R7  | Output on success            | Path line; omit invalidated when empty; JSON follows R9                                |
| R8  | Output on success (extended) | Invalidated list when overlap                                                          |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"`; terminal `complete`; no second unwrapped object     |
| R10 | Error cases                  | Missing name, not found, not archivable, merge failure → exit 1                        |

### skills:skill-templates-source (focus subset of 18+ requirements)

Full spec also covers template layout, frontmatter, graph terminology, optimizer gating, etc. **This batch deep-audits the change-owned workflow requirements:**

| #   | Requirement                                         | Normative gist                                                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| K1  | In-place approval gates in workflow templates       | Stay-in `ready`/`done`; no `change transition` into pending; entry skill router-only |
| K2  | Implementation tracking in verify/implement         | Verify drains open files; implement zero-open before `/specd-verify`                 |
| K3  | Archive skill skips only pre hooks                  | `--skip-hooks pre`; no post `run-hooks`                                              |
| K4  | Design skill review scope without review file lists | MAY key `review: required: yes`; MUST NOT say files listed under text `review:`      |

Other skills requirements (source location, metadata, frontmatter, graph impact wording) are **spot-checked as pre-existing**; not re-audited line-by-line unless they contradict this change.

### core:approve-spec (8 requirements)

| #   | Requirement                             | Normative gist                                                                               |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| P1  | Gate guard                              | Disabled → `ApprovalGateDisabledError` before repo I/O; then load, actor, schema, name match |
| P2  | Change lookup                           | Missing → `ChangeNotFoundError`                                                              |
| P3  | Artifact hash computation               | Skip missing/skipped/null; cleanup then hash; keys `type:key`                                |
| P4  | Approval recording and state transition | `recordSpecApproval`; stay in bound `from` (`ready`); drain pending → `spec-approved`        |
| P5  | Persistence and return                  | `mutate`; return updated `Change`                                                            |
| P6  | Input contract                          | `{ name, reason }` only; no gate flags                                                       |
| P7  | Approval gate baked at construction     | `approvals: ApprovalGates` from `config.approvals`                                           |
| P8  | Config-based factory                    | `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`                            |

### core:approve-signoff (8 requirements)

Mirror of approve-spec for `done` / `pending-signoff` / `signed-off` / `recordSignoff` / `resolveApproveSignoffDeps`.

### core:config (many requirements; this change owns Approvals)

| #           | Requirement | Normative gist for this change                                                                                                                                                                        |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-Approvals | Approvals   | `approvals.spec` / `signoff` default false; in-place checks; stay in `ready`/`done`; new work MUST NOT enter pending via `change transition`; redesign `ready → designing` MUST NOT require spec gate |

Other config requirements (location, workspaces, storage, plugins, …) are **out of this change’s delta** except Spec Dependencies now include `core:transition-checks`.

---

## Implementation Status

### cli:change-status — implemented

- `kernel.changes.status.execute({ name })` only (default refresh). Graph: no `RefreshImplementationTracking` on this command path. Tests assert refresh use case is not called (`change-status.spec.ts`).
- Text lifecycle uses `lifecycle.availableTransitions` (~264–266), not a local `VALID_TRANSITIONS` union.
- **S7:** `review.required === true` → header with required/route/reason (~248–254). No loop over `affectedArtifacts`. Overlap block (~326–337) only for `spec-overlap-conflict` + non-empty `overlapDetail`. Details section still prints filenames (~341–357). JSON `review` includes `overlapDetail` and `affectedArtifacts` (~446–458). Help after-text lists `overlapDetail` alongside `affectedArtifacts` (~116–125).
- Blockers: label form `! ${code} — ${label}: ${message}` (~238–243).
- Specs-and-dependencies after DAG, before blockers; no standalone `specs:` list.

### cli:change-transition — implemented

- **T2:** `resolveNextTarget` (`transition.ts` ~159–188): drafting→designing→ready→implementing; spec-approved→implementing; implementing→verifying→done→archivable; signed-off→archivable; pending/archivable/archiving → `cliError` (exit 1).
- Then `kernel.changes.transition.execute({ name, to, skipHookPhases }, onProgress)` — no `approvalsSpec`/`approvalsSignoff`.
- **T3:** First and repair status calls use `refreshImplementationTracking: false`. Tests assert refresh use case not called.
- **T5:** `VALID_HOOK_PHASES` + `parseCommaSeparatedValues`; empty set when flag omitted. Verify now allows `skipHookPhases` (empty) — previous “exactly `{ name, to }`” verify drift is **resolved**.
- **T6–T8/T13:** `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`. Extra event types (`requires-check`, `transitioned`, `task-completion-failed`) tagged `change-transition`. Tests assert no `Executing:` and no `hook-progress`.
- **T9/T11/T10:** Text success on stdout; repair guide on stderr; `HookFailedError` → `handleError` exit 2.

### cli:change-approve — implemented

- Commander `requiredOption('--reason')`; `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape.
- Help: “change in **ready**” / “change in **done**” with drain language.
- Success copy and JSON object match A6 (not a check stream).

### cli:change-archive — implemented

- Registered on `changes` with `change` alias (`cli:src/index.ts` via graph dependents).
- Archive selectors `pre`/`post`/`all` distinct from transition’s `source.*`/`target.*`.
- Presenter `streamName: 'change-archive'`; JSON terminal `complete` with `archivePath` + `invalidatedChanges`.
- Post-hook failures: `cliError(..., 2)` before success print.
- Extra flag `--allow-out-of-scope` exists in code but is not in this spec’s command-signature list (D2).

### skills:skill-templates-source — implemented (focus)

- `packages/skills/test/template-workflow.spec.ts`: stay-in-`done`/`ready`; no pending parking in verify/design/archive/entry; shared forbids agent `changes approve`; new-skill table drain-only pending rows; archive `--skip-hooks pre` not `all`; design `not.toMatch(/listed under \`review:\`/)`.
- Templates inspected via those tests + `specd-archive/SKILL.md.tpl` (`--skip-hooks pre` on archive invocations).

### core:approve-spec / core:approve-signoff — implemented

- Gate disabled first; `get` not called (`approve-spec.spec.ts`).
- Bound `from` via `boundFromStates('approval.spec'|'approval.signoff')`; stay in that state; drain pending with `transition`.
- Hashes inside `mutate` on fresh change (satisfies “hash then record” and “record on mutate instance”).
- Composition: `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`; kernel uses deps form (`composition/kernel.ts`).

### core:config Approvals — implemented as documentation + engine consumers

- Merged spec-preview Approvals section matches the change delta (in-place checks, no pending hops).
- Behaviour is enforced by lifecycle/transition checks and approve use cases, not by the YAML parser itself. Config loader still parses `approvals.spec` / `approvals.signoff` booleans consumed at kernel construction.

---

## Discrepancies

Neither side assumed correct. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `default:_global/testing` test-path mirroring vs CLI tests

**Spec (`default:_global/testing`):** Tests live in `test/` **mirroring `src/`**. A source `src/domain/entities/change.ts` maps to `test/domain/entities/change.spec.ts`. File names match the source file (`change.ts` → `change.spec.ts`). Behaviour tests use `"given <state>, when <action>, then <outcome>"`.

**Code / tests:**

| Source                                             | Expected mirror                                          | Actual                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/commands/change/status.ts`                    | `test/commands/change/status.spec.ts`                    | `test/commands/change-status.spec.ts` **and** `test/commands/change/change-status.spec.ts`         |
| `src/commands/change/transition.ts`                | `test/commands/change/transition.spec.ts`                | `test/commands/change-transition.spec.ts` **and** `test/commands/change/change-transition.spec.ts` |
| `src/commands/change/approve.ts`                   | `test/commands/change/approve.spec.ts`                   | `test/commands/change-approve.spec.ts` **and** `test/commands/change/change-approve.spec.ts`       |
| `src/commands/change/archive.ts`                   | `test/commands/change/archive.spec.ts`                   | `test/commands/change-archive.spec.ts` only (flat)                                                 |
| `src/commands/change/_check-progress-presenter.ts` | `test/commands/change/_check-progress-presenter.spec.ts` | No dedicated file; coverage via command specs                                                      |

- **Spec too strict / historical CLI layout:** The CLI package has long used `test/commands/change-<verb>.spec.ts` next to other top-level command tests. Nested `test/commands/change/` was added for this change’s extra scenarios without relocating the originals.
- **Implementation / process gap:** Duplicate suites for status/transition/approve can drift (same review-header scenarios exist in `change.spec.ts`, `change-status.spec.ts`, and `change/change-status.spec.ts`). Presenter has no file-named unit test.
- **Fix either:** Relax global testing spec for CLI command grouping, **or** consolidate to one mirrored tree (`test/commands/change/<file>.spec.ts`) and delete the duplicate flat files.

This is a **global-spec vs change delivery** finding, not a missing lifecycle behaviour.

### D2 — Low — `cli:change-archive` signature omits `--allow-out-of-scope`

**Spec:** Command signature lists `--skip-hooks`, `--allow-overlap`, `--format` (and alias).  
**Code:** Also registers `--allow-out-of-scope` and forwards `allowOutOfScope` to `ArchiveChange`. Archive skill templates mention `--allow-out-of-scope`.

- **Spec incomplete:** Flag is a real adapter contract owned elsewhere (`core:archive-change` / skills) but not listed on `cli:change-archive` signature.
- **Implementation bug:** Unlikely; tests and skills depend on the flag.
- **Fix either:** Add the flag to the CLI signature requirement, or treat it as owned solely by archive-change and reference it.

### D3 — Low — `default:_global/architecture` vs CLI `--next` table

**Architecture:** Adapter packages translate to use cases; they must not contain domain lifecycle algorithms.  
**cli:change-transition (this change):** The `--next` table is **adapter routing** to a `to` state; it MUST NOT replace `GetStatus.nextAction` or hop predicates. Paragraph is duplicated twice in the merged spec.md (copy-paste).  
**Code:** `resolveNextTarget` switch in `transition.ts` (lifecycle graph in the adapter). `GetStatus.nextAction.command` is a skill command, so it cannot fully replace this table.

- **Spec/architecture tension:** The change documents an exception; architecture was not updated to mention presentation routing tables.
- **Implementation bug:** Not observed; execute still runs hop predicates.
- **Fix either:** Add one sentence to architecture, or move the table behind a core helper that returns a `to` (would still be a mapping). Deduplicate the repeated paragraph in `cli:change-transition` spec.md.

### D4 — Low — `cli:change-transition` Purpose vs Requirements

**Purpose:** “transparently routing through approval gates when enabled”.  
**Requirements T4:** CLI MUST NOT rewrite `implementing`/`archivable` to pending parking states; failed gates stay in `ready`/`done`.

- **Spec drift (purpose leftover):** Agents reading only Purpose could reintroduce pending hops.
- **Implementation:** Matches Requirements, not Purpose.
- **Fix:** Rewrite Purpose to stay-in-state + human approve.

### D5 — Low — ApproveSpec test describe names still pending-centric

**Spec verify:** Wrong-state scenario is “Change is not in ready or pending-spec-approval” / drafting throws.  
**Code tests:** `describe('given the change is not in pending-spec-approval state')` still uses the old title; the fixture is `makeChange` (drafting) and assertion is correct. Happy-path `ready` is covered separately (`records consent and stays in ready`).

- **Test-name drift**, not a behaviour bug.
- **Fix:** Rename describe to match verify (“not in ready or pending-spec-approval”).

### Previously reported, now resolved (not counted as open)

- Verify “Transition execute called with `{ name, to }` only” — current verify **AND** allows `skipHookPhases` (empty when omitted). Matches code.
- Text status omitting the entire `review:` header — current spec **requires** the header without file lists; code and tests match.

---

## Test Coverage

| Area                                                  | Covered?                                                                                                                                      | Where                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7 review header, no absolute paths, files in details | Yes                                                                                                                                           | `test/commands/change/change-status.spec.ts` (`given artifact-review-required…`, drift variant); also `change-status.spec.ts`, `change.spec.ts`    |
| S7 JSON `overlapDetail`                               | Yes                                                                                                                                           | `change-status.spec.ts`                                                                                                                            |
| S7 help lists `overlapDetail`                         | Implementation yes; **no test** that `--help` contains the field                                                                              | —                                                                                                                                                  |
| S6 availableTransitions passthrough                   | Yes                                                                                                                                           | JSON status tests                                                                                                                                  |
| S12 no direct refresh                                 | Yes                                                                                                                                           | `change-status.spec.ts`                                                                                                                            |
| T2 `--next` map + refusals + signed-off               | Yes                                                                                                                                           | `change-transition.spec.ts` (`resolves ready --next…`, `signed-off`, `--next failures`)                                                            |
| T3 refresh false                                      | Yes                                                                                                                                           | same file                                                                                                                                          |
| T4 no pending rewrite on `--next` from ready          | Yes (CLI requests `implementing`; stay-in-ready is a **core** execute outcome; CLI test asserts `to: 'implementing'` without pending routing) | `change-transition.spec.ts`                                                                                                                        |
| T5 skipHookPhases                                     | Yes                                                                                                                                           | `change-transition.spec.ts`                                                                                                                        |
| T6/T13 presenter, no Executing, stream name           | Yes                                                                                                                                           | `change-transition.spec.ts`, `change-archive.spec.ts`; nested `change/change-transition.spec.ts` (repair guide)                                    |
| T10 no repair guide on hook fail                      | Yes (asserted in prior/current transition tests; handleError maps `HookFailedError` to exit 2)                                                | CLI transition tests + `handle-error.ts`                                                                                                           |
| A1–A7                                                 | Yes                                                                                                                                           | `change-approve.spec.ts` + `change/change-approve.spec.ts` (call shape `{ name, reason }`)                                                         |
| Stay-in-ready/done **domain**                         | Yes                                                                                                                                           | `core/test/application/use-cases/approve-spec.spec.ts`, `approve-signoff.spec.ts`                                                                  |
| R4 `--skip-hooks pre`                                 | Yes                                                                                                                                           | `change-archive.spec.ts` (`passes skipHookPhases with pre only`)                                                                                   |
| R5/R9 presenter + JSON stream                         | Yes                                                                                                                                           | `change-archive.spec.ts`                                                                                                                           |
| K1–K4 templates                                       | Yes                                                                                                                                           | `packages/skills/test/template-workflow.spec.ts`                                                                                                   |
| P8 factory deps                                       | Yes                                                                                                                                           | `core/test/composition/use-cases/approve-spec.spec.ts`                                                                                             |
| C-Approvals YAML semantics                            | Indirect                                                                                                                                      | Engine/transition tests (`lifecycle-engine.spec.ts`, `transition-change.spec.ts`); **no dedicated config-loader scenario** quoting “stay in ready” |

CLI command tests mock the kernel (no real fs) — consistent with `default:_global/testing` unit-test rule.

---

## Missing Tests

1. **`--help` JSON schema includes `overlapDetail`** — spec MUST list it; implementation does; no assertion on help text.
2. **Dedicated `_check-progress-presenter.spec.ts`** — gerund/`Executing:`/stream-name covered only via command integration-style CLI tests.
3. **Consolidate duplicate CLI suites** — not a missing scenario, but missing a single source of truth for status/transition/approve tests (see D1).
4. **Config loader test** that `approvals.spec: true` does not imply a pending hop in parsed config (semantics live in engine; optional if considered owned by `core:transition-checks`).
5. **ApproveSpec persist-from-ready mutate spy** — stay-in-ready checks `result.state`; mutate spy is only on the pending drain path. Verify “Persistence and return value” GIVEN successful approval **from ready**.

---

## Spec Dependency Chain

| Spec                            | Declared deps (preview)                                                                              | Consistency with this change                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `cli:change-status`             | entrypoint, core:change, get-status, sdk:build-implementation-review, transition-checks              | Status is a projection adapter; review header aligns with design skill (K4).          |
| `cli:change-transition`         | entrypoint, change, transition-change, hook-execution-model, get-status, transition-checks           | `--next` exception vs architecture (D3). Purpose vs T4 (D4).                          |
| `cli:change-approve`            | entrypoint, change, transition-checks                                                                | Aligns with core approve stay-in-state.                                               |
| `cli:change-archive`            | entrypoint, change, archive-change, hook-execution-model, command-resource-naming, transition-checks | Aligns with skills K3 (`--skip-hooks pre`). Signature vs `--allow-out-of-scope` (D2). |
| `skills:skill-templates-source` | skill, cli:spec-optimizations, workflow-automation, transition-checks                                | Stay-in-state and review-header guidance match CLI S7.                                |
| `core:approve-spec`             | change, schema-format, composition, kernel, composition-resolver, transition-checks                  | `boundFromStates` from engine bindings.                                               |
| `core:approve-signoff`          | same pattern                                                                                         | Symmetric.                                                                            |
| `core:config`                   | vcs-adapter-port, architecture, **transition-checks** (this change)                                  | Approvals section now describes in-place checks; duplicates engine prose by design.   |

No contradiction found between CLI S7 (print review header, not files) and skills K4 (design may key `review: required: yes`, files under details). Earlier audits that treated “no `review:` header” as the contract are **stale** relative to current spec-preview.

---

## Summary counts

| Spec                                                      |   Reqs audited | Implemented | Partial | Missing | Open discrepancies |
| --------------------------------------------------------- | -------------: | ----------: | ------: | ------: | -----------------: |
| cli:change-status                                         |             15 |          15 |       0 |       0 |  0 (layout via D1) |
| cli:change-transition                                     |             14 |          14 |       0 |       0 |             D3, D4 |
| cli:change-approve                                        |              7 |           7 |       0 |       0 |                  0 |
| cli:change-archive                                        |             10 |          10 |       0 |       0 |                 D2 |
| skills:skill-templates-source (focus 4 + spot-check rest) |        4 focus |           4 |       0 |       0 |                  0 |
| core:approve-spec                                         |              8 |           8 |       0 |       0 |    D5 (test names) |
| core:approve-signoff                                      |              8 |           8 |       0 |       0 |                  0 |
| core:config (Approvals)                                   | 1 change-owned |           1 |       0 |       0 |                  0 |
| default:\_global/testing (cross-cut)                      |              1 |           — |       — |       — |                 D1 |

**Open discrepancies:** 5 (D1 medium; D2–D5 low).  
**Focus behaviours:** all **compliant** except testing-path layout (D1), which does not change user-visible CLI/skills contracts.

**Recommendation for parent report:** Treat lifecycle UX (review header, `--next`, presenter, stay-in-state, archive pre-hooks) as spec-compliant. Call out D1 as the only medium process/layout issue in this batch; optionally fix Purpose (D4) and duplicate adapter-routing paragraph before archive.
