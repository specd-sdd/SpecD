# Proposal: filter-typescript-array-data-symbols

## Motivation

Generated TypeScript data catalogs expressed as arrays of anonymous object records currently produce tens of thousands of low-value property symbols. Narrowing this extraction reduces graph size and indexing work while preserving meaningful declarations.

## Current behaviour

`TypeScriptLanguageAdapter` visits every `pair` and `property_definition` node and emits scalar object-literal properties as variable symbols. As a result, fields such as `topic`, `heading`, and `startOffset` inside generated array records dominate symbol extraction even though they are data rather than independently useful code declarations.

The adapter must continue to preserve properties belonging to named object declarations, including dictionary-like declarations wrapped in `as const` or `satisfies`, and callable properties or object methods wherever they appear.

## Proposed solution

Refine TypeScript pair processing so non-callable properties are omitted when their enclosing object belongs to an anonymous array-backed data-record path. Classify the property by walking through its object and relevant transparent expression wrappers toward a named declaration or an array boundary, rather than checking only its immediate parent.

Keep callable property values and object methods discoverable in array records, retain named-object scalar properties, and leave full source-content indexing unchanged. Add focused adapter tests covering direct and nested array records, named dictionaries, callable forms, ranges, and deterministic output.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:typescript-language-adapter`: define which object-literal properties remain code symbols and which anonymous array-record data properties are omitted.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The minimum implementation scope is:

- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`, principally `TypeScriptLanguageAdapter.processPairNode` and a small classification helper for ancestor traversal.
- `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`, with regression coverage for preserved and filtered symbols.

The graph identifies `processPairNode` inside the public `TypeScriptLanguageAdapter` as the direct extraction point. Its output feeds downstream graph indexing, search, resolution, and persistence, so the behavioral blast radius is broad even though the code edit is localized. No public API, domain model, storage schema, package dependency, or external dependency change is expected.

## Technical context

The classification must work across nested objects below an array element and transparently traverse grammar wrappers used by named declarations, including `as const`, `satisfies`, type assertions, and parentheses. Once traversal crosses an array boundary before reaching a supported named declaration, non-callable properties are treated as data-record fields.

Callable values remain symbols regardless of array ancestry. Full source text remains searchable through the existing file-content path; this change affects code-symbol extraction only. The implementation must preserve deterministic output and parser-derived construct and selection ranges.

This behavior was separated from SQLite variable-limit work because parser semantics and database parameter safety have independent requirements and risks. Immediate-parent-only filtering was rejected because it misses nested data objects, while filtering every property below an array was rejected because callable properties and object methods remain meaningful declarations.

## Open questions

None. The transparent-wrapper set will follow the concrete Tree-sitter grammar node names already supported by the adapter, and crossing an array boundary before a named declaration is the agreed classification rule.
