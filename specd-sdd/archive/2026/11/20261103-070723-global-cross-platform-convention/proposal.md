# Proposal: global-cross-platform-convention

## Motivation

specd must run on Windows, Linux and macOS, yet no global spec states this for production code. The portability rules that exist cover only tests (`_global/testing`) and the CI matrix (`_global/continuous-integration`), so authors have no single place that says what to watch for and how to handle it.

## Current behaviour

- `default:_global/testing` requires tests to be POSIX- and Windows-compatible, but says nothing about production code.
- `default:_global/continuous-integration` runs the same job on `macos-latest`, `ubuntu-latest` and `windows-latest`, but does not state what contract the matrix enforces.
- Portability handling is scattered across code and module specs: `packages/core/src/infrastructure/fs/path-platform.ts`, `packages/core/src/infrastructure/node/hook-runner.ts`, `packages/core/src/infrastructure/{git,hg,svn}/exec.ts` (`windowsHide`), `packages/code-graph/src/infrastructure/index-lock.ts`, `packages/code-graph/src/domain/services/split-workspace-identity.ts`; module specs `core:vcs-adapter`, `core:spec-id-format`, `core:hook-runner-port`.
- Nothing prevents new code from hardcoding `/`, assuming case-sensitive paths, relying on `chmod`, or using POSIX-only shell constructs; failures surface only when the Windows CI job fails.

## Proposed solution

Add a global convention spec `_global/cross-platform` listing what production code must account for and how, grouped by topic: paths, case sensitivity, Windows reserved names and invalid characters, line endings and encoding, processes and shell, permissions and symlinks, long paths and file locking, and directories and environment. Each topic states the rule and the accepted technique.

Update the two existing specs so the contract is explicit on their side:

- `_global/testing` states that tests verify the `_global/cross-platform` contract and keeps only test-specific rules, referencing the new spec for production rules.
- `_global/continuous-integration` states that the three-OS matrix is the enforcement mechanism for `_global/cross-platform`.

No source code changes. Existing module specs and code are not modified.

## Specs affected

### New specs

- `default:_global/cross-platform`: production-code portability convention for Windows, Linux and macOS (what to take into account and how).
  - Depends on: none (the dependency direction is testing/CI → cross-platform, which avoids a cycle)

### Modified specs

- `default:_global/testing`: add an explicit link to `_global/cross-platform` and state that tests verify its contract; production rules are not duplicated here.
  - Depends on (added): `default:_global/cross-platform`
  - Depends on (removed): none
- `default:_global/continuous-integration`: state that the macOS/Linux/Windows matrix enforces `_global/cross-platform`.
  - Depends on (added): `default:_global/cross-platform`
  - Depends on (removed): none

## Impact

- Spec-only change in the `default` workspace under `specs/_global/`. No package code is touched.
- Existing portability code (listed under Current behaviour) is the reference for the rules; it is not changed. Later changes may add `dependsOn` from module specs to the new spec.
- Overlap: `default:_global/testing` is also targeted by `fs-decouple-00-storage-contract-suite` (drafting). That change's delta folder is empty and it plans a storage contract-suite requirement, unrelated to portability. Re-check before archive.
- Graph blast radius: not applicable (no code files).

## Technical context

- Format decision: requirement per topic (MUST/SHOULD wording) with a rule and the accepted technique, plus verify scenarios; exact structure settled in design.
- `_global/testing` keeps test-specific rules (fixtures, `os.tmpdir()`, `chmod` in tests); production rules live only in `_global/cross-platform` to avoid duplication.
- The user asked that the contract be clear in testing and CI as well, which is why those two specs are in scope.
- User chose to proceed despite the overlap on `_global/testing`.

## Open questions

- None blocking. Deferred to the specs artifact: whether verify scenarios are one per topic or grouped.
