# Verification: Change Run Hooks

## Requirements

### Requirement: Command signature

#### Scenario: Missing --phase flag rejected

- **WHEN** the user runs `specd change run-hooks add-auth implementing`
- **THEN** the command exits with code 1
- **AND** a usage error is printed to stderr

### Requirement: Exit code 0 on success

#### Scenario: All hooks succeed

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase pre`
- **THEN** the command exits with code 0
- **AND** stdout contains `ok: test`

#### Scenario: No hooks to run

- **GIVEN** the implementing step has no `run:` hooks in the post phase
- **WHEN** `specd change run-hooks add-auth implementing --phase post`
- **THEN** the command exits with code 0
- **AND** stdout contains `no hooks to run`

### Requirement: Exit code 2 on hook failure

#### Scenario: Pre-hook failure exits code 2

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 1 and stderr `Tests failed`
- **WHEN** `specd change run-hooks add-auth implementing --phase pre`
- **THEN** the command exits with code 2
- **AND** stdout contains `failed: test (exit code 1)`
- **AND** stderr from the hook is forwarded

### Requirement: Exit code 1 on domain errors

#### Scenario: Change not found

- **GIVEN** no change named `nonexistent` exists
- **WHEN** `specd change run-hooks nonexistent implementing --phase pre`
- **THEN** the command exits with code 1
- **AND** stderr contains `error:` message

#### Scenario: Invalid step name

- **GIVEN** `reviewing` is not a valid lifecycle state
- **WHEN** `specd change run-hooks add-auth reviewing --phase pre`
- **THEN** the command exits with code 1
- **AND** stderr contains an error indicating the step is not valid

#### Scenario: Unknown hook ID with --only

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --only unknown-hook`
- **THEN** the command exits with code 1
- **AND** stderr contains an error mentioning `unknown-hook` was not found

### Requirement: Text output format

#### Scenario: Mixed success and failure in post-hooks

- **GIVEN** post-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **AND** `pnpm lint` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase post`
- **THEN** stdout contains `failed: test (exit code 1)` and `ok: lint`
- **AND** both hooks were executed (fail-soft for post phase)

### Requirement: JSON output format

#### Scenario: Successful hooks in JSON format

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format json`
- **THEN** stdout contains JSON with `"result": "ok"` and a `hooks` array with one entry
- **AND** the hook entry has `"id": "test"`, `"success": true`, `"exitCode": 0`

#### Scenario: Failed pre-hook in JSON format

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format json`
- **THEN** stdout contains JSON with `"result": "error"`, `"code": "HOOK_FAILED"`
- **AND** `hooks` contains only one entry (fail-fast: lint was not run)
- **AND** `failedHook` identifies the `test` hook

### Requirement: Works for any step including archiving

#### Scenario: Pre-archive check via run-hooks

- **GIVEN** the archiving step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth archiving --phase pre`
- **THEN** the command exits with code 0
- **AND** stdout contains `ok: test`
- **AND** no archive operation is performed
