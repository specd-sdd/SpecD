# Tasks: add-markdown-paragraph-delta-tests

## Impact summary (CRITICAL risk)

- `applyDelta`: 15 direct dependents, 9 indirect, 7 transitive
- `NodeTypeDescriptor`: 27 direct, 125 indirect, 153 transitive
- Breaking: `applyDelta` returns `DeltaApplicationResult` instead of `ArtifactAST`

## 1-6. Test matrix (already done)

- [x] 1.1-1.3 Markdown paragraph coverage
- [x] 2.1-2.4 Full markdown type + operation matrix
- [x] 3.1-3.3 JSON parser coverage
- [x] 4.1-4.4 YAML parser coverage
- [x] 5.1 Verify artifact alignment
- [x] 6.1 Shared engine isolation tests

## 7. Enrich NodeTypeDescriptor with nature flags

- [x] 7.1 Add `isCollection`, `isSequence`, `isSequenceItem`, `isContainer`, `isLeaf` to `NodeTypeDescriptor`
      File: `packages/core/src/application/ports/artifact-parser.ts`
      (Req: Requirement: Node nature descriptors)

- [x] 7.2 Update all adapters' `nodeTypes()` with correct nature flags
      Files: - `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts` - `packages/core/src/infrastructure/artifact-parser/json-parser.ts` - `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts` - `packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts`
      Flags reflect actual AST structure: - `isCollection`: true only when children are uniform (list→list-item, object→property) - `isSequence`: true only for ordered collections (list, array, sequence) - `isSequenceItem`: true only for items within sequences (list-item, array-item, sequence-item) - `isContainer`: true when node can have children (hybrids also set isLeaf) - `isLeaf`: true when node can have scalar value (hybrids also set isContainer)
      (Req: Requirement: Node nature descriptors)

- [x] 7.3 Add descriptor map parameter to `applyDelta`, replace ALL hardcoded type vectors, implement semantic validation
      File: `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts` - Replace `collectionTypes` with `isCollection` descriptor lookup - Replace `arrayTypes` with `isSequence` descriptor lookup - Replace `itemTypes` with `isSequenceItem` descriptor lookup - Implement helper functions for validation:
      `       validateContent(descriptors, entry, nodeType, warnings): string | undefined
      validateValue(descriptors, entry, nodeType, warnings): string | undefined
      validateRename(descriptors, entry, nodeType, warnings): string | undefined
      ` - Each helper implements its matrix row, returns error or undefined, appends warnings - `value` on `isSequence` nodes always valid (default strategy is replace) - Preserve existing bug fixes
      (Req: Requirement: Node nature descriptors, Requirement: Operation semantic validation)

- [x] 7.4 Update each adapter's `apply()` to pass descriptor map
      Files: - `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts` - `packages/core/src/infrastructure/artifact-parser/json-parser.ts` - `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts` - `packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts`
      Build `ReadonlyMap<string, NodeTypeDescriptor>` from `this.nodeTypes()` and pass to `applyDelta`.
      Return `DeltaApplicationResult` directly.
      (Req: Requirement: Node nature descriptors)

- [x] 7.5 Add semantic validation tests
      Files: - `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`
      Test error cases, warning cases, and alternative suggestions for all matrix rows.
      (Req: Requirement: Operation semantic validation)

- [x] 7.6 Update use case callers to extract `.ast` from result
      Files: - `packages/core/src/application/use-cases/validate-artifacts.ts` - `packages/core/src/application/use-cases/archive-change.ts` - `packages/core/src/application/use-cases/preview-spec.ts`

- [x] 7.7 Update all test files to handle `DeltaApplicationResult`
      Files: - `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts` - `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts` - `packages/core/test/infrastructure/artifact-parser/json-parser.spec.ts` - `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts` - `packages/core/test/infrastructure/artifact-parser/plaintext-parser.spec.ts` - `packages/core/test/infrastructure/artifact-parser/markdown-parser-real-merge.spec.ts`
      All calls updated to extract `.ast` from result.

## 8. Validation

- [x] 8.1 Run focused parser suites
- [x] 8.2 Run broader core test suite after refactoring
