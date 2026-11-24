# Partial audit: CLI + skills spot-check + project-wide globals

**Batch:** cli-skills-global  
**Mode:** change (`workflow-transition-checks`)  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** `stale: false`, indexed `2026-08-27T14:01:20.650Z`, CLI workspace `VCS_UNMODIFIED`  
**CLI surface (graph):** `cli:src/commands/change/transition.ts`, `archive.ts`, `approve.ts`, `status.ts`, `_check-progress-presenter.ts`  
**Tests in scope:** `packages/cli/test/commands/change*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

---

## Requirements Summary

Assigned **change** specs (via `changes spec-preview`): `cli:change-transition`, `cli:change-approve`, `cli:change-archive`.  
`cli:change-status` and `skills:skill-templates-source` are owned by the recorte batch; this file only notes contradictions and a template spot-check.

### cli:change-transition (14 requirements)

| #   | Requirement                       | Normative gist                                                                                                                                             |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature                 | `transition <name> <step>` or `--next`; `--skip-hooks` tokens `source.pre`, `source.post`, `target.pre`, `target.post`, `all`; `--format text\|json\|toon` |
| T2  | Next-transition resolution        | Fixed forward map; `--next` forbidden on pending gates / `archivable`; `signed-off` → `archivable`                                                         |
| T3  | Delegates refresh policy          | No direct refresh/detector; pre and repair `GetStatus` use `refreshImplementationTracking: false`                                                          |
| T4  | Approval-gate routing             | No gate flags on execute; do not rewrite `implementing`/`archivable` to pending parking states                                                             |
| T5  | Hook execution                    | Map `--skip-hooks` → `skipHookPhases` on `TransitionChangeInput`                                                                                           |
| T6  | Progress output                   | Shared check bus; JSON/TOON NDJSON `stream: "change-transition"`; never `hook-progress`                                                                    |
| T7  | Transition hook observability     | Surface hook progress even if the transition later fails                                                                                                   |
| T8  | Shared hook progress presentation | Transition uses check-progress presenter; distinct public stream from `run-hooks`                                                                          |
| T9  | Output on success                 | Text confirmation on stdout; JSON/TOON terminal `complete` with `result/name/from/to`                                                                      |
| T10 | Post-hook failure warning         | Hook fail → exit 2, `error:` on stderr; no separate post-hook warning; no Repair Guide                                                                     |
| T11 | Invalid transition error          | Exit 1; Repair Guide **on stderr**; `! CODE — label: message` when label present; JSON failure `complete` record with `blockers`/`nextAction`              |
| T12 | Incomplete tasks error            | Exit 1; name blocking artifact; skip-hooks must not bypass predicates                                                                                      |
| T13 | Check progress rendering          | Gerund `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix; hooks on same bus                                                                            |
| T14 | Unsatisfied requires error        | Exit 1; repair guide from GetStatus, CLI does not invent routes                                                                                            |

### cli:change-approve (7 requirements)

| #   | Requirement               | Normative gist                                                                                |
| --- | ------------------------- | --------------------------------------------------------------------------------------------- |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` required; format optional                             |
| A2  | Delegates gate state      | `kernel.changes.approveSpec` / `approveSignoff` with `{ name, reason }` only                  |
| A3  | Artifact hash computation | CLI must not compute or pass hashes                                                           |
| A4  | Approve spec behaviour    | Stay in `ready` on success; help uses bound-`from` language (`ready`)                         |
| A5  | Approve signoff behaviour | Stay in `done` on success; help uses bound-`from` language (`done`)                           |
| A6  | Output on success         | Text `approved <gate> for <name>`; JSON/TOON `{ result, gate, name }` (not a progress stream) |
| A7  | Error cases               | Missing `--reason`, unknown sub-verb, wrong state, missing change → exit 1                    |

### cli:change-archive (10 requirements)

| #   | Requirement                  | Normative gist                                                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| R1  | Command signature            | Canonical `changes archive`; alias `change archive`; `--skip-hooks` `pre`/`post`/`all`  |
| R2  | Prerequisites                | Must be `archivable`; else exit 1 naming current state                                  |
| R3  | Behaviour                    | Delegate merge/move/history to `ArchiveChange`                                          |
| R4  | Hook execution               | Map `--skip-hooks` to archive `skipHookPhases`                                          |
| R5  | Check progress rendering     | Same gerund bus as transition; stream name `change-archive`                             |
| R6  | Post-archive hooks           | Post-hook failures → exit 2                                                             |
| R7  | Output on success            | Text archive path; omit invalidated section when empty                                  |
| R8  | Output on success (extended) | Invalidated list when overlap; JSON includes `invalidatedChanges`                       |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"`; terminal `complete`; no second unwrapped JSON object |
| R10 | Error cases                  | Missing name, not found, not archivable, merge failure → exit 1                         |

