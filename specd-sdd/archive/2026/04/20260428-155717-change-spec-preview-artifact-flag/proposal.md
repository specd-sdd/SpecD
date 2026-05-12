# Proposal: change-spec-preview-artifact-flag

## Motivation

Users need a way to filter the output of `specd change spec-preview` to a specific artifact (e.g., just `spec.md` or `verify.md`), matching the functionality available in `specd spec show --artifact <name>`. This enables focused reviews of individual artifacts within a change, reducing cognitive load when dealing with large specs.

## Current behaviour

Currently, `specd change spec-preview` always outputs all artifact files that have deltas or are new in the change. There is no way to request a single artifact, which can lead to verbose output that includes irrelevant information for a specific review task.

## Proposed solution

Add an optional `--artifact <name>` flag to the `specd change spec-preview` command. When provided, the command will resolve the artifact ID via the active schema and filter the preview results to only include the matching file. The output format and header conventions will be kept consistent with `specd spec show`.

## Specs affected

### New specs

_none_

### Modified specs

- `cli:cli/change-spec-preview`: Add `--artifact <name>` flag to the command signature and define its behavior for filtering preview output in both merged and diff modes.
  - Depends on (added): none

## Impact

- **CLI**: `specd change spec-preview` command signature and logic updated.
- **UX**: Improved review workflow for large changes with multiple artifacts.

## Technical context

- The implementation will follow the pattern established in `specd spec show` (found in `packages/cli/src/commands/spec/show.ts`).
- Filtering will be performed in the CLI layer, as the `PreviewSpec` use case currently returns all files and it's consistent with how `spec show` handles filtering.
- Resolution of `<name>` to a filename will use `schema.artifact(opts.artifact)` and its `output` path.
- In `text` mode, the `--- <filename> ---` header will be preserved even when filtering to a single artifact.

## Open questions

_none_
