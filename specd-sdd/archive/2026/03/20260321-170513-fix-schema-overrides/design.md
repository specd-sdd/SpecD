# Design: fix-schema-overrides

## Affected areas

### `packages/core/src/application/use-cases/resolve-schema.ts`

Lines 62-70: before creating the override layer, add a normalization step that transforms YAML-format hooks to domain format. The transformation is:

- `{ id, run: cmd }` → `{ id, type: 'run', command: cmd }`
- `{ id, instruction: text }` → `{ id, type: 'instruction', text: text }`

This must walk all operation keys (`append`, `prepend`, `create`, `set`) and transform hooks in `workflow[].hooks.pre[]` and `workflow[].hooks.post[]`.

### `packages/core/src/application/use-cases/run-step-hooks.ts`

Remove `projectWorkflowHooks` constructor param and the `_projectWorkflowHooks` field. In `_collectHooks()`, remove the project-level hook appending logic — hooks come solely from the schema's workflow step.

### `packages/core/src/application/use-cases/get-hook-instructions.ts`

Same as run-step-hooks — remove `projectWorkflowHooks` constructor param and the project-level instruction collection logic.

### `packages/core/src/application/specd-config.ts`

Remove `SpecdWorkflowStep`, `SpecdWorkflowHook` types and `workflow` field from `SpecdConfig`.

### `packages/core/src/infrastructure/fs/config-loader.ts`

Remove `workflow` parsing from the Zod schema and the `SpecdWorkflowStep` construction logic. Remove the `WorkflowStepRawZodSchema` if it's only used for config (check — it may be shared with schema parser).

### `packages/core/src/composition/kernel.ts`

Remove `const projectWorkflowHooks = config.workflow` and stop passing it to `RunStepHooks` and `GetHookInstructions`.

### `packages/core/src/infrastructure/schema-yaml-parser.ts`

No changes — this already correctly transforms YAML hooks to domain format. The normalization in `ResolveSchema` will reuse the same logic or duplicate it locally.

### `specd.local.yaml`

Migrate `workflow` to `schemaOverrides.append.workflow`.

### Tests

Update `RunStepHooks` and `GetHookInstructions` tests to remove project hook scenarios. Add tests for `ResolveSchema` hook normalization.

## New constructs

### `normalizeOverrideHooks` (private function)

- **Location**: `packages/core/src/application/use-cases/resolve-schema.ts`
- **Shape**: `function normalizeOverrideHooks(overrides: SchemaOperations): SchemaOperations`
- **Responsibility**: Walks all operation keys and transforms YAML-format hooks to domain format. Pure function, no side effects.

## Approach

1. Add `normalizeOverrideHooks` in `resolve-schema.ts` — before line 65 (`overrideLayers.push`), call it to transform the overrides
2. Remove `projectWorkflowHooks` from `RunStepHooks` and `GetHookInstructions` constructors
3. Remove `workflow` from `SpecdConfig` and config loader
4. Update kernel wiring
5. Migrate `specd.local.yaml`

## Key decisions

**Decision: Normalize in `ResolveSchema`, not in the config loader** → The config loader should pass data as-is. The schema resolution pipeline is where YAML→domain transformation belongs — it's the same layer that handles the base schema transform via `schema-yaml-parser.ts`.

**Decision: Inline normalization logic, not reuse parser** → The schema YAML parser uses Zod transforms which are tightly coupled to the Zod validation pipeline. A simple standalone function is cleaner than extracting the transform logic from Zod.

## Testing

### Automated tests

- `packages/core/test/application/use-cases/resolve-schema.spec.ts` — add tests for override hook normalization
- `packages/core/test/application/use-cases/run-step-hooks.spec.ts` — remove project hook test, update constructor calls
- `packages/core/test/application/use-cases/get-hook-instructions.spec.ts` — same

### Manual / E2E verification

```bash
# Add schemaOverrides to specd.local.yaml with a run hook
# Run: specd change run-hooks <name> implementing --phase post
# Expected: override hook executes
```

## Open questions

_(none)_
