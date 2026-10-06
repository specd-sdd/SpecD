---
title: specd guide-sdk
description: CLI reference for retrieving SDK and extension package documentation, generated public API topics, scoped catalog listings, and BM25 search
sidebar_position: 2
---

# guide-sdk

The `specd guide-sdk` command family provides on-demand access to the SpecD SDK and extension documentation directly from the terminal or from within agent tool workflows. It serves hand-written package references (`sdk`, `core`, `code-graph`, `skills`, `schemas`) together with generated public API topics extracted from the published package entry points.

It is the sibling of [`specd guide`](./guide.md). `specd guide` serves the user-facing guide collection; `specd guide-sdk` serves the SDK collection, whose topics are addressed with an explicit `collection:` prefix.

## Commands

```bash
specd guide-sdk [topic] [options]
specd guide-sdk search <query> [options]
```

---

## `specd guide-sdk [topic]`

List the SDK catalog, or retrieve the content of a single SDK topic.

### Arguments

| Argument  | Description                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[topic]` | Optional collection-qualified topic identifier (e.g. `core:ports`, `sdk:classes/ArtifactDag`). If omitted, lists the SDK catalog. Querying is case-insensitive. |

`:` is the collection delimiter and is reserved. `/` is preserved inside a topic, so nested documents such as `core:examples/implementing-a-port` resolve normally. Surrounding whitespace is trimmed and a trailing `.md` extension is stripped before resolution.

### Options

| Option                        | Description                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--scope <docs\|api\|all>`    | Select topic kinds: `docs` (hand-written, the default), `api` (generated topics only, across every collection), or `all` (both). Not a collection filter.                 |
| `--collection <name>`         | Restrict a catalog listing to one collection: `sdk`, `core`, `code-graph`, `skills`, or `schemas`. Independent of `--scope`, so the two combine.                          |
| `--page <n>`                  | 1-indexed listing page to return (default: `1`).                                                                                                                          |
| `--page-size <n>`             | Maximum entries per listing page (default: `50`).                                                                                                                         |
| `--meta`                      | Emit title, description, order, byte/line statistics, collection, and outline structure instead of the document body. With no topic, emit a bounded catalog index.        |
| `--section <name\|index>`     | Extract only the specified section heading and its body up to the next heading of equal or shallower depth. Accepts a 1-indexed section number or a heading title / slug. |
| `--start-line <n>`            | 1-indexed start line number. Lines prior to `startLine` are omitted.                                                                                                      |
| `--lines <m>`                 | Maximum number of lines to emit starting from `startLine`.                                                                                                                |
| `--line-numbers`              | Prefix each emitted line with its 1-indexed document line number.                                                                                                         |
| `--format <text\|json\|toon>` | Output format (default: `text`). `json` and `toon` return the structured listing envelope. `toon` is token-optimized for agents.                                          |

### Behavior

1. **Listing the Catalog (`specd guide-sdk`)**:
   - Without `--scope`, lists hand-written documents only, so the result stays comparable in size to the `specd guide` catalog. The generated API topics remain discoverable: the listing reports how many are withheld and the exact command that reveals them.
   - With `--scope docs`, lists hand-written documents, which is the default. With `--scope api`, lists generated API topics only, across every collection that generates them. With `--scope all`, lists everything.
   - With `--collection <collection>`, every returned entry belongs to that collection.
   - `--scope` and `--collection` are independent dimensions and compose, so `--scope api --collection code-graph` lists only the generated code-graph topics.
   - An unrecognized `--scope` exits with code `1`, reports the valid scopes, and names `--collection` as the flag that filters by collection. An unrecognized `--collection` exits with code `1` with code `INVALID_GUIDE_COLLECTION` and the valid collections derived from the catalog. Neither returns an empty listing.
   - Entries are grouped by collection, and within a collection ordered by ascending `order`, then alphabetically by `topic` using locale-sensitive comparison. Ordering is never defined across collections.
   - Results are bounded by `--page-size`, and `--page` selects the window. Relative order within a page always matches the unpaginated order.
   - Each entry carries `collection`, `topic`, `title`, `description`, `order`, and the `page` it appears on.
   - In `text`, each collection is introduced by its own header carrying its topic count and page range, and the page position is reported when the result spans more than one page. In `json` and `toon`, the listing envelope is emitted.

   The structured listing envelope is shared with `specd guide`:

   | Field             | Description                                                                                 |
   | ----------------- | ------------------------------------------------------------------------------------------- |
   | `topics`          | Topic summaries on the returned page, each carrying its `page` and its `scope`.             |
   | `pagination`      | `page`, `pageSize`, `returned`, `total`, and `totalPages` for the scoped result.            |
   | `collections`     | One extent per collection: its `total`, `firstPage`, and `lastPage`.                        |
   | `hiddenByDefault` | Present when the scope withholds topics: `generatedApiTopics` and the `revealWith` command. |

   Every entry carries a `scope` of `docs` (hand-written guidance) or `api` (generated reference). That is a different dimension from the entry's `collection`: `code-graph:classes/GetGraphHealth` has the collection `code-graph` and the scope `api`.

