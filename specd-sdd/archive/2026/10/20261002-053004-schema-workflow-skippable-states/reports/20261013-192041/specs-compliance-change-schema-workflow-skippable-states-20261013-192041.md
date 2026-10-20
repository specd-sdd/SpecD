# Specs Compliance Audit Report: schema-workflow-skippable-states

- **Mode:** Delegated change audit
- **Verification attempt:** `verification-attempt-9`
- **Report timestamp:** `20261013-192041`
- **Overall result:** **NOT CLEAN**
- **Blocking result:** **1 MAJOR spec-to-spec contradiction**
- **Implementation defects found:** **0**

## Executive Summary

The implementation is broadly coherent with the change proposal and completed design: schema-owned optional/disabled workflow topology, effective `step-skip` evaluation, deterministic nearest-step `--next`, Core-owned shortcut recommendations, sovereign change-schema resolution, hook suppression, documentation semantics, and compatibility with archived `custom-checks-and-resilient-hooks` are implemented and tested.

The audit is nevertheless **NOT CLEAN** because the merged specification set contains one MAJOR contradiction. The new `core:change-manifest` contract and proposal require a change's recorded schema identity to remain sovereign and forbid rejecting hydration merely because the workspace default schema name differs. The existing merged `core:change` requirement still requires throwing `SchemaMismatchError` for that same mismatch. Runtime code follows the proposal/new manifest contract, but both statements cannot remain normative simultaneously.

This is a specification-consistency blocker, not an observed implementation failure. Resolve it in design by updating `core:change` to distinguish an allowed workspace-default mismatch from a genuine provider-integrity mismatch against the requested sovereign schema.

## Verification Evidence

The parent full-verification run completed successfully:

- Core: **3000 tests passed**
- CLI: **1102 tests passed**
- Skills: **64 tests passed**
- Guide: **59 tests passed**
- Lint: **passed**
- Typecheck: **passed**

Additional focused evidence recorded by the partial audits includes 90 CLI status/transition tests and 18 skills workflow-template tests; these are subsets of the parent package totals and are not added again.

## Aggregate Findings

- Critical: **0**
- Major: **1** — merged spec-to-spec contradiction over schema-name mismatch handling
- Minor implementation/spec discrepancies: **0**
- Implementation defects: **0**
- Low-risk test hardening recommendations: **6** across partial reports
- Global disposition: **NOT CLEAN; return to design/spec correction before successful compliance completion**

## Detailed Findings

# Partial compliance audit — Core change-scoped use cases

