# Verification: CLI Guide SDK Command

## Requirements

### Requirement: Guide SDK Catalog Listing Command

#### Scenario: Unscoped listing omits generated API topics

- **GIVEN** the SDK collection is compiled, containing both hand-written package-reference documents and generated API symbol topics
- **WHEN** `specd guide-sdk` is run without a `--scope` option
- **THEN** the listing MUST NOT include generated API symbol topics
- **AND** the listing MUST remain comparable in size to the `specd guide` catalog

#### Scenario: Scoped listing returns only the requested collection

- **GIVEN** the SDK collection contains documents from the `sdk` and `core` collections
- **WHEN** `specd guide-sdk --collection core` is run
- **THEN** every returned entry MUST belong to the `core` collection
- **AND** no entry from another collection MUST appear

#### Scenario: Listing entries carry collection and metadata

- **WHEN** `specd guide-sdk --collection core` is run
- **THEN** each entry MUST include `collection`, `topic`, `title`, `description` and `order`

#### Scenario: Listing is ordered by order then topic

- **GIVEN** two entries in the same collection share the same `order` value
- **WHEN** the collection is listed
- **THEN** entries MUST be ordered by ascending `order` first
- **AND** the tied entries MUST be ordered alphabetically by `topic` using locale-sensitive comparison

#### Scenario: Ordering is never defined across collections

- **GIVEN** two collections each contain an entry with `order` 1 and an entry with `order` 4
- **WHEN** either collection is listed
- **THEN** the relative order of entries within that collection MUST be unaffected by the presence or ordering of entries in the other collection

#### Scenario: Pagination bounds the returned entries

- **GIVEN** the `core` collection contains more entries than the default page size
- **WHEN** `specd guide-sdk --collection core` is run without pagination options
- **THEN** the listing MUST return only the first page of entries
- **WHEN** a page offset or limit is supplied
- **THEN** the listing MUST return the corresponding page
- **AND** the relative order of the returned entries MUST match the unpaginated order

#### Scenario: Listing renders structurally under each format

- **WHEN** `specd guide-sdk --format text` is run
- **THEN** the listing MUST be rendered as a readable table or topic list
- **WHEN** `specd guide-sdk --format json` or `--format toon` is run
- **THEN** the command MUST output a structured object whose `topics` member holds the guide topic summaries for the returned page
- **AND** the object MUST carry a `pagination` member with `page`, `pageSize`, `returned`, `total` and `totalPages`
- **AND** the object MUST carry a `collections` member summarising each collection's `total` and its `firstPage`/`lastPage` range
- **AND** the envelope shape MUST match the one used by the sibling `specd guide` listing

#### Scenario: Multi-collection listing delimits collections in text output

- **GIVEN** a listing whose page contains entries from more than one collection
- **WHEN** it is rendered as `text`
- **THEN** the entries of each collection MUST be visibly delimited from the entries of the next collection
- **AND** a reader MUST be able to tell that the page spans several collections rather than one

#### Scenario: Page position is reported only when the catalog spans several pages

- **GIVEN** the active scope and page size yield more than one page
- **WHEN** the listing is rendered as `text`
- **THEN** the output MUST report the position as `page N of M` together with the returned and total entry counts
- **GIVEN** the result fits in a single page
- **WHEN** the listing is rendered
- **THEN** the page position MUST be omitted rather than reported as `page 1 of 1`

#### Scenario: Suppressed API surface is reported, not silently withheld

- **GIVEN** the catalog contains generated API topics that the active scope excludes
- **WHEN** the listing is rendered in any supported format
- **THEN** the output MUST report how many generated API topics are being withheld
- **AND** it MUST name the exact command that reveals them, `specd guide-sdk --scope api`

### Requirement: Guide SDK Scope Validation

#### Scenario: Unrecognised scope is rejected with the valid values

- **WHEN** `specd guide-sdk --scope bogus` is run
- **THEN** the command MUST exit with code 1
- **AND** the error code MUST be `INVALID_GUIDE_SCOPE`
- **AND** the message MUST report the rejected value and MUST list every valid scope value, which are `docs`, `api` and `all`

#### Scenario: Unrecognised scope is not reported as an empty success

- **WHEN** `specd guide-sdk --scope bogus` is run
- **THEN** the command MUST NOT exit with code 0
- **AND** it MUST NOT print a listing containing no topics as if the scope legitimately matched nothing

