# Partial compliance audit — delivery topology surfaces

- Change: `schema-workflow-skippable-states`
- Delegated attempt: `verification-attempt-7`
- Scope: `core:transition-change`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`
- Method: merged change previews, depth-1 dependency declarations, global architecture/testing/conventions context, graph-first symbol discovery, direct implementation/test inspection, and focused test execution.
- Lifecycle ownership: delegated/read-only; this audit did not start or complete the attempt and did not mutate lifecycle, code, or specs.

## Executive result

**Not fully compliant.** Core and CLI implement the schema-driven topology correctly in the audited paths, including sovereign schema resolution, `to: 'next'`, bypass checks, and hook suppression. The lifecycle skill templates and generated copies contain new schema-aware routing prose, but their executable instructions still encode fixed targets in multiple later steps. Their tests mostly assert phrase presence and therefore do not prove the representative disabled/bypassed flows required by the design. A second, pre-existing merged-contract inconsistency remains around the deprecated `allowOutOfScope` / `allowOverlap` input booleans.

Severity counts: **1 HIGH, 1 MEDIUM**. No LOW findings.

## Requirements summary and implementation status

| Spec / requirement cluster                                                                                                             | Status             | Evidence                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-change` — `to: 'next'` uses the change's sovereign schema and `WorkflowTopology.nextForwardStep`                      | PASS               | `TransitionChange.execute` calls `SchemaProvider.get(change.schemaName)` and passes the resulting schema plus configured approvals to `nextForwardStep`; `HappyPathNextUnavailableError` covers no-hop states. Focused test proves disabled `verifying` resolves directly from `implementing` to `done` and asserts the requested schema name. |
| `core:transition-change` — bypassed-step checks, dynamic schema bindings, and no hooks for bypassed steps                              | PASS               | `bypassedSteps(...)`, `resolveEffectiveBindings(...)`, separate `step-skip` predicate evaluation, and effect matching only for the actual transition attempt implement the merged contract. Tests cover optional-step rejection/pass, custom schema `skipChecks`, target checks, and absence of `implementing` hooks on `ready -> verifying`.  |
| `cli:change-status` — project GetStatus topology without local re-filtering; optional annotation, disabled exclusion, shortcut display | PASS               | The command renders the lifecycle projection returned by Core. CLI tests prove `[optional]` rendering and `availableTransitions` preservation. No separate CLI protocol graph is used to replace Core's projection.                                                                                                                            |
| `cli:change-transition` — no target or `--next` passes `to: 'next'`; Core owns routing; typed failure is surfaced                      | PASS               | Command constructs `to: explicitTarget ?? 'next'` and delegates to `TransitionChange`; tests cover `to: 'next'` and explanatory failures for no-hop pending states.                                                                                                                                                                            |
| `skills:workflow-automation` — consume `nextAction.command` and `lifecycle.availableTransitions` dynamically                           | **PARTIAL / FAIL** | All four templates and `.agents` / `.codex` copies now contain a schema-aware routing section, but later operational steps still name fixed lifecycle targets (`ready`, `implementing`, `verifying`, `done`, `archivable`) and fixed target hooks without a concrete variable/branch derived from the refreshed status. See Finding D-1.       |
| `skills:workflow-automation` — never run hooks for bypassed/disabled intermediate steps                                                | **PARTIAL / FAIL** | Prose forbids skipped-step hooks, but the verify/design execution recipes still explicitly run hooks for canonical intermediate steps. There is no executable worked branch proving direct target hook selection. Existing tests cannot detect this contradiction. See Finding D-1.                                                            |
| Dependency/global conformance                                                                                                          | PASS with caveat   | Dependencies name `core:workflow-topology`, `core:transition-checks`, `core:get-status`, CLI status/transition and global architecture. Business routing remains in Core; CLI and skills delegate inward. The caveat is the contradictory transition input contract in Finding D-2.                                                            |

Requirement cluster counts: **5 PASS, 2 PARTIAL/FAIL** (7 audited clusters).

## Discrepancies

### D-1 — HIGH — Lifecycle skills state dynamic routing but still prescribe fixed-target hops and hooks

**Spec/design expectation**

The merged `skills:workflow-automation` contract requires skills to consume `nextAction.command` and `lifecycle.availableTransitions` dynamically, advance directly along the advertised legal path, and never execute hooks for a bypassed or disabled intermediate. The corrective design is more explicit: refresh status before advancement, select the actual target from `availableTransitions`, run hooks only for the actual source/target, transition with `--skip-hooks all`, and test disabled-`verifying` plus optional-`implementing` representative flows.

**Implementation evidence**

The four templates have a good introductory routing rule and the generated `.agents` / `.codex` copies carry it. However, later imperative recipes remain static:

- `specd-design` always runs `ready` pre-hooks and transitions to `ready` after artifacts.
- `specd-implement` always enters `implementing` from `ready` and, on completion, always tells the user to invoke verify; it does not show a direct selected-target transition for an optional implementation bypass.
- `specd-verify` explicitly runs `verifying` hooks/transition from `implementing`, then fixed `done` hooks/transition, then fixed `archivable` hooks/transition. If `verifying` or `done` is disabled/bypassed, these later commands contradict the opening rule.
- `specd-archive` is less exposed because it is intentionally entered only at `archivable`/`archiving`, but its routing section is still only a guard; it provides no common actual-target algorithm shared with the other lifecycle skills.

The result depends on an agent reconciling contradictory prose rather than on an unambiguous executable protocol. This is precisely the failure mode the proposal intended to remove (hardcoded topology causing stalls/loops or hooks on non-visited phases).

