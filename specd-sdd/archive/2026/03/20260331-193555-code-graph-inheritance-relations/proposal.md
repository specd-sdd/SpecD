# Proposal: code-graph-inheritance-relations

## Motivation

The code graph can model calls, imports, exports, and spec dependencies, but it cannot represent inheritance or implementation as first-class structure. That leaves impact analysis, hotspots, and hierarchy-aware navigation blind to a major source of coupling that matters across multiple languages.

## Current behaviour

Today the symbol model only defines `IMPORTS`, `DEFINES`, `CALLS`, `EXPORTS`, `DEPENDS_ON`, and `COVERS`. There is no graph relation for class inheritance, interface implementation, or method overriding, so:

- changing a base class does not automatically impact its subclasses
- changing an interface does not automatically impact its implementations
- hotspot scoring cannot treat widely inherited base classes or widely implemented interfaces as structurally central
- adapters have no common contract for extracting hierarchy facts across languages
- the database schema and traversal layer have no vocabulary for hierarchy-aware graph queries

## Proposed solution

Add language-agnostic hierarchy relations to the code graph and propagate them through the core graph pipeline. This change will define the common graph vocabulary first, then update the adapter contract, indexer, traversal logic, hotspot analysis, and persistence schema so inheritance and implementation become available to all supported languages through a shared model.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:code-graph/symbol-model`: extend the graph vocabulary with inheritance-oriented relation types and define their semantics at the model level.
  - Depends on (added): none

- `code-graph:code-graph/language-adapter`: require adapters to extract hierarchy relations when the language supports them and define the common adapter contract for those relations.
  - Depends on (added): `code-graph:code-graph/symbol-model`

- `code-graph:code-graph/traversal`: propagate hierarchy information through graph traversal and impact analysis so base types and contracts affect inheritors and implementors.
  - Depends on (added): `code-graph:code-graph/symbol-model`

- `code-graph:code-graph/hotspots`: incorporate hierarchy-derived structural centrality into hotspot scoring, rather than relying only on callers and file importers.
  - Depends on (added): `code-graph:code-graph/symbol-model`, `code-graph:code-graph/traversal`

- `code-graph:code-graph/indexer`: extend indexing to collect, resolve, and persist hierarchy relations alongside the existing file, symbol, and call data.
  - Depends on (added): `code-graph:code-graph/symbol-model`, `code-graph:code-graph/language-adapter`, `code-graph:code-graph/database-schema`

- `code-graph:code-graph/database-schema`: add first-class persistence for the new hierarchy relations and update schema versioning accordingly.
  - Depends on (added): `code-graph:code-graph/symbol-model`

- `code-graph:code-graph/graph-store`: extend the storage contract with the hierarchy-oriented query and persistence capabilities that traversal, hotspots, and indexing need.
  - Depends on (added): `code-graph:code-graph/symbol-model`

## Impact

Affected areas include:

- the code-graph domain model for relation types and traversal semantics
- all language adapters, because the shared contract will gain hierarchy extraction capabilities
- index-time relation construction and persistence
- the graph-store port and LadybugDB adapter query surface
- LadybugDB schema versioning and relationship tables
- downstream graph consumers, especially impact analysis and hotspots
- future call-resolution work, because hierarchy data may later become an input to dispatch reasoning

The change is intentionally global rather than PHP-specific. It is being driven by real needs surfaced while improving PHP/CakePHP analysis, but the solution must apply across languages.

## Technical context

This proposal comes directly from follow-up investigation after the `php-framework-loader-calls` change. That work improved PHP call extraction but surfaced a broader limitation: framework-heavy and object-oriented code depends on hierarchy semantics that the current graph does not represent.

Several constraints and decisions were already established in conversation:

- this must not be a PHP-only design
- the common graph model must come before per-adapter implementation
- the change is broader than language extraction; it also affects impact, hotspots, indexing, and persistence
- the first-class relation set for this iteration is `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- these relations are persisted explicitly in the graph and in the database schema
- constructs from already supported languages that are inheritance-adjacent may be normalized into those three relations when that mapping preserves useful impact and hotspot semantics
- concepts such as traits, mixins, protocols, or embeds should not force new base relation types in this first iteration

Current spec state confirms the gap:

- `code-graph:code-graph/symbol-model` defines only `IMPORTS`, `DEFINES`, `CALLS`, `EXPORTS`, `DEPENDS_ON`, and `COVERS`
- `code-graph:code-graph/hotspots` ranks symbols using callers and importer counts only
- `code-graph:code-graph/indexer` and `code-graph:code-graph/database-schema` have no persistence path for hierarchy edges
- `code-graph:code-graph/graph-store` has no explicit query surface for hierarchy traversal or hierarchy-aware aggregation

## Open questions

- none at proposal stage; the main modeling decisions are settled for this iteration:
  - `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` are first-class persisted relations
  - the initial universal model stays limited to those three relations
  - inheritance-adjacent constructs in already supported languages may be normalized into those relations when doing so preserves the core use case: code understanding, impact discovery, hotspot analysis, and affected-spec discovery
