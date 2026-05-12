<!-- AI guidance: analyse what needs to change and how. Identify affected files, symbols,
     and modules. Document the implementation approach so tasks can be derived from it
     without ambiguity. Be concrete — specify file paths, class names, method signatures.
     Reference spec requirements — do not repeat them.
     Always write this artifact, even for non-code changes. -->

# Design: add-id-uniqueness-validation

## Non-goals

- Changing the hook ID validation logic (already implemented and correct)
- Adding validation for array entry ID format (already implemented)
- Modifying schema-format or any YAML/Zod infrastructure layer

## Affected areas

**`packages/core/src/domain/services/build-schema.ts`**

- Add validation for duplicate IDs in:
  - `validations[]` array within each artifact (lines ~304-305)
  - `deltaValidations[]` array within each artifact (lines ~305)
  - `rules.pre[]` array within each artifact (lines ~340-347)
  - `rules.post[]` array within each artifact (lines ~340-347)
  - `preHashCleanup[]` array within each artifact (lines ~307-310)
  - `metadataExtraction.context[]` array (after line ~517)
  - `metadataExtraction.rules[]` array (after line ~517)
  - `metadataExtraction.constraints[]` array (after line ~517)
  - `metadataExtraction.scenarios[]` array (after line ~517)

**`packages/core/test/domain/services/build-schema.spec.ts`**

- Add test cases for each new validation scenario

## New constructs

No new files, classes, or functions. The implementation reuses existing patterns.

## Approach

1. **Add a helper function** `validateArrayIds` that takes:
   - `ref`: string (schema reference for error messages)
   - `array`: array of objects with `id` field
   - `arrayName`: string (human-readable name for error messages)
   - `context`: string (additional context, e.g., "artifact X" or "metadata extraction")

2. **Validate artifact-level arrays** after `buildArtifactType` is called for each artifact:
   - For each artifact, call `validateArrayIds` on:
     - `validations`
     - `deltaValidations`
     - `rules.pre`
     - `rules.post`
     - `preHashCleanup`

3. **Validate metadataExtraction arrays** after `buildMetadataExtraction` is called:
   - For each array in context, rules, constraints, scenarios, call `validateArrayIds`

The helper function will:

- Collect all IDs using a Map
- Throw `SchemaValidationError` if any ID appears more than once
- Include helpful error message with duplicate ID and location

## Key decisions

- **Reuse existing helper pattern** → Already exists for hooks (lines ~490-511), adapt same pattern for per-array uniqueness
- **Validate after building** → IDs are already extracted; validate at the same point where hook uniqueness is checked (line ~513)

## Trade-offs

- [Error message clarity] → Include both the duplicate ID and the array context in error messages to help users identify the issue quickly

## Migration / Rollback

Pure additive validation. No migration needed.

## Testing

**Automated tests** (`packages/core/test/domain/services/build-schema.spec.ts`):

Add test cases for duplicate ID detection in each array type:

```typescript
it('rejects duplicate validation IDs within the same artifact', () => {
  // ... test code
})

it('rejects duplicate deltaValidation IDs within the same artifact', () => {
  // ... test code
})

it('rejects duplicate rules.pre IDs within the same artifact', () => {
  // ... test code
})

it('rejects duplicate rules.post IDs within the same artifact', () => {
  // ... test code
})

it('rejects duplicate preHashCleanup IDs within the same artifact', () => {
  // ... test code
})

it('rejects duplicate metadataExtraction.context IDs', () => {
  // ... test code
})

it('rejects duplicate metadataExtraction.rules IDs', () => {
  // ... test code
})

it('rejects duplicate metadataExtraction.constraints IDs', () => {
  // ... test code
})

it('rejects duplicate metadataExtraction.scenarios IDs', () => {
  // ... test code
})

it('accepts same ID in different arrays', () => {
  // Already tested for hooks, verify pattern works for other arrays
})
```

**Manual / E2E verification**:

1. Create a test schema with duplicate IDs in each array type
2. Run `specd schema validate <schema.yaml>`
3. Verify each duplicate ID produces appropriate error message

## Open questions

None — implementation is straightforward based on existing hook validation pattern.
