# Specification compliance audit

**Change:** `lifecycle-polish-followups`  
**Mode:** change-scoped, final merged-preview audit  
**Date:** 2026-09-19

## Executive summary

All previously reported P2 contradictions are resolved in the final merged specifications. Implementation, tests, and user documentation conform to the corrected three-form hook contract, plugin `metadataExtraction` prohibition, and actionable `SCHEMA_RESOLUTION_FAILED` status behavior.

| Severity |                                 Count |
| -------- | ------------------------------------: |
| P0       |                                     0 |
| P1       |                                     0 |
| P2       |                                     0 |
| P3       | 2 optional E2E coverage opportunities |

The non-blocking P3 opportunities are a real top-level test for both archive aliases and a CLI-composition overlap E2E test.

## Detailed partial reports (verbatim)

\n+# Final compliance audit — core runtime

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`  
**Date:** 2026-09-19

## Audit basis

- Merged `changes spec-preview` output was reviewed for all four affected specs.
- The code graph is current, complete, content-fresh, and non-stale.
- Graph discovery resolved the implementation symbols: `TransitionChange` (`application/use-cases/transition-change.ts:108`), `evaluateLifecycleVerdict` (`domain/services/lifecycle-verdict.ts:139`), `resolveWorkflowCheckRegistry` (`composition/use-cases/workflow-check-registry.ts:23`), and `resolveArchiveBatchSnapshotPort` (`composition/use-cases/archive-change.ts:63`).
- Direct-dependency consistency was checked against `core:transition-checks`, `core:spec-overlap`, and `default:_global/architecture`.
- Focused regression suite passed: **4 test files, 127 tests**.

## Requirements and results

| Spec                     | Effective requirement                                                                                                                                      | Implementation/test evidence                                                                                                                                                                                                            | Result |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `core:transition-change` | A historic parked approval state must produce typed `approval-required` before `protocol.edge` for a non-drain target.                                     | The guard executes at `transition-change.ts:190`, before schema/predicate work, and its implementation at `:338` maps the correct gate. Tests cover parked spec -> implementing and parked signoff -> archivable.                       | Pass   |
| `core:lifecycle-engine`  | Failed `workflow.requires` must retain its actionable artifact ID in `transitionBlockers[].blocking`.                                                      | The projection calls `blockingArtifactIds` at `lifecycle-verdict.ts:225`; the helper consumes `details.artifactId` at `:753`. The lifecycle-verdict regression test supplies a failed check detail and verifies the projected artifact. | Pass   |
| `core:transition-checks` | Production registry composition injects overlap detection; the isolated default may omit it. Approval repair keeps precedence over generic edge rejection. | `get-status.ts:42` and `archive-change.ts:133` pass `includeOverlapDetection: true`; the registry remains dependency-injected and isolated-safe. Registry and composition tests cover both injected and omitted behavior.               | Pass   |
| `core:archive-change`    | One lazy fallback `FsArchiveBatchSnapshot` must survive the complete composed operation.                                                                   | `archive-change.ts:71` memoizes one snapshot promise; all proxy methods use `resolveSnapshot`. The regression test snapshots, records a new file, restores, and confirms removal.                                                       | Pass   |

## Direct/global dependency consistency

- The new approval guard is a narrow historical-repair precedence rule. It does not duplicate the normal shared predicate runner defined by `core:transition-checks`; ordinary evaluation remains registry-driven.
- Lifecycle verdict consumes a supplied check result rather than independently rerunning `workflow.requires`, which preserves the check ABI and actionable diagnostics required by `core:transition-checks`.
- Registry overlap composition obeys `core:spec-overlap`: composition performs I/O and delegates overlap interpretation to the pure domain service.
- Layer placement remains conformant with `default:_global/architecture`: the state-transition use case is application-layer/port-based; verdict is a stateless domain function; `FsArchiveBatchSnapshot` construction is confined to composition.

## Test coverage

```text
pnpm exec vitest run \
  packages/core/test/application/use-cases/transition-change.spec.ts \
  packages/core/test/domain/services/lifecycle-verdict.spec.ts \
  packages/core/test/composition/use-cases/workflow-check-registry.spec.ts \
  packages/core/test/composition/archive-batch-snapshot-port.spec.ts

