# Proposal: harden-archive-reload-consistency

## Motivation

Archiving a change that introduces a new spec can currently leave the repository and the change manifest in an inconsistent state when the change contains an invalid artifact representation for that new spec. This needs to be fixed now because it can corrupt active change interpretation, create false drift, and make archive failures unsafe to diagnose or recover from.

## Current behaviour

The base problem in the reported case was that the LLM authored the new spec incorrectly: it created a new `spec.md` under `specs/...` but created `verify.md` as a delta under `deltas/...` even though the spec was brand new and both artifacts should have been created directly under `specs/...`. `ArchiveChange` then partially materialized the new spec into the permanent `specs/` tree before the full archive pass had proven that every artifact was resolvable. During archive, the new spec's `spec.md` was written into project specs, the erroneous `verify.md` delta failed because no base `verify.md` existed, and subsequent change reload treated that partial repo state as evidence that the spec already existed.

Current path and validation semantics are too coarse in a few places:

- archive safety is not strong enough to prevent partial writes on failure
- archive delta handling can prefer a delta file found at the conventional `deltas/...` path instead of strictly honoring the artifact filename already persisted in the manifest
- invalid new-spec direct/delta mixes can survive until archive time
- manifest filename normalization can reinterpret validated artifact filenames based on current repo state instead of preserved authoring intent
- `archiving` lifecycle advancement can remain visible even when archive was blocked before meaningful merge work completed
- archive failures do not currently preserve enough structured diagnostics about what was attempted, why it failed, and whether a real archive commit was reached

## Proposed solution

Strengthen the archive and reload contracts so invalid new-spec artifact shapes are rejected before archive, archive application behaves as an all-or-nothing operation from the perspective of permanent project specs, delta eligibility is decided at the artifact level, and validated manifest filenames remain semantically stable across reloads. The change should also clarify the expected lifecycle behavior when archive fails before merge work meaningfully begins.

## Specs affected

### New specs

- none

### Modified specs

- `core:archive-change`: require archive application to avoid partial permanent-spec writes, reject invalid archive inputs earlier, and clarify failure-state expectations around `archiving`.
  It should also define that archive consumes the artifact representation declared by the change state rather than any alternate delta file that happens to exist on disk.
  - Depends on (added): default:\_global/logging
- `core:change-layout`: tighten direct-vs-delta expectations for new specs so artifact representation is determined per artifact file and not treated as interchangeable.
  - Depends on (added): none
- `core:validate-artifacts`: require validation to reject invalid new-spec direct/delta mixes before archive, using artifact-level base existence rather than coarse spec existence.
  - Depends on (added): none
- `core:change-manifest`: preserve validated artifact filename intent across reloads and constrain normalization so partial repo side effects cannot silently rewrite change semantics.
  It should also persist explicit archive-attempt/archived outcome history so failed and successful archive executions are traceable from the change manifest.
  - Depends on (added): none
- `core:change`: define the new history events and lifecycle-facing semantics needed so a failed pre-commit archive attempt leaves no externally advanced archive state while successful archive completion remains traceable.
  - Depends on (added): default:\_global/logging
- `core:change-repository-port`: constrain change artifact loading so repository reads are limited to tracked artifact files declared by the change rather than arbitrary relative filenames.
  - Depends on (added): default:\_global/logging
- `core:spec-repository-port`: constrain spec artifact loading and saving so repository access remains limited to expected spec artifact files rather than arbitrary filenames under the spec directory.
  - Depends on (added): default:\_global/logging
- `core:archive-repository-port`: clarify confinement expectations for archive path resolution and staged archive persistence so archive storage cannot rely on unchecked arbitrary paths.
  - Depends on (added): default:\_global/logging
- `core:storage`: record the storage-level safety rules for path confinement, tracked-artifact access, and staged persistence semantics across fs-backed repositories.
  - Depends on (added): default:\_global/logging

## Impact

Affected code areas are concentrated in `@specd/core`, especially:

- `packages/core/src/application/use-cases/archive-change.ts`
- `packages/core/src/application/use-cases/validate-artifacts.ts`
- `packages/core/src/domain/entities/change.ts`
- `packages/core/src/domain/services/artifact-filename.ts`
- `packages/core/src/infrastructure/fs/change-repository.ts`
- `packages/core/src/infrastructure/fs/spec-repository.ts`
- `packages/core/src/infrastructure/fs/archive-repository.ts`
- regression coverage under `packages/core/test/application/use-cases/archive-change.spec.ts`
- supporting manifest, change-repository, spec-repository, archive-repository, and artifact-filename tests under `packages/core/test/infrastructure/fs/` and `packages/core/test/domain/services/`

The graph/context investigation indicates this is high-coupling core workflow behavior, so the change will need careful regression coverage around archive, manifest load/save semantics, and artifact path validation.

It also affects observability and diagnostics:

- archive preparation and commit paths should emit debug-level logs wherever practical
- failures should leave enough structured evidence in the change manifest to support post-mortem diagnosis

