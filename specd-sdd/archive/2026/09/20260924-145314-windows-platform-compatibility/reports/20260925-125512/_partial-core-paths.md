# Partial audit: core paths, containment, hashes, retries, VCS roots

Change: `windows-platform-compatibility`. Read-only. Scope is requirements this change added or changed in the listed specs, plus contradictions with `default:_global/architecture`, `default:_global/testing`, and `default:_global/conventions`. Spec text is the merged delta view from `changes spec-preview`.

Graph search and impact were used before source reads. `graph search` reported `CONTENT_KNOWN_STALE` even though this audit was told the index had just been rebuilt. Findings below are from the current source, not from the stale index alone.

Shared implementation checked:

- `packages/core/src/infrastructure/fs/path-platform.ts`
- `packages/core/src/infrastructure/git|hg|svn/exec.ts` and `vcs-adapter.ts`
- `packages/core/src/infrastructure/fs/file-reader.ts`
- `packages/core/src/infrastructure/fs/change-repository.ts`, `spec-repository.ts`, `archive-repository.ts`
- `packages/core/src/infrastructure/fs/write-atomic.ts`, `move-dir.ts`, `ensure-tmp-gitignore.ts`, `hash.ts`, `path-confinement.ts`
- `packages/core/src/infrastructure/node/content-hasher.ts`
- `packages/core/src/domain/services/hash-files.ts`, `pre-hash-cleanup.ts`
- `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`
- `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`
- `packages/core/src/composition/config-loader.ts`

`retryOnLock` does what the design states, which the specs only call "bounded": five attempts, delays 50/100/150/200 ms between them, retry only `EPERM` / `EBUSY` / `EACCES`, then the original error. `moveDir` copies on `EPERM` and `EXDEV` (and still on `ENOTEMPTY` / `EEXIST`). `windowsHide: true` is set only when `process.platform === 'win32'` in git, hg, and svn `exec.ts` (async and sync). There is no test that asserts `windowsHide`. `moveDir`'s `EPERM` branch is not tested; `EXDEV` is.

---

### core:config-loader

**Requirements checked**

- Storage paths are inside `rootPath` by the relative-path rule (empty relative, or not `..` and not absolute). Drive-letter case does not push an inside path outside. A string prefix of the root plus a separator is not the test. Outside paths throw `ConfigValidationError` naming the storage key. `rootPath === null` skips the check.
- `isExternal` uses that same rule. `rootPath === null` forces `isExternal === false`.
- The resolved config file uses the same inside-root rule. Separator mismatch and drive-letter case must not reject an inside config.
- `rootPath` is the normalized adapter root, not raw CLI stdout.

**Implementation status**

Implemented. `FsConfigLoader` calls `isPathInside` for the config path, for each fs storage binding (`changes`, `drafts`, `discarded`, `archive`), and for `isExternal` (`config-loader.ts` around the storage block and workspace loop). `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()` after a `NullVcsAdapter` check, and that `rootDir()` is `normalizeVcsRoot` (absolute, drive letter uppercased, no `realpath`).

`isPathInside` resolves with `path.win32` when the root has a drive letter or a backslash, uppercases the drive letter, then uses `path.win32.relative` / `path.relative`. Empty relative is inside. A relative path that `startsWith('..')` or is absolute is outside. `C:/repo` vs `C:/repository` is outside. That matches the spec text, including the spec's own `startsWith('..')` rule (a relative segment such as `..secret` would also look outside).

**Discrepancies**

None for these requirements.

**Test coverage**

`path-platform.spec.ts` covers drive-letter inside, `C:/repo` vs `C:/repository`, and `C:/work/app` vs `C:/work/application`. `config-loader.spec.ts` still covers POSIX outside-root storage and `isExternal`, not the new Windows scenarios.

**Missing tests**

- Loader scenario: drive-letter case accepts `C:/repo/changes` under `c:/repo`.
- Loader scenario: `C:/repository/changes` under `C:/repo` throws for that storage key.
- Loader scenario: `c:/repo/specs` under `C:/repo` is not external.
- Loader scenario: `C:\repo` accepts `C:/repo/specd.yaml`, and `C:/other/specd.yaml` throws.

Requirements checked: 4. Discrepancies: 0. Missing tests: 4.

---

### core:vcs-adapter

**Requirements checked**

- Git, hg, and svn normalize the repository root before cache and before `rootDir()`: absolute, Windows drive letter uppercased, no `realpath`, still a usable working directory.
- `NullVcsAdapter.rootDir()` throws and does not invent a root.
- Modified-file paths from those three adapters use `/` and do not collapse `.` or `..`.
- On Windows, spawns of `git`, `hg`, and `svn` hide the console.