### Project-wide specs (scoped to this change’s CLI/skills/core delivery)

- **default:\_global/architecture** — CLI is an adapter: SDK-only, no domain logic in the delivery package; core layers stay inward-only.
- **default:\_global/conventions** — kebab-case, named exports, tests under `test/` mirroring `src/`, no `any`, JSDoc/return types on public APIs.
- **default:\_global/testing** — Vitest, `test/**/*.spec.ts` mirroring `src`, given/when/then naming, no snapshots, unit tests without fs.
- **default:\_global/spec-layout** — change deltas vs `spec.md`/`verify.md` pairing; requirement prose vs WHEN/THEN split.
- **default:\_global/docs** — CLI output/flag contract changes must update living `docs/cli/` (and related guide pages) in the same change.
- **default:\_global/eslint** — kebab-case src, JSDoc including internals in `src/`, layer `no-restricted-imports` (core).

---

## Implementation Status

### cli:change-transition — implemented

- **T1/T5:** `VALID_HOOK_PHASES` + `parseCommaSeparatedValues` → `skipHookPhases` (`transition.ts` ~28–34, 290–320). Graph: `HookPhaseSelector` in `core:src/application/use-cases/transition-change.ts`.
- **T2:** `resolveNextTarget` implements the table including `signed-off` → `archivable` and stderr `--next` refusals for pending/archivable/archiving.
- **T3:** First and repair `status.execute({ name, refreshImplementationTracking: false })`. Tests assert refresh use case is not called.
- **T4:** `transition.execute({ name, to, skipHookPhases }, onProgress)` — no `approvalsSpec`/`approvalsSignoff`. Help/docs: stay in ready/done.
- **T6–T8/T13:** `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`. Check events only; lifecycle extras (`requires-check`, `transitioned`) also tagged `change-transition`. Tests assert no `hook-progress`.
- **T9:** Text `transitioned ${name}: ${from} → ${to}` on stdout; JSON/TOON terminal `complete`.
- **T10:** Uncaught `HookFailedError` falls through to `handleError` → exit 2; tests assert no `repair guide:`.
- **T11:** `writeTextRepairGuide` writes **stderr** only; JSON failure `complete` with `blockers`/`nextAction`. Label form: `! ${code} — ${label}: ${message}` else `! ${code}: ${message}`.
- **T12:** CLI forwards skip-hooks; tests show incomplete-tasks still fail with `--skip-hooks all` (predicate not skipped at CLI).

**Possible code-or-spec (not a hard fail):** Repair Guide example in spec.md uses `error: cannot transition to <step>`. Code prints `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Spec also says “prints an `error:` message”; the boxed example looks illustrative. Tests lock the domain error text.

### cli:change-approve — implemented

- Commander `requiredOption('--reason')`; `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape; no hashes, no gate flags.
- Help: “change in **ready**” / “change in **done**” with drain language for pending states.
- Success copy `approved spec|signoff for <name>`; JSON `{ result, gate, name }` (not a check stream — matches this spec, unlike transition/archive).
- Docs `docs/cli/cli-reference.md` state stay-in-`ready` / stay-in-`done`.

### cli:change-archive — implemented

- Registered on `program.command('changes').alias('change')` (`cli:src/index.ts`) — canonical plural + singular alias.
- Archive selectors `pre`/`post`/`all` distinct from transition’s `source.*`/`target.*`.
- Progress presenter `streamName: 'change-archive'`; JSON terminal `complete` with `archivePath` + `invalidatedChanges`; no extra unwrapped object.
- Post-hook failures: `cliError(..., 2)` before success print.
- Text invalidated section only when `invalidatedChanges.length > 0`.

