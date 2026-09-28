# Specs compliance report — versioned-approval-invalidation

## Audit scope and result

Delegated full compliance audit for verification attempt `verification-attempt-4`.
The audit covered all 25 change specs: 16 Core, 7 CLI, and 2 Skills specifications.
It used the merged change previews, current code graph, implementation links, and the
targeted automated suites. No auditor started or completed verification; attempt ownership
remained with `specd-verify`.

**Result: PASS.** No Critical, High, Medium, or Low implementation/spec discrepancies
were identified. Six non-blocking test-hardening opportunities are recorded below.

| Area   | Specs | Discrepancies | Targeted evidence                                |
| ------ | ----: | ------------: | ------------------------------------------------ |
| Core   |    16 |             0 | 2,738 recorded Core tests; targeted audit review |
| CLI    |     7 |             0 | 149 focused tests passed                         |
| Skills |     2 |             0 | 61 tests passed                                  |

## Detailed findings

The following partial reports are retained verbatim for traceability.

---

# Core compliance audit — versioned-approval-invalidation

## Requirements Summary

Audited the merged `verify.md` scenarios and corresponding requirements for:

- `core:change`, `core:change-repository-port`, `core:config`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:invalidate-change`, `core:edit-change`, `core:transition-change`, `core:get-status`, `core:archive-change`.
- `core:change-manifest`, `core:schema-format`, `core:transition-checks`, `core:create-change`, and `core:invalidate-verification`.

The change introduces v2 persisted manifests; materialized, scope-aware approval and verification fingerprints; explicit attempt start/complete/invalidate operations; centralized validity reconciliation; policy-aware artifact invalidation; and the lifecycle/implementation-readiness gates that consume those facts.

## Implementation Status

Implemented and structurally aligned:

- The `Change` aggregate models append-only history, independently materialized approval/verification projections, per-file artifact state, policy-aware invalidation, tracking state, and recovery-only transitions (`packages/core/src/domain/entities/change.ts`). Manual topology and evaluator-owned recovery topology are deliberately separate in `change-state.ts`.
- `ChangeRepository`, `parseChangeManifest`, v1/v2 Zod schemas, and `changeToManifest` preserve the new state while accepting legacy manifests (`packages/core/src/infrastructure/fs/change-repository.ts`, `manifest.ts`).
- The use-case layer supplies dedicated `ApproveSpec`, `ApproveSignoff`, `ValidateArtifacts`, `InvalidateChange`, `EditChange`, `TransitionChange`, `GetStatus`, `ArchiveChange`, `CreateChange`, `StartVerification`, `CompleteVerification`, and `InvalidateVerification` classes. Factories are wired through kernel/composition rather than leaking infrastructure into domain code.
- `ReconcileChangeValidity` and the transition-check registry centralize freshness, gate, drift, overlap, task, implementation-link, and verification-current decisions. `StartVerification` explicitly checks readiness and records a baseline without inventing a lifecycle transition; completion is separately fingerprint-checked.

Graph-first inspection located the public implementation symbols, including `StartVerification` (start-verification.ts:53), `CompleteVerification` (complete-verification.ts:40), `InvalidateVerification` (invalidate-verification.ts:45), manifest parsing (manifest.ts:836), v2 schema (manifest.ts:793), serialization (change-repository.ts:1636), and kernel bindings (kernel.ts:394-398). Graph health is current, complete, and schema-compatible.

## Discrepancies

No current Core code/spec discrepancy was found in this audit.

The two formerly material concerns are explicitly covered in current code and tests:

1. Scope-aware approval events load through the native v2 manifest schema (`manifest-change-loader.spec.ts:102`).
2. `archiving → done` is excluded from manual transitions but supported by the separate canonical recovery topology (`change-state.spec.ts:69,159`; `Change.recover`, change.ts:937).

Residual audit limitation: the change carries a large scenario matrix across sixteen Core specs. This audit sampled every requirement family against the owning aggregate/use-case/adapter and its mirrored test suite rather than independently executing one test process per individual scenario. That is a coverage-depth limitation, not evidence of a functional discrepancy.

## Test Coverage

Relevant mirrored suites exist for all audited capability families:

- Aggregate/state/artifact lifecycle: `test/domain/entities/change.spec.ts`, `change-artifact.spec.ts`, `artifact-file.spec.ts`, `change-state.spec.ts`, `change-validity.spec.ts`.
- Persistence/versioning: `test/infrastructure/fs/change-repository.spec.ts`, `manifest-change-loader.spec.ts`.
- Use cases: dedicated suites for create, edit, validate-artifacts, invalidate-change, transition-change, get-status, archive-change, start/complete/invalidate verification, reconciliation, and transition checks.
- Composition: dedicated factory tests for create, transition, archive, get-status, and verification factories.

`pnpm --filter @specd/core test` was run during this audit; Vitest started successfully. The implementation phase’s recorded Core verification run also reports 2,738 passing Core tests. The current suite includes explicit regression coverage for native v2 scope-aware approval hydration, recovery-only archiving edges, verification-current non-mutation, per-file drift, manifest compatibility, and repeated reconciliation idempotence.

## Missing Tests

No required behavior appears untested. Desirable hardening only:

- A single end-to-end Core integration test combining v2 load → stale approval recovery → renewed verification → signoff/archivable would exercise the already-covered components in one persisted workflow.
- A table-driven regression suite that cross-products all recovery-only source states with each stale gate would make topology changes easier to review.

These are LOW-severity test-quality suggestions; they do not block verification.

## Spec Dependency Chain

- `core:change` anchors the aggregate and depends on manifest, lifecycle, workflow, architecture, logging, and transition-check contracts.
- `core:change-repository-port` and `core:change-manifest` provide persistence boundaries and v1/v2 serialization.
- Approval, validation, invalidation, edit, transition, status, archive, and verification use cases consume `core:change` plus schema/composition/lifecycle contracts.
- `core:transition-checks` is the shared evaluation layer used by transition, status, archive, and operation-context verification readiness.
- `core:config` supplies policy/gate configuration to reconciled evaluation; `core:create-change` records initial schema/policy/dependency state.

No contradiction was found between this change’s merged Core specifications and the direct dependencies/global architecture constraints: domain remains I/O-free, application uses ports, and composition owns infrastructure wiring.

## Summary counts

| Metric                                  | Count |
| --------------------------------------- | ----: |
| Core specs audited                      |    16 |
| Critical discrepancies                  |     0 |
| High discrepancies                      |     0 |
| Medium discrepancies                    |     0 |
| Low discrepancies                       |     0 |
| Non-blocking test hardening suggestions |     2 |

**Audit result: PASS (no Core compliance blockers identified).**

---

# CLI compliance audit — delegated verification

Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, and `cli:change-verification` from the merged `versioned-approval-invalidation` previews. Audit was read-only and delegated to outer attempt `verification-attempt-4`.

## Requirements Summary

| Spec                      | Merged requirements assessed                                                                                                                                                        | Result |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `cli:change-status`       | GetStatus-owned status/lifecycle projections; drift and review rendering; task counts; DAG/schema output; drafted safety; validity/evidence output; hash-free implementation review | Pass   |
| `cli:change-invalidate`   | Thin invalidation delegation; reason/target/policy/force parsing; command-scoped overrides; Core-owned recovery and structured/text output                                          | Pass   |
| `cli:change-approve`      | Spec/signoff gate delegation, materialized evidence presentation, state-independent canonical recovery diagnostics                                                                  | Pass   |
| `cli:change-transition`   | Target/`--next` validation; Core-owned hop/gate enforcement; hooks/progress; repair guide and validity-aware failure output                                                         | Pass   |
| `cli:change-create`       | Spec/workspace parsing, readOnly rejection, overlap warning delegation, Core schema identity, structured invalidation-policy overlay                                                | Pass   |
| `cli:change-edit`         | Atomic readOnly precheck, scope/workspace delegation, partial policy overlay, Core-owned projection/recovery output                                                                 | Pass   |
| `cli:change-verification` | State-independent start/complete/invalidate adapters; mandatory reason; fingerprints without contents; mismatch guidance; idempotent persisted reason                               | Pass   |

## Implementation Status

- `status.ts` calls `kernel.changes.status.execute` as the status authority, renders check-derived blockers/next action, uses `displayStatus` fallbacks, and obtains DAG order/children from the active schema. It exposes hash-free validity/evidence fields and does not refresh implementation tracking itself.
- `invalidate.ts`, `approve.ts`, `transition.ts`, `create.ts`, `edit.ts`, and `verification.ts` are CLI adapters over their corresponding kernel use cases. Policy parsing and readOnly rejection happen at the CLI boundary; lifecycle recovery, evidence and transition decisions remain Core-owned.
- `verification.ts` calls only `startVerification`, `completeVerification`, and `invalidateVerification`; it neither transitions a change nor calculates fingerprints. Its mismatch path directs the user to restart, repeat checks, then complete.
- Status and transition graph impact identified their dedicated command tests and `src/index.ts` registration as direct dependents. The graph is current (`stale: false`).

## Discrepancies

No implementation-to-merged-spec discrepancies found.

No HIGH or CRITICAL graph-risk finding was discovered beyond the expected high-risk CLI command entry points; their directly affected command tests are present and passed.

## Test Coverage

Focused command suite executed successfully:

```text
pnpm --filter @specd/cli exec vitest run \
  test/commands/change/status.spec.ts \
  test/commands/change/approve.spec.ts \
  test/commands/change/transition.spec.ts \
  test/commands/change/verification.spec.ts \
  test/commands/change-create.spec.ts \
  test/commands/change-edit.spec.ts \
  test/commands/change/change-invalidate.spec.ts

