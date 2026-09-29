# Core path specs

Read-only audit of requirements this change added or modified in `windows-platform-compatibility`. Baseline historical requirements were not re-audited. Spec text is the merged `specd changes spec-preview` result (deltas under `specd-sdd/changes/20260924-145314-windows-platform-compatibility/deltas/core/`). Implementation was checked with `specd graph` plus the cited source. Focus unit tests were run: 57 passed, 0 failed.

## Requirements checked

### core:config-loader (3)

1. **Storage path containment** (modified). Non-null `rootPath`: each of `changes`, `drafts`, `discarded`, `archive` is the root or inside it. Inside means the relative path from the resolved root is empty, or it does not start with `..` and is not absolute. Drive-letter case must not look outside. A string prefix of `rootPath` plus a separator is not the test. Outside throws `ConfigValidationError` naming the storage key. Null `rootPath` skips the check. `rootPath` is the normalized VCS-adapter root, not raw CLI stdout.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Outside `specsPath` is external. Null `rootPath` forces `isExternal: false`.
3. **Config file stays inside the repository root** (added). Same inside-root rule on the resolved config file. Separator mismatch and drive-letter case must not reject an inside file. Outside throws `ConfigValidationError`.

`load()` uses `isPathInside` for the yaml file (`cascade.rootPath` / `rootConfigPath`), for the YAML `configPath` setting (`resolvedConfigPath`), for each fs storage binding, and for `isExternal` (`packages/core/src/infrastructure/fs/config-loader.ts`). `isPathInside` (`path-platform.ts`) resolves with `path.win32` when the string has a drive letter or a backslash, uppercases the drive letter, then uses `path.win32.relative` / `path.relative`. `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()` (`composition/config-loader.ts`). Built-in adapters return `normalizeVcsRoot`. `NullVcsAdapter` yields `rootPath = null`.

Focus scenarios match:

- Root `C:/repo`, file `C:/other/specd.yaml`: `isPathInside` is false (`..\other\specd.yaml`). `load()` throws `ConfigValidationError` with `config file resolves outside VCS root`. Test: `config-loader-root-containment.spec.ts` (passed).
- Root `C:\repo`, file `C:/repo/specd.yaml`: both resolve to `C:\repo` and `C:\repo\specd.yaml`. Relative path is `specd.yaml`. `load()` accepts the file and the relative storage paths under it. Same test (passed).

### core:vcs-adapter (1)

**Built-in adapters normalize repository roots** (added). Git, hg, and svn normalize the root before caching it and before `rootDir()`. Absolute path, Windows drive letter uppercased, no `realpath`, still a usable cwd. `NullVcsAdapter.rootDir()` throws and invents no root. Modified-file paths use `/` and do not collapse `.` or `..`. On Windows, spawns of `git`, `hg`, and `svn` hide the console.

`GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` store and return `normalizeVcsRoot`. `normalizeVcsRoot` is `path.resolve` or `path.win32.resolve` plus a drive-letter uppercase. It does not call `realpath`. `toPortablePath` is `replaceAll('\\', '/')` only. `NullVcsAdapter.rootDir` throws `no VCS detected`. `spawnOptions` in `infrastructure/git/exec.ts`, `hg/exec.ts`, and `svn/exec.ts` sets `windowsHide: true` when `platform === 'win32'`, and `git` / `hg` / `svn` pass that object to `execFile`.

### core:content-hasher-port (2)

1. **Text newline normalization** (added). `ContentHasher.hash` and the shared text `sha256` helper turn every `\r\n` and every remaining `\r` into `\n`. Every string is text. No binary string mode. Artifact hashes are a different contract (whitespace collapse) and are not required to preserve line endings. Raw file bytes must not go through the text helper.
2. **Determinism** (modified). Same digest after that newline normalization.

`normalizeNewlines` (`domain/services/normalize-newlines.ts`) does both replacements. `sha256` (`infrastructure/fs/hash.ts`) and `NodeContentHasher.hash` digest `normalizeNewlines(content)` as UTF-8. `computeArtifactHash` normalizes newlines after `applyPreHashCleanup`. No binary branch.

### core:snapshot-hasher (1)

**Determinism** (modified). `hashFiles` forwards each string to `hashContent` unchanged. It must not detect a binary string and must not rewrite newlines. Newline normalization belongs to the text hasher. Raw file bytes are not strings and must not be passed through `hashFiles`.

`hashFiles` (`domain/services/hash-files.ts`) assigns `result[filePath] = hashContent(content)` with no classification and no rewrite. The verify scenario “Text file CRLF matches LF” is the injected text hasher’s job: `NodeContentHasher` / `sha256` already equate those strings (`hash-newlines.spec.ts`). `hashFiles` itself does not. That matches the requirement text. The equality scenario is not asserted through `hashFiles` (see Missing tests). The forwarding scenario is: `hash-files.spec.ts` spies `hashContent` and expects the same string, including `\r\n` (passed).

