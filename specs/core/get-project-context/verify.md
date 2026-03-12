# Verification: GetProjectContext

## Requirements

### Requirement: Accepts GetProjectContextInput as input

#### Scenario: Minimal input with config only

- **WHEN** `execute` is called with `{ config: { context: [], contextIncludeSpecs: [] } }`
- **THEN** the call succeeds and returns a result with empty `contextEntries`, `specs`, and `warnings`

#### Scenario: All optional fields provided

- **WHEN** `execute` is called with `followDeps: true`, `depth: 2`, and `sections: ["rules"]`
- **THEN** the call succeeds and respects all optional parameters

### Requirement: Returns GetProjectContextResult on success

#### Scenario: Result contains all three fields

- **WHEN** `execute` completes successfully
- **THEN** the result contains `contextEntries` (string array), `specs` (array of spec entries), and `warnings` (array of context warnings)

### Requirement: Resolves schema before processing

#### Scenario: Schema not found

- **GIVEN** `SchemaRegistry.resolve` returns `null` for the configured schema reference
- **WHEN** `execute` is called
- **THEN** a `SchemaNotFoundError` is thrown with the schema reference string

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

#### Scenario: DependsOn traversal skipped when followDeps is false

- **GIVEN** spec A's metadata has `dependsOn: ["default:B"]`
- **WHEN** `execute` is called with `followDeps` absent
- **THEN** spec B is not included unless it matches an include pattern independently

### Requirement: Renders spec content from metadata when fresh

#### Scenario: Fresh metadata rendered with all sections

- **GIVEN** a spec has fresh `.specd-metadata.yaml` with description, rules, constraints, and scenarios
- **WHEN** `execute` is called without `sections` filter
- **THEN** the spec's `content` includes all four sections

#### Scenario: Sections filter restricts output

- **GIVEN** a spec has fresh metadata with rules and scenarios
- **WHEN** `execute` is called with `sections: ["rules"]`
- **THEN** the spec's `content` includes rules but not scenarios or description

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

#### Scenario: No metadataExtraction in schema yields empty content

- **GIVEN** a spec has no metadata and the schema has no `metadataExtraction` declarations
- **WHEN** `execute` is called
- **THEN** the spec's `content` contains only the spec heading with no body
