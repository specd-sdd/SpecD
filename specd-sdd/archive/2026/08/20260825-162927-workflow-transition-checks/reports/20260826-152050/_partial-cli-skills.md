# Partial audit: CLI + skills (workflow-transition-checks)

> **Verdicts:** CLI focus pass stands. D1–D4 are spec/verify leftovers. D5 is CLI JSON vs NDJSON, not the engine bag. Compiled report: `specs-compliance-change-workflow-transition-checks-20260826-152050.md`.

**Mode:** change `workflow-transition-checks` (spec-preview)
**Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-archive`, `cli:change-approve`, `skills:skill-templates-source` (no-op)
**Focus:** text review omit, blocker labels, repair-guide labels, progress bus (`no Executing:`), archive progress, approve from ready/done
**Read-only.** Graph: current (`stale: false`). CLI via `node packages/cli/dist/index.js`.
**Sources:** `changes spec-preview`, `packages/cli/src/commands/change/{status,transition,archive,approve,_check-progress-presenter}.ts`, matching CLI tests.

---

## skills:skill-templates-source

### Requirements summary

Delta is explicit **no-op** (`spec.md.delta.yaml` and `verify.md.delta.yaml`): skill template entry states are out of this change. Preview shows original template-source spec unchanged.

### Implementation status

No-op as expected. No skill-template implementation obligation in this change. Installed templates / `packages/skills/templates/` were not audited as in-scope work.

### Discrepancies

None for this change. The no-op matches the assigned expectation.

### Test coverage / missing tests

N/A (deferred with templates). No missing tests attributable to this change.

### Spec dependency chain

Preview dependencies: `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`. No contradiction with the no-op delta.

### Summary (this spec)

| Metric                |              Count |
| --------------------- | -----------------: |
| Requirements reviewed | 1 (no-op contract) |
| Implemented           |                  1 |
| Partial               |                  0 |
| Missing               |                  0 |
| Discrepancies         |                  0 |
| Missing tests         |                  0 |

---

## cli:change-status

### Requirements summary (focus + related)

| Requirement                                      | Intent                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lifecycle projections come from GetStatus checks | Render `availableTransitions` / `nextAction` / blockers from GetStatus; do not union protocol `VALID_TRANSITIONS`.                                                 |
| Text status omits duplicated review file lists   | Text MUST NOT print `review:` header (`required`/`route`/`reason`) or `review.affectedArtifacts` paths; overlap peers still print; JSON/TOON keep full `review`.   |
| Text blockers include check labels               | `! <CODE> — <label>: <message>` when gerund `label` present; review-only blockers without label stay `! <CODE>: <message>`; JSON/TOON serialize `label`/`checkId`. |
| Delegates to GetStatus                           | No local lifecycle recompute.                                                                                                                                      |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/status.ts`.

- Text blockers: `b.label !== undefined` → `! ${code} — ${label}: ${message}`, else `! ${code}: ${message}` (lines 230–237).
- JSON blockers map `label` and `checkId` when present (376–381).
- Text review: no `review:` header. Overlap-only section when `reason === 'spec-overlap-conflict'` and `overlapDetail.length > 0` (307–318). Artifact files remain under `artifacts (details):` with `pending-review` / `[drift]`.
- JSON still serializes full `review` including `affectedArtifacts` (427–439).
- Lifecycle lines use `lifecycle.availableTransitions` and `nextAction` from GetStatus (242–252); no second protocol-graph filter.

### Discrepancies

None against the **added** status requirements. Implementation matches spec-preview.

**Note (examples, not a functional miss):** The spec **Examples** block still shows a standalone `specs:` line in sample text output, which the “Basic info section” requirement forbids. Pre-existing example drift; not part of this change’s deltas.

### Test coverage

Covered:

- Artifact-review-required: no `review:`, no absolute path reprint, details still show `proposal.md` / `pending-review` (`packages/cli/test/commands/change/change-status.spec.ts`).
- Artifact-drift: `[drift]` in details, no `review:` header / path reprint.
- Overlap peers without review header (`packages/cli/test/commands/change-status.spec.ts` “Overlap conflict display”).
- JSON still includes `review` / `overlapDetail`.
- Blocker gerund: `! DEPS_INCONSISTENT — Checking spec dependencies:` plus JSON `blockers[].label`/`checkId`.
- `availableTransitions` rendered from GetStatus without protocol union; `nextAction` `/specd-verify` not replaced with `/specd-implement`.

