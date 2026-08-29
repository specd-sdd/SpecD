# Partial Compliance Report — CLI (`cli:change-status`, `cli:change-transition`, `cli:change-archive`, `cli:change-approve`)

- **Change:** `workflow-transition-checks` (`20260825-162927-workflow-transition-checks`)
- **Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`
- **Date:** 2026-08-28 12:17
- **Mode:** read-only spec-compliance audit (no files modified)
- **Spec source:** `node packages/cli/dist/index.js change spec-preview workflow-transition-checks <specId>` (merged spec + verify, deltas applied)
- **Focus:** Recorte 26 + latest (`--next`, `--allow-out-of-scope`, test-file layout, status overlap/review rendering)

---

## 1. Requirements

Merged (post-delta) requirement inventory for the four audited specs.

### `cli:change-status` — 16 requirements

| #   | Requirement                                        | Key MUSTs relevant to this change                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                                  | `<name>` positional, `--format`                                                                                                                                                                                                                                                                                                                                  |
| 2   | Drafted change status is read-only                 | no mutating transitions, `isDrafted: true`                                                                                                                                                                                                                                                                                                                       |
| 3   | Output format                                      | `artifactDag[].hasTasks`; `state` = drift-aware display projection                                                                                                                                                                                                                                                                                               |
| 4   | Task completion display in DAG                     | `[hasTasks - N/M done]` / fallback `[hasTasks]`                                                                                                                                                                                                                                                                                                                  |
| 5   | Display-state rendering                            | `complete-with-drift`; `missing` unchanged                                                                                                                                                                                                                                                                                                                       |
| 6   | Lifecycle projections come from GetStatus checks   | no local `VALID_TRANSITIONS` re-filter                                                                                                                                                                                                                                                                                                                           |
| 7   | **Text status omits duplicated review file lists** | `review:` header with `required`/`route`/`reason`/`message`; **no** `affectedArtifacts` paths; **invalidation overlap MUST NOT appear as `OVERLAP_CONFLICT` blocker**; overlap peers printed when `reason='spec-overlap-conflict'` and `overlapDetail` non-empty; JSON/TOON serialize full `review` incl. `overlapDetail`; `--help` schema lists `overlapDetail` |
| 8   | Text blockers include check labels                 | `! <CODE> — <label>: <message>`; JSON serializes `label` + `checkId`                                                                                                                                                                                                                                                                                             |
| 9   | Schema version warning                             | compare against `lifecycle.schemaInfo`, skip when `null`                                                                                                                                                                                                                                                                                                         |
| 10  | Change not found                                   | exit 1                                                                                                                                                                                                                                                                                                                                                           |
| 11  | Schema-derived fields                              | `schema.artifactDag` from `schema.artifactDag()`; `childrenOf`; convergent nodes rendered once                                                                                                                                                                                                                                                                   |
| 12  | Delegates refresh policy to GetStatus              | no direct `RefreshImplementationTracking` / `ImplementationDetector`                                                                                                                                                                                                                                                                                             |
| 13  | Implementation section                             | `--implementation` renders `sdk:build-implementation-review` projection                                                                                                                                                                                                                                                                                          |
| 14  | Task completion in details section                 | `tasks: N/M`                                                                                                                                                                                                                                                                                                                                                     |
| 15  | Basic info section                                 | no standalone `specs:` line                                                                                                                                                                                                                                                                                                                                      |
| 16  | Specs and dependencies section                     | `specs and dependencies:` block + `specDependsOn` in JSON                                                                                                                                                                                                                                                                                                        |

### `cli:change-transition` — 14 requirements

| #   | Requirement                                  | Key MUSTs relevant to this change                                                                                                                                                                                                                    |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Command signature**                        | `[step]` optional; **`--next` MUST pass `to: 'next'`**; **`--allow-out-of-scope` MUST pass `allowOutOfScope: true`, applies only to `impl.linksInScope`, MUST NOT bypass `impl.filesResolved`; when omitted the CLI MUST NOT set `allowOutOfScope`** |
| 2   | **Next-transition resolution**               | Core resolves happy path; **CLI MUST NOT maintain a from→to routing table**; MUST NOT use `GetStatus.nextAction` as resolution; Core rejection ⇒ exit 1 + `error:`                                                                                   |
| 3   | Delegates refresh policy to TransitionChange | pre-transition and repair-guide `GetStatus` with `refreshImplementationTracking: false`                                                                                                                                                              |
| 4   | Approval-gate routing                        | no approval flags on execute input; no `implementing→pending-spec-approval` rewrite                                                                                                                                                                  |
| 5   | Hook execution                               | `--skip-hooks` ⇒ `skipHookPhases` set                                                                                                                                                                                                                |
| 6   | Progress output                              | shared check bus; `stream: "change-transition"`; no `hook-progress`                                                                                                                                                                                  |
| 7   | Transition hook observability                | progress surfaced before failure                                                                                                                                                                                                                     |
| 8   | Shared hook progress presentation            | distinct public stream names                                                                                                                                                                                                                         |
| 9   | Output on success                            | text confirmation; structured terminal `complete` record                                                                                                                                                                                             |
| 10  | Post-hook failure warning                    | fail-fast, exit 2                                                                                                                                                                                                                                    |
| 11  | Invalid transition error                     | Repair Guide on **stderr**; `! <CODE> — <label>: <msg>`; `HookFailedError` no guide, exit 2; structured failure `complete` record with `result: "failure"`, `blockers`, `nextAction`; `--next` rejection explains why                                |
| 12  | Incomplete tasks error                       | exit 1 naming blocking artifact                                                                                                                                                                                                                      |
| 13  | Check progress rendering                     | gerund labels, no `Executing:` prefix                                                                                                                                                                                                                |
| 14  | Unsatisfied requires error                   | exit 1                                                                                                                                                                                                                                               |

### `cli:change-archive` — 10 requirements

Command signature (incl. **`--allow-overlap`** and **`--allow-out-of-scope` for `impl.linksInScope`**), Prerequisites, Behaviour, Hook execution, Check progress rendering, Post-archive hooks, Output on success, Output on success (extended), JSON output on success, Error cases.

### `cli:change-approve` — 7 requirements

Command signatures, Delegates gate state to kernel, Artifact hash computation, Approve spec behaviour, Approve signoff behaviour, Output on success, Error cases.

**Total requirements audited: 47.**

---

## 2. Implementation

### 2.1 `--next` → `to: 'next'`, no CLI HAPPY_PATH table — COMPLIANT

`packages/cli/src/commands/change/transition.ts:255-256`

```ts
const requestedTarget: ChangeState | 'next' = opts.next === true ? 'next' : (step as ChangeState)
```

- The value is forwarded verbatim at `transition.ts:261-269`.
- Repo-wide search for a CLI-side routing table returns **zero** hits inside `packages/cli`. `HAPPY_PATH_NEXT` lives only in Core:
  - `packages/core/src/domain/value-objects/change-state.ts:49`
  - consumed at `packages/core/src/application/use-cases/transition-change.ts:181`
  - exported via `packages/core/src/public.ts:455`
- Rejection path: `HappyPathNextUnavailableError` (`packages/core/src/domain/errors/happy-path-next-unavailable-error.ts`) is imported by the CLI test suite and surfaces via `handleError`.
- Mutual exclusion and "either `<step>` or `--next`" validation at `transition.ts:112-128`.
- `GetStatus.nextAction` is used **only** for the repair guide (`transition.ts:88-102`), never for target resolution. Compliant with Req 2.

### 2.2 `transition --allow-out-of-scope` forwarding — COMPLIANT

`packages/cli/src/commands/change/transition.ts:266`

```ts
...(opts.allowOutOfScope === true ? { allowOutOfScope: true } : {}),
```

Conditional spread means the key is **absent** (not `undefined`) when the flag is omitted, satisfying "MUST NOT set `allowOutOfScope` on the execute input".

Help text (`transition.ts:204-207`):
`permit the hop when implementation links resolve outside the change scope (impl.linksInScope)` — names `impl.linksInScope` only, matching the spec. It does not claim to bypass `impl.filesResolved`.

### 2.3 `archive --allow-overlap` / `--allow-out-of-scope` — COMPLIANT

`packages/cli/src/commands/change/archive.ts:57-62` registers both flags; `archive.ts:100-101` forwards both with the same conditional-spread pattern. Help text names `impl.linksInScope`.

### 2.4 Docs vs help vs spec — COMPLIANT

- `docs/cli/cli-reference.md:166` — `--next`: "Resolve the next logical lifecycle target from the current state. Mutually exclusive with `<step>`."
- `docs/cli/cli-reference.md:167` — transition `--allow-out-of-scope`: "…outside the change scope (`impl.linksInScope`). **Does not bypass open tracked files.**"
- `docs/cli/cli-reference.md:577` — archive prose: "The flag does not bypass unresolved tracked files (`impl.filesResolved`)."
- `docs/cli/cli-reference.md:590` — archive flag row: "Does not bypass open tracked files."

Docs, `--help`, and spec agree that the flag is scoped to `impl.linksInScope` only.

### 2.5 `change status` — invalidation overlap rendering — COMPLIANT

- Review header block: `packages/cli/src/commands/change/status.ts:249-258` prints `review:` with `required` / `route` / `reason`, plus `message` only when Core supplies a non-empty string. It never prints `affectedArtifacts` paths.
- Overlap peers: `status.ts:330-342` prints an `overlap:` section only when `review.required && reason === 'spec-overlap-conflict' && overlapDetail.length > 0`, one bullet per peer with archived change name and spec ids.
- No `OVERLAP_CONFLICT` synthesis in the CLI: the blockers section (`status.ts:237-247`) renders `blockers` verbatim from Core; there is **zero** occurrence of the literal `OVERLAP_CONFLICT` anywhere in `packages/cli/src`. Suppression for non-archivable states is enforced in Core (`packages/core/src/application/use-cases/get-status.ts:752`, `packages/core/src/domain/services/lifecycle-engine.ts:773-780`).
- Structured output: `status.ts:450-464` always serializes `review` with `overlapDetail` and `affectedArtifacts`.
- `--help` JSON schema lists `overlapDetail` alongside `affectedArtifacts` (`status.ts:121-125`). Satisfies Req 7 in full.

### 2.6 `change approve` — COMPLIANT

`packages/cli/src/commands/change/approve.ts:40-43` and `:78-81` call `kernel.changes.approveSpec` / `kernel.changes.approveSignoff` with exactly `{ name, reason }`. No gate flags, no hashes. Help text uses bound-`from` language ("a change in ready", "a change in done", with pending states noted as drain-only) per Reqs 4 and 5.

### 2.7 Test suite execution

`npx vitest run test/commands/change.spec.ts test/commands/change/` (in `packages/cli`) — **PASS 174 / FAIL 0**.

---

## 3. Discrepancies

### D1 — HIGH — Leftover `packages/cli/test/commands/change.spec.ts` was not deleted despite task 26.5 being marked complete

`specd-sdd/.../tasks.md:776-779` (task 26.5, marked `[x]`):

> `packages/cli/test/commands/change/`, hook skip tests
> Approach: **merge/delete flat `change-*.spec.ts` duplicates**; assert `source.pre`/`target.post` skip are no-ops

`git status` shows the intended moves happened:

```
RM packages/cli/test/commands/change-approve.spec.ts   -> packages/cli/test/commands/change/approve.spec.ts
RM packages/cli/test/commands/change-archive.spec.ts   -> packages/cli/test/commands/change/archive.spec.ts
RM packages/cli/test/commands/change-status.spec.ts    -> packages/cli/test/commands/change/status.spec.ts
RM packages/cli/test/commands/change-transition.spec.ts-> packages/cli/test/commands/change/transition.spec.ts
 D packages/cli/test/commands/change/change-status.spec.ts
 M packages/cli/test/commands/change.spec.ts
