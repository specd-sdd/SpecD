# core:get-spec-metadata

## Purpose

Normal callers that just want usable, current metadata for a spec should not need to know about freshness policy, generation, or persistence at all. `GetSpecMetadata` is the normal self-healing metadata query: a thin public use case that always materializes metadata on demand and returns the result together with diagnostics about where it came from.

## Requirements

### Requirement: Input and delegation

`GetSpecMetadata.execute()` MUST accept an input identifying the target spec by `specId`.

It MUST delegate to `MaterializeSpecMetadata` with `policy: 'if-needed'`. `GetSpecMetadata` MUST NOT implement its own freshness comparison, generation, or persistence logic.

### Requirement: Result contract

`GetSpecMetadata.execute()` MUST return a result carrying:

- the usable `SpecMetadata` projection
- the projection's semantic `metadataFingerprint`
- `source` — whether the projection was reused (`'persisted'`) or generated during this call (`'generated'`)
- `regenerated` — whether generation occurred during this call
- `warnings` — any diagnostics produced during materialization, including a `metadata-cache-write-failed` warning when generation succeeded but caching it did not

This is the same shape produced by `MaterializeSpecMetadata`; `GetSpecMetadata` MUST NOT narrow, rename, or drop any of these fields when it is the terminal public caller.

### Requirement: Failure semantics

`GetSpecMetadata` MUST surface a typed failure only when a valid in-memory metadata projection cannot be produced at all, or when reading the spec, its artifacts, or its persisted lock state fails. A metadata-cache write failure alone MUST NOT cause `GetSpecMetadata` to fail; it is reported as a warning on an otherwise successful result, consistent with `MaterializeSpecMetadata`'s `if-needed` policy.

### Requirement: Construction and composition

`GetSpecMetadata` MUST follow the standard Core use-case and composition contract: a class with an async `execute(input)` method, explicit constructor dependencies, and a composition module exposing:

- `GetSpecMetadataDeps`
- `resolveGetSpecMetadataDeps(resolver: CompositionResolver): GetSpecMetadataDeps`
- `createGetSpecMetadata(deps): GetSpecMetadata`
- `createGetSpecMetadata(config: SpecdConfig, options?: CompositionResolutionOptions): GetSpecMetadata`

`resolveGetSpecMetadataDeps(resolver)` MUST resolve at least `MaterializeSpecMetadata`.

The config-based `createGetSpecMetadata(config, options?)` form MUST create one `CompositionResolver`, derive dependencies through `resolveGetSpecMetadataDeps(resolver)`, and delegate to the canonical `createGetSpecMetadata(deps)` form.

`GetSpecMetadata`, its `Input`/`Result` types, `Deps`, and `create*` factory MUST be exported through the Core public surface, re-exported by the SDK, and exposed on `Kernel.specs` as `getMetadata`. Hosts such as `specs metadata` and the code graph indexer MUST obtain usable metadata through this Kernel surface rather than reading a repository metadata snapshot directly.

## Constraints

- `GetSpecMetadata` never exposes `missing`, `invalid`, or `stale` as a public status; those remain internal to materialization.
- `GetSpecMetadata` never performs a forced rebuild; forced rebuilding is `RegenerateSpecMetadata`'s responsibility.

## Spec Dependencies

- [`core:materialize-spec-metadata`](../materialize-spec-metadata/spec.md) — the self-healing orchestration this use case delegates to with `policy: 'if-needed'`
- [`core:spec-metadata`](../spec-metadata/spec.md) — the shape of the metadata projection returned to callers
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing for the input `specId`
