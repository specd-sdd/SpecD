# Specs compliance report — schema-workflow-skippable-states

- Mode: delegated change audit
- Outer verification attempt: `verification-attempt-8`
- Generated: 2026-10-13 13:53:12 Europe/Madrid
- Specs audited: 25
- Overall result: FINDINGS — user decision required
- Findings: 0 Critical, 0 High, 2 Medium, 1 Low
- Focused delegated evidence: 921 tests passed (143 + 441 + 337), 0 failed
- Scenario verification evidence outside delegated batches: Core 920, CLI 126, Skills 21, Guide 59; lint and typecheck passed

## Executive summary

The sovereign `change.schemaName` behavior, optional/disabled semantics, effective step-skip checks, Core-owned routing, documentation, and EditChange atomicity are substantially implemented and tested.

Three compliance findings remain:

1. **Medium:** `WorkflowTopology.rawActivePipeline` can preserve explicitly declared bedrock states in a noncanonical order, potentially affecting direction and guidance.
2. **Medium:** the merged `cli:change-transition` requirement assigns conditional optional-step bypass to `--next`, while implementation and guide define `--next` as the closest enabled step and reserve shortcut recommendation for `GetStatus.nextAction`.
3. **Low:** a legacy ArchiveChange test still frames a provider resolution failure as active/default schema-name mismatch, conflicting with the sovereign-schema contract.

Because full verification found issues, the outer attempt remains active and has not been completed.

## Detailed findings

# Delegated compliance audit — workflow model and check semantics

