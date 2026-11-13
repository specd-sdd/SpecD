# CLI Guide SDK Command

## Purpose

Extension developers and integrators working in external repositories have no offline, token-efficient way to discover the `@specd/sdk` public surface, the extension contracts it re-exports, or the package-reference documentation that describes them. `specd guide` serves the end-user CLI guide and cannot host developer-internal material, which the global documentation convention explicitly forbids. This spec defines the `specd guide-sdk [topic]` command and its `search` subcommand in `@specd/cli` as a delivery adapter over a dedicated SDK collection served by `@specd/guide`, together with the structured discovery field that points users from `specd guide` to it.

## Requirements

### Requirement: Guide SDK Catalog Listing Command

Running `specd guide-sdk` without a topic argument MUST display a catalog of the available SDK guide topics:

- The listing MUST be scoped and paginated so that the volume of generated API topics does not make the unfiltered listing unusable. The command MUST accept a `--scope` option selecting the kind of topic (`docs` for hand-written topics, `api` for generated API topics across all collections, or `all` for both), a `--collection` option selecting a single collection (`sdk`, `core`, `code-graph`, `skills`, `schemas`), and pagination options bounding the number of returned entries.
- When no `--scope` is supplied, the command MUST NOT return generated API topics, so that the default listing remains comparable in size to the `specd guide` catalog. The command MUST make this suppression discoverable rather than silent: the listing MUST report how many generated API topics are being withheld and MUST name `--scope api` as the way to reveal them.
- `--scope` and `--collection` MUST be independent dimensions that compose, so that `--scope api --collection code-graph` returns only the generated code-graph topics. Neither option MUST shadow or override the other.
- Each listed entry MUST include `collection`, `topic`, `title`, `description` and `order`.
- Ordering MUST be scoped per collection: entries MUST be grouped by `collection`, and within a collection ordered by ascending `order`, with ties broken alphabetically by `topic` using locale-sensitive comparison. A listing spanning several collections MUST NOT present those collections as one indistinguishable run of entries.
- When output format is `text`, the listing MUST be rendered as an organized, readable table or topic list. It MUST delimit the entries of each collection so that a reader can tell where one collection ends and the next begins, and it MUST report the page position as `page N of M` together with the returned and total entry counts whenever the catalog spans more than one page. When the catalog fits in a single page, the page position MUST be omitted rather than reported as `page 1 of 1`.
- When output format is `json` or `toon`, the command MUST output a structured object with a `topics` member holding the guide topic summaries for the returned page, and a `pagination` member carrying `page`, `pageSize`, `returned`, `total` and `totalPages`. It MUST additionally carry a `collections` member summarising, per collection included in the result, its `collection`, `total` and `firstPage`/`lastPage` range, so that a consumer can locate any topic without walking every page. This envelope MUST be the same shape the sibling `specd guide` listing uses.

### Requirement: Guide SDK Scope Validation

The command MUST validate `--scope` and `--collection` against their documented value sets rather than treating an unrecognised value as an empty result:

- An unrecognised `--scope` value MUST exit with code 1 and the error code `INVALID_GUIDE_SCOPE`.
- An unrecognised `--collection` value MUST exit with code 1 and the error code `INVALID_GUIDE_COLLECTION`, so that a caller can tell which of the two independent flags was wrong.
- The error MUST report the rejected value and MUST list the valid values of the flag that was rejected.
- Because a collection is no longer a scope, an error for a value that names a collection MUST point the caller at `--collection` rather than leaving them to guess which flag accepts collections.
- An unrecognised value MUST NOT be reported as success, and MUST NOT be conflated with a valid value that legitimately matches no topic.

### Requirement: Guide SDK Generated Topics Report An Actionable Import

A generated API topic documents a symbol a caller must import from a published package, so its metadata MUST carry the information needed to reach that symbol rather than only the location of the declaration inside this repository:

