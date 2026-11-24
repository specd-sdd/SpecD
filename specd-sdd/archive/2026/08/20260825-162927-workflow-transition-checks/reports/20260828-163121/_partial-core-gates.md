# Spec-Compliance Audit — core gates partial

- **Change:** `workflow-transition-checks`
- **Scope (change-owned, via `changes spec-preview`):** `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:hook-execution-model`
- **Re-check vs prior `20260828-144106`:** same batch, 0 HIGH / 0 MEDIUM then (LOW only). This pass confirms no regression and no new HIGH/MEDIUM.
- **Focus:** in-place approval gates (`ready`/`done` stay; `pending-*` drain-only; `nextAction` is approve, not `change transition` to pending); config pending happy-path wording; hooks skip by binding `phase` + skip selectors; `TransitionChange` must not default to domain stub `TRANSITION_BINDINGS`; `ArchiveChange` must not accept `RunStepHooks`; `archive.publication` is not a `CheckId`.
- **Date:** 2026-08-28 (report dir `20260828-163121`)
- **Mode:** read-only. No source or spec files modified. This file is the audit artifact.

## Tooling / graph status

`graph index` FAILED (per assignment). Navigation used `graph search` then Read.

`graph search "ApproveChange"` / `skipHookPhases` (stale index) resolved:

- `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec`, class ~line 30)
- `packages/core/src/application/use-cases/approve-signoff.ts` (`ApproveSignoff`, class ~line 30)
- `packages/core/src/application/use-cases/transition-change.ts` (`HookPhaseSelector` ~line 35)
- `packages/core/src/application/use-cases/archive-change.ts` (`ArchiveHookPhaseSelector` ~line 65)

Merged spec text: `changes spec-preview workflow-transition-checks <specId>`.

---

## Re-check verdict (cross-cutting)

