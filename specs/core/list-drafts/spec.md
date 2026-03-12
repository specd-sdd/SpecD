# ListDrafts

## Overview

The `ListDrafts` use case retrieves all drafted (shelved) changes from the default workspace. Drafted changes are those that have been temporarily set aside and can be restored to active status later.

## Requirements

### Requirement: Returns all drafted changes

`ListDrafts.execute()` MUST return all changes that are in the drafted (shelved) lifecycle state. The result MUST be sorted by creation order, oldest first.

### Requirement: Returns Change entities without content

The returned `Change[]` MUST contain artifact state (status, validated hashes) but MUST NOT include artifact file content. Content is loaded on demand through separate use cases.

### Requirement: Constructor accepts a ChangeRepository

`ListDrafts` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDrafts()` to retrieve drafted changes.

### Requirement: Returns an empty array when no drafted changes exist

When the repository contains no drafted changes, `execute()` MUST return an empty array. It MUST NOT throw.

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/core/kernel/spec.md`](../kernel/spec.md)