- Change: `schema-workflow-skippable-states`
- Outer verification attempt: `verification-attempt-8`
- Audit scope: `core:workflow-model`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`, `core:lifecycle-engine`, `core:change`
- Evidence basis: merged change previews, dependency declarations, graph-first symbol discovery, direct implementation inspection, and focused Vitest execution.

## Summary

| Result                                     | Count |
| ------------------------------------------ | ----: |
| Specs audited                              |     6 |
| Requirements materially covered            |    23 |
| Confirmed implementation discrepancies     |     1 |
| High/Critical discrepancies                |     0 |
| Medium discrepancies                       |     1 |
| Low discrepancies                          |     0 |
| Focused test files passed                  |     6 |
| Focused tests passed                       |   143 |
| Missing/insufficient test cases identified |     2 |

Overall result: **audit does not pass cleanly**. Optional/disabled semantics, check governance, step-skip composition, topology-based direction, lifecycle recommendation, and sovereign schema usage are substantially implemented and tested. However, `WorkflowTopology.orderedPipeline` does not guarantee the spec's canonical ordering invariant for bedrock states when those states are explicitly declared in a noncanonical order.

## Requirements Summary

### `core:workflow-model`

- Workflow rows configure existing `ChangeState` values and do not create protocol states.
- `optional: true` permits topology shortcuts; effective `step-skip` predicates decide whether a concrete shortcut is available. An empty effective skip-check set permits an unconditional bypass.
- `disabled: true` removes a step from the active graph. Bedrock and active approval anchors are protected.
- `checks` and `skipChecks` are schema-composed bindings with coordinate uniqueness and check/binding governance locks.
- The progress axis is delegated to `WorkflowTopology.orderedPipeline(schema, approvals)`; omitted canonical states remain enabled.
- Existing changes use their recorded sovereign schema.

### `core:workflow-topology`

- Builds the active ordered pipeline, including omitted canonical states and excluding disabled states.
- Enforces bedrock/approval-anchor restrictions and forward reachability.
- Computes legal forward shortcuts only across optional/disabled intermediates; backward edges remain constrained by `VALID_TRANSITIONS`.
- Computes bypassed active optional steps and the immediate next enabled step.
- Disabled verification removes verification as a lifecycle boundary.

### `core:check-registry`

- Namespaces plugin checks with the documented `[A-Za-z0-9_-]+` plugin-name grammar.
- Uses distinct coordinate identity for transition, archive, operation, and step-skip bindings.
- Enforces check-level and binding-level locks for embedding, binding override, configuration override, and disablement.
- Preserves built-in identifiers and prevents duplicate checks/binding coordinates.

### `core:transition-checks`

- Classifies direction using the authoritative topology axis and supplied approval snapshot.
- Supports isolated `step-skip` attempts/applicability.
- Dynamically overlays or synthesizes step transition and skip bindings, deep-merging config and preserving restrictive governance.
- Uses topology legal transitions for `protocol.edge`.
- Defines non-skippable implementation/task skip checks and governed policy checks.

### `core:lifecycle-engine`

- Projects valid versus available transitions from topology and predicate results.
- Recommends the furthest passing shortcut across consecutive optional steps; falls back to entering the nearest optional step when shortcut predicates fail.
- Treats optional steps with no effective skip predicates as unconditionally bypassable.
- Keeps disabled steps out of recommendations and uses the selected domain `nextHop` for application command guidance.

### `core:change`

- `StartVerification` resolves `SchemaProvider.get(change.schemaName)` before operation-specific readiness checks.
- Validity fingerprints resolve the recorded change schema and derive artifact selection/task exclusions exclusively from it.
- Schema resolution failures propagate rather than falling back to the workspace default.

## Implementation Status

| Area                                                | Status                                 | Evidence                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional/disabled model                             | Implemented                            | `workflow-step.ts`, `build-schema.ts`, `workflow-topology.ts`                                                                                               |
| Empty skip-check set means unconditional bypass     | Implemented                            | Candidate transition evaluation has no failing step-skip predicate when the effective set is empty; lifecycle recommendation selects the available shortcut |
| Bedrock and approval-anchor locks                   | Implemented                            | `WorkflowTopology.rawActivePipeline`; build-time bedrock validation; focused tests                                                                          |
| Reachability validation                             | Implemented                            | `orderedPipeline` calls `isReachable`; tests cover disabled `done` disconnect                                                                               |
| Topology legal transitions and bypass discovery     | Implemented with ordering defect below | `workflow-topology.ts`                                                                                                                                      |
| Plugin grammar and coordinate identity              | Implemented                            | `PLUGIN_NAME_REGEX = /^[a-zA-Z0-9_-]+$/`; step-skip coordinate key includes step                                                                            |
| Governance locks                                    | Implemented                            | `check-registry.ts`, `build-schema.ts`, `resolveEffectiveBindings`                                                                                          |
| Topology-based `along`                              | Implemented                            | `classifyAlong` calls `WorkflowTopology.orderedPipeline(schema, approvals)`; no local fallback axis                                                         |
| Dynamic transition/step-skip composition            | Implemented                            | `resolveEffectiveBindings`; synthesized bindings inherit governance rather than relaxing it                                                                 |
| Optional-step default recommendation                | Implemented                            | `recommendedForwardTarget` and `resolveLifecycleNextHop`                                                                                                    |
| Sovereign schema in verification/fingerprints       | Implemented                            | `start-verification.ts:117`; `validity-fingerprint-service.ts:115`                                                                                          |
| Change-scoped use cases in audited dependency chain | Implemented                            | Search confirms change-operating use cases use `change.schemaName`; project/spec-only use cases retain default-schema lookup by design                      |

## Discrepancies

### MEDIUM — Explicitly declared bedrock states can lose canonical progression order

**Spec expectation**

`core:workflow-topology` requires canonical bedrock states (`drafting`, `designing`, `archivable`, `archiving`) to be present **in canonical progression order**, while enabled schema rows retain declared relative order only for a valid reachable declaration. The merged verification artifact also contains a scenario requiring noncanonical declared rows to remain authoritative while protocol-owned anchors are inserted safely.

**Implementation evidence**

`WorkflowTopology.rawActivePipeline` initializes `stepList` directly from `schema.workflow()` and only inserts canonical states that are missing. An explicitly declared canonical/bedrock state is never repositioned or rejected. Therefore a declaration such as `archiving, designing, archivable` preserves `archiving` before `designing`; omitted states are inserted around that already-invalid sequence. `isReachable` checks only `designing -> archivable`, so it does not necessarily reject a misplaced `drafting` or `archiving` anchor.

This also leaks into `classifyAlong`, `legalTransitions`, `bypassedSteps`, and `nextForwardStep`, all of which consume the resulting axis.

**If the spec is correct and code is wrong**

The topology builder must either normalize protocol-owned bedrock anchors to canonical positions while preserving the relative order of configurable delivery rows, or reject declared orders that cannot satisfy both invariants. Tests must cover explicitly declared bedrock rows in a noncanonical order, not only omitted anchors.

**If the code is intentional and spec is wrong**

The spec must explicitly state that every declared row—including bedrock anchors—retains author order, and define the semantics of `archiving` appearing before `designing` or `archivable`. That interpretation conflicts with the stated canonical progression and with archive entry/recovery semantics, so it is the less plausible reading.

**Impact**

Custom schemas can produce an axis where direction classification and next-step guidance are semantically inconsistent even though the schema passes the current reachability check. Severity is Medium because it requires unusual but currently accepted schema ordering; it does not affect the standard schema.

## Test Coverage

Focused command:

```text
pnpm --filter @specd/core exec vitest run \
  test/domain/services/workflow-topology.spec.ts \
  test/domain/services/check-registry.spec.ts \
  test/domain/services/transition-checks.spec.ts \
  test/domain/services/lifecycle-verdict.spec.ts \
  test/application/use-cases/start-verification.spec.ts \
  test/application/services/validity-fingerprint-service.spec.ts
