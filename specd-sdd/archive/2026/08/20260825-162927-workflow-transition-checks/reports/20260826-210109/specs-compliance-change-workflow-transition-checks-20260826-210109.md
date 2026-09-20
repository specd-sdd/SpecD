# Specs compliance — change `workflow-transition-checks`

Mode: `--change workflow-transition-checks`
Timestamp: 20260826-210109
Graph: reindexed before audit.

## Executive summary

Scenario verification (simple layer): **pass** against current merged verify + code/tests for the recorte and for the previously implemented check engine. `pnpm test` / lint / typecheck already passed on the implementing post-hooks. Recorte: `workflowStep` is map lookup (`null` if omitted); `VALID_TRANSITIONS` is the machine; `classifyAlong` omits-`implementing` still `forward` for `ready → verifying` (tested); living docs no longer claim schema membership.

Compliance audit found **issues**. Highest: **AXIS_FALLBACK tail-append can invert `along`** when a _middle_ delivery state is omitted (`verifying → implementing` becomes `forward`). That is literal to “append” but may not match retry intent. Tests only lock `ready → verifying`.

| Batch     | High | Medium |       Low | Notes                                                                                         |
| --------- | ---: | -----: | --------: | --------------------------------------------------------------------------------------------- |
| engine    |    1 |      2 |         2 | D1 axis geometry; `availableSteps` schema-shaped; leftover availability/CompileContext verify |
| use-cases |    0 |      2 |        10 | leftover ArchiveChange `RunStepHooks` port; ValidateArtifacts ctor vs ListWorkspaces          |
| approvals |    0 |      — | ~13 notes | stay-in-ready/done holds; config/docs/test gaps                                               |
| CLI       |    0 |      — |         7 | no silent pending; `--next` signed-off untested                                               |

## Detailed findings

---

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

---

# Batch: use-cases

Read-only spec-compliance audit of change `workflow-transition-checks` for:

- `core:get-status`
- `core:transition-change`
- `core:archive-change`
- `core:validate-artifacts`
- `core:get-artifact-instruction`

Specs read via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon` (merged deltas). Graph freshness: `stale: false` (`specd project status --graph`). Navigation via `specd graph search` / file impact on use-case classes. No code or spec files were modified.

## Shared contract (this change)

Hop consumers (`GetStatus` active path, `TransitionChange`, `ArchiveChange`): matching predicate `execute`, then engine/project from those `CheckResult`s. No global snapshot bag (`gatherPredicateSnapshots` MUST NOT exist — confirmed in `packages/core/test/domain/services/transition-checks.spec.ts`).

DAG-only consumers (`ValidateArtifacts`, `GetArtifactInstruction`, `GetStatus` drafts): `LifecycleEngine.evaluate(..., { checksByTarget: {} })` / `projectArtifacts`. MUST NOT run hop predicates (`executeChecksByLegalTargets`).

Use-case constructors MUST inject application `create*` bindings. MUST NOT default to domain stub `TRANSITION_BINDINGS`.

`skipHookPhases` skips **effects only**. Skip matching uses binding `phase` **and** skip selectors, not `check.id === 'hook.pre'|'hook.post'` in the use-case loop.

`archive.publication` is **not** a `CheckId`. Remaining merge/publish preflight stays inside `ArchiveChange`.

`CheckId` (`packages/core/src/domain/services/transition-checks.ts:19-33`) is: `protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `hook.pre`, `hook.post`. No `archive.publication`.

---

## Per spec

### core:get-status

#### Requirements summary

Read-only status projection. Resolve `ChangeRepository.get` then `getDraft` (never `getDiscarded`). Optional `ifModifiedSince` 304 short-circuit (no refresh, empty `artifactStatuses`). Optional pre-read `RefreshImplementationTracking` on active changes. Active full path: DAG `projectArtifacts`, then matching **predicates** for each protocol-legal target (`executeChecksByLegalTargets`), then `LifecycleEngine.evaluate` with those results. Paint `taskCompletion` from `workflow.taskCompletion` details (`CountTasks` inside that check only). Blockers merge review codes plus failed predicates (`INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`, `IMPLEMENTATION_STATE` bypass only for `impl.linksInScope`). Schema miss degrades lifecycle fields without throwing. Drafts: inspection-only (`availableTransitions` empty); SHOULD DAG-project effective status via `evaluate` with empty `checksByTarget`. Constructor: no sibling `CountTasks`. Factory: `resolveGetStatusDeps` includes `transitionBindings` from `resolveWorkflowCheckRegistry`.

#### Implementation status

**Aligned on the hop path.**

- Class: `packages/core/src/application/use-cases/get-status.ts` (`GetStatus` ~L278). Constructor requires `transitionBindings: readonly CheckBinding[]` — no default `TRANSITION_BINDINGS`.
- Active: `projectArtifacts` → `executeChecksByLegalTargets` → `lifecycle.evaluate(..., { checksByTarget })` (`get-status.ts` ~L438–451).
- Factory: `packages/core/src/composition/use-cases/get-status.ts` `resolveGetStatusDeps` pulls `registry.transitionBindings`.
- Draft: `_buildDraftedResult` uses `projectArtifacts` (same DAG cascade as empty `checksByTarget` evaluate) and sets `checksByTarget: {}`, empty transitions (`get-status.ts` ~L585–641). Does **not** call `evaluate`.
- Schema catch wraps only `SchemaProvider.get()`; check `execute` is outside that catch.
- `_mergeBlockers`: `impl.filesResolved` does not advertise `--allow-out-of-scope`; `impl.linksInScope` does; failed predicates carry `label` / `checkId`.

#### Discrepancies

1. **Low — draft SHOULD `evaluate` with empty `checksByTarget` (spec-loose vs code).** Merged **Drafted change read-only status**: SHOULD use `LifecycleEngine.evaluate` with empty `checksByTarget` so parent-review cascade appears. Code calls `projectArtifacts` only. If `evaluate` ≡ `projectArtifacts` plus hop projection (skipped when `{}`), cascade is equivalent. **Spec-wrong if SHOULD was meant as MUST; code-wrong only if `evaluate` adds DAG rules `projectArtifacts` lacks.** Evidence: `_buildDraftedResult`; test `projects read-only views with empty transitions for drafted changes` does not assert `pending-parent-artifact-review`.

2. **Low — verify factory scenario lagged (spec-wrong).** Merged spec.md factory lists `transitionBindings`. Merged verify **createGetStatus config form…** still enumerates deps without `transitionBindings`. Code + `packages/core/test/composition/use-cases/get-status.spec.ts` require `transitionBindings`.

3. **Low — test name “gathers CountTasks” (tests-wrong).** `get-status.spec.ts` `it('gathers CountTasks before LifecycleEngine.evaluate')` asserts execute-then-evaluate order and `checksByTarget` defined. Spec forbids a global snapshot bag. Behaviour matches; wording contradicts the change vocabulary.

No contradiction between the **active** GetStatus path and `core:lifecycle-engine` / `core:transition-checks` (predicates then project; engine I/O-free).

#### Test coverage

Covered: not found; refresh default/skip/draft; `ifModifiedSince`; schema-provider degradation; CountTasks inside check before evaluate; incomplete tasks omit `verifying` + `INCOMPLETE_TASKS`; impl bypass split; deps gerund label; cascade effectiveStatus (active); displayStatus; review blockers; composition `createGetStatus`.

Missing / weak:

- Verify **Enter-ready deps check omits ready when extract mismatches**: failing `deps.consistent` asserts blocker shape only, not `ready` absent from `availableTransitions`.
- Verify **Drafted status DAG-projects effective status** (`pending-parent-artifact-review`).
- Verify **Status exposes check rows** / `effect` rows not required for `allowed` (implied by predicates-only execute; not named).
- `taskCompletion` omitted for missing/empty artifact files (painting trusts check details).

#### Counts

- Requirements reviewed: 17
- Implemented as specified: 16
- Discrepancies: 3 (0 high, 0 medium, 3 low)
- Missing/weak tests: 4
- Spec-wrong: 1 (verify factory list) + test naming
- Code-wrong: 0 (draft SHOULD only)
- Both: 0

---

### core:transition-change

#### Requirements summary

