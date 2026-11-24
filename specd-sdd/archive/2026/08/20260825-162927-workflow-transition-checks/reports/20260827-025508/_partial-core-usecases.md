# Spec compliance — core use cases (partial)

Change: `workflow-transition-checks`  
Scope: `core:get-status`, `core:transition-change`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:config` plus depth-1 deps and `default:_global/architecture`.  
Source: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`.  
Code: `packages/core` (read-only). Graph (current, `stale: false`): `GetStatus` (`get-status.ts:281`), `TransitionChange` (`transition-change.ts:109`), `ArchiveChange` (`archive-change.ts:275`), `ApproveSpec` (`approve-spec.ts:30`), `ApproveSignoff` (`approve-signoff.ts:30`), `ValidateArtifacts` (`validate-artifacts.ts:114`), `GetArtifactInstruction` (`get-artifact-instruction.ts:52`).

Locked product (not re-litigated): self-sufficient checks; no snapshot bag (`gatherPredicateSnapshots` absent); stay-in-ready/done; drafts = `projectArtifacts` not `evaluate`; `TransitionChange` requires `transitionBindings` (no ctor default to domain `TRANSITION_BINDINGS`).

Vs previous partial (`reports/20260827-021654/_partial-core-usecases.md`): previously **major** verify gaps for draft parent cascade, empty `checksByTarget` spies, and auto-select of persisted-complete children are **now Implemented** in tests. Previously missing `availableSteps` on GetStatus DTO is **now Implemented**.

Focus checks:

| Check                                                             | Verdict                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus exposes `availableSteps`                                | **Implemented** — `LifecycleContext.availableSteps`; active path copies `verdict.availableSteps`; drafts / schema-miss / unchanged set `[]` |
| Drafts DAG via `projectArtifacts`; missing schema artifacts       | **Implemented** — `_buildDraftedResult` calls `projectArtifacts` only; test projects missing `proposal`                                     |
| Draft `pending-parent-artifact-review` without `evaluate`         | **Implemented** — spy + effectiveStatus assertion                                                                                           |
| Validate `evaluate(..., { checksByTarget: {} })`                  | **Implemented** — code + spy                                                                                                                |
| Validate persisted-complete child blocked by parent review        | **Implemented**                                                                                                                             |
| GetArtifactInstruction empty `checksByTarget`                     | **Implemented** — code + spy                                                                                                                |
| Auto-select ignores persisted complete when parent pending-review | **Implemented** — selects `proposal`                                                                                                        |
| TransitionChange schema miss throws                               | **Implemented** — `SchemaNotFoundError` (no skip-checks path)                                                                               |
| Skip selectors independent                                        | **Implemented** — `target.pre` vs `source.post`; `'all'` still fails incomplete tasks                                                       |
| No persist on pending / approval fail                             | **Implemented** — `_mapFailedPredicate` throws before `mutate`; stay-in-ready/done tests                                                    |
| Approvals stay in ready/done                                      | **Implemented**                                                                                                                             |
| Config Approvals merged vs workspace                              | **Merged matches code**; **workspace `specs/core/config/spec.md` still pending-hop language** (major docs lag until archive)                |

Neither merged spec nor code is assumed always right. Where they diverge, both interpretations are listed.

---

## core:get-status

### Requirements Summary

Merged (workspace + deltas):

1. Input (`name`, optional refresh, `ifModifiedSince`)
2. Result: `change` xor `draftView`, artifact statuses, review, blockers, `nextAction`
3. Revision short-circuit
4. Drafted read-only status: DAG via `projectArtifacts` (same cascade as `evaluate` with empty checks); empty transitions; no mutate commands
5. Implementation-tracking projection
6. Optional pre-read refresh (active only)
7. Drift-aware display status
8. Task counts from `workflow.taskCompletion` details — no second CountTasks, no global snapshot bag
9. Execute matching predicates then project (`executeChecksByLegalTargets` → `evaluate`)
10. `ChangeNotFoundError` for unknown names
11. Constructor: `transitionBindings`; CountTasks not a GetStatus port
12. Config factory via `resolveGetStatusDeps`
13. Effective status cascade
14. Lifecycle: `validTransitions`, `availableTransitions`, **`availableSteps`** (extras-bearing `schema.workflow()` rows), `nextAction`
15. Blockers from failed predicates; `impl.filesResolved` vs `impl.linksInScope` bypass
16. Schema miss degrades (empty hops/checks, no throw)
17. Identifies blockers / factory completeness