Mode: delegated change audit  
Change: `schema-workflow-skippable-states`  
Attempt: `verification-attempt-9`  
Scope: `core:transition-change`, `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, `core:change`, plus direct/global dependencies relevant to sovereign schema resolution.

## Requirements Summary

The merged change specs establish one common invariant: after a change or archived change has been identified, every schema-derived decision must resolve the schema recorded on that object (`SchemaProvider.get(change.schemaName)` or `get(archived.schemaName)`), never the current workspace default. Resolution failure must propagate without falling back or creating cross-schema evidence. The individual responsibilities are:

- `TransitionChange`: resolve topology, `next`, bypasses, bindings, predicates, and effects from the change schema.
- `ChangeManifest`: hydrate the root manifest schema as immutable sovereign identity; a different workspace schema name must not reject loading.
- Validation, preview, context, instruction, approval, status, task-counting, invalidation, and editing use cases: base every change-scoped schema decision on that identity.
- `ArchiveChange`, `RunStepHooks`, and `GetHookInstructions`: retain the same authority after archival so archive hooks/instructions and materialization do not silently switch schema.
- `StartVerification` and `ValidityFingerprintService` (specified through `core:change`): use the recorded schema for readiness and every artifact-bearing validity fingerprint.
- Workspace/spec-only operations with no change identity remain allowed to call unnamed `SchemaProvider.get()`.

This matches the proposal's stated intent at `proposal.md:181-182`: `manifest.schema` governs the whole lifecycle and all existing-change use cases must be isolated from the workspace default.

## Implementation Status

### Implemented

All audited production call sites that already possess a `Change` or archived record use a named schema lookup:

- `transition-change.ts:217` — `get(change.schemaName)`.
- `validate-artifacts.ts:176` — `get(change.schemaName)`.
- `run-step-hooks.ts:114,157` — archived and active records both use their recorded name.
- `preview-spec.ts:102`, `get-status.ts:450,758`, `archive-change.ts:282`, `approve-spec.ts:83`, `approve-signoff.ts:95`, `compile-context.ts:271`, `get-artifact-instruction.ts:89`, `get-hook-instructions.ts:94` — named sovereign lookup.
- `edit-change.ts:137`, `invalidate-change.ts:116`, `count-tasks.ts:41`, `start-verification.ts:117`, and `reconcile-change-validity.ts:203` — the previously outstanding change-scoped paths now use `change.schemaName`.
- `change-repository.ts:1346-1354` warns only for a version difference when the schema name is the same; it no longer rejects a different active/workspace schema name. Hydration uses `manifest.schema.name/version` at `change-repository.ts:1450-1451`.
- Archive compatibility is preserved: `ArchiveChange` resolves the loaded change schema before reconciliation; archived `RunStepHooks` and `GetHookInstructions` resolve `archived.schemaName`, so the archived `custom-checks-and-resilient-hooks` hook model continues to select hook entries from the correct schema. No check binding widens hook `onFailure: warn` into check orchestration policy.

Repository-wide inspection found unnamed `SchemaProvider.get()` only in operations without an existing change identity (`ResolveInitialPersistedDependsOn`, `GenerateSpecMetadata`, `ValidateSpecs`, `GetProjectContext`, `GetSpecOutline`, `GetSpecContext`), which is consistent with the design's explicit boundary.

### Partially compliant due to spec conflict

The implementation follows the new sovereign-schema contract, but the merged specification set still contains an unreconciled opposite rule in `core:change`; see D-1.

## Discrepancies

### D-1 — MAJOR — Merged specs simultaneously require and forbid rejecting a workspace/default schema-name mismatch

Evidence:

- The change delta for `core:change-manifest` states that a workspace default name differing from `manifest.schema.name` **MUST NOT** reject loading with `SchemaMismatchError` (`deltas/core/change-manifest/spec.md.delta.yaml:11`).
- The existing merged dependency `core:change` still says: “When a use case detects that `schema.name() !== change.schemaName`, it MUST throw `SchemaMismatchError` before performing any work” (`specs/core/change/spec.md:342`).
- The base `core:change-manifest` also historically contains the rejecting rule (`specs/core/change-manifest/spec.md:73`); its own delta replaces that requirement in its merged preview, but no delta removes or revises the independent contradictory requirement in `core:change`.
- Code implements non-rejection in `packages/core/src/infrastructure/fs/change-repository.ts:1346-1354`, and a regression test proves hydration succeeds with a different active schema name at `packages/core/test/infrastructure/fs/change-repository.spec.ts:2667`.

Spec interpretation: if the surviving `core:change` requirement remains normative, the repository and every newly corrected sovereign lookup are wrong because use cases should compare against the active/default schema and throw. This also conflicts with the proposal's lifecycle-wide sovereign-schema intent and would make the new `ArchiveChange`, hooks, status, and verification behavior internally inconsistent.

Code/change interpretation: the implementation and new `core:change-manifest` delta are correct; the old `core:change` requirement is stale specification text left behind during the sovereignty migration. The appropriate correction is a `core:change` delta that replaces/removes the schema-name mismatch requirement and explicitly distinguishes (a) workspace-default mismatch, which is allowed, from (b) a provider integrity failure returning a schema whose identity does not match the requested sovereign reference, which may still be rejected.

Impact: reviewers cannot determine compliance from the merged specs, and future agents could legitimately reintroduce the forbidden default-schema comparison. This is a specification-consistency blocker for a clean full compliance declaration even though runtime behavior matches the proposal.

## Test Coverage

Strong direct coverage exists for the central invariant:

- Manifest hydration and version advisory: `change-repository.spec.ts:2667,2687`.
- Transition/topology isolation: `transition-change.spec.ts:3657,3923`.
- Active status projection: `get-status.spec.ts:118`.
- Validation: `validate-artifacts.spec.ts:160`.
- Preview: `preview-spec.spec.ts:140`.
- Archive success and provider-integrity rejection: `archive-change.spec.ts:312,330`.
- Approval gates: `approve-spec.spec.ts:389`, `approve-signoff.spec.ts:460`.
- Context and artifact instructions: `compile-context.spec.ts:544`, `get-artifact-instruction.spec.ts:172`.
- Active/archived hook instructions: `get-hook-instructions.spec.ts:200-222`.
- Executable hooks: `run-step-hooks.spec.ts:90`.
- Scope editing and failure atomicity: `edit-change.spec.ts:483-537`.
- Invalidation DAG selection and failure atomicity: `invalidate-change.spec.ts:153-182`.
- Task discovery/counting and failure propagation: `count-tasks.spec.ts:17-51`.
- Verification readiness and no-attempt-on-failure: `start-verification.spec.ts:126-145`.
- Artifact/approval/complete fingerprint selection and failure propagation: `validity-fingerprint-service.spec.ts:172-213`.

These tests generally make sovereign and default schemas observably different, which validates behavior rather than merely asserting a spy argument.

## Missing Tests

1. **LOW:** `GetStatus` explicitly implements `get(draftView.schemaName)` at line 758, but the dedicated sovereignty regression covers an active change only. Add a drafted-change fixture whose recorded schema and workspace default produce observably different workflow/artifact projections.
2. **LOW:** `RunStepHooks` has direct named-lookup coverage for an active change, while the archived fallback is exercised functionally elsewhere but lacks an equally explicit, observably different sovereign/default executable-hook regression. `GetHookInstructions` already covers both active and archived instruction hooks, reducing risk.
3. **LOW:** Several simpler use-case tests assert the named argument but do not all include an explicit resolution-failure/no-fallback case. Failure atomicity is, however, covered at the highest-risk mutation/evidence boundaries (`EditChange`, `InvalidateChange`, `StartVerification`, fingerprints, archive).

## Spec Dependency Chain

```text
proposal sovereign-schema intent
  -> core:change-manifest (persisted schema identity / load semantics)
  -> core:change (aggregate identity, verification and fingerprint semantics)
  -> core:workflow-model + core:workflow-topology + core:schema-format
  -> TransitionChange / GetStatus / ValidateArtifacts / approvals / context / instructions
  -> EditChange / InvalidateChange / CountTasks / StartVerification
  -> ValidityFingerprintService
  -> verification, sign-off, reconciliation and ArchiveChange evidence
  -> archived RunStepHooks and GetHookInstructions
