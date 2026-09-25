# Proposal: windows-platform-compatibility

## Motivation

SpecD assumes POSIX paths, shells, and renames. On native Windows that fails at config load, breaks hooks, and makes hashes and graph locks disagree with macOS and Linux. The product documents Windows as supported.

## Current behaviour

`GitVcsAdapter.rootDir()` stores `git rev-parse --show-toplevel` unchanged. Git for Windows prints `C:/Users/...`. `FsConfigLoader` then checks `startsWith(root + path.sep)`, which looks for `C:/Users/...\\` and rejects a real config with `configPath resolves outside VCS root`. The same check marks storage paths and workspace spec roots as outside the repo. Mercurial (`hg root`) and Subversion (`svn info --show-item wc-root`) already print backslashes, so they usually pass the separator check and still fail when the drive letter case differs (`c:` vs `C:`). `NullVcsAdapter` has no root.

`shellEscape` wraps values in single quotes. `NodeHookRunner` runs that string through `cmd.exe /c` without `windowsVerbatimArguments`. Spaces, `%VAR%`, and `&` split or expand the command. `git`, `hg`, and `svn` are spawned with `execFile` and only `{ cwd }`, so a GUI host can flash a console.

`writeFileAtomic` renames a temp file onto the destination and treats any `EPERM` or `EBUSY` as failure. `moveDir` only falls back to copy on `ENOTEMPTY` and `EEXIST`, not on `EPERM` or `EXDEV`. Spec publication swaps directories with `rename`. Those calls succeed on POSIX and fail when Windows has the destination open or the rename crosses a volume.

Text hashes digest raw UTF-8. There is no `.gitattributes`. A CRLF checkout of the same spec produces a different SHA-256 and a false artifact drift. `ensureTmpGitignore` compares the file to an LF-only string, so it rewrites the file on every run.

The code-graph indexer already stores relative paths with `/`. Splitting a key on the first `:` treats a Windows drive letter as a workspace. `SQLiteGraphStore.recreate()` deletes `graph/`, including `graph/index.lock`, and a locked `-wal` or `-shm` file makes `rm` fail with `EBUSY`. Lock release listens for `SIGTERM`, which Windows often does not deliver.

Change names, workspace names, and capability segments allow `con`, `nul`, `aux`, `prn`, `com1`, and `lpt1`. Those names cannot be directories on Windows. Tests hardcode `/tmp`, `/var/www`, and `file:///tmp/...`. `chmod 0o000` does not make a file unreadable on Windows. GitHub Actions does not run typecheck, build, or the test suite on any OS. `lint-staged` invokes `bash -c`.

`path.join` is the correct API for filesystem paths. The bugs are string compares, persisted identities, and POSIX shell and rename assumptions.

## Proposed solution

Add three infrastructure helpers in `@specd/core` and call them at boundaries. Do not wrap `path.join`.

- `normalizeVcsRoot` resolves the CLI stdout and uppercases the drive letter. Git, Mercurial, and Subversion `rootDir()` all return that value. It stays a valid `cwd` for later CLI calls.
- `isPathInside` uses `path.relative` after resolve. Empty means the candidate is the root. A result that starts with `..` or is absolute is outside. Replace `startsWith(root + path.sep)` in the config loader, file reader, spec repository, archive repository, and change repository.
- `toPortablePath` replaces `\` with `/` and does not collapse `.` or `..`. Use it where a path is stored or compared across machines: VCS modified-file lists and graph persistence boundaries. Do not route PHP namespace separators through it.

Retry `rename` on `EPERM`, `EBUSY`, and `EACCES` in `writeFileAtomic`, storage-generation rotation, and spec publication. `moveDir` also copies on `EPERM` and `EXDEV`. Treat identical destination bytes as success only for the tmp `.gitignore`.

Developer `run:` values are inserted verbatim. SpecD then translates only quote syntax the host shell does not understand, and spawns `cmd.exe` with `windowsVerbatimArguments` on Windows. Set `windowsHide` on Windows spawns of hooks, git, hg, and svn. `ContentHasher` and the shared text `sha256` helper normalize `\r\n` and `\r` to `\n` before the digest. Artifact hashes still collapse whitespace in pre-hash cleanup. Compare the tmp gitignore after newline normalization. Add `.gitattributes` so markdown, YAML, and JSON check out as LF.

`HookVariables` has no `change.workspace`. It is the `TemplateVariables` alias, not a domain value object. `project.root` comes from the expander. `RunStepHooks` reports the schema command; `HookRunner` expands it. Verify examples follow that split: they do not pass `change.workspace`, and they do not say that `RunStepHooks` expands the command. `hashFiles` forwards each string unchanged. The project root is inside the repo, and its empty portable path is not an exclusion prefix. `load()` rejects a config file that sits outside the normalized VCS root. Storage-path and workspace `isExternal` checks use that same inside-root rule only for `fs` bindings. A non-fs binding is not a filesystem path. A bare drive letter `C:` is not workspace `C`. The shared graph splitter, the exclusion extractor, and the CLI display splitter all use that rule.

Guard workspace-key splits so `^[A-Za-z]:[/\\]` is a drive letter. On graph recreate, retry deletion of the sqlite file and its WAL sidecars, and do not drop a live `index.lock`. Release that lease on `exit` and on `SIGBREAK`.

Reject Windows device names as a whole path segment on every OS for change names, workspace names, and spec capability segments. `con-foo` stays legal. Keep the existing lowercase patterns.

Point tests at `os.tmpdir()` and `pathToFileURL`. Do not use `chmod 0o000` as "unreadable" on Windows. Drop `bash -c` from `lint-staged`.

Add one workflow, `.github/workflows/ci.yml`, with the same steps on `macos-latest`, `ubuntu-latest`, and `windows-latest`. It runs on pull requests and on pushes to `main`. A runner starts empty, so each job does this in order:

1. Check out the repo.
2. Install the pnpm `10.6.5` binary. The runner does not have it.
3. Install Node 22. That matches `@types/node` in the repo and the documented `>= 20.18` requirement.
4. Run `pnpm install --frozen-lockfile`. This fills `node_modules` from the lockfile and runs build scripts only for dependencies that are both installed and allowlisted. The native packages this repo still installs are `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. `core-js` and `core-js-pure` are also allowlisted, and they are plain JavaScript. `better-sqlite3` uses `prebuild-install` to fetch the binary for that OS, CPU, and Node ABI, and compiles with node-gyp only when that prebuild is missing. `@ast-grep/napi` and the language packages, plus `esbuild`, install their own platform binaries in this same step. GitHub-hosted runners already include Python and a C++ toolchain, which is what node-gyp needs for that fallback. The workflow does not add apt, brew, or Chocolatey packages on top.
5. Run `pnpm typecheck`, `pnpm build`, and `pnpm test`. `typecheck` and `build` skip `@specd/public-web`. `pnpm test` runs Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and every `@specd/plugin-agent-*` package. `@specd/mcp` and `@specd/public-web` stay out of that script.

