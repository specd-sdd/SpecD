# Proposal: validate-metadata-extraction

## Motivation

During verification of change `context-fingerprint`, we discovered that `change validate --artifact verify` passes but `spec generate-metadata` fails with validation errors. The root cause: ValidateArtifacts checks delta syntax and structural rules, but NOT metadataExtraction rules.

## Current behaviour

ValidateArtifacts (packages/core/src/application/use-cases/validate-artifacts.ts) currently validates:

1. Delta syntax via `deltaValidations`
2. Structural rules via `artifactType.validations` on merged preview

It does NOT validate metadata extraction — the rules that define how to extract title, description, rules, scenarios, constraints from spec content.

When a spec has malformed scenarios (missing WHEN/THEN), the validation passes because metadata extraction errors are only caught later by `spec generate-metadata`.

## Proposed solution

Four changes:

1. **CLI: make specPath optional for change-scoped artifacts**: Modify `change validate` to make `specPath` optional. For `scope: change` artifacts (like `design`, `tasks`), no specPath needed. For `scope: spec` artifacts, specPath still required.

2. **Scope validation to specPath**: When `specPath` is provided, only validate artifacts belonging to that spec — not all specs in the change. This prevents false failures on specs not yet created.

3. **Missing non-optional artifact should fail**: When artifact file is missing and artifact is not optional, currently ValidateArtifacts does `continue` (skip). It should record a failure instead.

4. **Add metadataExtraction validation**: Modify `extractMetadata()` to accept optional `targetArtifactId` parameter, then in ValidateArtifacts call it and validate result against `strictSpecMetadataSchema`.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/validate-artifacts`: Add metadataExtraction validation logic + fix missing non-optional artifact detection + scope validation to specPath
  - Depends on (added): none
- `cli:cli/change-validate`: Make specPath optional for change-scoped artifacts
  - Depends on (added): none

## Impact

- **Code**: packages/core/src/application/use-cases/validate-artifacts.ts, packages/core/src/domain/services/extract-metadata.ts
- **CLI**: packages/cli/src/commands/change/validate.ts — update flag handling
- **Functionality**: Users will see metadata validation errors earlier in the workflow
- **Breaking**: None — adds new validation, does not change existing behavior

## Technical context

Key discovery during investigation:

- `metadataExtraction` is defined in schema (build-schema.ts) with fields: title, description, rules, constraints, scenarios, dependsOn, keywords, context
- Each field has an `artifact` property targeting specific artifact IDs (e.g., 'specs', 'verify')
- `extractMetadata()` returns `ExtractedMetadata` with scenarios containing when/then/given
- `strictSpecMetadataSchema` requires scenarios to have non-empty `then` array

The existing code already calls `extractMetadata` at line 373-387 for `dependsOn` extraction. We need to extend this to validate the full extraction against the strict schema.

## Open questions

_none_ — the approach is clear from code inspection.