Test Files  4 passed (4)
Tests       127 passed (127)
```

Each new runtime behavior has direct regression coverage. No required missing test was found. A real CLI-level overlap composition E2E would be optional hardening only, because the registry behavior and each production factory wiring are already covered.

## Discrepancies

None.

| Severity/category           | Count |
| --------------------------- | ----: |
| P0 implementation defects   |     0 |
| P1 contract inconsistencies |     0 |
| P2 required coverage gaps   |     0 |
| P3 optional hardening       |     1 |

## Final conclusion

No regression was found in the core-runtime batch. In particular, the reported historic parked-approval failure no longer applies: a non-drain attempt receives the documented typed approval guidance instead of `invalid-transition`. This batch is compliant and does not require remediation before the change proceeds.

# Final compliance audit — CLI and skills

## Audit basis

This final read-only pass inspected the current merged `spec-preview` output for
`cli:change-status`, `skills:skill-templates-source`, `cli:change-archive`, and
`cli:change-artifact-instruction`; their direct dependency contracts; current source and
tests; and graph-indexed public registration symbols. The graph is current (41,209
symbols; no stale workspaces). No source, spec, or change artifact was modified.

## Requirements and evidence

### `cli:change-status`

The contract requires Core-derived lifecycle/DAG/review/tracking projections, drafted
read-only rendering, and drift-aware human/structured display state. Graph navigation
locates `registerChangeStatus` at `packages/cli/src/commands/change/status.ts`.
It delegates to `kernel.changes.status.execute`, projects Core's lifecycle data, and uses
`displayStatus ?? effectiveStatus ?? state` for artifact rendering and structured DAG
entries. This provides the required canonical fallback when historic Core payloads lack
`displayStatus`, without local lifecycle recomputation.

`packages/cli/test/commands/change/status.spec.ts` covers drafted output, fallback
rendering, DAG order/children, drift-aware state, `hasTasks`, warnings, and check-derived
lifecycle projections.

**Status: conformant.**

### `skills:skill-templates-source`

The merged fast-track requirement requires a Step 2 confirmation stop and dependents
terminology/selector usage. The fast-track template explicitly stops pending user choice,
uses `--direction dependents` for file and symbol impact, and avoids describing
downstream as dependents. Its template contract test asserts the stop copy, absence of
downstream-dependent wording, the dependents regression requirement, and metadata.

This remains consistent with `skills:workflow-automation` and
`core:transition-checks`: fast-track is manual-only and does not advance lifecycle
approval states itself.

**Status: conformant.**

### `cli:change-archive`

The new contract names `specd changes archive <name>` as canonical while preserving
`specd change archive <name>`. `packages/cli/src/index.ts` defines one `changes` group
and `.alias('change')`, then installs `registerChangeArchive` on that same group. Both
spellings therefore resolve to the identical archive handler and Core use-case call.
The handler delegates archive semantics, hooks, progress, and overlap evaluation to
Core, matching `core:archive-change`, `core:hook-execution-model`, and
`cli:command-resource-naming`.

The archive command tests cover normal/error results, structured progress, hook phase
forwarding, overlap, and archive options.

**Status: conformant.**

### `cli:change-artifact-instruction`

The contract requires a read-only delegation to `GetArtifactInstruction`; the hygiene
addition requires context before fetching the current instruction immediately before
authoring, with neither template I/O as context nor prefetching later instructions.
Graph navigation locates `registerChangeArtifactInstruction` in the CLI handler, which
delegates directly to `kernel.changes.getArtifactInstruction.execute` and only formats
the returned rules/instruction/template/delta payload.

Shared workflow guidance loads change context before instruction calls, and the design
template fetches the current instruction in Step 6 “Immediately after” before Step 7
authorship. Existing command tests cover text/JSON projection and domain-error routing;
Core context coverage confirms instructions are not injected into compiled context.

**Status: conformant.**

## Discrepancies

None. The audited implementation matches the merged change requirements and the relevant
direct dependency/global constraints.

## Test coverage gaps

### P3 — literal archive alias parsing

Archive handler tests use a synthetic parent command, so they do not execute the complete
top-level registration for both literal forms (`changes archive` and `change archive`).
The actual implementation shares one Commander group and alias, making this a
non-blocking regression-test opportunity rather than a behavior discrepancy.

## Totals

| Metric                      |              Count |
| --------------------------- | -----------------: |
| Specs audited               |                  4 |
| Discrepancies               |                  0 |
| Dependency/global conflicts |                  0 |
| Test gaps                   | 1 P3, non-blocking |
| Blocking findings           |                  0 |

# Final compliance audit partial — core hygiene specifications

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, and `core:config-writer-port`  
**Method:** read-only comparison of fresh merged previews, implementation, tests, direct dependencies, global architecture constraints, and relevant user documentation.  
**Graph:** current; no stale/fingerprint mismatch.

## Requirement status

| Spec                        | Requirement / focus                                                                                                       | Result      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `core:hook-execution-model` | Exactly three hook forms: `instruction:`, `run:`, `external:`.                                                            | Conformant. |
| `core:schema-format`        | Plugins cannot declare or mutate `metadataExtraction`; external hook constraint includes all forms.                       | Conformant. |
| `core:change`               | Task completion is restricted to declared task-capable artifacts.                                                         | Conformant. |
| `core:get-status`           | Schema-not-found status remains read-only, has no available transitions, and returns `SCHEMA_RESOLUTION_FAILED` publicly. | Conformant. |
| `core:config-writer-port`   | Initialization does not synthesize optional/unrelated plugin configuration.                                               | Conformant. |

## Prior-P2 reconciliation

### Three hook forms, including external — resolved

The merged preview replaces “Two hook types” with “Three hook entry forms,” enumerates `instruction:`, `run:`, and `external:`, and requires exactly one of those keys. The dependent `core:schema-format` constraint was also changed to permit exactly one of `instruction`, `run`, or `external`. There is no residual two-form/two-key contract.

Implementation matches: the YAML parser maps `external:` into `HookEntry { type: 'external' }` (`packages/core/src/infrastructure/schema-yaml-parser.ts:232-244`); `RunStepHooks` dispatches external hooks to accepted-type runners. Parser coverage accepts the external form (`packages/core/test/infrastructure/schema-yaml-parser.spec.ts:251-267`); run-hook coverage exercises accepted runner dispatch and failure for an unavailable type (`packages/core/test/application/use-cases/run-step-hooks.spec.ts:173-223`). The merged verify scenario also covers the unavailable-runner path.

### Plugin metadata-extraction prohibition and documentation — resolved

The merged preview removes `metadataExtraction` from the schema-plugin MAY list, explicitly prohibits declaration or mutation, and identifies transforms/resolved layers as the allowed extension points. Parser refinement rejects a plugin that declares the field (`packages/core/src/infrastructure/schema-yaml-parser.ts:330-352`), with a focused test at `packages/core/test/infrastructure/schema-yaml-parser.spec.ts:144-147`.

User documentation is aligned: `docs/guide/configuration.md:715` and `docs/config/config-reference.md:454` say a plugin cannot declare a top-level extraction block. No conflicting MAY clause remains in the merged spec.

### Actionable schema-resolution blocker — resolved

The merged `core:get-status` requirement now distinguishes the empty `lifecycle.blockers` projection (checks cannot run without a schema) from the public `blockers` array, which must include stable `SCHEMA_RESOLUTION_FAILED` recovery guidance. Its verify scenario asserts the same separation and read-only/no-mutation behavior.

`GetStatus` returns that public blocker when schema resolution raises `SchemaNotFoundError` (`packages/core/src/application/use-cases/get-status.ts:393-407`). The regression test asserts empty available transitions plus the exact blocker code/message (`packages/core/test/application/use-cases/get-status.spec.ts:292-307`). The merged spec no longer requires the public blockers array to be empty or degradation to be silent. `GetStatus` remains a CRITICAL graph surface (10 direct, 4 indirect dependents), so this focused coverage is material.

## Remaining scope confirmation

### Task completion scope

`buildSchema` restricts `requiresTaskCompletion` to artifacts with `hasTasks: true` and rejects invalid references (`packages/core/src/domain/services/build-schema.ts:725-743`). Tests cover rejection without capability and acceptance with capability (`packages/core/test/domain/services/build-schema.spec.ts:407-492`). This conforms to `core:workflow-model`, `core:lifecycle-engine`, and `core:transition-checks` semantics.

### Optional ConfigWriter configuration

`FsConfigWriter.initProject` writes schema/workspace configuration only and does not create a plugin block (`packages/core/src/infrastructure/fs/config-writer.ts:39-82`). `addPlugin` keeps optional configuration absent until supplied (`:91-119`). Initialization and configured/unconfigured plugin behavior are covered in `packages/core/test/infrastructure/fs/config-writer.spec.ts:39-59, 146-172`. The port/infrastructure split conforms to `default:_global/architecture`; graph impact is MEDIUM (2 direct, 2 indirect dependents for `FsConfigWriter`).

## Test coverage and dependency review

- All five change-scoped clarifications have focused implementation evidence and relevant unit coverage.
- Direct dependencies are consistent: hook execution and schema-format both recognize the same three forms; schema-plugin behavior matches parser and user docs; task gating matches lifecycle contracts; status remains read-only and transition validation remains fail-closed.
- The change-level verification has already recorded a passing full `pnpm test` run; this read-only audit made no code/spec changes and did not rerun it.

## Totals

- Scoped clarifications audited: **5**
- Prior P2 contradictions confirmed removed: **3/3**
- Conformant requirements: **5/5**
- Runtime implementation discrepancies: **0**
- Specification contradictions: **0**
- Missing targeted tests: **0**
- P0: **0**; P1: **0**; P2: **0**; P3: **0**