Persist the **requested** target (no rewrite to pending-approval). Matching **predicates** `execute` for the classified attempt; map first fail to existing typed errors; do not re-walk requires/tasks after a green execute. Matching **effects** (`before-persist`: source.post only when `along=forward`, then target.pre) via `check.execute` (`RunStepHooks` inside hook checks). `skipHookPhases` skips effects only; skip by binding phase **and** selector, not use-case `check.id` switch. Redesign invalidates; skill-aligned backward hops clear signoff only and skip source.post. Recovery `archiving → archivable` skips archivable requires/hooks. Schema miss MUST throw (merged Constraints). Constructor / factory inject `transitionBindings` from registry; MUST NOT default to `TRANSITION_BINDINGS`; MUST NOT take `RunStepHooks` / `CountTasks` as use-case ports. Input MAY include `allowOutOfScope`.

#### Implementation status

**Hop path implemented and aligned with merged Constraints.**

- `packages/core/src/application/use-cases/transition-change.ts`: `executeMatchingPredicates` then `lifecycle.evaluate` with `{ [requestedTarget]: evaluation.checks }` (`~L189–209`). Effects: `matchingEffects(..., 'before-persist', along)` then `executeCheckWithProgress` (`~L238–245`). No `check.id` switch to launch hooks.
- Constructor requires `transitionBindings` with **no default** (`~L129–137`). Graph: `TRANSITION_BINDINGS` is only defined in `check-bindings.ts` and used from domain tests / `matching-effects.spec.ts`, not this use case.
- Factory: `resolveTransitionChangeDeps` → `registry.transitionBindings`; type guard requires `transitionBindings` (`packages/core/src/composition/use-cases/transition-change.ts`).
- Schema: `await this._schemaProvider.get()` with no catch — throws (matches merged Constraints: schema miss is not a silent skip).
- `skipHookPhases` forwarded on effect (and also on predicate ctx). Actual skip lives in `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts` ~L133–149): `all` / `target.pre` / `source.post`. Predicates ignore those selectors (tested: incomplete tasks still fail when skip is `all`).

#### Discrepancies

1. **Low — skip is check `_phase` + selector, not `binding.phase` alone (spec-wrong if read strictly; code-correct for transitions).** Merged post-hook requirement: skip MUST use binding `phase` (and skip selector), not `check.id` in the use-case loop. Use-case loop is phase-based (`matchingEffects` filters `binding.phase === 'before-persist'`). Both `hook.post` and `hook.pre` are `before-persist` on transitions (`TRANSITION_BINDING_SPECS`), so **binding.phase cannot distinguish source.post vs target.pre**. Hook check skip uses `_phase` (`pre`/`post`) plus selectors. That is equivalent to check identity of the two effect rows, not to `binding.phase`. **Both:** spec over-states “phase”; product needs the skip selector. Use-case does not `if (check.id === 'hook.pre')`.

2. **Low — `source.pre` / `target.post` selectors are no-ops (spec-wrong / incomplete Input).** `HookPhaseSelector` includes `'source.pre' | 'target.post'`. No transition effect is `after-persist`; hook skip does not read those tokens. Callers can pass them with no effect.

3. **Low — `skipHookPhases` also passed into predicate `execute` context (code-loose).** Spec: skip effects only. Predicates still run; extra field is unused by predicate checks. Tests lock “skip all still fails tasks”.

Purpose/JSDoc now match Constraints (hooks via matching effect `execute`). Factory/verify `RunStepHooks` on the use case from the **previous** audit is **resolved** in merged spec.md.

#### Test coverage

Strong: approval stays in ready/done; drain pending hops; task gating / missing-task-capability / progress; requires + skipped optional; skipHookPhases `all` / `target.pre` / `source.post`; hook order post→pre→transitioned; redesign skips source.post; archiving→archivable; CountTasks not twice after green evaluate; skill hop signoff; composition factory.

Missing / weak:

- Explicit assertion that skip matching is independent of `check.id` in the use-case (covered indirectly by `matchingEffects` tests).
- `source.pre` / `target.post` documented as unused (none).

#### Counts

- Requirements reviewed: 18
- Implemented as specified: 16
- Discrepancies: 3 (0 high, 0 medium, 3 low)
- Missing/weak tests: 2
- Spec-wrong: 2 (phase-only skip wording; unused selectors)
- Code-wrong: 0
- Both: 1 (phase vs selector for dual before-persist effects)

---

### core:archive-change

#### Requirements summary

Operation `archive` is **not** a lifecycle hop. Predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent` (same runners as enter-ready), `impl.filesResolved` / `impl.linksInScope` (same as forward exit-implementing). Remaining publication preflight stays **inside** ArchiveChange; MUST NOT register `archive.publication`. Effects: `matchingEffects` `before-persist` then `after-persist`; skip when `'all'`/`'pre'`/`'post'` in `skipHookPhases`; skip by binding phase not `check.id`. `--skip-hooks` skips effects only.

#### Implementation status

**Named archive predicates and phase-selected effects are implemented.**

- `executeMatchingPredicates(this._archiveBindings, archiveAttempt)` then fail mapping (`archive-change.ts` ~L388–409).
- Effects: `matchingEffects(..., 'before-persist')` / after-persist slot (~L419–445, ~L639). `skipHookPhases` passed into check ctx; skip in `HookEffectCheck` for archive `pre`/`post`/`all`.
- `ARCHIVE_BINDING_SPECS` comment: “Publication is not a check.” IDs listed above; test `expect(ARCHIVE_BINDINGS.map(...).join(',')).not.toContain('archive.publication')`.
- Default bindings: `defaultArchiveBindings` → `createWorkflowCheckRegistry(...).archiveBindings` (application `create*`), **not** domain `ARCHIVE_BINDINGS` / `TRANSITION_BINDINGS` stubs. Optional constructor arg `archiveBindings`; factory sets `archiveBindings: registry.archiveBindings`.
- `_runStepHooks` is stored on the class (`~L325`) and **never read** after construction (only used to build default registry). Composition `ArchiveChangeDeps` still requires `runStepHooks`.

#### Discrepancies

1. **Medium — leftover `RunStepHooks` use-case port (both).** Merged archive deltas compose `RunStepHooks` into `createHookPre` / `createHookPost`. `TransitionChange` Constraints forbid it as a use-case port. Archive still **requires** `RunStepHooks` on the constructor/factory even when `archiveBindings` is injected (field unused). **Spec-wrong** if archive constructor was never updated to match transition; **code-wrong** if the unused port should have been removed once bindings are required.

2. **Low — debug log always `skipped: false` (code-wrong, non-behavioural).** before-persist loop logs `skipped: false` even when the check will skip inside `execute`.

3. **Low — archive skip uses effect `_phase`, which maps 1:1 to archive `binding.phase` (aligned).** `hook.pre` → `before-persist`, `hook.post` → `after-persist`. Spec “not `check.id`” is satisfied at the use-case loop (`matchingEffects` by phase).

#### Test coverage

Covered: skip `all` / `pre` / `post`; overlap allow; archivable guard; publication errors as ArchiveChange throws. Domain: `archive.publication` absent from `CheckId` / bindings.

Missing / weak:

- Verify **before-persist slot does not hardcode hook.pre** (no archive-change unit asserting `matchingEffects` vs `check.id` filter). Nearby: `matching-effects.spec.ts` covers archive before/after persist.
- Verify **publication preflight stays in ArchiveChange** as “not a registered check” (indirect: no CheckId; prepare path still throws `ArchivePreflightError`).
- Shared-runner scenarios (enter-ready readOnly / exit-implementing impl) live more naturally in transition/status tests than archive-change.spec.

#### Counts

- Requirements reviewed (delta + constructor/hooks/guards): 14
- Implemented as specified: 12
- Discrepancies: 3 (0 high, 1 medium, 2 low)
- Missing/weak tests: 3
- Spec-wrong: 0–1 (constructor still listing RunStepHooks)
- Code-wrong: 1 (unused `_runStepHooks`)
- Both: 1 (RunStepHooks leftover)

---

### core:validate-artifacts

#### Requirements summary

Existing chokepoint to mark artifacts complete (schema guard, required set, topo order, rules, persist). **This change:** when DAG-aware status is needed, `evaluate` with **empty** `checksByTarget`; MUST NOT run hop predicates; MUST NOT gather a snapshot bag.

#### Implementation status

**DAG-only path matches the merged delta.**

- `packages/core/src/application/use-cases/validate-artifacts.ts` ~L224–226: `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })`. No `CheckBinding` constructor port. No `executeChecksByLegalTargets`.
- Factory `resolveValidateArtifactsDeps` has no transition bindings (`packages/core/src/composition/use-cases/validate-artifacts.ts`).
- Completions: in-memory `markVerdictComplete` + single `mutate` at end (pre-existing vs any “recompute after each persist” wording in the **base** spec, not this delta).

#### Discrepancies

1. **Medium — constructor `specs: ReadonlyMap` vs `ListWorkspaces` (spec-wrong vs long-standing code).** Spec constructor snippet still shows a spec-repo map. Code: `ListWorkspaces` then `listWorkspaces.execute()`. Tests construct with `makeListWorkspaces`. Not introduced solely by this change.

2. **None vs this change’s hop/DAG split.** Empty `checksByTarget` is the specified DAG-only contract (prior audit that demanded hop `execute` is **obsolete** after the delta “MUST NOT run hop predicates”).

#### Test coverage

Large existing suite for rules, deltas, drift, missing files, cross-artifact.

**Zero** tests for verify **ValidateArtifacts uses empty checksByTarget** (no spy that `evaluate` received `{}` / hop execute not called).

No composition test asserting the new negative (no bindings).

#### Counts

- Requirements reviewed: 21 (full spec; this change adds 1)
- New DAG-empty-checks requirement: implemented
- Pre-existing validation behaviour: largely implemented
- Discrepancies: 1 (0 high, 1 medium, 0 low) for this change’s additions; +1 pre-existing constructor
- Missing tests (this change): 1
- Spec-wrong: 1 (constructor Map)
- Code-wrong: 0 vs new requirement
- Both: 0

---

### core:get-artifact-instruction

#### Requirements summary

Read-only instruction payload: change lookup, schema name guard, artifact resolution, template expansion with `change.name` / `change.path` only. Omitted `artifactId` uses engine `nextArtifact`. **This change:** `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates (not GetStatus’s path); MUST NOT gather a snapshot bag. Constraints updated to allow DAG `nextArtifact` / effective status from empty evaluate.

