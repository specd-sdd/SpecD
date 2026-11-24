# Partial audit: skills + project-wide globals

**Mode:** change `workflow-transition-checks` (spec-preview)  
**Assigned:** `skills:skill-templates-source`; cross-check vs `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/spec-layout`  
**Read-only.** Graph index **FAILED** this session; templates and tests read from disk (`packages/skills/templates/…`, `packages/skills/test/template-workflow.spec.ts`). CLI: `node packages/cli/dist/index.js`.  
**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; `specs show` for the four globals.

**Prior MEDIUM M6 (report `20260828-144106`):** **CLOSED.** Hop skills no longer list `OVERLAP_CONFLICT` in the typical `(e.g. …)` blocker parenthetical; they teach `review.reason: spec-overlap-conflict` → `/specd-design`, not `--allow-overlap`. Archive MAY list `OVERLAP_CONFLICT` and `--allow-overlap` for live overlap only. Test `does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills` exists. Change spec now has an explicit requirement for this split (it was silent at 144106).

---

## Area A — `skills:skill-templates-source`

### Requirements Summary

Merged `spec.md` has **19** requirement groups, **0** `#### Scenario:` headings (layout-compliant). Matching `verify.md` headings; overlap block adds two scenarios vs the 144106 18-requirement preview.

**Unchanged (still in merged preview; this change does not rewrite them):**

1. Template source location (`.md.tpl`, `skill.meta.json` / `specd-agent.meta.json`)
2. Template migration tree (`templates/skills|agents|shared`; no `specd-metadata/`)
3. Template metadata contract
4. Capability-aware install-time rendering (Handlebars, `sharedFolder`)
5. Graph impact terminology (dependents / dependencies / `--file`, not `--changes`)
6. Graph search snippet opt-in (`--snippet`)
7. Frontmatter source / injection / agent matrix / why no static frontmatter
8. Implementation tracking instructions (add + archive review of tracked files)
9. Metadata self-healing (no metadata-status scans; `generate-metadata` is forced rebuild only)
10. Optimizer agent gating (`llmOptimizedContext` from `project status`)
11. Agent-facing command roles (`specs show` vs `context` vs `metadata`)

**Added / tightened by this change:**

12. **In-place approval gates** — hop-owning skills + `shared.md.tpl` describe gates as stay-in-`ready`/`done` + human `approve`; MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff`; pending names are drain-only; `specd` entry skill is router-only; archive requires `archivable` and points signoff wait at `/specd-verify` in `done`.
13. **Implementation tracking in verify and implement** — cookbook in `shared.md.tpl` (`list|review|add|resolve|ignore`); verify drains `IMPLEMENTATION_STATE` / open files in-skill (no bounce to `/specd-implement`); implement requires zero open tracked files before recommending `/specd-verify`; prefer top-level `--symbol` links.
14. **Archive skill skips only pre hooks** — `changes archive --skip-hooks pre` (not `all`); no post `run-hooks archiving` after success; still fetch post `hook-instruction`.
15. **Design review scope without review file lists** — MAY key off `review: required: yes`; MUST NOT say files are listed under the text `review:` header; first scope is `artifacts (details):` / `affectedArtifacts`.
16. **Overlap invalidation vs live archive overlap** — `OVERLAP_CONFLICT` is live archive only. `specd-design` / `specd-implement` / `specd-verify` / `specd-new` MUST NOT list it among typical status blockers and MUST NOT teach `--allow-overlap` as the response to `spec-overlap-conflict`. `specd-archive` MAY list `OVERLAP_CONFLICT`; `--allow-overlap` only for live overlap, not invalidation review.

**Spec Dependencies (merged):** `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending drain-only). Canonical spec-ID labels with relative links — conforms to `default:_global/spec-layout`.

### Implementation vs templates