**Implementation status**

Implemented. Each adapter assigns `normalizeVcsRoot` in the constructor and on the uncached `rootDir()` path (`git rev-parse --show-toplevel`, `hg root`, `svn info --show-item wc-root`). `toPortablePath` is `replaceAll('\\', '/')` only. Git, hg, and svn modified-file collectors pass paths through it. `spawnOptions` in each `exec.ts` returns `{ cwd, windowsHide: true }` only when `process.platform === 'win32'`, otherwise `{ cwd }`. Both `execFile` and `execFileSync` use that object.

`packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts` has a second `toPortablePath` and runs `path.resolve` / `path.relative` before it. That can collapse `src/../secret` after the adapter has already returned it. The requirement is on paths returned by the adapters, which do not collapse. The detector is outside this spec's return value.

**Discrepancies**

None for the adapter contract.

**Test coverage**

Git, hg, and svn adapter specs: `c:/repo` and `c:\repo` become `C:\repo`; cached POSIX roots stay; `src\..\secret` stays `src/../secret`. `null/vcs-adapter.spec.ts` expects `rootDir()` to throw. No test name or assertion mentions `windowsHide` or `spawnOptions`.

**Missing tests**

- Windows spawn scenario: on `win32`, `git` / `hg` / `svn` exec options include `windowsHide: true`; on other platforms they do not. `spawnOptions` is private, so this needs an `execFile` mock.

Requirements checked: 4. Discrepancies: 0. Missing tests: 1.

---

### core:file-reader-port

**Requirements checked**

- With `basePath`, escape detection uses the inside-root rule. Drive-letter case stays inside. A sibling prefix (`C:/repo` vs `C:/repository/spec.md`) throws `PathTraversalError`.
- The path is resolved before the traversal check and the read.

**Implementation status**

Implemented. `FsFileReader` stores `normalizeVcsRoot(basePath)` and resolves the argument the same way before `isPathInside`. Misses still return `null` only for `ENOENT`. Other errors propagate. No `basePath` skips the check.

**Discrepancies**

None.

**Test coverage**

`windows-containment.spec.ts`: `FsFileReader('C:/repo').read('c:/repo/missing.txt')` resolves `null` (no traversal error); `C:/repository/file.txt` throws `PathTraversalError`. `resolveConfinedPath('C:/work/app', '../application')` throws.

**Missing tests**

None for the new scenarios. A backslash root against a slash candidate is only covered indirectly by `isPathInside`.

Requirements checked: 2. Discrepancies: 0. Missing tests: 0.

---

### core:fs-change-repository

**Requirements checked**

- Path confinement uses the inside-root rule, including drive-letter case. A longer prefix is outside.
- A directory move that fails with `EPERM` or `EXDEV` copies.
- A rename onto a locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` retries a bounded number of times, then surfaces the original error.
- Identical destination bytes are not treated as success for change artifacts.

**Implementation status**

Confinement goes through `isPathInside` (`resolveConfinedPath`, bucket classification, `isStrictlyInside`). Directory moves go through `moveDir`, which copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. Manifest and lock-owner writes go through `writeFileAtomic`, which `retryOnLock`s the rename and rethrows the original error. `saveArtifact` uses `fs.writeFile` after an `originalHash` check; it does not treat equal bytes as a completed rename. `sha256` newline-normalizes before that hash compare, so CRLF and LF compare equal. That is hash equality, not a rename-success shortcut.

`retryOnLock` (`path-platform.ts`): loop `attempt` 0..4; on a lock code, delay `RETRY_DELAYS_MS[attempt]` unless `attempt === 4`, then throw the caught error. Delays used are 50, 100, 150, 200. Codes are `EPERM`, `EBUSY`, `EACCES`. Non-lock errors throw immediately.

`_pruneEmptyParents` still `realpath`s before `isPathInside`. The new rule does not forbid `realpath` there. VCS roots are a different spec.

**Discrepancies**

None against the requirement text. Design's five-attempt schedule is implemented even though the spec only says "bounded".

**Test coverage**

`move-dir.spec.ts` copies on `EXDEV` and removes the source. It does not inject `EPERM`. `write-atomic.spec.ts` retries one `EBUSY` then writes, and after five `EBUSY` failures rejects with the same error object. `path-platform.spec.ts` asserts five `EBUSY` calls. Neither asserts the delay list nor `EPERM` / `EACCES`. `windows-containment.spec.ts` covers the prefix rule for `resolveConfinedPath`, which change artifacts use. No change-repository test for the Windows confinement scenarios.

**Missing tests**

- `moveDir` copies when rename fails with `EPERM` (known gap; `EXDEV` is covered).
- Retry delays 50/100/150/200 and codes `EPERM` and `EACCES`, not only five `EBUSY` failures.

Requirements checked: 4. Discrepancies: 0. Missing tests: 2.

---

### core:fs-spec-repository

**Requirements checked**

- Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` retry a bounded number of times, then surface the original error.
- Temporary `.gitignore` comparison treats `\r\n` and `\r` as `\n`. Identical normalized content is success for that file only.
- Differing artifact bytes are not success.

