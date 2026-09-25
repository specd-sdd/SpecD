# Tasks: posix-windows-test-compatibility

## 1. Spec and verify deltas

- [x] 1.1 Confirm POSIX/Windows requirement text in spec delta
      `specd-sdd/changes/20260925-213024-posix-windows-test-compatibility/deltas/default/_global/testing/spec.md.delta.yaml`:
      requirement **Tests are POSIX- and Windows-compatible** — ensure paths, fixture remap, `path.win32`, portable spawn, `*.cmd`/expansion/quoting, CRLF identity, and Unix-only permission rules are all present
      Approach: run `changes spec-preview … --artifact specs --diff` and match design.md “Normative requirements”
      (Req: Tests are POSIX- and Windows-compatible)

- [x] 1.2 Confirm Fixtures specialization and Constraints bullets
      same delta file — Fixtures body references the general requirement and `pathToFileURL`; Constraints include the four new cross-platform bullets
      Approach: same preview; no rewrite of Vitest/layout/mock/snapshot rules beyond those bullets
      (Req: Fixtures are valid on Windows; Constraints)

- [x] 1.3 Confirm verify scenarios cover the new requirement
      `…/deltas/default/_global/testing/verify.md.delta.yaml`:
      six scenarios under **Tests are POSIX- and Windows-compatible** plus updated Fixtures temp-path/`pathToFileURL` scenario
      Approach: `changes spec-preview … --artifact verify --diff`; every new scenario maps to design Testing checklist
      (Req: Tests are POSIX- and Windows-compatible; Fixtures are valid on Windows)

## 2. Validation gates

- [x] 2.1 Validate all change artifacts
      change `posix-windows-test-compatibility` — structural validation must pass for proposal, specs, verify, design, tasks
      Approach: `node packages/cli/dist/index.js changes validate posix-windows-test-compatibility --format text`
      (Req: all)

- [x] 2.2 Preview merged testing conventions
      `default:_global/testing` — merged `spec.md`/`verify.md` must show Purpose POSIX+Windows sentence, new requirement section, updated Fixtures, and Constraints bullets
      Approach: `node packages/cli/dist/index.js changes spec-preview posix-windows-test-compatibility default:_global/testing --diff --format text`
      (Req: all)

## 3. Scope and docs non-goals

- [x] 3.1 Confirm no package source or test file edits
      `packages/**` — no `src/` or `test/` changes in this change; anchors remain read-only examples
      Approach: `git status` / change directory listing show only proposal, design, tasks, and testing deltas
      (Req: Non-goals)

- [x] 3.2 Confirm no `docs/` update required
      `docs/**` — no testing-conventions user guide exists; do not add a parallel page
      Approach: leave docs untouched; after archive rely on `specs/_global/testing` as source of truth
      (Req: Approach & Execution flow — Documentation)

## 4. Archive readiness

- [x] 4.1 Confirm deltas are ready for archive merge
      `specs/_global/testing/spec.md` and `specs/_global/testing/verify.md` — will receive merged delta content via `/specd-archive` after verify
      Approach: preview confirms normative contract; do not archive during implement — run `/specd-archive` after `/specd-verify`
      (Req: all)