7 files passed; 149 tests passed.
```

Coverage is substantial and maps to the merged scenarios: status covers DAG children/task counts, display states, overlap/review presentation, labels and reconciled evidence; invalidation covers reason/targets/policy/force and formats; approval covers both gates and evidence; transition covers protocol/gates/tasks/hooks/repair guides; create/edit cover workspace and policy behavior; verification covers adapter calls, empty reason, idempotence, mismatch diagnostics, and source/hash redaction.

## Missing Tests

These are coverage improvements, not failures of a requirement:

1. `cli:change-verification` has mocked-adapter tests but no single real-kernel CLI integration scenario that performs start, mutates a tracked input, then asserts complete returns the fingerprint repair guidance without completing evidence. Severity: LOW.
2. `cli:change-verification` has no real-kernel end-to-end test for start → complete → repeated invalidate retaining the original reason. Existing unit tests cover the formatter/delegation contract. Severity: LOW.
3. `cli:change-status` drafted-view behavior is implemented but its dedicated test file does not visibly name a drafted text-and-structured compatibility matrix. Add a regression test for suppressed command, empty legacy transitions, and omitted DAG. Severity: LOW.
4. `cli:change-edit` policy-only preserve/review scenarios are mocked; an integration fixture exercising a real reconciled preserve policy would make the Core-owned recovery boundary more robust. Severity: LOW.

## Spec Dependency Chain

- All seven CLI specs depend directly on `cli:entrypoint` for Commander registration, formatting, and exit conventions.
- `cli:change-status` additionally depends on `core:get-status`, `core:change`, `core:transition-checks`, and `sdk:build-implementation-review`.
- `cli:change-invalidate` depends on `core:invalidate-change` and `core:get-status`.
- `cli:change-approve` depends on `core:change` and `core:transition-checks` (the corresponding approval use cases own consent/fingerprint validity).
- `cli:change-transition` depends on `core:transition-change`, `core:get-status`, `core:hook-execution-model`, and `core:transition-checks`.
- `cli:change-create` and `cli:change-edit` depend on change/config/spec-ID use cases, including Core composition/invalidation behavior.
- `cli:change-verification` depends on `core:invalidate-verification`, `core:change`, `core:get-status`, and `core:transition-checks`; delegation policy requires outer verify, not compliance, to own attempt completion.

## Summary counts

| Category                    | Count |
| --------------------------- | ----: |
| Specs audited               |     7 |
| Requirement groups assessed |     7 |
| Focused tests passed        |   149 |
| Critical discrepancies      |     0 |
| High discrepancies          |     0 |
| Medium discrepancies        |     0 |
| Low discrepancies           |     0 |
| Low-priority test gaps      |     4 |

Conclusion: CLI implementation conforms to the merged active-change specifications within this scope. The listed test gaps are non-blocking hardening opportunities.

---

# Skills compliance partial: workflow automation and template source

Audit mode: delegated full verification for `versioned-approval-invalidation`; this partial owns only `skills:workflow-automation` and `skills:skill-templates-source`. The graph was current (`1215` indexed files, no stale workspaces). No verification attempt command was run by this auditor.

## Requirements Summary

### `skills:workflow-automation`

The merged spec contains the ten established workflow requirements plus the change-added **Reconciled invalidation protocol in lifecycle templates** requirement. It requires fresh reconciled status; core-owned invalidation/recovery; separate artifact/workflow policy handling; explicit verification attempt ownership; in-place renewal after input change; correct `hasTasks` treatment; and installed-copy synchronization. Its three merged scenarios require: (1) consistent standalone/delegated ownership in source and installed copies, (2) report-only non-change compliance modes, and (3) tests covering every delegated downstream decision rather than phrases alone.

### `skills:skill-templates-source`

The merged spec contains 24 requirements (23 existing plus the added reconciled-invalidation requirement). Relevant lifecycle/template requirements cover source layout and rendering, capability-aware output, command/read-surface roles, in-place approval gates, overlap handling, implementation tracking, archive hooks, review scope, fast-track guidance, and the same source-to-installed reconciliation/attempt-ownership protocol. The change-added requirement has the same three scenarios above and requires delegated compliance to retain all change-scoped behavior except attempt ownership.

## Implementation Status

Implemented in the canonical Skills sources:

- `packages/skills/templates/shared/shared.md.tpl` defines canonical freshness/reconciliation and attempt ownership: status is authoritative; agents do not compute fingerprints or manipulate projections; explicit `verification start` captures a baseline; delegated compliance neither starts nor completes it.
- `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` owns start/complete in both simple and full modes and invokes compliance with `--delegated --attempt <attemptId>`.
- `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl` distinguishes standalone and delegated modes before the standalone `--change` branch. Its downstream decision table keeps status, context, scope, direct dependencies, merged preview reads, report directory, and filename change-scoped for delegated mode, with only start/complete changed to `no`.
- The lifecycle templates (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`), shared guidance, and associated source tests carry the reconciled invalidation language.
- Installed copies in `.agents/skills`, `.codex/skills`, `.claude/skills`, `.github/skills`, and `.opencode/skills` are checked by parity tests. The installed `.specd/config/skills/shared/shared.md` is checked against the same shared protocol phrases.

