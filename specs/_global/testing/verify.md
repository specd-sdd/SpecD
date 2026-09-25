# Verification: Testing Conventions

## Requirements

### Requirement: Test runner

#### Scenario: Jest used in a package

- **WHEN** a package imports from `jest` or uses `describe` from Jest globals
- **THEN** CI must reject it — only Vitest is allowed

#### Scenario: Test file outside test/ directory

- **WHEN** a test file lives at `src/domain/entities/change.spec.ts`
- **THEN** it must be moved to `test/domain/entities/change.spec.ts`

### Requirement: Unit tests for domain and application layers

#### Scenario: Unit test touches filesystem

- **WHEN** a unit test calls `fs.readFile` or spawns a process
- **THEN** it violates this requirement — filesystem access belongs in integration tests

### Requirement: Port mocks are typed

#### Scenario: Partial mock with type cast

- **WHEN** a test creates a mock with `{ get: vi.fn() } as unknown as SpecRepository`
- **THEN** it must be replaced with a full implementation of `SpecRepository`

### Requirement: Integration tests for infrastructure adapters

#### Scenario: Integration test without cleanup

- **WHEN** an integration test creates a temp directory but does not remove it in `afterEach`
- **THEN** it must be corrected — leftover temp dirs cause flaky tests across runs

### Requirement: Tests are POSIX- and Windows-compatible

#### Scenario: Path asserted with a hardcoded POSIX absolute temp path

- **WHEN** a test asserts that a temporary directory equals `/tmp/...` or concatenates path segments with a hardcoded `/`
- **THEN** it must use `node:path` (`join`, `resolve`, or `sep`) and host-derived locations instead

#### Scenario: Fixture map keys do not match host absolute paths

- **GIVEN** an in-memory fixture map keyed like `/project/src/foo.ts`
- **WHEN** the code under test returns host-resolved absolute paths
- **THEN** the test remaps fixture keys with `path.resolve` (or equivalent) before comparing

#### Scenario: Windows drive-letter paths on a non-Windows host

- **GIVEN** a unit test runs on macOS or Linux
- **WHEN** it exercises Windows drive-letter or backslash path rules
- **THEN** it routes those inputs through `path.win32` (or an equivalent `node:path` mock), not the host `path` APIs alone

#### Scenario: Hook or spawn test uses a POSIX-only shell builtin

- **WHEN** a portable behaviour assertion spawns `printf`, bare `echo`, or `sleep` as the subject command
- **THEN** it must use a portable command such as `node -e`, or document a Windows-safe alternative

#### Scenario: Windows cmd entry point and expansion

- **GIVEN** the test runs on Windows or stubs `process.platform` to `win32`
- **WHEN** it spawns a `*.cmd` tool such as `pnpm.cmd` or asserts expanded hook text containing `%PATH%`
- **THEN** spawn uses a shell when required (and may set `windowsHide`)
- **AND** assertions account for Windows shell expansion and cmd versus POSIX quoting

#### Scenario: CRLF changes logical text identity

- **WHEN** content hashing or an “already installed” marker file compares text that may use CRLF or lone CR
- **THEN** CRLF and lone CR are treated as equivalent to LF for logical identity

### Requirement: Fixtures are valid on Windows

#### Scenario: Temporary paths come from the OS

- **WHEN** a filesystem test creates a temporary directory or builds a file URL for a dynamic import
- **THEN** the directory is under `os.tmpdir()`
- **AND** file URLs are built from the local path (for example with `pathToFileURL`)
- **AND** the test does not hardcode `/tmp` or `file:///tmp/`

#### Scenario: Unreadable files do not depend on chmod zero on Windows

- **GIVEN** the test runs on Windows
- **WHEN** it needs a file the process cannot read
- **THEN** it does not use `chmod 0o000` as that condition

### Requirement: Test naming

#### Scenario: Wrong test file suffix

- **WHEN** a test file is named `change.test.ts`
- **THEN** it must be renamed to `change.spec.ts`

### Requirement: No snapshot tests

#### Scenario: Snapshot assertion used

- **WHEN** a test calls `toMatchSnapshot()` or `toMatchInlineSnapshot()`
- **THEN** it must be replaced with explicit assertions