- The metadata of a generated API topic MUST carry the published package the symbol is imported from and a copy-pasteable import statement naming that package.
- Interfaces and type aliases MUST be imported type-only, because they have no value form; classes, enumerations, functions and variables MUST be imported by value, because a type-only import of a value cannot be called or constructed.
- The source path of a declaration MUST NOT appear in the public output of a generated API topic, in the body or in any metadata format. A caller consuming the SDK does not have this repository's tree, so a path is unreachable for them and invites an agent to look for a file that is not there; the import statement is what actually reaches the symbol.
- A hand-written topic MUST continue to report its source path, because that path is the only thing telling a reader where the content came from, and MUST omit the published package and import statement rather than reporting them as null, because a hand-written document does not document an importable symbol.
- The generated topic body MUST surface the same import statement, so that a caller reading the body does not have to request `--meta` to learn how to import the symbol.

### Requirement: Guide SDK Generated Topics Document The Call Shape

A generated API topic is the only view of a symbol a caller without code access will get, so it MUST describe how the symbol is used rather than only asserting that it exists:

- The body MUST carry the declaration's own signature, including its parameters and return type, because a name and a summary do not tell a caller whether a function takes arguments or returns anything.
- A class MUST document its constructor with its parameter list, and its methods with their parameters and return types, because those are what a caller constructs and invokes.
- An interface MUST document its methods with their parameters and return types. An interface declaring only signatures and no fields is the shape a port or a provider takes, so omitting the methods documents it as a bare name and leaves a caller with nothing to implement.
- An interface or object-shaped type alias MUST document its fields with their types, marking which are optional, because a caller cannot build a value without knowing the shape.
- A symbol's own documentation MUST be reproduced as its author wrote it. A comment reaches the generator as a sequence of inline runs of one paragraph, and an inline code span or link is a run of its own, so the runs MUST be rejoined using the spacing they carry rather than separated or trimmed; otherwise `a ` + "`run:`" + ` hook` is rendered as three paragraphs instead of one sentence.
- A re-exported symbol MUST be documented in full under every collection that re-exports it. Deciding which declarations count as this project's own MUST be judged against every package of the workspace rather than against the collection the topic belongs to, because a re-exported declaration carries the paths of the package that declares it, and judging it against one package discards the symbol's whole body.
- A getter MUST be documented as a field carrying its return type. A getter keeps its type on its accessor signature rather than on the member itself, so a topic that reads only the member's own type MUST NOT silently omit it.
- The body MUST carry a `Usage` section containing an example. When the declaration documents an `@example`, that example MUST be used verbatim, preserving its own line structure and any fence it already carries. Otherwise a skeleton MUST be derived mechanically from the signature, binding the declared parameter names, because inventing example values would assert behaviour the declaration does not document.
- The body MUST carry a `Related types` table linking every referenced type the catalog documents. A type name reached through more than one collection MUST link to the collection that declares it rather than to whichever collection re-exports it, because the declaring collection is the one that owns the symbol's documentation. A name that cannot be told apart MUST be left unlinked rather than guessed at.
- Referenced types that the catalog does not document MUST be left as plain type names, because an unresolved name is still accurate and a wrong link is worse than none.

### Requirement: Guide SDK Generated Topics Exclude Members Inherited From The Standard Library

A generated topic MUST document the members its package declares rather than the members it inherits from the standard library:

- TypeDoc resolves the full inheritance chain, so every class also carries the members it inherits from the standard library's built-in error and object types. A topic MUST NOT document a member whose declaration lies outside every package of this repository, because such a member applies to any JavaScript value and says nothing about the symbol being documented.
- The exclusion MUST be limited to the standard library. A member declared in any package of this workspace MUST be kept, even when the symbol is reached through a collection that re-exports it rather than declaring it.
- A member whose declaration TypeDoc does not report MUST be retained. The absence of a recorded source is not evidence of a foreign declaration, and dropping such a member would silently hide a real one.
- The filtering MUST apply consistently to every section that reads members, including fields, methods and related-type links, so that a member excluded from the field table cannot reappear as a related type.

### Requirement: Guide SDK Generated Markdown Is Formatted Consistently

Generated Markdown MUST be formatted with the repository's own Prettier configuration, so that a generated topic is visually indistinguishable from a hand-written one:

