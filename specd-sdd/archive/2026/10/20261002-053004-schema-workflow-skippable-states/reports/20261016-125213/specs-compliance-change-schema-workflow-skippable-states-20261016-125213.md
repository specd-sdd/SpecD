# Spec Compliance Report — change `schema-workflow-skippable-states`

- Mode: delegated (full `/specd-verify`), attempt `verification-attempt-11`
- Date: 2026-10-16
- Scope: 26 change specs (+ depth-1 deps, `default:_global/*`)
- Test suite: all green (core 3030, cli 1102, skills 73, sdk 77, code-graph 799, guide 59, plugins). Typecheck + ESLint clean.
- Verdict: **FAIL** — scenario failures and HIGH discrepancies below. Attempt NOT completed.

## Executive summary

| Batch            | Specs                                                                                                                                                        | HIGH                 | MEDIUM | LOW |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------ | --- |
| A topology/model | workflow-model, workflow-topology, standard-schema, lifecycle-engine                                                                                         | 2                    | 8      | 13  |
| B checks         | check-registry, transition-checks, transition-change                                                                                                         | 3                    | 9      | ~6  |
| C cli/skills     | change-status, change-transition, workflow-automation                                                                                                        | 2 (+1 test-weakness) | 6      | 6   |
| D sovereign-1    | resolve-change-schema, change, change-manifest, get-status, validate-artifacts, run-step-hooks, preview-spec                                                 | 3                    | 6      | ~14 |
| E sovereign-2    | archive-change, approve-spec, approve-signoff, compile-context, get-artifact-instruction, get-hook-instructions, edit-change, invalidate-change, count-tasks | 1 (shared)           | 3      | ~8  |

### Confirmed HIGH findings (deduplicated)

1. **Disabled `verifying` dead-ends archive/signoff** — `reconcile-change-validity.ts:277` `verificationRequired()` is state-only though schema loaded at :203. → `VERIFICATION_REQUIRED` blocker at done/archivable, `verification.current` archive binding fails, `approval.signoff` fails with signoff on. Masked by `makeObservingReconcile` test helper. (Confirmed by A, B, D, E + orchestrator code read.)
2. **Reordered workflow bypasses required steps + spec approval** — `workflow-topology.ts:126-136` admits any `VALID_TRANSITIONS` move regardless of pipeline position; reproduced `verifying → done` skipping ready/implementing with spec gate on. (A, reproduced.)
3. **Change repository syncs artifact types from workspace default** — `composition-resolver.ts:439-442` `resolveArtifactTypes` resolves `config.schemaRef`; used in `change-repository.ts` load/save sync → custom-schema change artifact map rewritten from default. Violates sovereign schema. (D; orchestrator-confirmed.)
4. **Reconciler bypasses shared resolver** — `reconcile-change-validity.ts:203` direct `schemaProvider.get(change.schemaName)`, no identity check, persists. (D, E.)
5. **Check config merged twice** — `transition-checks.ts:573-579/725` then `execute-matching-predicates.ts:209-220`; `deepMergeConfig` concatenates arrays → duplicated array values. (B; orchestrator-confirmed.)
6. **Plugin `allowDisable` dropped in composition** (`composition-registries.ts:223-231`) and **plugin default step-skip bindings never evaluated** (`composition/use-cases/workflow-check-registry.ts:74-85`). (B.)
7. **Skills: fixed canonical recipes remain, no validator** — specd-verify always runs verifying hooks/transition even when disabled; design/implement contain unconditional targets. Routing "simulates…" tests exercise a test-local function, not templates. (C.)

### Scenario failures from orchestrator pass

