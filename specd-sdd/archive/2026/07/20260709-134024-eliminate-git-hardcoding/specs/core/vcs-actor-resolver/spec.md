# VCS Actor Resolver

## Purpose

To resolve the current actor's identity from the active version control system without duplicating VCS detection or CLI execution logic. `VcsActorResolver` implements the `ActorResolver` port by wrapping a `VcsAdapter` and delegating identity queries directly to it.

## Requirements

### Requirement: Implementation of ActorResolver port

`VcsActorResolver` MUST implement the `ActorResolver` port interface.

### Requirement: Constructor receives VcsAdapter

`VcsActorResolver` MUST accept a `VcsAdapter` instance as its constructor parameter.

### Requirement: Identity resolution delegates to VcsAdapter

When `identity()` is called, `VcsActorResolver` MUST invoke `identity()` on its wrapped `VcsAdapter` and return the resulting `ActorIdentity` (mapping the `VcsIdentity` fields).

## Spec Dependencies

- [`core:actor-resolver-port`](../actor-resolver-port/spec.md) — defines the resolved actor interface
- [`core:vcs-adapter-port`](../vcs-adapter-port/spec.md) — defines the version control adapter interface
