# Actor Resolver Factory

## Purpose

specd needs to identify the current user (for approvals, sign-offs, and audit trails) using whichever VCS is active, without callers coupling to a specific VCS implementation. `createVcsActorResolver` is a composition factory that auto-detects the active version-control system in a directory and returns the corresponding `ActorResolver` implementation, serving as the single entry point so that callers never construct concrete resolvers directly.

## Requirements

### Requirement: VCS adapter composition

`createVcsActorResolver` MUST receive a `VcsAdapter` instance (or resolve one using the active VCS factory) and return an `ActorResolver` wired to that adapter (e.g. `VcsActorResolver`). It SHALL NOT perform separate VCS detection.

### Requirement: External providers run before built-in probes

`createVcsActorResolver` SHALL support additive external actor providers. When external providers are registered, they SHALL be probed in registration order before the built-in git, hg, and svn-backed resolver probes.

If no external or built-in provider matches, the factory SHALL continue to fall back to `NullActorResolver`.

### Requirement: Fallback to NullActorResolver

When the active or provided adapter is a `NullVcsAdapter`, `createVcsActorResolver` MUST return a `NullActorResolver`. It SHALL NOT throw.

### Requirement: Optional cwd parameter

`createVcsActorResolver` MUST accept an optional `cwd` parameter specifying the directory to probe. When `cwd` is omitted or `undefined`, it MUST default to `process.cwd()`.

### Requirement: Returns the ActorResolver port interface

`createVcsActorResolver` MUST return a `Promise<ActorResolver>` — the application port interface defined in `application/ports/actor-resolver.ts`. The concrete resolver type is an implementation detail not exposed to callers.

### Requirement: Privacy wrapping

Privacy wrapping is NOT the responsibility of `createVcsActorResolver`. The factory returns the raw base resolver (VCS-detected or custom). Privacy wrapping is applied at the **kernel composition level**, where `config.privacy` is available.

The kernel wires the actor resolver as:

```typescript
const baseActor = await resolveActorResolver(...)
i.actor = config.privacy
  ? new PrivacyActorResolver(baseActor, config.privacy)
  : baseActor
```

This approach ensures privacy is applied uniformly to ALL actor sources — VCS-backed (git, hg, svn), custom providers registered via the registry, and the null fallback — without coupling `createVcsActorResolver` to the privacy config shape.

## Constraints

- The factory is async — VCS detection requires spawning external processes
- Concrete resolver classes (`GitActorResolver`, `HgActorResolver`, `SvnActorResolver`, `NullActorResolver`) MUST NOT appear in any public export; they are internal to the composition layer
- Detection relies on running VCS CLI commands; a probe failure (non-zero exit) means that VCS is not present

## Spec Dependencies

- [core:actor-provider](../actor-provider/spec.md) -- factory interfaces
- [core:actor-resolver-privacy](../actor-resolver-privacy/spec.md) -- privacy decorator
- [core:composition](../composition/spec.md) -- kernel wiring of privacy decorator
