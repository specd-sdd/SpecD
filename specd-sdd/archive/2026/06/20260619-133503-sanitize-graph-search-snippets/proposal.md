# Proposal: sanitize-graph-search-snippets

## Motivation

`specd graph search` can currently render corrupted text-mode output when a matched snippet contains ANSI escape sequences or other terminal control characters. At the same time, always printing snippet blocks makes the default output noisier than necessary for quick graph inspection.

## Current behaviour

Text-mode graph search results always render snippets when a snippet is available. This affects symbols, specs, and documents alike. When the snippet source contains raw terminal control sequences, such as content indexed from `.turbo` log files, those sequences are printed directly and the output becomes visually incorrect.

The current command also does not offer a way to request a compact location-only view. Users who only want the hit identity and source position still receive the full snippet block by default.

## Proposed solution

Update `specd graph search` so that text-mode snippet blocks are opt-in through a new `--snippet` flag. Without `--snippet`, text output should remain compact and show only the result identity plus location metadata appropriate to the result type. When `--snippet` is requested, snippet content must be sanitized before rendering so ANSI escape sequences and problematic control characters do not corrupt the terminal output.

This change should also update the CLI reference documentation and the `skills` package workflow templates that reference `graph search`, so agents and users know that `--snippet` is available when detailed match context is needed and do not assume that snippets are present by default.

## Specs affected

### New specs

- none

### Modified specs

- `cli:graph-search`: change the command contract so text-mode snippets are rendered only when `--snippet` is passed, require sanitization of rendered snippet content across symbols, specs, and documents, and document the compact default output behavior.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-templates-source`: change workflow template requirements so graph-search guidance and examples remain correct after snippets become opt-in across text, `json`, and `toon` output.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The primary impact is in the CLI graph-search command surface, text renderer, and its test coverage. Likely implementation areas include the command option parser, text rendering branches, snippet normalization, CLI reference documentation, and `packages/skills/templates/...` workflow template content that demonstrates or recommends `specd graph search`.

The change should not alter graph indexing, ranking, or document classification rules. Log files and other textual non-code files may still appear in document results under current indexing rules; the change is about safe rendering and explicit snippet display.

## Technical context

The current issue was reproduced with `node packages/cli/dist/index.js graph search "repository" --documents --format text`, where a result from `packages/skills/.turbo/turbo-test.log` rendered raw escape sequences such as `\x1b[1A\x1b[K`. Investigation showed that `packages/cli/src/commands/graph/normalize-snippet.ts` currently normalizes indentation and whitespace but does not sanitize ANSI or control characters, while `packages/cli/src/commands/graph/search.ts` always prints snippet blocks when present.

The agreed scope is broader than documents: the rendering defect can affect any graph-search snippet source, including symbols, specs, and documents. The user explicitly rejected solving this by excluding `.turbo` or log files from indexing, because that would not fix the underlying output bug. The user also explicitly requested that docs and `skills` package templates be updated in the same change.

Within the `skills` workspace, the relevant source-of-truth spec is `skills:skill-templates-source`, because it already governs workflow template wording and command examples. The change should therefore treat template guidance updates as spec-governed behavior rather than incidental documentation edits.

To keep the change narrow and avoid an unnecessary structured-output contract break, this proposal treats `--snippet` as a text-mode rendering control. Structured outputs can continue to carry snippet fields and line-range metadata as they do today.

## Open questions

- none
