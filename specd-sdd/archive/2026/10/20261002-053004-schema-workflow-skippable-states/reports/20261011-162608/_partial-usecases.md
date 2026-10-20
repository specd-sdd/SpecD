# Delegated compliance audit — core use cases

Change: `schema-workflow-skippable-states`  
Attempt: `verification-attempt-6` (delegated; this audit did not start or complete it)  
Scope: `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`.

Retry confirmation (2026-10-12): the merged artifacts, active attempt, audited source call sites, and focused tests were re-read against the current workspace. Findings and counts below remain unchanged; no verification start/complete command was run.

## Requirements summary

The merged change specifications establish one common rule: after a change is loaded, every change-scoped schema decision must resolve the schema recorded by that change (`SchemaProvider.get(change.schemaName)`), never silently use the workspace default. The selected schema governs artifact validation, hook selection, preview parsing/templates, status projection, archive metadata/hooks, approval guards, compiled instructions/templates, artifact/hook instructions, edit compatibility/reconciliation, invalidation target expansion, and task counting. Resolution failures generally propagate before mutation; `GetStatus` is the deliberate exception and must return an actionable read-only degraded status.

`core:edit-change` adds a stronger ownership constraint: direct compatibility resolution happens once before mutation, while the serialized mutation uses `replaceSpecIds()` and `ctx.reconcileAfter()`; it must not contain a second direct schema lookup or use `updateSpecIds()` for synchronization.

## Implementation status

| Spec                            | Implementation evidence                                                                                                                                                                                                                                                                                                                        | Status                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `core:validate-artifacts`       | `validate-artifacts.ts:176` calls `get(change.schemaName)` before validation. Resolution and sovereign-schema tests at `validate-artifacts.spec.ts:140-179`.                                                                                                                                                                                   | Conformant                                                    |
| `core:run-step-hooks`           | Active changes use `get(change.schemaName)` at `run-step-hooks.ts:157`; archived post-hooks use `get(archived.schemaName)` at line 114. Tests at `run-step-hooks.spec.ts:78-103`.                                                                                                                                                              | Conformant                                                    |
| `core:preview-spec`             | `preview-spec.ts:102` calls `get(change.schemaName)`. Direct scenario test at `preview-spec.spec.ts:140-156`.                                                                                                                                                                                                                                  | Conformant                                                    |
| `core:get-status`               | Active and draft paths call `get(change.schemaName)` / `get(draftView.schemaName)` at `get-status.ts:450,758`; failures are caught into the documented degraded result. Failure/read-only assertions at `get-status.spec.ts:296-361`.                                                                                                          | Conformant; positive custom-schema scenario lacks direct test |
| `core:archive-change`           | `archive-change.ts:282` calls `get(loadedChange.schemaName)` before archive work. Existing mismatch guard at line 1469 validates provider integrity, not the workspace default.                                                                                                                                                                | Conformant; new success scenario lacks direct test            |
| `core:approve-spec`             | `approve-spec.ts:83` calls `get(change.schemaName)`. Positive sovereign-schema test at `approve-spec.spec.ts:389-407`.                                                                                                                                                                                                                         | Conformant                                                    |
| `core:approve-signoff`          | `approve-signoff.ts:95` calls `get(change.schemaName)`. Positive sovereign-schema test at `approve-signoff.spec.ts:460-478`.                                                                                                                                                                                                                   | Conformant                                                    |
| `core:compile-context`          | `compile-context.ts:271` calls `get(change.schemaName)`. Resolution failure and sovereign-schema tests at `compile-context.spec.ts:508-557`.                                                                                                                                                                                                   | Conformant                                                    |
| `core:get-artifact-instruction` | `get-artifact-instruction.ts:89` calls `get(change.schemaName)`. Failure and sovereign-schema tests at `get-artifact-instruction.spec.ts:153-191`.                                                                                                                                                                                             | Conformant                                                    |
| `core:get-hook-instructions`    | It derives `schemaName` from the active change or archived record and calls `get(schemaName)` at `get-hook-instructions.ts:70-94`.                                                                                                                                                                                                             | Conformant; merged scenario lacks direct test                 |
| `core:edit-change`              | Live scope-edit path resolves compatibility at `edit-change.ts:139`, then uses `replaceSpecIds()` and `ctx.reconcileAfter()` at lines 285/291. Test at `edit-change.spec.ts:435-484` proves one lookup and no persisted scope change on resolution failure. An unreachable legacy branch still contains forbidden operations at lines 199-200. | Runtime behavior conformant; source-level discrepancy         |
| `core:invalidate-change`        | `invalidate-change.ts:116` calls `get(change.schemaName)` before target computation/persistence. Tests at `invalidate-change.spec.ts:153-194` cover sovereign DAG and pre-persistence failure.                                                                                                                                                 | Conformant                                                    |
| `core:count-tasks`              | `count-tasks.ts:41` calls `get(input.change.schemaName)` before discovering task artifacts/patterns. Tests at `count-tasks.spec.ts:17-56` cover custom schema and failure without fallback.                                                                                                                                                    | Conformant                                                    |

