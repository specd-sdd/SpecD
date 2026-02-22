# ADR-0004: Rich Domain Entities

## Status

Accepted — 2026-02-19

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

- Good: Invalid state transitions are impossible to bypass — the entity is the single enforcement point
- Good: Use cases are thinner and easier to read
- Good: New use cases cannot accidentally bypass invariants
- Bad: Entity methods must be unit-tested thoroughly since they are the invariant source of truth
- Bad: Entities must not have I/O dependencies — all data they need must be passed as arguments

### Confirmation

Entity unit tests in `packages/core/test/domain/` cover all valid state transitions and all invalid transitions (asserting that a typed `SpecdError` subclass is thrown). Coverage of entity state machine paths is enforced in CI.

## Pros and Cons of the Options

### Anemic domain model

- Good: Entities are simple data containers with no logic to test
- Bad: Transition guards must be duplicated across every use case that performs a transition
- Bad: A new use case can accidentally skip a guard and leave an entity in an invalid state
- Bad: The set of valid transitions is implicit — scattered across multiple files

### Rich domain entities

- Good: All invariants live in one place — the entity class
- Good: Typed errors make invalid transitions visible and catchable at the call site
- Good: Transition logic is testable in isolation without constructing full use-case infrastructure
- Bad: Entities require more upfront design to keep them free of I/O dependencies

## Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
