# Spec Compliance Audit Report

- **Change:** `code-graph-file-categories`
- **Timestamp:** `20261011-163409`
- **Mode:** `Specific Change (--change code-graph-file-categories)`
- **Overall Status:** **COMPLIANT (100% Pass, 0 Discrepancies)**

---

## Executive Summary

An exhaustive spec-compliance audit was performed for the change `code-graph-file-categories` across all 7 affected specs and their direct dependencies.

The audit verified:

1. Conformance of implementation code and tests to the merged spec requirements (base specs + active deltas).
2. Conformance of change specs to global architecture and conventions (`default:_global/*`).
3. Direct dependencies and contract boundaries between Core, Code Graph, and CLI.

### Aggregate Metrics

| Metric                     | Count                             |
| -------------------------- | --------------------------------- |
| **Specs Audited**          | 7 change specs (+ 8 dependencies) |
| **Requirements Audited**   | 18                                |
| **Fully Implemented**      | 18 (100%)                         |
| **Discrepancies Found**    | **0**                             |
| **Targeted Tests Passing** | 213                               |
| **Missing Tests**          | 0                                 |

---

## Detailed Findings

The complete findings from all audit batches are recorded below verbatim.

---

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

---

# Spec Compliance Audit: Code Graph Area

## Scope

- Specs: `code-graph:graph-store`, `code-graph:traversal`, `code-graph:hotspots` (with deltas applied)
- Dependencies: `code-graph:symbol-model`, `code-graph:staleness-detection`, `code-graph:document-model`, `code-graph:resolve-symbol-reference`, `default:_global/architecture`

---

## 1. Requirements Summary

### `code-graph:graph-store`

1. **File Category Storage**:
   - `FileNode` carries `category: FileCategory` (`'source' | 'test' | 'ignored'`).
   - Defaults to `'source'` when unspecified.
   - Persisted in SQLite `files.category` column.
2. **Category Query Filtering**:
   - `findSymbols` filters by `categories`.
   - `queryImpactFrontier` filters by candidate category at the SQL query level before materialization.

### `code-graph:traversal`

1. **Category Isolation in Impact Analysis**:
   - Test callers do not inflate `riskLevel` or `directDependents`/`indirectDependents`/`transitiveDependents` under default source-only view.
   - `omittedCounts: { tests: number, ignored: number }` tracks excluded items.
   - Anchored test target correctly traverses downstream dependencies.
2. **BFS Traversal Pruning**:
   - BFS traversal stops when reaching non-admitted files (does not jump through test files to reach other modules).

### `code-graph:hotspots`

1. **Hotspot Scoring Exclusion**:
   - Test callers are excluded from score computation by default.
   - `includeTests: true` allows including test callers in scores and metrics.
2. **Smart Defaults**:
   - `DEFAULT_HOTSPOT_KINDS` is `['class', 'method', 'function']`.
3. **Output & Omission Tracking**:
   - `HotspotResult.omittedCounts` records counts of omitted test and ignored files.

---

## 2. Implementation Status

| Requirement                                   | Implementation Target                                                                                                                 | Status            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `FileNode` category & store schema            | `packages/code-graph/src/domain/value-objects/file-node.ts`, `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`    | Fully Implemented |
| `findSymbols` category filtering              | `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`                                                                 | Fully Implemented |
| Physical SQL frontier category filter         | `packages/code-graph/src/infrastructure/sqlite/statements/query-impact-frontier.ts`                                                   | Fully Implemented |
| BFS pruning & omittedCounts in impact         | `packages/code-graph/src/domain/services/traversal.ts`, `analyze-files-impact.ts`                                                     | Fully Implemented |
| Default hotspot kinds & test caller exclusion | `packages/code-graph/src/application/use-cases/compute-hotspots.ts`, `packages/code-graph/src/domain/value-objects/hotspot-result.ts` | Fully Implemented |
| Hotspot omittedCounts                         | `packages/code-graph/src/application/use-cases/compute-hotspots.ts`                                                                   | Fully Implemented |

---

## 3. Discrepancies

- **None detected.** The previous discrepancy where `DEFAULT_HOTSPOT_KINDS` omitted `interface` while the base verify scenario still listed it has been fully resolved via the updated delta in `deltas/code-graph/hotspots/verify.md.delta.yaml`. Code, deltas, and merged preview now align 100% on `['class', 'method', 'function']`.

---

## 4. Test Coverage

| Spec Requirement                                 | Test File                                                                   | Test Count | Status   |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ---------- | -------- |
| Category persistence & SQLite schema             | `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` | 18         | Verified |
| Category classification service                  | `packages/code-graph/test/domain/services/classify-file-category.spec.ts`   | 5          | Verified |
| SQL frontier category filtering                  | `packages/code-graph/test/infrastructure/sqlite/statements.spec.ts`         | 12         | Verified |
| Impact analysis category pruning & omittedCounts | `packages/code-graph/test/domain/services/traversal.spec.ts`                | 39         | Verified |
| Multi-file impact category isolation             | `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts`     | 8          | Verified |
| Hotspot scoring & test exclusion                 | `packages/code-graph/test/application/use-cases/compute-hotspots.spec.ts`   | 24         | Verified |
| Default kinds (`class,method,function`)          | `packages/code-graph/test/application/use-cases/compute-hotspots.spec.ts`   | 4          | Verified |