#### Implementation status

**DAG-only path matches the merged delta.**

- `packages/core/src/application/use-cases/get-artifact-instruction.ts` ~L102–106: `evaluate(change, schema, { checksByTarget: {} })` then `input.artifactId ?? lifecycle.nextArtifact`.
- No bindings, no hop execute.
- Constructor default `lifecycle: LifecycleEngine = new LifecycleEngine(...)` if omitted.
- Factory: `templateExpander` field (`GetArtifactInstructionDeps`); spec lists `templates: TemplateExpander`.

#### Discrepancies

1. **Low — factory naming `templates` vs `templateExpander` (spec-wrong).** Wiring is otherwise correct (`resolveGetArtifactInstructionDeps`).

2. **Low — default `LifecycleEngine` in constructor (code-loose).** Spec lists `LifecycleEngine` as a constructor argument; default engine is extra convenience. Composition always injects resolver engine.

3. **None vs hop predicates.** Empty `checksByTarget` is **required**, not a gap (prior audit that treated this as missing hop execute is **obsolete**).

#### Test coverage

Covered: not found, schema mismatch, unknown artifact, rules/instruction/delta, outlines skip missing, template vars without workspace, auto-select first incomplete in topo order, all-complete throws `ArtifactNotFoundError`.

Missing (verify):

- **GetArtifactInstruction uses empty checksByTarget** / does not run hop predicates (no spy).
- **Omitted artifactId ignores persisted complete when engine reports `pending-parent-artifact-review`**.
- Composition `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps`.

#### Counts

- Requirements reviewed: 11
- Implemented as specified: 10
- Discrepancies: 2 (0 high, 0 medium, 2 low)
- Missing tests: 3
- Spec-wrong: 1 (`templates`)
- Code-wrong: 0 vs new requirement
- Both: 0

---

## Cross-cutting checklist

| Check                                              | Result                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hop consumers execute then evaluate                | **Pass:** GetStatus active (`executeChecksByLegalTargets` then `evaluate`); TransitionChange (`executeMatchingPredicates` then `evaluate`); ArchiveChange (`executeMatchingPredicates` then phase effects; archive is not a hop evaluate).       |
| DAG-only consumers `checksByTarget: {}`            | **Pass:** ValidateArtifacts, GetArtifactInstruction; GetStatus draft/unchanged use `{}` (draft uses `projectArtifacts` instead of `evaluate`).                                                                                                   |
| No default `TRANSITION_BINDINGS` stub on use cases | **Pass:** GetStatus / TransitionChange require injected bindings. Archive defaults to `createWorkflowCheckRegistry` application bindings, not `TRANSITION_BINDINGS`. Domain stub exists for matcher tests only.                                  |
| `skipHookPhases` by binding phase                  | **Mostly pass:** use-case loops select effects via `matchingEffects(..., phase)`. Granular skip is check `_phase` + selector (`target.pre` / `source.post` / archive `pre`/`post`), because both transition hook effects share `before-persist`. |
| `archive.publication` is not a CheckId             | **Pass:** absent from `CheckId`, `CHECK_LABELS`, `ARCHIVE_BINDING_SPECS`; domain test asserts absence; publication stays in `_prepareArchivePlan`.                                                                                               |

`gatherPredicateSnapshots` does not exist.

---

## Batch totals

| Spec                          | Reqs reviewed | Discrepancies |  High | Medium |    Low | Missing tests |
| ----------------------------- | ------------: | ------------: | ----: | -----: | -----: | ------------: |
| core:get-status               |            17 |             3 |     0 |      0 |      3 |             4 |
| core:transition-change        |            18 |             3 |     0 |      0 |      3 |             2 |
| core:archive-change           |            14 |             3 |     0 |      1 |      2 |             3 |
| core:validate-artifacts       |            21 |             1 |     0 |      1 |      0 |             1 |
| core:get-artifact-instruction |            11 |             2 |     0 |      0 |      2 |             3 |
| **Batch**                     |        **81** |        **12** | **0** |  **2** | **10** |        **13** |

Interpretation vs 20260826-183525 `_partial-use-cases.md`: the previous “high: validate/instruction missing hop execute” findings are **invalid against current merged specs**. Those use cases are specified as DAG-only. Remaining medium issues: unused ArchiveChange `RunStepHooks` port; ValidateArtifacts constructor Map vs `ListWorkspaces`.

---

# Batch: approvals (stay-in-ready/done, `approval.spec` wildcard, post `along=forward`, template drain)

Audit mode: change `workflow-transition-checks`. Graph: `stale: false` (`contentFresh: true`) at ref `2948f1a2`. Spec content from `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon` (merged deltas). Implementation via `graph search` then file reads. **No code or spec files were modified.**

Focus for this batch:

- Stay-in-`ready` / stay-in-`done` on human approval (no pending parking on the happy path).
- Engine `approval.spec`: `from=ready`, `to=*`, `along=forward`.
- Transition `hook.post` effects only when `along=forward`.
- Skill templates: pending states drain-only.

---

## Spec dependency chain (depth 1)

| Spec                            | Direct deps (from merged preview)                                                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:approve-spec`             | `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, **`core:transition-checks`** (`from` for `approval.spec` from engine bindings)                                                                                                                      |
| `core:approve-signoff`          | same pattern; **`core:transition-checks`** for `approval.signoff`                                                                                                                                                                                                                                        |
| `core:config`                   | `core:vcs-adapter-port`, `default:_global/architecture`, **`core:transition-checks`** (in-place gates, not pending hops)                                                                                                                                                                                 |
| `core:hook-execution-model`     | `core:workflow-model`, `core:schema-format`, `core:hook-runner-port`, `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, `core:get-hook-instructions`, `core:config`, `cli:change-transition`, `cli:change-archive`, **`core:transition-checks`** (`from`/`to`/`along` for effects) |
| `skills:skill-templates-source` | `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, **`core:transition-checks`**                                                                                                                                                                                                     |

Consistency with `core:transition-checks` (not in this batch, but binding source of truth): `TRANSITION_BINDING_SPECS` in `packages/core/src/domain/services/check-bindings.ts`.

---

## Per spec

### `core:approve-spec`

**Implementation map**

| Area       | Location                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| Use case   | `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec.execute` L70–101)    |
| Bindings   | `boundFromStates('approval.spec')` — `check-bindings.ts` L167–168                            |
| Engine row | `approval.spec`: `{ from: 'ready', to: '*', along: 'forward' }` (`check-bindings.ts` L56–60) |
| Factory    | `packages/core/src/composition/use-cases/approve-spec.ts` (`ApproveSpecDeps.contentHasher`)  |
| Tests      | `packages/core/test/application/use-cases/approve-spec.spec.ts`, composition factory tests   |

#### Requirements summary

