# Guide Errors

## Purpose

When users or AI agents request non-existent documentation topics or invalid section headings, `@specd/guide` must provide structured, machine-readable, and actionable errors without depending on `@specd/core`. This spec defines the `SpecdGuideError` base class (which conforms to the SpecD Error Contract by duck-typing) and its concrete domain error subtypes: `GuideTopicNotFoundError` and `GuideSectionNotFoundError`.

## Requirements

### Requirement: SpecdGuideError Base Class

`@specd/guide` MUST define a package-level base error class `SpecdGuideError`:

- Must inherit from JavaScript's native `Error`.
- Must declare `readonly specd = true` to satisfy the SpecD Error Contract discriminator.
- Must declare `abstract readonly code: string` in uppercase snake_case (`UPPER_SNAKE_CASE`).
- Must maintain a readable, descriptive `message`.
- Must NOT import or extend `SpecdError` from `@specd/core`, preserving the zero-runtime-core-dependency rule while maintaining full duck-typing compatibility with SpecD error handlers.

### Requirement: GuideTopicNotFoundError

The domain layer MUST define `GuideTopicNotFoundError` extending `SpecdGuideError`:

- `readonly code = 'UNKNOWN_GUIDE_TOPIC'`.
- `readonly topic: string`: The topic identifier that was requested and not found.
- `readonly availableTopics: readonly string[]`: The list of valid topic identifiers currently available in the catalog.
- The `message` MUST clearly indicate that the topic was not found and enumerate or suggest available topics.

### Requirement: GuideSectionNotFoundError

The domain layer MUST define `GuideSectionNotFoundError` extending `SpecdGuideError`:

- `readonly code = 'UNKNOWN_GUIDE_SECTION'`.
- `readonly heading: string`: The heading text, slug, or index that was searched and not found.
- `readonly availableHeadings: readonly string[]`: The list of valid section headings and indices available within the target guide.
- The `message` MUST state that the section was not found and list available section headings.

### Requirement: GuideSectionAmbiguousError

The domain layer MUST define `GuideSectionAmbiguousError` extending `SpecdGuideError`:

- `readonly code = 'AMBIGUOUS_GUIDE_SECTION'`.
- `readonly heading: string`: The ambiguous heading query string.
- `readonly matchingIndices: readonly number[]`: Array of 1-indexed section numbers matching the query.
- `readonly matchingHeadings: readonly string[]`: Array of formatted section titles with line numbers matching the query.
- The `message` MUST state that multiple sections matched the heading query and instruct the caller to select by 1-indexed section number.

## Constraints

- Zero runtime dependencies on `@specd/core`.
- Error classes MUST satisfy the `readonly specd = true` and `code` contract defined in `default:_global/error-handling-conventions`.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package layout and architecture conventions
- [`default:_global/error-handling-conventions`](../../default/_global/error-handling-conventions/spec.md) — SpecD Error Contract standard
