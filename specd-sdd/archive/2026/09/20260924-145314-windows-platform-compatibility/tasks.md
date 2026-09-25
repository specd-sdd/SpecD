# Tasks: windows-platform-compatibility

## 1. Path helpers

- [x] 1.1 Add the Windows device-name predicate
      `packages/core/src/domain/services/windows-device-name.ts`: `isWindowsDeviceName` — reject a whole segment that is a device name
      Approach: `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`. No `node:path`. `con-foo` returns false
      (Req: Change names reject Windows device names, Workspace identity, Capability segments reject Windows device names)
- [x] 1.2 Test device-name matching
      `packages/core/test/domain/services/windows-device-name.spec.ts`: cases for `con`, `NUL`, `com1`, `lpt9`, and `con-foo`
      Approach: assert true for the reserved whole names and false for `con-foo`
      (Req: Change names reject Windows device names)
- [x] 1.3 Add path platform helpers
      `packages/core/src/infrastructure/fs/path-platform.ts`: `normalizeVcsRoot`, `isPathInside`, `toPortablePath`, `normalizeNewlines`, `retryOnLock`
      Approach: drive-letter paths use `path.win32` and an uppercase drive letter. `toPortablePath` only replaces `\`. `normalizeNewlines` maps `\r\n` then `\r` to `\n`. `retryOnLock` runs five times and waits 50, 100, 150, 200 ms. Retry only `EPERM`, `EBUSY`, `EACCES`
      (Req: Built-in adapters normalize repository roots, Text newline normalization)
- [x] 1.4 Test path helpers on macOS with Windows strings
      `packages/core/test/infrastructure/fs/path-platform.spec.ts`: drive case, prefix collision, portable `..`, newline normalization, retry budget
      Approach: `isPathInside('C:/repo', 'c:/repo/specd.yaml')` is true and `isPathInside('C:/repo', 'C:/repository')` is false. Fifth `EBUSY` throws the original error
      (Req: Storage path containment)

## 2. VCS roots

- [x] 2.1 Normalize git, hg, and svn roots
      `packages/core/src/infrastructure/git/vcs-adapter.ts`, `hg/vcs-adapter.ts`, `svn/vcs-adapter.ts`: `rootDir` — cache `normalizeVcsRoot(stdout)`
      Approach: trim and resolve with `path.win32` when a drive letter is present. Do not `realpath`. Null adapter still throws
      (Req: Built-in adapters normalize repository roots)
- [x] 2.2 Make modified-file paths portable
      Same three adapters: modified-file mapping — `toPortablePath` each path
      Approach: `replaceAll('\\', '/')` only. `src\..\secret` stays `src/../secret`
      (Req: Built-in adapters normalize repository roots)
- [x] 2.3 Hide VCS consoles on Windows
      `packages/core/src/infrastructure/git/exec.ts`, `hg/exec.ts`, `svn/exec.ts`: `execFile` options — set `windowsHide: true` on `win32`
      Approach: keep `{ cwd }`. Add `windowsHide` only when `process.platform === 'win32'`
      (Req: Built-in adapters normalize repository roots)
- [x] 2.4 Test adapter root and modified-file normalization
      Existing VCS adapter specs: git stdout `c:/repo` returns a `C:` absolute root; backslash modified paths use `/`; null `rootDir` throws
      Approach: stub CLI stdout. Do not spawn a real Windows git
      (Req: Built-in adapters normalize repository roots)

## 3. Containment

- [x] 3.1 Confine config, storage, and workspace spec roots
      `packages/core/src/infrastructure/fs/config-loader.ts`: containment checks — call `isPathInside`
      Approach: delete `startsWith(root + path.sep)`. `rootPath` is the adapter's normalized root. Null root still skips the check
      (Req: Storage path containment, isExternal inference for workspaces, Config file stays inside the repository root)
- [x] 3.2 Confine the file reader
      `packages/core/src/infrastructure/fs/file-reader.ts` and `path-confinement.ts`: escape check — `isPathInside`
      Approach: outside throws the existing `PathTraversalError`. Drive-letter case is inside
      (Req: Path traversal protection)
- [x] 3.3 Confine archive, change, and spec repositories
      `packages/core/src/infrastructure/fs/archive-repository.ts`, `change-repository.ts`, `spec-repository.ts`: path confinement — `isPathInside`
      Approach: `C:/work/application` is outside `C:/work/app`
      (Req: Archive paths stay inside the repository root, Windows path containment and rename recovery)
- [x] 3.4 Fix project-relative implementation paths
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `_toPortableProjectRelativePath` — use `isPathInside`
      Approach: require a separator boundary. Ignore drive-letter case
      (Req: Project-relative paths keep a separator boundary)
- [x] 3.5 Test containment edges
      Config loader, file reader, archive, and refresh-implementation-tracking specs: drive-letter case accepted; `C:/repository` and `C:/work/application` rejected
      Approach: assert `ConfigValidationError` or `PathTraversalError` only for the outside path
      (Req: Config file stays inside the repository root, Project-relative paths keep a separator boundary)

## 4. Renames

- [x] 4.1 Retry atomic renames
      `packages/core/src/infrastructure/fs/write-atomic.ts`: destination `rename` — wrap with `retryOnLock`
      Approach: five attempts, then the original `EPERM`, `EBUSY`, or `EACCES`
      (Req: Windows path containment and rename recovery, Publication rename recovery)
- [x] 4.2 Copy directory moves on EPERM and EXDEV
      `packages/core/src/infrastructure/fs/move-dir.ts`: move fallback — also copy on `EPERM` and `EXDEV`
      Approach: keep the existing `ENOTEMPTY` and `EEXIST` fallback
      (Req: Windows path containment and rename recovery)
- [x] 4.3 Retry spec publication and storage-generation renames
      `packages/core/src/infrastructure/fs/spec-repository.ts`: publication `rename` — `retryOnLock`. `packages/code-graph/src/infrastructure/storage-generation.ts`: `retryLocked` and `retryLockedAsync` — same attempts, delays, and lock codes
      Approach: differing artifact bytes are not success
      (Req: Publication rename recovery, Locked recreation preserves the index lease)
- [x] 4.4 Compare the tmp gitignore after newline normalization
      `packages/core/src/infrastructure/fs/ensure-tmp-gitignore.ts`: equality — `normalizeNewlines` both sides
      Approach: success only for this file. Other artifacts stay byte-strict
      (Req: Publication rename recovery)
- [x] 4.5 Test retry, copy fallback, and gitignore equality
      `write-atomic.spec.ts`, `move-dir` coverage, spec-repository publication test, ensure-tmp-gitignore test
      Approach: one `EBUSY` then success; five `EBUSY` throw; `EXDEV` copies; `\r\n` gitignore matches LF
      (Req: Publication rename recovery)

## 5. Hashes

- [x] 5.1 Normalize text before artifact, content, and snapshot hashes
      `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`, `packages/core/src/infrastructure/node/content-hasher.ts`, `packages/core/src/infrastructure/fs/hash.ts`: hash input — `normalizeNewlines` for text
      Approach: LF-only digests stay identical. Do not normalize binary bytes
      (Req: Text newline normalization, Determinism)
- [x] 5.2 Test CRLF and LF equality
      Hasher specs: `\r\n` text matches `\n` text; a lone `\r` matches `\n`; an LF fixture matches the previous digest
      Approach: store one known LF vector and compare
      (Req: Text newline normalization)

## 6. Hooks

- [x] 6.1 Insert run-hook values verbatim
      `packages/core/src/application/template-expander.ts`: `expand` — developer `run:` commands use verbatim substitution
      Approach: `expandForShell` stays for a command SpecD builds itself. `HookRunner` does not call it. Do not wrap substituted values
      (Req: Shell escaping for run hooks, Shell escaping)
- [x] 6.2 Translate quote syntax for the host shell and spawn cmd.exe verbatim
      `packages/core/src/infrastructure/node/translate-hook-command.ts`: `translateHookCommand` — single quotes to cmd doubles, cmd `""` to POSIX `\"`
      `packages/core/src/infrastructure/node/hook-runner.ts`: spawn options — `cmd.exe /d /s /c`, `windowsVerbatimArguments: true`, `windowsHide: true` on win32
      Approach: do not rewrite `%`, program names, or flags. Other platforms stay on `/bin/sh -c`. Do not add an `execFile` shortcut
      (Req: Shell escaping)
