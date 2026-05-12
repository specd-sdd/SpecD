<!-- AI guidance: explain WHY this change is needed. Cover motivation, current pain,
     proposed solution, and scope. Do not write requirements here. -->

# Proposal: add-id-uniqueness-validation

## Motivation

The schema format specification requires that array entry IDs be unique within their immediate array (with hooks being globally unique across all workflow steps). The `buildSchema` function partially implements this: it validates hook ID uniqueness globally, but does NOT validate uniqueness for other array entries.

## Current behaviour

`buildSchema` currently:

- ✅ Validates hook IDs are globally unique across all workflow steps
- ✅ Validates workflow step names are unique
- ✅ Validates artifact IDs are unique
- ❌ Does NOT validate `validations[]` IDs are unique within their array
- ❌ Does NOT validate `deltaValidations[]` IDs are unique within their array
- ❌ Does NOT validate `rules.pre[]` and `rules.post[]` IDs are unique within their arrays
- ❌ Does NOT validate `preHashCleanup[]` IDs are unique within their array
- ❌ Does NOT validate `metadataExtraction` array entry IDs (`context[]`, `rules[]`, `constraints[]`, `scenarios[]`) are unique within their arrays

This means duplicate IDs in these arrays pass validation when they shouldn't.

## Proposed solution

Extend `buildSchema` to validate ID uniqueness for all array entry types, not just hooks. The validation logic already exists for hooks — it needs to be replicated for the other array types.

## Specs affected

### Modified specs

- `core:build-schema`: Update the implementation requirement to explicitly call out the validation for each array type
- `core:schema-format`: The specification already correctly describes the requirement — no change needed, but we should verify it's complete

## Impact

- **Code change:** `packages/core/src/domain/services/build-schema.ts` — add validation functions for each array type
- **Tests:** `packages/core/test/domain/services/build-schema.spec.ts` — add tests for duplicate ID detection in each array type

## Open questions

- None — the specs already define the expected behavior
