# HookRunner Port

## Purpose

Workflow entries can declare `run:` hooks that execute shell commands, but the application layer must not depend on subprocess APIs, shell detection, or platform-specific execution details. `HookRunner` is the application-layer port that defines the contract for executing these hook commands, abstracting template variable expansion and shell concerns behind a single interface.

Long-running hooks also need to remain observable while they are still running. The port therefore covers both final hook completion and in-flight progress reporting for shell hook execution, while keeping the application layer decoupled from platform-specific process streaming details.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `HookRunner` with a single method `run`. It SHALL NOT be an abstract class, because there are no invariant constructor arguments shared across all implementations.

### Requirement: Run method signature

The `run` method MUST accept:

1. `command: string` — the shell command string, optionally containing `{{key.path}}` template variables
2. `variables: HookVariables` — values for template variable substitution
3. an optional progress callback for in-flight hook execution updates

It MUST return `Promise<HookResult>`.

### Requirement: Live progress reporting

When a progress callback is provided, the runner MUST report hook execution progress while the subprocess is still running.

The progress model MUST support, at minimum:

- progress when the subprocess emits standard output
- progress when the subprocess emits standard error
- liveness signalling when the subprocess remains active without emitting new output

The contract MUST preserve stream identity so callers can distinguish stdout-derived activity from stderr-derived activity.

The runner MAY emit multiple progress updates for a single hook, but it MUST preserve the final `HookResult` contract after the process exits.

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

Live progress reporting MUST NOT weaken or replace this final result contract. Callers MUST still receive the complete captured stdout/stderr and final exit code after hook completion, even when progress events were emitted during execution.

### Requirement: HookVariables shape

The `HookVariables` type MUST contain:

- `change?` (optional) — an object with `name: string`, `workspace: string`, and `path: string` fields representing the active change context. Absent for lifecycle points with no active change.
- `project` (required) — an object with `root: string` representing the absolute path to the git repository root.

### Requirement: Hook type distinction

The port executes only `run:` hooks (deterministic shell commands). `instruction:` hooks are not executed by this port — they are injected as text into the agent context by a different mechanism. The port SHALL NOT handle or interpret `instruction:` hook types.

### Requirement: HookRunner is shell-only

`HookRunner` SHALL remain the internal shell runner for built-in `run:` hooks only. It MUST NOT become the contract for externally dispatched hook backends.

External hooks use a separate runner abstraction with its own dispatch rules and accepted-type declaration.

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
- Progress callbacks are observational only — they MUST NOT change hook success/failure semantics or replace final captured results

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