```

Result: **6 files passed, 143 tests passed**.

Strong coverage exists for:

- omitted canonical states, optional flags, disabled steps, bedrock disable rejection, active approval anchors, and reachability;
- legal shortcuts, disabled destinations, backward protocol restrictions, bypassed-step detection, and next enabled step;
- plugin names, duplicate coordinates, check/binding governance, config cascade, disabled binding removal, and restrictive synthesized governance;
- topology-derived direction and step-skip applicability;
- mandatory/optional recommendation, passing/failing/empty/consecutive optional shortcut cases;
- sovereign schema resolution by `StartVerification` and validity fingerprints, including failure behavior.

## Missing Tests

1. **Required by merged verification scenario:** no `workflow-topology.spec.ts` test supplies enabled workflow rows in a noncanonical but valid/reachable order and asserts that configurable rows retain their relative order while bedrock anchors remain canonical.
2. **Invariant regression:** no test explicitly declares bedrock rows in a noncanonical order and asserts normalization or `SchemaValidationError`. This omission permits the confirmed discrepancy above.

## Spec Dependency Chain

```text
default:_global/architecture
  -> core:check-registry
  -> core:transition-checks
  -> core:lifecycle-engine

core:change
  -> core:workflow-model
  -> core:workflow-topology
  -> core:transition-checks
  -> core:lifecycle-engine

core:schema-format
  -> core:workflow-model
  -> core:workflow-topology
  -> core:transition-checks

core:build-schema
  -> core:workflow-model/check governance validation

core:workflow-topology
  -> transition direction (`classifyAlong`)
  -> protocol edge evaluation
  -> lifecycle valid transitions
  -> optional-step recommendation

core:change sovereign schema identity
  -> StartVerification readiness context
  -> ValidityFingerprintService artifact selection
  -> approval/verification/signoff/archive/reconciliation evidence
```

Dependency consistency is otherwise sound: topology and registry are pure domain services; I/O remains in application ports/use cases; lifecycle command strings remain in application guidance; the audited change-schema consumers resolve by `change.schemaName`.

## Final Assessment

The implementation captures the proposal's intended authority split: schema authors declare optionality/disablement, Core evaluates the active graph and effective skip checks, and skills consume projected routing. The empty effective skip-check case is coherently implemented as unconditional permission rather than a disabled step. The audit is blocked only by the pipeline-order invariant above; correcting it and adding the two missing topology tests should make this six-spec batch compliant.

---

# Partial compliance audit — Core change-scoped use cases

## Requirements Summary

Scope: `core:transition-change`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, `core:validate-artifacts`, `core:get-status`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:run-step-hooks`, and `core:preview-spec` for delegated verification attempt `verification-attempt-8`.

The merged requirements establish two central invariants:

1. Every operation on an existing change uses the immutable schema reference stored in that change (`change.schemaName`, or the archived/draft equivalent). The workspace default is not a fallback for change-scoped behavior.
2. `EditChange` scope edits are serialized and atomic: compatibility is checked before mutation, the fresh aggregate is changed with `replaceSpecIds()`, `ctx.reconcileAfter()` owns topology and validity synchronization, and reconciliation failure cannot persist a partial edit.

`TransitionChange` additionally requires topology-aware `next`, optional/disabled-step bypass evaluation, effective step-skip checks, and suppression of hooks belonging to bypassed steps.

## Implementation Status

