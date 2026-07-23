# Specification Compliance Audit

## Audit metadata

- Mode: specific change
- Change: `refactor-task-completion`
- State at audit: `verifying`
- Timestamp: 2026-07-23 15:55:00
- Graph status: fresh (`961` files, `4,371` symbols)
- Scope: five change specs, relevant global constraints, and direct dependency context (depth 1).

## Overall result

**Compliant — no implementation/spec discrepancies or missing-test findings were identified.**

The shared `CountTasks` query centralizes task parsing while preserving the prior status and transition behavior. Its application-layer port usage and resolver/kernel wiring conform to the global architecture requirements. Implementation tracking contains confirmed links for every affected change spec and reports no stale-symbol or out-of-scope-link diagnostic.

## Test evidence

`pnpm --filter @specd/core test -- --run ...` completed successfully: **167 test files and 2,243 tests passed**.

## Aggregate counts

| Metric                                | Count |
| ------------------------------------- | ----: |
| Change specs audited                  |     5 |
| Implementation discrepancies          |     0 |
| Spec/global/dependency contradictions |     0 |
| Missing-test findings                 |     0 |

## Detailed findings

The complete partial audit follows verbatim.

# Partial audit: core task completion

## Scope and evidence

- Change: `refactor-task-completion` (state: `verifying`)
- Change specs: `core:get-status`, `core:transition-change`, `core:count-tasks`, `core:kernel`, and `core:schema-format`.
- Relevant project constraints reviewed: `default:_global/architecture`, `default:_global/conventions`, and `default:_global/testing`.
- Direct dependency context reviewed: `core:change`, `core:composition-resolver`, and `core:workflow-model`; the status manifest was also used for the complete depth-one dependency map.
- Merged change content was retrieved with `changes spec-preview` for all five change specs. The code graph was fresh and used to locate `CountTasks`, its consumers, composition factories, kernel wiring, and dependents.

## Requirements summary and implementation status

### `core:count-tasks`

Compliant. `CountTasks` is an application-layer query with only `ChangeRepository` and `SchemaProvider` port dependencies. It reads all non-empty artifact files, applies resolved patterns with `safeRegex(..., 'gm')`, retains an entry with zeroes for unsafe patterns and non-empty content, and returns both per-artifact and aggregate counts. The standalone factory follows the shared resolver path and `Kernel.changes.countTasks` exposes the same capability.

Evidence: `packages/core/src/application/use-cases/count-tasks.ts`, `packages/core/src/composition/use-cases/count-tasks.ts`, and `packages/core/src/composition/kernel.ts`.

### `core:get-status`

Compliant. `GetStatus` accepts the shared query by constructor injection, invokes it after schema/lifecycle status projection, and maps `byArtifact` entries into optional `taskCompletion` fields. This preserves omission for missing or empty artifact content and avoids duplicating parsing logic.

Evidence: `packages/core/src/application/use-cases/get-status.ts` and `packages/core/src/composition/use-cases/get-status.ts`.

### `core:transition-change`

Compliant. `TransitionChange` validates task capability from the resolved schema, performs a single shared count query for the workflow gate, permits absent qualifying content, and raises the required progress event/error with the count payload when incomplete items remain. Only `requiresTaskCompletion` artifact IDs are inspected.

Evidence: `packages/core/src/application/use-cases/transition-change.ts` and `packages/core/src/composition/use-cases/transition-change.ts`.

### `core:kernel`

Compliant. The kernel interface and assembly surface `changes.countTasks`; construction uses the resolver-backed factory, consistent with the architecture constraint that every kernel capability has a reusable factory path.

Evidence: `packages/core/src/composition/kernel.ts` and `packages/core/test/composition/kernel.spec.ts`.

### `core:schema-format`

Compliant. Schema construction materializes the case-inclusive completed-checkbox default (`[x]` or `[X]`), which the query consumes instead of providing a local fallback.

Evidence: `packages/core/src/domain/services/build-schema.ts` and `packages/core/test/domain/services/build-schema.spec.ts`.

## Global and dependency conformance

- Architecture: compliant. The new query stays in the application layer, accesses external data exclusively through ports, and is manually wired in composition. No domain I/O or application-to-infrastructure import was introduced.
- Conventions: compliant. New exports are named, ESM imports use `.js` specifiers, types are explicit/readonly where applicable, and public declarations include JSDoc.
- Testing: compliant. Unit tests use mocked repository/schema ports and cover behavior rather than concrete storage.
- Dependency consistency: no contradiction found with `core:change`, `core:composition-resolver`, or `core:workflow-model`. In particular, the workflow-model behavior that absent content does not block a task-capable artifact is preserved.

## Test coverage

The dedicated `CountTasks` tests cover multi-file aggregation, multiple artifact types, uppercase completion markers, unsafe patterns, one unsafe pattern, missing content, and non-task artifacts. Consumer and composition/kernel suites cover delegation and wiring.

Command run:

`pnpm --filter @specd/core test -- --run ...`

Result: **167 test files passed; 2,243 tests passed**.

## Discrepancies and missing tests

None found in the audited change scope.

## Summary counts

- Specs audited: 5
- Requirements assessed: 5 changed capability areas
- Implementation discrepancies: 0
- Spec/global/dependency contradictions: 0
- Missing-test findings: 0
- Informational notes: 0
