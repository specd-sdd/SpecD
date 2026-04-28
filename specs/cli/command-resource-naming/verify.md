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

#### Scenario: Documentation examples use canonical groups

- **WHEN** command examples are rendered in project documentation
- **THEN** examples use canonical plural groups as the primary form
- **AND** singular forms, when present, are shown only as aliases

### Requirement: Behavioral equivalence

#### Scenario: Canonical and alias invocations produce equivalent outcomes

- **GIVEN** the same subcommand and arguments
- **WHEN** the command is run with canonical plural and with singular alias groups
- **THEN** outputs and exit codes are equivalent