#### Scenario: A collection passed to scope points at the collection flag

- **WHEN** `specd guide-sdk --scope core` is run
- **THEN** the command MUST exit with code 1 with the error code `INVALID_GUIDE_SCOPE`
- **AND** the message MUST name `--collection` as the option that accepts a collection
- **AND** the command MUST NOT accept the collection name as a scope, because scope and collection are separate dimensions

#### Scenario: Unrecognised collection is rejected with its own error code

- **WHEN** `specd guide-sdk --collection bogus` is run
- **THEN** the command MUST exit with code 1
- **AND** the error code MUST be `INVALID_GUIDE_COLLECTION`, distinct from the scope error so the caller can tell which flag was wrong
- **AND** the message MUST report the rejected value and MUST list every valid collection

#### Scenario: Scope and collection compose instead of shadowing each other

- **WHEN** `specd guide-sdk --scope api --collection code-graph` is run
- **THEN** every returned entry MUST belong to the `code-graph` collection
- **AND** every returned entry MUST carry the scope `api`
- **WHEN** `specd guide-sdk --scope docs --collection core` is run
- **THEN** every returned entry MUST belong to the `core` collection
- **AND** no returned entry MUST carry the scope `api`

#### Scenario: Explicit docs scope matches the implicit default

- **WHEN** `specd guide-sdk` and `specd guide-sdk --scope docs` are run
- **THEN** both MUST return the same number of entries
- **AND** neither MUST return a generated API topic

### Requirement: Guide SDK Generated Topics Report An Actionable Import

#### Scenario: Generated topic metadata carries the package and the import

- **WHEN** `specd guide-sdk code-graph:classes/GetGraphHealth --meta --format json` is run
- **THEN** the metadata MUST carry the published package `@specd/code-graph`
- **AND** the metadata MUST carry the import statement `import { GetGraphHealth } from '@specd/code-graph'`
- **AND** it MUST remain a value import, because a class has a value form that must be constructible
- **AND** it MUST NOT report the declaration's source path, because that repository-internal path is unreachable to an installed-package consumer

#### Scenario: Interfaces are imported type-only because they have no value form

- **WHEN** `specd guide-sdk core:interfaces/ActorIdentity --meta --format json` is run
- **THEN** the import statement MUST be `import type { ActorIdentity } from '@specd/core'`
- **AND** a type-only import MUST NOT be emitted for a class, enumeration, function or variable, because it could not be called or constructed

#### Scenario: Hand-written topics omit the import metadata

- **WHEN** `specd guide-sdk core:ports --meta --format json` is run
- **THEN** the metadata MUST NOT carry the package or import fields
- **AND** it MUST NOT report them as null, because a hand-written document documents no importable symbol

#### Scenario: The generated body surfaces the import without requiring metadata

- **WHEN** `specd guide-sdk code-graph:classes/GetGraphHealth` is run
- **THEN** the body MUST contain the import statement
- **AND** it MUST NOT report the declaration's source path; the actionable import is the only location guidance exposed to the caller

### Requirement: Guide SDK Catalog Index

#### Scenario: Meta without a topic returns an index instead of the plain listing

- **WHEN** `specd guide-sdk --meta` is run with no topic argument
- **THEN** the command MUST return a catalog index rather than the plain catalog listing
- **AND** it MUST NOT behave as if `--meta` had been ignored

#### Scenario: Index reports collection extents and boundaries

- **WHEN** the catalog index is rendered
- **THEN** it MUST report, per collection, the number of topics that collection contains
- **AND** it MUST report the page range those topics occupy under the active `--page-size`
- **AND** the per-collection ranges MUST make the boundary between collections visible

#### Scenario: Index carries one retrieval hint instead of a command per topic

- **WHEN** the catalog index is rendered
- **THEN** it MUST carry the literal hint `read: specd guide-sdk <topic>` exactly once
- **AND** it MUST NOT carry a per-topic retrieval command
- **AND** each topic MUST be printed as the fully qualified `collection:topic` identifier, so the value the hint shows is what the caller pastes into `<topic>`

#### Scenario: Index honours scope and stays bounded

- **WHEN** the catalog index is rendered
- **THEN** it MUST respect the active `--scope`, `--collection` and pagination options
- **AND** it MUST NOT enumerate topics that the active scope excludes

