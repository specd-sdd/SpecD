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

### Requirement: 3-Tier Analysis Algorithm

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

### Requirement: Additive Mutation Semantics (`apply: true`)

#### Scenario: Additive application of implementation links

- **GIVEN** `cli:spec-implementation` has existing links in `spec-lock.json`
- **WHEN** `SuggestImplementationLinks.execute({ specId: "cli:spec-implementation", apply: true })` is called
- **THEN** it invokes `UpdatePersistedSpecImplementation` with action `add` only for suggestions with `alreadyIncluded: false`
- **AND** existing links in `spec-lock.json` are retained alongside newly applied links

### Requirement: Standard Factory & Composition Overloads

#### Scenario: Config-based factory resolution

- **GIVEN** a resolved `SpecdConfig` instance
- **WHEN** `createSuggestImplementationLinks(config)` is called
- **THEN** it resolves all dependencies via `resolveSuggestImplementationLinksDeps` and returns a wired `SuggestImplementationLinks` instance

#### Scenario: Progress callback events emission

- **GIVEN** an `onProgress` callback passed to `SuggestImplementationLinks.execute`
- **WHEN** `execute({ specId: "cli:spec-implementation", onProgress })` executes
- **THEN** `onProgress` receives sequential `start`, `spec-start`, `spec-done`, and `done` events
