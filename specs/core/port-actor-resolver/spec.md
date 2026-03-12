# Actor Resolver Port

## Overview

`ActorResolver` is an application-layer port interface that resolves the identity of the current actor performing an operation. Use cases that record change history events depend on this port to obtain the actor's name and email without coupling to a specific identity provider (git config, SSO, environment variables, etc.).

## Requirements

### Requirement: identity returns the current actor

`identity()` MUST return a `Promise<ActorIdentity>`, where `ActorIdentity` is defined as:

```typescript
interface ActorIdentity {
  readonly name: string
  readonly email: string
}
```

Both `name` and `email` MUST be non-empty strings when the promise resolves successfully.

### Requirement: identity throws when identity is unavailable

When the actor identity cannot be determined (e.g. git `user.name` or `user.email` is not configured), `identity()` MUST reject with an `Error`. It MUST NOT return an `ActorIdentity` with empty or placeholder values.

### Requirement: Decoupled from VcsAdapter

`ActorResolver` MUST NOT extend, import, or depend on `VcsAdapter`. Use cases that need both VCS state and actor identity receive each port independently via dependency injection. The two ports MAY share an underlying provider (e.g. both backed by git), but the interfaces are separate.

### Requirement: Interface-only declaration

`ActorResolver` MUST be declared as a TypeScript `interface`, not an abstract class, consistent with the `VcsAdapter` port design.

### Requirement: Null fallback implementation

A `NullActorResolver` implementation MUST exist for environments where no identity source is available. It MUST satisfy the following contract:

- `identity()` MUST reject with an `Error` whose message indicates that actor identity cannot be resolved because no VCS was detected.
- `NullActorResolver` MUST NOT perform any I/O or shell out to external processes.

Unlike `NullVcsAdapter` (which returns safe defaults for most methods), `NullActorResolver` always throws because there is no meaningful default identity to return.

## Constraints

- The `identity()` method is async and returns a `Promise`.
- `ActorIdentity` is a domain type defined in `domain/entities/change.ts`, not in the port file itself. The port file imports it.
- Implementations reside in `infrastructure/<provider>/actor-resolver.ts`; the port interface lives in `application/ports/actor-resolver.ts`.

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) -- hexagonal architecture, port/adapter separation
- [`specs/core/actor-resolver/spec.md`](../actor-resolver/spec.md) -- factory that selects the concrete implementation
