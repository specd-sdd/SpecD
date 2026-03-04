# Verification: Spec Show

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec show` is run without a path
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Multiple artifact files printed with headers

- **GIVEN** `default:auth/login` has `spec.md` and `verify.md`
- **WHEN** `specd spec show default:auth/login` is run
- **THEN** stdout contains `--- spec.md ---` followed by the spec content, then `--- verify.md ---` followed by the verify content
- **AND** the process exits with code 0

#### Scenario: Missing artifact file skipped silently

- **GIVEN** `default:auth/login` has `spec.md` but no `verify.md`
- **WHEN** `specd spec show default:auth/login` is run
- **THEN** only the `spec.md` section is printed; no error for the missing file
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Spec does not exist

- **WHEN** `specd spec show default:nonexistent/path` is run and no artifact files exist at that path
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Unknown workspace

- **WHEN** `specd spec show unknown-ws:some/path` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output format

#### Scenario: JSON output structure

- **GIVEN** `default:auth/login` has `spec.md` with content `# Auth Login` and `verify.md` with content `# Verification: Auth Login`
- **WHEN** `specd spec show default:auth/login --format json` is run
- **THEN** stdout is a valid JSON array with two entries, each having `filename` and `content`
- **AND** the first entry has `filename` equal to `"spec.md"` and `content` equal to `"# Auth Login"`
- **AND** the process exits with code 0
