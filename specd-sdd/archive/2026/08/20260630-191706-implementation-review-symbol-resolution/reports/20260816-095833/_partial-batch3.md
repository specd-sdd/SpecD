# Batch 3 Compliance Audit Report

## Requirements & Verification Summary

| Spec ID                  | Total Requirements | Satisfied | Discrepancies | Missing Tests |
| ------------------------ | -----------------: | --------: | ------------: | ------------: |
| `code-graph:traversal`   |                 11 |        11 |             0 |             0 |
| `code-graph:composition` |                  9 |         9 |             0 |             0 |
| `cli:graph-impact`       |                  9 |         9 |             0 |             0 |
| `cli:graph-search`       |                  7 |         7 |             0 |             0 |
| `cli:graph-index`        |                  5 |         5 |             0 |             0 |
| `cli:graph-stats`        |                  6 |         6 |             0 |             0 |
| **Total**                |             **47** |    **47** |         **0** |         **0** |

## Detailed Findings per Spec

### 1. `code-graph:traversal` — IMPLEMENTED (11/11)

**Requirements Compliance:**

- **Upstream & Downstream Traversal:** `getUpstream` and `getDownstream` follow `CALLS`, `CONSTRUCTS`, and `USES_TYPE` relations in reverse/forward directions with cycle detection, depth grouping, and `maxDepth` bounds.
- **TraversalOptions & TraversalResult:** `maxDepth` defaults to 3, `includeFiles` defaults to true. Returns structured Map of levels, `totalCount`, and `truncated` boolean.
- **Impact Analysis & Risk Level:** `analyzeImpact` computes risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), direct/indirect/transitive dependent counts, unique affected files, affected symbols with depth, and hierarchy reachability (`EXTENDS`, `IMPLEMENTS`, `OVERRIDES`).
- **Static Type Dependency Impact:** Static type and hierarchy edges contribute to depth counts, risk calculations, and file impact aggregations equally with call edges.
- **File & Multi-File Impact:** `analyzeFileImpact` and `analyzeFilesImpact` aggregate symbol impacts, compute max risk level, deduplicate affected symbols keeping shallowest depth, and support multi-file inputs with depth 0 baseline.
- **Spec Impact:** `analyzeSpecImpact` handles `DEPENDS_ON`, `COVERS_FILE`, and `COVERS_SYMBOL` relations in both upstream (dependents) and downstream (dependencies) modes.
- **Change Detection:** `detectChanges` aggregates changed symbols, affected symbols/files, and risk levels across changed files.
- **Pure Functions:** All traversal functions in `domain/services/` are stateless, pure, read-only functions receiving `GraphStore`.
- **Resolved Canonical & Public-Binding Impact (Delta):** Unqualified selector resolution prefers case-exact candidates, falls back to case-insensitive exact match when no case-exact exists, and ignores prefix/textual matches. Public-export impact reports proven binding routes separately from complete canonical symbol impact.
- **File-Impact Covering Specs (Delta):** `FileImpactResult` includes deterministically ordered `coveringSpecs` with `{ kind, target, depth }` evidence. Reverse coverage queries use batched deduplicated store lookups.

**Code Locations:**

- `packages/code-graph/src/domain/services/get-upstream.ts`
- `packages/code-graph/src/domain/services/get-downstream.ts`
- `packages/code-graph/src/domain/services/analyze-impact.ts`
- `packages/code-graph/src/domain/services/analyze-file-impact.ts`
- `packages/code-graph/src/domain/services/analyze-files-impact.ts`
- `packages/code-graph/src/domain/services/analyze-spec-impact.ts`
- `packages/code-graph/src/domain/services/detect-changes.ts`

**Test Coverage:**

- `packages/code-graph/test/domain/services/traversal.spec.ts` (718 lines, covering cycles, depth limits, risk levels, hierarchy, public-export vs canonical impact, covering specs evidence, and pure function store non-mutation)
- `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts` (aggregations and batched coverage lookups)

---

### 2. `code-graph:composition` — IMPLEMENTED (9/9)

**Requirements Compliance:**

