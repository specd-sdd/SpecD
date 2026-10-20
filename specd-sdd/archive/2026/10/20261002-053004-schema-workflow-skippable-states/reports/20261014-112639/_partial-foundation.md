# Delegated compliance audit — workflow foundation

- Change: `schema-workflow-skippable-states`
- Attempt: `verification-attempt-10`
- Scope: `core:workflow-model`, `core:check-registry`, `core:transition-checks`, `core:transition-change`, `core:lifecycle-engine`, `core:workflow-topology`
- Result: **issues found** (2 major)

## Requirements and intent summary

The six merged specs contain 88 requirements and 260 verification scenarios:

| Spec                     | Requirements | Scenarios | Intended contract                                                                                                                           |
| ------------------------ | -----------: | --------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:workflow-model`    |           14 |        53 | Optional/disabled workflow rows, two-block `checks`/`skipChecks` grammar, sovereign change schema, artifact/task gates and hook boundaries. |
| `core:check-registry`    |            7 |        25 | Open registry, step-skip coordinates, duplicate prevention, immutable built-ins and monotonic governance/configuration locks.               |
| `core:transition-checks` |           19 |        52 | Transition/step-skip attempts, dynamic binding composition, cascading config, predicate/effect execution and projections.                   |
| `core:transition-change` |           30 |        77 | Sovereign-schema transition execution, topology-owned legality, deterministic `next`, bypass checks, hook suppression and persistence.      |
| `core:lifecycle-engine`  |           12 |        38 | Shared pure verdict, topology-aware available transitions/next action, optional-step routing and verification boundaries.                   |
| `core:workflow-topology` |            6 |        15 | Canonical bedrock, declared delivery order, disabled-step removal, shortcut legality, bypass detection and next-forward resolution.         |

The proposal/design intent is consistent and explicit on the central point: schemas, not skills or CLI adapters, own optionality; status guidance and mutation must share topology/check semantics; an optional step is bypassable unconditionally only when its **effective** skip-check set is empty, otherwise every applicable skip predicate must pass.

## Implementation status

Implemented and covered:

- `WorkflowStep`, YAML parsing and schema building preserve `optional`, `disabled`, `checks` and `skipChecks`.
- Registry/binding models support `scope: 'step-skip'`, governance flags and plugin checks.
- `resolveEffectiveBindings` overlays target checks and bypassed-step checks, filters permitted disablements and deep-merges config.
- `TransitionChange` resolves `change.schemaName`, derives bypassed steps through `WorkflowTopology`, composes effective bindings, evaluates each bypassed step under a `step-skip` attempt, and does not run bypassed hooks.
- `WorkflowTopology` normalizes bedrock positions, preserves declared delivery order, threads approval snapshots, excludes disabled states and exposes legal/bypassed/next queries.
- Lifecycle verdict/guidance uses the topology and can prefer the furthest predicate-filtered shortcut.

Focused verification executed:

```text
8 test files passed
356 tests passed
```

Files: workflow topology, registry, transition checks, transition change, lifecycle engine, YAML parser, schema builder and schema-layer merge suites.

## Discrepancies

### MAJOR F-1 — Status guidance does not evaluate bypassed-step `step-skip` predicates

**Spec/intent:** `core:lifecycle-engine` requires passing skip checks to recommend bypass and failed skip checks to recommend entry into the optional step. `core:transition-checks` requires bypassed steps to incorporate schema `skipChecks`. The design says both `TransitionChange` and `GetStatus` dynamically resolve target and bypass bindings.

**Implementation evidence:**

- `GetStatus` delegates candidate projection to `executeChecksByLegalTargets` (`packages/core/src/application/use-cases/get-status.ts:564`).
- That helper enumerates topology targets but calls `resolveEffectiveBindings` with `targetStep` and `along` only (`packages/core/src/application/services/execute-matching-predicates.ts:351-369`); it neither computes/passes `bypassedSteps` nor executes a `scope: 'step-skip'` attempt.
- In contrast, mutation correctly passes `bypassedSteps` (`packages/core/src/application/use-cases/transition-change.ts:249-263`) and separately executes every step-skip attempt (`:348-374`).

**Observed consequence:** a status projection can expose and recommend `ready -> verifying` even when `workflow.tasksEmpty`, `impl.filesResolved`, `impl.linksInScope`, or a custom schema skip check would reject that same transition. Execution remains safe because `TransitionChange` blocks it, but the canonical next action is misleading and status/execute do not share the promised semantics.

**Spec-vs-code resolution possibilities:**

1. Preferred: fix the status evaluation helper to compute `WorkflowTopology.bypassedSteps`, compose those bindings, execute each bypassed step's `step-skip` predicates, and fold failures into the candidate target results; add GetStatus integration tests for passing, failing, custom, disabled, and empty effective skip-check sets.
2. Alternative: weaken the lifecycle/status specs and proposal so status shortcuts are merely optimistic and execution-only checks decide bypass. This contradicts the stated centralized routing intent and existing failed-skip scenario, so it is not recommended.

**Coverage gap:** lifecycle-verdict unit tests inject already-filtered transition arrays and therefore cannot expose the missing application-layer evaluation. There is no GetStatus test proving a failing built-in/custom step-skip check removes the shortcut and recommends entering the optional step.

### MAJOR F-2 — `done: disabled` has contradictory topology semantics

**Spec/intent:** the topology contract says configurable steps explicitly marked disabled are excluded; shortcuts are admitted across disabled intermediate steps; only `done` with active signoff is forbidden from being disabled. Together these clauses imply that with signoff off, a disabled `done` should be skipped so the prior enabled state can reach bedrock `archivable`.

**Implementation/test evidence:**

- The active pipeline removes all disabled delivery rows (`packages/core/src/domain/services/workflow-topology.ts:280-318`).
- Forward-target computation nevertheless refuses any `archivable` candidate unless the source normalizes to `done` (`:351-355`). Thus disabling `done` makes `archivable` unreachable rather than bypassing the disabled step.
- The unit test explicitly asserts that disabling `done` with signoff off throws because it "breaks the only entry to archivable" (`packages/core/test/domain/services/workflow-topology.spec.ts:136-143`).
- This conflicts with the merged generic disabled-step shortcut rule and with the separately stated rule that `done` is protected only while signoff is active.

**Spec-vs-code resolution possibilities:**

1. If disabled delivery steps are truly skippable, change the archivable boundary so the last enabled delivery state can reach `archivable` when all omitted intermediate states are disabled; replace the contradictory test with successful reachability/legal-transition coverage.
2. If protocol requires `done` unconditionally, change the specs/design to classify `done` as a non-disableable bedrock/mandatory archive anchor regardless of signoff, and reject `done: disabled` directly with an explicit validation error. Current wording does neither.

**Coverage issue:** the existing test locks in one side of the contradiction but there is no scenario clarifying the intended signoff-off behavior or a meaningful disconnected-graph fixture independent of disabling `done`.

## Dependency and global consistency

- Architecture boundary is respected: topology and binding resolution are pure domain services with no I/O.
- `TransitionChange` correctly consumes the sovereign change schema and the shared topology/check machinery.
- Registry, parser, builder and layer-merger dependencies are mutually consistent for step-skip declarations and governance.
- F-1 breaks the promised consistency between `GetStatus`, `TransitionChange`, `transition-checks`, and the lifecycle verdict consumer contract.
- F-2 is an internal contradiction among `workflow-model`, `workflow-topology`, lifecycle routing and the archive protocol boundary; it must be resolved at specification level before a code-only fix is chosen.

## Intent assessment

Most of the proposal's architectural intent is materially implemented: schema-owned topology, separate entry/bypass checks, governance locks, sovereign schema lookup, dynamic transition execution and centralized next-hop logic are present. The implementation is not fully intent-compliant because the read-side router omits the very skip predicates meant to let an agent choose the correct path. The `done` contradiction also leaves schema authors unable to infer which declared disabled configurations are valid.

## Counts

- Specs audited: 6
- Requirements audited: 88
- Verification scenarios reviewed: 260
- Focused tests run/passed: 356/356
- Critical findings: 0
- Major findings: 2
- Minor findings: 0
- Missing integration-test groups: 1 (`GetStatus` step-skip routing)
- Ambiguous/contradictory contract areas: 1 (`done: disabled`)
