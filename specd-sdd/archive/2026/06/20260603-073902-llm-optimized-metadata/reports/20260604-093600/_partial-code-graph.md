# Audit: code-graph:indexer

## Spec Compliance

The `code-graph:indexer` spec has been updated to support LLM-optimized metadata for specifications.

### Requirement: Prefer LLM-optimized description

- **Status**: COMPLIANT
- **Implementation**:
  - `IndexCodeGraph` use case in `packages/code-graph/src/application/use-cases/index-code-graph.ts` now prefers `optimizedDescription` from spec metadata when populating the `description` field of `SpecNode`.
  - It also explicitly stores `optimizedDescription` as a separate field on the `SpecNode`.
  ```typescript
  const specNode = createSpecNode({
    specId,
    path: repoSpec.name.toString(),
    title: metadata?.title ?? repoSpec.name.toString(),
    description: metadata?.optimizedDescription || metadata?.description || '',
    contentHash: specHash ?? 'unknown',
    content,
    workspace: ws.name,
    optimizedDescription: metadata?.optimizedDescription,
  })
  ```
- **Verification**:
  - `SpecNode` interface in `packages/code-graph/src/domain/value-objects/spec-node.ts` includes the `optimizedDescription` field.
  - `createSpecNode` factory function correctly handles the new field.

## Test Coverage

### Automated Tests

- **Spec Node**: `packages/code-graph/test/domain/value-objects/spec-node.spec.ts` verifies that `optimizedDescription` is preserved in the value object.
- **Indexer**: `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts` includes a scenario `prefers optimizedDescription when indexing specs` which explicitly verifies that the `description` field in the graph node uses the optimized version if available.

## Conclusion

The implementation of LLM-optimized metadata in the code-graph indexer is fully compliant with the requirements. It ensures that search and summary operations (which typically rely on the `description` field) will benefit from the optimized content when provided.
