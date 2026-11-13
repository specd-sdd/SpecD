---
status: accepted
date: 2026-10-15
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0029: Cross-Language Symbol Semantics

## Context and Problem Statement

Language adapters mixed physical declarations, lexical bindings, and logical targets. They also reconstructed parser-visible source structure with whole-file regular expressions. The combination produced false symbols and callers, unstable overload identity, incomplete logical impact, and coverage lookups performed with physical IDs even though `COVERS_SYMBOL` targets logical IDs.

The concrete failure indexed anonymous object keys such as `{ name: 'my-change' }` as variables and attributed real calls to those false declarations. Equivalent caller-selection and structural-extraction risks existed in every built-in adapter.

## Decision Drivers

- One language-neutral identity model for current and future adapters.
- Exact navigation and dependency evidence without sacrificing semantic search and impact.
- Parser-backed ranges, ancestry, ownership, and caller containment.
- Stable overload and declaration-group identity.
- Conservative behavior when static evidence is insufficient.
- Backend-neutral batch operations and deterministic incremental indexing.

## Considered Options

1. Fix TypeScript only. Rejected because the same line-only caller heuristic existed in Python, Go, and PHP.
2. Replace physical relations with logical relations. Rejected because navigation and diagnostics require declaration-level evidence.
3. Give every physical symbol a logical identity. Rejected because lexical bindings and anonymous executable containers are not stable semantic targets.
4. Keep regex extraction with more exclusions. Rejected because exclusions cannot reproduce parser ancestry, error recovery, exact ranges, or lexical ownership.
5. Preserve physical evidence and project it to logical identity at query time. Chosen.

## Decision Outcome

Code Graph uses three intentionally non-bijective layers:

1. `SymbolNode` and `DeclarationOccurrence` are physical, range-backed evidence.
2. `LocalBinding` identifies a spelling in one proven lexical scope.
3. `LogicalSymbol` is a location-independent semantic target that may have several declarations.

Adapters classify syntax before emission as `logical`, `lexical-binding`, `physical-only`, or `unsupported`. Unsupported syntax emits no graph declaration. Anonymous executable containers may remain physical-only callers; anonymous scalar object keys are unsupported.

Tree-sitter is authoritative for declarations, imports, bindings, calls, construction, types, hierarchy, ownership, scopes, arguments, and callers whenever the configured grammar represents them. Regex is limited to:

- auxiliary manifests without a configured parser;
- tokenization wholly bounded by a parser-proven node; or
- a documented grammar compatibility branch anchored to a parser node and covered by a fixture.

Framework-specific policies operate on parser-proven call nodes and literal arguments. They do not rediscover call syntax from whole-file text.

### Built-in regex inventory

The implementation audit classifies the remaining textual operations as follows:

| Adapter    | Allowed bounded use                                                                                                         | Auxiliary metadata                                               | Compatibility boundary                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| TypeScript | identifier tokenization inside parser-proven type/heritage nodes; modifier and literal normalization inside the owning node | package export/path normalization                                | none for calls, imports, declarations, bindings, or callers                       |
| Python     | identifier tokenization inside annotation/type-alias nodes; literal delimiter normalization                                 | `pyproject.toml` section/name parsing                            | none for Python call, import, class, scope, or caller discovery                   |
| Go         | identifier validation and literal delimiter normalization inside declaration/import/type nodes                              | `go.mod` module-line parsing                                     | none for Go declaration bodies, calls, imports, or scopes                         |
| PHP        | literal/class-name normalization inside parser-proven argument/type nodes                                                   | Composer/PSR-4 path processing prepared once per adapter session | none for calls, loaders, assignments, imports, declarations, bindings, or callers |

Any new textual operation must fit one row above and have a lookalike fixture. A whole-file structural match is non-conformant even when its current examples pass.

Dependency relations remain physical. Logical impact seeds every declaration of the selected target, traverses physical relations, deduplicates affected results by logical identity, and retains every contributing physical edge and location. Exact declaration impact remains narrow. `COVERS_SYMBOL` exclusively targets `LogicalSymbol.id`.

Declarations share a logical target only when the language supplies positive grouping
evidence, such as one proven overload group. Equal canonical fields or equal names are
not grouping evidence; absent, empty, or conflicting group keys leave declarations
ungrouped and diagnostic.

Import and hierarchy emission is equally conservative. An unresolved import, loader,
or raw package specifier emits no dependency relation. A resolved imported hierarchy
edge carries the same physical target, parser-derived range, and import-resolution
provenance into its relation and shared hierarchy fact. Filesystem-derived resolution
metadata is immutable session input; Pass 2 does not reread manifests or retain
adapter-instance caches.

Logical coverage queries accept logical IDs only. If physical traversal reaches no
mapped logical target, the logical coverage frontier is empty and no coverage query is
issued; physical declaration IDs are never substituted as a fallback.

## Consequences

- Adapters require explicit declaration policy and shared conformance fixtures.
- Unproven callers and targets remain unresolved instead of producing guessed edges.
- Adding equivalent overload declarations does not change logical identity or semantic risk.
- SQLite schema 15 persists declaration occurrence form and supports batched bidirectional declaration mapping.
- SDK and CLI results distinguish logical, declaration, and public-binding targets while retaining compatibility projections for one release cycle.
- SDK path projection recursively covers resolved-target declarations and every nested physical-evidence location before a delivery host receives the result.
- Adding a language requires satisfying the parser-authority and classification checklist below, not copying a nearest-line or regex implementation.

## Decision Outcome Confirmation

The decision is enforced by registry-driven adapter conformance tests, language-specific parser-authority fixtures, backend-neutral store contracts, resolved-impact tests, incremental-versus-clean equivalence tests, and the ArchiveChange 72-call corpus regression.

## More Information

- Specs: `code-graph:symbol-model`, `code-graph:language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:python-language-adapter`, `code-graph:go-language-adapter`, `code-graph:php-language-adapter`, `code-graph:resolve-symbol-reference`, `code-graph:traversal`, `code-graph:graph-store`, `code-graph:sqlite-graph-store`, `code-graph:indexer`, `code-graph:composition`, `sdk:run-graph-impact`, `cli:graph-impact`
- Package reference: [Code graph](../code-graph/index.md)
- Host contract: [SDK](../sdk/index.md)
- CLI contract: [graph](../cli/graph.md)