- `core:workflow-topology` — _Disconnected forward graph throws SchemaValidationError_: reproduced no throw (implementing+verifying disabled; also ready). `isReachable` vacuous. Spec likely needs rewording.
- `core:workflow-topology` — _Disabled verifying step relaxes verification boundary_: fails at validity/archive level (HIGH #1).
- `core:check-registry` — _Reject external registration using unprefixed built-in name_: `@protocol.edge` registration succeeds; scenario wording vs behavior mismatch.
- `core:transition-checks` — _Protocol fails fast before other predicates_: regressed (no fail-fast in `evaluateTransitionCandidate`).
- `skills:workflow-automation` — _Fixed canonical recipes cannot override structured routing_, _Disabled verifying selects only the actual target hooks_: not satisfied.

### Spec self-contradictions to resolve in design

- change-manifest verify "Schema version bumped" still expects workspace-default version warning (contradicts sovereign rule).
- workflow-model legal hops from `VALID_TRANSITIONS` vs workflow-topology shortcuts.
- transition-change error type (`CheckPredicateFailedError` vs `InvalidStateTransitionError`).
- edit-change guardrail (global schema for uninitialized spec) vs sovereign requirement.
- `ResolveChangeSchema` result contract `{schema, warnings}` vs bare `Schema` implementation.
- preview-spec "MUST always succeed" vs identity mismatch must propagate.
- Stale "Schema name guard" headings in several merged specs.

---

# Detailed Findings

# Partial Compliance Report A — Topology & Workflow Model

Change: `schema-workflow-skippable-states`
Batch: `core:workflow-model`, `core:workflow-topology`, `schema-std:standard-schema`, `core:lifecycle-engine`
Mode: read-only audit. Merged spec content was read with `changes spec-preview`. Findings marked "empirical" were reproduced against `packages/core/dist` (built after the latest src edits) with `buildSchema` and `WorkflowTopology`.

Key code paths:

- `packages/core/src/domain/services/workflow-topology.ts` (WT)
- `packages/core/src/domain/services/lifecycle-verdict.ts` (LV)
- `packages/core/src/domain/services/build-schema.ts` (BS)
- `packages/core/src/application/services/lifecycle-guidance.ts` (LG)
- `packages/core/src/application/services/evaluate-transition-candidate.ts` (ETC)
- `packages/core/src/application/use-cases/reconcile-change-validity.ts` (RCV)
- `packages/core/src/domain/services/check-bindings.ts` (CB)
- `packages/schema-std/schema.yaml`

---

## Cross-cutting HIGH findings (affect several specs in this batch)

### X1 — HIGH — Noncanonical delivery order lets a change bypass mandatory steps and the spec-approval anchor

- **Spec**: core:workflow-topology "Dynamic legal transitions" says (2) backward or redesign edges go only to _preceding_ steps admitted by `VALID_TRANSITIONS`, and (3) a shortcut is allowed iff EVERY bypassed step is optional or disabled. Ordered pipeline (2) says the declared delivery order is authoritative. core:workflow-model "Approval Anchor" says `ready` cannot be removed while `approvals.spec` is on.
- **Code**: WT:126-136 adds every `VALID_TRANSITIONS[from]` move that is enabled and not already a forward target, without checking that the move points backward in the pipeline.
- **Empirical**: schema `workflow: [verifying, ready, implementing]` with `approvals.spec: true` gives pipeline `designing, verifying, ready, implementing, done`. Then `legalTransitions('verifying') = [ready, implementing, done, designing]` and `bypassedSteps('verifying','done') = [ready, implementing]`. A change can go `designing → verifying → done → archivable` and never leave `ready`, so `approval.spec` (bound `from: 'ready'`, CB:88-92) never matches. Also `legalTransitions('designing')` includes `ready`, which jumps over mandatory `verifying`.
- **Possibility A (code wrong)**: the backward branch should admit a `VALID_TRANSITIONS` move only when its pipeline index is lower than `from`'s, or when it is redesign. Forward moves should come only from `computeForwardTargets`.
- **Possibility B (spec wrong)**: the spec should forbid noncanonical delivery order, or require `ready` to stay before all other delivery steps whenever `approvals.spec` is on.
- **Tests**: `workflow-topology.spec.ts` "preserves declared delivery order inside canonical bedrock anchors" checks only the pipeline and `nextForwardStep`. No test asserts `legalTransitions` or approval enforcement under a noncanonical order.

### X2 — HIGH — With `verifying` disabled, verification is still required at `done`/`archivable`/`archiving` (known finding, confirmed)

- **Spec**: core:workflow-topology "Step enablement and verification boundary" (1) says that with `verifying` disabled, verification evidence is not mandatory for entering `done`/`archivable`. core:lifecycle-engine hop matrix says implementing → done when verifying is disabled.
- **Code**:
  - LV:948-960 `verificationBoundary` honours a disabled `verifying`.
  - RCV:277-286 `verificationRequired(change)` checks the state only and ignores the schema. RCV:218 passes it into `evaluateChangeValidity`. `change-validity.ts:485-486,541-543` then yields `verification: 'absent'` and a `VERIFICATION_REQUIRED` blocker.
  - The archive binding `verification.current` (CB, `ARCHIVE_BINDING_SPECS`, `allowDisable: false`) fails on `'absent'` (`domain/checks/verification-current.ts:43-47`).
  - `approval.signoff` fails with `VERIFICATION_REQUIRED` when signoff is on (`domain/checks/approval-signoff.ts:56-60`).
  - Net effect: a change in a verifying-disabled schema reaches `done`/`archivable` but cannot archive. With signoff on, it cannot leave `done`.
- **Possibility A (code wrong)**: `verificationRequired` should take the resolved schema and return false when `!WorkflowTopology.isStepEnabled('verifying', schema)`, so validity reports `'not-required'`.
- **Possibility B (spec wrong)**: the spec should state that disabling verifying still requires out-of-band verification evidence before archive. That contradicts the scenario text "verification evidence is not mandatory".
- **Masking tests**: `test/application/use-cases/helpers.ts:1287` `makeObservingReconcile` fakes `verification: 'not-required'` when there is no evidence. `test/domain/services/lifecycle-engine.spec.ts` lines 81-169 inject `validity.verification: 'absent'` with `blockers: []`, a combination the real reconciler never produces, and only `protocol.edge` results (no `approval.signoff`, no archive scope). Missing: an end-to-end test with disabled verifying that runs implementing → done → archivable → archive through the real `ReconcileChangeValidity`.

### X3 — MEDIUM/HIGH — Drain states gain forward edges that bypass approval predicates

- **Code**: WT:424-432 maps `pending-spec-approval` to `ready` and `pending-signoff` to `done`. `computeForwardTargets` (WT:331-383) then treats them as `ready`/`done`.
- **Empirical**: `legalTransitions('pending-signoff') = [archivable, signed-off, designing, done]` and `legalTransitions('pending-spec-approval') = [implementing, spec-approved, designing]`. `VALID_TRANSITIONS` (`change-state.ts:35,40`) allows neither `pending-signoff → archivable` nor `pending-spec-approval → implementing`.
- `approval.signoff` is bound `from: 'done'` and `approval.spec` is bound `from: 'ready'` (CB:88-98). `checkMatches` compares `from` exactly (`transition-checks.ts:230`), so in-flight drain changes can skip the approval gates. `protocol.edge` (`domain/checks/protocol-edge.ts:30-37`) and `Change.transition` (`change.ts:938-945`) both trust the topology.
- **Possibility A (code wrong)**: forward targets from a drain state should be limited to `VALID_TRANSITIONS[from]`, or `checkMatches` should normalize drain `from` states.
- **Possibility B (spec wrong)**: if the widening is intended, core:workflow-topology must define drain-state semantics. It is silent on them today. core:workflow-model also says "legal hops SHALL come from `ChangeState` and `VALID_TRANSITIONS`", which contradicts topology-invented shortcuts (see the consistency section).
- **Tests**: none cover drain-state legal transitions under topology.

---

## core:workflow-model

### Requirements Summary

14 requirements: step names map to lifecycle states; step semantics; optional/disabled declarations; checks/skipChecks declarations; sovereign change schema; requires gating; task-completion gating; step check declarations; step availability; array order as display order and progress axis; step-to-state mapping; hook execution at boundaries; two execution modes; requires reference artifact IDs.

### Implementation Status

| Requirement                                             | Status                         | Evidence                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step names reference domain lifecycle states            | Partial                        | BS:713-721 rejects unknown names. But drain-only states pass, because `validStates = Object.keys(VALID_TRANSITIONS)` (BS:714) includes them. Empirical: `{step:'pending-spec-approval'}` builds and takes a pipeline slot (`drafting, designing, pending-spec-approval, ready, …`).                                     |
| Step semantics                                          | Implemented                    | Verification routing lives in other use cases (out of batch). Not re-audited in depth.                                                                                                                                                                                                                                  |
| Optional and disabled step declarations                 | Partial                        | Bedrock checks: BS:722-733 and WT:255-266. Approval anchor: WT:267-273 only, and only lazily when the topology is first called; neither `buildSchema` nor `schema validate` runs it. Reachability check is vacuous (see topology D2). Verification relaxation is inconsistent (X2).                                     |
| Workflow step checks and skip-checks declarations       | Implemented (minor divergence) | BS:789-938, plus `skipChecks` on a disabled step at BS:734-739. Confinement lock (BS:829, 898) throws for any non-`@` check with `allowBindingOverride:false`, even when kernel-bound. The spec says "unless already bound by kernel registration".                                                                     |
| Sovereign change schema authority                       | Implemented                    | `ResolveChangeSchema` is used across use cases. RCV:203 uses `schemaProvider.get(change.schemaName)`, which skips the version check (out of batch: core:resolve-change-schema).                                                                                                                                         |
| Requires-based gating                                   | Implemented                    | `workflow.requires` check; LV:215-221.                                                                                                                                                                                                                                                                                  |
| Task completion gating                                  | Implemented                    | BS:940-959 validates `hasTasks`. The spec wording says "artifact type that declares `taskCompletionCheck`" (LOW wording mismatch).                                                                                                                                                                                      |
| Step check declarations                                 | Implemented                    | `value-objects/workflow-step.ts` `WorkflowStepCheckDeclaration`.                                                                                                                                                                                                                                                        |
| Step availability evaluation                            | Implemented                    | LV:188-197.                                                                                                                                                                                                                                                                                                             |
| Workflow array order is display order and progress axis | Partial                        | `classifyAlong` uses `orderedPipeline` (`transition-checks.ts:169`). LV:872-889 `isForward` uses a hardcoded `DELIVERY_AXIS` for guided transitions and validity next-hop (LV:299, 919, 937). `availableSteps` follows pipeline order, not declaration order (LV:199).                                                  |
| Step-to-state mapping                                   | Implemented                    | `transition-change.ts:236-249`.                                                                                                                                                                                                                                                                                         |
| Hook execution at step boundaries                       | Implemented                    | Bindings `hook.pre`/`hook.post` (CB). Bypassed-step hooks are suppressed by construction.                                                                                                                                                                                                                               |
| Two execution modes                                     | Implemented                    | Not re-audited in depth.                                                                                                                                                                                                                                                                                                |
| Step requires reference artifact IDs                    | Divergent                      | Empirical: `buildSchema` accepts `workflow:[{step:'implementing', requires:['verifying']}]`. BS has no check that workflow `requires` names existing artifact IDs (BS:616 covers artifact→artifact only). The verify scenario "Step-to-step circular dependencies are impossible → throws SchemaValidationError" fails. |

### Discrepancies

- **D1 — MEDIUM — Drain-only states accepted as workflow rows and inserted into the progress axis.** Spec: "MUST NOT be introduced as schema steps", and an unknown string "MUST NOT occupy a progress-axis slot". Code: BS:714 and WT:281-300. (A) Code wrong: reject `pending-spec-approval|spec-approved|pending-signoff|signed-off` in BS:715 and exclude them in `rawActivePipeline`. (B) Spec wrong: unlikely; the spec is explicit.
- **D2 — MEDIUM — Workflow `requires` naming a step or unknown artifact is not rejected.** (A) Code wrong: add a check that every `step.requires` entry exists in `artifactIndex`. Today such a step stays blocked forever at runtime. (B) Spec wrong: if a dangling ID should fail at runtime instead, reword the scenario. The "structurally impossible" claim currently holds only because unknown IDs never complete.
- **D3 — MEDIUM — Approval-anchor rule is enforced only lazily.** Spec: "Validation rules enforced during schema resolution and topology validation". `buildSchema` cannot see approvals, and no resolve or validate path calls `orderedPipeline`. `schema validate` reports ok, and the first `status`/`transition` throws `SchemaValidationError`. (A) Code wrong: add an approvals-aware validation in resolve/validate. (B) Spec wrong: state that this rule is checked only at topology evaluation time.
- **D4 — LOW — Hardcoded `DELIVERY_AXIS` in LV:872-889** contradicts "progress axis SHALL be computed via `WorkflowTopology.orderedPipeline`" for noncanonical orders. (A) Code wrong: use the pipeline index. (B) Spec wrong: allow canonical-axis heuristics for validity guidance.
- **D5 — LOW — Confinement lock is stricter than specified** for core checks bound by the kernel (BS:829, 898). (A) Code wrong: allow it when `matchingBinding` exists. (B) Spec wrong: say that core-category checks can never be embedded.
- **D6 — LOW — `requiresTaskCompletion` is validated against `hasTasks`, while the spec says `taskCompletionCheck`** (BS:951-956).
- **D7 — LOW — `skipChecks` on a non-optional enabled step is accepted** as dead configuration. The spec is silent. Consider a rule or a warning.

### Test Coverage

- Invalid step name: `build-schema.spec.ts` "rejects workflow steps that are not valid ChangeState values".
- Bedrock disabled/optional: `build-schema.spec.ts` "rejects bedrock steps declared as disabled/optional"; `workflow-topology.spec.ts` same titles.
- Parse optional/disabled: `build-schema.spec.ts` "accepts configurable delivery steps declared as optional or disabled".
- Active approval anchor: `workflow-topology.spec.ts` "throws SchemaValidationError when ready is disabled and spec approval is required".
- Done mandatory with signoff off: `workflow-topology.spec.ts` "throws … when done is declared disabled/optional with signoff on or off".
- Checks/skipChecks governance: `build-schema.spec.ts` describe blocks "workflow checks validation and governance" and "skipChecks governance and semantic validation", which cover Unknown, Duplicate, Embedding, Override, Config, Disable, and skipChecks on a disabled step.
- Optional with empty skip set: `evaluate-transition-candidate.spec.ts` "passes when step-skip predicate set is empty for a bypassed step"; `get-status.spec.ts` "permits shortcut when step-skip check set is empty…".
- Omitted row: `transition-checks.spec.ts` "given implementing omitted from workflow…" (×2).
- Sovereign: `get-status.spec.ts` "projects workflow from the recorded sovereign schema…"; `resolve-change-schema.spec.ts`.
- LazySchemaProvider: `composition/lazy-schema-provider.spec.ts` "returns cached schema on subsequent calls…" covers only the default `get()`, not `get(ref)` (weak).

### Missing Tests

1. "Unknown checks from state is rejected": BS:791-796 implements it, but no test was found.
2. Drain-only state rejected as a workflow row.
3. "Step-to-step circular dependencies are impossible": no test, and the behaviour is not implemented.
4. "Disabled steps are excluded from progress axis" (`classifyAlong('ready','done')` with verifying disabled): no test.
5. LazySchemaProvider caching by reference (`get('custom-workflow')` ×2).
6. "Skills cannot redefine optionality": no automated coverage (skill text only).

---

## core:workflow-topology

### Requirements Summary

6 requirements: ordered pipeline construction; graph reachability invariant; dynamic legal transitions; bypassed step detection; topological forward progression; step enablement and verification boundary.

### Implementation Status

| Requirement                               | Status                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordered pipeline construction             | Implemented (with D1/X1 caveats) | WT:241-321. Bedrock normalization works (empirical: noncanonical bedrock order → canonical). Drain rows leak into the pipeline (workflow-model D1).                                                                                                                                                                                                                                                                                |
| Graph reachability invariant              | Partial (vacuous guard)          | WT:72-78 and WT:392-416. `rawActivePipeline` drops disabled steps first (WT:320). Each step's immediate successor is always a forward target (the loop at WT:347-380 accepts j=from+1 because its intermediate set is empty), and `done` always precedes `archivable`. So `isReachable` can never return false. Empirical: disabling `implementing`+`verifying`, or `ready`+`implementing`+`verifying` (spec off), does not throw. |
| Dynamic legal transitions                 | Divergent                        | X1 (backward branch is not position-checked) and X3 (drain-state widening). Canonical-order behaviour matches the spec (empirical: `implementing → [verifying, designing]`; optional implementing gives `ready → [implementing, verifying, designing]`; disabled verifying gives `implementing → [done, designing]`).                                                                                                              |
| Bypassed step detection                   | Implemented                      | WT:170-191. Returns mandatory intermediates for the X1 edges (`verifying→done` gives `[ready, implementing]`), which are then evaluated as step-skip predicates.                                                                                                                                                                                                                                                                   |
| Topological forward progression           | Implemented                      | WT:202-230. `pending-spec-approval`/`pending-signoff` return null (WT:207-213), while `spec-approved`/`signed-off` are normalized. The asymmetry is undocumented.                                                                                                                                                                                                                                                                  |
| Step enablement and verification boundary | Partial                          | `isStepEnabled` WT:90-99 is correct. Clause 1 (verification not mandatory) is violated by RCV (X2). `isStepEnabled` ignores approvals; acceptable because disabling `ready` with spec on throws elsewhere.                                                                                                                                                                                                                         |

### Discrepancies

- **D1 — HIGH — X1** (noncanonical order bypasses mandatory steps and the approval anchor).
- **D2 — MEDIUM — Reachability invariant is unfalsifiable; scenario "Disconnected forward graph throws SchemaValidationError" cannot be built** (known finding, confirmed). (A) Spec wrong (more likely): with bedrock steps fixed and disabled steps removed, the path is connected by construction. The requirement should say it is guaranteed by construction, and the scenario should be replaced (for example "any combination of disabled non-bedrock steps still yields a connected path"). (B) Code wrong: if real disconnection is possible (for example, future rules restricting entry edges, or `VALID_TRANSITIONS`-constrained forward moves), `isReachable` should run over the unfiltered graph or over `VALID_TRANSITIONS` ∩ pipeline. Today it is dead code that costs one O(n²) walk per `orderedPipeline` call.
- **D3 — HIGH — X2** (verification boundary not honoured by validity reconciliation).
- **D4 — MEDIUM — X3** (drain-state forward widening).
- **D5 — MEDIUM — Architecture inconsistency**: `WorkflowTopology` is a class of static methods. default:\_global/architecture "Pure functions for stateless domain services" says these MUST be plain exported functions, not classes. core:lifecycle-engine also forbids a class for the same reason. (A) Code wrong: export functions (`orderedPipeline(schema, approvals)` …). (B) Spec wrong: the topology spec names `WorkflowTopology.*` as a namespace API; either amend the global rule or reword the topology spec to describe function exports.

### Test Coverage (`packages/core/test/domain/services/workflow-topology.spec.ts`)

- Pipeline excludes disabled / optional attribute: "preserves optional flags declared in schema", "excludes disabled steps from the active pipeline".
- Noncanonical delivery order: "preserves declared delivery order inside canonical bedrock anchors" (pipeline only).
- Bedrock normalized: "normalizes explicitly declared bedrock states to canonical positions".
- Bedrock disabled / done mandatory / ready anchor: the corresponding "throws SchemaValidationError …" tests.
- Shortcut across optional: "allows shortcutting over optional steps".
- Disabled destination prohibited: "allows shortcutting over disabled steps" (asserts `isLegalTransition('implementing','verifying') === false`).
- No invented backward edge: "returns standard legal transitions for default pipeline" (`not.toContain('drafting')`).
- Approval snapshot: "enforces approval anchors through every legal-transition query", "enforces approval anchors through bypass and next-step queries".
- bypassedSteps: "identifies intermediate active steps when shortcutting", "returns empty array when moving to immediately adjacent step".
- nextForwardStep: "skips disabled steps to the next enabled step", "returns null at terminal archivable or archiving state".
- isStepEnabled: "returns false when step is declared disabled in schema".
- Note: `makeSchema` from `test/application/use-cases/helpers.ts` builds schemas without going through `buildSchema`, so builder validation and topology are tested separately.

### Missing Tests

1. "Disconnected forward graph throws SchemaValidationError": none, and it cannot be satisfied (D2).
2. "Disabled signoff skips its check rather than done": no topology-level test asserting that `approval.signoff` returns skip on `done→archivable` with signoff off.
3. Second clause of "Disabled verifying step relaxes verification boundary" (evidence not mandatory): no real-reconciler test (X2).
4. `legalTransitions` under a noncanonical order, and approval-anchor enforcement under reorder (X1).
5. Drain-state legal transitions (X3).

---

## schema-std:standard-schema

### Requirements Summary

10 requirements: canonical schema definition; artifact DAG invariants; proposal, specs, verify, design and tasks contracts; cross-artifact parity; metadata extraction; lifecycle steps and state transitions; package distribution.

### Implementation Status

| Requirement                           | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical Schema Definition           | Implemented | `schema.yaml:1-3` (`kind`, `name: schema-std`, `version: 1`), `artifacts`, `workflow:643`. `schema validate @specd/schema-std` → ok, 5 artifacts, 5 workflow steps.                                                                                                                                                                                                                                   |
| Artifact DAG Invariants               | Implemented | proposal `requires: []` (l.13); specs ← proposal (l.90); verify ← specs (l.234); design ← proposal, specs, verify (l.357); tasks ← specs, verify, design, `hasTasks: true` (l.452-459).                                                                                                                                                                                                               |
| Proposal contract                     | Implemented | All required section names are present in the instruction text.                                                                                                                                                                                                                                                                                                                                       |
| Specs contract and deltas             | Implemented | `delta: true` (l.157).                                                                                                                                                                                                                                                                                                                                                                                |
| Verify contract and deltas            | Implemented | `delta: true` (l.266), `deltaValidations` present.                                                                                                                                                                                                                                                                                                                                                    |
| Design contract                       | Implemented | All section names are present.                                                                                                                                                                                                                                                                                                                                                                        |
| Tasks contract                        | Implemented | `preHashCleanup` (l.543), `taskCompletionCheck` (l.547).                                                                                                                                                                                                                                                                                                                                              |
| Cross-artifact parity                 | Implemented | `specs-verify-requirement-parity` (l.554).                                                                                                                                                                                                                                                                                                                                                            |
| Metadata extraction                   | Implemented | `metadataExtraction` (l.572) with title, description, dependsOn, rules, constraints, scenarios, context.                                                                                                                                                                                                                                                                                              |
| Lifecycle Steps and State Transitions | Partial     | Rows designing, ready, implementing, verifying, archiving, each with explicit `optional:false, disabled:false`; no drain rows. Clause 3 ("Step transitions MUST define permitted forward routes and mandatory gate checks") is not represented in `schema.yaml`: routes are topology-owned and gates are kernel bindings. Clause 7 (hooks skipped when bypassed) holds by construction and is tested. |
| Schema Package Distribution           | Partial     | `package.json` ships `schema.yaml` and `templates/` but has no `"type": "module"` or `exports`. It is an asset package, not a strict "ESM package".                                                                                                                                                                                                                                                   |

### Discrepancies

- **D1 — LOW — Clause 3 "Step transitions MUST define permitted forward routes and mandatory gate checks."** (A) Spec wrong (likely): routes come from `WorkflowTopology` and gates from `TRANSITION_BINDINGS`; reword to "relies on Core topology and kernel bindings". (B) Schema wrong: add explicit `checks:` declarations.
- **D2 — LOW — The "standard ESM package" wording vs `package.json`** (no `type`/`exports`). (A) Spec wrong: describe it as a static asset package. (B) Package wrong: add `"type":"module"` and an `exports` map for `./schema.yaml` and `./templates/*`.
- **D3 — LOW — Clause 4 says `optional: true` makes a step skippable "when associated task/implementation skip checks pass"**, but only `implementing` has kernel step-skip bindings (CB:53, 73, 83). An optional `ready` or `verifying` in a derived schema is skippable unconditionally. That matches the workflow-model empty-set rule, but the std spec wording implies checks always exist.
- **D4 — LOW (informational) — In a derived schema with `verifying` disabled, the std `requiresTaskCompletion: [tasks]` on verifying (l.713-714) no longer gates any transition.** `implementing → done` has no row, so task completion is enforced only at archive scope (`workflow.taskCompletion` archive binding).

### Test Coverage

- No test loads the real `packages/schema-std/schema.yaml` and asserts its content. Every scenario in the verify artifact (root properties, DAG chain, proposal/specs/verify/design/tasks definitions, parity, metadata extraction, lifecycle rows, flag parsing, package resolution) lacks a direct automated test. Existing references (`validate-schema.spec.ts`, `schema-validate.spec.ts`, `get-active-schema.spec.ts`) use fake raw data or fake paths.
- Hooks skipped on bypass: covered generically by `transition-change.spec.ts` "suppresses hook execution for bypassed intermediate steps".

### Missing Tests

1. Root properties, DAG chain, and absence of cycles in the real schema.
2. Artifact contract scenarios (instruction sections, `rules.post`, `validations`/`deltaValidations`, `taskCompletionCheck`/`preHashCleanup`).
3. `crossArtifactValidations` parity rule and `metadataExtraction` extractors.
4. Workflow rows present and drain rows absent in the real schema.
5. "Signoff off skips the check but not done" with the real std schema.
6. Package distribution (resolve `schema.yaml` and `templates/` from the package root).

All 10 requirements have no direct test against the real artifact.

---

## core:lifecycle-engine

### Requirements Summary

12 requirements: stateless domain verdict; centralized validation; effective artifact status; canonical-state-only interpretation; machine-readable blockers; available steps and next hop (optional-step policy); application lifecycle guidance; archiving escape transitions; review summary; shared lifecycle interpretation; next artifact topological order; predicate blocker artifact identity.

### Implementation Status

| Requirement                           | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain lifecycle verdict    | Implemented | Plain functions in LV; `lifecycle-engine.ts` is a re-export barrel with no class. Extra public export `recommendedForwardTarget` (`domain/services/index.ts:100`) is not in the listed public API (LOW).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Centralized validation logic          | Implemented | LV projects supplied `checksByTarget` (LV:184-197) and does no I/O.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Effective artifact status computation | Implemented | `projectArtifacts` / `effectiveStatus` (LV:360-480).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Canonical-state-only interpretation   | Implemented | Tests exist (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Machine-readable blockers             | Implemented | `requestedTargetBlockers` (LV:600-678) uses topology for `INVALID_TRANSITION`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Available steps and domain next hop   | Partial     | Disabled steps excluded (LV:199-241). `checksByTarget` is complete via ETC:72-151 and `executeChecksByLegalTargets`. Optional policy: `recommendedForwardTarget` (LV:983-1012). Gaps: (a) `availableSteps` follows pipeline order, not "declaration order"; (b) `recommendedForwardTarget` does not normalize `spec-approved`/`signed-off` (`findIndex` at LV:990 fails, so it falls back to hardcoded `'implementing'`/`'archivable'`) and ignores optional shortcuts from those states; (c) `TransitionChange --to next` uses `nextForwardStep` (`transition-change.ts:237-246`), which enters the optional step and contradicts "Core guidance MUST NOT blindly use that immediate step when it is optional"; (d) `guidedTransitions` filter uses hardcoded `isForward` (LV:297-300). |
| Application lifecycle guidance        | Partial     | Command matrix in LG. Signature is `resolveLifecycleCommand(change, nextHop, review, availableTransitions, approvals, validity)`, not `(nextHop, context)` (LOW). `availableTransitions` is explicitly ignored (LG:38), so "or `archivable` is in `availableTransitions`" is not honoured. With `done` blocked, `phaseCommand` returns `/specd-verify` (LG:143-145) even when `verifying` is disabled, which sends the user to a skill for a disabled step (combined with X2 this is the likely real-world outcome). Disabled-verifying implementing → `/specd-archive` works (LG:124-133).                                                                                                                                                                                              |
| Archiving escape transitions          | Implemented | LV:245-247 and LV:655-657; topology gives `archiving → [archivable, designing]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Review summary integration            | Implemented | `deriveReview` (LV:483-566).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Shared lifecycle interpretation       | Implemented | `evaluateLifecycle` in `application/services/lifecycle-evaluation.ts:25-44`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Next artifact topological order       | Implemented | `nextArtifact` (LV:818).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Predicate blocker artifact identity   | Implemented | LV:254-265 via `blockingArtifactIds`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Discrepancies

- **D1 — HIGH — X2** causes the "Disabled verifying recommends done" path to dead-end later (`VERIFICATION_REQUIRED` at archive, or at signoff when signoff is on).
- **D2 — MEDIUM — `done` blocked with `verifying` disabled routes to `/specd-verify`** (LG:143-145). (A) Code wrong: when `!isStepEnabled('verifying')`, route to `/specd-archive` or `/specd-implement`. (B) Spec wrong: the spec does not define the command for blocked `done`; add it.
- **D3 — MEDIUM — `transition --to next` bypasses the optional-step recommendation policy** (`transition-change.ts:237-246`). (A) Code wrong: resolve `next` from `evaluateLifecycle(...).nextAction.targetStep`. (B) Spec wrong: state that `next` means the immediate enabled step and is distinct from `nextAction`. (Cross-spec with core:transition-change, another batch.)
- **D4 — LOW — `recommendedForwardTarget` lacks drain-state normalization** (LV:990). With `implementing` disabled or optional, `spec-approved` falls back to `'implementing'` (not available), so the next hop degrades to the generic default (LV:1210-1214).
- **D5 — LOW — `availableSteps` order is pipeline order, not declaration order.** (A) Spec wrong: say "active pipeline order" (it equals declaration order for delivery rows, with bedrock normalized). (B) Code wrong: iterate `schema.workflow()`.
- **D6 — LOW — The guidance "or archivable in availableTransitions" clause is not implemented** (LG:38).
- **D7 — LOW — `resolveLifecycleCommand` signature differs from the spec.**

### Test Coverage

- No class: implicit (barrel). No explicit test asserting the absence of `LifecycleEngine`.
- Verdict unifies three dimensions: `lifecycle-verdict.spec.ts` "given a change in designing with a missing required artifact … INCOMPLETE_ARTIFACT".
- Projects without I/O: "projects injected CheckResults without filesystem I/O".
- availableSteps lookup rows: "given workflow omits implementing … no implementing extras row".
- No MISSING_ARTIFACT dual write: "given requestedTarget requires fail … does not dual-write MISSING_ARTIFACT".
- Recursive block / mixed parents: "computes effective status across dependency chains", "downgrades complete artifacts to pending-parent-artifact-review…", "given mixed review and incomplete parents … parent-review wins".
- Canonical-state-only: "treats complete-with-drift as complete…", "uses canonical missing state even when hasDrift is true".
- Overlap bypass: "omits skippable OVERLAP_CONFLICT when bypassFlags include allow-overlap". Overlap review: "does not project OVERLAP_CONFLICT from review invalidation overlap".
- Incomplete or complete tasks: "hides verifying from availableTransitions when gated tasks are incomplete", "includes verifying and recommends /specd-verify when gated tasks are complete".
- Optional policy:
  - `recommendedForwardTarget` describe: "recommends the checked shortcut…", "falls back to entering the optional step…", "selects the furthest target after consecutive optional steps".
  - "treats an empty effective skip-check set as an available unconditional bypass" is WEAK: its inputs are identical to the "checked shortcut" test, so it never exercises an empty binding set. The real empty-set coverage is in `evaluate-transition-candidate.spec.ts` and `get-status.spec.ts:493`.
- checksByTarget failed shortcut evidence: "preserves failed step-skip check evidence in checksByTarget while keeping shortcut unavailable" (injected results). Also `get-status.spec.ts:446` "populates complete checksByTarget with failing skip check…".
- Disabled verifying: `lifecycle-engine.spec.ts` "recommends nextHop targetStep done from implementing…", "recommends /specd-archive from implementing when verifying is disabled…", "recommends nextHop targetStep archivable from done when verifying is disabled". All are WEAK (unrealistic validity fakes; see X2).
- Matrix: "given designing with ready available…", "given verifying with done available…", "lists skill hops from done without recommending implement…", "given archivable…", "keeps designing selectable…".
- Archiving: "exposes archiving escape transitions without archivable requires blockers", "recommends designing when archive commit failed…", "keeps archiving recovery available when archivable requires are incomplete".
- Next artifact: "selects next artifact in topological order…", "treats skipped dependencies as satisfied…".
- Blocker identity: "given workflow.requires check results, when projecting availableSteps, then blockingArtifacts follow check details".

### Missing Tests

1. "All artifacts complete yields null next artifact": no explicit assertion found.
2. "Detailed affected artifacts for drift" (`ARTIFACT_DRIFT` with exact filename and spec ID): not found among the titles.
3. "Consumers rely on one shared lifecycle verdict" / "CompileContext is not an evaluate consumer" / "ValidateArtifacts evaluates with empty checksByTarget": no explicit structural tests in this batch's files.
4. "Historical overlap command comes from guidance" (`/specd-design` from `evaluateLifecycle`): not found.
5. Blocked `done` with disabled verifying (D2) and `transition next` with an optional step (D3).

---

## Spec Dependency Chain Consistency

1. **workflow-model vs workflow-topology (contradiction, MEDIUM):** workflow-model "Step names…" says "Protocol membership and legal hops SHALL come from `ChangeState` and `VALID_TRANSITIONS`". workflow-topology and lifecycle-engine say legal transitions are computed by `WorkflowTopology.legalTransitions`, including shortcuts (`ready → verifying`, `implementing → done`) that `VALID_TRANSITIONS` does not contain. One of them needs rewording, and the topology is the one implemented.
2. **workflow-topology vs default:\_global/architecture (MEDIUM):** the class-shaped `WorkflowTopology` conflicts with "Stateless domain operations must be plain functions, not classes". This is also inconsistent with lifecycle-engine's own no-class rule.
3. **workflow-topology reachability vs workflow-model rule 4:** both require `SchemaValidationError` on disconnection, but the bedrock and disabled-filtering rules make disconnection impossible (see topology D2). Both specs should be reworded together.
4. **workflow-topology clause "verification not mandatory" vs core:change-validity / archive bindings:** the `verification.current` archive binding (`allowDisable:false`) and `approval.signoff`'s verification precondition have no carve-out for schemas with verifying disabled. Validity-side specs (other batch) need a matching schema-aware rule (X2).
5. **schema-std clause 3** ("transitions MUST define routes and gate checks") conflicts with workflow-model's statement that `workflow[]` rows only attach extras and the topology/kernel own routes.
6. **lifecycle-engine "availableSteps … declaration order"** vs workflow-topology "bedrock declarations normalized": order differs only for bedrock rows. Reword to pipeline order.
7. **default:\_global/error-handling-conventions:** `SchemaValidationError`, `UnknownCheckError` and the other errors are typed `SpecdError` subclasses. Consistent.

---

## Summary Counts

| Spec                       | Total  | Implemented | Partial | Missing | Divergent |
| -------------------------- | ------ | ----------- | ------- | ------- | --------- |
| core:workflow-model        | 14     | 10          | 3       | 0       | 1         |
| core:workflow-topology     | 6      | 3           | 2       | 0       | 1         |
| schema-std:standard-schema | 10     | 8           | 2       | 0       | 0         |
| core:lifecycle-engine      | 12     | 10          | 2       | 0       | 0         |
| **Total**                  | **42** | **31**      | **9**   | **0**   | **2**     |

Discrepancies by severity (cross-cutting items counted once):

- **HIGH: 2.** X1 (noncanonical order bypasses mandatory steps and the spec-approval anchor) and X2 (disabled verifying still requires verification; archive/signoff dead-end).
- **MEDIUM: 8.**
  - X3 (drain-state forward widening bypasses approval predicates).
  - WM-D1 (drain rows accepted and placed on the axis).
  - WM-D2 (workflow `requires` naming steps or unknown IDs accepted).
  - WM-D3 (approval anchor validated only lazily).
  - WT-D2 (vacuous reachability guard; untestable scenario).
  - WT-D5 (class versus pure-function rule).
  - LE-D2 (blocked `done` → `/specd-verify` with verifying disabled).
  - LE-D3 (`transition next` ignores the optional-step policy).
- **LOW: 13.** WM-D4, D5, D6, D7; SS-D1, D2, D3, D4; LE-D4, D5, D6, D7; plus the extra public export `recommendedForwardTarget`.

Missing or weak tests:

- workflow-model: 6.
- workflow-topology: 5.
- schema-std: 6 groups, covering all 10 requirements with no test against the real schema.
- lifecycle-engine: 5.
- Weak or masking tests: 3. These are `makeObservingReconcile` (verification faked as `'not-required'`), the disabled-verifying tests in `lifecycle-engine.spec.ts` (unrealistic validity), and the duplicate "empty skip-check set" test in `lifecycle-verdict.spec.ts`.

# Partial compliance audit (batch B): core:check-registry, core:transition-checks, core:transition-change

Change: `schema-workflow-skippable-states`. This was a read-only audit of the working tree on `feat/lifecycle-transitions-ux`. Line numbers are from the working tree. I did not run the tests. Wherever I say a bug is "confirmed", I mean confirmed by reading the code.

## Cross-cutting findings (affect more than one spec in this batch)

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                       |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| X1  | HIGH     | **Config cascade is applied twice, so array values get duplicated.** `resolveEffectiveBindings` already writes `deepMerge(checkDefault, bindingConfig, stepConfig)` into `binding.config`, at transition-checks.ts:611/674/690 for modified or synthesized bindings and at :725 for unmodified bindings that have a `defaultConfig`. `executeMatchingPredicates` then merges `gov.defaultConfig`, the already-merged `binding.config` and `stepDecl.config` again (execute-matching-predicates.ts:210-220, 262-269). `deepMergeConfig` concatenates arrays (deep-merge-config.ts), so `defaultConfig {tags:['a']}` plus binding `{tags:['b']}` reaches the check as `['a','a','b']`, and step arrays are doubled too. This affects every real path, because `evaluateTransitionCandidate` (evaluate-transition-candidate.ts:86-111) feeds `resolveEffectiveBindings` output into `executeMatchingPredicates`. It breaks the scenarios "Cascaded config resolution deep merges ... tags ['a','b']" (transition-checks) and "Executing custom check receives isolated config". Scalar-only configs are unaffected because the merge is idempotent for them. | transition-checks.ts:565-582, 611, 725; execute-matching-predicates.ts:209-225 |
| X2  | HIGH     | **Plugin `allowDisable` is dropped in production composition.** `createCompositionRegistryView` builds `opts` from `defaultConfig`, `allowConfigOverride` and `allowBindingOverride` only. `reg.options.allowDisable` is never forwarded, and `PluginCheckRegistration` has no top-level `allowDisable`. The check-level governance therefore defaults to `allowDisable: true` (check-registry.ts:316), and a schema can `disabled: true` a plugin check that the plugin declared non-disableable. Binding-level `allowDisable` inside `defaultBindings` does survive.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | composition-registries.ts:223-231, 66-81                                       |
| X3  | HIGH     | **Plugin default `step-skip` bindings are never evaluated in production.** The composed `transitionBindings` include custom bindings only when they have a `scope: 'transition'` (or `'archive'`) applicability. A plugin registering `defaultBindings: [{scope:'step-skip', step:'implementing'}]` is dropped from the base bindings. It runs only if a schema also lists it in `skipChecks`, because the registry synthesis path picks it up then. This breaks "Registry-provided bindings and schema-declared skipChecks form the effective check set" (transition-change) and the Step-skip scope requirement (transition-checks).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | composition/use-cases/workflow-check-registry.ts:74-85                         |
| X4  | MEDIUM   | **`protocol.edge` fail-fast was removed from the `TransitionChange` execute path.** HEAD passed `failFastOn: 'protocol.edge'` to `executeMatchingPredicates` in both the first pass and the rerun. The working tree calls `evaluateTransitionCandidate`, which takes no fail-fast option (evaluate-transition-candidate.ts:108-111, 136-139). On an illegal edge, every other predicate still runs: target, custom, and step-skip predicates for `bypassedSteps`, all with I/O and progress events. The thrown error is still correct (`InvalidStateTransitionError` `invalid-transition`), because `protocol.edge` is the first failure (transition-change.ts:350-355). This is a regression against "Evaluation of a transition attempt" step 2 and "to next ... Predicate protocol.edge fail-fast applies".                                                                                                                                                                                                                                                                                                                                            | `git show HEAD:...transition-change.ts` lines 299/389 vs working tree 318-330  |
| X5  | MEDIUM   | **Step-skip isolation leaks between scopes.** `resolveEffectiveBindings` disables a base binding by its array index. Built-in `impl.filesResolved` and `impl.linksInScope` each use one binding that carries both transition and step-skip applicabilities (check-bindings.ts:67-86). So `verifying.checks: [{id: impl.filesResolved, disabled: true}]` also removes the `step-skip(implementing)` evaluation on a `ready → verifying` shortcut. The reverse also happens: `implementing.skipChecks: [{..., disabled: true}]` removes the transition check entering `verifying`. This violates "Isolation: step-skip checks ... do not collide with transition predicates".                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | transition-checks.ts:561, 607-609, 671-672, 715-718                            |
| X6  | MEDIUM   | **The fallback loop runs step `checks` without checking `from`/`along`.** The second loop in `executeMatchingPredicates` executes any `workflowStep(attempt.to).checks` entry that was not already seen, and it ignores the declaration's `along` (default `forward`) and `from`. A plugin check declared on step S with `along: forward` therefore also runs on backward or redesign entries into S. This happens because the synthesized forward binding does not match, so `seen` stays empty and the fallback executes the check. It contradicts workflow-model "`along` (default: 'forward'), `from` (default '\*')".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | execute-matching-predicates.ts:242-285                                         |
| X7  | MEDIUM   | **With `verifying` disabled, signoff and archive still demand verification.** `reconcile-change-validity.ts:277-286` `verificationRequired` ignores topology. A change in `done` gets `verification: 'absent'`. `approval.signoff` then fails "Completed verification is required before signoff" (domain/checks/approval-signoff.ts:56-61), and `verification.current` fails on archive. This affects the transition-change requirement "Signoff is a check" (`done → archivable` with the gate on) and contradicts core:workflow-topology "Step enablement and verification boundary" (no mandatory evidence when `verifying` is disabled). This is the known bug from batch A, and it also lands in these specs.                                                                                                                                                                                                                                                                                                                                                                                                                                       | as cited                                                                       |
| X8  | LOW      | `executeMatchingPredicates` injects a user bypass for any id in `skipChecks` without checking `skippable` or effect kind (execute-matching-predicates.ts:192-207, 251-259). Validation exists only in `TransitionChange` (transition-change.ts:291-311). Any other caller of the shared evaluator, such as `GetStatus` with `skipChecks`, can bypass non-skippable checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                                |

---

## Spec: core:check-registry

### Requirements Summary

1. Open registry: `get`, `has`, `list`, `bindings`, with a catalog and default bindings for transition and archive.
2. Immutability of 16 built-ins: no public mutation path, and plugins cannot claim an unprefixed built-in id.
3. Canonical namespacing: `register(pluginName, check, defaultBindings?, options?)`, `^[a-zA-Z0-9_-]+$`, `@plugin.id`, `DuplicateCheckError`.
4. Adaptation: `CustomCheckDefinition` becomes `kind: 'predicate'`, and a non-predicate `kind` throws `InvalidCheckKindError`.
5. Binding coordinate identity: transition `{to, along}`, archive, step-skip `{step}`. Duplicates throw `DuplicateCheckBindingError`.
6. Two-tier governance: check-level confinement, binding-level policy lock, config lock, disable lock, monotonic locks, merger preservation, Category A/B/C.
7. Cascading config `{...checkDefault, ...bindingDefault, ...schemaStepConfig}` delivered in `ctx.config`.

### Implementation Status

| Requirement                          | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open check registry                  | partial     | `get/has/list/bindings` are present (check-registry.ts:124-154). The default constructor seeds only `TRANSITION_BINDINGS` (check-registry.ts:77), so `bindings()` has no archive coordinates. Production composition passes `TRANSITION_BINDINGS + ARCHIVE_BINDINGS` (composition-registries.ts:218-221), so only the default constructor diverges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Immutability of built-in checks      | implemented | Built-ins are injected in the constructor and there is no public replace or unregister. Plugin ids are always `@`-prefixed, so they cannot collide with built-ins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Canonical namespacing & registration | implemented | Regex and errors match (check-registry.ts:18, 203-211). The JSDoc says `^[a-z][a-z0-9-]*$` (check-registry.ts:179), which is stale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Adaptation of CustomCheckDefinition  | implemented | check-registry.ts:213-231.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Binding coordinate identity          | implemented | `coordinateKey` (check-registry.ts:47-58). The key omits `from`, so two transition bindings with different `from` and the same `to/along` collide. That matches the spec's coordinate `{to, along}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Two-tier governance                  | partial     | Check-level governance and Categories A/B/C are correct (check-registry.ts:79-104). `buildSchema` enforces Embedding, BindingOverride, Config and Disable (build-schema.ts:811-936). Gaps: (a) X2, plugin `allowDisable` is lost in composition. (b) A check-level `allowBindingOverride:false` also locks `onFailure/skippable` at the plugin's own coordinates (build-schema.ts:833-852). The spec scopes check-level to confinement only, so the code is stricter than the spec. (c) `matchingBinding` is `.find()`, the first binding for the id, so with several bindings for one check the per-coordinate lock may be read from the wrong binding (build-schema.ts:812-826). (d) The monotonic rule is enforced only because schemas cannot carry locks and duplicate ids are rejected. There is no explicit "downgrade" detection. |
| Cascading configuration hierarchy    | divergent   | The merge is deep, with array concatenation, not the spread the spec shows. It is also applied twice (X1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Discrepancies

- **HIGH: X2, plugin `allowDisable` dropped.** Code is wrong: forward `reg.options?.allowDisable` and add a top-level `allowDisable` to `PluginCheckRegistration`. The alternative reading, that the spec wrongly expects plugin-level `allowDisable` through composition, is not plausible, because the spec explicitly names `PluginCheckRegistration.allowDisable`.
- **HIGH: X1, double cascade.** Code is wrong.
- **MEDIUM: Scenario "Reject external registration using unprefixed built-in name" expects `InvalidPluginNameError`.** The code throws it only for an empty or invalid `pluginName`. "Attempting to override a built-in" (plugin `protocol` + id `edge`) succeeds as `@protocol.edge` by design, and test check-registry.spec.ts:188 asserts that success. Possibility A, the spec is wrong: the scenario should say "is namespaced and cannot clobber the built-in" or "empty pluginName throws `InvalidPluginNameError`". Possibility B, the code is wrong: the registry should reject a `pluginName.id` equal to a built-in id. My recommendation is to reword the scenario (A).
- **MEDIUM: Check-level `allowBindingOverride:false` also locks policy at default coordinates** (build-schema.ts:833-835). Spec wrong: if strictness is intended, add it to the spec. Code wrong: if check-level should only confine, read `governance.allowBindingOverride` only for embedding.
- **LOW: Cascade semantics conflict between specs.** check-registry shows a shallow spread. transition-checks requires `deepMergeConfig` with array concatenation. Recommend aligning check-registry with the deep merge.
- **LOW: verify.md "List all registered checks" says "15 built-ins".** The spec and code have 16 (check-bindings.ts:168-185). The spec count is wrong.
- **LOW: Signature naming.** The spec writes `options?: PluginCheckRegistration`, but the code uses `PluginCheckRegistrationOptions`. `PluginCheckRegistration` is a different composition descriptor type (composition-registries.ts:66).
- **LOW: The default `CheckRegistry()` has no archive bindings** (check-registry.ts:77). Either the code should default to both tables, or the spec should state that composition supplies them.
- **LOW: Built-in fallback paths call `buildSchema` without the kernel registry** (infrastructure/fs/schema-registry.ts:76, schema-repository.ts:98). Schemas referencing plugin checks would throw `UnknownCheckError` on those paths. I did not confirm whether they are on the change-resolution path.

### Test Coverage

- check-registry.spec.ts covers: namespacing (:13); invalid names (:48, :223); the accepted grammar, `it.each` with `MyPlugin`, `123plugin`, `my_plugin` (:66); `InvalidCheckKindError` (:79, :264); `DuplicateCheckError` (:99); `DuplicateCheckBindingError` for transition (:117) and step-skip (:357); governance storage (:164); no clobbering (:188, :249); Category A/B/C `allowDisable/allowBindingOverride` (:286); `allowDisable` defaults (:319, :336).
- build-schema.spec.ts covers: governance (:852-1335) and skipChecks governance (:1337-1700), including Category A/B embedding (:925, :1384), check-level BindingOverride (:1011), config lock (:1100), check-level disable (:1184), binding-level disable (:1217), the redeclared allowDisable lock (:1256), binding-level `allowBindingOverride:false` on skipChecks (:1407, :1445).
- merge-schema-layers.spec.ts:362-450 appends checks and skipChecks and rejects duplicate identities.
- execute-matching-predicates.spec.ts:234 tests the cascade, but it feeds a raw binding and bypasses `resolveEffectiveBindings`, and its arrays are object-valued. **That masks X1.**

### Missing Tests

- **"Check-level allowBindingOverride false enforces confinement"**: no test registers a plugin with `defaultBindings` to `ready` and then embeds it on `implementing` expecting `CheckEmbeddingForbiddenError`. Only built-in Category A/B embedding is tested.
- **"Coordinate allowBindingOverride false locks policy overrides"** for `scope: 'transition'` with `onFailure: 'collect'`: no test. Coverage exists only for skipChecks (:1407, :1445) and for check-level locks (:1011).
- The default `allowBindingOverride=false` when `defaultBindings` is provided is not asserted directly.
- "Category B ... workflow.tasksEmpty with native attribute governance": the :286 test omits `workflow.tasksEmpty`.
- "Schema layer mergers preserve step checks without erasing governance locks": the merge tests exist under different titles. No test merges layers and then runs `buildSchema` with the registry to prove locks survive the merge.
- No composition-level test that plugin `allowDisable:false` survives `createCompositionRegistryView` (X2).
- No end-to-end cascade test with array config through `evaluateTransitionCandidate` (X1).

### Spec Dependency Chain consistency

- core:transition-checks Registry bindings vs check-registry Category A/B/C: the governance values agree. However, transition-checks requires the binding specs to "explicitly declare" `allowBindingOverride/allowDisable/skippable` (see that section).
- core:workflow-model §Workflow step checks item 3 ("Confinement lock ... unless already bound by kernel registration") agrees with build-schema.ts:829.
- default:\_global/architecture: CheckRegistry is pure, with no I/O. OK.

### Summary counts

7 requirements: 3 implemented, 3 partial, 1 divergent, 0 missing. Discrepancies: 2 HIGH, 2 MEDIUM, 5 LOW.

---

## Spec: core:transition-checks

### Requirements Summary

These cover: check identity/result/skip sources; the Check ABI; CustomCheckDefinition; one file per check; applicability `from/to/along` with a topology-derived axis; step-skip scope; dynamic runtime binding composition and cascade; archive as an operation; effect phase/onFailure; predicate vs effect; evaluation of an attempt (protocol fail-fast on execute); the shared candidate evaluator; the shared validity verdict; the single reconciler; registry bindings (Categories A/B/C); actionable diagnostics; the progress bus; projections; no snapshot bag; approval precedence and production composition.

### Implementation Status

| Requirement                                                              | Status                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check identity and result                                                | implemented                                   | transition-checks.ts:24, 81-98. User bypass is `{outcome:'skip', details:{bypassedByUser:true}}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Check ABI create and WorkflowCheck                                       | implemented                                   | `CheckExecutionContext` still carries `skipHookPhases`, `effectiveStatusByArtifact`, `approvals` and `passMemo` (transition-checks.ts:351-379). The spec lists "strictly" `change/schema/attempt/config/validity/onCheckProgress`, so this is a minor divergence. The verify scenario mentions "baked approvals, skip flags", so verify and spec disagree here.                                                                                                                                                                                                                                                                                                         |
| Public CustomCheckDefinition                                             | implemented                                   | transition-checks.ts:385-394.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| One implementation file per check                                        | implemented                                   | application/checks/\*.ts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Applicability from/to/along                                              | implemented                                   | `classifyAlong` uses `WorkflowTopology.orderedPipeline(schema, approvals)` (transition-checks.ts:169). Disabled steps are excluded by the topology.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Step-skip scope and applicability                                        | partial                                       | Types and matcher are correct (transition-checks.ts:110-113, 200-205, 221-226). Isolation is broken by X5, and plugin default step-skip bindings are dropped by X3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Dynamic runtime binding composition & cascade                            | partial                                       | Synthesis and disable filtering exist. X1 (double merge), X5 (cross-scope disable) and X6 (`along/from` ignored) apply. `matchesTransition` ignores the binding's `from` and `exceptAlong` (transition-checks.ts:595-604).                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Archive is an operation                                                  | implemented                                   | ARCHIVE_BINDING_SPECS has no `approval.signoff`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Binding pipeline phase and failure policy                                | implemented                                   | check-bindings.ts:106-120, 151-164.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Predicate versus effect                                                  | implemented                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Evaluation of a transition attempt                                       | divergent                                     | The fail-fast on execute was removed (X4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Shared transition candidate evaluator                                    | implemented                                   | evaluate-transition-candidate.ts; used by `TransitionChange` (transition-change.ts:318, 400) and by `executeChecksByLegalTargets`. Pure. Ordered as target checks, then bypassed steps. Minor: `reportSkipWhenUnmatched` bindings emit extra `skip` rows for each bypassed step (e.g. a second `protocol.edge` skip), which is cosmetic noise in `checks`.                                                                                                                                                                                                                                                                                                              |
| Shared validity verdict / recovery priority                              | partial (out of batch focus)                  | X7: `verificationRequired` ignores disabled `verifying`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Single validity reconciliation owner                                     | implemented                                   | `TransitionChange` requires the reconciler (transition-change.ts:172-174).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Registry bindings for this capability                                    | partial                                       | The governance values come from check-level governance (check-registry.ts:79-104). The binding specs do **not** explicitly declare `allowBindingOverride:false` for Category A/B, and `applyBindingSpecs` defaults `allowBindingOverride/allowConfigOverride` to **true** on the `CheckBinding` (transition-checks.ts:517-518). As a result `CheckBinding.allowBindingOverride === true` for `protocol.edge`, `hook.*`, `verification.current` and so on. Category C binding specs (`impl.*`) do not declare `allowBindingOverride:true/allowDisable:true` (check-bindings.ts:67-86). The `hook.pre`/`hook.post` binding specs omit `skippable` (it defaults to false). |
| Actionable fail diagnostics                                              | implemented (spot-checked via existing tests) |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Generic check progress bus                                               | implemented                                   | execute-matching-predicates.ts:94-123. Bypassed checks emit `check-done` without `check-start` (:193-198). The fallback-loop bypass emits no progress at all (:251-259). LOW.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Projections / No shared snapshot bag / Approval precedence & composition | implemented (not deeply re-audited)           | `_assertDrainAndGateTargets` runs before evaluation (transition-change.ts:257).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Discrepancies

- **HIGH: X1, X3.** The code is wrong.
- **MEDIUM: X4, fail-fast regression.** Code wrong: restore `failFastOn: 'protocol.edge'` by threading the option through `evaluateTransitionCandidate`, and skip step-skip evaluation when the edge is illegal. Spec wrong: only if the intent is now "collect on both paths", but the requirement and the transition-change "to next" section both state fail-fast explicitly.
- **MEDIUM: X5, X6.** The code is wrong. The spec's Isolation clause and workflow-model's `along/from` defaults are explicit.
- **MEDIUM: Binding-level governance flags on built-ins.** Possibility A, the spec is wrong: it should say these locks are check-level governance (`CheckRegistry.getGovernance`), not explicit binding-spec fields, and the scenario "Category C ... inspecting their registered governance locks in TRANSITION_BINDING_SPECS" should inspect governance instead. Possibility B, the code is wrong: add the explicit fields to `TRANSITION_BINDING_SPECS`/`ARCHIVE_BINDING_SPECS`, and stop `applyBindingSpecs` defaulting `allowBindingOverride/allowConfigOverride` to `true`. As it stands, a materialized `CheckBinding` for `protocol.edge` claims `allowBindingOverride: true`. Any consumer reading binding-level locks, such as build-schema.ts:835 or :864, depends on check-level governance to compensate.
- **LOW: Predicate `onFailure: 'collect'`** is accepted in declarations (workflow-model) and copied onto bindings, but `executeMatchingPredicates` does not use it; any predicate fail blocks. The spec defines `onFailure` only for effects, while workflow-model allows it on predicate step checks. Specs should clarify, or the code should implement non-blocking collect.
- **LOW: `CheckExecutionContext` content vs the "strictly contextual" list.** Extra fields exist. Update the spec, or verify and code.

### Test Coverage

- transition-checks.spec.ts covers: `classifyAlong` (:33-85, including omitted implementing/ready); `checkMatches` (:87-185); bindings (:187-280); step-skip matching (:416-455); tasksEmpty (:456); step-skip binding specs (:494); `resolveEffectiveBindings` (:526-800), including restrictive governance on synthesized bindings (:684) and the skipChecks overlay (:733).
- evaluate-transition-candidate.spec.ts covers: target-only (:70); one bypassed step (:95); a failing step-skip (:119); pipeline order (:156); an empty skip set (:196); ordering (:220); purity via spies (:245); invalid protocol edge, not allowed (:291).
- execute-matching-predicates.spec.ts covers: dedupe (:61); collect without fail-fast (:93); fail-fast on protocol.edge (:125, which tests the helper option only, not that `TransitionChange` uses it); validity passthrough (:197); cascade (:234, masked, see X1); self-discard (:320); disabled omission (:358).

### Missing Tests

- **"Protocol fails fast before other predicates"**: no test asserts that `TransitionChange` stops after `protocol.edge` (e.g. a spy on a later predicate not being called). The helper test :125 passes, but production no longer passes the option, so the regression is unguarded.
- **"Direction delegates to the authoritative topology axis"**: no test with a noncanonical declared order or an explicit approvals snapshot, and no spy on `WorkflowTopology.orderedPipeline`.
- **"Disabled steps are excluded from progress axis"**: no `classifyAlong` test with `verifying` disabled for `implementing → done`. Only topology tests exist (workflow-topology.spec.ts:41, 183, ...).
- **"Category C checks can be disabled or skippable per schema binding"** (TRANSITION_BINDING_SPECS fields): no test, and it would fail against the current binding specs.
- **"Synthesized bindings preserve restrictive governance"**: covered (:684).
- Scope isolation (X5) and the backward-entry fallback (X6) are untested.
- "Cascaded config ... tags ['a','b']" through `resolveEffectiveBindings` plus `executeMatchingPredicates` is untested and would fail.

### Spec Dependency Chain consistency

- core:workflow-topology: `bypassedSteps` excludes disabled steps, which matches the code (workflow-topology.ts:162-200). transition-checks "for every optional bypassed step" is consistent.
- core:workflow-topology "Step enablement and verification boundary" contradicts the current reconcile behaviour (X7). The transition-checks validity requirement ("stale verification blocks ... verification-requiring boundaries") should state that the boundary is topology-conditional.
- core:workflow-model: line 14 says a row attaches "only requires, requiresTaskCompletion, hooks", which is now stale given `optional/disabled/checks/skipChecks`. This is internal to workflow-model (LOW). Its `along`/`from` defaults for step checks are violated by X6.
- core:check-registry cascade wording (spread) vs `deepMergeConfig` (LOW).

### Summary counts

21 requirements: 13 implemented, 7 partial, 1 divergent, 0 missing. Discrepancies: 2 HIGH (X1, X3), 4 MEDIUM (X4, X5, X6, binding-level flags), 2 LOW (plus X8 LOW).

---

## Spec: core:transition-change

### Requirements Summary

These cover: the input contract (`skipChecks`, no legacy booleans); approval gates baked at construction; change existence; the optional refresh; spec/signoff as checks; pending-state failures; the direct target; canonical pre-transition validity (active check resolution, bypass verification, execution, failure abort); workflow requires and task completion mapping; verifying retry; the verification attempt lifecycle; backward and redesign invalidation; `archiving → archivable` recovery; pre and post hooks; delegation, persistence, result and progress; deps and the factory; `next` via `WorkflowTopology.nextForwardStep`; bypassed step evaluation (sovereign schema, shared candidate, empty set, freshness, hook suppression); unified `CheckPredicateFailedError`; parked approval precedence.

### Implementation Status

| Requirement                                      | Status                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract                                   | implemented                         | No `allowOutOfScope/allowOverlap` (transition-change.ts:52-81). `onProgress` is a second parameter, not an input field, and `skipHookPhases` is a `ReadonlySet<HookPhaseSelector>`, not `readonly HookPhase[]` (LOW spec/code drift).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Approval gates baked at construction             | implemented                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Change must exist                                | implemented                         | transition-change.ts:202-205.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Optional pre-transition refresh                  | implemented                         | Done through the reconciler (`refreshImplementationTracking` flag) (:209-212).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Spec approval / Signoff as checks                | partial                             | Implemented. The signoff path breaks when `verifying` is disabled (X7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Pending states / Parked approval precedence      | implemented                         | `_assertDrainAndGateTargets` runs before predicates (:257, 484-527).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Direct transition                                | implemented                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Canonical pre-transition validity reconciliation | partial                             | (1) Disabled omission is implemented (execute-matching-predicates.ts:187-190, transition-checks.ts:607-609), subject to the X5 leak. (2) Bypass validation: `UnknownCheckError`, effect rejection and `!skippable` are implemented (:291-311). However, a registered check with **no** binding at all (e.g. archive-only `schema.nameMatch` when the registry lacks archive bindings, or an unbound plugin check) passes validation silently, because `binding` is undefined (:299-310). The spec says `skippable !== true` must throw. The `binding` lookup also uses the first binding for the id, not the one matching the attempt. (3) Execution is implemented. (4) Failure abort: the spec says "MUST throw a unified `CheckPredicateFailedError`", but the code maps `protocol.edge/workflow.requires/workflow.taskCompletion/approval.*` to `InvalidStateTransitionError` (:547-589), as other requirements in this spec demand. |
| Workflow requires / task completion              | implemented                         | Mapped from the failed predicate (:552-581).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Verification attempt lifecycle                   | implemented                         | The rerun after hooks reconciles again (:382-420). The rerun reuses the pre-hook `effectiveStatusByArtifact` (:407), so `workflow.requires` is rechecked against stale artifact statuses. This is LOW and pre-existing in HEAD.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Backward / redesign / recovery                   | implemented (not deeply re-audited) |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Pre/Post hooks                                   | implemented                         | Effects come from `effectiveBindings` via `matchingEffects` (:365-380).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Transition delegation / Persistence              | implemented                         | `freshChange.transition(effectiveTarget, actor, schema, approvals)` inside `mutate` (:422-432).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Result / Progress                                | implemented                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Dependencies / Config factory                    | partial                             | The constructor also takes `reconcile`, `checkRegistry` and `resolveChangeSchema` (:144-154), which the Dependencies requirement does not list (LOW spec drift).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `to: 'next'`                                     | implemented                         | `WorkflowTopology.nextForwardStep` (:237-246).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Bypassed step evaluation and hook suppression    | partial                             | Sovereign schema via `ResolveChangeSchema` (:231-235); shared candidate (:318, 400); empty set passes; hooks only for `from/to`. Gaps: X3 (plugin default step-skip bindings dropped), X4 (no protocol fail-fast before step-skip predicates), X5. Item 2 says "Each bypassed step MUST be optional or disabled". By topology, disabled steps are never bypassed steps, so only `optional` is meaningful (LOW wording).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Shared runner errors propagate                   | partial                             | A single failure is wrapped. The verify scenario "Multiple failed checks with collect policy populate details" is **not implemented**: only the first failure is thrown (:351-354), and `CheckPredicateFailedError` carries no aggregate (check-predicate-failed-error.ts:27-34).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Discrepancies

- **HIGH: X3** (plugin step-skip defaults dropped). Code wrong.
- **MEDIUM: X4** (fail-fast removed). Code wrong.
- **MEDIUM: Internal spec contradiction on error type.** "Canonical pre-transition validity reconciliation" step 4 and "Shared runner errors" say every predicate failure is `CheckPredicateFailedError`. "Workflow requires enforcement", "Task completion", the Constraints, and "Historic parked approval" require `InvalidStateTransitionError` with structured reasons. The code follows the latter. The spec is wrong: scope `CheckPredicateFailedError` to checks without a canonical structured reason.
- **MEDIUM: "Multiple failed checks with collect policy" scenario.** Possibility A, the spec is wrong: drop the scenario until predicate `collect` semantics are specified. Possibility B, the code is wrong: implement predicate collect aggregation in `CheckPredicateFailedError.details`.
- **MEDIUM: X7** (disabled `verifying` vs signoff/reconcile). The code is wrong per workflow-topology. The transition-change "Signoff is a check" requirement should also say "valid verification evidence when `verifying` is enabled".
- **LOW: Unbound registered checks in `skipChecks` pass validation** (:299-310). Code wrong: when `binding` is undefined, the check should throw `CheckNotSkippableError`.
- **LOW: Stale `effectiveStatusByArtifact` in the post-hook rerun** (:407). Pre-existing. Code wrong relative to "fresh ... predicate evaluation SHALL run again".
- **LOW: Input contract and Dependencies drift** (`onProgress` position, Set vs array, missing `refreshImplementationTrackingBefore`, extra constructor deps). The spec should be updated.

### Test Coverage

transition-change.spec.ts has 145 tests. Relevant ones: next happy path (:245-340); refresh (:345-370); parked approval (:581-640); skipHookPhases variants (:1611-2000); "still fails incomplete tasks when skipHookPhases is all" (:2691); skipChecks for `impl.linksInScope` (:2896-2930); custom checks and skipChecks validation (:3178-3545: Unknown, NotSkippable, effect, custom pass/fail, bypass, duplicates); shortcut and step-skip with hook suppression (:3546-3660); sovereign schema (:3661, :3933); approvals passed to topology (:3741); declarative schema checks and skipChecks (:3765-3930); freshness and effects ownership (:4045-4140). The real `createWorkflowCheckRegistry` is used in `makeUseCase` (:111). The schema comes from `makeSchema`, which **bypasses `buildSchema` governance**, so governance is never exercised end to end here.

### Missing Tests

- **"next skips disabled step"**: no `TransitionChange` test with `verifying: disabled` and `to: 'next'` (there is no `disabled: true` anywhere in transition-change.spec.ts).
- **"Disabled step check is omitted from execution"** and **"Target step omits schema-disabled check"**: no `TransitionChange`-level test. Only the helper-level execute-matching-predicates.spec.ts:358 and transition-checks.spec.ts:597 exist.
- **"Protocol fails fast"** at use-case level: none (X4).
- **"Multiple failed checks with collect policy populate details"**: none, and it would fail.
- **"Unauthorized bypass of mandatory check `protocol.edge` throws `CheckNotSkippableError`"**: covered generically (:3195, :3344). I did not verify that `protocol.edge` specifically is used.
- No test with a plugin registering default `step-skip` bindings via composition (X3).
- No end-to-end test with `verifying` disabled and `done → archivable` with the signoff gate (X7).

### Spec Dependency Chain consistency

- core:workflow-topology: `nextForwardStep`, `bypassedSteps` and `legalTransitions` are used consistently. The "verification boundary" contradiction is X7.
- core:transition-checks: the shared evaluator is used, but the fail-fast contract is not honoured (X4).
- core:check-registry: transition-change says it "registers step-skip checks for bypassed states". Composition drops plugin step-skip defaults (X3).
- core:resolve-change-schema: implemented through the `ResolveChangeSchema` service.
- default:\_global/architecture: the use case keeps I/O in ports, and evaluation is pure. OK.

### Summary counts

26 requirements: 18 implemented, 7 partial, 0 divergent, 0 missing. One verify scenario ("collect") is unimplemented. Discrepancies: 1 HIGH (X3), 4 MEDIUM (X4, error-type contradiction, collect scenario, X7), 3 LOW.

---

## Batch totals

- HIGH: X1 (double cascade), X2 (plugin allowDisable dropped), X3 (plugin step-skip defaults dropped).
- MEDIUM: X4 (fail-fast regression), X5 (scope isolation leak), X6 (along/from ignored in the fallback loop), X7 (disabled verifying vs signoff/verification), check-level lock over-restriction, binding-spec governance fields, the transition-change error-type contradiction, the collect scenario, and the "unprefixed built-in" scenario wording.
- LOW: X8 plus the documentation and spec drift items listed above.

# Partial compliance audit C — cli:change-status, cli:change-transition, skills:workflow-automation

Change: `schema-workflow-skippable-states`. Read-only audit. Specs were read via `changes spec-preview`; I read the code directly. Tests were run:
`packages/cli` status.spec + transition.spec → 90 pass / 0 fail; `packages/skills` generated-skill-protocol.spec + template-workflow.spec → 30 pass / 0 fail.

Most of the CLI requirements were already in place before this change. This audit concentrates on the requirements this change modified (the delta files under `deltas/cli/change-status`, `deltas/cli/change-transition` and `deltas/skills/workflow-automation`) and on the scenarios listed in the brief.

---

## 1. cli:change-status

### Requirements Summary

- Lifecycle projections (modified by this change): render `validTransitions`, `availableTransitions`, `nextAction` and blockers exactly as `GetStatus` returns them. Project the ordered workflow pipeline: annotate optional steps with `[optional]`, leave out disabled steps, and show shortcut/bypass paths in `availableTransitions`.
- Drafted changes are read-only. Drafted JSON must empty `availableTransitions` and `availableSteps`, set `nextAction.command` to null, and emit no artifact DAG.
- Unchanged requirements: DAG, display state, review, labels, schema warning, specs/deps section, implementation section.

### Implementation Status

| Requirement / scenario                                                                                                      | Status                             | Evidence                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle projections from GetStatus (no local filter)                                                                      | Implemented                        | status.ts:298-300 joins `lifecycle.availableTransitions` with no filter; status.ts:290-293 passes `nextAction` through                                                                                                                                                    |
| Pipeline annotates optional steps                                                                                           | Implemented (partial form)         | status.ts:301-307 renders `extras:` from `lifecycle.availableSteps`, with `[optional]` added when `step.optional` is set                                                                                                                                                  |
| Pipeline omits disabled steps                                                                                               | Implemented, but only through Core | Core `evaluateLifecycleVerdict` builds `availableSteps` from `WorkflowTopology.orderedPipeline`, which drops disabled steps (lifecycle-verdict.ts:199-241, workflow-topology.ts:66-81). The CLI does no exclusion of its own, which is correct under "MUST NOT recompute" |
| Bypass paths in availableTransitions                                                                                        | Implemented (passthrough)          | status.ts:298-300 and :503                                                                                                                                                                                                                                                |
| JSON `lifecycle.availableSteps[].optional`                                                                                  | Implemented                        | status.ts:504-514                                                                                                                                                                                                                                                         |
| Drafted JSON empties hops even if Core leaks them                                                                           | Implemented                        | status.ts:149 (command→null), :183-184 (`[]`), no `artifactDag` key in the drafted payload                                                                                                                                                                                |
| Drafted text read-only                                                                                                      | Implemented                        | status.ts:152-173                                                                                                                                                                                                                                                         |
| Remaining requirements (DAG, display state, review, labels, schema warning, specs/deps, refresh delegation, implementation) | Implemented (pre-existing)         | status.ts:200-546                                                                                                                                                                                                                                                         |

### Discrepancies

- **MEDIUM — the pipeline is rendered as `extras:`, not as a pipeline.** The spec says "SHALL project the ordered workflow pipeline". The text output labels the ordered pipeline `extras:` (status.ts:306). It does not mark which steps are available, and the line disappears when `availableSteps` is empty. The spec example also has no pipeline line.
  - Possibility A: the code is wrong. It should print a `pipeline:` line in topology order (and possibly show availability).
  - Possibility B: the spec is too vague. "Pipeline display" could be defined as the existing `extras` line, and the spec example updated to match.
- **LOW — redundant type cast.** status.ts:303 and :505 cast `step as typeof step & { optional?: boolean }`. Core's `LifecycleStepVerdict` already declares `optional?: boolean` (lifecycle-verdict.ts:155). The cast either hides a stale SDK re-export type or is dead code. It is not an `any` violation, but it widens the type without need.
- **LOW — `--help` schema is out of date.** The JSON schema text at status.ts:110 and :113 omits `optional` on `availableSteps`. The change added that field to the structured output (status.ts:508).
  - Possibility A: update the help text.
  - Possibility B: if `optional` is meant to stay undocumented, the spec should say so.
- **LOW — drafted JSON passes check rows through.** Drafted JSON spreads `optionalCheckFields(lifecycle)` (status.ts:185). If Core leaked `checksByTarget` for a draft, the output would carry per-target check rows. The spec only requires hops/steps to be empty, so this is a gray area.

### Test Coverage

- `displays [optional] annotations in text extras and in structured JSON availableSteps` (status.spec.ts:1439): checks for `implementing [optional]` in text and `optional: true` in JSON.
- `JSON drafted status includes isDrafted and empty transitions` (status.spec.ts:74): Core leaks `availableTransitions: ['ready']` and a non-empty `availableSteps`; the test asserts `[]`, `[]` and `command: null`. This fully covers "Drafted JSON empties hops even if Core leaks them".
- `given GetStatus omits verifying…` (status.spec.ts:1037) and `given GetStatus recommends verify…` (status.spec.ts:1063): projection passthrough.
- `renders custom check blockers with check label, message, and checkId` (status.spec.ts:1515).

### Missing / Weak Tests

- The pipeline test is weak on the disabled part of the scenario. Its mock contains no disabled step, so "verifying is excluded" is never exercised. It even asserts `toContain('verifying')`. The test only proves passthrough. An end-to-end check that Core excludes the disabled step is not present at the CLI level (it is covered in core `workflow-topology.spec.ts:39`).
- No assertion that drafted JSON omits `artifactDag`. This is part of the requirement "Stable display status and drafted JSON compatibility".

### Spec Dependency Chain

This spec is consistent with core:get-status and core:lifecycle-engine: `availableSteps` comes from `orderedPipeline`, so disabled steps are already gone. It is also consistent with the "MUST NOT recompute" constraint, since the CLI does no topology work.

### Summary

Requirements: 18 total, 17 implemented, 1 partial (pipeline rendering). Discrepancies: 0 HIGH, 1 MEDIUM, 3 LOW. Missing/weak tests: 2.

---

## 2. cli:change-transition

### Requirements Summary

- Next-transition resolution (modified by this change):
  - `--next`, **or no explicit target**, passes `to: 'next'`.
  - Core resolves it with `nextForwardStep`: disabled steps are skipped, and an enabled optional step stays the target.
  - `--next` never evaluates shortcut policy.
  - When Core rejects the request: exit 1 with an `error:` message.
- Progress goes on the generic check bus. Hooks are `Running pre/post hooks`. Structured output uses `stream: "change-transition"` and never `hook-progress`.
- `--skip-hooks` maps to `skipHookPhases`, and `all` skips every hook execution.

### Implementation Status

| Requirement / scenario                                             | Status              | Evidence                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI does not keep a from→to next table                             | Implemented         | transition.ts:364-365 sets `requestedTarget = 'next'`; it is passed at :373. The only state list is `CHANGE_STATES` (transition.ts:46-59), used to validate arguments |
| Next flag advances designing→ready                                 | Implemented (Core)  | workflow-topology.ts:202-230; core test `returns immediate next step in standard pipeline`                                                                            |
| Next flag skips disabled step                                      | Implemented (Core)  | `rawActivePipeline` drops disabled steps; core test `skips disabled steps to the next enabled step` (workflow-topology.spec.ts:370)                                   |
| Next flag enters the closest enabled optional step                 | Implemented (Core)  | `nextForwardStep` takes `pipeline[fromIndex+1]` with no optional or step-skip logic (workflow-topology.ts:224-229)                                                    |
| Next fails in pending-spec-approval / pending-signoff / archivable | Implemented         | Core throws `HappyPathNextUnavailableError` (transition-change.ts:243-245). The CLI adds it to repair-guide errors (transition.ts:95, :103) and exits 1 (:405, :423)  |
| signed-off --next → archivable                                     | Implemented (Core)  | `normalizeDeliveryState`                                                                                                                                              |
| Shared presentation with run-hooks is not the same JSON stream     | Implemented         | transition.ts:226 (`streamName: 'change-transition'`), :241/:251/:261/:384/:408; no `hook-progress` anywhere in transition.ts                                         |
| Hook execution / --skip-hooks                                      | Implemented         | transition.ts:332-335 → `skipHookPhases`; Core `HookEffectCheck.execute` returns `skip` for `all` (hook-effect-shared.ts:135-138)                                     |
| Check progress rendering                                           | Implemented         | `_check-progress-presenter.ts`                                                                                                                                        |
| Command signature `[name] [target]`, target omitted → resolve next | **Not implemented** | transition.ts:280 declares `<name>` as required; transition.ts:203-205 rejects a missing step with "either <step> or --next is required"                              |

### Discrepancies

- **MEDIUM — omitting the target is an error, but the spec says it should mean `next`.** The modified Next-transition requirement says "When the command is invoked with `--next` (or without an explicit target step), it SHALL pass `to: 'next'`". The Command signature requirement repeats this ("If `target` is omitted, it attempts to resolve the next logical transition") and also makes `name` optional. In the code, `validateRequestedTarget` errors when the step is missing (transition.ts:203-205), `name` is required (transition.ts:280), and the test `Missing arguments` (transition.spec.ts:44) locks in the error.
  - Possibility A: the code is wrong. It should treat a missing step as `next` and default `name` to the active change.
  - Possibility B: the spec is wrong. The delta copied the parenthetical "(or without an explicit target step)" from older text; it should be removed, and the signature should become `<name> [step]` with a required target-or-`--next`.
- **MEDIUM — `--skip-hooks all` text output looks like the hooks ran.** The spec says that with `all`, "all hook execution is skipped". No hook actually runs: `HookEffectCheck` returns `skip` before calling `RunStepHooks` (hook-effect-shared.ts:136-137). However:
  - `executeCheckWithProgress` still emits `check-start` and `check-done` with `outcome: 'skip'` (execute-matching-predicates.ts:99-110).
  - The text presenter prints `✓ <label>` for every outcome except `fail` (\_check-progress-presenter.ts:107-113).

  So users see `Running post hooks (hook.post)` followed by `✓ Running post hooks`, the same for pre hooks, which reads as if the hooks passed. The spec's check-progress format only defines `✓` and `✗`; it says nothing about `skip`.
  - Possibility A: fix the presenter. Render skip as something like `- <label> (skipped)`, or suppress hook effect progress when the phase is skipped.
  - Possibility B: amend the spec to define how skip outcomes render. Today it is underspecified, and the current behaviour is technically compliant but misleading.

- **LOW — the check list prints twice.** `TransitionChange` evaluates the predicates once before the effects and again after the post-hook reconcile (transition-change.ts:318-330 and :400-412). Both passes send events to `onCheckProgress`, so the text output shows every predicate twice, even with `--skip-hooks all` when no hook could have changed state. The spec does not forbid this. It does add noise and makes it hard to see what actually ran.
  - Possibility A: core should re-evaluate silently, or skip the re-evaluation when every effect was skipped.
  - Possibility B: the spec should state that the second pass is visible by design.
- **LOW — misleading help text.** The `--next` option help reads "next logical lifecycle step" (transition.ts:285). Under the new semantics it is the "closest enabled step", and optional steps are not bypassed. The constraint "the CLI never exposes the routing logic in its help text" arguably supports leaving it vague, so this is informational only.

### Test Coverage

- `resolves target from --next without positional step` (transition.spec.ts:68): `to: 'next'` and status read with `refreshImplementationTracking: false`.
- `keeps --next as a nearest-step request when status recommends an optional shortcut` (transition.spec.ts:94): `to: 'next'` is sent even when `nextAction` advertises a `verifying` shortcut.
- `--next failures` describe block (transition.spec.ts:817-891): the three rejection states.
- `renders Repair Guide and exits with code 1 on HappyPathNextUnavailableError` (transition.spec.ts:1648).
- `resolves signed-off --next to archivable` (transition.spec.ts:400).
- `--skip-hooks flag` block (transition.spec.ts:894-1003): checks only that the flag is mapped.
- Core: `workflow-topology.spec.ts` `nextForwardStep` cases at lines 348, 370, 379.

### Missing / Weak Tests

- **"Next flag enters the closest enabled optional step" has no real coverage.** The CLI test mocks the transition result (`implementing`), so it only proves `to: 'next'` is forwarded. Core has no `nextForwardStep` test with an `optional: true` step whose step-skip checks pass. The core suite has "skips disabled" but nothing like "keeps an optional step".
- "Next flag advances designing→ready" is covered only in core. There is no CLI scenario test from `designing`; it is equivalent to the drafting test.
- "Shared presentation… not the same JSON stream": no test asserts the absence of `stream: "hook-progress"` in JSON mode for hook check events. The existing JSON tests check `change-transition` records. Worth confirming that some test explicitly asserts `not.toContain('hook-progress')`; I did not find one in this file.
- No test for how skipped hook phases render in text (see the MEDIUM finding above).

### Spec Dependency Chain

- Consistent with core:transition-change (`nextForwardStep`) and core:lifecycle-engine. The CLI does no routing.
- core:hook-execution-model order (source.post, then target.pre) holds: `Running post hooks` prints before `Running pre hooks`.
- No contradiction with core:transition-checks on the bus. The `skip` outcome is defined in core, but the CLI rendering spec is silent on it. That is a gap between specs, not a contradiction.

### Summary

Requirements: 17 total, 16 implemented, 1 not implemented (missing-target → next / optional name). Discrepancies: 0 HIGH, 2 MEDIUM, 2 LOW. Missing/weak tests: 4.

---

## 3. skills:workflow-automation

### Requirements Summary

The requirement modified by this change is **Cross-skill artifact review and recovery**. Lifecycle skills must:

- Read `nextAction.command`, `nextAction.targetStep` and `lifecycle.availableTransitions` from structured status dynamically, never from fixed progressions.
- When invoked explicitly, map to their own target, continue if that target is advertised, and stop if it is not.
- Run no hooks for bypassed or disabled steps.
- Invent no optional-step policy.
- Follow the verify/compliance attempt-ownership rules (start, checks, complete; `--delegated --attempt`; repeat work when fingerprints change).
- **Verify scenario:** "an unconditional canonical target recipe fails validation".

### Implementation Status

| Scenario                                                                                                                                               | Status                       | Evidence                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dynamic topology consumption by agent skills                                                                                                           | **Partial**                  | A new "Schema-aware lifecycle routing" section was added to design (tpl:50-68), implement (tpl:31-48), verify (tpl:36-53) and archive (tpl:33-50). The operational steps below those sections still contain fixed recipes (next row) |
| Fixed canonical recipes cannot override structured routing                                                                                             | **Not implemented**          | No validator exists anywhere in `packages/skills/src` or the tests (searched for availableTransitions, recipe, unconditional). The templates still hold unconditional recipes, listed below                                          |
| Disabled verifying selects only the actual target hooks                                                                                                | **Contradicted by template** | specd-verify tpl:85-98: "If in `implementing`" always runs `run-hooks <name> verifying --phase pre` and `transition <name> verifying`. Step 5 (tpl:235-242) always runs `verifying --phase post`                                     |
| Optional implementing bypass follows status routing                                                                                                    | **Contradicted by template** | specd-design tpl:433: "If spec=off: Suggest `/specd-implement <name>`", whatever `nextAction` says. specd-implement tpl:83-94 always enters `implementing`; tpl:312 always recommends `/specd-verify`                                |
| Generated lifecycle guides preserve semantic routing invariants (`done` stays mandatory)                                                               | Implemented in prose         | specd-verify tpl:342-384 (6a done, then 6b archivable); the test for this is a simulation (see Weak tests)                                                                                                                           |
| Explicit design invocation may choose an advertised redesign                                                                                           | Implemented (prose)          | design tpl:59-63                                                                                                                                                                                                                     |
| Explicit skill stops when its target is unavailable                                                                                                    | Implemented (prose)          | "stop before running any hooks" in all four templates                                                                                                                                                                                |
| Skill does not invent optional-step policy                                                                                                             | Partial                      | The routing prose defers to Core. However, implement tpl:76-94 and design tpl:424-438 branch on the `approvals:` line and the state instead of `availableTransitions`                                                                |
| Consume `nextAction.targetStep`                                                                                                                        | **Not implemented**          | None of the four lifecycle templates mentions `targetStep` (only shared.md.tpl does, once). The spec names `nextAction.targetStep` explicitly                                                                                        |
| Independent verify owns its attempt                                                                                                                    | Implemented                  | verify tpl:193-209 (start before checks), :321-331 (complete only after checks and hooks succeed); hooks in step 5 run before complete                                                                                               |
| Full verify shares one attempt with compliance                                                                                                         | Implemented                  | verify tpl:246-260; compliance tpl:123-130                                                                                                                                                                                           |
| Delegated compliance remains change scoped downstream                                                                                                  | Implemented                  | compliance tpl decision table :143-146, mode detection :162                                                                                                                                                                          |
| Delegated mode requires an explicit attempt                                                                                                            | Implemented                  | compliance tpl:163 (exactly one of the flags, or a missing value, means invalid: stop before discovery or report)                                                                                                                    |
| Standalone compliance owns a separate attempt                                                                                                          | Implemented                  | compliance tpl:102-112                                                                                                                                                                                                               |
| Changed inputs require repeated work                                                                                                                   | Implemented                  | verify tpl:207-209, :333-336; compliance tpl:112                                                                                                                                                                                     |
| Diagnostic priority / data extraction / spec read surfaces / outline / canonical plurals / freshness / validation review / traceability / optimization | Implemented (pre-existing)   | shared.md.tpl:43-89 and later                                                                                                                                                                                                        |

### Discrepancies

- **HIGH — nothing enforces "fixed canonical recipes cannot override structured routing".** The scenario requires that "an unconditional canonical target recipe fails validation". There is no protocol validator. The existing tests only check that phrases are present, so they would pass even though the templates contain these unconditional recipes:
  - verify tpl:85-98: `implementing` → verifying pre-hooks, then `transition verifying`
  - verify tpl:235-242: verifying post-hooks, always run
  - verify tpl:342-384: "6a. Transition to done", then "6b … transition archivable"
  - design tpl:81-92 and :388-401: designing and ready
  - design tpl:433: suggests `/specd-implement`
  - implement tpl:83-94: transition implementing
  - implement tpl:312: suggests `/specd-verify`

  The added "Schema-aware lifecycle routing" sections sit next to these recipes and contradict them. An agent following the steps literally will run verifying hooks when `verifying` is disabled, and will enter `implementing` when it is optional and Core advertises a bypass.
  - Possibility A: the code is wrong. Rewrite each operational step so its target is "the target selected from fresh `lifecycle.availableTransitions` / `nextAction.targetStep`", with the hook step names taken from that target. Then add a validator test that fails on an unconditional `changes transition <name> <literal-state>` or `run-hooks <name> <literal-state>` without a routing guard. Exceptions would be the explicit back-routes (designing, implementing on failure).
  - Possibility B: the spec is too strong. "Fails validation" could be relaxed to "is guarded by the routing section". Even then the verify template still conflicts with "Disabled verifying selects only the actual target hooks".

- **HIGH — the verify template breaks the "Disabled verifying" scenario.** verify tpl:85-98 and :235-242 run `verifying` pre and post hooks unconditionally. The only safeguard is the prose at tpl:53 ("never run verifying hooks when verification is disabled"), which the step text directly contradicts. When `verifying` is disabled the change goes implementing → done, and verify has no `implementing → done` branch.
  - Possibility A: the template is wrong. Add a branch on the advertised target.
  - Possibility B: none credible. The spec scenario is explicit.
- **MEDIUM — lifecycle skills do not consume `nextAction.targetStep`.** The spec says skills "MUST consume `nextAction.command`, `nextAction.targetStep`, and `lifecycle.availableTransitions`". The four templates reference only `nextAction.command` and `lifecycle.availableTransitions`. The test simulation uses `targetStep`, but the templates never tell an agent to read it.
  - Possibility A: add `targetStep` to the routing prose.
  - Possibility B: the spec could drop `targetStep` if `command` plus `availableTransitions` is enough. It is not: `/specd-verify` covers several hops.
- **MEDIUM — design and implement completion messages ignore bypass.** Design tpl:433 always suggests `/specd-implement`, and implement tpl:312 always suggests `/specd-verify`. When implementing is optional and bypassable, or verifying is disabled, `nextAction.command` may differ. This conflicts with "default routing SHALL advance directly along the legal path recommended by `nextAction`".
  - Possibility A: these messages should echo `nextAction.command`.
  - Possibility B: they are "explicit selection" suggestions. But they appear on the default path, so B is weak.
- **MEDIUM — approval gating is read from the text `approvals:` line.** implement tpl:76-83, design tpl:426-438 and verify tpl:366-391 branch on `spec=on/off` and `signoff=on/off` from text status instead of on whether the target is in `availableTransitions`. This duplicates Core's routing decision ("Core alone owns availableTransitions and nextAction routing decisions"). The behaviour is equivalent today, but it is the kind of local rule the spec forbids. It also uses `--format text` for a routing decision, while the routing section requires toon.
- **LOW — verify's fixed hop list for "explicitly invoked" is vague.** verify tpl:46-47 maps to "`verifying` or the current verify-owned completion hop". That is underspecified when `verifying` is disabled; it presumably means `done`.

### Test Coverage

- generated-skill-protocol.spec.ts:
  - `keeps schema-aware routing and bypassed-hook suppression in every lifecycle skill copy` (:104): checks that three phrases appear in the templates and in the five installed copies.
  - `all installed copies mandate preferred default recommendation and explicit target validation` (:117): phrase presence.
  - Seven `simulates …` tests (:198-290).
- template-workflow.spec.ts:
  - `routes through advertised schema steps without hooks for disabled or optional intermediates` (:340) and `treats nextAction as preferred default while permitting advertised explicit targets` (:349): phrase presence.
  - `gives verify and compliance explicit attempt ownership` (:257), `routes delegated compliance through every change-scoped downstream decision` (:283; includes the invalid-delegation ordering for "Delegated mode requires an explicit attempt"), `routes design and implement recovery…` (:309).
- I confirmed that all five installed copies (.claude, .agents, .codex, .github, .opencode) contain the new "Schema-aware lifecycle routing" section.

### Missing / Weak Tests

- **Tautological simulation tests (HIGH weakness).** The seven `simulates …` tests in generated-skill-protocol.spec.ts:198-290 exercise `evaluateSkillProtocol`, a function defined inside the test (:144-196). It never reads a template or a generated skill, so these tests would pass with any template content and verify no product behaviour. Specific problems:
  - It models `selectedHooks` as `${target}.pre` only, with no source `.post`. That contradicts the spec's "hooks only for actual source and target".
  - It hard-codes `specd-archive → archiving`.
  - The "disabled verifying" case sets `nextAction.command: '/specd-verify'` with `targetStep: 'done'` and does not compare against the verify template, which would have selected `verifying.pre`.

  These tests do not cover "Generated lifecycle guides preserve semantic routing invariants", "Disabled verifying selects only the actual target hooks", "Optional implementing bypass follows status routing" or "Skill does not invent optional-step policy".

- **No validator test for "Fixed canonical recipes cannot override structured routing".** Nothing fails on an unconditional recipe. A real test would scan operational code blocks for `changes transition <name> <state>` and `run-hooks <name> <state>` and require each to be guarded by routing.
- "Dynamic topology consumption by agent skills": phrase checks only.
- "Changed inputs require repeated work": a single phrase check (`repeat all required verification work`). Adequate for prose.
- "Independent verify owns its attempt": phrase checks; there is no ordering assertion (start before scenario checks, complete after hooks). The `indexOf` ordering style used at template-workflow.spec.ts:335 could be applied here.

### Spec Dependency Chain

- Contradicts its dependency cli:change-transition: the skills use explicit literal targets with `--skip-hooks all` plus `run-hooks` for a fixed step. This is consistent in mechanism but defeats topology-driven targets.
- Consistent with cli:change-status: skills read `lifecycle.availableTransitions` in toon, and that field exists in status.ts:503.
- Partly inconsistent with core:get-status: the templates ignore `nextAction.targetStep`, which Core provides.
- The prose also breaks the spec's own Diagnostic Priority split: implement, design and verify make gate decisions from the `--format text` `approvals:` line (verify tpl:366, design tpl:426), while the routing section requires toon. This is a minor internal inconsistency.

### Summary

Requirements: 13 total, 10 implemented, 2 partial (dynamic consumption, no invented policy), 1 not implemented (recipe validation; `targetStep` consumption counted with it). For the modified Cross-skill requirement, 9 scenarios are implemented, 2 are contradicted by the templates and 1 is unenforced. Discrepancies: 2 HIGH, 3 MEDIUM, 1 LOW. Missing/weak tests: 5, including the tautological simulation suite.

---

## Overall counts (batch C)

| Spec                       | HIGH | MEDIUM | LOW | Missing/weak tests |
| -------------------------- | ---- | ------ | --- | ------------------ |
| cli:change-status          | 0    | 1      | 3   | 2                  |
| cli:change-transition      | 0    | 2      | 2   | 4                  |
| skills:workflow-automation | 2    | 3      | 1   | 5                  |

# Partial D (sovereign schema, batch 1): spec compliance audit

Change: `schema-workflow-skippable-states`
Specs: `core:resolve-change-schema`, `core:change`, `core:change-manifest`, `core:get-status`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`
Mode: read-only audit. Merged specs read via `changes spec-preview`. Focus: requirements this change touched (the sovereign-schema and skippable/disabled-step deltas). Unchanged requirements got a lighter check.
Test run: the 8 relevant core test files (resolve-change-schema, get-status, validate-artifacts, run-step-hooks, preview-spec, start-verification, validity-fingerprint-service, reconcile-change-validity) pass: **190/190**.

---

## Cross-cutting findings (summary)

| #   | Sev    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                        |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | HIGH   | `ReconcileChangeValidity` skips the shared resolver. It calls `schemaProvider.get(change.schemaName)` directly, so there is no identity check and no version advisory. It is a mutating, persisting consumer (task-artifact set, DAG expansion, persisted consequences).                                                                                                                                                                                                                                                                                                                                                                                | `packages/core/src/application/use-cases/reconcile-change-validity.ts:203`; deps only hold `schemaProvider` (`:70`); composition `composition-resolver.ts:~703` passes no `resolveChangeSchema` |
| X2  | HIGH   | `verificationRequired(change)` checks lifecycle state only and ignores the schema loaded at line 203. When `verifying` is disabled (`WorkflowTopology.isStepEnabled('verifying', schema) === false`), a change in `done` or `archivable` still gets `verificationRequired=true`. Result: verdict `verification: 'absent'`, then a `VERIFICATION_REQUIRED` validity blocker (`change-validity.ts:541-543`), and `verification.current` fails at archive (`check-bindings.ts:146-150`, `allowDisable:false`; `domain/checks/verification-current.ts:42-50`). A schema with verifying disabled can therefore never archive without a verification attempt. | `reconcile-change-validity.ts:218,277-286`; `workflow-topology.ts:84-99`                                                                                                                        |
| X3  | HIGH   | When the repository loads or saves a change, it syncs the change's artifact map against the **workspace-default** schema. `resolveArtifactTypes` resolves `config.schemaRef`, not `change.schemaName`. `syncArtifacts` then adds and removes artifact types and the result is persisted (`hasChangesToPersist`). A change with a custom schema gets its artifact map rewritten from the default schema.                                                                                                                                                                                                                                                 | `composition-resolver.ts:439-442`; `infrastructure/fs/change-repository.ts:665-668` (save), `1337-1383` (filename normalization), `1480-1517` (sync and persist)                                |
| X4  | MEDIUM | The repository still compares the manifest version with the workspace default and warns. `core:change-manifest` now says loading MUST NOT do this. A test enforces the forbidden behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `change-repository.ts:1343-1352`; test `change-repository.spec.ts:2687` "logs a warning when schema version differs from active schema"                                                         |
| X5  | MEDIUM | `ResolveChangeSchema` does not follow its own result contract. It returns a bare `Schema` and sends the advisory to `Logger.warn`; the spec requires `{ schema, warnings }` with typed advisory records.                                                                                                                                                                                                                                                                                                                                                                                                                                                | `application/services/resolve-change-schema.ts:35-58`                                                                                                                                           |
| X6  | MEDIUM | CLI `changes status` draws the artifact DAG from `getActiveSchema` (the workspace default) and prefers it over `lifecycle.schemaInfo`. Same pattern in `validate.ts:221,308,489`, `spec-preview.ts:74`, `artifacts.ts:56`.                                                                                                                                                                                                                                                                                                                                                                                                                              | `packages/cli/src/commands/change/status.ts:59-78,237,401`                                                                                                                                      |

---

## 1. core:resolve-change-schema (new spec)

### Requirements Summary

Input and result contract (`{schema, warnings}`); sovereign named lookup; provider identity integrity (`SchemaProviderIdentityMismatchError`); same-name version advisory; failure propagation and caller policy; shared change-operation boundary; composition (config factory through the canonical resolver).

### Implementation Status

| Requirement                         | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input and result contract           | **Partial**                 | Input matches (it also takes `changeName`). The return value is `Promise<Schema>`, not `{schema, warnings}`, and there are no typed advisory records (`resolve-change-schema.ts:35`).                                                                                                                                                                                                          |
| Sovereign named lookup              | Implemented                 | `:36` `schemaProvider.get(input.schemaName)`, with no retry or fallback                                                                                                                                                                                                                                                                                                                        |
| Provider identity integrity         | Implemented                 | `:38-44`. The error carries `changeName`, `expectedSchemaName` and `actualSchemaName`, with code `SCHEMA_PROVIDER_IDENTITY_MISMATCH` (`errors/schema-provider-identity-mismatch-error.ts`). It is exported from `errors/index.ts:35` and `public.ts:457`.                                                                                                                                      |
| Same-name version advisory          | **Partial**                 | It compares against the named result, not the default (good). The advisory is a log side effect (`Logger.warn`, `:46-56`), so callers cannot surface it, and `GetStatus` cannot project it.                                                                                                                                                                                                    |
| Failure propagation / caller policy | Implemented in the resolver | Errors propagate unchanged. Caller compliance varies (see X1 and §4).                                                                                                                                                                                                                                                                                                                          |
| Shared change-operation boundary    | **Partial**                 | Most core use cases inject it (see the list from the `rg ResolveChangeSchema` sweep). `ReconcileChangeValidity` does not (X1). Repository hydration uses the default schema (X3). The CLI uses `getActiveSchema` (X6). Every consumer also keeps a `?? new ResolveChangeSchema(schemaProvider)` fallback, which is the same policy but not "the same canonical composition boundary" instance. |
| Composition                         | **Partial / divergent**     | There is no `createResolveChangeSchema(config)` or `createResolveChangeSchema(deps)` factory, and no `composition/use-cases/resolve-change-schema.ts`. Only the lazy singleton `resolver.getResolveChangeSchema()` exists (`composition-resolver.ts:564-568`). The class lives in `application/services/`, not `use-cases/`.                                                                   |

### Discrepancies

- **MEDIUM – result contract (X5).** Either (a) the code is wrong: it should return `{ schema, warnings: SchemaVersionAdvisory[] }` and let callers decide how to surface the advisory; or (b) the spec over-specifies: if log-only advisories are intended, the spec and core:change ("emit a warning") should say "log", and the typed `warnings` requirement should be removed.
- **MEDIUM – composition requirement.** Either (a) add the config and deps factories required by the canonical factory pattern in `_global/architecture`; or (b) amend the spec to say the shared resolver getter is the only composition entry, because this is a service rather than a use case.
- **LOW – the default-constructed fallback in every consumer.** `deps.resolveChangeSchema ?? new ResolveChangeSchema(schemaProvider)` gives the same behavior, but the spec says "obtain it through ResolveChangeSchema or an equivalent dependency resolved from the same canonical composition boundary". Either make the dependency required, or accept the fallback as "equivalent".

### Test Coverage

`packages/core/test/application/services/resolve-change-schema.spec.ts`:

- "resolves the sovereign schema when name and version match exactly" covers the matching scenario
- "isolates resolution from the workspace default schema" covers "different workspace default never consulted"
- "propagates provider lookup errors when the schema does not exist" covers named lookup failure with no fallback
- "throws SchemaProviderIdentityMismatchError if the provider returns a different schema name" covers identity mismatch
- "returns schema and emits advisory warning for same-name version drift" covers the advisory (via the Logger spy)

### Missing Tests

- "Workspace default version does not create advisory" (`custom@1` recorded and resolved, default `custom@9`) has no direct test. The isolation test uses different names.
- "Identity mismatch is checked before use" for a mutating caller: no caller-level test proves that nothing runs or persists (see §5–§7).
- "Change-bound consumers use the shared resolver" at composition level: there is no test that every change-bound factory receives `getResolveChangeSchema()`. Such a test would have caught X1.
- Composition factory: none exists, so there is nothing to test.

### Spec Dependency Chain

- `core:change` "Schema version" says "emit a warning". This is consistent with a log, but the result contract in this spec asks for typed warnings. The two dependent specs disagree on the advisory representation.
- `_global/error-handling-conventions`: the error extends `SpecdError` with a stable code, which is consistent.

### Summary counts

7 requirements: 3 implemented, 4 partial/divergent. Discrepancies: 0 HIGH, 2 MEDIUM, 1 LOW (plus cross-cutting X1, X3, X6 for boundary coverage).

---

## 2. core:change

### Requirements Summary (changed by this delta)

- New: "StartVerification sovereign schema resolution"
- Modified: "Schema version" (sovereign resolution, identity mismatch is fatal, same-name version is advisory)
- New: "Sovereign schema for validity fingerprints"
- Relevant pre-existing: "Implementation and verification loop" and "Signoff gate" (verification evidence required at done→archivable), "Artifact sync" (`syncArtifacts` against the "current schema").

### Implementation Status

| Requirement                                                                 | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StartVerification sovereign schema resolution                               | Implemented, with an ordering caveat | `start-verification.ts:122-126` resolves through the shared resolver before building the check context. Composition passes `getResolveChangeSchema()` (`verification-factories.ts:125`). **Caveat:** `execute` runs `refreshImplementationTracking` and `reconcileChangeValidity.execute` (which can persist) **before** the resolver runs (`:80-82`), and the reconciler does its own unchecked lookup (X1). So with an identity mismatch, reconciliation consequences may already have been persisted from the untrusted schema before the error is thrown. No attempt is created (OK). |
| Schema version                                                              | **Partial**                          | Entity props exist (`domain/entities/change.ts:435-469,545-551`). Use-case consumers resolve by name. Violations: X1 (reconciler skips the identity check), X3 (repository syncs artifacts from the default schema, which effectively replaces the recorded artifact model), X4 (default-version warning on load).                                                                                                                                                                                                                                                                        |
| Sovereign schema for validity fingerprints                                  | Implemented                          | `validity-fingerprint-service.ts:52-53,120-124` uses the resolver, and composition passes the shared instance (`composition-resolver.ts:694`). Failure propagates.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Implementation and verification loop / Signoff gate vs disabled `verifying` | **Divergent (X2)**                   | Verification is "required" purely by state (`reconcile-change-validity.ts:277-286`), so schemas with verifying disabled are blocked at done→archivable and at archive.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Artifact sync against "current schema"                                      | **Divergent (X3)**                   | `syncArtifacts` receives the workspace-default artifact types on every load and save.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Discrepancies

- **HIGH – X2, disabled verifying vs state-only `verificationRequired`.** Either (a) the code is wrong: `verificationRequired` should take the schema (already loaded at `:203`) and return false when `!WorkflowTopology.isStepEnabled('verifying', schema)`, with `verification.current` at archive and `approval.signoff` (which also emits `VERIFICATION_REQUIRED`, `domain/checks/approval-signoff.ts:59`) following suit; or (b) the spec intends verification evidence to be mandatory even when the step is disabled. In that case core:change "Signoff gate", core:workflow-model and the change's design must say how evidence is produced without a verifying step (StartVerification is state-independent, so it is possible but unguided), and `GetStatus` must surface that guidance. Option (a) is far more plausible given the "disabled workflow steps" theme.
- **HIGH – X1, the reconciler skips the shared boundary.** Either (a) inject `ResolveChangeSchema` into `ReconcileChangeValidityDeps` and use it at `:203`; or (b) the spec should exempt the reconciler because callers resolve first. Option (b) is not tenable: `ApproveSpec`, `TransitionChange`, `StartVerification` and `EditChange` all call the reconciler, and `StartVerification` calls it **before** its own resolution.
- **HIGH – X3, repository artifact sync uses the workspace default.** Either (a) `resolveArtifactTypes` should be keyed by the change's recorded schema, through the shared resolver or a per-name registry lookup; or (b) the spec should state that repository hydration intentionally uses the default schema. That would contradict core:change "Schema version" ("MUST NOT replace the recorded schema identity", "MUST NOT cause fallback") and core:change-manifest ("not repository hydration").
- **MEDIUM – StartVerification ordering.** Resolution happens after refresh and reconcile. Either move resolution first, so that "Mutating use cases MUST stop before … persistence when resolution fails" holds, or fix X1, which makes the ordering moot.

### Test Coverage

- `start-verification.spec.ts`: "builds readiness from the change sovereign schema"; "does not create an attempt when sovereign schema resolution fails".
- `validity-fingerprint-service.spec.ts`: "uses the change sovereign schema for every artifact-bearing fingerprint API"; "propagates sovereign schema failures without returning fallback evidence".
- `change-repository.spec.ts:2667`: "hydrates change when schema name differs from active schema without error".

### Missing Tests

- Reconciler: no test with a disabled `verifying` step at `done` or `archivable`, and no test with a provider returning the wrong identity (`reconcile-change-validity.spec.ts` has no schema-identity or disabled-step tests).
- No test that a custom-schema change keeps its artifact map through `FsChangeRepository.get`/`save` when the default schema differs (X3).
- No archive test where a custom schema disables `verifying` and archive succeeds without verification evidence.
- No test for StartVerification with an identity mismatch (only a generic `Error` rejection). The StartVerification sovereign test also checks only `get` was called with the name; it does not show that the check context comes "exclusively from the custom schema" against a differing default.
- "Schema version mismatch does not block archive": no archive-level test found in this batch.

### Spec Dependency Chain

- `core:workflow-model` and `core:workflow-topology` (disabled steps) vs core:change "Signoff gate" ("plus valid verification evidence"): the spec chain does not say what happens to verification evidence when verifying is disabled. This is a spec gap that compounds X2.
- `default:_global/architecture` (domain owns invariants, application owns I/O): consistent.

### Summary counts

Changed and relevant requirements audited: 5. Implemented: 2. Partial/divergent: 3. Discrepancies: 3 HIGH, 1 MEDIUM.

---

## 3. core:change-manifest

### Requirements Summary (changed)

"Schema version": the root `schema` is the sovereign source. Loading MUST NOT compare the version with the workspace default. A name difference MUST NOT reject the load. Lookup, identity and advisories belong to the resolver, not to hydration.

### Implementation Status

| Requirement                                     | Status            | Evidence                                                                                                                     |
| ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Root schema hydrates the entity                 | Implemented       | `manifest-change-loader.ts:91-92,276-277`; `change-repository.ts:1450-1451`                                                  |
| Name differs → no rejection                     | Implemented       | No name comparison on load; test `change-repository.spec.ts:2667`                                                            |
| MUST NOT compare version with workspace default | **Violated (X4)** | `change-repository.ts:1343-1352` warns when `manifest.schema.name === activeSchema.name && version !== activeSchema.version` |
| Hydration does not own schema behavior          | **Violated (X3)** | Default-schema artifact types drive filename normalization and `syncArtifacts` during hydration (`:1337-1383,1480-1517`)     |

### Discrepancies

- **MEDIUM – X4.** Either remove the repository warning and its test, or keep it and reword the spec. Note that the spec's own **verify.md is internally inconsistent**: scenario "Schema version bumped" ("WHEN a change is loaded and the active schema has a higher version … THEN specd emits a warning") still describes load-time comparison with the active (default) schema, and "Schema unchanged" talks about the "active schema". These scenarios contradict the modified spec.md text and support the stale code. One side must be fixed. The likely fix is to rewrite those verify scenarios in terms of `ResolveChangeSchema`'s named lookup.
- **HIGH – X3** (see §2).
- **LOW – "Archiving with schema version mismatch remains allowed"** says "the mismatch warning is surfaced". Today it is only surfaced as a log line (X5), and nothing reaches CLI output.

### Test Coverage

- `change-repository.spec.ts:2667` "hydrates change when schema name differs from active schema without error" covers the name-differs scenario.
- `change-repository.spec.ts:2687` "logs a warning when schema version differs from active schema" **tests behavior the spec now forbids**.

### Missing Tests

- No test that loading does **not** consult the workspace default version.
- No test that artifact sync during hydration keeps the custom schema's artifact types.

### Spec Dependency Chain

- Contradicts core:resolve-change-schema "Same-name version advisory" (the advisory MUST come from the named lookup, not the default), through X4.

### Summary counts

4 sub-rules: 2 implemented, 2 violated. Discrepancies: 1 HIGH (X3, shared), 1 MEDIUM, 1 LOW; also a spec-internal contradiction in verify.md.

---

## 4. core:get-status

### Requirements Summary (changed)

- Modified: "Graceful degradation when schema resolution fails" (resolve through `ResolveChangeSchema`; degraded lifecycle shape; `SCHEMA_RESOLUTION_FAILED` vs `SCHEMA_IDENTITY_MISMATCH` with structured requested and returned names; never throw; read-only; no projection from an untrusted schema; applies to drafts via the view fields).
- New: "Shared transition candidate evaluation" (bypassed steps, step-skip predicates, projection only).
- Relevant: "Operational status reconciliation", "Revision evaluation for conditional status queries", "Identifies blockers", "Approval, verification … projection".

### Implementation Status

| Requirement                                                 | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve through ResolveChangeSchema (active)                | Implemented               | `get-status.ts:465-479`. Composition passes the shared resolver (`composition/use-cases/get-status.ts:54,131`).                                                                                                                                                                                                                                                      |
| Degraded lifecycle shape                                    | Implemented (active)      | `get-status.ts:528-594`: empty `validTransitions`/`availableTransitions`, empty `lifecycle.blockers`, approvals populated, `nextArtifact=null`, `changePath` populated, `schemaInfo=null`                                                                                                                                                                            |
| `SCHEMA_RESOLUTION_FAILED` vs `SCHEMA_IDENTITY_MISMATCH`    | **Partial**               | Codes are distinct (`:529-537`). The identity blocker has only a `message`, **no structured details** with requested and returned names, as the spec requires. `SCHEMA_RESOLUTION_FAILED` has no recovery `command` (verify says "with recovery guidance"; only reason text).                                                                                        |
| Never throw / read-only on failure; no refresh or reconcile | Implemented (active)      | The early return skips `_reconcile.execute` (`:472-479`); refresh runs inside reconcile.                                                                                                                                                                                                                                                                             |
| Degradation for drafts                                      | **Violated**              | `_buildDraftedResult` catches **only** `SchemaNotFoundError` (`:805-810`). `SchemaProviderIdentityMismatchError` and every other failure are re-thrown, so `GetStatus` throws for drafts. On failure the draft path still populates `schemaInfo` with name and version (`:852-856`) instead of `null`, and emits **no** `SCHEMA_RESOLUTION_FAILED` blocker (`:879`). |
| Shared transition candidate evaluation                      | Implemented               | `executeChecksByLegalTargets` calls `evaluateTransitionCandidate` for each `WorkflowTopology.legalTransitions` target (`execute-matching-predicates.ts:336-372`). Status runs no effects (`get-status.ts:606-631`).                                                                                                                                                  |
| Operational status reconciliation                           | Implemented, with caveat  | Resolves first, then reconciles. The reconciler then looks up the schema a second time without validation (X1). That is harmless here because GetStatus validated it first, but it is redundant.                                                                                                                                                                     |
| Revision evaluation (`ifModifiedSince`)                     | **Not implemented** (MAY) | `input.ifModifiedSince` is never read. `_buildUnchangedResult` (`:741-781`) is dead code. The spec says MAY, so this is not a violation, but the input contract says the field "is used for conditional status short-circuit".                                                                                                                                       |
| Verification projection when verifying disabled             | **Divergent (X2)**        | A change in `done` with verifying disabled gets a `VERIFICATION_REQUIRED` validity blocker and guidance toward verification.                                                                                                                                                                                                                                         |

### Discrepancies

- **HIGH – X2 surfaces here.** Status reports `VERIFICATION_REQUIRED` at `done`/`archivable` for schemas with verifying disabled. Both possibilities as in §2.
- **MEDIUM – drafted degradation.** Either (a) the code is wrong: apply the same failure policy to drafts (map both failure kinds to blockers, `schemaInfo=null`, never throw); or (b) the spec should restrict degradation to active changes and drop "(or the corresponding read-only view fields for drafts)".
- **MEDIUM – no structured details on `SCHEMA_IDENTITY_MISMATCH`.** Either add `details: { requested, returned }` (the `Blocker` type supports `details` elsewhere, e.g. validity blockers) or relax the spec to "message identifies".
- **LOW – `SCHEMA_RESOLUTION_FAILED` "recovery guidance"** is only prose, with no `command`. Either add a command such as `specd schemas show` or a config hint, or clarify that prose is enough.
- **LOW – `ifModifiedSince` is accepted but ignored.** Either implement it after reconciliation, or document it as reserved or remove it from the input.
- **LOW – the constructor duck-types `SchemaProvider | ResolveChangeSchema`** (`:410-431`). This is not a spec violation, but it is fragile: any provider object with an `execute` method would be taken for a resolver.

### Test Coverage (`packages/core/test/application/use-cases/get-status.spec.ts`)

- "projects workflow from the recorded sovereign schema instead of the workspace default" (`:119`)
- "returns artifacts with missing status when schema provider fails" (`:320`)
- "degrades before refresh or real reconciliation for any schema resolution failure" (`:338`). This one is strong: it uses a real `ReconcileChangeValidity` and asserts that `mutate` is not called.
- "emits SCHEMA_IDENTITY_MISMATCH and fail-closed empty transitions …" (`:383`)
- "populates complete checksByTarget and includes shortcut target …" (`:422`), "… with failing skip check and excludes shortcut" (`:446`), "permits shortcut when step-skip check set is empty" (`:493`)
- "projects read-only views with empty transitions for drafted changes" (`:997`), "does not reconcile drafted changes" (`:1455`)
- ifModifiedSince tests (`:1096-1170`) assert that **no** short-circuit happens.

### Weak or Missing Tests

- **The identity-mismatch test is weak.** The fake provider _throws_ `SchemaProviderIdentityMismatchError` itself (`:386-393`), so the test never exercises the resolver's comparison inside GetStatus. A provider that _returns_ a wrongly named schema is the real scenario.
- **Verification validity is faked.** Most tests use `makeObservingReconcile` (`test/application/use-cases/helpers.ts:1287-1305`), which maps absent verification to `'not-required'` regardless of state. That hides X2 completely: no GetStatus test shows `done`/`archivable` behavior with verifying disabled against the real reconciler.
- The sovereign test only asserts that `availableSteps` excludes `verifying` from `designing`. There is no check of artifact projection from the custom schema, and no check that the default schema is never requested (the mock `get` serves both names).
- No test for drafted changes with an identity mismatch or a non-NotFound failure (they throw today).
- No test asserting structured details on `SCHEMA_IDENTITY_MISMATCH`.
- "Status evaluation has no transition effects": no explicit assertion that hooks or mutation do not run during candidate evaluation.
- The "Passing bypass predicates" test (`:422`) asserts that `checksByTarget['verifying']` contains `protocol.edge` and `workflow.tasksEmpty`, but does not assert the step-skip predicate set explicitly.

### Spec Dependency Chain

- `core:resolve-change-schema` "Status may degrade identity mismatch distinctly" is consistent for active changes and inconsistent for drafts.
- `core:transition-checks` / `core:transition-change`: the shared evaluator is used by both, which is consistent.
- CLI `change-status` (dependent): the CLI renders the DAG from the workspace default (X6), so the core result is correct but the presentation contradicts sovereign status.

### Summary counts

9 requirements audited in depth: 5 implemented, 3 partial/violated, 1 not implemented (MAY). Discrepancies: 1 HIGH (X2), 2 MEDIUM, 3 LOW.

---

## 5. core:validate-artifacts

### Requirements Summary (changed)

"Sovereign schema resolution" (the merged heading is still **"Schema name guard"**): obtain the schema through `ResolveChangeSchema`; the default is irrelevant; failures and identity mismatch propagate before artifact state changes.

### Implementation Status

| Requirement                     | Status      | Evidence                                                                                                                                                                               |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sovereign schema resolution     | Implemented | `validate-artifacts.ts:178-185` resolves right after load, before any state change. Composition passes the shared resolver (`composition/use-cases/validate-artifacts.ts:53,121,133`). |
| Propagation before state change | Implemented | No try/catch around resolution                                                                                                                                                         |

### Discrepancies

- **LOW – spec artifact.** The delta used `op: modified` with a new heading inside `content`, so the merged spec keeps the heading `Requirement: Schema name guard` while the body describes sovereign resolution. Either use a rename operation or accept the stale heading.
- **LOW – spec verify inconsistency.** The scenario expects `SchemaProvider.get('custom-workflow@1.0.0')` (name@version). The resolver calls `get(schemaName)` with the bare recorded name. Fix the scenario text.
- **LOW – "Ports and constructor"** still lists 8 deps and does not mention the optional `resolveChangeSchema` (or the other deps the class now takes). The `_schemaProvider` field is stored but only read in the constructor (1 reference).

### Test Coverage

- `validate-artifacts.spec.ts:160` "resolves sovereign schema by change.schemaName"
- `:140` "throws SchemaNotFoundError when schema cannot be resolved"

### Missing Tests

- No identity-mismatch test (a provider returning the wrong name), and no assertion that artifact state and persistence are untouched on failure.
- No differing-default scenario: the mock returns the same schema for any argument.

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## 6. core:run-step-hooks

### Requirements Summary (changed)

"Sovereign schema resolution" (heading still "Schema name guard"): resolve through `ResolveChangeSchema`; failures propagate before any hook runs.

### Implementation Status

| Requirement                                       | Status      | Evidence                                                           |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Sovereign resolution (active)                     | Implemented | `run-step-hooks.ts:166-170`, before any hook runs                  |
| Sovereign resolution (archived post-archive path) | Implemented | `:119-123` uses the archived record's `schemaName`/`schemaVersion` |
| Composition                                       | Implemented | `composition/use-cases/run-step-hooks.ts:47,107`                   |

### Discrepancies

- **LOW – stale heading** (same delta artifact as §5).
- **LOW – "Ports and constructor"** code block shows a 5-argument constructor without the resolver.
- **LOW – ordering.** Resolution happens before `StepNotValidError` validation. The spec does not fix the order, but an invalid step on a broken schema reports the schema error first.

### Test Coverage

- `run-step-hooks.spec.ts:90` "resolves schema by change.schemaName"; `:78` "throws SchemaNotFoundError when schema cannot be resolved"

### Missing Tests

- No identity mismatch test, and no assertion that no hook runs (`HookRunner.run` not called) when resolution fails.
- No sovereign test for the archived post-archive path.
- No test for the scenario "hooks defined in `custom-workflow` are resolved and executed" (the existing test only checks that `get` was called and success).

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## 7. core:preview-spec

### Requirements Summary (changed)

"Sovereign schema resolution" (heading still "Schema name guard"): resolve through `ResolveChangeSchema`; identity mismatch propagates as `SchemaProviderIdentityMismatchError`.

### Implementation Status

| Requirement          | Status      | Evidence                                                                 |
| -------------------- | ----------- | ------------------------------------------------------------------------ |
| Sovereign resolution | Implemented | `preview-spec.ts:105-112`, with no try/catch, so the mismatch propagates |
| Composition          | Implemented | `composition/use-cases/preview-spec.ts:40,96`                            |

### Discrepancies

- **LOW – intra-spec tension.** "Error handling" says "The preview MUST always succeed — partial results are acceptable, total failure is not", while "Schema name guard" requires identity mismatch to propagate (a total failure). The scope is reasonably per-file merge and diff errors, but the absolute wording conflicts. Either qualify "always succeed" as applying to per-file failures, or degrade schema errors into warnings. The code matches the propagation reading.
- **LOW – stale heading; "Ports and constructor"** omits the resolver.
- **LOW – CLI `spec-preview --artifact`** resolves the artifact type from `getActiveSchema` (`packages/cli/src/commands/change/spec-preview.ts:74`), not from the change's schema (X6).

### Test Coverage

- `preview-spec.spec.ts:140` "resolves schema by change.schemaName"

### Missing Tests

- No identity mismatch propagation test.
- No `SchemaNotFoundError` propagation test.
- No differing-default scenario (the mock returns the same schema for any name).

### Summary counts

1 changed requirement: implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## Consumers that skip the shared resolver or use the workspace default

| Consumer                                                                                                                                                                                                                          | Kind                      | Issue                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ReconcileChangeValidity._apply` (`reconcile-change-validity.ts:203`)                                                                                                                                                             | change-bound, mutating    | Named lookup without an identity check or advisory (X1)                                                                             |
| `FsChangeRepository` hydrate/save (`composition-resolver.ts:439-442`; `change-repository.ts:665,1337,1480`)                                                                                                                       | change-bound, persisting  | Workspace-default artifact types drive `syncArtifacts` and filename normalization (X3); default-version warning (X4)                |
| CLI `changes status` (`cli/.../status.ts:237,401`)                                                                                                                                                                                | change-bound presentation | DAG from `getActiveSchema` overrides `schemaInfo` (X6)                                                                              |
| CLI `changes validate` (`validate.ts:221,308,489`), `spec-preview` (`:74`), `artifacts` (`:56`)                                                                                                                                   | change-bound presentation | Artifact lookup from the workspace default (X6, not deep-audited here)                                                              |
| `schemaProvider.get()` with no argument: `resolve-initial-persisted-depends-on.ts:59`, `validate-specs.ts:124`, `get-spec-outline.ts:65`, `generate-spec-metadata.ts:94`, `get-project-context.ts:143`, `get-spec-context.ts:391` | spec/project-scoped       | Not change-bound, so acceptable, except check whether `resolve-initial-persisted-depends-on` is ever called with a change in scope. |

## Totals (this batch)

- HIGH: 3 (X1 reconciler bypass, X2 disabled-verifying `verificationRequired`, X3 repository default-schema artifact sync)
- MEDIUM: 6 (X4 repository default-version warning plus change-manifest verify contradiction, X5 resolver result contract, resolver composition factory missing, GetStatus drafted degradation, GetStatus identity details missing, StartVerification ordering; X6 CLI default-schema DAG, cross-batch)
- LOW: ~14 (stale "Schema name guard" headings ×3, Ports sections ×3, validate-artifacts `name@version` scenario, preview "always succeed" tension, ifModifiedSince ignored, recovery-guidance prose only, duck-typed ctor, default-constructed resolver fallbacks, run-step-hooks ordering, change-manifest warning "surfaced")
- Weak tests to flag: GetStatus identity test (the provider throws the error itself); `makeObservingReconcile` fakes absent verification as `not-required`, which hides X2; sovereign tests use mocks that answer any name; no caller-level identity-mismatch tests for validate-artifacts, run-step-hooks or preview-spec; `change-repository.spec.ts:2687` asserts forbidden behavior.

# Partial E: Sovereign Schema Consumers (batch 2)

Change: `schema-workflow-skippable-states`.
Specs in this batch: core:archive-change, core:approve-spec, core:approve-signoff, core:compile-context, core:get-artifact-instruction, core:get-hook-instructions, core:edit-change, core:invalidate-change, core:count-tasks.

Method: merged specs read with `changes spec-preview`, change deltas read under `deltas/core/<spec>/`, and code and tests read directly. Nothing was modified. The audit focuses on the requirements this change touched: sovereign resolution, gates set at construction, and the effects of optional or disabled steps. Requirements this change did not touch were only spot-checked.

---

## Cross-cutting findings (apply to several specs in the batch)

### X1 [HIGH] With `verifying` disabled, archive is blocked, and so is signoff when its gate is on (confirmed)

- `packages/core/src/application/use-cases/reconcile-change-validity.ts:277-286`: `verificationRequired(change)` looks only at the state (`verifying | done | archivable | archiving | pending-signoff | signed-off`). It ignores the schema. Line 203 already has the sovereign schema, but `WorkflowTopology.isStepEnabled('verifying', schema)` is never called.
- `packages/core/src/domain/services/change-validity.ts:478-487`: with `verificationRequired=true` and no completed verification, the verdict is `'absent'`. Lines 541-543 then add a `VERIFICATION_REQUIRED` blocker.
- Archive: `ARCHIVE_BINDING_SPECS` (`packages/core/src/domain/services/check-bindings.ts:126-170`) binds `verification.current` to `scope: 'archive'` with `skippable:false, allowDisable:false`. `domain/checks/verification-current.ts:43-49` fails with `VERIFICATION_REQUIRED`. `archive-change.ts:1556-1560` maps that to `ArchiveImplementationStateError`. `postHookValidityBlocksArchive` (`archive-change.ts:1422-1428`) would block too.
- Signoff: `domain/checks/approval-signoff.ts:56-62` fails with `VERIFICATION_REQUIRED` on the `done -> archivable` edge when the signoff gate is on. `ApproveSignoff.execute` (`approve-signoff.ts:113-121`) throws `VerificationNotFoundError` whenever `verification.completed` is undefined, whatever the schema says.
- In contrast, `lifecycle-verdict.ts:948-950` (`verificationBoundary`) does check the schema and tells the user to go to `/specd-archive`. The guidance points to archive, but archive then fails. `verifying` is not a bedrock state (`workflow-topology.ts:23-29`), and schema validation only protects `ready` against the approval gate (`workflow-topology.ts:267-272`), so this configuration is accepted.
- Two readings:
  - (a) Code bug. `verificationRequired` should become `verificationRequired(change, schema)` and return false when `verifying` is disabled, the same rule `verificationBoundary` uses.
  - (b) Spec gap. archive-change "Canonical validity archive preflight" (lines 92-100) says archive SHALL fail when "verification is absent", with no exception for a disabled verifying step. approve-signoff "Signoff recording" requires "valid verification evidence". If disabling `verifying` is meant to drop verification evidence, both specs need that exception added.
- Tests: none. `transition-change.spec.ts:3661` ("resolves sovereign schema by change.schemaName") stops at `done` with a mocked reconcile. No test covers archive, or signoff with the gate on, after a `verifying`-disabled path.

### X2 [MEDIUM] Archive metadata materialization still uses the workspace default schema

- After the commit, archive calls `this._materializeMetadata.execute({ specId, policy: 'force' })` (`archive-change.ts:605`). That goes `MaterializeSpecMetadata` -> `GenerateSpecMetadata.execute`, which runs `this._schemaProvider.get()` with no name (`generate-spec-metadata.ts:94`). That is the workspace default.
- archive-change "Schema name guard" (the merged text the delta calls "Sovereign schema resolution", line 72) says: "The change's recorded schema is the sovereign authority governing its artifact types, **metadata materialization**, and archive hooks. A different workspace default MUST remain irrelevant."
- The pre-publication metadata-consistency pass and the spec-lock `schema` do use the sovereign schema (`archive-change.ts:938, 952-954`; `resolve-sealed-archive-depends-on.ts:62-69` wraps the resolved schema in a one-shot provider). Only the post-commit materialization falls back.
- Two readings:
  - (a) Code bug. The change's schema should reach `GenerateSpecMetadata` during archive.
  - (b) Spec overreach. Persisted spec metadata is spec-scoped and should follow the workspace or spec-lock schema. If so, the archive spec should not list "metadata materialization" as change-sovereign.
- Failures are swallowed (`catch { failedMetadataSpecPaths.push }`), so a mismatch shows up only as stale or wrong metadata.
- `CompileContext` (through `GetSpecMetadata`) has the same transitive path. Its spec, though, limits sovereignty to "instructions and artifact templates", so for compile-context this is LOW.

### X3 [MEDIUM] `ResolveChangeSchema` result contract does not match its spec (depth-1 dependency of all 9 specs)

- `packages/core/src/application/services/resolve-change-schema.ts:35-60` returns a bare `Schema` and reports a same-name version drift through `Logger.warn`.
- core:resolve-change-schema "Input and result contract" requires `{ schema, warnings }`, with typed advisory records carrying the recorded and resolved versions. "Constraints" says "The use case does not mutate the change or persist warnings itself", which implies the caller gets the warnings.
- None of the 9 consumers can surface the advisory to callers or the CLI. Either change the code or relax the spec. The owner is the resolve-change-schema audit; it is listed here because every spec in this batch depends on it.

### X4 [LOW] The reconciler skips the shared resolver

- `reconcile-change-validity.ts:203` calls `this._deps.schemaProvider.get(change.schemaName)` directly, without the identity check or version advisory. resolve-change-schema "Shared change-operation boundary" says callers "MUST NOT duplicate named lookup, identity validation …". The name is correct, so there is no fallback to the default. A misbehaving provider would only be caught at the first consumer's own resolve. That holds for all 9 in this batch, since each resolves before it reconciles.
- edit-change's "Serialized reconciliation owns artifact topology" explicitly hands this lookup to the reconciler, so the reconciler must perform it. It just does not go through `ResolveChangeSchema`.

### X5 [LOW] Delta heading rename was not applied in the merged specs

- The archive-change, compile-context, get-artifact-instruction and get-hook-instructions deltas use `op: modified` with selector `Requirement: Schema name guard`, and their content starts with `### Requirement: Sovereign schema resolution`. The merged previews still show `### Requirement: Schema name guard` (archive line 70, compile-context line 70, get-artifact-instruction line 39, get-hook-instructions line 44), with the new body under it.
- Either the merge drops the heading from `content` (a delta authoring problem: rename needs another op), or the merge engine ignores heading renames on `modified`. Either way, the requirement is still called "Schema name guard" while it now describes sovereign resolution. archive-change "Archivable guard" also still says "After the schema name guard".

### X6 [LOW] Dead `_schemaProvider` fields

Each of the 9 use cases keeps `this._schemaProvider` and only passes it to the fallback `new ResolveChangeSchema(schemaProvider)`: approve-spec.ts:33/61, approve-signoff.ts:39/70, archive-change.ts:201/253, compile-context.ts:202/245, get-artifact-instruction.ts:53/78, get-hook-instructions.ts:36/58, edit-change.ts:77/105, invalidate-change.ts:74/96. count-tasks takes it as a ctor parameter. This is harmless, but it leaves a reference to the raw provider that could later be used for an unnamed `get()`.

### Workspace-default fallback sweep

No direct `schemaProvider.get()` without a name remains in any of the 9 use cases. Every one calls `this._resolveChangeSchema.execute({ changeName, schemaName: change.schemaName, schemaVersion })`, and every composition factory injects the shared `resolver.getResolveChangeSchema()` (`composition-resolver.ts:564-567`). Remaining unnamed lookups across core: `generate-spec-metadata.ts:94` (X2), `validate-specs.ts:124`, `get-project-context.ts:143`, `get-spec-context.ts:391`, `get-spec-outline.ts:65`, and `resolve-initial-persisted-depends-on.ts:59`. In archive, the last one is safely wrapped with the sovereign schema. The others are spec-scoped or project-scoped and outside this batch.

---

## core:archive-change

### Requirements Summary

Sovereign resolution through `ResolveChangeSchema` before preflight, hooks or commit, with errors propagated. No peer `list()`/`get()` before the predicates return. Plus the existing archive pipeline: bindings, archivable guard, canonical preflight, deferred `archiving` transition, staged commit, restore, spec-lock, metadata.

### Implementation Status

| Requirement                                           | Status                      | Evidence                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign resolution)              | Implemented                 | `archive-change.ts:284-291`: resolve runs right after load and before reconcile, predicates and hooks                                                                        |
| Identity mismatch propagates, no peer loading         | Implemented                 | resolver throws before anything else. `schema.nameMatch` maps to `SchemaProviderIdentityMismatchError` (`:1477-1478`). Overlap peers load only after predicates (`:337-345`) |
| Metadata materialization governed by sovereign schema | Partial                     | X2: post-commit `GenerateSpecMetadata` uses the default                                                                                                                      |
| Canonical validity archive preflight                  | Implemented, with X1 defect | `:294-307, :396-415`; verification is state-only (X1)                                                                                                                        |
| Archive bindings / no RunStepHooks                    | Implemented                 | ctor `:236-266`; deps resolve `archiveBindings`                                                                                                                              |
| Config factory via resolveArchiveChangeDeps           | Implemented                 | `composition/use-cases/archive-change.ts:153, 194-212` passes `resolveChangeSchema`                                                                                          |

### Discrepancies

- **HIGH (X1)**: with verifying disabled, archive fails with `VERIFICATION_REQUIRED` / `ArchiveImplementationStateError`.
- **MEDIUM (X2)**: metadata materialization uses the workspace default.
- **LOW**: the Constraints say "Hook execution is delegated to `RunStepHooks`", but the requirements say `ArchiveChange` MUST NOT take `RunStepHooks`. Hooks now go through `hook.pre`/`hook.post` binding effects. The constraint is outdated, or should say "via binding effects".
- **LOW (X5)**: the heading is still "Schema name guard".
- **LOW**: the `@throws` JSDoc (`:276`) lists `SchemaNotFoundError` but not `SchemaProviderIdentityMismatchError`.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `archive-change.spec.ts:331` "uses the recorded sovereign schema on a successful archive". The provider returns a distinct `workspace-default` for any other ref, and the test asserts `get('custom-workflow')` and success. **Covered.** The scenario name does not match the test title.
- Identity mismatch: `archive-change.spec.ts:313` "rejects the sovereign lookup integrity failure without listing peer changes". Covered.
- `makeMaterializeMetadata()` is mocked, so X2 cannot be caught.

### Missing Tests

- Archive after a schema with `verifying: { disabled: true }` (X1).
- Archive metadata materialization using the change schema when the default differs (X2).
- A propagated general resolution failure (not identity mismatch) before hooks run, asserting no hook execution or snapshot.

### Spec Dependency Chain

- core:resolve-change-schema: result contract mismatch (X3).
- core:transition-checks / check-registry: `verification.current` on archive is `allowDisable:false` with no condition on the step being enabled (X1).
- core:materialize-spec-metadata / spec-metadata: default-schema lookup conflicts with the sovereign wording (X2).
- default:\_global/error-handling-conventions: typed errors are used (`SchemaProviderIdentityMismatchError`, `ArchiveImplementationStateError`). OK.

### Summary

6 requirements checked (sovereign-related): 4 implemented, 1 partial (X2), 1 implemented with a defect (X1). Discrepancies: 1 HIGH, 1 MEDIUM, 3 LOW.

---

## core:approve-spec

### Requirements Summary

Gate guard sequence: disabled gate fails first with no I/O, then load, actor, sovereign schema (errors propagate). Consent recorded in `ready`; historic drain from `pending-spec-approval` to `spec-approved`. Gates set at construction from `config.approvals`. Factory through `resolveApproveSpecDeps`.

### Implementation Status

| Requirement                          | Status                     | Evidence                                                                                                                                                     |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate guard step 1 (disabled, no I/O) | Implemented                | `approve-spec.ts:79-81`                                                                                                                                      |
| Gate guard steps 2-4                 | Implemented, order differs | load `:83`, schema `:88-92`, actor `:94`. The spec order is load, **actor**, schema                                                                          |
| Approval gate set at construction    | Implemented                | ctor `approvals` `:54`; `resolveApproveSpecDeps` `approvals: resolver.config.approvals` (`composition/use-cases/approve-spec.ts:52`); kernel `kernel.ts:392` |
| Recording / state transition         | Implemented                | `:95-113`; drain transition `:109-111`                                                                                                                       |
| Input contract                       | Implemented                | `:17-22`                                                                                                                                                     |

### Discrepancies

- **LOW**: gate-guard order. The code resolves the schema before the actor; the spec lists the actor (3) before the schema (4). There is no behavioural impact unless the actor resolver has side effects or fails. Either fix the order in the code or say in the spec that steps 3 and 4 have no fixed order.
- **LOW (spec internal)**: the verify scenario "Enabled gate allows execute with name and reason" requires `pending-spec-approval` -> `spec-approved`. The Purpose says the use case "MUST NOT transition into … `spec-approved` on that happy path" and keeps drain only for in-flight changes. The code does both, so the scenario only exercises the legacy drain and reads as the primary behaviour. Possible fixes: rename it to "drain", or add a `ready` variant.

### Test Coverage

- "Factory passes config.approvals": **not covered**. `test/composition/use-cases/approve-spec.spec.ts:22` only asserts `toBeInstanceOf(ApproveSpec)`. Nothing checks that `resolveApproveSpecDeps(resolver).approvals === config.approvals`, or that a config with `approvals.spec:false` makes `execute` throw `ApprovalGateDisabledError`.
- "Enabled gate allows execute with name and reason": covered in substance by `approve-spec.spec.ts:283` "transitions the change to spec-approved" (pending-spec-approval drain, default `approvals.spec:true`). The title differs.
- "Sovereign schema resolution in gate guard": `approve-spec.spec.ts:390` "resolves schema by change.schemaName and succeeds". The provider returns `fallback` for other refs; the test asserts `get('schema-a')` and success. **Covered (weak)**: it does not check the resulting state or that the fallback was never requested.
- Gate disabled: `:344`, `:360`. Covered.
- `SchemaMismatchError` is imported and unused (`approve-spec.spec.ts:5`).

### Missing Tests

- Factory/config approvals pass-through (both `createApproveSpec(config)` and kernel).
- `SchemaProviderIdentityMismatchError` propagating before consent (gate guard step 4).
- General resolution failure propagating with no mutation.

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:transition-checks: the `approval.spec` binding is `from: ready` (`check-bindings.ts:88-91`), consistent with "Approval recorded in ready".
- core:workflow-model: `ready` cannot be disabled while the spec gate is active (`workflow-topology.ts:267-272`), so the anchor is protected. OK.

### Summary

5 requirements: 5 implemented (1 with an order deviation). Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Missing tests: 3.

---

## core:approve-signoff

### Requirements Summary

Same gate guard sequence for `approvals.signoff`. Implementation-tracking refresh, then reconciliation, fingerprint and signoff in one mutation. Signoff in `done` requires valid verification. Typed verification errors. Gates set at construction.

### Implementation Status

| Requirement                             | Status                     | Evidence                                                                                                     |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Gate guard step 1                       | Implemented                | `approve-signoff.ts:91-93`                                                                                   |
| Gate guard steps 2-4                    | Implemented, order differs | load `:95`, schema `:100-104`, refresh `:106`, actor `:107`                                                  |
| Approval gate set at construction       | Implemented                | `composition/use-cases/approve-signoff.ts:55` `approvals: resolver.config.approvals`; kernel `kernel.ts:393` |
| Signoff recording / verification errors | Implemented                | `:113-124, :151-168` (not-found / in-progress / stale / mismatch are distinct)                               |
| Signoff with verifying disabled         | Defect / spec gap          | X1: `:113-121` always requires `verification.completed`                                                      |

### Discrepancies

- **HIGH (X1)**: with signoff gate on and `verifying` disabled, signoff can never succeed (`VerificationNotFoundError`), and `approval.signoff` on `done -> archivable` fails with `VERIFICATION_REQUIRED`. The spec says "valid verification evidence" without exception. Fix the code, or add to the spec that this schema/gate combination is invalid and have schema validation reject it.
- **LOW**: gate-guard order (schema before actor), same as approve-spec.
- **LOW (spec internal)**: the "Enabled gate allows execute" scenario targets the `pending-signoff` -> `signed-off` drain while the Purpose says new work stays in `done`. Same ambiguity as approve-spec.

### Test Coverage

- "Factory passes config.approvals": **not covered** (`test/composition/use-cases/approve-signoff.spec.ts:22` is an instanceOf check only).
- "Enabled gate allows execute with name and reason": `approve-signoff.spec.ts:355` "transitions the change to signed-off". Covered in substance.
- "Sovereign schema resolution in gate guard": `approve-signoff.spec.ts:461` "resolves schema by change.schemaName and succeeds". **Covered (weak)**: pending-signoff drain only, and no assertion on the fallback.
- Unused `SchemaMismatchError` import (`:5`).

### Missing Tests

- Factory/config approvals pass-through.
- Identity mismatch and general failure propagating before refresh or mutation. It is untested whether `RefreshImplementationTracking` stays un-invoked on failure (the code resolves before refresh, which is correct).
- Signoff with a verifying-disabled schema (X1).

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:transition-checks: `approval.signoff` on `done -> archivable` reads `validity.verification`, which is state-only (X1).
- core:workflow-model: no validation rule ties the signoff gate to the `verifying` step being enabled. A cross-spec gap.

### Summary

5 requirements: 4 implemented, 1 defect or spec gap (X1). Discrepancies: 1 HIGH, 0 MEDIUM, 2 LOW. Missing tests: 3.

---

## core:compile-context

### Requirements Summary

Resolve the change's sovereign schema through `ResolveChangeSchema`; the default is irrelevant; identity mismatch propagates. The rest of the context-assembly requirements did not change in this delta.

### Implementation Status

| Requirement                   | Status      | Evidence                                                                               |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Schema name guard (sovereign) | Implemented | `compile-context.ts:273-280`, before any other I/O except change load                  |
| Factory wiring                | Implemented | `composition/use-cases/compile-context.ts:63, 69, 133-147` injects the shared resolver |

### Discrepancies

- **LOW (X2 transitive)**: `GetSpecMetadata` -> `GenerateSpecMetadata` uses the default schema for per-spec metadata. The compile-context spec limits sovereignty to "instructions and artifact templates", so this is consistent with the spec as written. The archive-change wording, however, treats metadata materialization as change-sovereign.
- **LOW**: the `@throws` JSDoc (`:263`) lists `SchemaNotFoundError` only. `SchemaProviderIdentityMismatchError` is missing.
- **LOW (X5)**: the heading is still "Schema name guard".

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `compile-context.spec.ts:544` "resolves sovereign schema by change.schemaName". **Weak**: `makeSut({ change, schema })` gives a provider that returns the same schema for any ref, so no distinct default is modelled and fallback is not ruled out. The test also passes `config: noOp`, which the input contract says MUST NOT be accepted (a leftover).
- Identity mismatch propagation: **not covered**.

### Missing Tests

- A provider that returns a distinct default for other refs, or throws on them.
- Propagation of `SchemaProviderIdentityMismatchError`.

### Spec Dependency Chain

- core:resolve-change-schema (X3). The other dependencies in this delta have no conflicts.

### Summary

2 requirements in scope: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW. Tests: 1 weak, 1 missing.

---

## core:get-artifact-instruction

### Implementation Status

| Requirement                   | Status      | Evidence                                                                                                              |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign) | Implemented | `get-artifact-instruction.ts:91-98`; the schema feeds `evaluateLifecycleVerdict`, artifact lookup, rules and template |
| Factory wiring                | Implemented | `composition/use-cases/get-artifact-instruction.ts:49, 105-113`                                                       |

### Discrepancies

- **LOW (X5)**: heading not renamed.
- **LOW**: the "Ports and constructor" ctor signature in the spec has no optional `resolveChangeSchema` parameter, and `resolveGetArtifactInstructionDeps` does not list it. The same pattern holds for all specs in this batch. The code adds an optional 6th or later parameter and `resolveChangeSchema` on the deps. Spec text is behind the code.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `get-artifact-instruction.spec.ts:172` "resolves sovereign schema by change.schemaName". **Weak**: `get: vi.fn().mockResolvedValue(schema)` returns the same schema for any ref, so the `spec-driven` default in the scenario is not modelled. It does assert `get('custom-schema')`.
- Identity mismatch: not covered.

### Missing Tests

- A distinct default or throwing provider for other refs.
- Identity mismatch propagation.

### Summary

2 requirements: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Tests: 1 weak, 1 missing.

---

## core:get-hook-instructions

### Implementation Status

| Requirement                                        | Status      | Evidence                                                                                                                  |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Schema name guard (sovereign, active and archived) | Implemented | `get-hook-instructions.ts:69-106`: recorded `schemaName`/`schemaVersion` taken from the active change or `ArchivedChange` |
| Change lookup / archive fallback                   | Implemented | `:72-99`                                                                                                                  |
| Step resolution                                    | Implemented | `:108-115`                                                                                                                |

### Discrepancies

- **LOW**: step validity is checked after schema resolution. Before this change it ran before any provider I/O. With an invalid `step` and a broken schema, the user now sees the schema error instead of `StepNotValidError`. The spec does not set an order.
- **LOW (optional/disabled steps)**: `schema.workflowStep(step)` returns a step even when it is declared `disabled: true`, so instruction hooks of a disabled step are still returned. The spec is silent. Decide whether disabled steps should yield `[]`.
- **LOW (X5)**: heading.

### Test Coverage

- "Resolves sovereign schema when workspace default differs": `get-hook-instructions.spec.ts:198` "uses the recorded schema for active and archived instruction lookups". The provider returns a distinct default schema with a different hook; the test asserts the sovereign hook for both the active and the archived path. **Covered (strong)**.
- Identity mismatch: not covered.

### Missing Tests

- Identity mismatch propagation.
- Hooks of a disabled step (if the behaviour gets specified).

### Summary

3 requirements: 3 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW.

---

## core:edit-change

### Requirements Summary

Sovereign resolution once before mutation for added-spec compatibility. In the mutation: `replaceSpecIds()` and `ctx.reconcileAfter()`, with no `updateSpecIds()` and no second direct `SchemaProvider.get()`. Resolution errors abort before mutation; reconciliation errors prevent partial persistence.

### Implementation Status

| Requirement                                 | Status      | Evidence                                                                                                                                      |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve once before mutation                | Implemented | `edit-change.ts:142-147`, only when `hasSpecChanges`                                                                                          |
| Compatibility uses sovereign schema         | Implemented | `:149-158`: `specSchemaName = persisted.schema?.name ?? schema.name()`; compatible if equal to `change.schemaName` or `schema.compat()?.name` |
| `replaceSpecIds()` + `ctx.reconcileAfter()` | Implemented | `:239, :245`                                                                                                                                  |
| No `updateSpecIds()` / no second lookup     | Implemented | no call in edit-change. `Change.updateSpecIds` still exists (`domain/entities/change.ts:1639`) but edit-change does not use it                |
| Resolution error aborts before mutation     | Implemented | resolve runs before `_executeScopeEdit`                                                                                                       |

### Discrepancies

- **MEDIUM (spec internal contradiction)**: "Schema compatibility guardrail" step 1 says an uninitialized spec "assumes it uses the project's active global schema (`GetActiveSchema`)", and the verify scenario "Uninitialized spec fallback allows addition if global schema matches change" agrees. The new "Sovereign schema resolution" requirement says "A workspace default that differs from `change.schemaName` MUST NOT affect compatibility results." The code follows the new rule: an uninitialized spec is treated as having the change's sovereign schema, so it is always compatible. Two readings:
  - (a) The guardrail step 1 text and its scenario are outdated and should say "the change's sovereign schema". This is the likely intent.
  - (b) The code should still consult `GetActiveSchema` for uninitialized specs. That would contradict the new requirement.
    The test `edit-change.spec.ts:536` "allows uninitialized spec fallback when global schema matches change" passes only because the default and the change schema share a name. It does not tell the two readings apart.
- **LOW**: in the non-scope branch (`:164-195`), `persisted.invalidated` is always `false` (`:175`), so the unscaffold, scaffold and refresh code after it can never run.
- **LOW**: the "Dependencies" requirement and `resolveEditChangeDeps` list do not mention the reconciler or `resolveChangeSchema`, both of which composition injects (`composition/use-cases/edit-change.ts:42, 103-112`). Spec text is behind the code.

### Test Coverage

- "Added-spec compatibility ignores a different workspace default": `edit-change.spec.ts:482` "uses the change schema for compatibility and fresh mutation DAG synchronization". The provider throws for any ref other than `custom-workflow`; the test asserts `get` called once with it. **Covered**. A real incompatible-compat default schema is not modelled, but the throwing provider gives an equivalent guarantee.
- "Serialized reconciliation owns artifact topology": **partially covered**. The same test's `toHaveBeenCalledOnce()` rules out a second direct lookup, assuming `makeObservingReconcile` does not call the provider. No test asserts that `replaceSpecIds()` and `ctx.reconcileAfter()` run, or that `updateSpecIds()` does not. That is verified only by code inspection (`:239, :245`).
- "Schema resolution failure leaves scope unchanged" (failure inside `reconcileAfter`): `edit-change.spec.ts:433` "keeps the persisted scope atomic when reconciliation rejects". **Weak**: the mocked `reconcile.mutate` never writes to `repo`, so "nothing persisted" holds by construction. The repository's real rollback is not exercised.
- Pre-mutation resolution failure: `edit-change.spec.ts:517`. Covered.

### Missing Tests

- Spy on `Change.prototype.replaceSpecIds`, `updateSpecIds` and `reconcileAfter` to make the "Serialized reconciliation owns artifact topology" scenario explicit.
- An atomicity test with a real or in-memory `ReconcileChangeValidity.mutate` that rejects after `replaceSpecIds`.
- A test separating the guardrail-step-1 readings (default schema name differs from the change schema, spec uninitialized).

### Spec Dependency Chain

- core:resolve-change-schema (X3).
- core:get-active-schema (named in guardrail step 1) conflicts with the sovereign requirement (see MEDIUM above).
- core:change: `replaceSpecIds` exists, and `updateSpecIds(…, artifactDag)` remains as a legacy API. Consider deprecating it.

### Summary

5 requirements: 5 implemented. Discrepancies: 0 HIGH, 1 MEDIUM (spec contradiction), 2 LOW. Tests: 2 covered, 1 partial, 1 weak.

---

## core:invalidate-change

### Implementation Status

| Requirement                                           | Status      | Evidence                                                                                                                                                                                                              |
| ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve after load, DAG targets from sovereign schema | Implemented | `invalidate-change.ts:122-142`: `resolveTargets(…, schema.artifacts())`, `globalTargets(change, schema)`. Downstream expansion happens in the reconciler with `schemaProvider.get(change.schemaName)` (same name, X4) |
| Errors propagate before persistence                   | Implemented | resolve runs before `_reconcile.execute`                                                                                                                                                                              |

### Discrepancies

- **LOW**: resolution happens after `validateCommandShape` (`:117-120`), not straight "after loading". Pure input validation comes first, which is harmless.
- **LOW (X4)**: downstream propagation's DAG comes from the reconciler's direct lookup, not from the resolved instance. The name is the same, so this is consistent.

### Test Coverage

- "Invalidation targets come from the change schema": `invalidate-change.spec.ts:157` "resolves invalidation targets from the change sovereign schema". **Weak**: the change's `schemaName` is `@specd/schema-std`, the usual default name. The scenario requires `custom-workflow` with a default whose DAG is different. A throwing provider for other refs gives partial assurance, but differing target sets are not demonstrated.
- "Schema resolution failure precedes persistence": `invalidate-change.spec.ts:182`. Covered (history length unchanged).

### Missing Tests

- A custom-named schema with a DAG that differs from the default, asserting the selected targets, including `global` and downstream expansion.

### Summary

2 requirements: 2 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW. Tests: 1 weak, 1 covered.

---

## core:count-tasks

### Implementation Status

| Requirement                                       | Status      | Evidence                                               |
| ------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Sovereign resolution, tasks from sovereign schema | Implemented | `count-tasks.ts:48-52`, iterating `schema.artifacts()` |
| No fallback counts on failure                     | Implemented | the resolve error propagates; there is no catch        |
| Composition                                       | Implemented | `composition/use-cases/count-tasks.ts:27, 71-74`       |

### Discrepancies

- **LOW**: "Counts qualifying task artifacts" still says "obtain the resolved schema through `SchemaProvider`", and "Supports composition" lists only `ChangeRepository` and `SchemaProvider` as dependencies. This is consistent but does not mention `ResolveChangeSchema`. It is a small wording gap next to the new requirement.
- **LOW**: the `check.incompletePattern!` / `completePattern!` non-null assertions (`:57-58`) rely on the schema always filling them in. That is consistent with the spec ("schema MUST materialize"), so this is an observation only.

### Test Coverage

- "Counts tasks declared only by the change schema": `count-tasks.spec.ts:17` "resolves task declarations from the change sovereign schema". The provider throws on non-sovereign refs, and the test asserts counts from the custom `checklist` artifact. **Covered.** The title differs.
- "Sovereign schema failure does not return fallback counts": `count-tasks.spec.ts:48`. Covered.

### Missing Tests

- None material. Optional: identity mismatch propagation.

### Summary

3 requirements: 3 implemented. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW.

---

## Batch totals

| Spec                     | HIGH               | MEDIUM                                   | LOW        | Missing or weak tests                                            |
| ------------------------ | ------------------ | ---------------------------------------- | ---------- | ---------------------------------------------------------------- |
| archive-change           | 1 (X1)             | 1 (X2)                                   | 3          | 3 missing                                                        |
| approve-spec             | 0                  | 0                                        | 2          | 1 missing (factory approvals), 1 weak, 2 missing (failure paths) |
| approve-signoff          | 1 (X1)             | 0                                        | 2          | 1 missing (factory approvals), 1 weak, 2 missing                 |
| compile-context          | 0                  | 0                                        | 3          | 1 weak, 1 missing                                                |
| get-artifact-instruction | 0                  | 0                                        | 2          | 1 weak, 1 missing                                                |
| get-hook-instructions    | 0                  | 0                                        | 3          | 1 missing                                                        |
| edit-change              | 0                  | 1 (guardrail vs sovereign contradiction) | 2          | 1 partial, 1 weak, 1 missing                                     |
| invalidate-change        | 0                  | 0                                        | 2          | 1 weak                                                           |
| count-tasks              | 0                  | 0                                        | 2          | 0                                                                |
| Cross-cutting            | X1 (counted above) | X3 (resolver contract)                   | X4, X5, X6 | none                                                             |

Overall, every consumer in the batch resolves the change's recorded `schemaName` through the shared `ResolveChangeSchema`. None calls the workspace default directly, and errors propagate before mutation. The remaining risks:

1. The state-only `verificationRequired` breaks archive and signoff when `verifying` is disabled (HIGH).
2. Post-commit archive metadata materialization still uses the workspace default (MEDIUM).
3. The resolver returns no typed warnings, unlike its spec (MEDIUM).
4. The edit-change guardrail text contradicts the sovereign requirement (MEDIUM).
5. No test checks that factories pass `config.approvals`, and several sovereign tests use providers that return the same schema for any ref.
