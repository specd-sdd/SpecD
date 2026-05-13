# Proposal: spec-lock-sidecar

## Motivation

Archived specs currently lose durable schema identity and durable `dependsOn` data at the spec level. This makes archive output incomplete as a long-lived source of truth and leaves `dependsOn` persistence coupled to metadata extraction, which is the wrong authority for archival state.

## Current behaviour

Today, schema identity is only captured on the change manifest and is not persisted alongside archived spec artifacts. `dependsOn` may be regenerated into `metadata.json`, but that path is tied to `metadataExtraction` and can be absent, stale, or contradictory to what the change manifest recorded at archive time.

Existing persisted specs also have no sidecar at all, so even if new archives start writing `spec-lock.json`, the repository would still contain a mixed population of specs with and without a durable dependency record. Without an explicit migration and precedence model, context compilation and metadata consumers would have no stable rule for where `dependsOn` should come from.

## Proposed solution

Introduce an immutable `spec-lock.json` sidecar written at archive time for each affected spec. The sidecar will persist the original schema name/version for that spec and the spec's durable `dependsOn` set from `change.specDependsOn`, with re-archive update behavior defined explicitly and mismatch detection when extracted metadata contradicts the sidecar.

The sidecar is expected to use a minimal JSON structure:

```json
{
  "schema": {
    "name": "schema-std",
    "version": 1
  },
  "dependsOn": ["core:storage", "core:auth"]
}
```

The `schema` object captures the governing schema identity for the persisted spec, and `dependsOn` captures the durable dependency set for that spec. Both fields are always present once a sidecar exists.

`spec-lock.json` is stored alongside the persisted `scope: spec` artifacts for that spec, so it lives with the spec's permanent artifact set rather than under metadata storage or in the change manifest.

Once a sidecar exists, its `schema` field is immutable: it preserves the original schema identity under which that spec first received a sidecar and is not replaced by later re-archives. By contrast, `dependsOn` is refreshed from the current change state on each archive so the sidecar reflects the latest approved dependency set for the spec.

This change also needs a transition model for existing specs and a clear precedence rule for dependency consumers. For active changes, `change.specDependsOn` remains the highest-priority source while work is in progress. For persisted specs, `spec-lock.json` becomes the durable source of truth for `dependsOn` and schema identity.

For persisted specs, `spec-lock.json` is the durable source of truth for `dependsOn`. `metadata.json.dependsOn` remains a valid read surface for existing consumers, but only as a value that must stay aligned with the sidecar. If `metadataExtraction.dependsOn` is present, it must match the final persisted `dependsOn` set being sealed by `ArchiveChange`; otherwise archive fails. This applies both when re-archiving a spec that already has `spec-lock.json` and when archiving a spec that is receiving `spec-lock.json` for the first time. If `metadataExtraction.dependsOn` is omitted, the system falls back directly to the final persisted dependency set instead of treating extraction as the primary source.

To keep that failure mode atomic at the spec-publication boundary, archive should determine the final sidecar content before canonical publication and treat `spec-lock.json` as part of the staged publication set for that spec. The consistency check should use `extractMetadata(...)` over the already-prepared merged artifact content in memory, rather than relying on `GenerateSpecMetadata` against the canonical repository after publish. Once the merged spec artifacts and the final `spec-lock.json` are prepared and staged together for a spec, they are published together as one spec-level publication unit. `GenerateSpecMetadata` remains a post-publication projection step that regenerates `metadata.json` from the canonical persisted spec as a derived cache/read model, not as the pre-publication consistency mechanism.

To make archive-time refresh reliable, a change that includes an existing spec must not start with an empty dependency snapshot. When a spec is added to a change, the current persisted `dependsOn` for that spec must be copied into `change.specDependsOn` up front so the manifest starts from the spec's full known dependency set. The LLM or later workflow steps may then add or remove dependencies deliberately, but the initial manifest state must include the spec's current dependencies rather than leaving them absent by default.

This seeding should happen at the moment the spec enters the change scope:

- during `CreateChange` for specs provided at change creation time
- during `EditChange` for specs added later with `--add-spec`

