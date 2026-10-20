# Delegated compliance audit — foundation batch

- Change: `schema-workflow-skippable-states`
- Verification attempt: `verification-attempt-6`
- Mode: delegated, read-only
- Scope: `core:workflow-model`, `core:check-registry`, `core:transition-checks`, `core:transition-change`, `core:lifecycle-engine`, `core:workflow-topology`, `core:change`, `core:change-manifest`
- Result: **PASS** — no spec/code discrepancy found in this batch

## Requirements summary and implementation status

| Spec                     | Effective contract reviewed                                                                                                                                        | Implementation evidence                                                                                                                                                                                             | Status      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `core:workflow-model`    | `optional`/`disabled` workflow steps; `checks` and `skipChecks`; governance validation; declared workflow as progress axis; sovereign change schema                | `workflow-step.ts`, `build-schema.ts`, `merge-schema-layers.ts`, `schema-yaml-parser.ts`, `lazy-schema-provider.ts`; validation and merge tests cover unknown/duplicate/locked checks and disabled-step constraints | Implemented |
| `core:check-registry`    | Open namespaced registry; immutable built-ins; transition/archive/step-skip coordinate identity; binding/config/disable governance                                 | `check-registry.ts`, `check-bindings.ts`, production registry composition; registry tests cover duplicate step-skip coordinates and distinct-step registration                                                      | Implemented |
| `core:transition-checks` | Topology-aware direction; step-skip matching; runtime schema overlays; deep config cascade; disabled bindings; non-skippable invariants                            | `transition-checks.ts`, `execute-matching-predicates.ts`, `workflow-check-registry.ts`; focused tests exercise matching, overlays, cascade, disabled checks and built-in governance                                 | Implemented |
| `core:transition-change` | `to: next` follows active topology; optional-step bypass evaluates skip predicates; bypassed hooks are suppressed; schema comes from `change.schemaName`           | `transition-change.ts` resolves `get(change.schemaName)`, passes approvals to topology, evaluates transition predicates and each bypassed step twice around effects, and runs effects only for the requested edge   | Implemented |
| `core:lifecycle-engine`  | Valid versus available topology projections; disabled-step forward routing; blocker filtering; application guidance separated from domain next-hop                 | `lifecycle-verdict.ts` derives transitions/pipeline/next hop from `WorkflowTopology` with one approval snapshot; `lifecycle-guidance.ts` maps domain results to commands                                            | Implemented |
| `core:workflow-topology` | Canonical bedrock tail; optional shortcuts; disabled exclusion; approval-anchor validation; reachability; no invented backward edges; bypass and next-step queries | `workflow-topology.ts` centralizes all operations, threads approvals through every topology query, restricts backward destinations to `VALID_TRANSITIONS`, and orders `done -> archivable -> archiving`             | Implemented |
| `core:change`            | Start-verification and validity fingerprints resolve the change's sovereign schema; failures propagate rather than falling back                                    | `start-verification.ts` and `validity-fingerprint-service.ts` call `schemaProvider.get(change.schemaName)`; tests assert the reference and error propagation                                                        | Implemented |
| `core:change-manifest`   | Persisted schema identity remains authoritative; workspace-default name mismatch does not prevent loading; version mismatch warns and archive surfaces it          | `change-repository.ts` serializes/hydrates manifest schema identity and warns on matching-name version drift; `archive-change.ts` resolves the recorded schema and retains mismatch protection                      | Implemented |

## Scenario verification

The authoritative merged previews were read for all eight specs (377 merged scenario declarations in total). The change-specific additions and modifications were traced to implementation and focused tests, including:

- topology construction, bedrock/approval anchors, reachability, optional shortcuts, disabled destinations, canonical backward edges, bypass calculation, next-step routing and verification enablement;
- transition/step-skip applicability, dynamic binding synthesis, disabled bindings and cascaded configuration;
- `TransitionChange` shortcut success/failure, hook suppression, sovereign-schema resolution and approval-aware next routing;
- lifecycle projections for disabled verification, `done`/`archivable`/`archiving`, blockers and command guidance;
- sovereign-schema resolution in verification readiness and all artifact-bearing fingerprint APIs;
- manifest load behavior for schema-name changes and warnings for schema-version changes.

Focused executable evidence:

```text
Test Files  10 passed (10)
Tests       415 passed (415)
```

Suites: workflow topology, check registry, transition checks, schema construction, schema-layer merge, transition change, lifecycle engine/verdict, start verification, validity fingerprints, and filesystem change repository.

## Discrepancies

No discrepancies were found.

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

Accordingly, neither remediation branch is currently indicated:

1. **Spec is correct / code is wrong:** no observed behavior or implementation path contradicts the merged contract.
2. **Code is correct / spec is wrong or underspecified:** no implemented behavior in this scope required changing the merged requirements to describe it accurately.

## Test coverage and residual observations

Coverage is strong for the changed acceptance surface. All change-specific topology and sovereign-schema regressions have direct executable evidence, and the focused batch passed.

Non-blocking coverage observations:

- Approval propagation into topology is directly tested at `TransitionChange` and lifecycle/topology service boundaries, but there is no equally explicit aggregate-only unit test naming `Change.transition(..., schema, approvals)` with a disabled approval anchor. The aggregate implementation does pass the supplied snapshot, so this is a test-granularity observation, not a compliance defect.
- The manifest's name-mismatch and version-warning cases are independently tested. The archive mismatch guard is also tested, although the ordinary sovereign-provider path naturally returns the change-recorded schema and therefore does not trigger it.

Missing required scenario coverage: **0**.

## Dependency and constraint conformance

- The graph index reported `stale: false`, `fingerprintMismatch: false`, full coverage, and no parse failures. Its content status was `CONTENT_UNKNOWN`, so dependency conclusions were cross-checked against source imports and the change's declared `specDependsOn` projection.
- Direct dependencies used by this batch conform to the declared depth-1 contracts: `core:workflow-model`, `core:schema-format`, `core:change`, `core:transition-checks`, `core:check-registry`, and the global architecture/error conventions.
- Domain purity is preserved: topology, registry, matching, and lifecycle verdict logic remain free of filesystem or subprocess behavior. I/O-backed readiness/fingerprint work remains in application/infrastructure services.
- The single topology authority is used consistently by protocol-edge, lifecycle verdict, transition execution, and aggregate transition validation.
- The sovereign schema boundary is consistently `change.schemaName` for the reviewed change-scoped operations; project/spec-only operations are outside this batch and intentionally retain project-default resolution.
- No circular workspace dependency or new cross-package dependency was introduced in this scope.

## Summary counts

| Measure                               | Count |
| ------------------------------------- | ----: |
| Specs audited                         |     8 |
| Merged scenario declarations reviewed |   377 |
| Focused test files passed             |    10 |
| Focused tests passed                  |   415 |
| Compliance discrepancies              |     0 |
| Missing required tests                |     0 |
| Non-blocking coverage observations    |     2 |

**Delegated batch verdict: PASS.**