#### Scenario: Meta with a topic still returns that topic's metadata

- **WHEN** `specd guide-sdk core:ports --meta` is run
- **THEN** the command MUST return the metadata and outline of that single topic
- **AND** it MUST NOT return the catalog index

### Requirement: Guide SDK Listing And Index Entries Report Their Scope

#### Scenario: Every listed entry reports its scope

- **WHEN** the catalog listing is rendered
- **THEN** each entry MUST report a `scope` of either `docs` or `api`
- **AND** a hand-written topic MUST report `docs`
- **AND** a generated API topic MUST report `api`

#### Scenario: Scope is present in structured output too

- **WHEN** the catalog listing is rendered under `--format json` or `--format toon`
- **THEN** each entry MUST carry `scope` in its structured form

#### Scenario: Scope and collection stay distinct

- **WHEN** a generated API topic in the `code-graph` collection is listed
- **THEN** its `scope` MUST be `api`
- **AND** its `collection` MUST be `code-graph`
- **AND** the two MUST NOT be conflated into one field

### Requirement: Guide SDK Unknown Topic Suggests A Title Match

#### Scenario: Unknown topic matching a title names the canonical identifier

- **WHEN** `specd guide-sdk GetGraphHealth` is run and no topic has that identifier
- **THEN** the command MUST exit with code 1
- **AND** it MUST name the canonical identifier of the topic titled `GetGraphHealth`
- **AND** the suggestion MUST lead the available-topic list so it is not truncated away

#### Scenario: Suggestion is available to structured callers as its own field

- **WHEN** the unknown-topic error is rendered under `--format json` or `--format toon`
- **THEN** the title-matched topics MUST be reported under a field distinct from the available-topic list

#### Scenario: Title matching ignores case

- **WHEN** an unknown topic is requested in different casing from the title it matches
- **THEN** the command MUST still report that topic as a suggestion

#### Scenario: Qualified request reports a match held by another collection

- **WHEN** a collection-qualified unknown topic is requested and a topic in a different collection carries that title
- **THEN** the command MUST report that topic as the suggestion rather than suppressing it
- **AND** the message MUST state that the title exists in another collection, so the caller can tell a wrong collection from a wrong symbol
- **AND** the request MUST NOT be resolved to it

#### Scenario: Structured output reports which kind of suggestion it is

- **WHEN** the unknown-topic error is rendered under `--format json` or `--format toon`
- **THEN** the scope of the suggestion MUST be reported as the named collection or as another collection, so a caller can tell the two apart without parsing the message

#### Scenario: A kind directory in the request does not prevent the match

- **WHEN** an unknown topic is requested with its kind directory included, such as `classes/StubError`
- **THEN** the command MUST still match it against the topic titled `StubError`

#### Scenario: No matching title yields no suggestion

- **WHEN** an unknown topic is requested and no topic's title equals the request
- **THEN** the error MUST carry no suggestion

#### Scenario: A title match is suggested rather than resolved

- **WHEN** an unknown topic matches a title exactly
- **THEN** the command MUST NOT resolve the request to that topic
- **AND** it MUST exit with code 1, because the caller holds an identifier that is not the one to use

#### Scenario: The suggested identifier resolves

- **WHEN** the identifier reported by a suggestion is passed back to the command
- **THEN** the command MUST return that topic

### Requirement: Guide SDK Unknown Topic Does Not Enumerate The Catalog

#### Scenario: Unknown topic points at the commands that find topics

- **WHEN** an unknown topic is requested
- **THEN** the error detail MUST report how many topics are registered
- **AND** it MUST name the listing, the metadata index, and the search subcommand
- **AND** the error message MUST NOT list topics

#### Scenario: Structured callers still receive the candidate list

- **WHEN** the unknown-topic error is rendered under `--format json` or `--format toon`
- **THEN** the candidate list MUST be reported in full
- **AND** the entries most resembling the request MUST come first
- **AND** the total count MUST be reported as a field of its own

### Requirement: Guide SDK Search Matches Identifier Constituents

#### Scenario: A symbol name is found by its exact casing

- **WHEN** `specd guide-sdk search "FreshnessLatches"` is run
- **THEN** the topic titled `FreshnessLatches` MUST appear in the results

