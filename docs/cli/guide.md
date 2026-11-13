---
title: specd guide
description: CLI reference for retrieving on-demand documentation topics, outline metadata, section slices, and BM25 search
sidebar_position: 1
---

# guide

The `specd guide` command family provides on-demand access to SpecD documentation directly from the terminal or from within agent tool workflows. It delivers topics, outline metadata, granular section extraction, line slicing, and BM25 search over bundled guides.

This command serves the hand-written SpecD guide. The SDK and extension development guide — package references plus generated public API topics — is served by [`specd guide-sdk`](./guide-sdk.md).

## Commands

```bash
specd guide [topic] [options]
specd guide search <query> [options]
```

---

## specd guide [topic]

Retrieve the catalog of all available guides, or inspect the content of a specific guide topic.

### Arguments

| Argument  | Description                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[topic]` | Optional topic identifier (e.g. `workflow`, `getting-started`, `schemas`, `cli`). If omitted, lists the entire guide catalog. Querying is case-insensitive. |

### Options

| Option                        | Description                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `--meta`                      | Emit document metadata, byte/line statistics, and outline structure (all sections with indices and line spans) instead of full text. With no topic, emit a bounded catalog index.                            |
| `--page <n>`                  | 1-indexed listing page to return (default: `1`).                                                                                                                                                             |
| `--page-size <n>`             | Maximum entries per listing page (default: `50`).                                                                                                                                                            |
| `--section <name\|index>`     | Extract only the specified section heading and its body up to the next heading of equal or shallower depth. Accepts 1-indexed section number (e.g. `3`) or heading title / slug (e.g. `"Lifecycle States"`). |
| `--start-line <n>`            | 1-indexed start line number. Lines prior to `startLine` are omitted.                                                                                                                                         |
| `--lines <m>`                 | Maximum number of lines to emit starting from `startLine`.                                                                                                                                                   |
| `--line-numbers`              | Prefix each emitted line with its 1-indexed document line number (e.g. `15                                                                                                                                   | ...`). |
| `--format <text\|json\|toon>` | Output format (default: `text`). `json` returns structured data. `toon` is token-optimized for agents.                                                                                                       |

### Behavior

1. **Listing the Catalog (`specd guide`)**:
   - Lists all bundled topics sorted by display order, bounded by `--page-size`.
   - In `text`, renders a table of topic identifier, title, and description. Each collection is introduced by its own header carrying its topic count and page range, and the page position is reported when the result spans more than one page.
   - In `json` / `toon`, returns the listing envelope shared with `specd guide-sdk`: `topics` (each carrying its `page` and its `scope`), `pagination` (`page`, `pageSize`, `returned`, `total`, `totalPages`), `collections` (per-collection `total`, `firstPage`, `lastPage`), and `sdkGuide`, the structured pointer to the sibling SDK guide.

2. **Reading Topic Content (`specd guide <topic>`)**:
   - Prints the raw Markdown content of the requested guide.
   - Returns exit code `0` on success.
   - If the topic is unknown, outputs error code `UNKNOWN_GUIDE_TOPIC`, lists valid available topics, and exits with code `1`. When a topic's title equals the request, the error names its canonical identifier as a suggestion rather than resolving the request silently.

3. **Inspecting Outline and Metadata (`--meta`)**:
   - With a topic, instead of reading the full guide body, outputs the topic summary and outline:
     - `topic`, `scope`, `file`, `lines`, `bytes`.
     - `outline`: Array of sections, each having `index` (1-indexed), `heading`, `level`, `startLine`, `endLine`, and `lines`.
   - Without a topic, outputs a bounded catalog index instead of the plain listing: the per-collection extents, a single `read: specd guide <topic>` hint, then the per-collection extents, then one row per topic with its page, scope, line count, byte length, and title. `--page` and `--page-size` still bound it. Each row prints its topic as the fully qualified `collection:topic` identifier, so the value the hint shows is exactly what the caller pastes into `<topic>`.
   - Token-efficient for agents to map document structure before requesting sections.

4. **Extracting Sections (`--section <name|index>`)**:
   - When a numeric argument is provided (e.g. `--section 3`), selects the section deterministically by its 1-indexed position in the document outline.
   - When a string is provided (e.g. `--section "Lifecycle States"`), matches case-insensitively against heading text or slug.
   - If multiple sections in the document share the exact same heading title, the command reports `AMBIGUOUS_GUIDE_SECTION`, lists all candidate indices with their line spans, prompts to specify `--section <index>`, and exits with code `1`.
   - If no section matches, reports `UNKNOWN_GUIDE_SECTION`, lists valid sections, and exits with code `1`.

5. **Line Range and Window Slicing (`--start-line`, `--lines`, `--line-numbers`)**:
   - Slices line windows precisely.
   - When `--line-numbers` is active, prefixes each line with its absolute document line number padded according to maximum line width.
   - `--section`, `--start-line`, and `--lines` address a document body, so they are rejected with code `1` when no topic is supplied rather than silently ignored.

### Exit Codes

| Exit Code | Condition                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | Successful retrieval or catalog listing.                                                                                                                                                                                                              |
| `1`       | Error encountered: topic not found (`UNKNOWN_GUIDE_TOPIC`), section not found (`UNKNOWN_GUIDE_SECTION`), ambiguous section name (`AMBIGUOUS_GUIDE_SECTION`), a body flag supplied without a topic (`MISSING_GUIDE_TOPIC`), or invalid flag arguments. |

### Examples

```bash
# List all available guides
specd guide

