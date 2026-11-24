# Partial audit: CLI + skills (`workflow-transition-checks`)

- **Mode:** change `workflow-transition-checks` (state `designing`; assigned specs via `changes spec-preview`)
- **CLI:** `node packages/cli/dist/index.js` (not bare `specd`)
- **Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`. Symbol search works; **no language-adapter file index** (`fileCount: 0`, `coverage.reasons: no-language-adapter`). `graph impact --file cli:src/commands/change/status.ts` failed (`no indexed file matches`). Navigation: `graph search` for `GetStatus` / `TransitionChange` (core classes) + spec search, then read `packages/cli` and `packages/skills`.
- **Read-only.** Specs from `changes spec-preview workflow-transition-checks <specId>`.

Project-wide constraints used: adapter CLI delegates to kernel/SDK (`default:_global/architecture`); Vitest unit tests with mocked ports (`default:_global/testing`). Direct deps (depth 1): `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:archive-change`, `core:hook-execution-model`, `core:change`, `cli:entrypoint`, `skills:skill`, `skills:workflow-automation`.

---

# Spec: `cli:change-status`

## Requirements Summary

| Requirement                                      | Intent                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Command signature                                | `change status <name> [--format text\|json\|toon]`                                                                      |
| Drafted change status is read-only               | `draftView` → no mutating transitions; `isDrafted`; suppress `nextAction.command` even if Core attached one             |
| Output format                                    | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display projection                                                   |
| Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` stays boolean                                         |
| Display-state rendering                          | Text prefers display status (`complete-with-drift`); JSON has canonical + display                                       |
| Lifecycle projections come from GetStatus checks | Pass through `validTransitions` / `availableTransitions` / `nextAction` / blockers; no local `VALID_TRANSITIONS` filter |
| Text status omits duplicated review file lists   | `review:` header without `affectedArtifacts` paths; hide invalidation `OVERLAP_CONFLICT`; print overlap peers           |
| Text blockers include check labels               | `! CODE — label: message`; JSON `label` + `checkId`                                                                     |
| Schema version warning                           | stderr from `lifecycle.schemaInfo` vs recorded schema; skip if `schemaInfo` null; exit 0                                |
| Change not found                                 | exit 1, `error:`                                                                                                        |
| Schema-derived fields                            | `schema.artifactDag` via `artifactDag()` / `childrenOf`; text DAG roots + no duplicate convergent subtrees              |
| Delegates refresh policy to GetStatus            | no `RefreshImplementationTracking` / `ImplementationDetector` in the command                                            |
| Implementation section                           | `--implementation` uses `sdk:build-implementation-review` only                                                          |
| Task completion in details                       | `tasks: N/M`                                                                                                            |
| Basic info section                               | name + state; no standalone `specs:` list                                                                               |
| Specs and dependencies                           | text bullets + JSON `specDependsOn`                                                                                     |

**Constraints (binding):** serialize GetStatus as-is; no SchemaRegistry/config-show to recompute lifecycle; drafted **must** null `nextAction.command`; no second `VALID_TRANSITIONS` filter.

## Implementation Status

**Mostly implemented.** Handler: `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`). Tests: `packages/cli/test/commands/change/status.spec.ts`.

| Requirement                                                                 | Status          | Evidence                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature                                                           | **implemented** | Commander `status <name>`, `--format`, `--implementation`                                                                                                                                                                                                                            |
| Drafted read-only + suppress command                                        | **partial**     | Text: `state … (drafted)`, `transitions: (none — change is drafted)`, `command: (none)` via `nextAction = { …statusResult.nextAction, command: null }`. JSON: `isDrafted: true`, `command: null`. **JSON still copies `lifecycle.availableTransitions` unchanged** (no force-empty). |
| GetStatus as-is / no VALID_TRANSITIONS filter                               | **implemented** | `kernel.changes.status.execute({ name })` only. Renders `lifecycle.availableTransitions` as given. No local hop table.                                                                                                                                                               |
| Review header / overlap / no file lists                                     | **implemented** | Text `review:` required/route/reason/message; overlap section; filter `OVERLAP_CONFLICT` when `reason === 'spec-overlap-conflict'`; help schema lists `overlapDetail`                                                                                                                |
| Blocker gerund labels                                                       | **implemented** | `! ${code} — ${label}: ${message}` vs `! ${code}: ${message}`; JSON spreads `label`/`checkId`                                                                                                                                                                                        |
| DAG / hasTasks / display state                                              | **implemented** | `resolveStatusSchemaDag` prefers `schema.artifactDag()`; `visited` Set skips convergent re-expansion (spec MAY omit); DAG uses `displayStatus`                                                                                                                                       |
| Refresh delegation                                                          | **implemented** | Test asserts `refreshImplementationTracking.execute` not called                                                                                                                                                                                                                      |
| Schema warning / not found / specs section / details tasks / implementation | **implemented** | Matches spec; implementation via `enrichImplementationTracking`                                                                                                                                                                                                                      |

