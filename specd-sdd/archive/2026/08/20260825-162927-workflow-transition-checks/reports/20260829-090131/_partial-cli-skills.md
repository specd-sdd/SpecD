# Spec compliance partial: CLI + skills (change `workflow-transition-checks`)

**Mode:** change  
**Assigned specs:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Source:** `specd changes spec-preview workflow-transition-checks <specId>`  
**Graph:** reindexed `stale: false` (caller). Navigation via `specd graph search` / `graph impact --file cli:src/commands/change/status.ts`.  
**Read-only.** Neither spec nor code is truth.

**Prior 013719 HIGH #3** (CLI archive archivable-only vs Core allowing `archiving`): **CLOSED** (see `cli:change-archive`).  
**Prior LOW** (drafted JSON `availableSteps` passthrough): **CLOSED** (see `cli:change-status`).

---

## Requirements Summary

### `cli:change-status`

| ID  | Requirement                                                                                                                                                                                                    | Binding points                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| S1  | Command signature `status <name> [--format text\|json\|toon]`                                                                                                                                                  | preview spec.md Command signature                                        |
| S2  | Drafted status is read-only: no mutating transitions; drafted marker; MAY show artifacts                                                                                                                       | Drafted change status is read-only                                       |
| S3  | JSON/toon `artifactDag[].hasTasks`; top-level DAG `state` is display projection                                                                                                                                | Output format                                                            |
| S4  | DAG `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                                                                                                           | Task completion display in DAG                                           |
| S5  | Display-state rendering (complete-with-drift, missing, review states)                                                                                                                                          | Display-state rendering                                                  |
| S6  | Lifecycle projections from GetStatus; no local protocol graph that execute would reject                                                                                                                        | Lifecycle projections come from GetStatus checks                         |
| S7  | Text omits duplicated review file lists; overlap peers still print; JSON keeps full `review`                                                                                                                   | Text status omits duplicated review file lists                           |
| S8  | Text blockers include gerund `label` as `! CODE — label: message`                                                                                                                                              | Text blockers include check labels                                       |
| S9  | Schema version warning from `lifecycle.schemaInfo` only                                                                                                                                                        | Schema version warning                                                   |
| S10 | Change not found → exit 1 `error:`                                                                                                                                                                             | Change not found                                                         |
| S11 | Schema-derived DAG from `schema.artifactDag()`                                                                                                                                                                 | Schema-derived fields                                                    |
| S12 | Invoke GetStatus only; no RefreshImplementationTracking / ImplementationDetector                                                                                                                               | Delegates refresh policy                                                 |
| S13 | `--implementation` uses SDK projection                                                                                                                                                                         | Implementation section                                                   |
| S14 | Details `tasks: N/M`                                                                                                                                                                                           | Task completion in details                                               |
| S15 | Basic info: name/state; no standalone `specs:`                                                                                                                                                                 | Basic info section                                                       |
| S16 | Specs and dependencies + JSON `specDependsOn`                                                                                                                                                                  | Specs and dependencies                                                   |
| S17 | **Constraints:** drafted suppress `nextAction.command`; drafted JSON **MUST** `availableTransitions: []` **AND** `availableSteps: []` even if Core leaked hops; **MUST NOT** second `VALID_TRANSITIONS` filter | Constraints + verify “Drafted JSON empties hops even if Core leaks them” |

### `cli:change-transition`

| ID  | Requirement                                                                                                                  | Binding points                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| T1  | Signature; `--next` mutually exclusive with `<step>`                                                                         | Command signature                                                 |
| T2  | `--next` → `TransitionChange.execute` with `to: 'next'`; no CLI from→to table; no `GetStatus.nextAction` as resolver         | Next-transition resolution                                        |
| T3  | No direct refresh; pre/repair GetStatus `refreshImplementationTracking: false`                                               | Delegates refresh policy                                          |
| T4  | No approval flags; no rewrite to pending parking                                                                             | Approval-gate routing                                             |
| T5  | `--skip-hooks` → `skipHookPhases`; `--allow-out-of-scope` only when set                                                      | Hook execution + signature                                        |
| T6  | Generic check bus; gerund labels; no `Executing:`; hooks on same bus; JSON `stream: "change-transition"` not `hook-progress` | Progress output / Check progress rendering / Shared hook progress |
| T7  | Success text confirmation; JSON terminal `complete`                                                                          | Output on success                                                 |
| T8  | Hook fail → exit 2; no Repair Guide                                                                                          | Post-hook failure / HookFailedError scenario                      |
| T9  | Invalid transition → Repair Guide on stderr with labels; JSON failure complete record                                        | Invalid transition error                                          |
| T10 | Incomplete tasks → exit 1                                                                                                    | Incomplete tasks error                                            |
| T11 | Unsatisfied requires → exit 1                                                                                                | Unsatisfied requires error                                        |

### `cli:change-approve`

| ID  | Requirement                                                                           | Binding points                 |
| --- | ------------------------------------------------------------------------------------- | ------------------------------ |
| A1  | `approve spec\|signoff <name> --reason`                                               | Command signatures             |
| A2  | Kernel only: `kernel.changes.approveSpec/Signoff`; no gate flags; no `kernel.specs.*` | Delegates gate state to kernel |
| A3  | CLI MUST NOT compute hashes                                                           | Artifact hash computation      |
| A4  | Stay in `ready`/`done`; help bound-`from`; drain pending still valid                  | Approve spec/signoff behaviour |
| A5  | Text `approved <gate> for <name>`; JSON `{result,gate,name}`                          | Output on success              |
| A6  | Missing `--reason`, wrong state, not found → exit 1                                   | Error cases                    |

### `cli:change-archive`

| ID  | Requirement                                                                                                                                            | Binding points                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| R1  | `changes archive` + singular alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope`                                           | Command signature                  |
| R2  | Prerequisites: state `archivable` **or** `archiving`; CLI delegates to `ArchiveChange` (`assertArchivable`); **MUST NOT** second, narrower state table | Prerequisites (**013719 HIGH #3**) |
| R3  | Delegate merge/move/history                                                                                                                            | Behaviour                          |
| R4  | Map skip-hooks to `ArchiveChangeInput`                                                                                                                 | Hook execution                     |
| R5  | Check progress gerund bus; no `Executing:`; hooks on same bus                                                                                          | Check progress rendering           |
| R6  | Post-hook failures → exit 2                                                                                                                            | Post-archive hooks                 |
| R7  | Text path + invalidated section; JSON NDJSON `stream: "change-archive"` complete only                                                                  | Output / JSON output on success    |
| R8  | Not found / wrong state / merge fail → exit 1                                                                                                          | Error cases                        |
| R9  | Constraints: only `archivable` or `archiving`                                                                                                          | Constraints                        |

### `skills:skill-templates-source` (change-relevant slice)

| ID  | Requirement                                                                                                                                                                                                                                                  | Binding points                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| K1  | Template tree, `.md.tpl`, `skill.meta.json`                                                                                                                                                                                                                  | Template source / migration / metadata                                         |
| K2  | Graph impact dependents/dependencies; `--file` not `--changes`; snippet opt-in                                                                                                                                                                               | Graph impact / Graph search                                                    |
| K3  | In-place gates; no happy-path pending hops; specd is router; archive `archivable` **or** `archiving`; signoff wait = `/specd-verify` in `done`                                                                                                               | In-place approval gates                                                        |
| K4  | Overlap: hop skills MUST NOT typical `OVERLAP_CONFLICT`; invalidation → `/specd-design`; archive MAY list live overlap + `--allow-overlap`                                                                                                                   | Overlap invalidation vs live archive                                           |
| K5  | `specd-new` `targetStep` table: pending drain-only; `ready`/`done` unsatisfied gate → approve; **done/signed-off → `/specd-archive` when hop is `archivable` else `/specd-verify`** (template; spec.md names ready/done gates, not the archive hop sentence) | specd-new routing                                                              |
| K6  | `specd` / hop skills follow **nextAction.command** (entry: “Trust the CLI's dynamic routing”)                                                                                                                                                                | specd SKILL.md.tpl; design/new “Follow next action command”                    |
| K7  | No `LifecycleEngine` constructor language                                                                                                                                                                                                                    | User focus + core:transition-checks dependency (templates must not teach ctor) |
| K8  | Archive `--skip-hooks pre` not `all`; no post `run-hooks`                                                                                                                                                                                                    | Archive skill skips only pre hooks                                             |
| K9  | Design review scope: details/`affectedArtifacts`, not text `review:` file list                                                                                                                                                                               | Design skill review scope                                                      |
| K10 | Impl tracking ownership (shared / verify / implement)                                                                                                                                                                                                        | Implementation tracking in verify and implement                                |
| K11 | Optimizer gating, metadata self-healing, command roles                                                                                                                                                                                                       | Remaining template requirements                                                |

---

## Implementation Status

### `cli:change-status` — **implemented** (focus items closed)

- Drafted branch: `packages/cli/src/commands/change/status.ts:138-184`. Text marks `(drafted)`, `transitions:  (none — change is drafted)`, `command: (none)` (`141`, `156-163`). JSON **forces** `availableTransitions: []`, `availableSteps: []` (`175-176`) and `nextAction.command: null` (`141`) **after** spreading Core nextAction — even if Core leaked hops.
- Active JSON copies GetStatus hops under `lifecycle` (`472-481`) with no `VALID_TRANSITIONS` import or filter. Graph: `VALID_TRANSITIONS` lives in `core:src/domain/value-objects/change-state.ts:30`, not CLI status. CLI `transition.ts:36-50` `CHANGE_STATES` is **argument validation only** (comment: “not availability”).
- Text blockers: `247-250` emit `! ${code} — ${label}: ${message}` when `label` is set.
- GetStatus-only: `134-136`; tests assert no `refreshImplementationTracking` (`status.spec.ts:165-166`).
- Overlap: filter `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'` (`237-241`); overlap peers `337-348`.

### `cli:change-transition` — **implemented**

- `--next` maps to Core `to: 'next'`: `255-256`, `261-267`. Tests: `transition.spec.ts:64-88`, `207-248` (`to: 'next'`), `646-720` (HappyPathNextUnavailableError still calls execute with `to: 'next'`).
- Progress: `_check-progress-presenter.ts:94-108` (`label (id)`, `✓`/`✗`, no `Executing:`). Transition wires `streamName: 'change-transition'` (`transition.ts:142-146`). Gerund tests: `502-534` (predicate), `442-500` (hooks).
- Repair Guide labels: `88-95`; tested with label at `975-977` (`READ_ONLY_WORKSPACE — Checking workspace ownership`).
- Refresh skip: `246-249`, `289-292`; tests `79-82`, `604-612`.

### `cli:change-approve` — **implemented**

- `packages/cli/src/commands/change/approve.ts:40-43`, `78-81`: `{ name, reason }` only via `kernel.changes.approve*`. Help: ready/done bound-from (`22`, `60`). Tests: `approve.spec.ts:65-68`, `249-252`; stay-in-state stdout (`70-71`, `254-255`).

### `cli:change-archive` — **implemented** (HIGH #3 closed)

- No CLI state table. Handler calls `kernel.changes.archive.execute` only (`archive.ts:96-104`). No GetStatus pre-gate, no `archivable`-only Set.
- Progress: `createCheckProgressPresenter` `streamName: 'change-archive'` (`32-39`); gerund test `archive.spec.ts:425-481`.
- Skip-hooks / overlap / out-of-scope forwarded (`87-102`); tests `230-423`.
- Post-hooks exit 2: `108-111`; test `64-84`.
- JSON stream complete: `123-134`; tests `86-145`.

### `skills:skill-templates-source` — **implemented** for assigned focus

- Archive: `packages/skills/templates/skills/specd-archive/SKILL.md.tpl:8-11`, `39-40` (`archivable` **or** `archiving`); overlap → `/specd-design` (`28-29`); `--skip-hooks pre` (`142-148`); no pending-signoff (asserted `template-workflow.spec.ts:102-107`).
- Overlap → `/specd-design`: design `45-46`, verify `25-26`, new `135-137`, archive `28-29`; tests `156-170`.
- done/signed-off → `/specd-archive` when hop `archivable`: `specd-new/SKILL.md.tpl:151`.
- nextAction.command: `specd/SKILL.md.tpl:86-88`; new `134`; design `43-44`.
- LifecycleEngine: no hits in assigned templates (graph search for `LifecycleEngine` did not surface skill templates; templates speak GetStatus / `changes status` / next action).
- specd router: `specd/SKILL.md.tpl:7-8`, `92-93`; tests `96-100` (no signoff teaching).

---

## Discrepancies

Severity: **HIGH** = execute/agent would do the wrong thing vs paired spec; **MEDIUM** = partial miss; **LOW** = docs/help/verify wording vs code.

### D1 — LOW — Status help schema vs active JSON hop location

- **Spec / help:** `status.ts:105-106` documents top-level `availableTransitions` / `availableSteps`.
- **Code:** Drafted JSON uses those top-level keys (`175-176`). **Active** JSON puts hops under `lifecycle` (`472-481`) and does **not** emit top-level `availableTransitions`/`availableSteps`.
- **Either:** help/schema is leftover from drafted-only shape (**spec/help drift**), or active JSON should also flatten hops (**implementation**). Agents following `--help` on a live change may look at the wrong path. Behaviour of drafted emptying is still correct.

### D2 — LOW — Archive Commander description vs Prerequisites

- **Spec:** archive allowed in `archivable` **or** `archiving` (preview Prerequisites; Constraints).
- **Code:** `archive.ts:56` description: “Move a **completed** change to the archive…” — does not mention `archiving` retry. Execute path is still Core-delegated (not a second gate).
- **Either:** description is stale marketing copy (**spec-right, help-wrong**) or description is fine as user-facing shorthand (**no functional bug**).

### D3 — LOW — Skills verify.md vs spec.md for archive entry state

- **spec.md:** `specd-archive` MUST require `archivable` **or** `archiving`.
- **verify.md** scenario “specd-archive mentions in-place gates”: “requires `archivable`” only (preview verify.md ~777-781).
- **Template:** both states (`SKILL.md.tpl:8-11`, `39`). Tests assert both (`template-workflow.spec.ts:102-104`).
- **Either:** verify scenario under-specified (**spec internal**), or template over-documents. Template matches spec.md.

**No HIGH discrepancy** on assigned CLI archive gate, drafted hops, `--next` → `to: 'next'`, blocker labels (implementation), or second `VALID_TRANSITIONS` filter.

**Prior 013719 HIGH #3 — CLOSED.** Preview Prerequisites now match Core: CLI must not apply a narrower table; `archive.ts` has none. Skill template allows `archiving` retry.

**Prior LOW drafted `availableSteps` — CLOSED.** `status.ts:176` + `status.spec.ts:64-95` (Core leaks `availableSteps` + `availableTransitions: ['ready']`; JSON both `[]`).

---

## Test Coverage

### `cli:change-status` — `packages/cli/test/commands/change/status.spec.ts`

| Scenario                                       | Coverage                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Drafted JSON empties hops if Core leaks        | **Yes** `64-95` (`availableTransitions`/`availableSteps` leaked; expect `[]`; `nextAction.command` null) |
| Drafted text no transition commands            | **Yes** `97-127`                                                                                         |
| Missing name                                   | **Yes** `129-138`                                                                                        |
| GetStatus passthrough of available transitions | **Yes** `209-229` (does not add hops)                                                                    |
| Empty availableTransitions omits line          | **Yes** `231-250`                                                                                        |
| Blockers codes/messages                        | **Partial** `252-276` (no gerund `label` / em-dash shape)                                                |
| Overlap peers / hide OVERLAP_CONFLICT          | **Yes** `646-730`                                                                                        |
| Live OVERLAP with label present                | **Partial** `732-762` asserts code, not `— Checking spec overlap:`                                       |
| Schema warning, not found, DAG, implementation | **Yes** various                                                                                          |
| Incomplete tasks omit `verifying` locally      | **No** (relies on GetStatus mock omitting it)                                                            |
| Drafted: Core leaked **command** still null    | **Partial** — tests set `command: null` already; code `141` would null a leak; not asserted              |

### `cli:change-transition` — `packages/cli/test/commands/change/transition.spec.ts`

| Scenario                              | Coverage                            |
| ------------------------------------- | ----------------------------------- |
| `--next` → `to: 'next'`               | **Yes** `64-88`, `207-248`          |
| Mutual exclusion                      | **Yes** `51-62`                     |
| allowOutOfScope                       | **Yes** `90-132`                    |
| No approval flags                     | **Yes** `134-157`                   |
| Happy-path next failures              | **Yes** `646-720`                   |
| Gerund check bus / no Executing       | **Yes** `442-534`                   |
| HookFailedError exit 2, ✗ hooks       | **Yes** `253-333`                   |
| Repair Guide + verify skill           | **Yes** `565-613`, `910-938`        |
| Repair Guide with gerund label        | **Yes** `941-977`                   |
| JSON success stream not hook-progress | **Yes** `356-440`                   |
| JSON **failure** complete record      | **No** (handler `298-312` untested) |

### `cli:change-approve` — `packages/cli/test/commands/change/approve.spec.ts`

Covers missing reason, unknown sub-verb, execute shape, JSON, not found, wrong state, stay-in-ready/done, drain pending. Hash-not-computed is implicit (CLI never passes hashes).

### `cli:change-archive` — `packages/cli/test/commands/change/archive.spec.ts`

Covers success, JSON stream, skip-hooks, allow flags, overlap output, gerund progress, not found, Core rejection when not archivable (`215-228`). **No** explicit “`archiving` retry is not CLI-gated” test (implied: no state check before `execute`).

### `skills:skill-templates-source` — `packages/skills/test/template-workflow.spec.ts`

Strong on pending-parking absence, overlap vs `OVERLAP_CONFLICT`, archive `--skip-hooks pre`, design review header, impl drain, optimizer/metadata. **Weak** on exact `done`/`signed-off` → `/specd-archive` row and `nextAction.command` string; **no** `LifecycleEngine` absence assertion.

---

## Missing Tests

1. **Drafted JSON:** given GetStatus `nextAction.command: '/specd-design'` (leak), JSON `nextAction.command` is still `null` (S17; code `status.ts:141`).
2. **Status text blockers:** `DEPS_INCONSISTENT` + `label: 'Checking spec dependencies'` renders `! DEPS_INCONSISTENT — Checking spec dependencies: …` and JSON includes `blockers[].label` / `checkId` (S8 verify scenario).
3. **Status:** GetStatus omits `verifying`; CLI text/JSON do not add it from `VALID_TRANSITIONS` (S6).
4. **Status active JSON:** non-empty `lifecycle.availableSteps` passthrough unchanged (prior LOW was drafted-only; active copy is untested).
5. **Transition JSON failure:** terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", blockers, nextAction } } }` (T9).
6. **Archive:** `archiving` state still calls `archive.execute` with no CLI pre-filter (R2 / 013719 #3 regression lock).
7. **Skills contract:** `specd-new` table row `done` / `signed-off` contains `/specd-archive` and `archivable`; `specd` template contains `nextAction`/`command`; templates do not contain `LifecycleEngine`.

---

## Spec Dependency Chain

Depth-1 from previews (not re-audited as assigned specs):

| Spec                            | Direct dependencies                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:change-status`             | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`                              |
| `cli:change-transition`         | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`          |
| `cli:change-approve`            | `cli:entrypoint`, `core:change`, `core:transition-checks`                                                                                    |
| `cli:change-archive`            | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks` |
| `skills:skill-templates-source` | `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`                                             |

**Consistency with dependencies (change vs Core):** CLI archive Prerequisites now align with Core allowing `archiving` (fixes former spec-wrong HIGH). Drafted hop emptying is a **CLI sanitizer** on top of GetStatus (allowed by S17 even if Core leaks). `--next` → `to: 'next'` aligns with `core:transition-change`. Skills in-place gates align with `core:transition-checks`. No contradiction found that would make assigned change specs violate globals beyond D3 (verify.md narrower than spec.md).

---

## Summary counts

| Spec                            |           Reqs reviewed | Implemented | Partial | Missing impl |                Discrepancies |           Tests covering |                               Missing tests |
| ------------------------------- | ----------------------: | ----------: | ------: | -----------: | ---------------------------: | -----------------------: | ------------------------------------------: |
| `cli:change-status`             |                      17 |          17 |       0 |            0 | 1 LOW (D1 help vs JSON path) |                      14+ |                                           4 |
| `cli:change-transition`         |                      11 |          11 |       0 |            0 |                            0 |                      12+ |                     1 (JSON failure stream) |
| `cli:change-approve`            |                       6 |           6 |       0 |            0 |                            0 |                      10+ |                                  0 material |
| `cli:change-archive`            |                       9 |           9 |       0 |            0 |       1 LOW (D2 description) |                      14+ |                    1 (archiving retry lock) |
| `skills:skill-templates-source` | 11 focus + rest present |    11 focus |       0 |            0 | 1 LOW (D3 verify vs spec.md) | template-workflow strong | 3 (routing row / LifecycleEngine / command) |
| **Batch**                       |           **~54 focus** |     **~54** |   **0** |        **0** |     **3 LOW, 0 HIGH/MEDIUM** |                          |                                             |

**Priors:** HIGH #3 CLI archive archivable-only → **CLOSED**. LOW drafted `availableSteps` passthrough → **CLOSED**.
