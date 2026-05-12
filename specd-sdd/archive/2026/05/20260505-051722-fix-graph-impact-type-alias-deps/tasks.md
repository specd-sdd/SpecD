# Tasks: fix-graph-impact-type-alias-deps

## 1. File identity and graph-store contract

- [x] 1.1 Add `configRelativePath` to the file model
      `packages/code-graph/src/domain/value-objects/file-node.ts`: `FileNode`, `createFileNode()` — add the new readonly field without changing canonical equality or `path` normalization.
      Approach: keep `path` as `{workspace}:{relativeToCodeRoot}` and add a second normalized path relative to the active config directory; do not let it replace canonical identity in any symbol or relation code.
      (Req: File node, FileNode path and workspace semantics)

- [x] 1.2 Extend graph-store abstractions for config-relative lookup and fingerprint metadata
      `packages/code-graph/src/domain/ports/graph-store.ts`, `packages/code-graph/src/domain/value-objects/graph-statistics.ts`, `packages/code-graph/src/domain/value-objects/index-result.ts` — add `findFilesByConfigRelativePath()`, `graphFingerprint`, and `fullRebuildReason` to the contract types.
      Approach: make the new lookup and metadata backend-agnostic so SQLite, Ladybug, and test stores all expose the same observable semantics.
      (Req: Minimum graph semantics, Query methods, Graph statistics, Index result)

- [x] 1.3 Implement config-relative file persistence in SQLite
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`, `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` — add a persisted file column/index and meta-key support for `graphFingerprint`.
      Approach: bump the SQLite schema version, extend file row mapping and inserts, implement exact-match `findFilesByConfigRelativePath()`, and surface `graphFingerprint` through `getStatistics()`.
      (Req: Minimum graph semantics, Query methods, Graph statistics)

- [x] 1.4 Mirror the same semantics in Ladybug and the in-memory contract store
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`, `packages/code-graph/test/helpers/in-memory-graph-store.ts` — keep backend parity for `configRelativePath` and fingerprint metadata.
      Approach: add the new file property and meta value everywhere the backend creates, bulk-loads, reads, and resets file/graph state so contract tests can run unchanged across stores.
      (Req: Minimum graph semantics, Query methods, Graph statistics, Store recreation)

## 2. Fingerprint-aware indexing

- [x] 2.1 Introduce graph fingerprint helpers
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` — create `computeGraphFingerprint()` and workspace normalization helpers for the resolved workspace set.
      Approach: hash only the effective `@specd/code-graph` package version plus a canonicalized representation of resolved workspace objects, excluding function-valued fields such as `specs`.
      (Req: Incremental indexing, Graph derivation freshness)

- [x] 2.2 Persist config-relative paths during discovery
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: file discovery and `createFileNode()` call sites — populate `configRelativePath` for every discovered file.
      Approach: derive the path from the directory containing the active config used for indexing, normalize to forward slashes, omit leading `./`, and preserve `..` segments for files outside the config directory.
      (Req: Multi-workspace file discovery, Config-relative file lookup)

- [x] 2.3 Escalate fingerprint mismatches to a full rebuild in the indexer
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute()` — compare stored vs current fingerprint before incremental skip decisions.
      Approach: only skip unchanged files when both content hash and fingerprint match; on mismatch call `store.recreate()` inside the indexer, index every discovered file, and return `fullRebuildReason` plus the new `graphFingerprint`.
      (Req: Incremental indexing, Derivation mismatch policy, Index result)

- [x] 2.4 Keep CLI index output aligned with the new rebuild semantics
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex()` — surface `fullRebuildReason` and preserve explicit `--force` as a stronger override.
      Approach: keep the existing `beforeOpen` recreate path for explicit force, but treat provider/indexer-reported rebuild reasons as first-class text/json output.
      (Req: Derivation mismatch policy, Index result)

## 3. Unified graph impact file semantics

- [x] 3.1 Add workspace-aware file selector resolution
      `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts` — create the file-resolution helper for workspace-prefixed, config-relative, and absolute inputs.
      Approach: resolve `workspace:path` directly, normalize absolute inputs relative to the active config directory (or bootstrap repo root), query exact `configRelativePath` matches, and fail fast on not-found or ambiguity.
      (Req: Config-relative file lookup, File impact analysis, Error cases)

- [x] 3.2 Remove `--changes` and make `--file` variadic
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpact()` and related helpers — replace the obsolete selector model.
      Approach: accept one or more `--file` values, require exactly one of `--file` or `--symbol`, remove `handleChangesImpact()`, and update help text and selector validation accordingly.
      (Req: Command signature, Error cases, Constraints)

