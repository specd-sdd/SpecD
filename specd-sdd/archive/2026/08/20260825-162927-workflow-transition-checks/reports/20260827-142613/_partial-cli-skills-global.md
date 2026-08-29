# Partial: CLI + skills + global (recorte leftover)

**Mode:** change `workflow-transition-checks`  
**Batch:** `cli:change-status` (leftover vs recorte: skills + `review: required: yes`), `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`, `default:_global/architecture`, `default:_global/conventions`  
**Preview:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <id> --format toon`  
**Globals:** `specd specs show` (not in change specIds)  
**Code:** 2026-08-27 worktree; graph search used (`review.required`); no production edits.

## Severity counts

| Severity | Count |
| -------- | ----: |
| critical |     0 |
| high     |     0 |
| medium   |     1 |
| low      |     3 |
| info     |     2 |

**Headline recorte flags**

- Skills templates **do not** still expect an **omitted** `review:` header. They look for `review: required: yes`, which **matches** restored text status (`status.ts` ~247–252).
- **Product `docs/`** do not contradict the restored header (no hits).
- **Stale change artifacts** still describe the _previous_ omit-header recorte: `tasks.md` 13.3 / 14.1 / 14.3, and prior compliance reports under `reports/20260827-104343/` (and earlier). Task **23.1** is the restored-header source of truth.
- `specd-design` still treats **files listed under `review:`** as the review scope — that expects the **omitted file-list** behaviour, not an omitted header.

---

## Requirements Summary

### `cli:change-status` (merged leftover vs recorte)

| ID      | Requirement                                                                                                                                   | Recorte-relevant?         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| CS-1    | Command signature                                                                                                                             | no                        |
| CS-2    | Drafted status read-only                                                                                                                      | no                        |
| CS-3    | JSON/TOON `hasTasks` + display-state `artifactDag.state`                                                                                      | no                        |
| CS-4    | DAG `[hasTasks - N/M done]`                                                                                                                   | no                        |
| CS-5    | Display-state rendering                                                                                                                       | no                        |
| CS-6    | Lifecycle projections from GetStatus checks; no local `VALID_TRANSITIONS` filter                                                              | yes                       |
| CS-7    | Text `review:` header (`required` / `route` / `reason`); **no** `affectedArtifacts` paths; overlap peers still print; JSON/TOON full `review` | **yes — restored header** |
| CS-8    | Text blockers `! CODE — label: message`                                                                                                       | yes                       |
| CS-9–16 | Schema warning, not found, DAG fields, refresh, implementation, details tasks, basic info, specDependsOn                                      | leftover                  |

**Verify leftover:** base scenario “shows review section … **affected absolute file paths**” is **gone** in merged `verify.md`. Replaced by “does not reprint files under `review:`” + overlap peers **with** header.

### `cli:change-transition` (merged)

Command signature; `--next` map including `signed-off → archivable`; no CLI pending rewrite; GetStatus refresh `false`; check-progress bus (no `hook-progress` stream); Repair Guide **stderr** with gerund labels; `HookFailedError` exit 2 no guide; incomplete tasks; unsatisfied requires; no `Executing:`.

### `cli:change-approve` (merged)

Signatures; no gate flags / hashes; **in-place** spec from `ready` / drain `pending-spec-approval`; signoff from `done` / drain `pending-signoff`; stay in `ready`/`done`; help uses bound-`from`; success `approved <gate> for <name>`; errors.

### `cli:change-archive` (merged)

Signature + alias; `archivable` prerequisite; `ArchiveChange` delegate; `--skip-hooks` phases; **check progress** gerund / no `Executing:`; hooks on same bus; post-hook exit 2; text archive path + overlap invalidation; JSON/TOON **stream** `change-archive` terminal `complete` (no second unwrapped object).

### `skills:skill-templates-source` (merged)

Unchanged template/source/frontmatter/graph/optimizer/command-role reqs **plus**:

- In-place approval gates (no happy-path pending hops)
- Implementation tracking in verify/implement + shared cookbook
- Archive `--skip-hooks pre` not `all`

**Not in this spec:** text `review:` header contract. Skills that parse `review: required: yes` are leftover vs recorte, not a delta requirement.

### `default:_global/architecture` + `conventions` (canonical)

Hexagonal layers; composition-only infra imports; `createX(deps)` + config form via resolver; adapters have no domain logic; manual DI; kebab-case; named exports; no `any`; explicit public return types; `SpecdError`.

**Recorte consistency:** `ArchiveChange` ctor takes `archiveBindings` (not `RunStepHooks`); CLI only **renders** check events / GetStatus fields.

---

## Implementation Status

| Surface                            | Status                                                                                                    | Evidence                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text `review:` header              | **Compliant with CS-7**                                                                                   | `packages/cli/src/commands/change/status.ts` 247–252: `review:` + `required: yes/no` + `route` + `reason`. No `affectedArtifacts` paths.                                                                                                                                                               |
| Overlap peers                      | **Compliant**                                                                                             | Same file 325–336: `overlap:` when `reason === 'spec-overlap-conflict'`. Tests: `change-status.spec.ts` 678–684, `change/change-status.spec.ts` 443–446.                                                                                                                                               |
| JSON/TOON `review`                 | **Compliant**                                                                                             | `status.ts` 445–458 includes `overlapDetail` + `affectedArtifacts`. Commander help schema 116–124 **omits** `overlapDetail` (docs drift, low).                                                                                                                                                         |
| Blocker labels                     | **Compliant**                                                                                             | `status.ts` 237–241; transition Repair Guide `transition.ts` 88–95.                                                                                                                                                                                                                                    |
| Check presenter                    | **Compliant**                                                                                             | `_check-progress-presenter.ts` 95–107: `<label> (<id>)` then `✓`/`✗`; no `Executing:`. Shared by `transition.ts` / `archive.ts`. Tests assert `not.toContain('Executing:')`.                                                                                                                           |
| `--next` / no pending rewrite      | **Compliant**                                                                                             | `transition.ts` 160–176 includes `signed-off → archivable`; 177–185 drain errors. Tests: `change-transition.spec.ts` no pending rewrite.                                                                                                                                                               |
| Approve help + execute             | **Compliant**                                                                                             | `approve.ts` 21–23, 59–60 bound-`from` language; `{ name, reason }` only. Tests: `change-approve.spec.ts` ready / drain.                                                                                                                                                                               |
| Archive stream + DI                | **Compliant**                                                                                             | CLI `archive.ts` uses presenter stream `change-archive`. `createArchiveChange(deps)` injects `archiveBindings` (`composition/use-cases/archive-change.ts` 150–200). `ArchiveChange` ctor 218–243. Composition imports `FsArchiveBatchSnapshot` / `FsSpecRepository` — **allowed** (composition layer). |
| Skills `review: required: yes`     | **Aligned with restored header**                                                                          | `specd`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive` templates. `specd-new` uses structured `review.required` (JSON).                                                                                                                                                           |
| Skills file-list under `review:`   | **Gap**                                                                                                   | `specd-design/SKILL.md.tpl` 50, 178.                                                                                                                                                                                                                                                                   |
| In-place approval / skip-hooks pre | **Not re-audited line-by-line**; prior batch + templates grep show archive/verify/implement copy present. |