| Requirement                | Status          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place gates             | **Implemented** | `shared.md.tpl`: NEVER run `changes approve`; change **stays** in `ready` or `done`; pending names only as drain. Hook copy: do **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates; MUST NOT run `source.post` on `along` backward. `specd-design`: stay in `ready`, `approve spec`; no `pending-spec-approval`, no `change transition` into pending. `specd-implement`: stay in `ready`; do **not** `transition implementing` when spec gate unsatisfied. `specd-verify`: stay in `done`, `approve signoff`; no `pending-signoff`. `specd-new` `targetStep` table: pending rows **Drain only**; `ready`/`done` suggest human `approve` when gates unsatisfied. `specd/SKILL.md.tpl`: router; no signoff / `approve spec` / pending parking. `specd-archive`: already `archivable`; signoff wait is `/specd-verify` in `done`; no `pending-signoff`. |
| Impl tracking drain        | **Implemented** | `shared.md.tpl` documents `list`, `review`, `add`, `resolve`, `ignore`; resolve vs ignore; top-level `--symbol`; no catch-all. `specd-verify`: drain `IMPLEMENTATION_STATE` / open files via `shared.md`; do **not** redirect to `/specd-implement` solely for open files. `specd-implement`: `implementation list`; zero open before `/specd-verify`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Archive `--skip-hooks pre` | **Implemented** | Archive examples use `--skip-hooks pre`; explicit do **not** `run-hooks … archiving --phase post`; still `hook-instruction … --phase post`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Design review scope        | **Implemented** | First scope: `pending-review` / `[drift]` under `artifacts (details):` / `review.affectedArtifacts`. Text `review:` is `required` / `route` / `reason` — not file paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Overlap split (prior M6)   | **Implemented** | Typical `(e.g. …)` on design/implement/verify/new: `ARTIFACT_DRIFT`, `REVIEW_REQUIRED` only — **no** `OVERLAP_CONFLICT`. Body copy: `OVERLAP_CONFLICT` is archive-only; `spec-overlap-conflict` → `/specd-design`, `not \`--allow-overlap\``. Archive typical list includes `OVERLAP_CONFLICT`; `--allow-overlap`only for live overlap;`spec-overlap-conflict`→`/specd-design`, do not use `--allow-overlap`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Hop skills still **mention** `OVERLAP_CONFLICT` in prose as archive-only. That is the required disambiguation, not a typical-blocker listing. Compliant with the new overlap requirement.

Pre-existing contracts (graph `--direction dependents`, `--snippet`, optimizer gates, command roles, metadata self-healing) remain in templates and in older `template-workflow.spec.ts` cases.

**ValidateArtifacts / baseline drift:** templates still do not mention `ValidateArtifacts` or “run validate to detect baseline drift.” `shared.md.tpl` defines `drifted-pending-review` as disk change after validation (status language). No finding that skills still expect ValidateArtifacts to own baseline drift.

### Discrepancies

**Prior M6 / D-SK-1 — MEDIUM — Overlap invalidation vs `OVERLAP_CONFLICT` in typical blocker lists — CLOSED**

- **Then (144106):** design/implement/verify/new listed `OVERLAP_CONFLICT` in the typical blockers parenthetical; skills spec was silent; risk of conflating invalidation (`spec-overlap-conflict`) with live archive overlap.
- **Now:** change spec requires the split; templates and `it('does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills')` match. Not reopened.

**D-SK-2 — INFO — ValidateArtifacts baseline drift not taught in templates (compliant)**

No template tells agents to use ValidateArtifacts for `validatedHash` / baseline drift. Aligned with `core:validate-artifacts` + `core:storage`. Not a defect.

**D-SK-3 — LOW (narrowed) — hop skills still name `OVERLAP_CONFLICT` in body copy**

Not a spec miss: the overlap requirement forbids listing it as a **typical** blocker, not mentioning it to say it is archive-only. Residual agent-confusion risk is low because the same sentences point invalidation at `/specd-design`. Prefer keeping the sentence; do not treat as reopen of M6.

**D-SK-4 — LOW vs `default:_global/testing` — template contract tests are not `given/when/then` named**

`template-workflow.spec.ts` uses imperative titles (`does not teach pending parking…`, `does not treat invalidation overlap…`). Global testing prefers `"given <state>, when <action>, then <outcome>"` for behaviour tests. Assertions themselves match verify scenarios (exact phrases / parenthetical contents). Spec-or-test: rename tests or treat workflow-template string contracts as exempt documentation tests. Unchanged from 144106.

**D-SK-5 — LOW — overlap typical-blocker assertion is first-`(e.g.` match**

The new test uses `template.match(/\(e\.g\.[\s\S]*?\)/)` (first parenthetical). Today the first `(e.g.` on each hop skill **is** the blockers list, so the assertion is true. If an earlier `(e.g.` is added, the test could pass while a later typical-blocker list regresses. Spec-wrong vs test-wrong: tighten the regex to the `blockers:` sentence if this becomes flaky.

