# Verification: Selector Model

## Requirements

### Requirement: Selector fields

#### Scenario: Match by type and label

- **WHEN** a selector declares `type: section` and `matches: "^Requirement:"`
- **THEN** it matches all section nodes whose label starts with `"Requirement:"` (case-insensitive)

#### Scenario: Match is case-insensitive

- **WHEN** a selector declares `matches: "login"`
- **THEN** it matches nodes with labels `"Login"`, `"LOGIN"`, and `"login"`

#### Scenario: Plain string matches substring

- **WHEN** a selector declares `matches: "Login"`
- **THEN** it matches any node whose label contains `"Login"` as a substring

#### Scenario: Match by value with contains

- **WHEN** a selector declares `type: paragraph` and `contains: "SHALL"`
- **THEN** it matches paragraph nodes whose scalar value contains `"SHALL"` (case-insensitive)

#### Scenario: Constrain by parent

- **WHEN** a selector declares `type: section`, `matches: "^Requirement:"`, and `parent: { type: section, matches: "^Requirements$" }`
- **THEN** it matches only Requirement sections that are direct children of a Requirements section, not Requirement sections at other nesting levels

#### Scenario: Target sequence item by where

- **WHEN** a selector declares `type: sequence-item` and `where: { step: implementing }`
- **THEN** it matches the sequence item whose `step` field value matches `"implementing"` (case-insensitive regex)

#### Scenario: Target sequence item by index

- **WHEN** a selector declares `type: sequence-item` and `index: 0`
- **THEN** it matches the first item in the sequence

#### Scenario: index and where are mutually exclusive

- **WHEN** a selector declares both `index` and `where`
- **THEN** a `SchemaValidationError` or `DeltaApplicationError` is produced — they cannot be combined

### Requirement: Node types by file format

#### Scenario: Unknown type is rejected

- **WHEN** a selector declares a `type` value not in `ArtifactParser.nodeTypes()` for the target format
- **THEN** the selector is rejected with a validation error before any operation is attempted

#### Scenario: YAML sequence-item with where

- **WHEN** a delta targets a YAML file and a selector uses `type: sequence-item` with `where: { name: "Run tests" }`
- **THEN** it matches the sequence item whose `name` field equals `"Run tests"` (case-insensitive)

### Requirement: Multi-match behaviour

#### Scenario: Delta rejects ambiguous selector

- **WHEN** a delta `modified` or `removed` entry's selector matches more than one node
- **THEN** `apply` rejects the entire delta with `DeltaApplicationError` without applying any operation

#### Scenario: Validation rule processes each match

- **WHEN** a validation rule's selector matches multiple nodes
- **THEN** the rule is evaluated against each matched node individually — no error is produced for multiple matches

### Requirement: No-match behaviour

#### Scenario: Delta rejects unresolved selector on modified

- **WHEN** a delta `modified` entry's selector matches zero nodes
- **THEN** `apply` rejects with `DeltaApplicationError`

#### Scenario: Delta rejects unresolved selector on removed

- **WHEN** a delta `removed` entry's selector matches zero nodes
- **THEN** `apply` rejects with `DeltaApplicationError`

#### Scenario: position.after fallback on no match

- **WHEN** a delta `added` entry's `position.after` selector matches zero nodes
- **THEN** a warning is emitted and the new node is appended at the end of the parent scope — no error

#### Scenario: Validation rule passes vacuously on no match

- **WHEN** a validation rule's selector matches zero nodes
- **THEN** the rule passes — no error or warning is produced
