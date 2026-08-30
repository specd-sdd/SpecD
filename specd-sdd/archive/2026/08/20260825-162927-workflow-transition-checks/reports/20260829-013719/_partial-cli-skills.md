# Spec-compliance audit — CLI + skills (change `workflow-transition-checks`)

**Mode:** change  
**Change:** `workflow-transition-checks`  
**Assigned specs (spec-preview):** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Graph:** `stale: false`, `contentFresh: true` (indexed `2026-08-28T23:37:14.399Z`, ref `2948f1a2`)  
**Read-only:** no code or spec files modified.

Evidence sources: `specd changes spec-preview`, `specd graph search` / `graph impact`, then source under `packages/cli` and `packages/skills/templates`.

---

## Requirements Summary

Unique **spec.md** requirements from spec-preview (verify.md repeats them as scenarios).

### `cli:change-status` (16)

| ID    | Requirement                                      | Intent                                                                                                   |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| CS-1  | Command signature                                | `change status <name> [--format]`                                                                        |
| CS-2  | Drafted change status is read-only               | No mutable transitions; drafted marker; MAY show artifacts                                               |
| CS-3  | Output format                                    | JSON/TOON `hasTasks`; DAG `state` is display projection                                                  |
| CS-4  | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                         |
| CS-5  | Display-state rendering                          | Text prefers display; JSON has canonical + display                                                       |
| CS-6  | Lifecycle projections come from GetStatus checks | Pass through check-derived `availableTransitions` / `nextAction`; no local `VALID_TRANSITIONS` re-filter |
| CS-7  | Text status omits duplicated review file lists   | Review header without file paths; overlap peers still print                                              |
| CS-8  | Text blockers include check labels               | `! CODE — label: message`                                                                                |
| CS-9  | Schema version warning                           | stderr; skip if `schemaInfo` null                                                                        |
| CS-10 | Change not found                                 | exit 1, `error:`                                                                                         |
| CS-11 | Schema-derived fields                            | `schema.artifactDag` from `schema.artifactDag()`                                                         |
| CS-12 | Delegates refresh policy to GetStatus            | No direct refresh / detector                                                                             |
| CS-13 | Implementation section                           | SDK projection only                                                                                      |
| CS-14 | Task completion in details                       | `tasks: N/M`                                                                                             |
| CS-15 | Basic info section                               | No standalone `specs:` list                                                                              |
| CS-16 | Specs and dependencies section                   | Text list + JSON `specDependsOn`                                                                         |

**Constraints (binding, not separate headings):** suppress drafted `nextAction.command`; do not second-filter `availableTransitions`. Verify CS-2: JSON `availableTransitions` is empty **or omitted**. Implementation now **forces `[]`** even if Core leaks hops (focus item).

### `cli:change-transition` (15)

| ID    | Requirement                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| CT-1  | Command signature (`--next` → `to: 'next'`; `--allow-out-of-scope`; hook skip phases)                            |
| CT-2  | Next-transition resolution (Core resolves `'next'`; no CLI from→to table; no `GetStatus.nextAction` as resolver) |
| CT-3  | Delegates refresh to TransitionChange                                                                            |
| CT-4  | Approval-gate routing (no gate flags; no rewrite to pending)                                                     |
| CT-5  | Hook execution                                                                                                   |
| CT-6  | Progress output (`stream: "change-transition"`; never `"hook-progress"`)                                         |
| CT-7  | Transition hook observability                                                                                    |
| CT-8  | Shared hook progress presentation                                                                                |
| CT-9  | Output on success                                                                                                |
| CT-10 | Post-hook failure warning (exit 2)                                                                               |
| CT-11 | Invalid transition error + Repair Guide from GetStatus                                                           |
| CT-12 | Incomplete tasks error                                                                                           |
| CT-13 | Check progress rendering (gerund labels; no `Executing:`)                                                        |
| CT-14 | Unsatisfied requires error                                                                                       |
| CT-15 | (covered in CT-5 verify scenarios for `--skip-hooks`)                                                            |

### `cli:change-approve` (7)

AP-1 signatures; AP-2 kernel gates / `kernel.changes.approve*`; AP-3 no CLI hashes; AP-4 spec from `ready` (drain pending); AP-5 signoff from `done`; AP-6 success output; AP-7 errors.

### `cli:change-archive` (10)