## Discrepancies

### 1. Drafted JSON still serializes Core `availableTransitions` — **code-wrong** (defense-in-depth; Core may already empty them)

**Evidence**

- Spec: “MUST NOT print actionable lifecycle transitions that would mutate the drafted change.” Constraint: suppress `nextAction.command` even if Core attached a command.
- Text overrides transitions to `(none — change is drafted)`.
- JSON drafted branch (`status.ts` ~166–182) sets `command: null` but `availableTransitions: lifecycle.availableTransitions` with **no** override.
- Test `JSON drafted status includes isDrafted and empty transitions` mocks Core already returning `availableTransitions: []` and `command: null` — does **not** prove CLI nulls a Core-attached command or empties hops.

**A (code-wrong, spec wins):** JSON drafted payload should force `availableTransitions: []` (and still null `command`) so agents cannot copy hops into `change transition`.  
**B (spec-wrong):** JSON is a GetStatus dump; only text is “print.” Unlikely: requirement is not format-scoped.  
**C (both):** GetStatus for `draftView` should already empty hops (`core:get-status`); CLI should still defend like it does for `command`.

**Severity:** medium (JSON agents).

### 2. Repair-oriented blockers vs GetStatus as-is — **none** for active changes

Active path does not re-filter `availableTransitions`. OVERLAP_CONFLICT hiding in **text only** when `review.reason === 'spec-overlap-conflict'` is specified, not a local protocol-graph filter.

## Test Coverage

| Area                                                         | Covered?                                  | Notes                                          |
| ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| Drafted text + JSON `isDrafted` / command none               | yes (weak JSON)                           | Core already returns empty hops / null command |
| GetStatus-only, no refresh                                   | yes                                       |                                                |
| Review / overlap / no file paths / hide invalidation OVERLAP | yes                                       |                                                |
| Live OVERLAP_CONFLICT still prints                           | yes                                       |                                                |
| JSON `overlapDetail`                                         | yes                                       |                                                |
| DAG hasTasks counts + details `tasks: N/M`                   | yes                                       |                                                |
| JSON `artifactDag.state` display projection                  | yes                                       |                                                |
| Schema mismatch warning                                      | yes                                       |                                                |
| Change not found                                             | yes                                       |                                                |
| Specs and dependencies; no standalone `specs:`               | yes                                       |                                                |
| Implementation `--implementation`                            | present in command tests (shared helpers) |                                                |

## Missing Tests