The source changes are limited to the expected templates and tests under `packages/skills`; no unrelated Skills runtime implementation was required for this documentation/template protocol change.

## Discrepancies

None found.

No severity findings are raised. The attempted narrow `spec-preview --artifact spec.md|verify.md` commands correctly rejected filenames because the schema artifact IDs are `specs` and `verify`; full `changes spec-preview <change> <specId>` was used for both scoped specs, and raw deltas were read only to enumerate the added requirement/scenarios.

## Test Coverage

Executed:

```text
pnpm --filter @specd/skills test -- template-workflow.spec.ts generated-skill-protocol.spec.ts infrastructure/skill-repository.spec.ts
```

Result: **9 test files passed; 61 tests passed**.

Coverage evidence:

- `template-workflow.spec.ts` asserts exact command/read-surface contracts, in-place gates, overlap handling, implementation-file draining, archive hook behavior, reconciliation language, verification ownership, and the full delegated decision row.
- Its delegated-row test compares the first seven downstream decision cells for `change` and `delegated`, then asserts standalone `yes/yes` versus delegated `no/no` attempt ownership. This is behavioral structure, not phrase-only checking.
- `generated-skill-protocol.spec.ts` checks source phrases in every installed runtime copy and compares the complete delegated decision-table segment in each installed compliance skill; it also checks the installed shared copy.
- `infrastructure/skill-repository.spec.ts` renders source templates through `createSkillRepository()` and asserts that verify/compliance/shared protocol content, including the delegated decision matrix, survives bundling.

## Missing Tests

No requirement-blocking gap found. The existing tests cover the change-added scenarios at source, renderer, and installed-copy levels.

Non-blocking future hardening opportunity: parity tests intentionally assert protocol phrases and the compliance decision table, rather than byte-for-byte equivalence of every rendered installed lifecycle skill. That is outside the merged requirement, which requires consistent ownership protocol, and does not affect this verification result.

## Spec Dependency Chain

`skills:workflow-automation`
→ `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, `core:transition-checks`.

`skills:skill-templates-source`
→ `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`.

The implementation reflects the chain: templates encode agent workflow policy; the Skills renderer (`createSkillRepository` / `ResolveBundle`) emits the bundled form; installed copies are validated for the newly materialized lifecycle protocol.

## Summary counts

| Item                               |         Count |
| ---------------------------------- | ------------: |
| Specs audited                      |             2 |
| Merged requirements assessed       |            35 |
| Change-added requirements assessed |             2 |
| Change-added scenarios assessed    |             6 |
| Discrepancies                      |             0 |
| Critical / High / Medium / Low     | 0 / 0 / 0 / 0 |
| Test commands executed             |             1 |
| Tests passed                       |            61 |
| Missing requirement-blocking tests |             0 |
