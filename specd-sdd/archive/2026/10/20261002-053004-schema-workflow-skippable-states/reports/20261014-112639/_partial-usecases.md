# Delegated compliance audit — sovereign-schema use cases

## Scope and evidence

- Change: `schema-workflow-skippable-states`
- Outer verification attempt: `verification-attempt-10` (delegated; this audit did not start or complete it)
- Specs audited: `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, and `core:change`
- Merged-spec source: `changes spec-preview`; change deltas were also inspected to isolate the newly asserted sovereign-schema contracts.
- Code discovery: `graph search SchemaProvider --symbols` and `graph impact --symbol SchemaProvider --direction dependents`, followed by targeted source/test inspection.
- Graph status: `stale: false`, schema-compatible and coverage-complete; content freshness is unknown only because observations are absent (`CONTENT_UNKNOWN`), not because a fingerprint mismatch was detected.
- Executed regression set: 16 files, 560 tests, all passed.

## Proposal and design intent

The proposal explicitly identifies default-schema coupling as a defect and states that `manifest.schema` / `change.schemaName` is sovereign for the whole lifecycle (`proposal.md:20-22`, `41`, `179-182`, `281`). The design repeats that intent as “sovereign change-schema authority across all operations” (`design.md:10-14`) and requires observably different default and sovereign fixtures (`design.md:556-564`).

The implementation substantially realizes that original intent: every assigned change-scoped use case now calls the provider with the recorded schema name, and repository hydration no longer rejects merely because the workspace default has another name. However, the later `core:change` amendment adds a stronger provider-integrity invariant—every operation must reject a provider response whose identity differs from the requested recorded name. That stronger invariant is not implemented across all operations and is only exercised by archive.

## Requirements summary

The audited change contributes or modifies 17 sovereign-schema requirement sections and 30 directly associated verification scenarios across the 15 assigned specs. Their contract is:

1. Persisted `manifest.schema` is immutable sovereign identity; a different workspace default cannot replace or reject it.
2. Change-scoped operations request `SchemaProvider.get(change.schemaName)` (or the recorded draft/archive equivalent), never unnamed/default resolution.
3. Schema-derived artifacts, topology, hooks, instructions, compatibility, invalidation targets, task patterns, readiness, and fingerprints come exclusively from the recorded schema.
4. Resolution failure propagates without fallback, except `GetStatus`, which intentionally degrades to a read-only `SCHEMA_RESOLUTION_FAILED` projection.
5. A returned schema with a different identity from the requested sovereign name is a provider-integrity failure and must raise `SchemaMismatchError` before schema-derived behavior is used.
6. Same-name version mismatch is advisory and must not block ordinary operations or archive.

## Implementation status by spec

| Spec                            | Implementation evidence                                                                                                                                                                                  | Test evidence                                                                                                                                                                 | Status                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `core:change-manifest`          | `FsChangeRepository` hydrates the manifest identity and only compares same-name active/default versions for a warning (`change-repository.ts:1343-1351`); it no longer rejects a different default name. | `change-repository.spec.ts:2670-2684` proves a different workspace default name loads and preserves `@specd/schema-std`; adjacent coverage checks same-name version warnings. | Partial: sovereign loading passes; resolved-sovereign version warning is not generally implemented.          |
| `core:validate-artifacts`       | `validate-artifacts.ts:176` requests `change.schemaName` before using artifact types and validation rules.                                                                                               | `validate-artifacts.spec.ts:160-179` asserts the named lookup.                                                                                                                | Partial: lookup/fallback intent passes; returned-name integrity is unchecked.                                |
| `core:run-step-hooks`           | `run-step-hooks.ts:114,157` requests the archived/active object's recorded name and uses that schema's hooks.                                                                                            | `run-step-hooks.spec.ts:90+` covers named resolution.                                                                                                                         | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:preview-spec`             | `preview-spec.ts:102` requests `change.schemaName`.                                                                                                                                                      | `preview-spec.spec.ts:140+` covers named resolution.                                                                                                                          | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:get-status`               | `get-status.ts:450,758` requests active/draft recorded names; its failure branch produces fail-closed read-only degradation.                                                                             | `get-status.spec.ts:118-132` uses observably different sovereign/default schemas and proves sovereign workflow projection.                                                    | Partial: positive sovereignty and resolution failure pass; mismatched returned identity is not rejected.     |
| `core:archive-change`           | `archive-change.ts:282` requests `loadedChange.schemaName`; `schema.nameMatch` runs fail-fast and maps to `SchemaMismatchError` at `archive-change.ts:1468-1469`.                                        | `archive-change.spec.ts:312-342` separately proves provider-identity mismatch rejection and successful sovereign lookup.                                                      | Compliant for name authority/integrity; version-warning caveat remains.                                      |
| `core:approve-spec`             | `approve-spec.ts:83` requests `change.schemaName`.                                                                                                                                                       | `approve-spec.spec.ts:389-407` asserts lookup and success with `schema-a`.                                                                                                    | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:approve-signoff`          | `approve-signoff.ts:95` requests `change.schemaName`.                                                                                                                                                    | `approve-signoff.spec.ts:460-478` asserts lookup and success with `schema-a`.                                                                                                 | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:compile-context`          | `compile-context.ts:271` requests `change.schemaName`.                                                                                                                                                   | `compile-context.spec.ts:544-557` asserts named resolution.                                                                                                                   | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:get-artifact-instruction` | `get-artifact-instruction.ts:89` requests `change.schemaName`.                                                                                                                                           | `get-artifact-instruction.spec.ts:172+` proves sovereign lookup.                                                                                                              | Partial: lookup passes; returned-name integrity is unchecked.                                                |
| `core:get-hook-instructions`    | The use case derives `schemaName` from the active or archived record, then calls `get(schemaName)` at line 94.                                                                                           | `get-hook-instructions.spec.ts:200-222` proves both active and archived lookups return sovereign hooks rather than default hooks.                                             | Partial: positive sovereignty passes; returned-name integrity is unchecked.                                  |
| `core:edit-change`              | `edit-change.ts:137` performs one pre-mutation sovereign compatibility lookup; serialized scope mutation delegates topology/validity to `ctx.reconcileAfter()` rather than a second direct lookup.       | `edit-change.spec.ts:483-537` distinguishes schemas, asserts one named lookup and resolution failure; later tests cover reconciliation atomicity.                             | Partial: ownership/atomicity passes; direct and reconciler provider responses lack a general identity guard. |
| `core:invalidate-change`        | `invalidate-change.ts:116` requests `change.schemaName` before computing targets. Reconciliation/fingerprint paths also use the recorded name.                                                           | `invalidate-change.spec.ts:153-190` proves sovereign target selection and no persistence on resolution failure.                                                               | Partial: lookup/failure atomicity pass; returned-name integrity is unchecked.                                |
| `core:count-tasks`              | `count-tasks.ts:41` requests `input.change.schemaName` and derives task artifacts/patterns from that schema.                                                                                             | `count-tasks.spec.ts:17-55` proves differing declarations and no fallback on failure.                                                                                         | Partial: lookup/fallback behavior passes; returned-name integrity is unchecked.                              |
| `core:change`                   | `start-verification.ts:117` and `validity-fingerprint-service.ts:115` request `change.schemaName`; the latter centralizes artifact selection for all fingerprint APIs.                                   | `start-verification.spec.ts` and `validity-fingerprint-service.spec.ts:172-214` cover sovereign selection, failure propagation, and absence of fallback evidence.             | Partial: sovereign selection passes; universal returned-name check and resolved-version warning do not.      |

