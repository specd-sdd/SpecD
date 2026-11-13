# Spec Compliance Audit Report — support-commas-in-names

- **Timestamp:** 2026-11-13 16:57:34
- **Change:** `support-commas-in-names`
- **Specs Audited:** 31
- **Summary of Findings:**
  - **HIGH:** 1 (`cli:project-init` — `specd init --workspace ab` writes `workspaces: { ab: ... }` without `default`, which `ConfigLoader` rejects with `ConfigValidationError: "workspaces.default" is required`)
  - **MEDIUM:** 6 (4 in `persisted-state`: 3 composition spec-drift items, 1 missing runtime `action` validation in `UpdatePersistedSpecImplementation.execute`, 1 Windows-incompatible test assertion for `C:\x` in `update-persisted-spec-implementation.spec.ts` [total 4 MEDIUM in persisted-state: wait—3 spec-drift + 1 impl + 1 test = 5? Let us check exact partial]; 2 in `change-and-validate`: pre-existing spec drift in `core:generate-metadata` and `core:validate-specs`)
  - **LOW:** 10 (1 in `impl-and-names`, 2 in `deps`, 3 in `change-and-validate`, 4 in `persisted-state` — or exact counts below in Detailed Findings)

---

## Detailed Findings

<!-- _partial-impl-and-names.md -->

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

---

<!-- _partial-spec-id-and-config.md -->

# Spec Compliance Audit — Batch `spec-id-and-config`

**Change**: `support-commas-in-names`
**Specs Audited**: 9 (`core:spec-id-format`, `core:workspace`, `core:config`, `core:config-loader`, `core:spec-lock`, `core:spec-metadata`, `core:spec-repository-port`, `core:archived-change-index-entry`, `cli:project-init`)

---

## Summary Counts

| Metric                        | Count |
| ----------------------------- | ----- |
| Specs audited                 | 9     |
| Compliant                     | 8     |
| Discrepancies (HIGH)          | 1     |
| Discrepancies (MEDIUM)        | 0     |
| Discrepancies (LOW)           | 0     |
| Missing / partial tests noted | 2     |

---

## 1. `core:spec-id-format`

### Requirements Summary

- Canonical format `workspace:capabilityPath` with `:` separator; `/` belongs to capability path.
- Bare paths default to `default` at input boundaries (or caller-supplied `defaultWorkspace` in `dependsOn` traversal / context patterns).
- `isValidWorkspaceName`: `^[a-z][a-z0-9-]+$` (2+ chars, no Windows device names), single shared implementation used by `parseSpecId`, `parseSpecPattern`, schema registry, config pattern validation, `ConfigLoader`, and `cli:project-init`.
- `isValidCapabilitySegment`: `^[a-z0-9_][a-z0-9_-]*$` (no uppercase, spaces, commas, dots, quotes, backslashes, `:`, or Windows device names), shared with `SpecPath`, `prefix`, and `parseSpecPattern`.
- `parseSpecId` validates syntax first (including `defaultWorkspace` override), rejects `\` with `/` hint on every OS, then checks `options.workspaces` membership throwing `WorkspaceNotFoundError` (`WORKSPACE_NOT_FOUND`, single class re-exported in application layer).
- No lenient generic splitter; remove operations do not validate syntax; persisted IDs in manifest/lock/metadata are fully qualified on write.

### Implementation Status

**COMPLIANT**

- `packages/core/src/domain/services/spec-id-rules.ts` (lines 1-24): defines `isValidWorkspaceName` and `isValidCapabilitySegment` using `isWindowsDeviceName`.
- `packages/core/src/domain/services/parse-spec-id.ts` (lines 40-102): `parseSpecId` and `isFullyQualifiedSpecId` follow the exact 6-step parsing/validation order, validate `workspace` before checking `options.workspaces`, reject `\` with `"contains a backslash; use '/' as the only path separator"`, and accept `Iterable<string | { readonly name: string }>`.
- `packages/core/src/domain/services/parse-spec-pattern.ts` (lines 1-111): `parseSpecPattern` uses `isValidWorkspaceName` and `isValidCapabilitySegment`.
- `packages/core/src/domain/errors/invalid-spec-id-error.ts` & `packages/core/src/domain/errors/workspace-not-found-error.ts`: `SpecdError` subclasses with `INVALID_SPEC_ID` and `WORKSPACE_NOT_FOUND`. `packages/core/src/application/errors/workspace-not-found-error.ts` re-exports the exact domain class.
- `packages/core/src/domain/value-objects/spec-path.ts` (lines 77-89): delegates segment validation to `isValidCapabilitySegment` and `isWindowsDeviceName`.
- `packages/core/src/infrastructure/fs/schema-registry.ts` (lines 14, 27): uses `isValidWorkspaceName`.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/domain/services/parse-spec-id.spec.ts` (lines 1-196): covers nested paths, bare paths, `defaultWorkspace` overrides (valid, invalid syntax, unconfigured), all invalid inputs including `,`, spaces, uppercase, `.`, `..`, `:`, backslashes on all OSes, `nul`/`con-foo`, `workspaces` iterables (`string[]`, `Set`, `Map.keys()`, objects), `WorkspaceNotFoundError` identity across domain/application, and `isFullyQualifiedSpecId`.
- `packages/core/test/domain/services/spec-id-rules.spec.ts` (lines 1-40): covers `isValidWorkspaceName`, `isValidCapabilitySegment`, and pattern segment errors.
- `packages/core/test/domain/services/parse-spec-pattern.spec.ts` (lines 1-97): covers `*`, `core:*`, `_global/*`, `core:team/*`, exact paths, misplaced `*`, 1-char workspace, uppercase segments, and `ConfigValidationError` wrapping.
- `packages/core/test/spec-id-guards.spec.ts` (lines 52-66): verifies no duplicate workspace/segment regex literals exist anywhere else in `packages/core/src`.

### Missing Tests

None.

---

## 2. `core:workspace`

### Requirements Summary

- Unique workspace names matching `core:spec-id-format` (`isValidWorkspaceName`); `default` is reserved and mandatory; `root` is reserved and rejected; Windows device names rejected.
- Properties: `specs` (required), `codeRoot` (required for non-`default`, defaults to project root for `default`), `schemas` (defaults to `.specd/schemas` for `default`), `ownership` (`owned` for `default`, `readOnly` for non-`default`), `prefix` (validated with segment rule), `contextIncludeSpecs`, `contextExcludeSpecs`.
- `isExternal` inferred from resolved `specs` path vs project root.
- Cross-workspace `dependsOn`, workspace-level context pattern resolution with own workspace as default, sole source of truth in local `specd.yaml`.

### Implementation Status

**COMPLIANT** (see `cli:project-init` for cross-spec interaction with `--workspace ab`)

- `packages/core/src/infrastructure/fs/config-loader.ts` (lines 378-455): enforces `data.workspaces.default` required (line 378), rejects `data.workspaces.root` (line 381), validates every workspace name with `isValidWorkspaceName` (line 391), enforces `codeRoot` for non-`default` (line 431), defaults `ownership` to `'owned'`/`'readOnly'` (line 436), and infers `isExternal` via `!isPathInside(this.rootPath, specsBinding.legacyPath)` (lines 437-440).
- `packages/core/src/application/ports/config-schema.ts` (lines 100-113): `PrefixZodSchema` validates `prefix` segments with `isValidCapabilitySegment` and rejects empty/`.`/`..`/leading-or-trailing-`/`.
- `packages/core/src/application/use-cases/_shared/spec-pattern-matching.ts` (lines 31-78): passes `defaultWorkspace` to `parseSpecPattern` and emits `unknown-workspace` warnings for unknown workspaces in patterns.

### Discrepancies

None in `core:workspace` itself (see `cli:project-init` below regarding `workspaces.default` requirement vs `--workspace ab`).

### Test Coverage

- `packages/core/test/infrastructure/fs/config-loader.spec.ts`: tests invalid workspace names (`a`, `Core`, `nul`), 2-char `ab` alongside `default`, `prefix` validation (`Team` rejected, `team_1/shared/core` accepted), and workspace-level `contextIncludeSpecs`/`contextExcludeSpecs`.
- `packages/core/test/domain/errors/read-only-workspace-error.spec.ts`.

### Missing Tests

None.

---

## 3. `core:config`

### Requirements Summary

