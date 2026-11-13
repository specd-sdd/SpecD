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