**Implementation status**

`publish` wraps `fs.rename` of the live spec dir, the staging dir, and the backup restore in `retryOnLock`. `ensureTmpGitignore` returns without writing when `normalizeNewlines(existing)` equals the LF marker. Artifact writes use `writeFileAtomic` and do not short-circuit on equal bytes. Spec-lock and metadata hashes use `sha256`, which newline-normalizes.

**Discrepancies**

1. Publication does not surface the original error.

   Spec and verify: after retries, the original error is surfaced (`EBUSY` in the scenario).

   Code (`spec-repository.ts` publish): both rename catches throw `new SpecPublicationError(specId, stagingDir, errorMessage(error))`. `errorMessage` keeps `Error.message` only, so `.code` is dropped and the thrown value is not the `EBUSY` object.
   - Spec correct, code wrong: callers cannot see the original `ErrnoException` or its `code`.
   - Code correct, spec wrong: publication already promises `SpecPublicationError`, and "surface" means the failure is not swallowed. The verify scenario's "original error" would then need to mean the publication error's message, which is a weaker reading of "original".

   `writeFileAtomic` itself does rethrow the original object. The wrap is only in `publish`.

**Test coverage**

`ensure-tmp-gitignore.spec.ts` writes `*\r\n!.gitignore\r\n` and expects the file to stay CRLF. `write-atomic.spec.ts` covers `EBUSY` retry for the atomic writer publication uses for file bytes. `spec-repository.spec.ts` has no `EBUSY` / `EPERM` publication rename test.

**Missing tests**

- Publication rename keeps failing with `EBUSY` until the budget is exhausted, and the assertion is on the error the caller actually receives (this would catch the wrap).
- Lone `\r` gitignore matches the LF marker. Differing artifact bytes are not treated as already published. CRLF gitignore equality is covered; a different `.gitignore` body is not asserted.

Requirements checked: 3. Discrepancies: 1. Missing tests: 2.

---

### core:fs-archive-repository

**Requirements checked**

- Resolved archive paths use the inside-root rule. Drive-letter case stays inside. A longer directory name is outside.

**Implementation status**

`resolveArchiveDirPathSync` rejects `..`, `../`, and POSIX-absolute relatives, then `path.resolve`s and `isPathInside`. Archive directory moves use `moveDir` (same `EPERM` / `EXDEV` copy as changes). Manifest writes use `writeFileAtomic`. The archive spec's new requirement is confinement, not retry.

**Discrepancies**

None.

**Test coverage**

No archive test for `c:/repo` vs `C:/repo/archive` or `C:/repo` vs `C:/repository/archive`. The predicate is unit-tested in `path-platform.spec.ts`.

**Missing tests**

- Drive-letter case stays inside the archive root.
- `C:/repository/archive` is outside `C:/repo`.

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

### core:refresh-implementation-tracking

**Requirements checked**

- A path is project-relative only when it is the project root or a descendant. Matching requires a separator boundary. A longer string prefix is outside. Drive-letter case does not change the result.
- Spec dependency: the project root used for that check is the normalized adapter root.

**Implementation status**

`_toPortableProjectRelativePath` uses `isPathInside`, then `path.win32.relative` or `path.relative`, then `toPortablePath`. Exclusions drop a `null` result. The verify scenarios (longer prefix `C:/work/application` excluded; `c:/work/app/specd` kept as `specd`) match the test.

The project root itself is `isPathInside` true, relative `''`, then `portable.length > 0 ? portable : null`. The root is not emitted as a project-relative path. Callers only use this for exclusion prefixes, so a storage path equal to the project root is silently omitted.

**Discrepancies**

