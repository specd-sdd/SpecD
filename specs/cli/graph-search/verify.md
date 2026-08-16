# Verification: Graph Search

## Requirements

### Requirement: Command signature

#### Scenario: Search both categories by default

- **WHEN** `specd graph search "hook execution"` is run
- **THEN** both symbol and spec results are returned

#### Scenario: Search symbols only

- **WHEN** `specd graph search "transition" --symbols` is run
- **THEN** only symbol results are returned
- **AND** no spec results are shown

#### Scenario: Search specs only

- **WHEN** `specd graph search "workspace" --specs` is run
- **THEN** only spec results are returned
- **AND** no symbol results are shown

#### Scenario: Custom limit

- **WHEN** `specd graph search "hook" --limit 3` is run
- **THEN** at most 3 symbols and 3 specs are returned

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph search "kernel" --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly

#### Scenario: Explicit path enters bootstrap mode

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph search "kernel" --path /tmp/repo` is run
- **THEN** config discovery is ignored
- **AND** the command searches a synthetic single workspace `default` rooted at `/tmp/repo`

#### Scenario: Search supports document filter

- **WHEN** `specd graph search "ADR" --documents` is run
- **THEN** the command successfully executes
- **AND** it passes the document category filter to the graph provider

#### Scenario: Snippet flag enables preview emission

- **WHEN** `specd graph search "hook" --snippet` is run
- **THEN** the command includes snippet previews in its output
- **AND** omitting `--snippet` keeps previews out of the rendered payload by default

#### Scenario: Identity-oriented partial query still prefers the intended result

- **GIVEN** a spec with canonical identity `default:_global/architecture`
- **AND** other specs contain the word `architecture` more times in their body content
- **WHEN** `specd graph search "architecture" --specs` is run
- **THEN** the identity-oriented target ranks ahead of results whose match is body-content frequency only

#### Scenario: Files category is distinct from file-path filter

- **WHEN** `graph search "needle" --files --file "src/*.ts"` is run
- **THEN** only indexed source-content results matching the path filter are requested
- **AND** `--files` is not interpreted as a path filter

#### Scenario: Default request includes four categories

- **WHEN** no category flag is supplied
- **THEN** symbols, files, specs, and documents are selected in one request

#### Scenario: CLI delegates one unified request

- **GIVEN** several category flags, filters, a limit, and snippet preference
- **WHEN** the command executes
- **THEN** the CLI sends all inputs in exactly one Code Graph search call
- **AND** it does not pre-limit or combine category responses

#### Scenario: Exact file selector accepts every supported path form

- **GIVEN** one indexed source file
- **WHEN** `--file` receives its canonical workspace path, config-relative path, or absolute path
- **THEN** each form selects the same one file
- **AND** a wildcard selector retains pattern semantics

### Requirement: Search behaviour

#### Scenario: Results ranked by relevance

- **GIVEN** specs `hook-execution-model` (contains `hook execution` many times) and `architecture` (contains `hook` once)
- **WHEN** `specd graph search "hook execution"` is run
- **THEN** `hook-execution-model` appears before `architecture`
- **AND** the higher-ranked result has the stronger relevance score

#### Scenario: Search matches symbol comments

- **GIVEN** a symbol with comment containing `executing the workflow hook`
- **WHEN** `specd graph search "execution"` is run
- **THEN** the symbol may be returned by the active backend's search implementation

#### Scenario: Multi-word query matches across fields

- **GIVEN** a spec with title `Workspace Integration` and content containing `import resolution`
- **WHEN** `specd graph search "workspace import"` is run
- **THEN** the spec is returned

#### Scenario: No results

- **WHEN** `specd graph search "xyznonexistent"` is run
- **THEN** `No results found.` is output

#### Scenario: Missing config falls back to bootstrap mode

- **GIVEN** no `specd.yaml` is found by autodiscovery
- **WHEN** `specd graph search "kernel"` is run inside a repository
- **THEN** the command searches in bootstrap mode against the resolved VCS root as workspace `default`

#### Scenario: Multiple kinds are passed through to the query layer

- **WHEN** `specd graph search "transition" --kind class,method,function` is run
- **THEN** the command trims and validates all three kind tokens
- **AND** the provider receives the full kind list rather than only the last token

#### Scenario: Invalid kind token fails before query execution

- **WHEN** `specd graph search "transition" --kind method,unknownKind"` is run
- **THEN** the command exits with code 1
- **AND** the search query is not executed

#### Scenario: Search surfaces provider busy after open

