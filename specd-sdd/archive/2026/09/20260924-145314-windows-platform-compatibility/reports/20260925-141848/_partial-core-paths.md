# Partial audit: core paths

Change: `windows-platform-compatibility`
Scope: delta requirements only (added or modified), plus contradictions with the unchanged base or a direct dependency.
Graph: `graph search` / `graph impact` before file reads. Index treated as fresh.

Checked follow-ups that hold in code (not reported as findings):

- `publicationRenameError` returns the original `ErrnoException` for `EPERM` / `EBUSY` / `EACCES` (`code` preserved). `SpecPublicationError.code` is `SPEC_PUBLICATION_FAILED`. Other publication failures still wrap.
- `normalizeNewlines` is `packages/core/src/domain/services/normalize-newlines.ts`. `sha256` and `NodeContentHasher.hash` rewrite `\r\n` and lone `\r`. `computeArtifactHash` runs `applyPreHashCleanup` (whitespace collapse) before the digest. No `Buffer` hash goes through that helper.
- `RefreshImplementationTracking` takes `isPathInside` and `normalizeVcsRoot` on `ProjectPathHelpers`. The use case file does not import `infrastructure/fs/path-platform.ts`. Composition injects the real helpers.
- `git` / `hg` / `svn` `spawnOptions` set `windowsHide: true` when `platform === 'win32'`.
- `moveDir` copies on `EPERM` and `EXDEV` (also `ENOTEMPTY` / `EEXIST`).
- `con-foo` is accepted as a change slug, workspace name, and capability segment. Exact device names are rejected.
- `/tmp` in mocks and standing `as unknown as` port doubles were not audited. Resolution-fingerprint manifests (GitHub issue 64) were not required.

---

## core:config-loader

### Requirements checked

1. **Storage path containment** (modified). Inside-root rule, drive-letter case, no separator-prefix test, `ConfigValidationError` names the storage key, null `rootPath` skips the check, `rootPath` is the normalized VCS root.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Null `rootPath` forces `isExternal: false`.
3. **Config file stays inside the repository root** (added). The resolved config file must sit inside `rootPath` under that same rule. Separator mismatch and drive-letter case must not reject an inside file. An outside file must throw `ConfigValidationError`.

### Implementation status

Storage containment and `isExternal` call `isPathInside` (`packages/core/src/infrastructure/fs/config-loader.ts` around the storage loop and the specs-path check). `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()`, which the built-in adapters already pass through `normalizeVcsRoot`. Null adapter still yields `rootPath = null`.

The new config-file requirement is not implemented. `load()` never calls `isPathInside` on the specd.yaml path (`cascade.rootPath` / `rootConfigPath`). The only nearby check is the YAML **setting** `configPath` (default `.specd/config`), stored as `resolvedConfigPath`. Discovery still stops at the VCS root, so a walked file is inside by construction. Forced mode (`resolveForcedCascade`) can load a file outside that root and will not reject it for that reason.

### Discrepancies

**Config file outside the repository is not rejected.**

- Spec: when `rootPath` is non-null, the resolved config file must be inside that root. Scenario: root `C:/repo`, file `C:/other/specd.yaml`, `load()` throws `ConfigValidationError`. Mixed separators (`C:\repo` vs `C:/repo/specd.yaml`) must be accepted.
- Code: `FsConfigLoader._buildConfig` checks `isPathInside(this.rootPath, resolvedConfigPath)` where `resolvedConfigPath` is `data.configPath`, not the yaml file. No check of `rootConfigPath`.
- Evidence: `packages/core/src/infrastructure/fs/config-loader.ts` (`resolvedConfigPath` assignment and the `rootPath !== null` block). `isPathInside` itself would accept the mixed-separator pair (`path-platform.ts`).
- Either side: the scenario text names `specd.yaml`. The existing loader test "rejects configPath values outside the repo root" covers the YAML `configPath` field (`../outside`), which is a different path. Discovery bounding is not the same as the forced-mode check the requirement states.

