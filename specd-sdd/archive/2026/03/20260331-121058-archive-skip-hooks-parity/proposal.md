# Proposal: archive-skip-hooks-parity

## Motivation

`specd change transition` and `specd change archive` expose different hook-skipping flags for the same workflow concern. That inconsistency leaks into docs, specs, tests, and agent instructions, making archive automation harder to remember and reuse.

## Current behaviour

Today `specd change transition` uses `--skip-hooks <phases>` while `specd change archive` uses `--no-hooks`. `ArchiveChange` also accepts only a boolean `skipHooks`, so archiving cannot skip only pre-hooks or only post-hooks the way transitions can skip specific phases.

## Proposed solution

Replace `change archive --no-hooks` with `change archive --skip-hooks <phases>` and align its parsing model with `change transition`. For archiving, the valid phases will be `pre`, `post`, and `all`, and the core use case will accept those selectors instead of a boolean.

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/change-archive`: replace the legacy `--no-hooks` flag with `--skip-hooks <phases>` and document archive-specific phase values.
  - Depends on (added): none.
- `core:core/archive-change`: replace boolean hook skipping with explicit archive hook phase selectors so pre and post hooks can be skipped independently.
  - Depends on (added): none.
- `core:core/hook-execution-model`: describe manual archive hook control using `--skip-hooks` instead of `--no-hooks`, and distinguish archive phase selectors from transition selectors.
  - Depends on (added): `cli:cli/change-archive`.

## Impact

Affected code areas are the CLI archive command, the `ArchiveChange` input contract and hook branches, CLI/core tests, and command documentation in `docs/cli/cli-reference.md` plus related guides. No schema format or lifecycle state rules change.

## Technical context

The user asked for `change archive` and `change transition` to work the same way regarding hook skipping. The existing `transition` implementation already centralises comma-separated parsing in `packages/cli/src/helpers/parse-comma-values.ts`, so the archive command can reuse that parsing style instead of keeping a separate boolean flag.

## Open questions

None.