2. **Retrieving a Topic (`specd guide-sdk <collection>:<topic>`)**:
   - Emits the full Markdown body of the document or generated symbol page.
   - Generated API topics are individually addressable and support the same `--section`, `--start-line`, `--lines`, and `--line-numbers` options as hand-written topics.
   - A generated topic is written to be usable on its own, by a caller who has no copy of the source. It carries the declaration's signature with its parameters and return type; a class documents its constructor, its methods and its fields, and an interface documents each method and each field with its type and whether it is optional. A getter appears as a field carrying its return type.
   - A symbol documented under a collection that re-exports it carries the same body as the one that declares it. The collections are barrels over each other, so `sdk:classes/HookResult` documents the class declared in `@specd/core`, and both topics are complete.
   - A generated topic carries a `Usage` section. When the declaration documents an `@example`, that example is used as the author wrote it, keeping its line breaks, its indentation and its own code fence; otherwise a skeleton is derived from the signature, binding the declared parameter names rather than inventing values. The generated Markdown is then formatted with this repository's Prettier configuration, which may adjust the example's whitespace without changing what it shows.
   - A generated topic carries a `Related types` table linking every referenced type the catalog documents. A name reached through more than one collection links to the collection that declares it rather than the one that re-exports it. A type the catalog does not document stays a plain name rather than becoming a wrong link.
   - A generated topic documents only the members this repository declares. Members inherited from the standard library are left out: an error class does not redeclare `message`, `name`, `stack` or `stackTraceLimit`, and the documentation those carry comes from the standard library rather than from this project. A member declared in any package of the workspace is kept even when the collection reached it by re-exporting it.
   - Generated bodies are formatted with this repository's Prettier configuration, so their tables line up with the rest of the documentation. Hand-written topics are never rewritten by the generator.

3. **Inspecting Metadata (`--meta`)**:
   - With a topic, emits that topic's title, description, order, line count, byte length, collection, scope, and outline, without the document body.
   - A generated API topic additionally emits `packageName` and `importStatement`. `importStatement` is a copy-pasteable import from the published package, which is what a caller of the SDK can act on. Interfaces and type aliases are imported type-only, because they have no value form; classes, enumerations, functions and variables are imported by value.
   - A generated API topic reports no `file` field at all. The declaration lives inside the specd repository and that path does not exist in the caller's own tree, so naming it only invites an agent to look for a file it will never find; the import statement is what reaches the symbol. A hand-written topic keeps its `file` field, since there the path is the only thing saying where the content came from.
   - A hand-written topic omits `packageName` and `importStatement` rather than reporting them as null.
   - Without a topic, emits a bounded catalog index: a single `read: specd guide-sdk <topic>` hint, then the per-collection extents, then one row per topic with its page, scope, line count, byte length, and title. `--page` and `--page-size` still bound the index.
   - Each index row prints its topic as the fully qualified `collection:topic` identifier, so the value the hint shows is exactly what the caller pastes into `<topic>`.

4. **Extracting a Section (`--section`)**:
   - A numeric selector resolves the section whose 1-indexed outline position matches.
   - A text selector is matched case-insensitively and whitespace-tolerantly; a kebab-case slug resolves to the same section.
   - The `:` in a collection-qualified topic is never mistaken for a section selector.
   - An unknown selector exits with code `1` and lists the available headings in the error detail.
   - An ambiguous heading exits with code `1` and reports the matching indices with copy-pasteable disambiguation commands.

