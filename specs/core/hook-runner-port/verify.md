# Verification: HookRunner Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `HookRunner`
- **WHEN** the class implements `run(command: string, variables: HookVariables): Promise<HookResult>`
- **THEN** it compiles and can be instantiated

### Requirement: Template variable expansion

#### Scenario: Known variables are expanded

- **GIVEN** a command `"echo {{project.root}}"` and variables `{ project: { root: "/app" } }`
- **WHEN** `run` is called
- **THEN** the shell receives a command with `/app` substituted for `{{project.root}}`

#### Scenario: Nested variable paths are resolved

- **GIVEN** a command `"echo {{change.name}}"` and variables `{ change: { name: "add-login", workspace: "auth", path: "/x" }, project: { root: "/app" } }`
- **WHEN** `run` is called
- **THEN** the shell receives a command with `add-login` substituted for `{{change.name}}`

#### Scenario: Unknown variables are left unexpanded

- **GIVEN** a command `"echo {{unknown.var}}"` and any valid variables
- **WHEN** `run` is called
- **THEN** the executed command contains the literal string `{{unknown.var}}`

### Requirement: Shell escaping

#### Scenario: Values with special characters are escaped

- **GIVEN** a command `"echo {{change.name}}"` and a change name containing shell metacharacters (e.g. `"; rm -rf /"`)
- **WHEN** `run` is called
- **THEN** the substituted value is shell-escaped and does not cause injection

#### Scenario: Non-primitive values are not substituted

- **GIVEN** a command referencing a variable path that resolves to an object
- **WHEN** `run` is called
- **THEN** the template token is left unexpanded

### Requirement: HookResult contract

#### Scenario: Successful command returns zero exit code

- **GIVEN** a command that exits with code 0
- **WHEN** `run` is called
- **THEN** the returned `HookResult` has `exitCode()` equal to 0 and `isSuccess()` returns `true`

#### Scenario: Failed command returns non-zero exit code

- **GIVEN** a command that exits with a non-zero code
- **WHEN** `run` is called
- **THEN** the returned `HookResult` has a non-zero `exitCode()` and `isSuccess()` returns `false`

#### Scenario: stdout and stderr are captured

- **GIVEN** a command that writes to both stdout and stderr
- **WHEN** `run` is called
- **THEN** `stdout()` contains the standard output and `stderr()` contains the standard error

#### Scenario: Run always resolves, never rejects

- **GIVEN** a command that fails or crashes
- **WHEN** `run` is called
- **THEN** the promise resolves with a `HookResult` (it does not reject)

### Requirement: HookVariables shape

#### Scenario: Change context is optional

- **GIVEN** variables with only `project` and no `change` field
- **WHEN** `run` is called with a command referencing `{{change.name}}`
- **THEN** the `{{change.name}}` token is left unexpanded

### Requirement: HookRunner is shell-only

#### Scenario: Explicit external hooks are not passed to HookRunner

- **GIVEN** a workflow step contains an explicit external hook entry
- **WHEN** hook execution is wired for that step
- **THEN** the entry is dispatched through the external hook runner abstraction
- **AND** `HookRunner.run()` is used only for shell `run:` hooks

### Requirement: Run method signature

#### Scenario: run method accepts command and variables

- **WHEN** `HookRunner.run` is called
- **THEN** it accepts `command: string` and `variables: HookVariables`
- **AND** returns `Promise<HookResult>`

#### Scenario: run method always resolves

- **GIVEN** a command that throws or exits with non-zero code
- **WHEN** `HookRunner.run` is called
- **THEN** the promise resolves with a `HookResult` (never rejects)

### Requirement: Hook type distinction

#### Scenario: HookRunner only executes run hooks

- **WHEN** a `run:` hook entry is executed
- **THEN** `HookRunner.run()` is called with the command and variables

#### Scenario: instruction hooks are not executed by HookRunner

- **GIVEN** a workflow step has `instruction:` hooks
- **WHEN** hook execution runs `run:` hooks
- **THEN** `HookRunner.run()` is not called for the instruction entries

### Requirement: Lifecycle execution guarantees

#### Scenario: Non-zero exit code signals abort for pre-hooks

- **GIVEN** a pre-hook is executed and exits with non-zero code
- **WHEN** `HookRunner.run` returns the result
- **THEN** the caller uses the non-zero exit code to abort the operation

#### Scenario: Post-hook exit codes are collected without rollback

- **GIVEN** post-hooks execute with various exit codes
- **WHEN** `HookRunner.run` returns for each post-hook
- **THEN** all exit codes are collected by the caller
- **AND** no rollback is performed regardless of individual failures
