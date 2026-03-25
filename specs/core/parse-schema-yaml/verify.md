# Verification: Parse Schema YAML

## Requirements

### Requirement: Function signature

#### Scenario: Valid minimal schema YAML

- **WHEN** `parseSchemaYaml` is called with a ref `#test` and YAML content containing `name`, `version`, and a non-empty `artifacts` array
- **THEN** it returns a `SchemaYamlData` object with the parsed `name`, `version`, and `artifacts`

### Requirement: Output type

#### Scenario: Optional fields are present when declared

- **GIVEN** YAML content includes `workflow`, `metadataExtraction`, and `description`
- **WHEN** `parseSchemaYaml` is called
- **THEN** the returned `SchemaYamlData` contains `workflow`, `metadataExtraction`, and `description` with their parsed values

#### Scenario: Optional fields are undefined when omitted

- **WHEN** `parseSchemaYaml` is called with YAML content that omits `workflow`, `metadataExtraction`, and `description`
- **THEN** the returned `SchemaYamlData` has `workflow`, `metadataExtraction`, and `description` as `undefined`

### Requirement: YAML parsing

#### Scenario: Null YAML document

- **WHEN** `parseSchemaYaml` is called with YAML content that parses to `null` (e.g. an empty string or `~`)
- **THEN** it throws a `SchemaValidationError` with the ref and message `schema file must be a YAML mapping`

#### Scenario: YAML parses to an array

- **WHEN** `parseSchemaYaml` is called with YAML content that parses to an array (e.g. `- item1\n- item2`)
- **THEN** it throws a `SchemaValidationError` with the ref and message `schema file must be a YAML mapping`

#### Scenario: YAML parses to a scalar

- **WHEN** `parseSchemaYaml` is called with YAML content that parses to a scalar (e.g. `just a string`)
- **THEN** it throws a `SchemaValidationError` with the ref and message `schema file must be a YAML mapping`

### Requirement: Zod structural validation

#### Scenario: Missing required field name

- **WHEN** `parseSchemaYaml` is called with YAML containing `version` and `artifacts` but no `name`
- **THEN** it throws a `SchemaValidationError` whose message includes the path `name`

#### Scenario: Missing required field artifacts

- **WHEN** `parseSchemaYaml` is called with YAML containing `name` and `version` but no `artifacts`
- **THEN** it throws a `SchemaValidationError` whose message includes the path `artifacts`

#### Scenario: Wrong type for version

- **WHEN** `parseSchemaYaml` is called with YAML where `version` is a string (e.g. `"one"`)
- **THEN** it throws a `SchemaValidationError` whose message includes the path `version`

#### Scenario: Non-integer version

- **WHEN** `parseSchemaYaml` is called with YAML where `version` is `1.5`
- **THEN** it throws a `SchemaValidationError` whose message includes the path `version`

#### Scenario: Unknown top-level fields are ignored

- **WHEN** `parseSchemaYaml` is called with valid YAML that also contains an unknown field `futureField: true`
- **THEN** it returns a `SchemaYamlData` successfully without error
- **AND** the returned object does not contain `futureField`

### Requirement: Zod refinement rules

#### Scenario: deltaValidations on non-delta artifact

- **WHEN** `parseSchemaYaml` is called with an artifact that has `deltaValidations` but `delta` is `false` or omitted
- **THEN** it throws a `SchemaValidationError` whose message indicates `deltaValidations` is only valid when `delta` is true

#### Scenario: delta true with scope change

- **WHEN** `parseSchemaYaml` is called with an artifact that has `delta: true` and `scope: change`
- **THEN** it throws a `SchemaValidationError` whose message indicates `delta` is not valid when `scope` is `change`

### Requirement: Error handling

#### Scenario: Error message includes Zod path

- **WHEN** `parseSchemaYaml` is called with YAML where `artifacts[0].scope` has an invalid value
- **THEN** the thrown `SchemaValidationError` message includes `artifacts[0].scope`

#### Scenario: Error includes the ref

- **WHEN** `parseSchemaYaml` is called with ref `@specd/schema-broken` and invalid YAML content
- **THEN** the thrown `SchemaValidationError` contains `@specd/schema-broken` as the ref

#### Scenario: Only first Zod issue is reported

- **WHEN** `parseSchemaYaml` is called with YAML that has multiple validation errors (e.g. missing `name` and missing `artifacts`)
- **THEN** the thrown `SchemaValidationError` message reports only one issue

### Requirement: No semantic validation

#### Scenario: Duplicate artifact IDs pass structural validation

- **WHEN** `parseSchemaYaml` is called with YAML containing two artifacts with the same `id`
- **THEN** it returns a `SchemaYamlData` without error (duplicate detection is the caller's responsibility)

#### Scenario: Unknown artifact ID in requires passes structural validation

- **WHEN** `parseSchemaYaml` is called with an artifact whose `requires` references a non-existent artifact ID
- **THEN** it returns a `SchemaYamlData` without error

#### Scenario: Circular requires passes structural validation

- **WHEN** `parseSchemaYaml` is called with artifacts that have circular `requires` references
- **THEN** it returns a `SchemaYamlData` without error

### Requirement: No domain object construction

#### Scenario: Artifacts are raw Zod-inferred objects

- **WHEN** `parseSchemaYaml` returns successfully
- **THEN** the `artifacts` array contains plain objects with Zod-inferred shapes, NOT `ArtifactType` domain instances

### Requirement: formatZodPath utility

#### Scenario: Numeric path segments formatted as brackets

- **WHEN** `formatZodPath` is called with `['artifacts', 0, 'scope']`
- **THEN** it returns `artifacts[0].scope`

#### Scenario: Single string segment

- **WHEN** `formatZodPath` is called with `['name']`
- **THEN** it returns `name`

#### Scenario: Empty path

- **WHEN** `formatZodPath` is called with `[]`
- **THEN** it returns an empty string
