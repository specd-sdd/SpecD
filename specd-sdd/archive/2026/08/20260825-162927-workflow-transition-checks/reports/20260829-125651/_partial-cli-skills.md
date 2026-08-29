# Spec-compliance audit (partial): CLI + skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Read-only.** Graph `stale: false` (indexed `2026-08-29T10:57:16.886Z`). Specs via `changes spec-preview`.  
**Prior 090131 (this batch):** drafted JSON empty hops CLOSED; HIGH archive archivable-only CLOSED; leftover LOW help vs nested lifecycle hops CLOSED (help updated); archive description CLOSED; skills verify/archive `archivable` **or** `archiving` CLOSED; drafted command-leak test PRESENT; gerund blocker test PRESENT; archive no GetStatus preflight PRESENT.

---

## Requirements Summary

### `cli:change-status` (16 requirements)

| ID  | Requirement                        | Intent                                                                                                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                  | `change status <name> [--format text\|json\|toon]`                                                                           |
| S2  | Drafted status is read-only        | No mutating hops; mark drafted; MAY show artifacts                                                                           |
| S3  | Output format                      | `artifactDag[].hasTasks`; DAG `state` is display projection                                                                  |
| S4  | Task completion in DAG             | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` boolean                                                    |
| S5  | Display-state rendering            | Text uses display states; JSON has canonical + display                                                                       |
| S6  | Lifecycle from GetStatus checks    | No local `VALID_TRANSITIONS`-only filter                                                                                     |
| S7  | Text omits duplicated review files | `review:` header without `affectedArtifacts` paths; overlap peers still print                                                |
| S8  | Text blockers include check labels | `! CODE — <gerund>: <message>`; JSON `label`/`checkId`                                                                       |
| S9  | Schema version warning             | stderr warning vs `lifecycle.schemaInfo`; skip if null; exit 0                                                               |
| S10 | Change not found                   | exit 1, `error:`                                                                                                             |
| S11 | Schema-derived fields              | nested `schema.artifactDag` via `artifactDag()`/`childrenOf`; text DAG roots/children; display status; convergent nodes once |
| S12 | Delegates refresh to GetStatus     | no `RefreshImplementationTracking` / detector                                                                                |
| S13 | Implementation section             | SDK projection only                                                                                                          |
| S14 | Task completion in details         | `tasks: N/M`                                                                                                                 |
| S15 | Basic info                         | name + state; no standalone `specs:` list                                                                                    |
| S16 | Specs and dependencies             | text section + JSON `specDependsOn`                                                                                          |

**Constraints (binding):** no SchemaRegistry/`config show` to recompute **lifecycle**; drafted `nextAction.command` `(none)` / JSON `null`; drafted JSON `availableTransitions`/`availableSteps` `[]` even if Core leaked hops; no second VALID_TRANSITIONS filter.

### `cli:change-transition` (14 requirements)

| ID  | Requirement                | Intent                                                                                         |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| T1  | Command signature          | `<name> <step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope` → `impl.linksInScope` only |
| T2  | Next-transition resolution | `to: 'next'` to Core; no CLI routing table; no `GetStatus.nextAction` as resolver              |
| T3  | Delegates refresh          | preflight + repair `GetStatus` with `refreshImplementationTracking: false`                     |
| T4  | Approval-gate routing      | no gate flags on execute; no rewrite to pending parking                                        |
| T5  | Hook execution             | map `--skip-hooks` to `skipHookPhases`                                                         |
| T6  | Progress output            | generic check bus; `stream: "change-transition"`; no `hook-progress`                           |
| T7  | Hook observability         | progress before hook-triggered failure                                                         |
| T8  | Shared hook progress       | distinct stream from `run-hooks`                                                               |
| T9  | Output on success          | text confirmation; JSON terminal `complete`/`ok`                                               |
| T10 | Post-hook failure          | exit 2, `error:`; not a warning state                                                          |
| T11 | Invalid transition         | exit 1; Repair Guide on stderr with gerund labels; JSON `failure` complete record              |
| T12 | Incomplete tasks           | exit 1 naming artifact                                                                         |
| T13 | Check progress rendering   | gerund `(id)`; `✓`/`✗`; no `Executing:`                                                        |
| T14 | Unsatisfied requires       | exit 1                                                                                         |

**Constraints:** help must not expose from→to routing; repair data from Core; `HookFailedError` is not repair-guide; text progress on stderr, confirmation on stdout.

### `cli:change-approve` (7 requirements)

| ID  | Requirement               | Intent                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` (required)                                                     |
| A2  | Delegates gate state      | `{ name, reason }` only; `kernel.changes.*` not `kernel.specs.*`                                       |
| A3  | Artifact hash computation | CLI must not compute/pass hashes                                                                       |
| A4  | Approve spec              | bound-`from` `ready` (+ drain `pending-spec-approval`); stay in `ready`; help uses bound-from language |
| A5  | Approve signoff           | bound-`from` `done` (+ drain); stay in `done`                                                          |
| A6  | Output on success         | `approved <gate> for <name>` / JSON `{ result, gate, name }`                                           |
| A7  | Error cases               | missing reason, wrong state, not found → exit 1                                                        |

