# Audit Report: LLM-Optimized Metadata CLI Commands

Date: 2026-06-04
Change: 20260603-073902-llm-optimized-metadata

## Specs Audited

- cli:change-context
- cli:project-context
- cli:spec-update-metadata
- cli:project-update-metadata
- cli:project-metadata

---

## 1. cli:change-context

### Compliance Summary

- **Overall Status**: 🟡 PARTIAL COMPLIANCE
- **Implementing Code**: `packages/cli/src/commands/change/context.ts`

### Requirements Verification

| Requirement                     | Status  | Evidence/Notes                                                                                                                                                                                                                                                                           |
| :------------------------------ | :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature               | ✅ PASS | `.command('context <name> <step>')` with all required options.                                                                                                                                                                                                                           |
| Optimization warning signal     | 🔴 FAIL | Requirement: "For `--format text`, the warning SHALL be displayed at the **top** of the output and MUST include an instruction on how to generate the missing metadata". Findings: Warnings are collected but sent to `stderr`. No instructions for the user are included in the output. |
| Implementation tracking refresh | ✅ PASS | `await kernel.changes.refreshImplementationTracking.execute({ name })` is called before compilation.                                                                                                                                                                                     |
| Fingerprint support             | ✅ PASS | Forwarded to use case; short-circuit `result.status === 'unchanged'` is correctly handled.                                                                                                                                                                                               |
| Output (text)                   | ✅ PASS | Correct ordering: fingerprint -> project context -> spec content/catalogue -> available steps.                                                                                                                                                                                           |
| Step availability warning       | ✅ PASS | Prints to `stderr` with blocking artifacts.                                                                                                                                                                                                                                              |
| Context warnings                | ✅ PASS | Prints to `stderr`.                                                                                                                                                                                                                                                                      |

---

## 2. cli:project-context

### Compliance Summary

- **Overall Status**: 🟡 PARTIAL COMPLIANCE
- **Implementing Code**: `packages/cli/src/commands/project/context.ts`

### Requirements Verification

| Requirement                  | Status  | Evidence/Notes                                                                                                |
| :--------------------------- | :------ | :------------------------------------------------------------------------------------------------------------ |
| Command signature            | ✅ PASS | `.command('context')` (under project) with all required options.                                              |
| Optimization warning signal  | 🔴 FAIL | Same failure as `change-context`. Warnings lack instructions and are not displayed at the top of text output. |
| Behaviour                    | ✅ PASS | Compiles project context using `kernel.project.getProjectContext.execute`.                                    |
| Output (text)                | ✅ PASS | Renders context entries first, then spec content/catalogue.                                                   |
| Warnings                     | ✅ PASS | advisory conditions emitted to `stderr`.                                                                      |
| Full mode defaults/overrides | ✅ PASS | Section flags correctly override defaults for full-mode specs.                                                |

---

## 3. cli:spec-update-metadata

### Compliance Summary

- **Overall Status**: ✅ FULL COMPLIANCE
- **Implementing Code**: `packages/cli/src/commands/spec/update-metadata.ts`

### Requirements Verification

| Requirement          | Status  | Evidence/Notes                                      |
| :------------------- | :------ | :-------------------------------------------------- |
| Command signature    | ✅ PASS | `.command('update-metadata <specPath>')`            |
| Partial schema input | ✅ PASS | Accepts YAML/JSON from stdin or file via `--input`. |
| Delegation           | ✅ PASS | Delegates to `kernel.specs.updateMetadata.execute`. |

---

## 4. cli:project-update-metadata

### Compliance Summary

- **Overall Status**: ✅ FULL COMPLIANCE
- **Implementing Code**: `packages/cli/src/commands/project/update-metadata.ts`

### Requirements Verification

| Requirement   | Status  | Evidence/Notes                                             |
| :------------ | :------ | :--------------------------------------------------------- |
| Input payload | ✅ PASS | Accepts `optimizedContext` payload via stdin or `--input`. |
| Delegation    | ✅ PASS | Delegates to `kernel.project.updateMetadata.execute`.      |

---

## 5. cli:project-metadata

### Compliance Summary

- **Overall Status**: ✅ FULL COMPLIANCE
- **Implementing Code**: `packages/cli/src/commands/project/metadata.ts`

### Requirements Verification

| Requirement            | Status  | Evidence/Notes                                                      |
| :--------------------- | :------ | :------------------------------------------------------------------ |
| Display full structure | ✅ PASS | Prints full JSON contents including freshness and generated blocks. |
| Formatted output       | ✅ PASS | Supports `text`, `json`, `toon`.                                    |

---

## Global Spec Compliance

- **Architecture**: Follows established CLI command registration and kernel delegation patterns.
- **Conventions**: Uses `resolveCliContext` and standard formatter.
- **Error Handling**: Uses `handleError` and `cliError` helpers.

## Recommendations

- Fix the optimization warning signal in `change context` and `project context` commands to ensure they appear at the top of the `text` output and include user instructions for remediation (e.g., "Run `specd project optimize` to refresh metadata").