## Discrepancies

### MAJOR 1 — Provider identity is enforced only by archive, contrary to `core:change`

**Spec evidence.** The merged `core:change` “Schema version” requirement says that after resolving the recorded reference, any returned schema whose identity differs from the requested `schemaName` MUST cause `SchemaMismatchError` before topology, artifacts, checks, hooks, or validation rules are used. It applies to every operation on active, drafted, discarded, or archived changes.

**Code evidence.** `LazySchemaProvider.get(ref)` caches and returns `ResolveSchema.execute(ref)` without asserting `resolved.name() === ref` (`packages/core/src/composition/lazy-schema-provider.ts:28-57`). Among the audited use cases, only `ArchiveChange` executes `schema.nameMatch` and maps failure to `SchemaMismatchError`. `ValidateArtifacts`, `RunStepHooks`, `PreviewSpec`, `GetStatus`, approvals, context/instruction readers, edit, invalidate, task counting, verification start, and fingerprint collection immediately consume the returned schema after the named lookup. A repository-wide test search finds an actual `toThrow(SchemaMismatchError)` assertion only in `archive-change.spec.ts:326`.

**Impact.** A faulty/custom provider can be asked for `custom-workflow`, return `schema-std`, and most operations will consume the wrong artifact model, workflow, checks, hooks, validation rules, or fingerprint scope. This violates the stronger merged requirement and weakens the proposal's isolation guarantee despite using the correct lookup argument.

