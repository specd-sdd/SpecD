# Spec Compliance Audit Report — Batch `impl-and-names`

Change: `support-commas-in-names`
Date: 2026-11-13
Auditor: Read-only Spec Compliance Auditor

---

## Summary

| Spec ID                               | Status                           | Discrepancies (H / M / L) | Missing Tests |
| ------------------------------------- | -------------------------------- | ------------------------- | ------------- |
| `core:update-implementation-tracking` | Compliant (1 minor verify drift) | 0 / 0 / 1                 | 5             |
| `cli:change-implementation`           | Compliant                        | 0 / 0 / 0                 | 3             |
| `cli:graph-index`                     | Compliant                        | 0 / 0 / 0                 | 1             |
| `skills:workflow-automation`          | Compliant                        | 0 / 0 / 0                 | 1             |
| **Total**                             | **Compliant**                    | **0 / 0 / 1**             | **10**        |

**Cross-cutting `_global/*` checks:**

- **`default:_global/cross-platform`**: Compliant. `toLogicalFilePath` and `sameTrackedFile` isolate `process.platform` checks; `UpdateImplementationTracking` uses `path.resolve` for FS reads; CLI and core tests exercise `win32`, `darwin`, and `linux` branches via explicit platform injection.
- **`default:_global/error-handling-conventions`**: Compliant. Expected validation/domain failures throw typed `SpecdError` subclasses (`InvalidInputError`, `InvalidSpecIdError`, `WorkspaceNotFoundError`, `SpecNotFoundError`, `ImplementationFileNotFoundError`, `ChangeNotFoundError`).
- **`default:_global/testing`**: Compliant. Vitest `.spec.ts` files mirror `src/`, unit tests mock ports without FS/network/processes, and integration tests use `os.tmpdir()` with `afterEach` cleanup.

---

## 1. `core:update-implementation-tracking`

### Requirements Summary