### Test coverage gaps

- Drive-letter storage inside (`c:/repo` vs `C:/repo/changes`) is not exercised through `load()`.
- Longer storage prefix (`C:/repo` vs `C:/repository/changes`) is not exercised through `load()`.
- Drive-letter `isExternal` (`C:/repo` vs `c:/repo/specs`) is not exercised through `load()`.
- Mixed-separator acceptance of the config file is not tested.
- Outside config file `C:/other/specd.yaml` is not tested (the `../outside` test is the `configPath` setting).

`isPathInside` unit tests cover the predicate (`path-platform.spec.ts`) but not these `load()` scenarios.

### Summary

Requirements checked: 3. Discrepancies: 1. Missing tests: 5.

---

## core:vcs-adapter

### Requirements checked

1. **Built-in adapters normalize repository roots** (added). Absolute root, uppercased Windows drive letter, no `realpath`, value stays a usable cwd. `NullVcsAdapter.rootDir()` still throws and invents no root. Modified-file paths use `/` and must not collapse `.` or `..`. Windows spawns of `git`, `hg`, and `svn` hide the console.

### Implementation status

Conforms. `GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` cache and return `normalizeVcsRoot`. `normalizeVcsRoot` is `resolvePlatformPath` (`path.win32.resolve` when the string has a drive letter or a backslash, then uppercase the drive letter). It does not call `realpath`. `toPortablePath` is `replaceAll('\\', '/')` only. `NullVcsAdapter.rootDir` throws `no VCS detected`. `spawnOptions` in `infrastructure/git/exec.ts`, `hg/exec.ts`, and `svn/exec.ts` set `windowsHide: true` on `win32`.

On this host, `path.win32.resolve('c:/repo')` is `c:\repo`, and the adapters return `C:\repo` after the drive-letter uppercase. That string is absolute under win32 rules.

### Discrepancies

None.

### Test coverage gaps

- No test spies `realpath` / `fs.realpath`. `path-platform.spec.ts` only asserts the normalized string. The "does not call realpath" clause is unmet as an assertion. Behavior in source does not call it.

Drive-letter roots, uncollapsed `src/../secret`, null `rootDir()`, and `windowsHide` are tested (`git`/`hg`/`svn` adapter specs, `null/vcs-adapter.spec.ts`, `vcs-spawn-options.spec.ts`).

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 1.

---

## core:content-hasher-port

### Requirements checked

1. **Text newline normalization** (added). `ContentHasher.hash` and shared text `sha256` turn every `\r\n` and remaining `\r` into `\n`. Every string is text. No binary string mode. Artifact hashes are a different contract (whitespace collapse) and must not be required to preserve line endings. Raw file bytes must not go through the text helper.
2. **Determinism** (modified). Identical input after that newline normalization returns the same digest.

### Implementation status

Conforms. `normalizeNewlines` lives in `packages/core/src/domain/services/normalize-newlines.ts`. `sha256` (`infrastructure/fs/hash.ts`) and `NodeContentHasher.hash` both digest `normalizeNewlines(content)` as UTF-8. `computeArtifactHash` does `normalizeNewlines(applyPreHashCleanup(...))`, and `applyPreHashCleanup` already replaces `\s+` with a single space before trim. `compile-context-fingerprint.ts` calls `createHash` on its canonical string and does not import the text helper. No production `createHash(...).update` of a `Buffer` goes through `normalizeNewlines`.

### Discrepancies

None against this delta. Artifact hashes are not required to keep line endings; the implementation collapses whitespace and also normalizes newlines. That is stronger than the requirement and does not contradict it.

### Test coverage gaps

None for the two verify scenarios. `hash-newlines.spec.ts` asserts CRLF and lone CR match LF for `sha256`, `NodeContentHasher`, and `computeArtifactHash`, and locks the previous LF digest.

