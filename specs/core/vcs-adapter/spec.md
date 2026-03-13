# VCS Adapter Factory

## Purpose

specd must work across git, hg, and svn repositories (and outside VCS entirely) without callers knowing which system is active. `createVcsAdapter` is a composition factory that auto-detects the active version-control system in a directory and returns the corresponding `VcsAdapter` implementation, serving as the single entry point so that callers never construct concrete adapters directly.

## Requirements

### Requirement: Detection probes in priority order

`createVcsAdapter` MUST probe for VCS presence in the following order: git, hg, svn. The first probe that succeeds determines the returned adapter. Subsequent probes MUST NOT execute once a match is found.

### Requirement: Fallback to NullVcsAdapter

When no VCS is detected (all probes fail), `createVcsAdapter` MUST return a `NullVcsAdapter`. It SHALL NOT throw.

### Requirement: Optional cwd parameter

`createVcsAdapter` MUST accept an optional `cwd` parameter specifying the directory to probe. When `cwd` is omitted or `undefined`, it MUST default to `process.cwd()`.

### Requirement: Returns the VcsAdapter port interface

`createVcsAdapter` MUST return a `Promise<VcsAdapter>` — the application port interface defined in `application/ports/vcs-adapter.ts`. The concrete adapter type is an implementation detail not exposed to callers.

## Constraints

- The factory is async — VCS detection requires spawning external processes
- Concrete adapter classes (`GitVcsAdapter`, `HgVcsAdapter`, `SvnVcsAdapter`, `NullVcsAdapter`) MUST NOT appear in any public export; they are internal to the composition layer
- Detection relies on running VCS CLI commands; a probe failure (non-zero exit) means that VCS is not present

## Spec Dependencies

- [`specs/core/composition/spec.md`](../composition/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
