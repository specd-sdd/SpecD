# Guide Domain Model

## Purpose

To provide a consistent, strongly typed semantic foundation for guide operations across catalog lookups, outline inspection, section extraction, and search queries, `@specd/guide` requires well-defined domain entities and value objects. This spec defines the core domain models: `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, and `GuideSummary`.

## Requirements

### Requirement: GuideTopic Entity

The domain layer MUST define the `GuideTopic` entity representing a complete guide document:

- `collection`: Canonical collection identifier grouping the document (e.g. `sdk`, `core`, `code-graph`, `skills`, `schemas`).
- `topic`: Canonical string identifier of the document within its collection. For hand-written documents this MUST be the source path relative to the collection root, without extension, lowercased, retaining subdirectory separators (e.g. `index`, `ports`, `examples/implementing-a-port`). For generated documents this MUST be the collection-relative document path assigned by the bundler.
- `title`: Primary title string extracted from frontmatter.
- `description`: Summary description string extracted from frontmatter.
- `order`: Numeric sort index representing the presentation order (`sidebar_position`).
- `content`: Markdown body text of the guide, excluding the YAML frontmatter block.
- `lineCount`: Total number of lines in `content`.
- `byteLength`: Total byte size of `content`.
- `outline`: Array of `GuideSection` items representing the document structure.

The canonical addressable identity of a guide MUST be the composite `collection:topic` form. The `:` character is reserved as the collection delimiter and MUST NOT appear in a `collection` or `topic` value. A `/` MAY appear inside `topic` to represent a nested source document.

### Requirement: GuideSection Value Object

The domain layer MUST define the `GuideSection` value object representing a discrete section within a guide:

- `index`: 1-indexed sequential integer identifying the section's position within the document outline (1, 2, 3...).
- `heading`: Raw text of the section heading (excluding leading `#` characters).
- `level`: Integer heading depth (e.g. 1 for `#`, 2 for `##`, 3 for `###`).
- `startLine`: 1-indexed line number where the heading begins.
- `endLine`: 1-indexed line number where the section content concludes.
- `lines`: Line span of the section, equal to `endLine - startLine + 1`.
- `startOffset`: 0-indexed character start offset within the parent topic's `content` where the section begins.
- `endOffset`: 0-indexed character end offset within the parent topic's `content` where the section concludes.
- `content`: Optional or dynamically populated full text of the section starting with the heading line up to `endLine`.

`startOffset` and `endOffset` MUST be carried in the generated catalog so that section content can be extracted on demand without re-parsing the document.

### Requirement: GuideSummary Value Object

The domain layer MUST define the `GuideSummary` value object for compact catalog listings:

- `collection`: Collection identifier the guide belongs to.
- `topic`: Canonical topic identifier within its collection.
- `title`: Guide title.
- `description`: Guide description.
- `order`: Presentation order.
- `lineCount`: Total line count.
- `byteLength`: Total byte length.

Catalog listings MAY span more than one collection, and MUST be scoped so that a caller can bound the volume returned. Ordering MUST be defined per collection: entries MUST be ordered by ascending `order`, with ties broken alphabetically by `topic` using locale-sensitive comparison. Values of `order` are NOT required to be unique within a collection, and ordering MUST NOT be defined across collections.

### Requirement: GuideOutline Value Object

The domain layer MUST define the `GuideOutline` value object representing a document map:

- `collection`: Collection identifier the document belongs to.
- `topic`: Topic identifier within its collection.
- `file`: Real source path of the document, relative to its collection root. This MUST be the actual source path and MUST NOT be synthesized from the topic identifier. For a hand-written document this is the relative path of the `.md` file (e.g. `ports.md`, `examples/implementing-a-port.md`); for a generated API topic this is the relative path of the declaration the symbol was extracted from, which is a TypeScript source file rather than a Markdown file.
- `lines`: Total line count.
- `bytes`: Total byte length.
- `sections`: Array of `GuideSection` descriptors.

### Requirement: GuideSearchHit Value Object

The domain layer MUST define the `GuideSearchHit` value object representing a search match:

- `collection`: Collection identifier where the match was found.
- `topic`: Topic identifier within its collection.
- `file`: Real source path of the matched document, relative to its collection root. This MUST be the actual source path and MUST NOT be synthesized from the topic identifier. For a hand-written document this is the relative path of the `.md` file; for a generated API topic this is the relative path of the declaration the symbol was extracted from.
- `section`: Heading title of the matched section.
- `sectionIndex`: 1-indexed section position within the document outline.
- `level`: Heading depth of the matched section.
- `startLine`: 1-indexed start line of the section.
- `endLine`: 1-indexed end line of the section.
- `score`: Relevance score computed by the search algorithm.
- `snippet`: Contextual excerpt containing the match with 1-indexed line numbers.
- `readCommand`: Actionable CLI command suggestion to fetch the matched section, using the section index (e.g. `specd guide-sdk sdk:classes/ArtifactDag --section 3`). The command name MUST be derived from the hit's collection, so that a hit in the `sdk` collection emits `specd guide-sdk` and never `specd guide`.

`level`, `startLine` and `endLine` MUST be indexed document fields so that section-scoped retrieval is available to search adapters without re-parsing source content.

## Constraints

- Domain models MUST be pure TypeScript types or immutable classes with no runtime dependencies.
- All line numbers MUST be 1-indexed positive integers.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package layout and error conventions
