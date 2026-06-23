# Get Change Artifact

## Purpose

Monaco needs file bytes plus the hash for the next save, but HTTP delivery must stay thin. `GetChangeArtifact` wraps repository reads with the same tracked-file confinement as save so handlers never reach into `ChangeRepository` ad hoc.

## Requirements

### Requirement: GetChangeArtifact returns content and originalHash

The use case MUST load the change with `ChangeRepository.get(name)` and call `artifact(change, filename)`, returning `{ content, originalHash }` or a typed not-found error.

The use case MUST NOT call `ChangeRepository.mutate`, `save`, or any other persistence primitive that advances `updatedAt`.

### Requirement: GetChangeArtifact enforces tracked-file confinement

The same tracked-file guard as `SaveChangeArtifact` MUST apply: untracked filenames MUST fail before read.

### Requirement: GetChangeArtifact is read-only

`execute` MUST be a read operation with no manifest side effects.

Repeated invocations with unchanged artifact content MUST NOT advance `Change.updatedAt` or persist a manifest revision solely from the read.

## Spec Dependencies

- [`core:change-repository-port`](../change-repository-port/spec.md) — repository
- [`core:change`](../change/spec.md) — entity
