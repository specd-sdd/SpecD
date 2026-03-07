# Verification: Spec List

## Requirements

### Requirement: Command signature

#### Scenario: Extra arguments rejected

- **WHEN** `specd spec list some-arg` is run with an unexpected argument
- **THEN** the command exits with code 1 and prints a usage error to stderr

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

### Requirement: Status resolution

#### Scenario: Status fresh when all hashes match

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with `contentHashes` whose SHA-256 values match the current `spec.md` and `verify.md` files
- **WHEN** `specd spec list --metadata-status` is run
- **THEN** the row for `default:auth/login` shows `fresh` as its status

#### Scenario: Status stale when hash differs

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with a `contentHashes` entry for `spec.md` whose recorded hash does not match the current file content
- **WHEN** `specd spec list --metadata-status` is run
- **THEN** the row for `default:auth/login` shows `stale` as its status

#### Scenario: Status missing when no metadata file

- **GIVEN** `default:auth/login` has no `.specd-metadata.yaml` file
- **WHEN** `specd spec list --metadata-status` is run
- **THEN** the row for `default:auth/login` shows `missing` as its status

#### Scenario: Status stale when contentHashes absent

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` but no `contentHashes` field
- **WHEN** `specd spec list --metadata-status` is run
- **THEN** the row for `default:auth/login` shows `stale` as its status

#### Scenario: Status not shown without flag

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml`
- **WHEN** `specd spec list` is run without `--metadata-status`
- **THEN** the row for `default:auth/login` does not include any status text

#### Scenario: Filter by single status

- **GIVEN** the project has three specs: one `fresh`, one `stale`, one `missing`
- **WHEN** `specd spec list --metadata-status stale` is run
- **THEN** only the spec with `stale` status is shown

#### Scenario: Filter by multiple statuses

- **GIVEN** the project has three specs: one `fresh`, one `stale`, one `missing`
- **WHEN** `specd spec list --metadata-status stale,missing` is run
- **THEN** the `stale` and `missing` specs are shown
- **AND** the `fresh` spec is not shown

#### Scenario: JSON output with status

- **GIVEN** workspace `default` has spec `auth/login` with `fresh` metadata
- **WHEN** `specd spec list --metadata-status --format json` is run
- **THEN** the entry for `default:auth/login` has `"status": "fresh"`

### Requirement: Output format

#### Scenario: Specs listed per workspace with title

- **GIVEN** the project has workspace `default` with specs `auth/login` (title `Login`) and `auth/register` (title `Register`)
- **WHEN** `specd spec list` is run
- **THEN** stdout shows `default` followed by rows containing `default:auth/login  Login` and `default:auth/register  Register`
- **AND** the process exits with code 0

#### Scenario: Specs in lexicographic order within workspace

- **GIVEN** the `default` workspace contains specs `z/spec`, `a/spec`, and `m/spec`
- **WHEN** `specd spec list` is run
- **THEN** the specs are listed in alphabetical order: `default:a/spec`, `default:m/spec`, `default:z/spec`

#### Scenario: JSON output without --summary

- **GIVEN** workspace `default` has spec `auth/login` with title `Login`
- **WHEN** `specd spec list --format json` is run
- **THEN** stdout is valid JSON with `workspaces[0].specs[0]` having `path` equal to `"default:auth/login"` and `title` but no `summary` key

#### Scenario: JSON output with --summary and available summary

- **GIVEN** workspace `default` has spec `auth/login` with title `Login` and description `Handles login`
- **WHEN** `specd spec list --summary --format json` is run
- **THEN** stdout is valid JSON with `workspaces[0].specs[0]` having `path` equal to `"default:auth/login"`, `title`, and `summary` equal to `"Handles login"`

#### Scenario: JSON output with --summary but no summary available

- **GIVEN** workspace `default` has spec `auth/register` with no extractable summary
- **WHEN** `specd spec list --summary --format json` is run
- **THEN** the entry for `default:auth/register` has `path` and `title` but no `summary` key

### Requirement: Empty output

#### Scenario: Workspace with no specs

- **GIVEN** the `billing` workspace exists but has no specs
- **WHEN** `specd spec list` is run
- **THEN** stdout shows the `billing` heading followed by `  (none)`

#### Scenario: No workspaces at all

- **GIVEN** `specd.yaml` has no workspaces configured
- **WHEN** `specd spec list` is run
- **THEN** stdout contains `no workspaces configured`
- **AND** the process exits with code 0