- [x] 6.3 Test nested quotes and composed paths
      `packages/core/test/infrastructure/node/translate-hook-command.spec.ts` and `hook-runner.spec.ts`: quotes inside quotes, `'\''`, empty `""`, a path built from several variables, and a value containing a space, `%PATH%`, and `&` inside developer quotes
      Approach: the translator is tested on both hosts without spawning Windows. The runner test executes the POSIX path
      (Req: Shell escaping for run hooks)

## 7. Names

- [x] 7.1 Reject device-name change slugs
      `packages/core/src/domain/entities/change.ts`: slug validation — call `isWindowsDeviceName` after the existing pattern
      Approach: reuse the current invalid-name error. `con-foo` stays valid
      (Req: Change names reject Windows device names)
- [x] 7.2 Reject device-name workspace names
      Workspace name validator: reserved set — add device names beside `default` and `root`
      Approach: whole name only. `con-foo` remains legal
      (Req: Workspace identity)
- [x] 7.3 Reject device-name capability segments
      Spec-id parser: each capability segment — `isWindowsDeviceName`
      Approach: split the capability path on `/`. Do not treat a drive letter as a workspace
      (Req: Capability segments reject Windows device names)
- [x] 7.4 Test name rejection
      Change, workspace, and spec-id specs: `con` and `com1` rejected; `con-foo` accepted
      Approach: one assertion per validator
      (Req: Change names reject Windows device names, Workspace identity, Capability segments reject Windows device names)