AR-1 signature; **AR-2 Prerequisites: `archivable` only**; AR-3 Behaviour (`ArchiveChange`); AR-4 hooks; AR-5 check progress; AR-6 post-archive hooks exit 2; AR-7–AR-9 success text/JSON stream; AR-10 error cases (`archivable` only).

**Focus vs preview:** Core `Change.isArchivable` is `archivable || archiving`. This change’s **CLI deltas do not update AR-2 / AR-10**. Preview still forbids `archiving`.

### `skills:skill-templates-source` (21)

ST-1 location; ST-2 migration (skills list, no `specd-metadata/`); ST-3 metadata JSON; ST-4 Handlebars/capabilities; ST-5 graph impact terms; ST-6 graph search `--snippet`; ST-7–ST-10 frontmatter; ST-11 implementation tracking copy; ST-12 metadata self-healing; ST-13 optimizer gating; ST-14 command roles; ST-15 in-place approval gates; ST-16 impl drain in verify/implement; ST-17 archive `--skip-hooks pre`; ST-18 design review scope; ST-19 overlap vs `OVERLAP_CONFLICT`.

**Focus:** `nextAction.command`; `done`/`signed-off` → `/specd-archive` when hop is `archivable`; invalidation overlap → `/specd-design`; no `LifecycleEngine` constructor language.

---

## Implementation Status

### `cli:change-status` — implemented (focus item closed)

`packages/cli/src/commands/change/status.ts` (`registerChangeStatus`):

- Draft JSON **hard-codes** `availableTransitions: []` (does not copy `lifecycle.availableTransitions`).
- Draft `nextAction` is copied then `command` forced `null`.
- Text: `(drafted)`, `transitions: (none — change is drafted)`, `command: (none)`.
- Active path serializes GetStatus `availableTransitions` / `nextAction` without a `VALID_TRANSITIONS` overlay.
- Review text: header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; filters `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'`.
- Blockers with `label` use `! CODE — label: message`.
- Help JSON schema lists `overlapDetail`.
- Refresh: `kernel.changes.status.execute({ name })` only.

**Partial / leak surface:** drafted JSON still passes `availableSteps: lifecycle.availableSteps ?? []`. `core:get-status` (dependency) requires drafted `availableSteps` empty. CLI spec does not require CLI-side force. If Core leaked extras, JSON would show them. `availableTransitions` leak is explicitly blocked.

### `cli:change-transition` — implemented

`packages/cli/src/commands/change/transition.ts`:

- `--next` sets `to: requestedTarget` where `requestedTarget` is `'next'` (not a local hop map). `CHANGE_STATES` is argument validation only.
- `allowOutOfScope` only when flag set; no `approvalsSpec` / `approvalsSignoff` on execute input.
- Pre-status uses `refreshImplementationTracking: false`.
- Check bus via `_check-progress-presenter`, `stream: "change-transition"`.
- Repair guide from follow-up GetStatus `blockers` + `nextAction`.

### `cli:change-approve` — implemented

`packages/cli/src/commands/change/approve.ts`: `{ name, reason }` only; `kernel.changes.approveSpec` / `approveSignoff`; help text uses `ready` / `done` plus drain language; success `approved <gate> for <name>`.

### `cli:change-archive` — implemented vs Core; **spec-preview lag**

CLI has **no local state gate**; it always calls `kernel.changes.archive.execute`. Core `assertArchivable()` / `isArchivable` allows **`archiving` as well as `archivable`**. Live CLI therefore archives from `archiving` if Core predicates pass.

**Spec-preview AR-2 / Constraints still say only `archivable`.** Change deltas for `cli:change-archive` add progress/JSON stream/`--allow-out-of-scope`, not the `archiving` retry path.

JSDoc on `ArchiveChange.execute` still says “not in `archivable` state” (stale comment vs `isArchivable`).

### `skills:skill-templates-source` — implemented against preview

Layout: `templates/skills/{specd,specd-archive,specd-design,specd-implement,specd-new,specd-compliance,specd-verify}/` + agents + `shared.md.tpl`. No `specd-metadata/`. `.md.tpl` + `skill.meta.json` / `specd-agent.meta.json` with required shape.

Focus routing:

