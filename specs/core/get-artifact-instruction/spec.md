# GetArtifactInstruction

## Purpose

When an agent is creating or modifying a specific artifact during the designing step, it needs the artifact's instruction along with its composition rules and delta guidance — but this is instruction content, not context. `CompileContext` handles context (specs, metadata, available steps); `GetArtifactInstruction` handles the artifact-specific instructions: the schema instruction, composition rules (`rules.pre`/`rules.post`), and delta instructions with existing artifact outlines. The skill retrieves these at the right moment — after loading context but before doing the work.

## Requirements

### Requirement: Ports and constructor

`GetArtifactInstruction` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances, `SchemaProvider`, `ArtifactParserRegistry`, and `TemplateExpander`.

```typescript
class GetArtifactInstruction {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    expander: TemplateExpander,
  )
}
```

`ArtifactParserRegistry` is needed to generate delta format instructions and existing artifact outlines. `SpecRepository` is needed to read existing artifact files for outlines. `TemplateExpander.expand()` is called on `instruction`, `template`, `deltaInstruction`, and `rules` text before returning them (verbatim expansion, no shell escaping). `SchemaProvider` provides the fully-resolved schema (with plugins and overrides applied), which includes pre-loaded template content in each `ArtifactType`. It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. The use case builds contextual variables (`change` namespace) from the resolved change and `ChangeRepository.changePath()`, passing them to the expander.

### Requirement: Input

`GetArtifactInstruction.execute` receives:

- `name` (string, required) — the change name
- `artifactId` (string, optional) — the artifact ID from the schema (e.g. `specs`, `verify`, `tasks`). When omitted, the use case auto-resolves the next artifact to work on by walking the schema's artifact list in declaration order: the first artifact whose `requires` dependencies are all satisfied (complete or skipped) but that is itself not yet complete or skipped. If all artifacts are already complete/skipped, it throws `ArtifactNotFoundError`.

### Requirement: Change lookup

`GetArtifactInstruction` loads the change by name via `ChangeRepository`. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Schema name guard

After resolving the schema, `GetArtifactInstruction` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`.

### Requirement: Artifact resolution

`GetArtifactInstruction` MUST find the artifact entry in the schema whose `id` matches the input `artifactId`. If no matching artifact exists, it MUST throw `ArtifactNotFoundError`.

### Requirement: Instruction resolution

`GetArtifactInstruction` MUST resolve each instruction component independently:

- **`rulesPre`** — if the artifact declares `rules.pre`, collect all entries' `text` in declaration order. These are composition rules added by extending schemas or plugins to augment the base instruction.
- **`instruction`** — the artifact's `instruction` field from the schema. `null` if not declared.
- **`template`** — if the artifact declares a `template` path, read the file content from the schema directory via `SchemaRegistry` and return the resolved string. `null` if the artifact has no template. Template variable expansion (via `TemplateExpander`) MUST be applied to the template content using the same contextual variables as `instruction`.
- **`delta`** — if the artifact has `delta: true`, resolve three sub-components:
  - **`formatInstructions`** — call `parsers.get(artifact.format).deltaInstructions()` for the technical delta format guidance.
  - **`domainInstructions`** — the artifact's `deltaInstruction` field. `null` if not declared.
  - **`availableOutlines`** — for each spec ID in `change.specIds`, if the corresponding artifact file exists in `SpecRepository`, include that `specId` in `availableOutlines`. `availableOutlines` is strictly `string[]` of spec IDs. The use case MUST NOT embed full outline trees in this payload. Full outline content is retrieved on demand via `GetSpecOutline` (CLI: `specd specs outline <specPath> --artifact <artifactId>`).
- **`rulesPost`** — if the artifact declares `rules.post`, collect all entries' `text` in declaration order.

When `delta` is `false`, the `delta` field in the result is `null`.

### Requirement: Result shape

`GetArtifactInstruction.execute` MUST return a structured result containing:

- `artifactId` (string) — the artifact ID
- `rulesPre` (string\[]) — `rules.pre` texts in declaration order; empty array if none
- `instruction` (string | null) — the artifact's instruction text; `null` if not declared
- `template` (string | null) — the resolved template file content with variables expanded; `null` when the artifact has no template declared
- `delta` (object | null) — delta-specific instruction components; `null` when `delta: false`:
  - `formatInstructions` (string) — format-specific delta writing guidance
  - `domainInstructions` (string | null) — the artifact's `deltaInstruction` text; `null` if not declared
  - `availableOutlines` (string\[]) — spec IDs from `change.specIds` whose artifact file exists and can be outlined
- `rulesPost` (string\[]) — `rules.post` texts in declaration order; empty array if none

The caller decides which parts to use. A subagent creating artifacts from scratch uses `rulesPre` + `instruction` + `template` + `rulesPost`. A subagent creating deltas uses `rulesPre` + `delta` + `rulesPost`, and fetches outline details on demand with `specd specs outline <specPath> --artifact <artifactId>`.

## Constraints

- This use case is read-only — it does not modify the change or execute any commands
- `rules.pre` and `rules.post` are schema composition mechanisms — they augment the instruction without replacing it
- The use case does not evaluate step availability or artifact status
- Delta outline availability is derived from `SpecRepository` for each spec in `change.specIds`; missing files are silently skipped
- Full outline trees are intentionally excluded from this result; consumers must call `GetSpecOutline`/`specd specs outline` on demand
- `ArtifactParserRegistry` must contain an adapter for the artifact's format; if no adapter is registered, the use case throws `ParserNotRegisteredError`

## Spec Dependencies

- [`core:core/schema-format`](../schema-format/spec.md) — artifact `instruction`, `rules.pre`, `rules.post`, `delta`, `deltaInstruction`, `format`
- [`core:core/delta-format`](../delta-format/spec.md) — `ArtifactParser` port, `deltaInstructions()`, `outline()`
- [`core:core/change`](../change/spec.md) — Change entity, `specIds`, `schemaName`
- [`core:core/schema-merge`](../schema-merge/spec.md) — schema composition via `rules.pre`/`rules.post`
- [`core:core/template-variables`](../template-variables/spec.md) — `TemplateExpander`, `TemplateVariables`, expansion semantics