```

The runtime chain consistently carries `change.schemaName`. The only broken link is documentary: the old `core:change` mismatch rule contradicts the new manifest authority rule.

## Summary Counts

- Specs audited: 16 change specs plus relevant direct/global dependencies.
- Fully implemented change-scoped named lookup paths: 18 production call sites (including active/draft and active/archive branches).
- Implementation discrepancies: 0.
- Spec-to-spec discrepancies: 1 MAJOR.
- Missing/insufficient focused tests: 3 LOW.
- Critical findings: 0.
- Major findings: 1.
- Minor findings: 0.
- Overall result: **NOT CLEAN** until D-1 is resolved in the specification set; implementation matches the proposal's intended sovereign-schema behavior.

---

# Compliance Partial — CLI, skills, documentation, and intent

- Change: `schema-workflow-skippable-states`
- Mode: delegated (`verification-attempt-9`); this audit neither started nor completed the attempt
- Scope: `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`, their direct/global dependencies, `proposal.md`, `design.md`, documentation/examples, and archived `custom-checks-and-resilient-hooks`
- Merged-spec source: `changes spec-preview` for all three assigned change specs
- Graph state: `stale: false`, `fingerprintMismatch: false`, coverage complete; content health is `CONTENT_UNKNOWN` because observations are absent, so graph evidence was supplemented with direct focused reads

## Requirements Summary

### `cli:change-status`

1. The adapter must project `GetStatus` lifecycle data without locally recomputing topology or filtering transitions.
2. Optional steps must be annotated, disabled steps omitted, and check-permitted shortcuts preserved in `availableTransitions`.
3. `nextAction`, blockers, labels, repair information, reconciled state, evidence freshness, and schema identity must remain Core-owned projections.
4. Structured and text forms must remain compatible with drafted changes, schema-derived DAGs, task counts, display states, review data, and implementation tracking.

### `cli:change-transition`

1. The CLI must pass explicit targets or literal `to: 'next'` into `TransitionChange`; it must not choose topology routes itself.
2. `--next` means the nearest subsequent enabled step. It skips disabled rows but still enters an enabled optional step.
3. A farther optional shortcut is a separate Core recommendation exposed by `GetStatus.nextAction`; callers enact it using the explicit advertised target.
4. The adapter must pass `skipChecks`, preserve legacy flag translations, expose Core failures through the repair guide, and avoid hooks for unvisited/bypassed steps through Core execution.

### `skills:workflow-automation`

1. Lifecycle skills must begin from fresh structured status and use `nextAction.command` plus `lifecycle.availableTransitions` as the routing authority.
2. Skills must not infer optionality from tasks, YAML, or an empty `skipChecks` field, and must not invent additional bypass policy.
3. Hooks run only for states actually entered/exited; disabled or bypassed intermediate steps receive no hooks.
4. Structural validation is not semantic approval; lifecycle skills must review content and preserve attempt ownership rules.

### Proposal/design intent and documentation semantics

The proposal's central intent is present: schema-owned optional/disabled topology, separate entry checks and `step-skip` checks, dynamic binding composition, Core-owned routing, hook suppression, and sovereign change-schema resolution. The completed design refines the proposal's broad “schema-aware `--next`” wording into a deliberate split: `--next` is nearest-step and deterministic, while `nextAction` owns farther predicate-checked shortcut recommendations. This refinement is explicit in the design, merged specs, implementation, and tests; it is not an accidental divergence.

The documentation now states the four distinct cases correctly:

| Declaration      | Effective skip-check set | Meaning                                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------------------------- |
| neither flag     | irrelevant               | mandatory step                                                            |
| `optional: true` | empty                    | step remains enterable; Core recommends unconditional bypass              |
| `optional: true` | non-empty                | bypass only when every effective binding passes; otherwise enter the step |
| `disabled: true` | none allowed             | step is absent and cannot be entered                                      |

“Effective” explicitly includes registry/plugin bindings as well as inline `skipChecks`. Consequently, `optional: true` plus no inline `skipChecks` does **not** imply “disabled”, and does not necessarily imply an empty effective set. The agent does not choose: Core evaluates the effective set and publishes `nextAction`.

## Implementation Status

### `cli:change-status` — COMPLIANT

- `packages/cli/src/commands/change/status.ts` renders lifecycle transitions, available steps, blockers, and `nextAction` from the status result.
- It does not introduce a second static-transition filter for active changes.
- Tests cover optional annotations, shortcut visibility, disabled-step omission at the projection contract, Core-owned next action, drafted read-only behavior, blocker labels, schema DAGs, evidence, and review output.

### `cli:change-transition` — COMPLIANT

- `packages/cli/src/commands/change/transition.ts:364-374` constructs `requestedTarget` as literal `'next'` when `--next` is used and forwards it unchanged to `kernel.changes.transition.execute`.
- The CLI performs no optionality or shortcut selection. It uses `GetStatus` only for the pre-transition state and post-failure repair guide.
- `packages/cli/test/commands/change/transition.spec.ts:94-120` proves that even when status recommends `verifying`, `--next` remains `{ to: 'next' }` and the mocked Core result enters nearest optional `implementing`; the output is `ready → implementing` and does not claim `verifying`.
- Existing tests cover explicit targets, unavailable-next failures, `skipChecks`, legacy aliases, repair guides, hook selectors, structured progress, and pending approval states.

### `skills:workflow-automation` — COMPLIANT

- All four generated lifecycle templates (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) demand fresh structured status, honor `nextAction.command`, restrict targets to `availableTransitions`, and prohibit hooks for bypassed/disabled states.
- The templates explicitly stop when status routes to another skill instead of falling back to a hardcoded lifecycle recipe.
- `packages/skills/test/template-workflow.spec.ts` asserts the routing contract across generated templates, including the `availableTransitions` and `nextAction.command` protocol.

### Documentation/examples — COMPLIANT

- `docs/guide/custom-schemas.md:71-97` gives a four-case decision table and defines effective registry-plus-inline bindings.
- `docs/guide/schemas.md:165-172`, `docs/schemas/schema-format.md:704-718`, and `docs/core/custom-checks.md:118` consistently distinguish optional from disabled and assign route choice to Core.
- Generated guide content in `packages/guide/src/infrastructure/generated/guides.ts` contains the updated wording, so source docs and shipped on-demand guide data are aligned.
- The custom-schema example without inline `skipChecks` is no longer misleading because the adjacent explanation says registry bindings can still make it conditional (notably `workflow.tasksEmpty` for `implementing`).

### Archived `custom-checks-and-resilient-hooks` compatibility — COMPLIANT

- The archived contract introduced the open check registry, uniform `skipChecks`, governance, dynamic failure projection, and legacy CLI translations.
- The present implementation retains those contracts while adding the orthogonal `step-skip` scope and topology behavior.
- CLI still compiles `--allow-out-of-scope` and `--allow-overlap` into `skipChecks`; Core input remains free of the legacy booleans.
- Repair guides still project check labels, remediation commands, and bypass advice only for skippable checks.
- No contradiction or regression was found between archived intent and the merged current specs.

## Discrepancies

No correctness or specification discrepancies found.

### Clarification reviewed: proposal phrase “schema-aware `--next` advancement” — NOT A FINDING

- **Possible spec-drift interpretation:** read alone, the proposal phrase could be interpreted as requiring `--next` to take the farthest passing optional shortcut.
- **Possible implementation-bug interpretation:** under that isolated reading, forwarding `'next'` to nearest-step resolution would appear too conservative.
- **Resolution/evidence:** the completed design explicitly separates nearest-step `--next` from Core's farther `nextAction` shortcut (`design.md`, “Core-owned optional-path recommendation” and testing strategy). The merged `cli:change-transition` delta says the same, and its verify scenario requires the explicit `GetStatus.nextAction` target for the optional shortcut. Proposal intent is still fulfilled because `--next` is schema-aware (disabled steps are absent from topology) without conflating a convenience one-hop operation with conditional orchestration guidance.

### Clarification reviewed: `optional: true` plus omitted/empty inline `skipChecks` — NOT A FINDING

- **Possible documentation/spec-drift interpretation:** an example with no inline checks could look like an accidental alias for disabled or unconditional behavior.
- **Possible implementation-bug interpretation:** registry bindings might appear to violate the apparent empty YAML declaration.
- **Resolution/evidence:** all current guides define the _effective_ set as registry/plugin plus inline declarations. Only an actually empty effective set passes vacuously. An optional step remains present and explicitly enterable; a disabled step is removed and may not declare skip checks. The agent follows Core's projected route.

## Test Coverage

Focused execution performed during this audit:

- CLI status + transition suites: **2 files, 90 tests passed**.
- Skills workflow-template suite: **1 file, 18 tests passed**.

Coverage mapped to assigned requirements:

- `--next` literal forwarding and nearest optional entry despite a farther status recommendation: directly covered.
- Optional annotation and available shortcut projection in status: directly covered.
- Core-owned `nextAction` rather than CLI recomputation: directly covered.
- Dynamic skill routing and hook suppression language: template assertions cover all lifecycle templates.
- Custom checks, legacy aliases, skippability, and repair guide compatibility from the archived change: directly covered in transition CLI tests.
- Documentation delivery: generated-guide source contains the corrected semantics; the broader guide suite is handled by the parent full-verification matrix.

## Missing Tests

No blocking missing tests.

Low-priority hardening opportunity (not a compliance failure): add a narrow guide snapshot/assertion that explicitly checks the complete four-row optional/disabled table and the phrase that effective bindings include registry plus inline declarations. Current generated content is correct, and broader guide synchronization tests protect generation, but a semantic wording assertion would make accidental future ambiguity more obvious.

## Dependency Chain

- `cli:change-status` → `core:get-status` → lifecycle verdict/check evaluation → `core:workflow-topology` + `core:transition-checks` + sovereign schema.
- `cli:change-transition` → `core:transition-change` → `WorkflowTopology.nextForwardStep` for literal `'next'`, or explicit-target legality/bypass evaluation → effective transition and `step-skip` bindings → source/target hooks.
- `skills:workflow-automation` → structured `changes status` (`nextAction`, `availableTransitions`) → explicit lifecycle skill/target → CLI transition; skills do not reproduce Core policy.
- Schema authorship → `optional`/`disabled` + registry bindings + inline `skipChecks` → Core effective set → status recommendation; documentation mirrors this chain.
- Archived `custom-checks-and-resilient-hooks` → registry/governance/`skipChecks` foundation → current change's `step-skip` topology extension; compatibility remains additive.

Graph impact classified `packages/cli/src/commands/change/transition.ts` as HIGH risk and exposed dependencies through CLI helpers, formatter/error presentation, SDK host context, and Core composition. Focused adapter tests plus the parent full test matrix are proportionate to that risk.

## Summary counts

- Assigned change specs audited: **3**
- Intent/design documents audited: **2**
- Archived baseline changes cross-checked: **1**
- Documentation families checked: **4** (custom schemas, schema overview, schema format, custom checks; plus generated guide payload)
- Focused tests passed: **108**
- Critical discrepancies: **0**
- High discrepancies: **0**
- Medium discrepancies: **0**
- Low discrepancies: **0**
- Non-blocking hardening opportunities: **1**
- Overall result: **COMPLIANT**

---

# Partial compliance audit — topology and checks

- Change: `schema-workflow-skippable-states`
- Verification attempt: `verification-attempt-9`
- Mode: delegated (the caller owns attempt completion)
- Scope: `core:workflow-model`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`, `core:lifecycle-engine`, `schema-std:standard-schema`, their direct dependencies, the global architecture constraints, and the change proposal/design intent.

