# Partial audit: CI and testing

Change: `windows-platform-compatibility`
Specs: `default:_global/continuous-integration`, `default:_global/testing` (Windows fixture requirement only)
Mode: read-only. Sources: `node packages/cli/dist/index.js changes spec-preview windows-platform-compatibility <specId> --format text` and the working tree. No code or spec files were modified.

Scope limits for this partial:

- Testing requirements other than **Fixtures are valid on Windows** were not re-audited.
- Leftover `'/tmp'` strings inside mocks, and standing `as unknown as` port doubles, are explicit non-goals of this change. They are not discrepancies.

Checked artifacts:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitattributes`
- root `package.json` (`test`, `preflight:test`, `lint-staged`, `typecheck`, `build`)
- `pnpm-workspace.yaml` `onlyBuiltDependencies`
- `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
- `mkdtemp` / `pathToFileURL` call sites under `packages/**/*.{spec,test}.ts`
- suite scan for `chmod`, `0o000`, `/var/www`, `file:///tmp`

---

### default:\_global/continuous-integration

#### Requirements checked

1. **Workflow file is tracked.** The repo must track `.github/workflows/ci.yml` without tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` stay ignored.
2. **Three operating systems.** The same job runs on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any runner fails the check.
3. **When the workflow runs.** Pull requests and pushes to `main`. It must not call Gemini workflows.
4. **Toolchain install.** Checkout, pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`. That install builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. No apt, brew, or Chocolatey packages.
5. **Checks.** Each job runs `pnpm typecheck`, `pnpm build`, then `pnpm test`. `typecheck` and `build` skip `@specd/public-web`. `pnpm test` includes `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and `@specd/plugin-agent-claude`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`, `@specd/plugin-agent-standard`. It excludes `@specd/mcp` and `@specd/public-web`. No changeset status and no publish.

Audit contract checked with those requirements (not extra spec requirements):

- `.gitignore` is `.github/*`, then `!.github/workflows/` and `!.github/workflows/**`.
- The six Gemini workflow files stay untracked. Agents, skills, and `copilot-instructions.md` stay ignored.
- One workflow file, `.github/workflows/ci.yml`, with the same steps on all three runners. `fail-fast: false` is acceptable. A failing job still fails the check.
- `preflight:test` is `pnpm test`. `lint-staged` typecheck is `pnpm typecheck`.
- `@ladybugdb/core` is not in `onlyBuiltDependencies`.

#### Implementation status