## 8. Graph

- [x] 8.1 Add workspace-identity splitting
      `packages/code-graph/src/domain/services/split-workspace-identity.ts`: `isDriveLetterPath`, `splitWorkspaceIdentity`, `toPortableGraphPath`
      Approach: `^[A-Za-z]:[/\\]` returns null. Otherwise split on the first `:`
      (Req: Drive letters are not workspace names, Portable graph paths)
- [x] 8.2 Use the splitter in the indexer, workspace integration, and impact selectors
      Indexer persistence, workspace-integration identity parsing, `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`: colon splits — call `splitWorkspaceIdentity`
      Approach: null means the drive letter stays part of the path. Persist relative paths with `toPortablePath`
      (Req: Portable graph paths, Drive letters are not workspace names)
- [x] 8.3 Retry sqlite recreation and keep the index lock
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` and `sqlite-graph-database.ts`: `recreate` — delete the db, `-wal`, and `-shm` through the local lock retry
      Approach: do not delete `graph/index.lock`
      (Req: Locked recreation preserves the index lease)
- [x] 8.4 Release the index lease on exit and SIGBREAK
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`: signal handlers — add `exit` and `SIGBREAK`
      Approach: keep `SIGINT` and `SIGTERM`. Release only the lease this process holds
      (Req: Index lease release on exit)
- [x] 8.5 Test graph identity, recreate, and lease release
      Indexer, workspace-integration, sqlite recreate, and supervisor specs
      Approach: `C:/repo/src/a.ts` is not workspace `C`. `src\..\secret` persists as `src/../secret`. A live `index.lock` remains. `exit` and `SIGBREAK` release the lease
      (Req: Portable graph paths, Index lease release on exit)

## 9. Repository support

- [x] 9.1 Force LF for text checkout
      `.gitattributes`: eol rules — `* text=auto eol=lf` plus md, yaml, yml, and json `eol=lf`
      Approach: do not mark binary types as text
      (Req: Text newline normalization)
- [x] 9.2 Track workflow files only
      `.gitignore`: replace `.github/` with `.github/*`, `!.github/workflows/`, and `!.github/workflows/**`
      Approach: agents, skills, and `copilot-instructions.md` stay ignored
      (Req: Workflow file is tracked)
