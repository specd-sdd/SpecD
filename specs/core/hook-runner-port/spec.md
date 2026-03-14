# HookRunner Port

## Purpose

Workflow entries can declare `run:` hooks that execute shell commands, but the application layer must not depend on subprocess APIs, shell detection, or platform-specific execution details. `HookRunner` is the application-layer port that defines the contract for executing these hook commands, abstracting template variable expansion and shell concerns behind a single interface.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `HookRunner` with a single method `run`. It SHALL NOT be an abstract class, because there are no invariant constructor arguments shared across all implementations.

### Requirement: Run method signature

The `run` method MUST accept two parameters:

1. `command: string` — the shell command string, optionally containing `{{key.path}}` template variables
2. `variables: HookVariables` — values for template variable substitution

It MUST return `Promise<HookResult>`.

### Requirement: Template variable expansion

Before executing the command, implementations MUST expand all `{{key.path}}` template variables by traversing `variables` using dot-separated key paths. Unknown variable paths MUST be left unexpanded (the original `{{key.path}}` token is preserved in the command string).

### Requirement: Shell escaping

All substituted variable values MUST be shell-escaped before interpolation to prevent shell injection attacks. Only string, number, and boolean values SHALL be substituted; complex types (objects, arrays) MUST be left unexpanded.

### Requirement: HookResult contract

The `run` method MUST always resolve (never reject) and return a `HookResult` containing:

- `exitCode()` — the process exit code (0 for success, non-zero for failure)
- `stdout()` — all captured standard output as a string
- `stderr()` — all captured standard error as a string
- `isSuccess()` — returns `true` when exit code is 0

### Requirement: HookVariables shape

The `HookVariables` type MUST contain:

- `change?` (optional) — an object with `name: string`, `workspace: string`, and `path: string` fields representing the active change context. Absent for lifecycle points with no active change.
- `project` (required) — an object with `root: string` representing the absolute path to the git repository root.

### Requirement: Hook type distinction

The port executes only `run:` hooks (deterministic shell commands). `instruction:` hooks are not executed by this port — they are injected as text into the agent context by a different mechanism. The port SHALL NOT handle or interpret `instruction:` hook types.

### Requirement: Lifecycle execution guarantees

The port itself does not enforce lifecycle semantics, but callers rely on the following guarantees:

- `pre-*` hooks: a non-zero exit code signals the caller to abort the operation
- `post-*` CLI-owned operations: the caller runs post hooks before returning
- `post-*` agent-driven operations: not supported via `run:` hooks (use `instruction:` hooks instead)

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `child_process`, shell detection, or any I/O at the port level
- `HookResult` and `HookVariables` are domain value objects re-exported by the port module
- The `run` method MUST always resolve — subprocess failures are captured in `HookResult`, not thrown as exceptions

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
