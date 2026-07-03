# Proposal: canonicalize-spec-dependency-metadata

## Motivation

specd currently treats `spec-lock.json` inconsistently: it is modeled as a dedicated persisted sidecar in some flows, but it still leaks through the normal spec artifact surface in others. At the same time, `metadata.json` does not always expose a canonical `dependsOn` view for schemas that cannot derive dependencies from spec artifacts directly.

## Current behaviour

Today, `FsSpecRepository` includes every regular file in a spec directory in `spec.filenames`, which allows `spec-lock.json` to appear as if it were a normal spec artifact. Context consumers such as `GetSpecContext` and `GetProjectContext` read canonical spec information from `metadata.json`, but metadata generation only projects `implementation` from persisted sidecar state and can omit `dependsOn` when the schema does not extract it. `CompileContext` compensates with special-case behavior through `change.specDependsOn`, `metadata.dependsOn`, and extraction fallback, which means canonical dependency semantics are split across multiple paths instead of being consistently normalized in metadata.

## Proposed solution

Make `metadata.json` the canonical normalized consumer representation for spec dependency metadata across heterogeneous schemas, while keeping `spec-lock.json` as a sidecar rather than a normal spec artifact. The change will define that persisted dependency data from `spec-lock.json` feeds canonical `metadata.json.dependsOn` when schemas cannot derive dependencies themselves, preserve `change.specDependsOn` as the change-entry snapshot used for archive semantics, and add validation rules for stale or mismatched canonical metadata.

The repository contract will also distinguish persisted-metadata absence from persisted-metadata staleness: `SpecRepository.metadata(spec)` will return `null` only when `metadata.json` is missing, and otherwise return the parsed metadata together with freshness state so consumers can apply explicit fallback rules. Repository-facing spec contracts will also be tightened so `spec-lock.json` is no longer treated as part of the generic artifact API surface.

## Specs affected

### New specs

- none

### Modified specs

- `core:spec-metadata`: define metadata as the canonical normalized consumer view, require canonical `dependsOn` projection from persisted sidecar state when extraction is absent, and define stale or mismatched canonical metadata handling.
  - Depends on (added): none
  - Depends on (removed): none

- `core:spec-lock`: clarify that the sidecar persists canonical dependency state for schemas that cannot express dependencies directly and is not part of the normal spec artifact surface.
  - Depends on (added): none
  - Depends on (removed): none

- `core:spec-repository-port`: tighten the repository contract so sidecar files such as `spec-lock.json` are not treated as normal artifacts or exposed through `spec.filenames` / generic artifact APIs.
  - Depends on (added): none
  - Depends on (removed): none

- `core:get-spec-context`: align spec context requirements with canonical metadata-backed dependency resolution rather than relying on `spec-lock`-specific logic in consumers.
  - Depends on (added): none
  - Depends on (removed): none

- `core:get-project-context`: align project context requirements with canonical metadata-backed dependency resolution and canonical metadata freshness semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `core:compile-context`: preserve `change.specDependsOn` as the change-entry snapshot while clarifying how canonical metadata participates in dependency traversal and fallback behavior.
  - Depends on (added): none
  - Depends on (removed): none

- `core:validate-specs`: add validation expectations for stale metadata reconstruction and for mismatch between extraction-derived and persisted canonical dependency metadata.
  - Depends on (added): none
  - Depends on (removed): none

- `core:create-change`: clarify that change creation snapshots the current persisted dependency baseline into `change.specDependsOn`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:edit-change`: clarify that adding specs to an existing change snapshots the current persisted dependency baseline into `change.specDependsOn`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:save-spec-metadata`: clarify how overwrite protection and optimistic concurrency read persisted metadata when the metadata file exists but is stale, while keeping `spec-lock.json` outside the write path.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The change affects repository contracts, metadata generation, context compilation, and validation behavior in `@specd/core`. Likely implementation areas include `packages/core/src/application/ports/spec-repository.ts`, `packages/core/src/infrastructure/fs/spec-repository.ts`, `packages/core/src/application/use-cases/generate-spec-metadata.ts`, `packages/core/src/application/use-cases/get-spec-context.ts`, `packages/core/src/application/use-cases/get-project-context.ts`, `packages/core/src/application/use-cases/compile-context.ts`, `packages/core/src/application/use-cases/validate-specs.ts`, and the change snapshot flows in `create-change.ts` and `edit-change.ts`. This should not require CLI-specific behavior changes, but it will change what CLI context commands observe through the core use cases.

## Technical context

The exploration established a few design boundaries that must remain explicit:

- `spec-lock.json` is a sidecar with dedicated semantic read/write operations and must not be treated as a normal spec artifact.
- `metadata.json` is the canonical normalized form consumed by tools and agents across different schema layouts, not just a convenience file for one schema family.
- `SpecRepository.metadata(spec)` should remain a persisted read, not an implicit regeneration path: consumers need to know whether metadata is missing entirely or present but stale.
- Some schemas may have `spec.md` and `verify.md`, some may have only one artifact, some may use different section names, and some may not express dependencies in spec content at all.
- `change.specDependsOn` exists to snapshot dependency state when a spec enters a change, because a change may later modify dependencies and archive needs the baseline to seal the new persisted snapshot.
- Current code already reveals the split model:
  - repository artifact leakage is centered around `core:src/infrastructure/fs/spec-repository.ts`
  - metadata generation currently projects `implementation` from persisted sidecar state but not `dependsOn`
  - context consumers currently trust `metadata.json` and should continue doing so once metadata becomes canonically complete and can report whether persisted metadata is fresh or stale

## Open questions

- none at proposal time; the intended direction is to keep `spec-lock.json` out of the normal artifact surface, treat `metadata.json` as canonical consumer metadata, preserve `change.specDependsOn` as a snapshot, and define validation for stale or mismatched canonical dependency metadata.
