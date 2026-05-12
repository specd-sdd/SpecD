<!-- AI guidance: explain WHY this change is needed. Cover motivation, current pain,
     proposed solution, and scope. Do not write requirements here. -->

# Proposal: unique-hook-ids

## Motivation

To implement `--skip-hooks-by-id` in the CLI (future feature), hooks need globally unique IDs across all workflow steps. Currently, hook IDs are only validated for uniqueness within their immediate array (pre/post), not globally. This prevents reliable hook targeting by ID.

## Current behaviour

- Hooks in `workflow[].hooks.pre[]` and `workflow[].hooks.post[]` have an `id` field
- The spec `core:core/build-schema` validates that IDs are unique "within their immediate array"
- Two hooks in different workflow steps (e.g., `designing.pre` and `implementing.post`) can have the same ID
- The CLI already has `--only <hook-id>` for running specific hooks, but it relies on finding the first match, not unique identification

## Proposed solution

Add global uniqueness validation for hook IDs in `buildSchema`:

- Collect ALL hook IDs across ALL workflow steps (both pre and post arrays)
- Validate that no two hooks share the same ID globally
- Throw `SchemaValidationError` if duplicates are found

## Specs affected

### New specs

None - this is a code change to existing validation.

### Modified specs

- `core:core/build-schema`: Add requirement for globally unique hook IDs across all workflow steps. Update the "Array entry ID validation" requirement to include global hook ID uniqueness, and add verification scenarios.
- `core:core/schema-format`: Update the "Requirement: Array entry identity" to specify that hook IDs must be globally unique across all workflow steps (not just within their immediate array).

## Impact

- **Code**: Modify `domain/services/build-schema.ts` to add hook ID uniqueness validation
- **Tests**: Add test cases for duplicate hook IDs across workflow steps
- **Documentation**: Update spec verify.md with new scenarios

## Open questions

1. Should this also apply to hooks added via project-level overrides (specd.yaml)? Yes, the validation should catch duplicates after merge.