| Claim                                                                    | Status        | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place spec gate, not a pending hop                                    | **COMPLIANT** | `approval.spec` binds `from=ready`, `to=*`, `along=forward` (`check-bindings.ts:57-60`). `ApproveSpec` records consent and does **not** `transition` when state is in `boundFromStates('approval.spec')`. `VALID_TRANSITIONS.ready` is `['implementing','designing']` — no `pending-spec-approval`.                                                                                 |
| In-place signoff gate, not a pending hop                                 | **COMPLIANT** | `approval.signoff` binds `from=done`, `to=archivable`, `along=forward` (`check-bindings.ts:61-65`). `ApproveSignoff` does not `transition` from `done`. `VALID_TRANSITIONS.done` has no `pending-signoff`.                                                                                                                                                                          |
| New work MUST NOT enter `pending-*`                                      | **COMPLIANT** | Happy-path table omits pending (`change-state.ts:30-42`, tests `change-state.spec.ts:72-79`). Engine `_resolveTarget` is identity (`lifecycle-engine.ts:335-337`). Transition tests stay in `ready`/`done` and throw `approval-required` (`transition-change.spec.ts:378-392`).                                                                                                     |
| Drain from already-pending remains legal                                 | **COMPLIANT** | `pending-spec-approval → spec-approved` / `pending-signoff → signed-off` in `VALID_TRANSITIONS`. `ApproveSpec`/`ApproveSignoff` drain via `transition` only when already pending. `TransitionChange` drain tests exist (`transition-change.spec.ts:495-512`). `--next` from pending is unavailable (`HAPPY_PATH_NEXT` omits those states).                                          |
| `change transition` targeting pending is not `nextAction`                | **COMPLIANT** | With gate on and no consent, `LifecycleEngine._nextAction` returns `targetStep: 'ready'` / `'done'` and `command: 'specd changes approve spec                                                                                                                                                                                                                                       | signoff'` (`lifecycle-engine.ts:819-847`, test `lifecycle-engine.spec.ts:266-281`). From already-pending, `nextAction.command`is still **approve**, not`change transition … pending-\*` (`lifecycle-engine.ts:871-929`). `HAPPY_PATH_NEXT` has no pending keys. |
| Config wording: no pending happy-path hop                                | **COMPLIANT** | Preview Approvals: “New work MUST NOT enter `pending-spec-approval` / `pending-signoff` as a happy-path hop”; drain legal; `change transition` targeting pending is never next-action. Verify: “config MUST NOT be documented as requiring a pending hop”.                                                                                                                          |
| `skipHookPhases` = binding `phase` + skip selectors                      | **COMPLIANT** | `matchingEffects` filters `binding.phase ===` slot (`execute-hook-effect.ts:29-34`). Skip inside `HookEffectCheck` uses selectors `all` / archive `pre                                                                                                                                                                                                                              | post`/`target.pre`/`source.post` (`hook-effect.ts:133-149`) — **not** `binding.phase`alone. Transition`hook.pre`and`hook.post`share`before-persist` (`check-bindings.ts:66-78`).                                                                                |
| `TransitionChange` does not default to domain stub `TRANSITION_BINDINGS` | **COMPLIANT** | Constructor 7th arg `transitionBindings` is required (`transition-change.ts:130-146`). No default. Composition: `registry.transitionBindings` (`composition/use-cases/transition-change.ts:45-54`). Tests: `createWorkflowCheckRegistry(...).transitionBindings` (`transition-change.spec.ts:84-103`). Domain `TRANSITION_BINDINGS` is fixtures only (`check-bindings.ts:114-121`). |
| `ArchiveChange` does not accept `RunStepHooks`                           | **COMPLIANT** | Constructor takes `archiveBindings`, not `RunStepHooks` (`archive-change.ts:222-236`). Test helper `newArchiveChange` maps the former 4th slot into `makeArchiveBindings({ runStepHooks })` (`helpers.ts:941-982`). Production ctor has no `_runStepHooks` (`archive-change.spec.ts:169-181`).                                                                                      |
| `archive.publication` is not a `CheckId`                                 | **COMPLIANT** | `CheckId` union has no `archive.publication` (`transition-checks.ts:20-34`). `ARCHIVE_BINDING_SPECS` comment: “Publication is not a check” (`check-bindings.ts:81-94`). Test: `transition-checks.spec.ts:390-392`.                                                                                                                                                                  |

**Regression vs 144106:** none. Same LOW wording/test-gap class. No new HIGH/MEDIUM.

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                             | Substance                                                                                                                                                                                          |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                              | Order: disabled gate → `ApprovalGateDisabledError('spec')` with no I/O; load change; actor; `SchemaProvider.get()` (errors propagate); schema name vs `change.schemaName` → `SchemaMismatchError`. |
| AS-2 | Change lookup                           | Missing name → `ChangeNotFoundError`.                                                                                                                                                              |
| AS-3 | Artifact hash computation               | Schema once for cleanup map; skip `missing`/`skipped`; skip `artifact() === null`; cleanup then hash; keys `type:key`.                                                                             |
| AS-4 | Approval recording and state transition | `recordSpecApproval`; MUST NOT `transition('spec-approved'                                                                                                                                         | 'pending-spec-approval')`when state is an`approval.spec` `from`(currently`ready`); MAY drain `pending-spec-approval → spec-approved`. |
| AS-5 | Persistence and return value            | Persist via `ChangeRepository.mutate`; record on fresh instance; same no-pending-hop / drain rules; return mutated `Change`.                                                                       |
| AS-6 | Input contract                          | `{ name, reason }` required readonly; no gate flags on input.                                                                                                                                      |
| AS-7 | Approval gate baked at construction     | `approvals: ApprovalGates`; `execute` uses baked `approvals.spec`.                                                                                                                                 |
| AS-8 | Config-based factory                    | `createApproveSpec(config)` → `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`; deps include `contentHasher` and `approvals`.                                                        |