| Requirement                            | Status                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow file is tracked               | Met                      | `.gitignore` lines 20–22: `.github/*`, `!.github/workflows/`, `!.github/workflows/**`. `git check-ignore -v .github/workflows/ci.yml` reports the negation `!.github/workflows/**` (not ignored). `git check-ignore -v` reports `.github/*` for `.github/copilot-instructions.md`, `.github/agents/specd.agent.md`, and `.github/skills/specd/SKILL.md`. `.agents/` and `skills-lock.json` stay ignored. `.github/workflows/` contains only `ci.yml`. `git ls-files .github` is empty and `git status` shows `?? .github/`, so the file is untracked until commit. The verify scenario is ignore evaluation, which passes. |
| Three operating systems                | Met                      | `.github/workflows/ci.yml`: `strategy.matrix.os` is `[macos-latest, ubuntu-latest, windows-latest]`, `runs-on: ${{ matrix.os }}`, one `check` job, same steps on every OS. `fail-fast: false`. No `continue-on-error`. GitHub fails the workflow when any matrix job fails; `fail-fast: false` only lets the other jobs finish.                                                                                                                                                                                                                                                                                            |
| When the workflow runs                 | Met                      | `on.pull_request` (default activities, including open and synchronize) and `on.push.branches: [main]`. No `workflow_call`, no Gemini job. The workflow directory has no Gemini file.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Toolchain install                      | Met                      | Steps: `actions/checkout@v4`, `pnpm/action-setup@v4` version `10.6.5` (matches root `packageManager`), `actions/setup-node@v4` `node-version: 22` with `cache: pnpm`, `pnpm install --frozen-lockfile`. No apt, brew, or choco. `onlyBuiltDependencies` lists `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, `better-sqlite3`, `esbuild`, plus `core-js` and `core-js-pure`.                                                                                                                                                                                                                          |
| Checks                                 | Met                      | Job order is `pnpm typecheck`, `pnpm build`, `pnpm test`. Root `typecheck` and `build` use `--filter=!@specd/public-web`. Root `test` filters are the twelve packages named above. `@specd/mcp` and `@specd/public-web` are absent from that script. Those package names exist (`packages/mcp`, `packages/guide`, `packages/sdk`, `packages/skills`, `packages/plugin-manager`, `apps/public-web`, and the five `plugin-agent-*` packages). `preflight:test` is `pnpm test`. The workflow does not run changeset or publish (`preflight:changeset` remains a local script and is not a CI step).                           |
| Six Gemini workflow files stay ignored | Met for the current tree | Only `ci.yml` is under `.github/workflows/`. No Gemini workflow has ever been committed (`git log --all -- .github/workflows` is empty). `ci.yml` does not call them. Agents, skills, `copilot-instructions.md`, and `.github/commands/gemini-*.toml` match `.github/*` and are ignored. The spec constraint says Gemini workflow files may be tracked because they share `.github/workflows/`; this change does not add them.                                                                                                                                                                                             |
| `lint-staged`                          | Met                      | `*.ts` is `eslint --fix`, `prettier --write`, `pnpm typecheck`. No `bash -c` in `package.json` or `ci.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@ladybugdb/core`                      | Met                      | Working-tree diff deletes `@ladybugdb/core` from `onlyBuiltDependencies`. The name is absent from `pnpm-workspace.yaml`, root `package.json`, and `pnpm-lock.yaml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Discrepancies

None.

Observations (not counted):

- `ci.yml` and `.gitattributes` are untracked. Ignore rules allow `ci.yml` to be added. The index records the file when the change is committed.
- `fail-fast: false` is allowed. The check still fails if one job fails, because no step sets `continue-on-error`.
- Node is `22`, which is what the spec requires.
- `git check-ignore -v` on a hypothetical `.github/workflows/gemini-review.yml` (and the same for `gemini-triage.yml`, `gemini-scheduled-triage.yml`, `gemini-invoke.yml`, `gemini-plan-execute.yml`, `gemini-dispatch.yml`) reports `!.github/workflows/**`. Those paths are not ignored if a file is added later. The spec allows that. The six files are not in the tree today, and `ci.yml` does not call them.
- `.gitattributes` is `* text=auto eol=lf` plus `*.md`, `*.yaml`, `*.yml`, `*.json` with `text eol=lf`. That file is outside this spec.

#### Test coverage

No Vitest (or other in-repo test) asserts the workflow, the gitignore negation, or the root script filters. Coverage is file inspection plus `git check-ignore`.

| Verify scenario                                 | Covered by                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Only workflows are re-included                  | `git check-ignore` on `ci.yml` (not ignored) and on `copilot-instructions.md`, an agent file, and a skill file (ignored) |
| One red runner fails the check                  | Workflow shape only. No `continue-on-error`. Not executed on GitHub in this audit                                        |
| Pull request starts the workflow / push to main | `on:` block. Not executed                                                                                                |
| Native modules come from pnpm install           | Step list plus `onlyBuiltDependencies`. Install was not run here                                                         |
| Three commands in order                         | Step order in `ci.yml`                                                                                                   |
| `pnpm test` package set                         | Root `test` script string. `preflight:test` is `pnpm test`                                                               |

#### Missing tests

1. No test that Git ignores `.github/copilot-instructions.md`, `.github/agents/`, and `.github/skills/`, and does not ignore `.github/workflows/ci.yml`.
2. No test that `ci.yml` is the only workflow and that it contains the three runners, the trigger set, the toolchain pins, the command order, and none of apt, brew, choco, public-web, changeset, publish, or Gemini.
3. No test that a failed matrix job fails the workflow (GitHub aggregation).
4. No test that root `test` and `preflight:test` filters match the spec package list and omit `@specd/mcp` and `@specd/public-web`.

#### Spec dependency chain

Depends on `default:_global/testing` (CI runs the Vitest suite those conventions describe). This partial checked only the Windows fixture requirement of that spec. Filesystem temp directories use `os.tmpdir()`. Real worker module URLs use `pathToFileURL` on a path under `os.tmpdir()`. `get-graph-health.spec.ts` does not use `chmod 0o000`. No contradiction with the CI spec: CI runs `pnpm test` on `windows-latest`, which is the suite this requirement constrains.

---

### default:\_global/testing

#### Requirements checked

**Fixtures are valid on Windows** only.

Filesystem tests must locate temporary directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`. An unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.

Not checked in this partial: test runner, unit-test completeness, typed port mocks, integration cleanup beyond the Windows temp-dir rule, test naming, and the snapshot ban. Mock `'/tmp'` literals and standing `as unknown as` doubles are non-goals.

#### Implementation status

| Requirement                                           | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temp directories come from the OS                     | Met                                   | Every `mkdtemp` / `mkdtempSync` call under `packages/**/*.{spec,test}.ts` passes `os.tmpdir()` or `tmpdir()` (`join(tmpdir(), ...)` or `path.join(os.tmpdir(), ...)`). Sampled creators include `get-graph-health.spec.ts`, `move-dir.spec.ts`, `write-atomic.spec.ts`, `ensure-tmp-gitignore.spec.ts`, `spec-repository.spec.ts`, sqlite store specs, and isolated-worker specs. `change-create.spec.ts` creates its integration directory with `fs.mkdtemp(path.join(os.tmpdir(), ...))` at line 365.  |
| File URLs come from the local path                    | Met for URLs the tests actually build | `barrel.spec.ts`, `signals.spec.ts`, and `supervisor.spec.ts` call `pathToFileURL(join(tmpdir(), ...))`. `protocol.spec.ts` uses the literal `file:///task.js` as a JSON envelope fixture for `isStartMessage`. That string is not `file:///tmp` and is not a path the test creates.                                                                                                                                                                                                                     |
| No dependency on `/tmp`, `/var/www`, or `file:///tmp` | Met                                   | Repo search of `*.{ts,js}` found no `/var/www`, no `file:///tmp`, no `chmod`, and no `0o000`. Remaining `'/tmp...'` strings are mock config paths, stub return values, and expected CLI arguments (for example `changePath: '/tmp/test-changes/my-change'` in `change-create.spec.ts`, and `path: '/tmp/changes/add-auth'` passed into a hook template in `hook-runner.spec.ts`). Those tests do not `mkdtemp('/tmp')` or write a fixture there. Per this change they are non-goals and are not flagged. |
| Unreadable files do not use chmod zero                | Met                                   | `get-graph-health.spec.ts` creates `projectRoot` with `mkdtempSync(join(tmpdir(), 'specd-health-read-error-'))`, writes a normal file, and mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. The assertion is `FreshnessState.Unknown` and `CONTENT_UNKNOWN`, not `CONTENT_DIRTY`. The temp root is removed in `finally` with `rmSync`. No `chmod` call exists in the suite.                                                                                      |

