# Verification: Spec List

## Requirements

### Requirement: Command signature

#### Scenario: Canonical plural command

- **WHEN** `specd specs list --format json` is run
- **THEN** the command executes using the canonical plural group

#### Scenario: Singular alias command

- **WHEN** `specd spec list --format json` is run
- **THEN** it behaves as an alias of `specd specs list --format json`

#### Scenario: Omitted limit returns full workspace catalog

- **GIVEN** workspace `default` contains more than 100 specs
- **WHEN** `specd spec list --workspace default --format json` is run without `--limit`
- **THEN** `workspaces[0].meta.limit` equals `workspaces[0].meta.total`
- **AND** `workspaces[0].specs` contains every spec in that workspace

#### Scenario: --limit all omits limit from ListSpecs

- **WHEN** `specd spec list --limit all --format json` is run
- **THEN** `ListSpecs.execute` is called without a `limit` option

#### Scenario: --page requires numeric --limit

- **WHEN** `specd spec list --page 2` is run without a numeric `--limit`
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListSpecs.execute` is not invoked

#### Scenario: --page and --after-key are mutually exclusive

- **WHEN** `specd spec list --page 2 --after-key default:auth/login` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListSpecs.execute` is not invoked

#### Scenario: --count and --summary are mutually exclusive

- **WHEN** `specd spec list --count --summary` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListSpecs.execute` is not invoked

### Requirement: Workspace filtering

#### Scenario: Workspaces grouped using orchestrated list

- **WHEN** `specd spec list` is run
- **THEN** it iterates through the `ProjectWorkspace` entities provided by `ListWorkspaces`
- **AND** it renders a group for every orchestrated workspace (even if empty)

#### Scenario: Single workspace filter in text mode

- **GIVEN** the project has workspace `default` with specs and workspace `billing` with specs
- **WHEN** `specd spec list --workspace default` is run
- **THEN** only workspace `default` group is rendered
- **AND** workspace `billing` does not appear

### Requirement: List options forwarding

#### Scenario: Pagination flags forwarded to ListSpecs

- **WHEN** `specd spec list --limit 25 --page 2 --format json` is run
- **THEN** `ListSpecs.execute` is called with `limit` 25 and `page` 2

#### Scenario: Keyset cursor uses path only

- **WHEN** `specd spec list --after-key default:auth/login --format json` is run
- **THEN** `ListSpecs.execute` is called with `after.key` equal to `default:auth/login`
- **AND** no `after.id` field is set

#### Scenario: Include flags forwarded only when present

- **WHEN** `specd spec list --summary --format json` is run
- **THEN** `ListSpecs.execute` is called with `includeSummary: true`

#### Scenario: CLI does not re-sort or paginate after the use case returns

- **GIVEN** `ListSpecs.execute` returns specs in capability path ascending order for a workspace
- **WHEN** `specd spec list --workspace default` is run
- **THEN** stdout rows appear in the same order as returned by the use case

### Requirement: Title resolution

#### Scenario: Title from metadata

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with `title: "Login Flow"`
- **WHEN** `specd spec list` is run
- **THEN** the row for `default:auth/login` shows `Login Flow` as its title

#### Scenario: Title fallback to last path segment

- **GIVEN** `default:auth/login` has no `.specd-metadata.yaml` or its `title` field is absent
- **WHEN** `specd spec list` is run
- **THEN** the row for `default:auth/login` shows `login` as its title

### Requirement: Summary resolution

#### Scenario: Summary from metadata description

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with `description: "Handles login"`
- **WHEN** `specd spec list --summary` is run
- **THEN** the row for `default:auth/login` shows `Handles login` as its summary

#### Scenario: Summary from metadata optimizedDescription

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with `optimizedDescription: "Terse login summary"`
- **WHEN** `specd spec list --summary` is run
- **THEN** the row for `default:auth/login` shows `Terse login summary` as its summary

#### Scenario: Summary fallback — paragraph after H1

- **GIVEN** `default:auth/login` has no metadata `description` but `spec.md` begins with `# Auth Login\n\nHandles the login flow.\n\n## Overview`
- **WHEN** `specd spec list --summary` is run
- **THEN** the row for `default:auth/login` shows `Handles the login flow.` as its summary

#### Scenario: Summary fallback — Overview section

- **GIVEN** `default:auth/login` has no metadata `description` and `spec.md` has no paragraph after the H1, but has `## Overview\n\nManages authentication.`
- **WHEN** `specd spec list --summary` is run
- **THEN** the row for `default:auth/login` shows `Manages authentication.` as its summary

#### Scenario: No summary available

- **GIVEN** `default:auth/login` has no metadata `description` and `spec.md` has no extractable summary
- **WHEN** `specd spec list --summary` is run
- **THEN** the row for `default:auth/login` shows the title only, with no summary text
- **AND** the process exits with code 0

#### Scenario: Summary not shown without flag

- **GIVEN** `default:auth/login` has metadata with a `description`
- **WHEN** `specd spec list` is run without `--summary`
- **THEN** the row for `default:auth/login` does not include any summary text

