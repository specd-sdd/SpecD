# Spec compliance partial — core Windows paths

Change: `windows-platform-compatibility`
Scope: requirements added or modified by this change in the listed core specs (spec deltas + verify deltas). Pre-existing requirements that this change did not touch are out of scope.
Graph: `specd graph search` / `specd graph impact` located `isPathInside`, `normalizeVcsRoot`, `retryOnLock`, `toPortablePath`, `normalizeNewlines`, `isWindowsDeviceName`, and their callers. The index reported `CONTENT_KNOWN_STALE` for the skills workspace only; core symbols resolved.

Known-excluded gaps come from `design.md` (“Coverage notes from the third audit stay out of the task list”): drive-letter `load()` and archive cases already decided by `isPathInside`; no `realpath` spy; no byte-equality success tests; the private empty-string return versus `null` is not observable; `EPERM`/`EACCES` share `LOCK_CODES` with the tested `EBUSY` path. They are still listed as missing tests and tagged `known-excluded`.

---

## core:config-loader

### Requirements Summary

Modified and added requirements:

1. **Storage path containment** (modified). When `rootPath` is non-null, `changes`, `drafts`, `discarded`, and `archive` must be the root or inside it. Inside means the relative path is empty, or it does not start with `..` and is not absolute. Drive-letter case must not look outside. A `root + separator` prefix must not be the test. An outside path must throw `ConfigValidationError` naming the storage key. When `rootPath` is null, containment does not apply. `rootPath` must be the normalized VCS adapter root, not raw CLI stdout.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Outside `specsPath` means external. Null `rootPath` forces `isExternal` false.
3. **Config file stays inside the repository root** (added). The resolved config file uses the same inside-root rule. Separator mismatch and drive-letter case must not reject an inside file. An outside file throws `ConfigValidationError`.

The spec-dependency edit points `rootPath` at `core:vcs-adapter` normalization. That matches `createDefaultConfigLoader`, which passes `vcsAdapter.rootDir()` and passes `null` for `NullVcsAdapter`.

Verify scenarios added: drive-letter storage accepted; longer storage prefix rejected; specs inside the root are not external; git-style separators accept an inside config; a config outside the root is rejected.

### Implementation Status

`FsConfigLoader._buildConfig` calls `isPathInside` for the config file (`rootConfigPath`), the resolved config directory, and each fs storage `legacyPath`. `isExternal` is `!isPathInside(rootPath, specsBinding.legacyPath)` when `rootPath` is non-null. `isPathInside` resolves with `path.win32` for drive-letter paths, uppercases the drive letter, and uses `path.win32.relative`, so `C:/repo` contains `c:/repo/specd.yaml` and does not contain `C:/repository`. Null `rootPath` skips the block. The loader does not read VCS stdout itself.

### Discrepancies (both sides)

**Non-fs storage paths and workspaces skip the inside-root check.**

- Spec: every resolved storage path, and every workspace `specsPath`, must be judged with the inside-root rule whenever `rootPath` is non-null. The rewritten text does not limit that to the `fs` adapter.
- Code: storage confinement runs only when `binding.binding.adapter === 'fs'`. `isExternal` is computed only when the specs adapter is `fs`; every other workspace is forced to `isExternal: false`.
- Spec may be ahead of the adapter model. Non-fs bindings use virtual paths, and a filesystem inside-root test on those paths may be meaningless. The Windows edit replaced the separator-prefix test; it did not discuss non-fs bindings. The fs-only guard was already how the loader behaved before this rewrite.
- Code may be wrong if a non-fs workspace or storage path can still resolve to a real directory outside the repository. Those paths are accepted, and the workspace is never external.
- This is not a drive-letter bug in `isPathInside`. It is a coverage hole in who the rewritten MUST applies to.

### Test Coverage

- Config file outside `C:/repo` throws `ConfigValidationError` matching `config file resolves outside VCS root` (`config-loader-root-containment.spec.ts`).
- Config `C:/repo/specd.yaml` with root `C:\repo` loads (`config-loader-root-containment.spec.ts`). That successful load also walks relative storage paths under the mocked Windows `path.resolve`, so an inside relative storage tree is accepted, but the scenario’s explicit `C:/repo/changes` versus `c:/repo` pair is not asserted.
- Older loader tests still reject a storage path outside a real temp root and set `isExternal` from real directories. They do not use mixed drive-letter case.
- `createDefaultConfigLoader` is the wiring for “normalized adapter root, not raw stdout”. No test in this set asserts that `load()` refuses a raw `c:/repo` stdout string that `rootDir()` would have uppercased; the adapter tests cover normalization before the loader sees the value.

