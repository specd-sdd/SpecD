# ListDiscarded

## Overview

The `ListDiscarded` use case retrieves all discarded changes from the default workspace. Discarded changes are those that have been marked for removal but remain in storage until permanently deleted or archived.

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

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/core/kernel/spec.md`](../kernel/spec.md)
