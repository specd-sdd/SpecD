# Verification: Project Context Specs

## Requirements

### Requirement: Command signature

#### Scenario: Repeatable workspace option is accepted

- **WHEN** the user runs `specd project context-specs --workspace core --workspace cli`
- **THEN** the command invokes resolution with `workspaces: ['core', 'cli']`
- **AND** exits successfully when both names exist

#### Scenario: Positional workspace argument is rejected

- **WHEN** the user runs `specd project context-specs core`
- **THEN** the command fails due to excess arguments

### Requirement: Host wiring

#### Scenario: Command uses kernel execute via resolveCliContext

- **WHEN** `project context-specs` runs
- **THEN** it obtains a kernel through `resolveCliContext`
- **AND** calls `kernel.project.resolveContextSpecs.execute`
- **AND** does not call a dedicated SDK orchestration wrapper for this path

### Requirement: Output shape

#### Scenario: Text prints project and workspaces sections

- **GIVEN** resolution returns project IDs and at least one workspace bucket
- **WHEN** `--format text` is used without `--workspaces-only`
- **THEN** stdout contains a `project:` section and a `workspaces:` section with nested workspace names

#### Scenario: Text omits project section with workspaces-only

- **WHEN** `--workspaces-only --format text` is used
- **THEN** stdout has no `project:` section
- **AND** still prints `workspaces:`

#### Scenario: Structured formats keep empty project array

- **WHEN** `--workspaces-only --format toon` is used
- **THEN** the structured payload includes `project` as an empty array

### Requirement: Errors

#### Scenario: Unknown workspace surfaces as SpecdError exit 1

- **WHEN** the user passes `--workspace does-not-exist`
- **AND** Core rejects with `InvalidInputError` (`INVALID_INPUT`)
- **THEN** the command fails through shared `handleError`
- **AND** the process exits with code `1`
- **AND** stderr uses the `error:` prefix (not `fatal:`)
- **AND** does not print a successful partitioned result

### Requirement: Relationship to project context

#### Scenario: Command does not render context entry bodies

- **WHEN** `project context-specs` succeeds
- **THEN** stdout contains only partitioned IDs (and text placeholders such as `(none)`)
- **AND** does not emit rendered `context:` instruction or file bodies