### Implementation Status

**Implemented.**

- Active (`_buildActiveResult`): `projectArtifacts` → `executeChecksByLegalTargets(this._transitionBindings, …)` → `evaluate(..., { checksByTarget })` → paint `taskCompletion` via `taskCompletionFromChecks`. `availableSteps = verdict.availableSteps`.
- Draft (`_buildDraftedResult`): `getDraft` only; **`projectArtifacts`, not `evaluate`**; `availableTransitions` / `validTransitions` / `availableSteps` empty; no refresh.
- Constructor args include required `transitionBindings` (no default table).
- Schema miss: catch around `schemaProvider.get()` only; empty `availableSteps`.

### Discrepancies

None critical/major vs **merged** spec.

- **nit:** Some tests still describe CountTasks as “task projection for painting”; painting is from check details. Behaviour matches (CountTasks once inside the check).

### Test Coverage

`packages/core/test/application/use-cases/get-status.spec.ts`:

- Task counts; incomplete implementing tasks omit `verifying` / `INCOMPLETE_TASKS`
- Check rows / `checksByTarget`; `impl.*` bypass; predicate blocker `label` / `checkId`
- Draft empty transitions; **no `evaluate`**; **`pending-parent-artifact-review`**; **missing schema artifacts on DAG**
- Schema provider failure; `ifModifiedSince`
- Composition: `GetStatusDeps.transitionBindings`

Engine (depth-1 `core:lifecycle-engine`): `availableSteps` omits extras-less `implementing` while `validTransitions` includes it (`lifecycle-engine.spec.ts`).

### Missing Tests

- **minor:** GetStatus **active** path does not assert `lifecycle.availableSteps` (only drafts assert `[]`). Extras-vs-protocol contract is covered on the engine, not on this DTO copy.
- **minor:** No spy that CountTasks is not invoked a second time after `evaluate` (implied by constructor + paint helper).

### Spec dependency chain

`core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`, `core:drafted-change-view`.

Aligned with engine extras-vs-protocol split. Workspace `core:config` Approvals still pending-hop until archive (see `core:config`).

`default:_global/architecture`: application use case; I/O via ports; engine remains I/O-free. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 17      |
| Implemented           | 17      |
| Partial               | 0       |
| Missing               | 0       |
| Discrepancies         | 1 nit   |
| Test gaps             | 2 minor |

---

## core:transition-change

### Requirements Summary

1. Input: requested target is persist target; `allowOutOfScope`; `skipHookPhases` skips **effects** only
2. Approval gates baked at construction
3. Change must exist
4. Optional pre-transition refresh
5. Spec approval is a check, not a pending hop — stay in `ready`
6. Signoff is a check, not a pending hop — stay in `done`
7. Pending states drain-only; new work MUST NOT persist pending
8. Direct persist of requested target when predicates pass
9. `workflow.requires` / `workflow.taskCompletion` in the same evaluation
10. Validation clearing `verifying → implementing`
11. Skill-aligned backward hop invalidation
12. Designing from any state
13. `archiving → archivable` recovery (`along=recovery`)
14. Pre/post hooks via matching **effects** (`phase` + skip selector, not `check.id` in the loop)
15. Entity `transition` + event + `mutate`
16. Progress callback
17. Deps: `transitionBindings` **required**; MUST NOT default to domain stub `TRANSITION_BINDINGS`
18. Factory `resolveTransitionChangeDeps`
19. Schema miss MUST throw (not skip checks)

### Implementation Status

**Implemented.**

