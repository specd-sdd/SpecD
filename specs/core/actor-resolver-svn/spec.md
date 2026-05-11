# Actor Resolver Svn

## Purpose

Provides actor identity resolution for Subversion working copies.

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

The Svn actor provider MUST implement the `AutoDetectActorProvider` interface.

- **`name`**: MUST be `"svn"`.

### Requirement: Detection logic

The provider MUST detect SVN presence by looking for a `.svn` directory in the `cwd` or its parents.

### Requirement: Identity resolution

The resulting resolver MUST retrieve identity from SVN environment.

- `provider`: MUST be set to `"svn"`.

## Spec Dependencies

- [`core:actor-provider`](../actor-provider/spec.md)