The initial dependency snapshot must be resolved with this precedence:

1. `spec-lock.json` for the spec, if present
2. legacy `metadata.json.dependsOn`, if present
3. empty set, if neither exists

Seeding is only for newly introduced specs in the change scope. If a spec is already present in the change and `change.specDependsOn` already has an entry for it, later scope edits must not silently overwrite that in-change dependency state.

For legacy specs without a sidecar, the migration can be opportunistic during metadata extraction or regeneration. Before creating any sidecar for a legacy spec, the system must first verify that the spec is structurally compatible with the current schema, equivalent to passing a structural validation pass such as `spec list --validate`. Only after that compatibility check passes may the system backfill `spec-lock.json` from existing metadata and current project state: copy `dependsOn` from legacy metadata and record the current project schema identity. If the spec is not structurally valid under the current schema, no sidecar is created implicitly and the spec remains on the legacy path until repaired or migrated deliberately. This provides a convergence path without requiring an upfront global migration before the new model can be used.

## Specs affected

### New specs

None.

### Modified specs

- `core:archive-change`: define archive-time creation and update of `spec-lock.json`, including immutable original-schema behavior, current-state `dependsOn` refresh, and consistency rules between archive outputs, metadata, and sidecar state.
  - Depends on (added): `core:change-manifest`, `core:spec-metadata`, `core:validate-artifacts`, `core:edit-change`, `core:create-change`, `core:spec-repository-port`
- `core:spec-metadata`: clarify the relationship between generated metadata and the new archive-owned sidecar, including which fields remain metadata concerns, which fields move to `spec-lock.json`, how `metadata.dependsOn` stays aligned with the sidecar, and how legacy metadata behaves before opportunistic backfill completes.
  - Depends on (added): `core:change-manifest`
- `core:save-spec-metadata`: align overwrite and persistence rules so metadata writes do not silently contradict sidecar-owned dependency state, and normalize the spec contract fully to `metadata.json` / JSON terminology.
  - Depends on (added): `core:spec-metadata`
- `core:validate-artifacts`: clarify that validation maintains the in-change dependency snapshot and does not hard-fail merely because the current change diverges from the canonical sidecar while work is still in progress.
  - Depends on (added): `core:spec-metadata`
- `core:change-manifest`: clarify that schema identity and `specDependsOn` in the manifest are archive-time inputs to sidecar generation rather than the long-term archived spec record.
  - Depends on (added): `core:spec-metadata`
- `core:edit-change`: require existing specs added to a change to seed `change.specDependsOn` from the spec's current persisted dependency set instead of leaving it empty.
  - Depends on (added): `core:spec-metadata`
- `core:create-change`: clarify whether initial change creation for pre-existing specs also seeds `change.specDependsOn` from the current persisted dependency set.
  - Depends on (added): `core:spec-metadata`
- `core:spec-repository-port`: add explicit repository operations for reading and writing the persistent spec lock sidecar so the feature is not modeled as an fs-only artifact trick.
  - Depends on (added): none

## Impact

The change primarily affects the archive and metadata pipeline in `@specd/core`, especially `ArchiveChange`, metadata generation/saving, manifest-backed dependency capture, change-scope spec onboarding, and artifact validation behavior. `CompileContext` remains an important consumer of `metadata.dependsOn`, but the proposal aims to preserve that read path by keeping metadata aligned with the sidecar rather than redesigning context compilation itself. The change also introduces a durable archived-spec contract that future tools will rely on when reading schema identity and persisted dependencies, and it requires compatibility behavior for existing specs that do not yet have a sidecar.

## Technical context

