# Spec Compliance Audit: Core Area

## Scope

- Spec: `core:config` (with deltas applied)
- Dependencies: `core:vcs-adapter-port`, `default:_global/architecture`, `default:_global/conventions`

---

## 1. Requirements Summary

### `core:config`

1. **Workspace-level graph configuration (`testPaths`, `ignorePaths`)**:
   - Workspaces may configure `graph.testPaths` (array of glob strings).
   - Workspaces may configure `graph.ignorePaths` (array of glob strings).
   - Inherits/preserves existing `allowedPaths`, `excludePaths`, `respectGitignore`.
2. **Project-level graph configuration (`testPaths`, `ignorePaths`)**:
   - `specd.yaml` `graph` block supports `testPaths` and `ignorePaths`.
   - When omitted, `graph.testPaths` defaults to:
     `['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`.
   - `graph.ignorePaths` defaults to empty array `[]`.

---

## 2. Implementation Status

| Requirement                                           | Implementation Target                                                                      | Status            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Workspace `testPaths` & `ignorePaths` typing & schema | `packages/core/src/domain/entities/specd-workspace-config.ts`                              | Fully Implemented |
| Project `testPaths` & `ignorePaths` typing & defaults | `packages/core/src/domain/entities/specd-project-config.ts`, `default-graph-test-paths.ts` | Fully Implemented |
| YAML config parser normalization                      | `packages/core/src/infrastructure/config/yaml-config-parser.ts`                            | Fully Implemented |

---

## 3. Discrepancies

- **None detected.** The implementation adheres strictly to the merged spec requirements and defaults.

---

## 4. Test Coverage

| Requirement                                      | Test Suite                                                          | Tests Passed | Status   |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------ | -------- |
| Workspace graph testPaths / ignorePaths          | `packages/core/test/domain/entities/specd-workspace-config.spec.ts` | 6/6          | Verified |
| Project graph testPaths / ignorePaths & defaults | `packages/core/test/domain/entities/specd-project-config.spec.ts`   | 8/8          | Verified |
| YAML parser graph config loading                 | `packages/core/test/config/yaml-config-parser.spec.ts`              | 12/12        | Verified |

---

## 5. Missing Tests

- **None.** All defined scenarios in `verify.md.delta.yaml` have direct unit tests.

---

## 6. Spec Dependency Chain & Consistency

- Conforms to `default:_global/architecture`: domain entities are pure; schema validation and parsing occur at infrastructure boundaries.
- Conforms to `default:_global/conventions`: strict types, named exports, kebab-case file paths.
- Conforms to `core:vcs-adapter-port`: config passes repository and graph boundaries cleanly.

---

## 7. Summary Counts

- Total Requirements: 4
- Fully Implemented: 4
- Discrepancies: 0
- Tests Passing: 26
- Missing Tests: 0
