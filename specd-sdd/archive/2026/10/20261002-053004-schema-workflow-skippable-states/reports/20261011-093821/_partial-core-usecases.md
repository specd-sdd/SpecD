# Partial Compliance Audit — Core Change-Bound Use Cases

## Scope

`core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, and `core:change`.

## Requirements summary

This batch makes the schema recorded by each change sovereign across validation, hooks, preview, status, archive, approvals, context/instructions, scope edits, invalidation, verification readiness, task counting, and evidence fingerprints. Workspace/spec operations without a change identity retain the project-default lookup.

## Implementation status

- Change-bound production paths resolve `SchemaProvider.get(change.schemaName)` (or archived/draft equivalent).
- `EditChange` resolves the named schema once for added-spec compatibility, then uses `replaceSpecIds()` plus `reconcileAfter()` inside the active serialized mutation.
- `InvalidateChange`, `StartVerification`, `CountTasks`, and `ValidityFingerprintService` use the named schema and propagate resolution errors.
- The post-attempt Core suite passed: 236 files / 2980 tests.
- Focused sovereign-schema tests cover named lookup, observably different schemas, exclusion of workspace-default artifacts, and failure atomicity/no fallback evidence.
- An audit of unnamed lookups found only workspace/spec-level operations: `ValidateSpecs`, initial persisted dependency resolution, spec context/outline/metadata, and project context.

## Discrepancies

### C-01 — HIGH — `core:edit-change` merged spec and verify artifacts still require the rejected `updateSpecIds` design

The merged requirement says artifact-DAG synchronization during `updateSpecIds` must perform a second named schema lookup from the fresh change. Its verification scenario explicitly expects `EditChange` to apply `updateSpecIds` and obtain the DAG from `SchemaProvider.get('custom-workflow')`.

That contradicts the corrected design and actual implementation:

- `design.md` lines 457, 473, 479, and 513 explicitly require `replaceSpecIds()` plus `ctx.reconcileAfter()` and reject `updateSpecIds()` because it duplicates validity ownership and prematurely invalidates projections.
- `packages/core/src/application/use-cases/edit-change.ts` lines 138-150 resolve the sovereign schema once before mutation; lines 253-292 use `replaceSpecIds()` and `reconcileAfter()` in the active scope path.
- `edit-change.spec.ts` correctly asserts one named lookup and preserves reconciler ownership.
- The stale delta text is at `deltas/core/edit-change/spec.md.delta.yaml` lines 13-17 and `verify.md.delta.yaml` lines 21-27.

Impact: one merged requirement and one verification scenario fail against the intended, tested implementation. This is an artifact-review-required failure. The spec/verify deltas must be revised to describe the single compatibility lookup and reconciler-owned DAG/validity consequences.

## Test coverage

Coverage is strong across the batch. Tests verify sovereign schema selection for validation, hooks, preview/status, archive, approvals, compile/instruction APIs, EditChange, invalidation, task counting, verification start, and all fingerprint APIs. Failure paths ensure no partial scope mutation, invalidation, attempt, or fallback evidence.

The only material mismatch is that the `EditChange` tests correctly verify the revised design while its merged spec/verify artifact still describes the superseded two-lookup/updateSpecIds behavior.

## Dependency/global compliance

The use cases remain in the application layer behind `SchemaProvider` and repository ports; no domain I/O or dependency-direction violation was found. Error propagation and testing conventions conform to global specs.

## Counts

- Specs audited: 15
- Findings: 1 high artifact/spec inconsistency
- Sovereign-schema production paths verified: 15 spec areas
- Relevant Core tests passed: 2980
