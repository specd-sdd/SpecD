# Build Schema

## Purpose

The domain model must not depend on infrastructure concerns like YAML parsing, Zod schemas, or filesystem I/O, yet a `Schema` entity still needs to be constructed from parsed data with full semantic validation. `buildSchema` is a pure domain service that sits at this boundary: it receives validated intermediate data and pre-loaded template contents, performs semantic checks (ID uniqueness, dependency cycles, template references), and constructs the `Schema` entity. All I/O happens before this function is called; the adapter provides fully resolved inputs.

## Requirements

### Requirement: Pure function signature

`buildSchema` SHALL be a plain exported function in `domain/services/build-schema.ts` with the following signature:

```typescript
function buildSchema(
  ref: string,
  data: SchemaYamlData,
  templates: ReadonlyMap<string, string>,
): Schema
```

- `ref` — the schema reference string, used in error messages (e.g. `"@specd/schema-std"`, `"./my-schema"`)
- `data` — validated intermediate data produced by the infrastructure layer's YAML parsing and Zod validation; this is a plain object mirroring the `schema.yaml` structure with `| undefined` on optional fields
- `templates` — a map from artifact template relative path (as declared in the artifact's `template` field) to the file's text content; loaded by the adapter before calling this function

The function MUST be synchronous — it performs no I/O.

### Requirement: SchemaYamlData intermediate type

`SchemaYamlData` SHALL be a plain TypeScript interface (not a Zod-inferred type) defined alongside `buildSchema` or in a shared domain types module. It mirrors the structure of a validated `schema.yaml` document:

- `name` (string) — schema name
- `version` (number) — schema version
- `description` (string, optional) — human-readable summary
- `kind` (`'schema' | 'schema-plugin'`) — schema type discriminator
- `extends` (string, optional) — parent schema reference
- `artifacts` (array of `ArtifactYamlData`) — artifact entries, each with the same fields as the YAML artifact definition but using `| undefined` for optional fields
- `workflow` (array of `WorkflowStep`, optional) — already-transformed workflow step objects
- `metadataExtraction` (`MetadataExtractionRaw`, optional) — raw metadata extraction block with `| undefined` on optional fields

The infrastructure layer is responsible for parsing YAML and validating with Zod; `buildSchema` receives the validated output. `SchemaYamlData` MUST NOT import from Zod or any infrastructure module.

### Requirement: Artifact ID format validation

`buildSchema` SHALL validate that every `artifact.id` matches `/^[a-z][a-z0-9-]*$/`. If an ID fails this check, the function MUST throw `SchemaValidationError` with a message indicating which artifact index and the invalid ID.

Note: `id` fields on array entries (hooks, validations, rules, preHashCleanup, metadataExtraction) must also match `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` and be unique within their array.

### Requirement: Array entry ID validation

`buildSchema` SHALL validate that every array entry `id` (in hooks, validations, deltaValidations, rules.pre, rules.post, preHashCleanup, and metadataExtraction array entries) matches `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` (1-64 chars) and is unique within its immediate array. For hooks specifically, IDs must be unique across ALL workflow steps — no two hooks in any workflow step may share the same ID, regardless of whether they are in pre or post arrays. Violations throw `SchemaValidationError`.

### Requirement: Artifact ID uniqueness validation

`buildSchema` SHALL validate that no two artifacts share the same `id`. If a duplicate is found, the function MUST throw `SchemaValidationError` identifying the duplicate ID.

### Requirement: Template reference validation

For each artifact that declares a `template` path, `buildSchema` SHALL verify that the path exists as a key in the `templates` map. If the template path is not found, the function MUST throw `SchemaValidationError` with a message indicating which artifact and the missing template path. This replaces the filesystem check that previously lived in the infrastructure adapter.

### Requirement: Workflow step uniqueness validation

`buildSchema` SHALL validate that no two workflow entries share the same `step` name. If a duplicate is found, the function MUST throw `SchemaValidationError` identifying the duplicate step name.

For each workflow step that declares `requiresTaskCompletion`, `buildSchema` SHALL validate:

1. Every artifact ID in `requiresTaskCompletion` MUST also be present in the step's `requires` array. If not, throw `SchemaValidationError`.
2. Every artifact ID in `requiresTaskCompletion` MUST reference an artifact type that declares `taskCompletionCheck`. If not, throw `SchemaValidationError`.

### Requirement: Artifact dependency graph validation

`buildSchema` SHALL validate the artifact dependency graph after constructing all `ArtifactType` instances:

- Every artifact ID referenced in a `requires` array MUST exist in the schema's artifact list. Unknown references MUST throw `SchemaValidationError`.
- A non-optional artifact (`optional: false` or omitted) MUST NOT declare a dependency on an optional artifact. Such a dependency MUST throw `SchemaValidationError`.
- The dependency graph MUST be acyclic. If a cycle is detected via depth-first traversal, the function MUST throw `SchemaValidationError`.

### Requirement: buildSelector sub-function

`buildSelector` SHALL convert a raw selector object (with `| undefined` on optional fields) into a domain `Selector` value object by stripping `undefined` values. It MUST recursively convert the `parent` field when present.

This function is currently in `infrastructure/zod/selector-schema.ts` and MUST be relocated to the domain service (or a shared domain utility) since it has no Zod dependency — it only operates on plain objects and domain types.

### Requirement: buildValidationRule sub-function

`buildValidationRule` SHALL convert a raw validation rule object to a domain `ValidationRule`. It MUST:

- Build a `Selector` from either an explicit `selector` field or from flat selector fields (`type`, `matches`, `contains`, `parent`, `index`, `where`) inlined at the rule level
- Recursively convert `children` rules
- Strip `undefined` optional fields

### Requirement: buildFieldMapping sub-function

`buildFieldMapping` SHALL convert a raw field mapping object to a domain `FieldMapping`, recursively converting any `childSelector` via `buildSelector` and stripping `undefined` optional fields.

### Requirement: buildExtractor sub-function

`buildExtractor` SHALL convert a raw extractor object to a domain `Extractor`, converting the `selector` via `buildSelector` and any `fields` entries via `buildFieldMapping`. All `undefined` optional fields MUST be stripped.

### Requirement: buildMetadataExtractorEntry sub-function

`buildMetadataExtractorEntry` SHALL convert a raw metadata extractor entry to a domain `MetadataExtractorEntry`, converting the nested `extractor` via `buildExtractor`.

### Requirement: buildMetadataExtraction sub-function

`buildMetadataExtraction` SHALL convert a raw metadata extraction block to a domain `MetadataExtraction`. Single-entry fields (`title`, `description`, `dependsOn`, `keywords`) are converted individually; array-entry fields (`context`, `rules`, `constraints`, `scenarios`) are mapped over. All `undefined` optional fields MUST be stripped.

### Requirement: buildArtifactType sub-function

`buildArtifactType` SHALL convert a raw artifact entry and an optional template content string into an `ArtifactType` domain entity. It MUST:

- Convert `validations` and `deltaValidations` arrays via `buildValidationRule`
- Convert `preHashCleanup` entries
- Convert `taskCompletionCheck` if present
- Convert `rules` (with `pre` and `post` arrays of `{ id, text }` entries) if present
- Pass the template content string (not the path) as the `template` property on `ArtifactType`
- Default `optional` to `false`, `delta` to `false`, and `requires` to `[]` when omitted

### Requirement: detectCycle helper

`buildSchema` SHALL include a `detectCycle` helper function that performs depth-first traversal to detect cycles in the artifact dependency graph. It receives an artifact ID, a map of artifact IDs to their dependencies, a visited set, and a recursion stack set. It MUST return `true` if a cycle is reachable from the given ID.

### Requirement: Schema entity construction

After all validation passes, `buildSchema` SHALL construct and return a `Schema` entity by calling `new Schema(name, version, artifacts, workflow, metadataExtraction)` with the fully converted domain objects, passing `kind` and `extends` to the Schema constructor. Workflow steps include the `requiresTaskCompletion` array when declared.

## Constraints

- `buildSchema` is a pure function — no I/O, no `fs`, no `yaml`, no `zod` imports
- `buildSchema` lives in `domain/services/` — it MUST NOT import from `application/`, `infrastructure/`, or `composition/`
- All intermediate "raw" types used by `buildSchema` MUST be plain TypeScript interfaces, not Zod-inferred types
- `buildSelector` MUST be relocated from `infrastructure/zod/selector-schema.ts` to the domain layer since it has no infrastructure dependencies
- Template content is passed as a pre-loaded map — `buildSchema` never reads files
- All semantic validation errors throw `SchemaValidationError` (a domain error extending `SpecdError`)
- The function is synchronous — the `async` nature of the current `_buildSchema` is solely due to template file I/O, which is eliminated by pre-loading

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — domain layer purity, pure functions for stateless services
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — the schema YAML format that defines the input structure
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — `Extractor` and `FieldMapping` value objects built by sub-functions
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — `Selector` value object built by `buildSelector`
- [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md) — schema merge behaviour for schemas with `extends`