## Requirements Summary

### Workflow topology

The merged specifications require one authoritative progression axis with four protocol-owned bedrock anchors (`drafting`, `designing`, `archivable`, `archiving`), an author-ordered delivery segment, canonical insertion of omitted delivery states, removal of disabled rows, and preservation of optional metadata. Forward shortcuts may cross only optional or disabled intermediate states; disabled states are absent from the active graph. Backward/redesign edges remain constrained by the protocol transition table.

### Optional, disabled, and skip checks

The merged `core:workflow-model` contract is unambiguous:

- `optional: true` means that Core may expose a shortcut across the still-active step.
- Core evaluates every effective `step-skip` predicate for the bypassed step.
- If the effective `step-skip` set is empty, bypass is unconditionally permitted.
- `disabled: true` removes the step from the active axis and legal graph.
- Schema authors decide optionality; Core decides whether a concrete bypass passes; skills consume Core projections and do not decide either policy.

Therefore `optional: true` plus an empty effective skip-check set is **not** equivalent to disabled. The optional step remains a legal explicit destination and appears in the active pipeline; only its shortcut is unconditional. This resolves the documentation concern without semantic contradiction.

### Registry and binding governance

The specs require a dedicated `step-skip` attempt/applicability scope, coordinate uniqueness, registry existence checks, confinement/policy/config/disablement locks, and dynamic composition of base plus schema bindings. Built-in implementing-bypass policy must include `workflow.tasksEmpty`, `impl.filesResolved`, and `impl.linksInScope`.