### Missing Tests

- Drive-letter storage acceptance (`rootPath` `c:/repo`, storage `C:/repo/changes`). **known-excluded** (drive-letter `load()` already decided by `isPathInside`).
- Longer storage prefix `C:/repository/changes` throws for that storage key. **known-excluded** (same).
- `isExternal` false when root is `C:/repo` and `specsPath` is `c:/repo/specs`. **known-excluded** (same).

### Summary counts

- Requirements: 3
- Discrepancies: 1
- Missing tests: 3

---

## core:vcs-adapter

### Requirements Summary

**Built-in adapters normalize repository roots** (added).

Git, Mercurial, and Subversion adapters from `createVcsAdapter` must normalize the root before caching it and before `rootDir()` returns it. Normalization must produce an absolute path, uppercase a Windows drive letter, and must not `realpath` the root. The normalized value must stay a valid working directory for a later CLI call of that VCS. `NullVcsAdapter.rootDir()` must still throw and must not invent a root. Modified-file paths from the three adapters must use `/` and must not collapse `.` or `..`. On Windows, spawns of `git`, `hg`, and `svn` must hide the console window.

### Implementation Status

`GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` pass constructor roots and sync stdout through `normalizeVcsRoot`. That trims, resolves with `path.win32` when the value has a drive letter or a backslash, and uppercases the drive letter. It does not call `realpath`. `modifiedFiles` runs later commands with `this.rootDir()` as `cwd`. Paths go through `toPortablePath`, which only replaces `\` with `/`. `NullVcsAdapter.rootDir()` throws `no VCS detected`. `git`/`hg`/`svn` `execFile` and `execFileSync` use `spawnOptions`, which sets `windowsHide: true` only when `platform === 'win32'`.

### Discrepancies (both sides)

None. The normalized string is what later CLI calls use as `cwd`. Hiding the console is implemented on the spawn options those calls pass, not only on an unused helper.

### Test Coverage

- Git stdout `c:/repo` returns `C:\repo`. Hg and svn stdout `c:\repo` return `C:\repo`.
- Cached POSIX `/repo` is returned without a sync CLI call.
- Null `rootDir()` throws `no VCS detected`.
- Git, hg, and svn each return `src/../secret` for a backslash `src\..\secret` status path.
- `spawnOptions(..., 'win32')` is `{ cwd, windowsHide: true }` for all three tools, and Linux omits `windowsHide`.

### Missing Tests

- No test shows a follow-up `git`/`hg`/`svn` invocation whose `cwd` is the uppercased root after stdout was `c:/repo` or `c:\repo`. The “valid working directory for a later CLI call” clause is implemented (`modifiedFiles` / `ref` call `this.rootDir()`) and is not asserted. Not known-excluded.
- No spy asserts `realpath` is not called. The unit test title says “without calling realpath” and only checks the returned string. **known-excluded** (no `realpath` spy).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:content-hasher-port

### Requirements Summary

1. **Text newline normalization** (added). `ContentHasher.hash` and the shared text `sha256` helper must turn every `\r\n` and every remaining `\r` into `\n` before the digest. Every string is text. There is no binary string mode. Artifact hashes are a different contract: pre-hash cleanup collapses whitespace, so an artifact hash is not required to preserve line endings. Callers that hash raw file bytes must not send those bytes through the text helper.
2. **Determinism** (modified). The same input must hash the same after that normalization. Inputs that match once `\r\n` and `\r` become `\n` must return identical results.

### Implementation Status

`normalizeNewlines` replaces `\r\n` first, then remaining `\r`. `sha256` and `NodeContentHasher.hash` both digest `normalizeNewlines(content)` as UTF-8. Neither branches on binary strings. `computeArtifactHash` normalizes newlines after pre-hash cleanup and then calls `hashContent` (which normalizes again). That second pass is idempotent. `sha256` accepts a string, so raw `Buffer` bytes are not the helper’s input type.

### Discrepancies (both sides)

None. Artifact hashes are allowed to lose line-ending differences. `computeArtifactHash` normalizing before `hashContent` does not contradict that, and it is not `hashFiles`.

### Test Coverage

`hash-newlines.spec.ts` hashes `alpha\r\nbeta\r` and `alpha\nbeta\n` through `sha256` and `NodeContentHasher` and expects one digest. The mixed string fails if either CRLF or a lone CR is left in place. The same pair is equal through `computeArtifactHash` with `sha256`. An LF-only vector keeps the previous digest.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 2
- Discrepancies: 0
- Missing tests: 0

---

## core:snapshot-hasher

### Requirements Summary

**Determinism** (modified). The same text always hashes the same after the injected `hashContent` runs. `hashFiles` must forward each string unchanged. It must not detect a binary string and must not rewrite newlines. Newline normalization belongs to the text hasher from `core:content-hasher-port`. Raw file bytes are not strings and must not be passed through `hashFiles`.

The dependency section now cites that newline contract. `hashFiles` imports neither the hasher nor `normalizeNewlines`.

### Implementation Status

`hashFiles` assigns `result[filePath] = hashContent(content)` for each entry. It does not inspect or rewrite `content`.

### Discrepancies (both sides)

None. Equal CRLF and LF digests are the injected hasher’s job. Forwarding is what this requirement demands of `hashFiles`.

### Test Coverage

`hash-files.spec.ts` spies `hashContent` and expects the same `line\r\nline` string it was given.

### Missing Tests

- Scenario “Text file CRLF matches LF”: nothing calls `hashFiles` twice, once with `\r\n` and once with `\n`, and asserts equal digests. Equality is tested on `sha256` / `NodeContentHasher` / `computeArtifactHash`, not on `hashFiles` plus a normalizing hasher. Not known-excluded.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:fs-change-repository

### Requirements Summary

**Windows path containment and rename recovery** (added).

Confinement must use the inside-root rule. Drive-letter case must not look outside. A directory move that fails with `EPERM` or `EXDEV` must fall back to copy. A rename onto an existing or locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` must be retried a bounded number of times and then surface the original error. Identical destination bytes must not be treated as success for change artifacts.

