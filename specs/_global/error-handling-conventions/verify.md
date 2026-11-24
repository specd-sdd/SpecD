# Verification: Error Handling Conventions

## Requirements

### Requirement: Specd Error Contract

#### Scenario: Valid Specd Error

- **GIVEN** an error class inheriting from `Error`
- **AND** it defines `specd: true` and a `code: string`
- **WHEN** the error is instantiated
- **THEN** it fulfills the "Specd Error Contract"
- **AND** it is recognized as a first-class error by delivery mechanisms

### Requirement: core Mandate

#### Scenario: Core error missing SpecdError parent

- **GIVEN** a domain error in `@specd/core`
- **WHEN** the error is defined
- **THEN** it MUST extend the canonical `SpecdError` base class
- **AND** failure to do so is a convention violation

### Requirement: Monorepo Package Mandate

#### Scenario: Monorepo package error hierarchy

- **GIVEN** a package `@specd/cli` that depends on `@specd/core`
- **WHEN** defining its base error class `SpecdCliError`
- **THEN** `SpecdCliError` MUST extend `SpecdError`
- **AND** all CLI errors MUST extend `SpecdCliError`

### Requirement: Error Code Naming

#### Scenario: Non-conforming error code

- **GIVEN** an error with code `ChangeNotFound` or `change-not-found`
- **WHEN** the error is used
- **THEN** it is a convention violation — codes MUST be `UPPER_SNAKE_CASE`

### Requirement: Actionable Messaging

#### Scenario: Opaque error message

- **GIVEN** a validation error with message "Invalid input"
- **WHEN** reported to the user
- **THEN** it is a convention violation — messages MUST be actionable (e.g., "Invalid change name. Use kebab-case slugs.")

### Requirement: Metadata Extraction

#### Scenario: Error includes contextual metadata

- **GIVEN** an error class that includes a `specId` property
- **WHEN** the error is caught by a structured formatter (JSON/TOON)
- **THEN** the `specId` is included in the output metadata
- **AND** it provides additional context for programmatic handling

### Requirement: JSDoc Documentation

#### Scenario: Error class missing JSDoc documentation

- **GIVEN** a new `SpecdError` subclass
- **WHEN** the code is reviewed or indexed
- **THEN** it MUST have a JSDoc comment describing the error and its machine-readable code
- **AND** failure to do so is a convention violation

### Requirement: Host-Neutral Core Errors and Delivery Hints

#### Scenario: Core error message omits CLI flags and commands

- **GIVEN** a domain or application error in `@specd/core`
- **WHEN** the error is instantiated
- **THEN** its `message` describes the invariant violation without CLI flags (`--force`, `--next`, etc.), `specd ...` command syntax, or agent slash commands (`/specd-*`)
- **AND** relevant context is exposed as structured metadata properties

#### Scenario: Core error message omits use-case input names and unprefixed commands

- **GIVEN** a core error that blocks an overwrite, a consent revocation, or an operation on an uninitialized spec
- **WHEN** the error is instantiated
- **THEN** its `message` contains no imperative use-case input name (such as `Pass force`, `allowOutOfScope`, or `skipChecks`)
- **AND** its `message` contains no input-name phrasing such as `without force` (including the historical-implementation guard error)
- **AND** its `message` contains no CLI command syntax even when the `specd` prefix is omitted (such as `run "specs init"`)
- **AND** `@specd/cli` renders the remedy through a hint resolved from the error code and metadata

#### Scenario: Error with a recovery action has a CLI hint

- **GIVEN** a core error whose recovery used to be embedded in its message (for example `VERIFICATION_STALE`)
- **WHEN** `@specd/cli` handles it
- **THEN** the CLI renders the recovery as a hint resolved from the error code and metadata
- **AND** the core `message` is unchanged and contains no command

#### Scenario: CLI translates typed core error with active command context

- **GIVEN** a `@specd/core` error with a machine-readable `code` and metadata
- **WHEN** `@specd/cli` handles the error for a specific command
- **THEN** the CLI renders a command-appropriate `hint` without mutating the core error `message`

### Requirement: Host-Neutral Core Projections

#### Scenario: Core projections omit delivery syntax

- **GIVEN** a `NextAction`, `Blocker`, `CheckResult`, or validity detail produced by `@specd/core`
- **WHEN** it is inspected
- **THEN** it contains no `specd ...` command, no `--skip-checks` style flag, and no `/specd-*` slash command
- **AND** guidance is expressed as `intent`, `action`, `isSkippable`, and `checkId`

#### Scenario: Host translates structured guidance in its presenter

- **GIVEN** a core `nextAction` with `action: { kind: 'approve-spec' }`
- **WHEN** `@specd/cli` renders it
- **THEN** the CLI presenter produces the command string
- **AND** an `@specd/mcp` host MAY map the same action to a tool call without parsing CLI text

#### Scenario: Unknown action kind falls back to guidance

- **GIVEN** a plugin action `{ kind: '@audit.fix', guidance: 'Run the audit fixer' }`
- **WHEN** a host has no mapping for that kind
- **THEN** the host shows `guidance` and does not fabricate a command or flag