- **GIVEN** the provider reports `GRAPH_BUSY` while serving the search request
- **WHEN** `specd graph search "kernel"` is run
- **THEN** the command exits with code 3 through the standard infrastructure error path
- **AND** it does not query a host-managed pre-open lock state

#### Scenario: Search delegates document queries to the provider

- **WHEN** `specd graph search "Change" --documents` is run
- **THEN** the command delegates to `CodeGraphProvider.searchDocuments`
- **AND** it does not implement document ranking or matching logic in the CLI

#### Scenario: Symbol hit from comment still uses code snippet preview

- **GIVEN** a symbol is returned because its attached comment matches the query
- **WHEN** `specd graph search` renders the symbol result
- **THEN** the preview is derived from source-file content around the symbol location
- **AND** the preview is not limited to a truncated comment excerpt

#### Scenario: Spec preview comes from body content when body content drives the hit

- **GIVEN** a spec result matches because of text in spec body content rather than only in the description
- **WHEN** `specd graph search` renders the spec result
- **THEN** the preview is derived from matched spec body content
- **AND** the preview is not forced to the description field

#### Scenario: Document preview is centered on the best textual match

- **GIVEN** a document contains the best match far from the start of the file
- **WHEN** `specd graph search` renders the document result
- **THEN** the preview is centered around the matched text
- **AND** it is not rendered from the beginning of the file unless the beginning contains the best match

#### Scenario: Search results include 1-based line range metadata

- **WHEN** a search result is returned in `json` or `toon` mode
- **THEN** the entry includes `startLine` and `endLine` fields
- **AND** the values represent the 1-based line range of the snippet in the source content

#### Scenario: Spec-id segment outranks body-only hits

- **GIVEN** a spec with identity `default:_global/architecture`
- **AND** another spec contains the word `architecture` more times in its body content
- **WHEN** `specd graph search "architecture" --specs` is run
- **THEN** `default:_global/architecture` ranks ahead of the body-only hit

#### Scenario: Symbol declared name outranks comment-only hit

- **GIVEN** one symbol is named `SearchSpecs`
- **AND** another symbol mentions `search specs` only in its comment text
- **WHEN** `specd graph search "SearchSpecs" --symbols` is run
- **THEN** the declared-name hit ranks ahead of the comment-only hit

#### Scenario: Document path component outranks body-only hit

- **GIVEN** one document path contains `graph-search`
- **AND** another document mentions `graph search` only in its body text
- **WHEN** `specd graph search "graph-search" --documents` is run
- **THEN** the path-identity hit ranks ahead of the body-only hit

#### Scenario: Search expands specd-shaped query tokens before identity-aware ranking

- **GIVEN** a spec with identity `core:change`
- **AND** another spec mentions `core change` only in body content
- **WHEN** `specd graph search "core:change" --specs` is run
- **THEN** the backend may use tokens including `core:change`, `core`, and `change`
- **AND** the spec-id hit ranks ahead of the body-only hit

#### Scenario: Search expands CamelCase query tokens before identity-aware ranking

- **GIVEN** a symbol named `ArchiveChange`
- **AND** another symbol mentions `archive change` only in comment text
- **WHEN** `specd graph search "ArchiveChange" --symbols` is run
- **THEN** the declared-name hit ranks ahead of the comment-only hit

#### Scenario: Exact token identity match outranks prefix token match in rendered results

- **GIVEN** one visible result matches token `change` exactly in identity
- **AND** another visible result matches `change` only by prefix in identity
- **WHEN** `specd graph search "change"` is run
- **THEN** the exact-token hit is shown before the prefix-only hit

#### Scenario: Prefix token identity match outranks suffix token match in rendered results

- **GIVEN** one visible result matches token `repo` by prefix in identity
- **AND** another visible result matches `repo` only by suffix in identity
- **WHEN** `specd graph search "repo"` is run
- **THEN** the prefix-token hit is shown before the suffix-only hit

#### Scenario: Suffix token identity match outranks arbitrary substring token match in rendered results

- **GIVEN** one visible result matches token `repository` by suffix in identity
- **AND** another visible result matches `repository` only as an arbitrary identity substring
- **WHEN** `specd graph search "repository"` is run
- **THEN** the suffix-token hit is shown before the arbitrary-substring hit

#### Scenario: Real identity component outranks arbitrary substring in rendered results

- **GIVEN** one visible result has identity component `core`
- **AND** another visible result contains substring `core` only inside a larger token such as `score`
- **WHEN** `specd graph search "core"` is run
- **THEN** the real identity-component hit is shown before the arbitrary-substring hit

