# Topology and checks audit

## Scope

`core:workflow-model`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`, and `core:transition-change`, including the archived baseline `custom-checks-and-resilient-hooks`.

## Requirements and implementation

- The implementation contains the intended central `WorkflowTopology`, schema-level `checks`/`skipChecks`, optional/disabled step semantics, dynamic effective binding resolution, step-skip attempts, sovereign-schema lookup, and `--next` routing.
- The archived open-registry model is preserved: checks remain predicate capabilities, hooks remain effects, governance locks remain monotonic, runtime bypass remains distinct from declarative disablement, and effective configuration remains cascaded.
- Merged verification artifacts expose direct scenarios for topology legality, bypassed-step checks, governance locks, disabled steps, sovereign schemas, hook suppression, and dynamic status projection.

## Test coverage

- `@specd/core`: 236 files / 2,970 tests passed.
- The passing runtime tests cover the major proposal paths, including disabled/optional hops, step-skip checks, schema declarations, status projection, and transition execution.

## Findings

### Blocking: Core type contracts do not compile

`pnpm typecheck` fails in the audited surface:

- `application/checks/protocol-edge.ts` and `domain/checks/protocol-edge.ts` pass `approvals | undefined` to a contract requiring concrete approvals under `exactOptionalPropertyTypes`.
- `transition-change.spec.ts` uses hook literals with a `run` property not accepted by `HookEntry`, and references `RunStepHooks` without a declaration.
- `lifecycle-engine.spec.ts` constructs transition tuples whose inferred literal unions exclude `implementing` and `done`.
- `transition-checks.spec.ts` uses `onFailure: "warn"`, while the merged contract only permits `abort | collect`.

These are implementation/test-fixture defects against the current merged contracts. The `warn` cases may additionally reveal stale expectations from the archived resilient-hook work and should be reconciled deliberately rather than mechanically cast.

### Blocking: lint failures in the topology/check surface

`pnpm lint` reports unused legacy topology imports/helpers (`VALID_TRANSITIONS`, `isStepPermitted`), redundant types/assertions in `transition-checks.ts`, an unused approvals parameter, and missing public JSDoc on `WorkflowTopology` methods and `workflowTasksEmpty`.

## Summary

Runtime behavior is substantially aligned with the proposal and archived baseline, but this batch is not compliant because typecheck and lint fail.