#### Scenario: A symbol name is found when the caller lowercases it

- **WHEN** `specd guide-sdk search "freshnesslatches"` is run
- **THEN** the topic titled `FreshnessLatches` MUST appear in the results

#### Scenario: A symbol name is found when typed as its words

- **WHEN** `specd guide-sdk search "freshness latches"` is run
- **THEN** the topic titled `FreshnessLatches` MUST appear in the results

#### Scenario: One word of a symbol name is enough

- **WHEN** `specd guide-sdk search "latches"` is run
- **THEN** the topic titled `FreshnessLatches` MUST appear in the results

#### Scenario: An acronym run is split from the following word

- **WHEN** `specd guide-sdk search "xml"` is run against a topic titled `XMLError`
- **THEN** that topic MUST appear in the results

#### Scenario: Separators are term boundaries

- **WHEN** `specd guide-sdk search "code-graph"` is run
- **THEN** `code` and `graph` MUST each be searchable as separate terms

#### Scenario: An expanded query returns a snippet centred on its matching line

- **WHEN** a symbol name is searched and a hit is returned
- **THEN** the snippet MUST be centred on the line matching the expanded terms
- **AND** it MUST NOT be centred on the start of the section

#### Scenario: Identifier matching does not bypass the collection filter

- **WHEN** an identifier query is run with `--collection`
- **THEN** only topics in that collection MUST be returned

### Requirement: Guide SDK Body Flags Require a Topic

#### Scenario: Body flags without a topic are rejected

- **WHEN** `specd guide-sdk --section 2` is run with no topic argument
- **THEN** the command MUST exit with code 1
- **AND** it MUST report that `--section` requires a topic argument
- **WHEN** `specd guide-sdk --lines 5` or `specd guide-sdk --start-line 2` is run with no topic argument
- **THEN** the command MUST exit with code 1 and name the offending flag

#### Scenario: Body flags without a topic never fall back to a listing

- **WHEN** a body flag is supplied without a topic argument
- **THEN** the command MUST NOT render a catalog listing
- **AND** it MUST NOT silently discard the requested flag

### Requirement: Guide SDK API Surface Visibility Note

#### Scenario: Help states that the API surface is hidden by default

- **WHEN** `specd guide-sdk --help` is run
- **THEN** the help output MUST state that generated API topics are hidden by default
- **AND** it MUST name `--scope api` as the way to reveal them

### Requirement: Guide SDK Topic Inspection Command

#### Scenario: Collection-qualified topic resolves

- **GIVEN** the SDK collection contains `docs/core/ports.md`
- **WHEN** `specd guide-sdk core:ports` is run
- **THEN** the command MUST output the content of that document

#### Scenario: Nested source document resolves with a path separator

- **GIVEN** the SDK collection contains `docs/core/examples/implementing-a-port.md`
- **WHEN** `specd guide-sdk core:examples/implementing-a-port` is run
- **THEN** the command MUST output that document's content
- **AND** the `:` MUST be treated only as the collection delimiter, with `/` preserved inside the topic

#### Scenario: Generated API symbol is individually addressable

- **GIVEN** the SDK collection contains a generated topic for the `ArtifactDag` class
- **WHEN** `specd guide-sdk sdk:classes/ArtifactDag` is run
- **THEN** the command MUST output that symbol's documentation content
- **AND** the command MUST support the same `--section`, `--start-line`, `--lines` and `--line-numbers` options as a hand-written topic

#### Scenario: Topic normalization matches the SDK collection

- **WHEN** `specd guide-sdk "  core:ports  "` is run
- **THEN** the surrounding whitespace MUST be trimmed before resolution
- **WHEN** `specd guide-sdk core:ports.md` is run
- **THEN** the trailing `.md` extension MUST be stripped before resolution

#### Scenario: Unknown topic reports the failure and exits 1

- **WHEN** `specd guide-sdk core:prot` is run
- **THEN** the command MUST output a descriptive error indicating the unknown topic
- **AND** the error detail MUST point at the commands that find topics rather than quoting them
- **AND** the command MUST exit with code 1

### Requirement: Guide SDK Topic Metadata Inspection

#### Scenario: Meta omits document body

- **WHEN** `specd guide-sdk core:ports --meta` is run
- **THEN** the output MUST contain the topic's title, description, order, line count, byte length, collection and outline
- **AND** the output MUST NOT contain the full document body