```

But `packages/cli/test/commands/change.spec.ts` (38.8K, 58 tests) survives and still contains duplicate suites for commands that now own dedicated files:

| Describe in `change.spec.ts` | Line    | Canonical file that also covers it            |
| ---------------------------- | ------- | --------------------------------------------- |
| `change list`                | 69      | `test/commands/change-list.spec.ts`           |
| `change create`              | 182     | `test/commands/change-create.spec.ts`         |
| **`change status`**          | **375** | **`test/commands/change/status.spec.ts`**     |
| **`change transition`**      | **642** | **`test/commands/change/transition.spec.ts`** |
| `change draft`               | 900     | `test/commands/change-draft.spec.ts`          |
| `change discard`             | 1034    | `test/commands/change-discard.spec.ts`        |
| `drafts restore`             | 1181    | `test/commands/drafts-restore.spec.ts`        |

Violates `_global:spec-layout` / `_global:testing` mirror-src layout intent and re-introduces the duplication the task set out to remove. Task 26.5 should not be `[x]`.

### D2 — HIGH — Deleting `change.spec.ts` would silently drop the only coverage of two `cli:change-status` verify scenarios

The `artifact-drift` review-rendering tests were **modified by this change** but live in the file slated for deletion. `git diff packages/cli/test/commands/change.spec.ts` (+6 / −2):

```
- it('renders review output with absolute file paths in text mode', …)
+ it('given artifact drift, when text status renders, then omits duplicated review file paths', …)
…
-    expect(out).toContain('/project/.specd/changes/add-login/tasks.md')
+    expect(out).toContain('required: yes')
+    expect(out).toContain('reason:   artifact-drift')
+    expect(out).not.toContain('/project/.specd/changes/add-login/tasks.md')
+    expect(out).toContain('artifacts (details):')
+    expect(out).toContain('tasks.md')
```

`packages/cli/test/commands/change/status.spec.ts` has **no** `artifact-drift` test (its only three `review:` fixtures — lines 650, 705, 745 — are all `spec-overlap-conflict`). So scenarios _"Artifact-review-required does not reprint files under review"_ and _"Drift is shown only in artifacts details"_ would become uncovered the moment D1 is fixed. These tests must be **migrated**, not just deleted.

### D3 — MEDIUM — Task 26.5's "`source.pre`/`target.post` skip are no-ops" assertion was never written

Search for `source.pre` / `target.post` / `no-op` in `test/commands/change/transition.spec.ts` and `test/commands/change.spec.ts` returns **0 matches**. The `--skip-hooks` suite (`transition.spec.ts:723-832`) only covers `all`, the empty default, and the comma pair `target.pre,source.post`. Task 26.5 is marked `[x]` for work that does not exist.

### D4 — LOW — Structured failure `complete` record for transition is implemented but untested

`transition.ts:298-311` emits `result: "failure"` with `blockers` and `nextAction`. No test asserts it (`grep -i failure` on `transition.spec.ts`: 0 matches). Corresponds to verify scenario _"Structured failure result is emitted as terminal complete record"_. See M8.

### D5 — LOW (observation) — Structured failure record reports `to: "next"` rather than the resolved state

`transition.ts:307` uses `to: requestedTarget`. When `--next` is used and Core rejects the hop, the machine-readable record carries the literal string `"next"` instead of a concrete `ChangeState`. The spec text for the failure record only says `to`, so this is not a violation, but it is an inconsistency with the success record (`transition.ts:282`, which uses `result.change.state`) and worth an explicit spec sentence or a normalization.

### D6 — LOW (pre-existing, out of change scope) — `change-artifacts.spec.ts` exists in both directories

`packages/cli/test/commands/change-artifacts.spec.ts` (7.5K) and `packages/cli/test/commands/change/change-artifacts.spec.ts` (6.4K). Neither is touched by this change (last touched by `bbeee9f5` / `3eb460a6`), and the nested copy carries a redundant `change-` prefix inside `change/`. Flagged only because it is the same class of layout debt D1 addresses.

**No discrepancies found for the four Recorte-26 focus items themselves** (`--next` forwarding, `--allow-out-of-scope` forwarding/omission, docs vs help vs spec, status overlap/review rendering). All are implemented exactly as specified.

---

## 4. Tests (present and passing)

### `cli:change-transition` — `packages/cli/test/commands/change/transition.spec.ts` (34.8K)

Focus-item tests **exist and pass**:

| Verify scenario                                                                   | Test                                                                                           | Line                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| Allow-out-of-scope is forwarded to execute                                        | `it('Allow-out-of-scope is forwarded to execute')` → `expect(call.allowOutOfScope).toBe(true)` | 90-114                                        |
| Allow-out-of-scope is omitted by default                                          | `it('Allow-out-of-scope is omitted by default')` → `toBeUndefined()`                           | 116-132                                       |
| Transition execute omits approval flags                                           | asserts `allowOutOfScope` undefined + no `approvals*` keys                                     | 134-157                                       |
| Next flag resolves target without positional step                                 | asserts `to: 'next'`                                                                           | 64-88                                         |
| Next flag cannot be combined with explicit step                                   | `/mutually exclusive/`                                                                         | 51-62                                         |
| Missing arguments                                                                 | `/either <step> or --next is required/`                                                        | 40-49                                         |
| Next from ready → implementing, stays out of pending                              | 207-229                                                                                        |
| Next from signed-off → archivable (`to: 'next'`)                                  | 231-249                                                                                        |
| Next fails in pending-spec-approval / pending-signoff / archivable                | 647 / 672 / 697                                                                                |
| CLI does not keep a from→to next table                                            | `to: 'next'` assertions at 84, 224, 246                                                        |
| Pre-transition + repair-guide `GetStatus` skip refresh                            | `toHaveBeenNthCalledWith(1                                                                     | 2, { refreshImplementationTracking: false })` | 605-612 |
| No direct refresh call                                                            | 78, 604                                                                                        |
| Repair Guide on stderr, not stdout                                                | 596-603                                                                                        |
| Approval-required reason in stderr                                                | `/waiting for human signoff/`                                                                  | 642                                           |
| `HookFailedError` ⇒ exit 2, no repair guide                                       | 253-272                                                                                        |
| Hook progress before failure, `✗` mark, no `Executing:`                           | 274-333                                                                                        |
| Structured success `complete` record + no `hook-progress` stream                  | 403-439                                                                                        |
| Liveness for quiet hook (`still running (5s)`)                                    | 472, 497                                                                                       |
| Predicate gerund label without `Executing:`                                       | 502                                                                                            |
| `--skip-hooks all` / default empty / comma pair                                   | 724 / 752 / 770                                                                                |
| Incomplete tasks; skip-hooks does not bypass task checks                          | 835 / 866                                                                                      |
| Repair guide recommends verify                                                    | 911                                                                                            |
| Typed failures: ReadOnly / ArchiveDependencyMismatch / ArchiveImplementationState | 942 / 980 / 1008                                                                               |

### `cli:change-archive` — `packages/cli/test/commands/change/archive.spec.ts` (16.1K)

Argv tests for both new flags **exist and pass**:

| Verify scenario                                            | Test                                                                                                        | Line    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `--allow-overlap` forwarded                                | `it('passes allowOverlap when --allow-overlap is set')`                                                     | 354     |
| `--allow-out-of-scope` forwarded                           | `it('passes allowOutOfScope when --allow-out-of-scope is set')` → `expect(call.allowOutOfScope).toBe(true)` | 377-398 |
| Both omitted by default                                    | `it('omits allowOverlap and allowOutOfScope when those flags are not set')` → both `toBeUndefined()`        | 400-423 |
| `--skip-hooks` all / pre / post / pre,post / default       | 230 / 254 / 277 / 300 / 331                                                                                 |
| Check progress gerund label, no `Executing:`               | 425                                                                                                         |
| Hook progress on same bus (`Running pre hooks (hook.pre)`) | 478                                                                                                         |
| JSON stream: check-progress then terminal `complete`       | 112                                                                                                         |
| `invalidatedChanges` text + JSON                           | 147 / 172                                                                                                   |
| Post-hook failure ⇒ exit 2                                 | 64                                                                                                          |
| Not found / missing name / not archivable                  | 195 / 207 / 215                                                                                             |

### `cli:change-status` — `packages/cli/test/commands/change/status.spec.ts` (29.2K)

| Verify scenario                                                                | Test                                                                                                                                                            | Line    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Overlap peers in text, review header, no file paths, **no `OVERLAP_CONFLICT`** | `expect(out).not.toContain('OVERLAP_CONFLICT')` at 683; `overlap:` / `archived: beta…` / `archived: alpha…` at 685-687; `message:` at 682; path negative at 684 | 639-688 |
| JSON includes `overlapDetail`                                                  | 690                                                                                                                                                             |
| JSON `overlapDetail` empty for non-overlap reasons                             | 734                                                                                                                                                             |
| Drafted read-only (text + JSON `isDrafted`)                                    | 62 / 89                                                                                                                                                         |
| `complete-with-drift` display projection                                       | 440 / 464                                                                                                                                                       |
| `[hasTasks - 3/10 done]`                                                       | 821                                                                                                                                                             |
| `artifactDag.children` = `childrenOf`                                          | 355                                                                                                                                                             |
| Schema mismatch warning                                                        | 592                                                                                                                                                             |
| Not found                                                                      | 625                                                                                                                                                             |
| `--implementation` projection                                                  | 468 / 519                                                                                                                                                       |
| `specs and dependencies:` header                                               | 166                                                                                                                                                             |

### `cli:change-approve` — `packages/cli/test/commands/change/approve.spec.ts` (10.0K)

All 12 verify scenarios have a matching test (call shape `{ name, reason }`, `kernel.changes.*` routing, ready/done success, drain from pending states, missing `--reason`, unknown sub-verb, not found, JSON output). No gaps.

---

## 5. Missing Tests

Ordered by severity. None of these block the four focus items, but M1/M2 are follow-ups to the D1/D2 cleanup.

| #   | Spec                    | Verify scenario                                                               | Sev  | Note                                                                                                                                                                                                                                        |
| --- | ----------------------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `cli:change-status`     | Artifact-review-required does not reprint files under review                  | HIGH | Only in the to-be-deleted `change.spec.ts:514`; must migrate to `change/status.spec.ts`                                                                                                                                                     |
| M2  | `cli:change-status`     | Drift is shown only in artifacts details                                      | HIGH | Same file, same fate                                                                                                                                                                                                                        |
| M3  | `cli:change-transition` | `--skip-hooks target.pre` skips only pre hooks                                | MED  | Only the comma pair is tested; single-phase argv untested (also task 26.5)                                                                                                                                                                  |
| M4  | `cli:change-transition` | `--skip-hooks source.post` skips only post hooks                              | MED  | Same                                                                                                                                                                                                                                        |
| M5  | `cli:change-status`     | `DEPS_INCONSISTENT` blocker shows `Checking spec dependencies`                | MED  | `status.ts:241` implements `! <CODE> — <label>: <msg>`; the only blocker test (`status.spec.ts:244-268`) uses a label-less `MISSING_ARTIFACT`. No test asserts the em-dash label form, and none asserts JSON `blockers[].label` / `checkId` |
| M6  | `cli:change-transition` | Repair guide renders `! <CODE> — <label>`                                     | MED  | `transition.ts:92` implements it; `transition.spec.ts:600` only asserts the label-less branch                                                                                                                                               |
| M7  | `cli:change-transition` | Next flag advances `designing` to `ready`                                     | LOW  | `drafting→designing`, `ready→implementing`, `signed-off→archivable` covered; `designing→ready` not                                                                                                                                          |
| M8  | `cli:change-transition` | Structured failure result is emitted as terminal complete record              | LOW  | See D4                                                                                                                                                                                                                                      |
| M9  | `cli:change-transition` | Requires blocker is surfaced to the user                                      | LOW  | `requires-check` rendering (`transition.ts:157-165`) has no test                                                                                                                                                                            |
| M10 | `cli:change-transition` | Status omitted `verifying` before the failed transition                       | LOW  | Cross-command scenario; not asserted in `status.spec.ts` either                                                                                                                                                                             |
| M11 | `cli:change-status`     | Incomplete tasks do not list `verifying` as available                         | LOW  | `status.spec.ts:201/223` cover the transitions line generically, not this negative case                                                                                                                                                     |
| M12 | `cli:change-status`     | `nextAction` implements-vs-verify follows GetStatus                           | LOW  | No test asserts `/specd-verify` passthrough                                                                                                                                                                                                 |
| M13 | `cli:change-status`     | Text DAG does not repeat convergent nodes                                     | LOW  | No `(see … above)` / single-render assertion                                                                                                                                                                                                |
| M14 | `cli:change-status`     | Text output shows specs and dependencies (`core:a: core:c`, `core:b: (none)`) | LOW  | Header asserted at 166; the dep/`(none)` rows are not                                                                                                                                                                                       |
| M15 | `cli:change-status`     | JSON output includes `specDependsOn`                                          | LOW  | Fixtures set it; no assertion on the serialized field                                                                                                                                                                                       |
| M16 | `cli:change-status`     | Discarded name is not found via change status                                 | LOW  | Generic not-found covered; discarded-specific not                                                                                                                                                                                           |
| M17 | `cli:change-archive`    | Singular alias invocation (`change archive` ≡ `changes archive`)              | LOW  | Alias registered at `packages/cli/src/index.ts:125-126`; no test in `archive.spec.ts` and no `alias` assertion in `list-commands.spec.ts`                                                                                                   |
| M18 | `cli:change-transition` | Text mode preserves completed hook history                                    | LOW  | Implicit in the presenter's append-only writes; no dedicated assertion                                                                                                                                                                      |
| M19 | —                       | `_check-progress-presenter.ts` has no unit spec                               | LOW  | `_hook-progress-presenter.spec.ts` exists; the newer shared presenter is only covered indirectly through `transition.spec.ts` / `archive.spec.ts`                                                                                           |

---

## 6. Counts

### Requirements

| Spec                    | Requirements | Compliant | Partial | Violated |
| ----------------------- | ------------ | --------- | ------- | -------- |
| `cli:change-status`     | 16           | 16        | 0       | 0        |
| `cli:change-transition` | 14           | 14        | 0       | 0        |
| `cli:change-archive`    | 10           | 10        | 0       | 0        |
| `cli:change-approve`    | 7            | 7         | 0       | 0        |
| **Total**               | **47**       | **47**    | **0**   | **0**    |

### Verify scenarios

| Spec                    | Scenarios | Covered        | Missing                        |
| ----------------------- | --------- | -------------- | ------------------------------ |
| `cli:change-status`     | 36        | 26             | 10 (2 of them at-risk: M1, M2) |
| `cli:change-transition` | 45        | 38             | 7                              |
| `cli:change-archive`    | 17        | 16             | 1                              |
| `cli:change-approve`    | 12        | 12             | 0                              |
| **Total**               | **110**   | **92 (83.6%)** | **18**                         |

### Discrepancies

| Severity  | Count | IDs                                         |
| --------- | ----- | ------------------------------------------- |
| HIGH      | 2     | D1, D2                                      |
| MEDIUM    | 1     | D3                                          |
| LOW       | 3     | D4, D5, D6 (D6 pre-existing / out of scope) |
| **Total** | **6** |                                             |

### Missing tests

| Severity  | Count  |
| --------- | ------ |
| HIGH      | 2      |
| MEDIUM    | 4      |
| LOW       | 13     |
| **Total** | **19** |

### Test execution

`packages/cli` → `vitest run test/commands/change.spec.ts test/commands/change/` → **174 passed, 0 failed**.

### Focus-item verdict

| Focus item                                                                        | Verdict               |
| --------------------------------------------------------------------------------- | --------------------- |
| `--next` → `to: 'next'`, no CLI HAPPY_PATH table                                  | PASS                  |
| `transition --allow-out-of-scope` forwards `allowOutOfScope: true`                | PASS                  |
| Flag omitted ⇒ key absent from execute input                                      | PASS                  |
| Docs / `--help` vs spec (`impl.linksInScope` only)                                | PASS                  |
| Tests for new transition verify scenarios (forwarded / omitted)                   | PASS                  |
| `archive --allow-overlap` / `--allow-out-of-scope` argv tests                     | PASS                  |
| Leftover `change.spec.ts` vs `change/{status,transition,archive,approve}.spec.ts` | **FAIL** (D1, D2, D3) |
| Status: review header/message/overlap peers; no `OVERLAP_CONFLICT` in `designing` | PASS                  |