**Test evidence**

- `generated-skill-protocol.spec.ts` checks only that each file contains the strings `nextAction.command`, `lifecycle.availableTransitions`, and `bypassed`.
- `template-workflow.spec.ts` checks only two phrases in verify/implement. It does not render or model a disabled-`verifying` route or an optional-`implementing` bypass, does not assert the chosen direct target receives hooks, and does not assert intermediate hook commands are absent.
- Therefore the tests described in design § Testing and validation items 1–2 were not implemented in substance, despite passing.

**Two-sided assessment**

- Implementation-bug interpretation: templates must replace fixed target recipes with an explicit actual-target branch/placeholder derived from fresh structured status, and tests must exercise representative topology snapshots.
- Spec-drift interpretation: if the intended guarantee is merely “place a warning paragraph in each skill and trust the agent to override later recipes,” the merged MUST language and corrective design/tests are too strong and must be weakened. This would conflict with the proposal's stated goal, so implementation correction is the better fit.

### D-2 — MEDIUM — Merged TransitionChange input contract rejects ad-hoc booleans, but Core still accepts and executes them

**Spec evidence**

The merged `core:transition-change` input requirement says the use case MUST NOT accept `allowOutOfScope` or `allowOverlap`; bypasses must be supplied uniformly through `skipChecks`. The same merged spec later retains an older statement that `allowOutOfScope` may skip `impl.linksInScope`, so the spec is internally inconsistent.

**Implementation evidence**

`TransitionChangeInput` still exports both deprecated booleans, and `execute` translates them into `skipChecks`. The CLI correctly translates legacy flags to `skipChecks`, so it does not need to pass these booleans into Core.

**Two-sided assessment**

- Implementation-bug interpretation: remove the deprecated fields and translation from Core, retaining CLI compatibility solely at the adapter boundary.
- Spec-drift interpretation: if public Core API compatibility is intentionally retained, revise the input requirement to explicitly permit deprecated aliases and remove the contradictory MUST NOT. The proposal emphasizes uniform check bypasses and adapter translation, which favors removing them from the use case contract.

## Test coverage

Executed evidence:

- Focused Core: `transition-change.spec.ts` — **1 file, 119 tests passed**.
- CLI suite invoked for status/transition evidence — **86 files, 1101 tests passed**.
- Skills suite invoked for generated protocol/template evidence — **9 files, 64 tests passed**.

Coverage strengths:

- Sovereign `change.schemaName` resolution and disabled next-step routing.
- Optional-step bypass predicates and custom declarative `skipChecks`.
- Suppression of Core hook effects for bypassed `implementing`.
- CLI delegation of `to: 'next'`, repair/error paths, and status projection rendering.
- Presence of routing language in templates and both generated trees.

## Missing or insufficient tests

1. A behavioral/template-model test for **disabled `verifying`** that supplies a structured routing snapshot, proves the direct target (for example `done`) receives its hooks/transition, and proves no `verifying` pre/post hook command is selected.
2. A behavioral/template-model test for **optional `implementing` bypass** that proves routing follows `nextAction.command`, the direct target is in `availableTransitions`, and no implementing hook/transition is executed.
3. A test that fails when a lifecycle template contains an unconditional canonical target recipe inconsistent with the dynamic routing contract; phrase-presence assertions are insufficient.
4. A compile/API contract test (or removal test) ensuring `TransitionChangeInput` no longer exposes `allowOutOfScope` / `allowOverlap`, if the merged MUST NOT remains authoritative.

## Template/generated parity

The routing clauses are present in all four source templates and in both installed trees (`.agents`, `.codex`). The generated-protocol suite passes, so no missing-copy drift was observed for the added clauses. This does **not** cure D-1: source and generated outputs are consistently incomplete in the same way.

## Dependency and global-spec review

- `core:transition-change` depends on topology, transition checks, check registry, lifecycle engine, hook execution, change and architecture as required.
- CLI status/transition remain adapters: Core supplies projections and performs topology/check evaluation.
- `skills:workflow-automation` declares the status and transition dependencies needed for dynamic routing.
- Global architecture is respected in Core/CLI placement; global testing is met for the existing tests, but the missing behavioral skill cases leave the new MUST semantics under-tested.
- No contradiction found with global conventions or error-handling for `HappyPathNextUnavailableError` and CLI stderr/exit behavior.

## Fidelity to proposal and design intent

Core and CLI faithfully implement the proposal's central intent: schemas control active steps; disabled steps disappear; optional steps are bypassable only through skip predicates; sovereign change schema wins; and Core suppresses hooks for skipped states. The delivery-agent layer is not yet faithful to the corrective design. It adds the desired vocabulary but retains the fixed recipes that the proposal identified as a source of guidance loops and invalid intermediate execution. The test implementation similarly falls short of the expressly requested representative-flow assertions.

## Counts

- Audited specs: **4**
- Audited requirement clusters: **7**
- Fully compliant clusters: **5**
- Partial/non-compliant clusters: **2**
- Findings: **2** (`1 HIGH`, `1 MEDIUM`)
- Missing/insufficient test cases: **4**
- Focused Core tests passed: **119**
- CLI tests passed: **1101**
- Skills tests passed: **64**

## Brief summary

Core and CLI topology behavior is compliant and well covered. Full compliance fails because the four lifecycle skills only add dynamic-routing guard prose while retaining fixed-target operational recipes, and the tests check phrases rather than the required disabled/bypass execution flows. A separate medium contract inconsistency remains because Core still accepts deprecated bypass booleans that the merged input requirement forbids.