No hexagonal violation **inside** `@specd/skills` for these requirements (templates are content; rendering remains install-time). No new LifecycleEngine class-vs-function issue in this batch.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts` (Vitest, `test/`, `.spec.ts`, no snapshots). File reads templates from disk (fixture files, not a core port) — acceptable for template contract tests.

| Verify scenario                                                                                                                  | Covered?                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Verify does not route to `pending-signoff`                                                                                       | Yes (`not.toMatch(/pending-signoff/)`, stay in `done`, `approve signoff`)                                                   |
| Implement does not hop implementing while spec gate blocks                                                                       | Yes                                                                                                                         |
| Shared stay-in-state not reaches-pending                                                                                         | Yes (`**stays** in \`ready\` or \`done\``; no `reaches \`pending-spec-approval\``)                                          |
| Shared hook list not pending intermediates                                                                                       | Yes (`Do **not**\nlist \`pending-spec-approval\``)                                                                          |
| New-skill drain-only pending rows                                                                                                | Yes (`Drain only:`; spec-gate copy on `ready`)                                                                              |
| Design stays in ready                                                                                                            | Yes                                                                                                                         |
| specd entry does not teach signoff                                                                                               | Yes (`not.toMatch(/signoff/)`, `pending-spec-approval`, `approve spec`)                                                     |
| Archive in-place gates                                                                                                           | Yes (`archivable`, `approve signoff`, no `pending-signoff`)                                                                 |
| Shared implementation commands + resolve vs ignore + no catch-all                                                                | Partial — `list`/`resolve`/`ignore`/`add` guidance asserted; **`implementation review` not asserted** (present in template) |
| Verify drains open files, no bounce to implement                                                                                 | Yes                                                                                                                         |
| Implement zero-open before verify                                                                                                | Yes                                                                                                                         |
| Archive `--skip-hooks pre` not `all`; no post run-hooks; hook-instruction post                                                   | Yes                                                                                                                         |
| Design does not treat `review:` as file list                                                                                     | Yes                                                                                                                         |
| Design/implement/verify/new do not list `OVERLAP_CONFLICT` as typical blocker; not `--allow-overlap` for `spec-overlap-conflict` | **Yes** — `does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills`                                           |
| Archive MAY list `OVERLAP_CONFLICT`; `--allow-overlap` live-only; invalidation not `--allow-overlap`                             | **Yes** — same `it()` archive branch                                                                                        |

Older tests still cover optimizer gates, command roles, metadata self-healing (skill spec: keyword-only insufficient — existing tests use exact command strings).

### Missing Tests

| Gap                                                                                             | Severity                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Shared cookbook `specd changes implementation review <name>` not in the implement/verify `it()` | LOW (template has the command; verify requires it) |
| Optional: templates omit ValidateArtifacts-as-drift-owner (vacuously true; still unasserted)    | INFO lock, not required                            |
| Overlap test regex is first `(e.g.` only (see D-SK-5)                                           | LOW robustness                                     |

The 144106 missing test “hop skills do not treat invalidation as `OVERLAP_CONFLICT`” is **no longer missing**.

### Counts (`skills:skill-templates-source`)

| Metric                                                                                    | Count                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Requirements (merged spec.md)                                                             | 19                                                           |
| New/tightened this change (gates, impl drain, archive hooks, review scope, overlap split) | 5                                                            |
| Implemented as specified                                                                  | 5/5 of those                                                 |
| Discrepancies HIGH                                                                        | **0**                                                        |
| Discrepancies MEDIUM                                                                      | **0** (prior M6 closed)                                      |
| Discrepancies LOW                                                                         | **3** (D-SK-3 mention-in-prose; D-SK-4 naming; D-SK-5 regex) |
| INFO                                                                                      | 1 (VA not taught — OK)                                       |
| Missing tests                                                                             | 1 LOW (`review` command) + optional VA absence lock          |

---

## Area B — Cross-check: change specs vs `default:_global/architecture`

### Requirements (global)

Hexagonal layers; domain pure; application uses ports only; rich entities own invariants; **stateless domain operations as plain functions, not classes**; YAML validated at infrastructure boundary; adapter packages contain no business logic; composition via `createX(deps)`.

### Implementation / change-spec alignment

`skills:skill-templates-source` is markdown templates + install-time rendering. It does not introduce a domain `LifecycleEngine` class. Hexagonal **class vs plain functions** notes about `LifecycleEngine` live in core change specs, not this spec. Per assignment: **INFO unless new**. This batch adds **no new** architecture contradiction.

Skills package: templates are content; `@specd/skills` remains a renderer. Adapter-package “no business logic” does not apply as a defect to skill markdown.

**D-ARCH-1 — INFO — Residual hexagonal tension on core load-time invalidate (not skills)**

Calling `change.invalidate` from the fs adapter is domain mutation at the infrastructure edge. Architecture prefers use cases for application policy; here the **port contract** owns load-time reconstitution. Unchanged; **not H2**; **not new**. Do not escalate from this skills batch.

### Counts (architecture)

| Metric                                            | Count |
| ------------------------------------------------- | ----- |
| Change-spec vs architecture contradictions (HIGH) | 0     |
| New hexagonal findings in skills templates        | 0     |
| INFO residual (core hydration; pre-existing)      | 1     |

---

## Area C — Cross-check: `default:_global/testing`

### Requirements

