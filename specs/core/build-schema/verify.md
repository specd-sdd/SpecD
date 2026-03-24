# Verification: Build Schema

## Requirements

### Requirement: Pure function signature

#### Scenario: Synchronous return

- **WHEN** `buildSchema` is called with valid `ref`, `data`, and `templates`
- **THEN** it returns a `Schema` entity synchronously — no `Promise`, no `await`

### Requirement: SchemaYamlData intermediate type

#### Scenario: No Zod imports in domain service

- **WHEN** inspecting the imports of `domain/services/build-schema.ts`
- **THEN** there are no imports from `zod`, `yaml`, `node:fs`, or any `infrastructure/` module

### Requirement: Artifact ID format validation

#### Scenario: ID with uppercase letters rejected

- **WHEN** `buildSchema` receives an artifact with `id: "MyArtifact"`
- **THEN** it throws `SchemaValidationError` with a message mentioning the invalid ID and the expected pattern

#### Scenario: ID starting with a digit rejected

- **WHEN** `buildSchema` receives an artifact with `id: "1specs"`
- **THEN** it throws `SchemaValidationError`

#### Scenario: ID with underscores rejected

- **WHEN** `buildSchema` receives an artifact with `id: "my_artifact"`
- **THEN** it throws `SchemaValidationError`

#### Scenario: Valid kebab-case ID accepted

- **WHEN** `buildSchema` receives an artifact with `id: "my-artifact"`
- **THEN** no error is thrown for that artifact's ID

### Requirement: Artifact ID uniqueness validation

#### Scenario: Duplicate artifact IDs

- **WHEN** `buildSchema` receives two artifacts both with `id: "specs"`
- **THEN** it throws `SchemaValidationError` mentioning the duplicate ID `"specs"`

### Requirement: Array entry ID validation

#### Scenario: Duplicate hook IDs across workflow steps

