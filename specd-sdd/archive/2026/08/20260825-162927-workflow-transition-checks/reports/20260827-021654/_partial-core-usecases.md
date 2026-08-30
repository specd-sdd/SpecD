# Spec compliance — core use cases (partial)

Change: `workflow-transition-checks`  
Scope: `core:get-status`, `core:transition-change`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:config`  
Source of truth for this audit: `specd changes spec-preview workflow-transition-checks <specId>` (merged spec + verify).  
Code: `packages/core` (read-only). Graph: `GetStatus` (`get-status.ts:278`), `TransitionChange` (`transition-change.ts:109`), `ArchiveChange` (`archive-change.ts:275`), `ApproveSpec` (`approve-spec.ts:30`), `ApproveSignoff` (`approve-signoff.ts:30`), `ValidateArtifacts` (`validate-artifacts.ts:114`), `GetArtifactInstruction` (`get-artifact-instruction.ts:52`).

Focus checks requested by the parent audit:

| Check                                                                    | Verdict                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GetStatus paints `taskCompletion` from checks                            | **Implemented** — `taskCompletionFromChecks(checksByTarget)` after `executeChecksByLegalTargets`; CountTasks is not a GetStatus constructor port |
| Drafts use `projectArtifacts` not `evaluate`                             | **Implemented** — `_buildDraftedResult` calls `this._lifecycle.projectArtifacts(source, schema)` only                                            |
| ArchiveChange has no unused stored `RunStepHooks` field                  | **Implemented** — ctor param used only for `defaultArchiveBindings`; instance fields do not include `_runStepHooks`                              |
| Validate / GetArtifactInstruction `evaluate` with empty `checksByTarget` | **Implemented** — both pass `{ checksByTarget: {} }`                                                                                             |
| Approvals stay in `ready` / `done`                                       | **Implemented** — record history; transition only on drain pending states                                                                        |
| Config spec gate is any **forward** leave of `ready`                     | **Implemented** — `approval.spec` binding `from=ready, to=*, along=forward`; redesign `ready → designing` does not match                         |

Neither merged spec nor code is assumed always right. Where they diverge, both interpretations are listed.

---

## core:get-status

### Requirements Summary

Merged requirements (workspace spec + change deltas):

1. Accepts a change name as input
2. Returns the change and its artifact statuses
3. Revision evaluation for conditional status queries (`ifModifiedSince`)
4. Drafted change read-only status (`getDraft`; DAG via `projectArtifacts`; empty transitions)
5. Implementation status projection
6. Optional pre-read implementation tracking refresh (active changes only)
7. Drift-aware display status
8. Reports task completion counts for task-capable artifacts **from `workflow.taskCompletion` details; no second CountTasks; no global snapshot bag**
9. **Execute matching predicates then project** (added)
10. Throws `ChangeNotFoundError` for unknown changes
11. Constructor dependencies (`transitionBindings` / `create*`; **must not** take `CountTasks`)
12. Config-based factory preserves complete repository bootstrap
13. Reports effective status for every artifact
14. Returns lifecycle context (check-derived `availableTransitions` / `nextAction`)
15. Identifies blockers (failed predicates + review codes; `impl.filesResolved` vs `impl.linksInScope` bypass)
16. Graceful degradation when schema resolution fails
17. Config-based factory delegates through `resolveGetStatusDeps`

### Implementation Status

**Implemented** against merged spec.

- Active path (`get-status.ts` `_buildActiveResult`): `projectArtifacts` → `executeChecksByLegalTargets` → `lifecycle.evaluate(..., { checksByTarget })` → paint `taskCompletion` from `workflow.taskCompletion` details (`taskCompletionFromChecks`). CountTasks is composed inside `createWorkflowTaskCompletion` / registry, not a GetStatus field.
- Draft path (`_buildDraftedResult`): `getDraft` only; **`projectArtifacts`, not `evaluate`**; `availableTransitions`/`validTransitions` empty; `nextAction.command` null; no `change` on result (`draftView` instead); no refresh.
- Constructor: `changes`, `schemaProvider`, `approvals`, `refresh`, `lifecycle`, `transitionBindings` — no `CountTasks`.
- Schema miss: catch around `schemaProvider.get()` only; check `execute` is not inside that catch.
- Blocker merge: failed predicates flattened; `--allow-out-of-scope` only when `IMPLEMENTATION_STATE` **and** `impl.linksInScope`.

### Discrepancies

None **critical/major** vs merged spec.

- **nit — naming:** Tests still say “delegates task projection to CountTasks for artifact painting.” Code paints from check details; CountTasks runs inside the check `execute`. Spec forbids a second CountTasks after evaluate; tests assert `countTasks.execute` once **before** `evaluate`. Behaviour matches; comments/test titles lag.

### Test Coverage

Covered in `packages/core/test/application/use-cases/get-status.spec.ts` (and composition factory tests):

- Task counts painted; CountTasks once before `evaluate`; incomplete implementing tasks omit `verifying` and emit `INCOMPLETE_TASKS`
- Check rows / `checksByTarget`
- `impl.linksInScope` vs `impl.filesResolved` bypass
- Predicate blocker `label` / `checkId`
- Draft empty transitions; skip refresh on drafts
- Schema provider failure → empty checks
- `ifModifiedSince` short-circuit
- Composition: `resolveGetStatusDeps` includes `transitionBindings`

### Missing Tests

- **major (verify gap):** Merged verify scenario “Drafted status DAG-projects effective status” (`pending-parent-artifact-review` on a dependent artifact when parent is `pending-review`). Existing draft test only asserts empty transitions / `draftView`. Implementation uses `projectArtifacts`, which is the specified cascade, but the parent-review outcome is unasserted.
- **minor:** No explicit assert that draft path **does not** call `evaluate` (only that transitions are empty).
- **minor:** No assert that GetStatus does not gather a typed global snapshot bag (covered indirectly by constructor/registry tests).

### Spec dependency chain

`core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`, `core:drafted-change-view`.

No contradiction with those deps for the status projection model. Workspace `core:config` Approvals section is still pending-hop language until this change is archived (see `core:config`).

### Counts

|                       | n                |
| --------------------- | ---------------- |
| Requirements reviewed | 17               |
| Implemented           | 17               |
| Partial               | 0                |
| Missing               | 0                |
| Discrepancies         | 1 nit            |
| Test gaps             | 1 major, 2 minor |

---

## core:transition-change

### Requirements Summary

Merged (rename + add from deltas):

1. Input contract (requested target is persist target; `allowOutOfScope`; skip effects only)
2. Approval gates baked at construction
3. Change must exist
4. Optional pre-transition implementation tracking refresh
5. **Spec approval is a check not a pending hop** (was routing to `pending-spec-approval`)
6. **Signoff is a check not a pending hop**
7. Human-approval pending states drain-only
8. Direct transition when gates inactive (persist requested target)
9. Workflow requires = `workflow.requires` predicate (no second walk)
10. Task completion = `workflow.taskCompletion` in same evaluation
11. Artifact validation clearing on `verifying → implementing`
12. **Skill-aligned backward hop invalidation** (added)
13. Transition to designing from any state
14. `archiving → archivable` is `along=recovery` (skip requires/taskCompletion/source.post)
15. Pre-hook = target `hook.pre` after predicates (`RunStepHooks` inside check)
16. Transition delegation / entity `transition`
17. Transition event
18. Post-hook = source `hook.post` only `along=forward`
19. Persistence via `mutate`
20. Result type
21. Progress callback
22. Dependencies: bindings, **not** `RunStepHooks`/`CountTasks` on the use case
23. Config factory via `resolveTransitionChangeDeps`

### Implementation Status

**Implemented.**

- `effectiveTarget = requestedTarget` — no rewrite to pending states (`transition-change.ts` ~203).
- Predicates: `executeMatchingPredicates` then `evaluate` with `{ [requestedTarget]: evaluation.checks }`.
- Failed `approval.spec` → `InvalidStateTransitionError` `{ type: 'approval-required', gate: 'spec' }`; change left in `ready` (test + `expect(change.state).toBe('ready')`).
- Signoff analog for `done → archivable`.
- `_assertDrainAndGateTargets`: `gate-not-required` if targeting pending/`spec-approved`/`signed-off` when gate off; drain hops from pending still allowed.
- `VALID_TRANSITIONS` already forbids `ready → pending-spec-approval` / `done → pending-signoff` (`change-state.spec.ts`).
- Constructor: no `RunStepHooks` / `CountTasks`; `transitionBindings` only.
- Skill hops: `invalidateSignoff` when source in `{done,signed-off,archivable}` and target in `{implementing,verifying}`.

### Discrepancies

None critical/major vs merged spec.

- **nit:** Constraints still mention “Approval-gate routing is configuration-driven… centralized through LifecycleEngine.” Routing is gone; engine **projects** check results. Copy leftover in merged constraints, not a code bug.
- **minor (use-case vs binding):** `ready → verifying` with spec gate is matched by bindings (`transition-checks.spec.ts` “approval.spec wildcard, when ready to verifying, then matches”). `TransitionChange` tests cover `ready → implementing` + drain, not a dedicated `ready → verifying` execute with `approvals.spec: true`. Behaviour should follow the same predicate path; unproven at this use case.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`:

- Stays in `ready` / `done` on approval-required
- Consent then `ready → implementing`
- Drain pending → spec-approved / signed-off
- Reject explicit `to: pending-spec-approval` from ready (protocol / gate)

`packages/core/test/domain/services/transition-checks.spec.ts`:

- `approval.spec` matches `ready → verifying` forward; does not match `ready → designing`

### Missing Tests

- **minor:** `TransitionChange.execute({ to: 'verifying' })` from `ready` with spec gate on, no consent — should stay in `ready` with `approval-required` (config “any forward leave”).
- **minor:** Skill-aligned hop: `done → implementing` invalidates signoff only (no mass artifact invalidate) — if not already asserted in this file, add it (delta-added requirement).

### Spec dependency chain

`core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

Aligned with in-place approval checks.

### Counts

|                       | n                             |
| --------------------- | ----------------------------- |
| Requirements reviewed | 23                            |
| Implemented           | 23                            |
| Partial               | 0                             |
| Missing               | 0                             |
| Discrepancies         | 1 nit, 1 minor (untested hop) |
| Test gaps             | 2 minor                       |

---

## core:archive-change

### Requirements Summary

Large archival use case (schema guard, archivable, readonly, overlap, hooks, snapshots, merge, publication, impl guards, etc.) plus change deltas:

- Schema name guard = `schema.nameMatch` on operation archive
- Archivable = `archive.archivable`; **not** a lifecycle hop; `approval.signoff` not bound
- `workspace.readOnly` / `deps.consistent` same runners as enter-`ready`
- `impl.filesResolved` / `impl.linksInScope` same runners as **forward** exit `implementing`
- Overlap = `spec.overlap` archive-only
- Effects selected by binding `phase`, not `check.id`
- **Archive checks share runners…** remaining publication preflight stays inside ArchiveChange; no `archive.publication` binding
- **Archive bindings not RunStepHooks on the use case** — inject `archiveBindings`; **must not keep unused `RunStepHooks` instance field**; ctor param OK for default bindings

### Implementation Status

**Implemented** for the delta-focused items.

- Fields (`archive-change.ts` 275–287): `_changes`, `_listWorkspaces`, `_archive`, `_actor`, `_parsers`, `_schemaProvider`, `_materializeMetadata`, `_extractorTransforms`, `_workspaceRoutes`, `_projectRoot`, `_batchSnapshot`, `_archiveBindings`. **No `_runStepHooks`.**
- Ctor still takes `runStepHooks: RunStepHooks` and uses it **only** when `archiveBindings` is omitted (`defaultArchiveBindings` → `createWorkflowCheckRegistry({ runStepHooks })`). Matches “ctor param OK for default bindings.”
- Composition always injects `archiveBindings: registry.archiveBindings` **and** still passes `runStepHooks` through (unused when bindings present). Spec forbids a **stored unused field**, not an unused ctor argument.

### Discrepancies

- **nit:** `ArchiveChangeDeps.runStepHooks` remains **required** even when `archiveBindings` is provided (`composition/use-cases/archive-change.ts`). Spec: RunStepHooks is a dep of hook `create*` only. Possible readings: (a) leftover wiring for defaults — acceptable; (b) factory still reconstructs a use-case-level hook port — spec drift. Prefer (a); no stored field.

No unused instance field found (the requested check **passes**).

### Test Coverage

`archive-change.spec.ts` still constructs with `makeRunStepHooks()` everywhere (needed for default bindings / ctor). Overlap, readonly, impl, hooks, rollback covered historically.

No test that `ArchiveChange` instance has no `runStepHooks` own property / that injected `archiveBindings` skip calling the ctor `runStepHooks` mock.

### Missing Tests

- **minor:** Construct with explicit `archiveBindings` and a throwing/unused `runStepHooks` mock — archive predicates/effects must not invoke that mock.
- **minor:** Assert `approval.signoff` is not in `ARCHIVE_BINDING_SPECS` (exists in `check-bindings.ts`; could be a bindings test rather than ArchiveChange).

### Spec dependency chain

Includes `core:transition-checks` for named archive checks. Consistent with registry `ARCHIVE_BINDING_SPECS`.

### Counts

|                           | n                       |
| ------------------------- | ----------------------- |
| Requirements reviewed     | 31 (base ~29 + 2 added) |
| Implemented (delta focus) | yes                     |
| Discrepancies             | 1 nit                   |
| Test gaps                 | 2 minor                 |

---

## core:approve-spec

### Requirements Summary

1. Gate guard (disabled → `ApprovalGateDisabledError`; no I/O)
2. Change lookup
3. Artifact hash computation (schema once for cleanup map; skip missing/skipped/null)
4. Approval recording: **stay in `approval.spec` `from` states (`ready`); drain `pending-spec-approval` → `spec-approved`**
5. Persistence via `mutate`; no transition on `ready`
6. Input: `name` + `reason` only
7. Gates baked at construction
8. Factory via `resolveApproveSpecDeps` (`contentHasher`)

### Implementation Status

**Implemented.** `approve-spec.ts`: gate first; `boundFromStates('approval.spec')` plus drain; `recordSpecApproval`; `transition('spec-approved')` **only if** `pending-spec-approval`. Happy path from `ready` stays `ready`.

### Discrepancies

- **nit:** Use-case ctor parameter still named `hasher`; composition field is `contentHasher` as spec requires. Mapping is correct.
- **nit:** Test suite describe “given the change is not in pending-spec-approval state” still uses default (drafting) change; merged verify says “not in ready or pending-spec-approval” / drafting. Behaviour matches; title is stale.

### Test Coverage

`approve-spec.spec.ts`: stays in `ready`; drain pending → `spec-approved`; gate disabled; not-found; schema mismatch before mutate; drafting throws `InvalidStateTransitionError`.  
Composition tests assert `contentHasher` on deps.

### Missing Tests

- **minor:** Explicit “MUST NOT call `transition('pending-spec-approval')`” spy (implied by stay-in-ready).
- **minor:** Hash skip for `missing`/`skipped`/null load (may exist in shared hash tests).

### Spec dependency chain

Adds `core:transition-checks` for `from` states. `boundFromStates('approval.spec')` → `['ready']` (tested).

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 minor |

---

## core:approve-signoff

### Requirements Summary

Symmetric to ApproveSpec: stay in `done`; drain `pending-signoff` → `signed-off`; factory `contentHasher`.

### Implementation Status

**Implemented.** Same structure as ApproveSpec (`approve-signoff.ts`).

### Discrepancies

Same nits as ApproveSpec (`hasher` vs `contentHasher`; stale describe “not in pending-signoff”).

### Test Coverage

Stay in `done`; drain pending; gate/lookup/mismatch. Composition `contentHasher`.

### Missing Tests

Same pattern as ApproveSpec (minor).

### Spec dependency chain

`core:transition-checks` — `boundFromStates('approval.signoff')` → `['done']`.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 minor |

---

## core:validate-artifacts

### Requirements Summary

Full validation pipeline (guards, required artifacts, DAG order, deltas, structural/cross-artifact rules, hashes, persist, invalidation) plus:

- **DAG lifecycle from engine `projectArtifacts`:** when DAG status / next-artifact order is needed, **`LifecycleEngine.evaluate` with empty `checksByTarget`**. Must not run hop predicates / `executeChecksByLegalTargets`. Must not gather a global snapshot bag. `gatherPredicateSnapshots` must not exist.

### Implementation Status

**Implemented** for the added requirement.

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Empty `checksByTarget` means `evaluate` skips injecting hop rows (`injected === undefined` → `continue`), so `availableTransitions` stays empty and **no check `execute`**. Artifact DAG still comes from `projectArtifacts` inside `evaluate`. No `gatherPredicateSnapshots` in this file.

### Discrepancies

- **nit:** Spec title says “from engine projectArtifacts” while body mandates `evaluate` with empty `checksByTarget`. Code follows the body (`evaluate` → internal `projectArtifacts`). GetStatus **drafts** call `projectArtifacts` directly; Validate calls `evaluate`. Both are specified that way — not a bug, but two call shapes for the same DAG.

### Test Coverage

Large `validate-artifacts.spec.ts` covers validation behaviour. **No** spy that `evaluate` is invoked with `checksByTarget: {}` or that hop predicates are not run.

### Missing Tests

- **major (verify gap):** Merged verify “GetArtifactInstruction/Validate uses empty `checksByTarget`” analog for ValidateArtifacts — spy `lifecycle.evaluate` third arg `{ checksByTarget: {} }` and assert no `executeChecksByLegalTargets`.
- **minor:** Next-artifact / parent-blockage selection during validate traversal vs persisted `complete` (if still required by dependency-order requirement).

### Spec dependency chain

Adds `core:transition-checks` (“no snapshot bag; hop predicates are not this use case”). Consistent.

### Counts

|                       | n                          |
| --------------------- | -------------------------- |
| Requirements reviewed | 24                         |
| Implemented           | 24                         |
| Discrepancies         | 1 nit (spec title vs body) |
| Test gaps             | 1 major, 1 minor           |

---

## core:get-artifact-instruction

### Requirements Summary

Ports, input (optional `artifactId` → engine next artifact), lookup, schema guard, artifact resolution, instruction/template/delta/rules, result shape, factory (`templateExpander`), plus:

- **Effective status from DAG evaluate:** `evaluate` with empty `checksByTarget` (`nextArtifact` / `projectArtifacts`). Not GetStatus hop path. No snapshot bag.

Constraints: MUST NOT evaluate hop availability (`availableTransitions`); MUST NOT run hop predicates.

### Implementation Status

**Implemented.**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

Uses `nextArtifact` only. Empty checks ⇒ no predicate `execute`. Engine still computes `nextAction`/`availableTransitions` from an empty injected map (transitions stay empty). Use case does not return those fields.

Factory: `templateExpander` on deps; ctor param still named `templates`.

### Discrepancies

- **nit:** Ctor `templates` vs spec/factory `templateExpander`.
- **nit:** Constraint “MUST NOT evaluate hop availability” vs calling full `evaluate` (which still walks `validTransitions` but skips missing injections). Alternative: `projectArtifacts` + `_nextArtifact` only. Code matches the **requirement** that names `evaluate` with empty `checksByTarget`. Treat as wording tension, not a fail.

### Test Coverage

`get-artifact-instruction.spec.ts`: omitted `artifactId` picks first incomplete in topo order; all complete → `ArtifactNotFoundError`; instruction/delta/templates; no `change.workspace`. **No** `evaluate` spy / empty `checksByTarget`.

Missing merged verify: “GetArtifactInstruction uses empty `checksByTarget`”; “omitted artifactId ignores persisted complete when engine reports dependency blockage”.

### Missing Tests

- **major:** Spy `evaluate(..., { checksByTarget: {} })`.
- **major:** Persisted `complete` but effective `pending-parent-artifact-review` must not be treated as resolved for auto-select (verify scenario exists; test file has topo-order only).

### Spec dependency chain

`core:lifecycle-engine`, `core:transition-checks` (no gather bag). Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 9       |
| Implemented           | 9       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 major |

---

## core:config

### Requirements Summary

Many config surface requirements; **this change only rewrites Approvals**:

- `approvals.spec: true` → cannot take any **forward** leave of `ready` (`approval.spec`: `from=ready`, `to=*`, `along=forward`) until `ApproveSpec` records consent; stay in `ready`. Includes `ready → implementing` and `ready → verifying` when `implementing` omitted. Redesign `ready → designing` MUST NOT require the spec gate.
- `approvals.signoff: true` → `done` cannot go to `archivable` until signoff; stay in `done`.
- New work MUST NOT enter pending states via `change transition`.
- Defaults false.

Loader still only parses booleans (`config-schema.ts` / `config-loader.ts`). Semantics live in bindings + use cases.

### Implementation Status

**Implemented** relative to **merged** Approvals:

- Binding: `check-bindings.ts` `approval.spec` `{ from: 'ready', to: '*', along: 'forward' }`.
- Matcher tests: `ready → verifying` matches; `ready → designing` does not.
- Loader: `approvals.spec/signoff` default false.

### Discrepancies

- **major — workspace spec vs change (intentional until archive):** On-disk `specs/core/config/spec.md` **Approvals** still documents `pending-spec-approval` / `pending-signoff` hops. Merged preview + code follow in-place checks.
  - If reviewer treats **workspace specs/** as current product docs: **spec drift** (docs wrong).
  - If reviewer treats **change merged spec** as truth: **expected**; archive will replace the section.  
    This audit scores implementation against **merged** spec → not an implementation defect.

No code that still rewrites `implementing` → `pending-spec-approval` in TransitionChange.

### Test Coverage

`config-loader.spec.ts` parses booleans. Semantic gate tests live in `transition-checks.spec.ts` / `transition-change.spec.ts` / `lifecycle-engine.spec.ts`, not in config-loader.

Merged verify: “Spec gate on does not require pending-spec-approval in the graph” — **not** a config-loader test; covered by bindings + `isValidTransition('ready', 'pending-spec-approval') === false`.

### Missing Tests

- **minor:** Config-package or docs test that comments/examples do not mention pending hops (documentation contract). Enforcement tests belong with bindings (already present for verifying vs designing).

### Spec dependency chain

Adds `core:transition-checks`. Merged Approvals consistent with bindings. **Unmerged workspace spec contradicts** the change.

### Counts

|                            | n                                                                |
| -------------------------- | ---------------------------------------------------------------- |
| Requirements reviewed      | 1 delta (Approvals) + rest of config not re-audited line-by-line |
| Approvals (merged) vs code | Implemented                                                      |
| Discrepancies              | 1 major **base-spec vs change** (docs), 0 implementation         |
| Test gaps                  | 1 minor (docs/config layer)                                      |

---

## Batch summary

| Spec                     | Reqs    | Impl           | Disc.                                | Missing tests                           |
| ------------------------ | ------- | -------------- | ------------------------------------ | --------------------------------------- |
| get-status               | 17      | 17             | 1 nit                                | 1 major (draft parent cascade), 2 minor |
| transition-change        | 23      | 23             | 1 nit + 1 untested hop               | 2 minor                                 |
| archive-change           | 31      | delta OK       | 1 nit (deps still list runStepHooks) | 2 minor                                 |
| approve-spec             | 8       | 8              | 2 nits                               | 2 minor                                 |
| approve-signoff          | 8       | 8              | 2 nits                               | 2 minor                                 |
| validate-artifacts       | 24      | 24             | 1 nit                                | 1 major (empty checks spy)              |
| get-artifact-instruction | 9       | 9              | 2 nits                               | 2 major                                 |
| config (Approvals)       | 1 delta | matches merged | 1 major workspace-doc lag            | 1 minor                                 |

**Focus checks:** all **code-compliant** with merged specs. Highest-value gaps are **tests**, not missing implementation.

**Severity rollup (this batch):** critical 0; major 4 (3 test gaps + 1 unarchived workspace config docs); minor 14; nit 10.
