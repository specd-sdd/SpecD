# Batch: engine

Read-only change audit of recorte **workflow[] is a LOOKUP onto existing `ChangeState`**; omitting a row MUST NOT delete `VALID_TRANSITIONS` membership; `classifyAlong` uses `AXIS_FALLBACK`; docs MUST NOT say the schema selects participating states. Specs: `core:transition-checks`, `core:workflow-model`, `core:schema-format`, `core:lifecycle-engine`, `core:change`. Consistency vs `default:_global/architecture` (hexagonal, no I/O in domain).

Graph: `stale: false` (`lastIndexedAt` 2026-08-26T19:00:41Z). Specs via `changes spec-preview workflow-transition-checks <specId>`. Navigation: `graph search` / `graph impact` then file reads. Neither spec nor code is treated as automatically correct.

Recorte scope is this lookup/axis/membership contract. Older requirements in the same specs are confirmed from code+tests; only real remaining issues are flagged.

---

## Requirements summary

### Recorte (binding across this batch)

| Source                                                                          | SHALL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:workflow-model` _Step names reference domain lifecycle states_            | Protocol membership and legal hops come from `ChangeState` + `VALID_TRANSITIONS`. `workflow[].step` is a **lookup key** onto an existing state. A matching row attaches only extras (`requires`, `requiresTaskCompletion`, `hooks`). A row MUST NOT introduce a new lifecycle state. Omitting a known state MUST NOT remove it from the protocol. Unmatched `workflowStep(state)` SHALL be `null`; the hop stays legal when `VALID_TRANSITIONS` allows it. Unknown `step` values are rejected at `TransitionChange` (`InvalidStateTransitionError`), not by shrinking the machine. |
| `core:workflow-model` _Workflow array order is display order and progress axis_ | Array order is display order **and** the progress axis for `along`. Delivery states absent from `workflow[]` still appear on the axis after listed steps (`AXIS_FALLBACK` / `buildAxis`). Consecutive listed steps are **not** mandatory occupancy. Omitting a row MUST NOT make the protocol hop illegal. `to = designing` is `redesign`. `archiving → archivable` is `recovery`.                                                                                                                                                                                                 |
| `core:transition-checks` _Applicability from, to, and along_                    | Same axis rule. `along ∈ {forward, backward, redesign, recovery, any}`. `from=*` / `to=*` without `along` MUST NOT confuse `ready → designing` with `ready → implementing`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `core:schema-format` _Schema file structure_ + _Workflow_                       | `workflow` is optional lookup rows attaching prerequisites/hooks to existing Change states. MUST NOT define the set of states a change may occupy. MUST NOT add/remove protocol hops. Declaration order is display + `along` axis, not sequential occupancy. An omitted `step` MUST NOT delete that state from the domain machine. Duplicate `workflow[].step` is a validation error.                                                                                                                                                                                              |
| `core:lifecycle-engine` _Available steps and next action_                       | `validTransitions` SHALL be protocol-legal targets from `VALID_TRANSITIONS`. `availableTransitions` SHALL be those targets whose blocking predicates pass/skip. `_resolveTarget` MUST NOT rewrite delivery hops onto parking states. Engine projects predicates only (no I/O).                                                                                                                                                                                                                                                                                                     |
| `core:change` _Lifecycle_                                                       | `VALID_TRANSITIONS` is the machine. `ready` → `implementing` \| `designing` only (no new hop into `pending-spec-approval`). Parking states remain drain-only.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `default:_global/architecture`                                                  | Domain is pure (no `fs`/`net`/`child_process`). Stateless domain operations are plain functions. Application uses ports only.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Verify scenarios that pin the recorte:

- Omitted `workflow[]` row does not delete the protocol state (`workflowStep("implementing")` is `null`, hop still legal).
- Omitted listed step still classifies `along` via fallback (`ready → verifying` is `forward`; `implementing` remains a protocol state).
- Schema resolve: omitted `implementing` remains a valid `ChangeState`; `workflow[]` only attaches extras to listed names.
- Spec approval `along = redesign` for `ready → designing` (does not match forward-only approval).
- Recovery is not backward (`archiving → archivable`).

### Older requirements still in these specs (confirm-only)

- Check ABI, bindings, archive-as-operation, predicate vs effect, projections, no snapshot bag (`core:transition-checks`).
- DAG effective artifact status, canonical-state-only interpretation, blocker codes, next-artifact topological order, archiving escape (`core:lifecycle-engine`).
- Artifact DAG API, validations, plugins, extends (`core:schema-format` except Workflow recorte).
- Entity owns persisted facts; engine owns DAG interpretation (`core:change`).
- Requires / taskCompletion gating, hook _intent_, step-name = target state (`core:workflow-model`).

---

## Implementation status

### Lookup, not membership — **holds**

- `VALID_TRANSITIONS` lives only in `packages/core/src/domain/value-objects/change-state.ts` (lines 30–43). It is a closed `Record<ChangeState, readonly ChangeState[]>`. Schema is not an input.
- `protocol.edge` (`packages/core/src/domain/checks/protocol-edge.ts`) calls `isValidTransition(from, to)` only. No `schema.workflow()` consult.
- `executeChecksByLegalTargets` (`packages/core/src/application/services/execute-matching-predicates.ts` 207–222) iterates `VALID_TRANSITIONS[input.change.state]`, not `schema.workflow()`. Omitted lookup rows cannot drop a legal target from predicate evaluation.
- `LifecycleEngine.evaluate` sets `validTransitions = VALID_TRANSITIONS[change.state]` (lifecycle-engine.ts 131). `availableTransitions` is filtered from that list by injected `CheckResult`s (145–154).
- `Schema.workflowStep(step)` (`schema.ts` 149–151) is a map lookup; missing key → `null`.
- `workflow.requires` / `workflow.taskCompletion` `run()` skip when `workflowStep(target)` is `null` or extras are empty (`workflow-requires.ts` 29–32, `workflow-task-completion.ts` 32–37). That is “no extras”, not “illegal hop”.

`ready` / `done` parking: `VALID_TRANSITIONS.ready` is `['implementing', 'designing']`; `done` includes `archivable`, `designing`, `implementing`, `verifying`. Matches `core:change`. `_resolveTarget` is identity (lifecycle-engine.ts 309–311).

### `classifyAlong` + `AXIS_FALLBACK` — **implemented as specified literally**

`packages/core/src/domain/services/transition-checks.ts`:

```
AXIS_FALLBACK = ready, implementing, verifying, done, archivable, archiving
buildAxis(workflowSteps) = [...workflowSteps] then append each fallback not already present
```

`classifyAlong` special-cases before the axis:

1. `archiving → archivable` → `recovery`
2. `to === designing` (and from not designing/drafting) → `redesign`
3. `designing → designing` → `any`
4. parking drain onto the same delivery step → `forward`
5. else compare indices on `buildAxis(workflowSteps)`

Callers pass **schema declaration order**:

- `transitionAttempt` / `evaluate-transition-predicates.ts` 51–55
- `transitionAttemptFor` / `execute-matching-predicates.ts` 169–172
- engine tests `domainChecksByTarget` (lifecycle-engine.spec.ts 91–96)

`designing` and `drafting` are **not** in `AXIS_FALLBACK` (they are not “delivery” states). Redesign/drafting branches cover the usual hops; a hop **from** `designing` when `designing` is omitted from `workflow[]` falls through to `fromIndex < 0` → `any` (unless drafting).

### Display vs protocol on the verdict — **split, easy to misread**

`availableSteps` is `schema.workflow().map(...)` only (lifecycle-engine.ts 156–194). That is the lookup-row display/readiness projection. Protocol participation is `validTransitions` / `availableTransitions`. The recorte forbids treating `workflow[]` as the participating-state set; the engine **does not** use it for membership. It **does** use it for `availableSteps[]` length and order.

### Docs / spec language vs “schema selects participating states”

Updated (good):

- `core:schema-format` Workflow: MUST NOT define the set of states; lookup key; omitted step MUST NOT delete the domain machine.
- `core:schema-format` structure: `workflow` described as lookup rows.
- `core:workflow-model` Purpose/constraints: `workflow[]` looks up extras; does not add/remove/reorder protocol membership.
- `core:transition-checks` verify: _Omitted workflow row is not removed from the axis_.

Still muddy (see discrepancies):

- `WorkflowStep` JSDoc (`workflow-step.ts` 39–46): “defining a named lifecycle phase”.
- `core:change` _Lifecycle interpretation authority_: “which lifecycle step is reachable next **under the active schema**”.
- `core:schema-format` verify still has CompileContext reporting `stepAvailable` / `blockingArtifacts` for `implementing` (availability as if CompileContext owned participating steps).
- `core:workflow-model` _Step availability evaluation_ (older, still merged) still describes a formula over listed steps / `change.effectiveStatus()`.

### Architecture (hexagonal / no I/O in domain) — **recorte code matches**

| Surface                                                                   | Layer            | I/O                                                    |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `classifyAlong`, `buildAxis`, `checkMatches`, `pass`/`fail`/`skip`        | domain functions | none                                                   |
| `protocol.edge` / `workflow.requires` / `workflow.taskCompletion` `run()` | domain functions | none (schema + facts only)                             |
| `LifecycleEngine.evaluate` / `projectArtifacts`                           | domain class     | none; predicates injected; no `fs`/`net`               |
| `create*` checks / `WorkflowCheck`                                        | application      | ports only (`CountTasks`, `RunStepHooks`, ready-facts) |
| `createWorkflowCheckRegistry`                                             | application      | wires factories onto domain `TRANSITION_BINDING_SPECS` |

`graph impact --symbol classifyAlong --direction dependents`: GetStatus, TransitionChange, ArchiveChange, engine tests. No infrastructure imports on the domain files above.

Tension (pre-existing, not introduced by lookup): architecture wants **stateless domain operations as plain functions**. `LifecycleEngine` remains a class (debug callback). `classifyAlong` / `buildAxis` are the recorte-shaped functions and are correctly not a class.

---

## Discrepancies (each: spec vs code, both interpretations)

### D1 — High — `AXIS_FALLBACK` append-at-end can invert `along` for hops that involve an omitted middle/early delivery state

**Spec says:** progress axis = `workflow[]` declaration order, **then missing delivery states appended** (`AXIS_FALLBACK`). Consecutive occupancy is not required. Scenario: omit `implementing`; `ready → verifying` is `forward`; `implementing` remains protocol.

**Code does:** exactly that. Example omitted-`implementing` axis if workflow is `designing, ready, verifying`:

`[designing, ready, verifying, implementing, done, archivable, archiving]`

Then:

| Hop                                                     | Canonical `along` (full schema-std order) | Axis-after-append `along`                                                   |
| ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `ready → verifying`                                     | forward                                   | forward (scenario; tested)                                                  |
| `verifying → implementing`                              | **backward** (retry)                      | **forward** (`implementing` sits after `verifying`)                         |
| omit `ready`, list `designing, implementing, verifying` | `ready → implementing` is forward         | `ready` appended after `verifying` → `ready → implementing` is **backward** |

`along = forward` bindings then fire on the inverted hop: `hook.post` (`from/to *`, `along: forward`), `approval.spec` (`from: ready`, `along: forward`), `impl.filesResolved` only if `from` is still `implementing`. So `verifying → implementing` with omitted `implementing` would look like **forward progress** (post-hooks, not a backward retry).

**Interpretation A — spec wrong, code (literal) correct:** “append” is the contract. Along for omitted states is “wherever they landed at the tail”. Only `ready → verifying` is guaranteed. Authors who omit a middle step accept inverted retry/forward. Spec should add this as an explicit consequence (or forbid omitting delivery states that sit between listed ones).

**Interpretation B — spec right in intent, code (and the word “appended”) wrong:** the axis should keep **canonical delivery order** for fallback members (splice `AXIS_FALLBACK` relative order into gaps), using `workflow[]` only to order **listed** extras and to order listed names among themselves. “Appended” was shorthand for “still present”, not “pushed after later listed steps”. Then `verifying → implementing` stays `backward` when `implementing` is omitted. `buildAxis` should insert missing fallback states by `AXIS_FALLBACK` index, not `push` after the whole list.

**Evidence:** `transition-checks.ts` 106–145, 173–191; test only covers `ready → verifying` (`transition-checks.spec.ts` 61–66). No test for `verifying → implementing` or omitted-`ready`.

This is the recorte’s sharp edge: membership is preserved; **direction** is not, under literal append.

---

### D2 — Medium — `availableSteps` is schema-row shaped; docs still sound like schema selects participants

**Spec says:** `validTransitions` = protocol; `workflow[]` = lookup extras + display/axis; MUST NOT define occupying states.

**Code:** `validTransitions` / `availableTransitions` protocol-shaped. `availableSteps` **only** lists `schema.workflow()` rows (lifecycle-engine.ts 156). An omitted `implementing` never appears in `availableSteps` even when it is in `validTransitions`.

**Interpretation A — spec wrong:** if status UI is supposed to show every protocol-legal hop, `availableSteps` should be union(protocol targets, lookup rows), or the spec should say `availableSteps` is **only** extras-bearing rows and MUST NOT be used as participating-state set. Today the spec never names that split clearly next to `availableSteps`.

**Interpretation B — code wrong:** `availableSteps` leaking a schema-filtered list is exactly “schema selects participating states” for any consumer that reads `availableSteps` instead of `validTransitions`. Engine should emit protocol states (with `isReady` skip when `workflowStep` is null).

**Same family (docs):**

- `WorkflowStep` JSDoc: “defining a named lifecycle phase” / “Schema workflow steps fire first” (`workflow-step.ts` 39–46) — reads as workflow defining phases.
- `core:change` _Lifecycle interpretation authority_: “which lifecycle step is reachable next **under the active schema**” — reachable hops are protocol + predicates, not schema membership.
- `core:schema-format` verify _Step with unsatisfied prerequisites_ / _Step blocked when required artifact deleted_: **CompileContext** must report `stepAvailable` — contradicts engine/workflow-model display rule (`CompileContext` MUST NOT evaluate availability / MUST NOT call `evaluate`).

---

### D3 — Medium — `core:workflow-model` _Step availability evaluation_ still contradicts lookup + engine (older req, still real)

**Spec (merged, not deleted):** availability is `step.requires.every(...)` on persisted artifact state; empty `requires` ⇒ always available regardless of change state; constraints still mention `change.effectiveStatus()` in spirit of the old formula (constraints in preview now say LifecycleEngine + CheckResults — mixed).

**Code:** availability is protocol ∩ predicate `CheckResult`s. Empty `requires` still needs `protocol.edge`. Entity has **no** `effectiveStatus()` (confirmed: engine owns `projectArtifacts`).

**Interpretation A — spec drift:** delete/rewrite the old availability requirement; keep recorte constraints (already closer to code).

**Interpretation B — code wrong:** restore entity `effectiveStatus` and schema-listed-only availability (would violate this change’s engine + transition-checks specs).

---

### D4 — Low — unknown `workflow[].step` is not rejected at schema load

**Spec:** if schema declares a `step` that is not a Change lifecycle state, **`TransitionChange` rejects** with `InvalidStateTransitionError`. Schema-format does **not** require `SchemaRegistry.resolve()` to reject unknown names (only duplicate `step`).

**Code:** `Schema` stores `step: string`. Lookup can attach extras to `"reviewing"`. Protocol never contains `"reviewing"` as `ChangeState`, so `TransitionChange` to that name fails typing/protocol. A listed unknown name still occupies **axis order** (`buildAxis` uses the string list), which can shift `along` for real states around it.

**Interpretation A — spec sufficient:** load-time lenient lookup; runtime protocol is the gate. Document that garbage `step` strings still perturb the axis.

**Interpretation B — code gap:** schema validation should reject `step` ∉ `ChangeState` so lookup cannot invent axis labels (aligns with “MUST NOT introduce a new lifecycle state”).

---

### D5 — Low — architecture “plain functions not classes” vs `LifecycleEngine`

**Spec (architecture):** stateless domain operations are exported functions, not classes.

**Spec (lifecycle-engine):** names the `LifecycleEngine` class.

**Code:** class + `evaluate` / `projectArtifacts`. Recorte helpers `classifyAlong` / `buildAxis` are functions.

**Interpretation A — architecture should carve an exception** for the engine facade (debug logger).

**Interpretation B — engine should be functions** + optional thin wrapper. Recorte itself already moved classification to functions.

Not a lookup/membership bug.

---

### Older issues in these specs that are **not** recorte regressions (confirm)

These still exist but are out of the lookup contract; listed so they are not mistaken for “all green”:

- Engine still independently re-walks `workflowStep.requires` for `isReady` / `_requestedTargetBlockers` when checks are present (lifecycle-engine.ts 159–171, 585–603) vs “project `isReady` from `workflow.requires` CheckResults”. Real, prior audit; not membership.
- `core:workflow-model` post-hook “after state change” vs transition-checks `hook.post` `before-persist`. Real spec-vs-spec; code follows transition-checks.
- `ValidateArtifacts` / `GetArtifactInstruction` call `evaluate` with empty `checksByTarget` (DAG only). Matches a later engine verify scenario; not lookup.

`CheckId` no longer includes `archive.publication` (fixed since earlier audit).

---

## Test coverage / missing tests

### Present (recorte)

| Scenario                                                                                                                                             | Where                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ready → designing` → `redesign`                                                                                                                     | `transition-checks.spec.ts` 29–31                                                  |
| `verifying → implementing` → `backward` (full schema-std steps)                                                                                      | 33–35                                                                              |
| `archiving → archivable` → `recovery`                                                                                                                | 37–39                                                                              |
| `ready → implementing` → `forward`                                                                                                                   | 41–43                                                                              |
| `done → implementing` → `backward`                                                                                                                   | 45–47                                                                              |
| `designing → designing` → `any`                                                                                                                      | 49–51                                                                              |
| parking drain `forward`                                                                                                                              | 53–55                                                                              |
| **omit `implementing`, `ready → verifying` is `forward` and `VALID_TRANSITIONS.implementing` still defined / `ready` still contains `implementing`** | 61–66                                                                              |
| approval forward does not match redesign                                                                                                             | 126–137                                                                            |
| `hook.post` does not match redesign                                                                                                                  | 140–151                                                                            |
| protocol.edge independent of schema                                                                                                                  | `protocol-edge.ts` + engine `domainChecksByTarget` iterating `VALID_TRANSITIONS`   |
| requires skip when no row                                                                                                                            | implicit in `runWorkflowRequires` when `workflowStep` null (used in engine helper) |