**Interpretation options.** Either implementation is incomplete and needs a centralized checked resolution boundary (preferred to duplicating guards), or the universal `core:change` requirement is too strong and must be narrowed explicitly to archive/provider contracts. The current combination is not compliant.

### MAJOR 2 — Same-name version advisory is tied to the workspace default, not the resolved sovereign schema

**Spec evidence.** Merged `core:change` requires a warning when the schema resolved for the recorded name has the same name but a different version, while keeping the change usable and archive allowed. The proposal's authority model says all lifecycle evaluation is isolated from the workspace default.

**Code evidence.** `FsChangeRepository` warns only when its injected `_activeSchema.name` equals the manifest name and `_activeSchema.version` differs (`change-repository.ts:1343-1351`). Change-scoped use cases resolve the sovereign schema, but none compares its version with `change.schemaVersion` or emits the advisory. Consequently, if the workspace default is another schema while `get(change.schemaName)` resolves a newer same-name version, no warning is emitted. Archive remains allowed, but the mandated advisory is absent.

**Test gap.** Existing repository coverage tests an active/default same-name version difference, not a differing workspace default plus a newer resolved sovereign schema. The archive sovereign fixture tests names but not version/warning behavior.

**Interpretation options.** Either add a shared sovereign resolution/validation service that performs name integrity and version advisory consistently, or revise the merged requirement back to an explicitly workspace-default-only `MAY` warning. As written, code and spec diverge.

## Test coverage and missing tests

The focused suite passed: **16 test files, 560 tests, 0 failures**. Positive sovereign lookup is well covered for all assigned runtime surfaces, and the strongest behavioral fixtures distinguish sovereign/default artifact sets, hooks, compatibility, targets, task declarations, readiness, and fingerprint selection. Failure atomicity/no-fallback coverage is particularly strong for edit, invalidate, count-tasks, verification start, and fingerprints.

Missing coverage follows the two discrepancies:

1. Parameterized or shared-contract tests should pass a provider that returns a differently named schema to every change-scoped consumer and assert `SchemaMismatchError` before observable schema-derived work. At minimum cover validation, hooks, preview/status, approvals, context/instructions, edit/reconcile, invalidate, count, verification start, and fingerprints.
2. Add a fixture where workspace default name differs, `change.schemaName` resolves successfully with a newer version, and the warning names both recorded/resolved versions while the operation and archive remain usable.
3. `GetStatus` needs an explicit decision/test for provider-identity mismatch: throw as required by `core:change`, or degrade with a distinct integrity blocker if the status contract is intentionally exceptional. Its current resolution-failure degradation does not define this case.

## Dependency and global consistency

- The named-lookups preserve hexagonal boundaries: application use cases depend on the `SchemaProvider` port, and the filesystem repository remains an adapter. No global architecture violation was found.
- `core:change-manifest` and `core:change` are now consistent about allowing a workspace-default name difference. The earlier semantic contradiction has been removed.
- The dependency chain is coherent for sovereign selection: `core:change` supplies recorded identity; `core:change-manifest` persists/hydrates it; use-case specs consume it; `ValidityFingerprintService` centralizes evidence artifact selection.
- The provider-integrity rule is not coherently located. It is declared globally in `core:change`, implemented as an archive transition predicate, absent from the `SchemaProvider` port contract, and absent from most consumers. This is the principal cross-spec/runtime inconsistency.
- `core:change-manifest` allows workspace-default version warning (`MAY`), whereas `core:change` mandates resolved same-name warning (`MUST`). These can coexist only if both sources are intentionally checked; runtime currently checks only the former source.
- Global testing and error-handling conventions are otherwise respected: Vitest coverage exists, failures are typed where implemented, and read-only status degradation is actionable.

## Counts and conclusion

- Assigned specs audited: **15**
- Changed sovereign-schema requirement sections audited: **17**
- Direct sovereign-schema scenarios audited: **30**
- Focused automated tests: **560 passed / 0 failed**
- Findings: **2 MAJOR**, **0 MINOR**, **0 INFO-only discrepancies**
- Fully compliant assigned specs for the complete merged name-integrity/version contract: **0/15** (archive fully implements name integrity but shares the unresolved version-advisory gap)
- Compliant with the proposal's original named-lookup/no-default-fallback intent: **15/15**

**Audit result: FAIL (major compliance issues).** The original proposal intent to request and use `change.schemaName` is broadly implemented and well tested. The final merged contract goes further: it requires universal returned-identity validation and sovereign resolved-version advisories. Those stronger guarantees are not yet implemented consistently, so the outer full verification attempt must not be completed on this audit evidence.