| Spec                            | Status    | Implementation evidence                                                                                                                                                                                                                                                                  | Verification evidence                                                                                                                                                                                                                                                     |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-change`        | Compliant | `TransitionChange.execute` loads `SchemaProvider.get(change.schemaName)` before topology resolution; `nextForwardStep` and bypass evaluation receive that schema. Dynamic transition and step-skip predicates are evaluated before mutation, while bypassed-step hooks are not selected. | Dedicated tests cover sovereign lookup, disabled-step `next`, unavailable `next`, step-skip pass/fail, schema-declared/empty effective skip checks, target checks, and hook suppression.                                                                                  |
| `core:edit-change`              | Compliant | Added-spec compatibility performs one direct `get(change.schemaName)` before mutation. The serialized path mutates `ctx.change` with `replaceSpecIds()` and then awaits `ctx.reconcileAfter()`; it neither calls `updateSpecIds()` nor performs a second direct schema lookup.           | Tests prove the workspace default is not consulted, direct lookup occurs once, lookup failure leaves persisted scope unchanged, and rejection after `replaceSpecIds()` leaves persisted spec IDs, history, artifacts, spec approval, signoff, and verification unchanged. |
| `core:invalidate-change`        | Compliant | Schema resolution occurs after loading the change and before target calculation/persistence via `get(change.schemaName)`. Focused/global/downstream targets are derived from the resolved schema DAG.                                                                                    | Tests assert the recorded schema argument and that resolution failure leaves history unchanged.                                                                                                                                                                           |
| `core:count-tasks`              | Compliant | `CountTasks.execute({ change })` calls `get(input.change.schemaName)` and derives task-capable artifacts and patterns only from that schema. Errors propagate.                                                                                                                           | Tests use a custom schema with a distinct `checklist` artifact, assert counts and the exact lookup, and prove failure returns no fallback counts.                                                                                                                         |
| `core:validate-artifacts`       | Compliant | Uses `get(change.schemaName)`; no mismatch guard against the workspace default remains. All schema-derived validation uses the returned schema.                                                                                                                                          | Test asserts lookup of `schema-a` and successful validation under a non-default recorded schema; error propagation remains covered by the suite.                                                                                                                          |
| `core:get-status`               | Compliant | Active status calls `get(change.schemaName)` and draft status calls `get(draftView.schemaName)`. The schema-resolution failure branch is fail-closed and read-only, returning `SCHEMA_RESOLUTION_FAILED` without enabling transitions.                                                   | Tests prove a custom schema controls available steps instead of the default and cover the degraded read-only projection.                                                                                                                                                  |
| `core:compile-context`          | Compliant | Calls `get(change.schemaName)` and uses the resulting schema for artifact and instruction compilation.                                                                                                                                                                                   | Test asserts lookup of `schema-a`; legacy mismatch rejection is absent.                                                                                                                                                                                                   |
| `core:get-artifact-instruction` | Compliant | Calls `get(change.schemaName)` and derives artifact rules/instructions from the result.                                                                                                                                                                                                  | Dedicated test asserts `get('custom-schema')` and successful instruction resolution.                                                                                                                                                                                      |
| `core:get-hook-instructions`    | Compliant | Selects `change.schemaName` for active changes and `archived.schemaName` for archived post-archive instructions, then performs exactly that lookup.                                                                                                                                      | Dedicated test proves both active and archived paths return only the sovereign schema hook and asserts the lookup.                                                                                                                                                        |
| `core:run-step-hooks`           | Compliant | Active execution calls `get(change.schemaName)`; archived post-hook execution calls `get(archived.schemaName)`. Hook lookup is therefore bound to the owning record.                                                                                                                     | Dedicated test asserts lookup of `alpha-schema` and execution under the recorded schema.                                                                                                                                                                                  |
| `core:preview-spec`             | Compliant | Calls `get(change.schemaName)` before parser/delta/template selection.                                                                                                                                                                                                                   | Dedicated test asserts `get('custom-schema')` and successful preview.                                                                                                                                                                                                     |

The source scan found no zero-argument `SchemaProvider.get()` call in any audited use case.

## Discrepancies

No implementation/spec discrepancy was found in the assigned scope.

No contradiction was found with the relevant global and direct dependency contracts. In particular, central schema resolution and reconciliation remain in Core/application services, adapters are not given competing lifecycle rules, failures are typed/propagated or deliberately projected by `GetStatus`, and repository mutation boundaries preserve the hexagonal/DDD and error-handling requirements.

The strongest alternative interpretation considered was whether `EditChange` should re-resolve the schema inside the mutation. The merged requirement explicitly forbids a second direct lookup and assigns fresh-change topology/validity synchronization to `ctx.reconcileAfter()`; the implementation follows that contract. The code is therefore not merely consistent with the delta wording but with its concurrency/atomicity intent.

## Test Coverage

Executed:

```text
pnpm --filter @specd/core exec vitest run \
  test/application/use-cases/transition-change.spec.ts \
  test/application/use-cases/edit-change.spec.ts \
  test/application/use-cases/invalidate-change.spec.ts \
  test/application/use-cases/count-tasks.spec.ts \
  test/application/use-cases/validate-artifacts.spec.ts \
  test/application/use-cases/get-status.spec.ts \
  test/application/use-cases/compile-context.spec.ts \
  test/application/use-cases/get-artifact-instruction.spec.ts \
  test/application/use-cases/get-hook-instructions.spec.ts \
  test/application/use-cases/run-step-hooks.spec.ts \
  test/application/use-cases/preview-spec.spec.ts