### Lifecycle and standard schema

Lifecycle projections must derive legal targets and preferred guidance from the shared topology and predicate results. A disabled verification step removes the verification boundary. The standard schema must retain the canonical delivery rows, support `optional`/`disabled`, keep approval gates as checks, and prohibit disabling bedrock states.

## Implementation Status

### Compliant: canonical bedrock normalization and author order

`WorkflowTopology.rawActivePipeline` validates disabled bedrock/approval anchors, removes bedrock rows from the author segment, inserts omitted canonical delivery rows without moving declared delivery rows, then wraps the delivery segment in canonical bedrock positions (`packages/core/src/domain/services/workflow-topology.ts:241-318`). This matches both the merged topology spec and the corrected design algorithm.

Evidence:

- Bedrock constants and canonical delivery states: `workflow-topology.ts:22-48`.
- Author delivery order and deterministic omitted-state insertion: `workflow-topology.ts:280-299`.
- Canonical bedrock wrapping and disabled filtering: `workflow-topology.ts:301-318`.
- Tests normalize explicitly misordered bedrock rows and preserve noncanonical delivery order: `packages/core/test/domain/services/workflow-topology.spec.ts:57-105`.

This is also coherent with `core:workflow-model`: workflow-array order remains the progress axis for configurable delivery rows, while `core:workflow-topology` explicitly owns normalization of protocol bedrock anchors. The two specs describe different layers of the same rule and no longer contradict each other.