#### Scenario: Search uses SDK graph context

- **WHEN** `specd graph search` is executed
- **THEN** it resolves context via `resolveGraphCliContext` and opens via `withProvider`
- **AND** platform symbols are sourced from `@specd/sdk`

#### Scenario: Shared query plan preserves multi-word intent

- **GIVEN** a query containing several whitespace terms and a CamelCase or separator-shaped token
- **WHEN** unified search builds its plan
- **THEN** it preserves the normalized complete query, raw terms, and expanded components
- **AND** contiguous full-query matches outrank all-raw-term, individual-raw-term, and expanded-only matches

#### Scenario: Declaration occurrence is suppressed but body matches remain

- **GIVEN** a returned symbol whose declared name matches the query
- **AND** the same file also contains the query in a call, string, comment, or function body
- **WHEN** file occurrences are grouped
- **THEN** only the occurrence overlapping that symbol's declared-name `selectionRange` is suppressed
- **AND** occurrences elsewhere in the complete construct range remain in the file result

#### Scenario: A fully represented file result disappears

- **GIVEN** every matching occurrence in a file is a returned symbol declaration for the same query
- **WHEN** cross-category suppression runs
- **THEN** the file is omitted
- **AND** its suppressed hits do not consume the file-category limit

#### Scenario: Symbol omitted by the limit does not suppress its file occurrence

- **GIVEN** more symbol groups match than the requested symbol-category limit
- **AND** a declaration occurrence belongs only to a symbol group omitted by that limit
- **WHEN** cross-category suppression runs
- **THEN** the omitted symbol group does not suppress the occurrence
- **AND** the matching source file remains eligible for the file-category result

#### Scenario: Source matching uses indexed content only

- **WHEN** unified source search verifies and groups exact occurrences
- **THEN** it uses persisted FileNode content and Store candidates
- **AND** it does not read live files or scan the repository with a delivery-layer tool

#### Scenario: Code Graph owns all cross-category semantics

- **WHEN** unified search executes through the provider
- **THEN** Code Graph expands, merges, suppresses, ranks, groups, and applies final limits
- **AND** the CLI performs none of those operations

#### Scenario: General matches are ranked before the per-file cap

- **GIVEN** one file has more than ten early expanded-token occurrences and a later full-query occurrence after symbol suppression
- **WHEN** a general or wildcard-path search runs
- **THEN** the retained matches place the full-query occurrence before raw-token and expanded-token occurrences
- **AND** source range orders matches within each relevance tier
- **AND** `totalMatches` and `omittedMatches` describe the complete visible set before capping

#### Scenario: Later candidate page can win the final file limit

- **GIVEN** an early backend page fills the requested file limit with expanded-token-only matches
- **AND** a later page contains a full-query or all-raw-terms file match
- **WHEN** Code Graph produces final file results
- **THEN** it evaluates all required candidate pages before limiting
- **AND** the later stronger match displaces a weaker early candidate

#### Scenario: Exact single-file matches remain exhaustive source inspection

- **GIVEN** one exact file selector resolves to a file with more than ten visible occurrences across several match kinds
- **WHEN** source-content search runs
- **THEN** every visible occurrence is returned
- **AND** the matches are ordered by source range rather than relevance tier

### Requirement: Error cases

#### Scenario: Provider cannot be opened exits with code 3

- **WHEN** the provider fails to open
- **THEN** the command exits with code 3

#### Scenario: Provider busy or stale exits with code 3

- **WHEN** the provider reports `GRAPH_BUSY` or `GRAPH_PROVIDER_STALE` while serving the search request
- **THEN** the command exits with code 3 through the standard infrastructure error path

### Requirement: Output format

#### Scenario: Text output groups by category

- **WHEN** results include both symbols and specs in text mode
- **THEN** symbols are listed under a category header
- **AND** specs are listed under a category header
- **AND** each result renders identity separately from snippet content

#### Scenario: Text output omits snippet blocks by default

- **WHEN** `specd graph search "hook"` is run in text mode without `--snippet`
- **THEN** each visible result remains a compact identity block
- **AND** no snippet block is rendered
- **AND** location metadata remains visible for each result

#### Scenario: Text output renders snippets when requested

- **WHEN** `specd graph search "hook" --snippet` is run in text mode
- **THEN** visible results may include snippet blocks
- **AND** the location metadata still appears alongside the result identity

#### Scenario: Category headers show explicit limits in text mode

