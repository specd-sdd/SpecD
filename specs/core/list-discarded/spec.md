# ListDiscarded

## Purpose

Discarded changes remain in storage for audit purposes, and teams need to review them — for example, to confirm a superseded change was properly replaced. The `ListDiscarded` use case retrieves all discarded changes from the default workspace, providing visibility into abandoned work that has not been permanently deleted.

## Requirements

### Requirement: Returns all discarded changes

`ListDiscarded.execute()` MUST return all changes that are in the discarded lifecycle state. The result MUST be sorted by creation order, oldest first.

### Requirement: Returns Change entities without content

The returned `Change[]` MUST contain artifact state (status, validated hashes) but MUST NOT include artifact file content. Content is loaded on demand through separate use cases.

### Requirement: Constructor accepts a ChangeRepository

`ListDiscarded` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDiscarded()` to retrieve discarded changes.

### Requirement: Returns an empty array when no discarded changes exist

When the repository contains no discarded changes, `execute()` MUST return an empty array. It MUST NOT throw.

## Spec Dependencies

- [`core:core/change`](../change/spec.md)
- [`core:core/kernel`](../kernel/spec.md)
