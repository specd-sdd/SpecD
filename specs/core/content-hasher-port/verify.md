# Verification: ContentHasher Port

## Requirements

### Requirement: Abstract class shape

#### Scenario: Port cannot be instantiated directly

- **WHEN** code attempts to instantiate `ContentHasher` directly
- **THEN** it fails because `ContentHasher` is abstract

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class extending `ContentHasher`
- **WHEN** the class implements `hash(content: string): string`
- **THEN** it compiles and can be instantiated

### Requirement: Hash output format

#### Scenario: Output matches algorithm-prefixed hex format

- **WHEN** `hash` is called with any non-empty string
- **THEN** the result matches the pattern `^[a-z0-9]+:[a-f0-9]+$`

#### Scenario: SHA-256 implementation returns correct prefix

- **GIVEN** the Node.js SHA-256 implementation
- **WHEN** `hash` is called with any string
- **THEN** the result starts with `sha256:` followed by exactly 64 hex characters

### Requirement: Determinism

#### Scenario: Identical input produces identical output

- **WHEN** `hash` is called twice with the same content string
- **THEN** both calls return the same value

#### Scenario: Different input produces different output

- **WHEN** `hash` is called with two distinct content strings
- **THEN** the returned hashes differ

### Requirement: Empty content

#### Scenario: Empty string is hashed without error

- **WHEN** `hash` is called with `""`
- **THEN** the result is a valid `<algorithm>:<hex>` string
- **AND** the result is deterministic across calls

### Requirement: No side effects

#### Scenario: Hash is pure

- **WHEN** `hash` is called multiple times with the same input
- **THEN** no observable state changes occur between calls
- **AND** the return value is identical each time
