# Hook Execution Model

## Purpose

Workflow steps declare hooks via `instruction:` and `run:` entries, but the schema format only defines their YAML structure — not who executes each type, when execution happens, or what failure means in each context. Without a unified execution model, hook behaviour is scattered across use cases and undocumented agent conventions. This spec defines the complete hook execution model: the two hook types and their consumers, hook execution for transitions and archives, failure semantics for each phase, hook ordering rules, the `--skip-hooks` pattern for manual control, and the boundary between compile-time and runtime concerns.

## Requirements

### Requirement: Two hook types

Workflow hooks come in exactly two types, distinguished by their key:

- **`instruction:`** — a text block consumed by `GetHookInstructions` at query time. It is returned as contextual guidance for the agent or external tool. `instruction:` hooks are never executed at runtime — they have no process, exit code, or side effects.
- **`run:`** — a shell command executed by the `HookRunner` port. It produces an exit code, stdout, and stderr. `run:` hooks are never injected into agent context — they are operational commands.

Every hook entry declares exactly one of these two keys alongside its `id`. An entry with both keys or neither key is a `SchemaValidationError` (enforced by schema validation, not by this model).

All workflow steps can declare both `instruction:` and `run:` hooks — there are no restrictions by step type.

### Requirement: instruction hooks are passive text

`instruction:` hooks are passive text blocks — they are never executed as processes. They have no exit code, stdout, stderr, or side effects. `TransitionChange`, `ArchiveChange`, and `RunStepHooks` MUST skip `instruction:` entries.

`instruction:` hooks are consumed exclusively by `GetHookInstructions`, which returns instruction text for a specific step+phase, optionally filtered by hook ID. This enables both native specd skills and external agent tools (e.g. Claude Code hooks) to retrieve instruction text independently from context compilation. `CompileContext` does NOT include instruction hooks — it assembles context (specs, metadata, artifact rules), not step instructions.

### Requirement: Default hook execution for transitions and archives

By default, `TransitionChange` and `ArchiveChange` auto-execute `run:` hooks at step boundaries:

- **`TransitionChange`** — when transitioning to a state that has a workflow step with `run:` hooks, executes pre-hooks before the state change and post-hooks after. Pre-hook failure aborts the transition (fail-fast). Post-hook failures are collected but do not roll back (fail-soft). Hook execution is delegated to `RunStepHooks`.
- **`ArchiveChange`** — executes pre-archive hooks before any file modifications and post-archive hooks after the archive completes. Pre-hook failure aborts the archive. Post-hook failures are collected. Hook execution is delegated to `RunStepHooks`.

Both use cases delegate hook execution to `RunStepHooks`, which handles hook collection, variable expansion, and execution semantics.

### Requirement: Manual hook control with skipHooks

Manual hook control uses phase selectors rather than a separate boolean flag.

