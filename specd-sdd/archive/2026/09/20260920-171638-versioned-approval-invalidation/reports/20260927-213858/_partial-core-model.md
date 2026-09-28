# Partial audit — Core domain, persistence, configuration, and checks

## Requirements summary

Scope: `core:change`, `core:change-repository-port`, `core:config`, `core:change-manifest`, `core:schema-format`, and `core:transition-checks`.

The merged contracts require a versioned v2 manifest with v1 read compatibility; append-only approval and verification history; materialized current projections; scope-aware approval fingerprints; artifact and normalized implementation fingerprints; task-artifact exclusion through `hasTasks`; structured invalidation policy with `{ artifacts: downstream, workflow: preserve }` as the native default; configured defaults at composition boundaries; central registered checks; and neutral application-level `designing -> designing` handling without making entity self-transitions legal.

## Implementation status

**PASS.** The implementation is distributed through the `Change` aggregate and validity value objects, manifest parser/serializer and loader, filesystem repository, configuration loader, transition/check registry, and composition exports. The contracts and implementation agree on these important boundaries:

- v1 is adapted on read and is not rewritten by hydration; the first real mutation persists v2.
- v2 stores structured invalidation policy and explicit current approval/verification projections without erasing historical events.
- unsupported future manifest versions fail explicitly.
- spec approval fingerprints include canonical scope; set-equivalent reorderings remain valid, additions/removals become stale with precise differences.
- implementation input hashes use SHA-256, normalize text whitespace without language parsers, retain byte hashing for binary content, and reject missing inputs.
- task artifacts are excluded by schema metadata (`hasTasks`), not by filename.
- repository reads hydrate physical facts without independently deciding or persisting lifecycle recovery.
- central reconciliation owns materialized invalidation and recovery; registered transition/operation checks remain the shared protocol.
- `designing` self-entry is intercepted as a no-op at the application boundary; a real entity self-transition and `verifying -> verifying` remain invalid.

## Discrepancies

None found in this batch.

The four model/contract findings from attempt 8 are resolved: neutral self-entry is now one coherent no-event contract; current config no longer promises phase skipping; schema-format approval language is gate-aware and scope-wide; and repository hydration is explicitly non-writing while reconciliation owns persistence.

## Test coverage

Representative coverage includes:

- `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`: immutable hydration, v1 legacy adaptation, transitional and native v2 scope-aware approvals, scope additions/removals, and future-version rejection.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts`: v1 read compatibility, v2 writes, and manifest round trips.
- `packages/core/test/application/services/validity-fingerprint-service.spec.ts`: artifact/task selection, link deduplication, text/binary fingerprint inputs, and missing files.
- `packages/core/test/domain/value-objects/validity-fingerprint.spec.ts`: deterministic comparison and difference reporting.
- `packages/core/test/domain/entities/change.spec.ts`: append-only projections, approval/verification attempt history, invalidation idempotency, lifecycle/recovery edges, and retained evidence.
- `packages/core/test/domain/services/change-validity.spec.ts`: preserve/redesign behavior and approval/sign-off/verification recovery precedence.
- `packages/core/test/application/services/execute-matching-predicates.spec.ts` and `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`: stable check registration and de-duplication across overlapping bindings.
- `packages/core/test/application/use-cases/transition-change.spec.ts`: neutral designing self-entry and rejection of verifying self-entry.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `packages/core/test/application/use-cases/create-change.spec.ts`, and composition tests: structured/legacy configuration, defaults, and explicit override precedence.

The complete Core suite passed: **221 files, 2,758 tests**.

## Missing tests

No material missing scenario was identified. The merged verification artifacts contain extensive inherited coverage; this audit treats exact presentation or internal implementation choices as non-contractual unless required by the merged spec.

## Spec dependency chain

Direct dependencies were checked at depth one against the loaded project directives, especially architecture, storage, workflow model, lifecycle engine, composition, spec metadata, and transition checks. No contradiction with the global architecture, conventions, testing, documentation, or error-handling directives was found.

## Summary counts

- Specs audited: 6
- Merged scenarios inventoried: 496
- Confirmed discrepancies: 0
- Material missing tests: 0
- Result: PASS
