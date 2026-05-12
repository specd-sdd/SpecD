# Proposal: improve-spec-preview-output

## Motivation

The `specd changes spec-preview` command provides ambiguous output when a spec's artifacts are missing, result in no-op deltas, or when the spec itself is not part of the active change. This makes it difficult for users to distinguish between a "perfect" merge and a missing artifact.

## Current behaviour

Currently, the `PreviewSpec` use case silently skips any artifact file that is missing or results in a no-op delta application. The CLI simply renders the successfully merged files. If a spec is not in the change, a generic `SpecNotInChangeError` is thrown without guidance on how to view the spec instead.

## Proposed solution

We will enhance the `PreviewSpec` use case to include all expected artifacts for a spec in its result, assigning each a status: `merged`, `no-op`, or `missing`. The CLI will be updated to consume these statuses and add descriptive labels to the artifact headers (e.g., `(no-op delta, showing original)`). We will also improve the error message when a spec is missing from a change to suggest using `specd specs show`.

## Specs affected

### Modified specs

- `core:core/preview-spec`: Update the `PreviewSpecResult` and `PreviewSpecFileEntry` to include an explicit status for each artifact. Update the logic to include entries for missing and no-op artifacts instead of skipping them.
  - Depends on (added): none
- `cli:cli/change-spec-preview`: Update requirements for text output to include status labels in headers. Update error handling requirement to include the suggestion for `specd specs show`.
  - Depends on (added): none

## Impact

- `@specd/core`: `PreviewSpec` use case and its associated result interfaces.
- `@specd/cli`: `change spec-preview` command's text and structured output formatting.
- Error Handling: `SpecNotInChangeError` message content.

## Technical context

During exploration, we agreed on specific labels for the CLI text output:

- Delta missing: `(missing artifact, showing original)` (renders original content).
- New spec missing: `(missing artifact)` (renders nothing).
- No-op delta: `(no-op delta, showing original)` (renders original content).

The implementation will require updating both the core use case (to provide the data) and the CLI adapter (to render it).

## Open questions

None at this stage.
