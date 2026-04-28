# Verification: GetProjectContext

## Requirements

### Requirement: Accepts GetProjectContextInput as input

#### Scenario: Minimal input with config only

- **WHEN** `execute` is called with `{ config: { context: [], contextIncludeSpecs: [] } }`
- **THEN** the call succeeds and returns a result with empty `contextEntries`, `specs`, and `warnings`

#### Scenario: Full optional input supported

- **WHEN** `execute` is called with `followDeps: true`, `depth: 2`, and `sections: ["rules"]`
- **THEN** the call succeeds and respects all optional parameters

#### Scenario: Sections only affect full-mode rendering

- **GIVEN** `contextMode` resolves to `list` or `summary`
- **WHEN** `execute` is called with section filters
- **THEN** emitted entries remain list/summary shaped without full content sections

### Requirement: Returns GetProjectContextResult on success

#### Scenario: Result contains structured spec entries

- **GIVEN** project-level include patterns match specs
- **WHEN** `GetProjectContext.execute` is called
- **THEN** `result.specs` is an array of context entries with `specId`, `source`, and `mode`

#### Scenario: Summary mode emits summary entries

- **GIVEN** `contextMode: "summary"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use summary mode

#### Scenario: List mode emits list entries

- **GIVEN** `contextMode: "list"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use list mode

#### Scenario: Full and hybrid modes emit full entries in project context

- **GIVEN** `contextMode: "full"` or `contextMode: "hybrid"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use full mode

### Requirement: Resolves schema before processing

#### Scenario: Schema resolution failure propagates

- **WHEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **THEN** the error propagates — the use case does not catch it

### Requirement: Renders project-level context entries

#### Scenario: Instruction entry rendered

- **GIVEN** `config.context` contains `{ instruction: "Always use TypeScript" }`
- **WHEN** `execute` is called
- **THEN** `contextEntries` contains a string starting with `**Source: instruction**` followed by the instruction text

#### Scenario: File entry rendered

- **GIVEN** `config.context` contains `{ file: "AGENTS.md" }` and the file exists with content
- **WHEN** `execute` is called
- **THEN** `contextEntries` contains a string starting with `**Source: AGENTS.md**` followed by the file content with headings shifted

#### Scenario: Missing file emits warning

- **GIVEN** `config.context` contains `{ file: "missing.md" }` and the file does not exist
- **WHEN** `execute` is called
- **THEN** `warnings` contains a `missing-file` warning for `missing.md`
- **AND** `contextEntries` does not include an entry for the missing file

#### Scenario: Context entries appear in declaration order

- **GIVEN** `config.context` contains `[{ instruction: "first" }, { file: "second.md" }]` and `second.md` exists
- **WHEN** `execute` is called
- **THEN** `contextEntries[0]` contains "first" and `contextEntries[1]` contains "second.md"

### Requirement: Applies project-level include/exclude patterns

#### Scenario: Include pattern matches specs

- **GIVEN** `config.contextIncludeSpecs` is `["default:*"]` and the default workspace has specs
- **WHEN** `execute` is called
- **THEN** `specs` contains entries for all specs in the default workspace

#### Scenario: Exclude pattern removes specs

- **GIVEN** `config.contextIncludeSpecs` is `["default:*"]` and `config.contextExcludeSpecs` is `["default:drafts/*"]`
- **WHEN** `execute` is called
- **THEN** `specs` does not contain any spec under `drafts/`

#### Scenario: Specs deduplicated across patterns

- **GIVEN** `config.contextIncludeSpecs` is `["default:architecture", "default:*"]`
- **WHEN** `execute` is called
- **THEN** the `architecture` spec appears exactly once in `specs`

### Requirement: Does not apply workspace-level patterns

#### Scenario: Workspace-level patterns ignored

- **GIVEN** a workspace declares `contextIncludeSpecs: ["extra/*"]` at workspace level
- **WHEN** `execute` is called
- **THEN** specs matched only by the workspace-level pattern are not included

### Requirement: Supports dependsOn traversal when followDeps is true

#### Scenario: DependsOn traversal discovers additional specs

- **GIVEN** spec A's metadata has `dependsOn: ["default:B"]` and spec B exists
- **WHEN** `execute` is called with `followDeps: true` and spec A is in the include set
- **THEN** `specs` contains both spec A and spec B

#### Scenario: DependsOn traversal respects depth limit

- **GIVEN** spec A depends on B, B depends on C
- **WHEN** `execute` is called with `followDeps: true` and `depth: 1`
- **THEN** `specs` contains A and B but not C

#### Scenario: DependsOn traversal falls back to transform-backed extraction

- **GIVEN** a spec has no fresh metadata
- **AND** the schema declares `metadataExtraction.dependsOn` with a transform such as `resolveSpecPath`
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal uses live extraction with the shared transform registry and origin context to discover additional specs

#### Scenario: DependsOn traversal does not silently drop found dependency values

- **GIVEN** live fallback extraction finds dependency values for a spec
- **AND** transform execution cannot normalize those found values
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal fails explicitly instead of treating the spec as having no dependencies

### Requirement: Renders spec content from metadata when fresh

#### Scenario: Fresh metadata rendered with all sections in full mode

- **GIVEN** a spec has fresh `.specd-metadata.yaml`
- **AND** the effective display mode is full
- **WHEN** `execute` is called without `sections` filter
- **THEN** the spec entry includes Title, Description, Rules, and Constraints (default sections)

#### Scenario: Sections filter restricts full output

- **GIVEN** a spec has fresh metadata
- **AND** the effective display mode is full
- **WHEN** `execute` is called with `sections: ["rules"]`
- **THEN** the spec entry includes Title and Description (header persistence)
- **AND** the spec entry includes Rules but not scenarios or constraints

### Requirement: Falls back to extraction when metadata is stale or absent

#### Scenario: Stale metadata emits warning and falls back

- **GIVEN** a spec has `.specd-metadata.yaml` but content hashes do not match current artifacts
- **WHEN** `execute` is called
- **THEN** `warnings` contains a `stale-metadata` warning for that spec
- **AND** the spec's `content` is rendered via live extraction

#### Scenario: No metadata emits warning and falls back

- **GIVEN** a spec has no `.specd-metadata.yaml`
- **WHEN** `execute` is called
- **THEN** `warnings` contains a `stale-metadata` warning indicating no metadata exists
- **AND** the spec's `content` is rendered via live extraction if the schema supports it

#### Scenario: Fallback extraction uses shared transform registry

- **GIVEN** the schema declares transforms inside `metadataExtraction`
- **WHEN** `GetProjectContext` falls back to live extraction for stale or absent metadata
- **THEN** it uses the shared extractor-transform registry and origin context for the artifact being rendered

#### Scenario: Fallback extraction does not silently drop found transformed values

- **GIVEN** live fallback extraction finds a value for a transformed field
- **AND** the transform cannot normalize that value
- **WHEN** `GetProjectContext` renders fallback content
- **THEN** the fallback path fails explicitly instead of silently omitting the found value

#### Scenario: No metadataExtraction in schema yields empty content

- **GIVEN** a spec has no metadata and the schema has no `metadataExtraction` declarations
- **WHEN** `execute` is called
- **THEN** the spec's `content` contains only the spec heading with no body