### `cli:change-archive` (10 requirements)

| ID  | Requirement                  | Intent                                                                                                                     |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | Command signature            | `changes archive` canonical; `change archive` alias; skip phases `pre,post,all`; `--allow-overlap`; `--allow-out-of-scope` |
| R2  | Prerequisites                | `archivable` **or** `archiving`; Core `assertArchivable`; **no** CLI-only archivable-only table                            |
| R3  | Behaviour                    | delegate merge/move/history to `ArchiveChange`                                                                             |
| R4  | Hook execution               | map `--skip-hooks` to archive phase set                                                                                    |
| R5  | Check progress rendering     | same gerund bus as transition; stream `change-archive`                                                                     |
| R6  | Post-archive hooks           | exit 2 on post failures                                                                                                    |
| R7  | Output on success            | path line; omit invalidated section when empty                                                                             |
| R8  | Output on success (extended) | invalidated list / JSON array                                                                                              |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"` complete; **no** second unwrapped `{ result: "ok" }`                                     |
| R10 | Error cases                  | not found / not archivable-or-archiving / merge fail → exit 1; stderr names current state                                  |

### `skills:skill-templates-source` (19 requirements; change-relevant subset called out)

| ID     | Requirement                                                               | Change-relevant?                                                                              |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| K1–K10 | Template tree, metadata, Handlebars, graph wording, snippets, frontmatter | Baseline (still in force)                                                                     |
| K11    | Implementation tracking copy                                              | Yes (shared/archive/implement)                                                                |
| K12    | Metadata self-healing                                                     | Yes (archive)                                                                                 |
| K13    | Optimizer gating                                                          | Baseline                                                                                      |
| K14    | Agent-facing command roles                                                | Yes (archive/shared)                                                                          |
| K15    | **In-place approval gates**                                               | **Yes** — stay in `ready`/`done`; pending drain-only; archive `archivable` **or** `archiving` |
| K16    | Verify/implement tracking drain                                           | Yes                                                                                           |
| K17    | Archive `--skip-hooks pre` not `all`                                      | Yes                                                                                           |
| K18    | Design review scope                                                       | Yes                                                                                           |
| K19    | OVERLAP_CONFLICT live-archive only                                        | Yes                                                                                           |

