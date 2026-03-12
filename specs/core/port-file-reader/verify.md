# Verification: FileReader Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `FileReader`
- **WHEN** the class implements `read(absolutePath: string): Promise<string | null>`
- **THEN** it compiles and can be instantiated

### Requirement: Read method signature

#### Scenario: Existing file returns its content

- **GIVEN** a file exists at the given absolute path with UTF-8 text content
- **WHEN** `read` is called with that path
- **THEN** it returns a `string` containing the file contents

### Requirement: Missing file handling

#### Scenario: Non-existent file returns null

- **GIVEN** no file exists at the given absolute path
- **WHEN** `read` is called with that path
- **THEN** it returns `null`

### Requirement: Non-ENOENT errors propagate

#### Scenario: Permission denied throws

- **GIVEN** a file exists but the process lacks read permission
- **WHEN** `read` is called with that path
- **THEN** it throws the underlying filesystem error

### Requirement: Path traversal protection (implementation concern)

#### Scenario: Path within basePath succeeds

- **GIVEN** a `FileReader` constructed with `basePath` set to `/project`
- **WHEN** `read` is called with `/project/specs/foo.md`
- **THEN** it reads the file normally

#### Scenario: Path escaping basePath throws PathTraversalError

- **GIVEN** a `FileReader` constructed with `basePath` set to `/project`
- **WHEN** `read` is called with `/project/../etc/passwd`
- **THEN** it throws a `PathTraversalError`

#### Scenario: No basePath allows any absolute path

- **GIVEN** a `FileReader` constructed without a `basePath`
- **WHEN** `read` is called with any absolute path
- **THEN** no traversal check is performed

### Requirement: Path resolution

#### Scenario: Relative components are normalised

- **GIVEN** a `FileReader` with a `basePath`
- **WHEN** `read` is called with a path containing `..` segments
- **THEN** the path is resolved before the traversal check and before the read