### Summary

Requirements checked: 2. Discrepancies: 0. Missing tests: 0.

---

## core:snapshot-hasher

### Requirements checked

1. **Determinism** (modified). Same path and same text after `\r\n` / `\r` → `\n` share a digest. Binary content must not be newline-normalized.
2. Dependency note: text hashes follow `core:content-hasher-port`.

### Implementation status

Does not conform for the binary clause, and does not itself implement the text clause.

`hashFiles` (`packages/core/src/domain/services/hash-files.ts`) copies each string into `hashContent(content)` with no newline rewrite and no text/binary split. Graph impact shows production callers: none. The unit test injects `NodeContentHasher`, which rewrites every string.

Direct dependency `core:content-hasher-port` says every string passed to the text hasher is text and that there is no binary string mode. This delta still requires the snapshot hasher to leave non-text `\r\n` bytes unchanged.

### Discrepancies

**Binary snapshot content is not a separate digest path.**

- Spec: text that differs only by `\r\n` or `\r` must hash the same. Content that is not text and contains the `\r\n` byte sequence must not be rewritten to `\n`.
- Code: `hashFiles` always forwards the string. It cannot both normalize text and preserve binary unless `hashContent` changes per entry. The hasher the spec depends on normalizes every string.
- Evidence: `hash-files.ts` lines 16–18; `content-hasher.ts` `hash`; content-hasher delta ("There is no binary string mode on this port").
- Either side: the snapshot delta may be asking `hashFiles` not to pre-normalize, leaving binary safety to a raw `hashContent`. The verify scenario still says the snapshot hasher's digest must not rewrite those bytes. With the only wired text hasher, a binary-looking string is rewritten. The two deltas disagree, and the code implements only the text-hasher side.

### Test coverage gaps

- "Text file CRLF matches LF" is not in `hash-files.spec.ts`.
- "Binary content keeps its bytes" is not tested.

### Summary

Requirements checked: 1. Discrepancies: 1. Missing tests: 2.

---

## core:fs-change-repository

### Requirements checked

1. **Windows path containment and rename recovery** (added). Inside-root rule and drive-letter case. Directory move on `EPERM` or `EXDEV` copies. Rename onto a locked destination (`EPERM`, `EBUSY`, `EACCES`) retries a bounded number of times, then surfaces the original error. Identical destination bytes are not success for change artifacts.

### Implementation status

Conforms. Bucket classification and prune use `isPathInside`. `moveDir` (`move-dir.ts`) copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. Manifest and lock writes use `writeFileAtomic` → `retryOnLock` (five attempts, then the original error). `saveArtifact` writes with `fs.writeFile` after a hash conflict check. It does not treat equal destination bytes as a successful rename skip. `resolveConfinedPath` uses `isPathInside` after resolving the candidate (`path-confinement.ts`). The prefix pair `C:/work/app` vs `C:/work/application` is outside under `path.win32.relative`.

### Discrepancies

None.

### Test coverage gaps

- "Different artifact bytes are not success" has no test. Source has no byte-equality success short-circuit; the scenario is still unasserted.
- `EPERM` and `EACCES` rename retries are not asserted. `EBUSY` is (`write-atomic.spec.ts`, `path-platform.spec.ts`). The three codes share `LOCK_CODES`.

Prefix collision is covered on `isPathInside` (`C:/work/app` vs `C:/work/application`). `EXDEV` and `EPERM` copy are covered in `move-dir.spec.ts`. The repository calls `moveDir` at the directory move site.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

## core:fs-spec-repository

### Requirements checked

1. **Publication rename recovery** (added). `EPERM` / `EBUSY` / `EACCES` retries, then the original error. Tmp `.gitignore` equality treats `\r\n` and `\r` as `\n`, and that success applies to that file only. Differing artifact bytes are not success.

### Implementation status