- [x] 9.3 Add the three-OS CI workflow
      `.github/workflows/ci.yml`: matrix `macos-latest`, `ubuntu-latest`, `windows-latest`
      Approach: checkout, pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm test`. Triggers are pull requests and pushes to `main`. Same steps on `macos-latest`, `ubuntu-latest`, and `windows-latest`. Do not call Gemini. `pnpm test` is the widened root script from task 9.6
      (Req: Three operating systems, When the workflow runs, Toolchain install, Checks)
- [x] 9.6 Include guide, sdk, skills, and plugins in pnpm test
      `package.json`: scripts `test` and `preflight:test` — `test` adds turbo filters for `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and each `@specd/plugin-agent-*`. `preflight:test` becomes `pnpm test`
      Approach: keep `@specd/core`, `@specd/cli`, and `@specd/code-graph`. Leave `@specd/mcp` and `@specd/public-web` out of `test`
      (Req: Checks)
- [x] 9.4 Remove bash from lint-staged
      `package.json`: `lint-staged` `*.ts` — replace `bash -c 'pnpm typecheck'` with `pnpm typecheck`
      Approach: eslint and prettier steps stay
      (Req: Fixtures are valid on Windows)
- [x] 9.5 Point fixtures at the OS temp directory
      Tests that hardcode `/tmp`, `/var/www`, or `file:///tmp/`, including `get-graph-health.spec.ts`
      Approach: `os.tmpdir()` and `pathToFileURL`. On Windows, do not use `chmod 0o000` as the unreadable condition
      (Req: Fixtures are valid on Windows)

## 10. Verification

- [x] 10.1 Run the affected package checks
      Repo root: `pnpm typecheck`, `pnpm build`, and `pnpm test`
      Approach: `pnpm test` covers core, cli, code-graph, guide, sdk, skills, plugin-manager, and the plugin-agent packages. A Windows checkout must load a `C:/` git root without `configPath resolves outside VCS root`
      (Req: Config file stays inside the repository root)

## 11. Audit follow-up

- [x] 11.1 Surface the original publication rename error
      `packages/core/src/infrastructure/fs/spec-repository.ts`: publication `rename` — after `retryOnLock`, throw the original `ErrnoException` with its `code`
      Approach: do not wrap that failure in an error that keeps only `message`
      (Req: Publication rename recovery)
- [x] 11.2 Move newline normalization into the domain
      `packages/core/src/domain/services/normalize-newlines.ts`: `normalizeNewlines`
      Approach: `sha256`, `NodeContentHasher`, and `computeArtifactHash` import the domain function. Application does not import `infrastructure/` for this helper. Pre-hash cleanup stays as it is
      (Req: Text newline normalization)
- [x] 11.3 Inject path containment into refresh
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `_toPortableProjectRelativePath` — receive `isPathInside` from composition
      Approach: delete the infrastructure import from the use case
      (Req: Project-relative paths)
- [x] 11.4 Apply the drive-letter split at the remaining identity sites
      Language-adapter relative imports, scoped binding, `compute-hotspots` `extractWorkspace`, SQLite workspace inclusion, and CLI display in `impact.ts`, `search.ts`, and `hotspots.ts`
      Approach: use `splitWorkspaceIdentity` or the same drive-letter rule. A filter of workspace `C` does not match `C:/...`. PHP namespace backslashes stay local
      (Req: Portable graph paths, Drive letters are not workspace names)
- [x] 11.5 Align hook wording with verbatim substitution
      `docs/guide/workflow.md` and `TemplateExpander` JSDoc
      Approach: the guide says verbatim values, quote translation, and non-Windows execution via absolute `SHELL` or `/bin/sh`. JSDoc says `expand()` is the developer `run:` path and `expandForShell()` is only for commands SpecD builds
      (Req: User guide documentation and frontmatter)
- [x] 11.6 Cover the untested Windows branches
      Tests for `windowsHide` on git, hg, and svn; `moveDir` on `EPERM`; publication `EBUSY` keeping `code`; SQLite recreate `EBUSY` on the WAL file; `matchesExclude` on `C:/...`; workspace `con-foo`
      Approach: assert the behavior on any OS by passing the strings or mocking the platform check. Do not require a Windows runner
      (Req: Windows VCS spawns hide the console, Publication rename recovery, Locked recreation preserves the index lease)

## 12. Second audit follow-up