- `TransitionChange` accepts `skipHookPhases` values `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, and `'all'`.
- `ArchiveChange` accepts `skipHookPhases` values `'pre'`, `'post'`, and `'all'`.

When the selector set contains all phases for the current use case, `TransitionChange` or `ArchiveChange` skips every `run:` hook. This gives the caller (typically an LLM agent) manual control over hook timing:

1. Call `specd change hook-instruction <name> <step> --phase pre` to read `instruction:` hooks
2. Call `specd change run-hooks <name> <step> --phase pre` to execute `run:` pre-hooks
3. Call the lifecycle command with `--skip-hooks ...` to perform the transition or archive without the skipped auto-hooks
4. Call `specd change run-hooks <name> <step> --phase post` to execute `run:` post-hooks
5. Call `specd change hook-instruction <name> <step> --phase post` to read post-step instructions

The `--skip-hooks` CLI flag maps to the `skipHookPhases` selector set in the corresponding use case input. The agent is responsible for invoking hooks at the appropriate time.

### Requirement: Pre-hook failure semantics

When a `run:` pre-hook exits with a non-zero code:

- **`TransitionChange`** — throws `HookFailedError`. No state transition occurs.
- **`ArchiveChange`** — throws `HookFailedError`. No files are modified.
- **`RunStepHooks` (standalone)** — returns immediately with the failure result. The CLI exits with code 2. The agent SHOULD NOT proceed with the step's work and SHOULD offer to fix the problem before retrying.

In all cases, pre-hooks use **fail-fast** semantics: execution stops at the first failure, and subsequent hooks in the list are not run.

### Requirement: Post-hook failure semantics

When a `run:` post-hook exits with a non-zero code:

- **`TransitionChange`** — collects the failure in `postHookFailures` but does not roll back the transition. All remaining post-hooks continue to execute.
- **`ArchiveChange`** — collects the failure in `postHookFailures` but does not roll back the archive. All remaining post-hooks continue to execute.
- **`RunStepHooks` (standalone)** — continues executing remaining post-hooks, collecting all failures. The CLI exits with code 2 if any post-hook failed.

In all cases, post-hooks use **fail-soft** semantics: all hooks execute regardless of individual failures, and failures are collected rather than thrown.

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

## Constraints

- `instruction:` hooks are never executed — they are passive text consumed exclusively by `GetHookInstructions`
- `run:` hooks are never injected into agent context — they are commands executed by `HookRunner`
- All workflow steps can have both `instruction:` and `run:` hooks — no restrictions by step type
- Pre-hooks use fail-fast semantics in all execution contexts
- Post-hooks use fail-soft semantics in all execution contexts
- Schema-level hooks always precede project-level hooks within the same phase
- `TransitionChange` and `ArchiveChange` delegate hook execution to `RunStepHooks`
- `RunStepHooks` is the single hook execution engine used by all use cases and the CLI
- Template variable expansion and shell escaping are handled by `HookRunner`, not by callers

## Examples

### Default transition with hooks

```
1. specd change transition <name> implementing
   → TransitionChange internally:
     a. enforces workflow requires
     b. runs pre-implementing run: hooks (fail-fast)
     c. transitions state to implementing
     d. runs post-implementing run: hooks (fail-soft)
     e. returns result with change and any postHookFailures
```

### Manual transition hook control (--skip-hooks)

```
1. specd change hook-instruction <name> implementing --phase pre   → get pre instructions
2. specd change run-hooks <name> implementing --phase pre          → execute run: pre-hooks
3. specd change transition <name> implementing --skip-hooks all    → transition only
4. specd change run-hooks <name> implementing --phase post         → execute run: post-hooks
5. specd change hook-instruction <name> implementing --phase post  → get post instructions
```

### Deterministic step (archiving) with hooks

```
1. specd change archive <name>
   → ArchiveChange internally:
     a. runs pre-archive run: hooks (fail-fast) via RunStepHooks
     b. merges deltas, syncs specs
     c. archives the change
     d. runs post-archive run: hooks (fail-soft) via RunStepHooks
     e. generates metadata
```

### Manual archive hook control (--skip-hooks)

```
1. specd change run-hooks <name> archiving --phase pre       → execute pre-archive hooks
2. specd change archive <name> --skip-hooks all              → archive without auto-hooks
3. specd change run-hooks <name> archiving --phase post      → execute post-archive hooks
```

## Spec Dependencies

- [`specs/core/workflow-model/spec.md`](../workflow-model/spec.md) — step semantics, step availability
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `workflow[].hooks` structure, `instruction:` and `run:` entries
- [`specs/core/hook-runner-port/spec.md`](../hook-runner-port/spec.md) — `HookRunner` interface, `HookResult`, `HookVariables`, template expansion
- [`specs/core/transition-change/spec.md`](../transition-change/spec.md) — hook execution during transitions
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — hook execution during archiving
- [`specs/core/run-step-hooks/spec.md`](../run-step-hooks/spec.md) — shared hook execution engine
- [`specs/core/get-hook-instructions/spec.md`](../get-hook-instructions/spec.md) — `instruction:` hook query
- [`specs/core/config/spec.md`](../config/spec.md) — project-level hooks via `schemaOverrides`
- [`specs/cli/change-transition/spec.md`](../../cli/change-transition/spec.md) — transition `--skip-hooks` selectors
- [`specs/cli/change-archive/spec.md`](../../cli/change-archive/spec.md) — archive `--skip-hooks` selectors