### Requirement: Output format

#### Scenario: Specs listed per workspace with title

- **GIVEN** the project has workspace `default` with specs `auth/login` (title `Login`) and `auth/register` (title `Register`)
- **WHEN** `specd spec list` is run
- **THEN** stdout shows `default` followed by rows containing `default:auth/login  Login` and `default:auth/register  Register`
- **AND** the process exits with code 0

#### Scenario: JSON output without --summary

- **GIVEN** workspace `default` has spec `auth/login` with title `Login`
- **WHEN** `specd spec list --format json` is run
- **THEN** stdout is valid JSON with `workspaces[0].specs[0]` having `path` equal to `"default:auth/login"` and `title`
- **AND** `workspaces[0].meta` contains `total`, `count`, `limit`, and `page`
- **AND** `workspaces[0].specs[0]` has no `summary` key

#### Scenario: JSON output with --summary and available summary

- **GIVEN** workspace `default` has spec `auth/login` with title `Login` and description `Handles login`
- **WHEN** `specd spec list --summary --format json` is run
- **THEN** stdout is valid JSON with `workspaces[0].specs[0]` having `path` equal to `"default:auth/login"`, `title`, and `summary` equal to `"Handles login"`

#### Scenario: JSON output with --summary but no summary available

- **GIVEN** workspace `default` has spec `auth/register` with no extractable summary
- **WHEN** `specd spec list --summary --format json` is run
- **THEN** the entry for `default:auth/register` has `path` and `title` but no `summary` key

#### Scenario: Truncation hint per workspace group when partial

- **GIVEN** workspace `default` has 125 specs
- **WHEN** `specd spec list --workspace default --limit 100` is run
- **THEN** stdout contains `showing 100 of 125 (use --limit/--page)` after the `default` group table

#### Scenario: No truncation hint when limit omitted

- **GIVEN** workspace `default` has 125 specs
- **WHEN** `specd spec list --workspace default` is run without `--limit`
- **THEN** stdout does not contain `showing`

#### Scenario: CLI preserves repository order within workspace

- **GIVEN** `ListSpecs.execute` returns `default:a/spec` before `default:m/spec`
- **WHEN** `specd spec list --workspace default` is run
- **THEN** `default:a/spec` appears before `default:m/spec` in stdout

#### Scenario: No metadataStatus field or column present

- **WHEN** `specd spec list --format json` is run
- **THEN** no entry includes a `metadataStatus` field
- **AND** in text mode, no `METADATA STATUS` column header is printed

#### Scenario: Count output in text mode for multiple workspaces

- **GIVEN** workspace `alpha` has 1 spec and workspace `beta` has 1 spec
- **WHEN** `specd spec list --count` is run
- **THEN** stdout contains `Total: 2`
- **AND** stdout contains `Workspaces:`
- **AND** stdout contains `alpha: 1`
- **AND** stdout contains `beta: 1`

#### Scenario: Count output in text mode for single workspace

- **GIVEN** workspace `default` has 3 specs
- **WHEN** `specd spec list --count` is run
- **THEN** stdout contains `Total: 3`
- **AND** stdout contains `Workspaces:`
- **AND** stdout contains `default: 3`

#### Scenario: Count output in text mode filtered by workspace

- **GIVEN** workspace `alpha` has 1 spec and workspace `beta` has 1 spec
- **WHEN** `specd spec list --count --workspace alpha` is run
- **THEN** stdout contains `alpha: 1`
- **AND** stdout does not contain `beta`

#### Scenario: Count output in JSON mode

- **GIVEN** workspace `alpha` has 1 spec and workspace `beta` has 1 spec
- **WHEN** `specd spec list --count --format json` is run
- **THEN** stdout is valid JSON with `total` equal to 2
- **AND** `workspaces` contains `[{ name: "alpha", count: 1 }, { name: "beta", count: 1 }]`

#### Scenario: Count output in JSON mode filtered by workspace

- **GIVEN** workspace `alpha` has 1 spec and workspace `beta` has 1 spec
- **WHEN** `specd spec list --count --workspace alpha --format json` is run
- **THEN** stdout is valid JSON with `total` equal to 1
- **AND** `workspaces` contains `[{ name: "alpha", count: 1 }]`

#### Scenario: Count output in TOON mode

- **GIVEN** workspace `default` has 3 specs
- **WHEN** `specd spec list --count --format toon` is run
- **THEN** stdout contains `total: 3`
- **AND** stdout contains `workspaces`
- **AND** stdout contains `default`

### Requirement: Empty output

#### Scenario: Orchestrated empty workspace shown as (none)

- **GIVEN** an empty workspace `billing` in the orchestrated list
- **WHEN** `specd spec list` is run
- **THEN** stdout shows the `billing` heading followed by `  (none)`

### Requirement: Error cases

#### Scenario: Spec filesystem cannot be read exits code 3

- **GIVEN** the spec filesystem has an I/O error preventing reads
- **WHEN** `specd spec list` is run
- **THEN** the command exits with code 3