**Direct dependencies (depth 1, not fully re-audited here):** `cli:entrypoint`, `core:change`, `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `sdk:build-implementation-review`, `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`.

No contradiction found between these change specs and `core:transition-checks` in-place gates (CLI/skills describe stay-in-state + human approve; pending is drain).

---

## Implementation Status

### `cli:change-status` — `packages/cli/src/commands/change/status.ts`

| Req     | Status          | Evidence                                                                                                                                                                                                                                   |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1      | **Implemented** | `status <name>`, `--format`, `--implementation`                                                                                                                                                                                            |
| S2      | **Implemented** | `draftView` branch: text `(drafted)`, transitions `(none — change is drafted)`, `command: (none)`; JSON `isDrafted: true`, `availableTransitions: []`, `availableSteps: []`, `nextAction.command: null` even when Core leaked hops/command |
| S3–S5   | **Implemented** | DAG `state` from `displayStatus`; JSON files include `state` + `displayStatus`; `hasTasks` boolean                                                                                                                                         |
| S6      | **Implemented** | Text/JSON hops copied from `lifecycle.availableTransitions` / `availableSteps`; no VALID_TRANSITIONS rewrite                                                                                                                               |
| S7      | **Implemented** | `review:` without file paths; overlap section from `overlapDetail`; filters `OVERLAP_CONFLICT` when reason is `spec-overlap-conflict`                                                                                                      |
| S8      | **Implemented** | `! ${code} — ${label}: ${message}`; JSON maps `label`/`checkId`                                                                                                                                                                            |
| S9      | **Implemented** | compares `change.schema*` to `lifecycle.schemaInfo` only; skip if null                                                                                                                                                                     |
| S10     | **Implemented** | `handleError`                                                                                                                                                                                                                              |
| S11     | **Implemented** | `resolveStatusSchemaDag` prefers `schema.artifactDag()`; fallback `ArtifactDag.from(schemaInfo.artifacts)` when `activeSchema.raw`; `visited` set omits convergent repeats (spec MAY omit)                                                 |
| S12     | **Implemented** | `status.execute({ name })` only                                                                                                                                                                                                            |
| S13     | **Implemented** | `enrichImplementationTracking` gated on `--implementation`                                                                                                                                                                                 |
| S14–S16 | **Implemented** | details `tasks: N/M`; no `specs:` line; `specDependsOn`                                                                                                                                                                                    |

**Help (prior LOW):** JSON help now states top-level `availableTransitions`/`availableSteps` are **drafted JSON only**; active hops live under `lifecycle`. `review.overlapDetail` is listed. Matches S6/S7.

**Note (not scored as fail):** handler calls `kernel.specs.getActiveSchema.execute()` for DAG topology. Constraint forbids another use case to recompute **lifecycle**; S11 requires a live `Schema.artifactDag()`. Version warning does **not** resolve schema independently.

### `cli:change-transition` — `packages/cli/src/commands/change/transition.ts` + `_check-progress-presenter.ts`

| Req        | Status          | Evidence                                                                                                |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| T1         | **Implemented** | `[step]` optional; `--next` xor step; `--allow-out-of-scope` only when flag set                         |
| T2         | **Implemented** | `to: requestedTarget` is `'next'` or concrete state; `CHANGE_STATES` is validation, not a from→to table |
| T3         | **Implemented** | preflight + repair `status.execute({ name, refreshImplementationTracking: false })`                     |
| T4         | **Implemented** | execute input is `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`                             |
| T5         | **Implemented** | `parseCommaSeparatedValues` vs `source.pre/post`, `target.pre/post`, `all`                              |
| T6–T8, T13 | **Implemented** | presenter `streamName: 'change-transition'`; text to stderr; no `Executing:`                            |
| T9         | **Implemented** | `transitioned ${name}: ${from} → ${to}`; JSON complete `ok`                                             |
| T10        | **Implemented** | `HookFailedError` not in `isRepairGuideError`; `handleError` exit 2                                     |
| T11        | **Implemented** | gerund blocker lines; repair guide from GetStatus `nextAction`                                          |
| T12, T14   | **Implemented** | delegated to Core; CLI surfaces errors                                                                  |

Help description: stay in ready/done; pending drain — policy, not a routing table (constraint T).

### `cli:change-approve` — `packages/cli/src/commands/change/approve.ts`

| Req   | Status          | Evidence                                                                 |
| ----- | --------------- | ------------------------------------------------------------------------ | -------------------------------- |
| A1–A3 | **Implemented** | `requiredOption('--reason')`; execute `{ name, reason }` only; no hashes |
| A4–A5 | **Implemented** | help: ready / done with pending drain wording; stdout `approved spec     | signoff for` with no pending hop |
| A6–A7 | **Implemented** | JSON `{ result, gate, name }`; Commander + `handleError`                 |

Command does **not** call GetStatus (tests still mock it unused).

### `cli:change-archive` — `packages/cli/src/commands/change/archive.ts`

| Req   | Status          | Evidence                                                                                                  |
| ----- | --------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---- |
| R1    | **Implemented** | registered on `changes` with alias `change` (`packages/cli/src/index.ts`)                                 |
| R2    | **Implemented** | **no** local state table; description: “archivable … or retry from archiving”; `assertArchivable` is Core |
| R3–R4 | **Implemented** | direct `archive.execute`; skip set `pre                                                                   | post | all` |
| R5    | **Implemented** | same presenter, `streamName: 'change-archive'`                                                            |
| R6    | **Implemented** | `postHookFailures` → `cliError(..., 2)` **before** success print                                          |
| R7–R9 | **Implemented** | text path; invalidated only if `length > 0`; JSON single stream complete object                           |
| R10   | **Implemented** | `ChangeNotFoundError` / `InvalidStateTransitionError` / `SpecOverlapError`                                |

**No GetStatus preflight** (prior HIGH/test): `status.execute` is not called in the action.

### `skills:skill-templates-source`

| Req                                          | Status                       | Evidence                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K15 archive                                  | **Implemented**              | `specd-archive/SKILL.md.tpl`: MUST already be `archivable` **or** `archiving`; signoff wait `/specd-verify` in `done`; no `pending-signoff` / transition into it                    |
| K15 verify/implement/design/new/shared/entry | **Implemented**              | stay-in-state; drain-only pending rows; entry skill has no signoff copy (`template-workflow.spec.ts`)                                                                               |
| K16–K19                                      | **Implemented**              | shared cookbook; verify drains `IMPLEMENTATION_STATE`; archive `--skip-hooks pre`; design does not list files under `review:`; hop skills do not list `OVERLAP_CONFLICT` as typical |
| K1–K14                                       | **Implemented** (spot-check) | `.md.tpl` + meta; no `graph impact --changes`; `--snippet` opt-in in shared/new/design                                                                                              |

---

## Discrepancies

None **HIGH** / **CRITICAL**. Prior 090131 items in this batch are **closed in code**.

### Closed priors (do not re-open)

1. **Drafted JSON empty hops** — `status.ts` forces `availableTransitions: []`, `availableSteps: []`, `nextAction.command: null`. Test leaks Core `availableTransitions: ['ready']` and `/specd-design`.
2. **Archive archivable-only CLI gate** — removed; Core owns `assertArchivable`; description includes `archiving` retry.
3. **Help vs nested lifecycle hops** — help comments: drafted-only top-level hops; active hops under `lifecycle`.
4. **Skills archive/verify parking copy** — archive requires `archivable` **or** `archiving`; verify does not teach `pending-signoff`.
5. **Archive GetStatus preflight** — absent; test `expect(kernel.changes.status.execute).not.toHaveBeenCalled()`.

### Remaining nits (not implementation bugs)

| Sev  | Spec                                  | Item                                                                                                                                                                     | Spec might be wrong                                         | Code might be wrong                            | Both                                                       |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| LOW  | `cli:change-status` help vs S11       | `--help` JSON still types `schema` as `{ name, version }` while runtime overwrites `schema` with `{ name, version, artifactDag }` **and** keeps top-level `artifactDag`. | Help is a union sketch, not a SHALL except `overlapDetail`. | Help incomplete vs actual JSON.                | Prefer aligning help with S11 nested `schema.artifactDag`. |
| LOW  | `cli:change-archive` verify.md        | Duplicate heading `#### Scenario: Change not in archivable state` (twice).                                                                                               | Artifact drift in verify delta.                             | —                                              | Spec hygiene.                                              |
| NOTE | `cli:change-status` S11 vs constraint | `getActiveSchema` used for DAG.                                                                                                                                          | Constraint “lifecycle data” vs S11 live DAG.                | Would be a bug only if used to recompute hops. | Treat as allowed by S11.                                   |