- Generated topic bodies MUST be formatted with the repository's Prettier config resolved at build time, rather than with a configuration hardcoded in the generator.
- Formatting MUST NOT alter the documented content: table cell contents, section headings and the import statement MUST survive formatting unchanged.
- Formatting MUST be best-effort. A body Prettier cannot parse MUST be emitted unchanged rather than failing the bundle, because losing the whole catalog over one malformed body is a worse outcome than one unformatted topic.
- Hand-written topics MUST NOT be reformatted by the generator, because rewriting committed prose the generator does not own would create diffs no author made.

### Requirement: Guide SDK Catalog Index

The command MUST support `--meta` without a topic argument as a catalog index, giving a caller an overview of the catalog and the location of each topic rather than silently falling back to the plain listing:

- The index MUST report, per collection, the number of topics it contains and the page range those topics occupy under the active `--page-size`, so that the boundaries between collections and the extent of each are visible without listing every topic.
- The index MUST report, per topic, the page it starts on together with its line count, byte length, scope and title.
- The index MUST carry a single retrieval hint rather than a per-topic retrieval command. The hint MUST be the literal string `specd guide-sdk <topic>`, where `<topic>` stands for a value the caller copies from the listing, and each index entry MUST print its topic as the fully qualified `collection:topic` identifier so that the copied value needs no rewriting. A per-topic command repeats the same information on every row without informing the caller of anything the row does not already show, so the index MUST NOT carry one per topic.
- The index MUST be subject to the same `--scope` and pagination semantics as the catalog listing, so that it remains bounded by default.
- `--meta` combined with a topic argument MUST continue to return that single topic's metadata and outline.

### Requirement: Guide SDK Listing And Index Entries Report Their Scope

Every listed or indexed topic MUST report the scope it belongs to, so that a consumer can tell hand-written guidance from generated API reference without inferring it from the topic's shape:

- An entry MUST carry a `scope` of either `docs` or `api`.
- A hand-written topic MUST report `docs` and a generated API topic MUST report `api`.
- The scope MUST be present under every supported output format, both in the row itself and in the structured envelope, because a consumer that cannot see the scope cannot tell whether a catalog is complete.
- This is distinct from the topic's `collection`: the collection records which package the topic documents, while the scope records how the topic was produced. A generated topic in the `code-graph` collection has the scope `api` and the collection `code-graph`.

### Requirement: Guide SDK Topic Inspection Command

Running `specd guide-sdk <topic>` MUST retrieve and display the content of the specified topic from the SDK collection:

- Topics MUST be addressed as `collection:topic` (e.g. `sdk:index`, `core:ports`, `core:examples/implementing-a-port`).
- Every generated API symbol MUST be individually addressable as a topic (e.g. `sdk:classes/ArtifactDag`), and MUST support the same `--section`, `--start-line`, `--lines` and `--line-numbers` behaviour as a hand-written topic.
- The command MUST normalize the requested topic the same way the SDK collection resolves topics: trimming surrounding whitespace, stripping a trailing `.md` extension, and lowercasing.
- When an unknown topic is requested, the command MUST report the topic as not found and exit with code 1, pointing at the commands that can find it rather than quoting the catalog.

### Requirement: Guide SDK Unknown Topic Suggests A Title Match

A topic identifier is not always what the caller knows, so an unknown topic MUST be answered with the canonical identifier when the catalog holds a topic titled exactly like the request:

- A generated API topic's identifier embeds its reflection kind (`code-graph:classes/GetGraphHealth`), so a caller who knows the symbol `GetGraphHealth` has no identifier to type. The error MUST name the canonical identifier of any topic whose title equals the requested topic, comparing titles case-insensitively against the request's final path segment, so that a kind directory in the request (`classes/StubError`) does not prevent the match.
- The suggestion MUST be reported in the error message, MUST lead the available-topic list, and MUST be reported under structured formats as its own field distinct from the available-topic list.
- A title match MUST be reported as a suggestion and MUST NOT resolve the request. Resolving silently would return a document the caller did not name, and the caller would not learn that the identifier they hold is not the identifier to use.
- Naming a collection the topic is not in is the most common cause of an unknown generated topic, so a request that names a collection MUST still be offered a title match from another collection. The message MUST distinguish that case from a match inside the named collection, and structured output MUST report which of the two applied, so that a caller can tell a wrong collection from a wrong symbol.
- When no title matches the request, the error MUST carry no suggestion.