### Missing (recorte)

1. **`Schema.workflowStep("implementing") === null`** when `workflow[]` omits it, **and** `VALID_TRANSITIONS.ready` still includes `implementing` (workflow-model verify _Omitted workflow row does not delete the protocol state_). Today only `classifyAlong` + `VALID_TRANSITIONS` constant, not `Schema`.
2. **Schema resolve** (`SchemaRegistry` / `buildSchema`): omitted `implementing` still a valid Change state; schema still loads (schema-format verify _Omitted workflow step is not a deleted lifecycle state_).
3. **`executeChecksByLegalTargets` / `LifecycleEngine.evaluate`:** omitted lookup row still appears in `validTransitions` / `checksByTarget` keys (membership at the projection layer, not only `classifyAlong`).
4. **Inverted-`along` cases:** `verifying → implementing` with `implementing` omitted; `ready → implementing` with `ready` omitted (D1). Decide splice vs append, then lock it.
5. **`availableSteps` vs `validTransitions`:** omitted `implementing` absent from `availableSteps`, present in `validTransitions` (documents the display/protocol split — or fails if D2 interpretation B is chosen).
6. **Garbage `step: "reviewing"`** on the axis: either schema validation error or documented `along` perturbation + `TransitionChange` reject (D4).
7. **`AXIS_FALLBACK` membership:** `designing`/`drafting` not appended; hop `designing → ready` with `designing` omitted is `any` (or document intended `forward`).
8. **Domain purity:** no `node:fs` import in `transition-checks.ts` / `lifecycle-engine.ts` / `change-state.ts` (architecture; currently true, no automated test in this package beyond tsconfig layers).

