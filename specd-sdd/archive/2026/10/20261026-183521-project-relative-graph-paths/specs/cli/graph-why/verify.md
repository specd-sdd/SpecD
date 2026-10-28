# Verification: Graph Why

## Requirements

### Requirement: Command signature

#### Scenario: Path is required

- **WHEN** `specd graph why` runs with no argument
- **THEN** it fails with a usage error

#### Scenario: Accepted path forms

- **WHEN** `graph why` receives a project-relative path, an absolute path or `workspace:path`
- **THEN** each is passed to `runGraphWhy`

#### Scenario: Context options

- **WHEN** `--config` and `--path` are both supplied
- **THEN** it fails as the other `graph` subcommands do

#### Scenario: Thin presenter

- **WHEN** the command is inspected
- **THEN** it imports `@specd/sdk` and does not import `@specd/code-graph` or `@specd/core` for evaluation

### Requirement: Text output

#### Scenario: Excluded path

- **GIVEN** a path excluded by a global pattern
- **WHEN** `graph why` renders in text mode
- **THEN** it shows the verdict, the matched pattern, its layer and its configuration key

#### Scenario: Global exclusion beat a workspace negation

- **GIVEN** a global exclusion and a workspace `!` negation
- **WHEN** it renders
- **THEN** the text states that the global exclusion prevented the workspace pattern from re-including the path

#### Scenario: Multiple owners

- **GIVEN** two owners
- **WHEN** it renders
- **THEN** both candidates are shown with equal prominence, and the `MULTIPLE_OWNERS` diagnostic is printed

#### Scenario: Indexable path

- **WHEN** the path is indexable
- **THEN** the text shows category, node kind and each passed step

#### Scenario: gitignore origin

- **GIVEN** a `.gitignore` match
- **WHEN** it renders
- **THEN** the `.gitignore` file and line are shown

### Requirement: Structured output

#### Scenario: JSON equals the SDK result

- **WHEN** `--format json` is used
- **THEN** the output is the `RunGraphWhyResult` with `input`, `projectRelativePath`, `verdict`, `owners`, `candidates` and `diagnostics`

#### Scenario: TOON equals the SDK result

- **WHEN** `--format toon` is used
- **THEN** it carries the same data

### Requirement: Exit status

#### Scenario: Excluded is a successful answer

- **WHEN** an explanation is produced for an excluded path
- **THEN** the exit status is 0

#### Scenario: Unknown workspace

- **WHEN** the input is `nope:src/a.ts`
- **THEN** the exit status is non-zero and the error carries `UNKNOWN_WORKSPACE`

#### Scenario: Missing configuration

- **GIVEN** no discoverable `specd.yaml`
- **WHEN** the command runs
- **THEN** it fails through the standard CLI error contract

### Requirement: Staleness notice

#### Scenario: Stale graph

- **GIVEN** a stale graph
- **WHEN** the command runs
- **THEN** the usual staleness notice is printed and rule evaluation is unaffected

### Requirement: CLI reference documentation

#### Scenario: Documented

- **WHEN** `docs/cli/cli-reference.md` is read
- **THEN** `graph why` is documented with signature, accepted path forms, output fields and examples
- **AND** the docs index and sidebar include it

## Spec Dependencies

- `sdk:run-graph-why`
- `cli:entrypoint`
- `core:config`
