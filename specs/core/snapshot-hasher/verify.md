# Verification: Snapshot Hasher

## Requirements

### Requirement: Hash format

#### Scenario: Single file hashed

- **WHEN** `hashFiles` is called with one file path and its content
- **THEN** the result contains that path as a key with a value matching `sha256:[a-f0-9]{64}`

### Requirement: Determinism

#### Scenario: Identical content produces identical hash

- **WHEN** `hashFiles` is called twice with the same path and same content
- **THEN** both results have the same hash value for that path

#### Scenario: Different content produces different hash

- **WHEN** two files have different content — including content that differs only in whitespace
- **THEN** their hashes are different

### Requirement: Path preservation

#### Scenario: Path used as key

- **WHEN** `hashFiles` is called with a path like `specd/changes/foo/proposal.md`
- **THEN** the result map contains that exact string as a key

### Requirement: Empty input

#### Scenario: Empty input

- **WHEN** `hashFiles` is called with `{}`
- **THEN** it returns `{}`

### Requirement: Empty file content

#### Scenario: Empty content hashed

- **WHEN** `hashFiles` is called with a file whose content is `""`
- **THEN** the result contains a valid `sha256:<hex>` value for that path
