# Actor Resolver Factory

## Purpose

specd needs to identify the current user (for approvals, sign-offs, and audit trails) using whichever VCS is active, without callers coupling to a specific VCS implementation. `createVcsActorResolver` is a composition factory that auto-detects the active version-control system in a directory and returns the corresponding `ActorResolver` implementation, serving as the single entry point so that callers never construct concrete resolvers directly.

## Requirements

### Requirement: Detection probes in priority order

`createVcsActorResolver` MUST probe for VCS presence in the following order: git, hg, svn. The first probe that succeeds determines the returned resolver. Subsequent probes MUST NOT execute once a match is found.

### Requirement: External providers run before built-in probes

`createVcsActorResolver` SHALL support additive external actor providers. When external providers are registered, they SHALL be probed in registration order before the built-in git, hg, and svn-backed resolver probes.

If no external or built-in provider matches, the factory SHALL continue to fall back to `NullActorResolver`.

### Requirement: Fallback to NullActorResolver

When no VCS is detected (all probes fail), `createVcsActorResolver` MUST return a `NullActorResolver`. It SHALL NOT throw.

### Requirement: Optional cwd parameter

`createVcsActorResolver` MUST accept an optional `cwd` parameter specifying the directory to probe. When `cwd` is omitted or `undefined`, it MUST default to `process.cwd()`.

### Requirement: Returns the ActorResolver port interface

`createVcsActorResolver` MUST return a `Promise<ActorResolver>` — the application port interface defined in `application/ports/actor-resolver.ts`. The concrete resolver type is an implementation detail not exposed to callers.

## Constraints

- The factory is async — VCS detection requires spawning external processes
- Concrete resolver classes (`GitActorResolver`, `HgActorResolver`, `SvnActorResolver`, `NullActorResolver`) MUST NOT appear in any public export; they are internal to the composition layer
- Detection relies on running VCS CLI commands; a probe failure (non-zero exit) means that VCS is not present

## Spec Dependencies

- [`specs/core/vcs-adapter/spec.md`](../vcs-adapter/spec.md)
- [`specs/core/composition/spec.md`](../composition/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