- **WHEN** `specd graph search \"hook\" --limit 5` is run in text mode
- **THEN** the `Symbols` header matches `Symbols (N shown, limit 5):`
- **AND** the `Specs` header matches `Specs (M shown, limit 5):`

#### Scenario: JSON output includes workspace and scores but excludes full content

- **WHEN** `specd graph search \"hook\" --format json` is run
- **THEN** output is `{\"symbols\":[...],\"specs\":[...],\"documents\":[...]}`
- **AND** each entry includes a `workspace` field and a `score` field
- **AND** each entry includes `startLine` and `endLine` fields
- **AND** no entry includes a `snippet` field unless `--snippet` was passed
- **AND** spec entries include `specId`, `path`, `title`, `description` but NOT `content`
- **AND** document entries include `path`, `configRelativePath` but NOT `content`

#### Scenario: JSON output includes snippet only when requested

- **WHEN** `specd graph search "hook" --format json --snippet` is run
- **THEN** visible result entries include a `snippet` field
- **AND** the entries still include `startLine` and `endLine`

#### Scenario: Toon output omits snippet unless requested

- **WHEN** `specd graph search "hook" --format toon` is run without `--snippet`
- **THEN** visible result entries omit the `snippet` field
- **AND** the entries still include `startLine` and `endLine`

#### Scenario: Toon output includes snippet when requested

- **WHEN** `specd graph search "hook" --format toon --snippet` is run
- **THEN** visible result entries include a `snippet` field
- **AND** the entries still include `startLine` and `endLine`

#### Scenario: JSON with --spec-content includes full spec content

- **WHEN** `specd graph search \"hook\" --format json --spec-content` is run
- **THEN** spec entries include a `content` field with the full spec text
- **AND** spec entries omit the `snippet` field unless `--snippet` is also passed

#### Scenario: --spec-content with text format fails

- **WHEN** `specd graph search \"hook\" --spec-content` is run (text format)
- **THEN** the command exits with code 1
- **AND** an error message explains that `--spec-content` requires `--format json` or `--format toon`

#### Scenario: Text output shows workspace in brackets

- **WHEN** results are displayed in text mode
- **THEN** each result shows `[workspace]` before the identity

#### Scenario: Text output groups document results separately

- **GIVEN** document search returns one or more matching documents
- **WHEN** `specd graph search \"Change\"` is run in text mode
- **THEN** stdout contains a `Documents (` section
- **AND** each document result shows the owning workspace and match location metadata without requiring a snippet block

#### Scenario: Structured output includes documents array

- **GIVEN** document search returns one or more matching documents
- **WHEN** `specd graph search \"Change\" --format json` is run
- **THEN** stdout is valid JSON containing `symbols`, `specs`, and `documents`

#### Scenario: Text-mode symbol snippet uses normalized indentation

- **GIVEN** a symbol preview is cut from indented source code
- **WHEN** the result is rendered in text mode with `--snippet`
- **THEN** tabs in the snippet are expanded to spaces using tab width 2 before indentation normalization
- **AND** the smallest common leading indentation across non-blank lines is removed
- **AND** the rendered snippet preserves the relative indentation of the code

#### Scenario: Text-mode snippet block uses line range header and custom markers

- **WHEN** any symbol, spec, or document preview is rendered in text mode with `--snippet`
- **THEN** the snippet is preceded by a header matching `snippet @ L<start>-L<end>:`
- **AND** the snippet is wrapped in `>>>` and `<<<` markers
- **AND** no triple-backtick fences are used for the block

#### Scenario: Text-mode snippet sanitizes terminal control sequences

- **GIVEN** a matched snippet source contains ANSI escape sequences or other non-printable terminal control characters
- **WHEN** `specd graph search` renders that preview in text mode with `--snippet`
- **THEN** the rendered snippet does not emit those control sequences literally
- **AND** the remaining visible text stays readable

#### Scenario: Exact identity hit does not require raw boosted score as primary cue

- **GIVEN** a result is ranked first because of an exact identity boost
- **WHEN** the result is rendered in text mode
- **THEN** text rendering does not rely on the raw boosted score magnitude as the primary readability cue for that result

#### Scenario: File result groups precise occurrences

- **GIVEN** one indexed file has complete-query, raw-token, and expanded-token matches
- **WHEN** it is emitted in text, JSON, or TOON
- **THEN** the file appears once with ordered exact match ranges
- **AND** every match exposes `matchKind`, matched text, and `sourceToken`

#### Scenario: Match and snippet ranges remain distinct