**Verify.md (change deltas):** ready stays `ready`; drain pending → `spec-approved`; drafting → `InvalidStateTransitionError`; mutate from ready returns `ready`; factory uses `contentHasher`. Enabled-gate factory scenario still uses drain fixture.

## Implementation Status

| ID   | Status      | Notes                                                                                                                             |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Implemented | `approve-spec.ts:71-84`. Extra: state allow-list (`boundFromStates` ∪ pending) before mutate (`86-89`).                           |
| AS-2 | Implemented | `get` then `ChangeNotFoundError`.                                                                                                 |
| AS-3 | Implemented | `_computeArtifactHashes` `111-127`; runs **inside** mutate on `freshChange`.                                                      |
| AS-4 | Implemented | `recordSpecApproval` always; `transition('spec-approved')` **only if** `freshChange.state === 'pending-spec-approval'` (`96-98`). |
| AS-5 | Implemented | `mutate` then return `updatedChange`.                                                                                             |
| AS-6 | Implemented | `ApproveSpecInput` `15-20`.                                                                                                       |
| AS-7 | Implemented | Constructor 5th arg; factory `resolver.config.approvals`.                                                                         |
| AS-8 | Implemented | `composition/use-cases/approve-spec.ts` `resolveApproveSpecDeps` + config overload.                                               |

## Discrepancies

### LOW — Hash timing vs mutate (spec wording vs code)

- **Spec (AS-5):** “After computing artifact hashes, the use case MUST record the approval through `mutate`.”
- **Code:** hashes are computed **inside** the mutate callback on the fresh entity (`approve-spec.ts:91-99`).
- **spec-wrong (wording):** sequential “hash then mutate” is weaker than hashing the serialized instance; verify persistence scenario only requires mutate + record on fresh change.
- **code-wrong:** no functional bug for in-place consent.
- **Verdict:** treat as spec ambiguity. Prefer code. **Unchanged from 144106.**

### LOW — Verify scenario still uses drain as the “enabled gate” example

- **Spec verify (baked gate):** GIVEN pending, THEN `spec-approved`.
- **Does not contradict** drain legality or ready happy path (separate scenarios). Factory scenario does not exercise the new in-place path.

No HIGH/MEDIUM implementation bugs found for AS-4/AS-5 vs in-place model. **No regression.**

## Test Coverage

| Scenario                                 | Coverage                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Gate disabled, no repo I/O               | `approve-spec.spec.ts:201-221`                                   |
| Change not found                         | `:288-305`                                                       |
| Ready stays ready + consent              | `:71-91`                                                         |
| Drain → `spec-approved`                  | `:116-134`                                                       |
| Drafting → `InvalidStateTransitionError` | `:243-262`                                                       |
| Schema mismatch before mutate            | `:265-285`                                                       |
| Mutate called                            | `:178-198` (**drain fixture only**)                              |
| Factory returns instance                 | `composition/use-cases/approve-spec.spec.ts` (`instanceof` only) |

## Missing Tests

| Gap                                                                          | Severity                              | Maps to                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Mutate spy + returned state `ready` on in-place path                         | LOW                                   | AS-5 verify                                                                                                           |
| Cleanup applied to one artifact type, not another                            | MEDIUM (test gap, not product defect) | AS-3 verify (logic exists in `compute-artifact-hash.ts` + `pre-hash-cleanup`; **not** asserted through `ApproveSpec`) |
| `artifact() === null` omitted from hash map                                  | LOW                                   | AS-3                                                                                                                  |
| `SchemaProvider.get()` throw before hash                                     | LOW                                   | AS-3 / AS-1                                                                                                           |
| `createApproveSpec(config)` calls `resolveApproveSpecDeps` / `contentHasher` | LOW                                   | AS-8 (composition test only checks `instanceof`)                                                                      |

The AS-3 cleanup gap is a **missing test**, not a code/spec discrepancy. It is **not** counted as a MEDIUM discrepancy (same as 144106).

## Spec Dependency issues

