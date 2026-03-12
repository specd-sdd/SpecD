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
