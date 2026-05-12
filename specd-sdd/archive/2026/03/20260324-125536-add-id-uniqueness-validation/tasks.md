<!-- AI guidance: break down the implementation into discrete, trackable steps.
     Derive tasks from design.md — each task must reference the concrete file, symbol,
     and change documented there. Include the approach/technique from design.md so the
     implementer knows HOW to do it without cross-referencing.
     Group related tasks under numbered headings. Use markdown checkboxes.
     Do not mark implementing complete while any - [ ] items remain. -->

# Tasks: add-id-uniqueness-validation

## 1. Implement validation helper

- [x] 1.1 Add `validateArrayIds` helper function
      `packages/core/src/domain/services/build-schema.ts`:
      `validateArrayIds` — new helper function after line 511
      Approach: Create function that takes ref, array of objects with id, arrayName, context.
      Use a Map to collect IDs and throw SchemaValidationError on duplicates.
      Include helpful error message with duplicate ID and location.

## 2. Add artifact array validation

- [x] 2.1 Validate `validations[]` IDs per artifact
      `packages/core/src/domain/services/build-schema.ts`:
      after `validateArtifactGraph` call (line ~513)
      Approach: For each artifact, call `validateArrayIds(artifact.id, artifact.validations, 'validations', ...)`
- [x] 2.2 Validate `deltaValidations[]` IDs per artifact
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~513
      Approach: For each artifact, call `validateArrayIds` with deltaValidations array
- [x] 2.3 Validate `rules.pre[]` IDs per artifact
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~513
      Approach: For each artifact with rules.pre, call `validateArrayIds`
- [x] 2.4 Validate `rules.post[]` IDs per artifact
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~513
      Approach: For each artifact with rules.post, call `validateArrayIds`
- [x] 2.5 Validate `preHashCleanup[]` IDs per artifact
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~513
      Approach: For each artifact with preHashCleanup, call `validateArrayIds`

## 3. Add metadataExtraction validation

- [x] 3.1 Validate `metadataExtraction.context[]` IDs
      `packages/core/src/domain/services/build-schema.ts`:
      after `buildMetadataExtraction` call (line ~517)
      Approach: If metadataExtraction.context exists, call `validateArrayIds` with context array
- [x] 3.2 Validate `metadataExtraction.rules[]` IDs
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~517
      Approach: If metadataExtraction.rules exists, call `validateArrayIds` with rules array
- [x] 3.3 Validate `metadataExtraction.constraints[]` IDs
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~517
      Approach: If metadataExtraction.constraints exists, call `validateArrayIds` with constraints array
- [x] 3.4 Validate `metadataExtraction.scenarios[]` IDs
      `packages/core/src/domain/services/build-schema.ts`:
      after line ~517
      Approach: If metadataExtraction.scenarios exists, call `validateArrayIds` with scenarios array

## 4. Add tests

- [x] 4.1 Test duplicate validation IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with artifact containing duplicate validation IDs
      Approach: Create raw data with duplicate IDs in validations array, verify SchemaValidationError thrown
- [x] 4.2 Test duplicate deltaValidation IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with artifact containing duplicate deltaValidation IDs
- [x] 4.3 Test duplicate rules.pre IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with artifact containing duplicate rules.pre IDs
- [x] 4.4 Test duplicate rules.post IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with artifact containing duplicate rules.post IDs
- [x] 4.5 Test duplicate preHashCleanup IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with artifact containing duplicate preHashCleanup IDs
- [x] 4.6 Test duplicate metadataExtraction.context IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with metadataExtraction containing duplicate context IDs
- [x] 4.7 Test duplicate metadataExtraction.rules IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with metadataExtraction containing duplicate rules IDs
- [x] 4.8 Test duplicate metadataExtraction.constraints IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with metadataExtraction containing duplicate constraints IDs
- [x] 4.9 Test duplicate metadataExtraction.scenarios IDs rejected
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — buildSchema with metadataExtraction containing duplicate scenarios IDs
- [x] 4.10 Test same ID in different arrays is valid
      `packages/core/test/domain/services/build-schema.spec.ts`:
      new it block — verify IDs can repeat across different array types

## 5. Run tests and verify

- [x] 5.1 Run existing test suite
      `packages/core/test/domain/services/build-schema.spec.ts`:
      execute test suite
      Approach: Run `pnpm test -- --grep build-schema` and verify all existing tests still pass
- [x] 5.2 Run new tests
      `packages/core/test/domain/services/build-schema.spec.ts`:
      execute new test cases
      Approach: Run `pnpm test -- --grep "duplicate.*IDs"` and verify all new scenarios pass