Depends on `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

- **Consistent:** `from` states for consent come from `boundFromStates('approval.spec')` (engine bindings), matching `core:transition-checks`.
- **Consistent:** no dependency still requiring a hop into `pending-spec-approval` on the happy path.

## Counts (`core:approve-spec`)

| Metric                             | Count       |
| ---------------------------------- | ----------- |
| Requirements                       | 8           |
| Implemented as specified           | 8           |
| Discrepancies HIGH / MEDIUM / LOW  | 0 / 0 / 2   |
| Verify scenarios with direct tests | 10 (of ~15) |
| Missing / weak tests               | 5           |

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec for signoff: gate `'signoff'`; `recordSignoff`; stay in `approval.signoff` `from` (currently `done`); drain `pending-signoff → signed-off`; same hash/mutate/input/factory pattern.

## Implementation Status

| ID                       | Status      | Notes                                                |
| ------------------------ | ----------- | ---------------------------------------------------- |
| AG-1 Gate guard          | Implemented | `approve-signoff.ts:71-84`                           |
| AG-2 Lookup              | Implemented |                                                      |
| AG-3 Hashes              | Implemented | Inside mutate, same helper                           |
| AG-4 Record + transition | Implemented | `transition('signed-off')` only if pending (`96-98`) |
| AG-5 Persist             | Implemented |                                                      |
| AG-6 Input               | Implemented | `name` + `reason`                                    |
| AG-7 Baked gates         | Implemented |                                                      |
| AG-8 Factory             | Implemented | `resolveApproveSignoffDeps`                          |

## Discrepancies

### LOW — Hash timing vs mutate

Same as ApproveSpec: hashes inside `mutate`. Spec-wording vs stronger code. Prefer code. **Unchanged from 144106.**

### LOW — Test describe lag

`approve-signoff.spec.ts:242` describe still says “not in pending-signoff” while the assertion is “not in done **or** pending”. Fixture is drafting (`makeChange`). Behaviour matches verify; description is stale (test-only, not production).

No HIGH/MEDIUM in-place vs pending-hop bugs. **No regression.**

## Test Coverage

| Scenario              | Coverage                                        |
| --------------------- | ----------------------------------------------- |
| Gate disabled, no I/O | `approve-signoff.spec.ts:200-221`               |
| Not found             | `:287-304`                                      |
| Done stays done       | `:71-91`                                        |
| Drain → `signed-off`  | `:116-134`                                      |
| Invalid state         | `:242-261`                                      |
| Schema mismatch       | `:264-284`                                      |
| Mutate                | `:177-197` (**drain only**)                     |
| Factory               | `composition/use-cases/approve-signoff.spec.ts` |

## Missing Tests

Same shape as ApproveSpec: persist-from-`done` mutate spy; cleanup/null-skip/schema-throw through this use case; factory `resolveApproveSignoffDeps` / `contentHasher`.

## Spec Dependency issues

Same chain including `core:transition-checks`. Bindings `from=done` match `boundFromStates('approval.signoff')`. No spec still requiring happy-path `pending-signoff`.

## Counts (`core:approve-signoff`)

| Metric                             | Count       |
| ---------------------------------- | ----------- |
| Requirements                       | 8           |
| Implemented as specified           | 8           |
| Discrepancies HIGH / MEDIUM / LOW  | 0 / 0 / 2   |
| Verify scenarios with direct tests | 10 (of ~15) |
| Missing / weak tests               | 5           |

---

# Spec: `core:config`

## Requirements Summary

**This change’s delta** rewrites **Requirement: Approvals** and adds dependency on `core:transition-checks`.

**Approvals (delta):**

- YAML `approvals.spec` / `approvals.signoff`, both default `false`.
- **`spec: true`:** in-place wait on `ready`; any **forward** leave of `ready` blocked until `ApproveSpec`; includes `ready → implementing` and `ready → verifying` if `implementing` omitted; **redesign `ready → designing` MUST NOT require the spec gate**; fail `APPROVAL_REQUIRED`; new work MUST NOT enter `pending-spec-approval`; drain from already-pending legal; `change transition` targeting `pending-spec-approval` is never next-action.
- **`signoff: true`:** stay in `done` until `ApproveSignoff`; `done → archivable` gated; no happy-path `pending-signoff`; drain legal; transition targeting `pending-signoff` is never next-action.
- Flags independent.

**Other requirements (not in this delta; remaining sections):** file location, privacy, env overrides, actor, local override, cascade, schema ref, invalidation, workspaces, workspace/project graph, storage, named adapters, config path, template variables, schema plugins/overrides, context selection/mode/instructions, logging, LLM optimization, plugins, config writer, startup validation, legacy warnings.

This batch **fully audited Approvals**. Other config requirements were not re-proven line-by-line; no contradiction with the in-place gate model was found in the loader defaults path.

## Implementation Status (Approvals)

| ID                                   | Status      | Notes                                                                                                                                                                              |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFG-APR-1 Parse + defaults           | Implemented | `config-loader.ts:616` `data.approvals?.spec ?? false` (same for signoff). `SpecdConfig.approvals` required on resolved config (`specd-config.ts:220`).                            |
| CFG-APR-2 Forward leave of ready     | Implemented | Binding + `approval.spec` check; engine `effectiveTarget` stays `implementing` while `availableTransitions` omits it and `APPROVAL_REQUIRED` (`lifecycle-engine.spec.ts:266-281`). |
| CFG-APR-3 Redesign exempt            | Implemented | `along=forward` only on `approval.spec`; redesign is not forward. Test: designing + gate on → nextAction is `/specd-design`, not approve (`lifecycle-engine.spec.ts:284-292`).     |
| CFG-APR-4 Signoff in-place           | Implemented | Binding `done → archivable`; transition tests stay in `done`.                                                                                                                      |
| CFG-APR-5 No happy-path pending      | Implemented | See re-check table. Spec text matches code (no “must hop to pending” wording in preview).                                                                                          |
| CFG-APR-6 nextAction not pending hop | Implemented | Approve commands; `targetStep` is current wait state (`ready`/`done`) or drain `spec-approved`/`signed-off` with **approve** command, never `change transition` to pending.        |

## Discrepancies

### LOW — Config-loader tests do not encode default-false or “no pending hop”

- **Spec verify:** omitted `approvals.spec` / `approvals.signoff` default `false`; “spec gate on does not require pending-spec-approval in the graph”.
- **Tests:** `config-loader.spec.ts:961-973` and `:1836-1854` only assert **explicit** `{ spec: true, signoff: false }`. Defaults are implemented in loader but **not** asserted. Graph/nextAction semantics are tested in `lifecycle-engine.spec.ts` / `transition-change.spec.ts`, not under config-loader.
- **spec-wrong:** no. Product-facing Approvals text is aligned with in-place gates.
- **code-wrong:** no (defaults exist).
- **Verdict:** test gap on the config spec’s own verify file, not a loader bug. **Unchanged from 144106.**

### INFO — Engine still special-cases pending step names when gate is on

`_isStepPermitted` (`lifecycle-engine.ts:344-348`) still treats `pending-spec-approval` / `spec-approved` as permitted **iff** `approvals.spec && isValidTransition`. Combined with `VALID_TRANSITIONS`, **ready cannot enter pending**. Drain from pending remains. Not a happy-path leak; leftover parking-state awareness.

## Test Coverage

| Scenario                                     | Where                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Explicit `approvals.spec: true`              | `config-loader.spec.ts:961-973`                                         |
| Independent flags (spec true, signoff false) | same                                                                    |
| Gate on, wait is check not pending hop       | `lifecycle-engine.spec.ts:266-281`, `transition-change.spec.ts:378-407` |
| Signoff on, stay in done                     | `transition-change.spec.ts:436+`                                        |
| Defaults omitted section                     | **missing in config-loader**                                            |

## Missing Tests

| Gap                                                                                                | Severity                |
| -------------------------------------------------------------------------------------------------- | ----------------------- |
| Load `minimalYaml()` with no `approvals:` → `{ spec: false, signoff: false }`                      | LOW                     |
| `approvals.signoff: true` parsed true (isolated)                                                   | LOW                     |
| Config-level test that `HAPPY_PATH_NEXT` / nextAction never names `pending-*` as transition target | LOW (covered elsewhere) |

## Spec Dependency issues

Delta adds `core:transition-checks` — “approvals are in-place checks, not pending hops”. **Consistent** with bindings and Approve\* use cases.

Other listed deps (`core:vcs-adapter-port`, `default:_global/architecture`) unchanged by this delta; no conflict identified.

**Potential cross-spec note:** `core:config` Approvals text is the product-facing description; mechanical truth lives in `core:transition-checks` + engine. That split is intentional and aligned.

## Counts (`core:config`)

| Metric                                              | Count                                  |
| --------------------------------------------------- | -------------------------------------- |
| Requirements in spec (all sections)                 | ~24                                    |
| Requirements in this change’s delta (fully audited) | 1 (`Approvals`)                        |
| Approvals sub-rules audited                         | 6                                      |
| Implemented (Approvals)                             | 6                                      |
| Discrepancies HIGH / MEDIUM / LOW                   | 0 / 0 / 1                              |
| Missing tests (Approvals verify)                    | 3                                      |
| Other config requirements                           | Not counted as pass/fail in this batch |

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID   | Requirement                          | Substance                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ----------- | ------------------ | ---- | ------------------------------------------------------------- |
| H-1  | Two hook types                       | `instruction:` query-only; `run:` via `HookRunner`; XOR keys (schema).                                                                                                                                                                                                                                                                  |
| H-2  | External hooks                       | `external: { type, config }`; not shell `HookRunner`; fail if no runner.                                                                                                                                                                                                                                                                |
| H-3  | External phase semantics             | Same pre fail-fast / post collect-or-abort as `run:`.                                                                                                                                                                                                                                                                                   |
| H-4  | instruction passive                  | `TransitionChange` / `ArchiveChange` / `RunStepHooks` skip instruction; `GetHookInstructions` only; not in CompileContext.                                                                                                                                                                                                              |
| H-5  | Default execution                    | Effects after predicates; slot from binding `phase`/`onFailure`; Transition: `before-persist` for both `hook.pre`/`hook.post`; Archive: pre before persist abort, post after persist collect; no private always-source.post; no check-id branching to launch `RunStepHooks`; skip by phase **and** selectors (shared `before-persist`). |
| H-6  | Two modes                            | Standalone RunStepHooks fail-fast pre / fail-soft post; Transition/Archive use binding `onFailure`; transition `hook.post` is abort before persist.                                                                                                                                                                                     |
| H-7  | Change entity does not execute hooks | Application layer runs matching effects.                                                                                                                                                                                                                                                                                                |
| H-8  | skipHooks                            | Transition selectors `source.pre                                                                                                                                                                                                                                                                                                        | source.post | target.pre | target.post | all`; Archive `pre | post | all`; skips **effects** only; along filter for manual skills. |
| H-9  | Pre-hook failure                     | Transition/Archive throw `HookFailedError`, no persist; standalone CLI exit 2; fail-fast.                                                                                                                                                                                                                                               |
| H-10 | Post-hook failure                    | `abort` vs `collect` from binding.                                                                                                                                                                                                                                                                                                      |
| H-11 | Ordering                             | Schema then project, declaration order.                                                                                                                                                                                                                                                                                                 |
| H-12 | Template expansion                   | `change.name`, `change.path`, `project.root`; **not** `change.workspace`; unknown left; shell-escape.                                                                                                                                                                                                                                   |

**Change deltas:** H-5, H-6, H-7 (rename), H-8 skip no-ops, H-10 transition post before persist, along filters, recovery omit hooks, constraints, numbered flows.

## Implementation Status

| ID         | Status                     | Notes                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| H-1        | Implemented                | `RunStepHooks` filters instruction (`run-step-hooks.ts:211-214`); GetHookInstructions separate.                                                                                                                                                                        |
| H-2 / H-3  | Implemented                | External dispatch `run-step-hooks.ts:294-309`; `ExternalHookTypeNotRegisteredError`.                                                                                                                                                                                   |
| H-4        | Implemented                | Effects call `RunStepHooks` which skips instruction.                                                                                                                                                                                                                   |
| H-5        | Implemented                | `TransitionChange` `matchingEffects(..., 'before-persist')` then persist (`transition-change.ts:255-292`). `ArchiveChange` constructor has **no** `RunStepHooks` (`archive-change.ts:222-236`); effects on bindings. Skip in `HookEffectCheck` by `all` / archive `pre | post`/`target.pre`/`source.post`— **not**`binding.phase` alone (`hook-effect.ts:133-149`). |
| H-6        | Implemented                | `hookFailureMode(binding.onFailure)` (`transition-change.ts` `_executeEffect`). Archive post `collect` (`ARCHIVE_BINDING_SPECS`).                                                                                                                                      |
| H-7        | Implemented                | Entity has no HookRunner; tests assert auto-run via use case.                                                                                                                                                                                                          |
| H-8        | Implemented                | Types `HookPhaseSelector` / `ArchiveHookPhaseSelector`. `source.pre` / `target.post` are no-ops in `HookEffectCheck`. Predicates still run (`skipHookPhases` only read by hook **effects**).                                                                           |
| H-9 / H-10 | Implemented                | Pre/post fail tests in `transition-change.spec.ts` / `archive-change.spec.ts`. Source.post fail does not persist (`:1506-1561`).                                                                                                                                       |
| H-11       | Implemented (pre-existing) | Schema merge + RunStepHooks order; not re-proven in this delta.                                                                                                                                                                                                        |
| H-12       | Implemented                | Production variables `name`+`path` only (`run-step-hooks.ts:196-197`). Test `does not inject a singular workspace` (`run-step-hooks.spec.ts:662+`).                                                                                                                    |

## Discrepancies

### LOW — NodeHookRunner fixture still passes `workspace`

- **Spec H-12:** `HookVariables` never contains `workspace` under `change`.
- **Production:** compliant (`run-step-hooks.ts:196-197`).
- **Test:** `hook-runner.spec.ts:80` still passes `workspace: 'default'` because `TemplateVariables` is a loose `Record`. Expander **would** substitute `{{change.workspace}}` if a caller stuffed the key.
- **spec-wrong:** no.
- **code-wrong:** only if a caller injects workspace; `RunStepHooks` does not.
- **Verdict:** test-fixture drift / type too wide; not a happy-path product bug. **Unchanged from 144106.**

### INFO — `skipHookPhases` on predicate context

Passed into `executeMatchingPredicates` (`transition-change.ts:213`) but only `HookEffectCheck` reads it. Predicates ignore it → effects-only skip holds.

### INFO — Test helper still takes `RunStepHooks` as 4th arg

`newArchiveChange` (`helpers.ts:944-982`) preserves the old call shape and injects hooks via `createHook*` in `makeArchiveBindings`. Production `ArchiveChange` does not accept `RunStepHooks`. Not a spec violation.

No HIGH/MEDIUM vs this change’s hook deltas. **No regression.**

## Test Coverage

| Scenario                                    | Coverage                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Skip all / target.pre / source.post         | `transition-change.spec.ts:1347+`, `:1564+`, `:1699+`                      |
| source.pre / target.post no-op              | `:1607-1690`                                                               |
| Redesign/backward omit hook.post            | `matching-effects.spec.ts:33-54`; along in transition-change               |
| Recovery omits hook.pre and hook.post       | `matching-effects.spec.ts:56-66`                                           |
| Source.post fail, state stays implementing  | `transition-change.spec.ts:1506-1561`                                      |
| Archive skip pre/post/all                   | `archive-change.spec.ts:1837-2012`                                         |
| Archive post collect                        | matching-effects archive after-persist + archive-change post-failure tests |
| Instruction skipped                         | `run-step-hooks.spec.ts` instruction filter; GetHookInstructions tests     |
| Template no workspace                       | `run-step-hooks.spec.ts:662+`; `template-expander.spec.ts` uses name/path  |
| skip-hooks does not skip predicates         | `transition-change.spec.ts` (~2396) tasks still fail with skip all         |
| Archive ctor has no RunStepHooks field      | `archive-change.spec.ts:169-181`                                           |
| archive.publication absent                  | `transition-checks.spec.ts:390-392`                                        |
| Transition bindings from registry, not stub | `transition-change.spec.ts:84-103`                                         |

## Missing Tests

| Gap                                                                                                                                                     | Severity                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `{{change.workspace}}` left unexpanded **and** production bag has no key (hook-runner unit uses a bag **with** workspace)                               | LOW                          |
| Hook ordering schema-before-project through TransitionChange (likely covered in RunStepHooks / merge tests, not this delta’s verify file)               | LOW                          |
| External hook abort vs collect on archive vs transition in one test (policy is binding-level; `matching-effects.spec.ts:68-80` covers archive policies) | LOW                          |
| Direct unit test that `new TransitionChange(...)` without a 7th arg is a TypeScript error (enforced by types; no runtime default to prove)              | LOW (not a gap in behaviour) |

## Spec Dependency issues

Delta depends on `core:transition-checks` for shared matcher. **Consistent:** effects use same `from`/`to`/`along` as predicates; `instruction:` is not a CheckId; `archive.publication` is not a CheckId.

Also depends on `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, CLI skip-hooks specs. Numbered “Default transition with hooks” flow matches code (predicates → before-persist effects → persist; no after-persist on TransitionChange).

