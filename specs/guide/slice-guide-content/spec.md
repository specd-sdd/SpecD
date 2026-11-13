# Slice Guide Content

## Purpose

To prevent context window bloat and enable precise token-efficient reading for AI agents, `@specd/guide` provides capabilities to extract targeted sections by heading and slice bounded line windows. This spec defines the `GetGuideSectionQuery`, `SliceGuideLinesQuery`, and line-numbering formatting utilities in the application layer.

## Requirements

### Requirement: GetGuideSectionQuery Implementation

The application layer MUST implement `GetGuideSectionQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST retrieve the guide from the catalog port using the same topic normalization and collection-qualified resolution as `GetGuideQuery`.
- The query MUST accept the section selector as a string or a number. When the selector is a string, it MUST be interpreted as a 1-indexed numeric index if and only if its trimmed value consists solely of digits; otherwise it MUST be interpreted as a heading name.
- Numeric selection MUST be 1-indexed. An out-of-range index MUST throw `GuideSectionNotFoundError`.
- Heading selection MUST be case-insensitive and whitespace-tolerant, and MUST resolve kebab-case slugs.
- When multiple sections in the document share the requested heading, the query MUST throw `GuideSectionAmbiguousError` with the candidate section details, and MUST NOT silently select one of them.
- Section extraction MUST return the heading line plus all body lines up to the next heading of equal or shallower depth, and MUST include nested child subheadings.
- When no section matches, the query MUST throw `GuideSectionNotFoundError`.

The query MUST accept only the fields declared by its input interface. In particular it MUST NOT accept a heading-name selector under a field name other than the declared section selector; a caller-supplied heading field that is not part of the input interface is not a supported invocation.

When the query reports an error, it MUST expose the document's section headings so the caller can select one. The shape of that exposure MUST be documented: it is either the list of available heading strings, or the list of available section descriptors, and the shape MUST be consistent for a given invocation.

The query MUST resolve only topics within the collection served by its catalog port.

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
