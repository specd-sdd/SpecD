# Tasks: global-cross-platform-convention

## 1. New spec `_global/cross-platform`

- [x] 1.1 Check every requirement in the new spec has a verify scenario
      `specs/default/_global/cross-platform/spec.md` and `verify.md` (inside the change directory) — requirement headings identical, at least one scenario each
      Approach: compare the ten `### Requirement:` headings in both files one by one; then run `specd changes validate global-cross-platform-convention default:_global/cross-platform --artifact specs --format text` and the same with `--artifact verify`
      (Req: Portability is a baseline requirement)
      (Req: Filesystem paths)
      (Req: Case sensitivity)
      (Req: Names valid on every platform)
      (Req: Line endings and encoding)
      (Req: Processes and shell)
      (Req: Permissions and symlinks)
      (Req: File locking, replacement, and path length)
      (Req: Directories and environment)
      (Req: Enforcement)
- [x] 1.2 Check the new spec declares no dependencies and creates no cycle
      `specd changes status global-cross-platform-convention --format text` — "specs and dependencies" lists `default:_global/cross-platform` with none
      Approach: `testing` and `continuous-integration` depend on `cross-platform`, never the reverse
      (Req: Enforcement)

## 2. Update `_global/testing`

- [x] 2.1 Check the merged preview of the testing spec delta
      `deltas/default/_global/testing/spec.md.delta.yaml` — added `Requirement: Tests verify the cross-platform contract`, extended `## Spec Dependencies`
      Approach: run `specd changes spec-preview global-cross-platform-convention default:_global/testing --diff --artifact specs --format text`; diff shows only one added requirement and one added dependency line, nothing removed
      (Req: Tests verify the cross-platform contract)
- [x] 2.2 Check the merged preview of the testing verify delta
      `deltas/default/_global/testing/verify.md.delta.yaml` — two scenarios for the new requirement
      Approach: run `specd changes spec-preview global-cross-platform-convention default:_global/testing --diff --artifact verify --format text`; diff shows only the added requirement and its two scenarios
      (Req: Tests verify the cross-platform contract)

## 3. Update `_global/continuous-integration`

- [x] 3.1 Check the merged preview of the CI spec delta
      `deltas/default/_global/continuous-integration/spec.md.delta.yaml` — added `Requirement: The matrix enforces the cross-platform contract`, extended `## Spec Dependencies`
      Approach: run `specd changes spec-preview global-cross-platform-convention default:_global/continuous-integration --diff --artifact specs --format text`; the existing `default:_global/testing` dependency line is preserved
      (Req: The matrix enforces the cross-platform contract)
- [x] 3.2 Check the merged preview of the CI verify delta
      `deltas/default/_global/continuous-integration/verify.md.delta.yaml` — two scenarios after `Requirement: Three operating systems`
      Approach: run `specd changes spec-preview global-cross-platform-convention default:_global/continuous-integration --diff --artifact verify --format text`; diff shows only the added requirement and its two scenarios
      (Req: The matrix enforces the cross-platform contract)

## 4. Pre-archive checks

- [x] 4.1 Check for conflicting deltas on `default:_global/testing` in the overlapping change
      `specd-sdd/changes/20261016-095530-fs-decouple-00-storage-contract-suite/deltas/default/_global/testing/` — must not modify the same requirements
      Approach: list that folder; if it contains a delta, compare its selectors with `Requirement: Fixtures are valid on Windows` (our `after` anchor) and `Spec Dependencies`
      (Req: Tests verify the cross-platform contract)
- [x] 4.2 Run structural validation on every artifact
      `specd changes validate global-cross-platform-convention --artifact proposal|design|tasks` and `<specId> --artifact specs|verify` for the three specs
      Approach: all report pass
      (Req: Enforcement)
