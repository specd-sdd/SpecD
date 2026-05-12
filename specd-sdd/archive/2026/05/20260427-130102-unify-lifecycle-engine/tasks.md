# Tasks: unify-lifecycle-engine

## 1. Engine

- [x] 1.1 Create `LifecycleEngine` as the schema-aware lifecycle interpreter
      `packages/core/src/domain/services/lifecycle-engine.ts`: `LifecycleEngine`
      Approach: implement `evaluate(change, schema, options)` as the single entrypoint that derives effective artifact statuses, blockers, review summary, step availability, next action, and optional transition routing.
      (Req: core:lifecycle-engine Centralized validation logic)
- [x] 1.2 Implement recursive effective-status propagation
      `packages/core/src/domain/services/lifecycle-engine.ts`: internal effective-status traversal
      Approach: derive `pending-parent-artifact-review` from persisted aggregate artifact states plus schema `requires` recursion; do not rely on entity-owned DAG helpers.
      (Req: core:lifecycle-engine Effective artifact status computation)
- [x] 1.3 Implement structured blocker derivation
      `packages/core/src/domain/services/lifecycle-engine.ts`: blocker/reporting helpers
      Approach: emit machine-readable blocker codes with grouped affected artifact/file detail for drift, review, parent-review, overlap, approval, and transition failures.
      (Req: core:lifecycle-engine Machine-readable blockers)
- [x] 1.4 Implement step evaluation and routing
      `packages/core/src/domain/services/lifecycle-engine.ts`: step/routing helpers
      Approach: compute `available`, `isReady`, `isPermitted`, `blockingArtifacts`, `blockers`, and `effectiveTarget` using workflow `requires`, approval gates, and `VALID_TRANSITIONS`.
      (Req: core:lifecycle-engine Available steps and next action)
- [x] 1.5 Add debug logging inside `LifecycleEngine`
      `packages/core/src/domain/services/lifecycle-engine.ts`
      Approach: use the shared `Logger` to trace requested target, blocker codes, rerouting, next-action derivation, and recursive parent-review downgrades without logging full artifact contents.
      (Req: core:lifecycle-engine Shared lifecycle interpretation for consumers)

## 2. Entity Boundary

- [x] 2.1 Remove schema-aware effective-status authority from `Change`
      `packages/core/src/domain/entities/change.ts`: effective-status helpers
      Approach: remove or demote DAG-aware helpers such as `effectiveStatus()` / recursive blocker lookup so schema interpretation no longer lives on the entity API.
      (Req: core:change Lifecycle)

## 3. Consumer Refactors

- [x] 3.1 Refactor `GetStatus` to project engine output
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus`
      Approach: inject `LifecycleEngine`, replace private lifecycle derivation, and map engine verdicts into `artifactStatuses`, `review`, `blockers`, `nextAction`, and lifecycle context fields.
      (Req: core:get-status modified)
- [x] 3.2 Refactor `CompileContext` to use engine-based step availability
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext`
      Approach: replace manual workflow readiness checks with engine evaluation while preserving `stepAvailable` and `blockingArtifacts` as compatibility projections.
      (Req: core:compile-context modified)
- [x] 3.3 Refactor `TransitionChange` to use engine-based routing and blockers
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange`
      Approach: ask the engine for `effectiveTarget` and transition blockers, then keep hook execution and persistence around that result.
      (Req: core:transition-change modified)
- [x] 3.4 Refactor `ValidateArtifacts` dependency checks to use engine output
      `packages/core/src/application/use-cases/validate-artifacts.ts`: dependency-order validation
      Approach: replace entity-owned effective-status queries with engine-derived dependency statuses and recursive blocker context.
      (Req: core:validate-artifacts modified)
- [x] 3.5 Refactor `GetArtifactInstruction` auto-selection to use engine output
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`: auto-resolve next artifact
      Approach: replace local next-artifact DAG logic with engine-derived readiness so authoring guidance matches status and transition semantics.
      (Req: core:get-artifact-instruction modified)
- [x] 3.6 Add debug projection logs in affected use cases
      `packages/core/src/application/use-cases/{get-status,compile-context,transition-change,validate-artifacts,get-artifact-instruction}.ts`
      Approach: log the engine verdict at the projection boundary so blocked/rerouted decisions can be debugged consistently across status, context, transition, validation, and instruction flows.
      (Req: core:lifecycle-engine Shared lifecycle interpretation for consumers)

## 4. Composition

- [x] 4.1 Wire `LifecycleEngine` through core composition and kernel assembly
      `packages/core/src/composition/use-cases/*.ts`, `packages/core/src/composition/kernel*.ts`
      Approach: instantiate/inject one shared `LifecycleEngine` dependency across `GetStatus`, `CompileContext`, `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction`.
      (Req: core:lifecycle-engine Shared lifecycle interpretation for consumers)