### Implementation Status

`_bucketKindForDir`, `_pruneEmptyParents`, and `isStrictlyInside` call `isPathInside`. Artifact paths go through `resolveConfinedPath`, which rejects `..` and then calls `isPathInside`. `moveDir` treats `EPERM` and `EXDEV` (and the older `ENOTEMPTY` / `EEXIST`) as a copy-then-remove. Lock-owner and manifest writes use `writeFileAtomic`, which renames through `retryOnLock`. That helper attempts the operation five times and rethrows the original `EPERM`, `EBUSY`, or `EACCES`. It never compares destination bytes. `saveArtifact` still uses `fs.writeFile` for artifact bodies; the retry requirement is on rename, and the byte-equality shortcut the requirement forbids is absent.

### Discrepancies (both sides)

None. Prefix containment for `C:/work/app` versus `C:/work/application` is `isPathInside` returning false, which `path-platform.spec.ts` asserts. There is no success path that treats matching destination bytes as a completed rename.

### Test Coverage

- `isPathInside('C:/work/app', 'C:/work/application')` is false. `resolveConfinedPath('C:/work/app', '../application')` throws `PathTraversalError`.
- `moveDir` copies on `EXDEV` and on `EPERM`.
- `writeFileAtomic` succeeds after one `EBUSY`, and after five `EBUSY` failures rejects with the same error object. `retryOnLock` asserts five attempts and the original error.

### Missing Tests

- No test that identical destination bytes are not success, and no test that differing destination bytes are not success. **known-excluded** (no byte-equality success tests).
- `EPERM` and `EACCES` are not driven through `retryOnLock` or `writeFileAtomic`. **known-excluded** (`EPERM`/`EACCES` share `LOCK_CODES` with tested `EBUSY`). `moveDir` does test `EPERM` as a copy fallback, which is a different clause and is covered.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:fs-spec-repository

### Requirements Summary