### Requirement: Guide SDK Section Extraction

#### Scenario: Numeric section index is detected

- **WHEN** `specd guide-sdk core:ports --section 3` is run
- **THEN** the command MUST extract the section whose 1-indexed outline position is 3

#### Scenario: Colon in the topic is not mistaken for a section selector

- **GIVEN** a topic address containing a collection delimiter
- **WHEN** `specd guide-sdk core:ports --section 2` is run
- **THEN** the topic MUST resolve as `core:ports` and the selector MUST resolve as section 2

#### Scenario: Text section selector is case-insensitive and slug-tolerant

- **WHEN** `specd guide-sdk core:ports --section "IMPLEMENTING a PORT"` is run
- **THEN** matching MUST be case-insensitive and whitespace-tolerant
- **AND** a kebab-case slug MUST resolve to the same section

#### Scenario: Ambiguous heading is reported with disambiguation guidance

- **GIVEN** a document contains two sections with the same heading text
- **WHEN** `specd guide-sdk <topic> --section "<heading>"` is run
- **THEN** the command MUST report `AMBIGUOUS_GUIDE_SECTION`
- **AND** the error MUST instruct the caller to disambiguate by section index
- **AND** the command MUST exit with code 1

#### Scenario: Missing section maps to a stable error code

- **GIVEN** a document with no section matching the selector
- **WHEN** the selector is supplied
- **THEN** the command MUST map the error to `UNKNOWN_GUIDE_SECTION`
- **AND** the command MUST exit with code 1

### Requirement: Guide SDK Line Window Slicing

#### Scenario: Bounded window is returned

- **WHEN** `specd guide-sdk core:ports --start-line 10 --lines 5` is run
- **THEN** the output MUST contain lines 10 through 14 of the document body

#### Scenario: Line numbers are right-aligned and 1-indexed

- **WHEN** `specd guide-sdk core:ports --start-line 1 --lines 3 --line-numbers` is run
- **THEN** each returned line MUST be prefixed with its right-aligned 1-indexed line number

#### Scenario: Window exceeding the document is bounded

- **GIVEN** a document shorter than the requested window
- **WHEN** a `--start-line` beyond the final line is supplied
- **THEN** the command MUST return an empty string rather than failing

### Requirement: Guide SDK Search Subcommand

#### Scenario: Search covers generated API topics

- **GIVEN** the SDK collection contains a generated API symbol topic
- **WHEN** `specd guide-sdk search "<symbol name>"` is run
- **THEN** at least one hit MUST come from a generated API topic

#### Scenario: Hit reports a real source path

- **WHEN** `specd guide-sdk search "<query>"` returns a hit for a hand-written document
- **THEN** the hit's `file` MUST be the real source path relative to the collection root, including the `.md` extension
- **AND** it MUST NOT be a synthesized `<topic>.md` filename

#### Scenario: Hit read command names the SDK guide command

- **WHEN** `specd guide-sdk search "<query>"` returns a hit
- **THEN** the hit's `readCommand` MUST invoke `specd guide-sdk` with the collection-qualified topic and a section selector
- **AND** it MUST NOT emit `specd guide`

#### Scenario: Topic-scoped search filters strictly

- **WHEN** `specd guide-sdk search "<query>" --topic core:ports` is run
- **THEN** every returned hit MUST belong to `core:ports`

#### Scenario: Limit bounds the result count

- **WHEN** `specd guide-sdk search "<query>" --limit 3` is run
- **THEN** at most 3 hits MUST be returned

#### Scenario: Non-positive limit falls back to a safe default

- **WHEN** `specd guide-sdk search "<query>" --limit 0` or `--limit -1` is run
- **THEN** the command MUST use its safe default limit rather than returning nothing or erroring

#### Scenario: Blank query returns no results

- **WHEN** `specd guide-sdk search "   "` is run
- **THEN** the command MUST return an empty result set immediately without error

### Requirement: Guide SDK Output Formats

#### Scenario: Structured formats emit valid output without prose

- **WHEN** `specd guide-sdk core:ports --format json` is run
- **THEN** stdout MUST contain valid JSON and MUST NOT be preceded by human-readable text

#### Scenario: Help documents structured output envelopes

