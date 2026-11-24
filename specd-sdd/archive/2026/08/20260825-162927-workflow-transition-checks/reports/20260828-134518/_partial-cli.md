# Partial Compliance Report — CLI

Audit scope: change `workflow-transition-checks`, specs `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`.

Graph: one `graph search` succeeded (index present; prior instruction said unavailable). Navigation still used Read/Grep on `packages/cli/src/commands/change/` and `packages/cli/test/commands/change/`. Spec content from `changes spec-preview`. No source or spec files were modified.

---

## 1. Requirements

### cli:change-status (16 requirements)

| Requirement                             | Intent                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Command signature                       | `change status <name> [--format text\|json\|toon]`; optional `--implementation`                                              |
| Drafted change status is read-only      | Render `draftView` without mutating transitions; mark drafted                                                                |
| Output format                           | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display projection                                                        |
| Task completion display in DAG          | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                             |
| Display-state rendering                 | `complete-with-drift`; JSON has canonical + display                                                                          |
| Lifecycle projections from GetStatus    | Pass through `availableTransitions` / `nextAction`; no local `VALID_TRANSITIONS` filter                                      |
| Text omits duplicated review file lists | `review:` header without `affectedArtifacts` paths; overlap peers still printed; no `OVERLAP_CONFLICT` line                  |
| Text blockers include check labels      | `! CODE — label: message` when `label` present                                                                               |
| Schema version warning                  | stderr warning from `lifecycle.schemaInfo`; skip if null; exit 0                                                             |
| Change not found                        | exit 1, `error:`                                                                                                             |
| Schema-derived fields                   | nested `schema.artifactDag` via `childrenOf`/`topologicalOrder`; text DAG uses roots/children; no duplicate convergent nodes |
| Delegates refresh to GetStatus          | no direct Refresh/ImplementationDetector                                                                                     |
| Implementation section                  | `--implementation` via `sdk:build-implementation-review`                                                                     |
| Task completion in details              | `tasks: N/M`                                                                                                                 |
| Basic info                              | name + state; no standalone `specs:` list                                                                                    |
| Specs and dependencies                  | text section + JSON `specDependsOn`                                                                                          |

### cli:change-transition (14 requirements)

| Requirement                   | Intent                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Command signature             | `<name> <step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope`; formats      |
| Next-transition resolution    | `to: 'next'` to Core; no CLI from→to table; Core rejection → exit 1 + explanation |
| Delegates refresh             | pre/post GetStatus with `refreshImplementationTracking: false`                    |
| Approval-gate routing         | no gate flags; do not rewrite implementing/archivable to pending states           |
| Hook execution                | map `--skip-hooks` to `skipHookPhases`                                            |
| Progress output               | generic check bus; stream `change-transition`; never `hook-progress`              |
| Transition hook observability | progress visible before hook failure                                              |
| Shared hook progress          | transition uses check presenter                                                   |
| Output on success             | text confirmation; JSON terminal `complete` record                                |
| Post-hook failure             | exit 2, `error:`; no post-transition warning state                                |
| Invalid transition error      | exit 1; Repair Guide on stderr; HookFailedError is exit 2 without guide           |
| Incomplete tasks              | exit 1 naming artifact                                                            |
| Check progress rendering      | gerund `(id)` then ✓/✗; no `Executing:`                                           |
| Unsatisfied requires          | surface requires blocker; repair from GetStatus                                   |

### cli:change-approve (7 requirements)

| Requirement               | Intent                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Command signatures        | `approve spec\|signoff <name> --reason`                                       |
| Delegates gate state      | `{ name, reason }` only; `kernel.changes.approve*` not `kernel.specs.*`       |
| Artifact hash computation | CLI never computes/passes hashes                                              |
| Approve spec behaviour    | valid from `ready` (drain `pending-spec-approval`); no printed hop to pending |
| Approve signoff behaviour | valid from `done` (drain `pending-signoff`); bound-`from` help                |
| Output on success         | `approved <gate> for <name>` / JSON `{ result, gate, name }`                  |
| Error cases               | missing reason, wrong state, not found → exit 1                               |

### cli:change-archive (10 requirements)

