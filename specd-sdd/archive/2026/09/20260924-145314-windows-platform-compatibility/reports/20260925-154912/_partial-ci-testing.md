# CI, testing, and docs specs

Read-only audit of requirements this change added or modified. Spec text is the change `spec-preview` for `windows-platform-compatibility`. Unchanged clauses in `default:_global/testing` and `default:_global/docs` are out of scope. Neither the spec nor the code was treated as automatically right.

Scope:

- `default:_global/continuous-integration` — new spec (no base). All five requirements.
- `default:_global/testing` — added requirement `Fixtures are valid on Windows`.
- `default:_global/docs` — modified bullet inside `Requirement: User guide documentation and frontmatter`. The base text required documenting template substitution “including shell escaping for `run:` commands.” The merged text requires verbatim `run:` insertion, quote-syntax translation only, non-Windows execution via an absolute `SHELL` or otherwise `/bin/sh`, and forbids describing that substitution as shell escaping. The matching verify scenario was updated the same way. A punctuation-only change in an ADR sentence is not a requirement change.

Checked files: `.github/workflows/ci.yml`, `.gitignore`, root `package.json` scripts, `pnpm-workspace.yaml`, `docs/guide/workflow.md`, `packages/core/src/infrastructure/node/hook-runner.ts`, and the Vitest suite under `packages/`.

## default:\_global/continuous-integration

### Requirements Summary

1. **Workflow file is tracked.** The repository must track `.github/workflows/ci.yml`. Tracking that directory must not require tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` must stay ignored. Gemini workflow files may be tracked because they share `.github/workflows/`; this spec does not define their behavior.
2. **Three operating systems.** `ci.yml` must run the same job on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any one of those runners must fail the check.
3. **When the workflow runs.** The workflow must run on pull requests and on pushes to `main`. It must not call the Gemini workflows.
4. **Toolchain install.** Each job must check out the repository, install the pnpm `10.6.5` binary, install Node 22, and run `pnpm install --frozen-lockfile`. That install must be what builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. The workflow must not install extra apt, brew, or Chocolatey packages for them.
5. **Checks.** Each job must run `pnpm typecheck`, `pnpm build`, and `pnpm test`, in that order. `typecheck` and `build` must skip `@specd/public-web`. `pnpm test` must run Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, `@specd/plugin-agent-claude`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`, and `@specd/plugin-agent-standard`. It must not include `@specd/mcp` or `@specd/public-web`. The workflow must not run changeset status or publish.

### Implementation Status

All five requirements are met.

**Workflow file is tracked.** `.gitignore` contains `.github/*`, then `!.github/workflows/` and `!.github/workflows/**`. `git check-ignore -q` exits 1 for `.github/workflows/ci.yml` and for a hypothetical `.github/workflows/gemini-review.yml` (not ignored). It exits 0 for `.github/copilot-instructions.md`. Verbose matching ignores `.github/skills/foo` via `.github/*`, and ignores `.agents/foo`, `.claude/skills/x`, `.codex/skills/x`, `.opencode/skills/x`, `.gemini/foo`, and `skills-lock.json` via their own patterns. `.github/agents/` and `.github/skills/` are therefore ignored; only the workflows directory is re-included. `ci.yml` is present on disk. `git ls-files` does not list it yet (`?? .github/`). The verify scenario is Git’s ignore decision, which matches. An uncommitted workflow in an active change is not a failure of that scenario.

**Three operating systems.** One job, `check`, uses `strategy.matrix.os` with `macos-latest`, `ubuntu-latest`, and `windows-latest`, and the same step list on `${{ matrix.os }}`. `fail-fast: false` does not keep a red matrix job from failing the workflow; it only lets the other runners finish. GitHub marks the check failed when any matrix job fails.

**When the workflow runs.** Triggers are `pull_request` (default types include opened and synchronize) and `push` to `main`. The file has no `workflow_call`, no Gemini job, and no step that invokes a Gemini workflow. Gemini command files under `.github/commands/` stay ignored and are not called.