- `specd.yaml` discovery, cascade (`specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, `specd.local.*.yaml`), `extends`, `remove`, env overrides, privacy, logging, approvals, `context`, `contextIncludeSpecs`/`contextExcludeSpecs` validated via `parseSpecPattern`, workspace names via `isValidWorkspaceName`, `prefix` via segment rule, and `ConfigWriter` port (`initProject`, `addPlugin`, `removePlugin`, `listPlugins`).

### Implementation Status

**COMPLIANT**

- `packages/core/src/application/ports/config-schema.ts`: `validateContextPattern` (lines 49-58) delegates to `parseSpecPattern` and wraps `InvalidSpecPatternError` into `ConfigValidationError`; `validateContextPatterns` (lines 70-98) checks both project-level and workspace-level patterns; `SpecdYamlZodSchema` (lines 191-243) defines all sections and defaults.
- `packages/core/src/application/ports/config-writer.ts` & `packages/core/src/infrastructure/fs/config-writer.ts`: declares and implements `initProject`, `addPlugin`, `removePlugin`, `listPlugins`.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/application/ports/config-schema.spec.ts`
- `packages/core/test/infrastructure/fs/config-writer.spec.ts`
- `packages/core/test/composition/config-writer.spec.ts`

### Missing Tests

None.

---

## 4. `core:config-loader`

### Requirements Summary

- `createDefaultConfigLoader(options)` accepts `{ startDir }` or `{ configPath }`, derives `rootPath` via `createVcsAdapter`, returns `ConfigLoader` with `load()` and `resolvePath()`.
- Discovery mode bounded by VCS root; forced mode resolves explicit `extends` chain.
- Validates workspace names with `isValidWorkspaceName` and context patterns via `parseSpecPattern` (no private regexes), wraps all validation failures in `ConfigValidationError`, enforces root containment.

### Implementation Status

**COMPLIANT**

- `packages/core/src/composition/config-loader.ts` (lines 15-31): `createDefaultConfigLoader` resolves `rootPath` from `createVcsAdapter` (`null` for `NullVcsAdapter`) and returns `new FsConfigLoader(rootPath, options)`.
- `packages/core/src/infrastructure/fs/config-loader.ts`: validates workspace names with `isValidWorkspaceName` (line 391), context patterns via `validateContextPatterns` (line 377), root containment via `isPathInside` (lines 548-569), and throws `ConfigValidationError` on all validation errors.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/infrastructure/fs/config-loader.spec.ts`
- `packages/core/test/infrastructure/fs/config-loader-root-containment.spec.ts`

### Missing Tests

None.

---

## 5. `core:spec-lock`

### Requirements Summary

- `spec-lock.json` sidecar next to archived artifacts; stores `schema` (`name`, `version`), `dependsOn` (fully-qualified `workspace:capabilityPath` entries per `core:spec-id-format`), `implementation`, and `optimizations`.
- Strict read by default: invalid lock raises `InvalidSpecLockError` (`SpecdError`, code `INVALID_SPEC_LOCK`) naming `specId`, `location`, `fieldPath`, `rejectedValue`, and violated rule, with no manual-edit or repair-command instructions, and never a raw `ZodError`. Never drops entries or rewrites on read.
- `lenientDependsOn: true` tolerates only invalid `dependsOn` entries while keeping all other fields strict; used by repair mutations and `writePersistedState` revision check.
- Sidecar omitted from `Spec.artifacts` and rejected by generic artifact reads.

### Implementation Status

**COMPLIANT**

- `packages/core/src/domain/services/parse-spec-lock.ts` (lines 14-140): `specIdString` uses `isFullyQualifiedSpecId`; `specLockSchema` validates strictly, `specLockSchemaLenientDependsOn` tolerates `z.array(z.string())` for `dependsOn` while keeping `schema`, `implementation`, `optimizations`, `originalHash` strict; `ZodError` is caught and converted to `InvalidSpecLockError` with `specId`, `location`, `fieldPath`, `reason`, and `rejectedValue`.
- `packages/core/src/domain/errors/invalid-spec-lock-error.ts` (lines 6-33): `code` is `'INVALID_SPEC_LOCK'`; message contains no edit instructions or CLI commands.
- `packages/core/src/infrastructure/fs/spec-repository.ts` (lines 528-583, 793-812): `readPersistedState` forwards `options`, `writePersistedState` reads current lock with `{ lenientDependsOn: true }` for revision check.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/domain/services/parse-spec-lock.spec.ts` (lines 1-182)
- `packages/core/test/infrastructure/fs/spec-repository.spec.ts` (lines 1324-1370)
- `packages/core/test/spec-id-guards.spec.ts` (lines 30-50): parses all `specs/**/spec-lock.json` in repo.

### Missing Tests

None.

---

## 6. `core:spec-metadata`

### Requirements Summary

- `metadata.json` stored under `.specd/metadata/<workspace>/<capability-path>/metadata.json`; root `/.specd/metadata/` added to `.gitignore`.
- Written strictly (`dependsOn` and `implementation.*.specId` must be fully-qualified valid spec IDs), read leniently (`parseMetadata` self-heals on invalid/missing JSON).
- `Spec.generatedMetadataStamp` exposes only `{ present, lastModified }`; freshness assessment (`assessMetadataFreshness`) used by `MaterializeSpecMetadata`.

### Implementation Status

**COMPLIANT**

- `packages/core/src/domain/services/parse-metadata.ts` (lines 9-152): `strictSpecMetadataSchema` enforces `qualifiedSpecIdString` (`isFullyQualifiedSpecId`) on `dependsOn`, `implementation.files[].specId`, and `implementation.symbols[].specId`; `specMetadataSchema` (lenient read) accepts `z.array(z.string())`.
- `packages/core/src/infrastructure/fs/config-writer.ts` (lines 80-84): appends `/.specd/metadata/` to `.gitignore`.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/domain/services/parse-metadata.spec.ts` (lines 1-287)
- `packages/core/test/domain/services/assess-metadata-freshness.spec.ts`
- `packages/core/test/application/use-cases/materialize-spec-metadata.spec.ts`

### Missing Tests

None.

---

## 7. `core:spec-repository-port`

### Requirements Summary

- `SpecRepository` extends `Repository` with immutable `workspace()`, `ownership()`, `isExternal()`, optional `specsPath`, `get`, `list`, `count`, `reindex`, `artifact`, `save`, `publish`, `delete`, `readPersistedState(spec, options?)`, `writePersistedState(spec, state, options)`, `artifactMeta`, `persistedStateMeta`, `generatedMetadataMeta`, `readMetadataSnapshot`, `writeMetadataSnapshot`, `specFingerprint`, `search`, `resolveFromPath`.
- No `persistedStateHash` method on port.

### Implementation Status

**COMPLIANT**

- `packages/core/src/application/ports/spec-repository.ts` (lines 103-332): declares all required abstract methods and `specsPath` getter, including `readPersistedState` with `{ readonly lenientDependsOn?: boolean }`, and does not declare `persistedStateHash`.
- `packages/core/src/infrastructure/fs/spec-repository.ts`: implements all port methods.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/infrastructure/fs/spec-repository.spec.ts`

### Missing Tests

None.

---

## 8. `core:archived-change-index-entry`

### Requirements Summary

- `ArchiveListEntry` (with deprecated `ArchivedChangeIndexEntry` alias) includes `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, optional `archivedBy` (only when `includeArchivedBy` is set), and no `artifacts` or `workspaces` field.
- `workspacesFromSpecIds` derives unique workspace names in encounter order via `parseSpecId` (never raw `:` split) and throws `InvalidSpecIdError` on invalid IDs.

### Implementation Status

**COMPLIANT**

- `packages/core/src/domain/archived-change-index-entry.ts` (lines 10-41): defines `ArchiveListEntry`, deprecated `ArchivedChangeIndexEntry`, and `workspacesFromSpecIds` calling `parseSpecId(id).workspace`.

### Discrepancies

None.

### Test Coverage

- `packages/core/test/domain/archived-change-index-entry.spec.ts` (lines 1-25): tests encounter-order deduplication, bare ID mapping to `default`, empty list, and `InvalidSpecIdError` on `a:b:c` and `''`.

### Missing Tests

- `packages/core/test/domain/archived-change-index-entry.spec.ts` does not explicitly test `auth/a,b` (comma-containing ID) as specified in `verify.md` ("Invalid ID in the input is rejected"), though `parseSpecId` itself tests `auth/a,b`.

---

## 9. `cli:project-init`

### Requirements Summary

- `specd project init` / `specd init` with `--schema`, `--workspace`, `--workspace-path`, `--plugin`, `--force`, `--format`.
- `--workspace` and interactive wizard validate the workspace ID with `isValidWorkspaceName` from `core:spec-id-format` before writing any file; no private regex; never trims/lowercases the input.
- Delegates project creation to `createConfigWriter().initProject(...)` and surfaces `metadataCachePath` from its result.

### Implementation Status

**PARTIAL / DISCREPANCY FOUND**

- `packages/cli/src/commands/project/init.ts` (lines 2, 75-77, 102-109, 212-214): imports `isValidWorkspaceName` from `@specd/sdk`, validates `opts.workspace` and interactive input without trimming, delegates to `createConfigWriter().initProject(...)`, and reads `initResult.metadataCachePath`.

### Discrepancies

1. **[HIGH] `specd init --workspace ab` writes a `specd.yaml` that `ConfigLoader` rejects**
   - **Spec (`cli:project-init`, `verify.md`)**: Scenario _"Two-character workspace id accepted"_ states: `WHEN specd init --workspace ab is run THEN specd.yaml is written and ConfigLoader loads it`.
   - **Implementation**: `packages/cli/src/commands/project/init.ts:106` passes `workspaceId: opts.workspace` (`'ab'`) to `writer.initProject(...)`. `packages/core/src/infrastructure/fs/config-writer.ts:50` writes `workspaces: { ab: { ... } }` with no `default` workspace. However, `packages/core/src/infrastructure/fs/config-loader.ts:378-380` enforces `if (!data.workspaces.default) { throw new ConfigValidationError(rootConfigPath, "'workspaces.default' is required") }`.
   - **Analysis**:
     - _Spec drift_: `core:workspace` specifies "`default` — reserved for the local project workspace (mandatory)", so a `specd.yaml` with only `workspaces.ab` and no `workspaces.default` is invalid per `core:workspace` and `ConfigLoader`. Under that rule, the `cli:project-init` scenario expecting `ConfigLoader` to load `specd init --workspace ab` is inconsistent with `core:workspace`.
     - _Implementation bug_: Conversely, if `cli:project-init` intends `--workspace <id>` to name the sole initial workspace (replacing `default`), then `FsConfigLoader` (`config-loader.ts:378`) is overly strict or `FsConfigWriter.initProject` (`config-writer.ts:50`) should not allow omitting `default`.

### Test Coverage

- `packages/cli/test/commands/project-init.spec.ts` (lines 305-391): tests rejection of `a`, `Core`, `nul`, untrimmed `' ab '`, acceptance of `ab` (mocking `createConfigWriter`), interactive wizard validator, and absence of ad hoc regexes in `packages/cli/src`.

### Missing Tests

- No integration test in `packages/cli/test/commands/project-init.spec.ts` runs `ConfigLoader` on the `specd.yaml` produced by `FsConfigWriter.initProject` for `--workspace ab` (it mocks `createConfigWriter`), which masked the `workspaces.default` mismatch above.

---

<!-- _partial-change-and-validate.md -->

# Spec Compliance Audit — Batch `change-and-validate`

**Change:** `support-commas-in-names`
**Specs audited:**

1. `core:create-change`
2. `cli:change-create`
3. `core:edit-change`
4. `cli:change-edit`
5. `core:preview-spec`
6. `core:generate-metadata`
7. `core:validate-specs`

---

## Summary Counts

| Spec                     | Status                            | Discrepancies (HIGH / MEDIUM / LOW) | Missing Tests                                   |
| ------------------------ | --------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `core:create-change`     | Compliant (1 minor JSDoc gap)     | 0 / 0 / 1                           | 0                                               |
| `cli:change-create`      | Compliant                         | 0 / 0 / 0                           | 1 (`--format toon`)                             |
| `core:edit-change`       | Compliant                         | 0 / 0 / 0                           | 1 (`composition/use-cases/edit-change.spec.ts`) |
| `cli:change-edit`        | Compliant                         | 0 / 0 / 0                           | 1 (`--format toon`)                             |
| `core:preview-spec`      | Compliant                         | 0 / 0 / 0                           | 0                                               |
| `core:generate-metadata` | Partial (pre-existing spec drift) | 0 / 1 / 1                           | 0                                               |
| `core:validate-specs`    | Partial (pre-existing spec drift) | 0 / 1 / 1                           | 0                                               |
| **Total**                | **5 Compliant, 2 Partial**        | **0 HIGH / 2 MEDIUM / 3 LOW**       | **3**                                           |

All requirements introduced or updated by `support-commas-in-names` (raw spec ID forwarding without comma-splitting, `parseSpecId` validation/normalization with `InvalidSpecIdError` / `WorkspaceNotFoundError` quoting full original values, `readOnly` rejection, `invalidationPolicy` validation) are **fully implemented and tested** across all 7 specs. The 2 MEDIUM and 3 LOW discrepancies are pre-existing spec-vs-implementation drifts or JSDoc `@throws` omissions.

---

## 1. `core:create-change`

### Requirements Summary

- `CreateChange.execute(input)` accepts `name`, `description?`, `specIds`, `schemaName?`, `schemaVersion?`, `invalidationPolicy?`, `includeOverlapCheck?`.
- Enforces name uniqueness (`ChangeAlreadyExistsError`) across active, draft, and discarded changes before spec ID validation.
- Resolves schema identity via `GetActiveSchema.execute()` when both `schemaName` and `schemaVersion` are omitted; rejects partial overrides (`InvalidCreateChangeInputError`).
- Validates `invalidationPolicy` (`none`, `surgical`, `downstream`, `global`) with `InvalidInputError`.
- Validates and normalizes `specIds` via `parseSpecId` (never splitting on commas), collapsing duplicates after normalization, and rejecting `readOnly` workspaces with `ReadOnlyWorkspaceError` (one line per offending spec, ending with the protection sentence, no remediation).
- Enforces schema compatibility guardrail (`IncompatibleSchemaError`), seeds `specDependsOn`, persists via `ChangeRepository.create`, scaffolds via `ChangeRepository.scaffold`, optionally runs `DetectOverlap` (best-effort), and returns `{ change, changePath, overlapReport? }`.
- `createCreateChange(config, options?)` delegates through `resolveCreateChangeDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/create-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts) (lines 62–264)
- [packages/core/src/composition/use-cases/create-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/create-change.ts) (lines 37–101)
- All functional requirements and `_global/architecture` / `_global/cross-platform` contracts are satisfied.