- **CodeGraphProvider Facade:** Single top-level API facade wrapping indexing, querying, full-text search, maintenance (`clear()`), traversal, impact analysis, selector resolution, and lifecycle (`open()`, `close()`).
- **Factory Function:** Overloaded `createCodeGraphProvider` supporting primary workspace-aware `SpecdConfig` and legacy standalone `CodeGraphOptions`. Built-in store registry includes `ladybug` and `sqlite` (default: `sqlite`). Factory creation is synchronous; open boundary performs native resolution.
- **Package Exports & Entry Points:** `src/public.ts` exported as `"."` curated public surface. `src/index.ts` exported as `"./internal"`. No unrestricted `export *` of infrastructure modules in `"."`.
- **Lifecycle Management:** Explicit `open()` and `close()` management; `close()` is idempotent.
- **Dependency on @specd/core:** `SpecdConfig` used solely to derive storage path; provider remains stateless regarding project config.
- **Host Use Cases:** Exposes `GetGraphHealth`, `IndexProjectGraph`, `GetSpecCoverage`, and `GetChangeSpecCoverage` for host orchestration.
- **Symbol-Reference Provider Surface (Delta):** Exposes `resolveSymbolReference`, `analyzePublicBindingImpact`, and `getExactPublicBinding` keyed by public surface and target without ranked search pagination.
- **Code Graph-Orchestrated Search Surface (Delta):** Multi-category unified search operation (`searchCodeGraph`) managing query planning, semantic and content candidate lanes, symbol selection range suppression, occurrence capping, and final category limits.

**Code Locations:**

- `packages/code-graph/src/composition/code-graph-provider.ts`
- `packages/code-graph/src/public.ts`
- `packages/code-graph/src/index.ts`
- `packages/code-graph/src/application/use-cases/search-code-graph.ts`

**Test Coverage:**

- `packages/code-graph/test/composition/code-graph-provider.spec.ts`
- `packages/code-graph/test/composition/package-exports.spec.ts`
- `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`

---

### 3. `cli:graph-impact` — IMPLEMENTED (9/9)

**Requirements Compliance:**

- **Command Signature:** Supports `--file`, `--symbol`, `--spec`, and `--export/--from` target families. Normalizes `--direction` (`dependents`/`upstream`, `dependencies`/`downstream`, `both`), validates `--depth`, `--config`, `--path`, and `--format` (`text`, `json`, `toon`).
- **File Impact Analysis:** Delegated to `CodeGraphProvider.analyzeFileImpact` and `analyzeFilesImpact` via SDK context `withProvider`. Accepts workspace-prefixed, config-relative, or absolute paths.
- **Symbol Impact Analysis:** Resolves selectors via `resolveSymbolSelector`, executing canonical or public binding impact analysis. Unqualified selectors enforce case-exact precedence and bounded ambiguity before traversal.
- **Spec Impact Analysis:** Loads spec via `getSpec(specId)` and delegates to `analyzeSpecImpact`. Propagates `SpecNotFoundError` to exit with code 1 and `SPEC_NOT_FOUND`.
- **Public Export Impact Analysis (Delta):** `--export <name> --from <surface>` renders selected public binding, canonical target, exact route consumers, and canonical impact.
- **File-Impact Covering Specs Presentation (Delta):** Renders `coveringSpecs` returned by Code Graph grouped into direct target coverage and blast-radius coverage without CLI-side recomputation.
- **Concurrent Indexing Guard & Infrastructure Errors:** Surfaced provider availability errors (`GRAPH_BUSY`, `GRAPH_PROVIDER_STALE`) exit with code 3.
- **Output Formatting:** All file paths formatted relative to project root. Supports text, JSON (with aggregate counts), and TOON formats.

**Code Locations:**

- `packages/cli/src/commands/graph/impact.ts`
- `packages/cli/src/commands/graph/resolve-impact-file-selectors.js`

**Test Coverage:**

- `packages/cli/test/commands/graph-impact.spec.ts` (1,335 lines, covering file/symbol/spec/export targets, ambiguity handling, depth limits, covering specs, and JSON/TOON output structures)

---

### 4. `cli:graph-search` — IMPLEMENTED (7/7)

**Requirements Compliance:**

