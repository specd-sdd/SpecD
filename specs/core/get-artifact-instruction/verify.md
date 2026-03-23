# Verification: GetArtifactInstruction

## Requirements

### Requirement: Change lookup

#### Scenario: Change not found throws ChangeNotFoundError

- **GIVEN** no change named `nonexistent` exists
- **WHEN** `GetArtifactInstruction.execute` is called with `name: "nonexistent"`
- **THEN** `ChangeNotFoundError` is thrown

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws SchemaMismatchError

- **GIVEN** a change created with schema `spec-driven`
- **AND** `SchemaProvider.get()` returns a schema named `custom-schema`
- **WHEN** `execute` is called
- **THEN** `SchemaMismatchError` is thrown

### Requirement: Artifact resolution

#### Scenario: Unknown artifact ID throws ArtifactNotFoundError

- **GIVEN** a schema with artifacts `[proposal, specs, tasks]`
- **WHEN** `GetArtifactInstruction.execute` is called with `artifactId: "nonexistent"`
- **THEN** `ArtifactNotFoundError` is thrown

### Requirement: Instruction resolution

#### Scenario: Full result with rules, instruction, and delta

- **GIVEN** an artifact with `rules.pre: [{ id: "r1", text: "Pre rule" }]`, `instruction: "Write the spec"`, `delta: true`, `deltaInstruction: "Add requirements"`, and `rules.post: [{ id: "r2", text: "Post rule" }]`
- **WHEN** `GetArtifactInstruction.execute` is called for this artifact
- **THEN** `rulesPre` is `["Pre rule"]`
- **AND** `instruction` is `"Write the spec"`
- **AND** `delta.formatInstructions` is a non-empty string
- **AND** `delta.domainInstructions` is `"Add requirements"`
- **AND** `rulesPost` is `["Post rule"]`

#### Scenario: Artifact with only instruction (no rules, no delta)

- **GIVEN** an artifact with `instruction: "Create the proposal"` and no rules or delta
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `instruction` is `"Create the proposal"`
- **AND** `rulesPre` is `[]`
- **AND** `rulesPost` is `[]`
- **AND** `delta` is `null`

#### Scenario: Artifact with no instruction content

- **GIVEN** an artifact with no `instruction`, no `rules`, and `delta: false`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `instruction` is `null`
- **AND** `rulesPre` is `[]`
- **AND** `rulesPost` is `[]`
- **AND** `delta` is `null`

#### Scenario: Delta outlines from existing specs

- **GIVEN** an artifact with `delta: true` and `change.specIds` includes `default:auth/login`
- **AND** `SpecRepository` has an existing `spec.md` for `auth/login`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `delta.outlines` includes an entry with `specId: "default:auth/login"` and a non-empty `outline`

#### Scenario: Missing existing artifact silently skipped in outlines

- **GIVEN** an artifact with `delta: true` and `change.specIds` includes `default:new/spec`
- **AND** `SpecRepository` has no existing file for `new/spec`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `delta.outlines` does not include an entry for `default:new/spec`
- **AND** no error or warning is produced

#### Scenario: rules.pre from extending schema

- **GIVEN** a base schema with `instruction: "Write specs"`
- **AND** a child schema that extends it adding `rules.pre: [{ id: "lang", text: "Use formal language" }]`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `rulesPre` is `["Use formal language"]`
- **AND** `instruction` is `"Write specs"`

#### Scenario: Template content resolved and returned

- **GIVEN** an artifact with `template: "templates/design.md"` pointing to a file containing `# Design: {{change.name}}`
- **AND** a change named `add-auth`
- **WHEN** `GetArtifactInstruction.execute` is called for this artifact
- **THEN** `template` is `"# Design: add-auth"` (variables expanded)

### Requirement: Result shape

#### Scenario: Rules-only artifact has null instruction

- **GIVEN** an artifact with `rules.post: [{ id: "r1", text: "Check grammar" }]` but no `instruction` field
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `instruction` is `null`
- **AND** `rulesPost` is `["Check grammar"]`

#### Scenario: Result includes template field

- **GIVEN** an artifact with `template: "templates/tasks.md"`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** the result includes a `template` field with the resolved file content