1. **Gate guard** — `approvals.spec === false` → `ApprovalGateDisabledError('spec')`, no repo I/O; then load change, actor, schema, mismatch.
2. **Change lookup** — missing name → `ChangeNotFoundError`.
3. **Artifact hash computation** — skip `missing`/`skipped`; load `artifact()`; skip `null`; cleanup + hash; keys `type:key`.
4. **Approval recording and state transition** — `recordSpecApproval`; when state is bound `from` for `approval.spec` (currently `ready`), MUST NOT `transition('spec-approved')` or `transition('pending-spec-approval')`; drain `pending-spec-approval` → `spec-approved` MAY.
5. **Persistence** — `ChangeRepository.mutate`; same stay-in-bound-`from` / drain rules; return mutated `Change`.
6. **Input** — `name` + `reason` only; no gate flags.
7. **Gate baked at construction** — `approvals: ApprovalGates`.
8. **Config factory** — `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`.

#### Implementation status

- **Stay-in-`ready` (conforms).** Happy path: `recordSpecApproval` only; `transition('spec-approved')` runs **only** if `freshChange.state === 'pending-spec-approval'` (L96–98). No call to `transition('pending-spec-approval')`.
- **Allow-list is engine-driven (conforms).** `consentFrom = boundFromStates('approval.spec')`; drafting (and any non-consent, non-drain state) throws `InvalidStateTransitionError`. Tests assert `boundFromStates('approval.spec') === ['ready']`.
- **Residual hardcode (error argument only):** `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')`. Allow-list is not hardcoded; `'ready'` is empty-binding fallback for the expected-state field.
- Gate / lookup / mutate / input / constructor gates: match.
- Hashes computed **inside** `mutate` on the fresh instance (compatible with “before recording” on the persisted instance). Unchanged hash bullets still mention `SchemaRegistry` per file; code uses `SchemaProvider.get()` + `buildCleanupMap` once.

#### Discrepancies

1. **Hash wording vs code (pre-existing spec drift).** Requirement still says resolve schema from `SchemaRegistry` per file and empty cleanup if unresolved. Code uses `SchemaProvider` (also used in gate). **Likely spec should say SchemaProvider**; code matches gate-guard and composition.
2. **`resolveApproveSpecDeps` field name.** Spec/verify list `hasher: ContentHasher`; composition type is `contentHasher`. Wiring is correct. **Likely spec should say `contentHasher`.**
3. **Purpose vs recording requirement.** Purpose says stay in `ready`; recording says “state bound as `from` (currently `ready`)”. Aligned today because bindings yield `['ready']`.
4. **Archived workspace spec (graph index)** still describes transitioning into `spec-approved` as the happy path. That is **pre-delta** `specs/core/approve-spec`. Preview/deltas are the source of truth until archive.

#### Test coverage

| Verify scenario (merged)                   | Status                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Gate disabled, no repo access              | Covered                                                                                             |
| Change does not exist                      | Covered                                                                                             |
| Cleanup rules spec vs verify               | **Missing** in this suite                                                                           |
| Artifact load null skipped                 | Indirect; no assertion key absent from map                                                          |
| SchemaProvider.get throws before hash      | **Missing**                                                                                         |
| Ready: `spec-approved` event, stay `ready` | Partial: `state === 'ready'` + `activeSpecApproval.reason`; no history event shape / hashes / actor |
| Drain pending → `spec-approved`            | Covered                                                                                             |
| Drafting → `InvalidStateTransitionError`   | Covered (describe title still says “not in pending-spec-approval”)                                  |
| Persist via `mutate`, return `ready`       | Ready returns `ready`; **`mutate` spy only on drain path**                                          |
| Input name/reason only                     | Type-level only                                                                                     |
| Factory passes `config.approvals`          | Composition tests `instanceof` only                                                                 |
| Enabled gate drain to `spec-approved`      | Covered (verify still uses pending GIVEN — drain, valid)                                            |
| Schema mismatch before mutate              | Covered                                                                                             |

#### Missing tests

- Ready path: `mutate` called; history `type: 'spec-approved'` with reason, hashes, actor; **no** `transitioned` to pending/`spec-approved`.
- Hash key `type:key`; cleanup applied vs not; skip `missing`/`skipped`.
- `SchemaProvider.get()` rejection in gate.
- Factory: deps include `contentHasher` + `approvals` from `config.approvals`.

#### Counts (`core:approve-spec`)

- Requirements: **8**
- Implemented (conforming): **8** (hash/registry wording is spec-side; behavior matches intended hashing)
- Discrepancies: **4** (2 spec-wording, 1 purpose/bindings tightness, 1 archived-spec lag)
- Verify scenarios covered / partial / missing: **7 / 2 / 4** (of 13 listed in merged verify)

---

### `core:approve-signoff`

**Implementation map**

| Area       | Location                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Use case   | `packages/core/src/application/use-cases/approve-signoff.ts` (mirror of ApproveSpec)                                      |
| Engine row | `approval.signoff`: `{ from: 'done', to: 'archivable', along: 'forward' }` (`check-bindings.ts` L61–65) — **not** `to: *` |
| Tests      | `packages/core/test/application/use-cases/approve-signoff.spec.ts`                                                        |

#### Requirements summary

Same eight-requirement skeleton as ApproveSpec, with signoff names: stay in bound `from` (**currently `done`**); MUST NOT `transition('signed-off')` or `transition('pending-signoff')` on that path; drain `pending-signoff` → `signed-off` MAY.

#### Implementation status

- **Stay-in-`done` (conforms).** `recordSignoff` only; `transition('signed-off')` iff `freshChange.state === 'pending-signoff'`.
- **`boundFromStates('approval.signoff')` → `['done']`** (tested).
- Same `contentHasher` vs `hasher` naming, SchemaProvider vs SchemaRegistry wording, and `consentFrom[0] ?? 'done'` error fallback as ApproveSpec.

#### Discrepancies

1. Same hash/`SchemaRegistry` and `hasher` vs `contentHasher` wording as ApproveSpec.
2. **`approval.signoff` is `to: 'archivable'` not `to: *`.** Spec for this use case does not require wildcard `to`; config says `done` cannot go to `archivable` until consent. Engine is narrower than `approval.spec`’s `to: *`. **Not a bug** vs this spec; note if a future forward leave of `done` other than `archivable` should also wait on signoff.
3. Archived workspace spec still describes parking into `signed-off` as the happy path.

#### Test coverage / missing

Mirror of ApproveSpec: stay-in-`done` + drain covered; persist `mutate` spy only on drain; describe title still “not in pending-signoff”; hash cleanup / schema throw / factory field list missing.

#### Counts (`core:approve-signoff`)

- Requirements: **8**
- Implemented: **8**
- Discrepancies: **3** (wording ×2, archived-spec lag)
- Verify: **7 covered / 2 partial / 4 missing** (same pattern)

---

### `core:config`

Delta only rewrites **Requirement: Approvals** (+ spec deps). Other requirements (file location, privacy, workspaces, storage, context, logging, plugins, graph, …) are unchanged by this change.

#### Requirements summary (Approvals — in scope)

- `approvals.spec` / `approvals.signoff` default `false`; independent.
- **`spec: true`:** change in `ready` cannot go to `implementing` until `ApproveSpec` records consent; **stays in `ready`**; `approval.spec` fails `APPROVAL_REQUIRED` until then; when `false`, `ready → implementing` is free (`approval.spec` skips). **New work MUST NOT enter `pending-spec-approval` via `change transition`.**
- **`signoff: true`:** stay in `done` until `ApproveSignoff`; when `false`, `done → archivable` is free. **New work MUST NOT enter `pending-signoff` via `change transition`.**

Verify add: _Spec gate on does not require pending-spec-approval in the graph_.

#### Implementation status

- Loader: `config-loader.ts` L616 `approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }`; `SpecdConfig.approvals` in `specd-config.ts`. Tests parse booleans (`config-loader.spec.ts`).
- In-place wait is **not** encoded in YAML; it is engine `approval.spec` + `ApproveSpec` stay-in-`ready`. Protocol: `isValidTransition('ready', 'pending-spec-approval') === false` and `isValidTransition('done', 'pending-signoff') === false` (`change-state.spec.ts`).

#### Discrepancies