- **GIVEN** workflow step `"designing"` with `hooks.pre: [{ id: "run-lint" }]` and workflow step `"implementing"` with `hooks.post: [{ id: "run-lint" }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate hook ID `"run-lint"`

#### Scenario: Unique hook IDs across workflow steps accepted

- **GIVEN** workflow steps with hooks `"designing.pre: [lint]"`, `"implementing.pre: [test]"`, `"implementing.post: [deploy]"`
- **WHEN** `buildSchema` validates the schema
- **THEN** no error is thrown for hook IDs

#### Scenario: Duplicate validation IDs within same artifact rejected

- **GIVEN** an artifact with `validations: [{ id: "req-1", type: "section" }, { id: "req-1", type: "list-item" }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate validation ID `"req-1"`

#### Scenario: Duplicate deltaValidation IDs within same artifact rejected

- **GIVEN** an artifact with `deltaValidations: [{ id: "has-scenario", type: "section" }, { id: "has-scenario", type: "list-item" }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate deltaValidation ID `"has-scenario"`

#### Scenario: Duplicate rules.pre IDs within same artifact rejected

- **GIVEN** an artifact with `rules.pre: [{ id: "normative", text: "..." }, { id: "normative", text: "..." }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate rules.pre ID `"normative"`

#### Scenario: Duplicate rules.post IDs within same artifact rejected

- **GIVEN** an artifact with `rules.post: [{ id: "format", text: "..." }, { id: "format", text: "..." }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate rules.post ID `"format"`

#### Scenario: Duplicate preHashCleanup IDs within same artifact rejected

- **GIVEN** an artifact with `preHashCleanup: [{ id: "checkboxes", pattern: "..." }, { id: "checkboxes", pattern: "..." }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate preHashCleanup ID `"checkboxes"`

#### Scenario: Duplicate metadataExtraction.context IDs rejected

- **GIVEN** metadata extraction with `context: [{ id: "ctx-1", ... }, { id: "ctx-1", ... }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate context ID `"ctx-1"`

#### Scenario: Duplicate metadataExtraction.rules IDs rejected

- **GIVEN** metadata extraction with `rules: [{ id: "rule-1", ... }, { id: "rule-1", ... }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate rules ID `"rule-1"`

#### Scenario: Duplicate metadataExtraction.constraints IDs rejected

- **GIVEN** metadata extraction with `constraints: [{ id: "constraint-1", ... }, { id: "constraint-1", ... }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate constraints ID `"constraint-1"`

#### Scenario: Duplicate metadataExtraction.scenarios IDs rejected

- **GIVEN** metadata extraction with `scenarios: [{ id: "scenario-1", ... }, { id: "scenario-1", ... }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` mentioning the duplicate scenarios ID `"scenario-1"`

#### Scenario: Unique IDs within different arrays are accepted

- **GIVEN** an artifact with `validations: [{ id: "v1", ... }]` and another artifact with `validations: [{ id: "v1", ... }]`
- **WHEN** `buildSchema` validates the schema
- **THEN** no error is thrown — IDs only need to be unique within their immediate array

### Requirement: Template reference validation

#### Scenario: Template path not in templates map

- **WHEN** an artifact declares `template: "templates/missing.md"` and the `templates` map does not contain that key
- **THEN** `buildSchema` throws `SchemaValidationError` indicating the missing template path

#### Scenario: Template path present in templates map

- **WHEN** an artifact declares `template: "templates/spec.md"` and the `templates` map contains `"templates/spec.md"` with content `"# Template"`
- **THEN** the resulting `ArtifactType` has `template` equal to `"# Template"`

#### Scenario: Artifact without template field

- **WHEN** an artifact does not declare a `template` field
- **THEN** no template lookup is performed and the resulting `ArtifactType` has `template` as `undefined`

### Requirement: Workflow step uniqueness validation

#### Scenario: Duplicate step names

- **WHEN** `buildSchema` receives workflow entries with two steps both named `"implementing"`
- **THEN** it throws `SchemaValidationError` mentioning the duplicate step name

#### Scenario: Unique step names accepted

- **WHEN** `buildSchema` receives workflow entries with steps `"designing"`, `"implementing"`, `"archiving"`
- **THEN** no error is thrown for workflow step names

### Requirement: Artifact dependency graph validation

#### Scenario: Requires references unknown artifact

- **WHEN** artifact `"tasks"` declares `requires: ["nonexistent"]`
- **THEN** `buildSchema` throws `SchemaValidationError` mentioning artifact `"tasks"` and unknown artifact `"nonexistent"`

#### Scenario: Non-optional artifact depends on optional artifact

- **GIVEN** artifact `"design"` is `optional: true` and artifact `"tasks"` is not optional
- **WHEN** `"tasks"` declares `requires: ["design"]`
- **THEN** `buildSchema` throws `SchemaValidationError` mentioning that non-optional `"tasks"` requires optional `"design"`

#### Scenario: Optional artifact depends on optional artifact

- **GIVEN** both `"design"` and `"review"` are `optional: true`
- **WHEN** `"review"` declares `requires: ["design"]`
- **THEN** no error is thrown — optional-to-optional dependency is allowed

#### Scenario: Circular dependency detected

- **GIVEN** artifact `"a"` requires `["b"]` and artifact `"b"` requires `["a"]`
- **WHEN** `buildSchema` validates the dependency graph
- **THEN** it throws `SchemaValidationError` mentioning a circular dependency

#### Scenario: Transitive cycle detected

- **GIVEN** artifact `"a"` requires `["b"]`, `"b"` requires `["c"]`, and `"c"` requires `["a"]`
- **WHEN** `buildSchema` validates the dependency graph
- **THEN** it throws `SchemaValidationError` mentioning a circular dependency

#### Scenario: Valid acyclic graph accepted

- **GIVEN** `"specs"` requires `["proposal"]`, `"tasks"` requires `["specs"]`
- **WHEN** `buildSchema` validates the dependency graph
- **THEN** no error is thrown

### Requirement: buildSelector sub-function

#### Scenario: Undefined optional fields stripped

- **WHEN** `buildSelector` receives `{ type: "section", matches: undefined, parent: undefined }`
- **THEN** the result has `type: "section"` and no `matches` or `parent` keys

#### Scenario: Nested parent selector converted recursively

- **WHEN** `buildSelector` receives `{ type: "section", parent: { type: "section", matches: "^Requirements$" } }`
- **THEN** the result has a `parent` Selector with `type: "section"` and `matches: "^Requirements$"`

### Requirement: buildValidationRule sub-function

#### Scenario: Flat selector fields converted to nested selector

- **WHEN** `buildValidationRule` receives `{ type: "section", matches: "^Overview$", required: true }`
- **THEN** the result has a `selector` with `type: "section"` and `matches: "^Overview$"`, plus `required: true`

#### Scenario: Explicit selector field takes precedence

- **WHEN** `buildValidationRule` receives `{ selector: { type: "section" }, type: "list-item" }`
- **THEN** the result uses the explicit `selector` field (`type: "section"`), not the flat `type` field

#### Scenario: Children rules converted recursively

- **WHEN** `buildValidationRule` receives a rule with `children` containing two sub-rules
- **THEN** both children are converted via `buildValidationRule` recursively

### Requirement: buildFieldMapping sub-function

#### Scenario: childSelector converted via buildSelector

- **WHEN** `buildFieldMapping` receives `{ childSelector: { type: "list-item", matches: "^WHEN" } }`
- **THEN** the result has a `childSelector` Selector with `type: "list-item"` and `matches: "^WHEN"`

### Requirement: buildExtractor sub-function

#### Scenario: Fields record converted entry by entry

- **WHEN** `buildExtractor` receives an extractor with `fields: { name: { from: "label" }, given: { childSelector: { type: "list-item" } } }`
- **THEN** the result has `fields` with `name` as a `FieldMapping` with `from: "label"` and `given` as a `FieldMapping` with a converted `childSelector`

### Requirement: buildArtifactType sub-function

#### Scenario: Optional defaults applied

- **WHEN** `buildArtifactType` receives a raw artifact with `optional`, `delta`, and `requires` all omitted
- **THEN** the resulting `ArtifactType` has `optional: false`, `delta: false`, and `requires: []`

#### Scenario: Template content passed through

- **WHEN** `buildArtifactType` receives a raw artifact and template content `"# My Template\n"`
- **THEN** the resulting `ArtifactType` has `template` equal to `"# My Template\n"`

### Requirement: Schema entity construction

#### Scenario: Full schema constructed from valid data

- **GIVEN** valid `SchemaYamlData` with name `"test"`, version `1`, two artifacts, a workflow, and metadata extraction
- **WHEN** `buildSchema` is called
- **THEN** the returned `Schema` has `name() === "test"`, `version() === 1`, two artifacts accessible via `artifact(id)`, workflow steps accessible via `workflowStep(name)`, and metadata extraction defined
