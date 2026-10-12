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