- [x] 12.1 Reject a config file outside the repository
      `packages/core/src/infrastructure/fs/config-loader.ts`: `load` — `isPathInside(rootPath, rootConfigPath)` when `rootPath` is non-null
      Approach: throw `ConfigValidationError` for `C:/other/specd.yaml` when the root is `C:/repo`. A mixed-separator path inside the root still loads. Discovery that already stops at the VCS root stays
      (Req: Config file stays inside the repository root)
- [x] 12.2 Treat the project root as inside without excluding the tree
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `_toPortableProjectRelativePath`, `_collectExclusions`
      Approach: the root returns `''`. Exclusions omit `''`. `null` still means outside
      (Req: Project-relative paths keep a separator boundary)
- [x] 12.3 Cover the remaining audit gaps
      Tests: `hashFiles` passes `\r\n` through to `hashContent`; hook spawn uses `cmd.exe /d /s /c` with verbatim arguments and `windowsHide`, and non-Windows uses absolute `$SHELL` or `/bin/sh` with `-c`; five `EBUSY` failures on the WAL surface the original error; SQLite inclusion, scoped binding, and `goPackageSurface` do not treat `C:/repo/src/a.ts` as workspace `C`
      Approach: assert on any OS with strings or a mocked platform check
      (Req: hashFiles forwards the string, Shell escaping, Locked recreation preserves the index lease, Drive letters are not workspace names)

## 13. Third audit follow-up

- [x] 13.1 Treat a bare drive letter as a path
      `packages/code-graph/src/domain/services/split-workspace-identity.ts`: `isDriveLetterPath` — also match `^[A-Za-z]:$`
      Approach: `splitWorkspaceIdentity('C:')` returns null. `goPackageSurface('C:/a.go')` stays `C:` and that surface is not workspace `C`
      (Req: Drive letters are not workspace names, Portable graph paths)
- [x] 13.2 Lock the hook contract in tests
      Tests: `RunStepHooks` records `echo "Resultado: {{change.name}}"` unchanged; Windows spawn receives the translated single-quoted command together with `cmd.exe /d /s /c`, verbatim arguments, and `windowsHide`; `expand()` substitutes a number and a boolean; cmd `expandForShell` doubles an embedded `"`
      Approach: assert the strings on any OS. Do not add quotes in `RunStepHooks`
      (Req: Result shape, Shell escaping, Template variable expansion)
- [x] 13.3 Reject prn and aux
      Tests for workspace names and capability segments `prn` and `aux`
      Approach: same rejection as `con` and `nul`. `con-foo` stays legal
      (Req: Windows device names are reserved workspace names, Capability segments reject Windows device names)

## 14. Fourth audit follow-up

- [x] 14.1 Match the CLI drive-letter split to the shared helper
      `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`: `isDriveLetterPath` — match `^[A-Za-z]:[/\\]` and `^[A-Za-z]:$`
      Approach: keep the local copy. Do not import `@specd/code-graph`. `splitWorkspaceIdentity('C:')` returns null. `C:/repo/src/a.ts` stays a drive path
      (Req: Drive letters are not workspace names)
- [x] 14.2 Match exclusion to the same bare-drive rule
      `packages/code-graph/src/domain/services/matches-exclude.ts`: `extractWorkspace` — return null for `C:` as well as `C:/...`
      Approach: use `/^[A-Za-z]:(?:[/\\]|$)/` before the colon split. `matchesExclude('C:', …, ['C'])` does not treat that identity as workspace `C`
      (Req: Drive letters are not workspace names)
- [x] 14.3 Drop `change.workspace` from the nested-path runner fixture
      `packages/core/test/infrastructure/node/hook-runner.spec.ts`: `expands change variables when present` — the variables object includes `workspace: 'default'`
      Approach: delete the `workspace` key. Keep `name` and `path`. The assertion still expects `add-auth`. Do not strip unknown keys inside `NodeHookRunner`
      (Req: Template variable expansion)
- [x] 14.4 Lock the non-fs containment skip
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: one storage binding whose adapter is not `fs`, and one workspace specs adapter that is not `fs`
      Approach: `load()` does not call `isPathInside` for that storage binding. The workspace `isExternal` is false. Existing `fs` outside-root rejection stays
      (Req: Storage path containment, isExternal inference for workspaces)