- `schema = await this._schemaProvider.get()` is not swallowed; tests expect `SchemaNotFoundError`.
- `effectiveTarget = requestedTarget`; no rewrite to pending.
- Predicates: `executeMatchingPredicates(this._transitionBindings, …)` then `evaluate` with `{ [requestedTarget]: evaluation.checks }`.
- Failed `approval.spec` / `approval.signoff` → `InvalidStateTransitionError` `{ type: 'approval-required' }` **before** `mutate`.
- `_assertDrainAndGateTargets` blocks targeting pending when gate off.
- Constructor: `transitionBindings: readonly CheckBinding[]` — no default. Domain `TRANSITION_BINDINGS` remains for matcher tests / stubs only; composition injects registry `create*` bindings.
- `_executeEffect` forwards `skipHookPhases` into check context; does not `switch` on `check.id` to skip. Independent selectors covered by tests (`target.pre` vs `source.post`; `'all'` still runs `workflow.taskCompletion`).

### Discrepancies

- **nit:** Purpose/constraints in merged spec still mention “approval-gate routing … centralized through LifecycleEngine.” Code **projects** check results; routing to pending is gone. Copy leftover, not a runtime bug.
- **minor (use-case vs binding):** `ready → verifying` with spec gate is matched by bindings (`transition-checks.spec.ts`). `TransitionChange` execute tests cover `ready → implementing`, not a dedicated `to: 'verifying'` from `ready` with `approvals.spec: true`. Same predicate path; unproven at this use case.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`:

- Schema miss throws (does not skip checks)
- Stay in `ready` / `done` on approval-required
- Consent then persist requested target
- Drain pending → spec-approved / signed-off
- Reject explicit `to: pending-spec-approval` from ready
- `skipHookPhases` `target.pre` / `source.post` independently
- `'all'` still fails incomplete tasks
- `mutate` on successful persist

Composition: deps include `transitionBindings` (empty array accepted; no silent `TRANSITION_BINDINGS` default).

### Missing Tests

- **minor:** `execute({ to: 'verifying' })` from `ready` with spec gate on — stay in `ready`, `approval-required` (config “any forward leave”).
- **minor:** Spy `mutate` **not** called on approval-required / pending target (state-on-original-object is weaker if `mutate` cloned).

### Spec dependency chain

`core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

Aligned with in-place approval checks. Architecture: use case maps failed checks to typed errors; entity still owns `transition`.

### Counts

|                       | n                     |
| --------------------- | --------------------- |
| Requirements reviewed | 23                    |
| Implemented           | 23                    |
| Partial               | 0                     |
| Missing               | 0                     |
| Discrepancies         | 1 nit, 1 untested hop |
| Test gaps             | 2 minor               |

---

## core:archive-change

### Requirements Summary

Archival pipeline plus deltas: named archive checks (`schema.nameMatch`, `archive.archivable`, `workspace.readOnly`, `deps.consistent`, `impl.*`, `spec.overlap`); effects by binding `phase`; inject `archiveBindings`; **must not keep unused `RunStepHooks` instance field**; ctor param OK for default bindings; `approval.signoff` not an archive binding.

### Implementation Status

**Implemented** for delta-focused items.

- Instance fields include `_archiveBindings`; **no `_runStepHooks`**.
- Ctor `runStepHooks` used only when `archiveBindings` omitted (`defaultArchiveBindings`).
- Schema miss throws (`archive-change.spec.ts`).

### Discrepancies

- **nit:** `ArchiveChangeDeps.runStepHooks` remains **required** even when `archiveBindings` is provided. Spec forbids a stored unused field, not an unused ctor argument. Interpretation A (leftover wiring for defaults) preferred; B (factory still reconstructs a use-case-level hook port) is spec-strict but not a runtime defect.

### Test Coverage

Historical overlap / readonly / impl / hooks / rollback. Schema miss throw exists.

### Missing Tests

- **minor:** Explicit `archiveBindings` + unused/throwing ctor `runStepHooks` mock — predicates/effects must not invoke that mock.
- **minor:** `approval.signoff` not in `ARCHIVE_BINDING_SPECS` (belongs with bindings tests).

### Spec dependency chain

Includes `core:transition-checks`. Consistent with `ARCHIVE_BINDING_SPECS`. Architecture: application orchestration + ports.

### Counts

|                           | n                |
| ------------------------- | ---------------- |
| Requirements reviewed     | 31 (delta focus) |
| Implemented (delta focus) | yes              |
| Discrepancies             | 1 nit            |
| Test gaps                 | 2 minor          |