### Missing tests

- No dedicated case that a **review-only** blocker **without** `label` stays `! CODE: message` (implementation branch exists; unlabeled blockers appear in other tests incidentally).
- JSON assertion that `review.affectedArtifacts` is present when text omitted it is implied by JSON overlap tests, not the artifact-review-required text test in the same file (that test is text-only). Low risk: JSON path is unconditional.

### Spec dependency chain

`cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`. New requirements are projections of GetStatus check fields; no contradiction with those deps in the CLI layer.

### Summary (this spec)

| Metric             |                                  Count |
| ------------------ | -------------------------------------: |
| Focus requirements |             3 (+ GetStatus delegation) |
| Implemented        |                                      4 |
| Partial            |                                      0 |
| Missing            |                                      0 |
| Discrepancies      | 0 (1 stale Examples note, not counted) |
| Missing tests      |                                2 (low) |

---

## cli:change-transition

### Requirements summary (focus + related)

| Requirement                                      | Intent                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Approval-gate routing (modified)                 | Do not pass gate flags; do **not** rewrite `implementing`→`pending-spec-approval` or `archivable`→`pending-signoff`. |
| Invalid transition / Repair Guide (modified)     | Text: `! <CODE> — <label>: <message>` when label present; else `! <CODE>: <message>`; `nextAction` from GetStatus.   |
| Incomplete tasks                                 | `workflow.taskCompletion` failure; status already omits `verifying`.                                                 |
| Check progress rendering (added)                 | Text: `<label> (<id>)` then `✓`/`✗`; **MUST NOT** print `Executing:`; hooks on same bus (`Running pre/post hooks`).  |
| Progress output (pre-existing, not deleted)      | JSON hook events `stream: "hook-progress"`; transition events `stream: "change-transition"`.                         |
| Shared hook progress presentation (pre-existing) | Same helper as `change run-hooks`.                                                                                   |
| Constraints                                      | Text progress on **stderr**; confirmation on stdout.                                                                 |

### Implementation status

**Mostly implemented** against the **new** check-bus and repair-guide requirements.

- `writeTextRepairGuide` (`transition.ts` 88–102) writes error, labeled blockers, and repair guide to **stderr**.
- `to:` is the user/requested target; execute payload is `{ name, to, skipHookPhases }` only.
- `createCheckProgressPresenter` (`_check-progress-presenter.ts`): `check-start` → `${label} (${id})`; done → `✓ ${label}` / `✗ ${label}: ${reason}`; no `Executing:` prefix. Stream name `change-transition`. Text → stderr.
- Transition no longer calls `createHookProgressPresenter` (`run-hooks` still does).

### Discrepancies

**D1 — Spec-internal + code vs leftover requirement: hook stream name**  
`Requirement: Progress output` still mandates JSON hook lifecycle events as `stream: "hook-progress"`. Added `Requirement: Check progress rendering` puts hooks on the generic check bus. Implementation and tests emit hook `check-*` events as `stream: "change-transition"` (`change-transition.spec.ts` JSON success).

- Spec drift: old Progress output not updated when the bus was added.
- Implementation follows the new bus (likely intended).
- Both: leftover dual contract.

**D2 — Spec-internal + code vs leftover requirement: shared run-hooks presenter**  
`Requirement: Shared hook progress presentation` still requires a shared helper so transition and `run-hooks` do not drift (running labels, tail, liveness, failed-hook full output). Transition uses `_check-progress-presenter.ts`; `run-hooks` uses `_hook-progress-presenter.ts`. Comment on the latter still says it is “used by `change run-hooks` and `change transition`” (stale). Text labels differ (`Running pre hooks (hook.pre)` vs `[running] …`).

- Spec drift: old requirement not removed/rewritten.
- Implementation: intentional split for the new bus; violates the **unmodified** shared-presenter requirement.

**D3 — verify.md vs spec.md: approval-gate success scenarios**  
Spec.md (modified): CLI must not rewrite to pending; failed `approval.spec`/`approval.signoff` stay in `ready`/`done`.  
verify.md **unmodified** scenarios still say: `approvals.spec: true` + `transition … implementing` → `pending-spec-approval`, and signoff → `pending-signoff`.  
CLI tests assert **no** rewrite (`does not rewrite ready → implementing into pending-spec-approval`).

- Spec/verify drift. Implementation matches spec.md, not those verify scenarios.