- Earlier investigation identified `packages/core/src/application/use-cases/archive-change.ts` as the natural write point because archive already merges spec artifacts and generates metadata.
- `packages/core/src/domain/entities/change.ts` already persists `specDependsOn`, and `packages/core/src/infrastructure/fs/manifest.ts` persists schema identity on the change manifest; both are candidate sources for sidecar generation.
- Existing metadata behavior already gives manifest `specDependsOn` priority over extracted `dependsOn`, but metadata remains regenerable and therefore is not a safe archival authority.
- The user explicitly called out that this feature has broader consequences than sidecar creation alone: existing specs without a sidecar need a migration or backfill path, and dependency consumers need an explicit precedence rule between `metadataExtraction`, sidecar state, and active-change manifest state.
- The current preferred migration direction discussed with the user is opportunistic backfill during metadata extraction/regeneration, but only after a structural compatibility check passes under the current schema. If a spec has no sidecar and fails that compatibility check, the system must not create one implicitly; however, legacy `metadata.json` generation may still continue so the spec can remain readable through existing metadata-driven flows until it is repaired.
- The current preferred consumer model discussed with the user is to keep `metadata.dependsOn` readable by existing consumers, but make `spec-lock.json` the authority whenever archive is sealing the persisted dependency state. `metadata.json.dependsOn` is written from that final persisted dependency set, and `metadataExtraction.dependsOn` only serves as a consistency check during archive; mismatches fail archive-time checks both for existing sidecars and for first-time sidecar creation. That archive-time check should run against the prepared merged content before canonical publish, and the final `spec-lock.json` should be staged and published together with the merged spec artifacts for that spec. For legacy specs outside archive that still have no sidecar, `metadata.json.dependsOn` may still derive from extraction until opportunistic backfill succeeds and the sidecar becomes authoritative.
- The user explicitly decided that archive should require a resolved actor identity. `ArchiveChange` should not promise a fallback path that silently archives without actor information when `ActorResolver.identity()` fails.
- The user clarified that a change may legitimately diverge from the canonical sidecar while work is in progress, so hard mismatch enforcement must happen at archive time, not during ordinary artifact validation.
- The user explicitly decided that re-archive must not replace the recorded schema identity once a sidecar exists. The original sidecar schema stays fixed, while `dependsOn` is refreshed from the current change.
- The user also identified a prerequisite for correctness: when an existing spec is added to a change, its current persisted dependencies must be copied into `change.specDependsOn` immediately. Otherwise archive-time sidecar refresh would incorrectly collapse to an empty dependency set unless the LLM re-added everything manually.
- The agreed mechanism is explicit: seed `change.specDependsOn` when a spec enters the change scope, with precedence `spec-lock.json` -> legacy `metadata.json.dependsOn` -> empty set`, and never overwrite an existing in-change dependency snapshot just because the scope was edited again later.
- The agreed migration stance is opportunistic by default. A separate bulk refresh remains possible operationally through metadata regeneration commands such as `specd specs generate-metadata --all --write --status all --force`, so the feature does not need to require a dedicated mass-backfill mechanism in its initial scope.
- Relevant code and contract surfaces discussed during exploration include `generate-spec-metadata.ts`, `save-spec-metadata.ts`, `validate-artifacts.ts`, `archive-repository.ts`, `compile-context.ts`, `depends-on-overwrite-error.ts`, and `spec-repository.ts`.
- The user explicitly rejected modeling `spec-lock.json` as if it were just another artifact file of the fs adapter. The agreed direction is to represent persistent spec-lock access as an explicit `SpecRepository` capability so the contract can work across future storage backends, not only `fs`.
- For this change, the `SpecRepository` contract only needs explicit read/write support for the persistent spec lock sidecar. Deletion is not part of the required API surface.
- The expected architectural direction remains hexagonal: archive and validation rules belong in core/application contracts, with persistence details delegated to repository adapters.
- The user wants archive publication guarantees to stay strong, but only at a level the filesystem can actually defend. The intended contract is atomic publication per spec from staging into canonical storage, not a fake all-spec transactional guarantee for the whole batch.
- If final publication from staging to canonical storage fails for a spec, the system must not clean up that staging output automatically. The failure should surface clearly so the user can inspect or move the staged material manually instead of losing the prepared archive result.
- Metadata terminology for this change should be normalized to the implemented JSON model only. The revised specs should describe `metadata.json` and JSON semantics directly rather than carrying forward obsolete YAML or `.specd-metadata.yaml` wording. This cleanup is part of the explicit scope of the change, not just incidental wording polish, because the compliance audit identified residual YAML terminology as spec drift in the affected metadata contracts.

## Open questions