## Discrepancies

### UC-1 — `EditChange` retains forbidden legacy synchronization code

- Severity: **Medium** (no current runtime path, but explicit source/ownership contract violation and regression hazard).
- Evidence: `EditChange.execute()` returns `_executeScopeEdit(...)` whenever `hasSpecChanges` is true (`edit-change.ts:152-160`). The later plain repository mutation nevertheless retains an `if (hasSpecChanges)` block whose body calls a second `SchemaProvider.get(freshChange.schemaName)` and `freshChange.updateSpecIds(...)` (`edit-change.ts:171-207`, specifically 199-200). The merged spec explicitly says it **MUST NOT** call `updateSpecIds()` or perform a second direct lookup.
- Code-correct/spec-wrong possibility: the branch is presently unreachable because every scope edit returns earlier, so externally observable behavior and the “called once” test pass. If the intended contract is only behavioral, the spec's source-level prohibition is stricter than needed.
- Spec-correct/code-wrong possibility: the text intentionally assigns DAG/validity synchronization exclusively to the canonical reconciler. Keeping the old block creates two competing implementations in the same method and can silently reactivate if control flow is refactored. Remove the dead scope-edit block (or simplify the later mutation to description/policy-only work) so the implementation structurally reflects the ownership rule.

No other implementation discrepancy was found in this batch.

## Test coverage

Focused execution succeeded:

```text
Test Files  13 passed (13)
Tests       434 passed (434)
```

Strong direct coverage exists for sovereign resolution in ValidateArtifacts, RunStepHooks, PreviewSpec, ApproveSpec, ApproveSignoff, CompileContext, GetArtifactInstruction, EditChange, InvalidateChange, and CountTasks. Failure-before-mutation/fallback behavior is directly covered where newly required for EditChange, InvalidateChange, and CountTasks. GetStatus directly covers failure degradation and read-only behavior.

Missing or insufficient direct scenario coverage:

1. **`core:get-status` positive sovereign-schema scenario** — tests cover resolution failure, but no test supplies different default/custom schemas and asserts `get('custom-workflow')` plus custom workflow/artifact projection.
2. **`core:archive-change` positive sovereign-schema scenario** — the nearby test at `archive-change.spec.ts:312-327` intentionally supplies a provider returning a mismatched schema and expects `SchemaMismatchError`; it does not prove that a provider keyed by schema A succeeds while project default is schema B.
3. **`core:get-hook-instructions` sovereign-schema scenario** — current tests exercise active/archive selection and hook filtering, but do not spy on `SchemaProvider.get('custom-schema')` or demonstrate instructions coming from a custom schema distinct from the default.
4. **`core:edit-change` reconciliation-failure atomicity** — the suite covers compatibility schema-resolution failure before mutation and asserts a single lookup, but does not directly force `ctx.reconcileAfter()` to fail and assert no partial scope persistence. This is part of the merged scenario's final AND condition.

These are test gaps, not demonstrated product-code failures.

## Dependency and global-constraint conformance

- Direct dependencies were taken from reconciled change status (depth 1). The implementations delegate schema construction to `core:schema-format`/`SchemaProvider`, preserve entity rules from `core:change`, and use the declared composition/reconciliation dependencies rather than adding infrastructure I/O to domain code.
- `EditChange`, `InvalidateChange`, and `CountTasks` remain application-layer use cases with injected ports; no dependency inversion violation was found.
- `GetStatus` preserves the global actionable-error convention with stable `SCHEMA_RESOLUTION_FAILED` data and does not mutate on schema failure.
- No new cross-workspace dependency or circular package edge was observed. All audited source remains under `packages/core` and conforms to the project’s ESM/strict-TypeScript architecture.
- Graph was current (`stale: false`, `coverageComplete: true`). The graph reported `CONTENT_UNKNOWN` because some workspaces lacked observations, but no known stale fingerprint or missing indexed source affected this scope.

## Summary counts

- Specs audited: **13**
- Requirements in the change theme: **13 sovereign-schema requirements**, including the stronger EditChange reconciliation-ownership rule
- Implementation discrepancies: **1 Medium**, **0 High/Critical**, **0 Low**
- Missing/insufficient direct test scenarios: **4**
- Focused test result: **434/434 passed** across **13/13 files**
- Dependency/global-constraint violations: **0**
- Overall delegated batch result: **Issues found; do not declare full compliance without reviewer disposition or remediation.**