**Toolchain install.** Steps are `actions/checkout@v4`, `pnpm/action-setup@v4` with `version: 10.6.5`, `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm`, then `pnpm install --frozen-lockfile`. There is no apt, brew, or choco step. Root `packageManager` is `pnpm@10.6.5`. `pnpm-workspace.yaml` `onlyBuiltDependencies` lists `better-sqlite3`, the three `@ast-grep/lang-*` packages, and `esbuild`, plus `core-js` and `core-js-pure`. `@specd/code-graph` depends on `better-sqlite3` and the three `@ast-grep/lang-*` packages. `esbuild` is present in `pnpm-lock.yaml` (`esbuild@0.27.3` and `esbuild@0.27.7`). The frozen install is what builds those modules. Extra allowlist entries are not forbidden.

**Checks.** After install, the job runs `pnpm typecheck`, then `pnpm build`, then `pnpm test`, and nothing else. Root scripts:

- `typecheck`: `turbo typecheck --filter=!@specd/public-web`
- `build`: `turbo build --filter=!@specd/public-web`
- `test`: `turbo test --concurrency=3` with filters for exactly the twelve packages named above

Each of those twelve packages has `"test": "vitest run"`. `@specd/mcp` has a Vitest script and is not in the filter. `@specd/public-web` is not in the filter. The workflow does not run changeset status or publish. The spec requires `typecheck` and `build` to skip public-web; it does not require them to skip `@specd/mcp`, so including mcp in those two tasks is allowed.

### Discrepancies

None.

### Test Coverage

Workflow files have no Vitest. File inspection is the check, and the files match the spec.

| Verify scenario                                             | Result                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Only workflows are re-included                              | `ci.yml` is not ignored; `.github/copilot-instructions.md` is ignored                                |
| One red runner fails the check                              | Same job on the three-OS matrix; a failed matrix job fails the workflow                              |
| A pull request starts the workflow and does not call Gemini | `on.pull_request` is set; no Gemini call                                                             |
| A push to main starts the workflow                          | `on.push.branches` is `main`                                                                         |
| Native modules come from pnpm install                       | pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`; no apt, brew, or choco                     |
| The three commands run in order                             | `pnpm typecheck`, `pnpm build`, `pnpm test`                                                          |
| `pnpm test` includes guide, sdk, skills, and plugins        | Root `test` script lists those packages plus core, cli, and code-graph, and omits mcp and public-web |

### Missing Tests

None. The verify scenarios are properties of `ci.yml`, `.gitignore`, and the root scripts. Inspection confirms them. There is no separate test runner to add inside the workflow.

### Summary counts

- Requirements checked: 5
- Met: 5
- Discrepancies: 0
- Missing tests: 0

## default:\_global/testing

### Requirements Summary

**Fixtures are valid on Windows** (added). Filesystem tests must locate temporary directories with `os.tmpdir()` and must build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...` paths. A test that needs an unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the Windows process cannot read, or the scenario must be skipped where that permission bit has no effect.

Verify scenarios: a created temporary directory is under `os.tmpdir()` and does not hardcode `/tmp` or `file:///tmp/`; on Windows, an unreadable file is not produced with `chmod 0o000`.

### Implementation Status

Met.

Created fixtures use `os.tmpdir()` or `tmpdir()` with `mkdtemp` or `mkdtempSync`. Examples: `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `spec-repository.spec.ts`, `change-repository.spec.ts`, and `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`. Worker and barrel tests build module URLs with `pathToFileURL` from a path under `tmpdir()` in `packages/code-graph/test/barrel.spec.ts`, `infrastructure/isolated-index-worker/signals.spec.ts`, `supervisor.spec.ts`, and `dist.spec.ts`.

A search of `*.{ts,js,mjs}` found no `chmod`, `chmodSync`, or `0o000`, no `/var/www`, no `file:///tmp`, and no `mkdtemp`, `mkdir`, `writeFile`, or `path.resolve` call aimed at a literal `/tmp` path.

`get-graph-health.spec.ts` creates the directory with `mkdtempSync` under `tmpdir()`, writes a real file, and mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. That is a file the process cannot read without using `chmod 0o000`.

