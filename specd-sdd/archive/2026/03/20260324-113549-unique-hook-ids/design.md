# Design: unique-hook-ids

## Non-goals

- Validate uniqueness of other array entry IDs globally (artifacts, validations, deltaValidations, rules, preHashCleanup, metadataExtraction) — these remain scoped to their immediate array
- Implement the `--skip-hooks-by-id` CLI feature — this change only adds validation; the CLI feature is a future enhancement

## Affected areas

### Modified files

- `packages/core/src/domain/services/build-schema.ts` — Add hook ID global uniqueness validation in the `buildSchema` function

### Files to modify for testing

- `packages/core/test/domain/services/build-schema.spec.ts` — Add test cases for duplicate hook IDs across workflow steps

## New constructs

No new files, classes, or modules. This is a validation enhancement to an existing function.

## Approach

1. After the workflow array is parsed (line 468), iterate over all workflow steps
2. Collect all hook IDs from both `hooks.pre` and `hooks.post` arrays across ALL steps
3. Track which step each hook belongs to (for error messages)
4. If a duplicate ID is found, throw `SchemaValidationError` with a clear message identifying the duplicate ID and the conflicting steps

The validation will run after step name uniqueness is checked (line 471-477) and before `validateArtifactGraph` (line 490).

## Key decisions

**Validation timing** → The hook uniqueness check runs after step name validation but before artifact graph validation. This ensures workflow structure is sound before checking hook IDs.

**Error message format** → Include both the duplicate ID and the workflow steps where it appears, e.g.: `duplicate hook id 'run-lint' in workflow steps 'designing.pre' and 'implementing.post'`

## Trade-offs

[Risk] Additional O(n) iteration over workflow hooks → [Mitigation] Negligible impact — workflow arrays are small (typically 3-5 steps, each with 0-3 hooks). The iteration is a one-time cost during schema loading.

## Migration / Rollback

No migration needed — this is a pure validation enhancement. Existing schemas without duplicate hook IDs continue to work unchanged.

Rollback: Revert the code change, redeploy.

## Testing

### Automated tests

Add to `packages/core/test/domain/services/build-schema.spec.ts`:

1. **Duplicate hook IDs across different steps** — Schema with `designing.hooks.pre: [{ id: "run-lint" }]` and `implementing.hooks.post: [{ id: "run-lint" }]` throws `SchemaValidationError`

2. **Duplicate hook ID in same step, different array** — Schema with `designing.hooks.pre: [{ id: "run-lint" }]` and `designing.hooks.post: [{ id: "run-lint" }]` throws (should already fail, but verify)

3. **Unique hook IDs across steps accepted** — Schema with distinct hook IDs across all steps passes validation

### Manual / E2E verification

```bash
# Build the CLI
cd packages/cli && pnpm build

# Test validation rejects duplicate hook IDs
# Create a test schema with duplicates, run:
node packages/cli/dist/index.js schema validate <path-to-schema>
# Expected: SchemaValidationError with duplicate hook ID message
```

## Open questions

None — the implementation is straightforward.