#### Discrepancies

None.

Observation (not counted): the unreadable-file case simulates `EACCES` with a `readFile` mock. It does not set an OS ACL, and it is not `it.skip` on `win32`. The verify scenario forbids `chmod 0o000`. That API is absent, and the test still observes a read failure on every OS, including Windows.

#### Test coverage

| Verify scenario                        | Covered by                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temporary paths come from the OS       | Integration and filesystem specs that call `mkdtemp(Sync)` with `os.tmpdir()`, including `get-graph-health.spec.ts`                                                                                                                             |
| Unreadable files do not use chmod zero | `get-graph-health.spec.ts` “keeps content inspection failures unknown instead of marking the graph dirty” asserts `CONTENT_UNKNOWN` via `deniedReads`. Nothing asserts the absence of `chmod` by name; the suite contains no `chmod` or `0o000` |

#### Missing tests

No additional missing test beyond the CI gaps. The two Windows verify scenarios are exercised by existing specs. There is no separate meta-test that fails the build when a future spec introduces `chmod 0o000` or `mkdtemp('/tmp')`. That guard was not counted, because the current suite already follows the rule and this change does not require a lint for mock `'/tmp'` strings.

#### Spec dependency chain

Depends on `default:_global/architecture` and `default:_global/conventions`. Those specs were not expanded. The new Windows fixture text does not contradict the CI spec.

---

## Summary counts

| Item                      | Count                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs audited             | 2                                                                                                                                                                                              |
| Requirements checked      | 6 (CI 5, testing Windows fixtures 1)                                                                                                                                                           |
| Requirements met          | 6                                                                                                                                                                                              |
| Requirements not checked  | 6 testing conventions outside the Windows fixture rule                                                                                                                                         |
| Discrepancies             | 0                                                                                                                                                                                              |
| Missing tests             | 4 (gitignore negation, workflow shape, red-runner aggregation, root `test` filters)                                                                                                            |
| Notes (not discrepancies) | `ci.yml` untracked but not ignored; Gemini workflow files absent and not called; unreadable-file case is an `EACCES` mock; mock `'/tmp'` strings and `as unknown as` doubles left as non-goals |
