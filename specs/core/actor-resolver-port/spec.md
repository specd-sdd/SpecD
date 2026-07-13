# Actor Resolver Port

## Purpose

Change history events must record who performed an operation, but the identity source varies across environments (git config, SSO, environment variables), so use cases cannot depend on any single provider. `ActorResolver` is the application-layer port interface that resolves the current actor's name and email, letting identity providers be swapped without affecting consumers.

## Requirements

### Requirement: identity returns the current actor

identity() MUST return a `Promise<ActorIdentity>`, where `ActorIdentity` is defined in the Change domain entity.

```typescript
export interface ActorIdentity {
  readonly name: string
  readonly email: string
  readonly provider?: string
  readonly providerId?: string
  readonly metadata?: Record<string, string>
}
```

`name` MUST be a non-empty string when the promise resolves successfully. `email` MUST be a non-empty string for providers that have an email source (e.g. git, hg with `Name <email>` format); it MAY be an empty string for providers that do not store email natively (e.g. SVN, LDAP without email attribute). All other fields are optional and their presence depends on the active provider and privacy settings.

### Requirement: identity throws when identity is unavailable

When the actor identity cannot be determined (e.g. git `user.name` or `user.email` is not configured), `identity()` MUST reject with an `Error`. It MUST NOT return an `ActorIdentity` with empty or placeholder values.

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

- [default:\_global/architecture](../../_global/architecture/spec.md) -- hexagonal architecture, port/adapter separation
- [core:actor-resolver](../actor-resolver/spec.md) -- factory that selects the concrete implementation
- [core:change](../change/spec.md) -- defines the ActorIdentity domain type
