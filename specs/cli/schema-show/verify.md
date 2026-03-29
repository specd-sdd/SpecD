# Verification: Schema Show

## Requirements

### Requirement: Command signature

#### Scenario: --raw flag is accepted

- **WHEN** `specd schema show --raw` is run
- **THEN** the command does not error on the unknown flag
- **AND** the process exits with code 0

#### Scenario: --templates flag is accepted

- **WHEN** `specd schema show --templates` is run
- **THEN** the command does not error on the unknown flag
- **AND** the process exits with code 0

#### Scenario: --raw and --templates can be combined

- **WHEN** `specd schema show --raw --templates` is run
- **THEN** the command does not error
- **AND** the process exits with code 0

### Requirement: Output format

#### Scenario: Text output shows schema name, kind, artifacts, and workflow

- **GIVEN** a valid schema with name `specd-std` version `1`, `kind: schema`, and declared artifacts and workflow steps
- **WHEN** `specd schema show` is run
- **THEN** stdout contains the schema name, version, and kind, an `artifacts:` section, and a `workflow:` section
- **AND** the process exits with code 0

#### Scenario: Text output shows extends when present

- **GIVEN** a schema that declares `extends: '@specd/schema-std'`
- **WHEN** `specd schema show` is run
- **THEN** stdout contains `extends: @specd/schema-std`

#### Scenario: Text output shows plugin count when plugins are configured

- **GIVEN** `specd.yaml` declares `schemaPlugins: ['@specd/plugin-rfc']`
- **WHEN** `specd schema show` is run
- **THEN** stdout contains `plugins: 1 applied`

#### Scenario: Plugins line omitted when showing schema by ref

- **GIVEN** `specd.yaml` declares `schemaPlugins: ['@specd/plugin-rfc']`
- **WHEN** `specd schema show @specd/schema-std` is run
- **THEN** stdout does NOT contain a `plugins:` line

#### Scenario: Optional and required artifacts distinguished

- **GIVEN** the schema declares artifact `proposal` as `optional: true` and `spec` as `optional: false`
- **WHEN** `specd schema show` is run
- **THEN** `proposal` is shown as `optional` and `spec` as `required`

#### Scenario: Requires listed for artifacts

- **GIVEN** the schema declares artifact `spec` with `requires: ["proposal"]`
- **WHEN** `specd schema show` is run
- **THEN** the `spec` line shows `requires=[proposal]`

#### Scenario: Empty requires omitted in text mode

- **GIVEN** the schema declares artifact `proposal` with no `requires`
- **WHEN** `specd schema show` is run
- **THEN** the `proposal` line does not show a `requires` field

#### Scenario: JSON output includes all schema fields

- **GIVEN** a schema with artifacts that declare `instruction`, `rules`, `validations`, `hooks`, and `metadataExtraction`
- **WHEN** `specd schema show --format json` is run
- **THEN** stdout is valid JSON with `schema`, `plugins`, `mode`, `artifacts`, `workflow`, and `metadataExtraction`
- **AND** each artifact entry includes all fields from the Schema entity (e.g. `instruction`, `rules`, `validations`, `deltaInstruction`, `preHashCleanup`, `taskCompletionCheck`)
- **AND** each workflow entry includes `hooks` and `requiresTaskCompletion`
- **AND** the process exits with code 0

#### Scenario: Template field shows reference path by default

- **GIVEN** a schema with artifact `proposal` that declares `template: templates/proposal.md`
- **WHEN** `specd schema show --format json` is run
- **THEN** the `proposal` artifact entry includes `"template": "templates/proposal.md"`

#### Scenario: Template content resolved with --templates

- **GIVEN** a schema with artifact `proposal` that declares `template: templates/proposal.md`
- **AND** the template file contains `# Proposal template content`
- **WHEN** `specd schema show --templates --format json` is run
- **THEN** the `proposal` artifact entry's `template` field contains the file content `# Proposal template content`

#### Scenario: Show schema by ref displays resolved schema

- **GIVEN** `@specd/schema-std` is installed as an npm package
- **WHEN** `specd schema show @specd/schema-std` is run
- **THEN** stdout contains the schema name and version from that package
- **AND** the process exits with code 0

#### Scenario: Show schema by ref with JSON includes mode ref

- **GIVEN** `@specd/schema-std` is installed
- **WHEN** `specd schema show @specd/schema-std --format json` is run
- **THEN** the JSON output contains `"mode": "ref"`

#### Scenario: Show schema by file displays resolved schema

- **GIVEN** a valid schema file at `./test-schema.yaml`
- **WHEN** `specd schema show --file ./test-schema.yaml` is run
- **THEN** stdout contains the schema name and version from the file
- **AND** the process exits with code 0

#### Scenario: Show schema by file with JSON includes mode file

- **GIVEN** a valid schema file at `./test-schema.yaml`
- **WHEN** `specd schema show --file ./test-schema.yaml --format json` is run
- **THEN** the JSON output contains `"mode": "file"`

#### Scenario: Raw mode shows unresolved schema data

- **GIVEN** a schema that declares `extends: '@specd/schema-std'`
- **WHEN** `specd schema show --raw --format json` is run
- **THEN** the JSON output contains the `extends` field with the unresolved reference
- **AND** the output does NOT contain `mode` or `plugins` fields
- **AND** artifacts from the parent schema are NOT included — only those declared in the schema file itself

#### Scenario: Raw mode works with ref

- **GIVEN** `@specd/schema-std` is installed
- **WHEN** `specd schema show @specd/schema-std --raw --format json` is run
- **THEN** the JSON output contains the raw parsed data from the schema package file
- **AND** no extends chain resolution is applied

#### Scenario: Raw mode with --templates resolves template references

- **GIVEN** a schema with artifact `proposal` that declares `template: templates/proposal.md`
- **WHEN** `specd schema show --raw --templates --format json` is run
- **THEN** the `proposal` artifact's `template` field contains the resolved file content

#### Scenario: Raw mode in project shows base schema without overrides

- **GIVEN** `specd.yaml` references `@specd/schema-std` and declares `schemaOverrides`
- **WHEN** `specd schema show --raw --format json` is run
- **THEN** the output shows the base schema data from `@specd/schema-std`
- **AND** the `schemaOverrides` are NOT applied

### Requirement: Error cases

#### Scenario: Schema cannot be resolved

- **GIVEN** `specd.yaml` references a schema that does not exist
- **WHEN** `specd schema show` is run
- **THEN** the command exits with code 3
- **AND** stderr contains a `fatal:` message

#### Scenario: Ref cannot be resolved

- **WHEN** `specd schema show @nonexistent/schema` is run
- **THEN** the command exits with code 3

#### Scenario: File does not exist

- **WHEN** `specd schema show --file ./nonexistent.yaml` is run
- **THEN** the command exits with code 3

#### Scenario: Ref and --file are mutually exclusive

- **WHEN** `specd schema show @specd/schema-std --file ./schema.yaml` is run
- **THEN** stderr contains `[ref] and --file are mutually exclusive`
- **AND** the command exits with code 1
