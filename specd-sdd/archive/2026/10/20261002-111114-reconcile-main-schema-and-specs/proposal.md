# Proposal: reconcile-main-schema-and-specs

## Motivation

The `feat/lifecycle-transitions-ux` branch diverged from `main` at commit `ddd990c70`. During subsequent development, `main` incorporated critical architectural advancements in schema management—most notably commit `174a72a13` (`fix(core): use manifest root schema as truth for change entity`), which establishes manifest root `schema` properties (`name` and `version`) as the immutable truth for `Change` entities and introduces `IncompatibleSchemaError`. In addition, `main` introduced project summary overlap enrichments (`fd74a6dc2`), spec-lock LLM optimizations, and documentation alignments.

To ensure that upcoming UX and transition changes (such as skippable workflow states) build on an authoritative, conflict-free domain foundation, we must formalize the reconciliation of `main` into `feat/lifecycle-transitions-ux`, align normative specs and spec locks, and integrate change-driven schema resolution across core use cases and repositories.

## Current behaviour

Prior to this reconciliation:

- On `feat/lifecycle-transitions-ux`, `Change` entities still inferred schema identity from the initial `created` event in history rather than root manifest properties.
- Use cases like `CreateChange` and `EditChange` did not guard against mixing specs with incompatible schema identities.
- Git merge conflicts existed across 30 files spanning core domain models (`Change`, `ChangeProps`), repositories (`FsChangeRepository`, `ManifestChangeLoader`), use cases (`CreateChange`, `EditChange`), test suites, and normative specs (`specs/core/change`, `specs/core/change-manifest`, `specs/core/create-change`, `specs/core/edit-change`, `specs/core/kernel`).
- Active and paused changes (such as `schema-workflow-skippable-states`) faced uncertainty regarding whether the active workspace schema or the change manifest schema dictates artifact schemas and validator rules.

## Proposed solution

Complete and formalize the integration of `main` into `feat/lifecycle-transitions-ux`:

1. **Git Integration & Conflict Resolution**: Reconcile all code and spec conflicts resulting from merging `main`, adopting the root manifest schema model while preserving custom check registry and hook resilience features introduced on `feat/lifecycle-transitions-ux`.
2. **Authoritative Schema Model**: Uphold `Change.schemaName` and `Change.schemaVersion` as immutable properties instantiated directly from `manifest.schema` across all loaders and repositories.
3. **Schema Compatibility Guardrails**: Enforce `IncompatibleSchemaError` during `CreateChange` and `EditChange` when adding specs whose persisted schemas mismatch the target change's schema.
4. **Spec & Lock Alignment**: Synchronize normative specifications and `spec-lock.json` dependency graphs so that spec metadata reflects the post-merge capabilities (`core:transition-checks`, project summary overlap ports, etc.).
5. **Quality Verification**: Ensure that the unified codebase passes 100% of monorepo typechecks and test suites.

## Specs affected

### New specs

None.

### Modified specs

- `core:change`: Incorporate root `schemaName` and `schemaVersion` properties on `ChangeProps` and `Change` entity as immutable truth, rather than relying on `created` history events.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-manifest`: Formalize root `schema` object (`name` and `version`) in `manifest.json` as the authoritative source for change schema identity.
  - Depends on (added): none
  - Depends on (removed): none
- `core:create-change`: Validate that all initial spec IDs belong to the same schema as the change, throwing `IncompatibleSchemaError` on mismatch.
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: Validate that any added specs match the change's root schema identity before persisting edits.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: Update kernel boundaries, input ports, and project context/summary capabilities to reflect unified schema validation and overlap enrichment.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Core Domain & Entities**: `packages/core/src/domain/entities/change.ts` requires `schemaName` and `schemaVersion` in `ChangeProps`. All test fixtures and factories constructing `new Change(...)` directly must supply these fields.
- **Infrastructure Loaders & Repositories**:
  - `packages/core/src/infrastructure/fs/manifest-change-loader.ts` hydrates `Change` from `manifest.schema`.
  - `packages/core/src/infrastructure/fs/change-repository.ts` serializes `schemaName` and `schemaVersion` directly from the `Change` aggregate.
- **Application Use Cases**:
  - `packages/core/src/application/use-cases/create-change.ts` and `edit-change.ts` combine schema compatibility checks with lifecycle transition check validation.
- **Normative Specs**: `specs/core/change`, `specs/core/change-manifest`, `specs/core/create-change`, `specs/core/edit-change`, and `specs/core/kernel` are synchronized with `main`'s latest definitions.
- **Test Suites**: All unit, integration, and composition suites in `@specd/core` and throughout the monorepo pass cleanly.

## Technical context

- **Root Manifest as Truth**: Following ADR and commit `174a72a13`, deriving schema identity from event history introduced circular hydration issues when evaluating invalidations or reloading manifests without full history replay. The root `manifest.schema` provides an immutable, constant-time reference.
- **Sequential Change Precedence**: Completing and archiving this reconciliation change before continuing with `schema-workflow-skippable-states` ensures that skippable states logic is developed against a clean, post-merge baseline of schemas and specs.
- **Non-Regression on Custom Checks**: The merge preservation confirmed that `WorkflowCheckRegistry`, `CheckRegistry`, and custom transition checks developed on `feat/lifecycle-transitions-ux` remain completely functional and compatible with `main`'s schema guardrails.

## Open questions

None — All integration requirements, merge resolutions, and schema architecture decisions were validated during the merge execution and confirmed by comprehensive test passing.