### Older coverage still holding

`lifecycle-engine.spec.ts`: parent-review, canonical complete-with-drift, next-artifact DAG order, overlap bypass, task gating hiding `verifying`, done skill hops, archiving recovery skips requires. `change-state.ts` table matches `core:change` (inspected, not re-enumerated).

---

## Spec dependency chain

```
default:_global/architecture
        ↑
core:change  ←  VALID_TRANSITIONS / ChangeState (membership)
        ↑
core:schema-format  ←  workflow[] YAML lookup rows (not a second machine)
        ↑
core:workflow-model  ←  lookup semantics, display + axis, extras
        ↑
core:transition-checks  ←  classifyAlong, AXIS_FALLBACK, bindings
        ↑
core:lifecycle-engine  ←  validTransitions from protocol; project predicates; no I/O
```

Direct extras (depth 1, not fully re-audited here): `core:build-schema` (DAG cycles, duplicate `step`), `core:transition-change` / `core:get-status` (consume `executeChecksByLegalTargets` + `evaluate`), `core:compile-context` (MUST NOT evaluate hops — contradicts schema-format verify).

Internal contradiction: workflow-model + schema-format **recorte text** vs leftover availability / CompileContext verify scenarios vs engine “protocol membership”.

---

## Counts: findings / gaps