### Skills templates (spot-check vs recorte)

- `packages/skills/test/template-workflow.spec.ts`: archive template `--skip-hooks pre` (not `all` + separate post `run-hooks`); design template `review: required: yes`, `artifacts (details):`, `affectedArtifacts`, and **not** “listed under \`review:\`”.
- Aligns with `cli:change-status` text review header (status prints `review:` + required/route/reason, files under artifacts details). **No contradiction found** with status blocker/review text in `status.ts` ~235–254.

### Globals vs this change

| Spec                 | Status for this implementation                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| architecture         | CLI depends on `@specd/sdk` only (no `@specd/core` / `@specd/code-graph` in `packages/cli/package.json`). Commands call `kernel.changes.*`. Domain `node:fs` not imported under `packages/core/src/domain` in a spot check.                |
| conventions / eslint | New presenter and command files are kebab-case; named exports; JSDoc on exported + internal helpers in the files read.                                                                                                                     |
| testing              | Vitest `.spec.ts` under `test/`; command tests mock kernel (no real fs). **Layout naming does not strictly mirror `src/`** (see discrepancies).                                                                                            |
| spec-layout          | Change uses deltas; verify scenarios grouped under requirement headings. Merged `cli:change-archive` **base** “Output on success” prose is incomplete (see discrepancies).                                                                 |
| docs                 | `docs/cli/cli-reference.md` and `docs/guide/workflow.md` document `change-transition` / `change-archive` streams, skip-hooks token sets, Repair Guide on stderr, stay-in-state approve copy. Living-page contract **met** for this change. |

---

## Discrepancies

Neither side assumed correct. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `cli:change-transition` verify vs spec.md execute payload

**Spec:** `spec.md` Hook execution: CLI maps `--skip-hooks` to `skipHookPhases`.  
**Verify:** “Transition execute omits approval flags” THEN `TransitionChange.execute` is called with `{ name, to }` **only**.  
**Code:** Always passes `{ name, to, skipHookPhases }` (empty set when flag omitted).

- **Spec/verify drift:** The verify scenario over-constrains the input object; it meant “no approval flags,” not “exactly two keys.”
- **Implementation bug:** Unlikely; omitting `skipHookPhases` would break T5.
- **Fix either:** Relax verify AND-clause to “approval flags absent; `skipHookPhases` may be present,” or stop sending an empty set (weaker, worse).

### D2 — Medium — Merged `cli:change-archive` “Output on success” prose is incomplete

**Spec-preview** of `cli:change-archive` Requirement “Output on success” is truncated/garbled (“prints to stdout: The invalidated changes section is omitted…”; JSON bullet trails off).  
**This change’s delta** correctly rewrites **“JSON output on success”** to the NDJSON `change-archive` complete record; it does **not** repair the older “Output on success” paragraph.  
**Code + verify + docs** describe a complete, consistent contract (path line, optional invalidated block, stream complete).

- **Spec drift (base spec leftover):** Agents reading only the merged “Output on success” requirement could implement a second unwrapped JSON object (the thing R9 forbids).
- **Implementation bug:** Not observed; tests parse `stream: "change-archive"` and NDJSON progress+complete.

### D3 — Medium — `default:_global/architecture` vs CLI `--next` mapping

**Architecture:** Adapter packages contain no business logic; they translate to use cases.  
**cli:change-transition:** CLI MUST implement the drafting→…→archivable table in the command.  
**Code:** `resolveNextTarget` in `transition.ts` (lifecycle graph in the adapter). `GetStatus.nextAction` is a **skill command**, not a lifecycle `to` state, so it cannot fully replace this table.

- **Global spec over-strict for this command** _or_ **change spec should have required a core `resolveNextTransitionTarget` use case.**
- Current code matches the **change** spec. Hexagonal purity would move the table to core/application.

### D4 — Low — `default:_global/testing` + conventions file layout

**Global:** Test for `src/commands/change/transition.ts` lives at `test/commands/change/transition.spec.ts` (same basename).  
**Code:** `test/commands/change-transition.spec.ts` **and** `test/commands/change/change-transition.spec.ts` (split suites). Same pattern for approve/archive/status. Presenter: `src/commands/change/_check-progress-presenter.ts` has **no** matching `test/commands/change/_check-progress-presenter.spec.ts` (unlike `_hook-progress-presenter.spec.ts` under `test/commands/`).

- **Convention drift** (CLI historical naming) vs **missing mirrored presenter unit file**.
- Behaviour is still covered by command tests (not an implementation gap of T13/R5).

### D5 — Low — Archive skip-hooks verify scenarios vs CLI tests

**Verify:** Isolated `--skip-hooks pre` (post still enabled) and `--skip-hooks post` (pre still enabled).  
**CLI tests:** `all`, combined `pre,post`, and default empty set. Parser would accept `pre` or `post` alone; **no CLI test asserts the singleton sets.** Core `ArchiveChange` likely owns actual skip behaviour.

- **Missing CLI test** vs **spec expecting CLI-level proof of forwarding.** Parser is shared; risk is low.

### Not a contradiction (recorte-owned)

- Status text blockers: `  ! CODE — label: message` (`status.ts` ~240–242). Repair guide: same tokens **without** the two-space indent. Both match their specs. JSON status serializes `label`/`checkId`. Tests in `change/change-status.spec.ts` cover DEPS_INCONSISTENT gerund labels.
- Design skill template vs status `review:` header: aligned (header is not a file list).

---

## Test Coverage

| Requirement                                         | Tests (representative)                                                                                                     | Adequacy                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| T1 signature / `--next` mutex                       | `change-transition.spec.ts` Command signature                                                                              | Adequate                                 |
| T2 `--next` map + refusals                          | Approval-gate routing; `--next` failures; `signed-off` → archivable                                                        | Adequate                                 |
| T3 no double refresh                                | Repair Guide test asserts `refreshImplementationTracking: false` twice                                                     | Adequate                                 |
| T4 no pending rewrite / no approval flags           | `change.spec.ts` + `change/change-transition.spec.ts`                                                                      | Adequate                                 |
| T5 skip-hooks parse `all` / comma / empty           | `--skip-hooks flag` describe                                                                                               | Adequate for parser; actual skip is core |
| T6–T8 stream name, no `hook-progress`               | JSON success with check events                                                                                             | Adequate                                 |
| T7/T10 hook fail progress + exit 2, no repair guide | Pre- and post-hooks                                                                                                        | Adequate                                 |
| T9 text + JSON complete                             | Output on success                                                                                                          | Adequate                                 |
| T11 Repair Guide stderr + labels                    | Invalid transition; ReadOnlyWorkspace `! CODE — label`; JSON failure complete                                              | Adequate                                 |
| T12 incomplete tasks + skip-hooks still blocks      | Incomplete tasks; `change/change-transition.spec.ts`                                                                       | Adequate                                 |
| T13 gerund, no `Executing:`                         | predicate + hook progress tests                                                                                            | Adequate                                 |
| T14 repair from GetStatus nextAction                | Repair Guide from GetStatus; verify skill not implement                                                                    | Adequate                                 |
| A1–A7                                               | `change-approve.spec.ts` + `change/change-approve.spec.ts` (reason, JSON, stay-in-state, unknown verb, drain invoke)       | Adequate                                 |
| R1–R6, R8–R10                                       | `change-archive.spec.ts` (alias via `change archive` in tests, skip-hooks, JSON stream, post-hook exit 2, gerund progress) | Adequate except D5                       |
| R7 omit invalidated                                 | Text omit / include tests                                                                                                  | Adequate                                 |
| Skills archive skip-pre / design review             | `template-workflow.spec.ts`                                                                                                | Spot-check only                          |
| Globals docs                                        | Living pages updated (manual read of `docs/cli/cli-reference.md`)                                                          | Met; no automated doc test               |

CLI command tests mock `resolveCliContext` / kernel: appropriate for an adapter package (`default:_global/testing` unit tests without fs).

---

## Missing Tests

1. **Isolated** `changes archive --skip-hooks pre` and `--skip-hooks post` forwarding (`skipHookPhases` singleton) — `cli:change-archive` verify.
2. **Unit** file for `createCheckProgressPresenter` (heartbeat `still running`, stderr `!` prefix, ANSI strip, structured `stream` discriminator). Covered indirectly.
3. **JSON structured failure** `complete` for transition (verify “Structured failure result”) — confirm whether `change-transition.spec.ts` covers `result: "failure"` NDJSON; text repair guide is well covered. If absent, add one JSON failure stream test.
4. **Help-text** assertions for approve bound-`from` language (`ready` / `done`) — spec MUST; currently only description strings in source, not asserted.
5. **Invalid `--skip-hooks` token** (e.g. `pre` on **transition**, or `source.post` on **archive**) → usage error. Specs imply closed token sets; parser throws `CliValidationError`.

Not missing: approve JSON (`change-approve.spec.ts` ~140–160, ~321–343); Repair Guide label line (`change-transition.spec.ts` ReadOnlyWorkspace).

---

## Spec Dependency Chain

```
cli:change-transition
  → cli:entrypoint
  → core:change
  → core:transition-change
  → core:hook-execution-model
  → core:get-status
  → core:transition-checks

