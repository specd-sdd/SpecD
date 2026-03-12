# Parse Schema YAML

## Overview

`parseSchemaYaml` is a shared infrastructure module that extracts the YAML parsing and Zod validation logic from `FsSchemaRegistry` into a reusable, adapter-independent function. It receives raw YAML content and a schema reference string, validates the content against the `SchemaYaml` Zod schema, and returns a typed intermediate data structure (`SchemaYamlData`). This module performs structural validation only — it does not construct domain entities or perform semantic checks such as cycle detection or ID format enforcement.

## Requirements

### Requirement: Module location and layer

The module SHALL reside at `infrastructure/schema-yaml-parser.ts` within `@specd/core`. It is infrastructure code — it depends on the `yaml` and `zod` libraries — but it is NOT adapter-specific. Any `SchemaRegistry` adapter (filesystem, in-memory, remote) MAY import it to share the same parsing and structural validation logic.

### Requirement: Function signature

The module SHALL export a function `parseSchemaYaml(ref: string, yamlContent: string): SchemaYamlData`.

- `ref` — the schema reference string (e.g. `#my-schema`, `@specd/schema-std`). Used exclusively in error messages to identify which schema failed validation.
- `yamlContent` — the raw YAML content string to parse and validate.
- Returns a `SchemaYamlData` object on success.

### Requirement: Output type

The module SHALL export a `SchemaYamlData` type representing the validated intermediate structure. This type uses Zod-inferred shapes — it is NOT a domain `Schema` entity. The type SHALL contain:

- `name: string` — the schema's machine identifier
- `version: number` — integer schema version
- `description?: string` — optional human-readable summary
- `kind: 'schema' | 'schema-plugin'` — schema type discriminator
- `extends?: string` — optional parent schema reference
- `artifacts: ArtifactYaml[]` — array of raw artifact definitions as validated by Zod (NOT domain `ArtifactType` instances)
- `workflow?: WorkflowStepRaw[]` — optional array of raw workflow step definitions before domain transform
- `metadataExtraction?` — optional metadata extraction configuration as validated by Zod

The `ArtifactYaml` and `WorkflowStepRaw` types SHALL also be exported for downstream use. These types represent the Zod-inferred output shapes of their respective schemas, preserving `| undefined` on optional fields.

### Requirement: YAML parsing

The function SHALL parse the `yamlContent` string using the `yaml` library. If the parsed result is `null`, not an object, or is an array, the function SHALL throw a `SchemaValidationError` with the provided `ref` and a message indicating that the schema file must be a YAML mapping.

### Requirement: Zod structural validation

After successful YAML parsing, the function SHALL validate the parsed object against the `SchemaYaml` Zod schema. The Zod schema SHALL enforce:

- `name` is a required string
- `version` is a required integer
- `kind` is a required enum (`schema` | `schema-plugin`)
- `extends` is an optional string, only valid when `kind: schema`
- `artifacts` is a required array of artifact objects, each validated for required fields (`id`, `scope`, `output`) and optional fields with correct types
- Hook entries require an `id` field alongside `instruction` or `run`
- Validation/deltaValidation rule entries require an `id` field
- `preHashCleanup` entries require an `id` field
- `rules` on artifacts is an optional object with `pre` and `post` arrays of `{ id, text }`
- `workflow` is an optional array of workflow step objects
- `metadataExtraction` is an optional object matching the metadata extraction schema; array entries require an `id` field
- Unknown top-level fields SHALL be ignored (forward compatibility via Zod's default `strip` mode)

The Zod schemas for selector fields within validation rules, metadata extractors, and related structures SHALL be imported from the existing `infrastructure/zod/selector-schema.ts` module to avoid duplication.

### Requirement: Zod refinement rules

The Zod schema SHALL include refinement rules that enforce structural constraints at the artifact level:

- `deltaValidations` is only valid when `delta` is `true`
- `delta: true` is not valid when `scope` is `change`
- `kind: schema-plugin` must not declare `artifacts`, `workflow`, `metadataExtraction`, or `extends`

These refinements SHALL produce descriptive error messages.

### Requirement: Error handling

On any validation failure, the function SHALL throw a `SchemaValidationError` (a domain error extending `SpecdError`) with:

- The `ref` string identifying which schema failed
- A descriptive message that includes the Zod issue path when available, formatted as a dot-bracket string (e.g. `artifacts[0].scope: invalid enum value`)

The function SHALL report only the first Zod issue in the error message.

### Requirement: No semantic validation

The function SHALL NOT perform semantic validation. The following checks are explicitly out of scope and remain the responsibility of the caller (e.g. `SchemaRegistry.resolve()`):

- Duplicate `artifact.id` detection
- Duplicate `workflow[].step` detection
- `artifact.id` format validation (`/^[a-z][a-z0-9-]*$/`)
- Unknown artifact ID in `artifact.requires`
- Circular dependency detection in `artifact.requires`
- Non-optional artifact depending on optional artifact

### Requirement: No domain object construction

The function SHALL NOT construct domain entities or value objects (`Schema`, `ArtifactType`, `WorkflowStep`, `Selector`, etc.). It returns the Zod-validated intermediate representation only. Domain object construction remains the responsibility of the adapter or caller.

### Requirement: formatZodPath utility

The module SHALL export a `formatZodPath` utility function that converts a Zod issue path (array of strings and numbers) into a human-readable dot-bracket string (e.g. `artifacts[0].scope`). This function is extracted from the existing `FsSchemaRegistry` implementation to be shared across consumers.

## Constraints

- The module resides in `infrastructure/` but NOT inside `infrastructure/fs/` — it has no filesystem dependency
- The module depends on `yaml` (npm) and `zod` (npm) — both are infrastructure-level dependencies
- The module imports `SelectorZodSchema` and `SelectorRaw` from `infrastructure/zod/selector-schema.ts` — selector Zod schemas MUST NOT be duplicated
- The module imports `SchemaValidationError` from `domain/errors/` — this is the only domain import permitted
- The output types (`SchemaYamlData`, `ArtifactYaml`, `WorkflowStepRaw`) use Zod-inferred shapes with `| undefined` on optional fields — they are NOT domain types
- The Zod schema uses `strip` mode (default) for unknown fields — no `passthrough` or `strict`
- The function is synchronous — YAML parsing and Zod validation require no I/O

## Examples

```typescript
import { parseSchemaYaml } from '../infrastructure/schema-yaml-parser.js'

// Success case
const data = parseSchemaYaml('#my-schema', yamlString)
// data.name → 'my-schema'
// data.artifacts → ArtifactYaml[]
// data.workflow → WorkflowStepRaw[] | undefined

// Error case — invalid YAML
parseSchemaYaml('#broken', '{{not yaml')
// throws SchemaValidationError('#broken', 'schema file must be a YAML mapping')

// Error case — missing required field
parseSchemaYaml('#incomplete', 'name: test\nversion: 1\n')
// throws SchemaValidationError('#incomplete', 'artifacts: required')
```

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — layer constraints and YAML validation at infrastructure boundary
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — defines the schema.yaml structure that this module validates