**Publication rename recovery** (added).

Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` must be retried a bounded number of times and then surface the original error. The temporary `.gitignore` equality check must treat `\r\n` and `\r` as `\n`. Identical normalized content counts as success for that file only. Differing artifact bytes must not count as success.

### Implementation Status

`publish` wraps the staging swap renames in `retryOnLock`. `publicationRenameError` returns the original error when its `code` is `EPERM`, `EBUSY`, or `EACCES`, so the `code` is preserved. `ensureTmpGitignore` compares `normalizeNewlines(existing)` with `normalizeNewlines` of the canonical `*\n!.gitignore\n` marker and returns without rewriting when they match. Publication does not compare artifact bytes to skip a write. Spec artifact writes go through `writeFileAtomic` and overwrite.

### Discrepancies (both sides)

None. The newline success shortcut is only in `ensureTmpGitignore`. Artifact publication has no “bytes match, so this succeeded” branch.

### Test Coverage

- Publication whose rename target always fails with `EBUSY` rejects with `{ code: 'EBUSY' }`.
- A temp `.gitignore` of `*\r\n!.gitignore\r\n` is left unchanged.

### Missing Tests

- Differing artifact bytes are not treated as success. **known-excluded** (no byte-equality success tests).
- `EPERM` and `EACCES` are not exhausted on a publication rename. **known-excluded** (same lock-code set as tested `EBUSY`).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:fs-archive-repository

### Requirements Summary

**Archive paths stay inside the repository root** (added).

Resolved archive paths must use the inside-root rule. Drive-letter case must not look outside.

### Implementation Status

`resolveArchiveDirPathSync` rejects a normalized relative path that is `..`, starts with `../`, or is POSIX-absolute, then resolves it and calls `isPathInside`. An outside path throws `CorruptedManifestError`. Drive-letter case is handled inside `isPathInside`, not by a separator prefix.

### Discrepancies (both sides)

None against the added requirement. `isPathInside('c:/repo', 'C:/repo/archive')` is true and `isPathInside('C:/repo', 'C:/repository/archive')` is false by the same helper the archive resolver calls. The archive function itself is not given those absolute pairs in a test.

### Test Coverage

No archive-repository test asserts the two new scenarios. Shared helper tests cover the same inside-root outcomes for `C:/repo` versus `c:/repo/specd.yaml` and `C:/repository`.

### Missing Tests

- Drive-letter case stays inside (`c:/repo` contains `C:/repo/archive`). **known-excluded** (drive-letter archive cases already decided by `isPathInside`).
- A longer directory name is outside (`C:/repo` does not contain `C:/repository/archive`). **known-excluded** (same).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:file-reader-port

### Requirements Summary

**Path traversal protection** (modified).

When `basePath` is set, an escaping resolved path must throw `PathTraversalError`. Escape detection must use the inside-root rule. Drive-letter case must not look outside. A `basePath + separator` prefix must not be the test.

### Implementation Status

`FsFileReader` stores `normalizeVcsRoot(basePath)` and checks `isPathInside` on `normalizeVcsRoot(absolutePath)` before reading. A miss throws `PathTraversalError`. No `basePath` skips the check.

### Discrepancies (both sides)

None.

### Test Coverage

- `FsFileReader('C:/repo').read('c:/repo/missing.txt')` resolves `null` and does not throw `PathTraversalError`.
- `read('C:/repository/file.txt')` rejects with `PathTraversalError`.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## core:refresh-implementation-tracking

### Requirements Summary

**Project-relative paths keep a separator boundary** (added).

A path is project-relative only when it is the project root or a descendant. Matching must require a separator boundary after the root. A longer string prefix must not count as inside. Drive-letter case must not change the result. The portable form of the project root is the empty string. That empty string means inside and must not be added as an exclusion prefix. An empty result is not the signal for a path outside the root; outside is `null`.

The dependency edit says the project-relative root is the normalized adapter root. Composition injects `isPathInside` and `normalizeVcsRoot`. The use case file does not import `infrastructure/`.

### Implementation Status

`_toPortableProjectRelativePath` returns `null` when `isPathInside` is false. Otherwise it recomputes a win32 relative path when the normalized root has a drive letter or a backslash, then replaces `\` with `/`. The root’s relative path is `''`. `_collectExclusions` adds a path only when `rel !== null && rel.length > 0`, so the empty root is omitted and a `null` outside path is omitted.

### Discrepancies (both sides)

None. The observable exclusion list cannot by itself prove the root was classified as `''` rather than `null`. The code returns `''` for the root and `null` for an outside path.

### Test Coverage

- Internal path `C:/work/application` with project root `C:/work/app` is not an exclusion; `c:/work/app/specd` becomes `specd`.
- Internal path equal to `C:/work/app` does not put `''` on `excludePaths`; the descendant `specd` is still listed.

### Missing Tests

- The private `''` versus `null` return is not observed directly. **known-excluded** (private empty-string versus null is not observable). The exclusion-list half of the scenario is tested.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:change

### Requirements Summary

**Change names reject Windows device names** (added).

A slug that is a Windows device name must be rejected on every operating system. Reserved names are `con`, `prn`, `aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9`, compared case-insensitively as the whole slug. A larger segment such as `con-foo` stays legal when it matches the existing slug pattern.

### Implementation Status

`Change` construction rejects a name when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName` is true. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`. It does not consult `process.platform`. `con-foo` fails the regex, so it stays legal. `com0` and `com10` are not reserved, matching “com1 through com9”.

### Discrepancies (both sides)

None.

### Test Coverage

`change-device-name.spec.ts` rejects `con` and `com1` with `InvalidChangeError` and accepts `con-foo`. `windows-device-name.spec.ts` covers `con`, `prn`, `AUX`, `NUL`, `com1`, `lpt9`, and rejects `con-foo`.

### Missing Tests

None for the added scenarios. The entity test does not repeat every reserved name; the shared predicate test covers the rest of the set, including case.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## core:workspace

### Requirements Summary

**Workspace identity** (modified).

Names must match `/^[a-z][a-z0-9-]*$/`. `default` and `root` stay reserved. Windows device names (`con`, `prn`, `aux`, `nul`, `com1` through `com9`, `lpt1` through `lpt9`) must be rejected on every operating system when the whole workspace name is the device name. `con-foo` must remain legal. Names in one configuration must be unique.

### Implementation Status

`FsConfigLoader._buildConfig` throws `ConfigValidationError` when `isWindowsDeviceName(name)` is true, before specs are resolved. `workspaces.root` is still rejected as reserved. Missing `workspaces.default` is still rejected. There is no `process.platform` check. Uniqueness remains a map-key property of the YAML object.

### Discrepancies (both sides)

None. Enforcement lives in the loader because workspace identity is a `specd.yaml` rule, and there is no separate workspace entity.

### Test Coverage

- Loader rejects workspace `con`, `prn`, and `aux` with a Windows-device-name error.
- Loader accepts workspace `con-foo`.
- An existing loader test rejects `workspaces.root` as reserved.

### Missing Tests

- Scenario “the workspace name is `nul`” is not run at the loader. The shared predicate rejects `NUL`, and the loader calls that predicate, but the verify scenario’s name is not in the loader tests. Not known-excluded. `com1`–`com9` and `lpt1`–`lpt9` are also untested at the loader; the predicate test samples `com1` and `lpt9`.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:spec-id-format

### Requirements Summary

**Capability segments reject Windows device names** (added).

A capability-path segment that is a Windows device name must be rejected on every operating system. The reserved set is the same whole-segment, case-insensitive list. `con-foo` stays legal. This rule does not treat a Windows drive letter as a workspace name; spec IDs are not filesystem paths.

### Implementation Status

`SpecPath._validateSegments` rejects a segment when `isWindowsDeviceName` is true, on every platform. `con-foo` is not a match. `parseSpecId` still splits on the first colon and does not interpret `C:` as a drive or as a device name. A colon inside a capability segment is already illegal (`:` is in the reserved-character check). No new drive-letter workspace rule was added.

### Discrepancies (both sides)

None.

### Test Coverage

`SpecPath.parse` rejects `con`, `prn`, `auth/aux`, and `auth/com1`, and accepts `con-foo`.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## Rollup

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             1 |             3 |
| core:vcs-adapter                     |            1 |             0 |             2 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             0 |             1 |
| core:fs-change-repository            |            1 |             0 |             2 |
| core:fs-spec-repository              |            1 |             0 |             2 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             0 |             1 |
| core:change                          |            1 |             0 |             0 |
| core:workspace                       |            1 |             0 |             1 |
| core:spec-id-format                  |            1 |             0 |             0 |
| **Total**                            |       **15** |         **1** |        **14** |

Discrepancy title: Non-fs storage paths and workspaces skip the inside-root check.

Missing tests that are not known-excluded (3): snapshot `hashFiles` CRLF/LF digest equality; VCS follow-up CLI `cwd` is the normalized root; workspace loader does not execute the `nul` scenario.

Known-excluded missing tests (11): three config-loader drive-letter `load()` cases; two archive drive-letter cases; VCS `realpath` spy; change-repository byte-equality; change-repository `EPERM`/`EACCES` rename retries; spec-repository differing artifact bytes; spec-repository `EPERM`/`EACCES` publication retries; refresh private `''` versus `null`.