### Compliant: legal edges, bypass detection, and reachability

Forward candidates are derived from the active pipeline; a farther candidate is admitted only while every active intermediate step is optional (`workflow-topology.ts:334-380`). Disabled intermediates have already been filtered, so they neither block nor appear in `bypassedSteps`. Canonical entry boundaries for `archivable` and `archiving` remain enforced. Backward/redesign destinations are admitted only through `VALID_TRANSITIONS`, not merely because of pipeline position.

Tests cover optional shortcut admission, disabled target exclusion, protocol-only backward edges, bypass lists, disabled bypass exclusion, approval-snapshot propagation, terminal next-step behavior, and disconnected topology (`workflow-topology.spec.ts:136-143`, `190-318`).

### Compliant: optional versus disabled behavior

The implementation preserves `optional` on active pipeline rows and filters only `disabled` rows (`workflow-topology.ts:274-318`). It consequently retains the immediate optional step as an explicit target while allowing a farther checked target. `recommendedForwardTarget` only selects among predicate-filtered `availableTransitions`; it prefers the furthest candidate across a consecutive optional run and falls back to entering the optional step when the shortcut is unavailable (`packages/core/src/domain/services/lifecycle-verdict.ts:971-999`).

Tests exercise both paths and the empty-effective-set rule (`packages/core/test/domain/services/lifecycle-verdict.spec.ts:53-110`). The empty-set test supplies the already filtered target set, so it verifies the intended verdict-level contract: no failed or missing predicate prevents the shortcut.

