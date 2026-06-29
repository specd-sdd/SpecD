# Graph Search

## Purpose

The code graph contains symbols with names and comments, and specs with titles, descriptions, and full content. Users and agents need to find relevant symbols and specs by concept or keyword without knowing exact names. The `specd graph search` command provides relevance-ranked search across both through the abstract code-graph search capabilities.

## Requirements

### Requirement: Command signature

```text
specd graph search <query> [--symbols] [--specs] [--documents] [--snippet] [--kind <kinds>] [--file <path>] [--workspace <name>] [--exclude-path <pattern>] [--exclude-workspace <name>] [--limit <n>] [--spec-content] [--config <path> | --path <path>] [--format text|json|toon]
```

- `<query>` — required; the search terms (supports multiple words, stemming via porter stemmer)
- `--symbols` — optional; search only symbols
- `--specs` — optional; search only specs
- `--documents` — optional; search only textual non-code resources
- `--snippet` — optional; include snippet previews in command output. In `text` mode it enables snippet blocks; in `json` and `toon` it enables the `snippet` field
- `--kind <kinds>` — optional; comma-separated symbol kinds filter such as `function,class,method`
- `--file <path>` — optional; filter symbols by file path (supports `*` wildcards, case-insensitive)
- `--workspace <name>` — optional; filter both symbols and specs to a single workspace
- `--exclude-path <pattern>` — optional, repeatable; exclude symbols/specs whose file path matches glob pattern (supports `*` wildcards, case-insensitive)
- `--exclude-workspace <name>` — optional, repeatable; exclude results from the given workspace
- `--limit <n>` — optional; maximum results per category, defaults to `10`
- `--spec-content` — optional; include full spec content in output. Only valid with `--format json` or `--format toon` — exits with code 1 if used with text format
- `--config <path>` — optional; explicit path to `specd.yaml`, matching the standard CLI meaning
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

`--config` and `--path` are mutually exclusive.

When no category flags (`--symbols`, `--specs`, `--documents`) are provided, all categories are searched.

All filters (`--kind`, `--file`, `--workspace`, `--exclude-path`, `--exclude-workspace`) are applied at the store level before LIMIT — not as post-query filters. The CLI passes them via `SearchOptions` to `CodeGraphProvider.searchSymbols` / `CodeGraphProvider.searchSpecs`.

`--path` and no-config fallback are bootstrap mechanisms for setup and early repository exploration, not the intended steady-state mode for configured projects.

Search ranking MUST prioritize primary identities at the top of the result set ahead of generic content-only matches. Exact canonical identity matches remain the strongest signal, but strong non-exact identity-oriented matches such as token-aware primary-name equality, identity-prefix matches, identity-suffix matches, identity-substring matches, and identity-segment/path-component matches MUST also outrank results that match only through generic body, comment, or document-content relevance.

### Requirement: Search behaviour

The command uses the shared graph CLI context model (`cli:graph-cli-context`) to resolve explicit config, autodetected config, or bootstrap mode before opening a `CodeGraphProvider` via `withProvider`.

Platform symbols MUST come from `@specd/sdk`.

It delegates to:

- `provider.searchSymbols(options)` — search across symbol search text and symbol comments
- `provider.searchSpecs(options)` — search across spec title, description, and content
- `provider.searchDocuments(options)` — search across document paths and textual content

The concrete scoring and indexing strategy are implementation concerns of the active graph-store backend. Results are returned ordered by score descending — highest relevance first — with primary-identity matches boosted ahead of generic content-only hits. Broad retrieval across backend-searchable fields remains in place; identity-aware logic changes ranking, not category coverage.

Backends MUST apply a shared specd/code-aware lexical token expansion before identity-aware ranking. That expansion MUST preserve the normalized original token and MUST additionally expand useful specd/code shapes such as:

- `core:change` into tokens including `core:change`, `core`, and `change`
- `ArchiveChange` into tokens including `archivechange`, `archive`, and `change`

Observable ranking semantics MUST hold across backends:

- exact canonical identity matches MUST rank ahead of every non-exact result in the same category
- exact primary-name matches for symbols and exact spec-id/path-component matches for specs/documents MUST rank ahead of body-only or comment-only hits
- exact token identity matches MUST rank ahead of prefix token matches
- prefix token matches MUST rank ahead of suffix token matches
- suffix token matches MUST rank ahead of arbitrary substring token matches
- real identity-component or path-component matches MUST rank ahead of arbitrary substring-only hits on the same identity field
- candidates matching more expanded identity tokens MUST rank ahead of candidates matching fewer expanded identity tokens when generic text relevance is otherwise competing
- prefix, suffix, substring, segment, or path-component matches on a primary identity MUST rank ahead of results that match only through generic textual frequency in descriptions, comments, or document/spec body content
- symbol results matching on declared identity MUST outrank otherwise stronger comment-only hits for the same query intent

Search results SHALL carry preview context together with the ranked hit, including the matched text and the 1-based line range (`startLine` to `endLine`) from the source content, even when text-mode snippet rendering is not requested.

Preview sources SHALL follow these rules:

- symbol previews SHALL be derived from persisted source-file content addressed through the symbol's file path and line location
- spec previews SHALL be derived from matched spec content when available, falling back to description context only when no better body excerpt is available
- document previews SHALL be derived from matched document content rather than from the beginning of the document

A symbol hit MAY be ranked because of symbol identity or attached comment text, but the preferred preview SHALL still be a code snippet around the symbol location unless no useful source snippet can be produced.

The `--kind` option SHALL accept exactly one comma-separated list value. Each token SHALL be trimmed and validated against the allowed `SymbolKind` values before the provider query is executed. Any invalid token SHALL cause a CLI error and SHALL prevent the search from running.