## Technical context

The reported failure sequence centered on change `unify-lifecycle-engine` and new spec `core:lifecycle-engine`, where the LLM created the new spec with mixed artifact representation: `spec.md` as a new direct file and `verify.md` as `deltas/core/lifecycle-engine/verify.md.delta.yaml`. That `verify` artifact should also have been created directly under `specs/core/lifecycle-engine/verify.md`. During archive, `spec.md` was materialized into project specs first and the erroneous `verify` delta then failed because no project base artifact existed. During discovery we confirmed that:

- `core:archive-change` currently transitions a change into `archiving` before hooks or file modification
- `ArchiveChange` currently reconstructs the conventional delta path for delta-capable spec artifacts and attempts to read that file first; if such a delta exists on disk, it is used even when the change's persisted artifact file entry points at a direct `specs/...` path
- only when no delta file is found at that reconstructed path does `ArchiveChange` fall back to the `filename` recorded on the change artifact file and copy the primary file directly
- this means archive currently does not treat the manifest filename as the authoritative representation choice for delta-capable artifacts
- architecturally, the use case is not reading the filesystem directly, but it is still deriving storage-specific artifact paths on its own instead of consuming the artifact files already declared by the change state and delegating persistence semantics to storage ports
- the new archive-failure / archive-success traceability requirement implies updates not only to manifest serialization but also to the underlying change history event model
- `ChangeRepository.artifact()` currently accepts an arbitrary relative `filename` and reads it from `path.join(changeDir, filename)` instead of restricting reads to tracked artifact files listed on the change
- `SpecRepository.artifact()` and `SpecRepository.save()` currently follow the same arbitrary-filename pattern inside a spec directory, so the repository contract is also broader than the expected schema-tracked artifact surface
- `ArchiveRepository` does not expose the same artifact-by-filename API, but it does reconstruct archive paths from pattern/index data and should still document confinement expectations as part of the storage contract
- `core:change-layout` already defines exactly one expected path per spec-scoped artifact and says `specs/...` and `deltas/...` are not interchangeable
- `core:change-manifest` currently allows legacy stale filename normalization for existing delta-capable specs
- the current change history does not capture archive-attempt outcomes in enough detail for diagnostics; we want explicit manifest events for archive failure and archive success, in addition to debug logs during execution
- when a delta is applied during archive and the base artifact is absent, the archive path falls through to delta application against empty/missing base content, which can then fail when selectors resolve to no node in the base document
- the likely implementation surface spans `ArchiveChange`, `ValidateArtifacts`, manifest load/save behavior, and expected artifact filename resolution
- `core:validate-artifacts` overlaps with another active change, `cross-artifact-validations`, so downstream spec work should stay precise about this change's specific archive/reload requirements

Alternatives were considered during discovery:

- limiting the change to `core:archive-change` only was rejected because the bug crosses archive execution, path semantics, validation, and manifest reload behavior
- creating a brand-new spec was rejected because existing `core:*` specs already define the relevant contracts and should be extended instead

Architectural direction agreed for this change:

- `ArchiveChange` should not derive alternate artifact paths at archive time for delta-capable artifacts
- archive must consume the artifact files declared by the change state / manifest as the authoritative representation choice
- `ChangeRepository.artifact()` may remain the current API for now, but it must be constrained to files that are declared in the change's tracked artifact file list rather than any arbitrary relative path under the change
- `ChangeRepository.artifact()` must also enforce strict confinement to the change directory and reject any path that could escape it
- `SpecRepository.artifact()` and `SpecRepository.save()` should follow the same principle: operate only on expected tracked artifact filenames for a spec and reject path escape or arbitrary extra filenames
- archive-path resolution should also be treated as confinement-sensitive storage logic even though `ArchiveRepository` does not expose arbitrary artifact reads
- archive should become effectively atomic by splitting the workflow into a full in-memory prepare phase and a final staged commit phase, so spec writes are only persisted after every tracked artifact has been resolved and merged successfully
- staged persistence should be preferred over ad hoc rollback: prepare the full archive write plan first, then delegate the final staged commit to storage behavior instead of mixing merge work and permanent writes in the same loop
- the archive flow should emit debug logging across artifact selection, delta/direct resolution, prepare-plan construction, staged commit start, staged commit completion, and failure handling
- the change manifest history should record an explicit event when an archive attempt fails and another when archive succeeds, so traceability does not depend only on transient logs
- specs that introduce or tighten debug-logging behavior should declare `default:_global/logging` as a dependency/context reference rather than modifying the global logging spec itself
- any staged or atomic persistence needed to avoid partial writes should be expressed as storage-port behavior, not as ad hoc path-handling logic inside the use case

## Open questions

- None at proposal stage. The proposal direction is fixed: archive behavior must become safe against partial writes, invalid new-spec artifact shapes must fail before archive, and reload semantics must preserve validated artifact intent. Implementation strategy tradeoffs belong in `design.md`, not in the proposal.
