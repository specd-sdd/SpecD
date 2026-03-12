# GetProjectContext

## Overview

The `GetProjectContext` use case compiles the project-level context block without requiring a specific change or lifecycle step. It performs steps 1-4 of the context compilation pipeline (project `context:` entries, project-level include/exclude patterns) with all configured workspaces treated as active. This is the change-independent counterpart to `CompileContext`, suitable for project-wide tooling queries.

## Requirements

### Requirement: Accepts GetProjectContextInput as input

`execute(input)` MUST accept a `GetProjectContextInput` object with the following fields:

- `config` (`CompileContextConfig`, required) — the resolved project configuration containing `context` entries, `contextIncludeSpecs`, and `contextExcludeSpecs`.
- `followDeps` (boolean, optional) — when `true`, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs beyond those matched by include/exclude patterns. When `false` or absent, traversal is not performed.
- `depth` (number, optional) — limits `dependsOn` traversal depth. Only meaningful when `followDeps` is `true`. `1` means direct dependencies only; absent means unlimited.
- `sections` (`ReadonlyArray<SpecSection>`, optional) — restricts which metadata sections are rendered per spec (`"rules"`, `"constraints"`, `"scenarios"`). When absent, all sections are rendered including the description.

### Requirement: Returns GetProjectContextResult on success

`execute` MUST return a `GetProjectContextResult` containing:

- `contextEntries` (string[]) — rendered project-level context entries (instruction text or file content).
- `specs` (`GetProjectContextSpecEntry[]`) — specs matched by include/exclude patterns, each with `workspace`, `path`, and `content` fields.
- `warnings` (`ContextWarning[]`) — advisory warnings for missing files, stale metadata, unknown workspaces, etc.

### Requirement: Resolves schema before processing

The use case MUST resolve the project's schema via `SchemaRegistry.resolve` before processing any specs. If the schema reference cannot be resolved (returns `null`), the use case MUST throw `SchemaNotFoundError`.

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

When `input.followDeps` is `true`, the use case MUST traverse `dependsOn` links starting from each included spec, using the schema's `metadataExtraction` declarations as a fallback when `.specd-metadata.yaml` is absent. Newly discovered specs MUST be added to the included set. Traversal MUST respect `input.depth` when provided.

### Requirement: Renders spec content from metadata when fresh

For each included spec, if `.specd-metadata.yaml` exists and its content hashes match the current artifacts (verified via `ContentHasher`), the use case MUST render from the parsed metadata. The rendered output MUST include description, rules, constraints, and scenarios as applicable, filtered by `input.sections` when provided.

### Requirement: Falls back to extraction when metadata is stale or absent

When metadata is stale or absent, the use case MUST:

1. Emit a `stale-metadata` warning identifying the spec.
2. Attempt live extraction using the schema's `metadataExtraction` engine and `ArtifactParserRegistry`.
3. If extraction yields content, render it with the same section filtering as fresh metadata.
4. If the schema has no `metadataExtraction` declarations, render an empty spec heading.

### Requirement: Construction dependencies

`GetProjectContext` MUST be constructed with the following dependencies:

- `specs` (`ReadonlyMap<string, SpecRepository>`) — spec repositories keyed by workspace name.
- `schemas` (`SchemaRegistry`) — registry for resolving schema references.
- `files` (`FileReader`) — reader for project-level context file entries.
- `parsers` (`ArtifactParserRegistry`) — registry of artifact format parsers for extraction fallback.
- `hasher` (`ContentHasher`) — content hasher for metadata freshness checks.
- `schemaRef` (`string`) — schema reference string from `specd.yaml`.
- `workspaceSchemasPaths` (`ReadonlyMap<string, string>`) — map of workspace name to absolute schemas directory path.

## Constraints

- The use case operates without a change context — it treats all workspaces as active.
- Workspace-level context patterns are never applied — only project-level patterns.
- Specs matched by multiple include patterns appear only once.
- Context entries are always rendered before spec content.
- The use case is async — it returns `Promise<GetProjectContextResult>`.
- Spec rendering uses the same formatting logic as `CompileContext` (heading levels, section labels).
- `dependsOn` traversal is only performed when explicitly requested via `followDeps: true`.

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — context entry format, include/exclude pattern semantics, `CompileContextConfig` structure
- [`specs/core/compile-context/spec.md`](../compile-context/spec.md) — shared pattern matching and rendering logic
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format and content hash freshness model
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `metadataExtraction` declarations and schema artifacts
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