- **Command Signature & Filters:** Supports `<query>` with `--symbols`, `--files`, `--specs`, `--documents` category flags, `--snippet`, `--kind`, `--file`, `--workspace`, `--exclude-path`, `--exclude-workspace`, `--limit`, `--spec-content`, `--config`, `--path`, `--format`.
- **Search Behaviour:** Delegates to unified `CodeGraphProvider.searchCodeGraph` operation. The CLI does not pre-limit, merge, rerank, or deduplicate category results independently.
- **Reference-Aware Symbol Results (Delta):** Renders logical target, contributing declarations, symbol space, member form, and direct matching bindings.
- **Semantic-First Candidate Lanes (Delta):** Code Graph orchestrates exact logical identity, exact public binding, case-exact declaration, case-normalized declaration, component matches, and backend text relevance.
- **Output Format:** Category-grouped output in `symbols`, `files`, `specs`, `documents` order with category header limits. Text mode sanitizes ANSI escape sequences and non-printable control characters in snippets. File search displays retained matches, `totalMatches`, and `omittedMatches`.
- **Error Cases:** Infrastructure failures (`GRAPH_BUSY`, `GRAPH_PROVIDER_STALE`, provider open failure) exit with code 3. Invalid flag combinations (e.g. `--spec-content` with text format) exit with code 1.

**Code Locations:**

- `packages/cli/src/commands/graph/search.ts`
- `packages/cli/src/commands/graph/normalize-snippet.ts`
- `packages/cli/src/commands/graph/parse-graph-kinds.ts`

**Test Coverage:**

- `packages/cli/test/commands/graph-search.spec.ts`
- `packages/cli/test/commands/graph/normalize-snippet.spec.ts`
- `packages/cli/test/commands/graph/parse-graph-kinds.spec.ts`

---

### 5. `cli:graph-index` — IMPLEMENTED (5/5)

**Requirements Compliance:**

- **Command Signature:** `--force`, `--exclude-path`, `--config`, `--path`, `--format text|json|toon`.
- **Indexing Behaviour:** Executes via `runIndexProjectGraph` from `@specd/sdk`. Handles parent-process indexing lock, worker subprocess isolation via `child_process.spawn` (or `SPECD_GRAPH_INDEX_NO_WORKER` bypass for tests), and `onProgress` callbacks. Reuses resolved host context/kernel.
- **Visible Incompatibility Repair (Delta):** Serves as user repair path for schema/derivation incompatibility. Text, JSON, and TOON report rebuild flags, reasons, and per-file coverage/error breakdown post-repair.
- **Output Format:** Text mode displays summary block with discovered, indexed, documents, skipped, removed, specs, errors, and per-workspace breakdowns. JSON/TOON output full `IndexResult`.
- **Error Cases & Documentation:** Lock contention or infrastructure failures exit with code 3. Per-file parse errors are captured in `IndexResult.errors` with exit code 0. Fully documented in `docs/cli/cli-reference.md`.

**Code Locations:**

- `packages/cli/src/commands/graph/index.ts`

**Test Coverage:**

- `packages/cli/test/commands/graph-index.spec.ts`
- `packages/cli/test/commands/graph-index-integration.spec.ts`

---

### 6. `cli:graph-stats` — IMPLEMENTED (6/6)

**Requirements Compliance:**

- **Command Signature:** `--config`, `--path`, `--format text|json|toon`.
- **Statistics & Health Retrieval:** Obtains host context via `openSpecdHost`, opens provider via SDK lifecycle, and invokes provider's `getGraphHealth` operation directly without recomputing health in the CLI facade.
- **Content Freshness & Coverage Diagnostics (Delta):** Renders VCS staleness, working-tree content changes, derivation fingerprint mismatches, backend schema/generation compatibility, and partial/excluded/unsupported coverage reasons.
- **Concurrent Indexing Guard & Infrastructure Errors:** Provider availability check surfaces `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE`, exiting with code 3.
- **Output Format:** Text output displays file/document/symbol/spec counts, languages, non-zero relations, ISO timestamp, and health/staleness warnings. JSON and TOON output full `GraphHealthResult` with compatibility projections (`stale`, `currentRef`, `fingerprintMismatch`).

**Code Locations:**

- `packages/cli/src/commands/graph/stats.ts`
- `packages/cli/src/commands/graph/warn-graph-staleness.ts`

**Test Coverage:**

- `packages/cli/test/commands/graph-stats.spec.ts`
