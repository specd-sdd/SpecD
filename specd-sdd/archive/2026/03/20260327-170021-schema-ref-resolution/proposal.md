# Proposal: schema-ref-resolution

## Motivation

`schema show` and `schema validate` can only operate on the project's active schema. Users cannot inspect or validate an arbitrary schema by reference before adding it to their config, nor can they examine workspace schemas independently. Other schema commands (`fork`, `extend`) already accept a `<ref>` positional argument — `show` and `validate` should follow the same pattern.

## Current behaviour

- `schema show` displays only the project's active (configured) schema. It has no positional argument and no `--file` flag.
- `schema validate` can validate the active schema or an external file via `--file <path>`, but cannot resolve a schema by name/reference (e.g. `@specd/schema-std`, `#workspace:name`).
- `schema fork <ref> <name>` and `schema extend <ref> <name>` already accept a `<ref>` positional that routes through `SchemaRegistry`.

## Proposed solution

Add an optional `[ref]` positional argument to both `schema show` and `schema validate`, using the same reference format as the `schema` field in `specd.yaml` — routed through `SchemaRegistry`:

- `@scope/name` — npm package
- `#workspace:name` — workspace-qualified
- `#name` or bare name — default workspace
- relative/absolute path — filesystem

Additionally, add `--file <path>` to `schema show` (which `validate` already has).

When neither `[ref]` nor `--file` is provided, both commands retain their current behavior (active project schema).

`[ref]` and `--file` are mutually exclusive in both commands. For `validate`, `[ref]` is also mutually exclusive with `--raw` (which only applies to the project's active schema).

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/schema-show`: add `[ref]` positional argument and `--file <path>` option to command signature; add output modes for ref-resolved and file-resolved schemas
  - Depends on (added): none
- `cli:cli/schema-validate`: add `[ref]` positional argument to command signature; add ref mode that delegates to the new `ValidateSchema` ref mode
  - Depends on (added): none
- `core:core/validate-schema`: add `{ mode: 'ref', ref: string }` input variant that resolves a schema by reference through the registry with extends chain resolution
  - Depends on (added): none
- `core:core/get-active-schema`: extend to accept optional input for resolving a schema by ref or file path, instead of only the project's active schema
  - Depends on (added): none

## Impact

- **CLI:** `packages/cli/src/commands/schema/show.ts` and `validate.ts` — new argument parsing and dispatch logic
- **Core use cases:** `packages/core/src/application/use-cases/validate-schema.ts` — new `ref` mode; `get-active-schema.ts` — new optional input parameter
- **No port/infrastructure changes:** `SchemaRegistry.resolveRaw(ref)` already handles all reference formats
- **No breaking changes:** all new behavior is additive; existing invocations without `[ref]` or `--file` remain identical

## Technical context

- `SchemaRegistry.resolveRaw(ref)` already supports all ref formats (npm `@scope/name`, workspace `#ws:name`, bare name, file path). No infrastructure work needed.
- `ValidateSchema._validateFile` already implements the pattern needed for ref mode: `resolveRaw` → extends chain → build → return with warnings. The new `ref` mode follows the same pipeline.
- For `schema show`, `GetActiveSchema` currently delegates to `ResolveSchema` which applies plugins and overrides. When showing a schema by ref or file, plugins/overrides should NOT apply — only the schema itself with its extends chain. This requires either extending `GetActiveSchema` to accept optional input or using the registry resolution directly.
- `SchemaRegistry.resolve(ref)` builds a Schema from a single file without extends chain resolution. For show/validate by ref, we need the full extends chain, so `resolveRaw` + `resolveExtendsChain` + `buildSchema` is the correct pipeline.
- Mutual exclusivity constraints: `[ref]` vs `--file` (both commands), `[ref]` vs `--raw` (validate only).

## Open questions

None — all design decisions were resolved during the exploration conversation.
