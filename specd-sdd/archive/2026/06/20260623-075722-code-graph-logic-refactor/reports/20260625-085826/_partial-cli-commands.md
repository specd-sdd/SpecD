# Compliance Audit Report: CLI Graph Commands

This report evaluates compliance for the active change `code-graph-logic-refactor` across three graph CLI command specifications.

---

## Spec: cli:graph-index

### Requirements Summary

The `graph index` command indexes the project workspace(s) into the code graph. It accepts options to force rebuilding, exclude specific paths, target a specific configuration/path, and select output format (text, json, toon). It delegates all indexing, locking, and configuration to `@specd/code-graph` and prints indexing progress callbacks in text mode.

### Implementation Status

Fully implemented. The command registers correctly in [index-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts), enforces mutual exclusion of configuration flags, and prints progress updates and formatted text outputs matching the spec specifications.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Worker Process Spawning**: The implementation spouts a separate worker process to perform the actual indexing, using environment variables (`SPECD_GRAPH_INDEX_WORKER`, `SPECD_GRAPH_INDEX_LOCK_HELD`, etc.). This process isolation is absent from the spec's description and constraints.
- **Additional Command Options**: The implementation registers options `--concurrency` and `--include-path`, which are undocumented in the spec's signature.
- **Lock Failure Exit Code**: The lock acquisition error case is not explicitly listed in the spec error cases (although lock behavior is described under the stats and impact specs).

### Test Coverage

- Verified in [graph-index.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts).
- 9 test cases cover basic invocation, workspace list retrieval, bootstrap mode, exclude-path handling, `--force` recreation, text rendering, and lock checks.

### Missing/Insufficient Tests

- **Spawning Lifecycle**: Spawning a worker process is completely mocked out (bypassed with `SPECD_GRAPH_INDEX_NO_WORKER = 'true'`), leaving worker startup, signal forwarding, and exit code propagation untested.
- **Context Flag Exclusivity**: The `--config` and `--path` exclusivity checks are not unit-tested.
- **Error Exits**: Per-file indexing errors and infrastructure failure exits (exit code 3) are not unit-tested.
- **Progress Output**: The text-mode `onProgress` output logic is not validated.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:graph-store](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/graph-store/spec.md)
- [core:list-workspaces](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/list-workspaces/spec.md)

### Summary Counts

- **Requirements checked**: 14
- **Implemented**: 13
- **Partially implemented**: 1
- **Gaps found**: 3
- **Test cases found**: 9

---

## Spec: cli:graph-stats

### Requirements Summary

The `graph stats` command retrieves and outputs summary statistics from the code graph (files, documents, symbols, specs, languages, relations, last indexed timestamp). In text mode, it shows a staleness warning if the current ref differs from the indexed ref. In JSON/TOON mode, it appends `stale`, `currentRef`, and `fingerprintMismatch` indicators. It checks the indexing lock before opening the provider.

### Implementation Status

Fully implemented. Code in [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts) checks locks via `assertGraphIndexUnlocked`, resolves VCS info, compares fingerprints, and outputs formatted statistics.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Fingerprint Warning in Text Mode**: In text mode, the CLI prints `'⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index'` if mismatch is detected. The spec only describes `fingerprintMismatch` as a field inside JSON/TOON output and makes no mention of this text warning.

### Test Coverage

- Verified in [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts).
- 16 test cases cover config paths, lock checks, exclusivity, staleness calculations (stale, fresh, null refs, missing VCS), text warnings, and JSON output structures.

### Missing/Insufficient Tests

- **Document Counts in Text**: The exact formatting of the documents count line in text mode (e.g. `Documents: 18`) is not directly asserted in a dedicated test scenario.
- **Infrastructure Errors**: Database opening errors or retrieval infrastructure failures exiting with code 3 are not unit-tested.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:staleness-detection](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/staleness-detection/spec.md)
- [core:list-workspaces](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/list-workspaces/spec.md)

### Summary Counts

- **Requirements checked**: 11
- **Implemented**: 11
- **Partially implemented**: 0
- **Gaps found**: 1
- **Test cases found**: 16

---

## Spec: cli:graph-impact

### Requirements Summary

The `graph impact` command analyzes the blast radius of a spec, a symbol, or set of files, traversing upstream (dependents) or downstream (dependencies) up to a specified depth. It resolves selectors (workspace-prefixed, relative, or absolute paths) and formats output files relative to the project root. It includes detailed symbol breakdowns and depth markers in text mode, and aggregate counts in JSON/TOON mode.

### Implementation Status

Fully implemented. Code in [impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts) resolves selector inputs, normalized directions, checks lock status, performs the traversal, and prints formatted text or structured outputs.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Symbol Lookup Method**: The spec details that symbol lookup is performed using `findSymbols({ name })`. The code instead calls `resolveSymbolSelector(symbolSelector)` to support advanced selectors (bare, qualified, full-id), followed by `getSymbol(id)`.
- **Selector Error Formatting**: The spec requires that not-found errors show the normalized config-relative path searched. The implementation prints the raw un-normalized user selector string instead.
- **Spec Not Found Exit Code**: Under "Error cases", the spec states the command "SHALL fail with a not-found error" if a spec does not exist. However, both the verification scenarios ("Missing spec reports cleanly: exits with code 0") and the implementation return cleanly and exit with code 0 instead of exiting with code 1.

### Test Coverage

- Verified in [graph-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts).
- 27 test cases cover lock checks, direction mappings, depth options, context resolutions, selector exclusivity, spec impact results, symbol match/not-found results, multi-file aggregations, and JSON formatting.

### Missing/Insufficient Tests

- **Text Output Formatting details**: Spec impact and multi-file text formatting structures (such as `Changed symbols` or `Per-file breakdown` formatting) are not verified.
- **Path Normalization**: Normalizing absolute and project-relative paths (e.g. `packages/core/src/auth.ts` vs `/repo/packages/core/src/auth.ts`) is not unit-tested (mocked at the resolver level).
- **Infrastructure Errors**: Exit code 3 for database or provider connection failures is not unit-tested.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:traversal](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/traversal/spec.md)
- [code-graph:workspace-integration](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/workspace-integration/spec.md)

### Summary Counts

- **Requirements checked**: 18
- **Implemented**: 16
- **Partially implemented**: 2
- **Gaps found**: 3
- **Test cases found**: 27