`'/tmp/...'` strings remain in mocks, stub return values, and expected CLI arguments (for example change paths in CLI command specs and `path: '/tmp/changes/add-auth'` in `hook-runner.spec.ts`). Those tests do not create a directory at `/tmp`. This change’s design lists leftover `/tmp` strings inside mocks as outside the Windows contract. The requirement forbids depending on those paths for fixtures and file URLs. String fixtures that are never created do not violate it.

### Discrepancies

None.

### Test Coverage

The requirement is a property of the suite. Inspection is the check.

| Verify scenario                                         | Result                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Temporary paths come from the OS                        | Created temp directories use `os.tmpdir()` / `tmpdir()`. No created `/tmp` or `file:///tmp` fixture. File URLs that point at local modules use `pathToFileURL` on a `tmpdir()` path. |
| Unreadable files do not depend on chmod zero on Windows | No `chmod 0o000`. The unreadable-file case in `get-graph-health.spec.ts` throws `EACCES` from a mocked `readFile`.                                                                   |

### Missing Tests

None. A meta-test that greps the suite is not part of the requirement. The suite itself is the subject, and inspection matches both scenarios.

### Summary counts

- Requirements checked: 1
- Met: 1
- Discrepancies: 0
- Missing tests: 0

## default:\_global/docs

### Requirements Summary

Modified clause of **User guide documentation and frontmatter**:

Developer `run:` values are inserted verbatim. SpecD then translates only quote syntax the host shell does not understand. The guide must say that non-Windows hooks run with the absolute `SHELL` value when it is absolute, and otherwise `/bin/sh`. It must not describe that substitution as shell escaping.

The updated verify scenario requires `docs/guide/workflow.md` (reviewed with the other configuration guides) to document verbatim `run:` values, host quote translation, and non-Windows execution via absolute `SHELL` or `/bin/sh`.

### Implementation Status

Met.

`docs/guide/workflow.md` under Template variables / Substitution says `{{...}}` is replaced with the value exactly as it is, and that SpecD does not add quotes around it. It says `instruction:` text is substituted verbatim and is not a shell command, so quote translation does not apply.

The following section says a `run:` command is a shell command, macOS and Linux run it with the absolute `$SHELL` or `/bin/sh`, and Windows runs it with `cmd.exe`. It says SpecD does not translate program names, flags, or pipes, and that it does translate quote syntax the host shell does not understand. The quote table shows single quotes left unchanged on `$SHELL` or `/bin/sh` and rewritten to double quotes on `cmd.exe`. A search of `docs/guide/workflow.md` found no “escaping” and no “shell escaping.”

`NodeHookRunner` expands the command, then `translateHookCommand` for `cmd` on `win32` and `posix` otherwise, then `spawnHook`. On `win32`, `spawnHook` uses `cmd.exe` with `['/d', '/s', '/c', command]` and `windowsVerbatimArguments`. Otherwise it uses `process.env['SHELL']` when that value is absolute, and `/bin/sh` when `SHELL` is missing or relative, with `['-c', command]`. The guide’s “macOS and Linux” wording names the non-Windows hosts this repo runs; the code applies the same rule on every non-`win32` platform. That is the same rule, not a contradiction.

The source comment on `NodeHookRunner` mentions a POSIX escaped quote. The requirement constrains the guide, and the guide calls the step quote translation.

### Discrepancies

None.

### Test Coverage

The verify scenario is a review of the guide. File inspection is the check, and `docs/guide/workflow.md` matches the modified clause.

The behavior the guide describes is covered by `packages/core/test/infrastructure/node/hook-runner-spawn.spec.ts`: `cmd.exe` with verbatim arguments on Windows, single-quote translation on Windows, an absolute `SHELL` with `-c` off Windows, and `/bin/sh` when `SHELL` is not absolute. Those tests do not parse the markdown. The spec does not require a test that reads the guide.

### Missing Tests

None.

### Summary counts

- Requirements checked: 1
- Met: 1
- Discrepancies: 0
- Missing tests: 0

## Batch totals

- Requirements checked: 7
- Met: 7
- Discrepancies: 0
- Missing tests: 0