- **WHEN** `specd guide-sdk --help` is run
- **THEN** the help MUST document the stable JSON and TOON envelope fields for listings, topic metadata, search results, and errors

#### Scenario: Errors go to stderr under every format

- **WHEN** `specd guide-sdk core:unknown --format json` is run
- **THEN** the error MUST be written to stderr
- **AND** stdout MUST be empty

### Requirement: SDK Guide Discovery Field

#### Scenario: Discovery field is present in every output format

- **WHEN** `specd guide` is run with `--format text`, `--format json`, or `--format toon`
- **THEN** the output MUST surface the SDK guide as a structured field
- **AND** the field MUST name the exact command `specd guide-sdk`

#### Scenario: Discovery is parseable under structured formats

- **WHEN** `specd guide --format json` is run
- **THEN** the discovery information MUST be part of the structured output rather than interleaved into a human-readable stream

#### Scenario: Existing listing contract is unchanged

- **WHEN** `specd guide` is run
- **THEN** each listing entry MUST still include `topic`, `title` and `description`, ordered by `order`

### Requirement: Command Registration

#### Scenario: Command appears in root help

- **WHEN** root help is displayed
- **THEN** `specd guide-sdk` MUST appear as a top-level command alongside `guide`

#### Scenario: Command resolves configuration

- **GIVEN** a `specd.yaml` exists in an ancestor directory of the working directory
- **WHEN** `specd guide-sdk core:ports` is run
- **THEN** the command MUST resolve that configuration
- **WHEN** `--config` is supplied in the global position before the subcommand, or in the local position after it
- **THEN** the explicit file MUST take effect

#### Scenario: Banner and version labels are consistent with other commands

- **WHEN** `specd guide-sdk --help` is run
- **THEN** the banner MUST NOT appear in subcommand help

#### Scenario: Existing command behaviour is unaffected

- **WHEN** `specd guide`, `specd guide workflow` and `specd guide search "<query>"` are run
- **THEN** their behaviour MUST be identical to before the SDK command was added, apart from the additive discovery field in the catalog listing

### Requirement: Error Mapping

#### Scenario: Expected guide errors use the standard CLI rendering

- **WHEN** `specd guide-sdk unknown-topic` fails with `UNKNOWN_GUIDE_TOPIC`
- **THEN** stderr MUST start with `error: [UNKNOWN_GUIDE_TOPIC]`
- **AND** it MUST NOT use a `Guide error:` prefix
- **AND** the human detail MUST name the listing, metadata index, and search operations without enumerating the catalog

#### Scenario: Command name and search subcommand coexist

- **WHEN** `specd guide-sdk search "<query>"` is run
- **THEN** the parser MUST resolve `search` as the subcommand rather than as a topic named `search`
- **AND** it MUST NOT require a `--collection` flag to disambiguate the two

#### Scenario: Guide domain errors map to stable codes

- **GIVEN** the SDK collection is served by its own engine instance
- **WHEN** the engine raises `GuideTopicNotFoundError`, `GuideSectionNotFoundError` or `GuideSectionAmbiguousError`
- **THEN** the command MUST map them to `UNKNOWN_GUIDE_TOPIC`, `UNKNOWN_GUIDE_SECTION` and `AMBIGUOUS_GUIDE_SECTION` respectively
- **AND** each MUST exit with code 1

#### Scenario: SDK collection is not loaded when serving the user guide

- **WHEN** `specd guide workflow` is run
- **THEN** the SDK collection's generated catalog MUST NOT be loaded
- **AND** the user guide's catalog MUST be the one served

#### Scenario: Command delegates rather than reimplements

- **GIVEN** a stubbed `GuideEngine` is injected for the command
- **WHEN** any `specd guide-sdk` operation is invoked
- **THEN** the corresponding `GuideEngine` method MUST be called
- **AND** the command MUST NOT perform catalog, outline, section, slicing or search logic itself

### Requirement: Guide SDK Generated Topics Document The Call Shape

#### Scenario: A class topic documents how it is constructed and invoked

- **WHEN** `specd guide-sdk code-graph:classes/GetGraphHealth` is run
- **THEN** the body MUST carry the class signature and the constructor's parameter list
- **AND** it MUST document each method with its parameters and return type
- **AND** it MUST carry a `Related types` table linking the input and result interfaces

#### Scenario: A getter is documented as a field