No spec↔global contradiction in this batch: in-place `approval.spec` / `approval.signoff` is consistently “stay in ready/done + approve”, not protocol hops to pending.

---

## Test Coverage

### `packages/cli/test/commands/change/status.spec.ts`

| Spec / scenario      | Test                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S2 drafted JSON leak | `JSON drafted status includes isDrafted and empty transitions` — asserts `[]` hops and `nextAction.command` null despite Core leak |
| S2 drafted text      | `text drafted status marks drafted and omits transition commands`                                                                  |
| S1 missing name      | `Missing name argument`                                                                                                            |
| S12 no refresh       | `Normal status output` — `refreshImplementationTracking.execute` not called                                                        |
| S15/S16              | no `specs:`; has `specs and dependencies:`                                                                                         |
| S8 gerund            | `Text blockers include gerund label` — exact `! DEPS_INCONSISTENT — Checking spec dependencies: …`                                 |
| S6 hops passthrough  | `Text output shows available transitions`                                                                                          |
| S11 childrenOf       | `JSON artifactDag children match schema DAG childrenOf`                                                                            |
| S3 drift DAG state   | `JSON output includes hasTasks and drift-aware state in artifactDag` → `complete-with-drift`                                       |
| S7/S8 overlap        | review header, no file lists, hide vs show `OVERLAP_CONFLICT`, JSON `overlapDetail`                                                |
| S9/S10               | Schema mismatch; Unknown change name                                                                                               |
| S14                  | `shows task counts in the details section`                                                                                         |

