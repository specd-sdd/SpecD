# Actor Provider

## Purpose

To support extensible and configurable identity resolution, specd uses a registry of actor providers. This spec defines the factory interfaces that allow different technologies (VCS, LDAP, SSO) to contribute actor resolvers to the system.

## Requirements

### Requirement: Base ActorProvider interface

The `ActorProvider` interface SHALL represent a factory capable of producing an `ActorResolver` when explicitly selected.

- It MUST have a `readonly name: string` property used for configuration-based selection.
- It MUST have a `create(options: Record<string, unknown>): Promise<ActorResolver>` method.

### Requirement: AutoDetectActorProvider interface

The `AutoDetectActorProvider` interface SHALL extend `ActorProvider` with environmental detection capabilities.

- It MUST implement `detect(cwd: string): Promise<ActorResolver | null>`.
- It SHALL return an instance when the environment (e.g. a .git folder) matches its technology, otherwise `null`.

## Spec Dependencies

- [`core:actor-resolver-port`](../actor-resolver-port/spec.md) — defines the resolver contract produced by these providers