### core:fs-change-repository (1)

**Windows path containment and rename recovery** (added). Inside-root rule and drive-letter case. A directory move that fails with `EPERM` or `EXDEV` copies. A rename onto an existing or locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` retries a bounded number of times, then surfaces the original error. Identical destination bytes are not success for change artifacts.

`isStrictlyInside` and `resolveConfinedPath` call `isPathInside`. `C:/work/app` vs `C:/work/application` is outside (`path.win32.relative` starts with `..`). `moveDir` copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. The change repository calls `moveDir` when the change directory changes bucket. Manifest and lock writes use `writeFileAtomic` → `retryOnLock` (five attempts, delays 50/100/150/200 ms, then the original error object). `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`. `saveArtifact` hash-checks, then `fs.writeFile`. It does not return success because destination bytes already match. Directory-move `EBUSY` / `EACCES` are not in the copy set and are not retried by `moveDir`; the retry sentence is implemented on the atomic file rename and on spec publication, which is what the verify scenarios name (`EXDEV` copies; locked rename retries then throws).

### core:fs-spec-repository (1)

**Publication rename recovery** (added). Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` retry, then surface the original error (including `code`). The temporary `.gitignore` equality check treats `\r\n` and `\r` as `\n`. Identical normalized content is success for that file only. Differing artifact bytes are not success.

`publish` wraps spec-dir renames in `retryOnLock`. `publicationRenameError` returns the caught lock error unchanged; other failures become `SpecPublicationError`. `ensureTmpGitignore` compares `normalizeNewlines` and returns without rewriting when they match. The spec repository calls that helper from list/reindex paths. Artifact writes go through `writeFileAtomic` and do not treat a pre-existing different file as a successful skip. `spec-repository.spec.ts` expects the original `{ code: 'EBUSY' }` after a locked publication rename.

### core:fs-archive-repository (1)

**Archive paths stay inside the repository root** (added). Same inside-root rule. Drive-letter case must not look outside. A longer directory name (`C:/repo` vs `C:/repository/archive`) is outside.

`resolveArchiveDirPathSync` resolves with host `path.resolve`, then `isPathInside`. On Windows, `path.resolve` keeps the drive letter and `isPathInside` uppercases it, so `c:/repo` contains `C:/repo/archive` and rejects `C:/repository/archive`. The predicate itself is tested with those shapes. The archive function is not.

### core:file-reader-port (1)

**Path traversal protection** (modified). Escape uses the inside-root rule, including drive-letter case. A string prefix of `basePath` plus a separator is not the test. Escape throws `PathTraversalError`.

`FsFileReader` normalizes `basePath` and the candidate with `normalizeVcsRoot`, then `isPathInside`. A miss throws `PathTraversalError`. `windows-containment.spec.ts`: base `C:/repo` and `c:/repo/missing.txt` resolves `null` (missing file, not a traversal); `C:/repository/file.txt` throws `PathTraversalError`.

### core:refresh-implementation-tracking (1)

**Project-relative paths keep a separator boundary** (added). Project-relative means the project root or a descendant, with a separator boundary. A longer string prefix is outside. Drive-letter case must not change the result. The portable form of the project root is `''`. That empty string means inside and must not be an exclusion prefix. An empty result is not the signal for outside. Outside stays `null`.

`_toPortableProjectRelativePath` returns `null` when `isPathInside` is false. When the root and the candidate normalize to the same path, `path.relative` / `path.win32.relative` is `''`, and that `''` is returned. `_collectExclusions` adds a path only when `rel !== null && rel.length > 0`, so the root is not an exclusion prefix and an outside path is not either. Composition passes `{ isPathInside, normalizeVcsRoot }`.

`refresh-implementation-tracking.spec.ts` (passed): root `C:/work/app` with internal paths `C:/work/application` and `c:/work/app/specd` yields `excludePaths === ['specd']`. Root `C:/work/app` plus `C:/work/app/specd` yields `['specd']` and the list does not contain `''`.

### core:change (1)

**Change names reject Windows device names** (added). Whole slug, case-insensitive, every OS: `con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`. `con-foo` stays legal when it matches the slug pattern.

`Change` constructor rejects when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName(props.name)`. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`. `change-device-name.spec.ts` rejects `con` and `com1` and accepts `con-foo`. `windows-device-name.spec.ts` covers `NUL`, `com1`, and `lpt9`.

## Discrepancies

None.

The three focus items match on both sides:

| Check                            | Spec                                                                                   | Code                                                                                         | Test                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Config file outside the root     | `C:/repo` vs `C:/other/specd.yaml` throws `ConfigValidationError`                      | `isPathInside(this.rootPath, rootConfigPath)` throws `config file resolves outside VCS root` | `config-loader-root-containment.spec.ts` rejects that pair   |
| Mixed separators inside the root | `C:\repo` vs `C:/repo/specd.yaml` is accepted                                          | win32 resolve + relative `specd.yaml` is inside                                              | same file loads and reads `workspaces[0].name === 'default'` |
| `hashFiles` and `\r\n`           | forward the string unchanged; do not classify a binary string; do not rewrite newlines | loop calls `hashContent(content)` only                                                       | spy receives `'line\r\nline'`                                |
| Project root portable path       | `''` means inside and is not an exclusion prefix; `null` means outside                 | equal paths return `''`; `!isPathInside` returns `null`; exclusions require `rel.length > 0` | exclusion list is `['specd']` and does not contain `''`      |

Previous mismatches against older delta wording are closed by the current text plus this code: `hashFiles` is specified not to normalize or detect binary strings, and the project root is specified as `''` rather than as outside. `sha256` / `NodeContentHasher` still normalize every string, which is the content-hasher requirement, not a snapshot-hasher rewrite.

Close calls that are not discrepancies:

- **CRLF equality vs `hashFiles`.** The snapshot verify scenario says CRLF and LF digests are equal. The requirement says `hashFiles` must not rewrite newlines and that normalization belongs to the text hasher. With `NodeContentHasher` or `sha256` as `hashContent`, the digests are equal (`hash-newlines.spec.ts`). `hashFiles` does not equalize by itself. That is what the requirement says.
- **Directory-move `EBUSY`.** `moveDir` copies on `EPERM` and `EXDEV` and does not retry `EBUSY` / `EACCES`. The retry sentence is implemented for atomic file renames (`writeFileAtomic`) and publication renames (`retryOnLock`). The verify scenarios split the same way: `EXDEV` copies; a locked rename retries and then throws the original error.
- **Archive `path.resolve` on darwin.** Host `path.resolve('c:/repo')` is not a win32 drive path. The requirement is the Windows inside-root rule. On Windows, `path.resolve` keeps the drive letter and `isPathInside` applies the rule. Untested at the archive function (missing test), not a win32 miss in source.

## Missing tests

1. **Storage drive-letter case through `load()`.** Scenario: `rootPath` `c:/repo`, storage resolves to `C:/repo/changes`, accepted. Covered only by `isPathInside('C:/repo', 'c:/repo/specd.yaml')` in `path-platform.spec.ts`, not by `load()`.
2. **Storage longer prefix through `load()`.** Scenario: `C:/repo` vs `C:/repository/changes` throws `ConfigValidationError` for that key. The older `../../outside-repo` loader test is a `..` escape, not this prefix. `isPathInside('C:/repo', 'C:/repository')` covers the predicate only.
3. **`isExternal` drive-letter case through `load()`.** Scenario: root `C:/repo`, `specsPath` `c:/repo/specs`, `isExternal` false. No loader test. Existing `isExternal` tests use a real git repo on the host, not this pair.
4. **`realpath` is not called.** Scenario AND-clause on git/hg/svn `rootDir()`. Adapter tests assert `C:\repo` from `c:/repo` or `c:\repo`. They do not spy `realpath` / `fs.realpath`. Source does not call it.
5. **Snapshot “Text file CRLF matches LF”.** `hash-files.spec.ts` asserts forwarding of `\r\n`, not equal digests. Equality is tested on `sha256`, `NodeContentHasher`, and `computeArtifactHash`, not on `hashFiles` with that hasher.
6. **Change artifacts: different destination bytes are not success.** No test. `saveArtifact` has no byte-equality success skip; the scenario is still unasserted.
7. **Spec publication: different artifact bytes are not success.** No publication test for that scenario. Locked `EBUSY` and CRLF `.gitignore` are tested.
8. **Archive drive-letter case.** Scenario `c:/repo` contains `C:/repo/archive` is not run through `resolveArchiveDirPathSync` / `FsArchiveRepository`.
9. **Archive longer directory name.** Scenario `C:/repo` vs `C:/repository/archive` is outside is not run through the archive resolver.
10. **Project root is `''`, not `null`.** The exclusion test expects `['specd']` and `not.toContain('')`. That assertion also passes if `_toPortableProjectRelativePath` returns `null` for the project root. Nothing observes the empty string itself. Outside vs inside for a longer prefix is tested (`C:/work/application` dropped, `specd` kept).

`EPERM` and `EACCES` are not separate rename fixtures. `EBUSY` is, and all three share `LOCK_CODES` in `retryOnLock`. Not counted as an extra missing test.

## Summary

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             0 |             3 |
| core:vcs-adapter                     |            1 |             0 |             1 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             0 |             1 |
| core:fs-change-repository            |            1 |             0 |             1 |
| core:fs-spec-repository              |            1 |             0 |             1 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             0 |             1 |
| core:change                          |            1 |             0 |             0 |
| **Total**                            |       **13** |         **0** |        **10** |

counts: requirements 13, discrepancies 0, missing tests 10
