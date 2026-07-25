# core:persist-spec-metadata

## Purpose

Guarded metadata persistence must exist so that generated metadata can be cached durably without recreating an editor that arbitrary callers can use to inject or overwrite metadata content. `PersistSpecMetadata` is that guard: an internal application collaborator that validates one complete generated metadata projection and conditionally writes it through the repository port, deliberately excluded from every public surface so it cannot become a replacement for the removed metadata-editing commands.

## Requirements

### Requirement: Internal collaborator, not a public use case

`PersistSpecMetadata` MUST NOT be exposed on `Kernel`, MUST NOT be part of the Core public export surface, and MUST NOT be re-exported by the SDK, CLI, or MCP. Its only permitted caller is `MaterializeSpecMetadata`.

Removing external metadata editors from this change MUST NOT be undone by introducing `PersistSpecMetadata` as a general-purpose metadata write API.

### Requirement: Input is one complete projection plus observed revision

`PersistSpecMetadata` MUST accept exactly one complete `SpecMetadata` projection to persist, plus the observed metadata `revision` the caller intends to replace.

`expectedRevision: null` MUST mean the caller observed metadata as absent and intends to create it. A present `expectedRevision` MUST mean the caller intends to replace exactly that previously observed snapshot.

`PersistSpecMetadata` MUST NOT accept a partial metadata patch. It always validates and writes a complete projection.

### Requirement: Structural validation before write

Before attempting to persist, `PersistSpecMetadata` MUST validate the complete generated metadata projection against the metadata structural contract. If validation fails, `PersistSpecMetadata` MUST reject with a typed validation error and MUST NOT call the repository write operation.

### Requirement: Delegates conditional persistence to the repository

`PersistSpecMetadata` MUST delegate the actual conditional write to `SpecRepository.writeMetadataSnapshot(spec, metadata, { expectedRevision })`. It MUST NOT implement its own file I/O, serialization, or storage-specific conflict detection; those remain adapter responsibilities behind the repository port.

If the repository reports that the observed revision no longer matches the current persisted revision, `PersistSpecMetadata` MUST propagate that conflict as a typed error rather than retrying or silently merging.

### Requirement: No dependsOn or optimization authority

`PersistSpecMetadata` MUST NOT decide dependency values, optimization freshness, or which fields belong in the projection. It receives the projection already assembled by its caller and only validates and stores it.

### Requirement: Construction and dependency injection

`PersistSpecMetadata` MUST be constructed with explicit dependencies (at minimum the `SpecRepository` for the target workspace) rather than reconstructing a repository or resolver internally.

Because it is not Kernel-mounted, `PersistSpecMetadata` is not required to expose a public `createPersistSpecMetadata(config, options?)` composition wrapper. It MAY be instantiated directly by `MaterializeSpecMetadata`'s own composition wiring, using the same `CompositionResolver` that resolves `MaterializeSpecMetadata`'s other dependencies.

## Constraints

- `PersistSpecMetadata` never reads current artifact or lock state itself; it trusts the projection and revision supplied by its caller.
- `PersistSpecMetadata` never partially updates a metadata document; every write is a complete replacement.
- `PersistSpecMetadata` is not associated with any CLI command.

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `writeMetadataSnapshot()` is the storage boundary this service delegates to
- [`core:spec-metadata`](../spec-metadata/spec.md) — the structural contract validated before persistence
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — internal-service versus public-use-case boundary conventions
- [`core:composition-resolver`](../composition-resolver/spec.md) — shared resolver used to assemble this service's dependencies as part of `MaterializeSpecMetadata` composition
