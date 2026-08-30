# Verification: sdk:suggest-implementation-links

## Requirements

### Requirement: Use Case Interface

#### Scenario: Suggest implementation links for a target spec

- **GIVEN** a valid workspace specification `cli:spec-implementation`
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation" })` is called
- **THEN** it returns a result containing `SpecImplementationSuggestion` for `cli:spec-implementation`
- **AND** the suggestions list includes `packages/cli/src/commands/spec/implementation.ts` with confidence `HIGH`

### Requirement: Input Validation & Error Handling

#### Scenario: Missing target options throws InvalidInputError

- **GIVEN** an empty input object `{}` with no targeting criteria
- **WHEN** `SuggestImplementationLinks.execute({})` is called
- **THEN** it throws `InvalidInputError` (instance of `SpecdError`)

#### Scenario: Non-existent workspace throws WorkspaceNotFoundError

- **GIVEN** a workspace `nonexistent-ws` that is not configured in `specRepositories`
- **WHEN** `SuggestImplementationLinks.execute({ workspace: "nonexistent-ws" })` is called
- **THEN** it throws `WorkspaceNotFoundError` (instance of `SpecdError`)

#### Scenario: Invalid confidence threshold throws InvalidInputError

- **GIVEN** an invalid confidence threshold `INVALID_THRESHOLD`
- **WHEN** `SuggestImplementationLinks.execute({ all: true, confidenceThreshold: "INVALID_THRESHOLD" as any })` is called
- **THEN** it throws `InvalidInputError` (instance of `SpecdError`)

#### Scenario: MED shorthand normalizes to MEDIUM

- **GIVEN** a valid spec with suggestions
- **WHEN** `SuggestImplementationLinks.execute({ specId, confidenceThreshold: "MED" })` is called
- **THEN** the result is `ok`
- **AND** every returned suggestion has confidence `HIGH` or `MEDIUM`

#### Scenario: Non-existent spec ID error

- **GIVEN** a spec ID `default:non-existent-spec` that does not exist in any spec repository
- **WHEN** `SuggestImplementationLinks.execute({ specId: "default:non-existent-spec" })` is called
- **THEN** it throws a `SpecNotFoundError` for `default:non-existent-spec` (instance of `SpecdError`)

### Requirement: Structured Markdown Symbol Evidence

#### Scenario: Strongest structural evidence wins

- **GIVEN** the same symbol appears in a fenced code block, inline code, and prose
- **WHEN** `SuggestImplementationLinks` extracts evidence from the Markdown AST
- **THEN** the candidate retains fenced-code evidence as its strongest source
- **AND** the scoring reasons identify that evidence deterministically

#### Scenario: Prose candidate requires indexed ground truth

- **GIVEN** prose contains one PascalCase token that resolves in the target workspace and one that does not
- **WHEN** Markdown symbol evidence is extracted
- **THEN** only the token resolving to an indexed code-graph symbol is eligible for a suggestion
- **AND** the unmatched prose token creates no candidate

#### Scenario: Structured extraction does not duplicate code indexing or completeness analysis

- **GIVEN** a spec containing fenced code, inline code, and prose references
- **WHEN** `SuggestImplementationLinks` analyzes the spec
- **THEN** Markdown structure is parsed without recursively scanning source directories
- **AND** indexed symbol and file resolution is delegated to `code-graph`
- **AND** no ownership inference or code-signature conformance result is produced

### Requirement: Spec Symbol Classifier & Ownership Partitioning

#### Scenario: Primary owned symbols are assigned high-confidence implementation links

- **GIVEN** A spec with primary class `CreateChange` and referenced port `ChangeRepository`
- **WHEN** Symbol classification and analysis run
- **THEN** The implementation link for `CreateChange` is assigned high confidence, while `ChangeRepository` is recognized as a collaborator reference and not misattributed as owned code.

#### Scenario: Insufficient implementation links detection

- **GIVEN** A spec whose implementation links only contain external collaborator references
- **WHEN** The ownership completeness check runs
- **THEN** It reports the spec links as incomplete due to missing primary owner symbols.

### Requirement: Early Graph Staleness Diagnostics

#### Scenario: Early graph staleness detection and result annotation

- **GIVEN** A code graph provider whose graph index is stale
- **WHEN** `SuggestImplementationLinks.execute()` is invoked
- **THEN** It emits a `stale-warning` progress event and returns `codeGraphStale: true` in the result payload.

### Requirement: Multi-Process Cache Locking and Flush Merging

#### Scenario: Concurrent writes from separate processes merge without data loss

- **GIVEN** Multiple cache instances performing concurrent writes to the suggestion cache
- **WHEN** Each instance executes `flush()` under exclusive kernel-level file lock
- **THEN** All written spec entries are preserved in the persisted cache file on disk without overwriting concurrent updates.

#### Scenario: Cache lock contention timeout throws CacheLockError

- **GIVEN** A lock file held exclusively by another active process exceeding the timeout
- **WHEN** An operation attempts to acquire the cache lock
- **THEN** It throws a typed `CacheLockError` with error code `CACHE_LOCKED`.

### Requirement: Session-Level Query Caching & Incremental Persistence

#### Scenario: In-memory session query caching eliminates duplicate SQLite queries

- **GIVEN** Multiple specs referencing common monorepo symbols and relative file paths
- **WHEN** `SuggestImplementationLinks.execute()` runs across target specs
- **THEN** Symmetrical queries are served from `symbolQueryCache` and `fileCanonicalCache`, preventing redundant database queries.

#### Scenario: Incremental spec flushing preserves complete cache state