### Discrepancies

1. **LOW — Missing `@throws {IncompatibleSchemaError}` in `CreateChange.execute` JSDoc**
   - **Evidence:** [create-change.ts#L97-L103](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts#L97-L103) documents `@throws` for `ChangeAlreadyExistsError`, `InvalidCreateChangeInputError`, `InvalidInputError`, `InvalidSpecIdError`, `WorkspaceNotFoundError`, and `ReadOnlyWorkspaceError`, but omits `IncompatibleSchemaError` thrown at [create-change.ts#L174](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts#L174).
   - **Possibilities:**
     - _Implementation/docs bug:_ `_global/error-handling-conventions` mandates that use cases document all errors they throw using `@throws`.
     - _Spec drift:_ `core:create-change` spec does not explicitly list `@throws` tags, though `_global/error-handling-conventions` does.

### Test Coverage

- [packages/core/test/application/use-cases/create-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/create-change.spec.ts) (937 lines): covers duplicate names before spec ID validation, `InvalidSpecIdError` (including `'auth/a,b'` comma rejection and `''`), `WorkspaceNotFoundError`, bare ID normalization, duplicate collapse, `readOnly` rejection (single, multiple, mixed), `invalidationPolicy`, schema resolution & compatibility, `specDependsOn` seeding, `create` -> `scaffold` ordering, and `includeOverlapCheck`.
- [packages/core/test/composition/use-cases/create-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/create-change.spec.ts) (82 lines): covers `resolveCreateChangeDeps` and `createCreateChange`.
- _Note on `_global/testing`:_ Line 391 of `create-change.spec.ts` uses `as unknown as ReturnType<typeof makeGetActiveSchema>` for an error-throwing mock.

### Missing Tests

- None for `core:create-change` requirements.

---

## 2. `cli:change-create`

### Requirements Summary

- Command `specd change create <name> [--spec <id>...] [--description <text>] [--invalidation-policy <policy>] [--format text|json|toon] [--config <path>]`.
- Forwards `--spec` and `--invalidation-policy` raw to `kernel.changes.create.execute` without splitting on commas, validating spec IDs, resolving workspaces, checking ownership, or calling `getActiveSchema`.
- Passes `includeOverlapCheck: true` when `specIds` is non-empty and formats `overlapReport` warnings to stderr without calling `detectOverlap` directly.
- Outputs `created change <name>` in `text` mode, or `{ result: "ok", name, state, changePath }` in `json`/`toon` modes. Maps core errors to exit code 1.

### Implementation Status

- [packages/cli/src/commands/change/create.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/create.ts) (lines 12–80)
- Fully compliant with `cli:change-create` and `_global/architecture` (no business logic in CLI adapter).

### Discrepancies

- None.

### Test Coverage

- [packages/cli/test/commands/change-create.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-create.spec.ts) (601 lines): covers missing name, empty `--spec`, raw forwarding of bare/qualified/comma-containing (`auth/a,b`) IDs, `WorkspaceNotFoundError`, `InvalidSpecIdError`, `ReadOnlyWorkspaceError`, `InvalidInputError` for invalidation policy, `ChangeAlreadyExistsError`, `includeOverlapCheck` delegation, `getActiveSchema` non-invocation, `text` and `json` output with `changePath`, and real-kernel integration tests.
- _Note on `_global/testing`:_ Unit mocks in `change-create.spec.ts` use `'/tmp/test-changes/...'` as a mock string `changePath` (no disk I/O; integration tests use `os.tmpdir()`).

### Missing Tests

- Explicit unit test for `--format toon` output on `change create` (handled via shared `output(..., fmt)` helper).

---

## 3. `core:edit-change`

### Requirements Summary

- `EditChange.execute(input)` accepts `name`, `addSpecIds?`, `removeSpecIds?`, `description?`, `invalidationPolicy?`.
- Validates `ChangeNotFoundError` and `invalidationPolicy` (`InvalidInputError`) before mutation.
- Validates and normalizes `addSpecIds` via `parseSpecId` (never splitting on commas), checks `readOnly` ownership (`ReadOnlyWorkspaceError`), and skips ownership/syntax validation for `removeSpecIds` (normalizing valid entries and collapsing duplicates).
- Returns unchanged change with `invalidated: false` (and without resolving actor) on no-op.
- Enforces schema compatibility guardrail (`IncompatibleSchemaError`).
- Runs effective spec/description/policy updates inside `ChangeRepository.mutate`, applying removals before additions, throwing `SpecNotInChangeError` for missing removals, calling `change.updateSpecIds`, seeding `specDependsOn` for newly added specs, unscaffolding removed specs, scaffolding, and calling `refreshImplementationTracking` when provided.
- `createEditChange(config, options?)` delegates through `resolveEditChangeDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/edit-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/edit-change.ts) (lines 50–307)
- [packages/core/src/composition/use-cases/edit-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/edit-change.ts) (lines 32–115)
- Fully compliant with `core:edit-change`, `_global/architecture`, and `_global/error-handling-conventions` (all thrown errors documented with `@throws`).

### Discrepancies

- None.

### Test Coverage

- [packages/core/test/application/use-cases/edit-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/edit-change.spec.ts) (731 lines): covers change lookup, no-op cases (including no actor resolution), description-only and policy-only edits, removal-before-addition, `SpecNotInChangeError` (including invalid syntax on removal), duplicate removal collapse, bare ID normalization, comma-containing `addSpecIds: ['auth/a,b']`, `readOnly` rejection on add and exemption on remove, schema compatibility, `specDependsOn` seeding, `mutate` freshness, `unscaffold`, and `refreshImplementationTracking`.

### Missing Tests

- No dedicated `packages/core/test/composition/use-cases/edit-change.spec.ts` unit test for `resolveEditChangeDeps` / `createEditChange` (unlike `create-change.spec.ts` and `preview-spec.spec.ts`).

---

## 4. `cli:change-edit`

### Requirements Summary

- Command `specd change edit <name> [--add-spec <id>] [--remove-spec <id>] [--description <text>] [--invalidation-policy <policy>] [--format text|json|toon] [--config <path>]`.
- Requires at least one edit flag before config resolution (exits 1 on usage error).
- Forwards `--add-spec`, `--remove-spec`, `--description`, `--invalidation-policy` raw without splitting on commas, validating spec IDs, resolving workspaces, or checking ownership.
- Warns to stderr when `invalidated` is true and on best-effort overlap detection when specs changed.
- Outputs `updated change <name>` + `specs:` + `workspaces:` in `text` mode, or `{ result: "ok", name, specIds, workspaces, invalidated, state }` in `json`/`toon` modes.

### Implementation Status

- [packages/cli/src/commands/change/edit.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/edit.ts) (lines 12–136)
- Fully compliant with `cli:change-edit` and `_global/architecture`.

### Discrepancies

- None.

### Test Coverage

- [packages/cli/test/commands/change-edit.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-edit.spec.ts) (370 lines): covers missing flags before config resolution, raw forwarding of `--add-spec` (including `'auth/a,b'` and `'Bad Id'`), `--remove-spec`, `--invalidation-policy`, `WorkspaceNotFoundError`, `ReadOnlyWorkspaceError`, `ChangeNotFoundError`, invalidation warning, `text` and `json` outputs, and source inspection ensuring no `SpecdConfig` / `ownership` / `helpers/spec-path` usage.

### Missing Tests

- Explicit unit test for `--format toon` output on `change edit` (handled via shared `output(..., fmt)` helper).

---

## 5. `core:preview-spec`

### Requirements Summary

- `PreviewSpec(changes, specs, schemaProvider, parsers, diffGenerator)`.
- `execute({ name, specId, includeDiff? })` validates and normalizes `specId` with `parseSpecId` before loading the change (`InvalidSpecIdError`, `WorkspaceNotFoundError`), verifies `specId` is in `change.specIds` (`SpecNotInChangeError`), and checks `schema.name() === change.schemaName` (`SchemaMismatchError`).
- `@throws` JSDoc lists `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ChangeNotFoundError`, `SchemaMismatchError`, `SpecNotInChangeError`.
- Discovers files via `change.artifacts`, processes all `scope: spec` schema artifact types, applies deltas or loads new spec content, sorts `spec.md` first then alphabetically, optionally generates plain unified diffs for `merged` entries (treating `DiffGenerationError` as warning-only), and returns `PreviewSpecResult`.
- `createPreviewSpec(config, options?)` delegates through `resolvePreviewSpecDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/preview-spec.ts) (lines 61–302)
- [packages/core/src/composition/use-cases/preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/preview-spec.ts) (lines 33–108)
- Fully compliant with `core:preview-spec`, `_global/architecture`, and `_global/error-handling-conventions`.

