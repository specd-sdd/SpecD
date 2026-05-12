# Tasks: fix-delta-apply-bugs

## 1. Implementation

- [x] 1.1 Fix multi-section content bug in applyDelta
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`: lines 580-587
      Approach: Change from taking only first child to taking ALL children from parsed content
      (Req: Bug #1 - multi-section content)

- [x] 1.2 Fix ambiguous position.parent validation
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`: lines 567-574
      Approach: Add explicit rejection when paths.length > 1, similar to selector validation
      (Req: Bug #2 - ambiguous position.parent)

- [x] 1.3 Investigate nodeType: 'unknown' issue (Bug #3)
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`: line 591
      Approach: Research if adapters need actual nodeType; may be out of scope for this change
      (Req: Bug #3 - optional)

## 2. Tests

- [x] 2.1 Add test for multi-section content in added operation
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`: new test
      Approach: Create AST with parent, add delta with content containing multiple sections, verify all are inserted

- [x] 2.2 Add test for ambiguous position.parent rejection
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`: new test
      Approach: Create AST with two matching sections, try to add with ambiguous position.parent, verify error is thrown

## 3. Verification

- [x] 3.1 Run existing tests
      Approach: `pnpm test` to ensure no regressions

- [x] 3.2 Run new tests
      Approach: Verify new test cases pass