- **GIVEN** A multi-spec analysis session
- **WHEN** Execution is cancelled mid-way or completed fully
- **THEN** Analyzed spec entries are incrementally persisted to disk without truncation.

### Requirement: 3-Tier Analysis Algorithm

#### Scenario: Incremental cache persistence across multi-spec runs

- **GIVEN** a multi-spec analysis across a workspace or multiple spec IDs
- **WHEN** each specification completes analysis
- **THEN** `cache.flush()` is invoked incrementally so analyzed entries are persisted to disk immediately
- **AND** subsequent or resumed runs read previously completed specs from cache without re-analysis

#### Scenario: Cache staleness fast-path and rebuild

- **GIVEN** cached implementation suggestions via `ImplementationSuggestionCachePort` (default `FsImplementationSuggestionCache` at `.specd/tmp/fs-cache/implementation-suggestions/suggestions.json`)
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation" })` is called with unchanged `lastModified` stamps
- **THEN** it returns cached suggestions without re-parsing AST or searching code-graph
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation", rebuildCache: true })` is called
- **THEN** it bypasses cache reads and re-evaluates Pass 1 and Pass 2

#### Scenario: Path and token affinity scoring disqualifies missing distinctive tokens

- **GIVEN** a spec `core:spec-repository-port` with distinctive tokens `['spec', 'repository', 'port']`
- **WHEN** evaluating candidate file `src/infrastructure/fs/spec-repository.ts` which lacks the `port` token
- **THEN** candidate receives a `missing-distinctive-tokens` score penalty of `-150` per missing distinctive token
- **AND** is barred from receiving `HIGH` confidence

#### Scenario: Primary exact symbol vs derivative symbol match differentiation

- **GIVEN** primary symbol `SpecRepository` and derivative symbol `FsSpecRepository`
- **WHEN** evaluating `src/application/ports/spec-repository.ts` declaring `SpecRepository`
- **THEN** it scores an `exact-primary-symbol-match` (+200) and receives `HIGH` confidence
- **WHEN** evaluating `src/infrastructure/fs/spec-repository.ts` against `core:spec-repository-port`
- **THEN** it scores as `derivative-symbol-match` (+50) instead of primary match

#### Scenario: Tier 2 hierarchical domain prefix and subtoken content match

- **GIVEN** a CLI command spec `default:schema-which-command` with no direct `schema-which-command.ts` file
- **WHEN** `SuggestImplementationLinks.execute({ specId: "default:schema-which-command" })` is evaluated
- **THEN** Tier 2 matches candidate `src/commands/schema.ts` via domain prefix `schema`
- **AND** confirms sub-token `which` in the file content via `code-graph` FTS search
- **AND** returns `src/commands/schema.ts` with `HIGH` confidence and declared top-level symbols

#### Scenario: Tier 2 retains Tier 1 candidates and controls only Tier 3 fallback

- **GIVEN** Tier 1 produced one candidate and Tier 2 produced a second hierarchical-domain candidate
- **WHEN** Tier 2 completes
- **THEN** both candidates compete in the returned ranked set
- **AND** Tier 3 is not invoked because the combined set is non-empty

#### Scenario: Missing file observer is rejected

- **GIVEN** dependencies without a file-observation port
- **WHEN** `createSuggestImplementationLinks(deps)` is called
- **THEN** construction fails with `InvalidInputError`
- **AND** no fallback assumes candidate files exist

#### Scenario: Tier 3 fallback tag and keyword co-occurrence search

- **GIVEN** a declarative spec `default:rules-injection` yielding zero candidates in Tiers 1 and 2
- **WHEN** Tier 3 fallback executes against `code-graph`
- **THEN** it identifies co-occurring syntax tags (`<rules>`) and requirement keywords
- **AND** returns candidate `src/commands/workflow/instructions.ts` with `MEDIUM` confidence

### Requirement: Already-Included Marking

#### Scenario: Suggestions mark files already in spec-lock

- **GIVEN** `cli:spec-implementation` has `packages/cli/src/commands/spec/implementation.ts` in `spec-lock.json`
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation" })` is called
- **AND** the analysis algorithm re-discovers `packages/cli/src/commands/spec/implementation.ts`
- **THEN** that suggestion entry has `alreadyIncluded: true`
- **AND** newly discovered candidate files have `alreadyIncluded: false`

### Requirement: Additive Mutation Semantics (apply: true)

#### Scenario: Additive application of implementation links

- **GIVEN** `cli:spec-implementation` has existing links in `spec-lock.json`
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation", apply: true })` is called
- **THEN** it invokes `UpdatePersistedSpecImplementation` with action `add` only for suggestions with `alreadyIncluded: false`
- **AND** existing links in `spec-lock.json` are retained alongside newly applied links

### Requirement: Dependency-injected factory

#### Scenario: Canonical factory accepts resolved dependencies

- **GIVEN** a complete `SuggestImplementationLinksDeps` object
- **WHEN** `createSuggestImplementationLinks(deps)` is called
- **THEN** it returns a wired `SuggestImplementationLinks` instance without constructing filesystem adapters

#### Scenario: Progress callback events emission

- **GIVEN** an `onProgress` callback passed to `SuggestImplementationLinks.execute`
- **WHEN** `execute({ specId: "cli:spec-implementation", onProgress })` executes
- **THEN** `onProgress` receives the complete ordered event sequence: `discovery-start`, `discovery-done`, `start`, `spec-start`, `spec-done`, and `done`
- **AND** both discovery events appear in their correct positions: `discovery-start` is the first event emitted and `discovery-done` precedes `start`