- `shared.md.tpl`: `nextAction` includes `command`; prefer that over manual derivation.
- `specd-new/SKILL.md.tpl`: follow `nextAction.command`; `done` / `signed-off` → `/specd-archive` when hop is `archivable`, else `/specd-verify`; `spec-overlap-conflict` → `/specd-design`.
- Design / implement / verify / archive: same overlap routing; hop skills do not list `OVERLAP_CONFLICT` in typical-blocker examples; archive does.
- `specd/SKILL.md.tpl`: router; no signoff / pending / approve copy.
- **No `LifecycleEngine` / constructor language** anywhere under `packages/skills`.
- Archive skill: `--skip-hooks pre` only on `changes archive`; no post `run-hooks`; still `hook-instruction` post; requires state `archivable` (matches **CLI preview**, not Core retry-from-`archiving`).

Graph: `--direction dependents`; `--snippet` opt-in; no `--changes` selector.

---

## Discrepancies

Present both interpretations.

### D1 — HIGH (spec lag): CLI archive spec vs Core archive from `archiving`

| Side                             | Evidence                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Preview `cli:change-archive`** | Prerequisites + error cases + Constraints: only `archivable`. Deltas never modified those sections.                               |
| **Core / CLI runtime**           | `Change.isArchivable` = `archivable \|\| archiving`; `archive.archivable` uses `assertArchivable()`; CLI does not re-check state. |
| **Skills preview**               | `specd-archive` MUST already be `archivable`; template: “If state is not `archivable`, this is the wrong skill.”                  |

**If spec is right:** CLI (and skills) should reject `archiving` even when Core would accept (they currently would not reject at CLI layer).  
**If Core is right (failed-archive retry):** change should update `cli:change-archive` AR-2/AR-10 **and** `skills` archive entry so agents retry archive from `archiving`.  
**Both partial:** CLI docs/JSDoc still say “archivable only” while entity allows `archiving`.

### D2 — LOW (closed vs prior): drafted JSON `availableTransitions`

Prior concern: Core leak of hops in drafted JSON. **Code now forces `[]`.** Test mocks `availableTransitions: ['ready']` and expects `[]`.

**Residual spec softness:** verify CS-2 still says “empty **or omitted**”; constraints do not say “force `[]` if Core leaks.” Code is stricter than verify. Prefer tightening verify to MUST `[]`.

### D3 — LOW: drafted `availableSteps` passthrough

CLI JSON copies Core `availableSteps`. Dependency `core:get-status` says drafted `availableSteps` MUST be empty. Not in `cli:change-status`. If Core leaked extras, agents could see them.

**Spec drift vs bug:** Core should empty them; CLI could belt-and-suspenders like `availableTransitions`.

### D4 — LOW: `specd-new` table vs `nextAction.command`

Template says follow `nextAction.command`, then if `review.required` is false, **suggest from `targetStep` table**. If Core `command` and table disagree, the table can win. `shared.md.tpl` says prefer `nextAction`. Not a hard contradiction if table matches Core guidance; tests do not lock the table to `command`.

### D5 — NONE found: `LifecycleEngine` ctor in skills

No matches in templates or skills tests. Aligns with `core:lifecycle-engine` “no LifecycleEngine class” (out of this batch but consistent).

### D6 — Consistency: in-place gates

CLI approve + skills stay-in-`ready`/`done` align with change deltas. No pending rewrite on transition CLI.

---

## Test Coverage

| Requirement cluster                                                       | Tests                                                                                                             | Verdict                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Drafted JSON forces `[]` despite Core leak                                | `packages/cli/test/commands/change/status.spec.ts` `JSON drafted status includes isDrafted and empty transitions` | **Covers focus**                           |
| Drafted text read-only                                                    | same file, text drafted test                                                                                      | Covered                                    |
| `--next` → `{ to: 'next' }`                                               | `transition.spec.ts` (success + failure paths, including signed-off and archiving reject messages)                | Covered                                    |
| No approval flags / allowOutOfScope omit                                  | `transition.spec.ts`, `archive.spec.ts`                                                                           | Covered                                    |
| Approve kernel shape + stay-in-state copy                                 | `approve.spec.ts`                                                                                                 | Covered                                    |
| Archive skip-hooks / JSON stream / overlap                                | `archive.spec.ts`                                                                                                 | Covered                                    |
| Archive not-archivable (`done`)                                           | `archive.spec.ts` mocks `InvalidStateTransitionError('done', 'archivable')`                                       | Covers **done**, not **archiving-allowed** |
| Skills gates, overlap, skip-hooks pre, review header, impl drain          | `packages/skills/test/template-workflow.spec.ts`                                                                  | Strong for ST-15–ST-19                     |
| Optimizer / metadata / command roles                                      | same file                                                                                                         | Strong for ST-12–ST-14                     |
| Status overlap peers, no review files, hide invalidation OVERLAP_CONFLICT | `status.spec.ts`                                                                                                  | Covered CS-7                               |
| Transition check bus / no `Executing:` / no `hook-progress`               | `transition.spec.ts`                                                                                              | Covered CT-6/CT-13                         |
| Repair guide uses GetStatus command                                       | `transition.spec.ts` (e.g. READ_ONLY with label)                                                                  | Partial CT-11                              |