Vitest; `test/` mirror; `.spec.ts`; unit tests mock ports; typed full port mocks; integration temp dirs + cleanup; given/when/then names; no snapshots.

### Implementation

`packages/skills/test/template-workflow.spec.ts` meets runner, location, suffix, no-snapshot. Reads templates from disk — not a port mock. No `as unknown as Port` in this file. No `toMatchSnapshot` / `toMatchInlineSnapshot` under `packages/skills/test`.

### Discrepancies

**D-TEST-1 — LOW** — titles are not given/when/then (same as D-SK-4). Does not weaken scenario coverage, including the new overlap `it()`.

### Counts

| Metric        | Count                                                           |
| ------------- | --------------------------------------------------------------- |
| HIGH / MEDIUM | 0                                                               |
| LOW naming    | 1 (same unique as D-SK-4; do not double-count in unique totals) |

---

## Area D — Cross-check: `default:_global/conventions`

### Requirements

Strict TS, ESM, named exports, kebab-case, no `any`, explicit public return types, SpecdError, lazy list vs get, immutability preference.

### Implementation

Assigned artifacts: markdown templates + Vitest tests. `template-workflow.spec.ts`: named imports, kebab-case path, `"type": "module"` package. No default exports in `packages/skills` source grep for this audit. No new core `any` in assigned files.

### Discrepancies

None in assigned skill artifacts.

### Counts

0.

---

## Area E — Cross-check: `default:_global/spec-layout`

### Requirements

Paired `spec.md` / `verify.md`; no WHEN/THEN in spec.md; scenarios under matching `### Requirement:` in verify.md; Spec Dependencies with canonical IDs.

### Implementation

`skills:skill-templates-source` merged preview: spec.md has Purpose, Requirements, Constraints, Spec Dependencies; **no** Scenario headings. verify.md groups scenarios under the same `### Requirement:` names, including **In-place approval gates**, **Implementation tracking in verify and implement**, **Archive skill skips only pre hooks**, **Design skill review scope**, **Overlap invalidation vs live archive overlap**. Dependency labels are `workspace:path` with relative `href`s. `core:transition-checks` is listed for in-place gates.

### Discrepancies

None for this spec.

### Counts

0 layout defects for `skills:skill-templates-source`.

---

## Unique HIGH / MEDIUM / LOW

Do not double-count D-SK-4 and D-TEST-1.

| ID                | Severity | Status           | Summary                                                                                   |
| ----------------- | -------- | ---------------- | ----------------------------------------------------------------------------------------- |
| M6 / D-SK-1       | MEDIUM   | **CLOSED**       | Typical `OVERLAP_CONFLICT` on hop skills; spec now requires split; templates + test match |
| H2                | HIGH     | **not reopened** | ValidateArtifacts vs load-time drift — skills still do not teach VA as drift owner        |
| D-SK-3            | LOW      | open (residual)  | Body still names `OVERLAP_CONFLICT` as archive-only (compliant teaching)                  |
| D-SK-4 / D-TEST-1 | LOW      | open             | Test titles not given/when/then                                                           |
| D-SK-5            | LOW      | open             | First-`(e.g.` regex brittleness                                                           |
| D-SK-2            | INFO     | n/a              | VA-as-drift-owner absent from templates (good)                                            |
| D-ARCH-1          | INFO     | pre-existing     | LifecycleEngine / fs `invalidate` vs plain-function/hex notes — not new in skills         |

**Unique HIGH:** 0  
**Unique MEDIUM:** 0 (prior M6 closed)  
**Unique LOW:** 3  
**INFO:** 2 (VA OK; hexagonal residual not new)

---

## Batch summary

| Area                          | HIGH | MEDIUM        | LOW                       | INFO              | Missing tests                          |
| ----------------------------- | ---- | ------------- | ------------------------- | ----------------- | -------------------------------------- |
| skills:skill-templates-source | 0    | 0 (M6 closed) | 3                         | 1 (VA not taught) | 1 LOW (`implementation review` assert) |
| vs architecture               | 0    | 0             | 0                         | 1 (not new)       | —                                      |
| vs testing                    | 0    | 0             | 0 unique (same as D-SK-4) | 0                 | —                                      |
| vs conventions                | 0    | 0             | 0                         | 0                 | —                                      |
| vs spec-layout                | 0    | 0             | 0                         | 0                 | —                                      |

**In-place gates / impl tracking:** templates match stay-in-`ready`/`done` (no pending parking happy path); verify drains `IMPLEMENTATION_STATE` in-skill; implement gates `/specd-verify` on zero open tracked files. Tests in `does not teach pending parking as the happy-path wait` and `verify drains open implementation files; implement gates verify on zero open`.

**Prior M6:** CLOSED as specified (typical parenthetical, archive exception, hop-skill test name).
