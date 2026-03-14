# Verification: Template Variables

## Requirements

### Requirement: Syntax

#### Scenario: Standard token expansion

- **GIVEN** a template `"Project at {{project.root}}"`
- **AND** variables `{ project: { root: "/home/dev/myapp" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"Project at /home/dev/myapp"`

#### Scenario: Multiple tokens in one string

- **GIVEN** a template `"{{change.name}} in {{change.workspace}}"`
- **AND** variables `{ change: { name: "add-auth", workspace: "default" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"add-auth in default"`

### Requirement: Expansion semantics

#### Scenario: Unknown namespace preserved

- **GIVEN** a template `"{{unknown.key}} stays"`
- **AND** variables `{ project: { root: "/home" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"{{unknown.key}} stays"`

#### Scenario: Unknown key in existing namespace preserved

- **GIVEN** a template `"{{project.missing}} stays"`
- **AND** variables `{ project: { root: "/home" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"{{project.missing}} stays"`

#### Scenario: Single-pass expansion (no recursion)

- **GIVEN** a template `"{{change.name}}"`
- **AND** variables `{ change: { name: "{{project.root}}" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"{{project.root}}"` — the expanded value is not re-scanned

### Requirement: Shell escaping for run hooks

#### Scenario: expandForShell escapes values

- **GIVEN** a template `"echo {{change.name}}"`
- **AND** variables `{ change: { name: "it's-a-test" } }`
- **WHEN** `expandForShell()` is called
- **THEN** the result is `"echo 'it'\\''s-a-test'"` (value is single-quote escaped)

#### Scenario: expand does not escape

- **GIVEN** a template `"Read {{change.name}}"`
- **AND** variables `{ change: { name: "it's-a-test" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"Read it's-a-test"` (value is verbatim)

### Requirement: Namespace naming rules

#### Scenario: Hyphenated names are valid

- **GIVEN** a template `"{{change.spec-ids}}"`
- **AND** variables `{ change: { "spec-ids": "core:auth/login" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"core:auth/login"`

### Requirement: TemplateExpander class

#### Scenario: Built-in variables always present

- **GIVEN** a `TemplateExpander` constructed with `{ project: { root: "/home/dev/myapp" } }`
- **AND** a template `"{{project.root}}"`
- **WHEN** `expand()` is called with no contextual variables
- **THEN** the result is `"/home/dev/myapp"`

#### Scenario: Contextual variables merged with built-ins

- **GIVEN** a `TemplateExpander` constructed with `{ project: { root: "/home/dev/myapp" } }`
- **AND** a template `"{{project.root}} {{change.name}}"`
- **WHEN** `expand()` is called with contextual variables `{ change: { name: "add-auth" } }`
- **THEN** the result is `"/home/dev/myapp add-auth"`

#### Scenario: Contextual variables cannot override built-ins

- **GIVEN** a `TemplateExpander` constructed with `{ project: { root: "/home/dev/myapp" } }`
- **AND** a template `"{{project.root}}"`
- **WHEN** `expand()` is called with contextual variables `{ project: { root: "/malicious/path" } }`
- **THEN** the result is `"/home/dev/myapp"` — built-in takes precedence

### Requirement: Variable map construction

#### Scenario: Use cases build contextual variables per invocation

- **GIVEN** a use case that needs template expansion
- **THEN** it passes contextual namespaces (e.g. `change`) to the expander methods
- **AND** built-in variables (e.g. `project.root`) are already in the `TemplateExpander`

### Requirement: Contextual namespaces

#### Scenario: Change namespace populated from change entity

- **GIVEN** a change named `add-auth` in workspace `default` at path `/project/changes/add-auth`
- **WHEN** the use case builds the variable map
- **THEN** the map contains `{ change: { name: "add-auth", workspace: "default", path: "/project/changes/add-auth" } }`