The workflow does not run the web app, changeset status, publish, or Gemini. A failing job fails the check.

`.gitignore` currently ignores the whole `.github/` directory, so tracking `ci.yml` also tracks the six Gemini workflows already in `.github/workflows/`. Agents, skills, and `copilot-instructions.md` stay ignored.

## Specs affected

### New specs

- `default:_global/continuous-integration`: GitHub Actions runs the same install, typecheck, build, and `pnpm test` on macOS, Linux, and Windows.
  - Depends on (added): `default:_global/testing`
  - Depends on (removed): none

### Modified specs

- `core:config-loader`: containment uses a resolved root from the VCS adapter, not a raw prefix compare.
  - Depends on (added): `core:vcs-adapter`
  - Depends on (removed): none
- `core:vcs-adapter`: Git, Mercurial, and Subversion roots are normalized before they are cached.
  - Depends on (added): none
  - Depends on (removed): none
- `core:hook-runner-port`: developer hook values stay verbatim; the runner translates quotes and hides the Windows console.
  - Depends on (added): `core:template-variables`
  - Depends on (removed): none
- `core:template-variables`: `expand()` inserts developer values verbatim. `expandForShell()` remains for commands SpecD builds.
  - Depends on (added): none
  - Depends on (removed): none
- `core:content-hasher-port`: `ContentHasher` and text `sha256` normalize newlines. Artifact hashes collapse whitespace first.
  - Depends on (added): none
  - Depends on (removed): none
- `core:snapshot-hasher`: file fingerprints use that same text normalization.
  - Depends on (added): `core:content-hasher-port`
  - Depends on (removed): none
- `core:fs-change-repository`: path containment, directory moves, and lock-error retries follow Windows rename rules.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-spec-repository`: publication renames retry lock errors, and the tmp gitignore compare ignores newline spelling.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-archive-repository`: archive path confinement uses the shared inside-root check.
  - Depends on (added): none
  - Depends on (removed): none
- `core:file-reader-port`: the filesystem reader rejects escapes with the shared inside-root check, including drive-letter case.
  - Depends on (added): none
  - Depends on (removed): none
- `core:refresh-implementation-tracking`: project-relative paths require a separator boundary and ignore drive-letter case.
  - Depends on (added): `core:vcs-adapter`
  - Depends on (removed): none
- `core:change`: a change name that is a Windows device name is invalid on every OS.
  - Depends on (added): none
  - Depends on (removed): none
- `core:workspace`: a workspace name that is a Windows device name is invalid on every OS, in addition to the existing reserved names `default` and `root`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:spec-id-format`: a capability-path segment that is a Windows device name is invalid on every OS.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: recreate retries locked WAL files and preserves a live `index.lock`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:isolated-index-worker`: the index lease is released on process exit and on `SIGBREAK`.
  - Depends on (added): `code-graph:sqlite-graph-store`
  - Depends on (removed): none
- `code-graph:indexer`: persisted relative paths are portable, and every graph-identity split keeps a drive letter in the path.
  - Depends on (added): `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`
  - Depends on (removed): none