### Compliant: `step-skip` registry and effective binding composition

`resolveEffectiveBindings` overlays target transition checks and bypassed-step skip checks, applies disabled filtering, cascades registry/binding/step config, preserves policy flags, and synthesizes bindings for known registered checks (`packages/core/src/domain/services/transition-checks.ts:556-711`).

`buildSchema` validates skip-check registration, coordinate uniqueness, confinement, policy, disablement, and configuration locks (`packages/core/src/domain/services/build-schema.ts:864-930`). CheckRegistry uses a step-sensitive coordinate for `step-skip`, preventing duplicate binding coordinates while allowing the same check on different steps.

Built-in bindings match proposal and design intent:

- `workflow.tasksEmpty` on implementing bypass, non-skippable and non-disableable (`packages/core/src/domain/services/check-bindings.ts:51-56`).
- `impl.filesResolved` on implementing bypass, non-skippable (`check-bindings.ts:67-76`).
- `impl.linksInScope` on implementing bypass, CLI-skippable (`check-bindings.ts:77-85`).

This means an optional `implementing` row with no schema-local `skipChecks` is not necessarily an empty effective set: kernel bindings still apply. An empty **schema array** and an empty **effective binding set** are intentionally different concepts.

### Compliant: disabled verification boundary and lifecycle guidance

Lifecycle renewal logic first asks `WorkflowTopology.isStepEnabled('verifying', schema)` and removes the verification boundary when disabled (`packages/core/src/domain/services/lifecycle-verdict.ts:936-948`). Guidance uses the ordered topology and predicate-filtered transitions rather than hardcoded single-step progression (`lifecycle-verdict.ts:971-999`). This implements the proposal's no-verification and no-guidance-loop intent.

