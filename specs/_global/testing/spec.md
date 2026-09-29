# Testing Conventions

## Purpose

Untested domain logic and leaky port boundaries erode confidence in every change. This spec defines the testing strategy for the specd monorepo: domain and application layers are fully covered by unit tests with mocked ports, while integration tests exercise infrastructure adapters against real (temporary) filesystems. The Vitest suite MUST remain compatible with both POSIX and Windows hosts because CI runs the same checks on macOS, Linux, and Windows.

## Requirements

### Requirement: Test runner

All packages use Vitest. No Jest. Test files live in a `test/` directory at the package root, mirroring the `src/` structure. A test for `src/domain/entities/change.ts` lives at `test/domain/entities/change.spec.ts`.

### Requirement: Unit tests for domain and application layers

Every use case and every domain entity method that enforces an invariant has at least one unit test. Port implementations are mocked — no real filesystem or network access in unit tests.

### Requirement: Port mocks are typed

Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`. If a port has 5 methods, the mock implements all 5 — unused ones throw `new Error('not implemented')`.

### Requirement: Integration tests for infrastructure adapters

`FsSpecRepository`, `FsChangeRepository`, and other infrastructure adapters have integration tests that run against a real temporary directory (using `os.tmpdir()` + a unique subfolder per test). The temp directory is cleaned up after each test.

### Requirement: Tests are POSIX- and Windows-compatible

Every test MUST pass on POSIX hosts (macOS, Linux) and on Windows. Tests MUST NOT encode host-specific assumptions that fail on the other family.

Tests that touch filesystem paths MUST build and compare paths with `node:path` (`join`, `resolve`, `sep`, or equivalent). They MUST NOT concatenate path segments with hardcoded `/` or `\` when constructing absolute or relative filesystem paths, and MUST NOT assert against hardcoded POSIX absolute paths such as `/tmp` or `/var/www` when the host may use another layout.

When an in-memory fixture map uses POSIX-looking keys (for example `/project/...`), the test MUST remap those keys to host absolute paths (for example via `path.resolve`) before comparing them to values produced by host path APIs.

When a unit test must exercise Windows drive-letter or backslash path rules while running on a non-Windows host, it MUST route those inputs through Windows path semantics (for example `path.win32` or an equivalent mock of `node:path`) instead of assuming the host `path` implementation.

Tests that spawn processes or run shell hooks MUST prefer portable commands (for example `node -e`) over POSIX-only shell builtins such as `printf`, `echo`, or `sleep` when the assertion is about product behaviour rather than a specific shell. On Windows, spawning `*.cmd` entry points (for example `pnpm.cmd`) MUST use a shell when required, and MAY set `windowsHide`. Assertions MUST account for Windows shell expansion (for example `%PATH%`) and for cmd versus POSIX quoting when the subject under test translates or expands commands.

When logical text identity matters (content hashes, “already installed” marker files), tests and production helpers under test MUST treat CRLF and lone CR as equivalent to LF so Windows checkouts do not spuriously fail.

Unix-only permission or symlink setups (including `chmod 0o000` as unreadability) MUST NOT be the sole way to establish a scenario on Windows: the test MUST use a Windows-safe setup or skip the scenario where the condition has no effect.

### Requirement: Fixtures are valid on Windows

This requirement specializes filesystem fixtures under "Tests are POSIX- and Windows-compatible".

Filesystem tests MUST locate temporary directories with `os.tmpdir()` and MUST build file URLs from the local path (for example with `pathToFileURL`). Tests MUST NOT depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...` paths.

A test that needs an unreadable file MUST NOT use `chmod 0o000` as that condition on Windows. The setup MUST produce a file the Windows process cannot read, or the scenario MUST be skipped where that permission bit has no effect.

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
- Tests must be compatible with both POSIX and Windows hosts
- Filesystem path construction and assertions must use `node:path` (or Windows path semantics when deliberately testing Windows rules); no hardcoded POSIX absolute temp paths
- Process/hook tests must not rely on POSIX-only shell builtins when asserting portable behaviour; Windows `*.cmd` spawn and shell expansion/quoting differences must be handled
- Logical text identity for hashes and installed marker files must treat CRLF/CR as equivalent to LF

## Spec Dependencies

- [`default:_global/architecture`](../architecture/spec.md) — layer boundaries determine what is unit-testable vs integration-testable
- [`default:_global/conventions`](../conventions/spec.md) — ESM-only constraint is the reason Vitest is used over Jest
