# DraftedChangeView

## Purpose

Callers that inspect a drafted change need read access to persisted state without receiving a mutable `Change` aggregate. `DraftedChangeView` extends [`core:read-only-change-view`](read-only-change-view/spec.md) for changes with `isDrafted === true`. It is constructed by the repository or `GetDraft` and MUST NOT expose mutating `Change` methods or the underlying entity instance.

## Requirements

### Requirement: Extends ReadOnlyChangeView

`DraftedChangeView` MUST extend `ReadOnlyChangeView` with all shared read accessors defined there.

### Requirement: Drafted-specific surface

`DraftedChangeView` MUST additionally expose:

- `isDrafted` — MUST be `true` for every instance

### Requirement: No escape hatch to mutable Change

Implementations MUST satisfy the shared rule in [`core:read-only-change-view`](read-only-change-view/spec.md): no public accessor returns the wrapped `Change`. Only infrastructure inside `ChangeRepository` / `mutateDraft` may hold the mutable aggregate.

### Requirement: Construction

Only `ChangeRepository` (or test doubles of the port) and `GetDraft` MAY construct `DraftedChangeView` instances from a persisted drafted change, using `toDraftedChangeView` from the shared inspection module.

Callers MUST obtain views through `getDraft`, `listDrafts`, or `GetDraft.execute`, not by instantiating the type against arbitrary in-memory `Change` objects in production code.

### Requirement: Artifact content

Loading artifact file content for a drafted change remains the responsibility of `ChangeRepository.artifact` and related port methods when explicitly invoked with the correct drafted storage context. `DraftedChangeView` itself MUST NOT include artifact body content in the view type.

## Constraints

- `DraftedChangeView` is not a replacement for the `Change` entity in the domain model; it is a narrowed projection for drafted storage.
- Terminology in this spec uses **Draft** / **Drafted**, not "shelved".

## Spec Dependencies

- [`core:read-only-change-view`](read-only-change-view/spec.md) — shared read-only contract and facade
- [`core:change`](../../../../specs/core/change/spec.md) — source aggregate and `isDrafted` semantics
- [`core:change-repository-port`](../../../../specs/core/change-repository-port/spec.md) — `getDraft` construction contract
