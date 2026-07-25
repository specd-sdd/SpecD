# core:regenerate-spec-metadata

## Purpose

Cache warming, repair, CI diagnostics, and post-migration rebuilding all need an explicit way to force metadata reconstruction regardless of whether the persisted cache looks fresh, without duplicating the generation and persistence logic already owned by materialization. `RegenerateSpecMetadata` is that explicit, optionally batched, forced rebuild orchestration, used by the `specs generate-metadata` CLI command.

## Requirements

### Requirement: Input and target shapes

`RegenerateSpecMetadata.execute()` MUST accept an input identifying either:

- a single spec, by `specId`; or
- a batch target, optionally scoped to a set of workspace names.

There is no partial-selection mode based on metadata status; batch mode always targets every discovered spec within scope.

### Requirement: Delegates generation to forced materialization

For each target spec, `RegenerateSpecMetadata` MUST invoke `MaterializeSpecMetadata` with `policy: 'force'`. It MUST NOT reimplement generation, freshness comparison, or persistence itself.

### Requirement: Batch discovery avoids the ListSpecs cycle

Batch mode MUST discover raw spec identities through `ListWorkspaces` and each workspace's repository listing of spec identities, not through `ListSpecs`. `ListSpecs` may itself materialize metadata, so using it to select specs for forced regeneration would create a use-case dependency cycle.

### Requirement: One-spec failure semantics

For a single-spec target, if the underlying `MaterializeSpecMetadata` call fails — including a forced cache-write failure — `RegenerateSpecMetadata` MUST report that as a failed result for the operation.

### Requirement: Batch failure semantics

For a batch target, `RegenerateSpecMetadata` MUST continue processing remaining specs after an individual spec fails. It MUST return a per-spec result set indicating success or failure for every targeted spec, and MUST report a non-zero/failing overall outcome when at least one targeted spec failed.

A workspace or spec scoped out by the `workspaces` filter MUST NOT appear in the per-spec result set.

### Requirement: Construction and composition

`RegenerateSpecMetadata` MUST follow the standard Core use-case and composition contract: a class with an async `execute(input)` method, explicit constructor dependencies, and a composition module exposing:

- `RegenerateSpecMetadataDeps`
- `resolveRegenerateSpecMetadataDeps(resolver: CompositionResolver): RegenerateSpecMetadataDeps`
- `createRegenerateSpecMetadata(deps): RegenerateSpecMetadata`
- `createRegenerateSpecMetadata(config: SpecdConfig, options?: CompositionResolutionOptions): RegenerateSpecMetadata`

`resolveRegenerateSpecMetadataDeps(resolver)` MUST resolve at least:

- `MaterializeSpecMetadata`
- `ListWorkspaces`

The config-based `createRegenerateSpecMetadata(config, options?)` form MUST create one `CompositionResolver`, derive dependencies through `resolveRegenerateSpecMetadataDeps(resolver)`, and delegate to the canonical `createRegenerateSpecMetadata(deps)` form.

`RegenerateSpecMetadata`, its `Input`/`Result` types, `Deps`, and `create*` factory MUST be exported through the Core public surface, re-exported by the SDK, and exposed on `Kernel.specs` as `regenerateMetadata`.

## Constraints

- `RegenerateSpecMetadata` never selects targets by metadata freshness status; forced regeneration is unconditional across the resolved scope.
- CLI handlers for `specs generate-metadata` MUST delegate one-spec and unfiltered batch work directly to this use case rather than looping over `MaterializeSpecMetadata` themselves.

## Spec Dependencies

- [`core:materialize-spec-metadata`](../materialize-spec-metadata/spec.md) — the forced-policy orchestration this use case delegates every target to
- [`core:list-workspaces`](../list-workspaces/spec.md) — batch target discovery independent of `ListSpecs`
- [`core:spec-metadata`](../spec-metadata/spec.md) — the projection shape being rebuilt
- [`core:composition-resolver`](../composition-resolver/spec.md) — shared resolver used by the config-based factory