### `packages/cli/test/commands/change/transition.spec.ts`

| Spec / scenario          | Test                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| T1 xor / allowOutOfScope | combine `--next`+step; flag on/off                                                                             |
| T2 `--next`              | `to: 'next'`; ready→implementing without pending persist; signed-off→archivable                                |
| T3 refresh false         | preflight + nth call on repair                                                                                 |
| T4 no rewrite            | ready→implementing; done→archivable stay                                                                       |
| T5 skip phases           | `all`, empty, comma `target.pre,source.post`                                                                   |
| T6–T8, T13               | gerund predicate; hook bus; JSON `stream !== 'hook-progress'`                                                  |
| T9 JSON complete         | success complete record                                                                                        |
| T10 HookFailedError      | exit 2, no `repair guide:`; progress then fail                                                                 |
| T11 repair               | InvalidStateTransitionError; gerund `READ_ONLY_WORKSPACE — Checking workspace ownership`; verify not implement |
| T12                      | Unchecked checkboxes block verifying                                                                           |

### `packages/cli/test/commands/change/approve.spec.ts`

| Spec / scenario | Test                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| A4/A6           | success from ready; no `pending-spec-approval` in stdout; JSON                                 |
| A5              | success from done; drain from pending-signoff                                                  |
| A1/A7           | missing `--reason`; unknown sub-verb; not found; wrong state (via `ApprovalGateDisabledError`) |
| A2              | `execute` `{ name, reason }` only                                                              |

### `packages/cli/test/commands/change/archive.spec.ts`

| Spec / scenario    | Test                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| R2/R3 no GetStatus | `confirms archive` + `status.execute` not called                                |
| R2 not archivable  | `InvalidStateTransitionError('done', 'archivable')` exit 1                      |
| R4 skip phases     | `all`, `pre`, `post`, `pre,post`, default empty                                 |
| R5 gerund          | `Checking workspace ownership` / `Running pre hooks`; no `Executing:`           |
| R6                 | post-hook failures exit 2, no success line                                      |
| R7–R9              | path; invalidated text/JSON; NDJSON check-start/done/complete; no second object |
| R1 flags           | `allowOverlap` / `allowOutOfScope` on/off                                       |

### `packages/skills/test/template-workflow.spec.ts`

| Spec / scenario | Test                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| K15             | pending parking absent; archive contains `archivable` **and** `archiving`; entry skill no signoff |
| K16             | verify drain / implement zero-open                                                                |
| K17             | `--skip-hooks pre`; no archive `--skip-hooks all`; no post `run-hooks archiving`                  |
| K18             | design review scope                                                                               |
| K19             | hop skills typical blockers omit `OVERLAP_CONFLICT`; archive includes it + live-overlap wording   |
| K12–K14         | metadata/optimizer/command-role exact strings                                                     |

---

## Missing Tests

