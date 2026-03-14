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

### Requirement: JSON output format

#### Scenario: JSON output with instruction

- **GIVEN** an artifact with `instruction: "Write the spec"`
- **WHEN** `specd change artifact-instruction add-auth specs --format json`
- **THEN** stdout contains JSON with `"result": "ok"`, `"artifactId": "specs"`, and `"instruction": "Write the spec"`
