# Verification: Command Resource Naming

## Requirements

### Requirement: Canonical plural groups

#### Scenario: Help uses plural canonical groups

- **WHEN** users inspect CLI command-group help
- **THEN** countable resources are shown as plural canonical groups
- **AND** the groups include `changes`, `specs`, `archives`, and `drafts`

### Requirement: Singular aliases

#### Scenario: Singular aliases are accepted

- **WHEN** a command is invoked with `change`, `spec`, `archive`, or `draft`
- **THEN** the command resolves to the corresponding canonical plural group behavior

### Requirement: Help and docs canonical display

#### Scenario: Documentation and workflow examples use canonical groups

- **WHEN** command examples are rendered in project documentation or agent-authored workflow artifacts
- **THEN** examples use canonical plural groups as the primary form
- **AND** singular forms, when present, are shown only as aliases

### Requirement: Behavioral equivalence

#### Scenario: Canonical and alias invocations produce equivalent outcomes

- **GIVEN** the same subcommand and arguments
- **WHEN** the command is run with canonical plural and with singular alias groups
- **THEN** outputs and exit codes are equivalent

### Requirement: Workflow equivalence mapping

#### Scenario: Command skip requires explicit equivalence map

- **GIVEN** workflow guidance allows skipping a command due to prior command output
- **WHEN** the skip rule is defined
- **THEN** it specifies the exact output fields that satisfy each required check
- **AND** the mapping is deterministic and auditable

#### Scenario: Missing equivalence proof requires explicit command

- **GIVEN** no deterministic mapping exists for a required check
- **WHEN** workflow guidance decides whether to skip a command
- **THEN** it requires executing the explicit canonical command