| Sev | Spec                        | Gap                                                                                                                                                                                    |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MED | `cli:change-status` S8      | Gerund test is **text-only**; no assertion that JSON/TOON `blockers[].label` / `checkId` are serialized                                                                                |
| MED | `cli:change-status` S6      | No test that CLI does **not** inject `verifying` from `validTransitions` when GetStatus omitted it; no status-level nextAction implement-vs-verify (covered only on transition repair) |
| MED | `cli:change-transition` T11 | No JSON/TOON test for terminal `complete` + `result: "failure"` with `blockers` + `nextAction`                                                                                         |
| MED | `cli:change-archive` R2     | Verify scenario **Change in archiving may retry** — no test that CLI forwards `archiving` without a local archivable-only gate (implementation has no gate; still unasserted)          |
| LOW | `cli:change-status` S2      | Discarded name → exit 1 (verify scenario); relies on Core `ChangeNotFoundError` without a status-unit case                                                                             |
| LOW | `cli:change-status` S4      | DAG `[hasTasks]` fallback when `taskCompletion` absent (existing DAG test supplies counts)                                                                                             |
| LOW | `cli:change-status` S11     | Convergent DAG (`design` under proposal **and** specs) not duplicated — no test                                                                                                        |
| LOW | `cli:change-status` S7      | `--help` contains `overlapDetail` (spec SHALL on help schema) — no test                                                                                                                |
| LOW | `cli:change-status` S9      | `schemaInfo: null` skips warning — no test                                                                                                                                             |
| LOW | `cli:change-archive` R1     | Singular alias `change archive` vs `changes archive` — no dedicated test (parent `.alias('change')`)                                                                                   |
| LOW | `cli:change-archive` R10    | stderr **names current state** — test only `/error:/`                                                                                                                                  |
| LOW | `cli:change-approve` A2     | No assertion `kernel.specs.approveSpec` is **not** invoked                                                                                                                             |
| LOW | `cli:change-approve` A3     | No explicit “CLI did not pass hashes” (true by call-shape `{ name, reason }`)                                                                                                          |
| LOW | `cli:change-transition` T5  | Individual `--skip-hooks target.pre` vs `source.post` (comma set is tested)                                                                                                            |
| LOW | skills K5                   | Graph dependents wording / `--direction dependents` not asserted in `template-workflow.spec.ts` (no `--changes` in templates; untested)                                                |

---

## Spec Dependency Chain

```
cli:change-status
  → cli:entrypoint
  → core:change
  → core:get-status
  → sdk:build-implementation-review
  → core:transition-checks

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
  → core:transition-checks

cli:change-archive
  → cli:entrypoint
  → core:change
  → core:archive-change
  → core:hook-execution-model
  → cli:command-resource-naming
  → core:transition-checks

skills:skill-templates-source
  → skills:skill
  → cli:spec-optimizations
  → skills:workflow-automation
  → core:transition-checks
```

**Consistency:** CLI/skills consume check-derived projections and gerund labels; they do not re-bind pending parking as happy-path protocol. Archive retry state is Core `assertArchivable`, not a narrower CLI enum.

---

## Summary counts

| Spec                            | Requirements | Implemented | Partial | Missing impl |             Discrepancies (open) |                                 Verify scenarios well-covered | Missing tests (rows above) |
| ------------------------------- | -----------: | ----------: | ------: | -----------: | -------------------------------: | ------------------------------------------------------------: | -------------------------: |
| `cli:change-status`             |           16 |          16 |       0 |            0 |       1 LOW (help schema sketch) |                                                     ~22 / ~28 |                          7 |
| `cli:change-transition`         |           14 |          14 |       0 |            0 |                                0 |                                                     ~24 / ~30 |                          2 |
| `cli:change-approve`            |            7 |           7 |       0 |            0 |                                0 |                                                       10 / 12 |                          2 |
| `cli:change-archive`            |           10 |          10 |       0 |            0 | 1 LOW (duplicate verify heading) |                                                       16 / 18 |                          3 |
| `skills:skill-templates-source` |           19 |          19 |       0 |            0 |                                0 | change-delta scenarios covered in `template-workflow.spec.ts` |                          1 |
| **Total**                       |       **66** |      **66** |   **0** |        **0** |                   **2 LOW nits** |                                                             — |                     **15** |

**Verdict:** this batch is **compliant**. All 090131 CLOSED items remain closed. Residual work is tests (JSON gerund, JSON transition failure, archiving retry passthrough) and help/verify hygiene, not behaviour.