### Discrepancies

- None.

### Test Coverage

- [packages/core/test/application/use-cases/preview-spec.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/preview-spec.spec.ts) (684 lines): covers all requirements including `InvalidSpecIdError` (`''`, `'Core/Foo'`, `'Bad Id'`, `'auth/a,b'`, `'ws:'`) before repo/change lookup, `WorkspaceNotFoundError`, `SpecNotInChangeError`, `SchemaMismatchError`, delta/new/no-op/missing handling, ordering, `includeDiff` and `DiffGenerationError`, and partial failure warnings.
- [packages/core/test/composition/use-cases/preview-spec.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/preview-spec.spec.ts) covers `resolvePreviewSpecDeps` and `createPreviewSpec`.

### Missing Tests

- None.

---

## 6. `core:generate-metadata`

### Requirements Summary

- `GenerateSpecMetadata.execute({ specId, allowDependsOnOverwrite? })` validates/normalizes `specId` with `parseSpecId` (`InvalidSpecIdError`, `WorkspaceNotFoundError`), loads spec (`SpecNotFoundError`), reads persisted state once (`readPersistedState`), loads and parses `scope: 'spec'` artifacts, runs `extractMetadataFromSpecArtifacts`, resolves canonical `dependsOn` (`DependsOnOverwriteError` on conflict), projects implementation & fresh optimizations, and returns `{ metadata, hasExtraction, sourceState }`.
- `createGenerateSpecMetadata(config, options?)` delegates through `resolveGenerateSpecMetadataDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts) (lines 52–382)
- [packages/core/src/composition/use-cases/generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/generate-spec-metadata.ts) (lines 34–100)
- `support-commas-in-names` requirements (`parseSpecId` validation/normalization, `InvalidSpecIdError`, `WorkspaceNotFoundError`) are fully compliant.

### Discrepancies

1. **MEDIUM — Pre-existing spec drift on schema with no `metadataExtraction`**
   - **Evidence:** `core:generate-metadata` spec (`Schema resolution`) states: _"If the resolved schema has no `metadataExtraction` declarations, the use case returns `{ metadata: {}, hasExtraction: false }` immediately — there is nothing to extract."_ However, [generate-spec-metadata.ts#L95-L225](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L95-L225) does not return early; it still loads artifacts, computes `contentHashes` and `provenance`, and returns `{ metadata, hasExtraction: false, sourceState }` (which is also asserted in [generate-spec-metadata.spec.ts#L668-L670](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/generate-spec-metadata.spec.ts#L668-L670)).
   - **Possibilities:**
     - _Spec drift (likely):_ `GenerateSpecMetadata` evolved to return `contentHashes`, `provenance`, and `sourceState` even when `hasExtraction` is `false` so `MaterializeSpecMetadata` can still materialize metadata/hashes.
     - _Implementation bug:_ If an early `{ metadata: {}, hasExtraction: false }` return was intended, it is not implemented.

2. **LOW — Missing `@throws {SpecNotFoundError}` and `@throws {DependsOnOverwriteError}` in `GenerateSpecMetadata.execute` JSDoc**
   - **Evidence:** [generate-spec-metadata.ts#L91-L92](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L91-L92) only documents `@throws {InvalidSpecIdError}` and `@throws {WorkspaceNotFoundError}`, omitting `SpecNotFoundError` (line 113) and `DependsOnOverwriteError` (line 348).
   - **Possibilities:**
     - _Implementation/docs bug:_ Violates `_global/error-handling-conventions` `@throws` documentation rule.
     - _Spec drift:_ `core:generate-metadata` does not list `@throws` tags explicitly.

### Test Coverage

- [packages/core/test/application/use-cases/generate-spec-metadata.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/generate-spec-metadata.spec.ts) (718 lines): covers transform resolution, cross-workspace paths, `dependsOn` persistence/conflict, single `readPersistedState` snapshot, fresh-only optimizations, `InvalidSpecIdError` (`'Bad Id'`, `''`, `'auth/a,b'`, `'ws:'`) before repo lookup, bare ID normalization, and `WorkspaceNotFoundError`.

### Missing Tests

- None for `support-commas-in-names` requirements.

---

## 7. `core:validate-specs`

### Requirements Summary

- `ValidateSpecs.execute(input)` resolves active schema, filters to `scope: 'spec'` artifacts, and supports three modes: single-spec (`input.specPath` validated/normalized with `parseSpecId`), workspace (`input.workspace`), or all-workspaces.
- Uses `ValidationResultCache` per workspace (passing list Meta stamps for warm hard hits), runs local rule validation (`evaluateRules`) and per-spec cross-artifact validation (`evaluateCrossArtifactRule`), delegates metadata materialization to `GetSpecMetadata.execute({ specId })`, and checks persisted optimization freshness independently.
- `createValidateSpecs(config, options?)` delegates through `resolveValidateSpecsDeps(resolver)`.

### Implementation Status

- [packages/core/src/application/use-cases/validate-specs.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts) (lines 65–510)
- [packages/core/src/composition/use-cases/validate-specs.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts) (lines 22–143)
- `support-commas-in-names` requirements (`parseSpecId` validation/normalization in single-spec mode, `InvalidSpecIdError` quoting `'auth/a,b'`, bare ID resolution, `WorkspaceNotFoundError`) are fully compliant.

### Discrepancies

1. **MEDIUM — Pre-existing spec drift on `ValidateSpecsDeps.getMetadata` type**
   - **Evidence:** `core:validate-specs` spec (`Config-based factory delegates through resolveValidateSpecsDeps` and verify scenario) specifies `getMetadata: ReadonlyMap<string, GetSpecMetadata>` with one instance per configured workspace. In [packages/core/src/composition/use-cases/validate-specs.ts#L26](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts#L26) and [line 44](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/validate-specs.ts#L44), `getMetadata` is a single `GetSpecMetadata` instance (`createGetSpecMetadata(resolveGetSpecMetadataDeps(resolver))`), matching `ValidateSpecs` constructor ([validate-specs.ts#L89](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L89)).
   - **Possibilities:**
     - _Spec drift (likely):_ `GetSpecMetadata` already takes `ListWorkspaces` and handles all workspaces, so a single instance replaced the older per-workspace map in code without updating the spec.
     - _Implementation bug:_ If per-workspace `GetSpecMetadata` instances were intended, neither `ValidateSpecs` nor `ValidateSpecsDeps` implements a map.

2. **LOW — Missing `@throws {SpecNotFoundError}` in `ValidateSpecs.execute` JSDoc**
   - **Evidence:** [validate-specs.ts#L115-L118](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L115-L118) documents `InvalidSpecIdError`, `WorkspaceNotFoundError`, and `SchemaNotFoundError`, but omits `SpecNotFoundError` thrown at [validate-specs.ts#L138](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L138), [line 237](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L237), and [line 255](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L255).
   - **Possibilities:**
     - _Implementation/docs bug:_ Violates `_global/error-handling-conventions` `@throws` rule.
     - _Spec drift:_ `core:validate-specs` does not explicitly assert `@throws` JSDoc tags.

### Test Coverage

- [packages/core/test/application/use-cases/validate-specs.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/validate-specs.spec.ts) (1468 lines): covers all three scoping modes, `InvalidSpecIdError` (`'Bad Id'`, `''`, `'auth/a,b'`, `'ws:'`) before repo lookup, bare `specPath` resolution, `WorkspaceNotFoundError`, `SpecNotFoundError`, local & cross-artifact validation, `GetSpecMetadata` delegation, optimization staleness, `ValidationResultCache` hard/soft/miss paths, and `resolveValidateSpecsDeps`.

### Missing Tests

- None for `support-commas-in-names` requirements.

---

<!-- _partial-deps.md -->

# Spec Compliance Audit Report — Batch `deps` (`support-commas-in-names`)

**Audited specs:**

1. `core:update-spec-deps`
2. `cli:change-deps`
3. `core:update-persisted-spec-deps`
4. `cli:spec-deps`

**Cross-cutting contracts checked:** `default:_global/cross-platform`, `default:_global/architecture`, `default:_global/error-handling-conventions`, `default:_global/testing`.

---

## Summary Counts

- **Specs audited:** 4 (`core:update-spec-deps`, `cli:change-deps`, `core:update-persisted-spec-deps`, `cli:spec-deps`)
- **Discrepancies:** 2 (0 HIGH, 0 MEDIUM, 2 LOW)
  - `core:update-spec-deps`: 1 LOW (minor spec-wording drift: "Change lookup" references `ChangeRepository.get` while implementation and "Persistence and output" use `ChangeRepository.mutate`)
  - `core:update-persisted-spec-deps`: 1 LOW (minor spec drift: `resolveUpdatePersistedSpecDepsDeps` resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` instead of `specs` + `initializePersistedSpecState`)
