# Guide Domain Model

## Purpose

To provide a consistent, strongly typed semantic foundation for guide operations across catalog lookups, outline inspection, section extraction, and search queries, `@specd/guide` requires well-defined domain entities and value objects. This spec defines the core domain models: `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, and `GuideSummary`.

## Requirements

### Requirement: GuideTopic Entity

The domain layer MUST define the `GuideTopic` entity representing a complete user guide:

- `topic`: Canonical string identifier matching the source filename without extension (e.g. `getting-started`, `configuration`, `workflow`).
- `title`: Primary title string extracted from frontmatter.
- `description`: Summary description string extracted from frontmatter.
- `order`: Numeric sort index representing the presentation order (`sidebar_position`).
- `content`: Markdown body text of the guide, excluding the YAML frontmatter block.
- `lineCount`: Total number of lines in `content`.
- `byteLength`: Total byte size of `content`.
- `outline`: Array of `GuideSection` items representing the document structure.

### Requirement: GuideSection Value Object

The domain layer MUST define the `GuideSection` value object representing a discrete section within a guide:

- `index`: 1-indexed sequential integer identifying the section's position within the document outline (1, 2, 3...).
- `heading`: Raw text of the section heading (excluding leading `#` characters).
- `level`: Integer heading depth (e.g. 1 for `#`, 2 for `##`, 3 for `###`).
- `startLine`: 1-indexed line number where the heading begins.
- `endLine`: 1-indexed line number where the section content concludes.
- `lines`: Line span of the section, equal to `endLine - startLine + 1`.
- `content`: Full text of the section starting with the heading line up to `endLine`.

### Requirement: GuideSummary Value Object

The domain layer MUST define the `GuideSummary` value object for compact catalog listings:

- `topic`: Canonical topic identifier.
- `title`: Guide title.
- `description`: Guide description.
- `order`: Presentation order.
- `lineCount`: Total line count.
- `byteLength`: Total byte length.

### Requirement: GuideOutline Value Object

The domain layer MUST define the `GuideOutline` value object representing a document map:

- `topic`: Topic identifier.
- `file`: Source Markdown filename (e.g. `getting-started.md`).
- `lines`: Total line count.
- `bytes`: Total byte length.
- `sections`: Array of `GuideSection` descriptors.

### Requirement: GuideSearchHit Value Object

The domain layer MUST define the `GuideSearchHit` value object representing a search match:

- `topic`: Topic identifier where the match was found.
- `file`: Source filename.
- `section`: Heading title of the matched section.
- `sectionIndex`: 1-indexed section position within the document outline.
- `level`: Heading depth of the matched section.
- `startLine`: 1-indexed start line of the section.
- `endLine`: 1-indexed end line of the section.
- `score`: Relevance score computed by the search algorithm.
- `snippet`: Contextual excerpt containing the match with 1-indexed line numbers.
- `readCommand`: Actionable CLI command suggestion to fetch the matched section using its section index or heading (e.g. `specd guide <topic> --section <sectionIndex>`).

## Constraints

- Domain models MUST be pure TypeScript types or immutable classes with no runtime dependencies.
- All line numbers MUST be 1-indexed positive integers.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package layout and error conventions
