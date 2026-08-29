# Spec Compliance Audit: cli-specs-list-count

**Timestamp:** 2026-08-27 01:00:00  
**Target Change:** `cli-specs-list-count`  
**Mode:** change  
**Audited Specs:** `cli:spec-list`

---

## 1. Executive Summary

| Total Requirements | Compliant | Discrepancies | Test Coverage |
| :----------------- | :-------- | :------------ | :------------ |
| 8                  | 8 (100%)  | 0             | 100%          |

All requirements for `cli:spec-list` and the newly introduced `--count` functionality are fully implemented in `packages/cli/src/commands/spec/list.ts` and covered by automated unit tests in `packages/cli/test/commands/spec-list.spec.ts`.

---

## 2. Requirement Details & Implementation Verification

### `cli:spec-list`

#### Requirement: Command signature

- **Status:** COMPLIANT
- **Implementation:** `packages/cli/src/commands/spec/list.ts:registerSpecList`
- **Details:** `--count` flag is registered as an optional flag on `specd specs list` and `specd spec list`. Mutual exclusivity between `--count` and `--summary` is validated at entry, raising `CliValidationError` with code `CLI_VALIDATION_ERROR` and exit code 1.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts` (`rejects using --count with --summary`).

#### Requirement: Workspace filtering

- **Status:** COMPLIANT
- **Implementation:** `packages/cli/src/commands/spec/list.ts`
- **Details:** Workspace filter array passed to `kernel.specs.list.execute` and visible workspaces filtered accordingly.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts` (`outputs single workspace count when filtered via --workspace in text mode`).

#### Requirement: List options forwarding

- **Status:** COMPLIANT
- **Implementation:** `packages/cli/src/commands/spec/list.ts`
- **Details:** List options forwarded cleanly to kernel use case.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts`.

#### Requirement: Title resolution

- **Status:** COMPLIANT
- **Implementation:** `@specd/core` and rendered in CLI.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts`.

#### Requirement: Summary resolution

- **Status:** COMPLIANT
- **Implementation:** `@specd/core` and rendered when `--summary` is present without `--count`.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts`.

#### Requirement: Output format

- **Status:** COMPLIANT
- **Implementation:** `packages/cli/src/commands/spec/list.ts`
- **Details:**
  - Multi-workspace text mode renders `Total: <total>\n\nWorkspaces:\n  <ws>: <count>`.
  - Single-workspace filtered text mode renders `<ws>: <count>`.
  - JSON mode renders `{ total: number, workspaces: Array<{ name: string, count: number }> }`.
  - TOON mode serializes the structured count object into Token-Oriented Object Notation.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts` (6 dedicated unit tests covering all formats and filter variations).

#### Requirement: Empty output

- **Status:** COMPLIANT
- **Implementation:** Handled when no workspaces are configured or workspace is empty.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts`.

#### Requirement: Error cases

- **Status:** COMPLIANT
- **Implementation:** Errors handled via `handleError(err, opts.format)`.
- **Tests:** `packages/cli/test/commands/spec-list.spec.ts`.

---

## 3. Global Spec Compliance Check

- **Architecture (`default:_global/architecture`):** Compliant. Logic is contained in the CLI adapter without I/O violations or coupling.
- **Coding Conventions (`default:_global/conventions`):** Compliant. Strict TypeScript, ESM, named exports, clear variable names.
- **Error Handling (`default:_global/error-handling-conventions`):** Compliant. Uses `CliValidationError` which extends `SpecdCliError` with standardized exit code 1 and error envelope.
- **Testing (`default:_global/testing`):** Compliant. Full unit test coverage with vitest mocks.

---

## 4. Conclusion

The implementation is 100% compliant with all specification requirements and global constraints. No discrepancies or missing tests were identified.