# Locate every topic, with one hint to read any of them
specd guide --meta --page-size 20

# List one page of the catalog
specd guide --page 2 --page-size 10

# List all available guides in compact TOON format
specd guide --format toon

# The SDK and extension development guide
specd guide-sdk --scope api --page-size 20

# View the full workflow guide
specd guide workflow

# Inspect document outline and metadata of the schemas guide
specd guide schemas --meta --format toon

# Extract section by heading name
specd guide workflow --section "Lifecycle States"

# Extract section with line numbers
specd guide workflow --section "Lifecycle States" --line-numbers

# Extract section deterministically by 1-indexed section number (resolves duplicate headings)
specd guide cli --section 4

# Read a bounded 20-line window starting at line 10
specd guide configuration --start-line 10 --lines 20 --line-numbers
```

---

## specd guide search `<query>`

Perform BM25 full-text search across all indexed guide sections.

### Arguments

| Argument  | Description                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------- |
| `<query>` | Search query terms. Queries are searched across section titles, topics, and section body text. |

### Options

| Option                        | Description                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `--topic <topic>`             | Restrict search results to a single guide topic (e.g. `--topic standard-schema`). |
| `--limit <n>`                 | Maximum number of results to return (default: `5`).                               |
| `--snippet-lines <n>`         | Contextual lines to display before and after each search match (default: `3`).    |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). Default is `text`.                        |

### Output

Each search result hit contains:

- `topic`: Guide topic identifier.
- `file`: Source markdown filename.
- `section`: Heading of the matched section.
- `level`: Heading depth level (e.g. 2 for `##`).
- `startLine` & `endLine`: 1-indexed line coordinates within the guide file.
- `score`: BM25 relevance score.
- `snippet`: Match text excerpt with surrounding context and line numbers.
- `readCommand`: Ready-to-run CLI command to read the matched section directly (e.g. `specd guide workflow --section "Lifecycle States"` or `specd guide workflow --section 3`).

### Exit Codes

| Exit Code | Condition                                                 |
| --------- | --------------------------------------------------------- |
| `0`       | Search executed successfully (even if 0 hits were found). |
| `1`       | Invalid options or execution failure.                     |

### Examples

```bash
# Search all guides for lifecycle states
specd guide search "lifecycle states"

# Search within standard-schema topic only, limiting to top 3 hits
specd guide search "validation" --topic standard-schema --limit 3

# Search and return token-optimized TOON format for AI agents
specd guide search "config cascade" --format toon
```
