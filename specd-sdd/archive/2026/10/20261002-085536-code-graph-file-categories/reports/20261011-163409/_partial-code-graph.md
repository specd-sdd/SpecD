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
