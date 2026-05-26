# DraftedChangeReadOnlyError

## Purpose

When a caller attempts to transform a drafted change through an API that only permits active changes, the system must fail with a machine-readable, consistent error. `DraftedChangeReadOnlyError` is the domain error for that case — a secondary guard when low-level persistence primitives are invoked incorrectly.

## Requirements

### Requirement: Error type

The core package MUST export `DraftedChangeReadOnlyError` extending the project `DomainError` base class.

### Requirement: When thrown

Implementations MUST throw `DraftedChangeReadOnlyError` when:

- `ChangeRepository.save(change)` or `saveArtifact(change, …)` is invoked for a change with `isDrafted === true`, or
- `ChangeRepository.mutate(name, fn)` is invoked and the resolved change is drafted (this SHOULD NOT occur if `mutate` is restricted to active storage — the error remains a safety net), or
- A `Change` entity mutator is invoked directly while `isDrafted === true` when entity-level guards are enabled

The error MUST NOT be thrown for `mutateDraft`, `RestoreChange`, or `DiscardChange` when those operations are correctly scoped to drafted storage.

### Requirement: Payload

`DraftedChangeReadOnlyError` MUST expose at minimum:

- `changeName` — the affected change slug
- `operation` — a short machine-readable label (for example `mutate`, `save`, `saveArtifact`, `transition`)

The error `message` MUST state that the change is drafted and read-only until restored. Messages MUST use **draft** / **drafted** terminology, not "shelved".

### Requirement: Error code

The error MUST use a stable `code` string suitable for CLI and MCP mapping (for example `DRAFTED_CHANGE_READ_ONLY`).

## Constraints

- Prefer preventing the call via `get` / `mutate` active-only resolution so this error is exceptional, not the common path.
- Follow [`default:_global/error-handling-conventions`](../../../../specs/_global/error-handling-conventions/spec.md) for presentation at the CLI boundary.

## Spec Dependencies

- [`core:change`](../../../../specs/core/change/spec.md) — `isDrafted` definition
- [`default:_global/error-handling-conventions`](../../../../specs/_global/error-handling-conventions/spec.md) — error shape and UX