cli:change-approve
  → cli:entrypoint
  → core:change
  → core:transition-checks   (approval.spec / approval.signoff)

cli:change-archive
  → cli:entrypoint
  → core:change
  → core:archive-change
  → core:hook-execution-model
  → cli:command-resource-naming
  → core:transition-checks

cli:change-status (recorte; depth-1 note only)
  → cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks

skills:skill-templates-source (recorte; spot-check)
  → skills:skill, cli:spec-optimizations, skills:workflow-automation, core:transition-checks

Project-wide (always in scope for this batch)
  default:_global/architecture
  default:_global/conventions  → default:_global/error-handling-conventions
  default:_global/testing      → architecture, conventions
  default:_global/spec-layout  → core:schema-format, content-extraction, spec-id-format
  default:_global/docs
  default:_global/eslint       → conventions
```

**Consistency:** Change CLI specs correctly depend on `core:transition-checks` for the generic bus and gerund labels. Archive skip-hooks token set (`pre`/`post`) correctly does **not** reuse transition selectors (`source.post`/`target.pre`). That split is consistent with `core:hook-execution-model` / `core:archive-change` (depth-1). No clash with `cli:change-status` blocker label shape.

---

## Hexagonal / layout / docs flags (this change)

- **Hexagonal:** CLI → SDK kernel only. No core+code-graph mix. Presentation (Repair Guide, skip-hooks parse, check-progress rendering) belongs in the adapter. The `--next` state table is the one architecture tension (D3).
- **Test layout:** Split `test/commands/change-*.spec.ts` vs `test/commands/change/change-*.spec.ts`; presenter tests not mirrored (D4).
- **docs/:** Living CLI reference and workflow guide updated for streams, skip-hooks, Repair Guide stderr, approve stay-in-state. **No docs gap** for this batch.

---

## Summary counts

|                                    | Count                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Change specs fully audited         | 3 (`cli:change-transition`, `cli:change-approve`, `cli:change-archive`) |
| Recorte specs (contradiction-only) | 2 (`cli:change-status`, `skills:skill-templates-source`)                |
| Global specs scoped                | 6                                                                       |
| Requirements tracked (change CLI)  | 31 (14+7+10)                                                            |
| Implemented as specified           | 31 (behaviour); 2 spec-internal/verify/layout issues                    |
| Discrepancies                      | 5 (D1–D5)                                                               |
| Missing tests                      | 5 items (none block the main contracts)                                 |
| **Critical**                       | **0**                                                                   |
| **High**                           | **0**                                                                   |
| **Medium**                         | **3** (D1, D2, D3)                                                      |
| **Low**                            | **2** (D4, D5)                                                          |
| Recorte contradictions             | **0**                                                                   |

**Headline:** Transition skip-hooks selectors, check-progress bus (`change-transition` / `change-archive`), Repair Guide on stderr with labeled blockers, archive JSON stream, and approve stay-in-ready/done copy are implemented and tested. Remaining issues are verify-over-constraint, a leftover garbled archive “Output on success” paragraph in the merged spec, hexagonal placement of `--next`, and test-file layout — not a failed delivery of the CLI UX this change specified.
