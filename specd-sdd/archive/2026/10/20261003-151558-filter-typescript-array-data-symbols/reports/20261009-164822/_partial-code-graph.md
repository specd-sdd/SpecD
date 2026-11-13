# Compliance Audit: TypeScript Array Data Symbols

## Requirements Summary

Audited the merged `code-graph:typescript-language-adapter` change requirement **Object properties in array data records**, its four verification scenarios, the direct dependencies `code-graph:language-adapter`, `code-graph:symbol-model`, and `code-graph:workspace-integration`, and relevant project-wide architecture, conventions, testing, documentation, ESLint, and continuous-integration directives.

The changed requirement has six observable obligations:

1. Omit non-callable object properties when an anonymous enclosing object reaches an array before a supported named-declaration boundary.
2. Apply omission to both direct array elements and nested objects below the array boundary.
3. Preserve scalar properties of named object declarations through parentheses, type assertions, `as const`, and `satisfies` wrappers.
4. Preserve callable property values and object methods regardless of array ancestry.
5. Preserve indexed source content even when property symbols are filtered.
6. Preserve parser-derived construct/selection ranges and deterministic output for retained symbols.

## Implementation Status

**Status: compliant.**

- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts:103-127` defines the callable boundaries and a pure ancestor classifier. It returns `true` on the first array boundary and stops filtering at a variable declarator or callable boundary. This matches the named-declaration/array-path rule for the adapter's supported variable object declarations and prevents array ancestry outside a callable body from leaking into local declarations.
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts:1293-1312` preserves function, arrow-function, function-expression, and generator-function property values as `Method` symbols before applying filtering; only the existing extractable non-callable value kinds are subjected to the array-data classifier.
- Existing object-method extraction remains independent of `processPairNode`, and the new object-method test demonstrates preservation inside array records.
- Filtering occurs only during symbol extraction. No source content is rewritten or discarded, so file indexing continues to receive the complete source.
- Retained symbols continue through the existing `addSymbol` path with the full parser pair/method node and key node, preserving construct and selection ranges.
- The implementation is local to the TypeScript infrastructure adapter, uses strict typed TypeScript, explicit return types, named declarations, kebab-case filenames, and JSDoc on the new helper. It does not introduce I/O, new dependencies, public composition changes, documentation surface changes, or layer violations.

## Discrepancies

No implementation/specification discrepancies found.

The phrase "supported named declaration" is implemented as `variable_declarator` for pair-node object properties. This is consistent with the changed scenarios (all named dictionaries are variable declarations) and with the adapter's existing extraction surface. Other named syntactic owners are not newly reclassified by this change, and no evidence indicates a contradiction with the merged requirement.

Neither code nor spec was treated as automatically authoritative. The implementation's narrower mechanism was checked against every changed scenario and the existing adapter contract; all required outcomes are demonstrated by tests.

## Test Coverage

All four merged verification scenarios have direct automated evidence:

1. **Direct and nested data-record properties are omitted**
   - `typescript-language-adapter.spec.ts:533-545` verifies direct fields, a nested-object field, and its nested scalar are absent.
   - `typescript-language-adapter.spec.ts:610-639` verifies repeat analysis produces identical ordered output.
   - `index-project-graph-integration.spec.ts:601-655` verifies filtered field symbols are absent while a unique value remains searchable through indexed file content.

2. **Named wrapped dictionaries retain scalar properties**
   - `typescript-language-adapter.spec.ts:517-531` covers parentheses, TypeScript angle-bracket assertion, `as const`, and `satisfies`.
   - `typescript-language-adapter.spec.ts:610-639` checks parser-derived construct and selection ranges for a retained wrapped named-object property.

3. **An array boundary inside a named object starts a data-record path**
   - `typescript-language-adapter.spec.ts:547-561` preserves the named object's own `version` property and omits direct/nested properties below its `rows` array.

4. **Callable array-record members remain discoverable**
   - `typescript-language-adapter.spec.ts:563-588` covers object method, arrow property, function expression, and generator property, plus scalar omission and construct/selection ranges.
   - `typescript-language-adapter.spec.ts:590-608` verifies a callable body is a preservation boundary for a nested local named object.

Additional regression/performance-shaped evidence:

- `typescript-language-adapter.spec.ts:641-655` analyzes 1,001 array records and asserts bounded symbol cardinality: only the named-object scalar and callable array member remain.
- The full `@specd/code-graph` verification suite passed: **62 test files, 815 tests**. This supplies regression coverage for the adapter contract, symbol/range model, indexing, storage, and workspace integration alongside the focused assertions.

## Missing Tests

No blocking missing tests.

The range assertion for named wrappers uses a representative parenthesized/`as const` combination rather than repeating range assertions for every wrapper syntax. Because all four wrapper variants use the same existing `addSymbol(node, keyNode, ...)` range path and each variant is separately proven to survive extraction, this is adequate non-duplicative coverage rather than a compliance gap.

## Spec Dependency Chain

- **`code-graph:language-adapter`**: The change remains inside the language-specific adapter and alters only which discovery symbols are emitted. It preserves deterministic `FileAnalysisDraft` behavior, does not persist AST nodes, and does not change the common port, capability contract, or analysis phases.
- **`code-graph:symbol-model`**: Retained symbols still use shared `SymbolKind`, full construct ranges, declared-name selection ranges, canonical file identity, and the existing symbol creation path. Filtered anonymous data fields create no malformed or approximate symbols. No logical-owner or provenance semantics are changed.
- **`code-graph:workspace-integration`**: Full source indexing and canonical workspace-qualified file identity remain intact. The integration test indexes through a real provider/SQLite store, confirms `fixture:catalog.ts`, then proves source-content search and symbol search diverge exactly as specified. No workspace/package resolution behavior changes.
- **Global architecture**: Infrastructure-local syntax classification is correctly housed in the Tree-sitter adapter; no inner-layer dependency or composition violation is introduced.
- **Global conventions and ESLint**: Strict typing, explicit return type, named helper, JSDoc, and existing naming/layout rules are respected. Verification includes successful lint/typecheck evidence from the implementation phase and the full package test suite.
- **Global testing**: Tests use Vitest, mirror the source tree, avoid snapshots, and the integration fixture uses a unique `os.tmpdir()` directory under the suite's existing cleanup discipline.
- **Global docs**: No public CLI, MCP, SDK, configuration, composition, or user workflow contract changed, so no documentation update is required.
- **Global continuous integration**: The change uses no platform-specific syntax or paths and passed the full package suite; it remains compatible with the required build/typecheck/test pipeline.

## Summary counts

| Measure                            | Count |
| ---------------------------------- | ----: |
| Changed requirements audited       |     1 |
| Requirement obligations audited    |     6 |
| Verification scenarios audited     |     4 |
| Direct dependency specs checked    |     3 |
| Global directive groups checked    |     6 |
| Compliant requirements             |     1 |
| Implementation discrepancies       |     0 |
| Spec contradictions/drift findings |     0 |
| Blocking missing tests             |     0 |
| Non-blocking observations          |     1 |

**Overall result: PASS — implementation, tests, dependency contracts, and global directives are compliant with the merged change specification.**
