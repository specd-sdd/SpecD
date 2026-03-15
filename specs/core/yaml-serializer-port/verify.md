# Verification: YamlSerializer Port

## Requirements

### Requirement: Abstract class shape

#### Scenario: Port cannot be instantiated directly

- **WHEN** code attempts to instantiate `YamlSerializer` directly
- **THEN** it fails because `YamlSerializer` is abstract

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class extending `YamlSerializer`
- **WHEN** the class implements both `parse` and `stringify`
- **THEN** it compiles and can be instantiated

### Requirement: Parse method input and output

#### Scenario: Valid YAML object is parsed

- **WHEN** `parse` is called with `"foo: bar\nbaz: 42\n"`
- **THEN** it returns `{ foo: "bar", baz: 42 }`

#### Scenario: Valid YAML array is parsed

- **WHEN** `parse` is called with `"- one\n- two\n"`
- **THEN** it returns `["one", "two"]`

#### Scenario: Scalar YAML is parsed

- **WHEN** `parse` is called with `"hello"`
- **THEN** it returns the string `"hello"`

### Requirement: Parse method error handling

#### Scenario: Malformed YAML throws

- **WHEN** `parse` is called with invalid YAML (e.g. `"key: [unclosed"`)
- **THEN** it throws an error

### Requirement: Parse method empty and blank input

#### Scenario: Empty string returns undefined

- **WHEN** `parse` is called with `""`
- **THEN** it returns `undefined`

#### Scenario: Whitespace-only string returns undefined

- **WHEN** `parse` is called with `"   \n  \n"`
- **THEN** it returns `undefined`

### Requirement: Stringify method input and output

#### Scenario: Object is serialized to valid YAML

- **WHEN** `stringify` is called with `{ foo: "bar", baz: 42 }`
- **THEN** the result is a valid YAML string
- **AND** passing the result to `parse` returns a structurally equivalent object

#### Scenario: Array is serialized to valid YAML

- **WHEN** `stringify` is called with `["one", "two"]`
- **THEN** the result is a valid YAML string
- **AND** passing the result to `parse` returns `["one", "two"]`

### Requirement: Stringify method line wrapping

#### Scenario: Long values are not wrapped

- **GIVEN** a data object with a string value longer than 80 characters
- **WHEN** `stringify` is called
- **THEN** the output contains the full value on a single line (no folded or block scalar indicators inserted by the serializer)

### Requirement: No side effects

#### Scenario: Parse is pure

- **WHEN** `parse` is called multiple times with the same input
- **THEN** the return value is structurally identical each time

#### Scenario: Stringify is pure

- **WHEN** `stringify` is called multiple times with the same input
- **THEN** the return value is identical each time