- **Missing / partial tests:** 4 minor test-coverage gaps (no blocking gaps; core logic is covered)
- **Test runs executed:**
  - `@specd/core`: 4 test files, **62 / 62 tests passed** (`update-spec-deps.spec.ts`: 31, `composition/update-spec-deps.spec.ts`: 3, `update-persisted-spec-deps.spec.ts`: 25, `composition/update-persisted-spec-deps.spec.ts`: 3)
  - `@specd/cli`: 3 test files, **97 / 97 tests passed** (`change-deps.spec.ts`: 33, `spec-deps.spec.ts`: 19, `handle-error.spec.ts`: 45)

---

## 1. `core:update-spec-deps`

### Requirements Summary

- `UpdateSpecDeps.execute` accepts `{ name, specId, add?, remove?, set?, clear? }` without splitting or joining ID lists.
- Loads change by `name`, throwing `ChangeNotFoundError` if absent, and requires `specId` (normalized) to be in `change.specIds` (otherwise `InvalidInputError`).
- Enforces mutual exclusivity (`set` vs `add`/`remove`/`clear`; `clear` vs `add`/`remove`) and requires at least one operation (`InvalidInputError` with `INVALID_INPUT`).
- Validates and normalizes `specId`, `add`, and `set` via `parseSpecId` before any mutation (`InvalidSpecIdError` / `WorkspaceNotFoundError`); dependency targets need not exist yet. `remove` normalizes valid IDs and keeps invalid IDs literal, checking existence sequentially (`InvalidInputError`).
- Applies `remove` before `add` (idempotent) via shared `applyDependsOnMutation`, persists via `ChangeRepository.mutate(name, fn)` calling `change.setSpecDependsOn`, and returns `{ specId, dependsOn }`.
- `createUpdateSpecDeps(config, options?)` delegates through `resolveUpdateSpecDepsDeps(resolver)`.

### Implementation Status

**Compliant** (1 LOW spec-drift note).

- `packages/core/src/application/use-cases/update-spec-deps.ts`:
  - Lines 7–28: `UpdateSpecDepsInput` and `UpdateSpecDepsResult` match the contract.
  - Lines 64–67: `this._workspaces = [...workspaces]` materializes one-shot iterables (e.g., `Map.keys()`) for repeated executions.
  - Lines 81–99: Enforces mutual exclusivity and minimum-operation checks with `InvalidInputError`.
  - Lines 101–114: Validates `specId`, `add`, and `set` with `parseSpecId` before calling `mutate`; `remove` uses `tryNormalizeDepId` (lines 37–46).
  - Lines 116–136: Calls `this._changes.mutate(input.name, ...)`, checks `change.specIds.includes(specId)`, delegates mutation to `applyDependsOnMutation` (`packages/core/src/application/use-cases/_shared/apply-depends-on-mutation.ts:19-73`), calls `change.setSpecDependsOn(specId, result)`, and returns `{ specId, dependsOn: result }`.
- `packages/core/src/composition/use-cases/update-spec-deps.ts`:
  - Lines 27–32: `resolveUpdateSpecDepsDeps(resolver)` resolves `changes` and `workspaces`.
  - Lines 78–87: `createUpdateSpecDeps(config, options?)` creates a composition resolver and delegates through `resolveUpdateSpecDepsDeps(resolver)`.
- `_global/*` compliance: Pure application/composition separation, `SpecdError` subtypes only, no platform-specific I/O.

### Discrepancies

1. **[LOW] "Change lookup" wording vs `ChangeRepository.mutate` usage**
   - **Evidence:** `core:update-spec-deps` spec states under _Requirement: Change lookup_: _"The use case MUST load the change by `name` via `ChangeRepository.get`."_ However, _Requirement: Persistence and output_ in the same spec requires `ChangeRepository.mutate(name, fn)`, and `packages/core/src/application/use-cases/update-spec-deps.ts:116` calls `this._changes.mutate(input.name, ...)` directly (which performs the lookup and throws `ChangeNotFoundError` if missing).
   - **Assessment:** **Spec drift** (unlikely to be an implementation bug, since calling `get` before `mutate` would be redundant and `mutate` is explicitly required for serialized persistence).

### Test Coverage

