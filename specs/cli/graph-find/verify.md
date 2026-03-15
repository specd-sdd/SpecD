# Verification: Graph Find

## Requirements

### Requirement: Search behaviour

#### Scenario: Search by name pattern

- **GIVEN** the graph contains symbols `computeHash`, `computeDigest`, and `validate`
- **WHEN** `specd graph find --name "compute*"` is run
- **THEN** stdout shows `2 symbol(s) found:` followed by `computeHash` and `computeDigest`
- **AND** `validate` is not included
- **AND** the process exits with code 0

#### Scenario: Search by kind

- **GIVEN** the graph contains 3 functions and 2 classes
- **WHEN** `specd graph find --kind class` is run
- **THEN** stdout shows `2 symbol(s) found:` followed by the 2 class symbols

#### Scenario: Search by file pattern

- **GIVEN** the graph contains symbols in `src/auth.ts` and `src/user.ts`
- **WHEN** `specd graph find --file "src/auth*"` is run
- **THEN** only symbols from files matching `src/auth*` are shown

#### Scenario: Search by comment text

- **GIVEN** the graph contains a symbol with comment `/** Computes the hash. */` and another with no comment
- **WHEN** `specd graph find --comment "hash"` is run
- **THEN** only the symbol with `hash` in its comment is shown

#### Scenario: Combined filters

- **GIVEN** the graph contains functions and classes in `src/auth.ts` and `src/user.ts`
- **WHEN** `specd graph find --file "src/auth*" --kind function` is run
- **THEN** only functions from files matching `src/auth*` are shown

#### Scenario: No filters returns all symbols

- **GIVEN** the graph contains 50 symbols
- **WHEN** `specd graph find` is run
- **THEN** stdout shows `50 symbol(s) found:` followed by all symbols

#### Scenario: No matching symbols

- **GIVEN** the graph contains no symbols matching the query
- **WHEN** `specd graph find --name "nonexistent"` is run
- **THEN** stdout shows `0 symbol(s) found:`
- **AND** the process exits with code 0

### Requirement: Output format

#### Scenario: Text output with comment

- **GIVEN** the graph contains `function computeHash` at `src/hash.ts:8` with comment `/** Computes the hash. */`
- **WHEN** `specd graph find --name "computeHash"` is run
- **THEN** stdout contains `function computeHash  src/hash.ts:8 — /** Computes the hash. */`

#### Scenario: Text output without comment

- **GIVEN** the graph contains `class User` at `src/user.ts:1` with no comment
- **WHEN** `specd graph find --kind class` is run
- **THEN** the line for `User` shows `class User  src/user.ts:1` with no `—` suffix

#### Scenario: Comment truncated at 60 characters

- **GIVEN** a symbol has a comment longer than 60 characters
- **WHEN** `specd graph find` matches that symbol
- **THEN** the comment in text output is truncated to 60 characters

#### Scenario: JSON output

- **GIVEN** the graph contains matching symbols
- **WHEN** `specd graph find --name "validate" --format json` is run
- **THEN** stdout is a valid JSON array of `SymbolNode` objects

### Requirement: Error cases

#### Scenario: Case insensitive search by default

- **GIVEN** the graph contains a symbol named `CreateUser`
- **WHEN** `specd graph find --name "createuser"` is run
- **THEN** the symbol `CreateUser` is returned (case insensitive match)

#### Scenario: Case sensitive search with flag

- **GIVEN** the graph contains symbols `CreateUser` and `createUser`
- **WHEN** `specd graph find --name "createUser" --case-sensitive` is run
- **THEN** only `createUser` is returned

#### Scenario: Case insensitive comment search

- **GIVEN** the graph contains a symbol with comment `/** Validates User Input */`
- **WHEN** `specd graph find --comment "validates user"` is run
- **THEN** the symbol is returned (case insensitive substring match)

#### Scenario: Invalid kind exits with code 1

- **GIVEN** the user passes `--kind invalid`
- **WHEN** `specd graph find --kind invalid` is run
- **THEN** stderr contains `error:` followed by a message listing valid kinds
- **AND** the process exits with code 1

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened
- **WHEN** `specd graph find --name "test"` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3
