# Slice Guide Content

## Purpose

To prevent context window bloat and enable precise token-efficient reading for AI agents, `@specd/guide` provides capabilities to extract targeted sections by heading and slice bounded line windows. This spec defines the `GetGuideSectionQuery`, `SliceGuideLinesQuery`, and line-numbering formatting utilities in the application layer.

## Requirements

### Requirement: GetGuideSectionQuery Implementation

The application layer MUST implement `GetGuideSectionQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST accept `topic: string` and `section: string | number`.
- If the topic is not found, the query MUST throw a `GuideTopicNotFoundError`.
- When `section` is a number or a string consisting solely of digits (e.g. `3` or `"3"`):
  - The query MUST resolve the section matching that 1-indexed section `index`.
  - If the requested index is less than 1 or greater than the total number of sections in the guide outline, the query MUST throw a `GuideSectionNotFoundError`.
- When `section` is a non-numeric string:
  - Matching MUST be case-insensitive against heading text or slugified heading text.
  - If multiple sections share the same heading text or slug, the query MUST throw a `GuideSectionAmbiguousError` containing the matching section numbers and formatted titles to prompt explicit disambiguation.
  - If no section matches, the query MUST throw a `GuideSectionNotFoundError` containing the requested query and available headings.
- The returned section MUST include its heading line and all lines up to `endLine`.

### Requirement: SliceGuideLinesQuery Implementation

The application layer MUST provide a line slicing utility `sliceGuideLines(content: string, startLine?: number, lineCount?: number)`:

- `startLine`: 1-indexed start line. Defaults to 1 if omitted or less than 1.
- `lineCount`: Maximum number of lines to return. If omitted, returns all lines from `startLine` to the end of `content`.
- If `startLine` exceeds the total number of lines in `content`, the function MUST return an empty string.

### Requirement: Line Number Formatting Utility

The application layer MUST provide `formatWithLineNumbers(content: string, startLine?: number)`:

- Prefixes each line of `content` with its 1-indexed line number (e.g. `  1 | # Title`).
- `startLine` defaults to 1 if omitted or less than 1. Subsequent lines increment sequentially.
- Line number prefixes MUST be right-aligned and padded with spaces based on the width of the highest line number in the formatted text.

## Constraints

- Pure application utilities and queries with zero external runtime dependencies.
- All line numbers MUST be 1-indexed.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideSection domain model
- [`guide:errors`](../errors/spec.md) — GuideSectionNotFoundError definition
