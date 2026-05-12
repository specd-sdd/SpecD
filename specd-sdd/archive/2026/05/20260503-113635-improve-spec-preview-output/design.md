# Design: improve-spec-preview-output

## Affected areas

- `PreviewSpec` in `packages/core/src/application/use-cases/preview-spec.ts`
  - Change: Update `execute` to return entries for all schema artifacts with explicit statuses.
  - Callers: `CompileContext`, CLI `spec-preview`.
- `PreviewSpecResult`, `PreviewSpecFileEntry` in `packages/core/src/application/use-cases/preview-spec.ts`
  - Change: Add `status` field to `PreviewSpecFileEntry`.
- `registerChangeSpecPreview` in `packages/cli/src/commands/change/spec-preview.ts`
  - Change: Update text output logic to render status labels in headers.
- `SpecNotInChangeError` in `packages/core/src/application/errors/spec-not-in-change-error.ts`
  - Change: Update error message to suggest `specd specs show`.

## New constructs

No new files or classes. We are extending existing interfaces and logic.

### Updated Interface: `PreviewSpecFileEntry`

Location: `packages/core/src/application/use-cases/preview-spec.ts`

```typescript
export interface PreviewSpecFileEntry {
  readonly filename: string
  readonly base: string | null
  readonly merged: string
  readonly status: 'merged' | 'no-op' | 'missing'
}
```

## Approach

1.  **Update Core Use Case (`PreviewSpec`):**
    - Modify the loop in `execute` to iterate over `schema.artifacts()` where `scope === 'spec'`.
    - For each artifact:
      - Try to find it in `change.artifacts`.
      - If missing in change, status is `missing`, `merged` is base content (if any) or empty.
      - If present:
        - Apply delta or load new spec content.
        - If delta application results in no-op, status is `no-op`.
        - If delta application fails, record warning and status `missing`.
        - Otherwise, status is `merged`.
    - Ensure the sort logic remains ( `spec.md` first).

2.  **Update CLI (`spec-preview`):**
    - Update `PreviewFile` interface and `isPreviewFile` guard to include `status`.
    - Update text output loop:
      - Determine label based on `status`:
        - `no-op` -> `(no-op delta, showing original)`
        - `missing` && `base !== null` -> `(missing artifact, showing original)`
        - `missing` && `base === null` -> `(missing artifact)`
        - `merged` -> `""`
      - Render header: `--- ${file.filename} --- ${label}`.

3.  **Update Error Message:**
    - Modify `SpecNotInChangeError` constructor to append the suggestion.

## Key decisions

- **Decision** → Always return all schema-defined spec artifacts.
  - Rationale: This makes the "missing" state explicit to the user instead of them wondering if an artifact was forgotten.
- **Decision** → Show original content for no-op/missing deltas.
  - Rationale: Provides context to the user about what the spec looks like even if the change didn't touch it.

## Testing

### Automated tests

- **`packages/core/test/application/use-cases/preview-spec.spec.ts`**:
  - Add tests for `no-op` status.
  - Add tests for `missing` status (when delta file is missing).
  - Add tests for failure during application (producing `missing` status).
  - Verify all schema artifacts are present in result.
- **`packages/cli/test/commands/change/spec-preview.spec.ts`**:
  - Add tests verifying the text output headers for each status.
  - Verify error message for spec not in change includes the suggestion.

### Manual / E2E verification

1.  Create a change and add a spec.
2.  Run `specd changes spec-preview <change> <spec>` without any artifacts -> should show `(missing artifact)`.
3.  Add a no-op delta -> should show `(no-op delta, showing original)`.
4.  Add a valid delta -> should show normal header.
5.  Try previewing a spec NOT in the change -> check error message suggestion.