The validated kind list SHALL be passed to the query layer as a multi-kind filter rather than being collapsed to a single last value.

Before attempting to open the provider, the command SHALL check the shared graph indexing lock used by `graph index`. If indexing is currently in progress, the command SHALL fail fast with a short user-facing retry-later message instead of surfacing backend lock errors.

### Requirement: Output format

In `text` mode, results are grouped by category.

Text mode SHALL include a category header for each category that has results. The header SHALL make the active result limit explicit.

Format: `<Category> (<N> shown, limit <limit>):`
Example: `Symbols (10 shown, limit 10):`

Each result SHALL render as a compact identity block:

- the first line identifies the result entry (`[workspace]`, symbol/spec/document identity, and kind when applicable)
- a second line SHALL show location context for the result
- preview content SHALL render only when `--snippet` is explicitly passed

Default compact location context SHALL follow these rules:

- symbol results SHALL show the workspace-relative file path and the symbol line and column
- spec results SHALL show that the hit came from the spec and SHALL include the match line range derived from `startLine` and `endLine`
- document results SHALL show the config-relative document path and SHALL include the match line range derived from `startLine` and `endLine`

When `--snippet` is passed, preview content SHALL render in a separate snippet block preceded by a line range indicator.

Format: `snippet @ L<startLine>-L<endLine>:`
Example: `snippet @ L10-L15:`

To avoid collision with markdown formatting in the source text, snippets SHALL be wrapped in custom markers: `>>>` for the start and `<<<` for the end.

Before any snippet is rendered in text mode, the CLI SHALL sanitize terminal-control content. ANSI escape sequences and non-printable control characters other than newline and tab MUST NOT be emitted literally in the rendered snippet block.

Text-mode symbol snippets SHALL use line-oriented source context around the matched symbol location:

- include the matched line and a small window around it, with a baseline of 2-3 non-blank lines above and 2-3 non-blank lines below
- blank lines do not count toward the context budget
- preserve the original line order
- expand tabs to spaces using tab width 2 before indentation normalization
- compute the smallest common leading indentation across non-blank snippet lines
- remove that common leading indentation from every snippet line before rendering
- apply a fixed outer indent when rendering the snippet block

Text-mode spec and document snippets SHALL also be match-centered and rendered in a separate `snippet @ L<start>-L<end>:` block with `>>>` and `<<<` markers. They do not require code-specific indentation normalization beyond preserving readable literal text.

Text mode SHALL avoid misleading fixed-field truncation and SHALL NOT rely on raw boosted score magnitudes as the primary readability cue for exact matches.

When no results are found, output `No results found.`

In `json` or `toon` mode, output remains category-grouped as `{ symbols: [...], specs: [...], documents: [...] }`.

Structured output details:

- symbol entries include the symbol payload plus `workspace`, `score`, `startLine`, and `endLine`
- spec entries include `specId`, `path`, `title`, `description`, `workspace`, `score`, `startLine`, and `endLine`. Full spec `content` SHALL be omitted unless `--spec-content` is passed.
- document entries include `path`, `configRelativePath`, `workspace`, `score`, `startLine`, and `endLine`. Full document `content` SHALL be omitted.
- the `snippet` field SHALL be omitted from `json` and `toon` output unless `--snippet` is passed

### Requirement: Error cases

If the provider cannot be opened, the command exits with code 3 (same as other graph commands). The `process.exit(0)` pattern applies — LadybugDB native threads require explicit exit.

### Requirement: Command signature (filters)

The command accepts the following filter options applied at the store level:

- `--kind <kinds>` — filter symbols by kind (e.g., `class,method`)
- `--file <path>` — filter symbols by file path pattern (supports `*` wildcards)
- `--workspace <name>` — filter to a single workspace
- `--exclude-path <pattern>` — exclude symbols/specs matching the glob pattern
- `--exclude-workspace <name>` — exclude results from the given workspace

## Constraints

- The CLI does not contain search logic — it delegates to `CodeGraphProvider.searchSymbols`, `CodeGraphProvider.searchSpecs`, and `CodeGraphProvider.searchDocuments`
- Search depends on the active graph-store backend having prepared its search indexes during indexing or store maintenance
- The command checks the shared graph indexing lock before opening the provider and fails fast while indexing is in progress
- The `process.exit(0)` pattern is required after closing the provider

## Examples

```
$ specd graph search "hook execution"
Symbols (10 shown, limit 10):
  [core] method execute
    src/use-cases/run-step-hooks.ts:108:7
  ...

Specs (10 shown, limit 10):
  [core] core:hook-execution-model
    match @ L42-L48
  [cli] cli:change-run-hooks
    match @ L12-L18
  ...

$ specd graph search "hook execution" --snippet
Symbols (10 shown, limit 10):
  [core] method execute
    src/use-cases/run-step-hooks.ts:108:7
    snippet @ L105-L112:
      >>>
      execute(...) {
        ...
      }
      <<<
  ...

$ specd graph search "Change" --documents
Documents (10 shown, limit 10):
  [default] docs/cli/cli-reference.md
    match @ L80-L88
  ...
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`cli:graph-cli-context`](../graph-cli-context/spec.md) — shared graph context and provider lifecycle
- [`core:config`](../../core/config/spec.md) — bootstrap vs configured mode
- [`code-graph:composition`](../../code-graph/composition/spec.md) — `CodeGraphProvider` facade
- [`code-graph:document-model`](../../code-graph/document-model/spec.md) — defines document node category
- [`code-graph:graph-store`](../../code-graph/graph-store/spec.md) — abstract graph-store search capabilities
