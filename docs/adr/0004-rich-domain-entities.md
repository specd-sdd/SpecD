---
status: accepted
date: 2026-02-19
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0004: Rich Domain Entities

## Context and Problem Statement

The `Change` entity has a well-defined state machine (`drafting → designing → ready → implementing → done → pending-approval → approved → archivable`). In an anemic model, use cases would each re-implement the transition guards, creating duplication and the risk of invalid transitions going unchecked if a new use case is added carelessly.

## Decision Drivers

- State machine correctness must be guaranteed at a single enforcement point — not scattered across use cases
- Invalid state transitions must be impossible to bypass, even when new use cases are added
- Use cases should remain thin and readable, expressing intent rather than re-implementing invariant logic

## Considered Options

- Anemic domain model — plain data objects; use cases contain all transition logic
- Rich domain entities — entities own their invariants and enforce state transitions

## Decision Outcome

Chosen option: "Rich domain entities", because placing invariant logic inside the entity makes it the single enforcement point and eliminates the risk of new use cases bypassing transition guards.

Domain entities are rich — they own their invariants and state machine transitions. `Change.archive()`, `Change.approve()`, `Change.transition()`, etc. validate preconditions and throw typed `SpecdError` subclasses on violations. Use cases call entity methods; they do not re-implement invariant logic.

### Consequences

- Good, because invalid state transitions are impossible to bypass — the entity is the single enforcement point
- Good, because use cases are thinner and easier to read
- Good, because new use cases cannot accidentally bypass invariants
- Bad, because entity methods must be unit-tested thoroughly since they are the invariant source of truth
- Bad, because entities must not have I/O dependencies — all data they need must be passed as arguments

### Confirmation

Entity unit tests in `packages/core/test/domain/` cover all valid state transitions and all invalid transitions (asserting that a typed `SpecdError` subclass is thrown). Coverage of entity state machine paths is enforced in CI.

## Pros and Cons of the Options

### Anemic domain model

- Good, because entities are simple data containers with no logic to test
- Bad, because transition guards must be duplicated across every use case that performs a transition
- Bad, because a new use case can accidentally skip a guard and leave an entity in an invalid state
- Bad, because the set of valid transitions is implicit — scattered across multiple files

### Rich domain entities

- Good, because all invariants live in one place — the entity class
- Good, because typed errors make invalid transitions visible and catchable at the call site
- Good, because transition logic is testable in isolation without constructing full use-case infrastructure
- Bad, because entities require more upfront design to keep them free of I/O dependencies

## More Information

### Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