---

## core:approve-spec

### Requirements Summary

Gate guard; lookup; hashes; **stay in `approval.spec` `from` states (`ready`)**; drain `pending-spec-approval` → `spec-approved`; `mutate`; no hop to pending; factory `contentHasher`.

### Implementation Status

**Implemented.** `boundFromStates('approval.spec')` plus drain; `recordSpecApproval`; `transition('spec-approved')` only if already `pending-spec-approval`. Happy path from `ready` stays `ready`.

### Discrepancies

- **nit:** Ctor param still named `hasher`; composition field `contentHasher`. Mapping is correct.
- **nit:** Describe “not in pending-spec-approval” still uses drafting; merged verify says not in ready or pending. Behaviour matches.

### Test Coverage

Stay in `ready`; drain pending; gate disabled; not-found; schema mismatch before mutate. Composition `contentHasher`.

### Missing Tests

- **minor:** Explicit spy that `transition('pending-spec-approval')` is never called (implied by stay-in-ready).

### Spec dependency chain

`core:transition-checks` for `from` states. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:approve-signoff

### Requirements Summary

Symmetric: stay in `done`; drain `pending-signoff` → `signed-off`; factory `contentHasher`.

### Implementation Status

**Implemented.** Same structure as ApproveSpec.

### Discrepancies

Same nits as ApproveSpec (`hasher` vs `contentHasher`; stale describe).

### Test Coverage

Stay in `done`; drain pending; gate/lookup/mismatch. Composition `contentHasher`.

### Missing Tests

- **minor:** Spy no `transition('pending-signoff')` on happy path.

### Spec dependency chain

`boundFromStates('approval.signoff')` → `['done']`.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:validate-artifacts

### Requirements Summary

Full validation pipeline plus: DAG status / next-artifact from `LifecycleEngine.evaluate` with **empty `checksByTarget`**. Must not run hop predicates / `executeChecksByLegalTargets`. No snapshot bag. Dependency order MUST use **effective** status (persisted `complete` blocked by parent `pending-review`).

### Implementation Status

**Implemented.**

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Empty map ⇒ no hop `execute`. DAG from `projectArtifacts` inside `evaluate`. Parent-review blocks child re-validation (test asserts failure + not `validated`).

### Discrepancies

- **nit:** Spec title says “from engine projectArtifacts” while body mandates `evaluate` with empty `checksByTarget`. Code follows the body. GetStatus drafts call `projectArtifacts` directly; Validate calls `evaluate`. Two call shapes, both specified.

### Test Coverage

- Spy `evaluate(..., { checksByTarget: {} })`
- Persisted complete + parent pending-review → blocked, not marked validated
- Historical validation / persist / invalidation suite

### Missing Tests

- **minor:** No explicit assert that `executeChecksByLegalTargets` is not called (implied by empty map + spy on `evaluate` only).

### Spec dependency chain

Adds `core:transition-checks`. Consistent. Architecture: use case still owns I/O (hash, persist); engine I/O-free.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 24      |
| Implemented           | 24      |
| Discrepancies         | 1 nit   |
| Test gaps             | 1 minor |

---

## core:get-artifact-instruction

### Requirements Summary