- `UpdateImplementationTracking.execute` accepts `name`, `action` (`add`, `remove`, `ignore`, `resolve`, `unresolve`, `start`), `file`, `files`, `specId`, `symbols`.
- Combines `file` followed by `files` with duplicates collapsed; `add`/`remove` without `specId` throw `InvalidInputError`; `specId` is validated/normalized via `parseSpecId` and configured `specRepositories` for every action before any mutation.
- File names are treated as whole names (never split on commas, trimmed, or case-folded in storage/errors); case comparison follows host platform (`win32`/`darwin` case-insensitive, `linux` case-sensitive) while preserving recorded spelling.
- `toLogicalFilePath(file, platform)` converts `\` to `/` only on `win32`, keeping `\` on POSIX hosts.
- Multi-file mutations validate every entry before applying any change (all-or-nothing) and persist via a single `ChangeRepository.mutate`.
- `createUpdateImplementationTracking(config, options?)` delegates through `resolveUpdateImplementationTrackingDeps(resolver)` with required `specRepositories`.

### Implementation Status

- **Implemented** in:
  - [`update-implementation-tracking.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts#L71-L367)
  - [`update-implementation-tracking.ts` (composition)](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-implementation-tracking.ts#L15-L117)
  - [`to-logical-file-path.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/domain/services/to-logical-file-path.ts#L10-L15)
  - [`same-tracked-file.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/domain/services/same-tracked-file.ts#L13-L21)

### Discrepancies

1. **[LOW] `verify.md` vs `spec.md` / implementation for `specRepositories` optionality**
   - **Evidence**:
     - `spec.md` (via `spec-preview`, line 111) states: "`specRepositories: ReadonlyMap<string, SpecRepository>` (required: the use case always validates `specId` workspaces, see 'Input contract')".
     - `packages/core/src/composition/use-cases/update-implementation-tracking.ts` (lines 23–26) defines `readonly specRepositories: ReadonlyMap<string, SpecRepository>` as required.
     - `verify.md` (via `spec-preview`, line 280) still writes `specRepositories?: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: Spec drift in `verify.md` (stale optional `?` marker after `specRepositories` was made required in `spec.md` and implementation), not an implementation bug.

### Test Coverage

- [`update-implementation-tracking.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-implementation-tracking.spec.ts#L60-L1027): Covers `ChangeNotFoundError`, `add`/`resolve`/`unresolve`/`ignore`/`remove`/`start`, atomic multi-file batches, `specId` validation/normalization/`SpecNotFoundError`/`WorkspaceNotFoundError`/`InvalidSpecIdError`/`InvalidInputError`, whole file names (commas, spaces, quotes, non-ASCII, `file`+`files` combination, duplicates, original win32 error quoting), `win32`/`darwin`/`linux` path & case handling.
- [`to-logical-file-path.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/domain/services/to-logical-file-path.spec.ts#L4-L24): Covers `win32`, `linux`, `darwin`, commas/spaces, and default platform.
- [`update-implementation-tracking.spec.ts` (composition)](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-implementation-tracking.spec.ts#L68-L109): Covers `createUpdateImplementationTracking(config)` and `createUpdateImplementationTracking(deps)`.

### Missing Tests

1. `remove` with `symbols` (deleting only the specified symbol refinements while retaining remaining symbols or explicit file-level link) in `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`.
2. `resolve` (or `ignore`/`unresolve`) with an invalid `specId` (`InvalidSpecIdError` / `WorkspaceNotFoundError`) — currently only `add` and `start` are tested with `Bad Id`.
3. `start` with malformed `specId` (`update-implementation-tracking.spec.ts` lines 1007–1015) does not assert `expect(change.isImplementationTrackingActive).toBe(false)`.
4. Direct unit test for `resolveUpdateImplementationTrackingDeps(resolver)` in `packages/core/test/composition/use-cases/update-implementation-tracking.spec.ts`.
5. Dedicated unit test file for `sameTrackedFile` under `packages/core/test/domain/services/` (currently tested indirectly through `update-implementation-tracking.spec.ts`).

---

## 2. `cli:change-implementation`

### Requirements Summary

- Exposes `specd changes implementation` with subcommands `list`, `add`, `resolve`, `unresolve`, `ignore`, `remove`, `review`, `start`.
- Repeatable/variadic `--file` and `--symbol` collect whole strings without splitting on commas or trimming, using the shared `collect` helper.
- Passes `--file`, `--symbol`, and `--spec` raw to `UpdateImplementationTracking`; `list` and `review` delegate to `sdk:build-implementation-review` via `enrichImplementationTracking` with no CLI fallback.
- Text `list` prints one file name per line; JSON/TOON outputs preserve arrays.

### Implementation Status

- **Implemented** in:
  - [`implementation.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/implementation.ts#L35-L383)
  - [`collect.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/helpers/collect.ts#L8-L10)

### Discrepancies

None.

### Test Coverage

- [`change-implementation.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-implementation.spec.ts#L27-L584): Covers all 8 subcommands in `--help`, structured output help schemas, `review` stale/out-of-scope/removed rendering, `add` missing file & raw `specId`, `resolve` repeated & variadic `--file` and comma names, `ignore` comma names & `f3.ts,f4.ts` whole-name error, `unresolve` repeated `--file` + comma names, `ignore` surrounding spaces untouched, `list` line-per-file text & JSON array, `remove` raw `--symbol "A.b,c"`, `start` idempotency & JSON/text output.
- [`change-implementation-tracking.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-implementation-tracking.spec.ts#L38-L149): Covers `enrichImplementationTracking` calling `buildImplementationReview` once and preserving health/links.
- [`change-implementation-review-integration.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-implementation-review-integration.spec.ts#L24-L51): Covers end-to-end immutable SDK projection across `list`, `review`, and `status`.

### Missing Tests

1. `resolve` and `unresolve` CLI error handling for `ImplementationFileNotFoundError` (e.g., multi-file `resolve` aborting when one file is missing).
2. `add` with multiple `--symbol` flags or a comma-containing `--symbol` value.
3. `list` with `--format toon` (only `--format json` and `text` are asserted in `change-implementation.spec.ts`).

---

## 3. `cli:graph-index`

### Requirements Summary

- Signature: `specd graph index [--force] [--exclude-path <pattern>...] [--config <path> | --path <path>] [--format text|json|toon]`.
- `--exclude-path` accepts repeatable or listed whole gitignore patterns without comma splitting.
- Delegates exclusively to `runIsolatedGraphIndex` from `@specd/sdk` with `storageRoot`, packaged `graph-index-task.js` URL, serializable `forced`/`discovered`/`bootstrap` context descriptor, and text-only `onProgress`/`onEvent`.
- No direct `@specd/code-graph` dependency or lock/process/env-bypass (`SPECD_GRAPH_INDEX_WORKER`/`NO_WORKER`) in CLI.
- Renders text summary, size-skip summary & `graph.largeFilePaths` YAML snippet (capped at 10, gitignore-escaped), `sizeExemptAnalysed`, workspace overlap warning (capped at 10), worker diagnostics (`worker-silent`, `GraphIndexWorkerError` causes), resolution `diagnostics` as warnings, forced rebuild metadata, and exit codes (`0` success/per-file errors, `1` flag validation, `3` worker/infra/lock failure).
- Full `## graph` documentation in `docs/cli/cli-reference.md`.

### Implementation Status

- **Implemented** in:
  - [`index-graph.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts#L28-L383)
  - [`graph-index-task.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/graph-index-task.ts#L75-L113)
  - [`resolve-graph-cli-context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/resolve-graph-cli-context.ts#L35-L93)
  - [`package.json`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/package.json#L25-L43)
  - [`cli-reference.md`](file:///Users/monki/Documents/Proyectos/specd/docs/cli/cli-reference.md#L1232-L1390)

### Discrepancies

None.

### Test Coverage

- [`graph-index.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts#L93-L620): Covers forced/discovered/bootstrap descriptors, progress/event callbacks (text vs json/toon), `--exclude-path` repeated/listed/brace-glob `{a,b}/**`, size-skip section & 10-item cap, `sizeExemptAnalysed`, workspace overlap warning & 10-item cap, resolution diagnostics, `worker-silent` & `GraphIndexWorkerError` rendering (text/json/toon), exit codes 0/1/3, and static checks for no bypasses, no `@specd/code-graph` dep, and no config writes.
- [`graph-index-task.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/graph-index-task.spec.ts#L25-L222): Covers `forced`, `discovered`, discovery failure propagation, `bootstrap`, `file-activity` announcement thresholds, JSON serializability of events, and SDK boundary.
- [`escape-gitignore-pattern.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph/escape-gitignore-pattern.spec.ts#L8-L47): Covers `escapeGitignorePattern` and `toLargeFilePathsEntry`.
- [`graph-index-integration.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index-integration.spec.ts#L75-L161): Covers real isolated child execution in text/JSON/TOON, corrupted storage repair with `--force`, and lock contention.

### Missing Tests

1. Direct unit tests for `yamlScalar` quoting edge cases (e.g., paths with spaces, colons, or quotes in the `graph.largeFilePaths` YAML snippet).

---

## 4. `skills:workflow-automation`

### Requirements Summary

- Diagnostic Priority (`--format text` for status/transition/validation) and Data Extraction (`--format toon` preferred, `--format json` only when unavailable or explicitly requested).
- Spec read surface selection (`specs show` vs `specs context` vs `specs metadata`, never treating `specs metadata` as config/default context).
- On-demand outline retrieval (`specd specs outline <specPath> --artifact <artifactId>`).
- Repair Strategy (follow "Next Action"), Canonical Command References (plural groups), Command Necessity and Freshness, Structural Validation and Content Review (`changes validate` inline diff + `spec-preview` fallback/merged review).
- Implementation traceability policy: explicit `resolve`/`ignore` before archive, one whole file name per `--file` value (repeated or listed), never comma-joined.
- Context optimization policy (`llmOptimizedContext` delegation to optimizer subagents or inline fallback).

### Implementation Status

- **Implemented** in:
  - [`shared.md.tpl`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/shared/shared.md.tpl#L43-L390)
  - [`specd-implement/SKILL.md.tpl`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/skills/specd-implement/SKILL.md.tpl#L180-L201)
  - [`specd-archive/SKILL.md.tpl`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/skills/specd-archive/SKILL.md.tpl#L95-L134)
  - [`specd-fasttrack/SKILL.md.tpl`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl)
  - Optimizer templates (`specd-project-context-optimizer`, `specd-spec-context-optimizer`).

### Discrepancies

None.

### Test Coverage

- [`template-workflow.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/template-workflow.spec.ts#L12-L147): Covers fasttrack rules, removed metadata commands, optimizer agent templates, `show`/`context`/`metadata` roles in `shared.md.tpl`, archive metadata/optimization separation, prohibition of comma-joined `--file`/`--spec`/`--add`/`--add-spec` across all templates, and `ignore` preserving confirmed links.

### Missing Tests

1. Assertions in `packages/skills/test/template-workflow.spec.ts` verifying `specd specs outline <specPath> --artifact <artifactId>` and `specd changes spec-preview <name> <specId> --diff --artifact <artifactId>` guidance in `shared.md.tpl`.
