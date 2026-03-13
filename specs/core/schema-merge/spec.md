# Schema Merge

## Purpose

Schemas need to be customisable through inheritance, plugins, and project-level overrides without mutating the original definitions. `mergeSchemaLayers` is a pure domain service that applies customisation layers to a base schema's intermediate representation (`SchemaYamlData`), serving as the engine behind `extends`, `schemaPlugins`, and `schemaOverrides`. All three mechanisms are reduced to an ordered list of layers, each containing a subset of five merge operations, and the function produces a new `SchemaYamlData` ready for `buildSchema`.

## Requirements

### Requirement: Function signature

`mergeSchemaLayers` SHALL be a plain exported function in `domain/services/merge-schema-layers.ts`:

```typescript
function mergeSchemaLayers(base: SchemaYamlData, layers: readonly SchemaLayer[]): SchemaYamlData
```

The function MUST be synchronous and pure — no I/O, no side effects.

### Requirement: SchemaLayer type

Each `SchemaLayer` describes a set of merge operations to apply:

```typescript
interface SchemaLayer {
  readonly source: 'extends' | 'plugin' | 'override'
  readonly ref: string // identifier for error messages
  readonly operations: SchemaOperations
}

interface SchemaOperations {
  readonly remove?: RemoveOperations
  readonly create?: CreateOperations
  readonly prepend?: PrependOperations
  readonly append?: AppendOperations
  readonly set?: SetOperations
}
```

`source` identifies the origin of the layer (for error messages). `ref` is a human-readable reference (e.g. schema name, plugin ref, `"specd.yaml overrides"`).

### Requirement: Five operations with fixed intra-layer order

Within each layer, operations MUST be applied in this fixed order:

1. **`remove`** — delete entries from arrays by identity (`id` for array entries, `step` for workflow steps, artifact `id` for artifacts). Remove a scalar field by setting it to `null`. Removing a non-existent entry MUST throw `SchemaValidationError`.
2. **`create`** — add new entries to arrays. The new entry's identity MUST NOT collide with an existing entry in the same array — collision MUST throw `SchemaValidationError`.
3. **`prepend`** — insert entries at the beginning of arrays, preserving declaration order among prepended items. If the entry's identity already exists in the array, MUST throw `SchemaValidationError`.
4. **`append`** — insert entries at the end of arrays, preserving declaration order among appended items. If the entry's identity already exists in the array, MUST throw `SchemaValidationError`.
5. **`set`** — replace scalar values or replace an existing array entry in-place (matched by identity). For scalars, last-writer-wins. For array entries, the entry MUST already exist — setting a non-existent entry MUST throw `SchemaValidationError`.

This fixed order ensures deterministic results regardless of declaration order within a layer's YAML.

### Requirement: Cross-layer ordering

Layers MUST be applied in the order they appear in the `layers` array. The caller is responsible for ordering layers correctly:

1. `extends` layers — from root ancestor to immediate parent (resolved recursively)
2. `plugin` layers — in `schemaPlugins` declaration order from `specd.yaml`
3. `override` layer — the `schemaOverrides` from `specd.yaml` (at most one)

Each layer's operations are fully applied before the next layer begins.

### Requirement: Identity matching

Array entries are matched by their identity field:

- `artifacts[]` — matched by `id`
- `workflow[]` — matched by `step`
- `workflow[].hooks.pre[]`, `workflow[].hooks.post[]` — matched by `id`
- `artifacts[].validations[]`, `artifacts[].deltaValidations[]` — matched by `id`
- `artifacts[].rules.pre[]`, `artifacts[].rules.post[]` — matched by `id`
- `artifacts[].preHashCleanup[]` — matched by `id`
- `metadataExtraction` array entries (`rules[]`, `constraints[]`, `scenarios[]`, `context[]`) — matched by `id`

When an operation targets a nested array (e.g. hooks within a specific workflow step), the path must identify both the parent entry (by its identity) and the nested array. The operation structure mirrors the schema structure:

```yaml
# Example: append a hook to the 'implementing' step
append:
  workflow:
    - step: implementing
      hooks:
        post:
          - id: notify-team
            run: 'pnpm run notify'
```

### Requirement: Operation target structure

Operations mirror the schema's hierarchical structure. Each operation key maps to the schema field it targets:

- **Top-level scalars** — `set` can target `name`, `version`, `description`
- **`artifacts`** — operations target the `artifacts[]` array; each entry is identified by `id`
- **`workflow`** — operations target the `workflow[]` array; each entry is identified by `step`
- **Nested arrays** — when an operation entry includes a parent identity and nested arrays (e.g. a workflow step entry with `hooks.post`), the merge engine locates the parent entry first, then applies the nested operation to the sub-array

### Requirement: Remove operation semantics

`remove` accepts:

- **Array entry removal** — specify the identity value to remove. The entry is deleted from the array. If the identity does not exist, throw `SchemaValidationError`.
- **Nested removal** — specify a parent identity and nested removals (e.g. remove a specific hook from a specific workflow step). The parent must exist.
- **Scalar removal** — set a scalar field to `null` in `remove` to clear it (e.g. remove `description` from an artifact). Only optional fields may be removed; removing a required field MUST throw `SchemaValidationError`.

### Requirement: Post-merge validation

After all layers are applied, `mergeSchemaLayers` MUST validate:

- No duplicate identities in any array (artifact `id`, workflow `step`, hook `id`, etc.)
- No dangling references in `artifact.requires` (all referenced IDs must exist)

Violations MUST throw `SchemaValidationError` identifying the layer that caused the issue.

### Requirement: Immutability

`mergeSchemaLayers` MUST NOT mutate the `base` or any `layer` input. It MUST return a new `SchemaYamlData` object.

## Constraints

- `mergeSchemaLayers` is a pure function — no I/O, no `fs`, no `yaml`, no `zod` imports
- `mergeSchemaLayers` lives in `domain/services/` — it MUST NOT import from `application/`, `infrastructure/`, or `composition/`
- All errors throw `SchemaValidationError` with context identifying the offending layer and operation
- The function is synchronous
- `SchemaYamlData` is the intermediate type from `parseSchemaYaml` / `buildSchema` — this function operates below the domain entity level

## Examples

```typescript
import { mergeSchemaLayers } from './domain/services/merge-schema-layers.js'

// Base schema from parseSchemaYaml
const base: SchemaYamlData = { kind: 'schema', name: 'std', version: 1, artifacts: [...], ... }

// Plugin adds a post-rule to the specs artifact
const pluginLayer: SchemaLayer = {
  source: 'plugin',
  ref: '@specd/plugin-rfc',
  operations: {
    append: {
      artifacts: [
        {
          id: 'specs',
          rules: {
            post: [{ id: 'rfc-reference', text: 'All requirements must reference the relevant RFC' }],
          },
        },
      ],
    },
  },
}

// Override removes a hook from the implementing step
const overrideLayer: SchemaLayer = {
  source: 'override',
  ref: 'specd.yaml overrides',
  operations: {
    remove: {
      workflow: [
        {
          step: 'implementing',
          hooks: { post: [{ id: 'run-tests' }] },
        },
      ],
    },
  },
}

const merged = mergeSchemaLayers(base, [pluginLayer, overrideLayer])
// merged is a new SchemaYamlData ready for buildSchema
```

## Spec Dependencies

- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — schema YAML structure, `kind`, `id` format, array entry identity
- [`specs/core/build-schema/spec.md`](../build-schema/spec.md) — `SchemaYamlData` intermediate type consumed by `buildSchema`
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — domain layer purity, pure functions for stateless services

## ADRs

- [ADR-0010: Schema Format Design](../../../docs/adr/0010-schema-format.md) — decisions 10–15