`core:config` schemaOverrides for project hooks: not re-audited here; no conflict with in-place approvals.

## Counts (`core:hook-execution-model`)

| Metric                            | Count                                             |
| --------------------------------- | ------------------------------------------------- |
| Requirements                      | 12                                                |
| Implemented as specified          | 12                                                |
| Discrepancies HIGH / MEDIUM / LOW | 0 / 0 / 1                                         |
| Delta verify scenarios with tests | 10+ (matching-effects + transition/archive specs) |
| Missing / weak tests              | 3                                                 |

---

# Batch summary

| Spec                        | Reqs audited                                | HIGH | MEDIUM | LOW | In-place / pending / hooks focus                                                                            |
| --------------------------- | ------------------------------------------- | ---- | ------ | --- | ----------------------------------------------------------------------------------------------------------- |
| `core:approve-spec`         | 8                                           | 0    | 0      | 2   | Pass: ready stays ready; drain legal                                                                        |
| `core:approve-signoff`      | 8                                           | 0    | 0      | 2   | Pass: done stays done; drain legal                                                                          |
| `core:config`               | 1 section (Approvals) + rest not re-counted | 0    | 0      | 1   | Pass: flags describe checks not hops; wording aligned                                                       |
| `core:hook-execution-model` | 12                                          | 0    | 0      | 1   | Pass: skip = slot + selectors; no stub default; no Archive `RunStepHooks`; no `archive.publication` CheckId |

**Totals this batch:** HIGH 0, MEDIUM 0, LOW 6 (test/wording, not product leaks).

**Vs prior 144106:** **no regression.** Same LOW set. **No new HIGH/MEDIUM.**

**Strongest residual risk:** Approve\* artifact-hash cleanup / null-skip / schema-throw are specified on the use case but tested only in shared helpers or sibling use cases — not a pending-hop regression.

**In-place gate re-check:** no finding that new work is routed into `pending-spec-approval` or `pending-signoff`, or that `nextAction` recommends `change transition` **to** those states.
