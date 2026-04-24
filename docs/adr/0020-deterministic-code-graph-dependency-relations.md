---
status: accepted
date: 2026-04-24
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0020: Deterministic Code-Graph Dependency Relations

## Context and Problem Statement

The code graph was under-reporting important dependencies in supported languages. Issues
`#52` and `#54` highlighted the same structural gap from two angles: built-in adapters could
extract some imports and simple calls, but constructor injection, constructor calls, typed
signatures, receiver-bound calls, and cross-language alias resolution were either missed or
implemented as adapter-local heuristics.

This created two problems. First, impact analysis and hotspots were incomplete because real
dependencies were absent from the persisted graph. Second, the pipeline had no stable shared
model for deterministic binding and call resolution, so every adapter risked growing its own
resolution logic in incompatible ways.

The question is: how should the code graph represent and resolve these dependencies without
introducing fuzzy inference or embedding language-specific semantics in the indexer?

## Decision Drivers

- **Impact accuracy** — deterministic constructor and type dependencies must participate in impact
  analysis
- **Cross-language consistency** — supported built-in adapters should feed one shared model
- **Architectural separation** — `IndexCodeGraph` must stay language-agnostic
- **Conservative correctness** — unresolved or ambiguous cases must be dropped rather than guessed
- **Model clarity** — construction and static type usage should not be conflated with ordinary calls

## Considered Options

1. **Keep adapter-local heuristics** — each adapter resolves more cases independently
2. **Overload `CALLS` for all deterministic dependencies** — constructor and type usage become
   ordinary call edges
3. **Introduce shared deterministic resolution with explicit relation types** — adapters emit
   binding/call facts, shared scoped resolution chooses targets, and the graph persists distinct
   `CALLS`, `CONSTRUCTS`, and `USES_TYPE` edges

## Decision Outcome

Chosen option: **"Introduce shared deterministic resolution with explicit relation types"**,
because it improves impact precision without sacrificing architectural boundaries.

### The rule

- Built-in language adapters extract deterministic binding facts, call facts, and import facts
  from source syntax
- Shared scoped binding resolution in the indexing pipeline resolves those facts without adding
  language-specific rules to `IndexCodeGraph`
- The persisted dependency vocabulary distinguishes:
  - `CALLS` for ordinary deterministic invocation
  - `CONSTRUCTS` for deterministic instantiation or constructor-like construction
  - `USES_TYPE` for deterministic static type dependency in annotations, signatures, properties,
    fields, and equivalent constructs
- Self-relations are filtered before persistence because they add noise without improving
  blast-radius analysis
- Ambiguous, fuzzy, reflection-based, or otherwise non-deterministic cases are not persisted

### Consequences

- Good, because constructor injection and typed dependencies now become first-class impact edges
- Good, because all supported built-in adapters feed one shared deterministic resolution model
- Good, because the indexer remains language-agnostic while adapters keep language-specific syntax
  handling
- Good, because impact analysis can distinguish invocation, instantiation, and type dependency
- Neutral, because relation consumers and stores must accept a wider closed relation vocabulary
- Bad, because the graph model and tests become more complex than a `CALLS`-only approach
- Bad, because some dynamic cases remain intentionally invisible until deterministic evidence exists

### Confirmation

This decision is confirmed when:

- built-in adapters emit deterministic binding/call facts instead of pushing shared resolution into
  adapter-local heuristics
- the indexer resolves those facts into persisted `CALLS`, `CONSTRUCTS`, and `USES_TYPE` edges
- self-relations are absent from persisted dependency edges
- traversal, impact, and hotspot calculations treat `CONSTRUCTS` and `USES_TYPE` as dependency
  relations
- ambiguous or unresolved cases are dropped instead of guessed

## Pros and Cons of the Options

### Keep adapter-local heuristics

Continue extending each built-in adapter independently.

- Good, because it minimizes short-term shared-model work
- Good, because an adapter can move quickly on language-specific syntax
- Bad, because resolution semantics drift across languages
- Bad, because duplicate logic spreads into multiple adapters
- Bad, because it pushes shared dependency semantics away from the graph model

### Overload `CALLS` for all deterministic dependencies

Persist constructor and static type dependencies as ordinary call edges.

- Good, because it avoids widening the relation vocabulary
- Good, because some impact counts improve quickly
- Bad, because it conflates invocation, construction, and type dependency semantics
- Bad, because later separation would require a migration in persisted graph meaning
- Bad, because consumers cannot distinguish why an edge exists

### Introduce shared deterministic resolution with explicit relation types

Adapters emit facts, shared scoped resolution chooses deterministic targets, and the graph persists
distinct dependency semantics.

- Good, because the persisted graph preserves meaning instead of collapsing it into `CALLS`
- Good, because the design scales across supported languages without indexer-specific syntax rules
- Good, because future adapters can opt into the same model incrementally
- Bad, because it adds more value objects, resolver logic, and regression surface

## More Information

### Spec

- [`specs/code-graph/symbol-model/spec.md`](../../specs/code-graph/symbol-model/spec.md)
- [`specs/code-graph/language-adapter/spec.md`](../../specs/code-graph/language-adapter/spec.md)
- [`specs/code-graph/indexer/spec.md`](../../specs/code-graph/indexer/spec.md)
