# Actor Resolver Hg

## Purpose

Provides actor identity resolution using the local Mercurial configuration.

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

The Hg actor provider MUST implement the `AutoDetectActorProvider` interface.

- **`name`**: MUST be `"hg"`.

### Requirement: Detection logic

The provider MUST detect Hg presence by looking for a `.hg` directory in the `cwd` or its parents.

### Requirement: Identity resolution

The resulting resolver MUST retrieve identity from Hg config.

- `provider`: MUST be set to `"hg"`.

## Spec Dependencies

- [`core:actor-provider`](../actor-provider/spec.md)