---

## Discrepancies

### D1 — medium — `skills:skill-templates-source` leftover vs CS-7 (file lists, not header)

**Spec (CS-7):** print `review:` with `required` / `route` / `reason`; **MUST NOT** print `review.affectedArtifacts` paths; files live under `artifacts (details):`.

**Code:** matches CS-7.

**Template:** `packages/skills/templates/skills/specd-design/SKILL.md.tpl`:

- L50: “Treat the artifacts listed under `review:` as the first review scope”
- L178: “use the reason and **affected artifacts**” after `review: required: yes`

Those lines still assume a **file dump under `review:`** (the duplication recorte removed). Header string `review: required: yes` is **correct**.

**Possibilities:** template stale (likely); spec should tell agents to use `artifacts (details):` + `reason` / JSON `affectedArtifacts`.

### D2 — low — `cli:change-status` examples vs Basic info

Merged `spec.md` Examples still show a `specs:` line. Requirement “Basic info … SHALL NOT include a standalone `specs:` list”. Pre-existing leftover, not recorte.

### D3 — low — Commander JSON schema omits `overlapDetail`

`status.ts` help `review:` block lists `affectedArtifacts` but not `overlapDetail`. Runtime JSON emits `overlapDetail`. Spec: JSON/TOON MUST serialize full `review`. Help-only drift.

### D4 — low — `tasks.md` 13.x / 14.x contradict task 23.1