| Requirement                  | Intent                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Command signature            | `changes archive` + `change` alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope` |
| Prerequisites                | must be `archivable`; else exit 1 naming state                                                               |
| Behaviour                    | delegate `ArchiveChange`                                                                                     |
| Hook execution               | skip-hooks → archive phase set                                                                               |
| Check progress rendering     | same gerund bus as transition; stream `change-archive`                                                       |
| Post-archive hooks           | failures → exit 2                                                                                            |
| Output on success            | archive path; omit invalidated section when empty                                                            |
| Output on success (extended) | invalidated list when overlap occurred                                                                       |
| JSON output on success       | NDJSON `stream: change-archive` complete record only                                                         |
| Error cases                  | not found / not archivable / merge fail → exit 1                                                             |

---

## 2. Implementation

### Shared wiring

`packages/cli/src/index.ts` registers all four commands on `program.command('changes').alias('change')`, so singular `change` and plural `changes` share handlers.

### `status.ts`

- Calls `kernel.changes.status.execute({ name })` only (default refresh). No `RefreshImplementationTracking` / `ImplementationDetector` in CLI src.
- Draft path: `(drafted)` in text, `isDrafted: true` in JSON, `transitions: (none — change is drafted)`.
- Active text: DAG from `getActiveSchema` + `schema.artifactDag()` when not `raw`, else `ArtifactDag.from(schemaInfo.artifacts)`.
- Display status used for DAG symbols and details lines; JSON `artifactDag[].state` uses `displayStatus`.
- Review header prints `required` / `route` / `reason` / `message`; never dumps `affectedArtifacts` paths. Overlap peers rendered in `overlap:` when `reason === 'spec-overlap-conflict'` and `overlapDetail.length > 0`.
- Blockers: `! CODE — label: message` when `label` is set.
- `--help` JSON schema lists `review.overlapDetail` beside `affectedArtifacts`.
- `--implementation` uses `enrichImplementationTracking` → `buildImplementationReview` (SDK), not extra graph matching.

### `transition.ts`

- `--next` sets `to: 'next'`. `CHANGE_STATES` is argument validation only (known state names), not a from→to routing table. No `GetStatus.nextAction` used to pick the hop.
- `--allow-out-of-scope` spreads `allowOutOfScope: true` only when the flag is set; omitted otherwise. Help text says it applies to `impl.linksInScope`.
- Execute input has `skipHookPhases`; no approval flags.
- Pre-transition and repair GetStatus both use `refreshImplementationTracking: false`.
- Progress via `createCheckProgressPresenter({ streamName: 'change-transition' })`.
- Repair guide on `InvalidStateTransitionError` / workspace / archive-impl errors. `HookFailedError` falls through to `handleError` (exit 2). `HappyPathNextUnavailableError` also uses `handleError` (exit 1) so Core’s explanation is printed.

### `approve.ts`

- `kernel.changes.approveSpec.execute({ name, reason })` and `approveSignoff` with the same shape.
- Help: spec gate “in ready (pending-spec-approval remains valid for drain)”; signoff “in done (pending-signoff remains valid for drain)”.

### `archive.ts`

- Forwards `skipHookPhases`, `allowOverlap`, `allowOutOfScope` only when flags are set.
- Check presenter stream `change-archive`.
- Post-hook failures: `cliError(..., 2)` before success output.
- Text invalidated section only if `invalidatedChanges.length > 0`.
- JSON: single terminal `{ stream: 'change-archive', event: { type: 'complete', result } }`.
- `SpecOverlapError` suggests `--allow-overlap`.

---

## 3. Discrepancies

### Re-verify previous HIGH — leftover artifact-drift tests

**Resolved (no longer HIGH).**

- `packages/cli/test/commands/change/status.spec.ts` owns `describe('artifact-drift review rendering')` (text omits review file paths; JSON keeps `affectedArtifacts`).
- `packages/cli/test/commands/change.spec.ts` has **zero** `artifact-drift` matches.
- The leftover file still exists because it also covers list/create/draft/discard **and** still duplicates a subset of status/transition tests (missing name, JSON schema, invalid transition, hook fail). That is duplication, not the prior HIGH (drift tests left in the monolith).

**Spec vs code:** leftover deletion was an expected test-layout cleanup, not a product spec. Code/spec for drift rendering live in `status.ts` + `status.spec.ts`.

### `--next` is not a local table — compliant

`requestedTarget = opts.next === true ? 'next' : step`. Tests assert `to: 'next'` for ready, signed-off, and failure states. CLI does not map pending-signoff locally.

### `HAPPY_PATH_NEXT` / pending-signoff — compliant

`--next` from `pending-signoff` mocks `HappyPathNextUnavailableError('pending-signoff')` and expects stderr `/waiting for human signoff/`, plus pending-spec-approval and archivable. Matches “when Core rejects `to: 'next'` … explanatory `error:`”.

### `--allow-out-of-scope` — compliant (transition + archive)

Transition and archive both optional-spread `allowOutOfScope: true`. Tests: forwarded when set, omitted when unset. Transition help correctly limits the flag to `impl.linksInScope` (does not claim `impl.filesResolved` bypass).

### Archive allow flags — compliant

`--allow-overlap` and `--allow-out-of-scope` registered and forwarded. Tests cover both plus omit-by-default.

### Status overlap review — mostly compliant; one residual risk

**Implemented:** overlap peers in `overlap:`; no paths under `review:`; JSON serializes full `review` including `overlapDetail`; help lists `overlapDetail`.

**MEDIUM — CLI does not filter `OVERLAP_CONFLICT` blockers.** Spec: “Invalidation overlap MUST NOT appear as a `OVERLAP_CONFLICT` blocker line.” Implementation prints every `GetStatus.blockers` entry. Tests mock `blockers: []` and assert `not.toContain('OVERLAP_CONFLICT')`, so they pass even if Core still emits that code.

- If spec is right: CLI should drop/relabel that code in text.
- If Core no longer emits it: spec is belt-and-suspenders; CLI is fine as a pass-through.

### Display-state / `[drift]` in text — test and possible render gap

Details append `[drift]` only when `file.hasDrift` is true. Artifact-drift tests do **not** set `hasDrift` on files and do **not** assert `[drift]`. JSON `complete-with-drift` is covered; **text** “prefers complete-with-drift” and “DAG uses display status for drift” have no dedicated tests.

DAG `hasTasks` tag uses `artifact.hasTasks` only; nested JSON `schema.artifactDag` uses `hasTasks === true || taskCompletionCheck !== undefined`. Custom schemas with only `taskCompletionCheck` can disagree between text DAG tags and JSON.

**MEDIUM** if schemas exist with `taskCompletionCheck` without `hasTasks: true`. **LOW** if schema-std always sets `hasTasks`.

### Other LOW

| Item                                    | Spec                                         | Code                                                                | Notes                                                                                            |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Status `--help` schema object           | nested `schema` includes `artifactDag`       | help shows `schema: { name, version }` plus top-level `artifactDag` | Runtime JSON overwrites `schema` with `schemaPayload` (includes `artifactDag`). Help drift only. |
| Repair Guide first line                 | example `error: cannot transition to <step>` | `error: ${err.message}`                                             | Meaning preserved; wording not canonical.                                                        |
| Approve execute shape vs `kernel.specs` | MUST NOT call `kernel.specs.approve*`        | Handler only calls `kernel.changes.*`                               | No test asserts `kernel.specs` unused.                                                           |
| Incomplete-tasks stderr names artifact  | MUST name blocking artifact                  | Relies on Core error + GetStatus blocker message                    | Test only checks `error:` + repair guide, not artifact id.                                       |

No contradictions found between these CLI change specs and the CLI-level constraints (pass-through GetStatus / TransitionChange / ArchiveChange). Global architecture “CLI does not recompute lifecycle” holds.

---

## 4. Test coverage

### Layout vs verify scenario titles

Dedicated files:

- `packages/cli/test/commands/change/status.spec.ts`
- `packages/cli/test/commands/change/transition.spec.ts`
- `packages/cli/test/commands/change/approve.spec.ts`
- `packages/cli/test/commands/change/archive.spec.ts`

**Most `it()` titles do not match verify.md scenario titles.** Examples: verify “JSON output includes hasTasks in artifactDag” vs test “JSON output includes hasTasks and drift-aware state in artifactDag”; verify “fails clearly…” not used except `--next failures` describe. Coverage is by behaviour, not by title mapping. Agents grepping scenario titles will miss tests.

### cli:change-status

| Scenario (verify)                            | Coverage                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Drafted JSON/text                            | Covered (`isDrafted`, `(drafted)`, no transition commands)                         |
| hasTasks + drift-aware JSON DAG state        | Covered (combined test)                                                            |
| DAG task counts / fallback `[hasTasks]`      | Partial (counts when data present; no explicit fallback-only case)                 |
| Text complete-with-drift                     | **Missing**                                                                        |
| JSON canonical + display                     | Partial (display on DAG state; file canonical+display not asserted together)       |
| Incomplete tasks omit `verifying`            | **Missing** (pass-through; no CLI test)                                            |
| nextAction verify vs implement               | Not in status tests (covered in transition repair guide)                           |
| Artifact-review / drift omit file lists      | Drift covered; artifact-review-required not separate                               |
| Overlap peers in text + JSON `overlapDetail` | Covered                                                                            |
| DEPS_INCONSISTENT + label                    | **Missing** (blockers without `label` only)                                        |
| Schema mismatch warning                      | Covered                                                                            |
| Unknown change                               | Covered                                                                            |
| schema.artifactDag / childrenOf              | Covered                                                                            |
| Text DAG roots/children                      | Partial (simple tree)                                                              |
| Convergent `design` once                     | **Missing**                                                                        |
| No refresh / detector                        | Covered (`refreshImplementationTracking.execute` not called)                       |
| Details `tasks: N/M`                         | Covered                                                                            |
| No standalone `specs:`                       | Covered                                                                            |
| specDependsOn text + JSON                    | Partial (section present; exact `core:a: core:c` / `(none)` fixture not dedicated) |
| `--implementation` SDK projection            | Covered in status + implementation-tracking specs                                  |

### cli:change-transition

| Scenario                                                                          | Coverage                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `--next` → `to: 'next'`                                                           | Covered                                                                                      |
| `--allow-out-of-scope` on/off                                                     | Covered                                                                                      |
| No approval flags / no pending rewrite                                            | Covered                                                                                      |
| HAPPY_PATH next failures (pending-spec-approval, **pending-signoff**, archivable) | Covered                                                                                      |
| Hook fail exit 2, no repair guide, check bus ✗                                    | Covered                                                                                      |
| JSON complete ok/failure stream                                                   | Success covered; structured failure record present in handler, light test coverage vs verify |
| Repair guide on stderr / verify skill                                             | Covered                                                                                      |
| Incomplete tasks                                                                  | Covered (exit 1); “status omitted verifying first” **missing**                               |
| Gerund progress, no `Executing:`                                                  | Covered                                                                                      |
| `--skip-hooks` all / comma-separated                                              | Covered; target.pre vs source.post isolation **not** asserted at CLI (delegated)             |
| stream ≠ `hook-progress`                                                          | Covered                                                                                      |

### cli:change-approve

Signatures, JSON, missing `--reason`, unknown sub-verb, not found, wrong state, execute `{ name, reason }`, stay-in-ready/done messaging: **covered**. Drain pending states: covered as “still allows”. Hashes-from-disk: **implicit** (CLI never passes hashes). `kernel.specs.*` unused: **not asserted**.

### cli:change-archive

Missing name, skip-hooks all/pre/post/combo, allow flags, gerund progress, post-hook exit 2, archive path, invalidated text/JSON, JSON stream complete, not found, not archivable: **covered**. Singular alias: parent alias, not a dedicated archive test. Successful merge into permanent specs: **not** a CLI-unit assertion (delegates to use case).

### Leftover `change.spec.ts`

Still contains `describe('change status')` and `describe('change transition')` overlapping the dedicated files. **Not** artifact-drift. Relocate remaining status/transition cases or delete those describes to finish the layout cleanup.

---

## 5. Summary counts

| Spec                  | Requirements | Implemented |                                                             Partial / risk |      Spec drift |                                                                 Missing tests (verify scenarios) |
| --------------------- | -----------: | ----------: | -------------------------------------------------------------------------: | --------------: | -----------------------------------------------------------------------------------------------: |
| cli:change-status     |           16 |          15 | 1 (OVERLAP_CONFLICT pass-through; DAG `hasTasks` vs `taskCompletionCheck`) | 1 (help schema) | 5 (text drift display, DAG convergent, blocker labels, verifying omitted, `[hasTasks]` fallback) |
| cli:change-transition |           14 |          14 |                                                                          0 |               0 |                                          2 (status-before-verifying; skip-hooks phase isolation) |
| cli:change-approve    |            7 |           7 |                                                                          0 |               0 |                                              2 (`kernel.specs` unused; hashes owned by use case) |
| cli:change-archive    |           10 |          10 |                                                                          0 |               0 |                                                                     1 (singular alias dedicated) |

**Previous HIGH (leftover artifact-drift tests in `change.spec.ts`): RESOLVED.**

**Open findings:** 0 HIGH, 2 MEDIUM (status `OVERLAP_CONFLICT` not filtered; DAG `hasTasks` / text `[drift]` coverage), 3 LOW (leftover duplicate tests, help-schema drift, verify-title mismatch).

**Focus items from the audit brief:** `--next` not a local table — pass; `--allow-out-of-scope` — pass; archive allow flags — pass; status overlap review — pass with MEDIUM filter caveat; HAPPY_PATH_NEXT pending-signoff — pass; test files exist per command but titles do not match verify scenarios; leftover monolith still duplicates non-drift status/transition tests.
