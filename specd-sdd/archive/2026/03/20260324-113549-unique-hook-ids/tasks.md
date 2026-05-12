# Tasks: unique-hook-ids

## 1. Implementation

- [x] 1.1 Add global hook ID uniqueness validation in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`:
      `buildSchema()` function — add validation after step name checks
      Approach: After line 488 (step name validation), iterate over all workflow
      steps, collect hook IDs from both `hooks.pre` and `hooks.post` arrays, track
      which step each hook belongs to, and throw SchemaValidationError if duplicates found
      (Req: Array entry ID validation)

## 2. Tests

- [x] 2.1 Add test for duplicate hook IDs across different workflow steps
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new test case — verify SchemaValidationError is thrown when hooks in
      different steps share the same ID
      Approach: Create schema with `designing.hooks.pre: [{ id: "run-lint" }]` and
      `implementing.hooks.post: [{ id: "run-lint" }]`, call buildSchema(), expect
      SchemaValidationError with message mentioning duplicate ID
      (Req: Array entry ID validation, scenario: Duplicate hook IDs across workflow steps)

- [x] 2.2 Add test for unique hook IDs accepted
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new test case — verify validation passes when all hook IDs are unique
      Approach: Create schema with distinct hook IDs across all steps, call
      buildSchema(), expect no error
      (Req: Array entry ID validation, scenario: Unique hook IDs across workflow steps accepted)

## 3. Manual verification

- [x] 3.1 Verify CLI rejects schemas with duplicate hook IDs
      Run: Build CLI, create test schema with duplicate hook IDs, run
      `node packages/cli/dist/index.js schema validate <path>`
      Expected: SchemaValidationError with duplicate hook ID message
      (Manual E2E)