Conforms. `publish` wraps the spec-dir renames in `retryOnLock`. `publicationRenameError` returns the caught value when `isPublicationLockError` is true, otherwise `SpecPublicationError`. The staging-to-canonical failure is mapped once, then the outer catch maps again; a lock error stays the same object. `ensureTmpGitignore` compares `normalizeNewlines` of the existing file to the LF marker and returns without rewriting when they match. Artifact publication goes through `writeFileAtomic` and does not accept a pre-existing different file as success.

Unchanged exact-byte / raw-byte revision wording still hashes UTF-8 strings via `sha256`. Under the content-hasher delta those strings are text. No separate raw-byte hasher was required for this delta.

### Discrepancies

None.

### Test coverage gaps

- "Different artifact bytes are not success" has no publication test.

`spec-repository.spec.ts` "rethrows the original EBUSY when the spec directory stays locked" expects `{ code: 'EBUSY' }`. That is not `SPEC_PUBLICATION_FAILED`. CRLF tmp gitignore is covered in `ensure-tmp-gitignore.spec.ts`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 1.

---

## core:fs-archive-repository

### Requirements checked

1. **Archive paths stay inside the repository root** (added). Inside-root rule. Drive-letter case must not look outside.

### Implementation status

Conforms on win32. `resolveArchiveDirPathSync` resolves with host `path.resolve`, then `isPathInside`. On Windows, `path.resolve` keeps the drive letter, and `isPathInside` uppercases it, so `c:/repo` contains `C:/repo/archive` and rejects `C:/repository/archive`.

On this darwin host, `path.resolve('c:/repo')` is `{cwd}/c:/repo` and `path.resolve('C:/repo/archive')` is `{cwd}/C:/repo/archive` (case-sensitive, not win32). A confinement check that host-resolves those strings before `isPathInside` does not see a drive letter. Production Windows runs do. The shared predicate, called with the raw drive-letter strings, matches the scenarios.

### Discrepancies

None for the Windows rule the requirement states. Host `path.resolve` before `isPathInside` means a macOS unit test of this function with raw `C:/` strings would not be the same check. That is untested, not a win32 miss.

### Test coverage gaps

- "Drive-letter case stays inside" is not tested on `FsArchiveRepository` / `resolveArchiveDirPathSync`.
- "A longer directory name is outside" is not tested there either.

`isPathInside('C:/repo', 'c:/repo/specd.yaml')` and `isPathInside('C:/repo', 'C:/repository')` cover the predicate only.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

## core:file-reader-port

### Requirements checked

1. **Path traversal protection** (modified). Escape uses the inside-root rule. Drive-letter case must not look outside. A string prefix of `basePath` plus a separator must not be the test. Escape throws `PathTraversalError`.

### Implementation status

Conforms. `FsFileReader` normalizes `basePath` and the candidate with `normalizeVcsRoot`, then `isPathInside`. A miss throws `PathTraversalError`. `windows-containment.spec.ts` also checks `resolveConfinedPath('C:/work/app', '../application')`.

### Discrepancies

None.

### Test coverage gaps

None for the two new scenarios. Inside drive-letter read resolves `null` (missing file, not a traversal). `C:/repository/file.txt` against base `C:/repo` throws `PathTraversalError`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:refresh-implementation-tracking

### Requirements checked

1. **Project-relative paths keep a separator boundary** (added). Project-relative means the project root or a descendant. Match needs a separator boundary. A longer string prefix is outside. Drive-letter case must not change the result.
2. Dependency note: the root used for the check is the normalized adapter root.

### Implementation status

Does not fully conform. Composition passes `{ isPathInside, normalizeVcsRoot }` and the use case does not import the infrastructure module. `_toPortableProjectRelativePath` uses those helpers, then `path.win32.relative` when the normalized root has a drive letter or a backslash, then `replaceAll('\\', '/')`.

The longer-prefix and drive-letter descendant cases match the scenarios (`C:/work/application` dropped, `c:/work/app/specd` kept as `specd`). The project root itself does not.

