# CLI Guide Command

## Purpose

Developers and AI agents working in external repositories lack access to the `specd` repository documentation, and public LLMs have no pre-training on `specd` conventions, schemas, or workflows. This spec defines the `specd guide [topic]` and `specd guide search <query>` CLI commands in `@specd/cli` as a delivery adapter over `@specd/guide`, providing terminal-friendly and agent-optimized on-demand documentation, section slicing, outline inspection, and BM25 search.

## Requirements

### Requirement: Guide Catalog Listing Command

Running `specd guide` without arguments MUST display the full catalog of available guide topics.

- The catalog listing MUST include `topic`, `title`, and `description` for each guide, ordered by `order`.
- When output format is `text`, the listing MUST be rendered as an organized, readable table or topic list.
- When output format is `json` or `toon`, the command MUST output a structured array of guide topic summaries.

The catalog listing MUST also surface the sibling SDK guide, so that a user who does not know that a separate command exists can discover it from this command's output:

- The discovery information MUST be a structured field of the listing output, and MUST be present in every supported output format (`text`, `json` and `toon`). It MUST NOT be implemented as a text-only footer or a post-table annotation, because a structured consumer would not be able to parse it.
- The field MUST identify the SDK guide by the exact command name `specd guide-sdk`.
- Under `json` and `toon`, the field MUST be part of the structured output rather than interleaved into a human-readable stream.
- The existing listing contract for `topic`, `title`, `description` and ordering MUST remain unchanged; the discovery field is additive.

#### Requirement: Guide Listing Envelope And Pagination Reporting

The user guide listing MUST use the same envelope shape as the sibling `specd guide-sdk` listing, so that a caller learns one structured shape for both catalogs instead of one per command.

- When output format is `json` or `toon`, the command MUST output a structured object whose `topics` member holds the guide topic summaries, and whose `pagination` member carries `page`, `pageSize`, `returned`, `total` and `totalPages`.
- The object MUST carry a `collections` member summarising, per collection, its `collection`, `total` and `firstPage`/`lastPage` range.
- When rendered as `text`, the listing MUST report the page position as `page N of M` together with the returned and total entry counts whenever the catalog spans more than one page, and MUST omit the page position when the result fits in a single page.
- A listing spanning more than one collection MUST visibly delimit the entries of each collection under `text`.

#### Requirement: Guide Body Flags Require a Topic

`--section`, `--start-line` and `--lines` address a document body and MUST be rejected when no topic argument is supplied, instead of being accepted and silently ignored.

- The command MUST exit with code 1 and MUST report which flags require a topic argument.
- The command MUST NOT render a catalog listing when these flags are supplied without a topic, because doing so silently discards the caller's request.

#### Requirement: Guide Meta Without a Topic Returns a Catalog Index

`specd guide --meta` without a topic argument MUST return a catalog index rather than falling back to the plain listing.

- The index MUST report, per topic, the page it starts on, its line count, its byte length, its scope and its title.
- The index MUST carry a single retrieval hint rather than a per-topic retrieval command. The hint MUST be the literal string `specd guide <topic>`, where `<topic>` stands for a value the caller copies from the listing, and each index entry MUST print its topic as the fully qualified `collection:topic` identifier so that the copied value needs no rewriting. A per-topic command repeats the same information on every row without informing the caller of anything the row does not already show, so the index MUST NOT carry one per topic.
- It MUST respect the active pagination options so that it remains bounded.
- `specd guide --meta` with a topic argument MUST continue to return that single topic's metadata and outline.

#### Requirement: Guide Points At The Sibling SDK Guide In Help

`specd guide --help` MUST name `specd guide-sdk` and state that it serves the SDK and extension development guide, because the command listing alone is not where a user looks when they do not yet know the command exists.

### Requirement: Guide Topic Inspection Command

Running `specd guide <topic>` MUST retrieve and display the content of the specified topic.

- By default, the full Markdown content of the guide topic MUST be output.
- If `<topic>` is unrecognized, the command MUST output a descriptive error message indicating the unknown topic and listing valid available topics, set error code `UNKNOWN_GUIDE_TOPIC`, and exit with process code 1.

### Requirement: Document Metadata and Outline Flags

The `specd guide <topic>` command MUST support a `--meta` flag for inspecting document statistics and section structure without loading full text.

