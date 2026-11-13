# Global constraints and verification evidence

Change: `support-commas-in-names`. Audit mode: change. Date: 2026-11-08.

## Requirements summary

Project context was obtained through `project context`; full global artifacts were retrieved through `specs show` for architecture, conventions, cross-platform, testing, docs, eslint, logging, error-handling-conventions and continuous-integration. These are supporting constraints for the 31 change specs, not nine additional complete implementation audits of unrelated subsystems. The other partial reports cover the concrete requirement and scenario comparisons, including contradictions with dependencies.

## Implementation status and evidence

| Global area    | Scope assessment and evidence                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture   | New ID/pattern/path services are pure domain functions. WorkspaceNotFoundError is defined in domain and re-exported from application. Mutations receive repository/file-reader ports. GetChangeSpecDeps has standalone composition and a kernel operation. CLI uses the SDK. No layer violation was reported by scoped ESLint. |
| Conventions    | Direct TypeScript checks passed for core, cli, sdk, skills and guide. Modified and new TypeScript files passed ESLint. No edits were made by this verification run.                                                                                                                                                            |
| Cross-platform | Spec ID validation rejects device names and invalid segments on every host. Separator and case helpers have platform-parameterized tests. Runtime review nevertheless uncovered a case-insensitive batch defect, documented in the core-mutations report. Native Windows/Linux execution was not performed locally.            |
| Testing        | Fresh Vitest runs passed: core 2,889; CLI 1,285; SDK 134; skills 52; guide 155. This is 4,515 tests across 345 files. Passing suites are not treated as proof that every scenario has adequate coverage; gaps are documented in the other reports.                                                                             |
| Documentation  | CLI/Core/SDK/guide documentation and generated guide bundles are included in the implementation. CLI documentation coverage and guide tests passed. Detailed CLI/spec documentation consistency is reviewed in the CLI/skills report.                                                                                          |
| ESLint         | 128 modified tracked TypeScript files and 23 untracked new TypeScript files passed separate checks (151 total). `git diff --check` passed.                                                                                                                                                                                     |
| Error handling | New ID, pattern, lock and workspace errors extend SpecdError and expose uppercase codes. Original ID values are retained in parser errors. Lock repair hints are scoped to dependency commands. Detailed message and persistence contracts are covered by area reports.                                                        |
| Logging        | No new logging implementation is introduced by this change. CLI renders through its delivery output/error helpers; no new business-layer logging bypass was observed.                                                                                                                                                          |
| CI             | Tracked `.github/workflows/ci.yml` uses macOS/Ubuntu/Windows, Node 22, pnpm 10.6.5, frozen install, then build/typecheck/test. Copilot instructions remain ignored. Local verification used macOS and Node 25.9.0; this does not establish the remote three-OS gate.                                                           |

## Executed checks

- Full fresh monorepo build excluding public-web: 13 successful tasks, zero cache hits. Initial forced execution inside the sandbox failed on the local tsx IPC socket; the same build passed with execution permission outside the sandbox.
- Fresh relevant suites through Turbo: 17 successful tasks, zero cache hits; 4,515 tests passed.
- Direct `tsc --noEmit` for the five affected packages: passed.
- Scoped ESLint: passed for 151 modified/new TypeScript files.
- `git diff --check`: passed.
- Graph incrementally refreshed; subsequent graph stats reported current/contentFresh true. Parser impact reported CRITICAL, with 324 affected files; this motivated the broad package checks.
- Verifying post-hooks executed immediately after the scenario/test assessment: no hooks and no instructions.

## Test coverage and limitations

The complete compiled change context contains 1,311 scenario entries across 31 specs. Some entries duplicate behavior, and many cover pre-existing behavior. Automated test counts and scenario counts measure different things. Area reports record failures, spec drift and uncovered conditions rather than assigning every passing test to an acceptance scenario by title alone.

No source/spec fixes, human approvals, archive operations or final lifecycle transitions were performed. The change remains in verifying pending the required user decision after full-mode results.

## Evidence files

`build.log`, `tests.log`, `typecheck.log`, `eslint-modified.log`, `eslint-new.log` are retained in this report directory. Additional exploratory sandbox runs were superseded by the fresh successful execution above.

## Discrepancies and dependency chain

Confirmed implementation and specification findings are owned by the area reports and must be counted once during aggregation. Global dependencies: architecture/conventions; cross-platform/testing/continuous-integration; conventions/error-handling-conventions/eslint; docs; logging.

## Summary counts

31 change specs; 1,311 compiled scenario entries; 9 supporting global specs; 4,515 fresh passing tests; 151 linted changed/new TypeScript files. No additional independent global finding is added by this partial report.