### Recorte requirements checked

| Spec                   |                                 Recorte-focused reqs |                             Implemented as specified |                          Discrepancies |
| ---------------------- | ---------------------------------------------------: | ---------------------------------------------------: | -------------------------------------: |
| core:transition-checks |                       axis + along + omit-not-delete |                               yes (literal `append`) |                                     D1 |
| core:workflow-model    |                                 lookup + omit + axis |     lookup/membership yes; old availability leftover |                                 D1, D3 |
| core:schema-format     |                                lookup wording + omit | spec text yes; verify CompileContext leftover; JSDoc |                                 D2, D4 |
| core:lifecycle-engine  | `validTransitions` from protocol; no rewrite; no I/O |                                                  yes |            D2 (`availableSteps` shape) |
| core:change            |     `VALID_TRANSITIONS` table; engine interprets DAG |                                                  yes | D2 (wording “under the active schema”) |
| architecture           |                                        domain purity |                                recorte surfaces pure |                      D5 (engine class) |

### Counts

- **Findings (discrepancies): 5** (1 high, 2 medium, 2 low)
- **Test gaps (recorte): 8**
- **Older real issues noted, not recorte-owned: 3** (requires re-walk; post-hook timing spec-vs-spec; empty `checksByTarget` consumers)

### Bottom line

Membership **does not** come from `workflow[]`: `VALID_TRANSITIONS` + `protocol.edge` + `executeChecksByLegalTargets` loop are schema-independent. Lookup **does** skip extras via `workflowStep === null`. Docs in the change deltas mostly stopped saying the schema is the state machine.

The remaining recorte defect is **axis geometry**: literal tail-append of `AXIS_FALLBACK` can flip `forward`/`backward` for hops that involve an omitted delivery state, and tests only lock `ready → verifying`. Until that is either specified as intended or `buildAxis` splices fallback order, `along`-gated checks (`hook.post`, `approval.spec`, impl exit) are not stable under omitted rows.