### Compliant: architecture and dependency constraints

`WorkflowTopology` remains a pure domain service: its imports are domain error/value objects only and it performs no I/O. The dependency direction is consistent with `default:_global/architecture`. `schema-std:standard-schema` depends on `core:workflow-model` contractually but the package implementation remains distribution-only and does not create a workspace dependency cycle.

## Discrepancies

No blocking or non-blocking spec/code discrepancy was found in the assigned scope.

The initially suspected contradiction between `core:workflow-model` (“workflow array order is the progress axis”) and `core:workflow-topology` (canonical bedrock normalization) is resolved by the merged wording and implementation:

- **Spec interpretation:** author order governs configurable delivery rows; protocol-owned bedrock rows cannot relocate the anchors.
- **Code interpretation:** `deliverySteps` preserves declared delivery relative order, while bedrock declarations contribute attributes through `declaredMap` and are reinserted canonically.

These interpretations agree. There is no basis to classify either spec drift or implementation defect.

## Test Coverage

The relevant implementation is covered across:

- `workflow-topology.spec.ts`: canonical defaults, optional flags, disabled filtering, bedrock normalization, author delivery order, approval anchors, reachability, legal shortcuts, backward-edge protection, bypass detection, and next-step behavior.
- `transition-checks.spec.ts`: `step-skip` matching, built-in bindings, governance preservation, config cascade, disabled filtering, and synthesized bindings.
- `build-schema.spec.ts`: unknown and duplicate skip checks, confinement and monotonic locks, disabled-step incompatibility, and valid parsing/storage.
- `check-registry.spec.ts`: step-sensitive duplicate coordinates and per-step registrations.
- `lifecycle-verdict.spec.ts`: immediate optional entry, checked shortcut, fallback when shortcut predicates fail, empty effective skip-check set, and consecutive optional runs.
- `lifecycle-engine.spec.ts`: disabled verification behavior and forward archive guidance.
- Schema parser and schema-std tests cover `optional`/`disabled` parsing and standard workflow shape.

Fresh delegated evidence: `pnpm --filter @specd/core test -- workflow-topology transition-checks lifecycle-verdict build-schema check-registry` completed successfully with **236 test files and 3000 tests passed**. Vitest executed the full core suite under the package script.

## Missing Tests

No missing test blocks compliance. Two low-risk improvements would make the intent more explicit:

1. Add an integration-style status/transition fixture for an optional step other than `implementing`, with no kernel or schema `step-skip` bindings, proving end-to-end that both explicit entry and unconditional shortcut remain available. Current coverage proves the rule at verdict level, while implementing has intentional kernel bindings.
2. Add one topology fixture combining misordered explicit bedrock rows with a noncanonical but reachable delivery order in the same schema. Existing tests cover these independently, which is adequate but less regression-resistant than the combined case.

## Dependency Chain

```text
schema-std:standard-schema
  -> core:workflow-model
       -> core:workflow-topology
            -> ChangeState / VALID_TRANSITIONS
            -> core:schema-format
            -> default:_global/architecture

core:check-registry
  -> core:transition-checks
       -> resolveEffectiveBindings
       -> step-skip applicability/attempt

core:lifecycle-engine
  -> core:workflow-topology
  -> core:transition-checks predicate projections
  -> lifecycle verdict and guidance
```

The proposal/design intent is represented across this chain: schema authors declare policy, Core validates topology/governance and evaluates checks, and lifecycle consumers/skills consume Core-owned projections.

## Summary counts

- Assigned merged specs audited: **6**
- Direct/global dependency families checked: **3** (`core:schema-format`, lifecycle/change state protocol, global architecture)
- Proposal/design intent areas checked: **5** (topology, optional/disabled semantics, step-skip grammar, governance/effective bindings, lifecycle guidance/boundary)
- Blocking discrepancies: **0**
- Non-blocking discrepancies: **0**
- Missing-test recommendations: **2 low-risk**
- Fresh tests: **3000 passed, 0 failed**
- Result: **PASS for the assigned topology/checks scope**