- [x] 3.3 Aggregate multi-file impact through `analyzeFileImpact()`
      `packages/cli/src/commands/graph/impact.ts`: file-impact execution path — compute changed symbols and aggregate per-file impact results.
      Approach: resolve all requested files first, gather declared symbols with `provider.findSymbols({ filePath })`, run `provider.analyzeFileImpact()` per canonical file, dedupe affected symbols/files, and derive overall risk from the union instead of using `detectChanges()`.
      (Req: File impact analysis, Output format)

- [x] 3.4 Preserve explicit static-type dependency impact semantics
      `packages/code-graph/src/domain/services/analyze-impact.ts`, `packages/code-graph/src/domain/services/analyze-file-impact.ts`, `packages/code-graph/src/composition/code-graph-provider.ts`, `packages/code-graph/src/domain/services/detect-changes.ts` — keep `USES_TYPE` / `CONSTRUCTS` / hierarchy traversal explicit while removing obsolete CLI dependence on `detectChanges()`.
      Approach: keep `getCallers()` / `getCallees()`-backed traversal intact, pin the `ArtifactParserRegistry -> GenerateSpecMetadata` path as a regression, and remove `detectChanges()` from the provider surface if nothing else uses it.
      (Req: Static type dependency impact, Impact analysis, File impact)

## 4. Freshness diagnostics, docs, and skill sources

- [x] 4.1 Surface derivation mismatch separately from VCS staleness
      `packages/cli/src/commands/graph/stats.ts`, `packages/cli/src/commands/project/status.ts`, `packages/code-graph/src/domain/value-objects/graph-statistics.ts` — expose and render `graphFingerprint` mismatch independently from `lastIndexedRef`.
      Approach: compare stored/current fingerprints alongside stored/current VCS refs, keep stale-by-VCS warn-only, and render derivation mismatch as “different code-graph version or workspace configuration”.
      (Req: Graph derivation freshness, Derivation mismatch policy, Staleness in graph stats output)

- [x] 4.2 Update repository docs and agent instructions to remove `--changes`
      `AGENTS.md`, `docs/cli/cli-reference.md` — replace all obsolete command forms and document workspace-prefixed/config-relative/absolute file inputs.
      Approach: treat this as part of the behavior change, not cleanup; there must be no in-repo command examples that still teach `graph impact --changes` or implicit `default:` path resolution.
      (Req: Command signature, Constraints, Graph impact terminology in workflow templates)

- [x] 4.3 Update authored skill sources and rely on project refresh for generated copies
      `packages/skills/templates/**`, `dev/ai-agents/skills/**` — migrate workflow examples and guidance to variadic `--file`.
      Approach: edit only the authored skill sources in this change; `.agents` and `.codex` are refreshed from canonical templates later via `specd project update` after the relevant build step, so they are not edited directly here.
      (Req: Graph impact terminology in workflow templates)

## 5. Automated tests and end-to-end verification

- [x] 5.1 Add model and graph-store contract coverage
      `packages/code-graph/test/domain/value-objects/file-node.spec.ts`, `packages/code-graph/test/domain/ports/graph-store.contract.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts` — cover `configRelativePath`, exact-match lookup, fingerprint statistics, and backend parity.
      Approach: extend existing fixtures rather than creating a parallel harness so the new contract is enforced uniformly across stores.
      (Req: File node, Query methods, Graph statistics)

- [x] 5.2 Add indexing and traversal regressions
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`, `packages/code-graph/test/domain/services/traversal.spec.ts`, `packages/code-graph/test/composition/code-graph-provider.spec.ts` — cover fingerprint mismatch rebuilds and static type-use impact.
      Approach: add scenarios for “unchanged file + matching fingerprint = skip”, “matching content + mismatched fingerprint = rebuild”, and the `ArtifactParserRegistry` / `GenerateSpecMetadata` dependency chain.
      (Req: Incremental indexing, Static type dependency impact, Index result)

- [x] 5.3 Rewrite CLI command coverage for the new selector model
      `packages/cli/test/commands/graph-impact.spec.ts`, `packages/cli/test/commands/graph-index.spec.ts`, `packages/cli/test/commands/graph-stats.spec.ts` — validate variadic `--file`, selector resolution, removed `--changes`, rebuild messaging, and derivation diagnostics.
      Approach: replace old `detectChanges()` expectations with per-file aggregation assertions and add ambiguity/not-found/error-path coverage for unprefixed selectors.
      (Req: Command signature, File impact analysis, Output format, Error cases, Derivation mismatch policy)

- [x] 5.4 Run the end-to-end command checks and document outcomes
      `packages/code-graph` / `packages/cli` integration path — execute the real `graph index`, `graph impact`, and `graph stats` commands against this repo after implementation.
      Approach: use the manual verification flow from `design.md`: force index once, confirm `generate-spec-metadata.ts` appears in `ArtifactParserRegistry` impact, verify the three path selector forms resolve identically, verify multi-file text output, and verify `--changes` fails with exit code 1.
      (Req: File impact analysis, Derivation mismatch policy, Error cases)