### Discrepancies

**The project root is classified as not project-relative.**

- Spec: a path is project-relative when it is the project root or a descendant. Separator boundary and drive-letter case are additional constraints, not a reason to drop the root.
- Code: `isPathInside` is true for equal paths (`relative === ''` returns true in `path-platform.ts`). `_toPortableProjectRelativePath` then returns `null` when the portable relative string is empty. The method comment says `null` means outside `projectRoot`. `_collectExclusions` skips `null`, so an internal path equal to the project root is omitted the same way as `C:/work/application`.
- Evidence: `refresh-implementation-tracking.ts` `_toPortableProjectRelativePath` (the `portable.length > 0 ? portable : null` return).
- Either side: exclusions may intentionally avoid a relative path of `""` so the whole tree is not excluded. The requirement text still counts the root as inside. Callers cannot tell the root from an outside path.

### Test coverage gaps

None for the two verify scenarios. `refresh-implementation-tracking.spec.ts` "ignores a longer path prefix when collecting exclusions" uses root `C:/work/app`, internal paths `C:/work/application` and `c:/work/app/specd`, and expects `excludePaths` `['specd']`. The equal-root case is not a written scenario.

### Summary

Requirements checked: 1. Discrepancies: 1. Missing tests: 0.

---

## core:change

### Requirements checked

1. **Change names reject Windows device names** (added). Whole slug, case-insensitive: `con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`, on every OS. `con-foo` stays legal when it matches the slug pattern.

### Implementation status

Conforms. `Change` constructor rejects when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName(props.name)`. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. `change-device-name.spec.ts` rejects a device slug and accepts `con-foo`. The helper spec covers case and the reserved set.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:workspace

### Requirements checked

1. **Workspace identity** (modified). Names still match `/^[a-z][a-z0-9-]*$/`. Reserved: `default`, `root`, and the same Windows device names, whole name, every OS. `con-foo` stays legal.

### Implementation status

Conforms. `FsConfigLoader._buildConfig` rejects `workspaces.root` and `isWindowsDeviceName(name)` with `ConfigValidationError`. `con-foo` does not match the device regex and matches the name pattern. There is no separate domain `Workspace` type; identity is enforced at config load, which is where workspace names enter the system.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. The loader test rejects workspace `con` and accepts `con-foo`. The scenario fixture is `nul`; `con` is in the same reserved set and uses the same helper. `default` remains required and `root` remains rejected by the surrounding loader checks.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:spec-id-format

### Requirements checked

1. **Capability segments reject Windows device names** (added). Whole segment, case-insensitive, every OS. `con-foo` stays legal. A Windows drive letter is not treated as a workspace name; spec IDs are not filesystem paths.

### Implementation status

Conforms. `SpecPath._validateSegments` rejects `isWindowsDeviceName(segment)` with `InvalidSpecPathError`. `con-foo` passes. The device check does not parse drive letters. `parseSpecId` still splits on the first `:`; that is unchanged and is not a capability-segment rule. `:` is already an invalid segment character, so a drive letter cannot be a `SpecPath` segment.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. `spec-path.spec.ts` rejects `con` and `auth/com1`, and accepts `con-foo`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## Batch totals

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             1 |             5 |
| core:vcs-adapter                     |            1 |             0 |             1 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             1 |             2 |
| core:fs-change-repository            |            1 |             0 |             2 |
| core:fs-spec-repository              |            1 |             0 |             1 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             1 |             0 |
| core:change                          |            1 |             0 |             0 |
| core:workspace                       |            1 |             0 |             0 |
| core:spec-id-format                  |            1 |             0 |             0 |
| **Total**                            |       **15** |         **3** |        **13** |

Discrepancy titles:

1. Config file outside the repository is not rejected.
2. Binary snapshot content is not a separate digest path.
3. The project root is classified as not project-relative.
