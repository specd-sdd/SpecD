# GetProjectContext

## Purpose

Tooling sometimes needs the project's compiled spec context without an active change — for example, when generating agent instructions or answering project-wide queries. `GetProjectContext` provides this by compiling the project-level context block (steps 1-4 of the compilation pipeline: `context:` entries, project-level include/exclude patterns) with all configured workspaces treated as active. It is the change-independent counterpart to `CompileContext`.

## Requirements

### Requirement: Accepts GetProjectContextInput as input

`execute(input)` MUST accept a `GetProjectContextInput` object with the following fields:

- `config` (`CompileContextConfig`, required) — the resolved project configuration containing `context` entries, `contextIncludeSpecs`, `contextExcludeSpecs`, and `contextMode`
- `followDeps` (boolean, optional) — when `true`, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs beyond those matched by include/exclude patterns. When `false` or absent, traversal is not performed.
- `depth` (number, optional) — limits `dependsOn` traversal depth. Only meaningful when `followDeps` is `true`. `1` means direct dependencies only; absent means unlimited.
- `sections` (`ReadonlyArray<SpecSection>`, optional) — restricts which metadata sections are rendered per full-mode spec (`"rules"`, `"constraints"`, `"scenarios"`). It has no effect for list-mode or summary-mode entries.

### Requirement: Returns GetProjectContextResult on success

`execute` MUST return a `GetProjectContextResult` containing:

- `contextEntries` (string\[]) — rendered project-level context entries (instruction text or file content).
- `specs` (`ContextSpecEntry[]`) — specs matched by include/exclude patterns, each with `specId`, `source`, `mode`, and optional `title`, `description`, and `content` fields according to the display mode. The `ContextSpecEntry` type is the same as defined in the `CompileContext` spec.
- `warnings` (`ContextWarning[]`) — advisory warnings for missing files, stale metadata, unknown workspaces, etc.

Since `GetProjectContext` operates without a change, all specs MUST have `source: 'includePattern'`. The mode field is determined by `config.contextMode`: `list` emits list entries, `summary` emits summary entries, and `full` or `hybrid` emits full entries. Project context has no direct change specs, so `hybrid` is equivalent to `full`.

### Requirement: Resolves schema before processing

The use case MUST obtain the project's schema via `SchemaProvider.get()` before processing any specs. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these.

### Requirement: Renders project-level context entries

For each entry in `config.context`:

- If the entry has an `instruction` key, the instruction text MUST be rendered with the label `**Source: instruction**`.
- If the entry has a `file` key, the file content MUST be read via the `FileReader` port. If the file exists, its content is rendered with the label `**Source: <path>**` and headings shifted down by one level. If the file does not exist, a `missing-file` warning MUST be emitted and the entry skipped.

Context entries MUST appear in declaration order and before any spec content.

### Requirement: Applies project-level include/exclude patterns

The use case MUST apply `config.contextIncludeSpecs` patterns to collect specs across all workspaces, then apply `config.contextExcludeSpecs` patterns to remove specs from the collected set. Pattern matching MUST use the same `listMatchingSpecs` logic as `CompileContext`, treating all workspaces as active.

### Requirement: Does not apply workspace-level patterns

The use case MUST NOT apply workspace-level `contextIncludeSpecs` or `contextExcludeSpecs` patterns. Those are conditional on a specific change having that workspace active and are the responsibility of `CompileContext`.

### Requirement: Supports dependsOn traversal when followDeps is true

When `input.followDeps` is `true`, the use case MUST traverse `dependsOn` links starting from each included spec, using persisted metadata when it is fresh and the schema's `metadataExtraction` declarations as a fallback when metadata is absent or stale.

That fallback extraction MUST use the same shared extractor-transform registry and caller-owned origin context bag used by the other metadata-extraction consumers. Newly discovered specs MUST be added to the included set. Traversal MUST respect `input.depth` when provided.

If fallback extraction finds dependency values but transform execution cannot normalize them, the use case MUST fail explicitly rather than silently treating those dependencies as absent.

### Requirement: Renders spec content from metadata when fresh

For each included spec, if `.specd-metadata.yaml` exists and its content hashes match the current artifacts (verified via `ContentHasher`), the use case MUST render from the parsed metadata according to `config.contextMode`.

- In `list` mode, render no title, description, or content.
- In `summary` mode, render title and description only.
- In `full` mode, render description, rules, constraints, and scenarios as applicable, filtered by `input.sections` when provided.
- In `hybrid` mode, render the same output as `full` because project context has no change-scoped tier.

Section filters MUST NOT affect list-mode or summary-mode entries.

### Requirement: Falls back to extraction when metadata is stale or absent

When metadata is stale or absent, the use case MUST:

1. Emit a `stale-metadata` warning identifying the spec.
2. Attempt live extraction using the schema's `metadataExtraction` engine, the shared extractor-transform registry, and caller-owned origin context for each artifact.
3. If extraction yields content, render it with the same section filtering as fresh metadata.
4. If the schema has no `metadataExtraction` declarations, render an empty spec heading.

If extraction finds values for transformed fields but transform execution cannot normalize them, the use case MUST fail explicitly instead of silently omitting those found values from the rendered fallback content.

### Requirement: Construction dependencies

`GetProjectContext` depends on the following ports injected via constructor:

- `specs` (`ReadonlyMap<string, SpecRepository>`) — per-workspace spec repositories
- `schemaProvider` (`SchemaProvider`) — lazy, caching provider for the fully-resolved schema (replaces `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths`)
- `files` (`FileReader`) — for reading context entry files from disk
- `parsers` (`ArtifactParserRegistry`) — for parsing spec artifacts when metadata is stale
- `hasher` (`ContentHasher`) — for comparing content hashes against metadata

All dependencies are injected at construction time. The schema is resolved lazily on first access.

## Constraints

- The use case operates without a change context — it treats all workspaces as active.
- Workspace-level context patterns are never applied — only project-level patterns.
- Specs matched by multiple include patterns appear only once.
- Context entries are always rendered before spec content.
- The use case is async — it returns `Promise<GetProjectContextResult>`.
- Spec rendering uses the same formatting logic as `CompileContext` (heading levels, section labels).
- `dependsOn` traversal is only performed when explicitly requested via `followDeps: true`.

## Spec Dependencies

- [`core:core/config`](../config/spec.md) — context entry format, include/exclude pattern semantics, `CompileContextConfig` structure, `contextMode`
- [`core:core/compile-context`](../compile-context/spec.md) — shared pattern matching, rendering logic, `ContextSpecEntry` type definition
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format and content hash freshness model
- [`core:core/schema-format`](../schema-format/spec.md) — `metadataExtraction` declarations and schema artifacts
- `default:_global/architecture` — port/adapter design constraints
