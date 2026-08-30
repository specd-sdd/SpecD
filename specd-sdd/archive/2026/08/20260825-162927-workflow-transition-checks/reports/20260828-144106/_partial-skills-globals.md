# Partial audit: skills + project-wide globals

**Mode:** change `workflow-transition-checks` (spec-preview)  
**Assigned:** `skills:skill-templates-source`; cross-check vs `default:_global/architecture`, `default:_global/testing`, `default:_global/conventions`, `default:_global/spec-layout`  
**Read-only.** Graph: `stale: false` (indexed 2026-08-28). CLI: `node packages/cli/dist/index.js`.  
**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; `specs show` for the four globals; template files under `packages/skills/templates/`; `packages/skills/test/template-workflow.spec.ts`; change deltas for `core:storage`, `core:validate-artifacts`, `core:lifecycle-engine`, `cli:change-status`.

**Prior HIGH H2 (baseline drift on ValidateArtifacts vs FsChangeRepository.get):** **not re-opened as HIGH.** Change specs now place baseline `validatedHash` drift + `Change.invalidate('artifact-drift', SYSTEM_ACTOR)` on repository load (`core:storage`); `ValidateArtifacts` MUST NOT repeat that comparison. Code matches (`packages/core/src/infrastructure/fs/change-repository.ts` ~1564; port `ChangeRepository.get` documents auto-invalidate). See Architecture cross-check (INFO).

---

## Area A — `skills:skill-templates-source`

### Requirements

Merged `spec.md` has **18** requirements, **0** `#### Scenario:` headings (layout-compliant). Merged `verify.md` has the same **18** requirement headings and **48** scenarios.

**Unchanged (this change does not rewrite them; still in merged preview):**

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

**Added by this change (delta + matching verify scenarios):**

12. **In-place approval gates** — hop-owning skills + `shared.md.tpl` describe gates as stay-in-`ready`/`done` + human `approve`; MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff`; pending names are drain-only; `specd` entry skill is router-only (no signoff/approve copy); archive requires `archivable` and points signoff wait at `/specd-verify` in `done`.
13. **Implementation tracking in verify and implement** — cookbook in `shared.md.tpl`; verify drains `IMPLEMENTATION_STATE` / open files in-skill (no bounce to `/specd-implement`); implement requires zero open tracked files before recommending `/specd-verify`; prefer top-level `--symbol` links.
14. **Archive skill skips only pre hooks** — `changes archive --skip-hooks pre` (not `all`); no post `run-hooks archiving` after success; still fetch post `hook-instruction`.
15. **Design review scope without review file lists** — MAY key off `review: required: yes`; MUST NOT say files are listed under the text `review:` header; first scope is `artifacts (details):` / `affectedArtifacts`.

**Spec Dependencies (merged):** `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending drain-only). Canonical spec-ID labels with relative links — conforms to `default:_global/spec-layout`.

### Implementation

Templates under `packages/skills/templates/` implement the four new requirements:

| Requirement         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place gates      | `shared.md.tpl` ~374–387: never run `changes approve`; stay in `ready`/`done`; pending as drain only. Hook list ~502–506: do not list pending as happy-path intermediates; no `source.post` on `along` backward. `specd-design` ~390–398: stay in `ready`, `approve spec`. `specd-implement` ~42–45: do not `transition implementing` when spec gate unsatisfied. `specd-verify` ~290–293: stay in `done`, `approve signoff`; no `pending-signoff`. `specd-new` table: pending rows labeled **Drain only**. `specd/SKILL.md.tpl`: router; no signoff / `approve spec` / pending. `specd-archive`: must already be `archivable`; signoff wait is `/specd-verify` in `done`. |
| Impl tracking       | `shared.md.tpl` documents `list`/`review`/`add`/`resolve`/`ignore`, resolve vs ignore. Verify drains tracking, points at `shared.md`. Implement: zero open before `/specd-verify`; top-level symbol guidance.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Archive pre-only    | Examples use `--skip-hooks pre`; explicit “Do **not** call `run-hooks … archiving --phase post`”; still `hook-instruction … --phase post`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Design review scope | `specd-design` ~48–50: `pending-review` / `[drift]` under `artifacts (details):`; “Text `review:` only has `required` / `route` / `reason` — not file paths.” Matches `cli:change-status` text contract (header without file lists).                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Pre-existing template contracts (graph `--direction dependents`, `--snippet`, optimizer gates, command roles) remain in templates and in `template-workflow.spec.ts` (older tests).