1. **Config Approvals text vs engine `to: *` (spec incomplete vs engine).** Merged config says the spec gate blocks **`ready → implementing`**. Engine binds `approval.spec` as `from: 'ready', to: '*', along: 'forward'`. Tests: `ready → verifying` **matches**; `ready → designing` (redesign) **does not**. If implementing is omitted from workflow, `ready → verifying` still requires spec consent. **Either** config should say “any forward leave of `ready`” **or** the engine should list explicit `to` states. Evidence favors documenting `to: *` (test named “approval.spec wildcard”).
2. **Archived `specs/core/config/spec.md` L481** still documents the **pending hop** (`ready` → `pending-spec-approval` → `spec-approved` → `implementing`). That contradicts this change’s merged Approvals requirement. Expected until archive; **do not treat workspace spec as current.**
3. **Verify scenario “does not require pending in the graph”** has no config-package test; coverage lives in `change-state.spec.ts` protocol edges.

#### Test coverage

| Scenario                                               | Status                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| Parse `approvals.spec` / `signoff` booleans            | Covered (`config-loader.spec.ts`)         |
| Spec gate on → wait is `approval.spec` not pending hop | Engine/lifecycle tests, not config-loader |
| New work cannot `transition` to pending                | Covered (`isValidTransition` false)       |

#### Missing tests

- Config-level documentation/contract test that enabled spec gate does **not** imply a pending state in help/schema comments (optional; behavior is elsewhere).
- Explicit assertion that `ready → verifying` (forward, `to: *`) is gated when `approvals.spec` is on (lives in lifecycle-engine / transition-change, not `core:config` tests).

#### Counts (`core:config` — Approvals delta)

- Requirements in delta: **1** (Approvals), plus ~20 unchanged headings not re-litigated
- Approvals implemented: **yes** (flags + engine/protocol)
- Discrepancies: **3** (config vs `to: *`; archived pending copy; verify not in config tests)
- Unchanged config requirements: **not claimed failing** in this batch

---

### `core:hook-execution-model`

Delta: default selection uses `from`/`to`/`along`; **post only forward**; skipHooks skips effects; post-failure abort before persist on transitions; entity does not run hooks.

#### Requirements summary (delta-touched)

1. **Default execution** — `TransitionChange` selects effects with same matcher as predicates; `phase`/`onFailure` from binding; no private “always source.post on any exit”; no branch on check id for launching `RunStepHooks`.
2. **skipHooks** — `skipHookPhases`; predicates still run; skills that skip auto-hooks MUST apply the same `along` filter (no source.post on backward / redesign / recovery).
3. **Post-hook failure** — binding `onFailure`; transition post `abort` + `before-persist`; archive post `collect` + `after-persist`.
4. **Constraints** — “Transition source.post … **only when `along = forward`**”.
5. **Change entity does not execute hooks** — TransitionChange/ArchiveChange do.
6. **Two execution modes** — TransitionChange uses binding `onFailure`, not “every post is fail-soft”.

Unchanged (still in spec): two hook types, external entries, instruction passive, pre-hook fail-fast, ordering, template expansion.

#### Implementation status

- **Post `along=forward` only (conforms).** `TRANSITION_BINDING_SPECS` `hook.post`: `{ from: '*', to: '*', along: 'forward' }`, `phase: 'before-persist'`, `onFailure: 'abort'` (`check-bindings.ts` L66–71). `hook.pre` uses `along: '*'` with `exceptAlong: ['recovery']`.
- Selection: `matchingEffects` filters `bindingMatches(..., along)` (`execute-hook-effect.ts`). Redesign `implementing → designing` omits `hook.post`, keeps `hook.pre` (`matching-effects.spec.ts`).
- `TransitionChange` test `skips source.post on redesign into designing`.
- Matcher unit: `hook.post` does not match `ready → designing`; does match `implementing → verifying`.

#### Discrepancies

1. **Backward / recovery not asserted at use-case level.** Matcher + redesign covered. No `matchingEffects` / `TransitionChange` test that **`verifying → implementing` (backward)** or **recovery** omits `hook.post`. Implementation should omit them because `along !== 'forward'`. **Gap is tests, not an observed code bug.**
2. **Manual skip-hooks `along` filter in templates** is skill-side (`shared.md.tpl`); hook-execution-model requires skills to apply it — see `skills:skill-templates-source`.

#### Test coverage

| Verify scenario (merged)                        | Status                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Transition source.post skipped on redesign      | Covered (`matching-effects` + `transition-change`)                                           |
| skip all still enforces predicates              | Covered (`still fails incomplete tasks when skipHookPhases is all`)                          |
| Transition source.post failure does not persist | Covered (`throws HookFailedError when source.post hook fails`)                               |
| Archive post collect vs transition abort        | Covered (`matching-effects` archive after-persist collect; transition post abort on binding) |
| TransitionChange auto-runs matching run effects | Covered                                                                                      |
| Post-hooks before persist                       | Covered (ordering tests)                                                                     |

#### Missing tests

- `matchingEffects` / TransitionChange: **backward** omits `hook.post`.
- Recovery omits both `hook.pre` (`exceptAlong`) and `hook.post` (`along=forward`).
- Explicit `along: 'forward'` snapshot on the `hook.post` binding row (phase/onFailure already snapshotted; `along` inferred via matcher tests).

#### Counts (`core:hook-execution-model`)

- Requirements (full spec headings): **12**
- Delta-critical (post forward / skip / failure / entity): **implemented**
- Discrepancies: **1** (test gap on backward/recovery post skip)
- Focus verify: **6/6 covered** for added scenarios; extra along cases missing

---

### `skills:skill-templates-source`

Delta adds **Requirement: In-place approval gates in workflow templates**.

#### Requirements summary (new)

Templates (`specd`, `specd-new`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) and `shared.md.tpl`:

