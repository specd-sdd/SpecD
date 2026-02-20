# Testing Conventions

## Overview

Testing strategy for the specd monorepo. The domain and application layers must be fully covered by unit tests with mocked ports. Integration tests cover infrastructure adapters.

## Requirements

### Requirement: Test runner

All packages use Vitest. No Jest. Test files live in a `test/` directory at the package root, mirroring the `src/` structure. A test for `src/domain/entities/change.ts` lives at `test/domain/entities/change.spec.ts`.

#### Scenario: Jest used in a package

- **WHEN** a package imports from `jest` or uses `describe` from Jest globals
- **THEN** CI must reject it — only Vitest is allowed

#### Scenario: Test file outside test/ directory

- **WHEN** a test file lives at `src/domain/entities/change.spec.ts`
- **THEN** it must be moved to `test/domain/entities/change.spec.ts`

### Requirement: Unit tests for domain and application layers

Every use case and every domain entity method that enforces an invariant has at least one unit test. Port implementations are mocked — no real filesystem or network access in unit tests.

#### Scenario: Unit test touches filesystem

- **WHEN** a unit test calls `fs.readFile` or spawns a process
- **THEN** it violates this requirement — filesystem access belongs in integration tests

### Requirement: Port mocks are typed

Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`. If a port has 5 methods, the mock implements all 5 — unused ones throw `new Error('not implemented')`.

#### Scenario: Partial mock with type cast

- **WHEN** a test creates a mock with `{ get: vi.fn() } as unknown as SpecRepository`
- **THEN** it must be replaced with a full implementation of `SpecRepository`

### Requirement: Integration tests for infrastructure adapters

`FsSpecRepository`, `FsChangeRepository`, and other infrastructure adapters have integration tests that run against a real temporary directory (using `os.tmpdir()` + a unique subfolder per test). The temp directory is cleaned up after each test.

#### Scenario: Integration test without cleanup

- **WHEN** an integration test creates a temp directory but does not remove it in `afterEach`
- **THEN** it must be corrected — leftover temp dirs cause flaky tests across runs

### Requirement: Test naming

Test files use the `.spec.ts` suffix and match the name of the source file they test (`change.ts` → `change.spec.ts`). Test descriptions follow the pattern `"given <state>, when <action>, then <outcome>"` for behaviour tests. Setup/teardown helpers are named `setup<Thing>` and `cleanup<Thing>`.

#### Scenario: Wrong test file suffix

- **WHEN** a test file is named `change.test.ts`
- **THEN** it must be renamed to `change.spec.ts`

### Requirement: No snapshot tests

Snapshot tests are forbidden. Assertions must be explicit and readable without a stored snapshot file.

#### Scenario: Snapshot assertion used

- **WHEN** a test calls `toMatchSnapshot()` or `toMatchInlineSnapshot()`
- **THEN** it must be replaced with explicit assertions

## Constraints

- Test framework must be Vitest
- Test files live in `test/` mirroring the `src/` directory structure, never co-located with source files
- Test files must use the `.spec.ts` suffix
- Unit tests must not touch the filesystem, network, or spawn processes
- Port mocks must fully implement the port interface
- Infrastructure integration tests must clean up temp directories after each test
- Snapshot tests (`toMatchSnapshot`, `toMatchInlineSnapshot`) are forbidden

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../architecture/spec.md) — layer boundaries determine what is unit-testable vs integration-testable

## ADRs

- [ADR-0003: ESM Only](../../../docs/adr/0003-esm-only.md) — ESM-first environment is the primary reason Vitest is used over Jest