### Requirement: Guide SDK Unknown Topic Does Not Enumerate The Catalog

The generated catalog holds over a thousand topics, so an unknown-topic error MUST stay short enough to read at a glance:

- The error message MUST NOT list topics. A truncated window of identifiers names neither what the caller wanted nor how to find it, and buries the cause under hundreds of lines.
- The error detail MUST report how many topics are registered and MUST name the commands that find them: the listing, the metadata index, and search.
- The complete candidate list MUST remain available to structured callers as a distinct field, ordered so that the entries most resembling the request come first, because a caller that does want to enumerate should not have to re-rank the list itself.
- The candidate count MUST be reported separately under structured formats so that a caller can tell how much was withheld without measuring the list.

### Requirement: Guide SDK Search Matches Identifier Constituents

The search subcommand MUST match code-shaped identifiers by their constituent words, because the identifiers a caller searches for are symbol names rather than prose:

- The index MUST tokenize every indexed field with the same rules the query is tokenized with, so that a document titled `FreshnessLatches` is reachable by `FreshnessLatches`, by `freshnesslatches`, by `freshness latches`, and by a single word of it such as `latches`.
- Tokenization MUST split camelCase and PascalCase boundaries, separate an acronym run from a following capitalized word, separate letter and digit boundaries, and treat non-alphanumeric separators as term boundaries.
- Tokenization MUST emit the identifier's joined lowercase form alongside its words. A caller who lowercases a symbol name produces a single term that no split term could satisfy, so the joined form is what keeps that query reachable.
- Splitting MUST apply to the selection of the snippet's match line as well as to result ranking, so that an expanded query returns a snippet centred on the matching line rather than on the start of the section.

### Requirement: Guide SDK Body Flags Require a Topic

`--section`, `--start-line` and `--lines` address a document body and MUST be rejected when no topic argument is supplied, instead of being accepted and ignored:

- The command MUST exit with code 1 and MUST report which flags require a topic argument.
- The command MUST NOT render a catalog listing when these flags are supplied without a topic, because doing so silently discards the caller's request.

### Requirement: Guide SDK API Surface Visibility Note

Because generated API topics are withheld by default, the command MUST make that suppression visible at the point of discovery:

- `--help` MUST state that generated API topics are hidden by default and MUST name `--scope api` as the way to reveal them.
- The catalog listing MUST report the number of withheld generated API topics and the command that reveals them, in the same field that carries it under structured formats.

### Requirement: Guide SDK Topic Metadata Inspection

The command MUST support a `--meta` option that outputs only the topic's structured metadata (title, description, order, line count, byte length, collection, scope, and outline) without the document body.

### Requirement: Guide SDK Section Extraction

The command MUST accept a `--section` option to extract a single section by 1-indexed numeric index or by heading text:

- Numeric selection MUST be detected when the trimmed value consists solely of digits.
- Text selection MUST be case-insensitive and whitespace-tolerant, MUST support kebab-case slugs, and MUST throw `GuideSectionNotFoundError` when no section matches.
- When multiple sections share the requested heading, the command MUST report the ambiguity and MUST instruct the caller to disambiguate by section index.

### Requirement: Guide SDK Line Window Slicing

The command MUST accept `--start-line` and `--lines` options to return a bounded window of the topic body, and `--line-numbers` to prefix each returned line with its right-aligned 1-indexed line number.

### Requirement: Guide SDK Search Subcommand

Running `specd guide-sdk search <query>` MUST perform a BM25 full-text search across the SDK collection:

