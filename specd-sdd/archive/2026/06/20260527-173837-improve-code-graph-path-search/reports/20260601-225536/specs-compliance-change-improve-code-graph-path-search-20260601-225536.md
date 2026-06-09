# Specs Compliance Audit

- Change: `improve-code-graph-path-search`
- Mode: `--change`
- Timestamp: `2026-06-01 22:55:36 +0200`
- Result: `No actionable discrepancies found`

## Scope

Audited the merged change specs and their direct implementation impact with emphasis on the latest discovery/config block:

- `cli:graph-index`
- `cli:graph-stats`
- `code-graph:indexer`
- `code-graph:document-model`
- `code-graph:workspace-integration`
- `core:config`
- `core:spec-repository-port`

Also checked that the new behavior remained coherent with the already-implemented search/impact/path-normalization work in the same change.

## Findings

No actionable spec/code mismatches were found in the audited scope.

## Requirement Coverage

### `core:config`

- `graph.includePaths` and global `graph.excludePaths` are part of the resolved config contract in [packages/core/src/application/specd-config.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/specd-config.ts:80) and validated/loaded in [packages/core/src/infrastructure/fs/config-loader.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/config-loader.ts:179).
- Loader coverage exists for both positive and negative cases, including array validation, in [packages/core/test/infrastructure/fs/config-loader.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/config-loader.spec.ts:1495).

### `core:spec-repository-port`

- The repository capability is modeled as an optional getter on the base port in [packages/core/src/application/ports/spec-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/ports/spec-repository.ts:63).
- The filesystem-backed implementation exposes the canonical path in [packages/core/src/infrastructure/fs/spec-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts:90).

### `code-graph:indexer` and `code-graph:workspace-integration`

- Synthetic spec-root exclusions are derived from filesystem-backed repositories and normalized in [packages/code-graph/src/application/use-cases/\_shared/resolve-effective-graph-config.ts](/Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/resolve-effective-graph-config.ts:40).
- Effective global/workspace discovery config is resolved centrally in [packages/code-graph/src/application/use-cases/\_shared/resolve-effective-graph-config.ts](/Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/resolve-effective-graph-config.ts:77).
- Fingerprints now use effective config, synthetic spec excludes, and a reserved `root` entry in [packages/code-graph/src/application/use-cases/\_shared/compute-graph-fingerprint.ts](/Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts:52).
- Document decoding now accepts `utf-8`, `utf-16le`, `utf-16be`, and `windows-1252`, with the NUL check only rejecting the non-UTF16 fallback path, in [packages/code-graph/src/application/use-cases/index-code-graph.ts](/Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/index-code-graph.ts:255).
- Scenario coverage exists for workspace ownership, spec-root exclusion, and text encodings in [packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts:139).

### `cli:graph-index`

- CLI graph config assembly now uses project-global includes/excludes in [packages/cli/src/commands/graph/build-project-graph-config.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/build-project-graph-config.ts:19).
- `graph index --force` delegates to provider recreation before indexing in [packages/cli/src/commands/graph/index-graph.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts:151).
- Text output includes `documents` and per-workspace document counts in [packages/cli/src/commands/graph/index-graph.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts:172).
- Automated command-level coverage exists in [packages/cli/test/commands/graph-index.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts:184).
- Live verification confirmed:
  - `node packages/cli/dist/index.js graph index --format text --force`
  - completed successfully
  - reported `documents:  1230`
  - did not reintroduce the previous `Graph store is not open` failure

### `cli:graph-stats`

- `graph stats` recomputes fingerprint mismatch from the same effective config model used by indexing in [packages/cli/src/commands/graph/stats.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts:72).
- Text output includes `Documents:` and text warning behavior remains aligned with the spec in [packages/cli/src/commands/graph/stats.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts:91).
- Automated coverage exists for document counts, stale/current ref fields, and fingerprint mismatch output in [packages/cli/test/commands/graph-stats.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts:242).
- Live verification confirmed:
  - `node packages/cli/dist/index.js graph stats --format json`
  - returned `documentCount: 1230`
  - returned `fingerprintMismatch: false`
  - returned `stale: false`

## Test Coverage Assessment

Strong coverage exists for the new behavior:

- `pnpm exec vitest run packages/core/test/infrastructure/fs/config-loader.spec.ts packages/cli/test/commands/build-project-graph-config.spec.ts packages/cli/test/commands/graph-stats.spec.ts packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts packages/code-graph/test/composition/code-graph-provider.spec.ts --maxWorkers 1`
- `pnpm exec vitest run packages/cli/test/commands/graph-index.spec.ts --maxWorkers 1`
- `pnpm build`

Primary scenarios from the updated verify files are covered either by automated tests or by direct CLI execution against the built artifact.

## Residual Risks

- Some older `graph-index` unit tests remain skipped around bootstrap-path behavior and lock acquisition. That is not a contradiction with the current specs, but it is still a coverage gap outside the newly changed semantics.
- The audit focused on the changed graph discovery/config behavior and the already-affected search/impact behavior in this change, not on a full-project re-audit of all unrelated graph consumers.

## Summary

- Specs audited: `7` primary changed specs in the latest block, plus coherence check against the broader change surface
- Actionable discrepancies: `0`
- Primary coverage gaps: `1` non-blocking area (`graph-index` skipped legacy tests around bootstrap/lock paths)
