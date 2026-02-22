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

### Requirement: Test naming

#### Scenario: Wrong test file suffix

- **WHEN** a test file is named `change.test.ts`
- **THEN** it must be renamed to `change.spec.ts`

### Requirement: No snapshot tests

#### Scenario: Snapshot assertion used

- **WHEN** a test calls `toMatchSnapshot()` or `toMatchInlineSnapshot()`
- **THEN** it must be replaced with explicit assertions