- **WHEN** `specd guide-sdk code-graph:classes/BulkSessionStateError` is run
- **THEN** the `code` getter MUST appear in the fields table with its return type
- **AND** its JSDoc MUST appear in the description column

#### Scenario: An interface topic documents its fields

- **WHEN** `specd guide-sdk code-graph:interfaces/GetGraphHealthInput` is run
- **THEN** every declared field MUST appear with its type
- **AND** optional fields MUST be marked as not required

#### Scenario: A declared example is used verbatim

- **GIVEN** a symbol whose JSDoc carries an `@example`
- **WHEN** its topic is retrieved
- **THEN** the `Usage` section MUST contain that example
- **AND** the example's line structure MUST be preserved
- **AND** an example that already carries its own fence MUST NOT be wrapped in a second fence

#### Scenario: A symbol without an example gets a derived skeleton

- **GIVEN** a symbol whose JSDoc carries no `@example`
- **WHEN** its topic is retrieved
- **THEN** the `Usage` section MUST contain a skeleton built from the signature
- **AND** it MUST bind the declared parameter names rather than invented values

#### Scenario: A type reached through several collections links to its declaration

- **WHEN** `specd guide-sdk code-graph:interfaces/GetGraphHealthInput` is run
- **THEN** `SpecdConfig` MUST link to `core:interfaces/SpecdConfig`
- **AND** it MUST NOT link to the collection that merely re-exports it

### Requirement: Guide SDK Generated Topics Exclude Members Inherited From The Standard Library

#### Scenario: Standard library members are absent from an error class topic

- **WHEN** `specd guide-sdk code-graph:classes/BulkSessionStateError` is run
- **THEN** the fields inherited from the standard library's error class MUST NOT appear
- **AND** the topic MUST NOT document `prepareStackTrace`
- **AND** the members the class does declare MUST still appear

#### Scenario: An excluded member does not reappear as a related type

- **GIVEN** a member excluded because it is declared outside this repository
- **WHEN** any section of the topic is read
- **THEN** that member's types MUST NOT appear in the related types table

### Requirement: Guide SDK Generated Markdown Is Formatted Consistently

#### Scenario: Generated table columns are aligned

- **WHEN** a generated topic containing a Markdown table is retrieved
- **THEN** the rows of that table MUST have their cells padded to a common width
- **AND** the documented cell contents MUST be unchanged by the formatting

#### Scenario: Hand-written topics are left alone

- **WHEN** `specd guide-sdk core:ports` is run
- **THEN** its content MUST be byte-identical to the committed source

#### Scenario: A re-exported class documents the members its declaring package wrote

- **WHEN** `specd guide-sdk sdk:classes/HookResult` is run
- **THEN** the topic MUST document the constructor's parameters and every method
- **AND** it MUST NOT be reduced to a signature, because the symbol is declared in another package of the workspace and re-exported by this one

#### Scenario: An interface's methods are documented

- **WHEN** `specd guide-sdk code-graph:interfaces/CodeGraphProvider` is run
- **THEN** the topic MUST carry a `Methods` section naming each declared method
- **AND** each method MUST show its parameters and return type

#### Scenario: An inline code span in a summary stays inside its sentence

- **WHEN** a symbol whose summary mixes prose with inline code and link tags is retrieved
- **THEN** each inline span MUST remain part of the same paragraph
- **AND** the spacing the author wrote around each span MUST be preserved

#### Scenario: An enumeration member reports its declared value

- **GIVEN** a symbol documented by an enumeration
- **WHEN** its topic is retrieved
- **THEN** each member MUST report the value it is declared with
- **AND** a value reported as an object MUST render as empty rather than as `[object Object]`

#### Scenario: A search hit on a generated topic names no declaration

- **WHEN** `specd guide-sdk search HookResult --format json` is run
- **THEN** no hit on `classes/HookResult` MUST carry a `file` key
- **AND** each hit MUST still carry the collection-qualified topic, the section and a `readCommand`
- **AND** a hit on a hand-written document MUST keep reporting its source path

#### Scenario: The key is absent rather than null

- **WHEN** a search hit is serialized in any format
- **THEN** a withheld `file` MUST be omitted from the object entirely
- **AND** it MUST NOT appear as `null`, which `exactOptionalPropertyTypes` would otherwise produce