**Overlap / ValidateArtifacts (explicit audit questions):**

- Templates **do not** mention `ValidateArtifacts`, `validatedHash`, or “run validate to detect baseline drift.” `shared.md.tpl` defines `drifted-pending-review` as disk change after validation — status language, not a use-case owner. **No finding** that skills still expect ValidateArtifacts to own baseline drift.
- Templates **do** list `OVERLAP_CONFLICT` as a typical **blockers:** example (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`, `specd-new`) alongside `ARTIFACT_DRIFT` and `REVIEW_REQUIRED`. They **do not** state that `review.reason === 'spec-overlap-conflict'` (overlap _invalidation_ / victim of another archive) is **not** `OVERLAP_CONFLICT`, nor that that path is `/specd-design` and MUST NOT use `--allow-overlap`. Live archive overlap is correctly handled in `specd-archive` via `SpecOverlapError` + `--allow-overlap`. See Discrepancy D-SK-1.

`ChangeRepository.get` (application port) documents load-time auto-invalidate; `FsChangeRepository` implements it. Skills never instruct agents to call validate for that.

### Discrepancies

**D-SK-1 — MEDIUM — Overlap invalidation vs `OVERLAP_CONFLICT` in skill copy**

- **Change specs (`core:lifecycle-engine`, `cli:change-status`):** live `OVERLAP_CONFLICT` is archive `spec.overlap` when `state === 'archivable'`. Historical/invalidation overlap (`review.reason: spec-overlap-conflict`) MUST NOT emit `OVERLAP_CONFLICT`; next action is `/specd-design`, not `--allow-overlap`.
- **`skills:skill-templates-source`:** does not add a requirement to teach that split. Templates still offer `OVERLAP_CONFLICT` as a generic high-visibility blocker example in **design / implement / verify / new**, where live archive overlap is not the happy path.
- **Interpretation 1 (code + LE/status specs truth):** templates should name `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` / `APPROVAL_REQUIRED` / `IMPLEMENTATION_STATE` for those skills, and reserve `OVERLAP_CONFLICT` (+ `--allow-overlap`) for archive; add one sentence that overlap _invalidation_ is review, not that code.
- **Interpretation 2 (skills spec is silent, examples are harmless):** agents follow `next action:` / `review: required: yes` anyway (design already routes review to `/specd-design`). Residual risk is an agent treating a victim overlap as skippable `OVERLAP_CONFLICT`.
- **Neither side is “the” truth:** skills spec does not contradict LE; templates can still _imply_ the old conflation.

**D-SK-2 — INFO — ValidateArtifacts baseline drift not taught in templates (compliant)**

No template tells agents to use ValidateArtifacts for `validatedHash` / baseline drift. Aligned with `core:validate-artifacts` + `core:storage`. Do not treat as a defect.

**D-SK-3 — LOW — `specd-new` still pairs `OVERLAP_CONFLICT` with early routing**

`specd-new` uses TOON `review.required` (good) but the same example blocker list. Same as D-SK-1, narrower surface.

**D-SK-4 — LOW vs `default:_global/testing` — template contract tests are not `given/when/then` named**

`packages/skills/test/template-workflow.spec.ts` uses imperative titles (`does not teach pending parking…`). Global testing prefers `"given <state>, when <action>, then <outcome>"` for behaviour tests. Assertions themselves match verify scenarios (exact phrases). Spec-or-test: either rename tests or treat workflow-template string contracts as exempt documentation tests.

No hexagonal violation **inside** `@specd/skills` for these requirements (templates are content; rendering remains install-time).

### Tests

`packages/skills/test/template-workflow.spec.ts` (Vitest, `test/` mirroring, `.spec.ts`, no snapshots):

| Verify scenario (new)                                                          | Covered?                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Verify does not route to `pending-signoff`                                     | Yes (`not.toMatch(/pending-signoff/)`, stay in `done`, `approve signoff`) |
| Implement does not hop implementing while spec gate blocks                     | Yes                                                                       |
| Shared stay-in-state not reaches-pending                                       | Yes                                                                       |
| Shared hook list not pending intermediates                                     | Yes (`Do **not**\nlist pending-spec-approval`)                            |
| New-skill drain-only pending rows                                              | Yes (`Drain only:`)                                                       |
| Design stays in ready                                                          | Yes                                                                       |
| specd entry does not teach signoff                                             | Yes                                                                       |
| Archive in-place gates                                                         | Yes (`archivable`, `approve signoff`, no `pending-signoff`)               |
| Shared implementation commands + resolve vs ignore + no catch-all              | Yes                                                                       |
| Verify drains open files, no bounce to implement                               | Yes                                                                       |
| Implement zero-open before verify                                              | Yes                                                                       |
| Archive `--skip-hooks pre` not `all`; no post run-hooks; hook-instruction post | Yes                                                                       |
| Design does not treat `review:` as file list                                   | Yes                                                                       |

**Missing tests**

- No assertion that hop-owning templates do **not** treat overlap invalidation as `OVERLAP_CONFLICT` / `--allow-overlap` (would lock D-SK-1).
- No assertion that templates omit ValidateArtifacts-as-drift-owner (would lock D-SK-2; currently vacuously true).

Older tests still cover optimizer gates, command roles, metadata self-healing (skill spec: keyword-only insufficient for those — existing tests use exact command strings).

### Counts (`skills:skill-templates-source`)

| Metric                                               | Count                                        |
| ---------------------------------------------------- | -------------------------------------------- |
| Requirements (merged spec.md)                        | 18                                           |
| Verify scenarios                                     | 48                                           |
| New requirements this change                         | 4                                            |
| New verify scenarios this change                     | 13                                           |
| Implemented as specified (new + overlap/VA specials) | 4 new reqs implemented; D-SK-1 open          |
| Discrepancies                                        | 1 MEDIUM, 2 LOW, 1 INFO                      |
| Missing tests                                        | 2 (overlap-split; optional VA-owner absence) |

---

## Area B — Cross-check: change specs vs `default:_global/architecture`

### Requirements (global)

Hexagonal layers; domain pure; application uses ports only; rich entities own invariants; YAML validated at infrastructure boundary; adapter **packages** (CLI/MCP/plugins) contain no business logic; composition via `createX(deps)`.

### Implementation / change-spec alignment (baseline drift)

- **`core:storage` (change):** when artifact types are resolved, load MUST detect baseline drift vs `validatedHash` and `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat. Load-time actor is `SYSTEM_ACTOR`, not `ActorResolver`. Entity still applies invalidation policy (`none`, etc.).
- **`core:validate-artifacts` (change):** execute loads via `ChangeRepository.get` first; MUST NOT compare disk to `validatedHash` for baseline drift / `hasDrift` / invalidate. Consent-hash drift stays on the use case.
- **Code:** `FsChangeRepository` ~1564; port JSDoc on `get()` states filesystem-backed auto-invalidate. `ValidateArtifacts` still computes `validatedHash` for `markComplete` only.

This is **hydration on the repository port**, not CLI/MCP business logic. Architecture does **not** forbid a port documenting load-time reconstitution. Previous “policy in fs adapter vs use case” HIGH is **closed by spec alignment** (CODE WINS as instructed).

### Discrepancies

**D-ARCH-1 — INFO — Residual hexagonal tension, not a change-spec contradiction**

Calling `change.invalidate` from the fs adapter is domain mutation at the infrastructure edge. Architecture prefers use cases for application policy. Here the **port contract** owns the policy; fs is the implementation; the entity owns invariants. Change specs **cite** `default:_global/architecture` and still assign this to load. Do **not** escalate to HIGH unless a change spec still says ValidateArtifacts owns baseline `validatedHash` drift — **none does**.

No finding that `skills:skill-templates-source` violates hexagonal rules.

### Tests

Storage/validate-artifacts tests are out of this batch except: skills tests do not (and need not) cover fs `get()` invalidation.

### Counts (architecture cross-check)

| Metric                                            | Count |
| ------------------------------------------------- | ----- |
| Change-spec vs architecture contradictions (HIGH) | 0     |
| INFO residual layering notes                      | 1     |
| Skills-package hexagonal defects                  | 0     |

---

## Area C — Cross-check: `default:_global/testing`

### Requirements

Vitest; `test/` mirror; `.spec.ts`; unit tests mock ports; typed full port mocks; integration tests use temp dirs + cleanup; given/when/then names; no snapshots.

### Implementation

`packages/skills/test/template-workflow.spec.ts` meets runner, location, suffix, no-snapshot. Reads templates from disk (fixture files, not a core port) — acceptable for template contract tests. No `as unknown as Port` in this file.

### Discrepancies

**D-TEST-1 — LOW** — titles are not given/when/then (see D-SK-4). Does not weaken the new scenario coverage.

### Tests

N/A (this area is the test convention itself).

### Counts

| Metric                 | Count |
| ---------------------- | ----- |
| Violations HIGH/MEDIUM | 0     |
| LOW naming             | 1     |

---

## Area D — Cross-check: `default:_global/conventions`

### Requirements

Strict TS, ESM, named exports, kebab-case, no `any`, explicit public return types, SpecdError, lazy list vs get, immutability preference.

### Implementation

This batch’s skill **deltas** are markdown templates + Vitest tests. `template-workflow.spec.ts` uses named imports, kebab-case path, ESM. No new core `any` / default export in assigned files.

### Discrepancies

None in assigned skill artifacts.

### Tests / Counts

0 discrepancies.

---

## Area E — Cross-check: `default:_global/spec-layout`

### Requirements

Paired `spec.md` / `verify.md`; no WHEN/THEN in spec.md; scenarios under matching `### Requirement:` in verify.md; Spec Dependencies with canonical IDs.

### Implementation

`skills:skill-templates-source` merged preview: spec.md has Purpose, Requirements, Spec Dependencies; **no** Scenario headings; verify.md groups all 48 scenarios under the same 18 requirement names, including the four added blocks. Deltas use AST `parent` + `### Requirement:` selectors. Dependency labels are `workspace:path` with relative `href`s.

### Discrepancies

None for this spec. (Other change specs in the same change are out of scope except as cited for overlap/drift.)

### Tests / Counts

0 layout defects for `skills:skill-templates-source`.

---

## Batch summary

| Area                          | HIGH | MEDIUM                               | LOW | INFO                              | Missing tests |
| ----------------------------- | ---- | ------------------------------------ | --- | --------------------------------- | ------------- |
| skills:skill-templates-source | 0    | 1 (D-SK-1 OVERLAP_CONFLICT examples) | 2   | 1 (VA not taught — OK)            | 2             |
| vs architecture               | 0    | 0                                    | 0   | 1 (hydration vs use case; not H2) | —             |
| vs testing                    | 0    | 0                                    | 1   | 0                                 | —             |
| vs conventions                | 0    | 0                                    | 0   | 0                                 | —             |
| vs spec-layout                | 0    | 0                                    | 0   | 0                                 | —             |

**Do not re-open H2.** Change specs + port + `FsChangeRepository.get` agree; ValidateArtifacts does not own baseline drift; skills do not tell agents otherwise.

**Do flag:** workflow templates still **exemplify** `OVERLAP_CONFLICT` on design/implement/verify/new, which can teach agents to treat **overlap invalidation** like live archive overlap. They do **not** tell agents to use ValidateArtifacts for baseline drift.
