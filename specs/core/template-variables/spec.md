# Template Variables

## Purpose

Workflow hooks (`run:` commands, `instruction:` text) and artifact instructions contain `{{namespace.key}}` tokens that must be expanded with runtime values before the text is consumed or executed. Without a unified model, each use case would build its own variable map with inconsistent naming, and template expansion logic would be duplicated. This spec defines the template variable syntax, the variable registry (built-in and contextual namespaces), expansion semantics, and the shared `TemplateExpander` class that all consumers use.

## Requirements

### Requirement: Syntax

Template variables use the `{{namespace.key}}` syntax. A token is identified by the regex `\{\{([^}]+)\}\}`. The content between the braces is a dot-separated path (e.g. `project.root`, `change.name`).

Only string, number, and boolean values are substitutable. Object and array values are not expanded — the original token is preserved.

### Requirement: Built-in namespace

The `project` namespace is always present in every expansion context. It contains:

| Variable       | Type   | Description                                                               |
| -------------- | ------ | ------------------------------------------------------------------------- |
| `project.root` | string | Absolute path to the project root (the directory containing `specd.yaml`) |

Built-in variables are injected by the composition layer at construction time. Use cases do not build them per invocation.

### Requirement: Contextual namespaces

Contextual namespaces are added by the use case that performs the expansion, based on the runtime context. A namespace is a flat object of key-value pairs grouped under a name.

The `change` namespace is present when a change is active:

| Variable           | Type   | Description                                                     |
| ------------------ | ------ | --------------------------------------------------------------- |
| `change.name`      | string | The change's kebab-case name                                    |
| `change.workspace` | string | The primary workspace name (first entry in `change.workspaces`) |
| `change.path`      | string | Absolute path to the change directory                           |

Future use cases may introduce additional namespaces (e.g. `spec`, `schema`). The expansion engine does not restrict which namespaces can exist — it traverses whatever object it receives.

### Requirement: Variable map shape

The variable map is a plain object where each top-level key is a namespace name and each value is a flat record of string keys to primitive values:

```typescript
type TemplateVariables = Record<string, Record<string, string | number | boolean>>
```

Example:

```typescript
{
  project: { root: '/Users/dev/my-project' },
  change: { name: 'add-auth', workspace: 'default', path: '/Users/dev/my-project/changes/add-auth' },
}
```

This replaces the current typed `HookVariables` interface with a generic structure that supports arbitrary namespaces without code changes.

### Requirement: Expansion semantics

When expanding a template string:

1. Each `{{namespace.key}}` token is resolved by traversing the variable map: first look up the namespace, then the key within it.
2. If the namespace exists and the key resolves to a string, number, or boolean, the token is replaced with the value.
3. If the namespace does not exist, the key does not exist, or the value is not a primitive, the original `{{namespace.key}}` token is preserved unchanged.
4. Expansion is single-pass — expanded values are not re-scanned for further tokens.

### Requirement: Shell escaping for run hooks

When expanding variables in `run:` hook commands, all substituted values MUST be shell-escaped to prevent injection attacks. Values are wrapped in single quotes with embedded single quotes escaped using the `'\''` idiom.

When expanding variables in `instruction:` text or artifact instructions, values are substituted verbatim without shell escaping — these are text blocks consumed by agents, not shell commands.

### Requirement: TemplateExpander class

`TemplateExpander` is a class (not a port) that encapsulates template expansion logic. It receives the built-in variables at construction time:

```typescript
class TemplateExpander {
  constructor(builtins: TemplateVariables)

  expand(template: string, variables?: TemplateVariables): string
  expandForShell(template: string, variables?: TemplateVariables): string
}
```

- The `builtins` provided at construction (e.g. `{ project: { root: '...' } }`) are always present in every expansion.
- `expand(template, variables?)` — merges contextual `variables` with built-ins and substitutes values verbatim. Used by `GetHookInstructions` and `GetArtifactInstruction` for instruction text.
- `expandForShell(template, variables?)` — merges contextual `variables` with built-ins and substitutes values with shell escaping. Used by `HookRunner` for `run:` commands.
- Contextual variables MUST NOT override built-in variables. If a contextual namespace collides with a built-in namespace, the built-in keys take precedence.
- Both methods share the same traversal and resolution logic — only the substitution step differs.

The composition layer constructs a single `TemplateExpander` instance with built-in variables and injects it into all use cases that need expansion.

### Requirement: Variable map construction

Each use case that needs template expansion passes contextual variables to the expander methods. The expander merges them with its built-ins internally:

1. **Built-in variables** — `project.root`, injected into the `TemplateExpander` at construction time
2. **Contextual variables** — passed per invocation from the runtime context (e.g. the `change` namespace built from the resolved change)

The use case is responsible for building the contextual variables before calling the expander. The expander handles merging and precedence.

### Requirement: Namespace naming rules

Namespace names and key names MUST be lowercase alphanumeric with hyphens allowed (`[a-z0-9-]+`). Dots are path separators, not part of names. A token like `{{change.spec-ids}}` is valid; `{{Change.Name}}` is not.

## Constraints

- Template variables are single-pass — no recursive expansion
- Unknown tokens are preserved unchanged, never removed or errored
- Shell escaping is only applied via `expandForShell()`, never in `expand()`
- The variable map is flat within each namespace — no nested objects beyond `namespace.key`
- `project` namespace is always present; other namespaces are optional
- The `TemplateExpander` holds built-in variables as immutable state; contextual variables are passed per call
- The expander does not validate variable values — validation (e.g. ensuring paths are within the project root, preventing path traversal) is the responsibility of the caller that injects them into the map

## Spec Dependencies

- [`specs/core/hook-runner-port/spec.md`](../hook-runner-port/spec.md) — `HookRunner` uses `expandForShell()` for `run:` commands
- [`specs/core/hook-execution-model/spec.md`](../hook-execution-model/spec.md) — instruction hooks and run hooks both support template variables
- [`specs/core/get-hook-instructions/spec.md`](../get-hook-instructions/spec.md) — expands variables in instruction text via `expand()`
- [`specs/core/get-artifact-instruction/spec.md`](../get-artifact-instruction/spec.md) — expands variables in instruction and rules text via `expand()`
- [`specs/core/run-step-hooks/spec.md`](../run-step-hooks/spec.md) — builds variable map for hook execution
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — builds variable map for deterministic hook execution
