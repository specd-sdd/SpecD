# Proposal: add-markdown-paragraph-delta-tests

## Motivation

The delta workflow lacks a complete selector/apply test matrix across all addressable node types in the markdown, JSON, and YAML parsers. During test implementation, a hexagonal architecture violation was discovered: the shared `apply-delta.ts` engine hardcodes parser-specific collection type names, coupling the shared engine to adapter internals. Additionally, `applyDelta` does not validate whether `content`, `value`, or `rename` are semantically valid for the target node type, silently producing invalid AST on misuse.

## Current behaviour

The shared `applyDelta` engine contains:

1. Hardcoded `collectionTypes` vector — hexagonal violation.
2. No validation of `content`, `value`, or `rename` field usage against node capabilities.

Three bugs were found and fixed during test implementation:

1. Same-type container unwrapping in `modified` with `content` for collection types
2. Type-checking in `value` replacement when `valueToNode` produces a different type than the target
3. Same-type container unwrapping in `added` with `content` for collection types

## Proposed solution

1. Add a comprehensive cross-parser delta test matrix exercising selector and mutation behavior for every supported node type in markdown, JSON, and YAML.

2. Enrich `NodeTypeDescriptor` with node nature flags (`isCollection`, `isContainer`, `isLeaf`) so each adapter declaratively describes node capabilities. Replace hardcoded type vectors with descriptor-based lookups.

3. Add validation in `applyDelta` that checks all three conditions (`isContainer`, `isLeaf`, `hasLabel`) and returns errors or warnings based on the complete operation semantics matrix. The validation result is returned via a `DeltaApplicationResult` wrapper:

```typescript
interface DeltaApplicationResult {
  readonly ast: ArtifactAST
  readonly warnings: readonly string[]
}
```

`applyDelta` returns `DeltaApplicationResult` instead of `ArtifactAST`. Callers must check the `warnings` array. This is a breaking change requiring test updates.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/artifact-parser-port`: enrich `NodeTypeDescriptor` with nature flags; add semantic validation requirement for operations.
  - Depends on (added): none
- `core:core/delta-format`: add verification scenarios for cross-parser node types and operations.
  - Depends on (added): none
- `core:core/artifact-ast`: keep scope alignment.
  - Depends on (added): none

## Impact

- `packages/core/src/application/ports/artifact-parser.ts` — add nature flags to `NodeTypeDescriptor`
- `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts` — descriptor-based lookups + semantic validation
- All parser adapters — update `nodeTypes()` with nature flags
- Tests under `packages/core/test/infrastructure/artifact-parser/`

## Technical context

`NodeTypeDescriptor` enrichment:

- `isCollection: boolean` — uniform children (list→list-item, etc.)
- `isContainer: boolean` — can have `children`
- `isLeaf: boolean` — can have `value`

Nature flags per format:

- Markdown: document(C,!L,!L), section(C,!L,L), paragraph(!C,L,!L), list(C,C,!L), list-item(C,!L,L), code-block(!C,L,L), thematic-break(!C,!L,!L)
- JSON: document(C,!L,!L), object(C,C,!L), property(C,L,L), array(C,C,!L), array-item(C,L,!L)
- YAML: document(C,!L,!L), mapping(C,C,!L), pair(C,L,L), sequence(C,C,!L), sequence-item(C,L,!L)
- Plaintext: document(C,!L,!L), paragraph(!C,L,!L), line(!C,L,!L)

Validation matrix applies `isContainer`, `isLeaf`, and `hasLabel` checks to all three operations (`content`, `value`, `rename`) and returns errors or warnings based on the complete semantics:

| isContainer | isLeaf | hasLabel | content                       | value                           | rename                         |
| :---------: | :----: | :------: | ----------------------------- | ------------------------------- | ------------------------------ |
|    false    | false  |  false   | ERROR (no alternatives)       | ERROR (no alternatives)         | ERROR (no alternatives)        |
|    true     | false  |  false   | OK                            | ERROR → use content             | ERROR → use content            |
|    false    |  true  |  false   | ERROR → use value             | OK                              | ERROR → use value              |
|    false    | false  |   true   | ERROR → use rename            | ERROR → use rename              | OK                             |
|    true     |  true  |  false   | WARNING → use value           | WARNING → use content           | ERROR → use content or value   |
|    true     | false  |   true   | WARNING → use rename          | ERROR → use content or rename   | WARNING → use content          |
|    false    |  true  |   true   | ERROR → use value or rename   | WARNING → use rename            | WARNING → use value            |
|    true     |  true  |   true   | WARNING → use value or rename | WARNING → use content or rename | WARNING → use content or value |

Error messages MUST include the valid alternatives for that node type. For example:

- `content` on leaf → "use value"
- `content` on leaf with label → "use value or rename"
- `value` on container → "use content"
- `value` on container with label → "use content or rename"
- `rename` without label → "this node has no identifying property to rename"

Warnings for hybrid nodes: "this node type accepts both X and Y — verify you chose the correct one"

## Open questions

_none_
