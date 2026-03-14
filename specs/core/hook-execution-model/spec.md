# Hook Execution Model

## Purpose

Workflow steps declare hooks via `instruction:` and `run:` entries, but the schema format only defines their YAML structure — not who executes each type, when execution happens, or what failure means in each context. Without a unified execution model, hook behaviour is scattered across ArchiveChange, CompileContext, and undocumented agent conventions. This spec defines the complete hook execution model: the two hook types and their consumers, the two execution modes for `run:` hooks, failure semantics for each phase, hook ordering rules, and the boundary between compile-time and runtime concerns.

## Requirements

### Requirement: Two hook types

Workflow hooks come in exactly two types, distinguished by their key:

- **`instruction:`** — a text block consumed by `CompileContext` at compile time. It is injected into the agent's instruction block as contextual guidance. `instruction:` hooks are never executed at runtime — they have no process, exit code, or side effects.
- **`run:`** — a shell command executed by the `HookRunner` port. It produces an exit code, stdout, and stderr. `run:` hooks are never injected into agent context — they are operational commands.

Every hook entry declares exactly one of these two keys alongside its `id`. An entry with both keys or neither key is a `SchemaValidationError` (enforced by schema validation, not by this model).

### Requirement: instruction hooks are passive text

`instruction:` hooks are passive text blocks — they are never executed as processes. They have no exit code, stdout, stderr, or side effects. `ArchiveChange` and `RunStepHooks` MUST skip `instruction:` entries.

`instruction:` hooks are consumed exclusively by `GetHookInstructions`, which returns instruction text for a specific step+phase, optionally filtered by hook ID. This enables both native specd skills and external agent tools (e.g. Claude Code hooks) to retrieve instruction text independently from context compilation. `CompileContext` does NOT include instruction hooks — it assembles context (specs, metadata, artifact rules), not step instructions.

### Requirement: Two execution modes for run hooks

`run:` hooks are executed in one of two modes depending on who owns the step:

- **Deterministic mode** — the use case (`ArchiveChange`) calls `HookRunner.run()` directly as part of its atomic operation. The use case controls execution order, failure handling, and result collection internally. The agent does not participate in hook execution for deterministic steps.
- **Agent-driven mode** — the agent calls `specd change run-hooks` via the CLI to execute `run:` hooks for a given step and phase. The CLI delegates to the `RunStepHooks` use case, which calls `HookRunner.run()`. The agent is responsible for invoking this command at the right time in its workflow.

The execution mode is determined by which step is being executed, not by the hook itself. A `run:` hook in the `archiving` step executes in deterministic mode (via `ArchiveChange`); the same hook structure in `implementing` executes in agent-driven mode (via `specd change run-hooks`).

### Requirement: Pre-hook failure semantics

When a `run:` pre-hook exits with a non-zero code:

- **Deterministic mode** — `ArchiveChange` aborts immediately and throws `HookFailedError` with the hook command, exit code, and stderr. No files are modified.
- **Agent-driven mode** — `RunStepHooks` returns immediately with the failure result. The CLI exits with code 2 (per the entrypoint spec). The agent SHOULD NOT proceed with the step's work and SHOULD offer to fix the problem before retrying.

In both modes, pre-hooks use **fail-fast** semantics: execution stops at the first failure, and subsequent hooks in the list are not run.

### Requirement: Post-hook failure semantics

When a `run:` post-hook exits with a non-zero code:

- **Deterministic mode** — `ArchiveChange` collects the failure in `postHookFailures` but does not roll back the operation. All remaining post-hooks continue to execute. Failures are returned in the result for the CLI to report.
- **Agent-driven mode** — `RunStepHooks` continues executing remaining post-hooks, collecting all failures. The CLI exits with code 2 if any post-hook failed. The agent reports failures but does not block the transition — the step's work is already done.

In both modes, post-hooks use **fail-soft** semantics: all hooks execute regardless of individual failures, and failures are collected rather than thrown.

### Requirement: Hook ordering

Hooks are executed in the following order within each phase (`pre` or `post`):

1. **Schema-level hooks** — entries from the schema's `workflow[step].hooks.pre` or `workflow[step].hooks.post`, in declaration order
2. **Project-level hooks** — entries from the project's `schemaOverrides` targeting `workflow[step].hooks.pre` or `workflow[step].hooks.post`, in declaration order

Schema hooks always precede project hooks within the same phase. Within each level, declaration order is preserved.

### Requirement: Template variable expansion

Before executing a `run:` hook command, `HookRunner` expands `{{key.path}}` template variables using a `HookVariables` object. The variables available are:

- `{{change.name}}` — the change name
- `{{change.workspace}}` — the primary workspace name
- `{{change.path}}` — the absolute path to the change directory
- `{{project.root}}` — the absolute path to the project root

Unknown variable paths are left unexpanded (the original `{{key.path}}` token is preserved). All substituted values are shell-escaped to prevent injection attacks.

### Requirement: change transition does not execute hooks

`TransitionChange` (and its CLI counterpart `specd change transition`) performs only a state transition on the Change entity. It MUST NOT execute any `run:` hooks. Hook execution is the responsibility of `ArchiveChange` (deterministic mode) or the agent via `specd change run-hooks` (agent-driven mode).

This separation ensures that state transitions are fast, predictable, and side-effect-free.

## Constraints

- `instruction:` hooks are never executed — they are passive text consumed exclusively by `GetHookInstructions`
- `run:` hooks are never injected into agent context — they are commands executed by `HookRunner`
- Pre-hooks use fail-fast semantics in both execution modes
- Post-hooks use fail-soft semantics in both execution modes
- Schema-level hooks always precede project-level hooks within the same phase
- `TransitionChange` MUST NOT execute hooks — it only changes state
- `ArchiveChange` is currently the only use case that executes hooks in deterministic mode
- `RunStepHooks` is the use case for agent-driven hook execution
- Template variable expansion and shell escaping are handled by `HookRunner`, not by callers

## Examples

### Agent interaction flow for an agent-driven step

```
1. specd change context <name> implementing                        → get spec context
2. specd change hook-instruction <name> implementing --phase pre   → get pre instructions
3. specd change run-hooks <name> implementing --phase pre          → execute run: pre-hooks
4. Agent does the implementation work
5. specd change run-hooks <name> implementing --phase post         → execute run: post-hooks
6. specd change hook-instruction <name> implementing --phase post  → get post instructions
7. specd change transition <name> verifying                        → advance state
```

### Deterministic step (archiving)

```
1. specd change archive <name>
   → ArchiveChange internally:
     a. runs pre-archive run: hooks (fail-fast)
     b. merges deltas, syncs specs
     c. archives the change
     d. runs post-archive run: hooks (fail-soft)
     e. generates metadata
```

## Spec Dependencies

- [`specs/core/workflow-model/spec.md`](../workflow-model/spec.md) — step semantics, execution modes, step availability
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `workflow[].hooks` structure, `instruction:` and `run:` entries
- [`specs/core/hook-runner-port/spec.md`](../hook-runner-port/spec.md) — `HookRunner` interface, `HookResult`, `HookVariables`, template expansion
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — deterministic hook execution in archiving step
- [`specs/core/get-hook-instructions/spec.md`](../get-hook-instructions/spec.md) — `instruction:` hook query
- [`specs/core/config/spec.md`](../config/spec.md) — project-level hooks via `schemaOverrides`
- [`specs/cli/change-transition/spec.md`](../../cli/change-transition/spec.md) — transition does not execute hooks