Ports, optional `artifactId` → engine `nextArtifact`, schema guard, instruction/template/delta, factory `templateExpander`, plus: `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates; auto-select MUST NOT treat persisted complete as resolved under parent-review blockage.

### Implementation Status

**Implemented.**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

### Discrepancies

- **nit:** Ctor `templates` vs spec/factory `templateExpander`.
- **nit:** Constraint “MUST NOT evaluate hop availability” vs calling full `evaluate` (walks `validTransitions` but skips missing injections). Code matches the **requirement** that names empty `checksByTarget`.

### Test Coverage

- Spy empty `checksByTarget`
- Auto-select first incomplete in topo order
- **Does not auto-select persisted-complete child blocked by parent review** (selects `proposal`)
- All complete → `ArtifactNotFoundError`

### Missing Tests

None **major**. Remaining:

- **minor:** No assert `executeChecksByLegalTargets` unused.

### Spec dependency chain

`core:lifecycle-engine`, `core:transition-checks`. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 9       |
| Implemented           | 9       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:config

### Requirements Summary

This change rewrites **Approvals** only (merged):

- `approvals.spec: true` → cannot take any **forward** leave of `ready` until `ApproveSpec`; stay in `ready`; includes `ready → implementing` and `ready → verifying` when `implementing` omitted; redesign `ready → designing` MUST NOT require the gate.
- `approvals.signoff: true` → stay in `done` until `ApproveSignoff`.
- New work MUST NOT enter pending via `change transition`.
- Defaults false.

Loader still parses booleans; semantics live in bindings + use cases.

### Implementation Status

**Implemented** vs **merged** Approvals:

- Binding `approval.spec` `{ from: 'ready', to: '*', along: 'forward' }`.
- Matcher tests: `ready → verifying` matches; `ready → designing` does not.
- Loader defaults false.

### Discrepancies

- **major — workspace spec vs change (expected until archive):** On-disk `specs/core/config/spec.md` Approvals still documents `pending-spec-approval` / `pending-signoff` hops (`ready` cannot go directly to `implementing`; must enter pending). Merged preview + code follow in-place checks.
  - **A (spec drift):** Anyone reading archived workspace specs today gets the old product.
  - **B (change is truth):** Correct until `specd change archive` replaces the section.
    This audit scores **implementation against merged spec** → not an implementation defect.

No TransitionChange rewrite to pending.

### Test Coverage

`config-loader.spec.ts` booleans. Semantic tests in `transition-checks.spec.ts` / `transition-change.spec.ts` / `lifecycle-engine.spec.ts`. Merged verify “Spec gate on does not require pending-spec-approval in the graph” is bindings + protocol, not config-loader.

### Missing Tests

- **minor:** Docs/config-layer assertion that comments do not mention pending hops (documentation contract). Binding tests already cover verifying vs designing.

### Spec dependency chain

Adds `core:transition-checks`. Merged Approvals consistent with bindings. **Unmerged workspace spec contradicts** the change.

### Counts

|                            | n                                                        |
| -------------------------- | -------------------------------------------------------- |
| Requirements reviewed      | 1 delta (Approvals)                                      |
| Approvals (merged) vs code | Implemented                                              |
| Discrepancies              | 1 major **base-spec vs change** (docs), 0 implementation |
| Test gaps                  | 1 minor                                                  |

---

## Depth-1 deps / architecture (this batch)

Direct deps used by these use cases (`core:transition-checks`, `core:lifecycle-engine`, `core:workflow-model`, `core:schema-format`, `core:composition-resolver`, `core:count-tasks`, `core:hook-execution-model`) are consistent with: self-sufficient `check.execute`; empty `checksByTarget` for DAG-only consumers; hop consumers inject executed predicates; no snapshot bag.

`default:_global/architecture`: layered ports; domain engine I/O-free; use cases own persistence and typed error mapping. No contradiction found for this batch.

---

## Batch summary

| Spec                     | Reqs    | Impl           | Disc.                     | Missing tests |
| ------------------------ | ------- | -------------- | ------------------------- | ------------- |
| get-status               | 17      | 17             | 1 nit                     | 2 minor       |
| transition-change        | 23      | 23             | 1 nit + untested hop      | 2 minor       |
| archive-change           | 31      | delta OK       | 1 nit                     | 2 minor       |
| approve-spec             | 8       | 8              | 2 nits                    | 1 minor       |
| approve-signoff          | 8       | 8              | 2 nits                    | 1 minor       |
| validate-artifacts       | 24      | 24             | 1 nit                     | 1 minor       |
| get-artifact-instruction | 9       | 9              | 2 nits                    | 1 minor       |
| config (Approvals)       | 1 delta | matches merged | 1 major workspace-doc lag | 1 minor       |

**Focus checks:** all **code-compliant** with merged specs. Previously major **test** gaps in this batch are closed. Highest remaining finding is **unarchived workspace config Approvals** (docs), not missing runtime behaviour.

**Severity rollup (this batch):** critical 0; major 1 (workspace config docs vs merged); minor 11; nit 11.
