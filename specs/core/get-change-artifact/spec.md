# Get Change Artifact

## Purpose

Monaco needs file bytes plus the hash for the next save, but HTTP delivery must stay thin. `GetChangeArtifact` wraps repository reads with the same tracked-file confinement as save so handlers never reach into `ChangeRepository` ad hoc.

## Requirements

### Requirement: GetChangeArtifact returns content and originalHash

Within `ChangeRepository.mutate`, the use case MUST load the change and call `artifact(change, filename)`, returning `{ content, originalHash }` or a typed not-found error.

### Requirement: GetChangeArtifact enforces tracked-file confinement

The same tracked-file guard as `SaveChangeArtifact` MUST apply: untracked filenames MUST fail before read.

## Spec Dependencies

- [`core:change-repository-port`](../change-repository-port/spec.md) — repository
- [`core:change`](../change/spec.md) — entity