---

## Missing Tests

1. **`cli:change-status` verify “DEPS_INCONSISTENT … Checking spec dependencies”** — implementation renders labels; status tests show unlabeled `INCOMPLETE_ARTIFACT` and overlap labels, not that scenario’s code+label pair / JSON `blockers[].label`.
2. **Drafted JSON `availableSteps` leak** — no test that Core-populated `availableSteps` are emptied or documented as Core-owned.
3. **`--help` lists `overlapDetail`** — spec CS-7; no CLI help-text assertion found.
4. **Archive from `archiving`** — neither “succeeds via Core” nor “CLI rejects” is specified in CLI tests; Core unit tests cover entity, not this CLI command.
5. **Skills `nextAction.command` string** — `template-workflow.spec.ts` does not assert `Follow the \`nextAction.command\``or the`done`/`signed-off` `/specd-archive`when hop is`archivable` row.
6. **Skills `LifecycleEngine` absence** — satisfied by absence; optional negative assertion not present (low value).
7. **Status “CLI does not add verifying from VALID_TRANSITIONS”** — pass-through implied; no test that a local constant cannot reintroduce hops (implementation has no such filter).

---

## Spec Dependency Chain

Depth-1 from change `specDependsOn` (preview):

```
cli:change-status
  → cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks

cli:change-transition
  → cli:entrypoint, core:change, core:transition-change, core:hook-execution-model, core:get-status, core:transition-checks

cli:change-approve
  → cli:entrypoint, core:change, core:transition-checks

cli:change-archive
  → cli:entrypoint, core:change, core:archive-change, core:hook-execution-model, cli:command-resource-naming, core:transition-checks

skills:skill-templates-source
  → skills:skill, cli:spec-optimizations, skills:workflow-automation, core:transition-checks
```

**Cross-spec tension (this batch vs Core on same change):** `core:change` / archive checks treat `archiving` as archive-eligible; `cli:change-archive` + `skills` archive skill still describe **archivable-only**. `core:get-status` drafted `availableSteps: []` vs CLI JSON passthrough. `core:lifecycle-engine` forbids a `LifecycleEngine` class; skills templates do not mention it.

Global `_global/architecture` (CLI as edge, Core owns lifecycle) is respected: CLI serializes / forwards; it does not recompute hops except the **drafted `availableTransitions: []` and `command: null` sanitizers**.

---

## Summary counts

| Metric                                              | Count                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assigned specs                                      | 5                                                                                                                                                                                  |
| Unique spec.md requirements audited                 | **69** (16+15+7+10+21)                                                                                                                                                             |
| Implemented (aligned with preview + code)           | **65**                                                                                                                                                                             |
| Partial                                             | **3** (AR-2/AR-10 vs Core `archiving`; drafted `availableSteps`; specd-new command vs table)                                                                                       |
| Missing / not specified in this change’s CLI deltas | **1** (archive-from-`archiving` in `cli:change-archive` + archive skill)                                                                                                           |
| Discrepancies (D1–D6; D5 none)                      | **4 material** (D1 HIGH, D2 residual LOW, D3 LOW, D4 LOW)                                                                                                                          |
| Requirements with adequate tests                    | **~58**                                                                                                                                                                            |
| Missing or weak tests                               | **7** listed                                                                                                                                                                       |
| Focus items                                         | Drafted JSON `[]`: **pass**; `--next`→`to:'next'`: **pass**; archive `archiving`: **code pass / spec-preview fail**; skills command/archive/overlap/no-engine: **pass** vs preview |

**Bottom line:** CLI status now **forces empty `availableTransitions` on drafted JSON**. Transition **`--next` is a Core passthrough**. Skills match preview routing (`nextAction.command`, archive hop from `done`/`signed-off`, overlap → `/specd-design`, no LifecycleEngine). **Largest gap:** preview `cli:change-archive` (and archive skill) still **archivable-only** while Core **archives from `archiving` too**, and this change’s CLI deltas never updated that contract.
