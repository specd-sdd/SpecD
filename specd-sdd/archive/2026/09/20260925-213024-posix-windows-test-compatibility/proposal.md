# Proposal: posix-windows-test-compatibility

## Motivation

CI already runs the same Vitest suite on macOS, Linux, and Windows, but the global testing conventions only document narrow Windows-safe fixture rules. Agents and contributors can still write POSIX-only tests that look fine locally and fail on `windows-latest`. The testing spec must state clearly that tests MUST be compatible with both POSIX and Windows, using the practices the repo already applied in recent Windows fixes.

## Current behaviour

`default:_global/testing` requires Vitest layout, typed port mocks, temp-dir integration tests, and a "Fixtures are valid on Windows" rule (`os.tmpdir()`, no hardcoded `/tmp`, no `chmod 0o000` as unreadability). It does not require tests in general to be portable across POSIX and Windows (path construction, separators, shell assumptions, Unix-only APIs beyond chmod).

`default:_global/continuous-integration` already mandates identical jobs on `macos-latest`, `ubuntu-latest`, and `windows-latest`, and depends on the testing conventions for what `pnpm test` means.

Recent test fixes already encode the missing rules in code (examples below) without those rules living in the testing spec.

## Proposed solution

Update `default:_global/testing` only:

1. Add an explicit requirement that tests MUST be compatible with POSIX and Windows hosts (the CI matrix).
2. Keep the existing Windows fixture rules (tmpdir, file URLs, unreadable-file setup) as concrete obligations under that requirement, or as a preserved sibling requirement — do not drop them.
3. Codify the portable practices already used in the suite (see Technical context), at least:
   - Build and compare filesystem paths with `node:path` (`join` / `resolve` / `sep`), not string concatenation or hardcoded `/`.
   - Prefer `os.tmpdir()` + `pathToFileURL` for real FS / dynamic-import fixtures; never hardcoded `/tmp` or `file:///tmp/...`.
   - When fixtures use POSIX-looking keys, remap them to host absolute paths before asserting (e.g. `path.resolve` helpers).
   - Prefer portable subprocesses (`node -e`) over POSIX shell builtins (`printf`, `echo`, `sleep`); on Windows spawn `*.cmd` via a shell when needed (`pnpm.cmd`, `shell: true`, `windowsHide`).
   - Account for Windows shell expansion (`%PATH%`) and cmd vs POSIX quoting when asserting hook/command output.
   - Treat CRLF/CR as equivalent to LF where content hashing or installed text files must stay stable across checkouts.
   - Do not use `chmod 0o000` (or other Unix-only permission tricks) as unreadability on Windows; skip or use a Windows-safe setup.
   - When a unit test must exercise Windows path rules on a non-Windows host, mock `node:path` to `path.win32` for drive-letter / backslash inputs (as in containment tests) rather than assuming host `path` APIs.
4. Extend `verify.md` with WHEN/THEN scenarios for those obligations.
5. Spec-and-verify-only change: no application or test-suite remediation in this change; the suite already demonstrates the patterns — this change makes them binding in the spec.

## Specs affected

### New specs

- none

### Modified specs

- `default:_global/testing`: add POSIX + Windows compatibility as a first-class testing convention; preserve existing Windows fixture / chmod rules; encode the practices above; add matching verify scenarios.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Spec/docs only under the default workspace: `specs/_global/testing/spec.md` and `specs/_global/testing/verify.md` via deltas.
- No package `src/` or `test/` edits planned in this change.
- Downstream effect: agents and humans writing tests must treat cross-platform portability as a binding convention; CI already enforces failures on Windows.
- Related but unchanged: `default:_global/continuous-integration` (already depends on testing; no delta).
- Anchor examples (already fixed; cite in design/spec wording, do not re-fix here):
  - `packages/sdk/test/barrel.spec.ts` — `pnpm.cmd` + shell on `win32`
  - `packages/core/test/infrastructure/node/hook-runner.spec.ts` — `node -e`, `%PATH%` expansion
  - `packages/core/test/infrastructure/node/hook-runner-spawn.spec.ts` / `translate-hook-command.spec.ts` — `cmd.exe` spawn and quote translation
  - `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts` — `path.sep` for directory membership
  - `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts` — `hostFiles()` remaps fixture keys
  - `packages/core/test/infrastructure/fs/config-loader-root-containment.spec.ts` — `path.win32` mock for drive-letter fixtures
  - `packages/core/test/infrastructure/fs/hash-newlines.spec.ts` / `ensure-tmp-gitignore.spec.ts` — CRLF-stable digests / installed text
  - `packages/code-graph/test/composition/create-sqlite-graph-store-factory.spec.ts` — `tmpdir` + `pathToFileURL`

## Technical context

- Settled from exploration / design kickoff:
  - Prefer adding a clear "POSIX and Windows compatible" requirement rather than only renaming the fixture section.
  - Preserve concrete tmpdir / chmod rules; fold or reference them under the broader requirement.
  - Keep verify scenarios platform-agnostic (rules that apply on any host), not CI-matrix-named.
  - Do not add `continuous-integration` to the change; use it as narrative context only (CI already depends on testing).
  - Spec-only scope; no test-suite remediation in this change by default.
- Concrete techniques lifted from recent Windows test fixes (`dfcd17f5`, `98877e58`, `f0b461d6`, `cf4292d0`, and related):
  - **Paths / separators:** assert with `path.join` / `path.resolve` / `path.sep`; remap in-memory fixture maps whose keys look like `/project/...` to host absolute paths.
  - **File URLs / temp dirs:** `join(tmpdir(), …)` then `pathToFileURL(...).href` for dynamic import targets.
  - **Shells / spawn:** avoid POSIX-only builtins in integration hook tests; use `node -e`; on Windows use `pnpm.cmd` + `shell: true` + `windowsHide`; expect `cmd.exe /d /s /c` and verbatim args when platform is stubbed to `win32`.
  - **Quoting / expansion:** dual cmd vs POSIX quote translation; expect `%PATH%` to expand to `process.env.PATH` on Windows.
  - **Newlines:** hash and “already installed” text MUST treat CRLF (and lone CR) like LF when identity is logical content.
  - **Windows path semantics on Linux CI:** when testing drive-letter containment, route through `path.win32` (mock or helper) instead of host `path`.
- Ruled out: new separate spec; piggybacking on unrelated active changes; rewriting the already-fixed tests in this change.

## Open questions

- none