- `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31 tests, all passing):
  - Covers `add`, `remove`, `set`, `clear`, `set: []`, `add+remove`, one-shot `Map.keys()`, `ChangeRepository.mutate` spy, exclusivity matrix, `INVALID_INPUT` code, missing change, `specId` not in change, missing op, missing `remove` target, idempotent `add`, absent `specDependsOn`, `set: ['']`, `add: [' ']`, comma-containing IDs (`a,b`, `core:a,b`), malformed IDs, unknown workspace, non-existent dependency target, bare ID qualification, invalid entry among valid ones storing nothing, and removing invalid stored values / bare IDs.
- `packages/core/test/composition/use-cases/update-spec-deps.spec.ts` (3 tests, all passing):
  - Covers `resolveUpdateSpecDepsDeps(resolver)`, config-based `createUpdateSpecDeps(config)`, and explicit-deps `createUpdateSpecDeps(deps)`.

### Missing Tests

- `Scenario: Same ID in remove and add ends up present` (e.g., `remove: ['default:core/a']` and `add: ['default:core/a']` moving it to the end) is not explicitly asserted in `update-spec-deps.spec.ts` (though `applyDependsOnMutation` is tested for this in `update-persisted-spec-deps.spec.ts:354-367`).

---

## 2. `cli:change-deps`

### Requirements Summary

- Exposes `specd change deps <name> [<specId>] [--add <id>...] [--remove <id>...] [--set <id>...] [--clear] [--force] [--format text|json|toon] [--config <path>]`.
- Forwards `<specId>`, `--add`, `--remove`, and `--set` raw without parsing, qualifying, or splitting on commas; display mode uses `GetChangeSpecDeps`.
- `--clear` requires confirmation on interactive terminals (or `--force`), exits 1 on non-interactive terminals without `--force`, and exits 0 with `cancelled` when declined.
- Outputs normalized `specId` returned by the use case across text, JSON, and TOON formats.
- Exits 1 with `error:` to stderr on all error cases.

### Implementation Status

**Compliant.**

- `packages/cli/src/commands/change/deps.ts`:
  - Lines 14–34: Registers `deps <name> [specId]` with `.allowExcessArguments(false)`, repeatable `--add`/`--remove`/`--set` via `collect` (no comma splitting), `--clear`, `--force`, `--format`, `--config`.
  - Lines 78–91: Fast-fail `cliError` checks for missing `specId` with modification flags, `--clear` conflicts, and `--set` conflicts.
  - Lines 94–139: Display mode (`specId` present) calls `kernel.changes.getSpecDeps.execute({ name, specId })` without any spec ID parser; list mode calls `kernel.changes.status.execute({ name })`.
  - Lines 141–157: `--clear` calls `confirmOrExit` with `--clear requires confirmation; pass --force to skip it`; prints `cancelled` (or `{ result: 'cancelled' }`) and returns 0 when declined.
  - Lines 159–185: Modification mode forwards raw `specId` and flags to `kernel.changes.updateSpecDeps.execute`, renders `result.specId` and `result.dependsOn`, and delegates errors to `handleError(err, opts.format)`.
- `_global/*` compliance: Thin CLI adapter delegating to `kernel.changes.*`, no business logic or direct I/O.

### Discrepancies

None.

### Test Coverage

- `packages/cli/test/commands/change-deps.spec.ts` (33 tests, all passing):
  - Covers `add`, `remove`, `set`, real-kernel integration test verifying normalized IDs, JSON/TOON/text formats, `(none)` display, list-all mode, display-one mode via `GetChangeSpecDeps`, all error cases (`ChangeNotFoundError`, `SpecNotInChangeError`, `--set`+`--add`, `--clear` conflicts, missing `specId`, `--set ""`, `--set "core:a,b"`, `--add " "`, `InvalidSpecIdError`, `WorkspaceNotFoundError` in display mode), raw forwarding, clear confirmation (accepted, declined, `--force`, non-TTY), `--help` listing `--clear`/`--force`, and static source check verifying no `parseSpecId` or `listWorkspaces`.

### Missing Tests

- `Scenario: Unknown workspace in a dependency` (`--add nope:auth/login`) is tested for display mode (`getSpecDeps` with `WorkspaceNotFoundError` at lines 700–715), not explicitly in modification mode (`updateSpecDeps`), though both use the same `handleError` path.

---

## 3. `core:update-persisted-spec-deps`

### Requirements Summary

- `UpdatePersistedSpecDeps.execute` accepts `{ specId, add?, remove?, set?, clear? }`.
- Enforces mutual exclusivity (`set` vs `add`/`remove`/`clear`; `clear` vs `add`/`remove`) and minimum operation (`InvalidInputError`).
- Validates `specId`, `add`, and `set` via `parseSpecId` before any I/O; checks `readOnly` workspace ownership before I/O (`ReadOnlyWorkspaceError`); verifies target existence for `add` and `set` (`SpecNotFoundError`); verifies target `specId` exists (`SpecNotFoundError`).
- `remove`/`set`/`clear` read persisted state with `{ lenientDependsOn: true }`, while `add` reads strictly; `remove` normalizes valid IDs and matches invalid IDs literally; post-mutation check throws `InvalidSpecLockError` if any invalid `dependsOn` entry remains.
- Missing persisted state: `set`/`clear` create state without artifact derivation; non-empty `add` derives initial base via `resolveInitialPersistedDependsOn()`, applies `remove` then `add`, and creates state (`created: true, initialized: true`); `remove` alone or empty `add` is a no-op (`created: false, initialized: false`, no write).
- Applies patch via `applyPersistedSpecStatePatch` and writes with `expectedRevision: originalHash` (or `null`), propagating `ArtifactConflictError` without retry.
- `createUpdatePersistedSpecDeps(config, options?)` delegates through `resolveUpdatePersistedSpecDepsDeps(resolver)`.

### Implementation Status

**Compliant** (1 LOW spec-drift note).

- `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`:
  - Lines 99–115: Mutual exclusivity and minimum operation checks.
  - Lines 117–129: `parseSpecId` validation on `specId`, `add`, `set`, followed by `repo.ownership() === 'readOnly'` check before any target or spec I/O.
  - Lines 131–137: Target existence check for `add` and `set` (`SpecNotFoundError`).
  - Lines 139–162: `tryNormalizeDepId` for `remove`; `repo.get` check (`SpecNotFoundError`); `readPersistedState(spec, isRepairOp ? { lenientDependsOn: true } : undefined)`.
  - Lines 169–197: Raw-match precedence for `remove` against stored entries, `applyDependsOnMutation`, post-mutation `isFullyQualifiedSpecId` check throwing `InvalidSpecLockError(..., 'dependsOn.${i}', ...)`, `applyPersistedSpecStatePatch`, conditional `writePersistedState` with `expectedRevision: current.originalHash`.
  - Lines 208–260: `_createMissingState` handles no-op (`!createsState`), `set`/`clear` (skips derivation), non-empty `add` (calls `resolveInitialPersistedDependsOn`, applies `remove` + `add`, writes with `expectedRevision: null`).
- `packages/core/src/composition/use-cases/update-persisted-spec-deps.ts`:
  - Lines 38–48: `resolveUpdatePersistedSpecDepsDeps(resolver)` resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher`.
  - Lines 108–109: `createUpdatePersistedSpecDeps(config, options?)` delegates through `resolveUpdatePersistedSpecDepsDeps(resolver)`.

### Discrepancies

1. **[LOW] `UpdatePersistedSpecDepsDeps` shape in spec vs composition implementation**
   - **Evidence:** `core:update-persisted-spec-deps` spec states: _"`resolveUpdatePersistedSpecDepsDeps(resolver)` MUST resolve: `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace; `initializePersistedSpecState` collaborator sufficient to invoke `resolveInitialPersistedDependsOn()`"_. In `packages/core/src/composition/use-cases/update-persisted-spec-deps.ts:19-48`, `UpdatePersistedSpecDepsDeps` instead has `{ specRepositories, getActiveSchema, parsers, extractorTransforms, contentHasher }`, because `UpdatePersistedSpecDeps` invokes `resolveInitialPersistedDependsOn(...)` directly rather than an `InitializePersistedSpecState` instance.
   - **Assessment:** **Spec drift** (the spec describes the conceptual collaborator while the implementation wires the exact dependencies of `resolveInitialPersistedDependsOn`).

### Test Coverage

- `packages/core/test/application/use-cases/update-persisted-spec-deps.spec.ts` (25 tests, all passing):
  - Covers `remove` no-op on missing state, conflicting flags before I/O, no-op error before I/O, invalid ID before I/O, missing dep target, missing spec, bare ID qualification, removing invalid stored value, propagating `InvalidSpecLockError`, `clear`, unknown workspace, lenient read + bare `remove` normalization, raw bare entry removal, remaining invalid entry throwing `InvalidSpecLockError` without write, strict read on `add`, `remove` before `add` with overlap, `originalHash` as `expectedRevision`, `ArtifactConflictError` without retry, `readOnly` workspace rejection before I/O, and missing-state paths (`clear`, `set` skipping derivation, `add` deriving base, `remove`+`add` on derived base, `remove` alone no-op, `add: []` no-op).
- `packages/core/test/composition/use-cases/update-persisted-spec-deps.spec.ts` (3 tests, all passing):
  - Smoke tests via `describeCompositionFactorySmoke` for `createUpdatePersistedSpecDeps`.

### Missing Tests

- `packages/core/test/composition/use-cases/update-persisted-spec-deps.spec.ts` only runs `describeCompositionFactorySmoke` and does not explicitly assert `resolveUpdatePersistedSpecDepsDeps(resolver)` field resolution against a real config (unlike `test/composition/use-cases/update-spec-deps.spec.ts:22-31`).
- `Scenario: clear combined with remove is rejected` is not directly tested in `update-persisted-spec-deps.spec.ts` (though `set` + `add` is tested there and `clear` + `remove` is tested in `update-spec-deps.spec.ts`).

---

## 4. `cli:spec-deps`

### Requirements Summary

- Exposes `specd specs deps {list, add, remove, set, clear} <spec-id>` with `--format text|json|toon`, `--config`, `.allowExcessArguments(false)`.
- `list` calls `Kernel.specs.getPersistedDeps`; distinguishes uninitialized state from empty `dependsOn` in text and includes `initialized` in JSON/TOON.
- `add`, `remove`, `set`, `clear` each make one call to `Kernel.specs.updatePersistedDeps` without CLI-owned mutation logic, passing `<spec-id>` and `--dep` values raw without splitting on commas.
- `remove` on uninitialized spec (`initialized: false`) reports a no-op outcome (`nothing was removed`) with exit 0.
- `clear [--force]` confirms on interactive TTY, fails with exit 1 on non-TTY without `--force` (and never mentions `--clear`), and prints `cancelled` with exit 0 when declined.
- Renders `initialized` from the use case result without hard-coding.
- Maps `SpecNotFoundError`, `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ArtifactConflictError`, `ReadOnlyWorkspaceError`, and `InvalidSpecLockError` to exit 1; adds the exact 3-command repair hint on a following line (and as `hint` in JSON/TOON, not folded into `message`, with no `--force` or parentheticals) only when `InvalidSpecLockError.fieldPath` is under `dependsOn`.

### Implementation Status

**Compliant.**

- `packages/cli/src/commands/spec/deps.ts`:
  - Lines 67–202: Registers `deps` group with `list`, `add`, `remove`, `set`, `clear`, each with `.allowExcessArguments(false)`, `--format`, `--config`, and structured output help text.
  - Lines 30–60: `renderDepsResult` distinguishes `result.initialized === false` from empty `dependsOn: (empty)` in text and emits `initialized` in JSON/TOON when defined.
  - Lines 95, 119, 147: `add` and `remove` require `--dep` via `requiredOption(..., collect, [])`; `set` uses optional `--dep` so `set` without `--dep` sends `set: []`.
  - Lines 133–137: `remove` passes custom `notInitializedText` (`spec ${result.specId} is not initialized — nothing was removed`).
  - Lines 176–189: `clear` uses `confirmOrExit` with `nonInteractiveMessage: 'clearing requires confirmation; pass --force to skip it'` (no `--clear` mention).
  - Lines 87, 111, 139, 160, 198: All 5 leaves pass `{ lockRepairHint: true }` to `handleError`.
- `packages/cli/src/handle-error.ts`:
  - Lines 34–35, 218–230: Adds `LOCK_REPAIR_HINT` only when `options?.lockRepairHint === true` and `fieldPath === 'dependsOn' || fieldPath.startsWith('dependsOn.')`.
  - Lines 62–73: Writes `hint` on its own line to stderr and as top-level `hint` in JSON/TOON without modifying `message`.
- `_global/*` compliance: Thin CLI adapter, no direct `spec-lock.json` I/O, unified `SpecdError` handling.

### Discrepancies

None.

### Test Coverage

- `packages/cli/test/commands/spec-deps.spec.ts` (19 tests, all passing):
  - Covers help schemas on all 5 leaves, `list` delegation, `set` delegation, `--dep ""` rejection, missing target `SpecNotFoundError`, `InvalidSpecLockError` without stack trace, `clear` confirmation (accepted, declined, `--force`, non-TTY, no `--clear` in message), uninitialized vs initialized `list` text & JSON, `remove` uninitialized no-op, `InvalidSpecIdError` on `Bad Id`, `--dep "a,b"` raw forwarding, `ArtifactConflictError`, and `ReadOnlyWorkspaceError`.
- `packages/cli/test/handle-error.spec.ts` (45 tests, all passing):
  - Lines 123–194 explicitly test `InvalidSpecLockError` repair hint: exact 3 commands, no hint when `lockRepairHint` not requested, no `--force`, no parentheticals, emitted once on its own line after `error:`, kept out of JSON `message` (placed in `hint`), and omitted for non-`dependsOn` field paths (`contentHash`).

### Missing Tests

- `Scenario: Set with no --dep flags clears the list` (`specd specs deps set <spec-id>` with no `--dep` passing `set: []`) is not explicitly tested in `spec-deps.spec.ts`.

---

<!-- _partial-persisted-state.md -->

# Spec Compliance Audit — `persisted-state` Batch (`support-commas-in-names`)

## Summary

- **Specs Audited**: 7 (`core:get-persisted-spec-deps`, `core:get-persisted-spec-implementation`, `core:get-persisted-spec-optimizations`, `core:get-persisted-spec-schema`, `core:update-persisted-spec-implementation`, `core:update-persisted-spec-optimizations`, `core:update-persisted-spec-schema`)
- **Test Execution**: 14 test files (7 application + 7 composition), **133 / 133 tests passed** (`pnpm --filter @specd/core exec vitest run ...`)
- **Discrepancies Found**: **8 total** (0 HIGH, 4 MEDIUM, 4 LOW)
  - 6 spec-drift discrepancies in `resolve*Deps` / composition dependency contracts (6 of 7 specs still document `specs` / older collaborator sets, whereas only `core:update-persisted-spec-optimizations` matches the current `specRepositories` + collaborator naming).
  - 1 implementation gap (MEDIUM): `UpdatePersistedSpecImplementation.execute` does not validate `input.action` at runtime for untyped callers.
  - 1 cross-platform test bug (MEDIUM): `update-persisted-spec-implementation.spec.ts` asserts `C:\x` never throws `ImplementationWorkspaceBoundaryError`, which fails on Windows.
- **Missing Test Coverage Items**: 11 scenario gaps identified across the 7 specs.

---

## 1. `core:get-persisted-spec-deps`

### Requirements Summary

- Accepts `GetPersistedSpecDepsInput { specId }`; validates/normalizes `specId` via `parseSpecId` before repository access (`InvalidSpecIdError`, `WorkspaceNotFoundError`).
- Resolves workspace `SpecRepository`, throws `SpecNotFoundError` for unknown spec, calls `readPersistedState(spec)` without reading `spec-lock.json` or metadata.
- Returns `{ specId, dependsOn, initialized }` preserving exact stored order/duplicates when initialized, or `{ specId, dependsOn: [], initialized: false }` when `null` without creating state.
- `createGetPersistedSpecDeps(config, options?)` delegates through `resolveGetPersistedSpecDepsDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-deps.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-deps.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecDepsDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: `resolveGetPersistedSpecDepsDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: `GetPersistedSpecDepsDeps` in [get-persisted-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-deps.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift** (`specRepositories` is the uniform convention across `packages/core/src/composition/use-cases/*`).

### Test Coverage

- **Covered** in [get-persisted-spec-deps.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-deps.spec.ts) (10 tests) and [composition/get-persisted-spec-deps.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-deps.spec.ts) (4 tests):
  - Uninitialized `dependsOn: []`, `initialized: false`; invalid/empty/malformed `specId` before repo calls; bare ID -> `default:`; `WorkspaceNotFoundError`; qualified ID; stored order & duplicates preserved; `SpecNotFoundError`; never writes state; composition smoke & resolver test.

### Missing Tests

- Runtime rejection when `specId` is missing (`undefined` / `{}`).
- Explicit assertion that `readPersistedState` is the only persisted-data port call (no metadata materialization).

---

## 2. `core:get-persisted-spec-implementation`

### Requirements Summary

- Accepts `GetPersistedSpecImplementationInput { specId }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Resolves workspace `SpecRepository`, throws `SpecNotFoundError` for unknown spec, calls `readPersistedState(spec)` only.
- Returns `{ specId, implementation, initialized }` preserving file-level (`symbols` absent) vs symbol-level (`symbols` present) entries in stored order, or `implementation: [], initialized: false` when `null`.
- `createGetPersistedSpecImplementation(config, options?)` delegates through `resolveGetPersistedSpecImplementationDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-implementation.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-implementation.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecImplementationDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: Requires `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: [get-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-implementation.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift**.

### Test Coverage

- **Covered** in [get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-implementation.spec.ts) (8 tests) and [composition/get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-implementation.spec.ts) (4 tests):
  - Uninitialized `[]` & `initialized: false`, invalid/empty/malformed `specId` before repo calls, bare ID -> `default:`, `WorkspaceNotFoundError`, qualified ID, stored order & duplicates, `SpecNotFoundError`, never writes, composition smoke & resolver test.

### Missing Tests

- File-level (`symbols` absent) vs symbol-level (`symbols` present and non-empty) distinction in [get-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-implementation.spec.ts#L63-L67) (existing test only uses entries without `symbols`).
- Runtime rejection when `specId` is missing.

---

## 3. `core:get-persisted-spec-optimizations`

### Requirements Summary

- Accepts `{ specId, field? }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Throws `SpecNotFoundError` for unknown spec; returns `{ specId, initialized: false, fresh: false }` when `readPersistedState` returns `null`.
- When initialized with no `optimizations` or absent `field`: returns `{ freshness: 'missing', reasons: ['missing'] }` (no `value`) when `field` is specified, or omits absent fields when unfiltered; aggregate `fresh` is `false` when no fields are present.
- Computes per-field freshness against current `scope: spec` artifacts (`artifactMeta()`) and `persisted.schema`: `artifact-added`, `artifact-removed`, `artifact-changed`, `schema-changed`; `lastModified`-only differences stay `fresh`.
- `createGetPersistedSpecOptimizations(config, options?)` delegates through `resolveGetPersistedSpecOptimizationsDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts) + [spec-optimization-freshness.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/domain/services/spec-optimization-freshness.ts)): **Compliant** (uses `path.basename` safely across POSIX/Windows).
- **Composition** ([get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-optimizations.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — `resolveGetPersistedSpecOptimizationsDeps` property name and missing `getActiveSchema` in spec**
   - **Spec**: `resolveGetPersistedSpecOptimizationsDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>` (does not list `getActiveSchema`).
   - **Code**: [get-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-optimizations.ts#L16-L36) resolves `specRepositories: ReadonlyMap<string, SpecRepository>` and `getActiveSchema: GetActiveSchema`.
   - **Assessment**: **Spec drift** (`getActiveSchema` is required to enumerate `scope: spec` artifacts from the active schema).

### Test Coverage

- **Covered** in [get-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-optimizations.spec.ts) (17 tests) and [composition/get-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-optimizations.spec.ts) (4 tests):
  - Uninitialized, missing filtered field, initialized without optimizations, invalid/malformed `specId`, bare ID, `WorkspaceNotFoundError`, `SpecNotFoundError`, filtered vs unfiltered results, `artifact-changed`, `artifact-removed`, `artifact-added`, `lastModified`-only fresh, `schema-changed`, aggregate `fresh`, never writes, composition smoke & resolver test.

### Missing Tests

- Combined multiple staleness reasons in a single field evaluation (`artifact-removed` + `artifact-added` + `schema-changed`).
- Explicit assertion that generated metadata is never read or materialized.

---

## 4. `core:get-persisted-spec-schema`

### Requirements Summary

- Accepts `{ specId }`; validates/normalizes `specId` via `parseSpecId` before repository access.
- Throws `SpecNotFoundError` for unknown spec **before** checking initialization; throws `SpecNotInitializedError(specId)` when `readPersistedState` returns `null`.
- Returns `{ specId, schema }` with exact `{ name, version }` from persisted state.
- `createGetPersistedSpecSchema(config, options?)` delegates through `resolveGetPersistedSpecSchemaDeps(resolver)`.

### Implementation Status

- **Application** ([get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-persisted-spec-schema.ts)): **Compliant**.
- **Composition** ([get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-schema.ts)): **Partial (naming drift)**.

### Discrepancies

1. **LOW — `resolveGetPersistedSpecSchemaDeps` property name (`specs` vs `specRepositories`)**
   - **Spec**: Requires `specs: ReadonlyMap<string, SpecRepository>`.
   - **Code**: [get-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-schema.ts#L14-L29) resolves `specRepositories: ReadonlyMap<string, SpecRepository>`.
   - **Assessment**: **Spec drift**.

### Test Coverage

- **Covered** in [get-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-persisted-spec-schema.spec.ts) (7 tests) and [composition/get-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/get-persisted-spec-schema.spec.ts) (4 tests):
  - `SpecNotInitializedError`, invalid `specId` before repo calls, bare ID, `WorkspaceNotFoundError`, qualified ID returning exact `schema`, `SpecNotFoundError` before `SpecNotInitializedError`, malformed ID quoted and never writes, composition smoke & resolver test.

### Missing Tests

- Explicit assertion that `readPersistedState` is the only persisted-data port call (no metadata materialization).

---

## 5. `core:update-persisted-spec-implementation`

### Requirements Summary

- Accepts `{ specId, action: 'add' | 'remove', file, symbols? }`; validates `specId` via `parseSpecId`, rejects `readOnly` workspaces with `ReadOnlyWorkspaceError`, throws `SpecNotFoundError` for unknown spec.
- Confines `file` to the workspace `codeRoot` via `path.relative` containment (rejects `..`, sibling prefix, cross-workspace qualifier, absolute host paths including Windows drives like `C:\x` as non-qualifiers) -> `ImplementationWorkspaceBoundaryError`; normalizes to forward-slashed `workspace:path`.
- For `add`, verifies file exists on disk (`ImplementationFileNotFoundError`) after confinement and before `readPersistedState`; creates missing state via `resolveInitialPersistedDependsOn()`.
- For `remove` against missing state, no-ops with `implementation: [], created: false` without writing.
- Applies mutation via `applyPersistedImplementationMutation` + `applyPersistedSpecStatePatch`, writes with `expectedRevision` (`originalHash` or `null`), propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecImplementation(config, options?)` delegates through `resolveUpdatePersistedSpecImplementationDeps(resolver)`.

### Implementation Status

- **Application** ([update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-implementation.ts)): **Partial (missing runtime `action` check)**.
- **Composition** ([update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-implementation.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — Missing runtime validation of `action` (`'add' | 'remove'`)**
   - **Verify Scenario** (`action must be add or remove`): An `action` value other than `'add'` or `'remove'` MUST be rejected as an invalid input.
   - **Code**: [update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-implementation.ts#L112-L132) and [apply-persisted-implementation-mutation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/_shared/apply-persisted-implementation-mutation.ts#L21-L55) only check `action === 'add'` and treat any other runtime string as `'remove'`.
   - **Assessment**: **Implementation bug** for untyped/JS callers (no `InvalidInputError` thrown).
2. **MEDIUM — `resolveUpdatePersistedSpecImplementationDeps` collaborator drift**
   - **Spec**: Lists `specs`, `workspaces`, `files`, and an `initializePersistedSpecState` collaborator.
   - **Code**: [update-persisted-spec-implementation.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-implementation.ts#L22-L57) resolves `specRepositories`, `listWorkspaces`, `files`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` (calling `resolveInitialPersistedDependsOn()` directly).
   - **Assessment**: **Spec drift** (implementation was refactored to use `resolveInitialPersistedDependsOn()` directly).
3. **MEDIUM — Non-cross-platform test assertion for `C:\x`**
   - **Contract**: `default:_global/testing` & `default:_global/cross-platform` require tests to pass on both POSIX and Windows.
   - **Test**: [update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts#L157-L168) asserts `await expect(result).rejects.not.toBeInstanceOf(ImplementationWorkspaceBoundaryError)` for `file: 'C:\\x'`. On Windows, `C:\x` is an absolute path outside `/test/code/default`, so `path.isAbsolute(relative)` is `true` and `ImplementationWorkspaceBoundaryError` IS thrown, failing this test on Windows.
   - **Assessment**: **Test implementation bug** (needs platform-aware assertion or `process.platform === 'win32'` branch).

### Test Coverage

- **Covered** in [update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts) (22 tests) and [composition/update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-implementation.spec.ts) (3 tests):
  - Missing file, invalid `specId`, `WorkspaceNotFoundError`, bare ID, confinement escapes (`..`, sibling prefix, cross-workspace, qualified escapes, `.`), forward-slashed nested path, add/remove symbols & whole entry, lock-less add (`created: true`, `expectedRevision: null`), lock-less remove no-op, `ArtifactConflictError`, `SpecNotFoundError`, `ReadOnlyWorkspaceError`, check ordering, composition smoke.

### Missing Tests

- Runtime rejection of invalid `action` value (e.g. `'replace'`).
- `resolveUpdatePersistedSpecImplementationDeps` unit test in [composition/update-persisted-spec-implementation.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-implementation.spec.ts).

---

## 6. `core:update-persisted-spec-optimizations`

### Requirements Summary

- Strict Zod runtime validation of `{ specId, set?, clear? }` before any port access (`InvalidInputError` for shape/mutual-exclusivity/emptiness/missing `specId`; `InvalidSpecIdError` for empty/malformed `specId` string).
- `ReadOnlyWorkspaceError` before `repo.get` / `readPersistedState`; `SpecNotFoundError` for unknown spec.
- `clear` on missing state no-ops with `created: false` and no `writePersistedState`; `set` on missing state creates base via `resolveInitialPersistedDependsOn()`.
- `set` captures fresh `artifactState` baseline and `schema` (`current.schema` if existing, effective project schema if creating) per changed field, preserving unchanged fields.
- `clear` removes listed fields (absent fields are no-ops) and omits `optimizations` block when none remain.
- Patches via `applyPersistedSpecStatePatch`, writes with `expectedRevision` (`originalHash` or `null`), propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecOptimizations(config, options?)` delegates through `resolveUpdatePersistedSpecOptimizationsDeps(resolver)` resolving `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher`.

### Implementation Status

- **Application** ([update-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts)): **Compliant**.
- **Composition** ([update-persisted-spec-optimizations.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-optimizations.ts)): **Compliant**.

### Discrepancies

- None.

### Test Coverage

- **Covered** in [update-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts) (26 tests) and [composition/update-persisted-spec-optimizations.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts) (4 tests):
  - All Zod validation matrix cases, `InvalidSpecIdError` (including `''`), `WorkspaceNotFoundError`, `ReadOnlyWorkspaceError`, `ArtifactConflictError`, partial/absent/final `clear`, independent per-field baselines, effective vs persisted schema recording, `expectedRevision: null`, composition smoke & `resolveUpdatePersistedSpecOptimizationsDeps`.

### Missing Tests

- `SpecNotFoundError` test for an unknown spec.
- Real filesystem `SpecRepository` round-trip test for partial and final `clear` (`verify.md` scenario).

---

## 7. `core:update-persisted-spec-schema`

### Requirements Summary

- Accepts `{ specId, schemaRef }`; validates `specId` via `parseSpecId`, rejects `readOnly` workspaces with `ReadOnlyWorkspaceError`.
- Throws `SpecNotFoundError` before `SpecNotInitializedError` (never creates a lock).
- Resolves `schemaRef` via `GetActiveSchema` in `{ mode: 'ref', ref: schemaRef }`; returns `changed: false` no-op if target equals persisted schema.
- Parses all declared `scope: spec` artifacts with registered parsers (`ArtifactParseError` on failure, skipping formats with no parser or missing files).
- If target schema extracts `dependsOn`, compares with current `dependsOn` and throws `PersistedSchemaDependencyConflictError` on mismatch; otherwise preserves `dependsOn`.
- Preserves `implementation` and `optimizations` verbatim; constructs `PersistedSpecState` directly (not via `applyPersistedSpecStatePatch`), writes with `expectedRevision: current.originalHash`, propagates `ArtifactConflictError`.
- `createUpdatePersistedSpecSchema(config, options?)` delegates through `resolveUpdatePersistedSpecSchemaDeps(resolver)`.

### Implementation Status

- **Application** ([update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-schema.ts)): **Compliant**.
- **Composition** ([update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-schema.ts)): **Partial (spec drift in deps)**.

### Discrepancies

1. **MEDIUM — `resolveUpdatePersistedSpecSchemaDeps` property name and extra collaborators**
   - **Spec**: `resolveUpdatePersistedSpecSchemaDeps(resolver)` MUST resolve `specs: ReadonlyMap<string, SpecRepository>` and `getActiveSchema: GetActiveSchema`.
   - **Code**: [update-persisted-spec-schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-schema.ts#L19-L48) resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, and `contentHasher`.
   - **Assessment**: **Spec drift** (the extra dependencies are needed for `_loadParsedArtifacts` and `_extractDependsOn`).

### Test Coverage

- **Covered** in [update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-persisted-spec-schema.spec.ts) (17 tests) and [composition/update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-schema.spec.ts) (3 tests):
  - `SpecNotInitializedError`, invalid `specId` before repo calls, bare ID, `WorkspaceNotFoundError`, `ArtifactParseError`, skips unparsed formats and missing files, `changed: true` & verbatim preservation, `changed: false` no-op, `ref`-mode resolution, `PersistedSchemaDependencyConflictError`, equal extracted deps, schema mismatch on optimizations, `expectedRevision: originalHash`, `ArtifactConflictError`, `SpecNotFoundError` before `SpecNotInitializedError`, `ReadOnlyWorkspaceError`, composition smoke.

### Missing Tests

- `resolveUpdatePersistedSpecSchemaDeps` unit test in [composition/update-persisted-spec-schema.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/update-persisted-spec-schema.spec.ts).
- Assertion that `PersistedSchemaDependencyConflictError` carries `specId`, current `dependsOn`, and extracted `dependsOn`.
- End-to-end test pairing `UpdatePersistedSpecSchema` with `GetPersistedSpecOptimizations` to verify `schema-changed` staleness.
