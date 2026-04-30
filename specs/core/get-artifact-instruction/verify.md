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

#### Scenario: Delta availableOutlines from existing specs

- **GIVEN** an artifact with `delta: true` and `change.specIds` includes `default:auth/login`
- **AND** `SpecRepository` has an existing `spec.md` for `auth/login`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `delta.availableOutlines` includes `"default:auth/login"`
- **AND** no inline outline tree is returned in this payload

#### Scenario: Missing existing artifact silently skipped in availableOutlines

- **GIVEN** an artifact with `delta: true` and `change.specIds` includes `default:new/spec`
- **AND** `SpecRepository` has no existing file for `new/spec`
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `delta.availableOutlines` does not include `"default:new/spec"`
- **AND** no error or warning is produced

### Requirement: Result shape

#### Scenario: Rules-only artifact has null instruction

- **GIVEN** an artifact with `rules.post: [{ id: "r1", text: "Check grammar" }]` but no `instruction` field
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `instruction` is `null`
- **AND** `rulesPost` is `["Check grammar"]`

#### Scenario: Delta result exposes availableOutlines

- **GIVEN** a delta-enabled artifact and existing spec artifacts in change scope
- **WHEN** `GetArtifactInstruction.execute` is called
- **THEN** `delta.availableOutlines` is present as `string[]`
- **AND** consumers can retrieve full outline content on demand using `specd specs outline <specPath> --artifact <artifactId>`
