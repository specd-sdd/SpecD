# ListChanges

## Purpose

Delivery mechanisms need a way to show the current working set at a glance, filtering out shelved and discarded items automatically. The `ListChanges` use case retrieves all active changes — those that have not been drafted or discarded — from the default workspace, sorted by creation order.

## Requirements

### Requirement: Returns all active changes

`ListChanges.execute()` MUST return all changes that are neither drafted nor discarded. The result MUST be sorted by creation order, oldest first.

### Requirement: Returns Change entities without content

The returned `Change[]` MUST contain artifact state (status, validated hashes) but MUST NOT include artifact file content. Content is loaded on demand through separate use cases.

### Requirement: Constructor accepts a ChangeRepository

`ListChanges` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.list()` to retrieve changes.

### Requirement: Returns an empty array when no active changes exist

When the repository contains no active changes (all are drafted, discarded, or none exist), `execute()` MUST return an empty array. It MUST NOT throw.

## Spec Dependencies

- [`core:core/change`](../change/spec.md)
- [`core:core/kernel`](../kernel/spec.md)
