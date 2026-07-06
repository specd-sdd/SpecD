# ListDiscarded

## Purpose

Discarded changes remain in storage for audit purposes, and teams need to review them — for example, to confirm a superseded change was properly replaced. The `ListDiscarded` use case retrieves all discarded changes from the default workspace, providing visibility into abandoned work that has not been permanently deleted.

## Requirements

### Requirement: Returns all discarded changes

`ListDiscarded.execute()` MUST return all changes that are in the discarded lifecycle state. The result MUST be sorted by creation order, oldest first.

### Requirement: Returns DiscardedChangeView without content

`ListDiscarded.execute()` MUST return `DiscardedChangeView[]`. Each view MUST expose artifact state (status, validated hashes), shared inspection fields, and discard metadata (`discardReason`, `discardedAt`, `discardedBy`, optional `supersededBy`) but MUST NOT include artifact file content.

Callers MUST NOT receive a `Change` aggregate from this use case.

### Requirement: Constructor accepts a ChangeRepository

`ListDiscarded` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDiscarded()` and return the resulting `DiscardedChangeView[]` without wrapping in mutable `Change` instances.

### Requirement: Returns an empty array when no discarded changes exist

When the repository contains no discarded changes, `execute()` MUST return an empty array. It MUST NOT throw.

### Requirement: Config-based factory preserves complete change repository bootstrap

When `createListDiscarded(config)` initializes a `ChangeRepository` from `SpecdConfig`, the repository MUST preserve complete artifact-type and spec-existence bootstrap semantics.

The config-based factory MUST NOT construct a weaker repository variant that can derive different discarded artifact states for the same persisted change than the canonical listing read path.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`core:discarded-change-view`](../discarded-change-view/spec.md)
- [`core:change-repository-port`](../change-repository-port/spec.md)