Completed tasks 13.3 / 14.1 / 14.3 say skip `review:` header / “no legacy `review:` header”. Task **23.1** restores the header. Living task log disagrees with itself; 23.1 + merged spec win.

### D5 — info — Prior compliance reports contradict restored header

`reports/20260827-104343/_partial-cli-skills.md` (and compiled report) D1: “Text status omits `review:`; skills still branch on `review: required: yes`.” That finding is **obsolete**. Skills+header are now aligned. Do not copy D1 forward.

### D6 — info — Skills do **not** expect omitted header

All workflow skills that key off text status still look for `review: required: yes`. That is **not** an omitted-header expectation. **Do not** flag as template-vs-omit-header.

No architecture/conventions contradiction found for ArchiveChange DI or CLI text rendering (presenter is adapter-only; bindings injected at composition).

---

## Test Coverage

| Requirement                            | Tests                                                                                   | Adequate?                      |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| CS-7 header + no paths                 | `change/change-status.spec.ts` artifact-review / drift; `change-status.spec.ts` overlap | yes                            |
| CS-8 labels                            | implied via status/transition tests                                                     | yes (spot)                     |
| CS-6 no local verifying                | change-status / transition tests                                                        | yes                            |
| Transition check bus / no Executing    | `change-transition.spec.ts`                                                             | yes                            |
| Repair guide stderr                    | transition tests (per merged verify)                                                    | yes                            |
| Approve ready / drain                  | `change-approve.spec.ts`, `change/change-approve.spec.ts`                               | yes                            |
| Archive gerund / stream                | `change-archive.spec.ts`                                                                | yes                            |
| Skills `review: required: yes`         | **no** template contract asserting header vs details                                    | gap vs D1                      |
| Skills in-place gates / skip-hooks pre | `skill-templates-source` verify scenarios; tests if present in skills package           | assumed from delta; not re-run |

---

## Missing Tests

- Template contract: `specd-design` MUST NOT say artifacts are **listed under `review:`**; MAY key on `review: required: yes` + `reason` + details/JSON.
- Optional: Commander help `review` schema includes `overlapDetail`.
- Optional: text example in `cli:change-status` spec.md drops `specs:`.

---

## Spec Dependency Chain

- `cli:change-status` → `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`
- `cli:change-transition` → entrypoint, change, `core:transition-change`, hook-execution-model, get-status, transition-checks
- `cli:change-approve` → entrypoint, change, transition-checks
- `cli:change-archive` → entrypoint, change, `core:archive-change`, hook-execution-model, command-resource-naming, transition-checks
- `skills:skill-templates-source` → skill, spec-optimizations, workflow-automation, transition-checks
- Architecture / conventions: no deps; constrain ArchiveChange composition + CLI adapter rendering

**Consistency:** merged CLI/skills deltas agree on in-place gates and check bus. CS-7 restored header **agrees** with skills’ `review: required: yes` probe. Only design-skill **file listing under `review:`** disagrees. Architecture: `createArchiveChange` deps path + `archiveBindings` matches “manual DI / composition wiring”; CLI does not construct `ArchiveChange`.

---

## Per-spec summary counts

| Spec                                 |                    Reqs checked |                    Compliant | Discrepancy |                                                                Spec-only leftover |        Missing tests |
| ------------------------------------ | ------------------------------: | ---------------------------: | ----------: | --------------------------------------------------------------------------------: | -------------------: |
| cli:change-status (recorte leftover) |                              16 |                           14 |  2 (D2, D3) |                                                    examples `specs:`; help schema |           1 optional |
| cli:change-transition                |                             ~15 |                          ~15 |           0 |                                                                                 — |                    — |
| cli:change-approve                   |                               8 |                            8 |           0 |                                                                                 — |                    — |
| cli:change-archive                   |                             ~10 |                          ~10 |           0 |                                                                                 — |                    — |
| skills:skill-templates-source        | recorte + leftover review probe | in-place/skip-pre assumed OK |      1 (D1) |                                                          header probe **aligned** | 1 (design file-list) |
| default:\_global/architecture        |                      recorte DI |                            1 |           0 |                                                                                 — |                    — |
| default:\_global/conventions         |             CLI kebab presenter |                            1 |           0 | `_check-progress-presenter.ts` underscore prefix is package-private, pre-existing |                    — |

**Batch totals:** critical 0, high 0, medium 1 (D1), low 3 (D2–D4), info 2 (D5–D6).