- When `--meta` is provided, the command MUST NOT output the full document content.
- Instead, it MUST return:
  - `topic`: Topic identifier.
  - `file`: Real source path of the document relative to its collection root. This MUST be the actual source path and MUST NOT be a synthesized `<topic>.md` filename. For a nested topic the relative subdirectory MUST be preserved, so a document at `docs/core/examples/implementing-a-port.md` reports `examples/implementing-a-port.md`.
  - `collection`: The collection the document belongs to.
  - `lines`: Total line count of the document.
  - `bytes`: Total byte length.
  - `outline`: Array of all section headings, including `index` (1-indexed section position), `heading`, `level`, `startLine`, `endLine`, `lines`, `startOffset` and `endOffset`.
- This enables AI agents to map document structure in a compact response before requesting specific sections.

### Requirement: Section and Window Slicing Flags

The `specd guide <topic>` command MUST support granular section extraction and line range slicing flags:

- `--section <name|index>`: Extracts only the specified section heading and its body (including any nested subheadings) until the next heading of equal or shallower depth.
  - When a numeric argument is passed (e.g. `3` or `"3"`), the command MUST select the section by its 1-indexed `index` within the document outline. This provides deterministic, unambiguous targeting even when multiple sections share identical heading titles.
  - When a non-numeric string is passed, matching MUST be case-insensitive against heading text or heading slug.
  - If multiple sections share the queried heading text or slug, the command MUST report `AMBIGUOUS_GUIDE_SECTION`, list the matching section numbers and line spans, and exit with code 1.
  - If no section matches by name or index, the command MUST report `UNKNOWN_GUIDE_SECTION` and exit with code 1.
- `--start-line <n>`: Specifies the starting line number (1-indexed). Lines prior to `startLine` are omitted.
- `--lines <m>`: Specifies the maximum number of lines to emit starting from `startLine`.
- `--line-numbers`: Prefixes every emitted line with its 1-indexed line number (padded according to line count), allowing unambiguous line referencing.

### Requirement: Guide Search Subcommand

The CLI MUST provide a search subcommand `specd guide search <query>` to search indexed guide sections.

- The command MUST query the `@specd/guide` search engine and display ranked results.
- The command MUST support the following options:
  - `--topic <topic>`: Restricts the search scope to a specific guide topic.
  - `--limit <n>`: Sets the maximum number of results returned (default: 5).
  - `--snippet-lines <n>`: Configures how many contextual lines before and after the match appear in each snippet (default: 3).
- For each match, the output MUST include:
  - `topic`: Topic identifier.
  - `file`: Markdown file name.
  - `section`: Heading of the matched section.
  - `level`: Heading depth level.
  - `startLine` and `endLine`: 1-indexed section boundaries.
  - `score`: Relevance score.
  - `snippet`: Match text with contextual lines and 1-indexed line numbers.
  - `readCommand`: Copy-pasteable CLI command to view the section or line window (e.g. `specd guide <topic> --section "<heading>"`).

### Requirement: Structured Output Formatting

All `specd guide` commands (`specd guide`, `specd guide <topic>`, and `specd guide search <query>`) MUST support `--format text|json|toon`.

- `text`: Human-readable terminal output with tables and dynamic terminal-width fitting.
- `json`: Standard JSON payload.
- `toon`: Ultra-compact, token-optimized TOON format for AI agents.

### Requirement: Commander CLI Integration

The command MUST be registered as a sub-command of the main `specd` CLI program in `@specd/cli`.

- The command MUST be implemented as a thin delivery adapter delegating all business logic, search, slicing, and outline calculation to `@specd/guide`.
- The CLI command adapter MUST translate domain errors (`GuideTopicNotFoundError`, `GuideSectionNotFoundError`, `GuideSectionAmbiguousError`) into formatted CLI error messages and exit code 1.

## Constraints

- `@specd/cli` SHALL delegate catalog retrieval, search, section extraction, and line slicing directly to `@specd/guide`.
- Invalid topic or section lookups MUST exit with status code 1.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — registers the guide command on the CLI program
- [`default:_global/docs`](../../default/_global/docs/spec.md) — documentation structure and frontmatter conventions
- [`guide:composition`](../../guide/composition/spec.md) — headless guide engine facade, catalog, queries, and search
