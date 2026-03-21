# GetHookInstructions

## Purpose

Workflow steps declare `instruction:` hooks — text blocks that guide agent behaviour at step boundaries. These instructions are distinct from context (specs, metadata, artifact rules) and must be retrieved separately. `GetHookInstructions` is the sole consumer of `instruction:` hooks: it returns instruction text for a given step and phase, optionally filtered by hook ID. Both native specd skills and external agent tools (e.g. Claude Code hooks) use this to retrieve step instructions independently from context compilation.

## Requirements

### Requirement: Ports and constructor

`GetHookInstructions` receives at construction time: `ChangeRepository`, `SchemaProvider`, and `TemplateExpander`.

```typescript
class GetHookInstructions {
  constructor(changes: ChangeRepository, schemaProvider: SchemaProvider, expander: TemplateExpander)
}
```

`SchemaProvider` returns the fully-resolved schema with plugins and overrides applied — all workflow hooks (including those added via `schemaOverrides`) are already present in the schema's workflow steps. All dependencies are injected at kernel composition time.

### Requirement: Input

`GetHookInstructions.execute` receives:

- `name` (string, required) — the change name
- `step` (string, required) — the workflow step name
- `phase` (`'pre'` | `'post'`, required) — which hook phase to query
- `only` (string, optional) — when provided, filters to a single hook by its `id`

### Requirement: Change lookup

`GetHookInstructions` loads the change by name via `ChangeRepository`. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Schema name guard

After resolving the schema, `GetHookInstructions` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`.

### Requirement: Step resolution

`GetHookInstructions` validates that `step` is a valid `ChangeState` (a lifecycle state defined by the domain, which includes `archiving`). If it is not, it MUST throw `StepNotValidError`.

If the step is a valid lifecycle state, `GetHookInstructions` looks up the workflow step entry via `schema.workflowStep(step)`. If no matching entry exists (the schema does not declare hooks for this state), the use case returns `{ phase, instructions: [] }` — no error is thrown.

### Requirement: Instruction collection

For the matched step and phase, `GetHookInstructions` MUST collect `instruction:` hooks from `workflow[step].hooks[phase]` — only entries with `type: 'instruction'`, in declaration order.

`run:` entries (type `'run'`) MUST be skipped — they are not instruction text.

All hooks — whether from the base schema, plugins, or overrides — are already merged into the schema's workflow steps by `ResolveSchema`. There is no separate project-level hook collection.

### Requirement: Hook filtering with --only

When `only` is provided, the result MUST contain only the hook whose `id` matches. If no hook matches the ID, the use case MUST throw `HookNotFoundError` with reason `'not-found'`. If the ID matches a `run:` hook instead of an `instruction:` hook, the use case MUST throw `HookNotFoundError` with reason `'wrong-type'`.

### Requirement: Result shape

`GetHookInstructions.execute` MUST return a result object containing:

- `phase` (`'pre'` | `'post'`) — the queried phase (always matches the input)
- `instructions` — array of instruction entries, each with:
  - `id` (string) — the hook's `id`
  - `text` (string) — the instruction text verbatim

When no `instruction:` hooks exist for the step+phase, the result is `{ phase, instructions: [] }`.

## Constraints

- This use case is read-only — it does not modify the change or execute any commands
- `run:` hooks are always excluded from results
- Schema-level hooks precede project-level hooks, consistent with hook ordering
- This use case does not evaluate step availability — it returns instructions regardless of whether the step is currently available

## Spec Dependencies

- [`specs/core/hook-execution-model/spec.md`](../hook-execution-model/spec.md) — hook types, instruction hooks as passive text, ordering
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `workflow[].hooks` structure, `instruction:` entries
- [`specs/core/config/spec.md`](../config/spec.md) — project-level hooks via `schemaOverrides`
- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `schemaName`
- [`specs/core/template-variables/spec.md`](../template-variables/spec.md) — `TemplateExpander`, `TemplateVariables`, expansion semantics
