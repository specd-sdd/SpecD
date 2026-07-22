# Verification: Template Variables

## Requirements

### Requirement: Syntax

#### Scenario: Standard token expansion

- **GIVEN** a template `"Project at {{project.root}}"`
- **AND** variables `{ project: { root: "/home/dev/myapp" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"Project at /home/dev/myapp"`

#### Scenario: Multiple tokens in one string

- **GIVEN** a template `"{{change.name}} at {{change.path}}"`
- **AND** variables `{ change: { name: "add-auth", path: "/project/changes/add-auth" } }`
- **WHEN** `expand()` is called
- **THEN** the result is `"add-auth at /project/changes/add-auth"`

### Requirement: Built-in namespace

#### Scenario: project namespace is always present

- **GIVEN** any expansion context
- **WHEN** `expand()` is called
- **THEN** the `project` namespace is available
- **AND** `project.root` contains the absolute path to the project root

#### Scenario: Built-in variables are injected at composition time

- **WHEN** `TemplateExpander` is constructed
- **THEN** it receives built-in variables (project namespace) from the composition layer
- **AND** use cases do not need to build them per invocation

### Requirement: Variable map shape

#### Scenario: Variable map is a nested record structure

- **GIVEN** a variable map `{ project: { root: '/home' }, change: { name: 'my-change' } }`
- **WHEN** it is used for expansion
- **THEN** it is a plain object where top-level keys are namespace names
- **AND** each namespace value is a flat record of string keys to primitive values

#### Scenario: Only primitive values are expanded

- **GIVEN** a template `"{{change.complex}}"`
- **AND** variables `{ change: { complex: { nested: 'value' } } }`
- **WHEN** `expand()` is called
- **THEN** the token is preserved unchanged because object values are not expanded

#### Scenario: Example variable map has no workspace key

- **GIVEN** the normative example variable map `{ project: { root: '/Users/dev/my-project' }, change: { name: 'add-auth', path: '/Users/dev/my-project/changes/add-auth', archivedName: '20260418-103000-add-auth' } }`
- **WHEN** the shape is checked against `TemplateVariables`
- **THEN** the `change` namespace contains no `workspace` key

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

#### Scenario: Unknown token invokes onUnknown callback

- **GIVEN** a `TemplateExpander` constructed with `onUnknown` callback
- **AND** a template `"{{unknown.key}}"`
- **WHEN** `expand()` is called
- **THEN** the `onUnknown` callback is called with `"unknown.key"`
- **AND** the result is `"{{unknown.key}}"` — the token is preserved

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

#### Scenario: onUnknown callback invoked for unresolved tokens

- **GIVEN** a `TemplateExpander` constructed with builtins and `onUnknown: (token) => warnings.push(token)`
- **AND** a template `"{{foo.bar}} and {{baz.qux}}"`
- **WHEN** `expand()` is called with empty contextual variables
- **THEN** `onUnknown` is called twice — with `"foo.bar"` and `"baz.qux"`
- **AND** the result is `"{{foo.bar}} and {{baz.qux}}"`

#### Scenario: No onUnknown callback means silent preservation

- **GIVEN** a `TemplateExpander` constructed with builtins only (no `onUnknown`)
- **AND** a template `"{{unknown.key}}"`
- **WHEN** `expand()` is called
- **THEN** no callback is invoked
- **AND** the result is `"{{unknown.key}}"`

### Requirement: Variable map construction

#### Scenario: Use cases build contextual variables per invocation

- **GIVEN** a use case that needs template expansion
- **THEN** it passes contextual namespaces (e.g. `change`) to the expander methods
- **AND** built-in variables (e.g. `project.root`) are already in the `TemplateExpander`

### Requirement: Contextual namespaces

#### Scenario: Change namespace populated from change entity

- **GIVEN** a change named `add-auth` at path `/project/changes/add-auth`
- **WHEN** the use case builds the variable map
- **THEN** the map contains `{ change: { name: "add-auth", path: "/project/changes/add-auth" } }`
- **AND** the map does not contain a `change.workspace` key

#### Scenario: Archived context includes change.archivedName

- **GIVEN** an archived runtime context with archived name `20260418-103000-add-auth`
- **WHEN** the use case builds the variable map for archived post-hook execution
- **THEN** the map includes `change.archivedName`
- **AND** `change.archivedName` equals `20260418-103000-add-auth`

#### Scenario: Active context may omit change.archivedName

- **GIVEN** an active (non-archived) runtime context
- **WHEN** the use case builds the variable map
- **THEN** `change.archivedName` may be absent without invalidating expansion

#### Scenario: change.workspace is never injected regardless of workspace count

- **GIVEN** a change with `specIds: ['default:auth/login', 'billing:invoices']` touching two workspaces
- **WHEN** any use case builds the `change` namespace for template expansion
- **THEN** the resulting namespace has no `workspace` key
- **AND** the namespace is not populated via `change.workspaces[0]`, `specIds[0]?.split(':')[0]`, or any other singular-workspace derivation

#### Scenario: {{change.workspace}} token is left unexpanded

- **GIVEN** a template `"{{change.workspace}}"`
- **AND** a `change` namespace built by any consuming use case
- **WHEN** `expand()` is called
- **THEN** the token is left unexpanded because `change.workspace` is never a key in the built namespace
