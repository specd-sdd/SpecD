# Actor Resolver Git

## Purpose

Provides actor identity resolution using the local Git configuration.

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

The Git actor provider MUST implement the `AutoDetectActorProvider` interface.

- **`name`**: MUST be `"git"`.

### Requirement: Detection logic

The provider MUST detect Git presence by looking for a `.git` directory in the `cwd` or its parents.

### Requirement: Identity resolution

The resulting resolver MUST retrieve identity from Git config:

- `name`: `git config user.name`
- `email`: `git config user.email`
- `provider`: MUST be set to `"git"`.

## Spec Dependencies

- [`core:actor-provider`](../actor-provider/spec.md)
