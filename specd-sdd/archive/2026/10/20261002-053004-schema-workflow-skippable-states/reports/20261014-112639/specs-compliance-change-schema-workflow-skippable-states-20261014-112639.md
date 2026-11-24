# Full compliance report — schema-workflow-skippable-states

- Mode: delegated change audit
- Outer verification attempt: `verification-attempt-10`
- Result: **FAIL — corrective work required**
- Scope: 25 change specs plus direct dependencies and global constraints
- Tests: monorepo suite passed; focused audit suites passed (356 foundation, 560 use cases, 111 surfaces)
- Static gates: lint and typecheck passed

## Executive summary

The original proposal intent is substantially implemented: change-scoped operations request the schema recorded by the change, optionality is schema-owned, an empty effective step-skip set permits an unconditional shortcut, disabled steps are removed from the active graph, and skills consume Core routing rather than inventing policy.

The final merged contracts nevertheless contain or expose four major gaps. Status does not execute bypassed-step predicates before recommending a shortcut; the contract for disabling `done` conflicts with the current archive boundary; returned provider identity is only guarded by ArchiveChange although the merged `core:change` contract requires it for every operation; and the same-name version advisory is tied to the workspace default rather than the resolved sovereign schema. A minor documentation-test gap also remains.

## Findings

### MAJOR F-1 — Status guidance omits step-skip predicate evaluation

`GetStatus` delegates candidates to `executeChecksByLegalTargets`, but that helper does not compute `bypassedSteps` or execute `scope: step-skip` attempts. `TransitionChange` does both. Status can therefore recommend a shortcut that execution rejects. The preferred repair is to share bypass evaluation on both read and mutation paths and add GetStatus integration coverage.

### MAJOR F-2 — `done: disabled` has contradictory semantics

Merged topology language permits disabled intermediate delivery steps to be bypassed and protects `done` only when signoff is enabled. Runtime nevertheless requires `done` as the sole source for entry to `archivable`, and its test expects disabled `done` to disconnect the graph. Design must choose whether `done` is always a mandatory archive anchor or is bypassable when signoff is off.

### MAJOR U-1 — Provider identity integrity is archive-only

All audited consumers now call `SchemaProvider.get(change.schemaName)`, satisfying the original named-lookup/no-default-fallback intent. However, only `ArchiveChange` checks that the returned schema identity matches the requested reference and maps mismatch to `SchemaMismatchError`. The merged `core:change` requirement applies that invariant to every operation. Prefer one centralized checked schema-resolution boundary plus contract tests for every consumer.

### MAJOR U-2 — Version advisory is not based on the resolved sovereign schema

`FsChangeRepository` compares the manifest version only with the injected workspace active/default schema when names match. If the workspace default differs while the recorded schema resolves to a newer same-name version, no advisory is emitted. Either implement a shared resolved-schema version advisory or narrow the merged requirement explicitly.

### MINOR S-1 — Missing semantic generated-guide regression assertion

Documentation and generated guides currently contain the intended optional/disabled/empty-effective-set explanation, but guide tests do not assert that semantic content. Add a generated-guide integration assertion covering unconditional empty-set bypass, explicit optional-step entry, disabled-step exclusion, and Core-owned routing.

## Intent assessment

- Proposal's original sovereign named-lookup intent: implemented across all 15 audited change-bound surfaces.
- Optional versus disabled semantics in CLI, skills and documentation: implemented coherently.
- Stronger final merged provider-integrity and version-advisory contract: not fully implemented.
- Shared status/execute bypass semantics: not fully implemented.
- `done: disabled`: unresolved specification/implementation contradiction.

## Evidence and detailed findings

The complete delegated audit outputs are retained as the authoritative detailed findings for traceability:

1. [`_partial-foundation.md`](./_partial-foundation.md) — 6 specs, 88 requirements, 260 scenarios, 356 focused tests, 2 MAJOR findings.
2. [`_partial-usecases.md`](./_partial-usecases.md) — 15 specs, 17 changed sovereign-schema requirement sections, 30 direct scenarios, 560 focused tests, 2 MAJOR findings.
3. [`_partial-surfaces.md`](./_partial-surfaces.md) — 4 specs, 55 requirements, 135 scenarios, 111 focused tests, 1 MINOR finding.

These partials contain the full requirement summaries, implementation evidence, alternative spec-vs-code interpretations, dependency/global consistency analysis, coverage gaps, and exact source/test references. They remain alongside this report and were not deleted.

## Verification disposition

The delegated compliance audit failed on major findings. The outer verification attempt MUST remain active and MUST NOT be completed or advanced to `done` until the user selects a corrective route and the required design/implementation work is performed and reverified against a fresh baseline.