- MUST describe gates as in-place on `ready` / `done`.
- MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff` as happy path.
- **`shared.md.tpl`:** never run `changes approve`; stay in `ready`/`done`; pending **drain only**; hook list MUST NOT treat pending as happy-path intermediates; skip-hooks MUST NOT run `source.post` on backward/redesign/recovery.
- **`specd-design`:** stay in `ready`; stop for human `approve spec`.
- **`specd-implement`:** MUST NOT `transition implementing` while spec gate on and no approval.
- **`specd-verify`:** stay in `done`; MUST NOT “routes to `pending-signoff`”; still owns `done → archivable` after consent.
- **`specd-new`:** pending rows drain-only; `ready`/`done` with unsatisfied gate → approve, not parking.
- Template contract tests MUST assert absence of happy-path parking copy.

Other headings (template location, frontmatter, optimizer, graph snippets, …) unchanged.

#### Implementation status

- **`shared.md.tpl` (conforms):** “MUST NEVER run `changes approve`”; “**stays** in `ready` or `done`”; pending MAY appear only as drain; hook section lists delivery states without pending as intermediates; explicit “MUST NOT run `source.post` on `along` backward, redesign, or recovery”.
- **`specd-implement` (conforms):** stay in `ready`; do not `transition implementing`.
- **`specd-verify` (conforms):** stay in `done`; “Do not `change transition` into `pending-signoff`”.
- **`specd-new` (conforms):** `ready` / `done` rows suggest approve when gate unsatisfied; `pending-*` rows labeled **Drain only**; `spec-approved` drain-only on implement row.
- **`specd-design` (conforms for stay-in-ready):** spec=on → tell user `approve spec`, stop; no pending hop. Does **not** use the words “stay in `ready`” (implement does).
- **`specd` entry + `specd-archive`:** **no** in-place gate copy and **no** pending parking copy. Satisfies MUST NOT teach parking; **weak** on MUST **describe** gates (requirement lists those templates by name).

Tests: `packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` covers verify, implement, shared, new. **No** specd-design / specd / specd-archive assertions in that test.

#### Discrepancies

1. **Listed templates vs copy (`specd`, `specd-archive`).** Spec names them as MUST describe in-place gates. They are silent. **Either** add a short in-place paragraph **or** narrow the spec to the templates that actually own the gate UX (`shared`, design, implement, verify, new). Neither-side: silence does not teach parking.
2. **`specd-design` not in contract test** despite being named in the requirement and having stay-in-ready behavior.

#### Test coverage

| Verify scenario                                                                | Status                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| Verify skill does not route to pending-signoff; stay in done + approve signoff | Covered                                  |
| Implement does not hop implementing; stay in ready                             | Covered                                  |
| Shared: never approve; stay ready/done; not “reaches pending-spec-approval”    | Covered                                  |
| Shared hook list not pending intermediates                                     | Covered (`Do **not** list pending...`)   |
| New-skill pending drain-only                                                   | Covered (`Drain only:` + ready gate row) |
| Design stay-in-ready / no pending hop                                          | **Missing** as a dedicated assertion     |
| specd / specd-archive                                                          | **Missing**                              |

#### Missing tests

- `specd-design/SKILL.md.tpl`: no `pending-spec-approval` happy-path; spec=on stop + `approve spec`.
- Optional: `specd` / `specd-archive` do not contain `routes to pending-*` / `reaches pending-*`.
- Assert `shared.md.tpl` forbids `source.post` on backward/redesign/recovery (copy exists; test does not grep that sentence).

#### Counts (`skills:skill-templates-source`)

- New requirement: **1** (with 5 verify scenarios)
- Happy-path parking: **absent** in inspected templates
- Drain-only pending: **present** in shared + specd-new
- Discrepancies: **2** (silent specd/archive vs MUST describe; missing design contract test)
- Verify: **5 covered / 0 partial / 2 extra gaps** (design; specd/archive)

---

## Cross-cutting: `approval.spec` `from=ready` `to=*` `along=forward`

| Claim             | Evidence                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Binding           | `check-bindings.ts` L56–60: `from: 'ready', to: '*', along: 'forward'`, `reportSkipWhenUnmatched: true`             |
| `boundFromStates` | `['ready']`; `boundToStates('approval.spec')` **`[]`** (wildcard omitted)                                           |
| Matcher           | `ready → verifying` matches; `ready → designing` does not (`transition-checks.spec.ts`)                             |
| Predicate         | `approval-spec.ts`: skip if gate off; pass if `activeSpecApproval`; else `APPROVAL_REQUIRED` “before leaving ready” |
| ApproveSpec stay  | Consent in `ready` without leaving `ready` so the next **forward** bound edge can pass                              |

**Config spec vs this binding:** config still names only `implementing` as the blocked `to`. Engine + tests encode wildcard `to` + forward-only `along`. Flagged under `core:config`.

**`approval.signoff` is not `to: *`:** `from: 'done', to: 'archivable', along: 'forward'`. Symmetric stay-in-`done`, narrower `to`.

---

## Summary counts (this batch)

| Spec                            | Reqs (focus / full headings) | Conforming impl             | Discrepancies | Missing tests (material)                                           |
| ------------------------------- | ---------------------------- | --------------------------- | ------------- | ------------------------------------------------------------------ |
| `core:approve-spec`             | 8 / 8                        | Yes (stay-in-ready + drain) | 4             | Ready `mutate`/history; hash cleanup; schema throw; factory fields |
| `core:approve-signoff`          | 8 / 8                        | Yes (stay-in-done + drain)  | 3             | Same pattern as spec                                               |
| `core:config`                   | 1 delta / ~20                | Flags + protocol            | 3             | Config verify “no pending in graph” not in config tests            |
| `core:hook-execution-model`     | 4 delta / 12                 | Post `along=forward`        | 1             | Backward/recovery omit `hook.post`                                 |
| `skills:skill-templates-source` | 1 new / 15                   | Drain-only in shared/new    | 2             | Design (and specd/archive) contract tests                          |

**Totals (this batch):** ~26 requirement headings fully listed; **focus items implemented**; **13 discrepancy notes** (several are spec-wording / archive lag / test gaps, not stay-in-state bugs); **material missing tests ~12**.

**Verdict on asked focus**

- Stay-in-`ready` / stay-in-`done`: **code and primary use-case tests match merged specs.**
- `approval.spec` `from=ready to=* along=forward`: **engine + matcher tests match**; config Approvals prose is **narrower** (`implementing` only).
- Post hooks `along=forward` only: **binding + redesign tests match**; backward/recovery **untested at use-case**.
- Skill templates drain-only pending: **shared, new, implement, verify match**; `specd`/`specd-archive` silent; design untested.

---

# Spec-compliance partial: CLI (`cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`)

- **Mode:** change `workflow-transition-checks` (merged spec-preview, not archived `specs/`)
- **Auditor:** read-only; no code or spec files modified
- **Sources:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive,_check-progress-presenter}.ts`, `packages/cli/src/handle-error.ts`
- **Tests:** `packages/cli/test/commands/change-{status,transition,approve,archive}.spec.ts` plus `packages/cli/test/commands/change/change-{status,transition,approve}.spec.ts`
- **Graph:** not stale (`stale: false` at audit time)

This batch is the **CLI adapter**. Kernel/engine behaviour (whether `TransitionChange` actually stays in `ready` when `approval.spec` fails) is delegated; this audit judges whether the CLI rewrites targets, how it presents progress/errors, and whether tests lock the merged CLI contract.

---

## Requirements summary

### `cli:change-status` (merged)

| ID  | Requirement                                     | Intent (change deltas highlighted)                                                                                                                                                      |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                               | `change status <name> [--format]`                                                                                                                                                       |
| S2  | Drafted status is read-only                     | No mutating next-action; `isDrafted` in JSON                                                                                                                                            |
| S3  | Output format                                   | DAG `hasTasks`; `artifactDag[].state` is display-state                                                                                                                                  |
| S4  | Task completion in DAG                          | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                                                                                                                                        |
| S5  | Display-state rendering                         | `complete-with-drift`; JSON has canonical + display                                                                                                                                     |
| S6  | **Lifecycle projections from GetStatus checks** | Render `availableTransitions` / `nextAction` / blockers as GetStatus returned them; **do not** union protocol `VALID_TRANSITIONS` (e.g. advertising `verifying` while tasks incomplete) |
| S7  | **Text omits duplicated review file lists**     | No `review:` header/files for artifact-review/drift; overlap peers still printed; JSON keeps full `review`                                                                              |
| S8  | **Text blockers include check labels**          | `! CODE — <gerund label>: <message>`; JSON `label` / `checkId`                                                                                                                          |
| S9  | Schema version warning                          | stderr `warning:`; exit 0; compare via `lifecycle.schemaInfo`                                                                                                                           |
| S10 | Change not found                                | exit 1 + `error:`                                                                                                                                                                       |
| S11 | Schema-derived fields                           | DAG via `schema.artifactDag()`; display status; no convergent repeats                                                                                                                   |
| S12 | Delegates refresh to GetStatus                  | No direct refresh/detector                                                                                                                                                              |
| S13 | Implementation section                          | `--implementation` uses SDK projection                                                                                                                                                  |
| S14 | Task completion in details                      | `tasks: N/M`                                                                                                                                                                            |
| S15 | Basic info                                      | name + state; no standalone `specs:` line                                                                                                                                               |
| S16 | Specs and dependencies                          | text section + JSON `specDependsOn`                                                                                                                                                     |

**Constraints (merged):** CLI must not apply a second `VALID_TRANSITIONS`-only filter vs `GetStatus.availableTransitions`. Lifecycle is a projection of GetStatus + check evaluation.

### `cli:change-transition` (merged)

