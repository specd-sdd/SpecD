# Verification: CountTasks

## Requirements

### Requirement: Counts qualifying task artifacts

#### Scenario: Safe patterns count across multiple files

- **GIVEN** a task-capable artifact has two non-empty files with complete and incomplete markdown checkboxes
- **WHEN** `CountTasks.execute()` runs
- **THEN** its per-artifact result aggregates the matches from both files

#### Scenario: Unsafe pattern does not fail the query

- **GIVEN** a task-capable artifact declares a pattern rejected by `safeRegex`
- **WHEN** `CountTasks.execute()` runs
- **THEN** the query does not throw
- **AND** the rejected pattern contributes no matches
- **AND** the non-empty qualifying artifact remains in `byArtifact` with zeroes when both patterns are rejected

#### Scenario: Resolved schema provides markdown-checkbox defaults

- **GIVEN** a task-capable artifact has a completion check with an omitted pattern
- **AND** schema construction materializes the missing pattern before `CountTasks.execute()` runs
- **WHEN** the artifact content contains standard complete and incomplete markdown checkboxes
- **THEN** `CountTasks` counts them using the resolved schema patterns without substituting a fallback

#### Scenario: Resolved complete pattern accepts uppercase marker

- **GIVEN** schema construction materializes an omitted complete pattern as `^\s*-\s+\[[xX]\]`
- **WHEN** `CountTasks.execute()` processes content containing `- [X] completed`
- **THEN** the completed item is counted

### Requirement: Returns per-artifact and aggregate completion status

#### Scenario: Aggregate combines qualifying artifacts

- **GIVEN** two qualifying artifacts have task counts of 2 complete and 1 incomplete, and 3 complete and 0 incomplete
- **WHEN** `CountTasks.execute()` runs
- **THEN** `byArtifact` contains both artifact IDs
- **AND** `total` is 5 complete, 1 incomplete, and 6 total

#### Scenario: Empty task content returns zero aggregate

- **GIVEN** no task-capable artifact has an existing non-empty file
- **WHEN** `CountTasks.execute()` runs
- **THEN** `byArtifact` is empty
- **AND** `total` is 0 complete, 0 incomplete, and 0 total

### Requirement: Does not infer task capability from counts

#### Scenario: Missing content does not imply missing capability

- **GIVEN** an artifact declares task capability but has no existing artifact file
- **WHEN** `CountTasks.execute()` runs
- **THEN** `byArtifact` has no entry for that artifact
- **AND** the result does not report an error about task capability

### Requirement: Supports composition and kernel wiring

#### Scenario: Kernel exposes shared task-counting query

- **WHEN** `createKernel(config)` is called
- **THEN** `kernel.changes.countTasks` is a ready `CountTasks` use case

#### Scenario: Config factory delegates through resolver dependencies

- **WHEN** `createCountTasks(config, options?)` is called
- **THEN** it derives dependencies through `resolveCountTasksDeps(resolver)`
