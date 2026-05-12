# Proposal: fix-schema-overrides

## Motivation

`schemaOverrides` in `specd.yaml` don't work because override workflow hooks arrive in raw YAML format (`{ id, run: '...' }`) while the merge engine and domain expect the transformed format (`{ id, type: 'run', command: '...' }`). The YAML→domain transform only happens during base schema parsing, not when processing overrides. Additionally, the top-level `workflow` field in config is now redundant — it does the same thing as `schemaOverrides.append.workflow` through a separate code path.

## Current behaviour

1. **schemaOverrides hooks ignored:** `ResolveSchema` passes raw YAML override data directly to `mergeSchemaLayers`. The hooks in the override have `{ id, run }` format, but the schema already has hooks in `{ id, type: 'run', command }` format. The merge succeeds structurally but the merged hooks lack the `type` discriminant, so `RunStepHooks` (which filters by `h.type === 'run'`) silently skips them.

2. **Redundant `workflow` field:** `SpecdConfig.workflow` is a separate mechanism that injects project-level hooks via `projectWorkflowHooks` constructor param in `RunStepHooks` and `GetHookInstructions`. Now that all use cases go through `SchemaProvider` → `ResolveSchema` (which applies overrides), this separate code path is unnecessary.

## Proposed solution

1. **Normalize override hooks:** In `ResolveSchema`, before creating the override layer, walk `schemaOverrides` workflow entries and transform hook entries from YAML format to domain format using the same logic as the schema YAML parser.

2. **Remove `workflow` from config:** Delete the `workflow` field from `SpecdConfig`, the config loader, and the `projectWorkflowHooks` param from `RunStepHooks` and `GetHookInstructions`. Users migrate to `schemaOverrides.append.workflow`.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/resolve-schema`: add hook normalization step before building override layer
- `core:core/run-step-hooks`: remove `projectWorkflowHooks` constructor param and hook collection logic
- `core:core/get-hook-instructions`: remove `projectWorkflowHooks` constructor param and hook collection logic
- `core:core/config`: remove `workflow` field from `SpecdConfig`, remove `SpecdWorkflowStep` and `SpecdWorkflowHook` types
- `core:core/kernel`: remove `projectWorkflowHooks` from `createKernel` wiring

## Impact

- **`@specd/core` — application layer**: `ResolveSchema` gains hook normalization; `RunStepHooks` and `GetHookInstructions` lose `projectWorkflowHooks` param; `SpecdConfig` loses `workflow` field
- **`@specd/core` — infrastructure layer**: config loader removes `workflow` parsing
- **`@specd/core` — composition layer**: kernel wiring simplified; composition factories updated
- **`specd.local.yaml`**: migrate from `workflow` to `schemaOverrides.append.workflow`
- **Tests**: updated constructors and new tests for override hook normalization

## Open questions

_(none)_