- `code-graph:workspace-integration`: exclusion, hotspots, SQLite inclusion, and CLI display do not treat `C:` as a workspace name.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/testing`: filesystem fixtures and unreadable-file setups are valid on Windows.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/docs`: the workflow guide documents verbatim `run:` substitution, quote translation, and non-Windows execution via absolute `SHELL` or `/bin/sh`.
  - Depends on (added): none
  - Depends on (removed): none

`core:vcs-adapter-port` stays out of scope. It does not require raw CLI path spelling. Adapter normalization is enough.

## Impact

Minimum code touch, all under owned workspaces `core`, `code-graph`, and the repo root for tests and checkout rules:

- `packages/core/src/infrastructure/git/vcs-adapter.ts`, `hg/vcs-adapter.ts`, `svn/vcs-adapter.ts`, and their `exec.ts` files
- `packages/core/src/composition/config-loader.ts`
- `packages/core/src/infrastructure/fs/config-loader.ts`, `path-confinement.ts`, `file-reader.ts`, `archive-repository.ts`, `spec-repository.ts`, `change-repository.ts`, `write-atomic.ts`, `move-dir.ts`, `ensure-tmp-gitignore.ts`
- `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`
- `packages/core/src/application/template-expander.ts` (`shellEscape`)
- `packages/core/src/infrastructure/node/hook-runner.ts`
- `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`, `packages/core/src/infrastructure/node/content-hasher.ts`, `packages/core/src/infrastructure/fs/hash.ts`
- `packages/core/src/domain/entities/change.ts` and the workspace and spec-id validators
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`, `sqlite-graph-database.ts`, `storage-generation.ts`, `index-lock.ts`, `isolated-index-worker/supervisor.ts`
- graph identity splits in the indexer and `code-graph:workspace-integration` consumers, including `packages/code-graph/src/domain/services/matches-exclude.ts` and the CLI copy in `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`
- test fixtures that hardcode `/tmp` or `file:///tmp`, plus `get-graph-health.spec.ts` chmod
- `.gitattributes`, root `package.json` `lint-staged`, `.gitignore`, and `.github/workflows/` (`ci.yml` for macOS, Ubuntu, and Windows, plus the six Gemini workflows already there)

`writeFileAtomic` is the shared writer. Retry belongs there so callers do not each invent a Windows path. PHP PSR-4 joins that turn a namespace `\` into `path.sep` stay as they are.

These specs already overlap other active changes: `code-graph:indexer`, `code-graph:sqlite-graph-store`, `core:change`, `core:refresh-implementation-tracking`, and `core:vcs-adapter`. Deltas stay limited to the Windows behaviour above.

## Technical context

Agreed in discovery and confirmed when the change was created:

- `path.join`, `path.resolve`, and `path.sep` remain the filesystem APIs.
- Helpers are infrastructure because they use `node:path`. The domain receives already-normalized strings.
- `normalizeVcsRoot` uses `path.resolve` and an uppercase drive letter. It does not `realpath` a root that may not exist yet. Existing `realpath` checks, such as empty-parent pruning, stay.
- `toPortablePath` is not `path.posix.normalize` and not the existing `normalizeRelativePath`.
- About thirty local `replaceAll('\\', '/')` copies do not all move in this change. Persistence boundaries do.
- Identical-bytes success applies only to the tmp `.gitignore`.
- A short bounded retry is required. The count and delay are a design parameter, not a spec fork.
- Developer `run:` hooks stay on the shell. SpecD does not switch them to `execFile`, and it does not escape `%`. Quote translation only rewrites syntax the host shell does not understand.
- Do not redesign PID-reuse detection for change locks.
- `MAX_PATH` stays an install note, not a code change, unless implementation finds a concrete failing path. `better-sqlite3` and the other allowlisted native packages are installed by `pnpm install` inside `ci.yml`, not by a separate system-package step.
- `.gitattributes` and `lint-staged` are repo support for the hash and hook requirements. `ci.yml` is specified by `default:_global/continuous-integration`. `ci.yml` is a matrix of `macos-latest`, `ubuntu-latest`, and `windows-latest`. Each job installs the pnpm `10.6.5` binary, installs Node 22, runs `pnpm install --frozen-lockfile` so the allowlisted native modules are fetched or compiled for that runner, then runs `pnpm typecheck`, `pnpm build`, and `pnpm test`. `pnpm test` includes core, cli, code-graph, guide, sdk, skills, plugin-manager, and the plugin-agent packages. Tracking workflows means replacing the blanket `.github/` ignore with a rule that re-includes `.github/workflows/` and leaves the rest of `.github/` ignored. Git cannot re-include a file while a parent directory stays excluded, so the ignore has to open that directory explicitly. The six Gemini workflows are the Google starter for issue and pull-request automation. SpecD does not call them, and `ci.yml` does not call them. They run only after they are on the default branch and the repo has Gemini or GCP credentials. `gemini-plan-execute.yml` can write to the repo. `gemini-scheduled-triage.yml` runs every hour.
- The installation-guide wording that both recommends WSL and says Windows is fully supported is out of scope.

## Open questions

None. Discovery already settled the behaviour above. Retry timing is a design parameter. The single-executable `execFile` shortcut for developer hooks is rejected.