1. **Drafted + Core still sends `nextAction.command: '/specd-design'`** → JSON `command === null` and text `(none)` (constraint is explicit).
2. **Drafted + Core sends non-empty `availableTransitions`** → JSON must not advertise hops (if discrepancy #1 is accepted).
3. **Verify scenario: `DEPS_INCONSISTENT` + label `Checking spec dependencies` + JSON `blockers[].label` / `checkId`** — implemented, **no matching test** (`status.spec.ts` has no `DEPS_INCONSISTENT`).
4. **Verify: GetStatus omits `verifying` → CLI does not add it from `VALID_TRANSITIONS`.**
5. **Verify: `nextAction.command` is `/specd-verify` → status does not print `/specd-implement`.**
6. **Verify: `artifact-review-required` + files under details, not under `review:`.**
7. **Text `complete-with-drift`** (JSON DAG state is tested; text display-state scenario is not).
8. **Convergent DAG** (`design` child of `proposal` and `specs` appears once).
9. **`--help` JSON schema lists `overlapDetail`** (code has it; no help-string test).

## Spec Dependency Chain

- `cli:entrypoint` — format / exit codes: OK.
- `core:get-status` — CLI projects result; drafted command suppression is **CLI-owned** even if Core attaches a command.
- `core:transition-checks` — gerund labels / check-derived hops: pass-through.
- `sdk:build-implementation-review` — `--implementation` path, not local graph matching.
- `default:_global/architecture` — adapter; no domain hop table in CLI.

Consistency: change spec forbids a second VALID_TRANSITIONS filter; implementation matches. Drafted JSON hops vs “no actionable transitions” is the only tension with `core:get-status` draftView.

## Summary

- Requirements checked: **16**
- Implemented: **15**
- Partial: **1** (drafted JSON transitions)
- Missing: **0** (all named reqs have code)
- Discrepancies: **1** (code-wrong)
- Spec-wrong: **0**
- Code-wrong: **1**
- Both: **0**
- Test gaps: **9** listed

---

# Spec: `cli:change-transition`

## Requirements Summary

| Requirement                       | Intent                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Command signature                 | `<name> [step]` or `--next`; `--skip-hooks` phases; `--allow-out-of-scope` → `allowOutOfScope` only; no approval flags |
| Next-transition resolution        | `to: 'next'` to `TransitionChange.execute`; **no CLI from→to table**; **do not** resolve via `GetStatus.nextAction`    |
| Delegates refresh                 | pre-status and repair `GetStatus` with `refreshImplementationTracking: false`; no detector/refresh use cases           |
| Approval-gate routing             | no rewrite to pending parking; user names delivery target                                                              |
| Hook execution                    | map `--skip-hooks` → `skipHookPhases`                                                                                  |
| Progress / check bus              | gerund `check-start`/`check-progress`/`check-done`; hooks on same bus; **no** `stream: "hook-progress"`                |
| Shared presenter                  | `run-hooks` may keep `_hook-progress-presenter`                                                                        |
| Success output                    | text confirmation; JSON terminal `stream: "change-transition"` `complete`                                              |
| Post-hook / HookFailedError       | exit **2**, **no** repair guide, check bus `✗`                                                                         |
| Invalid transition / repair guide | stderr from GetStatus `nextAction` + labeled blockers; JSON `complete` + `result: "failure"`                           |
| Incomplete tasks                  | exit 1; artifact named; status already omitted `verifying` (Core)                                                      |
| Check progress rendering          | no `Executing:` prefix; `Running pre/post hooks`                                                                       |

## Implementation Status

**Mostly implemented.** `packages/cli/src/commands/change/transition.ts`, presenter ` _check-progress-presenter.ts`. Tests: `packages/cli/test/commands/change/transition.spec.ts`.

| Requirement                                        | Status          | Evidence                                                                                                                                                                               |
| -------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--next` → `to: 'next'`                            | **implemented** | `requestedTarget = opts.next === true ? 'next' : step`; tests `expect.objectContaining({ to: 'next' })`. Pre-status used only for `fromState` / drafted guard, **not** next hop.       |
| No from→to table                                   | **implemented** | `CHANGE_STATES` is argument validation, not routing. No map drafting→designing.                                                                                                        |
| Repair guide from GetStatus                        | **implemented** | `writeTextRepairGuide` uses `status.nextAction` + blockers/labels; second GetStatus `refreshImplementationTracking: false`. Verify-skill test: `command: /specd-verify` not implement. |
| HookFailedError                                    | **implemented** | not in `isRepairGuideError`; `handleError` exit 2; tests no `repair guide:`; check bus `✗ Running pre hooks`                                                                           |
| Check bus / no hook-progress stream                | **implemented** | `createCheckProgressPresenter({ streamName: 'change-transition' })`; JSON test asserts no `hook-progress`. `run-hooks` still uses `_hook-progress-presenter` (allowed).                |
| skip-hooks / allowOutOfScope / no approval flags   | **implemented** | tests for `all`, comma phases, omit `allowOutOfScope`, no `approvalsSpec`                                                                                                              |
| JSON success complete record                       | **implemented** |                                                                                                                                                                                        |
| Legacy `requires-check` / `task-completion-failed` | **partial**     | still handled in `makeProgressRenderer` because **Core still emits them** (`transition-change.ts` union + emit). Spec wants a single check bus.                                        |

## Discrepancies

### 1. Repair-guide stderr prefix sketch vs Core message — **spec-wrong**

**Evidence**

- Spec.md canonical block: `error: cannot transition to <step>`.
- Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Tests assert the Core `InvalidStateTransitionError` text, not the sketch.
- Verify scenarios: “prints an error message to stderr” + repair guide — not a literal `cannot transition to`.

**A (spec-wrong, CODE WINS):** treat the boxed example as shape (`error:` + `! CODE` + `repair guide:`), not a frozen prefix.  
**B (code-wrong):** rewrite to `cannot transition to ${step}`. Would fight Core’s structured messages (approval-required, `--next` unavailable).

**Severity:** low.

### 2. Dual progress event families — **both** (CLI/core contract)

**Evidence**

- CLI spec: one bus `check-start` / `check-progress` / `check-done`.
- Core `TransitionProgressEvent` still includes `requires-check` and `task-completion-failed`; CLI prints `✓ requires …` / `✗ tasks incomplete…` **in addition to** the gerund presenter.
- Not an `Executing:` regression; it is a second public text shape.

**A (code-wrong Core + CLI):** Core should only emit check events; CLI drop legacy cases.  
**B (spec-wrong CLI):** document the extra diagnostic events until Core is fully on the check bus.

**Severity:** low–medium (text noise / agent parsers).

### 3. JSON structured **failure** complete record — **implemented, untested** (not a code/spec mismatch)

`transition.ts` ~298–312 writes `event.type: "complete"`, `result: "failure"`, `blockers`, `nextAction`. No test in `transition.spec.ts` for `--format json` failure.

## Test Coverage

| Area                                                 | Covered?                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `--next` → `to: 'next'`                              | yes                                                        |
| Mutual exclusion step + `--next`                     | yes                                                        |
| HappyPathNextUnavailableError messages               | yes (pending-spec-approval, pending-signoff, archivable)   |
| No pending rewrite                                   | yes                                                        |
| HookFailedError exit 2, no repair guide, check-bus ✗ | yes (text)                                                 |
| Repair guide stderr / GetStatus nextAction verify    | yes                                                        |
| Labeled blockers on repair guide                     | yes (`READ_ONLY_WORKSPACE — Checking workspace ownership`) |
| skip-hooks mapping                                   | yes                                                        |
| JSON success + check events + no hook-progress       | yes                                                        |
| JSON failure complete                                | **no**                                                     |
| Refresh false on status calls                        | yes                                                        |

## Missing Tests

1. JSON/TOON failed transition: terminal `stream: "change-transition"`, `result: "failure"`, `blockers`, `nextAction` on stdout; no repair guide on stdout.
2. HookFailedError with `--format json`: exit 2, no repair guide, no `complete`/`nextAction` repair payload (structured `handleError` only).
3. Gerund predicate progress `Checking implementation links (impl.linksInScope)` (verify scenario); hook labels covered.
4. Explicit assertion that execute input is **not** derived from `status.nextAction.targetStep` when `--next` is set (today implied by `to: 'next'`).

## Spec Dependency Chain

- `core:transition-change` — `to: 'next'` owned by Core; CLI complies.
- `core:get-status` — repair guide projection; refresh false.
- `core:transition-checks` / `core:hook-execution-model` — check bus vs leftover requires-check events (Core still dual).
- `cli:entrypoint` — exit 1 vs 2 for hooks.

No contradiction with “no CLI routing table.” `CHANGE_STATES` is a closed enum for typos, allowed.

## Summary

- Requirements checked: **14**
- Implemented: **13**
- Partial: **1** (legacy progress events)
- Missing: **0**
- Discrepancies: **2** (1 spec-wrong, 1 both)
- Spec-wrong: **1**
- Code-wrong: **0** (CLI `--next` / repair / hooks match)
- Both: **1**
- Test gaps: **4** listed

---

# Spec: `cli:change-approve`

## Requirements Summary

Signatures `approve spec|signoff <name> --reason`; no gate flags on execute; hashes owned by Core; stay in `ready`/`done`; help uses bound-from language; kernel `changes.approveSpec` / `approveSignoff` not `kernel.specs.*`; JSON `{ result, gate, name }`.

## Implementation Status

**Implemented.** `packages/cli/src/commands/change/approve.ts`.

- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape; no `approvalsSpec` / hashes.
- Help: spec “in ready (pending-spec-approval remains valid for drain)”; signoff “in done (…)”.
- Success text `approved spec|signoff for <name>`; tests assert no `pending-spec-approval` / `moved`.
- Errors: missing `--reason` (Commander), `ChangeNotFoundError` exit 1, `ApprovalGateDisabledError` exit 1.

**Core alignment:** CLI does not pass skippable check flags (approve is not a hop). Gate enablement is kernel-baked — matches `core:transition-checks` in-place gates.

## Discrepancies

None material.

Minor: verify “execute receives an object with **exactly** `name` and `reason`” — tests use `toHaveBeenCalledWith({ name, reason })` (exact for those keys). No spy that `kernel.specs.approveSpec` is unused; the command never references `kernel.specs`.

## Test Coverage

Success text/JSON, drain from pending states (output still `approved …`, no “moved to pending”), missing reason, unknown sub-verb, not found, wrong-state via gate-disabled error.

## Missing Tests

1. Explicit `kernel.specs.approveSpec` / `approveSignoff` **not** invoked.
2. Help-text contains bound-from `ready` / `done` (not “routes to pending”).
3. Artifact hashes not present on execute input (property assertion).

## Spec Dependency Chain

- `core:change` / `core:transition-checks` — in-place consent; CLI output does not invent pending hops.
- `cli:entrypoint` — usage errors.

No conflict with global architecture.

## Summary

- Requirements checked: **7**
- Implemented: **7**
- Partial: **0**
- Missing: **0**
- Discrepancies: **0**
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Spec: `cli:change-archive`

## Requirements Summary

`changes archive` + singular alias; `--skip-hooks pre|post|all`; `--allow-overlap`; `--allow-out-of-scope` → `impl.linksInScope`; archivable prerequisite; ArchiveChange merge/move; check-bus gerund progress; post-hook failures exit 2; JSON `stream: "change-archive"` complete only (no second unwrapped ok object); overlap invalidation listing.

## Implementation Status

**Implemented and aligned with Core.** `packages/cli/src/commands/change/archive.ts`.

| Flag / field      | CLI                                                         | Core `ArchiveChangeInput` (`archive-change.ts`)    |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `skipHookPhases`  | `Set<'pre'\|'post'\|'all'>` via `parseCommaSeparatedValues` | `ReadonlySet<ArchiveHookPhaseSelector>` same union |
| `allowOverlap`    | set only if `--allow-overlap`                               | `allowOverlap?: boolean`                           |
| `allowOutOfScope` | set only if `--allow-out-of-scope`                          | same skippable `impl.linksInScope` (spec)          |
| omitted flags     | `undefined` (not `false`)                                   | Core treats missing as default-off                 |

Progress: same `createCheckProgressPresenter` with `streamName: 'change-archive'`. Tests: gerund `Checking workspace ownership`, `Running pre hooks`, no `Executing:`; JSON NDJSON check-start/done then complete.

Post-hooks: `postHookFailures.length > 0` → `cliError(..., 2)` **before** success stdout.

`SpecOverlapError` → stderr hint `--allow-overlap`, exit 1 (live overlap, not invalidation review).

## Discrepancies

### 1. Prerequisites “naming the current state” — **possible code-wrong / test-weak**

Spec: not `archivable` → exit 1, `error:` **naming the current state**. CLI forwards `InvalidStateTransitionError` through `handleError` (`err.message`). Test only `toMatch(/error:/)` — does not assert state `done` appears. Whether Core’s message names the state is a `core:archive-change` concern; CLI does not add a local prefix.

If Core message lacks the current state: **code-wrong** (CLI or Core). Not verified here beyond the CLI mapping.

## Test Coverage

skip-hooks all/pre/post/comma; allowOverlap / allowOutOfScope omit-by-default; JSON stream; invalidated text/JSON; post-hook exit 2; not found; missing name; check progress.

No test for singular alias `change archive` vs `changes archive` in this file (registration is typically on both parents in the command tree — not re-audited here).

## Missing Tests

1. Verify: `--skip-hooks pre,post` accepted (code supports it; archive.spec has comma test).
2. Non-archivable stderr **mentions current state** (e.g. `done`).
3. JSON complete is the **only** JSON object (no trailing unwrapped `{ result: "ok" }`) — current test parses a **single** JSON line when no progress; with progress, last line is complete (good). Explicit “no second object” would lock the requirement.

## Spec Dependency Chain

- `core:archive-change` — skip-hooks / allowOverlap / allowOutOfScope **aligned**.
- `core:hook-execution-model` — skip is effects only; CLI does not bypass predicates.
- `core:transition-checks` — gerund check bus.
- `cli:command-resource-naming` — plural canonical; not re-tested in archive.spec.

## Summary

- Requirements checked: **10**
- Implemented: **10**
- Partial: **0** (state-in-message unverified)
- Missing: **0**
- Discrepancies: **0** confirmed; **1** unverified (current-state in error text)
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Spec: `skills:skill-templates-source`

## Requirements Summary (assigned + this change’s deltas)

Templates under `packages/skills/templates/` with `.md.tpl` + meta JSON; shared Handlebars; graph/search/frontmatter/optimizer/metadata (pre-existing). **This change** adds:

| Requirement                                            | Intent                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place approval gates                                | stay `ready`/`done` + human approve; no `change transition` into pending; `specd` router must not teach signoff; new-skill pending rows drain-only                                  |
| Overlap invalidation vs live archive                   | hop skills: no typical `OVERLAP_CONFLICT`; `spec-overlap-conflict` → **`/specd-design`**, not `--allow-overlap`; archive MAY list OVERLAP + `--allow-overlap` only for live overlap |
| Implementation tracking in verify/implement            | shared cookbook; verify drains open files; implement zero-open before `/specd-verify`                                                                                               |
| Archive skips only pre                                 | `--skip-hooks pre` not `all`; no post `run-hooks` after archive                                                                                                                     |
| Design review scope                                    | `review: required: yes` trigger; files from `artifacts (details):` / `affectedArtifacts`, not listed under text `review:`                                                           |
| **nextAction.command** (user focus)                    | hop skills + shared: prefer status `nextAction` / **next action:** command over local hop invention                                                                                 |
| **No LifecycleEngine injection language** (user focus) | templates must not teach ctor-injected `LifecycleEngine`                                                                                                                            |

## Implementation Status

**Implemented for the change-owned and focus items.**

| Item                               | Status                   | Evidence                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nextAction.command                 | **implemented**          | `shared.md.tpl` “Next Action engine” + `command` field; hop skills “Follow the **next action:** command recommendation” (`specd-design` L43–44); `specd-new` “Follow the `nextAction.command` recommendation” |
| Review overlap → `/specd-design`   | **implemented**          | design/implement/verify/new/archive: `spec-overlap-conflict` → `/specd-design`, `not `--allow-overlap``; archive still documents live `--allow-overlap`                                                       |
| LifecycleEngine in templates       | **implemented (absent)** | no matches under `packages/skills/templates/` for `LifecycleEngine` / `evaluateLifecycle`                                                                                                                     |
| In-place gates                     | **implemented**          | `template-workflow.spec.ts` `does not teach pending parking…`                                                                                                                                                 |
| OVERLAP vs invalidation            | **implemented**          | same file, hop skills typical-blocker group excludes `OVERLAP_CONFLICT`                                                                                                                                       |
| Archive `--skip-hooks pre`         | **implemented**          | template + test                                                                                                                                                                                               |
| Design review not a file list      | **implemented**          | “Text `review:` only has required/route/reason — not file paths”                                                                                                                                              |
| Verify drain / implement zero-open | **implemented**          | tests + templates                                                                                                                                                                                             |

`specd-new` still has a **`nextAction.targetStep` table** after “follow command”. That table is **required** by the in-place-gates requirement (pending = drain-only). It can diverge from `nextAction.command` if Core command and the table disagree; agents are told to follow `command` first when blockers exist, then the table when `review.required` is false. Not a spec contradiction.

## Discrepancies

None for templates vs this change’s skill deltas.

**Not in this spec, but related:** Core/CLI specs elsewhere still mention `LifecycleEngine` ctor injection (other partials). Skills templates do **not** carry that leftover.

## Test Coverage

`packages/skills/test/template-workflow.spec.ts` covers pending parking, overlap routing, archive skip-pre, design review header, implementation drain, optimizer/metadata (older reqs).

No assertion `expect(template).not.toContain('LifecycleEngine')`.

No assertion that hop skills contain `nextAction.command` or “next action:” **command** (they do in source).

## Missing Tests

1. Negative: all workflow templates + `shared.md.tpl` do not contain `LifecycleEngine`, `createEvaluateLifecycle`, or “inject LifecycleEngine”.
2. Positive: `specd-design` / `specd-implement` / `specd-verify` / `specd-archive` instruct following status **next action command** (not only blockers list).
3. `specd-new` table: pending rows `Drain only` already asserted; optional: table is not used when `review.required` is true (`/specd-design` regardless of state) — copy exists, no dedicated test.

## Spec Dependency Chain

- `core:transition-checks` — in-place gates; templates match stay-in-state.
- `cli:change-status` — skills assume text `review:` has no file list; CLI implements that.
- `cli:change-archive` — `--skip-hooks pre` matches CLI/Core archive phases.
- `skills:workflow-automation` — command-role copy still tested.

No leftover LifecycleEngine injection language in skills templates (unlike some **core** preview specs).

## Summary

- Requirements checked (this change + focus): **8** clusters (in-place, overlap, impl tracking, archive hooks, design review, nextAction, no LifecycleEngine, plus pre-existing template-source still in preview)
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **0**
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Cross-spec consistency (CLI/skills vs globals and Core)

| Topic                         | Change specs                                    | Code                        | Verdict                                        |
| ----------------------------- | ----------------------------------------------- | --------------------------- | ---------------------------------------------- |
| GetStatus projections         | CLI must not recompute hops                     | Status pass-through         | OK (drafted JSON hops: see status discrepancy) |
| `--next`                      | Core resolves `to: 'next'`                      | CLI passes `to: 'next'`     | OK                                             |
| Repair guide                  | GetStatus `nextAction`                          | Same                        | OK                                             |
| HookFailedError               | exit 2, no repair guide                         | `handleError` + tests       | OK                                             |
| Check bus gerunds             | CLI + archive                                   | Shared presenter            | OK; Core still emits extra event types         |
| Approve/archive flags         | skip-hooks / allow-overlap / allow-out-of-scope | Mapped to Core input shapes | **Aligned**                                    |
| Skills overlap                | `/specd-design`, not `--allow-overlap`          | Templates + tests           | OK                                             |
| LifecycleEngine in skills     | user focus: none                                | None in templates           | OK                                             |
| LifecycleEngine in Core specs | other batches                                   | N/A here                    | out of this partial                            |

---

# Batch totals

| Spec                          | Reqs | Impl | Partial | Missing impl | Disc. | spec-wrong | code-wrong | both | Notable test gaps                                                                 |
| ----------------------------- | ---: | ---: | ------: | -----------: | ----: | ---------: | ---------: | ---: | --------------------------------------------------------------------------------- |
| cli:change-status             |   16 |   15 |       1 |            0 |     1 |          0 |          1 |    0 | drafted command override; DEPS label; verify nextAction; artifact-review-required |
| cli:change-transition         |   14 |   13 |       1 |            0 |     2 |          1 |          0 |    1 | JSON failure complete record                                                      |
| cli:change-approve            |    7 |    7 |       0 |            0 |     0 |          0 |          0 |    0 | specs.\* not called                                                               |
| cli:change-archive            |   10 |   10 |       0 |            0 |     0 |          0 |          0 |    0 | error names current state                                                         |
| skills:skill-templates-source |  8\* |    8 |       0 |            0 |     0 |          0 |          0 |    0 | LifecycleEngine absence                                                           |

\*Focus + change-delta clusters, not every pre-existing template-source requirement line-by-line (frontmatter/optimizer/graph snippet still present in preview and previously covered by `template-workflow.spec.ts`).

**Highest-priority findings for this batch**

1. **code-wrong:** drafted status JSON may still advertise `availableTransitions` (text already suppresses).
2. **spec-wrong (low):** repair-guide `error: cannot transition to <step>` sketch vs Core `err.message`.
3. **both (low):** CLI still pretty-prints Core `requires-check` / `task-completion-failed` beside the gerund check bus.
4. **test gaps:** status verify scenarios (labels, nextAction verify vs implement, drafted command override); transition JSON failure stream; skills negative LifecycleEngine test.

**Approve/archive skip-hooks and allow-overlap:** CLI forwards the same selector sets and optional booleans Core defines; omitted flags are omitted (not forced false). Skills archive uses `--skip-hooks pre` only, matching Core post-hooks inside `ArchiveChange`.
