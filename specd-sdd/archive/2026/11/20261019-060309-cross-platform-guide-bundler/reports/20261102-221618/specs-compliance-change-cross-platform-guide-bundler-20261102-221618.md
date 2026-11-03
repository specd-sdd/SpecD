# Compliance audit: cross-platform-guide-bundler

Mode: change. Scope: guide:bundle-guides (delta), deps guide:conventions, guide:guide-model, global specs (testing, CI, conventions, eslint). Graph fresh (`stale: false`). Inline audit (≤5 specs), read-only.

## Evidence run

- `pnpm vitest run` in packages/guide: PASS 154 / FAIL 0
- `pnpm run bundle:guides`: ok; `generated/` unchanged after rebuild (deterministic, git clean)
- `tsc --noEmit`: no errors. ESLint: no issues.

## guide:bundle-guides — Build-Time Compilation Script

| Scenario                                   | Status | Evidence                                                                                            |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| TypeDoc entrypoints POSIX                  | OK     | `sdk-api-generator.ts:1266` `entryPoints: [toPosixPath(entryPath)]`; bundle ran without glob errors |
| Workspace membership separator-independent | OK     | `isPathInside` used at `:1196`, `:1375`; tests drive-case, backslash/forward                        |
| Sibling prefix not member                  | OK     | segment-boundary prefix `root + '/'`; unit test                                                     |
| Out-of-repo sourcePath normalized          | OK     | `resolveSourcePath` exported, fallback `toPosixPath`; unit test `E:\other\x.d.ts`                   |
| Topic/sourcePath POSIX only                | OK     | `compileGuide` uses `posixRelativePath`; integration test over both generated JSON files            |
| Nested subdirs preserved                   | OK     | `compileCollections` uses `toPosixPath(path.relative)`                                              |
| Determinism / catalog isolation / CRLF     | OK     | rebuild produces no diff; existing tests pass; ordering now code-unit on POSIX-relative path        |

Other requirements (frontmatter validation, heading/line ranges, JSON catalog) untouched by the diff; covered by the existing passing suites.

## Discrepancies

None blocking. Spec and code agree.

## Consistency with global/dependency specs

- default:\_global/testing (POSIX+Windows compatible tests): new tests are pure-string, host-independent. Conform.
- default:\_global/continuous-integration: CI matrix includes windows-latest. Conform; real Windows run not yet observed locally.
- guide:conventions zero-runtime-core rule: change only touches `scripts/` and tests. Conform.
- No contradictions found.

## Test coverage gaps (low)

1. TypeDoc entry-point normalization has no direct unit test (only exercised by the bundle build/integration). On POSIX hosts it cannot regress visibly; real verification relies on the Windows CI job.
2. Spec scenario "different drive-letter case" covered; "UNC" and `..foo` cases are extras beyond spec (fine).

## Summary

Scenarios verified: 11 changed/new, 0 failed. Critical 0, major 0, minor 1 (coverage gap #1). Recommendation: Proceed.