- The search MUST cover generated API topics as well as hand-written package-reference topics.
- The search MUST accept `--topic`, `--limit` and `--snippet-lines` options with the same semantics as `specd guide search`.
- Each hit MUST report the collection-qualified topic, the matched section and its line span, and a `readCommand` that invokes the command matching that collection (e.g. `specd guide-sdk sdk:classes/ArtifactDag --section 3`).
- A hit on a generated API topic MUST withhold `file`, because the declaration it was extracted from lives inside this repository and the caller cannot open it; a hit on a hand-written document MUST keep reporting it. A search result that names the declaration while `--meta` withholds it would leave the caller with a path in one command and without it in the other.
- An empty or whitespace-only query MUST return an empty result set immediately.
- A zero or negative `--limit` MUST fall back to a safe default limit.

### Requirement: Guide SDK Output Formats

The command MUST support the same `--format` values as `specd guide` (`text`, `json`, `toon`):

- Successful output MUST be written to stdout and errors MUST be written to stderr, including under structured formats.
- Under `--format json` or `--format toon`, successful output MUST be valid structured output and MUST NOT be preceded by human-readable text.
- The command help MUST document the JSON and TOON envelope shapes for catalog listings, topic metadata, search results, and errors, including the stable fields a machine consumer can rely on.

### Requirement: SDK Guide Discovery Field

The `specd guide` catalog listing MUST surface the sibling SDK guide so that users who do not know the command can find it:

- The field MUST be a structured field present in every supported `--format` value (`text`, `json` and `toon`), MUST NOT be a text-only footer.
- The field MUST identify the SDK guide by the exact command name `specd guide-sdk`.
- The existing `specd guide` contract for `topic`, `title`, `description` and ordering MUST remain unchanged.

### Requirement: Command Registration

The CLI MUST register `guide-sdk` as a top-level command alongside `guide`:

- The command MUST be resolvable as `specd guide-sdk` and MUST appear in root help output.
- The command MUST use the SDK collection's dedicated `GuideEngine` instance, loaded through the `@specd/guide/sdk` subpath, so that the user guide's catalog is not loaded when serving the SDK guide.
- The command MUST participate in the standard configuration discovery, output routing and exit-code behaviour of every other top-level command.

### Requirement: Error Mapping

The command MUST map guide domain errors to stable CLI error codes and exit code 1:

- An unknown topic MUST map to `UNKNOWN_GUIDE_TOPIC`.
- A missing section MUST map to `UNKNOWN_GUIDE_SECTION`.
- An ambiguous duplicate section heading MUST map to `AMBIGUOUS_GUIDE_SECTION`.
- Expected guide failures MUST use the standard CLI rendering `error: [<CODE>] <message>`; the command MUST NOT introduce a guide-specific error prefix.
- Human-facing unknown-topic output MUST add bounded guidance for the `guide-sdk` listing, metadata index, and search operations without enumerating the catalog; structured output MUST retain the complete candidate data carried by the domain error.
- `specd guide-sdk` MUST NOT collide with the `search` subcommand: the command name and its `search` subcommand MUST coexist without ambiguous parsing.

## Constraints

- The command MUST delegate all catalog, outline, section, line-window and search behaviour to `@specd/guide`, and MUST NOT reimplement query logic in `@specd/cli`.
- The command MUST NOT accept a `--collection` flag that alters `specd guide`; the two commands MUST remain separate invocations.
- `specd guide-sdk` output volume MUST remain bounded by default; an unbounded listing of all generated API topics is non-conforming.

## Spec Dependencies

- [`cli:entrypoint`](../../../../specs/cli/entrypoint/spec.md) — top-level command registration, configuration discovery, output routing and exit codes
- [`default:_global/docs`](../../../../specs/default/_global/docs/spec.md) — documentation obligations for CLI commands and SDK integrator material
- [`guide:composition`](../../../../specs/guide/composition/spec.md) — engine factory and the SDK collection instance
- [`guide:guide-model`](../../../../specs/guide/guide-model/spec.md) — `GuideTopic`, `GuideSummary` and collection-qualified identity
- [`guide:bundle-guides`](../../../../specs/guide/bundle-guides/spec.md) — compilation of the SDK collection and its generated topics
- [`cli:guide`](../../../../specs/cli/guide/spec.md) — the sibling user-guide command whose catalog listing gains the discovery field
