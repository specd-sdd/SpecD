# ADR-0004: Rich Domain Entities

## Status
Accepted

## Context
The `Change` entity has a well-defined state machine (`drafting → designing → ready → implementing → done → pending-approval → approved → archivable`). In an anemic model, use cases would each re-implement the transition guards, creating duplication and the risk of invalid transitions going unchecked if a new use case is added carelessly.

## Decision
Domain entities are rich — they own their invariants and state machine transitions. `Change.archive()`, `Change.approve()`, `Change.transition()` etc. validate preconditions and throw typed `SpecdError` subclasses on violations. Use cases call entity methods; they do not re-implement invariant logic.

## Consequences
- Invalid state transitions are impossible to bypass — the entity is the single enforcement point
- Use cases are thinner and easier to read
- Entity methods must be unit-tested thoroughly since they are the invariant source of truth
- Entities must not have I/O dependencies — all data they need is passed as arguments

## Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