---

## 5. Missing Tests

- **None.** All scenarios across `graph-store`, `traversal`, and `hotspots` have automated tests passing in vitest.

---

## 6. Spec Dependency Chain & Consistency

- Conforms to `code-graph:symbol-model`: symbol identities remain language-agnostic and immutable.
- Conforms to `code-graph:staleness-detection`: hashing and staleness checks cover file category attributes.
- Conforms to `default:_global/architecture`: clean separation between in-memory graph domain models and SQLite infrastructure.

---

## 7. Summary Counts

- Total Requirements: 7
- Fully Implemented: 7
- Discrepancies: 0
- Tests Passing: 110
- Missing Tests: 0

---

# Spec Compliance Audit: CLI Area

## Scope

- Specs: `cli:graph-impact`, `cli:graph-hotspots`, `cli:graph-search` (with deltas applied)
- Dependencies: `cli:entrypoint`, `cli:graph-cli-context`, `core:config`, `code-graph:composition`, `code-graph:traversal`, `code-graph:hotspots`, `code-graph:graph-store`, `default:_global/architecture`, `default:_global/conventions`

---

## 1. Requirements Summary

### `cli:graph-impact`

1. **Command Options**:
   - Accepts `--include-tests` flag.
   - Accepts `--category` option with support for comma-separated lists (e.g. `--category source,test`).
2. **Output Format**:
   - In text mode, renders `Excluded from results: N test files` when non-admitted files are omitted.
   - In JSON mode, includes `omittedCounts: { tests: number, ignored: number }`.

### `cli:graph-hotspots`

1. **Command Options**:
   - Default kinds: `class,method,function`.
   - Accepts `--include-tests`.
   - Accepts `--category` with comma-separated values.
2. **Output Format**:
   - In text mode, renders omission notice when items are excluded.
   - In JSON mode, includes `omittedCounts`.

### `cli:graph-search`

1. **Command Options**:
   - Accepts `--category` (e.g. `--category test`, `--category source,test`).
   - Accepts `--include-tests`.
   - Dedicated `--tests` flag alias removed in favor of `--category test`.
2. **Output Format**:
   - In text mode, renders omission notice when non-admitted files are pruned.
   - In JSON mode, includes `omittedCounts`.

---

## 2. Implementation Status

| Requirement                                       | Implementation Target                                                               | Status            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| Comma-separated category parsing helper           | `packages/cli/src/helpers/parse-comma-values.ts`                                    | Fully Implemented |
| `graph impact` `--category` & `--include-tests`   | `packages/cli/src/commands/graph-impact.ts`                                         | Fully Implemented |
| `graph hotspots` `--category` & `--include-tests` | `packages/cli/src/commands/graph-hotspots.ts`                                       | Fully Implemented |
| `graph search` `--category` & `--include-tests`   | `packages/cli/src/commands/graph-search.ts`                                         | Fully Implemented |
| Removal of bare `--tests` alias                   | `packages/cli/src/commands/graph-search.ts`                                         | Fully Implemented |
| Text omission notices & JSON `omittedCounts`      | `packages/cli/src/commands/graph-impact.ts`, `graph-hotspots.ts`, `graph-search.ts` | Fully Implemented |
| Help text & JSON schema documentation             | `packages/cli/src/commands/graph-search.ts`, `graph-impact.ts`, `graph-hotspots.ts` | Fully Implemented |

---

## 3. Discrepancies

- **None detected.** All CLI commands implement `--category` with comma-separated parsing, `--include-tests`, the omission notices in text mode, and `omittedCounts` in JSON mode. The `--tests` flag alias was cleanly removed, matching the spec.

---

## 4. Test Coverage

| Spec Requirement                                  | Test File                                              | Test Count | Status   |
| ------------------------------------------------- | ------------------------------------------------------ | ---------- | -------- |
| Comma-separated value parsing                     | `packages/cli/test/helpers/parse-comma-values.spec.ts` | 9          | Verified |
| Graph impact category options & omission notice   | `packages/cli/test/commands/graph-impact.spec.ts`      | 26         | Verified |
| Graph hotspots category options & omission notice | `packages/cli/test/commands/graph-hotspots.spec.ts`    | 18         | Verified |
| Graph search category options & omission notice   | `packages/cli/test/commands/graph-search.spec.ts`      | 24         | Verified |

---

## 5. Missing Tests

- **None.** All CLI requirements and scenarios from the delta specifications are covered by tests in `@specd/cli/test/commands/`.

---

## 6. Spec Dependency Chain & Consistency

- Conforms to `cli:entrypoint`: flag parsing, validation, and exit code behaviors adhere to CLI architecture standards.
- Conforms to `cli:graph-cli-context`: provider lifecycle and bootstrap are managed correctly.
- Conforms to `default:_global/conventions`: TypeScript strict mode, named exports, kebab-case file paths.

---

## 7. Summary Counts

- Total Requirements: 7
- Fully Implemented: 7
- Discrepancies: 0
- Tests Passing: 77
- Missing Tests: 0