**D4 — verify.md vs code: Repair Guide stream**  
Scenario “Transition failure renders Repair Guide” still says the `repair guide:` section is on **stdout**. Implementation and tests write it to **stderr**. Spec requirement body is stream-agnostic; Constraints say text progress/diagnostics on stderr.

- Likely verify drift; implementation consistent with Constraints + tests.

### Test coverage

Covered:

- Gerund predicate progress, no `Executing:` (`impl.linksInScope`).
- Hook check-bus labels (`Running pre hooks (hook.pre)`), command/output/heartbeat, fail path, no `Executing:`.
- Repair guide `command: /specd-verify` not `/specd-implement`.
- Repair guide label: `! READ_ONLY_WORKSPACE — Checking workspace ownership: …`.
- Unlabeled blocker still `! MISSING_ARTIFACT: …`.
- No silent pending rewrite; execute `to: 'implementing'`.
- `--skip-hooks all` still hits transition (tasks incomplete still fail).

### Missing tests

- Structured failure JSON: `blockers[].label` on the terminal `complete` record (text path is covered).
- `Running post hooks (hook.post)` specifically (tests use `hook.pre`).
- No test that JSON hook events are **not** `stream: "hook-progress"` vs the old requirement (tests encode the new stream only).

### Spec dependency chain

`cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`. Tension is **inside** `cli:change-transition` (old hook-progress vs new check bus), not vs core transition-checks gerund labels.

### Summary (this spec)

| Metric                              |                                        Count |
| ----------------------------------- | -------------------------------------------: |
| Focus requirements                  |                                            4 |
| Implemented (new contract)          |                                            4 |
| Partial vs unmodified leftover reqs | 2 (Progress output stream; shared presenter) |
| Missing                             |                                            0 |
| Discrepancies                       |                                    4 (D1–D4) |
| Missing tests                       |                               3 (low–medium) |

---

## cli:change-archive

### Requirements summary (focus)

| Requirement                           | Intent                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Check progress rendering (added)      | Same text bus as transition: gerund `<label> (<id>)`, `✓`/`✗`, **no `Executing:`**, hooks `Running pre/post hooks`. |
| JSON output on success (pre-existing) | stdout is **valid JSON** `{ result: "ok", name, archivePath }`.                                                     |

### Implementation status

**Text progress: implemented.** `archive.ts` `makeArchiveProgressRenderer` uses `createCheckProgressPresenter` with `streamName: 'change-archive'`, text on stderr. Tests: `Checking workspace ownership (workspace.readOnly)`, `✓ Checking workspace ownership`, `Running pre hooks (hook.pre)`, streamed line, no `Executing:`.

**JSON: partial / conflicting.** Non-text presenter writes NDJSON `{ stream: "change-archive", event }` to **stdout**. Success then writes a **bare** `{ result, name, archivePath, invalidatedChanges }` (not a `complete` stream record). Help text documents this mix. If `ArchiveChange` emits any check event, stdout is **not** a single JSON document.

### Discrepancies

**D5 — Spec-internal + implementation: JSON document vs progress stream**  
Added check-progress requirement is text-shaped; implementation still emits structured check records on stdout in json/toon. Unmodified `JSON output on success` requires stdout to be valid JSON.

- Spec incomplete: JSON contract not updated for the bus.
- Implementation: NDJSON + trailing object when checks fire; tests only cover text progress and JSON **without** injected check events (`reports invalidated changes in JSON output`).

### Test coverage

- Text gerund + hook-on-same-bus + no `Executing:`: yes (`change-archive.spec.ts`).
- JSON+progress coexistence: **no**.

### Missing tests

- json/toon archive with `check-start`/`check-done` then terminal success (documents whether stdout is NDJSON vs one JSON value).
- Fail outcome `✗ <label>: <reason>` on archive (pass path only).

### Spec dependency chain

Now includes `core:transition-checks` (progress bus). Aligns with CLI presenter. Conflicts with this spec’s own JSON success requirement, not with the dependency.

### Summary (this spec)

| Metric             |                       Count |
| ------------------ | --------------------------: |
| Focus requirements | 1 (+ JSON success leftover) |
| Implemented        |                1 (text bus) |
| Partial            |       1 (JSON stdout shape) |
| Missing            |                           0 |
| Discrepancies      |                      1 (D5) |
| Missing tests      |                           2 |

---

## cli:change-approve

### Requirements summary (focus)