5. **Error Handling**:
   - An unknown topic exits with code `1` with a one-line message. Because the SDK collection registers more than a thousand topics, the error never lists them: the detail reports how many are registered and names the three commands that find them (`specd guide-sdk --scope api`, `specd guide-sdk --meta`, `specd guide-sdk search "<query>"`). Structured formats carry the full candidate list under `metadata.availableTopics`, ordered so the entries most resembling the request come first, plus `metadata.availableTopicCount` for the total.
   - When a topic's identifier embeds its reflection kind, a caller who knows only the symbol name has no identifier to type. In that case the error names the canonical identifier of any topic titled exactly like the request and leads the available-topic list with it; structured formats carry the same value under `metadata.suggestedTopics`. The suggestion is never resolved silently, so the caller learns the identifier it holds is not the one to use.
   - Naming the wrong collection is the most common cause of an unknown generated topic, so a title match is still reported when it lives in another collection. The message says so (`That title exists in another collection: ...`) and `metadata.suggestionScope` reports `other-collection` or `requested-collection`, so the caller can tell a wrong collection from a wrong symbol.
   - `--section`, `--start-line`, and `--lines` address a document body, so they are rejected with code `1` when no topic is supplied rather than silently ignored.

---

## `specd guide-sdk search <query>`

Full-text BM25 search across every hand-written and generated SDK topic. Search spans document headings and section bodies, and returns line-numbered snippets.

### Arguments

| Argument  | Description                                                               |
| --------- | ------------------------------------------------------------------------- |
| `<query>` | Free-text search query. Case-insensitive, with prefix and fuzzy matching. |

### Options

| Option                        | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `--topic <topic>`             | Restrict results to specific topics. Accepts a bare topic or `collection:topic`. |
| `--collection <name>`         | Restrict results to a single collection.                                         |
| `--limit <n>`                 | Maximum number of results (default: `5`).                                        |
| `--snippet-lines <n>`         | Contextual lines before and after the match (default: `3`).                      |
| `--format <text\|json\|toon>` | Output format (default: `text`).                                                 |

Each result reports the collection-qualified topic, the section heading, the matched line range, the score, and a `readCommand` that opens the section directly. A hit on a generated API topic reports no source file, for the same reason `--meta` withholds it; a hit on a written document keeps reporting one.

### Identifier Matching

Search treats a code-shaped identifier as its constituent words, so a symbol name is reachable however the caller spells it. All of these find `FreshnessLatches`:

```bash
specd guide-sdk search "FreshnessLatches"    # PascalCase
specd guide-sdk search "freshnesslatches"    # lowercased
specd guide-sdk search "freshness latches"   # the words as prose
specd guide-sdk search "latches"             # one word of the name
```

Matching splits camelCase and PascalCase boundaries, separates an acronym run from a following capitalized word (`XMLError` matches `xml`), separates letter and digit boundaries, and treats separators and punctuation as term boundaries. A query tokenized to a single lowercased name still matches, because the identifier's joined form is indexed alongside its words. The same expansion selects which line the returned snippet is centred on, so an expanded query returns its matching line rather than the start of the section.

---

## Examples

```bash
# Bounded default listing (hand-written documents only)
specd guide-sdk

# Reveal the generated public API topics
specd guide-sdk --scope api --page-size 20

# Every document in one collection
specd guide-sdk --collection core

# Generated topics of one collection: scope and collection compose
specd guide-sdk --scope api --collection code-graph

# Metadata for a generated symbol, including the import to copy
specd guide-sdk code-graph:classes/GetGraphHealth --meta

# Catalog index: where every topic lives, with one hint to read any of them
specd guide-sdk --meta --page-size 20

# Pagination
specd guide-sdk --collection core --page 2 --page-size 10

# Retrieve a document and a nested example
specd guide-sdk core:ports
specd guide-sdk core:examples/implementing-a-port

# Retrieve a generated API symbol
specd guide-sdk sdk:classes/ArtifactDag

# A symbol name is not a topic identifier; the error names the right one
specd guide-sdk GetGraphHealth

# Inspect metadata without the body
specd guide-sdk core:ports --meta

# Extract a section by index, heading, or slug
specd guide-sdk core:ports --section 3
specd guide-sdk core:ports --section "Kernel composition surface"
specd guide-sdk core:ports --section repository-base-class

# Slice lines and prefix line numbers
specd guide-sdk core:ports --start-line 95 --lines 36 --line-numbers

# Search
specd guide-sdk search "dependency tracking" --collection code-graph
specd guide-sdk search "artifact dag" --limit 10 --format json

# Search by symbol name, however it is spelled
specd guide-sdk search "FreshnessLatches"
specd guide-sdk search "freshnesslatches"
specd guide-sdk search "freshness latches"
```

---

## Related

- [`specd guide`](./guide.md) — user-facing guide collection.
- [CLI User Guide](../guide/cli.md) — workflow-oriented recipes.
- [SDK Development Guide](../sdk/index.md) — the hand-written SDK references this command serves.
