# Testing Conventions

## Overview

Testing strategy for the specd monorepo. The domain and application layers must be fully covered by unit tests with mocked ports. Integration tests cover infrastructure adapters.

## Requirements

### Requirement: Test runner

All packages use Vitest. No Jest. Test files live in a `test/` directory at the package root, mirroring the `src/` structure. A test for `src/domain/entities/change.ts` lives at `test/domain/entities/change.spec.ts`.

### Requirement: Unit tests for domain and application layers

Every use case and every domain entity method that enforces an invariant has at least one unit test. Port implementations are mocked — no real filesystem or network access in unit tests.

### Requirement: Port mocks are typed

Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`. If a port has 5 methods, the mock implements all 5 — unused ones throw `new Error('not implemented')`.

### Requirement: Integration tests for infrastructure adapters

`FsSpecRepository`, `FsChangeRepository`, and other infrastructure adapters have integration tests that run against a real temporary directory (using `os.tmpdir()` + a unique subfolder per test). The temp directory is cleaned up after each test.

### Requirement: Test naming

Test files use the `.spec.ts` suffix and match the name of the source file they test (`change.ts` → `change.spec.ts`). Test descriptions follow the pattern `"given <state>, when <action>, then <outcome>"` for behaviour tests. Setup/teardown helpers are named `setup<Thing>` and `cleanup<Thing>`.

### Requirement: No snapshot tests

Snapshot tests are forbidden. Assertions must be explicit and readable without a stored snapshot file.

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
- [`specs/_global/conventions/spec.md`](../conventions/spec.md) — ESM-only constraint is the reason Vitest is used over Jest
