# ListDrafts

## Purpose

Users who draft changes need visibility into what is parked so they can decide what to resume. The `ListDrafts` use case retrieves all drafted changes from the default workspace — those temporarily set aside that can be restored to active status later.

## Requirements

### Requirement: Returns all drafted changes

`ListDrafts.execute()` MUST return all changes that are in the drafted lifecycle state. The result MUST be sorted by creation order, oldest first.

### Requirement: Returns DraftedChangeView without content

`ListDrafts.execute()` MUST return `DraftedChangeView[]`. Each view MUST expose artifact state (status, validated hashes) and any fields required for listing (including `history` for the latest `drafted` event) but MUST NOT include artifact file content.

Callers MUST NOT receive a `Change` aggregate from this use case.

### Requirement: Constructor accepts a ChangeRepository

`ListDrafts` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDrafts()` and return the resulting `DraftedChangeView[]` without wrapping in mutable `Change` instances.

### Requirement: Returns an empty array when no drafted changes exist

When the repository contains no drafted changes, `execute()` MUST return an empty array. It MUST NOT throw.

### Requirement: Config-based factory preserves complete change repository bootstrap

When `createListDrafts(config)` initializes a `ChangeRepository` from `SpecdConfig`, the repository MUST preserve complete artifact-type and spec-existence bootstrap semantics.

The config-based factory MUST NOT construct a weaker repository variant that can derive different draft artifact states for the same persisted change than the canonical listing read path.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:kernel`](../kernel/spec.md)