| ID  | Requirement                   | Intent (change deltas highlighted)                                                                                                                                                            |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature             | `<name> [step]` or `--next`; `--skip-hooks` phases                                                                                                                                            |
| T2  | Next-transition map           | drafting→designing … done→archivable; **signed-off→archivable**; pending-\* and archivable fail with explanatory `error:`                                                                     |
| T3  | Refresh policy                | GetStatus `refreshImplementationTracking: false` before execute and for repair diagnostics                                                                                                    |
| T4  | **No silent pending routing** | Do **not** rewrite `implementing`→`pending-spec-approval` or `archivable`→`pending-signoff`. User names delivery target; failed `approval.spec` / `approval.signoff` stay in `ready` / `done` |
| T5  | Hook execution                | Map `--skip-hooks` to `skipHookPhases`; fail-fast                                                                                                                                             |
| T6  | Progress output               | Generic check bus; JSON/TOON `stream: "change-transition"`; **no** `stream: "hook-progress"` from this command                                                                                |
| T7  | Hook observability            | Progress before hook-triggered failure                                                                                                                                                        |
| T8  | Shared presentation           | Transition uses **check-progress presenter**; `run-hooks` may keep `_hook-progress-presenter`; **must not share public JSON stream name**                                                     |
| T9  | Success output                | Text confirmation on stdout; structured terminal `complete` on same stream                                                                                                                    |
| T10 | Post-hook / hook failure      | Fail-fast; **exit 2**; `error:` (not a post-transition warning)                                                                                                                               |
| T11 | Invalid transition            | exit 1; **Repair Guide on stderr** (not stdout); labeled blockers; **`HookFailedError` MUST NOT render Repair Guide**                                                                         |
| T12 | Incomplete tasks              | exit 1 naming artifact; status should already omit `verifying`                                                                                                                                |
| T13 | Check progress rendering      | `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix; hooks as `Running pre/post hooks`                                                                                                      |
| T14 | Unsatisfied requires          | exit 1; repair from GetStatus                                                                                                                                                                 |

**Base→merged reversal:** archived spec still described silent routing to pending-\* states. Merged spec forbids CLI rewrite and forbids persisting pending via CLI routing.

### `cli:change-approve` (merged)

| ID  | Requirement                     | Intent                                                                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| A1  | Command signatures              | `approve spec                                                                                                                                                | signoff <name> --reason` |
| A2  | Delegates gate to kernel        | `{ name, reason }` only; `kernel.changes.approve*`                                                                                                           |
| A3  | No CLI hashes                   | Use case owns hashes                                                                                                                                         |
| A4  | **Approve spec from `ready`**   | Valid binding `from` is `ready` (drain: `pending-spec-approval`); stay in `ready`; **must not print transition to pending**; help uses bound-`from` language |
| A5  | **Approve signoff from `done`** | Same pattern for `done` / drain `pending-signoff`                                                                                                            |
| A6  | Success output                  | text `approved <gate> for <name>`; JSON `result/gate/name`                                                                                                   |
| A7  | Errors                          | missing `--reason` usage 1; wrong state / not found exit 1 + `error:`                                                                                        |

### `cli:change-archive` (merged)

| ID    | Requirement                  | Intent                                                                                     |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| R1    | Command signature            | `changes archive` + singular alias; skip-hooks pre/post/all; `--allow-overlap`             |
| R2    | Prerequisites                | must be `archivable`; else exit 1 naming state                                             |
| R3    | Behaviour                    | Delegate `ArchiveChange`                                                                   |
| R4    | Hook execution               | Map `--skip-hooks` to archive selector                                                     |
| R5    | **Check progress rendering** | Same gerund bus as transition; stream `change-archive`; no `Executing:`; hooks on same bus |
| R6    | Post-archive hooks           | post-hook failures → **exit 2**                                                            |
| R7–R9 | Success text/JSON            | archive path; invalidated section; JSON `result/name/archivePath`                          |
| R10   | Errors                       | not found / not archivable / merge fail → 1                                                |

---

## Implementation status

### Shared presenter

`createCheckProgressPresenter` (`_check-progress-presenter.ts`) implements the merged text contract (`label (id)`, indented progress, `✓`/`✗`, no `Executing:`). Structured records use `streamName` `'change-transition' | 'change-archive'`. Text goes to **stderr**; JSON/TOON to **stdout**. Transition wires `streamName: 'change-transition'`. Archive wires `'change-archive'`.

`change run-hooks` still uses `_hook-progress-presenter.ts` and public `stream: "hook-progress"`. That matches merged **T8** (different public stream). JSDoc on the hook presenter still claims it is used by `change transition` — stale comment only.

### `change status`

- Text `transitions:` is `lifecycle.availableTransitions.join`, not a local protocol union (**S6** implemented).
- `nextAction` is printed from GetStatus as-is (**S6**).
- Blockers: `! ${code} — ${label}: ${message}` when `label` present (**S8**). JSON maps `label`/`checkId`.
- Review files: no `review:` header; overlap-only `overlap:` bullets when `reason === 'spec-overlap-conflict'` (**S7**). JSON still serializes full `review`.
- No `VALID_TRANSITIONS` symbol in CLI package.
- Pre-existing behaviour (DAG, draft branch, schema warning, implementation flag, specs section) remains.

### `change transition`

- `resolveNextTarget` includes **`signed-off` → `archivable`** (**T2**).
- Pending spec/signoff/archivable/archiving `--next` → `cliError` with the specified explanations.
- `transition.execute({ name, to, skipHookPhases }, onProgress)` — **no approval flags**; `to` is the user/logical target, never rewritten to pending-\* (**T4**).
- Pre/post GetStatus both pass `refreshImplementationTracking: false` (**T3**).
- Repair guide: `writeTextRepairGuide` writes **entirely to stderr** (**T11**). `isRepairGuideError` is `InvalidStateTransitionError | ReadOnlyWorkspaceError | ArchiveDependencyMismatchError | ArchiveImplementationStateError`. **`HookFailedError` is not included** → falls through to `handleError` → **exit 2** (**T10/T11**).
- Check events use check presenter; `requires-check` / `task-completion-failed` / `transitioned` also use `stream: "change-transition"` in structured mode. No `hook-progress` emission from this file.
- Success JSON: terminal `{ stream: "change-transition", event: { type: "complete", result: { result, name, from, to } } }`.
- Failure JSON: same stream `complete` with `result: "failure"`, `blockers`, `nextAction`.

Gate _enforcement_ (stay in `ready` when spec approval missing) is **not** implemented in the CLI; it is expected from the kernel. CLI tests that mock `transition.execute` **success** to `implementing` while `approvals.spec: true` only prove **no rewrite**, not kernel rejection.

### `change approve`

- Help: spec from **ready** (drain pending-spec-approval); signoff from **done** (drain pending-signoff) (**A4/A5**).
- Executes `kernel.changes.approveSpec/approveSignoff({ name, reason })` only (**A2/A3**).
- Text: `approved spec|signoff for ${name}` — does not print pending transitions (**A4/A5/A6**).
- State validity is kernel-side; CLI maps errors via `handleError` (exit 1).

### `change archive`

- Delegates to `kernel.changes.archive.execute` with skip-hooks / overlap / out-of-scope.
- Progress via check presenter on `change-archive`.
- `postHookFailures.length > 0` → `cliError(..., 2)` (**R6**).
- JSON success writes a **standalone** `{ result, name, archivePath, invalidatedChanges }` object (not wrapped as `stream`/`complete`). Text success stays on stdout; progress on stderr.

### Exit codes (`handle-error.ts`)

`HookFailedError` / `HOOK_FAILED` → exit **2** with `error: hook '<command>' failed` and stderr detail. Aligns with T10 and archive post-hooks (archive uses `cliError` directly for collected post failures).

---

## Discrepancies

Each item lists **spec-wrong vs code-wrong vs both**, with evidence.

### D1 — `cli:change-transition` verify.md vs spec.md: shared presentation with `run-hooks`

- **Merged spec.md T8:** transition uses check-progress presenter; run-hooks may keep hook presenter; **must not share JSON stream name**.
- **Merged verify.md** still has scenario _“Equivalent hook events render with the same presentation contract as run-hooks”_.
- **Code:** different presenters (`[running] hookId` vs `Running pre hooks (hook.pre)`); streams `hook-progress` vs `change-transition`.
- **Verdict:** **spec-internal drift** (verify lagged spec.md). Code matches **spec.md**. If verify is treated as binding, code would be non-compliant — prefer updating verify, not re-unifying streams.

### D2 — `cli:change-archive` JSON success vs check-progress NDJSON

- **R9** (unchanged): stdout is **valid JSON** with `result/name/archivePath`.
- **R5** (new): JSON/TOON emit newline-delimited `{ stream: "change-archive", event }` records on stdout.
- **Code:** progress records on stdout in json/toon; terminal payload is a **second** unwrapped object. If any check event is emitted, `JSON.parse(entire stdout)` fails.
- **Transition** resolved this by making `complete` a stream record (**T9**). Archive did not.
- **Verdict:** **both partially wrong / incomplete alignment**. Tests pass R9 only because mocks often emit **no** progress. When archive actually streams checks in `--format json`, R9 and R5 conflict.

### D3 — Approve verify.md JSON scenario still GIVEN `pending-spec-approval`

- **Merged spec A4:** success from `ready`.
- **Merged verify “JSON output on successful approval”:** still GIVEN `pending-spec-approval`.
- **Code/tests:** JSON payload does not depend on state; extra tests cover ready/done.
- **Verdict:** **verify lag**, not a CLI bug. Drain GIVEN is still useful; primary GIVEN should be `ready`.

### D4 — Approval-gate **verify** scenarios vs CLI unit tests

- **Merged verify T4:** `transition … implementing` with spec gate on and no approval → **exit 1**, remain `ready`, no pending in stdout.
- **CLI tests:** mock `transition.execute` **resolved** to `implementing` and assert no pending rewrite.
- **Code:** cannot fail the transition by itself; it prints whatever `result.change.state` the kernel returns.
- **Verdict:** **CLI implementation of T4 (no rewrite) is compliant**. Full verify scenario is **integration/kernel**. Risk: if kernel still silently routed, CLI would **print** `ready → pending-spec-approval` (stdout uses `result.change.state`). That would violate merged T4 **output** even without CLI rewrite. Flag for core+CLI integration, not a CLI rewrite bug.

### D5 — Stale comment on `_hook-progress-presenter.ts`

Claims use by `change transition`. Transition no longer imports it. **Docs/comment drift**; behaviour OK.

### D6 — Approve spec.md “Output on success” body still truncated

Base and merged spec.md still say `text` “prints to stdout:” with empty bullets. Tests and code use `approved spec|signoff for <name>`. **Pre-existing spec incompleteness**, not introduced as a functional bug.

### D7 — Repair guide on stdout (base verify) vs stderr (merged)

Base verify said repair guide on **stdout**. Merged spec + verify + **code** use **stderr**. Tests assert stderr and that stdout is not used for the guide. **Compliant with merged spec.** Do not treat base verify as current.

No evidence of CLI silently mapping targets to `pending-spec-approval` / `pending-signoff`.

---

## Test coverage

### `cli:change-status`

| Req                 | Coverage                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1                  | `change-status.spec.ts` missing name                                                                                                                       |
| S2                  | Drafted scenarios not found in these two status files (may live in `change.spec.ts` / drafts); **gap for this change’s files**                             |
| S3–S5, S11, S14–S16 | existing DAG/details/JSON tests                                                                                                                            |
| S6                  | `change/change-status.spec.ts`: availableTransitions not unioned with `validTransitions`; nextAction verify vs implement                                   |
| S7                  | artifact-review-required and artifact-drift omit `review:`; overlap peers without review header (`change-status.spec.ts` + `change/change-status.spec.ts`) |
| S8                  | DEPS_INCONSISTENT gerund in text + JSON `label`                                                                                                            |
| S9–S10              | schema mismatch; unknown name                                                                                                                              |
| S12                 | not a dedicated spy in the new file; transition tests spy refresh more strongly                                                                            |
| S13                 | implementation tracking tests in main status spec                                                                                                          |

### `cli:change-transition`

| Req                      | Coverage                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| T1                       | missing args; `--next` vs step exclusive; `--next` from drafting                                                              |
| T2                       | `--next` designing→ready (via execute `to`); pending-\* and archivable failures; **signed-off→archivable: no test**           |
| T3                       | repair-guide test asserts both GetStatus calls `refreshImplementationTracking: false`                                         |
| T4                       | no rewrite implementing/archivable; `--next` from ready requests implementing                                                 |
| T5                       | skip-hooks all / comma-separated; default empty set                                                                           |
| T6                       | JSON success lines all `stream: "change-transition"` including hook checks; no `hook-progress`                                |
| T7                       | failed hook progress on check bus then exit 2                                                                                 |
| T8                       | not asserted vs run-hooks (correct vs spec.md; contradicts stale verify)                                                      |
| T9                       | text success; JSON complete ok                                                                                                |
| T10                      | `HookFailedError` → `process.exit(2)`                                                                                         |
| T11                      | repair guide on stderr; labeled READ_ONLY_WORKSPACE; **HookFailedError tests do not `expect.not.toContain('repair guide:')`** |
| T12                      | incomplete tasks + skip-hooks still blocked                                                                                   |
| T13                      | gerund `impl.linksInScope`; no `Executing:`                                                                                   |
| T14                      | requires via InvalidStateTransition + GetStatus blockers                                                                      |
| T9 failure JSON complete | **not found**                                                                                                                 |

### `cli:change-approve`

| Req   | Coverage                                                           |
| ----- | ------------------------------------------------------------------ |
| A1    | missing reason; unknown sub-verb                                   |
| A2    | execute `{ name, reason }`                                         |
| A4/A5 | ready/done stay; drain pending still invoked; no pending in stdout |
| A6    | JSON ok/gate/name                                                  |
| A7    | not found; wrong state (`ApprovalGateDisabledError`)               |

### `cli:change-archive`

| Req   | Coverage                                                       |
| ----- | -------------------------------------------------------------- |
| R1    | missing name; skip-hooks all / pre+post                        |
| R2    | not archivable → exit 1                                        |
| R3    | text path confirmation                                         |
| R4    | skip phases forwarded                                          |
| R5    | gerund workspace check + Running pre hooks; no Executing       |
| R6    | post-hook failure exit 2, no success line                      |
| R7–R9 | invalidated text/JSON; JSON.parse success (no progress events) |
| R10   | not found                                                      |

---

## Missing tests

1. **`--next` from `signed-off` resolves `to: 'archivable'`** (merged T2 / verify scenario). Implementation exists; **no CLI test**.
2. **JSON/TOON failure terminal record** `{ stream: "change-transition", event.type: "complete", result.result: "failure", blockers, nextAction }`.
3. **`HookFailedError` does not print `repair guide:`** (verify T11). Exit 2 and `✗ Running post/pre hooks` are covered; absence of repair guide is not.
4. **Archive JSON with in-flight check events** — NDJSON `change-archive` + terminal shape (exposes D2).
5. **`--next` from ready when kernel rejects missing spec approval** (exit 1, stay ready) — CLI-only mock of `transition.execute` **rejection**, not success (verify T4 as user-visible CLI).
6. **Status: `availableTransitions` omit `verifying` with incomplete tasks** is covered at renderer level (S6); **status-then-transition pairing** (verify T12 second scenario) is not a single CLI test.
7. **Drafted status (S2)** not in the change-focused status extras (pre-existing home may be elsewhere).
8. **Skip-hooks `target.pre` vs `source.post` independently** — comma parse exists; per-phase execute assertions vs hook runner are thin (mostly forwarding the set).
9. **Dedicated `_check-progress-presenter.spec.ts`** — none; behaviour covered only through command tests.

---

## Spec dependency chain

| Spec                    | Declared deps (merged)                                                                                                                                                       | Notes                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `cli:change-status`     | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, **`core:transition-checks`** (new)                                                    | S6/S8 depend on GetStatus check-derived blockers/labels           |
| `cli:change-transition` | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, **`core:transition-checks`** (new: check bus, no pending rewrite) | T4/T6/T11 are CLI projections of that core spec                   |
| `cli:change-approve`    | `cli:entrypoint`, `core:change`, **`core:transition-checks`** (approval.spec / approval.signoff)                                                                             | Help/`from` language must stay aligned with binding `from` states |
| `cli:change-archive`    | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, **`core:transition-checks`**                             | R5 shares presenter with transition                               |

**Global / architecture:** CLI remains an adapter (no domain routing logic). That matches T4 (no local pending rewrite). Hexagonal: progress presenter is presentation, not policy.

**Consistency:** Merged CLI specs agree with each other on no silent pending, repair-on-stderr, check bus, approve-from-ready/done. Conflicts are **within** transition (spec.md T8 vs verify shared-run-hooks) and **archive JSON** (R5 vs R9).

---

## Summary counts

Counted against **merged** requirements in the four specs (S1–S16, T1–T14, A1–A7, R1–R10). Implementation “implemented” means CLI adapter behaviour matches merged spec.md even if kernel is mocked.

| Metric                                           | Count                                                          |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Specs in this batch                              | 4                                                              |
| Requirements (merged, named)                     | 47                                                             |
| Implemented in CLI (aligned with merged spec.md) | 45                                                             |
| Partial / contract tension                       | 2 (D2 archive JSON+stream; D1 verify-only shared presenter)    |
| Missing CLI implementation of merged spec.md     | 0 (signed-off `--next` is implemented, untested)               |
| Discrepancies filed                              | 7 (D1–D7; D4/D6/D7 are verify/base/docs, not CLI rewrite bugs) |
| Requirements with solid CLI tests                | ~38                                                            |
| Requirements with weak/missing CLI tests         | ~9 (see Missing tests)                                         |
| New-change checks of interest                    |                                                                |
| — Silent pending routing in CLI                  | **Absent** (compliant)                                         |
| — Repair guide on stderr                         | **Present**                                                    |
| — Transition JSON stream `change-transition`     | **Present** (hooks on same stream)                             |
| — `HookFailedError` exit 2                       | **Present**                                                    |
| — `--next` signed-off → archivable               | **Implemented, untested**                                      |
| — Approve from ready/done                        | **Present** (help + tests)                                     |

**Bottom line:** CLI matches the **merged spec.md** for no silent pending rewrite, stderr repair guides, check-bus progress, HookFailedError exit 2, and approve-from-ready/done. Highest-value gaps are **unsigned `--next` from `signed-off`**, **JSON failure complete records**, **explicit no-repair-guide on hook failure**, and **archive JSON vs NDJSON progress**. Treat verify.md “same presentation as run-hooks” as stale relative to spec.md.
