# Partial compliance audit — Core change-scoped use cases

Mode: delegated change audit  
Change: `schema-workflow-skippable-states`  
Attempt: `verification-attempt-9`  
Scope: `core:transition-change`, `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, `core:change`, plus direct/global dependencies relevant to sovereign schema resolution.

## Requirements Summary

The merged change specs establish one common invariant: after a change or archived change has been identified, every schema-derived decision must resolve the schema recorded on that object (`SchemaProvider.get(change.schemaName)` or `get(archived.schemaName)`), never the current workspace default. Resolution failure must propagate without falling back or creating cross-schema evidence. The individual responsibilities are:

- `TransitionChange`: resolve topology, `next`, bypasses, bindings, predicates, and effects from the change schema.
- `ChangeManifest`: hydrate the root manifest schema as immutable sovereign identity; a different workspace schema name must not reject loading.
- Validation, preview, context, instruction, approval, status, task-counting, invalidation, and editing use cases: base every change-scoped schema decision on that identity.
- `ArchiveChange`, `RunStepHooks`, and `GetHookInstructions`: retain the same authority after archival so archive hooks/instructions and materialization do not silently switch schema.
- `StartVerification` and `ValidityFingerprintService` (specified through `core:change`): use the recorded schema for readiness and every artifact-bearing validity fingerprint.
- Workspace/spec-only operations with no change identity remain allowed to call unnamed `SchemaProvider.get()`.

This matches the proposal's stated intent at `proposal.md:181-182`: `manifest.schema` governs the whole lifecycle and all existing-change use cases must be isolated from the workspace default.

## Implementation Status

### Implemented

All audited production call sites that already possess a `Change` or archived record use a named schema lookup:

- `transition-change.ts:217` — `get(change.schemaName)`.
- `validate-artifacts.ts:176` — `get(change.schemaName)`.
- `run-step-hooks.ts:114,157` — archived and active records both use their recorded name.
- `preview-spec.ts:102`, `get-status.ts:450,758`, `archive-change.ts:282`, `approve-spec.ts:83`, `approve-signoff.ts:95`, `compile-context.ts:271`, `get-artifact-instruction.ts:89`, `get-hook-instructions.ts:94` — named sovereign lookup.
- `edit-change.ts:137`, `invalidate-change.ts:116`, `count-tasks.ts:41`, `start-verification.ts:117`, and `reconcile-change-validity.ts:203` — the previously outstanding change-scoped paths now use `change.schemaName`.
- `change-repository.ts:1346-1354` warns only for a version difference when the schema name is the same; it no longer rejects a different active/workspace schema name. Hydration uses `manifest.schema.name/version` at `change-repository.ts:1450-1451`.
- Archive compatibility is preserved: `ArchiveChange` resolves the loaded change schema before reconciliation; archived `RunStepHooks` and `GetHookInstructions` resolve `archived.schemaName`, so the archived `custom-checks-and-resilient-hooks` hook model continues to select hook entries from the correct schema. No check binding widens hook `onFailure: warn` into check orchestration policy.

Repository-wide inspection found unnamed `SchemaProvider.get()` only in operations without an existing change identity (`ResolveInitialPersistedDependsOn`, `GenerateSpecMetadata`, `ValidateSpecs`, `GetProjectContext`, `GetSpecOutline`, `GetSpecContext`), which is consistent with the design's explicit boundary.

### Partially compliant due to spec conflict

The implementation follows the new sovereign-schema contract, but the merged specification set still contains an unreconciled opposite rule in `core:change`; see D-1.

## Discrepancies

### D-1 — MAJOR — Merged specs simultaneously require and forbid rejecting a workspace/default schema-name mismatch

Evidence:

- The change delta for `core:change-manifest` states that a workspace default name differing from `manifest.schema.name` **MUST NOT** reject loading with `SchemaMismatchError` (`deltas/core/change-manifest/spec.md.delta.yaml:11`).
- The existing merged dependency `core:change` still says: “When a use case detects that `schema.name() !== change.schemaName`, it MUST throw `SchemaMismatchError` before performing any work” (`specs/core/change/spec.md:342`).
- The base `core:change-manifest` also historically contains the rejecting rule (`specs/core/change-manifest/spec.md:73`); its own delta replaces that requirement in its merged preview, but no delta removes or revises the independent contradictory requirement in `core:change`.
- Code implements non-rejection in `packages/core/src/infrastructure/fs/change-repository.ts:1346-1354`, and a regression test proves hydration succeeds with a different active schema name at `packages/core/test/infrastructure/fs/change-repository.spec.ts:2667`.

Spec interpretation: if the surviving `core:change` requirement remains normative, the repository and every newly corrected sovereign lookup are wrong because use cases should compare against the active/default schema and throw. This also conflicts with the proposal's lifecycle-wide sovereign-schema intent and would make the new `ArchiveChange`, hooks, status, and verification behavior internally inconsistent.

Code/change interpretation: the implementation and new `core:change-manifest` delta are correct; the old `core:change` requirement is stale specification text left behind during the sovereignty migration. The appropriate correction is a `core:change` delta that replaces/removes the schema-name mismatch requirement and explicitly distinguishes (a) workspace-default mismatch, which is allowed, from (b) a provider integrity failure returning a schema whose identity does not match the requested sovereign reference, which may still be rejected.

Impact: reviewers cannot determine compliance from the merged specs, and future agents could legitimately reintroduce the forbidden default-schema comparison. This is a specification-consistency blocker for a clean full compliance declaration even though runtime behavior matches the proposal.

## Test Coverage

Strong direct coverage exists for the central invariant:

- Manifest hydration and version advisory: `change-repository.spec.ts:2667,2687`.
- Transition/topology isolation: `transition-change.spec.ts:3657,3923`.
- Active status projection: `get-status.spec.ts:118`.
- Validation: `validate-artifacts.spec.ts:160`.
- Preview: `preview-spec.spec.ts:140`.
- Archive success and provider-integrity rejection: `archive-change.spec.ts:312,330`.
- Approval gates: `approve-spec.spec.ts:389`, `approve-signoff.spec.ts:460`.
- Context and artifact instructions: `compile-context.spec.ts:544`, `get-artifact-instruction.spec.ts:172`.
- Active/archived hook instructions: `get-hook-instructions.spec.ts:200-222`.
- Executable hooks: `run-step-hooks.spec.ts:90`.
- Scope editing and failure atomicity: `edit-change.spec.ts:483-537`.
- Invalidation DAG selection and failure atomicity: `invalidate-change.spec.ts:153-182`.
- Task discovery/counting and failure propagation: `count-tasks.spec.ts:17-51`.
- Verification readiness and no-attempt-on-failure: `start-verification.spec.ts:126-145`.
- Artifact/approval/complete fingerprint selection and failure propagation: `validity-fingerprint-service.spec.ts:172-213`.

These tests generally make sovereign and default schemas observably different, which validates behavior rather than merely asserting a spy argument.

## Missing Tests

1. **LOW:** `GetStatus` explicitly implements `get(draftView.schemaName)` at line 758, but the dedicated sovereignty regression covers an active change only. Add a drafted-change fixture whose recorded schema and workspace default produce observably different workflow/artifact projections.
2. **LOW:** `RunStepHooks` has direct named-lookup coverage for an active change, while the archived fallback is exercised functionally elsewhere but lacks an equally explicit, observably different sovereign/default executable-hook regression. `GetHookInstructions` already covers both active and archived instruction hooks, reducing risk.
3. **LOW:** Several simpler use-case tests assert the named argument but do not all include an explicit resolution-failure/no-fallback case. Failure atomicity is, however, covered at the highest-risk mutation/evidence boundaries (`EditChange`, `InvalidateChange`, `StartVerification`, fingerprints, archive).

## Spec Dependency Chain

```text
proposal sovereign-schema intent
  -> core:change-manifest (persisted schema identity / load semantics)
  -> core:change (aggregate identity, verification and fingerprint semantics)
  -> core:workflow-model + core:workflow-topology + core:schema-format
  -> TransitionChange / GetStatus / ValidateArtifacts / approvals / context / instructions
  -> EditChange / InvalidateChange / CountTasks / StartVerification
  -> ValidityFingerprintService
  -> verification, sign-off, reconciliation and ArchiveChange evidence
  -> archived RunStepHooks and GetHookInstructions
```

The runtime chain consistently carries `change.schemaName`. The only broken link is documentary: the old `core:change` mismatch rule contradicts the new manifest authority rule.

## Summary Counts

- Specs audited: 16 change specs plus relevant direct/global dependencies.
- Fully implemented change-scoped named lookup paths: 18 production call sites (including active/draft and active/archive branches).
- Implementation discrepancies: 0.
- Spec-to-spec discrepancies: 1 MAJOR.
- Missing/insufficient focused tests: 3 LOW.
- Critical findings: 0.
- Major findings: 1.
- Minor findings: 0.
- Overall result: **NOT CLEAN** until D-1 is resolved in the specification set; implementation matches the proposal's intended sovereign-schema behavior.
