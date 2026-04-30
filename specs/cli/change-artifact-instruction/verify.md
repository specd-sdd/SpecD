# Verification: Change Artifact Instruction

## Requirements

### Requirement: Exit code 0 on success

#### Scenario: Instruction returned

- **GIVEN** a change `add-auth` with artifact `specs` that has an instruction
- **WHEN** `specd change artifact-instruction add-auth specs`
- **THEN** the command exits with code 0
- **AND** stdout contains the instruction text

#### Scenario: No instruction content

- **GIVEN** an artifact with no instruction, rules, or delta
- **WHEN** `specd change artifact-instruction add-auth proposal`
- **THEN** the command exits with code 0
- **AND** stdout contains `no instructions`

### Requirement: Exit code 1 on domain errors

#### Scenario: Unknown artifact ID

- **GIVEN** a schema that does not define an artifact `nonexistent`
- **WHEN** `specd change artifact-instruction add-auth nonexistent`
- **THEN** the command exits with code 1
- **AND** stderr contains an error message

### Requirement: Text output format

#### Scenario: Labelled sections in text output

- **GIVEN** an artifact with `instruction: "Write the spec"` and `rules.pre: [{ id: "r1", text: "Use formal language" }]`
- **WHEN** `specd change artifact-instruction add-auth specs`
- **THEN** stdout contains a `[rules.pre]` section with "Use formal language"
- **AND** stdout contains an `[instruction]` section with "Write the spec"
- **AND** sections are separated by blank lines

#### Scenario: Template section in text output

- **GIVEN** an artifact with a declared template
- **WHEN** `specd change artifact-instruction add-auth specs`
- **THEN** stdout contains a `[template]` section with the template content

### Requirement: JSON output format

#### Scenario: JSON output includes availableOutlines only

- **GIVEN** a delta-enabled artifact and change specs with existing outlineable files
- **WHEN** `specd changes artifact-instruction add-auth specs --format json` is executed
- **THEN** `delta.availableOutlines` is present as a string array of spec IDs
- **AND** `delta.outlines` is not present in the response

#### Scenario: Outline details retrieved on demand via specs outline

- **GIVEN** `availableOutlines` contains `core:core/config`
- **WHEN** `specd specs outline core:core/config --artifact specs` is executed
- **THEN** the command returns the full outline structure for the requested artifact

### Requirement: Command signature

#### Scenario: Canonical command references in examples

- **WHEN** users inspect command examples for outline retrieval
- **THEN** examples use canonical plural command form `specd specs outline <specPath> --artifact <artifactId>`
