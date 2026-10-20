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