1. The project root is specified as project-relative and is not returned.
   - Spec correct, code wrong: an internal path that is the project root is dropped, so it never becomes an `excludePaths` entry.
   - Code correct, spec wrong: an empty relative string is not a usable exclusion prefix, and the verify scenarios only require descendants and prefix boundaries. The "or the project root" clause would be about `isPathInside`, not about the string passed to the detector.

2. Application imports infrastructure, against `default:_global/architecture`.

   `refresh-implementation-tracking.ts` imports `isPathInside`, `normalizeVcsRoot`, and `toPortablePath` from `infrastructure/fs/path-platform.js` under `eslint-disable no-restricted-imports`. Architecture says `application/` must not import `infrastructure/`, and path helpers that need `node:path` stay in infrastructure. The design says those helpers live in infrastructure and does not add an application-import exception.
   - Architecture correct, code wrong: the use case should receive an already-normalized root and a port for relative conversion.
   - Code correct, architecture stale: sharing one helper forced an infrastructure import, and the disable is the intended exception. That exception is not written into the global spec.

**Test coverage**

`refresh-implementation-tracking.spec.ts`: `internalPaths` of `C:/work/application` and `c:/work/app/specd` with project root `C:/work/app` yields `excludePaths === ['specd']`.

**Missing tests**

- Classification of the project root itself (the requirement sentence that the implementation does not follow).

Requirements checked: 2. Discrepancies: 2. Missing tests: 1.

---

### core:content-hasher-port

**Requirements checked**

- Before a text digest, every `\r\n` and every remaining `\r` becomes `\n`. The digest is of that text. Binary content is not newline-normalized.
- The same text after that normalization has the same digest. Empty input still returns `<algorithm>:<hex>`.

**Implementation status**

`NodeContentHasher.hash` and `sha256` both run `normalizeNewlines` then UTF-8 SHA-256 and return `sha256:<hex>`. There is no binary input. Every string is normalized, including a string whose bytes happen to contain `\r\n`.

`computeArtifactHash` calls `normalizeNewlines(applyPreHashCleanup(content, cleanups))`. `applyPreHashCleanup` always ends with `.replace(/\s+/g, ' ').trim()`, even when `cleanups` is empty. `\r`, `\n`, and `\r\n` are whitespace, so they become spaces before `normalizeNewlines`. The artifact digest is of collapsed spaces, not of LF-normalized text. `normalizeNewlines` then sees no carriage returns. `hash-newlines.spec.ts` shows `computeArtifactHash('alpha\r\nbeta\r', sha256)` equals `computeArtifactHash` of the LF string because both collapse to `alpha beta`, not because both stay `alpha\nbeta\n`. `sha256` of that LF string is a different value (`LF_DIGEST` in that test).

**Discrepancies**

1. Binary content is specified as not newline-normalized. `NodeContentHasher` and `sha256` always normalize. No binary branch exists.
   - Spec correct, code wrong: a binary payload passed as a string loses `\r\n`.
   - Code correct, spec wrong: the port is `hash(content: string)` and every string is text. The binary sentence describes a case the API cannot express.

2. Artifact text hashes do not digest newline-normalized text.

   The change's text-hash requirement says the digest is computed from `\r\n` / `\r` rewritten to `\n`. `computeArtifactHash` collapses all whitespace first, so `a\nb` and `a b` hash the same, and the newline helper does not see the line endings.
   - Spec correct, code wrong: drop the unconditional `\s+` collapse, or run `normalizeNewlines` on the raw text and keep cleanup rules for schema substitutions only.
   - Code correct, spec wrong: pre-hash cleanup has always collapsed whitespace, and newline normalization was only required for `NodeContentHasher` and `sha256`. The artifact helper matching CRLF to LF is accidental. The content-hasher spec would then not govern `computeArtifactHash`.

   `NodeContentHasher` itself matches the newline rule. This discrepancy is the artifact helper the change wired into the same requirement.

3. Same architecture import as refresh: `compute-artifact-hash.ts` (application) imports `normalizeNewlines` from infrastructure with `eslint-disable no-restricted-imports`. Domain `hashFiles` does not import it. See the architecture note on `core:refresh-implementation-tracking`.

**Test coverage**

`hash-newlines.spec.ts`: `sha256` and `NodeContentHasher` map `alpha\r\nbeta\r` to the known LF digest `sha256:e49c81e2d2f84e259d40e2fb8192f3bcd198b355184845d76d8f58807d0d78ee`. The artifact assertion only compares the helper to itself.

**Missing tests**