## 5. CLI Alignment

- [x] 5.1 Update `change status` serialization/spec behavior
      `packages/cli/src/commands/change/status.ts`
      Approach: keep the command output aligned with the engine-derived `GetStatus` contract for blockers, review, transitions, and next-action reporting.
      (Req: cli:change-status modified)
- [x] 5.2 Update `change context` serialization/spec behavior
      `packages/cli/src/commands/change/context.ts`
      Approach: keep step-availability warnings and rendered `availableSteps` aligned with engine-derived `CompileContext` semantics.
      (Req: cli:change-context modified)
- [x] 5.3 Update `change transition` serialization/spec behavior
      `packages/cli/src/commands/change/transition.ts`
      Approach: keep success/failure messaging and repair-guide behavior aligned with engine-derived routing/blockers from `TransitionChange` and `GetStatus`.
      (Req: cli:change-transition modified)
- [x] 5.4 Update `change validate` serialization/spec behavior
      `packages/cli/src/commands/change/validate.ts`
      Approach: preserve engine-derived dependency-block descriptions from `ValidateArtifacts` without recomputing semantics in the CLI.
      (Req: cli:change-validate modified)
- [x] 5.5 Update `change artifact-instruction` serialization/spec behavior
      `packages/cli/src/commands/change/artifact-instruction.ts`
      Approach: preserve engine-derived auto-selection semantics from `GetArtifactInstruction`.
      (Req: cli:change-artifact-instruction modified)

## 6. Tests

- [x] 6.1 Add unit tests for `LifecycleEngine`
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`
      Approach: cover recursive dependency blocking, drift/review derivation, structured blockers, approval routing, and next-action selection.
- [x] 6.2 Update `GetStatus` tests
      `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: assert engine delegation and result projection for effective statuses, review summary, blockers, and next action.
- [x] 6.3 Update `CompileContext` tests
      `packages/core/test/application/use-cases/compile-context.spec.ts`
      Approach: assert `availableSteps` enrichment and compatibility projections (`stepAvailable`, `blockingArtifacts`).
- [x] 6.4 Update `TransitionChange` tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`
      Approach: assert engine-based routing, approval gates, and blocker-driven transition failures.
- [x] 6.5 Update `ValidateArtifacts` tests
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
      Approach: assert dependency-order failures use engine-reported effective statuses and recursive blocker context.
- [x] 6.6 Update `GetArtifactInstruction` tests
      `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts`
      Approach: assert omitted `artifactId` uses engine-derived next-artifact selection.
- [x] 6.7 Update composition/kernel wiring tests
      `packages/core/test/composition/kernel*.spec.ts`
      Approach: assert affected use cases are assembled with the shared `LifecycleEngine` dependency rather than fallback local logic.
- [x] 6.8 Update CLI command tests/spec coverage where present
      `packages/cli/test/commands/change/*.spec.ts`
      Approach: assert status/context/transition/validate/instruction commands project the updated core semantics without recomputing lifecycle logic.
- [x] 6.9 Add focused logging tests where practical
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`, affected use-case tests
      Approach: assert key debug calls are emitted for blocker derivation, rerouting, and omitted-artifact auto-selection without relying on brittle full-log snapshots.

## 7. Verification

- [x] 7.1 Verify recursive dependency blocking is consistent across status, context, validation, instruction selection, and CLI surfaces
      Approach: put an upstream artifact in review state and confirm all surfaces agree on the downstream block.
- [x] 7.2 Verify protocol-blocked but structurally-ready transitions
      Approach: enable `approvals.spec`, request `implementing`, and confirm the engine reports `isReady: true`, `isPermitted: false`, and routes to `pending-spec-approval`.
- [x] 7.3 Verify overlap bypass semantics
      Approach: trigger `OVERLAP_CONFLICT`, pass the bypass flag, and confirm the blocker downgrades to a warning while transition permission remains true.
- [x] 7.4 Verify CLI serializers do not re-derive conflicting lifecycle semantics
      Approach: compare core outputs and CLI-rendered outputs for the same blocked change and confirm the CLI only projects the core verdict.
- [x] 7.5 Verify composition wiring is the only lifecycle-interpretation path
      Approach: exercise affected use cases through normal kernel assembly and confirm no caller retains direct entity-based DAG interpretation.
- [x] 7.6 Verify debug logs explain lifecycle decisions
      Approach: enable debug logging during blocked/rerouted flows and confirm the logs explain the same blocker codes, parent dependencies, and effective targets returned by the API.
