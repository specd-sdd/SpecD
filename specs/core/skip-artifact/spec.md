# SkipArtifact

## Purpose

Not every change needs every optional artifact, but the system must distinguish "intentionally omitted" from "forgotten" to avoid blocking downstream steps on missing files. The `SkipArtifact` use case explicitly marks an optional artifact as skipped, signalling deliberate omission so that dependency chains and workflow steps treat it as resolved. Only optional artifacts may be skipped — required artifacts MUST be produced.

## Requirements

### Requirement: Input contract

`SkipArtifact.execute` SHALL accept a `SkipArtifactInput` with the following fields:

- `name` (required, string) — the change slug
- `artifactId` (required, string) — the artifact type ID to skip (e.g. `'proposal'`)
- `reason` (optional, string) — explanation for why the artifact is being skipped

### Requirement: Change lookup

The use case MUST load the change by `name` via `ChangeRepository.get`. If no change with the given name exists, it MUST throw `ChangeNotFoundError`.

### Requirement: Artifact existence check

The use case MUST look up the artifact on the change via `change.getArtifact(artifactId)`. If the artifact does not exist on the change, it MUST throw `ArtifactNotFoundError`.

### Requirement: Only optional artifacts may be skipped

If the resolved artifact has `optional: false`, the use case MUST throw `ArtifactNotOptionalError`. Required artifacts cannot be skipped.

### Requirement: Recording and marking

When the artifact exists and is optional, the use case MUST:

1. Resolve the current actor via `ActorResolver.identity()`
2. Call `change.recordArtifactSkipped(artifactId, actor, reason)` to record the skip event on the change
3. Call `artifact.markSkipped()` to update the artifact's status

### Requirement: Persistence and output

After recording and marking, the use case MUST persist the change through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`; the use case records the skip event on that instance, marks the artifact as skipped, and returns the updated change. This ensures skip decisions are serialized with other mutations of the same change.

`SkipArtifact.execute` returns the updated `Change` entity produced by that serialized mutation.

## Constraints

- The use case validates artifact optionality before resolving actor identity — the actor is not resolved if the artifact is required or nonexistent
- The `reason` field is passed through to the domain event; it is not validated beyond being an optional string

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — `Change` entity, `getArtifact`, `recordArtifactSkipped`
- [`specs/core/composition/spec.md`](../composition/spec.md) — wiring and port injection
