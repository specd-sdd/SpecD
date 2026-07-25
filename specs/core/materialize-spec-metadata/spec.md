# core:materialize-spec-metadata

## Purpose

Every consumer that needs the normalized metadata projection should be able to rely on it being usable without first running a separate manual command, and without each consumer reimplementing freshness comparison, regeneration, and concurrency handling independently. `MaterializeSpecMetadata` is the single shared orchestration that decides whether persisted metadata can be reused or must be regenerated, and that safely persists a freshly generated projection when doing so is safe.

## Requirements

### Requirement: Input and result contract

`MaterializeSpecMetadata.execute()` MUST accept a `MaterializeSpecMetadataInput`:

- `specId` — the canonical spec identity to materialize metadata for
- `policy` — optional, `'if-needed'` (default) or `'force'`

It MUST return a `MaterializeSpecMetadataResult`:

- `metadata` — the usable `SpecMetadata` projection
- `metadataFingerprint` — the semantic fingerprint of the returned projection
- `source` — `'persisted'` when reused unchanged, `'generated'` when produced during this call
- `regenerated` — `true` when generation occurred during this call
- `warnings` — structured `SpecMetadataGenerationWarning` entries, if any

### Requirement: if-needed reuses fresh metadata and self-heals everything else

With `policy: 'if-needed'`, `MaterializeSpecMetadata` MUST:

1. resolve the workspace and spec for `specId`;
2. read the persisted metadata snapshot once;
3. read current artifact metadata and the current lock snapshot;
4. if the persisted snapshot is structurally valid and fresh against that current state, return it unchanged with `source: 'persisted'` and `regenerated: false`;
5. otherwise generate metadata from a consistent loaded artifact set and that lock snapshot;
6. immediately before persisting, re-read the source fingerprint (artifacts, schema identity, projection version, lock);
7. if that re-read fingerprint no longer matches what was used for generation, refuse to persist the stale-relative-to-newer-source result;
8. delegate structural validation and the conditional write to `PersistSpecMetadata`, passing the metadata `revision` observed in step 2;
9. return the generated in-memory projection with `source: 'generated'` and `regenerated: true`, regardless of whether the persistence attempt in step 8 succeeded.

Missing, structurally invalid, and stale persisted metadata are all treated identically as inputs that require regeneration; none of them is surfaced to normal callers as a distinct public status.

### Requirement: force always regenerates and persists

With `policy: 'force'`, `MaterializeSpecMetadata` MUST regenerate metadata unconditionally, without first checking whether the persisted snapshot is fresh, and MUST attempt to persist the result following the same validation and conditional-write path as `if-needed`.

Unlike `if-needed`, when `policy: 'force'` and the persistence attempt fails, `MaterializeSpecMetadata` MUST report that failure to the caller rather than silently returning a successful in-memory-only result. This is what allows `RegenerateSpecMetadata` to treat a forced cache-write failure as a command failure.

### Requirement: Concurrent writer conflict handling

If persisting the generated projection fails because another writer already replaced the observed metadata revision, `MaterializeSpecMetadata` MUST re-read the current persisted metadata (the "winner"):

- if the winner is fresh against current source state, return the winner with `source: 'persisted'`;
- otherwise, perform at most one bounded retry of the generate-and-persist sequence;
- if the retry also loses the race or is still not fresh, return a typed conflict failure.

A conflict caused by the underlying source (artifacts, schema, or lock) changing during materialization MUST NOT result in a metadata write; source conflicts are surfaced without persisting a projection generated from stale inputs.

### Requirement: Reuse of generation output

`MaterializeSpecMetadata` MUST reuse the exact source state (artifact hashes, snapshot `originalHash`) returned by `GenerateSpecMetadata` for the same generation attempt. It MUST NOT re-read or re-hash artifact content a second time to compute the provenance recorded alongside the generated metadata.

### Requirement: Metadata-cache-write-failed warning on if-needed

If generation under `policy: 'if-needed'` succeeds but the subsequent cache write fails for a reason other than a revision conflict, `MaterializeSpecMetadata` MUST:

- return the fresh in-memory generated metadata as a successful result;
- include a structured `metadata-cache-write-failed` warning in `warnings`, carrying the spec identity and the storage error diagnostics;
- emit exactly one `Logger.warn` call containing that spec identity and storage error diagnostics.

Callers that receive this warning MUST propagate it to their own result rather than logging it again.

### Requirement: No public freshness status surface

`MaterializeSpecMetadata` MUST NOT expose `missing`, `invalid`, or `stale` as part of its public result contract. These are internal decision inputs only. Callers receive usable metadata, its fingerprint, its source, whether regeneration occurred, and warnings.

### Requirement: Construction and composition

`MaterializeSpecMetadata` MUST follow the standard Core use-case and composition contract: a class with an async `execute(input)` method, explicit constructor dependencies, and a composition module exposing:

- `MaterializeSpecMetadataDeps`
- `resolveMaterializeSpecMetadataDeps(resolver: CompositionResolver): MaterializeSpecMetadataDeps`
- `createMaterializeSpecMetadata(deps): MaterializeSpecMetadata`
- `createMaterializeSpecMetadata(config: SpecdConfig, options?: CompositionResolutionOptions): MaterializeSpecMetadata`

`resolveMaterializeSpecMetadataDeps(resolver)` MUST resolve at least:

- the target workspace's `SpecRepository`
- `GenerateSpecMetadata`
- an internally constructed `PersistSpecMetadata` collaborator
- a `Logger`

The config-based `createMaterializeSpecMetadata(config, options?)` form MUST create one `CompositionResolver`, derive dependencies through `resolveMaterializeSpecMetadataDeps(resolver)`, and delegate to the canonical `createMaterializeSpecMetadata(deps)` form. It MUST NOT reconstruct fs-shaped wiring inline.

`MaterializeSpecMetadata`, its `Input`/`Result` types, `Deps`, and `create*` factory MUST be exported through the Core public surface and re-exported by the SDK, and MUST be exposed on `Kernel.specs` as `materializeMetadata`.

## Constraints

- `MaterializeSpecMetadata` is the only place semantic metadata freshness comparison and regeneration orchestration are implemented; consumers MUST NOT duplicate this logic.
- `MaterializeSpecMetadata` never derives dependency, optimization, or schema values itself — those come from `GenerateSpecMetadata` and the repository's persisted state.
- A single bounded retry is the maximum concurrency remediation this use case performs; it MUST NOT retry indefinitely.

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — persisted metadata snapshot reads/writes and current artifact/lock state
- [`core:generate-metadata`](../generate-metadata/spec.md) — deterministic, non-writing projection reused for regeneration
- [`core:persist-spec-metadata`](../persist-spec-metadata/spec.md) — internal guarded writer this use case delegates conditional persistence to
- [`core:spec-metadata`](../spec-metadata/spec.md) — the metadata document shape and freshness/provenance fields being compared
- [`core:composition-resolver`](../composition-resolver/spec.md) — shared resolver used by the config-based factory
- [`default:_global/logging`](../../../_global/logging/spec.md) — logging conventions for the cache-write-failed warning
