# Verification: Change Hook Instruction

## Requirements

### Requirement: Command signature

#### Scenario: Missing --phase flag rejected

- **WHEN** the user runs `specd change hook-instruction add-auth implementing`
- **THEN** the command exits with code 1
- **AND** a usage error is printed to stderr

### Requirement: Exit code 0 on success

#### Scenario: Instructions returned

- **GIVEN** the implementing step has pre instruction hooks `[{ id: "read-tasks", instruction: "Read pending tasks" }]`
- **WHEN** `specd change hook-instruction add-auth implementing --phase pre`
- **THEN** the command exits with code 0
- **AND** stdout contains the instruction text

#### Scenario: No instructions to return

- **GIVEN** the implementing step has no `instruction:` hooks in the post phase
- **WHEN** `specd change hook-instruction add-auth implementing --phase post`
- **THEN** the command exits with code 0
- **AND** stdout contains `no instructions`

### Requirement: Exit code 1 on domain errors

#### Scenario: Change not found

- **GIVEN** no change named `nonexistent` exists
- **WHEN** `specd change hook-instruction nonexistent implementing --phase pre`
- **THEN** the command exits with code 1

#### Scenario: Run hook ID queried via hook-instruction

- **GIVEN** the implementing step has pre hooks `[{ id: "lint", run: "pnpm lint" }]`
- **WHEN** `specd change hook-instruction add-auth implementing --phase pre --only lint`
- **THEN** the command exits with code 1
- **AND** stderr indicates `lint` is a `run:` hook, not an instruction

### Requirement: Text output format

#### Scenario: All instructions with headers

- **GIVEN** pre instruction hooks `[{ id: "read-tasks", instruction: "Read pending tasks" }, { id: "review", instruction: "Review changes" }]`
- **WHEN** `specd change hook-instruction add-auth implementing --phase pre`
- **THEN** stdout contains both instructions with `[pre] read-tasks:` and `[pre] review:` headers

#### Scenario: Single instruction outputs raw text

- **GIVEN** pre instruction hooks `[{ id: "read-tasks", instruction: "Read pending tasks" }]`
- **WHEN** `specd change hook-instruction add-auth implementing --phase pre --only read-tasks`
- **THEN** stdout contains only `Read pending tasks` with no header or framing

### Requirement: JSON output format

#### Scenario: JSON output with instructions

- **GIVEN** pre instruction hooks `[{ id: "read-tasks", instruction: "Read pending tasks" }]`
- **WHEN** `specd change hook-instruction add-auth implementing --phase pre --format json`
- **THEN** stdout contains JSON with `"result": "ok"`, `"phase": "pre"`, and an `instructions` array
- **AND** the entry has `"id": "read-tasks"`, `"text": "Read pending tasks"`