```

Result: **11 test files passed; 441 tests passed; 0 failed**.

Coverage is direct for all sovereign-schema call sites and for `EditChange` atomic rollback. The `InvalidateChange` sovereign-schema test uses the standard schema name as the recorded value while guarding against any other lookup; this verifies authority selection and the failure test verifies pre-persistence ordering. It is slightly less expressive than the prose scenario's named custom-vs-default contrast, but the implementation path has no default-schema input and the behavior is substantively covered. This is a non-blocking test-quality observation, not a compliance defect.

## Missing Tests

No mandatory scenario is untested.

Optional strengthening: make the `InvalidateChange` happy-path fixture use a visibly non-default schema name and a deliberately divergent default DAG. This would mirror the GIVEN wording more literally, although it would not exercise a different production branch.

## Spec Dependency Chain

- Sovereign schema behavior relies on `core:change` for the persisted schema reference and on `core:composition-resolver` / `core:schema-format` for resolving and consuming it.
- Transition behavior additionally relies on `core:workflow-topology`, `core:transition-checks`, `core:check-registry`, `core:lifecycle-engine`, and `core:run-step-hooks`; the audited implementation delegates topology/check semantics to those services rather than recreating them.
- Atomic scope editing relies on canonical reconciliation and repository mutation semantics; the fresh aggregate is the mutation subject, and projection changes are returned by the reconciler.
- Status and task projections reuse the shared transition checks and `CountTasks` result instead of deriving competing schema/default behavior.
- The project-wide `default:_global/architecture`, `default:_global/error-handling-conventions`, and `default:_global/testing` constraints are satisfied by Core-owned policy, explicit propagation/projection, and focused Vitest coverage.

## Summary Counts

- Specs audited: **11**
- Requirements assessed as compliant: **11 spec groups / all change-introduced requirements**
- Blocking discrepancies: **0**
- Non-blocking discrepancies: **0**
- Test-quality observations: **1**
- Missing mandatory tests: **0**
- Focused tests: **441 passed, 0 failed**

**Delegated audit result: PASS.** The assigned use cases implement the sovereign `change.schemaName` rule consistently, and the `EditChange` scope mutation preserves the proposal's intended atomicity under reconciliation failure.

---

# Delivery, CLI, schema, and skill compliance audit

## Audit scope and method

- Change: `schema-workflow-skippable-states`
- Delegated verification attempt: `verification-attempt-8` (not started or completed by this audit)
- Specs audited: `schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`, `core:change-manifest`, `core:archive-change`, `core:approve-spec`, and `core:approve-signoff`
- Inputs: merged `changes spec-preview` views, direct change deltas, project context, direct dependencies reported by change status, graph-first symbol discovery, implementation and tests, and user-facing documentation.
- Graph: not stale (`stale: false`, coverage complete); content health was `CONTENT_UNKNOWN`, so direct reads were used after graph discovery to verify exact behavior.
- Focused test evidence: 8 files / 337 tests passed, covering CLI status/transition, archive, approvals, repository hydration, and generated skill protocols.

## Requirements summary

1. The standard schema exposes optional/disabled workflow flags while retaining the canonical delivery rows and approval anchors.
2. Status renders Core's `availableTransitions`, `availableSteps`, and `nextAction`, annotating optional steps and omitting disabled ones.
3. Transition CLI delegates `--next` to Core rather than maintaining a local state table.
4. Lifecycle skills consume Core routing and suppress hooks for bypassed or disabled intermediate steps.
5. A change's manifest schema identity is sovereign: repository hydration and change-scoped use cases resolve `SchemaProvider.get(change.schemaName)`.
6. Archive, spec approval, and signoff retain their existing gates while no longer comparing a change against the workspace default schema.

## Implementation status by spec

### `schema-std:standard-schema` — compliant

- `packages/schema-std/schema.yaml` declares the five delivery rows (`designing`, `ready`, `implementing`, `verifying`, `archiving`) with explicit `optional: false` and `disabled: false` defaults.
- Drain-only approval states are not declared as workflow rows.
- The merged verification artifact covers row membership and parsing of optional/disabled flags.
- The user documentation now distinguishes all four cases: mandatory; optional with an empty effective set; optional with checks; disabled. It explicitly says the effective set composes registry and schema bindings.

### `cli:change-status` — compliant

- Text and structured rendering use the `GetStatus` projection; text annotates optional rows with `[optional]`, while structured output preserves the optional field.
- Drafted structured output defensively clears transitions, steps, and the command as required.
- Tests directly cover optional annotations, preservation of shortcut transitions, and drafted output.

### `cli:change-transition` — implementation compliant, artifact wording issue

- The CLI passes `to: 'next'` unchanged to `TransitionChange`; there is no local from/to next table.
- Repair guidance consumes `status.nextAction` and Core blockers.
- Tests cover disabled-step advancement, drain-state failures, signed-off drain behavior, and stream separation.
- Finding D-1 below records an inconsistency in the merged requirement's claim about optional-step behavior for `--next`.

### `skills:workflow-automation` — compliant

- Design, implement, verify, and archive templates all require fresh structured status, treat `nextAction.command` as canonical, and restrict targets to `lifecycle.availableTransitions`.
- Templates explicitly prohibit hooks for bypassed/disabled intermediate steps. Implement and verify contain phase-specific guards for bypassing `implementing`/`verifying`.
- Protocol tests assert the dynamic-routing phrases in generated copies and reject fixed routing recipes.
- Documentation consistently states that skills do not inspect tasks/YAML or reinterpret an empty skip-check set; Core chooses the recommendation.

### `core:change-manifest` — compliant

- `FsChangeRepository` hydrates a change from the manifest schema identity even when the workspace default name differs.
- The repository test verifies successful hydration with a different active schema and preserves the manifest schema name.
- Version mismatch remains advisory.

### `core:archive-change` — implementation compliant, contradictory legacy test

- `ArchiveChange.execute` loads the change first and resolves `SchemaProvider.get(loadedChange.schemaName)` before reconciliation and peer discovery.
- A positive test proves a custom recorded schema is requested and archive succeeds even when the provider's default is different.
- Finding D-2 documents a retained legacy test whose title/assertion still treats a default-name mismatch as a required `SchemaMismatchError`.

### `core:approve-spec` — compliant

- Disabled gate remains the first check and therefore performs no repository I/O.
- After loading, the use case resolves `SchemaProvider.get(change.schemaName)`.
- A dedicated test proves the sovereign named lookup and successful historic drain behavior.

### `core:approve-signoff` — compliant

- Disabled gate remains the first check; the named sovereign schema is loaded before refresh/reconciliation.
- Verification-currentness and atomic fingerprint requirements remain distinct and unchanged.
- A dedicated test proves the named lookup and successful historic drain behavior.

## Discrepancies and findings

### D-1 — Medium — `cli:change-transition` merged requirement overstates `--next` optional-step bypass

**Spec evidence:** the merged `Next-transition resolution` requirement says that when intermediate steps are optional and skip checks pass, `--next` advances directly without visiting the bypassed steps.

**Implementation and global-documentation evidence:** `TransitionChange` resolves `to: 'next'` solely with `WorkflowTopology.nextForwardStep`, which returns the closest enabled forward step. `docs/guide/workflow.md` explicitly calls this a topology primitive and says optional policy/furthest shortcut selection belongs to status guidance; agents must follow `nextAction`, not treat `--next` as policy selection. The verification artifact only tests disabled-step skipping and contains no optional-step `--next` scenario.

**Assessment:** code and the detailed workflow guide agree with each other, while the merged CLI requirement is ambiguous/incorrect. Either the requirement must say that `--next` skips disabled rows only and that optional shortcut choice comes from an explicit Core-projected target, or Core must change `--next` and add an optional-step test. The first interpretation best matches the design and existing documentation.

**Impact:** a consumer reading only the normative CLI spec may expect `--next` to perform conditional optional-step selection that it does not perform.

### D-2 — Low — archive test suite retains an assertion for the superseded schema-mismatch contract

**Evidence:** `packages/core/test/application/use-cases/archive-change.spec.ts` still contains `given the active schema name differs ... throws SchemaMismatchError`, constructed with a provider whose only schema has another name. The same suite also contains the new positive sovereign-schema test.

**Assessment:** production behavior is correct because it requests the recorded name. The older test passes only because the test provider represents an unresolved named lookup as `SchemaMismatchError`; this conflicts with the merged requirement that default-name mismatch itself must not produce that error and unresolved sovereign references propagate not-found/validation errors.

**Impact:** the suite encodes two competing interpretations and could legitimize regression to workspace-default comparison. Rename/reframe it as an unresolved-provider error test using the canonical error, or remove it in favor of the sovereign-schema case.

## Test coverage

| Area                                       | Evidence                                                        | Result                                 |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------- |
| Standard workflow flags                    | schema parser/build/topology suites plus schema YAML inspection | Covered                                |
| Status optional/disabled projection        | CLI status tests, including structured and text output          | Covered                                |
| Transition delegation and disabled skip    | CLI transition and Core transition tests                        | Covered                                |
| Skill dynamic routing and hook suppression | generated-skill protocol and template workflow tests            | Covered                                |
| Manifest schema sovereignty                | filesystem change repository test                               | Covered                                |
| Archive schema sovereignty                 | positive named-schema archive test                              | Covered, with D-2 legacy contradiction |
| Approval schema sovereignty                | approve-spec and approve-signoff named-schema tests             | Covered                                |
| Optional `--next` semantics                | No scenario demonstrating conditional optional bypass           | Missing/ambiguous per D-1              |

Focused execution result: **337/337 tests passed**. Passing tests do not resolve D-1 because the normative optional `--next` claim lacks a corresponding scenario.

## Missing or insufficient tests

1. Add a CLI/Core acceptance scenario fixing the chosen meaning of `--next` when the immediate enabled step is optional. Under the current design it should assert that `--next` enters that closest step while `GetStatus.nextAction.targetStep` may recommend a farther explicit shortcut.
2. Replace the legacy archive mismatch test with a canonical unresolved-sovereign-schema error assertion; keep the existing successful named-resolution test.

## Spec dependency chain and consistency

- `schema-std:standard-schema` depends on `core:workflow-model`; the delivery rows and optional/disabled vocabulary conform.
- `cli:change-status` depends on `core:get-status`, `core:transition-checks`, and `core:lifecycle-engine`; its rendering is projection-only and conformant.
- `cli:change-transition` depends on `core:transition-change` and `core:lifecycle-engine`; delegation is conformant, but D-1 is inconsistent with the topology primitive documented globally.
- `skills:workflow-automation` depends on the CLI status/transition specs and Core status/checks. Its templates correctly consume Core's projection and do not duplicate optional policy.
- `core:change-manifest`, `core:archive-change`, `core:approve-spec`, and `core:approve-signoff` conform to `core:change`, schema-provider, composition, and transition-check dependencies by resolving the schema identity recorded on the change.
- No conflict was found with project-wide architecture guidance. The only cross-document conflict is D-1 between the merged CLI requirement and the workflow guide/current implementation.

## Summary counts

- Specs audited: **8**
- Fully compliant: **6**
- Implementation compliant with artifact/test debt: **2**
- Findings: **2** (`0` high, `1` medium, `1` low)
- Missing/insufficient focused test cases: **2**
- Focused tests: **337 passed, 0 failed**

## Audit conclusion

The implementation behavior is coherent across schema, Core projections, CLI rendering, sovereign schema resolution, and lifecycle skills. Documentation now answers the optional-step ambiguity correctly: an empty effective skip-check set is an unconditional bypass recommendation, a non-empty set is conditional, disabled removes the step, and skills follow Core. Compliance is not fully clean because the normative `cli:change-transition` wording still assigns optional-policy selection to `--next`, and the archive suite retains one legacy mismatch assertion. D-1 should be resolved before declaring artifact-to-implementation compliance complete.