- Binary bytes that contain `\r\n` stay unnormalized (no implementation to test against).
- `computeArtifactHash` of LF text equals `sha256` of that same LF text, or an explicit assertion that whitespace collapse is required. The current test does not show which transform ran.

Requirements checked: 2. Discrepancies: 3. Missing tests: 2.

---

### core:snapshot-hasher

**Requirements checked**

- The same path hashes the same after `\r\n` and `\r` become `\n`. Binary file content is not newline-normalized.
- Content that differs only in whitespace hashes differently. Path keys are unchanged. Empty input and empty content behave as specified.

**Implementation status**

`hashFiles` copies each path and calls `hashContent(content)` with the original string. It does not normalize and it does not branch on binary. CRLF equality holds only when the callback is `NodeContentHasher` or `sha256`. Whitespace-only differences stay different, which matches this spec and does not match `computeArtifactHash`.

**Discrepancies**

1. `hashFiles` does not perform the normalization the requirement assigns to the snapshot hasher, and it has no binary exception.
   - Spec correct, code wrong: `hashFiles` should normalize text before `hashContent`, and should leave binary content alone. A callback that hashes raw strings breaks the CRLF scenario.
   - Code correct, spec wrong: the spec dependency says newline normalization lives in `core:content-hasher-port`, and `hashFiles` is only the map. Tests already pass `NodeContentHasher`. The binary sentence has nowhere to land on a `Record<string, string>` API.

   This is the same binary gap as the content hasher, plus a split about which function must call `normalizeNewlines`.

**Test coverage**

`hash-files.spec.ts` covers empty input, format, determinism, whitespace-only difference (`content` vs `content `), path keys, and empty content. It does not cover CRLF vs LF. `hash-newlines.spec.ts` does not call `hashFiles`.

**Missing tests**

- Snapshot scenario: the same text path with `\r\n` and with `\n` yields one digest through `hashFiles`.
- Binary content containing `\r\n` is not rewritten.

Requirements checked: 2. Discrepancies: 1. Missing tests: 2.

---

### Globals

**default:\_global/architecture**

Domain services touched here (`hashFiles`, `applyPreHashCleanup`) do not import infrastructure and do not do I/O. Path helpers live in `infrastructure/fs/path-platform.ts`. The contradiction is the two application imports named under refresh and content-hasher. Composition (`createDefaultConfigLoader`) is allowed to see the VCS adapter.

**default:\_global/testing**

The global spec requires infrastructure integration tests to use `os.tmpdir()` plus a unique directory, cleaned up afterward. It does not mention `chmod`. `move-dir.spec.ts`, `write-atomic.spec.ts`, and `ensure-tmp-gitignore.spec.ts` use `os.tmpdir()` / `mkdtemp` and remove the directory. A search of `packages/**` tests found no `chmod` and no `0o000`. That matches the change design's Windows unreadable-file rule. Hardcoded `/tmp/...` strings remain in unit mocks and error fixtures; they are not temp directories created for adapter I/O.

**default:\_global/conventions**

No requirement in the conventions spec contradicts these path, hash, or retry deltas.

---

## Batch counts

| Spec                                 | Requirements checked | Discrepancies | Missing tests |
| ------------------------------------ | -------------------: | ------------: | ------------: |
| core:config-loader                   |                    4 |             0 |             4 |
| core:vcs-adapter                     |                    4 |             0 |             1 |
| core:file-reader-port                |                    2 |             0 |             0 |
| core:fs-change-repository            |                    4 |             0 |             2 |
| core:fs-spec-repository              |                    3 |             1 |             2 |
| core:fs-archive-repository           |                    1 |             0 |             2 |
| core:refresh-implementation-tracking |                    2 |             2 |             1 |
| core:content-hasher-port             |                    2 |             3 |             2 |
| core:snapshot-hasher                 |                    2 |             1 |             2 |
| **Total**                            |               **24** |         **7** |        **16** |

Confirmed spot checks:

- `windowsHide` is conditional on `win32` in all three `exec.ts` files. No test.
- `moveDir` copies on `EPERM` and `EXDEV`. Only `EXDEV` is tested.
- `normalizeNewlines` runs inside `sha256` and `NodeContentHasher` before the digest. `computeArtifactHash` runs `applyPreHashCleanup` first, and that helper collapses all whitespace, so carriage returns never reach `normalizeNewlines` on the artifact path. `hashFiles` does not collapse whitespace and does not normalize unless the callback does.
- `retryOnLock` is five attempts, delays 50/100/150/200, codes `EPERM` / `EBUSY` / `EACCES`, then the original error. Tests cover five `EBUSY` attempts only.
