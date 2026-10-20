# Full compliance audit — schema-workflow-skippable-states

- Mode: delegated change audit
- Outer verification attempt: `verification-attempt-6`
- Specs audited: 25
- Result: **FAIL pending reviewer disposition**
- Findings: 1 High, 1 Medium
- Test gaps: 5
- Executable evidence: foundation 415/415, use cases 434/434, Core 2984/2984, CLI 1101/1101, Skills 62/62

## Executive summary

The domain topology, lifecycle checks, sovereign change-schema resolution, CLI status, CLI transition, and standard schema surfaces conform to their merged specifications. Two discrepancies remain: lifecycle skills still hardcode canonical state progression instead of consuming dynamic status routing (High), and `EditChange` retains unreachable legacy synchronization code forbidden by the merged ownership contract (Medium). The active verification attempt must remain incomplete until the reviewer chooses remediation or explicitly dismisses these findings.

## Detailed findings

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

The authoritative merged previews were read for all eight specs (377 merged scenario declarations in total). The change-specific additions and modifications were traced to implementation and focused tests.

Focused executable evidence: 10 test files and 415 tests passed.

## Discrepancies

No discrepancies were found. Critical: 0; High: 0; Medium: 0; Low: 0.

## Test coverage and residual observations

Coverage is strong for the changed acceptance surface. All change-specific topology and sovereign-schema regressions have direct executable evidence. Missing required scenario coverage: 0. Two non-blocking observations remain around aggregate-only approval propagation granularity and independent manifest/archive mismatch tests.

## Dependency and constraint conformance

Domain purity is preserved; the single topology authority is used consistently; sovereign schema resolution uses `change.schemaName` for reviewed change-scoped operations; no circular workspace dependency or new cross-package dependency was introduced.

**Delegated foundation verdict: PASS.**

---

# Delegated compliance audit — schema/CLI/skills surfaces

- Change: `schema-workflow-skippable-states`
- Outer attempt: `verification-attempt-6`
- Scope: `schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`
- Mode: delegated, read-only

## Requirements summary

1. Schema workflow rows accept optional/disabled configuration and preserve topology invariants.
2. CLI status renders check-derived topology without local recomputation.
3. CLI transition forwards `--next` to Core for topology-driven selection.
4. Lifecycle skills dynamically consume `nextAction.command` and `lifecycle.availableTransitions` and never synthesize hooks for bypassed steps.

## Implementation status

| Spec                         | Status                    | Evidence                                                                                         |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `schema-std:standard-schema` | Implemented               | Parser/value object support and topology validation are present and tested.                      |
| `cli:change-status`          | Implemented               | Text and structured output preserve optionality, legal shortcuts and Core projections.           |
| `cli:change-transition`      | Implemented               | `--next` delegates to Core and unavailable-next failures use repair guidance.                    |
| `skills:workflow-automation` | **Not fully implemented** | Lifecycle progression remains encoded as fixed state branches and explicit per-state hook calls. |

## Discrepancies

### F1 — HIGH — generated lifecycle skills still hardcode the canonical pipeline and can execute hooks for a step the active schema bypasses

The merged skill contract says skills **MUST** consume `nextAction.command` and `lifecycle.availableTransitions` dynamically from structured status, advance directly along that path, and not execute hooks for bypassed intermediate steps.

Evidence:

- `specd-implement` reads text status and unconditionally runs `implementing` pre-hooks then transitions to `implementing`.
- `specd-verify` encodes `implementing → verifying → done → archivable`, including unconditional hooks for those named states.
- `specd-design` hardcodes `designing` and `ready` hooks/transitions.
- `specd-archive` admits only `archivable`/`archiving` and runs fixed `archiving` hooks.
- Repository search finds `nextAction` handling only in `specd-new`; the main lifecycle skills do not consume `lifecycle.availableTransitions`.

Possible resolutions:

1. **Implementation correction (preferred):** update templates and synchronized agent outputs so lifecycle entry reads structured status and routes from `nextAction.command` plus `availableTransitions`; run hooks only for actual source/target steps. Add disabled-`verifying` and optional-`implementing` protocol tests.
2. **Spec correction:** narrow dynamic routing to a separate orchestrator and explicitly permit state-specific skills. This conflicts with proposal intent and is not recommended.

Impact: Core/CLI can advertise and execute a schema-specific shortcut while agent instructions still select a fixed intermediate step and run its hooks.

## Test coverage

Core 2984, CLI 1101 and Skills 62 tests passed. Missing regression: no skill/template test asserts that disabled `verifying` is skipped without hooks or that optional `implementing` follows structured routing.

## Dependency conformance

Schema and CLI dependency chains conform. `skills:workflow-automation` depends on the correct CLI capabilities but does not consume their required dynamic fields.

**Delegated surfaces verdict: FAIL until F1 is resolved or explicitly dismissed.**

---

# Delegated compliance audit — core use cases

- Change: `schema-workflow-skippable-states`
- Attempt: `verification-attempt-6`
- Scope: 13 change-scoped Core use cases
- Mode: delegated, read-only

## Requirements summary

Every change-scoped schema decision must resolve the schema recorded by the change (`SchemaProvider.get(change.schemaName)`). `EditChange` additionally requires one compatibility resolution before mutation, followed by `replaceSpecIds()` and `ctx.reconcileAfter()`, with no second direct lookup or `updateSpecIds()` synchronization.

## Implementation status

ValidateArtifacts, RunStepHooks, PreviewSpec, GetStatus, ArchiveChange, ApproveSpec, ApproveSignoff, CompileContext, GetArtifactInstruction, GetHookInstructions, InvalidateChange and CountTasks conform to sovereign-schema resolution. `EditChange` runtime behavior conforms, but retains a source-level discrepancy.

## Discrepancies

### UC-1 — MEDIUM — `EditChange` retains forbidden legacy synchronization code

- `EditChange.execute()` returns `_executeScopeEdit(...)` whenever `hasSpecChanges` is true.
- A later unreachable branch still calls a second `SchemaProvider.get(freshChange.schemaName)` and `freshChange.updateSpecIds(...)`.
- The merged spec explicitly says it **MUST NOT** call `updateSpecIds()` or perform a second direct lookup.

Code-correct/spec-wrong possibility: the branch is unreachable, so observable behavior and the one-call test pass. If the intended contract is only behavioral, the source prohibition may be too strict.

Spec-correct/code-wrong possibility: the contract deliberately assigns synchronization exclusively to the reconciler. Keeping the dead competing path is a regression hazard and should be removed.

## Test coverage

13 test files and 434 tests passed. Four direct scenario gaps remain:

1. Positive custom-schema projection for `GetStatus`.
2. Positive sovereign-schema success for `ArchiveChange`.
3. Sovereign-schema selection for `GetHookInstructions`.
4. `EditChange` reconciliation-failure atomicity.

These are test gaps, not demonstrated runtime failures.

## Dependency and global-constraint conformance

Application/domain boundaries, injected ports, ESM/strict TypeScript constraints and dependency direction remain conformant. No circular package edge was observed.

**Delegated use-case verdict: issues found; reviewer disposition or remediation required.**

## Aggregate conclusion

| Measure                                      | Count |
| -------------------------------------------- | ----: |
| Specs audited                                |    25 |
| High findings                                |     1 |
| Medium findings                              |     1 |
| Missing/insufficient direct regression areas |     5 |
| Failing executed tests                       |     0 |