| Requirement                          | Intent                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Approve spec behaviour (modified)    | Valid in `ready` (gate on) or drain `pending-spec-approval`; stay in `ready`; MUST NOT print transition to pending. |
| Approve signoff behaviour (modified) | Valid in `done` or drain `pending-signoff`; stay in `done`.                                                         |
| Delegates gate state to kernel       | `{ name, reason }` only via `kernel.changes.approveSpec` / `approveSignoff`.                                        |

### Implementation status

**Implemented.** `approve.ts`:

- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff.execute({ name, reason })`.
- Text: `approved spec for ${name}` / `approved signoff for ${name}` — no pending hop printed.
- Descriptions mention ready/done plus drain pending states.

CLI does not itself assert remaining state (use case return is unused for text). Behaviour is “print approval, do not print pending,” which matches the CLI-facing MUST NOT.

### Discrepancies

None against the modified approve requirements. JSON verify scenario still GIVENs `pending-spec-approval` for JSON success; that remains valid as **drain**, not a contradiction.

### Test coverage

Covered:

- From ready: `approved spec for my-change`, not `pending-spec-approval` (`change-approve.spec.ts`, `change/change-approve.spec.ts`).
- From done: `approved signoff for my-change`, not `pending-signoff`.
- Drain still invokes approve from pending states.
- Execute call shape `{ name, reason }` only.

### Missing tests

- “Wrong state for spec approval” (`designing` → exit 1) still in verify; covered in `change-approve.spec.ts` if gate/state errors are mocked — not re-audited as a gap for this focus.
- No test that stdout would print a state line if the use case returned `pending-*` (CLI never prints `change.state`).

### Spec dependency chain

`cli:entrypoint`, `core:change`, `core:transition-checks`. Deltas correctly talk about recorded gates, not pending hops.

### Summary (this spec)

| Metric             |                 Count |
| ------------------ | --------------------: |
| Focus requirements | 2 (+ kernel delegate) |
| Implemented        |                     3 |
| Partial            |                     0 |
| Missing            |                     0 |
| Discrepancies      |                     0 |
| Missing tests      |             0 (focus) |

---

## Cross-cutting notes

- Presenter `_check-progress-presenter.ts` is the single text bus for transition **and** archive; no `Executing:` in CLI `src/` (only asserted absent in tests).
- `run-hooks` remains on the old hook-progress presenter; only a problem if `cli:change-transition` “shared presentation” is still binding (D2).
- Global conventions: CLI still serializes GetStatus; no local protocol filter. Approve/transition do not pass gate flags.

---

## Batch totals (this partial)

| Spec                          | Discrepancies | Missing tests | Status                             |
| ----------------------------- | ------------: | ------------: | ---------------------------------- |
| skills:skill-templates-source |             0 |             0 | no-op pass                         |
| cli:change-status             |             0 |         2 low | pass (focus)                       |
| cli:change-transition         |             4 |             3 | pass new bus; leftover spec/verify |
| cli:change-archive            |             1 |             2 | pass text; JSON contract tension   |
| cli:change-approve            |             0 |             0 | pass (ready/done)                  |
| **Total**                     |         **5** |         **7** |                                    |

### Discrepancy IDs

| ID  | Spec                  | Kind                                                               | Severity                                  |
| --- | --------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| D1  | cli:change-transition | leftover `hook-progress` stream vs check bus / `change-transition` | medium (spec drift; code matches new req) |
| D2  | cli:change-transition | leftover shared run-hooks presenter vs split presenters            | medium (spec drift + code vs old req)     |
| D3  | cli:change-transition | verify still expects pending hops; spec.md/tests do not            | medium (verify drift)                     |
| D4  | cli:change-transition | verify says repair guide on stdout; code/tests use stderr          | low (verify drift)                        |
| D5  | cli:change-archive    | JSON “valid JSON stdout” vs NDJSON check stream                    | medium (spec incomplete + impl risk)      |

### Focus checklist

| Focus                        | Result                                |
| ---------------------------- | ------------------------------------- |
| Text review omit             | Compliant (status)                    |
| Blocker labels               | Compliant (status)                    |
| Repair guide labels          | Compliant (transition); stream in D4  |
| Progress bus no `Executing:` | Compliant (transition + archive text) |
| Archive progress             | Compliant (text); JSON D5             |
| Approve from ready/done      | Compliant                             |
| skills no-op                 | Compliant                             |