- **WHEN** `--snippet` is enabled for a file or symbol result
- **THEN** exact match, symbol construct, symbol selection, and preview ranges retain their separate meanings
- **AND** omitting `--snippet` removes preview content without removing exact ranges

#### Scenario: Structured category order includes files

- **WHEN** JSON or TOON output contains all categories
- **THEN** it is grouped deterministically as `symbols`, `files`, `specs`, and `documents`

#### Scenario: Structured symbol output retains matched bindings

- **GIVEN** a public alias directly causes one logical-symbol match
- **WHEN** JSON or TOON output is rendered
- **THEN** the symbol group includes both `publicBindings` and `matchedPublicBindings`
- **AND** a machine consumer can identify the exact public route that caused the match

#### Scenario: Text favors declaration and matched export

- **GIVEN** a query matches a barrel export whose target is declared in another file
- **WHEN** text output is rendered
- **THEN** it prints the project-relative matched-export path and exported name followed by the declaration location
- **AND** it does not print the serialized canonical id or enumerate unrelated bindings by default

#### Scenario: Omitted file matches are summarized

- **GIVEN** a general file result has more visible occurrences than its per-file cap
- **WHEN** text, JSON, and TOON are rendered
- **THEN** text reports `N more matches in this file`
- **AND** structured output preserves retained, total, and omitted counts

#### Scenario: Structured file output retains truncation counts

- **GIVEN** one source file has more than ten visible matches
- **WHEN** JSON or TOON output is rendered
- **THEN** its file result includes `totalMatches` and `omittedMatches` alongside retained `matches`

### Requirement: Command signature (filters)

#### Scenario: Filter by multiple symbol kinds

- **WHEN** `specd graph search "transition" --kind class,method` is run
- **THEN** only symbols with kind `class` or `method` are returned
- **AND** symbols of other kinds are excluded

#### Scenario: Filter by file path wildcard

- **WHEN** `specd graph search "create" --file "*/composition/*"` is run
- **THEN** only symbols in files matching the pattern are returned

#### Scenario: Filter by workspace

- **WHEN** `specd graph search "kernel" --workspace core` is run
- **THEN** only symbols from workspace `core` are returned
- **AND** only specs from workspace `core` are returned

### Requirement: Reference-aware symbol results

#### Scenario: Search groups target without losing aliases

- **GIVEN** one logical symbol has multiple declarations and public bindings
- **WHEN** searched by owner-qualified reference or alias
- **THEN** one target group exposes every declaration, binding, directly matched binding, space, and form in deterministic order
- **AND** existing `--kind` semantics remain unchanged

### Requirement: Semantic-first candidate lanes

#### Scenario: Exact logical identity outranks local textual names

- **GIVEN** a logical class `Change` and CLI/test variables or helper functions named `change`
- **WHEN** an unfiltered search for `Change` runs
- **THEN** the exact logical declaration ranks first
- **AND** `--kind variable` still exposes the local values

#### Scenario: Logical-name equality is not canonical-identity equality

- **GIVEN** a logical target is named `run` and an exact public binding also exports `run`
- **WHEN** symbol search receives the ordinary text `run` rather than the target's canonical id
- **THEN** the public binding receives the exact-public-binding tier
- **AND** the logical target is not labeled exact-logical-identity solely because its name equals the query

#### Scenario: Canonical identity returns a non-exported target without text hits

- **GIVEN** a non-exported logical target has declarations but no public binding or backend text hit for its rendered canonical ID
- **WHEN** symbol search receives that exact canonical ID
- **THEN** the target is included directly with its declarations
- **AND** it receives the exact-logical-identity tier

#### Scenario: Prefix discovery remains visibly partial

- **GIVEN** `ValidateArtifacts` exists and `ValidateArtifact` does not
- **WHEN** symbol search receives `ValidateArtifact`
- **THEN** `ValidateArtifacts` MAY be returned after exact candidates as a prefix match
- **AND** its structured tier does not claim an exact match

#### Scenario: Semantic and textual lanes are limited after merge

- **GIVEN** semantic and backend text lanes return overlapping logical symbols
- **WHEN** the requested category limit is applied
- **THEN** duplicates are grouped before limiting
- **AND** stable `matchTier` and `matchReasons` explain the deterministic order

#### Scenario: Exact local tier remains reachable after logical components

- **GIVEN** one case-exact local symbol has no logical target
- **AND** another logical target matches only through a structural identity component
- **WHEN** both semantic lanes are classified and ordered
- **THEN** the logical component uses `logical-component`
- **AND** the local symbol uses `exact-local-symbol` rather than a declaration tier
